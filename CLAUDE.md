# CFO Control Tower — Project Guide

## Overview

A professional CFO dashboard for Lenovo finance teams. 3-tier drill-down views with AI chat, multi-dimensional filtering, and Bloomberg consensus comparison. Organized by the **"Growth → Profitability → Asset Velocity → Cash Flow"** value-creation framework. Supports both frontend-only mode (mock data) and full-stack mode (FastAPI backend + LLM).

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS v4 + shadcn/ui (base-ui primitives)
- **Charts**: Apache ECharts via `echarts-for-react`
- **Routing**: React Router v6
- **State**: React Context (FilterContext, ChatContext, LanguageContext)
- **i18n**: Custom lightweight system (translations.ts + useLanguage hook, localStorage persistence)
- **Backend**: Python FastAPI + Uvicorn
- **AI/LLM**: OpenAI-compatible API with Function Calling (supports GPT, DeepSeek, Qwen, Moonshot, Ollama etc.)

## Project Structure

```
├── src/                          # Frontend (React)
│   ├── api/
│   │   └── client.ts             # HTTP client for backend API
│   ├── components/
│   │   ├── layout/               # AppLayout, Header, FilterBar
│   │   ├── charts/               # BaseChart, chart wrappers, KPICard, InfoTooltip, ChartTitle, MetricTabbedChart, AlignedDataTable
│   │   ├── ai-chat/
│   │   │   ├── ChatPanel.tsx     # Side sheet panel
│   │   │   ├── ChatFAB.tsx       # Floating action button (bottom-right entry)
│   │   │   ├── ChatMessage.tsx   # Message bubble with avatar, timestamp, copy
│   │   │   ├── ChatInput.tsx     # Auto-resize textarea input
│   │   │   ├── WelcomeScreen.tsx # Empty state with capability cards
│   │   │   ├── TypingIndicator.tsx
│   │   │   ├── SuggestedQueries.tsx
│   │   │   └── MessageBlocks/    # Rich block renderers (Chart, KPI, Table, Insight, Source, Thinking)
│   │   └── ui/                   # shadcn components
│   ├── pages/
│   │   ├── opening/              # Quarter Overview (KPIs, consensus tabs, profitability waterfall, margins)
│   │   ├── secondary/            # Operating Numbers (4-tier: Momentum → Profitability → Asset → Cash)
│   │   └── tertiary/             # BG Breakdown (Revenue/GP/OI by IDG/ISG/SSG, GP%/OI% trends, heatmap)
│   ├── data/
│   │   ├── constants.ts          # BGs (IDG/ISG/SSG), Geos, Quarters, period helpers, colors
│   │   ├── mock-opening.ts       # Opening page mock data
│   │   ├── mock-secondary.ts     # Secondary page mock data (with budget, thresholds, expense ratios)
│   │   ├── mock-tertiary.ts      # Tertiary page mock data (IDG = PCSD + MBG aggregation)
│   │   ├── mock-external.ts      # External data (supply chain, peers, macro, correlations)
│   │   ├── ai-responses.ts       # Frontend AI engine (regex intent → structured response)
│   │   ├── query-engine.ts       # Cross-query engine (BG × Geo × Time)
│   │   ├── attribution-engine.ts # Attribution analysis (metric change decomposition)
│   │   ├── smart-suggestions.ts  # Dynamic follow-up suggestions
│   │   ├── translations.ts       # EN/ZH translations
│   │   └── metric-definitions.ts # Metric tooltips (definition + formula)
│   ├── context/                  # FilterContext, ChatContext, LanguageContext
│   ├── hooks/                    # useFilters, useAIChat, useLanguage
│   ├── types/                    # TypeScript interfaces (index.ts, ai-types.ts, i18n.ts)
│   └── utils/                    # formatters (M-based currency), chart-theme
│
├── server/                       # Backend (Python FastAPI)
│   ├── main.py                   # FastAPI app, all API routes
│   ├── config.py                 # Env config (LLM key, base URL, model)
│   ├── models.py                 # Pydantic models (mirrors TS types)
│   ├── mock_data.py              # Mock data + real data integration (yfinance/fredapi with mock fallback)
│   ├── external_data.py          # External data service (yfinance for peers/FX, fredapi for macro)
│   ├── llm_agent.py              # LLM Agent (OpenAI API + Function Calling + SSE streaming)
│   ├── requirements.txt          # Python dependencies
│   ├── .env.example              # Environment variable template
│   └── README.md                 # Backend startup guide
│
├── docs/
│   └── api-migration-guide.md    # Guide for replacing mock data with real APIs
│
├── .env                          # Frontend env (VITE_AI_MODE, VITE_API_BASE_URL)
└── .env.api                      # Preset for API mode
```

