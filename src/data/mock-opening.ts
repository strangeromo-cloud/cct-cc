import type { FilterState, QuarterlyMetrics } from '@/types';
import { QUARTERS, periodToQuarter } from './constants';

function seed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return Math.abs(h);
}

function vary(base: number, key: string, range: number): number {
  const s = seed(key);
  return base + (s % (range * 2) - range);
}

// Values in $M — multiplied by 1e6 at output for correct display
const M = 1e6;
const baseMetrics: Record<string, { rev: number; gp: number; gpPct: number; oi: number; ni: number }> = {
  FY24Q1: { rev: 14200, gp: 4970, gpPct: 35.0, oi: 1420, ni: 1065 },
  FY24Q2: { rev: 13800, gp: 4830, gpPct: 35.0, oi: 1380, ni: 1035 },
  FY24Q3: { rev: 15100, gp: 5435, gpPct: 36.0, oi: 1662, ni: 1247 },
  FY24Q4: { rev: 17800, gp: 6408, gpPct: 36.0, oi: 2136, ni: 1602 },
  FY25Q1: { rev: 15600, gp: 5616, gpPct: 36.0, oi: 1716, ni: 1287 },
  FY25Q2: { rev: 15200, gp: 5472, gpPct: 36.0, oi: 1672, ni: 1254 },
  FY25Q3: { rev: 16800, gp: 6216, gpPct: 37.0, oi: 1932, ni: 1449 },
  FY25Q4: { rev: 19200, gp: 7104, gpPct: 37.0, oi: 2304, ni: 1728 },
  FY26Q1: { rev: 17200, gp: 6364, gpPct: 37.0, oi: 2064, ni: 1548 },
};

export function getOpeningData(filters: FilterState): QuarterlyMetrics {
  const q = periodToQuarter(filters.quarter);
  const base = baseMetrics[q] ?? baseMetrics.FY25Q3;
  const bgFactor = (filters.selectedBGs.length || 4) / 4;
  const geoFactor = (filters.selectedGeos.length || 6) / 6;
  const scale = bgFactor * geoFactor;

  const rev = Math.round(base.rev * scale * M);
  const gp = Math.round(base.gp * scale * M);
  const oi = Math.round(base.oi * scale * M);
  const ni = Math.round(base.ni * scale * M);

  const prevQ = QUARTERS[Math.max(0, QUARTERS.indexOf(q) - 1)];
  const prevBase = baseMetrics[prevQ] ?? baseMetrics.FY24Q3;
  const prevScale = scale;

  return {
    revenues: {
      period: q,
      actual: rev,
      budget: Math.round(rev * 1.02),
      priorYear: Math.round(prevBase.rev * prevScale * M * 0.92),
    },
    grossProfit: {
      period: q,
      actual: gp,
      budget: Math.round(gp * 1.01),
      priorYear: Math.round(prevBase.gp * prevScale * M * 0.92),
    },
    grossProfitPct: {
      period: q,
      actual: base.gpPct,
      budget: base.gpPct - 0.5,
      priorYear: base.gpPct - 1.2,
    },
    operatingIncome: {
      period: q,
      actual: oi,
      budget: Math.round(oi * 1.03),
      priorYear: Math.round(prevBase.oi * prevScale * M * 0.90),
    },
    netIncome: {
      period: q,
      actual: ni,
      budget: Math.round(ni * 1.02),
      priorYear: Math.round(prevBase.ni * prevScale * M * 0.90),
    },
    bloombergConsensusRevenues: Math.round(rev * vary(98, q + 'rev', 3) / 100),
    bloombergConsensusNetIncome: Math.round(ni * vary(97, q + 'ni', 4) / 100),
  };
}

export interface ProfitWaterfallItem {
  name: string;
  value: number;
  type: 'positive' | 'negative' | 'total';
  margin?: string;   // e.g. "37.0%"
  qoqPct?: number;   // QoQ change %
  yoyPct?: number;   // YoY change %
}

