"""Application configuration — loaded from .env"""
import os
from dotenv import load_dotenv

load_dotenv()

# LLM
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o")

# External Data APIs
FRED_API_KEY = os.getenv("FRED_API_KEY", "")  # https://fred.stlouisfed.org/docs/api/api_key.html

# Server
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,https://cct-cc.zeabur.app").split(",")

# ── Scheduled Jobs ───────────────────────────────────────────────────
# Bearer token required to call POST /api/jobs/* endpoints.
# Generate a random string (e.g. `python -c "import secrets; print(secrets.token_urlsafe(32))"`).
JOB_TOKEN = os.getenv("JOB_TOKEN", "")

# ── Gmail SMTP (for daily AI news digest) ───────────────────────────
# Gmail requires an App Password, not the account password.
# Create one at: https://myaccount.google.com/apppasswords
SMTP_USER = os.getenv("SMTP_USER", "")              # e.g. strangeromo@gmail.com
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")      # 16-char App Password
DIGEST_RECIPIENT = os.getenv("DIGEST_RECIPIENT", "")  # e.g. xujz4@lenovo.com

# ── External feed integrations ───────────────────────────────────────
# AI HOT (aihot.virxact.com) supplements Google News with curated X /
# official-blog content. Default on. Set to "false" / "0" to disable.
INCLUDE_AIHOT_FEED = os.getenv("INCLUDE_AIHOT_FEED", "true").strip().lower() not in ("0", "false", "no", "off", "")

# Optional — raises the GitHub Search API rate limit for the trending-repos
# section. We make 1 request per digest, so anonymous access is usually fine.
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")

# Lark / Feishu custom-bot webhook. When set, the digest is also posted to
# that group chat as an interactive card. Empty = Lark posting disabled.
LARK_WEBHOOK = os.getenv("LARK_WEBHOOK", "")


def _flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() not in ("0", "false", "no", "off", "")


# Per-item Lenovo insight in the daily digest (one analysis paragraph under
# each news item). Temporarily OFF. Set INCLUDE_LENOVO_INSIGHT=true in Zeabur
# to re-enable without a code change.
INCLUDE_LENOVO_INSIGHT = _flag("INCLUDE_LENOVO_INSIGHT", False)

# Run the digest/weekly cron jobs inside this process (see scheduler.py).
# GitHub Actions' schedule triggers were firing hours late, so scheduling now
# lives in the always-on container. Set to "false" to fall back to external
# triggering only.
ENABLE_INTERNAL_SCHEDULER = _flag("ENABLE_INTERNAL_SCHEDULER", True)
