/**
 * Attribution Engine — Phase 3
 * Decomposes metric changes into internal (BG/Geo mix, volume/price)
 * and external (supply chain, macro, competitive) driving factors.
 */
import type { FilterState, BusinessGroup } from '@/types';
import type { MessageBlock } from '@/types/ai-types';
import type { EChartsOption } from 'echarts';
import { getBGSummary } from './mock-tertiary';
import { getOpeningData } from './mock-opening';
import { getSecondaryData } from './mock-secondary';
import { getSupplyChainData, getMacroData, getPeerData } from './mock-external';
import { QUARTERS, BUSINESS_GROUPS, periodToQuarter } from './constants';
import { formatCurrency, formatPercent } from '@/utils/formatters';
import { chartColors } from '@/utils/chart-theme';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AttributionFactor {
  factor: string;
  category: 'internal' | 'external';
  subcategory: string;              // e.g. 'BG Mix', 'Supply Chain', 'Macro'
  impact: number;                   // $M or pp
  impactPct: number;               // % contribution to total change
  direction: 'positive' | 'negative' | 'neutral';
  description: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface AttributionResult {
  metric: string;
  metricLabel: string;
  currentValue: number;
  priorValue: number;
  totalChange: number;
  totalChangePct: number;
  comparisonLabel: string;          // e.g. "QoQ", "YoY"
  factors: AttributionFactor[];
  summary: string;
}

/* ------------------------------------------------------------------ */
/*  Main Attribution Function                                          */
/* ------------------------------------------------------------------ */

export function runAttribution(
  metric: string,
  _bgs: BusinessGroup[],
  filters: FilterState,
  compType: 'qoq' | 'yoy',
): AttributionResult {
  const metricLabel = METRIC_LABELS[metric] || metric;
  const currentQ = periodToQuarter(filters.quarter);
  const qIdx = QUARTERS.indexOf(currentQ);
  const priorQIdx = compType === 'yoy' ? qIdx - 4 : qIdx - 1;

  if (priorQIdx < 0) {
    return {
      metric, metricLabel, currentValue: 0, priorValue: 0,
      totalChange: 0, totalChangePct: 0,
      comparisonLabel: compType === 'yoy' ? 'YoY' : 'QoQ',
      factors: [], summary: '数据不足，无法进行归因分析。',
    };
  }

  const priorQ = QUARTERS[priorQIdx];
  const compLabel = compType === 'yoy' ? 'YoY' : 'QoQ';

  // Get current and prior period data
  const currentFilters = { ...filters, quarter: currentQ };
  const priorFilters = { ...filters, quarter: priorQ };

  const opening = getOpeningData(currentFilters);
  const priorOpening = getOpeningData(priorFilters);

  // Resolve current/prior values
  const { currentValue, priorValue } = resolveMetricValues(metric, opening, priorOpening, currentFilters, priorFilters);
  const totalChange = currentValue - priorValue;
  const totalChangePct = priorValue !== 0 ? (totalChange / Math.abs(priorValue)) * 100 : 0;

  // Build attribution factors
  const factors: AttributionFactor[] = [];

  // 1. Internal: BG contribution breakdown
  factors.push(...buildBGContribution(metric, currentFilters, priorFilters, totalChange));

  // 2. External: Supply chain impact
  factors.push(...buildSupplyChainAttribution(metric, currentFilters));

  // 3. External: Macro factors
  factors.push(...buildMacroAttribution(metric, currentFilters));

  // 4. External: Competitive dynamics
  factors.push(...buildCompetitiveAttribution(metric, currentFilters));

  // 5. Internal: Operational efficiency
  factors.push(...buildOperationalAttribution(metric, currentFilters, priorFilters, totalChange));

  // Sort by absolute impact
  factors.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  // Normalize impactPct so they sum to ~100%
  const totalAttrImpact = factors.reduce((s, f) => s + Math.abs(f.impact), 0);
  if (totalAttrImpact > 0) {
    for (const f of factors) {
      f.impactPct = (f.impact / totalChange) * 100;
    }
  }

  // Generate summary
  const topPositive = factors.filter(f => f.direction === 'positive').slice(0, 2);
  const topNegative = factors.filter(f => f.direction === 'negative').slice(0, 2);
  let summary = `${metricLabel} ${compLabel} ${totalChangePct >= 0 ? '增长' : '下降'} ${formatPercent(Math.abs(totalChangePct))}（${totalChange >= 0 ? '+' : ''}${formatCurrency(totalChange)}）。`;
  if (topPositive.length > 0) {
    summary += `\n主要增长驱动：${topPositive.map(f => f.factor).join('、')}。`;
  }
  if (topNegative.length > 0) {
    summary += `\n主要拖累因素：${topNegative.map(f => f.factor).join('、')}。`;
  }

  return {
    metric, metricLabel, currentValue, priorValue,
    totalChange, totalChangePct,
    comparisonLabel: compLabel,
    factors, summary,
  };
}

/* ------------------------------------------------------------------ */
/*  Build Attribution Blocks for Chat Response                         */
/* ------------------------------------------------------------------ */

export function buildAttributionBlocks(result: AttributionResult): MessageBlock[] {
  const blocks: MessageBlock[] = [];

  // 1. Summary text
  blocks.push({ type: 'text', content: result.summary });

  // 2. KPI overview card
  blocks.push({
    type: 'kpi_card',
    cards: [
      {
        label: `${result.metricLabel} (当期)`,
        value: formatCurrency(result.currentValue),
        status: 'normal',
      },
      {
        label: `${result.metricLabel} (上期)`,
        value: formatCurrency(result.priorValue),
        status: 'normal',
      },
      {
        label: `${result.comparisonLabel} 变化`,
        value: `${result.totalChange >= 0 ? '+' : ''}${formatCurrency(result.totalChange)}`,
        change: formatPercent(Math.abs(result.totalChangePct)),
        changeDirection: result.totalChange >= 0 ? 'up' : 'down',
        status: result.totalChange >= 0 ? 'normal' : 'warning',
      },
      {
        label: '归因因素数',
        value: `${result.factors.length}`,
        status: 'normal',
      },
    ],
  });

  // 3. Waterfall chart — top factors
  const topFactors = result.factors.slice(0, 8);
  blocks.push({
    type: 'chart',
    chartOption: buildWaterfallChart(result, topFactors),
    title: `${result.metricLabel} ${result.comparisonLabel} 变化归因瀑布图`,
    height: 320,
  });

  // 4. Internal vs External split donut
  const internalImpact = result.factors.filter(f => f.category === 'internal').reduce((s, f) => s + f.impact, 0);
  const externalImpact = result.factors.filter(f => f.category === 'external').reduce((s, f) => s + f.impact, 0);
  blocks.push({
    type: 'chart',
    chartOption: buildInternalExternalPie(internalImpact, externalImpact),
    title: '内部 vs 外部因素贡献',
    height: 240,
  });

  // 5. Detail table
  blocks.push({
    type: 'table',
    title: '归因因素明细',
    headers: ['因素', '类别', '影响金额 ($M)', '贡献占比', '置信度', '说明'],
    rows: result.factors.map(f => [
      f.factor,
      f.category === 'internal' ? `内部·${f.subcategory}` : `外部·${f.subcategory}`,
      `${f.impact >= 0 ? '+' : ''}${f.impact.toFixed(0)}`,
      `${f.impactPct >= 0 ? '+' : ''}${f.impactPct.toFixed(1)}%`,
      f.confidence === 'high' ? '●●●' : f.confidence === 'medium' ? '●●○' : '●○○',
      f.description,
    ]),
  });

  // 6. Insight badges for key findings
  const highConfidence = result.factors.filter(f => f.confidence === 'high' && Math.abs(f.impactPct) > 15);
  for (const f of highConfidence.slice(0, 3)) {
    blocks.push({
      type: 'insight',
      level: f.direction === 'negative' ? 'warning' : 'info',
      text: `${f.factor}：${f.description}（贡献占比 ${f.impactPct >= 0 ? '+' : ''}${f.impactPct.toFixed(1)}%）`,
    });
  }

  // 7. Source tags
  blocks.push({
    type: 'source_tag',
    sources: ['内部财务数据', 'BG 损益表', '供应链系统', 'Bloomberg', 'IDC/Gartner'],
  });

  return blocks;
}

/* ------------------------------------------------------------------ */
/*  Internal: BG Contribution                                          */
/* ------------------------------------------------------------------ */

function buildBGContribution(
  metric: string,
  currentFilters: FilterState,
  priorFilters: FilterState,
  _totalChange: number,
): AttributionFactor[] {
  const factors: AttributionFactor[] = [];
  const currentBGs = getBGSummary(currentFilters);
  const priorBGs = getBGSummary(priorFilters);

  for (const bg of BUSINESS_GROUPS) {
    const cur = currentBGs.find(b => b.bg === bg);
    const pri = priorBGs.find(b => b.bg === bg);
    if (!cur || !pri) continue;

    const curVal = getMetricFromBGSummary(cur, metric);
    const priVal = getMetricFromBGSummary(pri, metric);
    const change = curVal - priVal;

    if (Math.abs(change) < 1) continue; // Skip negligible changes

    factors.push({
      factor: `${bg} ${METRIC_LABELS[metric] || metric}`,
      category: 'internal',
      subcategory: 'BG 贡献',
      impact: change,
      impactPct: 0, // Will be normalized later
      direction: change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral',
      description: `${bg} 的${METRIC_LABELS[metric] || metric}${change > 0 ? '增长' : '下降'} $${Math.abs(change).toFixed(0)}M`,
      confidence: 'high',
    });
  }

  return factors;
}

/* ------------------------------------------------------------------ */
/*  Internal: Operational Efficiency                                    */
/* ------------------------------------------------------------------ */

function buildOperationalAttribution(
  metric: string,
  currentFilters: FilterState,
  priorFilters: FilterState,
  _totalChange: number,
): AttributionFactor[] {
  const factors: AttributionFactor[] = [];
  const curOps = getSecondaryData(currentFilters);
  const priOps = getSecondaryData(priorFilters);

  if (curOps.length === 0 || priOps.length === 0) return factors;

  const curOp = curOps[curOps.length - 1];
  const priOp = priOps[priOps.length - 1];

  // Expense efficiency
  if (metric === 'revenues' || metric === 'operatingIncome') {
    const curExpenseRatio = (curOp.smExpense + curOp.rdExpense + curOp.fixedExpense) / curOp.revenues * 100;
    const priExpenseRatio = (priOp.smExpense + priOp.rdExpense + priOp.fixedExpense) / priOp.revenues * 100;
    const expenseRatioChange = curExpenseRatio - priExpenseRatio;
    // Approximate OI impact of expense ratio change
    const expenseImpact = -(expenseRatioChange / 100) * curOp.revenues;

    if (Math.abs(expenseImpact) > 5) {
      factors.push({
        factor: '运营费用率变化',
        category: 'internal',
        subcategory: '运营效率',
        impact: Math.round(expenseImpact),
        impactPct: 0,
        direction: expenseImpact > 0 ? 'positive' : 'negative',
        description: `运营费用率${expenseRatioChange < 0 ? '下降' : '上升'} ${Math.abs(expenseRatioChange).toFixed(1)}pp，${expenseImpact > 0 ? '释放' : '侵蚀'}利润空间`,
        confidence: 'high',
      });
    }
  }

  // Working capital efficiency
  if (metric === 'revenues' || metric === 'operatingIncome') {
    const cccChange = curOp.cccUnfunded - priOp.cccUnfunded;
    if (Math.abs(cccChange) > 1) {
      // CCC impact is indirect — estimate cash efficiency effect
      const cashImpact = -cccChange * (curOp.revenues / 90) * 0.02; // Rough proxy
      factors.push({
        factor: '现金周转周期 (CCC)',
        category: 'internal',
        subcategory: '运营效率',
        impact: Math.round(cashImpact),
        impactPct: 0,
        direction: cccChange < 0 ? 'positive' : 'negative',
        description: `CCC ${cccChange < 0 ? '缩短' : '延长'} ${Math.abs(cccChange).toFixed(0)} 天，${cccChange < 0 ? '改善' : '恶化'}资金效率`,
        confidence: 'medium',
      });
    }
  }

  return factors;
}

/* ------------------------------------------------------------------ */
/*  External: Supply Chain Attribution                                  */
/* ------------------------------------------------------------------ */

function buildSupplyChainAttribution(
  metric: string,
  filters: FilterState,
): AttributionFactor[] {
  const factors: AttributionFactor[] = [];
  const sc = getSupplyChainData(filters);

  if (metric === 'revenues' || metric === 'grossProfit' || metric === 'grossProfitPct') {
    // High-risk suppliers impact
    const highRiskSuppliers = sc.suppliers.filter(s => s.riskLevel === 'high');
    if (highRiskSuppliers.length > 0) {
      const names = highRiskSuppliers.map(s => s.name).join('、');
      // Estimate impact: high risk suppliers with rising prices compress margins
      const avgPriceChange = highRiskSuppliers.reduce((s, sup) => s + sup.priceIndexChange, 0) / highRiskSuppliers.length;
      const estimatedImpact = -avgPriceChange * 15; // ~$15M per 1% price index point for high-risk components

      factors.push({
        factor: `关键供应商风险 (${names})`,
        category: 'external',
        subcategory: '供应链',
        impact: Math.round(estimatedImpact),
        impactPct: 0,
        direction: estimatedImpact > 0 ? 'positive' : 'negative',
        description: `高风险供应商价格指数平均变化 ${avgPriceChange > 0 ? '+' : ''}${avgPriceChange.toFixed(1)}%，影响零部件采购成本`,
        confidence: 'medium',
      });
    }

    // Overall component cost change
    const costChange = sc.summary.overallCostChange;
    if (Math.abs(costChange) > 1) {
      const costImpact = -costChange * 25; // ~$25M per 1% overall cost index change
      factors.push({
        factor: '零部件综合成本',
        category: 'external',
        subcategory: '供应链',
        impact: Math.round(costImpact),
        impactPct: 0,
        direction: costImpact > 0 ? 'positive' : 'negative',
        description: `零部件综合成本指数变化 ${costChange > 0 ? '+' : ''}${costChange.toFixed(1)}%，${costChange > 0 ? '压缩' : '释放'}毛利空间`,
        confidence: 'medium',
      });
    }
  }

  return factors;
}

/* ------------------------------------------------------------------ */
/*  External: Macro Attribution                                         */
/* ------------------------------------------------------------------ */

function buildMacroAttribution(
  metric: string,
  filters: FilterState,
): AttributionFactor[] {
  const factors: AttributionFactor[] = [];
  const macro = getMacroData(filters);

  if (metric === 'revenues' || metric === 'grossProfit' || metric === 'operatingIncome') {
    // IT spending trend impact
    const itSpending = macro.indicators.find(i => i.name === 'IT Spending Growth');
    if (itSpending) {
      const impact = itSpending.change * 80; // ~$80M per 1pp IT spending growth acceleration
      factors.push({
        factor: '全球 IT 支出增长',
        category: 'external',
        subcategory: '宏观经济',
        impact: Math.round(impact),
        impactPct: 0,
        direction: impact > 0 ? 'positive' : 'negative',
        description: `全球 IT 支出增速${itSpending.change > 0 ? '加速' : '放缓'} ${Math.abs(itSpending.change).toFixed(1)}pp 至 ${itSpending.value}%，${itSpending.trend === 'improving' ? '利好' : '不利于'}企业级收入`,
        confidence: 'medium',
      });
    }

    // Currency impact
    const totalFxImpact = macro.currencyImpact.reduce((s, c) => s + c.revenueImpactM, 0);
    if (Math.abs(totalFxImpact) > 10) {
      const topFx = macro.currencyImpact.sort((a, b) => Math.abs(b.revenueImpactM) - Math.abs(a.revenueImpactM))[0];
      factors.push({
        factor: '汇率波动影响',
        category: 'external',
        subcategory: '宏观经济',
        impact: totalFxImpact,
        impactPct: 0,
        direction: totalFxImpact > 0 ? 'positive' : 'negative',
        description: `汇率波动对营收的综合影响约 $${totalFxImpact}M（主要受 ${topFx.pair} 变动 ${topFx.changeYoY > 0 ? '+' : ''}${topFx.changeYoY}% 驱动）`,
        confidence: 'high',
      });
    }

    // Consumer confidence (affects IDG)
    const prcConfidence = macro.indicators.find(i => i.name === 'Consumer Confidence' && i.region === 'PRC');
    if (prcConfidence && prcConfidence.trend === 'deteriorating') {
      const impact = prcConfidence.change * 20; // ~$20M per 1pt consumer confidence change
      factors.push({
        factor: '中国消费者信心',
        category: 'external',
        subcategory: '宏观经济',
        impact: Math.round(impact),
        impactPct: 0,
        direction: impact > 0 ? 'positive' : 'negative',
        description: `中国消费者信心指数下降 ${Math.abs(prcConfidence.change).toFixed(1)} 点至 ${prcConfidence.value}，抑制 PC 消费类需求`,
        confidence: 'medium',
      });
    }

    // AI Infrastructure Index (affects ISG)
    const aiIndex = macro.indicators.find(i => i.name === 'AI Infrastructure Index');
    if (aiIndex && aiIndex.change > 0) {
      const impact = aiIndex.change * 12; // ~$12M per 1pt AI index increase
      factors.push({
        factor: 'AI 基础设施需求',
        category: 'external',
        subcategory: '宏观经济',
        impact: Math.round(impact),
        impactPct: 0,
        direction: 'positive',
        description: `AI 基础设施需求指数上升 ${aiIndex.change} 点至 ${aiIndex.value}，驱动 ISG 服务器及解决方案业务增长`,
        confidence: 'high',
      });
    }
  }

  return factors;
}

/* ------------------------------------------------------------------ */
/*  External: Competitive Attribution                                   */
/* ------------------------------------------------------------------ */

function buildCompetitiveAttribution(
  metric: string,
  filters: FilterState,
): AttributionFactor[] {
  const factors: AttributionFactor[] = [];
  const peer = getPeerData(filters);

  if (metric === 'revenues' || metric === 'grossProfit') {
    // Market share gains/losses
    for (const market of peer.markets) {
      if (Math.abs(market.lenovoShareChange) > 0.2) {
        // Revenue impact of share change: totalMarket * shareChange * 1000 (B→M) / 100 (pp→%)
        const revenueImpact = market.totalMarketSize * (market.lenovoShareChange / 100) * 1000;
        const segment = market.segment === 'Global PC' ? 'PC' :
                       market.segment === 'Server & Infrastructure' ? '服务器' : 'IT 服务';
        factors.push({
          factor: `${segment}市场份额变化`,
          category: 'external',
          subcategory: '竞争格局',
          impact: Math.round(revenueImpact),
          impactPct: 0,
          direction: market.lenovoShareChange > 0 ? 'positive' : 'negative',
          description: `${market.segment} 市场份额${market.lenovoShareChange > 0 ? '提升' : '下降'} ${Math.abs(market.lenovoShareChange).toFixed(1)}pp 至 ${market.lenovoShare}%（市场总规模 $${market.totalMarketSize}B）`,
          confidence: 'medium',
        });
      }
    }
  }

  return factors;
}

/* ------------------------------------------------------------------ */
/*  Chart Builders                                                      */
/* ------------------------------------------------------------------ */

function buildWaterfallChart(result: AttributionResult, factors: AttributionFactor[]): EChartsOption {
  // Waterfall: start → factors → end
  const categories = ['上期', ...factors.map(f => f.factor), '当期'];

  // Build invisible base for waterfall effect
  const base: number[] = [];
  const positive: (number | string)[] = [];
  const negative: (number | string)[] = [];

  let running = result.priorValue;
  // First bar: full height, no base
  base.push(0);
  positive.push(running);
  negative.push('-');

  for (const f of factors) {
    if (f.impact >= 0) {
      base.push(running);
      positive.push(f.impact);
      negative.push('-');
      running += f.impact;
    } else {
      running += f.impact;
      base.push(running);
      positive.push('-');
      negative.push(Math.abs(f.impact));
    }
  }

  // Last bar: total
  base.push(0);
  positive.push(result.currentValue);
  negative.push('-');

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const idx = params[0]?.dataIndex ?? 0;
        if (idx === 0) return `上期: $${result.priorValue.toFixed(0)}M`;
        if (idx === categories.length - 1) return `当期: $${result.currentValue.toFixed(0)}M`;
        const f = factors[idx - 1];
        return `${f.factor}<br/>影响: ${f.impact >= 0 ? '+' : ''}$${f.impact.toFixed(0)}M<br/>类别: ${f.category === 'internal' ? '内部' : '外部'}·${f.subcategory}`;
      },
    },
    grid: { left: 60, right: 20, top: 20, bottom: 80 },
    xAxis: {
      type: 'category',
      data: categories,
      axisLabel: { rotate: 30, fontSize: 10, color: '#666' },
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: '${value}M', fontSize: 10 },
    },
    series: [
      {
        name: 'Base',
        type: 'bar',
        stack: 'waterfall',
        itemStyle: { borderColor: 'transparent', color: 'transparent' },
        emphasis: { itemStyle: { borderColor: 'transparent', color: 'transparent' } },
        data: base,
      },
      {
        name: '增长',
        type: 'bar',
        stack: 'waterfall',
        itemStyle: { color: '#00A650' },
        label: {
          show: true,
          position: 'top',
          formatter: (p: any) => {
            const v = p.value;
            return v !== '-' && v > 0 ? `+${v.toFixed(0)}` : '';
          },
          fontSize: 9,
          color: '#00A650',
        },
        data: positive,
      },
      {
        name: '下降',
        type: 'bar',
        stack: 'waterfall',
        itemStyle: { color: '#E12726' },
        label: {
          show: true,
          position: 'bottom',
          formatter: (p: any) => {
            const v = p.value;
            return v !== '-' && v > 0 ? `-${v.toFixed(0)}` : '';
          },
          fontSize: 9,
          color: '#E12726',
        },
        data: negative,
      },
    ],
  };
}