## Quick Start

### Frontend Only (default, no backend needed)

```bash
npm install
npm run dev       # http://localhost:5173
```

### Full Stack (Backend + LLM)

```bash
# Terminal 1: Backend
cd server
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # Edit: fill in LLM_API_KEY
python main.py                    # http://localhost:8000 (Swagger: /docs)

# Terminal 2: Frontend (switch to API mode)
cp .env.api .env
npm run dev                       # http://localhost:5173
```

## Business Groups

The dashboard uses 3 reporting BGs: **IDG**, **ISG**, **SSG**.
- **IDG** (Intelligent Devices Group) = PCSD + MBG aggregated internally
- **ISG** (Infrastructure Solutions Group)
- **SSG** (Solutions & Services Group)

The filter bar exposes IDG/ISG/SSG. Mock data generates PCSD + MBG separately and aggregates them into IDG via `expandBGs()` in `mock-tertiary.ts`.

## Dashboard Hierarchy

### Opening Page — Quarter Overview (`/`)
- **KPI Cards**: Revenue, Gross Profit, GP%, Operating Income, Net Income (with YoY comparison)
- **Actual vs Bloomberg Consensus**: 5-tab chart (one per metric), each with aligned data table below. Metrics with consensus (Revenue, Net Income) show dual-axis with Beat % on right Y-axis. X-axis: last 5 quarters.
- **Profitability Waterfall**: Revenue → COGS → Gross Profit → OpEx → Operating Income → Tax & Interest → Net Income, with aligned data table showing amounts and margin percentages, plus QoQ/YoY comparisons.
- **Key Margin Ratios**: GP%, OI%, Net Margin gauge charts.
- **Revenue Trend**: Quarterly revenue line chart with 5-quarter history.
- FilterBar: quarterly selector only (no time granularity toggle on this page).

### Secondary Page — Operating Numbers (`/secondary`)
Organized by CFO "Growth → Profitability → Asset → Cash" framework:

- **Tier 1 — Forward-looking Momentum**: Pipeline funnel, Backlog coverage ratio
- **Tier 2 — Profitability & Operating Leverage**: Revenue-to-Net-Income waterfall (bridge chart), expense ratios (S&M/R&D/Fixed as % of revenue)
- **Tier 3 — Asset Velocity**: Inventory trend, WOI (Weeks of Inventory) with threshold alerts
- **Tier 4 — Cash Flow & Liquidity**: AR vs AP dual-axis comparison, CCC (Cash Conversion Cycle) with threshold alerts

All charts have aligned data tables below. Budget/Actual variance analysis integrated. Red/amber/green alert thresholds for WOI and CCC.

### Tertiary Page — BG Breakdown (`/tertiary`)
- **Revenue by BG**: Stacked bar chart (IDG/ISG/SSG) over 5 quarters
- **Gross Profit by BG**: Stacked bar chart
- **Operating Income by BG**: Stacked bar chart
- **BG GP% Trend**: Line chart comparing GP margin by BG
- **BG OI% Comparison**: Line chart comparing OI margin by BG
- **Geo × BG Heatmap**: Cross-matrix showing revenue intensity
- **Regional Profitability**: GP margin by geography comparison

## Filtering System

### FilterBar Behavior
- **Opening page**: Only shows quarter selector (always quarterly granularity)
- **Other pages**: Shows time granularity toggle + dynamic period selector
  - Quarterly → shows all quarters (FY24Q1 ~ FY26Q1)
  - Monthly → shows last 13 months (e.g., "Apr 2025")
  - Daily → shows last 31 days (e.g., "Jun 15")
- Changing granularity auto-selects the latest period via `getDefaultPeriod()`
- Monthly/daily periods map back to parent quarter via `periodToQuarter()` for data lookup

### BG & Geo Dropdowns
- Multi-select dropdown with "All" toggle (click All to select all, click again to deselect all)
- Can select individual items for comparison
- Empty selection allowed (shows "—" in display)

