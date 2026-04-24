"""
AI News Fetcher — Google News RSS with 3-category taxonomy and dedup.

Categories:
  - model_product : 模型 / 产品      (target: 5 items)
  - business      : 商业应用         (target: 5 items)
  - policy_risk   : 政策 / 风险      (target: 2 items)

Pipeline:
  1. fetch_ai_news_raw()        — broad fetch (~50-100 items) via bilingual queries
  2. dedup_and_rank()            — group by fuzzy title match; keep most authoritative
  3. select_top_per_category()   — top N per category by (authority desc, date desc)
  4. Caller summarizes selected items via ai_summarizer.summarize_batch()

Empty categories are omitted downstream (no "no items" placeholders).
"""
from __future__ import annotations

import html
import logging
import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from email.utils import parsedate_to_datetime
from urllib.parse import quote
from xml.etree import ElementTree as ET

logger = logging.getLogger(__name__)

TZ_SHANGHAI = timezone(timedelta(hours=8))

# ══════════════════════════════════════════════════════════════════════
#  Categories
# ══════════════════════════════════════════════════════════════════════

# (min_count, max_count) — we pick at least `min` from each category if
# available, then top up towards TOTAL_TARGET along PRIORITY_ORDER.
CATEGORY_RANGES: dict[str, tuple[int, int]] = {
    "model_product": (2, 3),
    "business":      (2, 3),
    "policy_risk":   (1, 2),
}

# Total number of items in the final digest (across all categories).
TOTAL_TARGET = 6

# When filling extra slots, prefer these categories in this order. Also the
# display order of sections in the email.
CATEGORY_ORDER = ["model_product", "business", "policy_risk"]
PRIORITY_ORDER = CATEGORY_ORDER  # alias for clarity at call sites

# Back-compat: some older callers / debug endpoints may still read this.
CATEGORY_TARGETS: dict[str, int] = {k: v[1] for k, v in CATEGORY_RANGES.items()}

# ══════════════════════════════════════════════════════════════════════
#  Query set — (query, category, language)
# ══════════════════════════════════════════════════════════════════════

AI_NEWS_QUERIES: list[tuple[str, str, str]] = [
    # ── 模型 / 产品 (Model / Product) ────────────────────────────────
    ("OpenAI new model release", "model_product", "en"),
    ("Anthropic Claude new release", "model_product", "en"),
    ("Google Gemini new model launch", "model_product", "en"),
    ("Meta Llama new release", "model_product", "en"),
    ("Mistral DeepSeek Qwen new model", "model_product", "en"),
    ("GPT new feature", "model_product", "en"),
    ("open source LLM release", "model_product", "en"),
    ("大模型 发布 新版", "model_product", "zh"),
    ("OpenAI Anthropic 新品", "model_product", "zh"),
    ("通义千问 DeepSeek 发布", "model_product", "zh"),

    # ── 商业应用 (Business Applications) ─────────────────────────────
    ("enterprise AI adoption", "business", "en"),
    ("OpenAI Anthropic revenue earnings", "business", "en"),
    ("AI startup funding round", "business", "en"),
    ("AI deal acquisition", "business", "en"),
    ("AI market share growth", "business", "en"),
    ("企业 AI 落地 应用", "business", "zh"),
    ("AI 融资 估值", "business", "zh"),
    ("AI 商业化 营收", "business", "zh"),

    # ── 政策 / 风险 (Policy / Risk) ──────────────────────────────────
    ("AI regulation new law", "policy_risk", "en"),
    ("EU AI Act enforcement", "policy_risk", "en"),
    ("AI copyright lawsuit", "policy_risk", "en"),
    ("AI safety incident", "policy_risk", "en"),
    ("AI chip export control", "policy_risk", "en"),
    ("AI 监管 法规", "policy_risk", "zh"),
    ("AI 安全 风险", "policy_risk", "zh"),
    ("AI 侵权 诉讼", "policy_risk", "zh"),
]

# ══════════════════════════════════════════════════════════════════════
#  Source authority ranking (for dedup tie-breaking)
# ══════════════════════════════════════════════════════════════════════

