"""
CFO Control Tower — FastAPI Backend
Serves dashboard data + AI chat with LLM integration.
"""
import json
import logging

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from config import HOST, PORT, CORS_ORIGINS
from models import FilterState, ChatRequest
from mock_data import (
    get_opening_data,
    get_secondary_data,
    get_tertiary_data,
    QUARTERS, BUSINESS_GROUPS, GEOGRAPHIES,
)
from llm_agent import chat, chat_stream

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


# ── Run ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=int(PORT), reload=True)
