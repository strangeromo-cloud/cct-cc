# CFO Control Tower — Project Guide

## Overview

A professional CFO dashboard for Lenovo finance teams. 3-tier drill-down views with AI chat, multi-dimensional filtering, and Bloomberg consensus comparison. All data is currently mock — see `docs/api-migration-guide.md` for real API migration plan.

## Tech Stack

- **Framework**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS v4 + shadcn/ui (base-ui primitives)
- **Charts**: Apache ECharts via `echarts-for-react`
- **Routing**: React Router v6
- **State**: React Context (FilterContext, ChatContext, LanguageContext)
- **i18n**: Custom lightweight system (translations.ts + useLanguage hook)

## Project Structure

```
src/
  components/
    layout/          # AppLayout, Header, FilterBar
    charts/          # BaseChart, 10 chart wrappers, KPICard, InfoTooltip, ChartTitle
    ai-chat/         # ChatPanel, ChatMessage, ChatInput, SuggestedQueries
    ui/              # shadcn components (card, select, tooltip, etc.)
  pages/
    opening/         # Quarter Overview (KPIs, consensus, profitability waterfall, margin trends)
    secondary/       # Operating Numbers (4-tier CFO view: Momentum → Profitability → Asset → Cash)
      TierMomentum.tsx
      TierProfitability.tsx
      TierAssetVelocity.tsx
      TierCashFlow.tsx
    tertiary/        # BG Breakdown (Revenue/GP/OI by IDG/ISG/SSG)
  data/
    constants.ts     # BGs, Geos, Quarters, period helpers, colors
    mock-opening.ts  # Opening page mock data
    mock-secondary.ts # Secondary page mock data
    mock-tertiary.ts  # Tertiary page mock data
    translations.ts   # EN/ZH translations
    metric-definitions.ts # Metric tooltips (definition + formula)
    ai-responses.ts   # AI chat response templates
  context/           # FilterContext, ChatContext, LanguageContext
  hooks/             # useFilters, useAIChat, useLanguage
  types/             # TypeScript interfaces + i18n types
  utils/             # formatters, chart-theme
  docs/              # API migration guide
```

## Color Scheme

| Role | Color | Usage |
|------|-------|-------|
| Accent / Primary | `#E12726` | Brand red, active tabs, alerts, ring |
| Foreground / Titles | `#000000` | Main headings, card values, chart text |
| Background | `#F7F7F7` | Page background |
| Muted / Secondary text | `#A2A2A2` | Labels, axis text, descriptions |
| Card | `#FFFFFF` | Card backgrounds |
| Positive | `#00A650` | Green for uptrends, AP bars |
| Chart Blue | `#0073CE` | Primary chart series, AR bars |
| Chart Orange | `#F5A623` | Secondary series, WOI line |

## Key Patterns

### Data Flow
Pages use `useMemo(() => mockFunction(filters), [filters])` for reactive data. When migrating to API, replace with React Query `useQuery`.

### Filtering
`FilterContext` holds global state. FilterBar reads route to conditionally show/hide time granularity (hidden on opening page). Empty BG/GEO selection = all (scale factor defaults to full).

### i18n
`LanguageContext` with `localStorage('cct-language')` persistence. All UI text goes through `translations.ts`. Metric tooltips are in `metric-definitions.ts` with both EN/ZH.

### Alert System
`KPICard` supports `alertStatus: 'normal' | 'warning' | 'danger'`. Thresholds defined in `getThresholds()` — WOI >= 45 days = danger, CCC >= 42 days = danger, Coverage < 2.0x = danger.

### InfoTooltip
Uses React Portal (`createPortal` to `document.body`) to escape Card `overflow:hidden`. Hover (?) icon shows metric definition + formula.

## Commands

```bash
npm run dev       # Start dev server (port 5173)
npm run build     # Production build
npx tsc --noEmit  # Type check
```

## Known Issues

- `@base-ui/react` Select/Separator components produce "Invalid hook call" console warnings in strict mode. Purely cosmetic — app functions correctly.
- Separator component replaced with plain `<div className="h-px bg-border" />` in secondary page to reduce hook warnings.
