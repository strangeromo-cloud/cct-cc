"""
Global View Data Service — External environment data for CFO macro dashboard.

Dimensions:
  1. Macro & Capital Environment (FRED + yfinance)
     - US 10Y Treasury Yield
     - NASDAQ 100 P/E Ratio
     - DXY (US Dollar Index)
     - VIX (used as proxy for CVIX, which is paid)
     - EPU Index (Global Economic Policy Uncertainty)
  2. Upstream Cost & Supply Chain
     - Core Electronic Components Price Index (DRAM/NAND/LCD) — MOCK
     - Semiconductor Lead Time — MOCK
     - GSCPI (Global Supply Chain Pressure Index) — NY Fed CSV
  3. Competitive Landscape (reuses external_data.fetch_peer_financials)

All fetchers return None on failure; callers fall back to mock.
Responses include a `source` field: "FRED" | "yfinance" | "NY Fed" |
"PolicyUncertainty.com" | "Google News" | "mock".
"""
from __future__ import annotations
import csv
import io
import logging
import time
from datetime import datetime, timedelta
from typing import Any

logger = logging.getLogger(__name__)

# ── Separate cache namespace from external_data.py ─────────────────────
_cache: dict[str, tuple[float, Any]] = {}
CACHE_TTL_SHORT = 3600          # 1 hour for fast-moving data (stocks, news)
CACHE_TTL_LONG = 86400          # 24 hours for slow-moving data (monthly indexes)


def _get_cached(key: str, ttl: int = CACHE_TTL_SHORT) -> Any | None:
    if key in _cache:
        ts, val = _cache[key]
        if time.time() - ts < ttl:
            return val
        del _cache[key]
    return None


def _set_cached(key: str, val: Any) -> None:
    _cache[key] = (time.time(), val)


# ══════════════════════════════════════════════════════════════════════
#  Dimension 1: Macro & Capital Environment
# ══════════════════════════════════════════════════════════════════════

def fetch_treasury_10y_series(years: int = 5) -> dict | None:
    """US 10-Year Treasury Yield from FRED (DGS10)."""
    cache_key = f"treasury_10y_{years}y"
    cached = _get_cached(cache_key, CACHE_TTL_SHORT)
    if cached is not None:
        return cached

    try:
        from fredapi import Fred
        from config import FRED_API_KEY
        if not FRED_API_KEY:
            return None

        fred = Fred(api_key=FRED_API_KEY)
        start = (datetime.now() - timedelta(days=365 * years)).strftime("%Y-%m-%d")
        series = fred.get_series("DGS10", observation_start=start)
        series = series.dropna()

        # Downsample to monthly to reduce payload size
        monthly = series.resample("M").last().dropna()

        result = {
            "dates": [d.strftime("%Y-%m") for d in monthly.index],
            "values": [round(float(v), 2) for v in monthly.values],
            "source": "FRED",
            "seriesId": "DGS10",
            "unit": "%",
        }
        _set_cached(cache_key, result)
        logger.info(f"FRED: fetched 10Y Treasury, {len(monthly)} points")
        return result
    except Exception as e:
        logger.warning(f"fetch_treasury_10y_series failed: {e}")
        return None


def fetch_nasdaq_pe_series(years: int = 5) -> dict | None:
    """NASDAQ 100 P/E ratio from yfinance (approximation using ^NDX price/earnings)."""
    cache_key = f"nasdaq_pe_{years}y"
    cached = _get_cached(cache_key, CACHE_TTL_SHORT)
    if cached is not None:
        return cached

    try:
        import yfinance as yf

        # yfinance doesn't expose historical P/E directly.
        # Approach: fetch ^NDX price history + use current info.trailingPE as anchor
        # and estimate historical P/E based on price movement (assumes earnings grew linearly).
        # For production, use WSJ/Bloomberg actual P/E time series.
        ndx = yf.Ticker("^NDX")
        hist = ndx.history(period=f"{years}y", interval="1mo")
        if hist.empty:
            return None

        info = ndx.info
        current_pe = info.get("trailingPE") or 28.0  # NASDAQ 100 typical
        current_price = float(hist["Close"].iloc[-1])

        # Approximate historical P/E: scale by price ratio (simplistic model)
        dates = [d.strftime("%Y-%m") for d in hist.index]
        values = [round(current_pe * (float(p) / current_price), 1) for p in hist["Close"].values]

        result = {
            "dates": dates,
            "values": values,
            "source": "yfinance (approx)",
            "ticker": "^NDX",
            "unit": "x",
            "note": "P/E approximated from price history and current trailing P/E",
        }
        _set_cached(cache_key, result)
        logger.info(f"yfinance: fetched NASDAQ P/E approx, {len(values)} points")
        return result
    except Exception as e:
        logger.warning(f"fetch_nasdaq_pe_series failed: {e}")
        return None