### Data Currency
- All monetary values displayed in millions ($M format) via `formatCurrency()`
- Default quarter: latest in QUARTERS array (currently FY26Q1)

## AI Modes (VITE_AI_MODE)

| Mode | Description | Backend? |
|------|-------------|----------|
| `local` | Frontend regex engine, all mock data in browser (default) | No |
| `api` | Backend LLM, non-streaming, complete response | Yes |
| `api-stream` | Backend LLM, SSE streaming, progressive display | Yes |

### Streaming Behavior
- During streaming, only ThinkingBlock steps are shown (no raw JSON displayed)
- Formatted blocks (charts, tables, KPIs) render only after `complete` event
- Unknown block types extract `content`/`text` fields instead of dumping raw JSON

## Supported LLM Providers

Any OpenAI-compatible API. Configure in `server/.env`:

| Provider | LLM_BASE_URL | Model Example |
|----------|-------------|---------------|
| OpenAI | `https://api.openai.com/v1` | gpt-4o, gpt-4-turbo |
| DeepSeek | `https://api.deepseek.com` | deepseek-chat |
| Qwen | `https://dashscope.aliyuncs.com/compatible-mode/v1` | qwen-max |
| Moonshot | `https://api.moonshot.cn/v1` | moonshot-v1-128k |
| Local Ollama | `http://localhost:11434/v1` | llama3, qwen2 |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check + metadata |
| GET | `/api/data/opening?quarter=&bgs=&geos=` | Quarter overview KPIs |
| GET | `/api/data/secondary?quarter=&bgs=&geos=` | Operating metrics series |
| GET | `/api/data/tertiary?quarter=&bgs=&geos=` | BG × Geo breakdown |
| POST | `/api/chat` | AI chat (complete response) |
| POST | `/api/chat/stream` | AI chat (SSE streaming) |

## AI Assistant Capabilities

- **Internal Cross-Query**: BG × Geo × Time arbitrary combination, auto chart selection, multi-turn context
- **External Data**: Supply chain (10 suppliers, 6 components), peer benchmarking (7 competitors via yfinance real-time + mock fallback), macro economics (8 FRED indicators + mock fallback, 4 FX pairs via yfinance), internal-external correlation
- **Attribution Analysis**: Metric change decomposition into 5 factor categories (BG contribution, operational efficiency, supply chain, macro, competitive), waterfall visualization, confidence scoring
- **UX Polish**: Welcome screen with capability cards, FAB, message avatars/timestamps/copy, chart fullscreen, table collapse/expand, typing animation

## Color Scheme

| Role | Color | Usage |
|------|-------|-------|
| Accent / Primary | `#E12726` | Brand red, active tabs, alerts, ring |
| Foreground / Titles | `#000000` | Main headings, card values, chart text |
| Background | `#F7F7F7` | Page background |
| Muted / Secondary text | `#A2A2A2` | Labels, axis text, descriptions |
| Card | `#FFFFFF` | Card backgrounds |
| Positive | `#00A650` | Green for uptrends, AP bars, SSG |
| Chart Blue | `#0073CE` | Primary chart series, AR bars, ISG |
| Chart Orange | `#F5A623` | Secondary series, WOI line |

## Key Patterns

### Data Flow
- **Frontend-only**: Pages use `useMemo(() => mockFunction(filters), [filters])` for reactive data.
- **With backend**: Replace with `fetch` calls to `/api/data/*` endpoints. API client in `src/api/client.ts`.
- **Migration guide**: See `docs/api-migration-guide.md` for phased approach to replace mock data with real APIs.

### AI Chat Architecture
- `useAIChat` hook reads `VITE_AI_MODE` to switch between frontend engine and backend API.
- Backend is a **ReAct Agent** (Reasoning + Acting) with up to 3 rounds of tool-calling loop.
- Backend uses OpenAI Function Calling with 6 data tools:
  - `get_quarterly_overview` — Quarter KPIs (revenue, GP, OI, NI, budget, prior year)
  - `get_operating_data` — Operating metrics time series (pipeline, backlog, COGS, expenses, inventory, WOI, AR, AP, CCC)
  - `get_bg_breakdown` — BG × Geo cross-dimensional data
  - `get_supply_chain_data` — Supply chain (10 suppliers, 6 component cost trends, risk assessment)
  - `get_peer_data` — Peer benchmarking (9 competitors, 3 market segments, market share)
  - `get_macro_data` — Macro economics (GDP, PMI, IT spending, consumer confidence, FX impact)
