import type { FilterState, BGBreakdown } from '@/types';
import { QUARTERS, periodToQuarter } from './constants';

const M = 1e6;

const bgGeoBase: Record<string, Record<string, { rev: number; gpPct: number; oiPct: number }>> = {
  PCSD: { AP: { rev: 2800, gpPct: 28, oiPct: 8 }, NA: { rev: 2200, gpPct: 30, oiPct: 9 }, LA: { rev: 600, gpPct: 26, oiPct: 6 }, Europe: { rev: 1800, gpPct: 29, oiPct: 8 }, Meta: { rev: 400, gpPct: 25, oiPct: 5 }, PRC: { rev: 3200, gpPct: 27, oiPct: 7 } },
  MBG: { AP: { rev: 400, gpPct: 22, oiPct: 3 }, NA: { rev: 200, gpPct: 20, oiPct: 2 }, LA: { rev: 300, gpPct: 24, oiPct: 4 }, Europe: { rev: 250, gpPct: 21, oiPct: 2 }, Meta: { rev: 150, gpPct: 23, oiPct: 3 }, PRC: { rev: 500, gpPct: 25, oiPct: 5 } },
  ISG: { AP: { rev: 800, gpPct: 42, oiPct: 14 }, NA: { rev: 1200, gpPct: 44, oiPct: 16 }, LA: { rev: 200, gpPct: 38, oiPct: 10 }, Europe: { rev: 600, gpPct: 40, oiPct: 12 }, Meta: { rev: 100, gpPct: 36, oiPct: 8 }, PRC: { rev: 500, gpPct: 41, oiPct: 13 } },
  SSG: { AP: { rev: 300, gpPct: 62, oiPct: 28 }, NA: { rev: 500, gpPct: 65, oiPct: 30 }, LA: { rev: 80, gpPct: 58, oiPct: 24 }, Europe: { rev: 250, gpPct: 60, oiPct: 26 }, Meta: { rev: 50, gpPct: 55, oiPct: 20 }, PRC: { rev: 200, gpPct: 63, oiPct: 29 } },
};

function quarterGrowth(q: string): number {
  const idx = QUARTERS.indexOf(q);
  if (idx < 0) return 1;
  return 1 + idx * 0.02;
}

export function getTertiaryData(filters: FilterState): BGBreakdown[] {
  const results: BGBreakdown[] = [];
  const bgs = filters.selectedBGs;
  const geos = filters.selectedGeos;
  const idx = QUARTERS.indexOf(periodToQuarter(filters.quarter));
  const startIdx = Math.max(0, idx - 4);
  const quarters = QUARTERS.slice(startIdx, idx + 1);

  for (const q of quarters) {
    const growth = quarterGrowth(q);
    for (const bg of bgs) {
      for (const geo of geos) {
        const base = bgGeoBase[bg]?.[geo];
        if (!base) continue;
        const rev = Math.round(base.rev * growth * M);
        results.push({
          bg,
          geo,
          period: q,
          revenues: rev,
          grossProfit: Math.round(rev * base.gpPct / 100),
          grossProfitPct: base.gpPct,
          operatingIncome: Math.round(rev * base.oiPct / 100),
        });
      }
    }
  }

  return results;
}

export function getIDGData(filters: FilterState): BGBreakdown[] {
  const all = getTertiaryData(filters);
  const idgMap = new Map<string, BGBreakdown>();

  for (const row of all) {
    if (row.bg !== 'PCSD' && row.bg !== 'MBG') continue;
    const key = `${row.geo}-${row.period}`;
    const existing = idgMap.get(key);
    if (existing) {
      existing.revenues += row.revenues;
      existing.grossProfit += row.grossProfit;
      existing.operatingIncome += row.operatingIncome;
      existing.grossProfitPct = existing.revenues > 0
        ? Math.round(existing.grossProfit / existing.revenues * 1000) / 10
        : 0;
    } else {
      idgMap.set(key, { ...row, bg: 'IDG' });
    }
  }

  return Array.from(idgMap.values());
}

export function getBGSummary(filters: FilterState): Array<{
  bg: string;
  revenues: number;
  grossProfit: number;
  grossProfitPct: number;
  operatingIncome: number;
}> {
  const all = getTertiaryData(filters);
  const idx = QUARTERS.indexOf(periodToQuarter(filters.quarter));
  const currentQ = QUARTERS[idx] ?? 'FY25Q3';
  const currentData = all.filter((r) => r.period === currentQ);

  const idgData = getIDGData({ ...filters, quarter: currentQ }).filter((r) => r.period === currentQ);

  const bgMap = new Map<string, { revenues: number; grossProfit: number; operatingIncome: number }>();

  // Add IDG
  for (const row of idgData) {
    const existing = bgMap.get('IDG');
    if (existing) {
      existing.revenues += row.revenues;
      existing.grossProfit += row.grossProfit;
      existing.operatingIncome += row.operatingIncome;
    } else {
      bgMap.set('IDG', { revenues: row.revenues, grossProfit: row.grossProfit, operatingIncome: row.operatingIncome });
    }
  }

  // Add ISG
  for (const row of currentData.filter((r) => r.bg === 'ISG')) {
    const existing = bgMap.get('ISG');
    if (existing) {
      existing.revenues += row.revenues;
      existing.grossProfit += row.grossProfit;
      existing.operatingIncome += row.operatingIncome;
    } else {
      bgMap.set('ISG', { revenues: row.revenues, grossProfit: row.grossProfit, operatingIncome: row.operatingIncome });
    }
  }

  // Add SSG
  for (const row of currentData.filter((r) => r.bg === 'SSG')) {
    const existing = bgMap.get('SSG');
    if (existing) {
      existing.revenues += row.revenues;
      existing.grossProfit += row.grossProfit;
      existing.operatingIncome += row.operatingIncome;
    } else {
      bgMap.set('SSG', { revenues: row.revenues, grossProfit: row.grossProfit, operatingIncome: row.operatingIncome });
    }
  }

  return Array.from(bgMap.entries()).map(([bg, data]) => ({
    bg,
    revenues: data.revenues,
    grossProfit: data.grossProfit,
    grossProfitPct: data.revenues > 0 ? Math.round(data.grossProfit / data.revenues * 1000) / 10 : 0,
    operatingIncome: data.operatingIncome,
  }));
}