export function getProfitabilityWaterfall(filters: FilterState): ProfitWaterfallItem[] {
  const q = periodToQuarter(filters.quarter);
  const base = baseMetrics[q] ?? baseMetrics.FY25Q3;
  const bgFactor = (filters.selectedBGs.length || 4) / 4;
  const geoFactor = (filters.selectedGeos.length || 6) / 6;
  const scale = bgFactor * geoFactor;

  const rev = Math.round(base.rev * scale * M);
  const gp = Math.round(base.gp * scale * M);
  const oi = Math.round(base.oi * scale * M);
  const ni = Math.round(base.ni * scale * M);
  const cogs = rev - gp;
  const opex = gp - oi;
  const belowOI = oi - ni; // tax + interest

  // QoQ (previous quarter)
  const qIdx = QUARTERS.indexOf(q);
  const prevQ = qIdx > 0 ? QUARTERS[qIdx - 1] : q;
  const pBase = baseMetrics[prevQ] ?? base;
  const pRev = Math.round(pBase.rev * scale * M);
  const pGP = Math.round(pBase.gp * scale * M);
  const pOI = Math.round(pBase.oi * scale * M);
  const pNI = Math.round(pBase.ni * scale * M);

  // YoY (same quarter last year — 4 quarters back)
  const yoyQ = qIdx >= 4 ? QUARTERS[qIdx - 4] : QUARTERS[0];
  const yBase = baseMetrics[yoyQ] ?? base;
  const yRev = Math.round(yBase.rev * scale * M);
  const yGP = Math.round(yBase.gp * scale * M);
  const yOI = Math.round(yBase.oi * scale * M);
  const yNI = Math.round(yBase.ni * scale * M);

  const pct = (cur: number, prev: number) => prev !== 0 ? Math.round((cur - prev) / Math.abs(prev) * 1000) / 10 : 0;

  return [
    { name: 'Revenue', value: rev, type: 'positive', qoqPct: pct(rev, pRev), yoyPct: pct(rev, yRev) },
    { name: 'COGS', value: -cogs, type: 'negative' },
    { name: 'Gross Profit', value: gp, type: 'total', margin: `${base.gpPct.toFixed(1)}%`, qoqPct: pct(gp, pGP), yoyPct: pct(gp, yGP) },
    { name: 'OpEx', value: -opex, type: 'negative' },
    { name: 'Op. Income', value: oi, type: 'total', margin: `${(base.oi / base.rev * 100).toFixed(1)}%`, qoqPct: pct(oi, pOI), yoyPct: pct(oi, yOI) },
    { name: 'Tax & Int.', value: -belowOI, type: 'negative' },
    { name: 'Net Income', value: ni, type: 'total', margin: `${(base.ni / base.rev * 100).toFixed(1)}%`, qoqPct: pct(ni, pNI), yoyPct: pct(ni, yNI) },
  ];
}

export function getOpeningTrendData(filters: FilterState): { quarters: string[]; series: Record<string, number[]> } {
  const idx = QUARTERS.indexOf(periodToQuarter(filters.quarter));
  const startIdx = Math.max(0, idx - 4);
  const quarters = QUARTERS.slice(startIdx, idx + 1);
  const bgFactor = (filters.selectedBGs.length || 4) / 4;
  const geoFactor = (filters.selectedGeos.length || 6) / 6;
  const scale = bgFactor * geoFactor;

  const revenues: number[] = [];
  const grossProfit: number[] = [];
  const operatingIncome: number[] = [];
  const netIncome: number[] = [];
  const consensus: number[] = [];

  for (const q of quarters) {
    const base = baseMetrics[q] ?? baseMetrics.FY25Q3;
    revenues.push(Math.round(base.rev * scale * M));
    grossProfit.push(Math.round(base.gp * scale * M));
    operatingIncome.push(Math.round(base.oi * scale * M));
    netIncome.push(Math.round(base.ni * scale * M));
    consensus.push(Math.round(base.rev * scale * M * vary(98, q + 'c', 3) / 100));
  }

  return { quarters, series: { revenues, grossProfit, operatingIncome, netIncome, consensus } };
}

