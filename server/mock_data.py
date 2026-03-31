"""
Mock data — mirrors frontend mock-opening / mock-secondary / mock-tertiary / mock-external.
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


# ── Supply Chain Data ───────────────────────────────────────────────
_suppliers = [
    {"name": "Intel", "category": "CPU", "leadTimeDays": 28, "leadTimeChange": -3, "priceIndex": 95, "priceIndexChange": -2.1, "riskLevel": "low", "affectedBGs": ["IDG", "ISG"], "region": "NA"},
    {"name": "AMD", "category": "CPU/GPU", "leadTimeDays": 32, "leadTimeChange": -2, "priceIndex": 102, "priceIndexChange": 1.5, "riskLevel": "low", "affectedBGs": ["IDG", "ISG"], "region": "NA"},
    {"name": "NVIDIA", "category": "GPU/AI Accelerator", "leadTimeDays": 45, "leadTimeChange": 5, "priceIndex": 118, "priceIndexChange": 8.2, "riskLevel": "high", "affectedBGs": ["ISG", "SSG"], "region": "NA"},
    {"name": "Samsung", "category": "Memory/SSD", "leadTimeDays": 21, "leadTimeChange": -1, "priceIndex": 112, "priceIndexChange": 6.3, "riskLevel": "medium", "affectedBGs": ["IDG", "ISG"], "region": "AP"},
    {"name": "SK Hynix", "category": "Memory/HBM", "leadTimeDays": 25, "leadTimeChange": 3, "priceIndex": 125, "priceIndexChange": 12.5, "riskLevel": "high", "affectedBGs": ["ISG"], "region": "AP"},
    {"name": "TSMC", "category": "Foundry", "leadTimeDays": 56, "leadTimeChange": -8, "priceIndex": 105, "priceIndexChange": 2.0, "riskLevel": "medium", "affectedBGs": ["IDG", "ISG", "SSG"], "region": "AP"},
    {"name": "BOE", "category": "Display Panel", "leadTimeDays": 18, "leadTimeChange": -2, "priceIndex": 88, "priceIndexChange": -5.4, "riskLevel": "low", "affectedBGs": ["IDG"], "region": "PRC"},
    {"name": "LG Display", "category": "Display Panel", "leadTimeDays": 22, "leadTimeChange": 0, "priceIndex": 92, "priceIndexChange": -3.1, "riskLevel": "low", "affectedBGs": ["IDG"], "region": "AP"},
    {"name": "Foxconn", "category": "Assembly/ODM", "leadTimeDays": 14, "leadTimeChange": -1, "priceIndex": 103, "priceIndexChange": 1.8, "riskLevel": "low", "affectedBGs": ["IDG"], "region": "PRC"},
    {"name": "Broadcom", "category": "Networking", "leadTimeDays": 35, "leadTimeChange": 2, "priceIndex": 108, "priceIndexChange": 3.5, "riskLevel": "medium", "affectedBGs": ["ISG"], "region": "NA"},
]

_component_price_series = {
    "CPU (x86)":          [100, 98, 96, 95, 94, 93, 95, 96, 95],
    "GPU/AI Accelerator": [100, 102, 108, 112, 115, 118, 122, 125, 118],
    "DRAM":               [100, 95, 92, 98, 105, 108, 112, 115, 112],
    "NAND/SSD":           [100, 96, 90, 88, 92, 96, 100, 104, 100],
    "Display Panel":      [100, 98, 95, 92, 90, 88, 86, 85, 88],
    "HBM":                [100, 105, 112, 120, 128, 135, 140, 145, 125],
}


def get_supply_chain_data(filters: FilterState) -> dict:
    """Supply chain: suppliers, component cost trends, summary."""
    q = _period_to_quarter(filters.quarter)
    qi = QUARTERS.index(q) if q in QUARTERS else 8
    bg_filter = filters.selectedBGs

    suppliers = [s for s in _suppliers]
    if bg_filter:
        suppliers = [s for s in suppliers if any(bg in bg_filter for bg in s["affectedBGs"])]

    # Vary slightly by quarter
    suppliers = [{**s,
        "leadTimeDays": s["leadTimeDays"] + round((qi - 8) * 0.5),
        "priceIndex": s["priceIndex"] + round((qi - 8) * 0.3),
    } for s in suppliers]

    # Component cost trends
    start = max(0, qi - 4)
    quarters = QUARTERS[start:qi + 1]
    component_costs = []
    for comp, series in _component_price_series.items():
        component_costs.append({
            "component": comp,
            "quarters": quarters,
            "priceIndex": [series[start + i] if (start + i) < len(series) else 100 for i in range(len(quarters))],
        })

    # Summary
    avg_lead = round(sum(s["leadTimeDays"] for s in suppliers) / len(suppliers)) if suppliers else 0
    avg_lead_chg = round(sum(s["leadTimeChange"] for s in suppliers) / len(suppliers), 1) if suppliers else 0
    high_risk = sum(1 for s in suppliers if s["riskLevel"] == "high")
    avg_cost = round(sum(s["priceIndex"] for s in suppliers) / len(suppliers)) if suppliers else 100
    avg_cost_chg = round(sum(s["priceIndexChange"] for s in suppliers) / len(suppliers), 1) if suppliers else 0

    return {
        "suppliers": suppliers,
        "componentCosts": component_costs,
        "summary": {
            "avgLeadTimeDays": avg_lead,
            "avgLeadTimeChange": avg_lead_chg,
            "highRiskCount": high_risk,
            "overallCostIndex": avg_cost,
            "overallCostChange": avg_cost_chg,
        },
    }


# ── Peer / Competitor Data ──────────────────────────────────────────
_peers = [
    {"name": "HP Inc.", "segment": "PC", "matchesBG": "IDG", "quarterlyRevenue": 13800, "revenueGrowthYoY": 3.2, "grossMargin": 21.5, "operatingMargin": 8.8, "marketShare": 20.8, "marketShareChange": -0.5},
    {"name": "Dell Technologies", "segment": "PC", "matchesBG": "IDG", "quarterlyRevenue": 12200, "revenueGrowthYoY": 2.8, "grossMargin": 22.0, "operatingMargin": 6.5, "marketShare": 16.2, "marketShareChange": -0.3},
    {"name": "Apple", "segment": "PC", "matchesBG": "IDG", "quarterlyRevenue": 7800, "revenueGrowthYoY": 4.5, "grossMargin": 38.2, "operatingMargin": 30.1, "marketShare": 8.5, "marketShareChange": 0.2},
    {"name": "ASUS", "segment": "PC", "matchesBG": "IDG", "quarterlyRevenue": 3600, "revenueGrowthYoY": 5.2, "grossMargin": 15.8, "operatingMargin": 5.2, "marketShare": 7.1, "marketShareChange": 0.3},
    {"name": "Dell Technologies", "segment": "Server/ISG", "matchesBG": "ISG", "quarterlyRevenue": 11500, "revenueGrowthYoY": 12.5, "grossMargin": 32.0, "operatingMargin": 11.2, "marketShare": 31.5, "marketShareChange": 0.8},
    {"name": "HPE", "segment": "Server/ISG", "matchesBG": "ISG", "quarterlyRevenue": 7200, "revenueGrowthYoY": 8.3, "grossMargin": 34.5, "operatingMargin": 10.5, "marketShare": 15.2, "marketShareChange": -0.4},
    {"name": "Inspur", "segment": "Server/ISG", "matchesBG": "ISG", "quarterlyRevenue": 4200, "revenueGrowthYoY": 15.8, "grossMargin": 12.5, "operatingMargin": 3.8, "marketShare": 10.8, "marketShareChange": 1.2},
    {"name": "Accenture", "segment": "IT Services", "matchesBG": "SSG", "quarterlyRevenue": 16200, "revenueGrowthYoY": 6.5, "grossMargin": 33.0, "operatingMargin": 15.8, "marketShare": 5.2, "marketShareChange": 0.1},
    {"name": "IBM", "segment": "IT Services", "matchesBG": "SSG", "quarterlyRevenue": 4500, "revenueGrowthYoY": 3.2, "grossMargin": 56.5, "operatingMargin": 18.2, "marketShare": 3.8, "marketShareChange": -0.1},
]

_market_segments = [
    {"segment": "Global PC", "totalMarketSizeB": 62.5, "growthRate": 3.8, "lenovoRevenueM": 14200, "lenovoShare": 23.5, "lenovoShareChange": 0.6,
     "topPlayers": [{"name": "Lenovo", "share": 23.5}, {"name": "HP", "share": 20.8}, {"name": "Dell", "share": 16.2}, {"name": "Apple", "share": 8.5}, {"name": "ASUS", "share": 7.1}]},
    {"segment": "Server & Infrastructure", "totalMarketSizeB": 32.8, "growthRate": 14.2, "lenovoRevenueM": 3400, "lenovoShare": 6.2, "lenovoShareChange": 0.5,
     "topPlayers": [{"name": "Dell", "share": 31.5}, {"name": "HPE", "share": 15.2}, {"name": "Inspur", "share": 10.8}, {"name": "Lenovo", "share": 6.2}, {"name": "Supermicro", "share": 5.8}]},
    {"segment": "IT Services & Solutions", "totalMarketSizeB": 120.0, "growthRate": 7.5, "lenovoRevenueM": 1800, "lenovoShare": 1.5, "lenovoShareChange": 0.3,
     "topPlayers": [{"name": "Accenture", "share": 5.2}, {"name": "IBM", "share": 3.8}, {"name": "TCS", "share": 3.2}, {"name": "Infosys", "share": 2.8}, {"name": "Lenovo SSG", "share": 1.5}]},
]


def get_peer_data(filters: FilterState) -> dict:
    """Peer benchmarking: competitor financials and market segments.
    Tries yfinance first, falls back to mock data."""
    from external_data import fetch_peer_financials

    real_data = fetch_peer_financials()
    if real_data:
        companies = real_data
        source = "yfinance"
    else:
        companies = _peers[:]
        source = "mock"

    if filters.selectedBGs:
        companies = [c for c in companies if c["matchesBG"] in filters.selectedBGs]

    return {"companies": companies, "markets": _market_segments, "dataSource": source}


# ── Macro Economic Data ─────────────────────────────────────────────
_macro_indicators = [
    {"name": "GDP Growth", "region": "Global", "value": 3.1, "unit": "%", "change": 0.2, "trend": "improving", "impactOnLenovo": "全球经济温和复苏，IT 支出增长预期上调", "affectedBGs": ["IDG", "ISG", "SSG"]},
    {"name": "GDP Growth", "region": "PRC", "value": 4.8, "unit": "%", "change": -0.3, "trend": "stable", "impactOnLenovo": "中国市场增速放缓，消费电子需求承压", "affectedBGs": ["IDG"]},
    {"name": "GDP Growth", "region": "NA", "value": 2.5, "unit": "%", "change": 0.3, "trend": "improving", "impactOnLenovo": "北美企业级 IT 更新需求回暖", "affectedBGs": ["ISG", "SSG"]},
    {"name": "GDP Growth", "region": "Europe", "value": 1.2, "unit": "%", "change": 0.1, "trend": "stable", "impactOnLenovo": "欧洲经济低增长，但数字化转型投资持续", "affectedBGs": ["ISG", "SSG"]},
    {"name": "PMI (Manufacturing)", "region": "Global", "value": 52.3, "unit": "", "change": 1.1, "trend": "improving", "impactOnLenovo": "PMI 回升至扩张区间，企业采购意愿增强", "affectedBGs": ["IDG", "ISG"]},
    {"name": "IT Spending Growth", "region": "Global", "value": 8.6, "unit": "%", "change": 1.5, "trend": "improving", "impactOnLenovo": "AI 驱动 IT 支出加速增长，服务器需求旺盛", "affectedBGs": ["ISG", "SSG"]},
    {"name": "Consumer Confidence", "region": "PRC", "value": 88.5, "unit": "", "change": -2.1, "trend": "deteriorating", "impactOnLenovo": "消费者信心下降，PC 消费升级放缓", "affectedBGs": ["IDG"]},
    {"name": "Consumer Confidence", "region": "NA", "value": 105.2, "unit": "", "change": 3.5, "trend": "improving", "impactOnLenovo": "北美消费信心走强，有利于高端 PC 销售", "affectedBGs": ["IDG"]},
    {"name": "Inflation Rate", "region": "Global", "value": 3.2, "unit": "%", "change": -0.5, "trend": "improving", "impactOnLenovo": "通胀缓和，运营成本压力减轻", "affectedBGs": ["IDG", "ISG", "SSG"]},
    {"name": "AI Infrastructure Index", "region": "Global", "value": 145, "unit": "", "change": 18, "trend": "improving", "impactOnLenovo": "AI 基础设施需求指数持续走高，ISG 受益明显", "affectedBGs": ["ISG", "SSG"]},
]

_currency_impact = [
    {"pair": "USD/CNY", "rate": 7.25, "changeYoY": 2.1, "revenueImpactM": -180},
    {"pair": "USD/EUR", "rate": 0.92, "changeYoY": -1.5, "revenueImpactM": 85},
    {"pair": "USD/JPY", "rate": 152.3, "changeYoY": 5.8, "revenueImpactM": -45},
    {"pair": "USD/BRL", "rate": 5.15, "changeYoY": 3.2, "revenueImpactM": -30},
]

_it_spending_base = [280, 275, 295, 310, 290, 285, 305, 325, 300]


def get_macro_data(filters: FilterState) -> dict:
    """Macro economics: indicators, FX impact, IT spending forecast.
    Tries fredapi + yfinance first, falls back to mock data."""
    from external_data import fetch_macro_indicators, fetch_fx_rates

    q = _period_to_quarter(filters.quarter)
    qi = QUARTERS.index(q) if q in QUARTERS else 8
    start = max(0, qi - 4)
    quarters = QUARTERS[start:qi + 1]

    # Indicators: try FRED first
    real_indicators = fetch_macro_indicators()
    if real_indicators:
        indicators = real_indicators
        indicator_source = "FRED"
    else:
        indicators = _macro_indicators[:]
        indicator_source = "mock"

    if filters.selectedBGs:
        indicators = [ind for ind in indicators if any(bg in filters.selectedBGs for bg in ind["affectedBGs"])]

    # FX: try yfinance first
    real_fx = fetch_fx_rates()
    if real_fx:
        currency_impact = real_fx
        fx_source = "yfinance"
    else:
        currency_impact = _currency_impact
        fx_source = "mock"

    it_spending = {
        "quarters": quarters,
        "globalB": [_it_spending_base[start + i] if (start + i) < len(_it_spending_base) else 300 for i in range(len(quarters))],
        "enterpriseB": [round((_it_spending_base[start + i] if (start + i) < len(_it_spending_base) else 300) * 0.65) for i in range(len(quarters))],
        "consumerB": [round((_it_spending_base[start + i] if (start + i) < len(_it_spending_base) else 300) * 0.35) for i in range(len(quarters))],
    }

    return {
        "indicators": indicators,
        "currencyImpact": currency_impact,
        "itSpendingForecast": it_spending,
        "dataSource": {"indicators": indicator_source, "fx": fx_source},
    }
