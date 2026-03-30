"""
Mock data — mirrors frontend mock-opening / mock-secondary / mock-tertiary.
When connecting to real databases, replace these functions with actual queries.
"""
from __future__ import annotations
from models import FilterState, QuarterlyMetrics, MetricDataPoint, OperatingMetrics, BGBreakdown

QUARTERS = [
    "FY24Q1", "FY24Q2", "FY24Q3", "FY24Q4",
    "FY25Q1", "FY25Q2", "FY25Q3", "FY25Q4",
    "FY26Q1",
]

BUSINESS_GROUPS = ["IDG", "ISG", "SSG"]
GEOGRAPHIES = ["AP", "NA", "LA", "Europe", "Meta", "PRC"]

M = 1_000_000

# ── Opening (quarterly KPIs) ─────────────────────────────────────────
_base_metrics = {
    "FY24Q1": {"rev": 14200, "gp": 4970, "gpPct": 35.0, "oi": 1420, "ni": 1065},
    "FY24Q2": {"rev": 13800, "gp": 4830, "gpPct": 35.0, "oi": 1380, "ni": 1035},
    "FY24Q3": {"rev": 15100, "gp": 5435, "gpPct": 36.0, "oi": 1662, "ni": 1247},
    "FY24Q4": {"rev": 17800, "gp": 6408, "gpPct": 36.0, "oi": 2136, "ni": 1602},
    "FY25Q1": {"rev": 15600, "gp": 5616, "gpPct": 36.0, "oi": 1716, "ni": 1287},
    "FY25Q2": {"rev": 15200, "gp": 5472, "gpPct": 36.0, "oi": 1672, "ni": 1254},
    "FY25Q3": {"rev": 16800, "gp": 6216, "gpPct": 37.0, "oi": 1932, "ni": 1449},
    "FY25Q4": {"rev": 19200, "gp": 7104, "gpPct": 37.0, "oi": 2304, "ni": 1728},
    "FY26Q1": {"rev": 17200, "gp": 6364, "gpPct": 37.0, "oi": 2064, "ni": 1548},
}


def _period_to_quarter(period: str) -> str:
    return period if period in QUARTERS else "FY26Q1"


def _scale(filters: FilterState) -> float:
    bg_factor = (len(filters.selectedBGs) or 3) / 3
    geo_factor = (len(filters.selectedGeos) or 6) / 6
    return bg_factor * geo_factor


def get_opening_data(filters: FilterState) -> QuarterlyMetrics:
    q = _period_to_quarter(filters.quarter)
    b = _base_metrics.get(q, _base_metrics["FY25Q3"])
    s = _scale(filters)
    qi = QUARTERS.index(q) if q in QUARTERS else 6
    prev_q = QUARTERS[max(0, qi - 1)]
    pb = _base_metrics.get(prev_q, _base_metrics["FY24Q3"])

    rev = round(b["rev"] * s * M)
    gp = round(b["gp"] * s * M)
    oi = round(b["oi"] * s * M)
    ni = round(b["ni"] * s * M)

    return QuarterlyMetrics(
        revenues=MetricDataPoint(period=q, actual=rev, budget=round(rev * 1.02), priorYear=round(pb["rev"] * s * M * 0.92)),
        grossProfit=MetricDataPoint(period=q, actual=gp, budget=round(gp * 1.01), priorYear=round(pb["gp"] * s * M * 0.92)),
        grossProfitPct=MetricDataPoint(period=q, actual=b["gpPct"], budget=b["gpPct"] - 0.5, priorYear=b["gpPct"] - 1.2),
        operatingIncome=MetricDataPoint(period=q, actual=oi, budget=round(oi * 1.03), priorYear=round(pb["oi"] * s * M * 0.90)),
        netIncome=MetricDataPoint(period=q, actual=ni, budget=round(ni * 1.02), priorYear=round(pb["ni"] * s * M * 0.90)),
        bloombergConsensusRevenues=round(rev * 0.98),
        bloombergConsensusNetIncome=round(ni * 0.97),
    )


