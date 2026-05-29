"""
GitHub weekly trending report.

Scrapes github.com/trending?since=weekly — GitHub's own trending page, which
ranks repositories by stars *gained this week* (the real velocity metric the
official API doesn't expose). We then:

  1. filter to AI-relevant repos (name/description keyword match),
  2. pull a richer description by fetching the README,
  3. have the LLM write a detailed Chinese intro for each,

and render a standalone weekly email (separate from the daily digest).

The HTML is GitHub's own consistent markup — far more stable than the
arbitrary publisher pages we extract article text from elsewhere.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone

import requests

from config import GITHUB_TOKEN

logger = logging.getLogger(__name__)

TZ_SHANGHAI = timezone(timedelta(hours=8))
TRENDING_URL = "https://github.com/trending"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

# AI relevance filter — matched against "owner/repo + description" lowercased.
_AI_KEYWORDS = (
    "ai", "llm", "agent", "gpt", "machine learning", "deep learning",
    "neural", "diffusion", "transformer", "rag", "embedding", "model",
    "chatbot", "openai", "anthropic", "claude", "gemini", "llama",
    "mcp", "prompt", "fine-tun", "inference", "multimodal", "genai",
    "stable diffusion", "vector", "copilot", "ml", "nlp",
)


# ══════════════════════════════════════════════════════════════════════
#  Scrape github.com/trending?since=weekly
# ══════════════════════════════════════════════════════════════════════

_ARTICLE_RE = re.compile(r'<article class="Box-row".*?</article>', re.DOTALL)
_NAME_RE = re.compile(r'<h2[^>]*>\s*<a[^>]*href="/([^"]+)"', re.DOTALL)
_DESC_RE = re.compile(r'<p[^>]*class="col-9[^"]*"[^>]*>(.*?)</p>', re.DOTALL)
_LANG_RE = re.compile(r'<span[^>]*itemprop="programmingLanguage"[^>]*>([^<]+)</span>')
_WEEK_RE = re.compile(r'([\d,]+)\s+stars\s+this\s+week')
_TOTAL_RE = re.compile(r'href="/[^"]+/stargazers"[^>]*>\s*(?:<svg.*?</svg>)?\s*([\d,]+)', re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")


def _clean(text: str) -> str:
    import html as H
    return " ".join(H.unescape(_TAG_RE.sub(" ", text)).split())


def _to_int(s: str) -> int:
    try:
        return int(s.replace(",", ""))
    except (TypeError, ValueError, AttributeError):
        return 0


def _is_ai_relevant(full_name: str, description: str) -> bool:
    blob = f"{full_name} {description}".lower()
    return any(k in blob for k in _AI_KEYWORDS)


def scrape_weekly_trending() -> list[dict]:
    """Return all weekly-trending repos as dicts (unfiltered)."""
    try:
        r = requests.get(
            TRENDING_URL,
            params={"since": "weekly"},
            headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"},
            timeout=30,
        )
        r.raise_for_status()
        html = r.text
    except Exception as e:
        logger.warning(f"GitHub trending scrape failed: {type(e).__name__}: {e}")
        return []

    repos: list[dict] = []
    for block in _ARTICLE_RE.findall(html):
        nm = _NAME_RE.search(block)
        if not nm:
            continue
        full_name = nm.group(1).strip().strip("/")
        # Normalize "owner/repo" — the href may contain extra whitespace/newlines
        full_name = re.sub(r"\s+", "", full_name)

        desc_m = _DESC_RE.search(block)
        description = _clean(desc_m.group(1)) if desc_m else ""
        lang_m = _LANG_RE.search(block)
        language = lang_m.group(1).strip() if lang_m else None
        week_m = _WEEK_RE.search(block)
        stars_this_week = _to_int(week_m.group(1)) if week_m else 0
        total_m = _TOTAL_RE.search(block)
        total_stars = _to_int(total_m.group(1)) if total_m else 0

        repos.append({
            "full_name":       full_name,
            "html_url":        f"https://github.com/{full_name}",
            "description":     description,
            "description_zh":  None,
            "detail_zh":       None,
            "language":        language,
            "stars_this_week": stars_this_week,
            "total_stars":     total_stars,
        })
    logger.info(f"GitHub weekly trending: scraped {len(repos)} repos")
    return repos


def fetch_weekly_ai_repos(limit: int = 5) -> list[dict]:
    """
    Scrape weekly trending, keep AI-relevant repos, sort by stars gained this
    week (desc), return the top `limit`.
    """
    all_repos = scrape_weekly_trending()
    ai_repos = [r for r in all_repos if _is_ai_relevant(r["full_name"], r["description"])]
    ai_repos.sort(key=lambda r: r["stars_this_week"], reverse=True)
    selected = ai_repos[:limit]
    logger.info(f"GitHub weekly: {len(all_repos)} scraped -> {len(ai_repos)} AI -> {len(selected)} selected")
    return selected


# ══════════════════════════════════════════════════════════════════════
#  README fetch (for richer descriptions)
# ══════════════════════════════════════════════════════════════════════

def fetch_readme_excerpt(full_name: str, max_chars: int = 4000) -> str | None:
    """Fetch a repo's README via the GitHub API and return a cleaned excerpt."""
    headers = {"Accept": "application/vnd.github.raw+json", "User-Agent": "CFO-Control-Tower"}
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    try:
        r = requests.get(
            f"https://api.github.com/repos/{full_name}/readme",
            headers=headers, timeout=30,
        )
        if r.status_code != 200:
            return None
        text = r.text
    except Exception as e:
        logger.debug(f"README fetch failed for {full_name}: {e}")
        return None

    # Strip markdown noise lightly: drop HTML tags, badge image lines, code fences.
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)   # images / badges
    text = re.sub(r"```.*?```", " ", text, flags=re.DOTALL)  # code blocks
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()[:max_chars] or None


