"""
AI-driven news re-classifier.

Replaces the old "the query that matched assigns the tag" approach with an
LLM that looks at every candidate title (after dedup) and assigns it to one
of the three fixed categories — or rejects it if it doesn't fit any.

Design:
  * `config/ai_interests.txt`         — user-editable, plain text. Three
                                        sections marked by [模型 / 产品] etc.
                                        with rich keyword descriptions.
  * `config/ai_filter/classify_prompt.txt`
                                      — Jinja-style template ({tags_block},
                                        {news_count}, {news_list}).
  * `reclassify_news(items)`         — single batch LLM call, JSON output.
                                        Returns the same items list with
                                        `tag` rewritten and items that the
                                        LLM rejected dropped.

Failure mode: any error returns `items` unchanged so the digest still ships.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import replace
from pathlib import Path
from typing import TYPE_CHECKING

from ai_summarizer import _call_llm  # share the same gpt-5.x param fallback

if TYPE_CHECKING:  # avoid circular import at runtime
    from ai_news import NewsItem

logger = logging.getLogger(__name__)

# ── Paths ────────────────────────────────────────────────────────────
_CONFIG_DIR = Path(__file__).parent / "config"
INTERESTS_FILE = _CONFIG_DIR / "ai_interests.txt"
CLASSIFY_PROMPT_FILE = _CONFIG_DIR / "ai_filter" / "classify_prompt.txt"

# ── The three category keys this classifier emits ───────────────────
# Must stay in sync with ai_news.CATEGORY_ORDER. Order also defines priority
# (used as a tie-breaker hint in the prompt).
ALLOWED_TAGS = ("model_product", "business", "policy_risk")

# Headers used in ai_interests.txt (case-insensitive, whitespace-insensitive).
# Maps each header to the canonical category key.
_INTERESTS_HEADERS = {
    "模型 / 产品": "model_product",
    "模型/产品": "model_product",
    "models & products": "model_product",
    "model_product": "model_product",
    "商业应用": "business",
    "商业 / 应用": "business",
    "business": "business",
    "政策 / 风险": "policy_risk",
    "政策/风险": "policy_risk",
    "policy & risk": "policy_risk",
    "policy_risk": "policy_risk",
}


# ══════════════════════════════════════════════════════════════════════
#  Loaders
# ══════════════════════════════════════════════════════════════════════

def load_interests() -> dict[str, str] | None:
    """
    Parse `config/ai_interests.txt` into {category_key: description_text}.

    Returns None if the file is missing, empty, or has no recognizable headers.
    Lines starting with '#' are treated as comments and skipped.
    """
    if not INTERESTS_FILE.exists():
        logger.info(f"ai_interests.txt not found at {INTERESTS_FILE}")
        return None

    raw = INTERESTS_FILE.read_text(encoding="utf-8")
    sections: dict[str, list[str]] = {}
    current_key: str | None = None

    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        # Header line: [xxx]
        m = re.match(r"^\[([^\]]+)\]\s*$", stripped)
        if m:
            header = m.group(1).strip().lower()
            current_key = _INTERESTS_HEADERS.get(header)
            if current_key:
                sections.setdefault(current_key, [])
            else:
                logger.warning(f"Unknown ai_interests section header: [{m.group(1)}]")
            continue
        if current_key:
            sections[current_key].append(stripped)

    parsed = {key: " ".join(lines).strip() for key, lines in sections.items() if lines}
    if not parsed:
        logger.warning("ai_interests.txt has no parseable sections")
        return None

    missing = [k for k in ALLOWED_TAGS if k not in parsed]
    if missing:
        logger.warning(f"ai_interests.txt missing sections: {missing}")
    return parsed


def load_classify_template() -> str | None:
    """Read the classify prompt template (whole file)."""
    if not CLASSIFY_PROMPT_FILE.exists():
        logger.warning(f"classify_prompt.txt not found at {CLASSIFY_PROMPT_FILE}")
        return None
    return CLASSIFY_PROMPT_FILE.read_text(encoding="utf-8").strip() or None


# ══════════════════════════════════════════════════════════════════════
#  Prompt assembly
# ══════════════════════════════════════════════════════════════════════

# Display name used in the {tags_block} so the LLM has a human label.
_DISPLAY_NAMES = {
    "model_product": "模型 / 产品",
    "business":      "商业应用",
    "policy_risk":   "政策 / 风险",
}


def _build_tags_block(interests: dict[str, str]) -> str:
    """Render each present category description into the prompt's tags section."""
    parts: list[str] = []
    for tag in ALLOWED_TAGS:  # preserve priority order
        if tag in interests:
            display = _DISPLAY_NAMES[tag]
            parts.append(f"### {tag} （{display}）\n{interests[tag]}")
    return "\n\n".join(parts)


