"""
CFO AI Agent — Uses OpenAI-compatible API with function calling.
Interprets user queries, calls internal data tools, returns structured responses.
"""
from __future__ import annotations
import json
import logging
from typing import AsyncIterator

from openai import AsyncOpenAI
from config import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL
from models import FilterState, ChatTurn, MessageBlock
from mock_data import (
    get_opening_data, get_secondary_data, get_tertiary_data,
    QUARTERS, BUSINESS_GROUPS, GEOGRAPHIES,
)

logger = logging.getLogger(__name__)

# ── OpenAI client ────────────────────────────────────────────────────
client = AsyncOpenAI(api_key=LLM_API_KEY, base_url=LLM_BASE_URL)

# ── System prompt ────────────────────────────────────────────────────
SYSTEM_PROMPT = """你是联想集团的 CFO 智能助手。你**只**回答与集团财务相关的问题，包括但不限于营收、利润、成本、费用、现金流、运营指标、预算、同行对标、供应链、宏观经济对财务的影响等。

对于与集团财务无关的问题（如闲聊、编程、天气、常识百科、其他公司分析等），你必须礼貌拒绝，并引导用户提问财务相关问题。示例回复：
"抱歉，我是 CFO 财务分析助手，只能回答与联想集团财务相关的问题。您可以问我关于营收、利润、成本、运营指标等方面的问题。"

你具备以下能力：
1. 查询各业务集团（IDG/ISG/SSG）、各地区（AP/NA/LA/Europe/Meta/PRC）的财务数据
2. 进行同比（YoY）、环比（QoQ）、实际 vs 预算（vs Budget）、实际 vs 市场一致预期（vs Consensus）的对比分析
3. 趋势分析，归因分析
4. 外部数据分析（供应链、宏观经济、同行对标）

数据范围：FY24Q1 至 FY26Q1。

**严格数据准则 — 这是最重要的规则：**
- 你的所有结论和数字**必须**严格基于工具返回的数据，或者来自权威外部数据源（如公开的行业报告、宏观经济统计）。
- **绝对禁止**编造、臆测或推断任何没有数据支撑的数字。
- 如果用户的问题需要某类数据而当前工具无法提供，你必须明确告知："该分析需要 XX 数据（如供应商合同价格、各产品线 SKU 明细等），目前系统尚未接入此数据源，建议数据接入后再进行深入分析。"
- 如果工具返回的数据不足以得出确定性结论，请如实说明数据局限性，不要给出过度推断的建议。
- 给出建议时，需标注"基于当前数据"或"基于 XX 假设"，而不是呈现为确定性结论。

回答要求：
- 始终使用中文回答（除非用户用英文提问）
- 数据精确，给出具体数字，标注数据来源（如"根据季度总览数据"）
- 先总结关键发现，再给出详细数据
- 区分"基于数据的事实"和"基于分析的建议"，后者需明确标注

当你需要查询数据时，请调用提供的工具函数。用工具获取数据后，基于数据给出分析。

你的回复需要是一个 JSON 对象，格式如下：
{
  "text": "文字总结",
  "blocks": [
    {"type": "text", "data": {"content": "详细分析文字"}},
    {"type": "kpi_card", "data": {"cards": [{"label": "标签", "value": "值", "change": "变化", "changeDirection": "up/down/flat", "status": "normal/warning/danger"}]}},
    {"type": "table", "data": {"title": "表格标题", "headers": ["列1","列2"], "rows": [["数据1","数据2"]]}},
    {"type": "insight", "data": {"level": "info/warning/alert", "text": "洞察文字"}},
    {"type": "source_tag", "data": {"sources": ["数据来源1"]}}
  ]
}

注意：blocks 是可选的。如果问题简单，只需返回 text 即可。
"""

