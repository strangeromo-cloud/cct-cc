/**
 * Unified Cross-Query Engine
 * Supports BG × Geo × Time arbitrary combinations for CFO data analysis
 */
import type { FilterState, BusinessGroup, Geography } from '@/types';
import type { QueryResult, DataRow, ChartType } from '@/types/ai-types';
import type { EChartsOption } from 'echarts';
import { getOpeningData, getConsensusComparison } from './mock-opening';
import { getSecondaryData } from './mock-secondary';
import { getBGSummary, getTertiaryData } from './mock-tertiary';
import { QUARTERS, BUSINESS_GROUPS, GEOGRAPHIES, BG_COLORS, GEO_COLORS, periodToQuarter } from './constants';
import { formatCurrency, formatPercent } from '@/utils/formatters';
import { chartColors } from '@/utils/chart-theme';

/* ------------------------------------------------------------------ */
/*  Cross Query: BG × Geo × Time                                      */
/* ------------------------------------------------------------------ */

export function crossQuery(
  metrics: string[],
  bgs: BusinessGroup[],
  geos: Geography[],
  periods: string[],
  filters: FilterState,
): QueryResult {
  const targetBGs = bgs.length > 0 ? bgs : [...BUSINESS_GROUPS];
  const targetGeos = geos.length > 0 ? geos : [...GEOGRAPHIES];
  const targetPeriod = periods.length > 0 ? periods[0] : filters.quarter;

  // Get tertiary data for cross breakdown
  const tertiaryFilters: FilterState = {
    ...filters,
    selectedBGs: targetBGs,
    selectedGeos: targetGeos,
    quarter: targetPeriod,
  };

  const tertiary = getTertiaryData(tertiaryFilters);
  const currentQ = periodToQuarter(targetPeriod);
  const currentData = tertiary.filter((r) => r.period === currentQ);

  const metric = metrics[0] || 'revenues';
  const data: DataRow[] = [];

  // Build cross-dimensional data
  for (const bg of targetBGs) {
    // IDG maps to PCSD+MBG in tertiary data
    const bgRows = bg === 'IDG'
      ? currentData.filter((r) => r.bg === 'PCSD' || r.bg === 'MBG')
      : currentData.filter((r) => r.bg === bg);

    for (const geo of targetGeos) {
      const geoRows = bgRows.filter((r) => r.geo === geo);
      if (geoRows.length === 0) continue;

      const row: DataRow = { bg, geo, period: currentQ };
      const rev = geoRows.reduce((s, r) => s + r.revenues, 0);
      const gp = geoRows.reduce((s, r) => s + r.grossProfit, 0);
      const oi = geoRows.reduce((s, r) => s + r.operatingIncome, 0);

      row.revenues = rev;
      row.grossProfit = gp;
      row.grossProfitPct = rev > 0 ? Math.round(gp / rev * 1000) / 10 : 0;
      row.operatingIncome = oi;
      row.oiPct = rev > 0 ? Math.round(oi / rev * 1000) / 10 : 0;
      data.push(row);
    }
  }

  // Determine chart type
  const chartSuggestion = suggestChartType(targetBGs, targetGeos, metrics);

  // Generate insights
  const insights = generateInsights(data, metric, targetBGs, targetGeos);

  // Summary text
  const summary = buildSummary(data, metric, targetBGs, targetGeos, currentQ);

  return { data, summary, chartSuggestion, insights };
}

/* ------------------------------------------------------------------ */
/*  Compare Query: YoY / QoQ / vs Budget / vs Consensus                */
/* ------------------------------------------------------------------ */

