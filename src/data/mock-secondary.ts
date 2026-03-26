import type { FilterState, OperatingMetrics, WaterfallStep, BudgetData, ThresholdConfig, ExpenseRatios } from '@/types';
import { QUARTERS, periodToQuarter } from './constants';

const M = 1e6;

const baseData: Record<string, OperatingMetrics> = {
  FY24Q1: { period: 'FY24Q1', pipeline: 28000, backlog: 12500, revenues: 14200, cogs: 9230, grossProfit: 4970, smExpense: 1200, rdExpense: 1100, fixedExpense: 1250, inventory: 8500, woiIdg: 42, ar: 6800, ap: 5200, cccUnfunded: 38 },
  FY24Q2: { period: 'FY24Q2', pipeline: 27200, backlog: 12000, revenues: 13800, cogs: 8970, grossProfit: 4830, smExpense: 1180, rdExpense: 1080, fixedExpense: 1190, inventory: 8200, woiIdg: 40, ar: 6600, ap: 5100, cccUnfunded: 36 },
  FY24Q3: { period: 'FY24Q3', pipeline: 30500, backlog: 13200, revenues: 15100, cogs: 9665, grossProfit: 5435, smExpense: 1260, rdExpense: 1150, fixedExpense: 1363, inventory: 8800, woiIdg: 44, ar: 7200, ap: 5500, cccUnfunded: 40 },
  FY24Q4: { period: 'FY24Q4', pipeline: 34000, backlog: 15000, revenues: 17800, cogs: 11392, grossProfit: 6408, smExpense: 1420, rdExpense: 1300, fixedExpense: 1552, inventory: 9500, woiIdg: 48, ar: 8500, ap: 6300, cccUnfunded: 42 },
  FY25Q1: { period: 'FY25Q1', pipeline: 31000, backlog: 13500, revenues: 15600, cogs: 9984, grossProfit: 5616, smExpense: 1300, rdExpense: 1200, fixedExpense: 1400, inventory: 8900, woiIdg: 43, ar: 7400, ap: 5600, cccUnfunded: 39 },
  FY25Q2: { period: 'FY25Q2', pipeline: 30200, backlog: 13000, revenues: 15200, cogs: 9728, grossProfit: 5472, smExpense: 1280, rdExpense: 1180, fixedExpense: 1340, inventory: 8600, woiIdg: 41, ar: 7200, ap: 5500, cccUnfunded: 37 },
  FY25Q3: { period: 'FY25Q3', pipeline: 33500, backlog: 14500, revenues: 16800, cogs: 10584, grossProfit: 6216, smExpense: 1380, rdExpense: 1280, fixedExpense: 1626, inventory: 9200, woiIdg: 46, ar: 8000, ap: 6000, cccUnfunded: 41 },
  FY25Q4: { period: 'FY25Q4', pipeline: 37000, backlog: 16500, revenues: 19200, cogs: 12096, grossProfit: 7104, smExpense: 1520, rdExpense: 1400, fixedExpense: 1880, inventory: 10000, woiIdg: 50, ar: 9200, ap: 6800, cccUnfunded: 44 },
  FY26Q1: { period: 'FY26Q1', pipeline: 34200, backlog: 14800, revenues: 17200, cogs: 10836, grossProfit: 6364, smExpense: 1380, rdExpense: 1280, fixedExpense: 1640, inventory: 9400, woiIdg: 45, ar: 8200, ap: 6100, cccUnfunded: 40 },
};

export function getSecondaryData(filters: FilterState): OperatingMetrics[] {
  const idx = QUARTERS.indexOf(periodToQuarter(filters.quarter));
  const startIdx = Math.max(0, idx - 4);
  const quarters = QUARTERS.slice(startIdx, idx + 1);
  const bgFactor = (filters.selectedBGs.length || 4) / 4;
  const geoFactor = (filters.selectedGeos.length || 6) / 6;
  const scale = bgFactor * geoFactor;

  return quarters.map((q) => {
    const d = baseData[q] ?? baseData.FY25Q3;
    return {
      period: q,
      pipeline: Math.round(d.pipeline * scale * M),
      backlog: Math.round(d.backlog * scale * M),
      revenues: Math.round(d.revenues * scale * M),
      cogs: Math.round(d.cogs * scale * M),
      grossProfit: Math.round(d.grossProfit * scale * M),
      smExpense: Math.round(d.smExpense * scale * M),
      rdExpense: Math.round(d.rdExpense * scale * M),
      fixedExpense: Math.round(d.fixedExpense * scale * M),
      inventory: Math.round(d.inventory * scale * M),
      woiIdg: d.woiIdg,
      ar: Math.round(d.ar * scale * M),
      ap: Math.round(d.ap * scale * M),
      cccUnfunded: d.cccUnfunded,
    };
  });
}

