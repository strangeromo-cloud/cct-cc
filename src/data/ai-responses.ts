/**
 * AI Response Engine — Intent-based routing with multi-turn context
 * Replaces simple regex matching with structured intent parsing
 */
import type { FilterState, BusinessGroup, Geography } from '@/types';
import type { ParsedIntent, AIResponse, MessageBlock, ConversationContext } from '@/types/ai-types';
import { crossQuery, compareQuery, trendQuery, rankQuery, buildChartOption, getMetricLabel } from './query-engine';
import { getSecondaryData } from './mock-secondary';
import { getBGSummary } from './mock-tertiary';
import { getSupplyChainData, getPeerData, getMacroData, getCorrelationInsights } from './mock-external';
import { runAttribution, buildAttributionBlocks } from './attribution-engine';
import { BUSINESS_GROUPS, GEOGRAPHIES, QUARTERS } from './constants';
import { formatCurrency, formatPercent } from '@/utils/formatters';
import { chartColors } from '@/utils/chart-theme';

/* ------------------------------------------------------------------ */
/*  Intent Parser — NLU from user query                                */
/* ------------------------------------------------------------------ */

export function parseIntent(query: string, context: ConversationContext): ParsedIntent {
  const q = query.toLowerCase();

  const metrics = detectMetrics(q);
  const bgs = detectBGs(q);
  const geos = detectGeos(q);
  const periods = detectPeriods(q);
  const intentType = detectIntentType(q, metrics, bgs, geos);
  const comparisonType = detectComparison(q);
  const groupBy = detectGroupBy(q);
  const sortOrder = detectSortOrder(q);

  // Multi-turn: inherit from context if not explicitly mentioned
  const finalMetrics = metrics.length > 0 ? metrics : context.mentionedMetrics.slice(0, 1);
  const finalBGs = bgs.length > 0 ? bgs : context.mentionedBGs;
  const finalGeos = geos.length > 0 ? geos : context.mentionedGeos;
  const finalPeriods = periods.length > 0 ? periods : (context.mentionedPeriod ? [context.mentionedPeriod] : []);

  return {
    type: intentType,
    metrics: finalMetrics,
    bgs: finalBGs as BusinessGroup[],
    geos: finalGeos as Geography[],
    periods: finalPeriods,
    comparisonType: comparisonType || undefined,
    groupBy: groupBy || undefined,
    sortOrder: sortOrder || undefined,
    rawQuery: query,
  };
}

function detectMetrics(q: string): string[] {
  const metrics: string[] = [];

  // Ordered: more specific patterns first
  if (/毛利率|gross\s*profit\s*%|gp\s*%|gp\s*margin|毛利\s*率/i.test(q)) metrics.push('grossProfitPct');
  else if (/毛利|gross\s*profit/i.test(q)) metrics.push('grossProfit');

  if (/营收|revenue|rev\b|收入|销售额/i.test(q) && !metrics.includes('grossProfit')) metrics.push('revenues');
  if (/经营利润|operating\s*income|oi\b|营业利润/i.test(q)) metrics.push('operatingIncome');
  if (/净利|net\s*income|净利润/i.test(q)) metrics.push('netIncome');
  if (/管线|pipeline/i.test(q)) metrics.push('pipeline');
  if (/订单|backlog|积压/i.test(q)) metrics.push('backlog');
  if (/库存|inventory/i.test(q)) metrics.push('inventory');
  if (/ccc|现金转换|cash\s*conversion|现金周期/i.test(q)) metrics.push('cccUnfunded');
  if (/woi|库存周/i.test(q)) metrics.push('woiIdg');
  if (/应收|ar\b|accounts?\s*receivable/i.test(q)) metrics.push('ar');
  if (/应付|ap\b|accounts?\s*payable/i.test(q)) metrics.push('ap');
  if (/费用|expense|成本|cost|opex/i.test(q) && metrics.length === 0) metrics.push('expenses');
  if (/cogs|销售成本/i.test(q)) metrics.push('cogs');

  return metrics;
}

function detectBGs(q: string): BusinessGroup[] {
  const bgs: BusinessGroup[] = [];
  if (/\bidg\b/i.test(q)) bgs.push('IDG');
  if (/\bisg\b/i.test(q)) bgs.push('ISG');
  if (/\bssg\b/i.test(q)) bgs.push('SSG');
  // Also detect sub-groups
  if (/pcsd/i.test(q) && !bgs.includes('IDG')) bgs.push('IDG');
  if (/mbg/i.test(q) && !bgs.includes('IDG')) bgs.push('IDG');
  return bgs;
}

function detectGeos(q: string): Geography[] {
  const geos: Geography[] = [];
  // Be careful with short codes
  if (/\bap\b|亚太/i.test(q)) geos.push('AP');
  if (/\bna\b|北美/i.test(q)) geos.push('NA');
  if (/\bla\b|拉美|拉丁美洲/i.test(q)) geos.push('LA');
  if (/europe|欧洲/i.test(q)) geos.push('Europe');
  if (/\bmeta\b|中东|非洲/i.test(q)) geos.push('Meta');
  if (/\bprc\b|中国|大陆/i.test(q)) geos.push('PRC');
  return geos;
}