def source_authority(source: str) -> int:
    """
    Return 50..100 based on how authoritative the source is.
    Higher = more preferred when deduplicating the same story.
    Uses substring match on the RSS <source> name (which is a display string
    like "Reuters" or "South China Morning Post").
    """
    s = (source or "").lower()
    # Tier 1 — official AI-lab / company blogs
    t1 = ["openai", "anthropic", "deepmind", "meta ai", "microsoft research",
          "hugging face", "huggingface", "arxiv", "google research"]
    # Tier 2 — top-tier business/news press
    t2 = ["reuters", "bloomberg", "wall street journal", "wsj",
          "financial times", "new york times", "economist"]
    # Tier 3 — major tech/business press
    t3 = ["techcrunch", "the verge", "wired", "ars technica", "ars-technica",
          "mit technology review", "technology review", "the information",
          "cnbc", "south china morning post", "semianalysis"]
    # Tier 4 — secondary tech press
    t4 = ["venturebeat", "forbes", "business insider", "axios",
          "fortune", "engadget", "mashable"]
    # ZH trusted publishers
    t_zh = ["36氪", "36kr", "界面", "jiemian", "虎嗅", "huxiu",
            "澎湃新闻", "thepaper", "财新", "caixin", "新华社", "xinhua"]

    if any(k in s for k in t1):   return 100
    if any(k in s for k in t2):   return 90
    if any(k in s for k in t3):   return 80
    if any(k in s for k in t_zh): return 75
    if any(k in s for k in t4):   return 70
    return 50  # unknown / default


# ══════════════════════════════════════════════════════════════════════
#  Helpers
# ══════════════════════════════════════════════════════════════════════

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
_SUFFIX_RE = re.compile(r"\s*[-–—|:·]\s*[^-–—|:·]+$")  # strip trailing " - Source"

# Match distinctive model / product names. When two titles share one of these,
# they're almost always the same story (within a 24h window).
# Each match group normalizes to "<family>-<version>", e.g. "gpt-5.5".
_MODEL_ENTITY_RE = re.compile(
    r"""
    \b(
        # Latin-script model families
        (?:gpt|claude|gemini|llama|qwen|mistral|grok|phi|gemma|kimi|yi|hunyuan|doubao|ernie|spark|pangu|glm)
        [\s\-]?
        (?:\d+(?:\.\d+)?[a-z]?)            # version like 5.5 / 4o / 3.5-turbo
    )
    |
    \b(
        # Product-only names that carry enough identity on their own
        (?:deepseek|chatgpt|sora|dall[\s\-]?e|midjourney|copilot|cursor|bard|perplexity)
        [\s\-]?(?:v\d+|r\d+|pro|plus|max)?
    )
    """,
    re.IGNORECASE | re.VERBOSE,
)


def _extract_model_entities(title: str) -> set[str]:
    """Extract canonical model/product tokens from a title (for cross-article dedup)."""
    entities: set[str] = set()
    for m in _MODEL_ENTITY_RE.finditer(title or ""):
        token = (m.group(1) or m.group(2) or "").lower()
        # Canonicalize: remove whitespace and dashes so "gpt 5" == "gpt-5" == "gpt5"
        canon = re.sub(r"[\s\-]+", "", token)
        if canon:
            entities.add(canon)
    return entities


def _strip_html(raw: str) -> str:
    """Remove HTML tags from an RSS description and collapse whitespace."""
    if not raw:
        return ""
    text = _TAG_RE.sub(" ", raw)
    text = html.unescape(text)
    text = _WS_RE.sub(" ", text).strip()
    return text[:400]


def _normalize_title(title: str) -> str:
    """Normalize a title for fuzzy dedup: lowercase, drop trailing source, strip punct."""
    t = (title or "").lower()
    # Strip common trailing " - Source" separator
    t = _SUFFIX_RE.sub("", t)
    # Collapse punctuation/whitespace to single spaces
    t = re.sub(r"[^a-z0-9\u4e00-\u9fff]+", " ", t, flags=re.UNICODE)
    return t.strip()


def _rss_url(query: str, lang: str) -> str:
    q = quote(query)
    if lang == "zh":
        return f"https://news.google.com/rss/search?q={q}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans"
    return f"https://news.google.com/rss/search?q={q}&hl=en-US&gl=US&ceid=US:en"


# ══════════════════════════════════════════════════════════════════════
#  Step 1 — broad fetch
# ══════════════════════════════════════════════════════════════════════

