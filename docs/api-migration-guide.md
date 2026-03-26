# API Migration Guide: Mock Data → Real API

## Current Data Architecture

All page data comes from synchronous pure functions in `src/data/`:

| File | Functions | Used By |
|------|-----------|---------|
| `mock-opening.ts` | `getOpeningData(filters)`, `getMetricTrends(filters)`, `getProfitabilityWaterfall(filters)`, `getOpeningTrendData(filters)` | Opening Page |
| `mock-secondary.ts` | `getSecondaryData(filters)`, `getWaterfallData(filters)`, `getBudgetData(filters)`, `getThresholds()`, `getExpenseRatios(data)` | Operating Numbers Page |
| `mock-tertiary.ts` | `getTertiaryData(filters)`, `getIDGData(filters)`, `getBGSummary(filters)` | BG Breakdown Page |

Pages consume data via `useMemo(() => getXxxData(filters), [filters])` — synchronous, no loading/error states.

### Input: FilterState

All functions accept `FilterState`:

```ts
interface FilterState {
  timeGranularity: 'daily' | 'monthly' | 'quarterly';
  selectedBGs: ('PCSD' | 'MBG' | 'ISG' | 'SSG')[];
  selectedGeos: ('AP' | 'NA' | 'LA' | 'Europe' | 'Meta' | 'PRC')[];
  quarter: string; // e.g. "FY26Q1", "FY26Q1-M1", "FY26Q1-M3-D15"
}
```

### Output Types (in `src/types/index.ts`)

```ts
// Opening page
interface QuarterlyMetrics {
  revenues: MetricDataPoint;
  grossProfit: MetricDataPoint;
  grossProfitPct: MetricDataPoint;
  operatingIncome: MetricDataPoint;
  netIncome: MetricDataPoint;
  bloombergConsensusRevenues: number;
  bloombergConsensusNetIncome: number;
}

interface MetricDataPoint {
  period: string;
  actual: number;
  budget?: number;
  consensus?: number;
  priorYear?: number;
}

// Secondary page
interface OperatingMetrics {
  period: string;
  pipeline: number;
  backlog: number;
  revenues: number;
  cogs: number;
  grossProfit: number;
  smExpense: number;
  rdExpense: number;
  fixedExpense: number;
  inventory: number;
  woiIdg: number;       // days
  ar: number;
  ap: number;
  cccUnfunded: number;  // days
}

interface WaterfallStep {
  name: string;
  value: number;
  type: 'positive' | 'negative' | 'total';
}

interface BudgetData {
  period: string;
  revenueTarget: number;
  gpTarget: number;
  oiTarget: number;
}

interface ThresholdConfig {
  woiDanger: number;    // WOI >= this → danger (default: 45)
  cccDanger: number;    // CCC >= this → danger (default: 42)
  coverageMin: number;  // Coverage < this → danger (default: 2.0)
}

// Tertiary page
interface BGBreakdown {
  bg: 'PCSD' | 'MBG' | 'ISG' | 'SSG' | 'IDG';
  geo: 'AP' | 'NA' | 'LA' | 'Europe' | 'Meta' | 'PRC';
  period: string;
  revenues: number;
  grossProfit: number;
  grossProfitPct: number;
  operatingIncome: number;
}
```

---

## Migration Plan

### Phase 1: Abstract Data Layer (Zero Risk)

Create `src/services/` with async wrappers around existing mock functions:

```
src/services/
  opening-service.ts
  secondary-service.ts
  tertiary-service.ts
```

Example:
```ts
// src/services/opening-service.ts
import { getOpeningData } from '@/data/mock-opening';
import type { FilterState, QuarterlyMetrics } from '@/types';

export async function fetchOpeningData(filters: FilterState): Promise<QuarterlyMetrics> {
  // Phase 1: wrap mock as async
  return getOpeningData(filters);

  // Phase 4: replace with real API call
  // const params = new URLSearchParams({
  //   quarter: filters.quarter,
  //   bgs: filters.selectedBGs.join(','),
  //   geos: filters.selectedGeos.join(','),
  // });
  // const res = await fetch(`/api/v1/opening?${params}`);
  // return res.json();
}
```

### Phase 2: Introduce React Query

Install TanStack Query:
```bash
npm install @tanstack/react-query
```

Wrap App with `QueryClientProvider`, then replace `useMemo` with `useQuery`:

```ts
// Before
const data = useMemo(() => getOpeningData(filters), [filters]);

// After
const { data, isLoading, error } = useQuery({
  queryKey: ['opening', filters],
  queryFn: () => fetchOpeningData(filters),
  staleTime: 5 * 60 * 1000, // 5 min cache
});
```

Add `<LoadingSkeleton />` and `<ErrorBanner />` components for loading/error states.

### Phase 3: Build BFF (Backend For Frontend)

