export type Language = 'en' | 'zh';

export interface Translations {
  // Header & Nav
  appTitle: string;
  navQuarterOverview: string;
  navOperatingNumbers: string;
  navBGBreakdown: string;
  aiAssistant: string;

  // Filter Bar
  filterTime: string;
  filterQuarter: string;
  filterBG: string;
  filterGeo: string;
  filterAll: string;
  timeDaily: string;
  timeMonthly: string;
  timeQuarterly: string;

  // Opening Page
  openingTitle: string;
  openingSubtitle: string;
  revenue: string;
  grossProfit: string;
  grossProfitPct: string;
  operatingIncome: string;
  netIncome: string;
  vsPrior: string;
  actualVsConsensus: string;
  profitabilityAnalysis: string;
  keyMarginRatios: string;
  quarterlyRevenueTrend: string;
  consensusBeatMiss: string;
  metric: string;
  actual: string;
  consensus: string;
  delta: string;
  status: string;
  beat: string;
  miss: string;

  // Secondary Page
  secondaryTitle: string;
  secondarySubtitle: string;
  revToOIBridge: string;
  expenseBreakdown: string;
  workingCapitalTrend: string;
  fullOperatingMetrics: string;
  days: string;
  total: string;

  // Secondary Page - 4 Tier Sections
  tierForwardMomentum: string;
  tierProfitability: string;
  tierAssetVelocity: string;
  tierCashFlow: string;
  coverageRatio: string;
  coverageRatioDesc: string;
  pipelineBacklogTrend: string;
  expenseRatioTrends: string;
  woiTrend: string;
  inventoryTrend: string;
  arVsAp: string;
  cccKpi: string;
  budgetLabel: string;
  dangerThreshold: string;

  // Metric Labels
  metricPipeline: string;
  metricBacklog: string;
  metricRevenues: string;
  metricCOGS: string;
  metricGrossProfit: string;
  metricSMExpense: string;
  metricRDExpense: string;
  metricFixedExpense: string;
  metricInventory: string;
  metricWOI: string;
  metricAR: string;
  metricAP: string;
  metricCCC: string;

  // Tertiary Page
  tertiaryTitle: string;
  tertiarySubtitle: string;
  revenueByBG: string;
  revenueShare: string;
  bgPerformanceComparison: string;
  bgComparison: string;
  opIncome: string;
  bgGPMarginTrend: string;
  bgOIMarginComparison: string;
  geoRevHeatmap: string;
  geoProfitabilityComparison: string;

  // AI Chat
  aiChatTitle: string;
  aiChatPlaceholder: string;
  aiChatWelcome: string;
  aiChatHint: string;
  aiClearChat: string;
  aiFollowUp: string;

  // Suggested queries
  suggestGP: string;
  suggestRevConsensus: string;
  suggestCCC: string;
  suggestBGBreakdown: string;
  suggestExpenses: string;
}