function buildInternalExternalPie(internalImpact: number, externalImpact: number): EChartsOption {
  const data = [
    { name: '内部因素', value: Math.abs(internalImpact) },
    { name: '外部因素', value: Math.abs(externalImpact) },
  ];

  return {
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => `${p.name}: $${p.value.toFixed(0)}M (${p.percent}%)`,
    },
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 6,
          borderColor: '#fff',
          borderWidth: 2,
        },
        label: {
          show: true,
          formatter: '{b}\n{d}%',
          fontSize: 11,
        },
        data: data.map((d, i) => ({
          ...d,
          itemStyle: { color: i === 0 ? chartColors.blue : chartColors.orange },
        })),
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function resolveMetricValues(
  metric: string,
  opening: ReturnType<typeof getOpeningData>,
  priorOpening: ReturnType<typeof getOpeningData>,
  currentFilters: FilterState,
  priorFilters: FilterState,
): { currentValue: number; priorValue: number } {
  // For opening-page metrics, use opening data directly
  const metricMap: Record<string, keyof ReturnType<typeof getOpeningData>> = {
    revenues: 'revenues',
    grossProfit: 'grossProfit',
    grossProfitPct: 'grossProfitPct',
    operatingIncome: 'operatingIncome',
  };

  const openingKey = metricMap[metric];
  if (openingKey) {
    const cur = opening[openingKey] as { actual: number };
    const pri = priorOpening[openingKey] as { actual: number };
    return { currentValue: cur.actual, priorValue: pri.actual };
  }

  // For operational metrics, use secondary data
  const curOps = getSecondaryData(currentFilters);
  const priOps = getSecondaryData(priorFilters);
  if (curOps.length > 0 && priOps.length > 0) {
    const curOp = curOps[curOps.length - 1];
    const priOp = priOps[priOps.length - 1];
    const val = (d: any) => d[metric] ?? 0;
    return { currentValue: val(curOp), priorValue: val(priOp) };
  }

  return { currentValue: 0, priorValue: 0 };
}

function getMetricFromBGSummary(
  bg: { revenues: number; grossProfit: number; grossProfitPct: number; operatingIncome: number },
  metric: string,
): number {
  switch (metric) {
    case 'revenues': return bg.revenues;
    case 'grossProfit': return bg.grossProfit;
    case 'grossProfitPct': return bg.grossProfitPct;
    case 'operatingIncome': return bg.operatingIncome;
    default: return bg.revenues;
  }
}

const METRIC_LABELS: Record<string, string> = {
  revenues: '营收',
  grossProfit: '毛利',
  grossProfitPct: '毛利率',
  operatingIncome: '经营利润',
  netIncome: '净利润',
  expenses: '运营费用',
  cccUnfunded: '现金周转周期',
  inventory: '库存',
  ar: '应收账款',
  ap: '应付账款',
};
