"""Pydantic models — mirrors frontend TypeScript types"""
from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel


# ── Filters ──────────────────────────────────────────────────────────
class FilterState(BaseModel):
    timeGranularity: Literal["daily", "monthly", "quarterly"] = "quarterly"
    selectedBGs: list[str] = []
    selectedGeos: list[str] = []
    quarter: str = "FY26Q1"


# ── Dashboard Data ───────────────────────────────────────────────────
class MetricDataPoint(BaseModel):
    period: str
    actual: float
    budget: Optional[float] = None
    consensus: Optional[float] = None
    priorYear: Optional[float] = None


class QuarterlyMetrics(BaseModel):
    revenues: MetricDataPoint
    grossProfit: MetricDataPoint
    grossProfitPct: MetricDataPoint
    operatingIncome: MetricDataPoint
    netIncome: MetricDataPoint
    bloombergConsensusRevenues: float = 0
    bloombergConsensusNetIncome: float = 0


class OperatingMetrics(BaseModel):
    period: str
    pipeline: float
    backlog: float
    revenues: float
    cogs: float
    grossProfit: float
    smExpense: float
    rdExpense: float
    fixedExpense: float
    inventory: float
    woiIdg: float
    ar: float
    ap: float
    cccUnfunded: float


class BGBreakdown(BaseModel):
    bg: str
    geo: str
    period: str
    revenues: float
    grossProfit: float
    grossProfitPct: float
    operatingIncome: float


# ── AI Chat ──────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str
    filters: FilterState = FilterState()
    conversationHistory: list[ChatTurn] = []


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class MessageBlock(BaseModel):
    type: str  # text | chart | kpi_card | table | insight | source_tag
    # Each block type carries different payload — kept as dict for flexibility
    data: dict


class ChatResponse(BaseModel):
    text: str
    blocks: list[MessageBlock] = []

# Allow forward reference resolution
ChatRequest.model_rebuild()
