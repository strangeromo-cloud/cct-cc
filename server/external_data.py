"""
External Data Service — Real-time data from yfinance + fredapi.
Falls back to mock data if APIs are unavailable.
"""
from __future__ import annotations
import logging
import time
from typing import Any

logger = logging.getLogger(__name__)

# ── Simple in-memory cache ─────────────────────────────────────────
_cache: dict[str, tuple[float, Any]] = {}
CACHE_TTL = 3600  # 1 hour


def _get_cached(key: str) -> Any | None:
    if key in _cache:
        ts, val = _cache[key]
        if time.time() - ts < CACHE_TTL:
            return val
        del _cache[key]
    return None


def _set_cached(key: str, val: Any) -> None:
    _cache[key] = (time.time(), val)


# ══════════════════════════════════════════════════════════════════════
#  yfinance — Competitor Financials & FX Rates
# ══════════════════════════════════════════════════════════════════════

# Competitor ticker → display info
PEER_TICKERS = {
    "HPQ":   {"name": "HP Inc.",            "segment": "PC",            "matchesBG": "IDG"},
    "DELL":  {"name": "Dell Technologies",  "segment": "PC",            "matchesBG": "IDG"},
    "AAPL":  {"name": "Apple",              "segment": "PC",            "matchesBG": "IDG"},
    # ASUS is listed in Taiwan (2357.TW), may have limited data
    "HPE":   {"name": "HPE",                "segment": "Server/ISG",    "matchesBG": "ISG"},
    "SMCI":  {"name": "Supermicro",         "segment": "Server/ISG",    "matchesBG": "ISG"},
    "ACN":   {"name": "Accenture",          "segment": "IT Services",   "matchesBG": "SSG"},
    "IBM":   {"name": "IBM",                "segment": "IT Services",   "matchesBG": "SSG"},
}

# FX tickers in yfinance format
FX_TICKERS = {
    "USDCNY=X": "USD/CNY",
    "USDEUR=X": "USD/EUR",
    "USDJPY=X": "USD/JPY",
    "USDBRL=X": "USD/BRL",
}


def fetch_peer_financials() -> list[dict] | None:
    """Fetch competitor financials from yfinance. Returns None on failure."""
    cache_key = "peer_financials"
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached

    try:
        import yfinance as yf

        results = []
        for ticker, meta in PEER_TICKERS.items():
            try:
                stock = yf.Ticker(ticker)
                info = stock.info

                # Extract quarterly revenue (annualized / 4 as approximation)
                total_rev = info.get("totalRevenue")
                quarterly_rev = round(total_rev / 4 / 1e6) if total_rev else None

                # Revenue growth YoY
                rev_growth = info.get("revenueGrowth")
                rev_growth_pct = round(rev_growth * 100, 1) if rev_growth else None

                # Margins
                gross_margin = info.get("grossMargins")
                gross_margin_pct = round(gross_margin * 100, 1) if gross_margin else None
                op_margin = info.get("operatingMargins")
                op_margin_pct = round(op_margin * 100, 1) if op_margin else None

                # Market cap for relative sizing
                mkt_cap = info.get("marketCap")

                results.append({
                    "name": meta["name"],
                    "segment": meta["segment"],
                    "matchesBG": meta["matchesBG"],
                    "quarterlyRevenue": quarterly_rev,
                    "revenueGrowthYoY": rev_growth_pct,
                    "grossMargin": gross_margin_pct,
                    "operatingMargin": op_margin_pct,
                    "marketCap": mkt_cap,
                    # marketShare not available from yfinance, keep as None
                    "marketShare": None,
                    "marketShareChange": None,
                    "source": "yfinance",
                })
                logger.info(f"yfinance: fetched {ticker} ({meta['name']})")

            except Exception as e:
                logger.warning(f"yfinance: failed to fetch {ticker}: {e}")
                continue

        if results:
            _set_cached(cache_key, results)
            return results

    except ImportError:
        logger.warning("yfinance not installed")
    except Exception as e:
        logger.warning(f"yfinance fetch failed: {e}")

    return None


def fetch_fx_rates() -> list[dict] | None:
    """Fetch FX rates from yfinance. Returns None on failure."""
    cache_key = "fx_rates"
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached

    try:
        import yfinance as yf

        results = []
        for ticker, pair_name in FX_TICKERS.items():
            try:
                fx = yf.Ticker(ticker)
                hist = fx.history(period="1y")
                if hist.empty:
                    continue

                current_rate = round(float(hist["Close"].iloc[-1]), 2)

                # YoY change: compare current vs ~1 year ago
                if len(hist) > 200:
                    year_ago = float(hist["Close"].iloc[0])
                    change_yoy = round((current_rate - year_ago) / year_ago * 100, 1)
                else:
                    change_yoy = 0.0

                # Estimate revenue impact (simplified model)
                # For pairs where USD strengthens, Lenovo's non-USD revenue decreases
                impact_multiplier = {
                    "USD/CNY": -85,   # ~$85M impact per 1% change
                    "USD/EUR": 55,
                    "USD/JPY": -8,
                    "USD/BRL": -10,
                }
                rev_impact = round(change_yoy * impact_multiplier.get(pair_name, 0))

                results.append({
                    "pair": pair_name,
                    "rate": current_rate,
                    "changeYoY": change_yoy,
                    "revenueImpactM": rev_impact,
                    "source": "yfinance",
                })
                logger.info(f"yfinance: fetched FX {pair_name} = {current_rate}")

            except Exception as e:
                logger.warning(f"yfinance: failed to fetch FX {ticker}: {e}")
                continue

        if results:
            _set_cached(cache_key, results)
            return results

    except ImportError:
        logger.warning("yfinance not installed")
    except Exception as e:
        logger.warning(f"yfinance FX fetch failed: {e}")

    return None


