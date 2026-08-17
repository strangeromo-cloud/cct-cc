"""
CFO Control Tower — FastAPI Backend
Serves dashboard data + AI chat with LLM integration.
"""
import json
import logging
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from config import (
    HOST, PORT, CORS_ORIGINS,
    JOB_TOKEN, SMTP_USER, SMTP_PASSWORD, DIGEST_RECIPIENT,
)
from models import FilterState, ChatRequest
from mock_data import (
    get_opening_data,
    get_secondary_data,
    get_tertiary_data,
    QUARTERS, BUSINESS_GROUPS, GEOGRAPHIES,
)
from llm_agent import chat, chat_stream
from global_data import (
    get_macro_data,
    get_supply_chain_data,
    get_competitive_data,
    fetch_news,
)
from global_summary import stream_global_summary
from ai_news import fetch_and_select
from ai_summarizer import summarize_batch, resolve_article_url, fetch_article_text, summarize_article
from email_sender import send_digest
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="CFO Control Tower API", version="1.0.0")

# ── CORS ─────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ───────────────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {"status": "ok", "quarters": QUARTERS, "bgs": BUSINESS_GROUPS, "geos": GEOGRAPHIES}


# ── Dashboard Data APIs ──────────────────────────────────────────────
@app.get("/api/data/opening")
async def api_opening(
    quarter: str = "FY26Q1",
    bgs: str = Query("", description="Comma-separated BGs"),
    geos: str = Query("", description="Comma-separated Geos"),
):
    """Quarter overview KPIs."""
    filters = FilterState(
        quarter=quarter,
        selectedBGs=[b for b in bgs.split(",") if b],
        selectedGeos=[g for g in geos.split(",") if g],
    )
    return get_opening_data(filters).model_dump()


@app.get("/api/data/secondary")
async def api_secondary(
    quarter: str = "FY26Q1",
    bgs: str = Query("", description="Comma-separated BGs"),
    geos: str = Query("", description="Comma-separated Geos"),
):
    """Operating metrics time series."""
    filters = FilterState(
        quarter=quarter,
        selectedBGs=[b for b in bgs.split(",") if b],
        selectedGeos=[g for g in geos.split(",") if g],
    )
    return [m.model_dump() for m in get_secondary_data(filters)]


@app.get("/api/data/tertiary")
async def api_tertiary(
    quarter: str = "FY26Q1",
    bgs: str = Query("", description="Comma-separated BGs"),
    geos: str = Query("", description="Comma-separated Geos"),
):
    """BG × Geo breakdown."""
    filters = FilterState(
        quarter=quarter,
        selectedBGs=[b for b in bgs.split(",") if b],
        selectedGeos=[g for g in geos.split(",") if g],
    )
    return [r.model_dump() for r in get_tertiary_data(filters)]


# ── AI Chat (non-streaming) ─────────────────────────────────────────
@app.post("/api/chat")
async def api_chat(req: ChatRequest):
    """Send a message, get complete AI response."""
    result = await chat(
        message=req.message,
        filters=req.filters,
        history=req.conversationHistory,
    )
    return result


# ── AI Chat (SSE streaming) ─────────────────────────────────────────
@app.post("/api/chat/stream")
async def api_chat_stream(req: ChatRequest):
    """
    SSE endpoint for streaming AI responses.
    Events:
      - {"type":"status","content":"正在查询数据..."}
      - {"type":"delta","content":"部分文字"}
      - {"type":"complete","text":"完整文字","blocks":[...]}
      - {"type":"error","content":"错误信息"}
    """
    async def event_generator():
        async for chunk in chat_stream(
            message=req.message,
            filters=req.filters,
            history=req.conversationHistory,
        ):
            yield {"data": chunk}

    return EventSourceResponse(event_generator())


# ══════════════════════════════════════════════════════════════════════
#  Global View APIs — External macro, supply chain, competitive data
# ══════════════════════════════════════════════════════════════════════

@app.get("/api/global/macro")
async def api_global_macro(years: int = 5):
    """Dimension 1: Macro & Capital Environment (Treasury 10Y, NDX P/E, DXY, VIX, EPU)."""
    return get_macro_data(years)


@app.get("/api/global/supply-chain")
async def api_global_supply_chain(years: int = 5):
    """Dimension 2: Upstream Cost & Supply Chain (Components, Semi Lead Time, GSCPI)."""
    return get_supply_chain_data(years)