export function compareQuery(
  metric: string,
  bgs: BusinessGroup[],
  _geos: Geography[],
  compType: 'yoy' | 'qoq' | 'vs_budget' | 'vs_consensus',
  filters: FilterState,
): QueryResult {
  const currentQ = periodToQuarter(filters.quarter);
  const qIdx = QUARTERS.indexOf(currentQ);
  const data: DataRow[] = [];

  if (compType === 'vs_consensus') {
    const consensus = getConsensusComparison(filters);
    for (const item of consensus) {
      data.push({
        metric: item.metric,
        actual: item.actual,
        consensus: item.consensus,
        delta: item.delta,
        unit: item.unit,
      });
    }
    const summary = `${currentQ} 实际业绩与彭博一致预期对比：` +
      consensus.map(c =>
        `${c.metric}: 实际 ${c.unit === '$M' ? formatCurrency(c.actual) : formatPercent(c.actual as number)} vs 预期 ${c.unit === '$M' ? formatCurrency(c.consensus) : formatPercent(c.consensus as number)}, ${c.delta > 0 ? '超出' : '低于'} ${c.unit === '$M' ? formatCurrency(Math.abs(c.delta)) : formatPercent(Math.abs(c.delta))}`
      ).join('；');
    return { data, summary, chartSuggestion: 'grouped_bar', insights: [] };
  }

  if (compType === 'yoy' || compType === 'qoq') {
    const prevIdx = compType === 'yoy' ? qIdx - 4 : qIdx - 1;
    if (prevIdx < 0) {
      return {
        data: [],
        summary: `无法进行${compType === 'yoy' ? '同比' : '环比'}分析：缺少历史数据。`,
        chartSuggestion: 'bar',
        insights: [],
      };
    }
    const prevQ = QUARTERS[prevIdx];
    const prevLabel = compType === 'yoy' ? '同比' : '环比';

    // Get BG summaries for both periods
    const currentFilters = { ...filters, quarter: currentQ };
    const prevFilters = { ...filters, quarter: prevQ };
    const currentSummary = getBGSummary(currentFilters);
    const prevSummaryData = getBGSummary(prevFilters);
    const targetBGs = bgs.length > 0 ? bgs : [...BUSINESS_GROUPS];

    for (const bg of targetBGs) {
      const cur = currentSummary.find(s => s.bg === bg);
      const prev = prevSummaryData.find(s => s.bg === bg);
      if (!cur || !prev) continue;

      const curVal = getMetricValue(cur, metric);
      const prevVal = getMetricValue(prev, metric);
      const changePct = prevVal !== 0 ? Math.round((curVal - prevVal) / Math.abs(prevVal) * 1000) / 10 : 0;

      data.push({
        bg,
        period: currentQ,
        current: curVal,
        previous: prevVal,
        change: curVal - prevVal,
        changePct,
      });
    }

    const summary = `${currentQ} vs ${prevQ} (${prevLabel})：` +
      data.map(d => `${d.bg} ${getMetricLabel(metric)} ${prevLabel}${(d.changePct as number) >= 0 ? '+' : ''}${d.changePct}%`).join('，');

    return {
      data,
      summary,
      chartSuggestion: 'grouped_bar',
      insights: generateCompareInsights(data, metric, prevLabel),
    };
  }

  // vs_budget
  const opening = getOpeningData(filters);
  const metricMap: Record<string, { actual: number; budget: number }> = {
    revenues: { actual: opening.revenues.actual, budget: opening.revenues.budget ?? 0 },
    grossProfit: { actual: opening.grossProfit.actual, budget: opening.grossProfit.budget ?? 0 },
    operatingIncome: { actual: opening.operatingIncome.actual, budget: opening.operatingIncome.budget ?? 0 },
    netIncome: { actual: opening.netIncome.actual, budget: opening.netIncome.budget ?? 0 },
  };

  for (const [key, val] of Object.entries(metricMap)) {
    data.push({
      metric: key,
      actual: val.actual,
      budget: val.budget,
      gap: val.actual - val.budget,
      gapPct: val.budget !== 0 ? Math.round((val.actual - val.budget) / val.budget * 1000) / 10 : 0,
    });
  }

  return {
    data,
    summary: `${currentQ} 实际 vs 预算：各主要指标完成情况一览。`,
    chartSuggestion: 'grouped_bar',
    insights: [],
  };
}

/* ------------------------------------------------------------------ */
/*  Trend Query: Time-series for a metric                              */
/* ------------------------------------------------------------------ */