function detectPeriods(q: string): string[] {
  const periods: string[] = [];
  const matches = q.match(/fy\d{2}q\d/gi);
  if (matches) {
    for (const m of matches) {
      const normalized = m.toUpperCase();
      if (QUARTERS.includes(normalized)) periods.push(normalized);
    }
  }
  // Detect relative quarters
  if (/上季|上个季度|last\s*quarter/i.test(q)) {
    const idx = QUARTERS.length - 2;
    if (idx >= 0) periods.push(QUARTERS[idx]);
  }
  return periods;
}

function detectIntentType(q: string, metrics: string[], bgs: BusinessGroup[], geos: Geography[]): ParsedIntent['type'] {
  // External: Supply chain
  if (/供应链|supply\s*chain|供应商|supplier|交期|lead\s*time|组件|component|零部件|物料|采购|procurement/i.test(q)) return 'supply_chain';
  // External: Peer / competitor
  if (/同行|竞争|competitor|peer|hp\b|dell\b|asus\b|apple\b|hpe\b|inspur\b|浪潮|惠普|戴尔|华硕|市场份额|market\s*share|对标|benchmark/i.test(q)) return 'peer_compare';
  // External: Macro
  if (/宏观|macro|gdp|pmi|通胀|inflation|汇率|exchange\s*rate|currency|利率|interest\s*rate|消费信心|consumer\s*confidence|it\s*支出|it\s*spending|经济/i.test(q)) return 'macro';
  // Correlation: internal ↔ external
  if (/关联|correlation|影响|impact|驱动.*外部|外部.*影响|内存.*价格.*影响|组件.*成本.*影响|how.*affect|怎么影响/i.test(q)) return 'correlation';
  // Compare
  if (/对比|比较|compare|vs\b|versus|差异|差距|gap/i.test(q)) return 'compare';
  // Trend
  if (/趋势|trend|变化|走势|历史|over\s*time|过去/i.test(q)) return 'trend';
  // Breakdown
  if (/拆分|breakdown|分解|构成|占比|组成|按.*分/i.test(q)) return 'breakdown';
  // Rank
  if (/排名|排序|rank|top|最高|最低|哪个.*最/i.test(q)) return 'rank';
  // Attribution (Phase 3)
  if (/原因|驱动|归因|为什么|why|因素|driver|什么导致|什么造成|怎么解释|explain.*change|root\s*cause|decompos|分解.*变化|变化.*分解|拆解.*原因/i.test(q)) return 'attribution';
  // Forecast (Phase 4 placeholder)
  if (/预测|forecast|predict|达标|达成|kpi|目标|能不能|能否/i.test(q)) return 'forecast';
  // Query (has specific dimension)
  if (metrics.length > 0 || bgs.length > 0 || geos.length > 0) return 'query';

  return 'general';
}

function detectComparison(q: string): 'yoy' | 'qoq' | 'vs_budget' | 'vs_consensus' | null {
  if (/同比|yoy|year[\s-]over|去年|同期/i.test(q)) return 'yoy';
  if (/环比|qoq|quarter[\s-]over|上季|上个季度/i.test(q)) return 'qoq';
  if (/预算|budget|目标/i.test(q)) return 'vs_budget';
  if (/一致预期|consensus|彭博|bloomberg|分析师/i.test(q)) return 'vs_consensus';
  return null;
}

function detectGroupBy(q: string): 'bg' | 'geo' | null {
  if (/按.*bg|按.*业务|by\s*bg|business\s*group|各个?\s*bg|各业务/i.test(q)) return 'bg';
  if (/按.*地区|按.*区域|by\s*geo|by\s*region|各个?\s*地区|各区域|各大区/i.test(q)) return 'geo';
  return null;
}

function detectSortOrder(q: string): 'asc' | 'desc' | null {
  if (/最高|最大|top|最好|从高|降序/i.test(q)) return 'desc';
  if (/最低|最小|bottom|最差|从低|升序/i.test(q)) return 'asc';
  return null;
}

/* ------------------------------------------------------------------ */
/*  Response Router — Dispatch to appropriate handler                  */
/* ------------------------------------------------------------------ */

export function generateAIResponse(query: string, filters: FilterState, context: ConversationContext): AIResponse {
  const intent = parseIntent(query, context);

  // Update context
  const updatedContext: Partial<ConversationContext> = {
    lastIntent: intent,
  };
  if (intent.metrics.length > 0) updatedContext.mentionedMetrics = intent.metrics;
  if (intent.bgs.length > 0) updatedContext.mentionedBGs = intent.bgs;
  if (intent.geos.length > 0) updatedContext.mentionedGeos = intent.geos;
  if (intent.periods.length > 0) updatedContext.mentionedPeriod = intent.periods[0];

  switch (intent.type) {
    case 'query':
      return handleQuery(intent, filters, updatedContext);
    case 'compare':
      return handleCompare(intent, filters, updatedContext);
    case 'trend':
      return handleTrend(intent, filters, updatedContext);
    case 'breakdown':
      return handleBreakdown(intent, filters, updatedContext);
    case 'rank':
      return handleRank(intent, filters, updatedContext);
    case 'supply_chain':
      return handleSupplyChain(intent, filters, updatedContext);
    case 'peer_compare':
      return handlePeerCompare(intent, filters, updatedContext);
    case 'macro':
      return handleMacro(intent, filters, updatedContext);
    case 'correlation':
      return handleCorrelation(intent, filters, updatedContext);
    case 'attribution':
      return handleAttribution(intent, filters, updatedContext);
    case 'forecast':
      return handleForecast(intent, filters, updatedContext);
    default:
      return handleGeneral(intent, filters, updatedContext);
  }
}