@app.get("/api/global/debug/gscpi")
async def api_global_debug_gscpi():
    """Diagnostic endpoint: returns full error traceback if GSCPI fetch fails."""
    import traceback
    import requests as _requests
    import io as _io
    try:
        url = "https://www.newyorkfed.org/medialibrary/research/interactives/gscpi/downloads/gscpi_data.xlsx"
        response = _requests.get(url, timeout=30, headers={"User-Agent": "Mozilla/5.0 (CFO-Control-Tower)"})
        content = response.content
        is_xls = content[:4] == b"\xd0\xcf\x11\xe0"
        result = {
            "url": url,
            "status": response.status_code,
            "content_length": len(content),
            "magic_bytes": content[:4].hex(),
            "detected_format": "xls" if is_xls else "xlsx",
        }
        try:
            import pandas as pd
            engine = "calamine"
            xl = pd.ExcelFile(_io.BytesIO(content), engine=engine)
            result["engine"] = engine
            result["sheet_names"] = list(xl.sheet_names)
            for sheet in xl.sheet_names[:3]:
                try:
                    df_head = xl.parse(sheet, nrows=10)
                    result[f"sheet_{sheet}_cols"] = [str(c) for c in df_head.columns]
                except Exception as se:
                    result[f"sheet_{sheet}_error"] = f"{type(se).__name__}: {se}"
        except Exception as pe:
            result["pandas_error"] = f"{type(pe).__name__}: {pe}"
            result["pandas_traceback"] = traceback.format_exc()
        return result
    except Exception as e:
        return {
            "error": f"{type(e).__name__}: {e}",
            "traceback": traceback.format_exc(),
        }


@app.get("/api/global/competitive")
async def api_global_competitive():
    """Dimension 3: Competitive Landscape (competitor financials + market share)."""
    return get_competitive_data()


@app.get("/api/global/news")
async def api_global_news(limit: int = 15):
    """Latest Lenovo + macro/supply-chain/competitor news (Google News RSS)."""
    return fetch_news(limit)


class GlobalSummaryRequest(BaseModel):
    macro: dict | None = None
    supplyChain: dict | None = None
    competitive: dict | None = None


@app.post("/api/global/summary/stream")
async def api_global_summary_stream(req: GlobalSummaryRequest):
    """Stream AI-generated CFO summary of external environment data."""
    data = {
        "macro": req.macro,
        "supplyChain": req.supplyChain,
        "competitive": req.competitive,
    }

    async def event_generator():
        async for chunk in stream_global_summary(data):
            yield {"data": chunk}

    return EventSourceResponse(event_generator())


# ── Scheduled Jobs ────────────────────────────────────────────────────
def _alert_lark_on_degraded(digest: dict, with_insight: bool = False) -> dict | None:
    """
    Post a Lark alert when the digest ran in a degraded state.

    The pipeline is designed to always ship an email — if the LLM is
    unreachable it falls back to raw RSS text. That silent degradation is the
    failure mode worth alerting on: mail still arrives, but with no Chinese
    translation, no summaries and no AI classification.

    Alerts when ALL of these LLM stages produced nothing:
      * summaries      (summary_stats.llm == 0 while items exist)
      * classification (classifier_stats.used is False)
      * dedup          (dedup_stats.used is False)
    """
    from config import LARK_WEBHOOK
    if not LARK_WEBHOOK:
        return None

    total = digest.get("total", 0)
    if not total:
        return None

    summary_stats = digest.get("summary_stats") or {}
    classifier_stats = digest.get("classifier_stats") or {}
    dedup_stats = digest.get("dedup_stats") or {}

    llm_summaries = summary_stats.get("llm", 0)
    classifier_ok = bool(classifier_stats.get("used"))
    dedup_ok = bool(dedup_stats.get("used"))

    problems: list[str] = []
    if llm_summaries == 0:
        problems.append(f"摘要/翻译全部失败（{total} 条均未生成）")
    if not classifier_ok:
        err = classifier_stats.get("error") or "未知原因"
        problems.append(f"AI 分类未生效（{err}）")
    if not dedup_ok:
        err = dedup_stats.get("error") or "未知原因"
        problems.append(f"AI 去重未生效（{err}）")

    # Only alert on wholesale failure — a single stage degrading is tolerable
    # and would otherwise create alert fatigue.
    if llm_summaries > 0 or len(problems) < 2:
        return None

    edition = "联想视角版" if with_insight else "普通版"
    now_bj = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d %H:%M")
    text = (
        "⚠️ AI 日报降级告警\n"
        f"版本：{edition}\n"
        f"时间：{now_bj}\n"
        f"问题：{'；'.join(problems)}\n"
        "影响：邮件已照常发出，但内容为英文原文，无翻译/摘要/分类。\n"
        "常见原因：LLM API Key 失效、额度耗尽或中转站拦截。\n"
        "排查：GET /api/jobs/debug/llm"
    )
    from lark_client import send_text_to_lark
    logger.warning(f"Digest degraded — alerting Lark: {problems}")
    return send_text_to_lark(LARK_WEBHOOK, text)


