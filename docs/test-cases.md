# CFO Control Tower — Test Cases

## TC-01: Page Navigation

| # | Step | Expected |
|---|------|----------|
| 1 | Open app | Opening page loads, title shows "FY26Q1 — Current Quarter vs. Analyst Expectations" |
| 2 | Click "Operating Numbers" tab | Secondary page loads with 4-tier layout |
| 3 | Click "BG Breakdown" tab | Tertiary page loads with 3 metric charts |
| 4 | Click "Quarter Overview" tab | Back to opening page |

## TC-02: Language Switch & Persistence

| # | Step | Expected |
|---|------|----------|
| 1 | Click "中文" button in header | All UI text switches to Chinese |
| 2 | Navigate to Operating Numbers | Chinese text persists |
| 3 | Refresh browser (F5) | Chinese still active (localStorage) |
| 4 | Click "EN" button | All UI text switches to English |
| 5 | Hover (?) tooltip on any metric | Tooltip content displays in current language |

## TC-03: Filter — Quarter Selector

| # | Step | Expected |
|---|------|----------|
| 1 | On opening page, change quarter to FY25Q3 | Page title updates, KPI values change, all charts refresh |
| 2 | Navigate to Operating Numbers | Same quarter (FY25Q3) maintained |
| 3 | Change quarter to FY26Q1 | All 4 tiers update, X-axis shows FY25Q1→FY26Q1 |

## TC-04: Filter — Time Granularity (Non-Opening Pages)

| # | Step | Expected |
|---|------|----------|
| 1 | On Opening page | "Time" granularity dropdown is NOT visible |
| 2 | Navigate to Operating Numbers | "Time" dropdown IS visible, default "Quarterly" |
| 3 | Switch to "Monthly" | Period dropdown shows last 13 months (e.g. "Apr 2025") |
| 4 | Switch to "Daily" | Period dropdown shows last 31 days (e.g. "Jun 15") |
| 5 | Switch back to "Quarterly" | Period dropdown shows quarters again |

## TC-05: Filter — BG Multi-Select

| # | Step | Expected |
|---|------|----------|
| 1 | Click BG dropdown | Dropdown opens with "All" + 4 BGs (PCSD, MBG, ISG, SSG) |
| 2 | Click "All" when all selected | All items deselected, display shows "—" |
| 3 | Select "ISG" only | Display shows "ISG", chart data scales down |
| 4 | Select "SSG" additionally | Display shows "ISG, SSG" |
| 5 | Click "All" | All 4 BGs selected, display shows "All" |

## TC-06: Filter — GEO Multi-Select

| # | Step | Expected |
|---|------|----------|
| 1 | Click GEO dropdown | Dropdown opens with "All" + 6 geos |
| 2 | Select "AP" only | Data scales to ~1/6 of total |
| 3 | Deselect all (click "All" to toggle off) | Display shows "—", data shows full (empty = all) |

## TC-07: Opening Page — KPI Cards

| # | Step | Expected |
|---|------|----------|
| 1 | View 5 KPI cards | Revenue, Gross Profit, GP%, Operating Income, Net Income |
| 2 | Each card shows | Value (bold), YoY change % (green up / red down), (?) tooltip icon |
| 3 | Hover (?) on Revenue card | Tooltip shows "Total income generated..." definition |
| 4 | Hover (?) on GP card | Tooltip shows definition + formula "Revenue - COGS" |

## TC-08: Opening Page — Actual vs Bloomberg Consensus

| # | Step | Expected |
|---|------|----------|
| 1 | View tabbed chart | 5 tabs: Revenue, Gross Profit, GP%, Operating Income, Net Income |
| 2 | Revenue tab active | Dual-axis: blue bars (actual) + orange bars (consensus) + green Beat% line |
| 3 | Data table below | 5 columns (5 quarters), rows: Actual, Consensus, Delta, Beat % |
| 4 | Table columns align with X-axis | Column positions match bar chart quarter positions |
| 5 | Click "Gross Profit" tab | Chart switches to GP data, no consensus bars (GP has no consensus) |
| 6 | Click "Net Income" tab | Dual-axis returns (NI has consensus) |

## TC-09: Opening Page — Profitability Waterfall

| # | Step | Expected |
|---|------|----------|
| 1 | View waterfall chart | 7 steps: Revenue → COGS → Gross Profit → OpEx → Op. Income → Tax & Int. → Net Income |
| 2 | Total bars (GP, OI, NI) | Show value + margin % label on top (e.g. "$6.4B\n37.0%") |
| 3 | Below chart: QoQ/YoY annotations | Revenue, GP, OI, NI each show QoQ and YoY % (green positive, red negative) |
| 4 | Hover any bar | Tooltip shows value, margin, QoQ%, YoY% |