export function getWaterfallData(filters: FilterState): WaterfallStep[] {
  const idx = QUARTERS.indexOf(periodToQuarter(filters.quarter));
  const q = QUARTERS[idx] ?? 'FY25Q3';
  const d = baseData[q] ?? baseData.FY25Q3;
  const bgFactor = (filters.selectedBGs.length || 4) / 4;
  const geoFactor = (filters.selectedGeos.length || 6) / 6;
  const scale = bgFactor * geoFactor;

  const oi = (d.grossProfit - d.smExpense - d.rdExpense - d.fixedExpense) * scale * M;
  // Derive net income: OI minus ~25% tax & interest (consistent with opening page mock ratios)
  const ni = oi * 0.75;
  const taxInt = oi - ni;

  return [
    { name: 'Revenue', value: Math.round(d.revenues * scale * M), type: 'positive' },
    { name: 'COGS', value: -Math.round(d.cogs * scale * M), type: 'negative' },
    { name: 'Gross Profit', value: Math.round(d.grossProfit * scale * M), type: 'total' },
    { name: 'S&M', value: -Math.round(d.smExpense * scale * M), type: 'negative' },
    { name: 'R&D', value: -Math.round(d.rdExpense * scale * M), type: 'negative' },
    { name: 'Fixed', value: -Math.round(d.fixedExpense * scale * M), type: 'negative' },
    { name: 'Op. Income', value: Math.round(oi), type: 'total' },
    { name: 'Tax & Int.', value: -Math.round(taxInt), type: 'negative' },
    { name: 'Net Income', value: Math.round(ni), type: 'total' },
  ];
}

/* ------------------------------------------------------------------ */
/*  Budget / Threshold / Ratio helpers for CFO 4-tier view             */
/* ------------------------------------------------------------------ */

export function getBudgetData(filters: FilterState): BudgetData[] {
  const idx = QUARTERS.indexOf(periodToQuarter(filters.quarter));
  const startIdx = Math.max(0, idx - 4);
  const quarters = QUARTERS.slice(startIdx, idx + 1);
  const bgFactor = (filters.selectedBGs.length || 4) / 4;
  const geoFactor = (filters.selectedGeos.length || 6) / 6;
  const scale = bgFactor * geoFactor;

  return quarters.map((q) => {
    const d = baseData[q] ?? baseData.FY25Q3;
    // Budget is typically set at ~97-102% of actual (slight stretch target)
    const budgetFactor = 1.02;
    const oi = d.grossProfit - d.smExpense - d.rdExpense - d.fixedExpense;
    return {
      period: q,
      revenueTarget: Math.round(d.revenues * budgetFactor * scale * M),
      gpTarget: Math.round(d.grossProfit * budgetFactor * scale * M),
      oiTarget: Math.round(oi * budgetFactor * scale * M),
    };
  });
}

export function getThresholds(): ThresholdConfig {
  return { woiDanger: 45, cccDanger: 42, coverageMin: 2.0 };
}

export function getExpenseRatios(data: OperatingMetrics[]): ExpenseRatios {
  return {
    periods: data.map((d) => d.period),
    smPct: data.map((d) => (d.revenues > 0 ? (d.smExpense / d.revenues) * 100 : 0)),
    rdPct: data.map((d) => (d.revenues > 0 ? (d.rdExpense / d.revenues) * 100 : 0)),
    fixedPct: data.map((d) => (d.revenues > 0 ? (d.fixedExpense / d.revenues) * 100 : 0)),
  };
}