export function trendQuery(
  metric: string,
  bgs: BusinessGroup[],
  geos: Geography[],
  filters: FilterState,
): QueryResult {
  const qIdx = QUARTERS.indexOf(periodToQuarter(filters.quarter));
  const startIdx = Math.max(0, qIdx - 4);
  const quarters = QUARTERS.slice(startIdx, qIdx + 1);
  const data: DataRow[] = [];

  if (bgs.length <= 1 && geos.length === 0) {
    // Simple trend: use secondary data
    const opData = getSecondaryData(filters);
    for (const d of opData) {
      const row: DataRow = { period: d.period };
      row[metric] = getOperatingMetricValue(d, metric);
      data.push(row);
    }

    const values = data.map(d => d[metric] as number);
    const first = values[0] ?? 0;
    const last = values[values.length - 1] ?? 0;
    const changePct = first !== 0 ? Math.round((last - first) / Math.abs(first) * 1000) / 10 : 0;
    const direction = changePct > 0 ? '上升' : changePct < 0 ? '下降' : '持平';

    const summary = `${getMetricLabel(metric)} 在 ${quarters[0]} 至 ${quarters[quarters.length - 1]} 期间整体呈${direction}趋势，变化幅度 ${changePct >= 0 ? '+' : ''}${changePct}%。`;

    return {
      data,
      summary,
      chartSuggestion: 'line',
      insights: generateTrendInsights(data, metric),
    };
  }

  // Multi-BG trend comparison
  const targetBGs = bgs.length > 0 ? bgs : [...BUSINESS_GROUPS];
  for (const q of quarters) {
    const qFilters = { ...filters, quarter: q };
    const bgData = getBGSummary(qFilters);
    for (const bg of targetBGs) {
      const bgRow = bgData.find(b => b.bg === bg);
      if (!bgRow) continue;
      data.push({
        bg,
        period: q,
        [metric]: getMetricValue(bgRow, metric),
      });
    }
  }

  const summary = `各业务集团 ${getMetricLabel(metric)} 趋势 (${quarters[0]}–${quarters[quarters.length - 1]})：` +
    targetBGs.map(bg => {
      const bgRows = data.filter(d => d.bg === bg);
      const first = bgRows[0]?.[metric] as number ?? 0;
      const last = bgRows[bgRows.length - 1]?.[metric] as number ?? 0;
      const pct = first !== 0 ? Math.round((last - first) / Math.abs(first) * 1000) / 10 : 0;
      return `${bg} ${pct >= 0 ? '+' : ''}${pct}%`;
    }).join('，');

  return { data, summary, chartSuggestion: 'line', insights: [] };
}

/* ------------------------------------------------------------------ */
/*  Rank Query: Top/Bottom N                                           */
/* ------------------------------------------------------------------ */

export function rankQuery(
  metric: string,
  groupBy: 'bg' | 'geo',
  order: 'desc' | 'asc',
  filters: FilterState,
): QueryResult {
  const result = crossQuery([metric], [], [], [], filters);
  const aggregated = new Map<string, number>();

  for (const row of result.data) {
    const key = groupBy === 'bg' ? (row.bg as string) : (row.geo as string);
    const val = (row[metric] as number) ?? 0;
    aggregated.set(key, (aggregated.get(key) ?? 0) + val);
  }

  const sorted = Array.from(aggregated.entries())
    .sort((a, b) => order === 'desc' ? b[1] - a[1] : a[1] - b[1]);

  const data: DataRow[] = sorted.map(([key, val], idx) => ({
    [groupBy]: key,
    [metric]: val,
    rank: idx + 1,
  }));

  const topLabel = order === 'desc' ? '最高' : '最低';
  const dimLabel = groupBy === 'bg' ? '业务集团' : '地区';
  const summary = `按${dimLabel}排名 ${getMetricLabel(metric)} (${topLabel}优先)：` +
    sorted.slice(0, 3).map(([k, v], i) => `${i + 1}. ${k}: ${isPercentMetric(metric) ? formatPercent(v) : formatCurrency(v)}`).join('，');

  return { data, summary, chartSuggestion: 'horizontal_bar', insights: [] };
}