def _require_job_token(authorization: str | None) -> None:
    """Raise 401/503 unless the Authorization header matches JOB_TOKEN."""
    if not JOB_TOKEN:
        raise HTTPException(status_code=503, detail="JOB_TOKEN not configured on server")
    expected = f"Bearer {JOB_TOKEN}"
    if not authorization or authorization != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing Bearer token")


@app.post("/api/jobs/ai-news-digest")
async def api_jobs_ai_news_digest(
    authorization: str | None = Header(default=None),
    hours: int = Query(24, ge=1, le=168, description="Time window in hours"),
    dry_run: bool = Query(False, description="Fetch + render only, do not send email"),
    skip_summary: bool = Query(False, description="Skip LLM summarization (faster preview)"),
    skip_ai_classifier: bool = Query(False, description="Skip LLM re-classification, use raw query tags"),
    skip_ai_dedup: bool = Query(False, description="Skip LLM cluster dedup (keeps near-duplicates)"),
    with_insight: bool = Query(False, description="Force per-item Lenovo insight + tag as a distinct email"),
    skip_lark: bool = Query(False, description="Do not post to Lark even if LARK_WEBHOOK is set"),
    no_email: bool = Query(False, description="Skip the email send — useful for Lark-only testing"),
):
    """
    Produce + send the daily AI news digest.

    Pipeline:
      1. fetch_and_select() — bilingual RSS fetch, cross-category dedup by
         fuzzy title match, top-N per category by source authority + recency.
      2. summarize_batch()   — for each selected item: follow Google News
         redirect → trafilatura extract → LLM summary (CN for zh items,
         EN for en items). Falls back to RSS description on failure.
      3. send_digest()       — render HTML + send via Gmail SMTP.

    Secured with Bearer token (JOB_TOKEN).
    Invoked daily by GitHub Actions `.github/workflows/daily-ai-news.yml`.

    Params:
      - hours        : lookback window (default 24)
      - dry_run      : true = return the rendered digest, do not email
      - skip_summary : true = skip the expensive LLM step (faster previews)
    """
    _require_job_token(authorization)

    digest = fetch_and_select(
        hours=hours,
        use_ai_classifier=not skip_ai_classifier,
        use_ai_dedup=not skip_ai_dedup,
    )

    from config import INCLUDE_LENOVO_INSIGHT

    # `with_insight=true` forces insight on regardless of the env flag, and
    # marks this as the separate "AI 新闻 + 联想视角" email.
    want_insight = with_insight or INCLUDE_LENOVO_INSIGHT

    if not skip_summary:
        summarize_batch(digest)

        # Per-item Lenovo insight — one batch LLM call attaches a detailed
        # analysis paragraph under each news item. (GitHub trending now lives
        # in the separate weekly report; see POST /api/jobs/github-weekly.)
        if want_insight:
            try:
                from insight import generate_per_item_insights
                digest["insight_stats"] = generate_per_item_insights(digest)
            except Exception as e:
                logger.warning(f"Per-item Lenovo insight failed: {e}")
                digest["insight_stats"] = {"used": False, "error": str(e)}

    # Mark the insight edition so the email body title shows a 【联想视角】 badge.
    if with_insight:
        digest["edition_badge"] = "联想视角"

    if dry_run:
        return {"dry_run": True, "digest": digest}

    # Distinct subject AND sender name so the insight edition doesn't look
    # identical to the plain digest in Outlook's list / conversation view.
    if with_insight:
        subject_prefix, from_name = "[AI News · 联想视角]", "AI News · 联想视角"
    else:
        subject_prefix, from_name = "[AI News Digest]", "AI News Digest"

    if no_email:
        # Lark-only test run: build everything, push to Lark, send no mail.
        result = {"sent": False, "recipients": [], "error": None, "skipped": "no_email=true"}
    else:
        result = send_digest(
            digest=digest,
            smtp_user=SMTP_USER,
            smtp_password=SMTP_PASSWORD,
            recipient=DIGEST_RECIPIENT,
            subject_prefix=subject_prefix,
            from_name=from_name,
        )

    # Also post to Lark when a webhook is configured. Never let a Lark failure
    # affect the email result — the email is the primary channel.
    lark_result = {"sent": False, "error": "LARK_WEBHOOK not configured"}
    try:
        from config import LARK_WEBHOOK
        if LARK_WEBHOOK and not skip_lark:
            from lark_client import send_digest_to_lark
            now_bj = datetime.now(timezone(timedelta(hours=8)))
            card_title = (
                f"AI 日报 · 联想视角 {now_bj.strftime('%m-%d')}" if with_insight
                else f"AI 日报 {now_bj.strftime('%m-%d')}"
            )
            lark_result = send_digest_to_lark(LARK_WEBHOOK, digest, card_title)
    except Exception as e:
        logger.warning(f"Lark posting failed: {e}")
        lark_result = {"sent": False, "error": f"{type(e).__name__}: {e}"}

    # Health self-check: if every LLM call failed, the digest silently degrades
    # to raw RSS text (no translation, no summaries, no classification). That
    # is easy to miss, so alert to Lark. Typical cause: expired/blocked API key
    # or exhausted quota.
    try:
        _alert_lark_on_degraded(digest, with_insight)
    except Exception as e:
        logger.warning(f"Degradation alert failed: {e}")

    return {
        "dry_run": False,
        "total": digest.get("total", 0),
        "window_hours": digest.get("window_hours", hours),
        "raw_total": digest.get("raw_total"),
        "unique_total": digest.get("unique_total"),
        "classifier_stats": digest.get("classifier_stats"),
        "dedup_stats": digest.get("dedup_stats"),
        "summary_stats": digest.get("summary_stats"),
        "lark": lark_result,
        "email": result,
        "counts_by_category": {k: len(v) for k, v in digest.get("by_category", {}).items()},
    }


