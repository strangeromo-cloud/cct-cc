import type { EChartsOption } from 'echarts';

export type TimeGranularity = 'daily' | 'monthly' | 'quarterly';

export type BusinessGroup = 'IDG' | 'ISG' | 'SSG';

export type Geography = 'AP' | 'NA' | 'LA' | 'Europe' | 'Meta' | 'PRC';

export interface FilterState {
  timeGranularity: TimeGranularity;
  selectedBGs: BusinessGroup[];
  selectedGeos: Geography[];
  quarter: string;
}

export interface MetricDataPoint {
  period: string;
  actual: number;
  budget?: number;
  consensus?: number;
  priorYear?: number;
}

export interface QuarterlyMetrics {
  revenues: MetricDataPoint;
  grossProfit: MetricDataPoint;
  grossProfitPct: MetricDataPoint;
  operatingIncome: MetricDataPoint;
  netIncome: MetricDataPoint;
  bloombergConsensusRevenues: number;
  bloombergConsensusNetIncome: number;
}

export interface OperatingMetrics {
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
  woiIdg: number;
  ar: number;
  ap: number;
  cccUnfunded: number;
}

export interface BGBreakdown {
  bg: BusinessGroup | 'PCSD' | 'MBG';
  geo: Geography;
  period: string;
  revenues: number;
  grossProfit: number;
  grossProfitPct: number;
  operatingIncome: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  chartData?: EChartsOption | null;
  timestamp: Date;
}

export interface WaterfallStep {
  name: string;
  value: number;
  type: 'positive' | 'negative' | 'total';
}

export interface BudgetData {
  period: string;
  revenueTarget: number;
  gpTarget: number;
  oiTarget: number;
}

export interface ThresholdConfig {
  woiDanger: number;
  cccDanger: number;
  coverageMin: number;
}

export interface ExpenseRatios {
  periods: string[];
  smPct: number[];
  rdPct: number[];
  fixedPct: number[];
}
