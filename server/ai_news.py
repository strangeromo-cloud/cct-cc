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
    tag: str                # category key (seed; reclassifier may overwrite)
    lang: str               # "en" | "zh" — display language of title/summary
    description: str        # cleaned RSS description or external pre-summary
    # Where this item came from. "google_news" (default) goes through our full
    # fetch→trafilatura→LLM pipeline. "aihot" already has a Chinese summary
    # baked in (item.description) and skips the summarizer.
    provenance: str = "google_news"

    def to_dict(self) -> dict:
        return {
            "title":       self.title,
            "link":        self.link,
            "source":      self.source,
            "publishedAt": self.published_at,
            "tag":         self.tag,
            "lang":        self.lang,
            "description": self.description,
            "provenance":  self.provenance,
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

    # ── Supplement with AI HOT (aihot.virxact.com) curated feed ─────────
    try:
        from config import INCLUDE_AIHOT_FEED
    except ImportError:
        INCLUDE_AIHOT_FEED = False
    if INCLUDE_AIHOT_FEED:
        try:
            from aihot_client import fetch_aihot_items
            extras = fetch_aihot_items(hours=hours)
        except Exception as e:
            logger.warning(f"AI HOT integration failed (continuing with Google News only): {e}")
            extras = []

        added = 0
        for d in extras:
            # Skip cross-source duplicates by URL — if Google News already gave us
            # this exact publisher URL, the LLM cluster dedup will handle it.
            if d["link"] in seen_links:
                continue
            seen_links.add(d["link"])
            items.append(NewsItem(
                title=d["title"],
                link=d["link"],
                source=d["source"],
                published_at=d["published_at"],
                tag=d["tag"],
                lang=d["lang"],
                description=d["description"],
                provenance=d["provenance"],
            ))
            added += 1
        logger.info(f"AI HOT supplement: +{added} items (total now {len(items)})")

    return items


# ══════════════════════════════════════════════════════════════════════
#  Step 2 — global cross-category dedup
# ══════════════════════════════════════════════════════════════════════

_DEDUP_RATIO = 0.65    # SequenceMatcher threshold for pure title similarity
_CLUSTER_PROMPT_FILE = "config/ai_filter/cluster_prompt.txt"


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
#  Step 2.5 — LLM-based cluster dedup (catches "same event, different
#             sources" pairs that string similarity + entity match miss)
# ══════════════════════════════════════════════════════════════════════

def _load_cluster_prompt() -> str | None:
    """Read the clustering prompt template, relative to this file."""
    from pathlib import Path
    p = Path(__file__).parent / _CLUSTER_PROMPT_FILE
    if not p.exists():
        logger.warning(f"cluster_prompt.txt not found at {p}")
        return None
    return p.read_text(encoding="utf-8").strip() or None


def _build_cluster_news_list(items: list[NewsItem]) -> str:
    """Render `id. [lang][source] title` for the cluster prompt."""
    lines: list[str] = []
    for i, it in enumerate(items, start=1):
        title = " ".join(it.title.split())[:240]
        # Source helps the LLM see "different outlets reporting the same thing".
        lines.append(f"{i}. [{it.lang}][{it.source}] {title}")
    return "\n".join(lines)


def _parse_clusters(raw: str, item_count: int) -> list[list[int]] | None:
    """
    Parse the LLM JSON response into a list-of-lists of 1-based item IDs.
    Performs basic validation: every input id must end up in exactly one cluster.
    Items the LLM forgot are added back as singleton clusters so we never lose data.
    """
    import json

    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        logger.warning("cluster_duplicates: response is not valid JSON")
        return None

    raw_clusters = (data.get("clusters") if isinstance(data, dict) else None) or []
    if not isinstance(raw_clusters, list):
        return None

    seen: set[int] = set()
    parsed: list[list[int]] = []
    for entry in raw_clusters:
        if not isinstance(entry, dict):
            continue
        ids_field = entry.get("ids")
        if not isinstance(ids_field, list):
            continue
        cluster: list[int] = []
        for x in ids_field:
            try:
                idx = int(x)
            except (TypeError, ValueError):
                continue
            if 1 <= idx <= item_count and idx not in seen:
                seen.add(idx)
                cluster.append(idx)
        if cluster:
            parsed.append(cluster)

    # Add singleton clusters for any input id the LLM forgot (defensive — the
    # prompt asks for full coverage, but we don't trust it blindly).
    for idx in range(1, item_count + 1):
        if idx not in seen:
            parsed.append([idx])

    return parsed


def cluster_duplicates(items: list[NewsItem]) -> tuple[list[NewsItem], dict]:
    """
    Use the LLM to cluster `items` into "same story" groups, then keep one
    representative per cluster (highest source authority, then most recent).

    Returns (deduplicated_items, stats). On failure, returns (items, stats)
    with `error` populated so the digest still ships.
    """
    stats = {
        "used": False,
        "input_total": len(items),
        "clusters_found": 0,
        "kept": len(items),
        "merged_away": 0,
        "error": None,
    }
    if len(items) < 3:
        # Nothing meaningful to cluster.
        return items, stats

    template = _load_cluster_prompt()
    if not template:
        stats["error"] = "cluster_prompt.txt missing"
        return items, stats

    prompt = template.format(
        news_count=len(items),
        news_list=_build_cluster_news_list(items),
    )

    # Reuse the same LLM helper used elsewhere; JSON-mode forces a parseable
    # response so we don't waste retries on stray prose.
    try:
        from ai_summarizer import _call_llm
    except ImportError as e:
        stats["error"] = f"ai_summarizer import failed: {e}"
        return items, stats

    out = _call_llm(prompt, max_out=2000, json_mode=True)
    if not out:
        stats["error"] = "LLM returned empty"
        return items, stats

    clusters = _parse_clusters(out, len(items))
    if clusters is None:
        stats["error"] = "could not parse cluster JSON"
        return items, stats

    stats["used"] = True
    stats["clusters_found"] = len(clusters)

    # Pick the best representative from each cluster: highest source authority,
    # then latest publication. This mirrors dedup_and_rank's tie-breaker so
    # the two passes are consistent.
    deduped: list[NewsItem] = []
    for cluster_ids in clusters:
        cluster_items = [items[i - 1] for i in cluster_ids]
        best = max(
            cluster_items,
            key=lambda x: (source_authority(x.source), x.published_at),
        )
        deduped.append(best)

    stats["kept"] = len(deduped)
    stats["merged_away"] = len(items) - len(deduped)
    logger.info(
        f"cluster_duplicates: input={len(items)} clusters={len(clusters)} "
        f"kept={len(deduped)} merged_away={stats['merged_away']}"
    )
    return deduped, stats


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

def fetch_and_select(
    hours: int = 24,
    use_ai_classifier: bool = True,
    use_ai_dedup: bool = True,
) -> dict:
    """
    Full pipeline up to (but not including) summarization.

    Pipeline:
      1. fetch_ai_news_raw       — broad bilingual RSS fetch (per-query seed tags)
      2. dedup_and_rank          — collapse near-duplicates / shared-entity stories
                                    (cheap string + model-name heuristic)
      3. reclassify_news         — LLM re-tags every survivor by reading the title
                                    against ai_interests.txt; rejects weak matches
      4. cluster_duplicates      — LLM clusters remaining items into "same event"
                                    groups and keeps one representative each
                                    (catches "official blog + WSJ + TechCrunch
                                    coverage of the same launch" trios)
      5. select_top_per_category — final 6 items by min/max ranges + priority

    Steps 3-4 each fall back transparently on any error so the digest still
    ships. Returns the structure expected by ai_summarizer.summarize_batch():

        {
          "generated_at": ISO, "window_hours": int,
          "total": int, "raw_total": int, "unique_total": int,
          "classifier_stats": {...} | None,
          "dedup_stats":      {...} | None,
          "by_category": {...},
        }
    """
    raw = fetch_ai_news_raw(hours=hours)
    unique = dedup_and_rank(raw)

    classifier_stats: dict | None = None
    candidates: list[NewsItem] = unique
    if use_ai_classifier:
        try:
            from ai_classifier import reclassify_news
            candidates, classifier_stats = reclassify_news(unique)
        except Exception as e:
            logger.warning(f"AI classifier raised, falling back to query tags: {e}")
            classifier_stats = {"error": f"{type(e).__name__}: {e}", "used": False}

    dedup_stats: dict | None = None
    if use_ai_dedup:
        try:
            candidates, dedup_stats = cluster_duplicates(candidates)
        except Exception as e:
            logger.warning(f"AI dedup raised, falling back to existing dedup: {e}")
            dedup_stats = {"error": f"{type(e).__name__}: {e}", "used": False}

    selected = select_top_per_category(candidates)

    by_category = {cat: [it.to_dict() for it in items] for cat, items in selected.items()}
    total = sum(len(v) for v in by_category.values())

    return {
        "generated_at": datetime.now(TZ_SHANGHAI).isoformat(),
        "window_hours": hours,
        "total": total,
        "raw_total": len(raw),
        "unique_total": len(unique),
        "classifier_stats": classifier_stats,
        "dedup_stats": dedup_stats,
        "by_category": by_category,
    }