def fetch_dxy_series(years: int = 5) -> dict | None:
    """US Dollar Index (DXY) from yfinance."""
    cache_key = f"dxy_{years}y"
    cached = _get_cached(cache_key, CACHE_TTL_SHORT)
    if cached is not None:
        return cached

    try:
        import yfinance as yf
        dxy = yf.Ticker("DX-Y.NYB")
        hist = dxy.history(period=f"{years}y", interval="1mo")
        if hist.empty:
            return None

        result = {
            "dates": [d.strftime("%Y-%m") for d in hist.index],
            "values": [round(float(v), 2) for v in hist["Close"].values],
            "source": "yfinance",
            "ticker": "DX-Y.NYB",
            "unit": "",
        }
        _set_cached(cache_key, result)
        logger.info(f"yfinance: fetched DXY, {len(hist)} points")
        return result
    except Exception as e:
        logger.warning(f"fetch_dxy_series failed: {e}")
        return None


def fetch_vix_series(years: int = 5) -> dict | None:
    """VIX volatility index from yfinance (proxy for CVIX which requires DB subscription)."""
    cache_key = f"vix_{years}y"
    cached = _get_cached(cache_key, CACHE_TTL_SHORT)
    if cached is not None:
        return cached

    try:
        import yfinance as yf
        vix = yf.Ticker("^VIX")
        hist = vix.history(period=f"{years}y", interval="1mo")
        if hist.empty:
            return None

        result = {
            "dates": [d.strftime("%Y-%m") for d in hist.index],
            "values": [round(float(v), 2) for v in hist["Close"].values],
            "source": "yfinance",
            "ticker": "^VIX",
            "unit": "",
            "note": "VIX used as proxy for CVIX (Deutsche Bank CVIX requires paid subscription)",
        }
        _set_cached(cache_key, result)
        logger.info(f"yfinance: fetched VIX, {len(hist)} points")
        return result
    except Exception as e:
        logger.warning(f"fetch_vix_series failed: {e}")
        return None


def fetch_epu_series(years: int = 5) -> dict | None:
    """
    Global Economic Policy Uncertainty Index from policyuncertainty.com.
    Downloads Excel and extracts the Global EPU series.
    """
    cache_key = f"epu_{years}y"
    cached = _get_cached(cache_key, CACHE_TTL_LONG)
    if cached is not None:
        return cached

    try:
        import requests
        import pandas as pd

        url = "https://www.policyuncertainty.com/media/Global_Policy_Uncertainty_Data.xlsx"
        response = requests.get(url, timeout=20)
        response.raise_for_status()

        df = pd.read_excel(io.BytesIO(response.content))
        # Find GEPU column (try multiple possible names)
        value_col = None
        for col in df.columns:
            if "GEPU" in str(col).upper() or "PPP" in str(col).upper():
                value_col = col
                break
        if value_col is None:
            # Fallback: last numeric column
            for col in df.columns[::-1]:
                if pd.api.types.is_numeric_dtype(df[col]):
                    value_col = col
                    break
        if value_col is None:
            return None

        # Year/Month columns
        year_col = "Year" if "Year" in df.columns else df.columns[0]
        month_col = "Month" if "Month" in df.columns else df.columns[1]

        df = df.dropna(subset=[year_col, month_col, value_col])
        df["date"] = pd.to_datetime(
            df[year_col].astype(int).astype(str) + "-" + df[month_col].astype(int).astype(str).str.zfill(2)
        )
        cutoff = datetime.now() - timedelta(days=365 * years)
        df = df[df["date"] >= cutoff].sort_values("date")

        result = {
            "dates": [d.strftime("%Y-%m") for d in df["date"]],
            "values": [round(float(v), 1) for v in df[value_col]],
            "source": "PolicyUncertainty.com",
            "unit": "",
            "note": f"Global Economic Policy Uncertainty Index (column: {value_col})",
        }
        _set_cached(cache_key, result)
        logger.info(f"EPU: fetched {len(df)} points from policyuncertainty.com")
        return result
    except Exception as e:
        logger.warning(f"fetch_epu_series failed: {e}")
        return None


# ══════════════════════════════════════════════════════════════════════
#  Dimension 2: Upstream Cost & Supply Chain
# ══════════════════════════════════════════════════════════════════════

