"""
AI HOT (aihot.virxact.com) integration client.

Treats AI HOT as one additional news source feeding into our existing
fetch/dedup/classify/summarize pipeline. Specifically:

  - Non-X sources (IT之家, Anthropic Blog, Claude Blog, GitHub Blog, …)
    pass through unconditionally — they're established publishers / labs.
  - X (Twitter) sources are gated by `config/aihot_x_allowlist.txt`.
    The user maintains the allowlist; only handles on it pass.

Items keep AI HOT's pre-generated Chinese summary, so they bypass our
trafilatura → LLM summarization step (cheaper + we get to use coverage
that we couldn't summarize ourselves — paywalled sites, X posts, etc.).

Failure mode: any error → return empty list so the digest still ships
with just the Google News items.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

logger = logging.getLogger(__name__)

API_BASE = "https://aihot.virxact.com"
ITEMS_ENDPOINT = "/api/public/items"
DEFAULT_TIMEOUT = 30  # seconds

# AI HOT's category → our seed tag. The reclassifier will overwrite, so this
# only matters as a fallback when AI classification is skipped.
CATEGORY_TO_SEED_TAG = {
    "ai-models":   "model_product",
    "ai-products": "model_product",
    "paper":       "model_product",
    "industry":    "business",
    "tip":         "business",   # reclassifier likely drops these as low-relevance
}

_ALLOWLIST_FILE = Path(__file__).parent / "config" / "aihot_x_allowlist.txt"

# Matches "X：DisplayName (@handle)" or "X：DisplayName(@handle)" — both
# full-width 「：」 and ASCII ":" colons are observed in their data.
_X_SOURCE_RE = re.compile(
    r"^X[：:]\s*.+?\(\s*@?([A-Za-z0-9_]+)\s*\)\s*$"
)


# ══════════════════════════════════════════════════════════════════════
#  Allowlist loader (cached at module level — small file, < 30 entries)
# ══════════════════════════════════════════════════════════════════════

_allowlist_cache: set[str] | None = None


def load_x_allowlist() -> set[str]:
    """Read aihot_x_allowlist.txt and return the set of lower-cased handles."""
    global _allowlist_cache
    if _allowlist_cache is not None:
        return _allowlist_cache

    if not _ALLOWLIST_FILE.exists():
        logger.info(f"aihot_x_allowlist.txt not found at {_ALLOWLIST_FILE} — accepting no X sources")
        _allowlist_cache = set()
        return _allowlist_cache

    handles: set[str] = set()
    for raw_line in _ALLOWLIST_FILE.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        # Strip leading @ if user wrote it
        if line.startswith("@"):
            line = line[1:]
        handles.add(line.lower())
    _allowlist_cache = handles
    logger.info(f"AI HOT X allowlist: {len(handles)} handles loaded")
    return handles


def _extract_x_handle(source: str) -> str | None:
    """Return the lowercased handle if `source` looks like an X source, else None."""
    if not source:
        return None
    m = _X_SOURCE_RE.match(source.strip())
    if not m:
        return None
    return m.group(1).lower()


def is_authoritative_source(source: str, allowlist: set[str] | None = None) -> bool:
    """
    Decide whether to accept an AI HOT item based on its `source` field.

    Rules:
      - X sources: accept only if handle is on the allowlist
      - Everything else (媒体 / 公司博客 / 论文): accept unconditionally
    """
    if not source:
        return False
    handle = _extract_x_handle(source)
    if handle is None:
        # Non-X source — established publisher, accept by default.
        return True
    if allowlist is None:
        allowlist = load_x_allowlist()
    return handle in allowlist


# ══════════════════════════════════════════════════════════════════════
#  API fetch
# ══════════════════════════════════════════════════════════════════════

def _fetch_one_page(since_iso: str, cursor: str | None) -> tuple[list[dict], str | None]:
    """Fetch one page of AI HOT items. Returns (items, nextCursor)."""
    params: dict[str, str] = {"mode": "selected", "since": since_iso}
    if cursor:
        params["cursor"] = cursor
    r = requests.get(
        API_BASE + ITEMS_ENDPOINT,
        params=params,
        timeout=DEFAULT_TIMEOUT,
        headers={"User-Agent": "Mozilla/5.0 (CFO-Control-Tower)"},
    )
    r.raise_for_status()
    data = r.json()
    return data.get("items", []), (data.get("nextCursor") if data.get("hasNext") else None)


def fetch_aihot_items(hours: int = 24, max_pages: int = 3) -> list[dict]:
    """
    Fetch AI HOT items from the last `hours` hours, paginate up to `max_pages`,
    filter by X allowlist, and return a list of dicts shaped to match our
    NewsItem fields plus extras.

    Returned dict keys:
      title         : str    — AI HOT's display title (Chinese, pre-translated)
      link          : str    — publisher URL
      source        : str    — AI HOT's source label (e.g. "IT之家（RSS）")
      published_at  : str    — ISO 8601 string
      tag           : str    — seed category (will be overwritten by reclassifier)
      lang          : str    — always "zh" (we treat their pre-translated Chinese
                                as our display language)
      description   : str    — AI HOT's pre-generated Chinese summary; reused as
                                our `summary` to bypass our summarizer
      provenance    : str    — "aihot" so downstream code can short-circuit
    """
    since_dt = datetime.now(timezone.utc) - timedelta(hours=hours)
    since_iso = since_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    allowlist = load_x_allowlist()
    accepted: list[dict] = []
    seen_urls: set[str] = set()
    skipped_x = 0
    skipped_empty = 0
    cursor: str | None = None

    for page in range(max_pages):
        try:
            items, cursor = _fetch_one_page(since_iso, cursor)
        except Exception as e:
            logger.warning(f"AI HOT fetch failed on page {page}: {type(e).__name__}: {e}")
            break
        if not items:
            break

        for it in items:
            url = (it.get("url") or "").strip()
            title = (it.get("title") or "").strip()
            summary = (it.get("summary") or "").strip()
            source = (it.get("source") or "").strip()
            if not url or not title:
                skipped_empty += 1
                continue
            if url in seen_urls:
                continue
            if not is_authoritative_source(source, allowlist):
                skipped_x += 1
                continue
            seen_urls.add(url)

            seed_tag = CATEGORY_TO_SEED_TAG.get(it.get("category"), "business")
            accepted.append({
                "title":        title,
                "link":         url,
                "source":       source,
                "published_at": it.get("publishedAt") or since_iso,
                "tag":          seed_tag,
                "lang":         "zh",
                "description":  summary,
                "provenance":   "aihot",
            })

        if not cursor:
            break

    logger.info(
        f"AI HOT: kept {len(accepted)} items "
        f"(skipped {skipped_x} X non-allowlisted, {skipped_empty} empty)"
    )
    return accepted
