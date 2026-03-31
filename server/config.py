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
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
