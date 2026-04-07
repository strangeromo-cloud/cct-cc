import { describe, it, expect } from 'vitest';
import { getOpeningData, getMetricTrends } from '../mock-opening';
import { BUSINESS_GROUPS, GEOGRAPHIES, CURRENT_QUARTER } from '../constants';
import type { FilterState } from '@/types';

const defaultFilters: FilterState = {
  timeGranularity: 'quarterly',
  selectedBGs: [...BUSINESS_GROUPS],
  selectedGeos: [...GEOGRAPHIES],
  quarter: CURRENT_QUARTER,
};

describe('getOpeningData', () => {
  it('returns all required metric fields', () => {
    const data = getOpeningData(defaultFilters);
    expect(data).toHaveProperty('revenues');
    expect(data).toHaveProperty('grossProfit');
    expect(data).toHaveProperty('grossProfitPct');
    expect(data).toHaveProperty('operatingIncome');
    expect(data).toHaveProperty('netIncome');
    expect(data).toHaveProperty('bloombergConsensusRevenues');
    expect(data).toHaveProperty('bloombergConsensusNetIncome');
  });

  it('revenue actual should be positive', () => {
    const data = getOpeningData(defaultFilters);
    expect(data.revenues.actual).toBeGreaterThan(0);
  });

  it('grossProfitPct should be a percentage value (0-100 range)', () => {
    const data = getOpeningData(defaultFilters);
    expect(data.grossProfitPct.actual).toBeGreaterThan(0);
    expect(data.grossProfitPct.actual).toBeLessThan(100);
  });

  it('scales data based on selected BGs', () => {
    const allBGs = getOpeningData(defaultFilters);
    const oneBG = getOpeningData({ ...defaultFilters, selectedBGs: ['IDG'] });
    expect(oneBG.revenues.actual).toBeLessThan(allBGs.revenues.actual);
  });

  it('handles month period by mapping to parent quarter', () => {
    const data = getOpeningData({ ...defaultFilters, quarter: `${CURRENT_QUARTER}-M1` });
    expect(data.revenues.actual).toBeGreaterThan(0);
  });
});

describe('getMetricTrends', () => {
  it('returns 5 metric trend items', () => {
    const trends = getMetricTrends(defaultFilters);
    expect(trends).toHaveLength(5);
  });

  it('each trend has points array with quarter data', () => {
    const trends = getMetricTrends(defaultFilters);
    for (const t of trends) {
      expect(t.points.length).toBeGreaterThanOrEqual(1);
      expect(t.points.length).toBeLessThanOrEqual(5);
      for (const p of t.points) {
        expect(p).toHaveProperty('quarter');
        expect(p).toHaveProperty('actual');
      }
    }
  });

  it('revenue and net income have consensus data', () => {
    const trends = getMetricTrends(defaultFilters);
    const revTrend = trends.find(t => t.key === 'revenues');
    const niTrend = trends.find(t => t.key === 'netIncome');
    expect(revTrend?.hasConsensus).toBe(true);
    expect(niTrend?.hasConsensus).toBe(true);
  });

  it('gross profit pct does NOT have consensus data', () => {
    const trends = getMetricTrends(defaultFilters);
    const gpPct = trends.find(t => t.key === 'grossProfitPct');
    expect(gpPct?.hasConsensus).toBe(false);
  });
});