@app.post("/api/jobs/github-weekly")
async def api_jobs_github_weekly(
    authorization: str | None = Header(default=None),
    limit: int = Query(5, ge=1, le=15, description="How many top repos to include"),
    dry_run: bool = Query(False, description="Build + return the report, do not email"),
    skip_enrich: bool = Query(False, description="Skip README fetch + LLM detail (faster preview)"),
    skip_lark: bool = Query(False, description="Do not post to Lark even if LARK_WEBHOOK is set"),
    no_email: bool = Query(False, description="Skip the email send — useful for Lark-only testing"),
):
    """
    Weekly GitHub AI trending report.

    Scrapes github.com/trending?since=weekly (ranked by stars gained this week
    — the real velocity metric), keeps AI-relevant repos, and for each fetches
    a README excerpt + generates a detailed Chinese intro. Sends a standalone
    weekly email (separate from the daily digest).

    Invoked by .github/workflows/weekly-github.yml (Mondays 08:30 Beijing).
    """
    _require_job_token(authorization)

    from github_weekly import build_weekly_report
    from email_sender import send_github_weekly

    report = build_weekly_report(limit=limit, enrich=not skip_enrich)

    if dry_run:
        return {"dry_run": True, "report": report}

    if no_email:
        # Lark-only test run: build everything, push to Lark, send no mail.
        result = {"sent": False, "recipients": [], "error": None, "skipped": "no_email=true"}
    else:
        result = send_github_weekly(
            report=report,
            smtp_user=SMTP_USER,
            smtp_password=SMTP_PASSWORD,
            recipient=DIGEST_RECIPIENT,
        )

    # Also post to Lark when a webhook is configured. A Lark failure never
    # affects the email result — email is the primary channel.
    lark_result = {"sent": False, "error": "LARK_WEBHOOK not configured"}
    try:
        from config import LARK_WEBHOOK
        if LARK_WEBHOOK and not skip_lark:
            from lark_client import send_weekly_to_lark
            card_title = f"GitHub AI 周报 · {report.get('week_label', '')}"
            lark_result = send_weekly_to_lark(LARK_WEBHOOK, report, card_title)
    except Exception as e:
        logger.warning(f"Lark posting failed: {e}")
        lark_result = {"sent": False, "error": f"{type(e).__name__}: {e}"}

    return {
        "dry_run": False,
        "week_label": report.get("week_label"),
        "repo_count": len(report.get("repos", [])),
        "lark": lark_result,
        "email": result,
    }


