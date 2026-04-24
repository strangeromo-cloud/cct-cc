"""
Article text extraction + LLM summarization for selected digest items.

Pipeline for each selected news item:
  1. resolve_article_url()  — follow Google News redirect to the real article URL
  2. fetch_article_text()   — download HTML, extract main content via trafilatura
  3. summarize_article()    — call LLM for a concise Chinese/English summary
                              (language matches the item's `lang` field)

If any step fails, the original RSS description is kept as a fallback.
All item dicts are mutated in place with:
  - item["summary"]    : str  — final summary to display in the email
  - item["summary_src"]: str  — "llm" | "rss" | "none" — provenance
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

from config import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL

logger = logging.getLogger(__name__)

# Timeouts — deliberately generous because this runs once/day in a batch job.
FETCH_TIMEOUT = 30        # seconds per article HTTP fetch
LLM_TIMEOUT = 60          # seconds per LLM call
MAX_WORKERS = 5           # parallel article fetches + LLM calls
MAX_ARTICLE_CHARS = 8000  # truncate article text before sending to LLM

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"


# ══════════════════════════════════════════════════════════════════════
#  Article fetch
# ══════════════════════════════════════════════════════════════════════

def resolve_article_url(google_news_url: str) -> str | None:
    """
    Google News RSS links like https://news.google.com/rss/articles/CBMi...?oc=5
    redirect (via an HTML page + JS or a 302) to the actual publisher URL.
    Do a HEAD with redirects to resolve.
    """
    try:
        r = requests.head(google_news_url, allow_redirects=True, timeout=FETCH_TIMEOUT,
                          headers={"User-Agent": UA})
        final = r.url
        # Some Google News links resolve to another google.com intermediate page.
        # Best-effort: if still on google.com, just return the original and let
        # trafilatura try with the GET redirect chain.
        return final
    except Exception as e:
        logger.debug(f"resolve_article_url failed for {google_news_url[:80]}: {e}")
        return None


def fetch_article_text(url: str) -> str | None:
    """
    Download the article and extract the main text via trafilatura.
    Returns None on failure (network / paywall / extraction blank).
    """
    try:
        import trafilatura
    except ImportError:
        logger.warning("trafilatura not installed — article extraction disabled")
        return None

    try:
        r = requests.get(url, allow_redirects=True, timeout=FETCH_TIMEOUT,
                         headers={"User-Agent": UA})
        r.raise_for_status()
        html_content = r.text
    except Exception as e:
        logger.debug(f"fetch_article_text GET failed for {url[:80]}: {e}")
        return None

    try:
        text = trafilatura.extract(
            html_content,
            url=url,
            favor_precision=False,
            include_comments=False,
            include_tables=False,
            deduplicate=True,
        )
    except Exception as e:
        logger.debug(f"trafilatura.extract raised for {url[:80]}: {e}")
        return None

    if not text:
        return None
    text = text.strip()
    if len(text) < 80:
        # Probably a paywall stub or navigation-only — useless for summarizing.
        return None
    return text[:MAX_ARTICLE_CHARS]


# ══════════════════════════════════════════════════════════════════════
#  LLM summarization
# ══════════════════════════════════════════════════════════════════════

_PROMPT_ZH = """你是一名资深 AI 行业编辑。请根据下面这则新闻，输出一段**中文摘要**。

要求：
- 2-3 句话，不超过 120 字
- 聚焦「发生了什么」+「为什么重要」
- 不使用套话（如「业内人士认为」「值得关注」等）
- 不要加表情、不要加开头结尾的寒暄
- 直接输出摘要本身，不要任何前缀

标题：{title}
来源：{source}
正文：
{text}
"""

_PROMPT_EN = """You are a senior AI industry editor. Write a concise **English summary** of the following news article.

Requirements:
- 2-3 sentences, maximum 60 words
- Focus on "what happened" + "why it matters"
- No fluff phrases ("notably", "it's worth noting", etc.)
- No emojis, no opening/closing pleasantries
- Output only the summary itself, no prefix

