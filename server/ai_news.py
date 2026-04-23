"""
AI News Fetcher — Google News RSS with 4-category classification.

Categories:
  - ai_products : 产品发布 (new model / product launches)
  - ai_research : 技术研究 (papers, benchmarks, evaluations)
  - ai_business : 商业应用 (enterprise adoption, revenue, earnings)
  - ai_tools    : 工具更新 (coding tools, agent frameworks, IDE plugins)

Each category is queried in both English (global coverage) and Chinese
(domestic coverage). Results are deduplicated by link and filtered to
the last 24 hours before being grouped by category.
"""
from __future__ import annotations

import html
import logging
import re
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import quote
from xml.etree import ElementTree as ET

logger = logging.getLogger(__name__)

# Beijing time — used for "today" labeling in the email
TZ_SHANGHAI = timezone(timedelta(hours=8))

# ── Query set ─────────────────────────────────────────────────────────
# (query, category, language)
AI_NEWS_QUERIES: list[tuple[str, str, str]] = [
    # AI Products — 产品发布
    ("OpenAI new model release", "ai_products", "en"),
    ("Anthropic Claude release", "ai_products", "en"),
    ("Google Gemini new model", "ai_products", "en"),
    ("Meta Llama release", "ai_products", "en"),
    ("大模型 发布 新品", "ai_products", "zh"),
    ("OpenAI 新品 发布", "ai_products", "zh"),

    # AI Research — 技术研究
    ("LLM research paper arxiv", "ai_research", "en"),
    ("AI model benchmark evaluation", "ai_research", "en"),
    ("reasoning model breakthrough", "ai_research", "en"),
    ("大模型 论文 研究", "ai_research", "zh"),
    ("AI 前沿 研究", "ai_research", "zh"),

    # AI Business — 商业应用
    ("enterprise AI adoption", "ai_business", "en"),
    ("OpenAI Anthropic revenue earnings", "ai_business", "en"),
    ("AI investment funding round", "ai_business", "en"),
    ("企业 AI 落地 应用", "ai_business", "zh"),
    ("AI 商业化 融资", "ai_business", "zh"),

    # AI Tools — 工具更新
    ("Cursor Copilot AI coding update", "ai_tools", "en"),
    ("AI agent framework release", "ai_tools", "en"),
    ("Claude Code Gemini CLI update", "ai_tools", "en"),
    ("AI 编程 工具 更新", "ai_tools", "zh"),
    ("AI Agent 框架 开源", "ai_tools", "zh"),
]

CATEGORY_LABELS_ZH = {
    "ai_products": "AI Products（产品发布）",
    "ai_research": "AI Research（技术研究）",
    "ai_business": "AI Business（商业应用）",
    "ai_tools":    "AI Tools（工具更新）",
}

CATEGORY_ORDER = ["ai_products", "ai_research", "ai_business", "ai_tools"]


def _rss_url(query: str, lang: str) -> str:
    """Build a Google News RSS URL for the given query + language."""
    q = quote(query)
    if lang == "zh":
        return f"https://news.google.com/rss/search?q={q}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans"
    return f"https://news.google.com/rss/search?q={q}&hl=en-US&gl=US&ceid=US:en"


_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def _strip_html(raw: str) -> str:
    """Remove HTML tags from an RSS description and collapse whitespace.

    Robust against HTML entities (&nbsp;, &amp; etc.) and malformed markup,
    which is why we use regex + html.unescape rather than an XML parser.
    """
    if not raw:
        return ""
    # 1. Strip all tags (non-greedy, anything between < and >)
    text = _TAG_RE.sub(" ", raw)
    # 2. Decode HTML entities (&nbsp; &amp; &lt; &#39; ...)
    text = html.unescape(text)
    # 3. Collapse runs of whitespace
    text = _WS_RE.sub(" ", text).strip()
    return text[:300]


def fetch_ai_news(hours: int = 24) -> dict:
    """
    Fetch AI news from Google News RSS grouped by the 4 AI categories.

    Only returns items published within the last `hours` (default 24).

    Returns:
        {
          "generated_at": ISO string,
          "window_hours": int,
          "total": int,
          "by_category": {
              "ai_products": [ {title, link, source, publishedAt, tag, description, lang}, ... ],
              "ai_research": [ ... ],
              "ai_business": [ ... ],
              "ai_tools":    [ ... ],
          }
        }
    """
    import requests

    now_utc = datetime.now(timezone.utc)
    cutoff = now_utc - timedelta(hours=hours)

    by_category: dict[str, list[dict]] = {c: [] for c in CATEGORY_ORDER}
    seen_links: set[str] = set()
    seen_titles: set[str] = set()

    for query, category, lang in AI_NEWS_QUERIES:
        try:
            url = _rss_url(query, lang)
            response = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0 (CFO-Control-Tower)"})
            response.raise_for_status()

            root = ET.fromstring(response.content)
            channel = root.find("channel")
            if channel is None:
                continue

            per_query = 0
            for item in channel.findall("item"):
                if per_query >= 8:
                    break
                title_el = item.find("title")
                link_el = item.find("link")
                date_el = item.find("pubDate")
                source_el = item.find("source")
                desc_el = item.find("description")

                if title_el is None or link_el is None:
                    continue

                link = (link_el.text or "").strip()
                title = (title_el.text or "").strip()
                if not link or not title:
                    continue
                if link in seen_links:
                    continue
                # Dedup near-identical titles across zh/en queries
                title_key = title.lower()[:120]
                if title_key in seen_titles:
                    continue

                try:
                    pub_dt = parsedate_to_datetime(date_el.text) if date_el is not None and date_el.text else now_utc
                    if pub_dt.tzinfo is None:
                        pub_dt = pub_dt.replace(tzinfo=timezone.utc)
                except Exception:
                    pub_dt = now_utc

                if pub_dt < cutoff:
                    continue

                seen_links.add(link)
                seen_titles.add(title_key)

                by_category[category].append({
                    "title": title,
                    "link": link,
                    "source": (source_el.text or "").strip() if source_el is not None else "Google News",
                    "publishedAt": pub_dt.isoformat(),
                    "tag": category,
                    "description": _strip_html(desc_el.text or "" if desc_el is not None else ""),
                    "lang": lang,
                })
                per_query += 1

        except Exception as e:
            logger.warning(f"AI news fetch failed for query '{query}' ({lang}): {e}")
            continue

    # Sort each category by date desc
    for items in by_category.values():
        items.sort(key=lambda x: x["publishedAt"], reverse=True)

    total = sum(len(v) for v in by_category.values())
    logger.info(f"AI news: fetched {total} items across {len(CATEGORY_ORDER)} categories (window={hours}h)")

    return {
        "generated_at": datetime.now(TZ_SHANGHAI).isoformat(),
        "window_hours": hours,
        "total": total,
        "by_category": by_category,
    }
