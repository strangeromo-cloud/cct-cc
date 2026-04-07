import { describe, it, expect } from 'vitest';
import { getTertiaryData, getIDGData, getBGSummary } from '../mock-tertiary';
import { BUSINESS_GROUPS, GEOGRAPHIES, CURRENT_QUARTER } from '../constants';
import type { FilterState } from '@/types';

const defaultFilters: FilterState = {
  timeGranularity: 'quarterly',
  selectedBGs: [...BUSINESS_GROUPS],
  selectedGeos: [...GEOGRAPHIES],
  quarter: CURRENT_QUARTER,
};

describe('getTertiaryData', () => {
  it('returns breakdown data spanning up to 5 quarters', () => {
    const data = getTertiaryData(defaultFilters);
    expect(data.length).toBeGreaterThan(0);
    const periods = [...new Set(data.map(d => d.period))];
    expect(periods.length).toBeLessThanOrEqual(5);
  });

  it('includes PCSD, MBG, ISG, SSG as raw BGs', () => {
    const data = getTertiaryData(defaultFilters);
    const bgs = [...new Set(data.map(d => d.bg))];
    expect(bgs).toContain('PCSD');
    expect(bgs).toContain('MBG');
    expect(bgs).toContain('ISG');
    expect(bgs).toContain('SSG');
  });

  it('each entry has revenues, grossProfit, operatingIncome', () => {
    const data = getTertiaryData(defaultFilters);
    for (const d of data) {
      expect(d.revenues).toBeGreaterThan(0);
      expect(d).toHaveProperty('grossProfit');
      expect(d).toHaveProperty('operatingIncome');
      expect(d).toHaveProperty('grossProfitPct');
    }
  });
});

describe('getIDGData', () => {
  it('aggregates PCSD + MBG into IDG', () => {
    const data = getIDGData(defaultFilters);
    expect(data.length).toBeGreaterThan(0);
    for (const d of data) {
      expect(d.bg).toBe('IDG');
    }
  });

  it('IDG revenue should be > 0', () => {
    const data = getIDGData(defaultFilters);
    for (const d of data) {
      expect(d.revenues).toBeGreaterThan(0);
    }
  });
});

describe('getBGSummary', () => {
  it('returns summary for IDG, ISG, SSG', () => {
    const summary = getBGSummary(defaultFilters);
    expect(summary).toHaveLength(3);
    const bgNames = summary.map(s => s.bg);
    expect(bgNames).toContain('IDG');
    expect(bgNames).toContain('ISG');
    expect(bgNames).toContain('SSG');
  });

  it('each summary has revenue, GP, OI, and GP%', () => {
    const summary = getBGSummary(defaultFilters);
    for (const s of summary) {
      expect(s.revenues).toBeGreaterThan(0);
      expect(s).toHaveProperty('grossProfit');
      expect(s).toHaveProperty('operatingIncome');
      expect(s).toHaveProperty('grossProfitPct');
    }
  });
});

describe('BG filter expansion', () => {
  it('selecting only IDG expands to PCSD+MBG data', () => {
    const data = getTertiaryData({ ...defaultFilters, selectedBGs: ['IDG'] });
    const bgs = [...new Set(data.map(d => d.bg))];
    expect(bgs).toContain('PCSD');
    expect(bgs).toContain('MBG');
    expect(bgs).not.toContain('ISG');
    expect(bgs).not.toContain('SSG');
  });

  it('selecting only ISG returns only ISG data', () => {
    const data = getTertiaryData({ ...defaultFilters, selectedBGs: ['ISG'] });
    const bgs = [...new Set(data.map(d => d.bg))];
    expect(bgs).toContain('ISG');
    expect(bgs).not.toContain('PCSD');
    expect(bgs).not.toContain('SSG');
  });
});
