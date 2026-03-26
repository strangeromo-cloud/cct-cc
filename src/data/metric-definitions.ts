import type { Language } from '@/types/i18n';

interface MetricDef {
  definition: string;
  formula?: string;
}

type MetricKey =
  | 'pipeline' | 'backlog' | 'revenues' | 'cogs' | 'grossProfit'
  | 'smExpense' | 'rdExpense' | 'fixedExpense'
  | 'inventory' | 'woiIdg' | 'ar' | 'ap' | 'cccUnfunded'
  | 'coverageRatio' | 'grossProfitPct' | 'operatingIncome' | 'netIncome'
  | 'expenseRatio' | 'revToOIBridge' | 'arVsAp';

const en: Record<MetricKey, MetricDef> = {
  pipeline: {
    definition: 'Total value of sales opportunities currently in progress. Indicates future revenue potential.',
  },
  backlog: {
    definition: 'Orders received but not yet fulfilled. Represents committed future revenue.',
  },
  coverageRatio: {
    definition: 'How many times the pipeline covers the current quarter revenue target. Higher = safer.',
    formula: 'Pipeline ÷ Revenue',
  },
  revenues: {
    definition: 'Total income generated from business operations in the period.',
  },
  cogs: {
    definition: 'Direct costs attributable to the production of goods sold.',
  },
  grossProfit: {
    definition: 'Revenue remaining after deducting the direct cost of goods sold.',
    formula: 'Revenue - COGS',
  },
  grossProfitPct: {
    definition: 'Percentage of revenue retained as gross profit. Measures production efficiency.',
    formula: 'Gross Profit ÷ Revenue × 100',
  },
  operatingIncome: {
    definition: 'Profit from core business operations after all operating expenses.',
    formula: 'Gross Profit - S&M - R&D - Fixed Expenses',
  },
  netIncome: {
    definition: 'Bottom-line profit after all expenses, interest, and taxes.',
    formula: 'Operating Income - Interest - Tax',
  },
  smExpense: {
    definition: 'Costs related to selling products and marketing activities.',
  },
  rdExpense: {
    definition: 'Investment in research and development of new products and technologies.',
  },
  fixedExpense: {
    definition: 'Overhead costs that do not vary with production volume (rent, admin, etc.).',
  },
  inventory: {
    definition: 'Total value of goods held in stock, ready for sale or in production.',
  },
  woiIdg: {
    definition: 'Number of weeks of inventory on hand for IDG. Lower = faster turnover.',
    formula: 'Inventory ÷ (COGS ÷ 52)',
  },
  ar: {
    definition: 'Money owed to the company by customers for goods/services already delivered.',
  },
  ap: {
    definition: 'Money the company owes to suppliers for goods/services already received.',
  },
  cccUnfunded: {
    definition: 'Days it takes to convert inventory investment into cash from sales.',
    formula: 'DIO + DSO - DPO',
  },
  expenseRatio: {
    definition: 'Expense as a percentage of revenue. Tracks cost efficiency over time.',
    formula: 'Expense ÷ Revenue × 100',
  },
  revToOIBridge: {
    definition: 'Waterfall showing how revenue converts to operating income through cost deductions.',
  },
  arVsAp: {
    definition: 'Comparison of receivables vs payables. The gap indicates net working capital tied up.',
    formula: 'Net = AR - AP',
  },
};

const zh: Record<MetricKey, MetricDef> = {
  pipeline: {
    definition: '当前进行中的销售机会总价值，反映未来营收潜力。',
  },
  backlog: {
    definition: '已接收但尚未交付的订单，代表已承诺的未来收入。',
  },
  coverageRatio: {
    definition: '管线金额覆盖本季营收目标的倍数。越高越安全。',
    formula: '管线 ÷ 营收',
  },
  revenues: {
    definition: '期间内业务运营产生的总收入。',
  },
  cogs: {
    definition: '直接归属于已售商品生产的成本。',
  },
  grossProfit: {
    definition: '扣除直接销售成本后的剩余收入。',
    formula: '营收 - 销售成本',
  },
  grossProfitPct: {
    definition: '营收中保留为毛利的百分比，衡量生产效率。',
    formula: '毛利 ÷ 营收 × 100',
  },
  operatingIncome: {
    definition: '扣除所有运营费用后的核心业务利润。',
    formula: '毛利 - 销售费用 - 研发费用 - 固定费用',
  },
  netIncome: {
    definition: '扣除所有费用、利息和税后的最终利润。',
    formula: '经营利润 - 利息 - 税',
  },
  smExpense: {
    definition: '与产品销售和市场推广相关的成本。',
  },
  rdExpense: {
    definition: '用于新产品和技术研发的投资。',
  },
  fixedExpense: {
    definition: '不随产量变化的固定成本（租金、行政等）。',
  },
  inventory: {
    definition: '持有的库存商品总价值，包括成品和在产品。',
  },
  woiIdg: {
    definition: 'IDG 库存可供销售的周数。越低表示周转越快。',
    formula: '库存 ÷ (销售成本 ÷ 52)',
  },
  ar: {
    definition: '客户因已交付商品/服务而欠公司的款项。',
  },
  ap: {
    definition: '公司因已收到商品/服务而欠供应商的款项。',
  },
  cccUnfunded: {
    definition: '将库存投资转化为销售现金所需的天数。',
    formula: 'DIO + DSO - DPO',
  },
  expenseRatio: {
    definition: '费用占营收的百分比，追踪成本效率变化。',
    formula: '费用 ÷ 营收 × 100',
  },
  revToOIBridge: {
    definition: '展示收入如何通过各项成本扣减转化为经营利润的瀑布图。',
  },
  arVsAp: {
    definition: '应收与应付的对比，差额反映被占用的净营运资金。',
    formula: '净额 = 应收 - 应付',
  },
};

const definitions: Record<Language, Record<MetricKey, MetricDef>> = { en, zh };

export function getMetricDef(language: Language, key: string): MetricDef | undefined {
  return definitions[language]?.[key as MetricKey];
}

export type { MetricKey };