# ══════════════════════════════════════════════════════════════════════
#  fredapi — Macro Economic Indicators
# ══════════════════════════════════════════════════════════════════════

# FRED series IDs → indicator metadata
FRED_SERIES = {
    "A191RL1Q225SBEA": {
        "name": "GDP Growth",
        "region": "NA",
        "unit": "%",
        "impactOnLenovo": "北美 GDP 增长推动企业 IT 预算增加",
        "affectedBGs": ["ISG", "SSG"],
    },
    "NAPM": {
        "name": "PMI (Manufacturing)",
        "region": "NA",
        "unit": "",
        "impactOnLenovo": "制造业 PMI 反映企业采购和扩张意愿",
        "affectedBGs": ["IDG", "ISG"],
    },
    "UMCSENT": {
        "name": "Consumer Confidence",
        "region": "NA",
        "unit": "",
        "impactOnLenovo": "消费者信心指数影响 PC 消费需求",
        "affectedBGs": ["IDG"],
    },
    "CPIAUCSL": {
        "name": "CPI (Inflation)",
        "region": "NA",
        "unit": "",
        "impactOnLenovo": "通胀水平影响运营成本和定价策略",
        "affectedBGs": ["IDG", "ISG", "SSG"],
    },
    "FEDFUNDS": {
        "name": "Federal Funds Rate",
        "region": "NA",
        "unit": "%",
        "impactOnLenovo": "利率水平影响企业 IT 投资决策和融资成本",
        "affectedBGs": ["ISG", "SSG"],
    },
    "UNRATE": {
        "name": "Unemployment Rate",
        "region": "NA",
        "unit": "%",
        "impactOnLenovo": "就业市场状况影响企业 IT 招聘和支出",
        "affectedBGs": ["SSG"],
    },
    "INDPRO": {
        "name": "Industrial Production",
        "region": "NA",
        "unit": "",
        "impactOnLenovo": "工业生产指数反映制造业设备和 IT 基础设施需求",
        "affectedBGs": ["ISG"],
    },
    "DTWEXBGS": {
        "name": "Trade Weighted USD Index",
        "region": "Global",
        "unit": "",
        "impactOnLenovo": "美元指数走强压缩海外营收换算价值",
        "affectedBGs": ["IDG", "ISG", "SSG"],
    },
}


def fetch_macro_indicators() -> list[dict] | None:
    """Fetch macro indicators from FRED. Returns None on failure."""
    cache_key = "fred_indicators"
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached

    try:
        from fredapi import Fred
        from config import FRED_API_KEY

        if not FRED_API_KEY:
            logger.warning("FRED_API_KEY not configured")
            return None

        fred = Fred(api_key=FRED_API_KEY)
        results = []

        for series_id, meta in FRED_SERIES.items():
            try:
                # Get last 2 observations for current value + change
                data = fred.get_series(series_id, observation_start="2024-01-01")
                if data.empty:
                    continue

                current_val = round(float(data.iloc[-1]), 1)

                # Calculate change (vs previous observation)
                if len(data) >= 2:
                    prev_val = float(data.iloc[-2])
                    change = round(current_val - prev_val, 1)
                else:
                    change = 0.0

                # Determine trend
                if change > 0.2:
                    trend = "improving"
                elif change < -0.2:
                    trend = "deteriorating"
                else:
                    trend = "stable"

                results.append({
                    "name": meta["name"],
                    "region": meta["region"],
                    "value": current_val,
                    "unit": meta["unit"],
                    "change": change,
                    "trend": trend,
                    "impactOnLenovo": meta["impactOnLenovo"],
                    "affectedBGs": meta["affectedBGs"],
                    "seriesId": series_id,
                    "source": "FRED",
                })
                logger.info(f"FRED: fetched {series_id} ({meta['name']}) = {current_val}")

            except Exception as e:
                logger.warning(f"FRED: failed to fetch {series_id}: {e}")
                continue

        if results:
            _set_cached(cache_key, results)
            return results

    except ImportError:
        logger.warning("fredapi not installed")
    except Exception as e:
        logger.warning(f"FRED fetch failed: {e}")

    return None


# ══════════════════════════════════════════════════════════════════════
#  Cache management
# ══════════════════════════════════════════════════════════════════════

def clear_cache() -> None:
    """Clear all cached data."""
    _cache.clear()
    logger.info("External data cache cleared")


def get_cache_status() -> dict:
    """Return cache status for debugging."""
    now = time.time()
    return {
        key: {
            "age_seconds": round(now - ts),
            "ttl_remaining": round(CACHE_TTL - (now - ts)),
        }
        for key, (ts, _) in _cache.items()
    }
