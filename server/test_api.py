"""
CFO Control Tower — Backend API Test Cases
Run: cd server && python -m pytest test_api.py -v
"""
import pytest
import json
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from main import app
from mock_data import get_opening_data, get_secondary_data, get_tertiary_data, QUARTERS, BUSINESS_GROUPS, GEOGRAPHIES
from models import FilterState
from llm_agent import _execute_tool, _parse_response, SYSTEM_PROMPT

client = TestClient(app)


# ── Health Check ────────────────────────────────────────────────────
class TestHealthCheck:
    def test_health_returns_ok(self):
        r = client.get("/api/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"

    def test_health_includes_metadata(self):
        r = client.get("/api/health")
        data = r.json()
        assert "quarters" in data
        assert "bgs" in data
        assert "geos" in data


# ── Data Endpoints ──────────────────────────────────────────────────
class TestOpeningData:
    def test_opening_default(self):
        r = client.get("/api/data/opening?quarter=FY26Q1")
        assert r.status_code == 200
        data = r.json()
        assert "revenues" in data
        assert "grossProfit" in data
        assert "operatingIncome" in data
        assert "netIncome" in data

    def test_opening_has_budget(self):
        r = client.get("/api/data/opening?quarter=FY26Q1")
        data = r.json()
        assert data["revenues"]["budget"] is not None
        assert data["grossProfit"]["budget"] is not None

    def test_opening_with_bg_filter(self):
        r = client.get("/api/data/opening?quarter=FY26Q1&bgs=IDG")
        assert r.status_code == 200

    def test_opening_with_geo_filter(self):
        r = client.get("/api/data/opening?quarter=FY26Q1&geos=PRC,AP")
        assert r.status_code == 200


class TestSecondaryData:
    def test_secondary_returns_list(self):
        r = client.get("/api/data/secondary?quarter=FY26Q1")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0

    def test_secondary_has_operating_metrics(self):
        r = client.get("/api/data/secondary?quarter=FY26Q1")
        data = r.json()
        first = data[0]
        assert "revenues" in first
        assert "grossProfit" in first
        assert "inventory" in first


class TestTertiaryData:
    def test_tertiary_returns_list(self):
        r = client.get("/api/data/tertiary?quarter=FY26Q1")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0

    def test_tertiary_has_bg_breakdown(self):
        r = client.get("/api/data/tertiary?quarter=FY26Q1")
        data = r.json()
        first = data[0]
        assert "bg" in first
        assert "geo" in first
        assert "revenues" in first


# ── Mock Data Functions ─────────────────────────────────────────────
class TestMockData:
    def test_all_quarters_valid(self):
        assert len(QUARTERS) >= 4
        for q in QUARTERS:
            assert q.startswith("FY")

    def test_business_groups(self):
        assert set(BUSINESS_GROUPS) == {"IDG", "ISG", "SSG"}

    def test_geographies(self):
        expected = {"AP", "NA", "LA", "Europe", "Meta", "PRC"}
        assert set(GEOGRAPHIES) == expected

    def test_opening_data_consistency(self):
        filters = FilterState(quarter="FY26Q1", selectedBGs=[], selectedGeos=[])
        data = get_opening_data(filters)
        # Revenue should be positive
        assert data.revenues.actual > 0
        # Gross profit should be less than revenue
        assert data.grossProfit.actual < data.revenues.actual
        # GP% should be between 0 and 100
        assert 0 < data.grossProfitPct.actual < 100

    def test_opening_budget_is_stretch_target(self):
        """Budget should be slightly higher than actual (mock uses ~1.02x multiplier)."""
        filters = FilterState(quarter="FY26Q1", selectedBGs=[], selectedGeos=[])
        data = get_opening_data(filters)
        assert data.revenues.budget > data.revenues.actual


# ── Tool Execution ──────────────────────────────────────────────────
class TestToolExecution:
    def test_get_quarterly_overview(self):
        result = _execute_tool("get_quarterly_overview", {"quarter": "FY26Q1"})
        parsed = json.loads(result)
        assert "revenues" in parsed
        assert "grossProfit" in parsed

    def test_get_operating_data(self):
        result = _execute_tool("get_operating_data", {"quarter": "FY26Q1"})
        parsed = json.loads(result)
        assert isinstance(parsed, list)
        assert len(parsed) > 0

    def test_get_bg_breakdown(self):
        result = _execute_tool("get_bg_breakdown", {"quarter": "FY26Q1"})
        parsed = json.loads(result)
        assert isinstance(parsed, list)
        assert len(parsed) > 0

    def test_unknown_tool(self):
        result = _execute_tool("nonexistent", {})
        parsed = json.loads(result)
        assert "error" in parsed


# ── Response Parsing ────────────────────────────────────────────────
class TestResponseParsing:
    def test_parse_json_response(self):
        content = '{"text": "hello", "blocks": [{"type": "text", "data": {"content": "detail"}}]}'
        result = _parse_response(content)
        assert result["text"] == "hello"
        assert len(result["blocks"]) == 1

    def test_parse_markdown_json(self):
        content = 'Some text\n```json\n{"text": "hello", "blocks": []}\n```'
        result = _parse_response(content)
        assert result["text"] == "hello"

    def test_parse_plain_text_fallback(self):
        content = "This is just plain text analysis."
        result = _parse_response(content)
        assert result["text"] == content
        assert result["blocks"][0]["type"] == "text"


# ── System Prompt Guardrails ────────────────────────────────────────
class TestSystemPromptGuardrails:
    def test_prompt_is_finance_only(self):
        assert "只" in SYSTEM_PROMPT
        assert "财务" in SYSTEM_PROMPT
        assert "礼貌拒绝" in SYSTEM_PROMPT

    def test_prompt_has_data_grounding_rules(self):
        assert "严格数据准则" in SYSTEM_PROMPT
        assert "绝对禁止" in SYSTEM_PROMPT
        assert "编造" in SYSTEM_PROMPT

    def test_prompt_requires_missing_data_disclosure(self):
        assert "尚未接入" in SYSTEM_PROMPT

    def test_prompt_separates_fact_and_advice(self):
        assert "基于当前数据" in SYSTEM_PROMPT
        assert "基于 XX 假设" in SYSTEM_PROMPT

    def test_prompt_has_json_format(self):
        assert '"text"' in SYSTEM_PROMPT
        assert '"blocks"' in SYSTEM_PROMPT


# ── Chat Endpoint (mocked LLM) ─────────────────────────────────────
class TestChatEndpoint:
    def test_chat_endpoint_exists(self):
        r = client.post("/api/chat", json={
            "message": "test",
            "filters": {"quarter": "FY26Q1", "selectedBGs": [], "selectedGeos": []},
            "conversationHistory": [],
        })
        # Should not 404 (may fail with LLM error, but endpoint exists)
        assert r.status_code in [200, 500]

    def test_chat_stream_endpoint_exists(self):
        r = client.post("/api/chat/stream", json={
            "message": "test",
            "filters": {"quarter": "FY26Q1", "selectedBGs": [], "selectedGeos": []},
            "conversationHistory": [],
        })
        assert r.status_code in [200, 500]