@dataclass
class NewsItem:
    title: str
    link: str
    source: str
    published_at: str       # ISO string
    tag: str                # category key
    lang: str               # "en" | "zh"
    description: str        # cleaned RSS description

    def to_dict(self) -> dict:
        return {
            "title":       self.title,
            "link":        self.link,
            "source":      self.source,
            "publishedAt": self.published_at,
            "tag":         self.tag,
            "lang":        self.lang,
            "description": self.description,
        }


def fetch_ai_news_raw(hours: int = 24) -> list[NewsItem]:
    """
    Fetch AI news from Google News RSS across all (query, category, lang) combos,
    filter to items published within the last `hours`, return as a flat list.
    Per-query link dedup is applied. Global cross-category dedup is done later.
    """
    import requests

    now_utc = datetime.now(timezone.utc)
    cutoff = now_utc - timedelta(hours=hours)

    items: list[NewsItem] = []
    seen_links: set[str] = set()

    for query, category, lang in AI_NEWS_QUERIES:
        try:
            url = _rss_url(query, lang)
            response = requests.get(
                url, timeout=20,
                headers={"User-Agent": "Mozilla/5.0 (CFO-Control-Tower)"},
            )
            response.raise_for_status()

            root = ET.fromstring(response.content)
            channel = root.find("channel")
            if channel is None:
                continue

            per_query = 0
            for item in channel.findall("item"):
                if per_query >= 10:
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
                if not link or not title or link in seen_links:
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
                items.append(NewsItem(
                    title=title,
                    link=link,
                    source=(source_el.text or "").strip() if source_el is not None else "Google News",
                    published_at=pub_dt.isoformat(),
                    tag=category,
                    lang=lang,
                    description=_strip_html(desc_el.text if desc_el is not None else ""),
                ))
                per_query += 1
        except Exception as e:
            logger.warning(f"AI news fetch failed for query '{query}' ({lang}): {e}")
            continue

    logger.info(f"AI news raw fetch: {len(items)} items across {len(AI_NEWS_QUERIES)} queries")
    return items


# ══════════════════════════════════════════════════════════════════════
#  Step 2 — global cross-category dedup
# ══════════════════════════════════════════════════════════════════════

_DEDUP_RATIO = 0.65    # SequenceMatcher threshold for pure title similarity


def _same_story(a: NewsItem, b: NewsItem, a_norm: str, b_norm: str) -> bool:
    """
    Decide whether two items describe the same story. Two signals, either
    sufficient:
      (1) High title similarity (>= _DEDUP_RATIO).
      (2) Shared distinctive model/product entity (e.g. both mention
          "gpt-5.5"). Within a 24h window, near-duplicate coverage of the
          same launch is the overwhelming case; tolerating rare over-merges
          (e.g. a comparison article) is a good tradeoff for killing the
          "4 headlines about GPT-5.5" problem.
    """
    if not a_norm or not b_norm:
        return False
    if SequenceMatcher(None, a_norm, b_norm).ratio() >= _DEDUP_RATIO:
        return True
    ent_a = _extract_model_entities(a.title)
    if ent_a and ent_a & _extract_model_entities(b.title):
        return True
    return False


def dedup_and_rank(items: list[NewsItem]) -> list[NewsItem]:
    """
    Group near-identical items, then keep the single best representative per
    group ("best" = highest source authority, then latest).

    Grouping rule (see _same_story): fuzzy title match OR shared model/product
    entity (GPT-5.5, Claude 4, Gemini 2, ...).

    Complexity is O(N²) but N is typically <120, so ~7k comparisons — fine.
    """
    groups: list[list[NewsItem]] = []
    normalized_cache: dict[int, str] = {}

    def norm(it: NewsItem) -> str:
        key = id(it)
        if key not in normalized_cache:
            normalized_cache[key] = _normalize_title(it.title)
        return normalized_cache[key]

    for it in items:
        n = norm(it)
        placed = False
        for group in groups:
            rep = group[0]
            if _same_story(it, rep, n, norm(rep)):
                group.append(it)
                placed = True
                break
        if not placed:
            groups.append([it])

    result: list[NewsItem] = []
    for group in groups:
        best = max(group, key=lambda x: (source_authority(x.source), x.published_at))
        result.append(best)

    # Sort result globally (latest first) so downstream selection is stable
    result.sort(key=lambda x: x.published_at, reverse=True)
    logger.info(f"Dedup: {len(items)} raw -> {len(result)} unique groups")
    return result