def fetch_gscpi_series(years: int = 5) -> dict | None:
    """
    Global Supply Chain Pressure Index from NY Fed.
    Official source: https://www.newyorkfed.org/research/policy/gscpi

    Note: NY Fed serves the file as a legacy .xls (OLE/CFB) even though the
    URL ends in .xlsx. We detect file format via magic bytes and pick the
    appropriate pandas engine (xlrd for .xls, openpyxl for .xlsx).
    """
    cache_key = f"gscpi_{years}y"
    cached = _get_cached(cache_key, CACHE_TTL_LONG)
    if cached is not None:
        return cached

    try:
        import requests
        import pandas as pd

        url = "https://www.newyorkfed.org/medialibrary/research/interactives/gscpi/downloads/gscpi_data.xlsx"
        response = requests.get(
            url,
            timeout=30,
            headers={"User-Agent": "Mozilla/5.0 (CFO-Control-Tower)"},
        )
        response.raise_for_status()
        content = response.content

        # Detect actual file format from magic bytes
        # - .xls (OLE/CFB): starts with D0 CF 11 E0
        # - .xlsx (ZIP):    starts with 50 4B 03 04 (PK..)
        is_xls = content[:4] == b"\xd0\xcf\x11\xe0"
        engine = "xlrd" if is_xls else "openpyxl"
        logger.info(f"GSCPI: detected format {'xls' if is_xls else 'xlsx'}, using engine={engine}")

        # Try preferred sheet name, then any sheet containing GSCPI
        xl = pd.ExcelFile(io.BytesIO(content), engine=engine)
        sheet_names = xl.sheet_names
        logger.info(f"GSCPI: available sheets: {sheet_names}")

        target_sheet = None
        for candidate in ["GSCPI Monthly Data", "GSCPI", "Monthly", "Data"]:
            if candidate in sheet_names:
                target_sheet = candidate
                break
        if target_sheet is None:
            # Pick the sheet most likely to contain the data (first non-title)
            target_sheet = sheet_names[0]

        # The NY Fed file has header rows — try multiple skiprows values
        df = None
        for skip in [5, 4, 3, 2, 6, 0]:
            try:
                candidate_df = xl.parse(target_sheet, skiprows=skip)
                cols = [str(c).strip() for c in candidate_df.columns]
                # Must have a date-like column and a GSCPI column
                has_date = any("date" in c.lower() or "period" in c.lower() for c in cols)
                has_gscpi = any("gscpi" in c.lower() for c in cols)
                if has_date and has_gscpi:
                    df = candidate_df
                    df.columns = cols
                    logger.info(f"GSCPI: parsed sheet '{target_sheet}' with skiprows={skip}, cols={cols}")
                    break
            except Exception:
                continue

        if df is None:
            logger.warning(f"GSCPI: failed to locate Date+GSCPI columns in sheet {target_sheet}")
            return None

        date_col = next(c for c in df.columns if "date" in c.lower() or "period" in c.lower())
        value_col = next(c for c in df.columns if "gscpi" in c.lower())

        df = df.dropna(subset=[date_col, value_col])
        df["date"] = pd.to_datetime(df[date_col], errors="coerce")
        df = df.dropna(subset=["date"])
        cutoff = datetime.now() - timedelta(days=365 * years)
        df = df[df["date"] >= cutoff].sort_values("date")

        if df.empty:
            logger.warning(f"GSCPI: no data after date cutoff {cutoff}")
            return None

        result = {
            "dates": [d.strftime("%Y-%m") for d in df["date"]],
            "values": [round(float(v), 2) for v in df[value_col]],
            "source": "NY Fed",
            "unit": "",
            "note": "GSCPI: 0 = historical average, positive = pressure, negative = relief",
        }
        _set_cached(cache_key, result)
        logger.info(f"GSCPI: fetched {len(df)} points from NY Fed")
        return result
    except Exception as e:
        logger.warning(f"fetch_gscpi_series failed: {type(e).__name__}: {e}")
        return None