# ── Secondary (operating metrics) ────────────────────────────────────
_ops_base: dict[str, dict] = {
    "FY24Q1": {"pipeline": 28000, "backlog": 12500, "revenues": 14200, "cogs": 9230, "grossProfit": 4970, "smExpense": 1200, "rdExpense": 1100, "fixedExpense": 1250, "inventory": 8500, "woiIdg": 42, "ar": 6800, "ap": 5200, "cccUnfunded": 38},
    "FY24Q2": {"pipeline": 27200, "backlog": 12000, "revenues": 13800, "cogs": 8970, "grossProfit": 4830, "smExpense": 1180, "rdExpense": 1080, "fixedExpense": 1190, "inventory": 8200, "woiIdg": 40, "ar": 6600, "ap": 5100, "cccUnfunded": 36},
    "FY24Q3": {"pipeline": 30500, "backlog": 13200, "revenues": 15100, "cogs": 9665, "grossProfit": 5435, "smExpense": 1260, "rdExpense": 1150, "fixedExpense": 1363, "inventory": 8800, "woiIdg": 44, "ar": 7200, "ap": 5500, "cccUnfunded": 40},
    "FY24Q4": {"pipeline": 34000, "backlog": 15000, "revenues": 17800, "cogs": 11392, "grossProfit": 6408, "smExpense": 1420, "rdExpense": 1300, "fixedExpense": 1552, "inventory": 9500, "woiIdg": 48, "ar": 8500, "ap": 6300, "cccUnfunded": 42},
    "FY25Q1": {"pipeline": 31000, "backlog": 13500, "revenues": 15600, "cogs": 9984, "grossProfit": 5616, "smExpense": 1300, "rdExpense": 1200, "fixedExpense": 1400, "inventory": 8900, "woiIdg": 43, "ar": 7400, "ap": 5600, "cccUnfunded": 39},
    "FY25Q2": {"pipeline": 30200, "backlog": 13000, "revenues": 15200, "cogs": 9728, "grossProfit": 5472, "smExpense": 1280, "rdExpense": 1180, "fixedExpense": 1340, "inventory": 8600, "woiIdg": 41, "ar": 7200, "ap": 5500, "cccUnfunded": 37},
    "FY25Q3": {"pipeline": 33500, "backlog": 14500, "revenues": 16800, "cogs": 10584, "grossProfit": 6216, "smExpense": 1380, "rdExpense": 1280, "fixedExpense": 1626, "inventory": 9200, "woiIdg": 46, "ar": 8000, "ap": 6000, "cccUnfunded": 41},
    "FY25Q4": {"pipeline": 37000, "backlog": 16500, "revenues": 19200, "cogs": 12096, "grossProfit": 7104, "smExpense": 1520, "rdExpense": 1400, "fixedExpense": 1880, "inventory": 10000, "woiIdg": 50, "ar": 9200, "ap": 6800, "cccUnfunded": 44},
    "FY26Q1": {"pipeline": 34200, "backlog": 14800, "revenues": 17200, "cogs": 10836, "grossProfit": 6364, "smExpense": 1380, "rdExpense": 1280, "fixedExpense": 1640, "inventory": 9400, "woiIdg": 45, "ar": 8200, "ap": 6100, "cccUnfunded": 40},
}


def get_secondary_data(filters: FilterState) -> list[OperatingMetrics]:
    q = _period_to_quarter(filters.quarter)
    qi = QUARTERS.index(q) if q in QUARTERS else 8
    start = max(0, qi - 4)
    s = _scale(filters)
    result = []
    for i in range(start, qi + 1):
        qn = QUARTERS[i]
        d = _ops_base.get(qn, _ops_base["FY25Q3"])
        result.append(OperatingMetrics(
            period=qn,
            pipeline=round(d["pipeline"] * s * M),
            backlog=round(d["backlog"] * s * M),
            revenues=round(d["revenues"] * s * M),
            cogs=round(d["cogs"] * s * M),
            grossProfit=round(d["grossProfit"] * s * M),
            smExpense=round(d["smExpense"] * s * M),
            rdExpense=round(d["rdExpense"] * s * M),
            fixedExpense=round(d["fixedExpense"] * s * M),
            inventory=round(d["inventory"] * s * M),
            woiIdg=d["woiIdg"],
            ar=round(d["ar"] * s * M),
            ap=round(d["ap"] * s * M),
            cccUnfunded=d["cccUnfunded"],
        ))
    return result


# ── Tertiary (BG breakdown) ──────────────────────────────────────────
_bg_revenue_share = {"IDG": 0.62, "ISG": 0.28, "SSG": 0.10}
_bg_gp_pct = {"IDG": 0.27, "ISG": 0.42, "SSG": 0.55}
_bg_oi_pct = {"IDG": 0.06, "ISG": 0.10, "SSG": 0.20}
_geo_share = {"PRC": 0.25, "AP": 0.20, "NA": 0.22, "Europe": 0.20, "LA": 0.07, "Meta": 0.06}


def get_tertiary_data(filters: FilterState) -> list[BGBreakdown]:
    q = _period_to_quarter(filters.quarter)
    b = _base_metrics.get(q, _base_metrics["FY25Q3"])
    total_rev = b["rev"] * M
    bgs = filters.selectedBGs or BUSINESS_GROUPS
    geos = filters.selectedGeos or GEOGRAPHIES
    rows = []
    for bg in bgs:
        bg_rev = total_rev * _bg_revenue_share.get(bg, 0.33)
        gp_pct = _bg_gp_pct.get(bg, 0.30)
        oi_pct = _bg_oi_pct.get(bg, 0.08)
        for geo in geos:
            geo_s = _geo_share.get(geo, 0.15)
            rev = round(bg_rev * geo_s)
            gp = round(rev * gp_pct)
            oi = round(rev * oi_pct)
            rows.append(BGBreakdown(
                bg=bg, geo=geo, period=q,
                revenues=rev, grossProfit=gp,
                grossProfitPct=round(gp_pct * 100, 1),
                operatingIncome=oi,
            ))
    return rows
