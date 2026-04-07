import { describe, it, expect } from 'vitest';
import { formatCurrency, formatPercent } from '../formatters';

describe('formatCurrency', () => {
  it('formats large values with $M suffix', () => {
    const result = formatCurrency(15600000000);
    expect(result).toContain('$');
    expect(result).toContain('M');
  });

  it('formats zero', () => {
    const result = formatCurrency(0);
    expect(result).toContain('$');
  });

  it('formats negative values with minus sign', () => {
    const result = formatCurrency(-5000000000);
    expect(result).toContain('-');
  });
});

describe('formatPercent', () => {
  it('formats a number as percentage with % sign', () => {
    // formatPercent takes the value as-is (e.g., 37 → "37.0%")
    const result = formatPercent(37);
    expect(result).toBe('37.0%');
  });

  it('formats decimal values', () => {
    const result = formatPercent(0.37);
    expect(result).toBe('0.4%');
  });

  it('formats zero', () => {
    const result = formatPercent(0);
    expect(result).toBe('0.0%');
  });
});