def mock_component_price_series(years: int = 5) -> dict:
    """
    Core Electronic Components Price Index — MOCK.
    Real data requires TrendForce/Omdia paid subscription.
    Generates plausible DRAM/NAND/LCD price trajectories.
    """
    import math
    months = years * 12
    dates = []
    dram = []
    nand = []
    lcd = []
    now = datetime.now()
    for i in range(months):
        d = now - timedelta(days=30 * (months - i - 1))
        dates.append(d.strftime("%Y-%m"))
        t = i / months
        # DRAM: cyclical with ~24-month cycle
        dram.append(round(100 + 30 * math.sin(t * 2 * math.pi * years / 2) + i * 0.3, 1))
        # NAND: different phase
        nand.append(round(100 + 25 * math.sin(t * 2 * math.pi * years / 2 + 1.5) + i * 0.2, 1))
        # LCD: slow decline with recovery
        lcd.append(round(100 - 10 * math.sin(t * 2 * math.pi * years / 3) + i * 0.1, 1))

    return {
        "dates": dates,
        "dram": dram,
        "nand": nand,
        "lcd": lcd,
        "source": "mock",
        "unit": "index (base=100)",
        "note": "Requires TrendForce DRAMeXchange or Omdia subscription for real data",
    }


def mock_semi_lead_time_series(years: int = 5) -> dict:
    """
    Semiconductor Lead Time — MOCK.
    Real data requires Susquehanna paid reports.
    """
    import math
    months = years * 12
    dates = []
    values = []
    now = datetime.now()
    for i in range(months):
        d = now - timedelta(days=30 * (months - i - 1))
        dates.append(d.strftime("%Y-%m"))
        t = i / months
        # Spike during COVID (2021-2022), then decline
        peak_pos = 0.5
        distance = abs(t - peak_pos)
        val = 10 + 15 * math.exp(-distance * 8) + 3 * math.sin(t * 2 * math.pi * years)
        values.append(round(val, 1))

    return {
        "dates": dates,
        "values": values,
        "source": "mock",
        "unit": "weeks",
        "threshold": 15,
        "note": "Requires Susquehanna Financial Group monthly reports for real data",
    }


# ══════════════════════════════════════════════════════════════════════
#  Dimension 3: Competitive Landscape (reuses external_data.py)
# ══════════════════════════════════════════════════════════════════════

def fetch_competitor_data() -> dict:
    """
    Fetch competitor financials via existing external_data module.
    Structures output for 3 charts: revenue growth, gross margin, market share.
    """
    from external_data import fetch_peer_financials

    peers = fetch_peer_financials()
    if not peers:
        peers = _mock_competitors()
        source = "mock"
    else:
        source = "yfinance"

    return {
        "peers": peers,
        "source": source,
    }


def _mock_competitors() -> list[dict]:
    """Fallback competitor data if yfinance unavailable."""
    return [
        {"name": "HP Inc.", "segment": "PC", "matchesBG": "IDG", "quarterlyRevenue": 13450, "revenueGrowthYoY": -2.1, "grossMargin": 21.5, "operatingMargin": 8.2, "marketCap": 30000000000, "marketShare": 20.1, "marketShareChange": -0.3, "source": "mock"},
        {"name": "Dell", "segment": "PC", "matchesBG": "IDG", "quarterlyRevenue": 22100, "revenueGrowthYoY": 3.6, "grossMargin": 22.3, "operatingMargin": 6.1, "marketCap": 85000000000, "marketShare": 15.6, "marketShareChange": 0.4, "source": "mock"},
        {"name": "Apple", "segment": "PC", "matchesBG": "IDG", "quarterlyRevenue": 95000, "revenueGrowthYoY": 2.8, "grossMargin": 44.5, "operatingMargin": 29.8, "marketCap": 3500000000000, "marketShare": 9.2, "marketShareChange": 0.7, "source": "mock"},
        {"name": "HPE", "segment": "Server/ISG", "matchesBG": "ISG", "quarterlyRevenue": 7650, "revenueGrowthYoY": 5.2, "grossMargin": 34.1, "operatingMargin": 10.4, "marketCap": 25000000000, "marketShare": None, "marketShareChange": None, "source": "mock"},
        {"name": "Supermicro", "segment": "Server/ISG", "matchesBG": "ISG", "quarterlyRevenue": 5400, "revenueGrowthYoY": 110.4, "grossMargin": 14.2, "operatingMargin": 9.8, "marketCap": 27000000000, "marketShare": None, "marketShareChange": None, "source": "mock"},
    ]


def mock_pc_market_share() -> dict:
    """
    PC market share — MOCK.
    Real data requires IDC/Gartner subscription.
    """
    return {
        "shares": [
            {"name": "Lenovo", "share": 23.8, "change": 0.5, "color": "#E12726"},
            {"name": "HP", "share": 20.1, "change": -0.3, "color": "#0073CE"},
            {"name": "Dell", "share": 15.6, "change": 0.4, "color": "#00A650"},
            {"name": "Apple", "share": 9.2, "change": 0.7, "color": "#F5A623"},
            {"name": "ASUS", "share": 7.8, "change": 0.1, "color": "#8B5CF6"},
            {"name": "Acer", "share": 6.9, "change": -0.2, "color": "#EC4899"},
            {"name": "Others", "share": 16.6, "change": -1.2, "color": "#A2A2A2"},
        ],
        "quarter": "FY26Q1",
        "source": "mock",
        "note": "Requires IDC/Gartner subscription for real market share data",
    }


