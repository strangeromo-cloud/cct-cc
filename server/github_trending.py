"""
GitHub trending AI repositories.

GitHub's official API has no star-velocity endpoint, so we approximate
"fast-growing" with: repos created in the last N days that already have many
stars. A repo that hit thousands of stars within weeks is, by definition,
growing fast.

Uses the Search API (anonymous: 10 req/min — we make 1 request per digest).
Set GITHUB_TOKEN for a higher limit; not required.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone

import requests

from config import GITHUB_TOKEN

logger = logging.getLogger(__name__)

SEARCH_URL = "https://api.github.com/search/repositories"

# AI-relevant keywords OR'd into the free-text query. GitHub searches the
# repo name, description and README.
#
# NOTE: GitHub's repository search rejects queries with more than 5 logical
# operators ("Validation Failed"). Keep this to <=4 OR terms. Quoted
# multi-word phrases also count heavily, so we stick to single tokens.
_QUERY = "AI OR LLM OR agent OR GPT"


def fetch_trending_repos(days: int = 30, limit: int = 3, min_stars: int = 200) -> list[dict]:
    """
    Return up to `limit` AI repos created within the last `days` days that
    already have at least `min_stars` stars, ranked by total stars desc.

    Each dict: {full_name, html_url, description, description_zh, stars,
                language, created_at}. `description_zh` starts None and is
                filled by translate_repo_descriptions().
    Returns [] on any failure.
    """
    created_after = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    q = f'{_QUERY} created:>{created_after} stars:>{min_stars}'

    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "CFO-Control-Tower",
    }
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"

    try:
        r = requests.get(
            SEARCH_URL,
            params={"q": q, "sort": "stars", "order": "desc", "per_page": limit},
            headers=headers,
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        logger.warning(f"GitHub trending fetch failed: {type(e).__name__}: {e}")
        return []

    repos: list[dict] = []
    for item in data.get("items", [])[:limit]:
        repos.append({
            "full_name":      item.get("full_name"),
            "html_url":       item.get("html_url"),
            "description":    (item.get("description") or "").strip(),
            "description_zh": None,
            "stars":          item.get("stargazers_count", 0),
            "language":       item.get("language"),
            "created_at":     item.get("created_at"),
        })
    logger.info(f"GitHub trending: {len(repos)} repos (created>{created_after}, stars>{min_stars})")
    return repos


def translate_repo_descriptions(repos: list[dict]) -> None:
    """
    Batch-translate English repo descriptions to concise Chinese, in place
    (sets each repo's `description_zh`). One LLM call for all repos. No-op if
    there's nothing to translate or the LLM call fails.
    """
    to_translate = [(i, r) for i, r in enumerate(repos) if r.get("description")]
    if not to_translate:
        return

    from ai_summarizer import _call_llm

    lines = [f'{i}. {r["description"]}' for i, r in to_translate]
    prompt = (
        "把下列 GitHub 项目的英文描述逐条翻译成简洁中文（每条不超过 40 字，"
        "保留专有名词 / 模型名 / 公司名原文）。\n"
        "严格返回 JSON，结构如下，不要任何其他文字：\n"
        '{"translations": [{"id": 0, "zh": "中文翻译"}]}\n\n'
        + "\n".join(lines)
    )
    out = _call_llm(prompt, max_out=800, json_mode=True)
    if not out:
        return
    try:
        data = json.loads(out)
    except (json.JSONDecodeError, ValueError):
        logger.warning("repo description translation: non-JSON response")
        return
    for entry in data.get("translations", []):
        try:
            idx = int(entry.get("id"))
        except (TypeError, ValueError):
            continue
        zh = (entry.get("zh") or "").strip()
        if 0 <= idx < len(repos) and zh:
            repos[idx]["description_zh"] = zh