# ══════════════════════════════════════════════════════════════════════
#  LLM: detailed Chinese intro per repo
# ══════════════════════════════════════════════════════════════════════

_DETAIL_PROMPT = """你是一名资深技术编辑。下面是本周 GitHub 上增长最快的若干个 AI 开源项目（含简短英文描述和 README 节选）。

请为**每个项目**写一段**详细中文简介**。要求：

- 每段 3-5 句，说清楚：这个项目是做什么的、解决什么问题、有什么亮点或技术特色、适合谁用
- 保留专有名词、模型名、公司名的英文原文
- 基于所给信息，不要编造未提及的功能或数字
- 客观、信息密度高，不要营销腔和套话

严格返回 JSON，不要任何其他文字：
{{"repos": [{{"id": 1, "zh": "详细中文简介"}}, {{"id": 2, "zh": "..."}}]}}

项目列表：
{repo_list}
"""


def enrich_repos(repos: list[dict]) -> None:
    """
    Fetch README excerpts and generate a detailed Chinese intro for each repo,
    in place (sets `detail_zh`). One batch LLM call. No-op on failure.
    """
    if not repos:
        return

    blocks: list[str] = []
    for i, r in enumerate(repos, start=1):
        readme = fetch_readme_excerpt(r["full_name"]) or ""
        desc = r.get("description") or ""
        blocks.append(
            f"{i}. {r['full_name']}（{r.get('language') or '—'}，本周 +{r['stars_this_week']}★）\n"
            f"   英文描述：{desc}\n"
            f"   README 节选：{readme[:2500]}"
        )
    repo_list = "\n\n".join(blocks)

    from ai_summarizer import _call_llm
    out = _call_llm(_DETAIL_PROMPT.format(repo_list=repo_list), max_out=8000, json_mode=True)
    if not out:
        logger.warning("repo detail generation: empty LLM response")
        return
    try:
        data = json.loads(out)
    except (json.JSONDecodeError, ValueError):
        logger.warning("repo detail generation: non-JSON response")
        return
    for entry in data.get("repos", []):
        try:
            idx = int(entry.get("id"))
        except (TypeError, ValueError):
            continue
        zh = (entry.get("zh") or "").strip()
        if 1 <= idx <= len(repos) and zh:
            repos[idx - 1]["detail_zh"] = zh


# ══════════════════════════════════════════════════════════════════════
#  Orchestration
# ══════════════════════════════════════════════════════════════════════

def build_weekly_report(limit: int = 5, enrich: bool = True) -> dict:
    """
    Full weekly pipeline. Returns:
        {
          "generated_at": ISO (Beijing),
          "week_label": "5/22 – 5/29",
          "repos": [ {...}, ... ],
        }
    """
    repos = fetch_weekly_ai_repos(limit=limit)
    if enrich:
        try:
            enrich_repos(repos)
        except Exception as e:
            logger.warning(f"enrich_repos failed: {e}")

    now = datetime.now(TZ_SHANGHAI)
    week_ago = now - timedelta(days=7)
    week_label = f"{week_ago.month}/{week_ago.day} – {now.month}/{now.day}"

    return {
        "generated_at": now.isoformat(),
        "week_label": week_label,
        "repos": repos,
    }
