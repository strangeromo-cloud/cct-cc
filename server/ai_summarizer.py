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

import html as _html_module
import json
import logging
import re
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
#
# We deliberately DO NOT set Accept-Encoding: requests/urllib3 set it to
# "gzip, deflate" by default and transparently decode those encodings.
# If we add "br", the server will send Brotli-compressed content but requests
# won't decode it (unless the `brotli` package is installed), producing
# unparseable binary that looks like an empty HTML to lxml/trafilatura.
BROWSER_HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
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


# ── Meta / JSON-LD fallback ──────────────────────────────────────────
# Used when trafilatura returns nothing — common for JS-rendered sites
# (Anthropic, TechCrunch, The Verge). These sites ship a static HTML shell,
# but meta tags and JSON-LD structured data are still there and usually
# contain a 150-500 char article description.
#
# Use lxml (already a trafilatura dependency) for robust parsing — regex
# over HTML misses multi-line / reordered / self-closing meta tags.


def _walk_jsonld(obj, collector: list[str]) -> None:
    """Recursively pull articleBody / description / headline out of JSON-LD."""
    if isinstance(obj, list):
        for x in obj:
            _walk_jsonld(x, collector)
    elif isinstance(obj, dict):
        for key in ("articleBody", "description", "headline", "abstract"):
            val = obj.get(key)
            if isinstance(val, str) and len(val) >= 30:
                collector.append(val.strip())
        for val in obj.values():
            if isinstance(val, (dict, list)):
                _walk_jsonld(val, collector)


def _extract_meta_fallback(html_content: str, diag: dict | None = None) -> str | None:
    """
    Stitch together article context from meta tags, JSON-LD, and the first
    few <article> <p> blocks. Populates `diag` (if given) with per-source
    character counts for easier debugging.
    Returns a single concatenated string or None if nothing useful found.
    """
    try:
        from lxml import html as lxml_html
    except ImportError:
        if diag is not None:
            diag["meta_fallback_error"] = "lxml not installed"
        return None

    try:
        tree = lxml_html.fromstring(html_content)
    except Exception as e:
        if diag is not None:
            diag["meta_fallback_error"] = f"lxml.fromstring raised: {type(e).__name__}: {e}"
        return None

    # Structural counters — helps distinguish "site has no metadata" from
    # "our xpath doesn't match the site's convention".
    if diag is not None:
        diag["total_meta_tags"] = len(tree.xpath("//meta"))
        diag["total_script_ldjson"] = len(tree.xpath("//script[@type='application/ld+json']"))
        diag["total_article_tags"] = len(tree.xpath("//article"))
        diag["total_p_tags"] = len(tree.xpath("//p"))
        # Sample the first few meta tags' attribute dicts so we can see the
        # site's preferred naming convention at a glance.
        diag["sample_metas"] = [
            dict(m.attrib) for m in tree.xpath("//meta")[:8]
        ]

    snippets: list[str] = []
    seen_prefixes: set[str] = set()

    def add(raw: str | None, tag: str):
        if not raw:
            return
        text = _html_module.unescape(raw)
        text = " ".join(text.split())
        if len(text) < 30:
            return
        prefix = text[:120]
        if prefix in seen_prefixes:
            return
        seen_prefixes.add(prefix)
        snippets.append(text)
        if diag is not None:
            diag.setdefault("meta_sources", []).append(f"{tag}:{len(text)}")

    # 1. Meta tags — check both property= and name= variants
    meta_selectors = [
        ("//meta[@property='og:description']/@content",       "og:description"),
        ("//meta[@name='og:description']/@content",           "og:description (name)"),
        ("//meta[@property='twitter:description']/@content",  "twitter:description (prop)"),
        ("//meta[@name='twitter:description']/@content",      "twitter:description"),
        ("//meta[@name='description']/@content",              "description"),
        ("//meta[@property='description']/@content",          "description (prop)"),
        ("//meta[@itemprop='description']/@content",          "itemprop:description"),
        ("//meta[@property='og:title']/@content",             "og:title"),
    ]
    for xpath, tag in meta_selectors:
        for val in tree.xpath(xpath):
            add(val, tag)

    # 2. JSON-LD structured data
    for script in tree.xpath("//script[@type='application/ld+json']"):
        raw = (script.text_content() or "").strip()
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            # Some sites embed multiple JSON objects separated by newlines
            for line in raw.splitlines():
                try:
                    data = json.loads(line)
                except Exception:
                    continue
                ld: list[str] = []
                _walk_jsonld(data, ld)
                for s in ld:
                    add(s, "json-ld")
            continue
        ld: list[str] = []
        _walk_jsonld(data, ld)
        for s in ld:
            add(s, "json-ld")

    # 3. <article> ... <p> — first few paragraphs from the first article element
    for article in tree.xpath("//article"):
        ps = article.xpath(".//p")
        for p in ps[:6]:
            text = (p.text_content() or "").strip()
            if len(text) >= 40:
                add(text, "article<p>")
        if snippets:
            break

    # 4. Last-ditch: <main> paragraphs
    if not snippets:
        for main in tree.xpath("//main"):
            for p in main.xpath(".//p")[:6]:
                text = (p.text_content() or "").strip()
                if len(text) >= 40:
                    add(text, "main<p>")
            if snippets:
                break

    if not snippets:
        return None
    return "\n\n".join(snippets)[:5000]


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

    # Step 2a: extract main article body via trafilatura. favor_recall is more
    # lenient for news sites with non-standard DOM.
    trafilatura_text: str | None = None
    try:
        trafilatura_text = trafilatura.extract(
            html_content,
            url=url,
            favor_recall=True,
            include_comments=False,
            include_tables=False,
            deduplicate=True,
        )
        if trafilatura_text:
            trafilatura_text = trafilatura_text.strip()
    except Exception as e:
        diag["trafilatura_error"] = f"{type(e).__name__}: {e}"
        logger.info(f"trafilatura.extract raised for {url[:80]}: {e}")

    diag["trafilatura_chars"] = len(trafilatura_text or "")

    # Step 2b: fallback — pull meta / JSON-LD / <article> content from the HTML.
    # Common for JS-rendered sites (Anthropic, TechCrunch, The Verge) where
    # trafilatura only sees a static shell.
    meta_text: str | None = None
    if not trafilatura_text or len(trafilatura_text) < 200:
        try:
            meta_text = _extract_meta_fallback(html_content, diag=diag)
        except Exception as e:
            diag["meta_error"] = f"{type(e).__name__}: {e}"
            logger.info(f"meta fallback raised for {url[:80]}: {e}")
    diag["meta_chars"] = len(meta_text or "")

    # Pick the better of the two
    if trafilatura_text and len(trafilatura_text) >= 200:
        text = trafilatura_text
        source = "trafilatura"
    elif meta_text and len(meta_text) >= 150:
        text = meta_text
        source = "meta"
    else:
        diag["error"] = (
            f"both extractions too short "
            f"(trafilatura={len(trafilatura_text or '')}, meta={len(meta_text or '')})"
        )
        return diag if debug else None

    diag["extract_source"] = source
    diag["extracted_chars"] = len(text)
    diag["extracted_preview"] = text[:300]
    diag["ok"] = True

    truncated = text[:MAX_ARTICLE_CHARS]
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
- **仅基于所给正文中的信息**；正文信息很少时允许只输出 1 句话，**严禁编造**任何未提及的数字、日期、人名或细节
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
- **Base the summary only on information in the provided text**; if the text is sparse, a single sentence is fine — do NOT fabricate numbers, dates, names, or details that weren't stated
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
