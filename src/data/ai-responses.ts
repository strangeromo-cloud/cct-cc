import type { FilterState } from '@/types';
import type { EChartsOption } from 'echarts';
import { getOpeningData } from './mock-opening';
import { getSecondaryData } from './mock-secondary';
import { getBGSummary } from './mock-tertiary';
import { formatCurrency, formatPercent } from '@/utils/formatters';
import { BUSINESS_GROUPS, GEOGRAPHIES, BG_COLORS } from './constants';

interface AIResponse {
  text: string;
  chart?: EChartsOption;
}

function detectMetric(q: string): string | null {
  if (/gross\s*profit\s*%|gp\s*%|gp\s*margin/i.test(q)) return 'grossProfitPct';
  if (/gross\s*profit/i.test(q)) return 'grossProfit';
  if (/revenue/i.test(q)) return 'revenues';
  if (/net\s*income/i.test(q)) return 'netIncome';
  if (/operating\s*income|oi\b/i.test(q)) return 'operatingIncome';
  if (/pipeline/i.test(q)) return 'pipeline';
  if (/backlog/i.test(q)) return 'backlog';
  if (/inventory/i.test(q)) return 'inventory';
  if (/ccc|cash\s*conversion/i.test(q)) return 'cccUnfunded';
  if (/expense|cost/i.test(q)) return 'expenses';
  if (/cogs/i.test(q)) return 'cogs';
  return null;
}

function detectBG(q: string): string | null {
  for (const bg of BUSINESS_GROUPS) {
    if (q.toLowerCase().includes(bg.toLowerCase())) return bg;
  }
  if (/idg/i.test(q)) return 'IDG';
  return null;
}

function detectGeo(q: string): string | null {
  for (const geo of GEOGRAPHIES) {
    if (q.toLowerCase().includes(geo.toLowerCase())) return geo;
  }
  return null;
}

export function generateAIResponse(query: string, filters: FilterState): AIResponse {
  const metric = detectMetric(query);
  const bg = detectBG(query);
  const geo = detectGeo(query);

  // BG-specific query
  if (bg && metric) {
    const summary = getBGSummary(filters);
    const bgData = summary.find((s) => s.bg === bg);
    if (bgData) {
      let value = '';
      if (metric === 'revenues') { value = formatCurrency(bgData.revenues); }
      else if (metric === 'grossProfit') { value = formatCurrency(bgData.grossProfit); }
      else if (metric === 'grossProfitPct') { value = formatPercent(bgData.grossProfitPct); }
      else if (metric === 'operatingIncome') { value = formatCurrency(bgData.operatingIncome); }

      const geoSuffix = geo ? ` in ${geo}` : '';
      const text = `The ${metric.replace(/([A-Z])/g, ' $1').toLowerCase()} for ${bg}${geoSuffix} in ${filters.quarter} is ${value}.`;

      const chart: EChartsOption = {
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: summary.map((s) => s.bg) },
        yAxis: { type: 'value' },
        series: [{
          type: 'bar',
          data: summary.map((s) => ({
            value: metric === 'grossProfitPct' ? s.grossProfitPct
              : metric === 'grossProfit' ? s.grossProfit
              : metric === 'operatingIncome' ? s.operatingIncome
              : s.revenues,
            itemStyle: { color: BG_COLORS[s.bg] || '#0073CE' },
          })),
          barMaxWidth: 40,
        }],
      };

      return { text, chart };
    }
  }

  // Revenue overview
  if (metric === 'revenues' || /revenue/i.test(query)) {
    const data = getOpeningData(filters);
    return {
      text: `Revenue for ${filters.quarter} is ${formatCurrency(data.revenues.actual)}, versus Bloomberg consensus of ${formatCurrency(data.bloombergConsensusRevenues)}. This represents a ${data.revenues.actual > data.bloombergConsensusRevenues ? 'beat' : 'miss'} of ${formatCurrency(Math.abs(data.revenues.actual - data.bloombergConsensusRevenues))}.`,
      chart: {
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: ['Actual', 'Consensus', 'Budget'] },
        yAxis: { type: 'value' },
        series: [{
          type: 'bar',
          data: [
            { value: data.revenues.actual, itemStyle: { color: '#0073CE' } },
            { value: data.bloombergConsensusRevenues, itemStyle: { color: '#F5A623' } },
            { value: data.revenues.budget, itemStyle: { color: '#00A650' } },
          ],
          barMaxWidth: 50,
        }],
      },
    };
  }

  // Expense query
  if (metric === 'expenses' || /expense/i.test(query)) {
    const opData = getSecondaryData(filters);
    const latest = opData[opData.length - 1];
    if (latest) {
      return {
        text: `For ${filters.quarter}, S&M expense is ${formatCurrency(latest.smExpense)}, R&D is ${formatCurrency(latest.rdExpense)}, and Fixed expenses are ${formatCurrency(latest.fixedExpense)}.`,
        chart: {
          tooltip: { trigger: 'item' },
          series: [{
            type: 'pie',
            radius: ['40%', '70%'],
            data: [
              { value: latest.smExpense, name: 'S&M', itemStyle: { color: '#E12726' } },
              { value: latest.rdExpense, name: 'R&D', itemStyle: { color: '#0073CE' } },
              { value: latest.fixedExpense, name: 'Fixed', itemStyle: { color: '#F5A623' } },
            ],
            label: { formatter: '{b}: {d}%' },
          }],
        },
      };
    }
  }

  // CCC/working capital
  if (metric === 'cccUnfunded' || /ccc|working\s*capital/i.test(query)) {
    const opData = getSecondaryData(filters);
    return {
      text: `Cash Conversion Cycle trend: ${opData.map((d) => `${d.period}: ${d.cccUnfunded} days`).join(', ')}.`,
      chart: {
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: opData.map((d) => d.period) },
        yAxis: { type: 'value', name: 'Days' },
        series: [{
          type: 'line',
          data: opData.map((d) => d.cccUnfunded),
          smooth: true,
          lineStyle: { color: '#0073CE' },
          itemStyle: { color: '#0073CE' },
          areaStyle: { opacity: 0.1 },
        }],
      },
    };
  }

  // Gross profit %
  if (metric === 'grossProfitPct') {
    const data = getOpeningData(filters);
    return {
      text: `Gross profit margin for ${filters.quarter} is ${formatPercent(data.grossProfitPct.actual)}, compared to budget of ${formatPercent(data.grossProfitPct.budget ?? 0)} and prior year of ${formatPercent(data.grossProfitPct.priorYear ?? 0)}.`,
    };
  }

  // BG breakdown
  if (/breakdown|by\s*bg|business\s*group/i.test(query)) {
    const summary = getBGSummary(filters);
    const text = summary.map((s) => `${s.bg}: Revenue ${formatCurrency(s.revenues)}, GP% ${formatPercent(s.grossProfitPct)}`).join('\n');
    return {
      text: `Business Group breakdown for ${filters.quarter}:\n${text}`,
      chart: {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        xAxis: { type: 'category', data: summary.map((s) => s.bg) },
        yAxis: { type: 'value' },
        series: [{
          type: 'bar',
          data: summary.map((s) => ({ value: s.revenues, itemStyle: { color: BG_COLORS[s.bg] } })),
          barMaxWidth: 50,
        }],
      },
    };
  }

  // Default
  return {
    text: `I can help you analyze financial data. Try asking about specific metrics like revenue, gross profit %, expenses, or CCC. You can also specify a Business Group (PCSD, MBG, ISG, SSG) or Geography (AP, NA, LA, Europe, Meta, PRC).`,
  };
}