# ══════════════════════════════════════════════════════════════════════
#  News Aggregation (Google News RSS)
# ══════════════════════════════════════════════════════════════════════

NEWS_QUERIES = [
    ("Lenovo Group earnings", "company"),
    ("Lenovo PC server", "company"),
    ("DRAM NAND price", "supply_chain"),
    ("semiconductor lead time", "supply_chain"),
    ("Federal Reserve rate decision", "macro"),
    ("US Treasury yield", "macro"),
    ("US Dollar Index DXY", "macro"),
    ("HP Dell earnings", "competitor"),
    ("Apple PC market share", "competitor"),
    ("global supply chain pressure", "supply_chain"),
    ("China tech tariff", "macro"),
]


def fetch_news(limit: int = 15) -> dict:
    """
    Fetch news from Google News RSS for Lenovo + macro/supply/competitor topics.
    Returns deduplicated list sorted by recency.
    """
    cache_key = f"news_{limit}"
    cached = _get_cached(cache_key, 1800)  # 30 min cache
    if cached is not None:
        return cached

    try:
        import requests
        from xml.etree import ElementTree as ET
        from urllib.parse import quote
        from email.utils import parsedate_to_datetime

        all_items: list[dict] = []
        seen_links: set[str] = set()

        for query, tag in NEWS_QUERIES:
            try:
                url = f"https://news.google.com/rss/search?q={quote(query)}&hl=en-US&gl=US&ceid=US:en"
                response = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
                response.raise_for_status()

                root = ET.fromstring(response.content)
                channel = root.find("channel")
                if channel is None:
                    continue

                for item in channel.findall("item")[:5]:  # top 5 per query
                    title_el = item.find("title")
                    link_el = item.find("link")
                    date_el = item.find("pubDate")
                    source_el = item.find("source")
                    desc_el = item.find("description")

                    if title_el is None or link_el is None:
                        continue

                    link = link_el.text
                    if link in seen_links:
                        continue
                    seen_links.add(link)

                    try:
                        pub_date = parsedate_to_datetime(date_el.text) if date_el is not None else datetime.now()
                    except Exception:
                        pub_date = datetime.now()

                    all_items.append({
                        "title": title_el.text or "",
                        "link": link or "",
                        "source": source_el.text if source_el is not None else "Google News",
                        "publishedAt": pub_date.isoformat(),
                        "tag": tag,
                        "description": (desc_el.text or "")[:200] if desc_el is not None else "",
                    })

            except Exception as e:
                logger.warning(f"News fetch for query '{query}' failed: {e}")
                continue

        # Sort by date desc, take top N
        all_items.sort(key=lambda x: x["publishedAt"], reverse=True)
        result = {
            "items": all_items[:limit],
            "source": "Google News RSS",
            "fetchedAt": datetime.now().isoformat(),
        }
        _set_cached(cache_key, result)
        logger.info(f"News: fetched {len(all_items)} items, returning {limit}")
        return result

    except Exception as e:
        logger.warning(f"fetch_news failed: {e}")
        return {"items": [], "source": "error", "error": str(e)}


# ══════════════════════════════════════════════════════════════════════
#  Aggregated Endpoints (used by /api/global/*)
# ══════════════════════════════════════════════════════════════════════

def get_macro_data(years: int = 5) -> dict:
    """Dimension 1: Macro & Capital Environment."""
    return {
        "treasury10Y": fetch_treasury_10y_series(years),
        "nasdaqPE": fetch_nasdaq_pe_series(years),
        "dxy": fetch_dxy_series(years),
        "vix": fetch_vix_series(years),
        "epu": fetch_epu_series(years),
    }


def get_supply_chain_data(years: int = 5) -> dict:
    """Dimension 2: Upstream Cost & Supply Chain."""
    return {
        "components": mock_component_price_series(years),
        "semiLeadTime": mock_semi_lead_time_series(years),
        "gscpi": fetch_gscpi_series(years),
    }


def get_competitive_data() -> dict:
    """Dimension 3: Competitive Landscape."""
    competitors = fetch_competitor_data()
    return {
        "competitors": competitors["peers"],
        "competitorsSource": competitors["source"],
        "marketShare": mock_pc_market_share(),
    }