/* ------------------------------------------------------------------ */
/*  Chart Generation                                                   */
/* ------------------------------------------------------------------ */

export function buildChartOption(result: QueryResult, metric: string, _intent: string): EChartsOption {
  const { data, chartSuggestion } = result;

  switch (chartSuggestion) {
    case 'bar':
    case 'horizontal_bar':
      return buildBarChart(data, metric, chartSuggestion === 'horizontal_bar');

    case 'line':
      return buildLineChart(data, metric);

    case 'grouped_bar':
      return buildGroupedBarChart(data, metric, _intent);

    case 'pie':
      return buildPieChart(data, metric);

    case 'heatmap':
      return buildHeatmapChart(data, metric);

    case 'radar':
      return buildRadarChart(data, metric);

    default:
      return buildBarChart(data, metric, false);
  }
}

function buildBarChart(data: DataRow[], metric: string, horizontal: boolean): EChartsOption {
  const labels = data.map(d => (d.bg as string) || (d.geo as string) || (d.period as string) || '');
  const values = data.map(d => (d[metric] as number) ?? 0);
  const colors = data.map(d => {
    if (d.bg) return BG_COLORS[d.bg as string] || chartColors.blue;
    if (d.geo) return GEO_COLORS[d.geo as Geography] || chartColors.blue;
    return chartColors.blue;
  });

  if (horizontal) {
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 80, right: 20, top: 10, bottom: 20 },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: labels.reverse(), axisLabel: { fontSize: 11 } },
      series: [{
        type: 'bar',
        data: values.reverse().map((v, i) => ({ value: v, itemStyle: { color: colors[colors.length - 1 - i] } })),
        barMaxWidth: 24,
      }],
    };
  }

  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 50, right: 10, top: 10, bottom: 24 },
    xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value' },
    series: [{
      type: 'bar',
      data: values.map((v, i) => ({ value: v, itemStyle: { color: colors[i] } })),
      barMaxWidth: 36,
    }],
  };
}

function buildLineChart(data: DataRow[], metric: string): EChartsOption {
  // Check if multi-series (multiple BGs)
  const bgs = [...new Set(data.filter(d => d.bg).map(d => d.bg as string))];
  const periods = [...new Set(data.map(d => d.period as string))];

  if (bgs.length > 1) {
    const series = bgs.map(bg => ({
      name: bg,
      type: 'line' as const,
      data: periods.map(p => {
        const row = data.find(d => d.bg === bg && d.period === p);
        return (row?.[metric] as number) ?? 0;
      }),
      smooth: true,
      lineStyle: { color: BG_COLORS[bg] || chartColors.blue },
      itemStyle: { color: BG_COLORS[bg] || chartColors.blue },
    }));

    return {
      tooltip: { trigger: 'axis' },
      legend: { data: bgs, bottom: 0, textStyle: { fontSize: 10 } },
      grid: { left: 50, right: 10, top: 10, bottom: 30 },
      xAxis: { type: 'category', data: periods, axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value' },
      series,
    };
  }

  // Single series
  const values = data.map(d => (d[metric] as number) ?? 0);
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 10, top: 10, bottom: 24 },
    xAxis: { type: 'category', data: periods.length > 0 ? periods : data.map((_, i) => `P${i + 1}`), axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value' },
    series: [{
      type: 'line',
      data: values,
      smooth: true,
      lineStyle: { color: chartColors.blue },
      itemStyle: { color: chartColors.blue },
      areaStyle: { opacity: 0.08 },
    }],
  };
}