# ── Tool definitions (for function calling) ──────────────────────────
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_quarterly_overview",
            "description": "获取季度总览数据（营收、毛利、毛利率、经营利润、净利润）。用于回答关于整体业绩的问题。",
            "parameters": {
                "type": "object",
                "properties": {
                    "quarter": {"type": "string", "description": "季度，如 FY26Q1"},
                    "selectedBGs": {"type": "array", "items": {"type": "string"}, "description": "业务集团筛选，如 ['IDG','ISG']，空数组=全部"},
                    "selectedGeos": {"type": "array", "items": {"type": "string"}, "description": "地区筛选，空数组=全部"},
                },
                "required": ["quarter"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_operating_data",
            "description": "获取运营指标时间序列（管线、订单、营收、COGS、毛利、费用、库存、WOI、AR、AP、CCC）。用于趋势分析和运营效率问题。",
            "parameters": {
                "type": "object",
                "properties": {
                    "quarter": {"type": "string", "description": "截至季度"},
                    "selectedBGs": {"type": "array", "items": {"type": "string"}, "description": "BG 筛选"},
                    "selectedGeos": {"type": "array", "items": {"type": "string"}, "description": "地区筛选"},
                },
                "required": ["quarter"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_bg_breakdown",
            "description": "获取各业务集团 × 地区的交叉数据（营收、毛利、毛利率、经营利润）。用于 BG 对比、地区拆分、交叉分析。",
            "parameters": {
                "type": "object",
                "properties": {
                    "quarter": {"type": "string", "description": "季度"},
                    "selectedBGs": {"type": "array", "items": {"type": "string"}, "description": "BG 筛选"},
                    "selectedGeos": {"type": "array", "items": {"type": "string"}, "description": "地区筛选"},
                },
                "required": ["quarter"],
            },
        },
    },
]


# ── Tool execution ───────────────────────────────────────────────────
def _execute_tool(name: str, arguments: dict) -> str:
    """Execute a tool call and return JSON string result."""
    filters = FilterState(
        quarter=arguments.get("quarter", "FY26Q1"),
        selectedBGs=arguments.get("selectedBGs", []),
        selectedGeos=arguments.get("selectedGeos", []),
    )

    if name == "get_quarterly_overview":
        data = get_opening_data(filters)
        return data.model_dump_json()

    elif name == "get_operating_data":
        rows = get_secondary_data(filters)
        return json.dumps([r.model_dump() for r in rows])

    elif name == "get_bg_breakdown":
        rows = get_tertiary_data(filters)
        return json.dumps([r.model_dump() for r in rows])

    return json.dumps({"error": f"Unknown tool: {name}"})


# ── Main chat function ───────────────────────────────────────────────
async def chat(
    message: str,
    filters: FilterState,
    history: list[ChatTurn],
) -> dict:
    """
    Send message to LLM with tools, handle tool calls, return final response.
    Returns: {"text": str, "blocks": list[dict]}
    """

    # Build messages
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    # Add conversation history (last 10 turns max)
    for turn in history[-10:]:
        messages.append({"role": turn.role, "content": turn.content})

    # Add current user message with filter context
    context_note = f"\n\n[当前筛选: 季度={filters.quarter}, BG={filters.selectedBGs or '全部'}, 地区={filters.selectedGeos or '全部'}]"
    messages.append({"role": "user", "content": message + context_note})

    # Agent loop — up to 3 rounds of tool calling
    for _ in range(3):
        try:
            response = await client.chat.completions.create(
                model=LLM_MODEL,
                messages=messages,
                tools=TOOLS,
                tool_choice="auto",
                temperature=0.3,
            )
        except Exception as e:
            logger.error(f"LLM API error: {e}")
            return {
                "text": f"AI 服务暂时不可用，请稍后重试。错误: {str(e)[:100]}",
                "blocks": [{"type": "insight", "data": {"level": "alert", "text": "无法连接到 AI 模型服务"}}],
            }

        choice = response.choices[0]

        # If LLM wants to call tools
        if choice.finish_reason == "tool_calls" or choice.message.tool_calls:
            messages.append(choice.message)

            for tool_call in choice.message.tool_calls:
                fn_name = tool_call.function.name
                fn_args = json.loads(tool_call.function.arguments)
                logger.info(f"Tool call: {fn_name}({fn_args})")

                result = _execute_tool(fn_name, fn_args)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": result,
                })
            continue  # Let LLM process tool results

        # Final answer
        content = choice.message.content or ""
        return _parse_response(content)

    # Fallback if loop exhausted
    return {"text": "分析超时，请简化您的问题重试。", "blocks": []}