def _build_news_list(items: list["NewsItem"]) -> str:
    """Render each news item as `id: title` for the prompt."""
    lines: list[str] = []
    for i, it in enumerate(items, start=1):
        # Compress whitespace & cap length so a single huge title doesn't blow context
        title = " ".join(it.title.split())[:240]
        lines.append(f"{i}. [{it.lang}] {title}")
    return "\n".join(lines)


# ══════════════════════════════════════════════════════════════════════
#  LLM call + parsing
# ══════════════════════════════════════════════════════════════════════

# Below this score we treat the LLM's classification as "weak match" — drop
# the item from the digest pool instead of mis-categorizing it.
_MIN_SCORE = 0.5


def _parse_classifications(raw: str) -> list[dict]:
    """Parse the LLM's JSON response into a list of {id, tag, score} dicts."""
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        logger.warning("classifier: response is not valid JSON")
        return []

    # Accept either {"classifications": [...]} or a bare list (defensive).
    if isinstance(data, dict):
        items = data.get("classifications") or data.get("results") or []
    elif isinstance(data, list):
        items = data
    else:
        items = []

    cleaned: list[dict] = []
    for entry in items:
        if not isinstance(entry, dict):
            continue
        try:
            idx = int(entry.get("id"))
        except (TypeError, ValueError):
            continue
        tag = (entry.get("tag") or "").strip()
        if tag not in ALLOWED_TAGS:
            continue
        try:
            score = float(entry.get("score", 0))
        except (TypeError, ValueError):
            score = 0.0
        cleaned.append({"id": idx, "tag": tag, "score": score})
    return cleaned


def classify_batch(items: list["NewsItem"]) -> list[dict] | None:
    """
    Run a single LLM call to classify all `items`. Returns the raw list of
    {id, tag, score} dicts, or None on any failure.
    """
    if not items:
        return []

    interests = load_interests()
    template = load_classify_template()
    if not interests or not template:
        return None

    tags_block = _build_tags_block(interests)
    news_list = _build_news_list(items)

    prompt = template.format(
        tags_block=tags_block,
        news_count=len(items),
        news_list=news_list,
    )

    out = _call_llm(prompt, max_out=1500, json_mode=True)
    if not out:
        return None

    return _parse_classifications(out)


# ══════════════════════════════════════════════════════════════════════
#  Public API — used by ai_news.fetch_and_select
# ══════════════════════════════════════════════════════════════════════

def reclassify_news(items: list["NewsItem"]) -> tuple[list["NewsItem"], dict]:
    """
    Re-tag a list of NewsItems using the LLM classifier.

    On success: returns (new_items, stats) where new_items has each item's
                `tag` rewritten by the LLM and items the LLM rejected
                (or scored below _MIN_SCORE) are dropped.
    On failure: returns (items, stats) — the original items pass through
                unchanged so downstream selection still has something to
                work with.

    `stats` always includes:
      - used: bool                — whether the LLM call actually ran
      - input_total: int          — items passed in
      - classified: int           — items the LLM tagged at all
      - kept: int                 — items kept after _MIN_SCORE threshold
      - dropped_low_score: int    — dropped because score < _MIN_SCORE
      - dropped_no_match: int     — input items the LLM didn't tag at all
      - per_tag: {tag: count}     — breakdown of `kept` items by new tag
      - error: str | None         — populated on failure
    """
    stats = {
        "used": False,
        "input_total": len(items),
        "classified": 0,
        "kept": 0,
        "dropped_low_score": 0,
        "dropped_no_match": 0,
        "per_tag": {t: 0 for t in ALLOWED_TAGS},
        "error": None,
    }

    if not items:
        return items, stats

    classifications = classify_batch(items)
    if classifications is None:
        stats["error"] = "classifier returned None (config missing or LLM failed)"
        return items, stats

    stats["used"] = True
    stats["classified"] = len(classifications)

    # Build {item_index_1based: (tag, score)} keeping only the highest-score
    # entry per index in case the LLM accidentally returns duplicates.
    best_per_id: dict[int, tuple[str, float]] = {}
    for c in classifications:
        idx = c["id"]
        prev = best_per_id.get(idx)
        if prev is None or c["score"] > prev[1]:
            best_per_id[idx] = (c["tag"], c["score"])

    out: list["NewsItem"] = []
    for i, item in enumerate(items, start=1):
        cls = best_per_id.get(i)
        if cls is None:
            stats["dropped_no_match"] += 1
            continue
        tag, score = cls
        if score < _MIN_SCORE:
            stats["dropped_low_score"] += 1
            continue
        # NewsItem is a frozen-ish dataclass; use replace() to clone with new tag.
        out.append(replace(item, tag=tag))
        stats["kept"] += 1
        stats["per_tag"][tag] += 1

    logger.info(
        f"reclassify_news: input={stats['input_total']} "
        f"classified={stats['classified']} kept={stats['kept']} "
        f"per_tag={stats['per_tag']}"
    )
    return out, stats