function buildGroupedBarChart(data: DataRow[], metric: string, _intent: string): EChartsOption {
  // For compare intent
  if (data.length > 0 && 'current' in data[0]) {
    const labels = data.map(d => (d.bg as string) || (d.metric as string) || '');
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { data: ['当期', '对比期'], bottom: 0, textStyle: { fontSize: 10 } },
      grid: { left: 50, right: 10, top: 10, bottom: 30 },
      xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value' },
      series: [
        { name: '当期', type: 'bar', data: data.map(d => d.current as number), itemStyle: { color: chartColors.blue }, barMaxWidth: 30 },
        { name: '对比期', type: 'bar', data: data.map(d => d.previous as number), itemStyle: { color: chartColors.orange }, barMaxWidth: 30 },
      ],
    };
  }

  // For consensus comparison
  if (data.length > 0 && 'actual' in data[0] && 'consensus' in data[0]) {
    const labels = data.map(d => (d.metric as string) || '');
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { data: ['实际', '一致预期'], bottom: 0, textStyle: { fontSize: 10 } },
      grid: { left: 50, right: 10, top: 10, bottom: 30 },
      xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value' },
      series: [
        { name: '实际', type: 'bar', data: data.map(d => d.actual as number), itemStyle: { color: chartColors.blue }, barMaxWidth: 30 },
        { name: '一致预期', type: 'bar', data: data.map(d => d.consensus as number), itemStyle: { color: chartColors.orange }, barMaxWidth: 30 },
      ],
    };
  }

  // Budget comparison
  if (data.length > 0 && 'actual' in data[0] && 'budget' in data[0]) {
    const labels = data.map(d => getMetricLabel(d.metric as string));
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { data: ['实际', '预算'], bottom: 0, textStyle: { fontSize: 10 } },
      grid: { left: 50, right: 10, top: 10, bottom: 30 },
      xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value' },
      series: [
        { name: '实际', type: 'bar', data: data.map(d => d.actual as number), itemStyle: { color: chartColors.blue }, barMaxWidth: 30 },
        { name: '预算', type: 'bar', data: data.map(d => d.budget as number), itemStyle: { color: chartColors.green }, barMaxWidth: 30 },
      ],
    };
  }

  return buildBarChart(data, metric, false);
}

function buildPieChart(data: DataRow[], metric: string): EChartsOption {
  const items = data.map(d => ({
    name: (d.bg as string) || (d.geo as string) || '',
    value: (d[metric] as number) ?? 0,
    itemStyle: {
      color: d.bg ? (BG_COLORS[d.bg as string] || chartColors.blue) : (GEO_COLORS[d.geo as Geography] || chartColors.blue),
    },
  }));

  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    series: [{
      type: 'pie',
      radius: ['35%', '65%'],
      data: items,
      label: { formatter: '{b}\n{d}%', fontSize: 10 },
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' } },
    }],
  };
}

function buildHeatmapChart(data: DataRow[], metric: string): EChartsOption {
  const bgs = [...new Set(data.map(d => d.bg as string).filter(Boolean))];
  const geos = [...new Set(data.map(d => d.geo as string).filter(Boolean))];

  const heatData: [number, number, number][] = [];
  let max = 0;

  for (let i = 0; i < geos.length; i++) {
    for (let j = 0; j < bgs.length; j++) {
      const row = data.find(d => d.bg === bgs[j] && d.geo === geos[i]);
      const val = (row?.[metric] as number) ?? 0;
      if (val > max) max = val;
      heatData.push([j, i, val]);
    }
  }

  return {
    tooltip: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter: (p: any) => {
        const [x, y, val] = p.data as [number, number, number];
        return `${bgs[x]} × ${geos[y]}: ${isPercentMetric(metric) ? formatPercent(val) : formatCurrency(val)}`;
      },
    },
    grid: { left: 60, right: 40, top: 10, bottom: 24 },
    xAxis: { type: 'category', data: bgs, axisLabel: { fontSize: 10 } },
    yAxis: { type: 'category', data: geos, axisLabel: { fontSize: 10 } },
    visualMap: {
      min: 0,
      max: max || 1,
      show: false,
      inRange: { color: ['#f0f4ff', '#0073CE'] },
    },
    series: [{
      type: 'heatmap',
      data: heatData,
      label: {
        show: true,
        fontSize: 9,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (p: any) => {
          const d = p.data as [number, number, number];
          return isPercentMetric(metric) ? formatPercent(d[2]) : formatCurrency(d[2]);
        },
      },
    }],
  };
}