/* ------------------------------------------------------------------ */
/*  Intent Handlers                                                    */
/* ------------------------------------------------------------------ */

function handleQuery(intent: ParsedIntent, filters: FilterState, ctx: Partial<ConversationContext>): AIResponse {
  const metric = intent.metrics[0] || 'revenues';

  // Special: expense breakdown
  if (metric === 'expenses') {
    return handleExpenseQuery(intent, filters, ctx);
  }

  // Special: CCC/working capital
  if (metric === 'cccUnfunded' || metric === 'woiIdg' || metric === 'ar' || metric === 'ap') {
    return handleWorkingCapitalQuery(metric, intent, filters, ctx);
  }

  // General cross query
  const result = crossQuery(intent.metrics, intent.bgs, intent.geos, intent.periods, filters);
  const blocks: MessageBlock[] = [{ type: 'text', content: result.summary }];

  // Add chart
  if (result.data.length > 0) {
    const chartOption = buildChartOption(result, metric, intent.type);
    blocks.push({ type: 'chart', chartOption, height: 200 });
  }

  // Add insights
  for (const insight of result.insights) {
    blocks.push({ type: 'insight', level: 'info', text: insight });
  }

  // Add source tag
  blocks.push({ type: 'source_tag', sources: ['内部财务数据'] });

  return { text: result.summary, blocks, updatedContext: ctx };
}

function handleExpenseQuery(_intent: ParsedIntent, filters: FilterState, ctx: Partial<ConversationContext>): AIResponse {
  const opData = getSecondaryData(filters);
  const latest = opData[opData.length - 1];
  if (!latest) return { text: '暂无费用数据。', blocks: [{ type: 'text', content: '暂无费用数据。' }], updatedContext: ctx };

  const totalExpense = latest.smExpense + latest.rdExpense + latest.fixedExpense;
  const smPct = Math.round(latest.smExpense / totalExpense * 1000) / 10;
  const rdPct = Math.round(latest.rdExpense / totalExpense * 1000) / 10;
  const fixedPct = Math.round(latest.fixedExpense / totalExpense * 1000) / 10;

  const text = `${filters.quarter} 总运营费用为 ${formatCurrency(totalExpense)}：\n• 销售及市场费用 ${formatCurrency(latest.smExpense)} (${smPct}%)\n• 研发费用 ${formatCurrency(latest.rdExpense)} (${rdPct}%)\n• 固定费用 ${formatCurrency(latest.fixedExpense)} (${fixedPct}%)`;

  const blocks: MessageBlock[] = [
    { type: 'text', content: text },
    {
      type: 'chart',
      title: '费用构成',
      chartOption: {
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        series: [{
          type: 'pie',
          radius: ['35%', '65%'],
          data: [
            { value: latest.smExpense, name: 'S&M', itemStyle: { color: '#E12726' } },
            { value: latest.rdExpense, name: 'R&D', itemStyle: { color: '#0073CE' } },
            { value: latest.fixedExpense, name: 'Fixed', itemStyle: { color: '#F5A623' } },
          ],
          label: { formatter: '{b}\n{d}%', fontSize: 10 },
        }],
      },
      height: 200,
    },
  ];

  // Expense ratio insights
  const expRevRatio = Math.round(totalExpense / latest.revenues * 1000) / 10;
  blocks.push({ type: 'insight', level: expRevRatio > 25 ? 'warning' : 'info', text: `费效比：运营费用占营收 ${expRevRatio}%。` });
  blocks.push({ type: 'source_tag', sources: ['内部财务数据'] });

  return { text, blocks, updatedContext: ctx };
}

function handleWorkingCapitalQuery(metric: string, _intent: ParsedIntent, filters: FilterState, ctx: Partial<ConversationContext>): AIResponse {
  const opData = getSecondaryData(filters);
  const latest = opData[opData.length - 1];
  if (!latest) return { text: '暂无数据。', blocks: [{ type: 'text', content: '暂无数据。' }], updatedContext: ctx };

  const metricLabel = getMetricLabel(metric);
  const values = opData.map(d => getOpMetricValue(d, metric));
  const latestVal = values[values.length - 1];
  const prevVal = values.length > 1 ? values[values.length - 2] : latestVal;
  const change = latestVal - prevVal;
  const isDay = metric === 'cccUnfunded' || metric === 'woiIdg';

  const text = `${metricLabel} 当前为 ${isDay ? `${latestVal} 天` : formatCurrency(latestVal)}，${change > 0 ? '环比上升' : change < 0 ? '环比下降' : '环比持平'} ${Math.abs(change)}${isDay ? ' 天' : ''}。`;

  const blocks: MessageBlock[] = [
    { type: 'text', content: text },
    {
      type: 'chart',
      title: `${metricLabel} 趋势`,
      chartOption: {
        tooltip: { trigger: 'axis' },
        grid: { left: 50, right: 10, top: 10, bottom: 24 },
        xAxis: { type: 'category', data: opData.map(d => d.period), axisLabel: { fontSize: 10 } },
        yAxis: { type: 'value', name: isDay ? '天' : '' },
        series: [{
          type: 'line',
          data: values,
          smooth: true,
          lineStyle: { color: '#0073CE' },
          itemStyle: { color: '#0073CE' },
          areaStyle: { opacity: 0.08 },
        }],
      },
      height: 180,
    },
  ];

  // Alert thresholds
  if (metric === 'cccUnfunded' && latestVal >= 42) {
    blocks.push({ type: 'insight', level: 'alert', text: `⚠️ CCC 已达 ${latestVal} 天，超过 42 天预警阈值。` });
  } else if (metric === 'woiIdg' && latestVal >= 45) {
    blocks.push({ type: 'insight', level: 'alert', text: `⚠️ WOI 已达 ${latestVal} 周，超过 45 周预警阈值。` });
  }

  blocks.push({ type: 'source_tag', sources: ['内部财务数据'] });
  return { text, blocks, updatedContext: ctx };
}

