"""
CFO Control Tower — FastAPI Backend
Serves dashboard data + AI chat with LLM integration.
"""
import json
import logging

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

    digest = fetch_and_select(hours=hours)

    if not skip_summary:
        summarize_batch(digest)

    if dry_run:
        return {"dry_run": True, "digest": digest}

    result = send_digest(
        digest=digest,
        smtp_user=SMTP_USER,
        smtp_password=SMTP_PASSWORD,
        recipient=DIGEST_RECIPIENT,
    )
    return {
        "dry_run": False,
        "total": digest.get("total", 0),
        "window_hours": digest.get("window_hours", hours),
        "raw_total": digest.get("raw_total"),
        "unique_total": digest.get("unique_total"),
        "summary_stats": digest.get("summary_stats"),
        "email": result,
        "counts_by_category": {k: len(v) for k, v in digest.get("by_category", {}).items()},
    }


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