function buildRadarChart(data: DataRow[], _metric: string): EChartsOption {
  // Multi-metric radar for BG comparison
  const metricsToCompare = ['revenues', 'grossProfitPct', 'operatingIncome'];
  const bgs = [...new Set(data.map(d => d.bg as string).filter(Boolean))];

  const indicator = metricsToCompare.map(m => {
    const maxVal = Math.max(...data.map(d => (d[m] as number) ?? 0));
    return { name: getMetricLabel(m), max: maxVal * 1.2 || 1 };
  });

  const series = bgs.map(bg => {
    const bgRows = data.filter(d => d.bg === bg);
    // Aggregate across geos
    const values = metricsToCompare.map(m =>
      bgRows.reduce((s, r) => s + ((r[m] as number) ?? 0), 0)
    );
    return {
      name: bg,
      value: values,
      lineStyle: { color: BG_COLORS[bg] || chartColors.blue },
      itemStyle: { color: BG_COLORS[bg] || chartColors.blue },
      areaStyle: { opacity: 0.1, color: BG_COLORS[bg] || chartColors.blue },
    };
  });

  return {
    tooltip: {},
    legend: { data: bgs, bottom: 0, textStyle: { fontSize: 10 } },
    radar: { indicator, radius: '60%' },
    series: [{ type: 'radar', data: series }],
  };
}

/* ------------------------------------------------------------------ */
/*  Helper Functions                                                   */
/* ------------------------------------------------------------------ */

function suggestChartType(bgs: BusinessGroup[], geos: Geography[], metrics: string[]): ChartType {
  const hasManyBGs = bgs.length > 1 || bgs.length === 0;
  const hasManyGeos = geos.length > 1 || geos.length === 0;
  const multiMetric = metrics.length > 1;

  // BG × Geo matrix → heatmap
  if (hasManyBGs && hasManyGeos) return 'heatmap';
  // Multi-metric comparison → radar
  if (multiMetric && hasManyBGs) return 'radar';
  // Single dimension breakdown → bar
  if (hasManyBGs && !hasManyGeos) return 'bar';
  if (hasManyGeos && !hasManyBGs) return 'bar';
  // Single point → bar
  return 'bar';
}

function getMetricValue(bgData: { revenues: number; grossProfit: number; grossProfitPct: number; operatingIncome: number }, metric: string): number {
  switch (metric) {
    case 'revenues': return bgData.revenues;
    case 'grossProfit': return bgData.grossProfit;
    case 'grossProfitPct': return bgData.grossProfitPct;
    case 'operatingIncome': return bgData.operatingIncome;
    default: return bgData.revenues;
  }
}

function getOperatingMetricValue(d: { pipeline: number; backlog: number; revenues: number; cogs: number; grossProfit: number; smExpense: number; rdExpense: number; fixedExpense: number; inventory: number; woiIdg: number; ar: number; ap: number; cccUnfunded: number }, metric: string): number {
  const map: Record<string, number> = {
    pipeline: d.pipeline,
    backlog: d.backlog,
    revenues: d.revenues,
    cogs: d.cogs,
    grossProfit: d.grossProfit,
    smExpense: d.smExpense,
    rdExpense: d.rdExpense,
    fixedExpense: d.fixedExpense,
    inventory: d.inventory,
    woiIdg: d.woiIdg,
    ar: d.ar,
    ap: d.ap,
    cccUnfunded: d.cccUnfunded,
  };
  return map[metric] ?? d.revenues;
}

export function getMetricLabel(metric: string): string {
  const labels: Record<string, string> = {
    revenues: '营收',
    grossProfit: '毛利',
    grossProfitPct: '毛利率',
    operatingIncome: '经营利润',
    oiPct: '经营利润率',
    netIncome: '净利润',
    pipeline: '销售管线',
    backlog: '订单积压',
    cogs: '销售成本',
    smExpense: '销售及市场费用',
    rdExpense: '研发费用',
    fixedExpense: '固定费用',
    inventory: '库存',
    woiIdg: 'WOI',
    ar: '应收账款',
    ap: '应付账款',
    cccUnfunded: 'CCC',
    expenses: '费用',
  };
  return labels[metric] || metric;
}