def _parse_response(content: str) -> dict:
    """Try to parse JSON response; fall back to plain text."""
    # Try to extract JSON from the response
    content = content.strip()

    # Try direct JSON parse
    if content.startswith("{"):
        try:
            parsed = json.loads(content)
            return {
                "text": parsed.get("text", content),
                "blocks": parsed.get("blocks", []),
            }
        except json.JSONDecodeError:
            pass

    # Try to find JSON block in markdown code fence
    if "```json" in content:
        start = content.index("```json") + 7
        end = content.index("```", start) if "```" in content[start:] else len(content)
        json_str = content[start:end].strip()
        try:
            parsed = json.loads(json_str)
            return {
                "text": parsed.get("text", content),
                "blocks": parsed.get("blocks", []),
            }
        except json.JSONDecodeError:
            pass

    # Plain text fallback
    return {
        "text": content,
        "blocks": [{"type": "text", "data": {"content": content}}],
    }


# ── Streaming variant ────────────────────────────────────────────────
async def chat_stream(
    message: str,
    filters: FilterState,
    history: list[ChatTurn],
) -> AsyncIterator[str]:
    """
    SSE streaming version — yields JSON chunks for progressive rendering.
    First calls tools non-streaming, then streams the final answer.
    """

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for turn in history[-10:]:
        messages.append({"role": turn.role, "content": turn.content})

    context_note = f"\n\n[当前筛选: 季度={filters.quarter}, BG={filters.selectedBGs or '全部'}, 地区={filters.selectedGeos or '全部'}]"
    messages.append({"role": "user", "content": message + context_note})

    # Thinking event: initial analysis
    yield json.dumps({"type": "thinking", "content": "正在理解您的问题..."})

    # First pass: non-streaming to handle tool calls
    tool_round = 0
    for _ in range(3):
        try:
            yield json.dumps({"type": "thinking", "content": "调用 AI 模型分析意图..." if tool_round == 0 else "基于数据进一步推理..."})
            response = await client.chat.completions.create(
                model=LLM_MODEL,
                messages=messages,
                tools=TOOLS,
                tool_choice="auto",
                temperature=0.3,
            )
        except Exception as e:
            yield json.dumps({"type": "error", "content": str(e)[:200]})
            return

        choice = response.choices[0]

        if choice.finish_reason == "tool_calls" or choice.message.tool_calls:
            messages.append(choice.message)
            tool_round += 1

            for tool_call in choice.message.tool_calls:
                fn_name = tool_call.function.name
                fn_args = json.loads(tool_call.function.arguments)

                # Emit thinking event describing what tool is being called
                tool_desc = _tool_thinking_text(fn_name, fn_args)
                yield json.dumps({"type": "thinking", "content": tool_desc})

                result = _execute_tool(fn_name, fn_args)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": result,
                })

                yield json.dumps({"type": "thinking", "content": f"已获取数据，正在分析..."})
            continue
        break

    # Thinking: about to generate final answer
    yield json.dumps({"type": "thinking", "content": "综合分析完成，正在生成回答..."})

    # Second pass: stream the final answer
    try:
        stream = await client.chat.completions.create(
            model=LLM_MODEL,
            messages=messages,
            stream=True,
            temperature=0.3,
        )

        full_content = ""
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                full_content += delta.content
                yield json.dumps({"type": "delta", "content": delta.content})

        # Parse the complete response for structured blocks
        parsed = _parse_response(full_content)
        yield json.dumps({"type": "complete", "text": parsed["text"], "blocks": parsed["blocks"]})

    except Exception as e:
        yield json.dumps({"type": "error", "content": str(e)[:200]})


def _tool_thinking_text(fn_name: str, fn_args: dict) -> str:
    """Generate human-readable thinking text for a tool call."""
    quarter = fn_args.get("quarter", "")
    bgs = fn_args.get("selectedBGs", [])
    geos = fn_args.get("selectedGeos", [])

    scope_parts = []
    if quarter:
        scope_parts.append(quarter)
    if bgs:
        scope_parts.append("、".join(bgs))
    if geos:
        scope_parts.append("、".join(geos))
    scope = "（" + " ".join(scope_parts) + "）" if scope_parts else ""

    tool_labels = {
        "get_quarterly_overview": f"查询季度总览数据{scope}",
        "get_operating_data": f"查询运营指标时间序列{scope}",
        "get_bg_breakdown": f"查询 BG × 地区交叉数据{scope}",
    }
    return tool_labels.get(fn_name, f"调用工具 {fn_name}{scope}")
