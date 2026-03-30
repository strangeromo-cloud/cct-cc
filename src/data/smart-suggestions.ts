/**
 * Smart Suggestions Engine
 * Dynamically generates recommended questions based on context
 */
import type { ConversationContext } from '@/types/ai-types';
import type { FilterState } from '@/types';

interface SmartSuggestion {
  text: string;
  textZh: string;
  category: 'query' | 'compare' | 'trend' | 'breakdown' | 'rank'
    | 'supply_chain' | 'peer_compare' | 'macro' | 'correlation' | 'attribution';
}

/**
 * Generate context-aware suggestions
 */
export function getSmartSuggestions(
  context: ConversationContext,
  filters: FilterState,
  page?: string,
): SmartSuggestion[] {
  const suggestions: SmartSuggestion[] = [];

  // If we have conversation context, suggest follow-ups
  if (context.lastIntent) {
    suggestions.push(...getFollowUpSuggestions(context));
  }

  // Page-aware suggestions
  if (page) {
    suggestions.push(...getPageSuggestions(page, filters));
  }

  // Always mix in some external data suggestions
  suggestions.push(...getExternalSuggestions(context));

  // If no context, show default suggestions
  if (suggestions.length < 2) {
    suggestions.push(...getDefaultSuggestions(filters));
  }

  // Deduplicate and limit
  const seen = new Set<string>();
  return suggestions.filter(s => {
    if (seen.has(s.text)) return false;
    seen.add(s.text);
    return true;
  }).slice(0, 5);
}

function getFollowUpSuggestions(context: ConversationContext): SmartSuggestion[] {
  const suggestions: SmartSuggestion[] = [];
  const { lastIntent, mentionedMetrics, mentionedBGs, mentionedGeos } = context;
  if (!lastIntent) return suggestions;

  const metric = mentionedMetrics[0] || 'revenues';
  const bg = mentionedBGs[0];
  const geo = mentionedGeos[0];

  // After a query → suggest comparison or trend
  if (lastIntent.type === 'query') {
    if (bg) {
      suggestions.push({
        text: `What's the ${metric} trend for ${bg}?`,
        textZh: `${bg} 的${getZhMetric(metric)}趋势如何？`,
        category: 'trend',
      });
      suggestions.push({
        text: `Compare ${bg} vs other BGs`,
        textZh: `${bg} 和其他 BG 对比如何？`,
        category: 'compare',
      });
    }
    if (geo) {
      suggestions.push({
        text: `Break down ${geo} by BG`,
        textZh: `按 BG 拆分 ${geo} 的数据`,
        category: 'breakdown',
      });
    }
    suggestions.push({
      text: `Show YoY change`,
      textZh: `显示同比变化`,
      category: 'compare',
    });
  }

  // After comparison → suggest drill-down or attribution
  if (lastIntent.type === 'compare') {
    suggestions.push({
      text: `Why did ${getZhMetric(metric) || metric} change?`,
      textZh: `${getZhMetric(metric)}变化的原因是什么？`,
      category: 'attribution',
    });
    suggestions.push({
      text: `Which BG contributed most to the change?`,
      textZh: `哪个 BG 对变化贡献最大？`,
      category: 'breakdown',
    });
    suggestions.push({
      text: `Show the trend over past quarters`,
      textZh: `显示过去几个季度的趋势`,
      category: 'trend',
    });
  }

  // After trend → suggest attribution or breakdown
  if (lastIntent.type === 'trend') {
    suggestions.push({
      text: `What's driving the ${getZhMetric(metric) || metric} trend?`,
      textZh: `${getZhMetric(metric)}趋势的驱动因素是什么？`,
      category: 'attribution',
    });
    suggestions.push({
      text: `Break down by region`,
      textZh: `按地区拆分`,
      category: 'breakdown',
    });
    suggestions.push({
      text: `Which region ranks highest?`,
      textZh: `哪个地区排名最高？`,
      category: 'rank',
    });
  }

  // After breakdown → suggest rank or compare
  if (lastIntent.type === 'breakdown') {
    suggestions.push({
      text: `Rank by ${metric}`,
      textZh: `按${getZhMetric(metric)}排名`,
      category: 'rank',
    });
    suggestions.push({
      text: `Compare QoQ change`,
      textZh: `对比环比变化`,
      category: 'compare',
    });
  }

  // After attribution → suggest deep dives
  if (lastIntent.type === 'attribution') {
    suggestions.push({
      text: 'Show supply chain impact details',
      textZh: '查看供应链影响详情',
      category: 'supply_chain',
    });
    suggestions.push({
      text: 'How does macro environment contribute?',
      textZh: '宏观环境如何影响？',
      category: 'macro',
    });
    suggestions.push({
      text: bg ? `Drill into ${bg} details` : 'Compare BG contributions',
      textZh: bg ? `深入分析 ${bg} 的细节` : '对比各 BG 贡献',
      category: 'breakdown',
    });
  }

  // After supply chain → suggest correlation or peer
  if (lastIntent.type === 'supply_chain') {
    suggestions.push({
      text: 'How do component costs correlate with our GP%?',
      textZh: '零部件成本与毛利率有什么关联？',
      category: 'correlation',
    });
    suggestions.push({
      text: 'Show peer comparison for this segment',
      textZh: '显示该细分市场的同行对比',
      category: 'peer_compare',
    });
  }

  // After peer compare → suggest supply chain or macro
  if (lastIntent.type === 'peer_compare') {
    suggestions.push({
      text: 'What supply chain risks affect this segment?',
      textZh: '有哪些供应链风险影响该业务？',
      category: 'supply_chain',
    });
    suggestions.push({
      text: 'How does macro environment affect our market share?',
      textZh: '宏观环境如何影响我们的市场份额？',
      category: 'correlation',
    });
  }

  // After macro → suggest correlation
  if (lastIntent.type === 'macro') {
    suggestions.push({
      text: 'Correlate IT spending with ISG revenue',
      textZh: '关联 IT 支出与 ISG 营收',
      category: 'correlation',
    });
    suggestions.push({
      text: 'Show currency impact on revenue',
      textZh: '显示汇率对营收的影响',
      category: 'macro',
    });
  }

  // After correlation → suggest drill-down
  if (lastIntent.type === 'correlation') {
    suggestions.push({
      text: 'Show the supply chain details',
      textZh: '查看供应链详情',
      category: 'supply_chain',
    });
    suggestions.push({
      text: 'What is the macro outlook?',
      textZh: '宏观经济展望如何？',
      category: 'macro',
    });
  }

  return suggestions;
}

