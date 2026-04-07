import { describe, it, expect } from 'vitest';
import {
  BUSINESS_GROUPS,
  GEOGRAPHIES,
  QUARTERS,
  CURRENT_QUARTER,
  periodToQuarter,
  periodLabel,
  generateMonths,
  generateDays,
  getDefaultPeriod,
  getPeriodsForGranularity,
} from '../constants';

describe('constants', () => {
  it('BUSINESS_GROUPS should be IDG/ISG/SSG', () => {
    expect(BUSINESS_GROUPS).toEqual(['IDG', 'ISG', 'SSG']);
  });

  it('GEOGRAPHIES should have 6 regions', () => {
    expect(GEOGRAPHIES).toHaveLength(6);
    expect(GEOGRAPHIES).toContain('AP');
    expect(GEOGRAPHIES).toContain('PRC');
  });

  it('CURRENT_QUARTER should be the last quarter in QUARTERS', () => {
    expect(CURRENT_QUARTER).toBe(QUARTERS[QUARTERS.length - 1]);
  });

  it('QUARTERS should include FY26Q1', () => {
    expect(QUARTERS).toContain('FY26Q1');
  });
});

describe('periodToQuarter', () => {
  it('returns quarter as-is', () => {
    expect(periodToQuarter('FY26Q1')).toBe('FY26Q1');
  });

  it('extracts quarter from month period', () => {
    expect(periodToQuarter('FY26Q1-M1')).toBe('FY26Q1');
    expect(periodToQuarter('FY25Q3-M3')).toBe('FY25Q3');
  });

  it('extracts quarter from day period', () => {
    expect(periodToQuarter('FY26Q1-M1-D05')).toBe('FY26Q1');
    expect(periodToQuarter('FY25Q2-M2-D15')).toBe('FY25Q2');
  });

  it('falls back to CURRENT_QUARTER for invalid input', () => {
    expect(periodToQuarter('invalid')).toBe(CURRENT_QUARTER);
  });
});

describe('periodLabel', () => {
  it('returns quarter as-is for quarterly periods', () => {
    expect(periodLabel('FY26Q1')).toBe('FY26Q1');
  });

  it('returns human-readable month label', () => {
    const label = periodLabel('FY26Q1-M1');
    expect(label).toMatch(/\w+ \d{4}/); // e.g., "Apr 2025"
  });

  it('returns human-readable day label', () => {
    const label = periodLabel('FY26Q1-M1-D15');
    expect(label).toMatch(/\w+ \d+/); // e.g., "Apr 15"
  });
});

describe('generateMonths', () => {
  it('returns exactly 13 months', () => {
    expect(generateMonths()).toHaveLength(13);
  });

  it('last month belongs to current quarter', () => {
    const months = generateMonths();
    const last = months[months.length - 1];
    expect(periodToQuarter(last)).toBe(CURRENT_QUARTER);
  });
});

describe('generateDays', () => {
  it('returns exactly 31 days', () => {
    expect(generateDays()).toHaveLength(31);
  });

  it('day format is correct', () => {
    const days = generateDays();
    expect(days[0]).toMatch(/^FY\d{2}Q\d-M\d-D01$/);
    expect(days[30]).toMatch(/^FY\d{2}Q\d-M\d-D31$/);
  });
});

describe('getDefaultPeriod', () => {
  it('returns latest quarter for quarterly', () => {
    expect(getDefaultPeriod('quarterly')).toBe(CURRENT_QUARTER);
  });

  it('returns latest month for monthly', () => {
    const months = generateMonths();
    expect(getDefaultPeriod('monthly')).toBe(months[months.length - 1]);
  });

  it('returns latest day for daily', () => {
    const days = generateDays();
    expect(getDefaultPeriod('daily')).toBe(days[days.length - 1]);
  });
});

describe('getPeriodsForGranularity', () => {
  it('returns all quarters for quarterly', () => {
    const periods = getPeriodsForGranularity('quarterly');
    expect(periods).toEqual(QUARTERS);
  });

  it('returns 13 months for monthly', () => {
    expect(getPeriodsForGranularity('monthly')).toHaveLength(13);
  });

  it('returns 31 days for daily', () => {
    expect(getPeriodsForGranularity('daily')).toHaveLength(31);
  });
});
