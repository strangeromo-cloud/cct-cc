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

# Browser-like headers. Some sites (Cloudflare, bot detection) reject requests
# that only send a User-Agent without Accept / Accept-Language.
BROWSER_HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}


# ══════════════════════════════════════════════════════════════════════
#  Article fetch
# ══════════════════════════════════════════════════════════════════════

def resolve_article_url(google_news_url: str) -> str | None:
    """
    Resolve a Google News RSS/article URL to the real publisher URL.

    Google News now uses an encrypted redirect — HTTP HEAD/GET with
    allow_redirects does NOT resolve, because the final hop happens in
    JavaScript. We use `googlenewsdecoder`, which calls Google's internal
    decoder endpoint, to turn CBMi-prefixed URLs into the actual URL.

    Falls back to a plain GET-with-redirects for any non-Google-News URL.
    """
    if not google_news_url:
        return None

    # Primary path — encrypted Google News URLs
    if "news.google.com" in google_news_url:
        try:
            from googlenewsdecoder import gnewsdecoder
            result = gnewsdecoder(google_news_url, interval=1)
            if isinstance(result, dict) and result.get("status") and result.get("decoded_url"):
                return result["decoded_url"]
            logger.debug(f"googlenewsdecoder returned no URL: {result}")
        except ImportError:
            logger.warning("googlenewsdecoder not installed — Google News URL resolution disabled")
        except Exception as e:
            logger.debug(f"googlenewsdecoder failed for {google_news_url[:80]}: {e}")

    # Fallback — plain HTTP redirect chain (works for direct publisher URLs)
    try:
        r = requests.get(google_news_url, allow_redirects=True, timeout=FETCH_TIMEOUT,
                         headers={"User-Agent": UA}, stream=True)
        # Close body — we only want the final URL from the redirect chain
        r.close()
        final = r.url
        if final and "news.google.com" not in final:
            return final
    except Exception as e:
        logger.debug(f"GET fallback failed for {google_news_url[:80]}: {e}")

    return None


def fetch_article_text(url: str, debug: bool = False) -> str | dict | None:
    """
    Download the article and extract the main text via trafilatura.

    Returns the extracted text (str), or None on failure.
    If `debug=True`, returns a dict with per-step diagnostics instead of
    None/str — used by the /api/jobs/debug/summarize endpoint.
    """
    diag: dict = {"url": url}

    if not url or "news.google.com" in url:
        diag["skipped"] = "google news URL (not resolved)"
        return diag if debug else None

    try:
        import trafilatura
    except ImportError:
        diag["error"] = "trafilatura not installed"
        logger.warning(diag["error"])
        return diag if debug else None

    # Step 1: download
    try:
        r = requests.get(url, allow_redirects=True, timeout=FETCH_TIMEOUT,
                         headers=BROWSER_HEADERS)
        diag["http_status"] = r.status_code
        diag["final_url"] = r.url
        diag["html_size"] = len(r.text)
        r.raise_for_status()
        html_content = r.text
    except Exception as e:
        diag["error"] = f"GET failed: {type(e).__name__}: {e}"
        logger.info(f"fetch_article_text GET failed for {url[:80]}: {e}")
        return diag if debug else None

    # Step 2: extract main article body. favor_recall is more lenient for news
    # sites that wrap the body in unusual DOM structures.
    try:
        text = trafilatura.extract(
            html_content,
            url=url,
            favor_recall=True,
            include_comments=False,
            include_tables=False,
            deduplicate=True,
        )
    except Exception as e:
        diag["error"] = f"trafilatura.extract raised: {type(e).__name__}: {e}"
        logger.info(diag["error"])
        return diag if debug else None

    if not text:
        diag["error"] = "trafilatura returned None"
        return diag if debug else None

    text = text.strip()
    diag["extracted_chars"] = len(text)
    diag["extracted_preview"] = text[:200]

    if len(text) < 200:
        diag["error"] = f"extraction too short ({len(text)} chars)"
        return diag if debug else None

    truncated = text[:MAX_ARTICLE_CHARS]
    diag["ok"] = True
    return diag if debug else truncated


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

def _is_trivial_description(desc: str, title: str, source: str) -> bool:
    """
    Google News RSS often fills <description> with just "<Title> <Source>" —
    there's no real content there to summarize. Detect that so we don't feed
    garbage to the LLM.
    """
    if not desc:
        return True
    # Strip source + title and see if anything's left
    residual = desc.replace(title, "").replace(source, "")
    residual = "".join(c for c in residual if c.isalnum())
    return len(residual) < 30


def _process_one(item: dict) -> dict:
    """
    Fetch + summarize a single item. Mutates `item` in place with:
      - summary:     str  — final text for the email (may be empty)
      - summary_src: str  — "llm" | "rss" | "none"
      - resolved_url: str — real publisher URL (or the input link on failure)
    """
    title = item.get("title", "")
    link = item.get("link", "")
    source = item.get("source", "Unknown")
    lang = item.get("lang", "en")
    rss_desc = item.get("description", "")

    # Step 1 + 2: resolve Google News redirect → fetch HTML → extract body text
    final_url = resolve_article_url(link)
    effective_url = final_url or link
    article_text = fetch_article_text(final_url) if final_url else None

    # Step 3: produce a summary. Order of preference:
    #   (a) LLM over the full article body
    #   (b) LLM over the RSS description (only if it has real content, not
    #       just "Title Source" filler from Google News)
    #   (c) meaningful RSS description verbatim
    #   (d) nothing (the email will simply omit the summary line)
    summary: str | None = None
    src = "none"
    if article_text:
        summary = summarize_article(title, article_text, source, lang)
        if summary:
            src = "llm"
    if not summary and not _is_trivial_description(rss_desc, title, source):
        summary = summarize_article(title, rss_desc, source, lang)
        if summary:
            src = "llm"
        else:
            summary = rss_desc
            src = "rss"

    item["summary"] = summary or ""
    item["summary_src"] = src
    item["resolved_url"] = effective_url
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