function getPageSuggestions(page: string, _filters: FilterState): SmartSuggestion[] {
  const suggestions: SmartSuggestion[] = [];

  if (page === 'opening' || page === '/') {
    suggestions.push(
      { text: 'How does revenue compare to consensus?', textZh: '营收与一致预期相比如何？', category: 'compare' },
      { text: 'Show GP% trend by BG', textZh: '显示各 BG 毛利率趋势', category: 'trend' },
      { text: 'Revenue breakdown by BG', textZh: '按 BG 拆分营收', category: 'breakdown' },
    );
  }

  if (page === 'secondary' || page === '/secondary') {
    suggestions.push(
      { text: 'What is the CCC trend?', textZh: 'CCC 趋势如何？', category: 'trend' },
      { text: 'Show expense breakdown', textZh: '显示费用明细', category: 'query' },
      { text: 'Compare working capital QoQ', textZh: '对比营运资本环比变化', category: 'compare' },
    );
  }

  if (page === 'tertiary' || page === '/tertiary') {
    suggestions.push(
      { text: 'Which BG has the highest GP%?', textZh: '哪个 BG 毛利率最高？', category: 'rank' },
      { text: 'Revenue by BG and region', textZh: '按 BG 和地区看营收', category: 'query' },
      { text: 'Compare BG performance YoY', textZh: '各 BG 业绩同比对比', category: 'compare' },
    );
  }

  return suggestions;
}

function getExternalSuggestions(context: ConversationContext): SmartSuggestion[] {
  const suggestions: SmartSuggestion[] = [];
  const hasExternalContext = context.lastIntent &&
    ['supply_chain', 'peer_compare', 'macro', 'correlation'].includes(context.lastIntent.type);

  // If user hasn't explored external data yet, offer entry points
  if (!hasExternalContext) {
    // Rotate different external suggestions to keep things fresh
    const externalPool: SmartSuggestion[] = [
      { text: 'Any supply chain risks?', textZh: '有供应链风险吗？', category: 'supply_chain' },
      { text: 'How do we compare vs peers?', textZh: '我们和同行相比如何？', category: 'peer_compare' },
      { text: 'Show macro indicators', textZh: '查看宏观经济指标', category: 'macro' },
      { text: 'What external factors drive our revenue?', textZh: '哪些外部因素驱动营收变化？', category: 'correlation' },
      { text: 'Show component cost trends', textZh: '查看零部件成本趋势', category: 'supply_chain' },
      { text: 'Market share by segment', textZh: '各细分市场份额', category: 'peer_compare' },
      { text: 'Why did revenue change?', textZh: '营收变化的原因是什么？', category: 'attribution' },
      { text: 'What drives GP% movement?', textZh: '毛利率变化的驱动因素？', category: 'attribution' },
    ];
    // Pick 1-2 external suggestions randomly
    const shuffled = externalPool.sort(() => Math.random() - 0.5);
    suggestions.push(...shuffled.slice(0, 2));
  }

  return suggestions;
}

function getDefaultSuggestions(filters: FilterState): SmartSuggestion[] {
  return [
    { text: `Show ${filters.quarter} revenue by BG`, textZh: `显示${filters.quarter}各 BG 营收`, category: 'breakdown' },
    { text: 'Compare revenue vs consensus', textZh: '对比营收与一致预期', category: 'compare' },
    { text: 'What is the CCC trend?', textZh: 'CCC 趋势如何？', category: 'trend' },
    { text: 'Any supply chain risks?', textZh: '有供应链风险吗？', category: 'supply_chain' },
    { text: 'How do we compare vs peers?', textZh: '我们和同行相比如何？', category: 'peer_compare' },
  ];
}

function getZhMetric(metric: string): string {
  const map: Record<string, string> = {
    revenues: '营收', grossProfit: '毛利', grossProfitPct: '毛利率',
    operatingIncome: '经营利润', netIncome: '净利润', pipeline: '管线',
    backlog: '订单', inventory: '库存', cccUnfunded: 'CCC',
    expenses: '费用', ar: '应收', ap: '应付',
  };
  return map[metric] || metric;
}