function handleCompare(intent: ParsedIntent, filters: FilterState, ctx: Partial<ConversationContext>): AIResponse {
  const metric = intent.metrics[0] || 'revenues';
  const rawCompType = intent.comparisonType || 'qoq';
  const compType = rawCompType === 'cross' ? 'qoq' : rawCompType;

  const result = compareQuery(metric, intent.bgs, intent.geos, compType, filters);
  const blocks: MessageBlock[] = [{ type: 'text', content: result.summary }];

  if (result.data.length > 0) {
    const chartOption = buildChartOption(result, metric, 'compare');
    blocks.push({ type: 'chart', chartOption, height: 200 });
  }

  // Add table for detailed comparison
  if (result.data.length > 0 && result.data[0].changePct !== undefined) {
    const headers = ['业务集团', '当期', '对比期', '变化', '变化率'];
    const rows = result.data.map(d => [
      d.bg as string,
      isPercentMetric(metric) ? formatPercent(d.current as number) : formatCurrency(d.current as number),
      isPercentMetric(metric) ? formatPercent(d.previous as number) : formatCurrency(d.previous as number),
      isPercentMetric(metric) ? formatPercent(d.change as number) : formatCurrency(d.change as number),
      `${(d.changePct as number) >= 0 ? '+' : ''}${d.changePct}%`,
    ]);
    blocks.push({ type: 'table', headers, rows });
  }

  for (const insight of result.insights) {
    const level = insight.includes('⚠️') ? 'warning' : 'info';
    blocks.push({ type: 'insight', level, text: insight.replace('⚠️ ', '') });
  }

  blocks.push({ type: 'source_tag', sources: ['内部财务数据'] });
  return { text: result.summary, blocks, updatedContext: ctx };
}

function handleTrend(intent: ParsedIntent, filters: FilterState, ctx: Partial<ConversationContext>): AIResponse {
  const metric = intent.metrics[0] || 'revenues';
  const result = trendQuery(metric, intent.bgs, intent.geos, filters);
  const blocks: MessageBlock[] = [{ type: 'text', content: result.summary }];

  if (result.data.length > 0) {
    const chartOption = buildChartOption(result, metric, 'trend');
    blocks.push({ type: 'chart', chartOption, title: `${getMetricLabel(metric)} 趋势`, height: 200 });
  }

  for (const insight of result.insights) {
    blocks.push({ type: 'insight', level: 'info', text: insight });
  }

  blocks.push({ type: 'source_tag', sources: ['内部财务数据'] });
  return { text: result.summary, blocks, updatedContext: ctx };
}

function handleBreakdown(intent: ParsedIntent, filters: FilterState, ctx: Partial<ConversationContext>): AIResponse {
  const metric = intent.metrics[0] || 'revenues';
  const groupBy = intent.groupBy || 'bg';

  if (groupBy === 'bg') {
    const summary = getBGSummary(filters);
    const total = summary.reduce((s, bg) => s + getMetricValueFromSummary(bg, metric), 0);

    const text = `${filters.quarter} ${getMetricLabel(metric)} 按业务集团拆分：\n` +
      summary.map(bg => {
        const val = getMetricValueFromSummary(bg, metric);
        const pct = total > 0 ? Math.round(val / total * 1000) / 10 : 0;
        return `• ${bg.bg}: ${isPercentMetric(metric) ? formatPercent(val) : formatCurrency(val)} (占比 ${pct}%)`;
      }).join('\n');

    const blocks: MessageBlock[] = [
      { type: 'text', content: text },
      {
        type: 'chart',
        title: `${getMetricLabel(metric)} 按 BG 拆分`,
        chartOption: {
          tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
          series: [{
            type: 'pie',
            radius: ['35%', '65%'],
            data: summary.map(bg => ({
              name: bg.bg,
              value: getMetricValueFromSummary(bg, metric),
              itemStyle: { color: ({ IDG: '#E12726', ISG: '#0073CE', SSG: '#00A650' } as Record<string, string>)[bg.bg] || '#0073CE' },
            })),
            label: { formatter: '{b}\n{d}%', fontSize: 10 },
          }],
        },
        height: 200,
      },
    ];

    blocks.push({ type: 'source_tag', sources: ['内部财务数据'] });
    return { text, blocks, updatedContext: ctx };
  }

  // By geo
  const result = crossQuery([metric], intent.bgs, [], intent.periods, filters);
  const geoAgg = new Map<string, number>();
  for (const row of result.data) {
    const geo = row.geo as string;
    const val = (row[metric] as number) ?? 0;
    geoAgg.set(geo, (geoAgg.get(geo) ?? 0) + val);
  }

  const sorted = Array.from(geoAgg.entries()).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, v]) => s + v, 0);

  const text = `${filters.quarter} ${getMetricLabel(metric)} 按地区拆分：\n` +
    sorted.map(([geo, val]) => {
      const pct = total > 0 ? Math.round(val / total * 1000) / 10 : 0;
      return `• ${geo}: ${formatCurrency(val)} (占比 ${pct}%)`;
    }).join('\n');

  const blocks: MessageBlock[] = [
    { type: 'text', content: text },
    {
      type: 'chart',
      chartOption: {
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        series: [{
          type: 'pie',
          radius: ['35%', '65%'],
          data: sorted.map(([geo, val]) => ({ name: geo, value: val })),
          label: { formatter: '{b}\n{d}%', fontSize: 10 },
        }],
      },
      height: 200,
    },
    { type: 'source_tag', sources: ['内部财务数据'] },
  ];

  return { text, blocks, updatedContext: ctx };
}

