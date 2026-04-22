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
