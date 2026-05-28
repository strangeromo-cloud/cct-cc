"""
Lenovo Group strategic insight.

Synthesizes the day's selected AI news + GitHub trending repos into a short
"what this means for Lenovo" briefing, framed around the three business
groups (IDG / ISG / SSG). Appended at the bottom of the digest email.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_INSIGHT_PROMPT = """你是联想集团的 CFO 战略分析师。下面是今天的 AI 行业动态（精选新闻 + GitHub 热门新项目）。

请基于这些内容，总结**对联想集团的启示**。要求：

- 输出 3-4 条要点，每条 1-2 句话
- 紧扣联想三大业务集团：
    · IDG（智能设备集团：PC、平板、手机、AI 终端）
    · ISG（基础设施方案集团：服务器、存储、算力、数据中心）
    · SSG（方案服务集团：企业 IT 服务、解决方案、订阅）
- 每条点明这是**机会**还是**风险**，并简述原因
- 严格基于上面给的内容，**不要编造**任何数字或未提及的事实
- 不说空话套话（如「值得关注」「具有重要意义」）
- 纯中文输出，不要 JSON、不要标题、不要 markdown 符号
- 每条要点用「• 」开头，要点之间换行

今日动态：
{content}
"""


def _assemble_content(digest: dict) -> str:
    """Flatten the digest's news + repos into a compact bullet list for the LLM."""
    from ai_news import CATEGORY_ORDER  # local import avoids any cycle at import time

    label = {
        "model_product": "模型/产品",
        "business": "商业应用",
        "policy_risk": "政策/风险",
    }
    lines: list[str] = []
    by_cat = digest.get("by_category", {})
    for cat in CATEGORY_ORDER:
        for it in by_cat.get(cat, []):
            title = (it.get("title_zh") or it.get("title") or "").strip()
            summ = (it.get("summary") or "").strip()
            lines.append(f"- [{label.get(cat, cat)}] {title}：{summ}")

    for r in digest.get("github_repos", []):
        desc = (r.get("description_zh") or r.get("description") or "").strip()
        lines.append(f"- [GitHub] {r.get('full_name')}（{r.get('stars')}★）：{desc}")

    return "\n".join(lines)


def generate_lenovo_insight(digest: dict) -> str | None:
    """
    Produce a Chinese strategic insight string (bullet points) or None on
    failure / empty input.
    """
    content = _assemble_content(digest)
    if not content.strip():
        return None

    from ai_summarizer import _call_llm

    prompt = _INSIGHT_PROMPT.format(content=content)
    out = _call_llm(prompt, max_out=800)
    if not out:
        return None
    return out.strip()