function handleRank(intent: ParsedIntent, filters: FilterState, ctx: Partial<ConversationContext>): AIResponse {
  const metric = intent.metrics[0] || 'revenues';
  const rawGroupBy = intent.groupBy || 'bg';
  const groupBy = rawGroupBy === 'period' ? 'bg' : rawGroupBy;
  const order = intent.sortOrder || 'desc';

  const result = rankQuery(metric, groupBy, order, filters);
  const blocks: MessageBlock[] = [{ type: 'text', content: result.summary }];

  if (result.data.length > 0) {
    const chartOption = buildChartOption(result, metric, 'rank');
    blocks.push({ type: 'chart', chartOption, height: 180 });
  }

  blocks.push({ type: 'source_tag', sources: ['内部财务数据'] });
  return { text: result.summary, blocks, updatedContext: ctx };
}

/* ------------------------------------------------------------------ */
/*  External Data Handlers (Phase 2)                                   */
/* ------------------------------------------------------------------ */

function handleSupplyChain(_intent: ParsedIntent, filters: FilterState, ctx: Partial<ConversationContext>): AIResponse {
  const scData = getSupplyChainData(filters);
  const { suppliers, componentCosts, summary } = scData;

  // Summary text
  const text = `供应链概览 (${filters.quarter})：\n` +
    `• 平均交期 ${summary.avgLeadTimeDays} 天 (${summary.avgLeadTimeChange >= 0 ? '+' : ''}${summary.avgLeadTimeChange} 天)\n` +
    `• 高风险供应商 ${summary.highRiskCount} 个\n` +
    `• 整体成本指数 ${summary.overallCostIndex} (${summary.overallCostChange >= 0 ? '+' : ''}${summary.overallCostChange}%)`;

  const blocks: MessageBlock[] = [{ type: 'text', content: text }];

  // KPI cards for supply chain summary
  blocks.push({
    type: 'kpi_card',
    cards: [
      { label: '平均交期', value: `${summary.avgLeadTimeDays} 天`, change: `${summary.avgLeadTimeChange >= 0 ? '+' : ''}${summary.avgLeadTimeChange} 天`, changeDirection: summary.avgLeadTimeChange > 0 ? 'up' : summary.avgLeadTimeChange < 0 ? 'down' : 'flat', status: summary.avgLeadTimeDays > 35 ? 'warning' : 'normal' },
      { label: '高风险供应商', value: `${summary.highRiskCount}`, status: summary.highRiskCount >= 2 ? 'danger' : 'normal' },
      { label: '成本指数', value: `${summary.overallCostIndex}`, change: `${summary.overallCostChange >= 0 ? '+' : ''}${summary.overallCostChange}%`, changeDirection: summary.overallCostChange > 0 ? 'up' : 'down' },
      { label: '供应商总数', value: `${suppliers.length}` },
    ],
  });

  // Supplier risk table
  const highRisk = suppliers.filter(s => s.riskLevel === 'high' || s.riskLevel === 'medium');
  if (highRisk.length > 0) {
    blocks.push({
      type: 'table',
      title: '关注供应商',
      headers: ['供应商', '品类', '交期(天)', '价格指数', '风险', '影响BG'],
      rows: highRisk.sort((a, b) => {
        const risk = { high: 0, medium: 1, low: 2 };
        return risk[a.riskLevel] - risk[b.riskLevel];
      }).map(s => [
        s.name,
        s.category,
        `${s.leadTimeDays} (${s.leadTimeChange >= 0 ? '+' : ''}${s.leadTimeChange})`,
        `${s.priceIndex} (${s.priceIndexChange >= 0 ? '+' : ''}${s.priceIndexChange}%)`,
        s.riskLevel === 'high' ? '🔴 高' : '🟡 中',
        s.affectedBGs.join(', '),
      ]),
    });
  }

  // Component cost trend chart
  if (componentCosts.length > 0) {
    const quarters = componentCosts[0].quarters;
    const series = componentCosts.map((c) => ({
      name: c.component,
      type: 'line' as const,
      data: c.priceIndex,
      smooth: true,
      lineStyle: { width: 2 },
    }));

    blocks.push({
      type: 'chart',
      title: '关键组件成本趋势 (基期=100)',
      chartOption: {
        tooltip: { trigger: 'axis' },
        legend: { data: componentCosts.map(c => c.component), bottom: 0, textStyle: { fontSize: 9 } },
        grid: { left: 40, right: 10, top: 10, bottom: 40 },
        xAxis: { type: 'category', data: quarters, axisLabel: { fontSize: 10 } },
        yAxis: { type: 'value', min: 80, axisLabel: { fontSize: 10 } },
        series,
      },
      height: 220,
    });
  }

  // Insights
  const gpuSupplier = suppliers.find(s => s.category.includes('GPU'));
  if (gpuSupplier && gpuSupplier.priceIndex > 110) {
    blocks.push({ type: 'insight', level: 'warning', text: `GPU/AI 加速卡价格指数达 ${gpuSupplier.priceIndex}，供应紧张推高 ISG 成本。` });
  }
  const hbmCost = componentCosts.find(c => c.component === 'HBM');
  if (hbmCost) {
    const latestHBM = hbmCost.priceIndex[hbmCost.priceIndex.length - 1];
    if (latestHBM > 120) {
      blocks.push({ type: 'insight', level: 'alert', text: `HBM 价格指数 ${latestHBM}，AI 服务器 BOM 成本持续上升。` });
    }
  }

  blocks.push({ type: 'source_tag', sources: ['供应链管理系统', '行业价格追踪'] });
  return { text, blocks, updatedContext: ctx };
}