Title: {title}
Source: {source}
Article:
{text}
"""


def _get_llm_client():
    """Build a synchronous OpenAI client lazily (thread-safe, cheap)."""
    from openai import OpenAI
    return OpenAI(api_key=LLM_API_KEY, base_url=LLM_BASE_URL, timeout=LLM_TIMEOUT)


def summarize_article(title: str, text: str, source: str, lang: str) -> str | None:
    """
    Ask the LLM for a concise summary. Returns None on any failure.
    `lang` should be "zh" or "en" — matches the source language of the article.
    """
    if not LLM_API_KEY:
        logger.warning("LLM_API_KEY not configured — summarization disabled")
        return None

    template = _PROMPT_ZH if lang == "zh" else _PROMPT_EN
    prompt = template.format(title=title, source=source, text=text)

    try:
        client = _get_llm_client()
        resp = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=260,
        )
        choice = resp.choices[0].message.content or ""
        summary = choice.strip()
        if not summary:
            return None
        # Guardrails: occasionally the model prepends "摘要：" — strip it.
        for prefix in ("摘要：", "摘要:", "Summary:", "**摘要**", "## 摘要"):
            if summary.startswith(prefix):
                summary = summary[len(prefix):].strip()
                break
        return summary
    except Exception as e:
        logger.warning(f"LLM summarization failed: {type(e).__name__}: {e}")
        return None


# ══════════════════════════════════════════════════════════════════════
#  Batch orchestration
# ══════════════════════════════════════════════════════════════════════

def _process_one(item: dict) -> dict:
    """
    Fetch + summarize a single item. Mutates `item` in place with:
      - summary:     str  — final text for the email
      - summary_src: str  — "llm" | "rss" | "none"
    """
    title = item.get("title", "")
    link = item.get("link", "")
    source = item.get("source", "Unknown")
    lang = item.get("lang", "en")
    rss_desc = item.get("description", "")

    # Step 1 + 2: resolve + fetch + extract
    final_url = resolve_article_url(link) or link
    article_text = fetch_article_text(final_url)

    # Step 3: LLM summary
    summary: str | None = None
    if article_text:
        summary = summarize_article(title, article_text, source, lang)
    elif rss_desc and len(rss_desc) >= 100:
        # No full article — try summarizing the RSS description itself; it's
        # often already 1-2 sentences so this just cleans it up.
        summary = summarize_article(title, rss_desc, source, lang)

    if summary:
        item["summary"] = summary
        item["summary_src"] = "llm"
    elif rss_desc:
        item["summary"] = rss_desc
        item["summary_src"] = "rss"
    else:
        item["summary"] = ""
        item["summary_src"] = "none"

    # Expose resolved URL for the email (so "阅读原文" bypasses Google News proxy)
    item["resolved_url"] = final_url
    return item


def summarize_batch(digest: dict) -> dict:
    """
    Iterate over digest["by_category"][*], summarize each item in parallel,
    and mutate the digest in place. Returns the same dict for chaining.

    Logs a compact summary of LLM vs RSS vs none provenance counts.
    """
    items: list[dict] = []
    for cat_items in digest.get("by_category", {}).values():
        items.extend(cat_items)

    if not items:
        return digest

    logger.info(f"Summarizing {len(items)} selected items (workers={MAX_WORKERS})")

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = [pool.submit(_process_one, it) for it in items]
        for fut in as_completed(futures):
            try:
                fut.result()
            except Exception as e:
                logger.warning(f"Worker failed: {e}")

    # Stats
    counts = {"llm": 0, "rss": 0, "none": 0}
    for it in items:
        counts[it.get("summary_src", "none")] += 1
    logger.info(f"Summary provenance: llm={counts['llm']}, rss={counts['rss']}, none={counts['none']}")
    digest["summary_stats"] = counts
    return digest
