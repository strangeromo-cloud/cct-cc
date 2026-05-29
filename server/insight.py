"""
Lenovo Group strategic insight — per news item.

For each selected news item, generate a detailed Chinese paragraph on what it
means for Lenovo, framed around the three business groups (IDG / ISG / SSG).
Rendered beneath each item in the digest email (styled like the translation
block).

One batch LLM call covers all items.
"""
from __future__ import annotations

import json
import logging

logger = logging.getLogger(__name__)

_PER_ITEM_PROMPT = """你是联想集团的 CFO 战略分析师。下面是今天精选的若干条 AI 行业新闻（已编号）。

请为**每一条**新闻单独写一段「对联想集团的影响分析」。要求：

- 每条 2-4 句，是一段连贯的分析（不是要点罗列）
- 必须落到联想三大业务集团中最相关的那一个：
    · IDG（智能设备集团：PC、平板、手机、AI 终端、工作站）
    · ISG（基础设施方案集团：服务器、存储、算力、数据中心）
    · SSG（方案服务集团：企业 IT 服务、解决方案、订阅运营）
- 明确点出这是**机会**还是**风险**，并简述传导逻辑（为什么会影响到该业务）
- 给出一句可落地的建议方向
- 严格基于该条新闻内容本身，**不要编造**数字或未提及的事实
- 纯中文，不说空话套话（如「值得关注」「具有重要意义」）
- 每条之间相互独立，不要互相引用

严格返回 JSON，结构如下，不要任何其他文字：
{{"insights": [{{"id": 1, "text": "针对第1条的分析"}}, {{"id": 2, "text": "针对第2条的分析"}}]}}

新闻列表：
{news_list}
"""


def _collect_items(digest: dict) -> list[dict]:
    """Flatten selected items across categories into one ordered list."""
    from ai_news import CATEGORY_ORDER
    items: list[dict] = []
    by_cat = digest.get("by_category", {})
    for cat in CATEGORY_ORDER:
        items.extend(by_cat.get(cat, []))
    return items


def generate_per_item_insights(digest: dict) -> dict:
    """
    Attach a `lenovo_insight` string to each selected news item (in place).

    Returns a small stats dict: {used, total, filled, error}.
    On failure, items simply have no `lenovo_insight` and the email omits the
    block — the digest still ships.
    """
    stats = {"used": False, "total": 0, "filled": 0, "error": None}
    items = _collect_items(digest)
    stats["total"] = len(items)
    if not items:
        return stats

    # Build a numbered list using the most informative title + summary we have.
    lines: list[str] = []
    for i, it in enumerate(items, start=1):
        title = (it.get("title_zh") or it.get("title") or "").strip()
        summ = (it.get("summary") or "").strip()
        lines.append(f"{i}. {title}\n   摘要：{summ}")
    news_list = "\n".join(lines)

    from ai_summarizer import _call_llm
    out = _call_llm(_PER_ITEM_PROMPT.format(news_list=news_list), max_out=8000, json_mode=True)
    if not out:
        stats["error"] = "LLM returned empty"
        return stats

    try:
        data = json.loads(out)
    except (json.JSONDecodeError, ValueError):
        stats["error"] = "non-JSON response"
        return stats

    by_id: dict[int, str] = {}
    for entry in data.get("insights", []):
        if not isinstance(entry, dict):
            continue
        try:
            idx = int(entry.get("id"))
        except (TypeError, ValueError):
            continue
        text = (entry.get("text") or "").strip()
        if text:
            by_id[idx] = text

    for i, it in enumerate(items, start=1):
        if i in by_id:
            it["lenovo_insight"] = by_id[i]
            stats["filled"] += 1

    stats["used"] = True
    logger.info(f"per-item insights: {stats['filled']}/{stats['total']} filled")
    return stats