function handlePeerCompare(_intent: ParsedIntent, filters: FilterState, ctx: Partial<ConversationContext>): AIResponse {
  const peerData = getPeerData(filters);
  const { companies, markets } = peerData;

  // Group by segment
  const segments = [...new Set(companies.map(c => c.segment))];
  const text = `行业竞争格局分析 (${filters.quarter})：\n` +
    markets.map(m =>
      `• ${m.segment}: 市场规模 $${m.totalMarketSize}B，增长 ${m.growthRate}%，联想份额 ${m.lenovoShare}% (${m.lenovoShareChange >= 0 ? '+' : ''}${m.lenovoShareChange}pp)`
    ).join('\n');

  const blocks: MessageBlock[] = [{ type: 'text', content: text }];

  // Market share charts — one per segment
  for (const market of markets) {
    blocks.push({
      type: 'chart',
      title: `${market.segment} 市场份额`,
      chartOption: {
        tooltip: { trigger: 'item', formatter: '{b}: {d}%' },
        series: [{
          type: 'pie',
          radius: ['30%', '60%'],
          data: market.topPlayers.map(p => ({
            name: p.name,
            value: p.share,
            itemStyle: {
              color: p.name.includes('Lenovo') ? chartColors.red
                : p.name === 'HP' || p.name === 'HP Inc.' ? '#0096D6'
                : p.name.includes('Dell') ? '#007DB8'
                : p.name === 'Apple' ? '#555555'
                : undefined,
            },
          })),
          label: { formatter: '{b}\n{d}%', fontSize: 9 },
          emphasis: { itemStyle: { shadowBlur: 10 } },
        }],
      },
      height: 180,
    });
  }

  // Competitor detail table for each segment
  for (const seg of segments) {
    const segCompanies = companies.filter(c => c.segment === seg);
    // Add Lenovo row
    blocks.push({
      type: 'table',
      title: `${seg} 竞争对标`,
      headers: ['公司', '季度营收', 'YoY', '毛利率', '经营利润率', '市场份额'],
      rows: segCompanies.map(c => [
        c.name,
        `$${Math.round(c.quarterlyRevenue).toLocaleString()}M`,
        `${c.revenueGrowthYoY >= 0 ? '+' : ''}${c.revenueGrowthYoY}%`,
        `${c.grossMargin}%`,
        `${c.operatingMargin}%`,
        `${c.marketShare}% (${c.marketShareChange >= 0 ? '+' : ''}${c.marketShareChange}pp)`,
      ]),
    });
  }

  // Insights
  const lenovoPCShare = markets.find(m => m.segment === 'Global PC');
  if (lenovoPCShare && lenovoPCShare.lenovoShareChange > 0) {
    blocks.push({ type: 'insight', level: 'info', text: `联想 PC 市场份额持续领先，YoY +${lenovoPCShare.lenovoShareChange}pp。` });
  }
  const serverMarket = markets.find(m => m.segment.includes('Server'));
  if (serverMarket && serverMarket.growthRate > 10) {
    blocks.push({ type: 'insight', level: 'info', text: `服务器市场增速 ${serverMarket.growthRate}%，AI 驱动需求强劲，联想 ISG 有望扩大份额。` });
  }

  blocks.push({ type: 'source_tag', sources: ['IDC', 'Gartner', 'Bloomberg'] });
  return { text, blocks, updatedContext: ctx };
}