## TC-10: Opening Page — Margin Trends

| # | Step | Expected |
|---|------|----------|
| 1 | View margin trend chart | 3 lines: GP% (~37%), OI% (~12%), Net% (~9%) |
| 2 | X-axis | 5 quarters |
| 3 | Y-axis | Percentage format (e.g. "35%") |
| 4 | (?) tooltip on title | Shows GP% definition + formula |

## TC-11: Secondary Page — Tier 1: Forward-Looking Momentum

| # | Step | Expected |
|---|------|----------|
| 1 | Section header | "FORWARD-LOOKING MOMENTUM" (or Chinese equivalent) |
| 2 | Left: Pipeline & Backlog trend | 2-line chart over 5 quarters |
| 3 | Right: 3 KPIs stacked | Pipeline ($), Backlog ($), Coverage Ratio (x.xx) |
| 4 | Coverage Ratio < 2.0x | Card turns red (danger), shows alert triangle |
| 5 | Coverage Ratio 2.0–2.4x | Card turns orange (warning) |
| 6 | Hover (?) on Coverage Ratio | Shows "Pipeline / Revenue" formula |

## TC-12: Secondary Page — Tier 2: Profitability

| # | Step | Expected |
|---|------|----------|
| 1 | Waterfall chart | Revenue → ... → Net Income (9 steps), dashed budget line |
| 2 | Expense breakdown | Stacked bar: S&M (red) + R&D (blue) + Fixed (orange) |
| 3 | Expense ratio trends | 3 lines: S&M/Rev%, R&D/Rev%, Fixed/Rev%, Y-axis in % format |

## TC-13: Secondary Page — Tier 3: Asset Velocity

| # | Step | Expected |
|---|------|----------|
| 1 | WOI trend chart | Line with area fill, red dashed threshold line at 45 days |
| 2 | WOI KPI card | Shows days value, red if >= 45, orange if >= 40.5 |
| 3 | Inventory bar chart | 5-quarter bars in orange |

## TC-14: Secondary Page — Tier 4: Cash Flow

| # | Step | Expected |
|---|------|----------|
| 1 | AR vs AP chart | Blue bars (AR), green bars (AP), red CCC line on right axis (days) |
| 2 | CCC threshold line | Red dashed at 42 days |
| 3 | CCC KPI card | Orange warning if 37.8–42 days, red danger if >= 42 |
| 4 | AR and AP KPI cards | Show values with QoQ change |

## TC-15: Secondary Page — Full Metrics Table

| # | Step | Expected |
|---|------|----------|
| 1 | Always visible at bottom | 13 rows × 5 quarter columns |
| 2 | WOI and CCC rows | Display as "XX days" instead of currency |
| 3 | Change quarter filter | Table columns and data update |

## TC-16: Tertiary Page — Three Key Metrics

| # | Step | Expected |
|---|------|----------|
| 1 | Top row: 3 charts | Revenue by BG, Gross Profit by BG, Operating Income by BG |
| 2 | Each chart | Stacked bar (IDG red, ISG blue, SSG green) × 5 quarters |
| 3 | Filter to single BG | Only that BG's data shown in charts |

## TC-17: Tertiary Page — Treemap & Radar

| # | Step | Expected |
|---|------|----------|
| 1 | Treemap | Revenue share by BG → Geo hierarchy, click to drill down |
| 2 | Radar chart | 4-axis: Revenue, GP, GP%, OI — 3 BG polygons overlaid |
| 3 | BG Comparison table | Rows: IDG, ISG, SSG with Revenue, GP, GP%, OI columns |

## TC-18: InfoTooltip Portal

| # | Step | Expected |
|---|------|----------|
| 1 | Hover (?) icon inside a Card | Tooltip appears ABOVE the Card boundary (not clipped) |
| 2 | Tooltip near top of viewport | Tooltip flips to show below the icon |
| 3 | Tooltip with formula | Shows definition + formula line with monospace font |

## TC-19: Color Theme

| # | Step | Expected |
|---|------|----------|
| 1 | Accent/primary color | `#E12726` — active tabs, alert borders, negative values |
| 2 | Main titles/values | `#000000` — page titles, KPI values, chart title text |
| 3 | Background | `#F7F7F7` — page background |
| 4 | Secondary text | `#A2A2A2` — filter labels, axis labels, muted descriptions |

## TC-20: AI Chat

| # | Step | Expected |
|---|------|----------|
| 1 | Click "AI Assistant" button | Chat panel slides in from right |
| 2 | Type "Show me revenue" | Response with text + chart |
| 3 | Type "CCC trend" | Response about CCC with relevant data |
| 4 | Suggested query chips | Clickable, pre-fill the input |
