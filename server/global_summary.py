"""
Global View AI Summary — Streams LLM analysis of external environment data
from the CFO perspective.

Given the macro/supply-chain/competitive data, generate a structured summary:
  1. 现状摘要 (Current Snapshot) — factual, based on data
  2. 风险预警 (Risk Warnings) — threshold breaches, anomalies
  3. CFO 建议 (CFO Actions) — prefixed with "基于当前数据"
"""
from __future__ import annotations
import json
import logging
from typing import AsyncIterator

from openai import AsyncOpenAI
from config import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL

logger = logging.getLogger(__name__)
client = AsyncOpenAI(api_key=LLM_API_KEY, base_url=LLM_BASE_URL)


SUMMARY_SYSTEM_PROMPT = """你是联想集团 CFO 的外部环境分析助手。

你的任务：基于外部宏观、供应链、竞争数据，从联想集团 CFO 视角给出简洁、可操作的分析总结。

严格数据准则：
- 所有数字必须来自用户提供的数据或权威外部数据源，绝不编造。
- 如果某项数据缺失（标记为 null 或 mock），需要明确告知并建议补全。
- 事实性结论直接陈述，分析/建议必须以"基于当前数据"或"基于 XX 假设"开头。
- 回答使用中文。

输出要求：必须返回纯 JSON，结构如下（不要额外 markdown 代码块）：
{
  "snapshot": "2-3 句话的现状摘要，包含关键数字",
  "risks": [
    {"level": "alert|warning|info", "title": "风险标题", "detail": "详细说明（含数字），指明影响"}
  ],
  "actions": [
    {"title": "建议标题", "detail": "基于当前数据，建议...（具体行动）", "priority": "high|medium|low"}
  ]
}

分析重点：
- 宏观：美债收益率走势 → 融资成本；DXY 走势 → 汇兑损失；VIX → 市场风险；EPU → 政策不确定性
- 供应链：GSCPI → 物流压力；DRAM/NAND/LCD → 毛利率影响；半导体交期 → 库存规划
- 竞争：竞对营收增速/毛利率对比 → 联想相对地位

每次最多输出 3 条风险、3 条建议，优先显示最紧急的。
"""


async def stream_global_summary(data: dict) -> AsyncIterator[str]:
    """
    Stream SSE events for Global View AI summary.
    Events:
      - {"type":"thinking","content":"..."}
      - {"type":"delta","content":"..."}
      - {"type":"complete","summary":{...}}
      - {"type":"error","content":"..."}
    """
    try:
        yield json.dumps({"type": "thinking", "content": "正在分析外部环境数据..."})

        # Build compact data payload (strip noise, keep facts)
        compact = _compact_data(data)

        user_msg = f"""以下是当前获取的外部环境数据（JSON），请基于这些数据给出 CFO 视角的分析总结。

数据：
```json
{json.dumps(compact, ensure_ascii=False, indent=2)}
```

请严格按照系统提示的 JSON 结构返回分析结果。"""

        yield json.dumps({"type": "thinking", "content": "正在生成分析总结..."})

        # Stream LLM response
        full_text = ""
        stream = await client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            stream=True,
            temperature=0.3,
        )

        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                delta = chunk.choices[0].delta.content
                full_text += delta
                yield json.dumps({"type": "delta", "content": delta})

        # Parse final JSON
        summary = _extract_json(full_text)
        if summary is None:
            yield json.dumps({"type": "error", "content": "无法解析 LLM 响应为 JSON"})
            return

        yield json.dumps({"type": "complete", "summary": summary})

    except Exception as e:
        logger.exception("Global summary stream failed")
        yield json.dumps({"type": "error", "content": f"AI 分析失败: {str(e)}"})


def _compact_data(data: dict) -> dict:
    """Reduce data payload to essentials for LLM (latest values + trend signals)."""
    result = {}

    macro = data.get("macro") or {}
    result["macro"] = {}
    for key, series in macro.items():
        if series and series.get("values"):
            vals = series["values"]
            dates = series.get("dates", [])
            latest = vals[-1]
            year_ago = vals[-12] if len(vals) >= 12 else vals[0]
            pct_change = round((latest - year_ago) / year_ago * 100, 1) if year_ago else None
            result["macro"][key] = {
                "latest": latest,
                "latestDate": dates[-1] if dates else None,
                "yoyChangePct": pct_change,
                "unit": series.get("unit", ""),
                "source": series.get("source", "unknown"),
            }
        else:
            result["macro"][key] = {"status": "missing", "source": "unavailable"}

    supply = data.get("supplyChain") or {}
    components = supply.get("components") or {}
    if components.get("dram"):
        dram_vals = components["dram"]
        result["supplyChain_components"] = {
            "dramLatest": dram_vals[-1],
            "dramYoYPct": round((dram_vals[-1] - dram_vals[-12]) / dram_vals[-12] * 100, 1) if len(dram_vals) >= 12 else None,
            "nandLatest": components["nand"][-1] if components.get("nand") else None,
            "lcdLatest": components["lcd"][-1] if components.get("lcd") else None,
            "source": components.get("source"),
        }
    semi = supply.get("semiLeadTime") or {}
    if semi.get("values"):
        result["supplyChain_semiLeadTime"] = {
            "latestWeeks": semi["values"][-1],
            "threshold": semi.get("threshold", 15),
            "overThreshold": semi["values"][-1] > semi.get("threshold", 15),
            "source": semi.get("source"),
        }
    gscpi = supply.get("gscpi") or {}
    if gscpi.get("values"):
        result["supplyChain_gscpi"] = {
            "latest": gscpi["values"][-1],
            "interpretation": "pressure" if gscpi["values"][-1] > 0 else "relief",
            "source": gscpi.get("source"),
        }

    competitive = data.get("competitive") or {}
    peers = competitive.get("competitors") or []
    result["competitive_summary"] = [
        {
            "name": p.get("name"),
            "segment": p.get("segment"),
            "revenueGrowthYoY": p.get("revenueGrowthYoY"),
            "grossMargin": p.get("grossMargin"),
            "operatingMargin": p.get("operatingMargin"),
        }
        for p in peers[:7]
    ]

    return result


def _extract_json(text: str) -> dict | None:
    """Extract JSON object from text (strips markdown fences if present)."""
    text = text.strip()
    if text.startswith("```"):
        # remove ```json ... ``` fence
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to find first { ... last }
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                return None
        return None