@app.get("/api/jobs/debug/llm")
async def api_jobs_debug_llm(authorization: str | None = Header(default=None)):
    """Ping the configured LLM with a short prompt and report full error trace."""
    _require_job_token(authorization)
    import traceback
    from config import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL
    result = {
        "api_key_set": bool(LLM_API_KEY),
        "api_key_prefix": (LLM_API_KEY[:8] + "..." + LLM_API_KEY[-4:]) if LLM_API_KEY else None,
        "base_url": LLM_BASE_URL,
        "model": LLM_MODEL,
    }
    try:
        from openai import OpenAI
        client = OpenAI(api_key=LLM_API_KEY, base_url=LLM_BASE_URL, timeout=30)
        # Cycle through fallbacks: gpt-5.x style + custom temp ↓ legacy +
        # default temp. Same logic as ai_summarizer._call_llm.
        def _try(with_temp: bool, with_mc: bool):
            kw = dict(model=LLM_MODEL, messages=[{"role": "user", "content": "Reply with exactly: pong"}])
            if with_temp:
                kw["temperature"] = 0
            if with_mc:
                return client.chat.completions.create(max_completion_tokens=10, **kw)
            return client.chat.completions.create(max_tokens=10, **kw)

        resp = None
        last_err = None
        for with_temp, with_mc in [(True, True), (True, False), (False, True), (False, False)]:
            try:
                resp = _try(with_temp, with_mc)
                break
            except Exception as e:
                msg = str(e).lower()
                if "max_completion_tokens" in msg or "max_tokens" in msg or "temperature" in msg:
                    last_err = e
                    continue
                raise
        if resp is None:
            raise last_err or Exception("All LLM fallbacks exhausted")
        result["response_content"] = resp.choices[0].message.content
        result["finish_reason"] = resp.choices[0].finish_reason
        result["usage"] = resp.usage.model_dump() if resp.usage else None
        result["ok"] = True
    except Exception as e:
        result["ok"] = False
        result["error"] = f"{type(e).__name__}: {e}"
        result["traceback"] = traceback.format_exc()
    return result


@app.get("/api/jobs/debug/fetch")
async def api_jobs_debug_fetch(
    url: str = Query(..., description="URL to fetch (not resolved)"),
    authorization: str | None = Header(default=None),
):
    """Fetch a URL and return status + first 4k chars of HTML. Bypasses extraction."""
    _require_job_token(authorization)
    import requests as _requests
    from ai_summarizer import BROWSER_HEADERS
    try:
        r = _requests.get(url, allow_redirects=True, timeout=30, headers=BROWSER_HEADERS)
        return {
            "url": url,
            "final_url": r.url,
            "http_status": r.status_code,
            "headers": dict(r.headers),
            "html_size": len(r.text),
            "html_preview": r.text[:4000],
        }
    except Exception as e:
        return {"url": url, "error": f"{type(e).__name__}: {e}"}


@app.get("/api/jobs/debug/summarize")
async def api_jobs_debug_summarize(
    url: str = Query(..., description="Google News RSS URL or direct article URL"),
    authorization: str | None = Header(default=None),
    lang: str = Query("en", description="Article language (en|zh) for LLM prompt"),
    call_llm: bool = Query(False, description="Actually call the LLM (costs tokens)"),
):
    """
    Per-URL diagnostic for the digest summarization pipeline.

    Runs resolve_article_url → fetch_article_text (with per-step diagnostics)
    → optionally summarize_article, and returns the full trace so we can
    debug why a given article is falling back to RSS.
    """
    _require_job_token(authorization)

    trace: dict = {"input_url": url}

    # Step 1: resolve Google News
    resolved = resolve_article_url(url)
    trace["resolved_url"] = resolved
    trace["resolved_is_google"] = bool(resolved and "news.google.com" in resolved)

    if not resolved or "news.google.com" in resolved:
        trace["status"] = "resolve_failed"
        return trace

    # Step 2: fetch + extract (with debug diagnostics)
    fetch_result = fetch_article_text(resolved, debug=True)
    trace["fetch"] = fetch_result

    if not isinstance(fetch_result, dict) or not fetch_result.get("ok"):
        trace["status"] = "extract_failed"
        return trace

    # Step 3: LLM summary (optional — costs tokens)
    article_text = (fetch_result.get("extracted_preview") or "")  # just to show
    # Re-fetch the full text (debug=False returns the truncated string)
    full_text = fetch_article_text(resolved, debug=False)
    if call_llm and full_text:
        summary = summarize_article("(title not provided)", full_text, "unknown", lang)
        trace["llm_summary"] = summary or "(LLM returned empty)"
    trace["status"] = "ok"
    return trace


# ── Run ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=int(PORT), reload=True)