function isPercentMetric(metric: string): boolean {
  return ['grossProfitPct', 'oiPct'].includes(metric);
}

function buildSummary(data: DataRow[], metric: string, bgs: BusinessGroup[], geos: Geography[], period: string): string {
  if (data.length === 0) return '未找到符合条件的数据。';

  const metricLabel = getMetricLabel(metric);
  const total = data.reduce((s, r) => s + ((r[metric] as number) ?? 0), 0);
  const formattedTotal = isPercentMetric(metric)
    ? formatPercent(data.length > 0 ? total / data.length : 0)
    : formatCurrency(total);

  const bgList = bgs.length > 0 ? bgs.join(', ') : '全部 BG';
  const geoList = geos.length > 0 ? geos.join(', ') : '全部地区';

  let summary = `${period} ${bgList} 在 ${geoList} 的 ${metricLabel} 总计为 ${formattedTotal}。`;

  // Add top contributor
  if (data.length > 1) {
    const sorted = [...data].sort((a, b) => ((b[metric] as number) ?? 0) - ((a[metric] as number) ?? 0));
    const top = sorted[0];
    const topKey = (top.bg as string) || (top.geo as string) || '';
    const topVal = isPercentMetric(metric)
      ? formatPercent(top[metric] as number)
      : formatCurrency(top[metric] as number);
    summary += `\n其中 ${topKey} 贡献最大 (${topVal})。`;
  }

  return summary;
}

function generateInsights(data: DataRow[], metric: string, _bgs: BusinessGroup[], _geos: Geography[]): string[] {
  const insights: string[] = [];
  if (data.length < 2) return insights;

  const values = data.map(d => ({ key: `${d.bg || ''}${d.geo ? ' ' + d.geo : ''}`, val: (d[metric] as number) ?? 0 }));
  const sorted = [...values].sort((a, b) => b.val - a.val);
  const max = sorted[0];
  const min = sorted[sorted.length - 1];

  if (max.val > 0 && min.val > 0) {
    const ratio = Math.round(max.val / min.val * 10) / 10;
    if (ratio > 2) {
      insights.push(`${max.key} 的 ${getMetricLabel(metric)} 是 ${min.key} 的 ${ratio} 倍，差距显著。`);
    }
  }

  return insights;
}

function generateCompareInsights(data: DataRow[], _metric: string, label: string): string[] {
  const insights: string[] = [];
  const growing = data.filter(d => (d.changePct as number) > 0);
  const declining = data.filter(d => (d.changePct as number) < 0);

  if (growing.length > 0) {
    const best = growing.sort((a, b) => (b.changePct as number) - (a.changePct as number))[0];
    insights.push(`${best.bg} ${label}增长最快 (+${best.changePct}%)。`);
  }
  if (declining.length > 0) {
    const worst = declining.sort((a, b) => (a.changePct as number) - (b.changePct as number))[0];
    insights.push(`⚠️ ${worst.bg} ${label}下降 (${worst.changePct}%)，需关注。`);
  }

  return insights;
}

function generateTrendInsights(data: DataRow[], metric: string): string[] {
  const insights: string[] = [];
  const values = data.map(d => (d[metric] as number) ?? 0);

  // Check for consecutive increase/decrease
  let consecutive = 1;
  let dir = 0;
  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const curDir = diff > 0 ? 1 : diff < 0 ? -1 : 0;
    if (curDir === dir && curDir !== 0) {
      consecutive++;
    } else {
      consecutive = 1;
      dir = curDir;
    }
  }

  if (consecutive >= 3) {
    insights.push(`${getMetricLabel(metric)} 已连续 ${consecutive} 个季度${dir > 0 ? '增长' : '下降'}。`);
  }

  return insights;
}
