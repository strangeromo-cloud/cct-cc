import type { BusinessGroup, Geography, TimeGranularity } from '@/types';

export const BUSINESS_GROUPS: BusinessGroup[] = ['IDG', 'ISG', 'SSG'];

export const GEOGRAPHIES: Geography[] = ['AP', 'NA', 'LA', 'Europe', 'Meta', 'PRC'];

export const TIME_GRANULARITIES: TimeGranularity[] = ['daily', 'monthly', 'quarterly'];

export const QUARTERS = [
  'FY24Q1', 'FY24Q2', 'FY24Q3', 'FY24Q4',
  'FY25Q1', 'FY25Q2', 'FY25Q3', 'FY25Q4',
  'FY26Q1',
];

export const CURRENT_QUARTER = QUARTERS[QUARTERS.length - 1];

export const BG_COLORS: Record<string, string> = {
  IDG: '#E12726',
  ISG: '#0073CE',
  SSG: '#00A650',
};

export const GEO_COLORS: Record<Geography, string> = {
  AP: '#E12726',
  NA: '#0073CE',
  LA: '#00A650',
  Europe: '#F5A623',
  Meta: '#8B5CF6',
  PRC: '#333333',
};

/* ------------------------------------------------------------------ */
/*  Period helpers — generate month / day options for filter bar        */
/* ------------------------------------------------------------------ */

/** Map a period string (quarter / month / day) back to its parent quarter */
export function periodToQuarter(period: string): string {
  // Already a quarter like FY26Q1
  if (/^FY\d{2}Q\d$/.test(period)) return period;

  // Month format: FY26Q1-M1, FY26Q1-M2, FY26Q1-M3
  const mMatch = period.match(/^(FY\d{2}Q\d)-M\d$/);
  if (mMatch) return mMatch[1];

  // Day format: FY26Q1-M1-D05
  const dMatch = period.match(/^(FY\d{2}Q\d)-M\d-D\d{2}$/);
  if (dMatch) return dMatch[1];

  return CURRENT_QUARTER;
}

/** Generate last 13 months ending at the current quarter's last month */
export function generateMonths(): string[] {
  const months: string[] = [];
  for (const q of QUARTERS) {
    months.push(`${q}-M1`, `${q}-M2`, `${q}-M3`);
  }
  // Return last 13
  return months.slice(-13);
}

/** Generate last 31 days of the current quarter's last month */
export function generateDays(): string[] {
  const months = generateMonths();
  const lastMonth = months[months.length - 1];
  const days: string[] = [];
  for (let d = 1; d <= 31; d++) {
    days.push(`${lastMonth}-D${String(d).padStart(2, '0')}`);
  }
  return days;
}

/** Human-readable label for a period */
export function periodLabel(period: string): string {
  if (/^FY\d{2}Q\d$/.test(period)) return period;

  // Month: FY26Q1-M1 → "FY26Q1 Month 1"
  const mMatch = period.match(/^(FY\d{2}Q(\d))-M(\d)$/);
  if (mMatch) {
    const qNum = parseInt(mMatch[2]);
    const mInQ = parseInt(mMatch[3]);
    // Lenovo FY starts April: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
    const baseMonth = (qNum - 1) * 3 + 3; // Q1→Apr(4), but 0-indexed shift
    const calMonth = ((baseMonth + mInQ - 1) % 12) + 1;
    const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const fy = parseInt(mMatch[1].slice(2, 4));
    // Calendar year: FY starts April, so FY26 Q1 = Apr 2025
    const calYear = calMonth >= 4 ? 2000 + fy - 1 : 2000 + fy;
    return `${monthNames[calMonth]} ${calYear}`;
  }

  // Day: FY26Q1-M1-D05 → "Apr 5"
  const dMatch = period.match(/^(FY\d{2}Q(\d))-M(\d)-D(\d{2})$/);
  if (dMatch) {
    const qNum = parseInt(dMatch[2]);
    const mInQ = parseInt(dMatch[3]);
    const day = parseInt(dMatch[4]);
    const baseMonth = (qNum - 1) * 3 + 3;
    const calMonth = ((baseMonth + mInQ - 1) % 12) + 1;
    const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[calMonth]} ${day}`;
  }

  return period;
}

/** Get the default (latest) period for a given granularity */
export function getDefaultPeriod(granularity: TimeGranularity): string {
  switch (granularity) {
    case 'quarterly':
      return CURRENT_QUARTER;
    case 'monthly': {
      const months = generateMonths();
      return months[months.length - 1];
    }
    case 'daily': {
      const days = generateDays();
      return days[days.length - 1];
    }
  }
}

/** Get all available periods for a given granularity */
export function getPeriodsForGranularity(granularity: TimeGranularity): string[] {
  switch (granularity) {
    case 'quarterly':
      return [...QUARTERS];
    case 'monthly':
      return generateMonths();
    case 'daily':
      return generateDays();
  }
}

export const METRIC_LABELS: Record<string, string> = {
  pipeline: 'Pipeline',
  backlog: 'Backlog',
  revenues: 'Revenues',
  cogs: 'Cost of Goods Sold',
  grossProfit: 'Gross Profit',
  smExpense: 'S&M Expense',
  rdExpense: 'R&D Expense',
  fixedExpense: 'Fixed Expense',
  inventory: 'Inventory',
  woiIdg: 'WOI (IDG)',
  ar: 'Accounts Receivable',
  ap: 'Accounts Payable',
  cccUnfunded: 'CCC (Unfunded)',
};