function handleMacro(_intent: ParsedIntent, filters: FilterState, ctx: Partial<ConversationContext>): AIResponse {
  const macroData = getMacroData(filters);
  const { indicators, itSpendingForecast, currencyImpact } = macroData;

  const text = `宏观经济环境概览：`;
  const blocks: MessageBlock[] = [{ type: 'text', content: text }];

  // Key macro KPIs
  const keyIndicators = indicators.filter(ind =>
    ind.name === 'GDP Growth' && ind.region === 'Global' ||
    ind.name === 'IT Spending Growth' ||
    ind.name === 'PMI (Manufacturing)' ||
    ind.name === 'AI Infrastructure Index'
  );
  blocks.push({
    type: 'kpi_card',
    cards: keyIndicators.map(ind => ({
      label: `${ind.name}${ind.region !== 'Global' ? ` (${ind.region})` : ''}`,
      value: `${ind.value}${ind.unit}`,
      change: `${ind.change >= 0 ? '+' : ''}${ind.change}${ind.unit}`,
      changeDirection: ind.trend === 'improving' ? 'up' as const : ind.trend === 'deteriorating' ? 'down' as const : 'flat' as const,
      status: ind.trend === 'deteriorating' ? 'warning' as const : 'normal' as const,
    })),
  });

  // IT Spending trend chart
  blocks.push({
    type: 'chart',
    title: '全球 IT 支出趋势 ($B)',
    chartOption: {
      tooltip: { trigger: 'axis' },
      legend: { data: ['总计', '企业级', '消费级'], bottom: 0, textStyle: { fontSize: 10 } },
      grid: { left: 40, right: 10, top: 10, bottom: 30 },
      xAxis: { type: 'category', data: itSpendingForecast.quarters, axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10 } },
      series: [
        { name: '总计', type: 'bar', data: itSpendingForecast.global, itemStyle: { color: chartColors.blue }, barMaxWidth: 24, stack: 'total' },
        { name: '企业级', type: 'line', data: itSpendingForecast.enterprise, lineStyle: { color: chartColors.green }, itemStyle: { color: chartColors.green } },
        { name: '消费级', type: 'line', data: itSpendingForecast.consumer, lineStyle: { color: chartColors.orange }, itemStyle: { color: chartColors.orange } },
      ],
    },
    height: 200,
  });

  // Regional GDP table
  const gdpIndicators = indicators.filter(ind => ind.name === 'GDP Growth');
  blocks.push({
    type: 'table',
    title: '各区域经济环境',
    headers: ['地区', 'GDP增长', '趋势', '对联想的影响'],
    rows: gdpIndicators.map(ind => [
      ind.region,
      `${ind.value}% (${ind.change >= 0 ? '+' : ''}${ind.change}pp)`,
      ind.trend === 'improving' ? '↗ 改善' : ind.trend === 'deteriorating' ? '↘ 恶化' : '→ 稳定',
      ind.impactOnLenovo,
    ]),
  });

  // Currency impact table
  blocks.push({
    type: 'table',
    title: '汇率影响',
    headers: ['货币对', '当前汇率', 'YoY变化', '营收影响'],
    rows: currencyImpact.map(c => [
      c.pair,
      `${c.rate}`,
      `${c.changeYoY >= 0 ? '+' : ''}${c.changeYoY}%`,
      `${c.revenueImpactM >= 0 ? '+' : ''}$${c.revenueImpactM}M`,
    ]),
  });

  // Insights
  const aiIndex = indicators.find(ind => ind.name === 'AI Infrastructure Index');
  if (aiIndex && aiIndex.value > 130) {
    blocks.push({ type: 'insight', level: 'info', text: `AI 基础设施需求指数达 ${aiIndex.value}，ISG 和 SSG 受益明显。` });
  }
  const totalFxImpact = currencyImpact.reduce((s, c) => s + c.revenueImpactM, 0);
  if (totalFxImpact < -100) {
    blocks.push({ type: 'insight', level: 'warning', text: `汇率综合影响：预计本季度营收减少约 $${Math.abs(totalFxImpact)}M。` });
  }

  blocks.push({ type: 'source_tag', sources: ['IMF', 'World Bank', 'Gartner IT Spending Forecast', 'Bloomberg FX'] });
  return { text, blocks, updatedContext: ctx };
}

function handleCorrelation(_intent: ParsedIntent, filters: FilterState, ctx: Partial<ConversationContext>): AIResponse {
  const correlations = getCorrelationInsights(filters);

  const text = `内外部数据关联分析：`;
  const blocks: MessageBlock[] = [{ type: 'text', content: text }];

  for (const corr of correlations) {
    // Description
    const corrLabel = {
      strong_positive: '强正相关 ↗↗',
      moderate_positive: '中度正相关 ↗',
      weak: '弱相关 →',
      moderate_negative: '中度负相关 ↘',
      strong_negative: '强负相关 ↘↘',
    }[corr.correlation];

    blocks.push({
      type: 'insight',
      level: corr.correlation.includes('negative') ? 'warning' : 'info',
      text: `${corr.internalMetric} ↔ ${corr.externalFactor} (${corrLabel}): ${corr.description}`,
    });

    // Dual-axis chart showing correlation
    blocks.push({
      type: 'chart',
      title: `${corr.internalMetric} vs ${corr.externalFactor}`,
      chartOption: {
        tooltip: { trigger: 'axis' },
        legend: { data: [corr.internalMetric, corr.externalFactor], bottom: 0, textStyle: { fontSize: 9 } },
        grid: { left: 50, right: 50, top: 10, bottom: 30 },
        xAxis: { type: 'category', data: corr.dataPoints.map(d => d.label), axisLabel: { fontSize: 10 } },
        yAxis: [
          { type: 'value', name: corr.internalMetric, axisLabel: { fontSize: 9 }, nameTextStyle: { fontSize: 9 } },
          { type: 'value', name: corr.externalFactor, axisLabel: { fontSize: 9 }, nameTextStyle: { fontSize: 9 } },
        ],
        series: [
          { name: corr.internalMetric, type: 'bar', data: corr.dataPoints.map(d => d.internal), itemStyle: { color: chartColors.blue }, barMaxWidth: 24 },
          { name: corr.externalFactor, type: 'line', yAxisIndex: 1, data: corr.dataPoints.map(d => d.external), lineStyle: { color: chartColors.orange }, itemStyle: { color: chartColors.orange } },
        ],
      },
      height: 180,
    });
  }

  blocks.push({ type: 'source_tag', sources: ['内部财务数据', '行业指数', 'Bloomberg', 'IMF'] });
  return { text, blocks, updatedContext: ctx };
}