- LLM decides which tools to call → `mock_data.py` returns data → LLM analyzes and responds with structured JSON blocks.
- SSE streaming: tool calls are non-streaming (emit `thinking` events), final answer rendered after `complete` event (no raw JSON exposed).
- ThinkingBlock: shows LLM's reasoning steps in real-time (expanded during thinking, auto-collapsed on complete).
- ChatPanel: resizable width (drag left edge, 380–900px), no backdrop blur overlay.
- All AI assistant UI elements (FAB, header icon, bot avatar, send button) use brand red `#E12726`.

### AI Guardrails
- **Finance-only scope**: AI only answers questions related to Lenovo group financials. Non-finance questions are politely declined.
- **Strict data grounding**: All numbers must come from tool-returned data or authoritative external sources. No fabrication allowed.
- **Missing data transparency**: If a query requires data not yet available, AI explicitly states what data is needed and recommends analysis after data integration.
- **Fact vs advice separation**: Data-based facts are stated directly; analytical suggestions are labeled "based on current data" or "based on XX assumption".

### Filtering
`FilterContext` holds global state. FilterBar reads route (`useLocation`) to conditionally show/hide time granularity on opening page. Period changes auto-switch via `getDefaultPeriod()`. BG/Geo use multi-select dropdown with All toggle.

### i18n
`LanguageContext` with `localStorage('cct-language')` persistence. Language selection persists across page navigation and sessions. All UI text goes through `translations.ts`.

### Metric Tooltips
Each KPI card has an `InfoTooltip` (?) icon showing metric definition and calculation formula. Uses portal rendering to avoid clipping by parent containers.

### Aligned Data Tables
Charts with data tables use a consistent pattern: chart `grid.left`/`grid.right` margins match table padding, so table columns align precisely with x-axis points. Implemented via `AlignedDataTable` component and per-chart inline tables.

## Commands

```bash
# Frontend
npm run dev       # Start dev server (port 5173)
npm run build     # Production build
npx tsc --noEmit  # Type check

# Backend
cd server && python main.py   # Start API server (port 8000)
```

## Deployment

### Production Build

```bash
# Frontend: build static files
npm run build                    # Output: dist/

# Backend: no build step needed (Python)
```

### Server Deployment (Nginx + PM2/Supervisor)

```bash
# 1. Upload code to server
git pull origin main

# 2. Frontend: serve dist/ via Nginx
#    Nginx config example:
#    location / {
#        root /path/to/cct/dist;
#        try_files $uri $uri/ /index.html;
#    }
#    location /api/ {
#        proxy_pass http://127.0.0.1:8000;
#        proxy_http_version 1.1;
#        proxy_set_header Connection "";
#        proxy_buffering off;              # Required for SSE streaming
#    }

# 3. Backend: run with process manager
cd server
pip install -r requirements.txt
# Using PM2:
pm2 start "python main.py" --name cct-api
# Or using systemd/supervisor
```

### Environment Variables (Production)

```bash
# Frontend .env (build-time)
VITE_AI_MODE=api-stream
VITE_API_BASE_URL=https://your-domain.com    # Or relative path if same domain

# Backend server/.env
LLM_API_KEY=sk-xxx
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o
FRED_API_KEY=your-fred-api-key        # Optional: https://fred.stlouisfed.org/docs/api/api_key.html
HOST=0.0.0.0
PORT=8000
CORS_ORIGINS=https://your-domain.com
```

## Update Workflow

1. Develop & test locally
2. Update `CLAUDE.md` with new features/changes
3. `git add . && git commit && git push`
4. On server: `git pull && npm run build && pm2 restart cct-api`

## Known Issues

- `@base-ui/react` Select/Separator components produce "Invalid hook call" console warnings in strict mode. Purely cosmetic — app functions correctly.
- `npm run build` must be run on the same OS as `node_modules` was installed (rolldown native bindings are platform-specific).
- Base-ui Select dropdowns are difficult to interact with programmatically in testing tools; manual UI testing recommended for filter behavior.