export interface MetricTrendPoint {
  quarter: string;
  actual: number;
  consensus?: number;
  beatPct?: number; // (actual - consensus) / consensus * 100
}

export interface MetricTrendData {
  key: string;
  label: string;
  isPercent: boolean;
  hasConsensus: boolean;
  points: MetricTrendPoint[];
}

export function getMetricTrends(filters: FilterState): MetricTrendData[] {
  const idx = QUARTERS.indexOf(periodToQuarter(filters.quarter));
  const startIdx = Math.max(0, idx - 4);
  const quarters = QUARTERS.slice(startIdx, idx + 1);
  const bgFactor = (filters.selectedBGs.length || 4) / 4;
  const geoFactor = (filters.selectedGeos.length || 6) / 6;
  const scale = bgFactor * geoFactor;

  const metrics: MetricTrendData[] = [
    { key: 'revenues', label: 'Revenue', isPercent: false, hasConsensus: true, points: [] },
    { key: 'grossProfit', label: 'Gross Profit', isPercent: false, hasConsensus: false, points: [] },
    { key: 'grossProfitPct', label: 'Gross Profit %', isPercent: true, hasConsensus: false, points: [] },
    { key: 'operatingIncome', label: 'Operating Income', isPercent: false, hasConsensus: false, points: [] },
    { key: 'netIncome', label: 'Net Income', isPercent: false, hasConsensus: true, points: [] },
  ];

  for (const q of quarters) {
    const base = baseMetrics[q] ?? baseMetrics.FY25Q3;
    const rev = Math.round(base.rev * scale * M);
    const gp = Math.round(base.gp * scale * M);
    const oi = Math.round(base.oi * scale * M);
    const ni = Math.round(base.ni * scale * M);
    const consensusRev = Math.round(rev * vary(98, q + 'rev', 3) / 100);
    const consensusNI = Math.round(ni * vary(97, q + 'ni', 4) / 100);

    metrics[0].points.push({
      quarter: q,
      actual: rev,
      consensus: consensusRev,
      beatPct: consensusRev !== 0 ? Math.round((rev - consensusRev) / consensusRev * 1000) / 10 : 0,
    });
    metrics[1].points.push({ quarter: q, actual: gp });
    metrics[2].points.push({ quarter: q, actual: base.gpPct });
    metrics[3].points.push({ quarter: q, actual: oi });
    metrics[4].points.push({
      quarter: q,
      actual: ni,
      consensus: consensusNI,
      beatPct: consensusNI !== 0 ? Math.round((ni - consensusNI) / consensusNI * 1000) / 10 : 0,
    });
  }

  return metrics;
}

export function getConsensusComparison(filters: FilterState): Array<{
  metric: string;
  actual: number;
  consensus: number;
  delta: number;
  unit: string;
}> {
  const data = getOpeningData(filters);
  return [
    {
      metric: 'Revenues',
      actual: data.revenues.actual,
      consensus: data.bloombergConsensusRevenues,
      delta: data.revenues.actual - data.bloombergConsensusRevenues,
      unit: '$M',
    },
    {
      metric: 'Gross Profit',
      actual: data.grossProfit.actual,
      consensus: Math.round(data.bloombergConsensusRevenues * data.grossProfitPct.actual / 100),
      delta: data.grossProfit.actual - Math.round(data.bloombergConsensusRevenues * data.grossProfitPct.actual / 100),
      unit: '$M',
    },
    {
      metric: 'Gross Profit %',
      actual: data.grossProfitPct.actual,
      consensus: data.grossProfitPct.actual - 0.8,
      delta: 0.8,
      unit: '%',
    },
    {
      metric: 'Operating Income',
      actual: data.operatingIncome.actual,
      consensus: Math.round(data.operatingIncome.actual * 0.97),
      delta: Math.round(data.operatingIncome.actual * 0.03),
      unit: '$M',
    },
    {
      metric: 'Net Income',
      actual: data.netIncome.actual,
      consensus: data.bloombergConsensusNetIncome,
      delta: data.netIncome.actual - data.bloombergConsensusNetIncome,
      unit: '$M',
    },
  ];
}