function handleAttribution(intent: ParsedIntent, filters: FilterState, ctx: Partial<ConversationContext>): AIResponse {
  const metric = intent.metrics[0] || 'revenues';
  const bgs = intent.bgs.length > 0 ? intent.bgs : (['IDG', 'ISG', 'SSG'] as BusinessGroup[]);

  // Detect comparison type from query: default to QoQ
  const compType = intent.comparisonType === 'yoy' ? 'yoy' : 'qoq';

  const result = runAttribution(metric, bgs, filters, compType);

  if (result.factors.length === 0) {
    const text = `暂时无法对 ${result.metricLabel} 进行归因分析。可能是因为所选时段数据不足。请尝试选择更近的季度或指定具体指标。`;
    const blocks: MessageBlock[] = [
      { type: 'text', content: text },
      { type: 'insight', level: 'warning', text: '提示：可尝试 "为什么营收同比变化" 或 "ISG 毛利率下降的原因"' },
    ];
    return { text, blocks, updatedContext: ctx };
  }

  const blocks = buildAttributionBlocks(result);
  return { text: result.summary, blocks, updatedContext: ctx };
}

function handleForecast(_intent: ParsedIntent, _filters: FilterState, ctx: Partial<ConversationContext>): AIResponse {
  const text = 'KPI 预测功能正在开发中（Phase 4），即将上线。目前您可以：\n• 查看当前实际值与预算/目标的差距\n• 分析历史趋势推断未来走向\n• 查看各 BG 的达成情况';
  const blocks: MessageBlock[] = [
    { type: 'text', content: text },
    { type: 'insight', level: 'info', text: '预测引擎将提供多情景分析和 KPI 达成路径建议。' },
  ];
  return { text, blocks, updatedContext: ctx };
}

function handleGeneral(intent: ParsedIntent, _filters: FilterState, ctx: Partial<ConversationContext>): AIResponse {
  // If the user typed something that has no finance-related keywords at all, refuse politely
  const q = (intent.metrics.length === 0 && intent.bgs.length === 0 && intent.geos.length === 0)
    ? true : false;

  // Check if the original query looks completely off-topic (no financial dimension detected)
  // If metrics/bgs/geos are all empty AND intent is 'general', it's likely a non-finance question
  if (q) {
    const refuseText = `抱歉，我是 CFO 财务分析助手，只能回答与联想集团财务相关的问题。

您可以尝试以下方向：
📊 数据查询 — "ISG 在北美的营收是多少？"
📈 趋势分析 — "过去 5 个季度毛利率趋势如何？"
🔄 对比分析 — "各 BG 营收同比变化" "实际 vs 预算"
📋 拆分分析 — "按地区拆分营收占比"
🏆 排名查询 — "哪个地区的毛利率最高？"
🔍 归因分析 — "为什么营收环比下降？"
🔗 外部数据 — "供应链风险" "同行对比" "宏观指标"`;

    const blocks: MessageBlock[] = [
      { type: 'text', content: refuseText },
      { type: 'insight', level: 'info', text: '我只能分析集团财务数据，其他问题暂不在服务范围内。' },
    ];
    return { text: refuseText, blocks, updatedContext: ctx };
  }

  const text = `我是 CFO 智能助手，可以帮您分析集团财务数据。您可以问我：

📊 数据查询 — "ISG 在北美的营收是多少？"
📈 趋势分析 — "过去 5 个季度毛利率趋势如何？"
🔄 对比分析 — "各 BG 营收同比变化" "实际 vs 预算"
📋 拆分分析 — "按地区拆分营收占比"
🏆 排名查询 — "哪个地区的毛利率最高？"
🔍 归因分析 — "为什么营收环比下降？" "毛利变化的驱动因素"
🔗 外部数据 — "供应链风险" "同行对比" "宏观指标" "外部关联"

支持的业务集团：${BUSINESS_GROUPS.join(', ')}
支持的地区：${GEOGRAPHIES.join(', ')}
数据范围：${QUARTERS[0]}–${QUARTERS[QUARTERS.length - 1]}`;

  const blocks: MessageBlock[] = [{ type: 'text', content: text }];
  return { text, blocks, updatedContext: ctx };
}

/* ------------------------------------------------------------------ */
/*  Helper Functions                                                   */
/* ------------------------------------------------------------------ */

function getOpMetricValue(d: { pipeline: number; backlog: number; revenues: number; cogs: number; grossProfit: number; smExpense: number; rdExpense: number; fixedExpense: number; inventory: number; woiIdg: number; ar: number; ap: number; cccUnfunded: number }, metric: string): number {
  const map: Record<string, number> = {
    pipeline: d.pipeline, backlog: d.backlog, revenues: d.revenues, cogs: d.cogs,
    grossProfit: d.grossProfit, smExpense: d.smExpense, rdExpense: d.rdExpense,
    fixedExpense: d.fixedExpense, inventory: d.inventory, woiIdg: d.woiIdg,
    ar: d.ar, ap: d.ap, cccUnfunded: d.cccUnfunded,
  };
  return map[metric] ?? d.revenues;
}

function getMetricValueFromSummary(bg: { revenues: number; grossProfit: number; grossProfitPct: number; operatingIncome: number }, metric: string): number {
  switch (metric) {
    case 'revenues': return bg.revenues;
    case 'grossProfit': return bg.grossProfit;
    case 'grossProfitPct': return bg.grossProfitPct;
    case 'operatingIncome': return bg.operatingIncome;
    default: return bg.revenues;
  }
}

function isPercentMetric(metric: string): boolean {
  return ['grossProfitPct', 'oiPct'].includes(metric);
}
