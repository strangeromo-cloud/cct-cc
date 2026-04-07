import { describe, it, expect } from 'vitest';
import { getSecondaryData, getWaterfallData, getBudgetData, getExpenseRatios } from '../mock-secondary';
import { BUSINESS_GROUPS, GEOGRAPHIES, CURRENT_QUARTER } from '../constants';
import type { FilterState } from '@/types';

const defaultFilters: FilterState = {
  timeGranularity: 'quarterly',
  selectedBGs: [...BUSINESS_GROUPS],
  selectedGeos: [...GEOGRAPHIES],
  quarter: CURRENT_QUARTER,
};

describe('getSecondaryData', () => {
  it('returns up to 5 quarters of operating data', () => {
    const data = getSecondaryData(defaultFilters);
    expect(data.length).toBeLessThanOrEqual(5);
    expect(data.length).toBeGreaterThanOrEqual(1);
  });

  it('each entry has all required operating metrics', () => {
    const data = getSecondaryData(defaultFilters);
    const first = data[0];
    expect(first).toHaveProperty('pipeline');
    expect(first).toHaveProperty('backlog');
    expect(first).toHaveProperty('revenues');
    expect(first).toHaveProperty('cogs');
    expect(first).toHaveProperty('grossProfit');
    expect(first).toHaveProperty('smExpense');
    expect(first).toHaveProperty('rdExpense');
    expect(first).toHaveProperty('fixedExpense');
    expect(first).toHaveProperty('inventory');
    expect(first).toHaveProperty('woiIdg');
    expect(first).toHaveProperty('ar');
    expect(first).toHaveProperty('ap');
    expect(first).toHaveProperty('cccUnfunded');
  });

  it('revenues should be positive', () => {
    const data = getSecondaryData(defaultFilters);
    for (const d of data) {
      expect(d.revenues).toBeGreaterThan(0);
    }
  });
});

describe('getWaterfallData', () => {
  it('returns waterfall steps from revenue to net income', () => {
    const steps = getWaterfallData(defaultFilters);
    expect(steps.length).toBeGreaterThanOrEqual(5);
    expect(steps[0].name).toContain('Revenue');
  });

  it('contains both positive and negative steps', () => {
    const steps = getWaterfallData(defaultFilters);
    const types = steps.map(s => s.type);
    expect(types).toContain('positive');
    expect(types).toContain('negative');
  });

  it('last step is Net Income (total type)', () => {
    const steps = getWaterfallData(defaultFilters);
    expect(steps[steps.length - 1].name).toContain('Net Income');
    expect(steps[steps.length - 1].type).toBe('total');
  });
});

describe('getBudgetData', () => {
  it('returns an array of budget data per quarter', () => {
    const data = getBudgetData(defaultFilters);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it('each entry has period and target fields', () => {
    const data = getBudgetData(defaultFilters);
    for (const d of data) {
      expect(d).toHaveProperty('period');
      expect(d).toHaveProperty('revenueTarget');
      expect(d).toHaveProperty('gpTarget');
      expect(d).toHaveProperty('oiTarget');
      expect(d.revenueTarget).toBeGreaterThan(0);
    }
  });
});

describe('getExpenseRatios', () => {
  it('returns expense ratios with periods and percentage arrays', () => {
    const opData = getSecondaryData(defaultFilters);
    const ratios = getExpenseRatios(opData);
    expect(ratios).toHaveProperty('periods');
    expect(ratios).toHaveProperty('smPct');
    expect(ratios).toHaveProperty('rdPct');
    expect(ratios).toHaveProperty('fixedPct');
    expect(ratios.periods.length).toBe(opData.length);
  });

  it('expense ratios should be positive percentages', () => {
    const opData = getSecondaryData(defaultFilters);
    const ratios = getExpenseRatios(opData);
    for (const val of ratios.smPct) {
      expect(val).toBeGreaterThan(0);
      expect(val).toBeLessThan(100);
    }
  });
});