# ══════════════════════════════════════════════════════════════════════
#  Step 3 — top-N per category
# ══════════════════════════════════════════════════════════════════════

def select_top_per_category(
    items: list[NewsItem],
    ranges: dict[str, tuple[int, int]] | None = None,
    total_target: int = TOTAL_TARGET,
) -> dict[str, list[NewsItem]]:
    """
    Bucket items by `tag`, sort each bucket by (authority desc, date desc),
    then:

      1. Take at least the MIN from each category (clipped to availability).
      2. Fill up toward `total_target` by walking PRIORITY_ORDER and taking
         the next-best item from categories that are still under their MAX.
      3. If step 2 can't reach `total_target` (one category is thin), go
         BEYOND each category's MAX in priority order until we hit the
         target or run out of candidates.

    Result is at most `total_target` items total, with per-category counts
    within each (min, max) range whenever possible — but gracefully
    degrades when a category has few or no candidates.
    """
    if ranges is None:
        ranges = CATEGORY_RANGES

    by_cat: dict[str, list[NewsItem]] = defaultdict(list)
    for it in items:
        by_cat[it.tag].append(it)

    # Sort each bucket once; we'll index into it by position afterwards.
    for cat in by_cat:
        by_cat[cat].sort(
            key=lambda x: (source_authority(x.source), x.published_at),
            reverse=True,
        )

    # Step 1 — start with MIN per category (clipped to availability).
    selected: dict[str, list[NewsItem]] = {}
    for cat in CATEGORY_ORDER:
        min_n, _ = ranges.get(cat, (0, 0))
        bucket = by_cat.get(cat, [])
        selected[cat] = bucket[:min_n]

    total = sum(len(v) for v in selected.values())

    def _try_add(respect_max: bool) -> bool:
        """Add one more item from the highest-priority eligible category.
        Returns True if added, False if no category is eligible."""
        for cat in PRIORITY_ORDER:
            current = len(selected[cat])
            bucket = by_cat.get(cat, [])
            if current >= len(bucket):
                continue
            if respect_max:
                _, max_n = ranges.get(cat, (0, 0))
                if current >= max_n:
                    continue
            selected[cat].append(bucket[current])
            return True
        return False

    # Step 2 — fill toward TOTAL_TARGET while respecting per-category MAX.
    while total < total_target and _try_add(respect_max=True):
        total += 1

    # Step 3 — if still under target, go beyond per-category MAX.
    while total < total_target and _try_add(respect_max=False):
        total += 1

    for cat in CATEGORY_ORDER:
        available = len(by_cat.get(cat, []))
        min_n, max_n = ranges.get(cat, (0, 0))
        logger.info(
            f"Category {cat}: {available} candidates -> "
            f"{len(selected[cat])} selected (range={min_n}-{max_n})"
        )
    return selected


# ══════════════════════════════════════════════════════════════════════
#  Orchestration helper (used by /api/jobs/ai-news-digest)
# ══════════════════════════════════════════════════════════════════════

def fetch_and_select(hours: int = 24) -> dict:
    """
    Full pipeline up to (but not including) summarization.
    Returns the structure expected by ai_summarizer.summarize_batch() and the
    email template:

        {
          "generated_at": ISO,
          "window_hours": int,
          "total": int,                 # selected count
          "raw_total": int,             # pre-dedup count (for debugging)
          "unique_total": int,          # post-dedup count (for debugging)
          "by_category": {
              "model_product": [NewsItem dicts],
              "business":      [NewsItem dicts],
              "policy_risk":   [NewsItem dicts],
          }
        }
    """
    raw = fetch_ai_news_raw(hours=hours)
    unique = dedup_and_rank(raw)
    selected = select_top_per_category(unique)

    # Convert to dicts so downstream stages (summarizer, email) can mutate freely
    by_category = {cat: [it.to_dict() for it in items] for cat, items in selected.items()}
    total = sum(len(v) for v in by_category.values())

    return {
        "generated_at": datetime.now(TZ_SHANGHAI).isoformat(),
        "window_hours": hours,
        "total": total,
        "raw_total": len(raw),
        "unique_total": len(unique),
        "by_category": by_category,
    }