Recommended API endpoints:

```
GET /api/v1/opening
  ?quarter=FY26Q1
  &bgs=PCSD,MBG,ISG,SSG
  &geos=AP,NA,LA,Europe,Meta,PRC
  → QuarterlyMetrics

GET /api/v1/opening/trends
  ?quarter=FY26Q1&periods=5
  &bgs=...&geos=...
  → { quarters: string[], series: { revenues: number[], grossProfit: number[], operatingIncome: number[], netIncome: number[], consensus: number[] } }

GET /api/v1/opening/profitability
  ?quarter=FY26Q1&bgs=...&geos=...
  → ProfitWaterfallItem[]

GET /api/v1/operating
  ?quarter=FY26Q1&bgs=...&geos=...
  → OperatingMetrics[]

GET /api/v1/operating/waterfall
  ?quarter=FY26Q1&bgs=...&geos=...
  → WaterfallStep[]

GET /api/v1/operating/budget
  ?quarter=FY26Q1
  → BudgetData[]

GET /api/v1/operating/thresholds
  ?bg=IDG
  → ThresholdConfig

GET /api/v1/bg-breakdown
  ?quarter=FY26Q1&bgs=ISG,SSG&geos=AP,NA
  → BGBreakdown[]

GET /api/v1/consensus
  ?quarter=FY26Q1
  → { revenues: number, netIncome: number }
```

Key principles:
- Filtering (BG, Geo, Quarter) via query params — backend aggregates
- Response types match existing TypeScript interfaces exactly
- `getExpenseRatios()` remains a frontend-only computation (derived from OperatingMetrics)

### Phase 4: Connect Real Data Sources

Replace mock service implementations one endpoint at a time:

| Endpoint | Data Source | Refresh Frequency |
|----------|------------|-------------------|
| `/opening`, `/operating` | ERP / SAP Financial System | Daily or real-time |
| `/consensus` | Bloomberg Terminal API | Monthly (or real-time with subscription) |
| `/operating/budget` | Budget Planning System | Quarterly |
| Pipeline / Backlog | CRM (Salesforce) | Daily |
| `/operating/thresholds` | Admin config / database | Manual |

### Phase 5: Real-time / Streaming (Optional)

For real-time Bloomberg consensus updates:
- WebSocket or SSE connection for `/consensus` endpoint
- React Query's `refetchInterval` for periodic polling alternative
- Consider `staleTime: 0` for consensus data during earnings season

---

## Rollback Strategy

Each phase is independently reversible:
- Services can fall back to mock functions by reverting the import
- React Query can coexist with `useMemo` during transition
- BFF can return mock data if upstream APIs are unavailable
- Feature flags can toggle between mock/real per endpoint

---

## File Mapping: Mock → Service → API

| Mock File | Service File | API Endpoint |
|-----------|-------------|-------------|
| `mock-opening.ts` → `getOpeningData()` | `opening-service.ts` → `fetchOpeningData()` | `GET /api/v1/opening` |
| `mock-opening.ts` → `getMetricTrends()` | `opening-service.ts` → `fetchMetricTrends()` | `GET /api/v1/opening/trends` |
| `mock-opening.ts` → `getProfitabilityWaterfall()` | `opening-service.ts` → `fetchProfitWaterfall()` | `GET /api/v1/opening/profitability` |
| `mock-opening.ts` → `getOpeningTrendData()` | `opening-service.ts` → `fetchTrendData()` | `GET /api/v1/opening/trends` |
| `mock-secondary.ts` → `getSecondaryData()` | `secondary-service.ts` → `fetchSecondaryData()` | `GET /api/v1/operating` |
| `mock-secondary.ts` → `getWaterfallData()` | `secondary-service.ts` → `fetchWaterfall()` | `GET /api/v1/operating/waterfall` |
| `mock-secondary.ts` → `getBudgetData()` | `secondary-service.ts` → `fetchBudget()` | `GET /api/v1/operating/budget` |
| `mock-secondary.ts` → `getThresholds()` | `secondary-service.ts` → `fetchThresholds()` | `GET /api/v1/operating/thresholds` |
| `mock-secondary.ts` → `getExpenseRatios()` | (stays in frontend) | N/A — derived from OperatingMetrics |
| `mock-tertiary.ts` → `getTertiaryData()` | `tertiary-service.ts` → `fetchTertiaryData()` | `GET /api/v1/bg-breakdown` |
| `mock-tertiary.ts` → `getIDGData()` | `tertiary-service.ts` → `fetchIDGData()` | `GET /api/v1/bg-breakdown?bgs=PCSD,MBG` |
| `mock-tertiary.ts` → `getBGSummary()` | `tertiary-service.ts` → `fetchBGSummary()` | `GET /api/v1/bg-breakdown/summary` |
