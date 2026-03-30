/**
 * External Data — Supply Chain, Peer Benchmarks, Macro Economics
 * Mock data simulating Bloomberg, industry reports, supply chain systems
 */
import type { FilterState } from '@/types';
import { periodToQuarter, QUARTERS } from './constants';

/* ================================================================== */
/*  SUPPLY CHAIN DATA                                                  */
/* ================================================================== */

export interface SupplierInfo {
  name: string;
  category: string;
  leadTimeDays: number;
  leadTimeChange: number;       // vs prior quarter
  priceIndex: number;           // 100 = baseline
  priceIndexChange: number;     // vs prior quarter
  riskLevel: 'low' | 'medium' | 'high';
  affectedBGs: string[];
  region: string;
}

export interface ComponentCostTrend {
  component: string;
  quarters: string[];
  priceIndex: number[];         // 100 = FY24Q1 baseline
  affectedBGs: string[];
}

export interface SupplyChainData {
  suppliers: SupplierInfo[];
  componentCosts: ComponentCostTrend[];
  summary: {
    avgLeadTimeDays: number;
    avgLeadTimeChange: number;
    highRiskCount: number;
    overallCostIndex: number;
    overallCostChange: number;
  };
}

const suppliersBase: SupplierInfo[] = [
  { name: 'Intel', category: 'CPU', leadTimeDays: 28, leadTimeChange: -3, priceIndex: 95, priceIndexChange: -2.1, riskLevel: 'low', affectedBGs: ['IDG', 'ISG'], region: 'NA' },
  { name: 'AMD', category: 'CPU/GPU', leadTimeDays: 32, leadTimeChange: -2, priceIndex: 102, priceIndexChange: 1.5, riskLevel: 'low', affectedBGs: ['IDG', 'ISG'], region: 'NA' },
  { name: 'NVIDIA', category: 'GPU/AI Accelerator', leadTimeDays: 45, leadTimeChange: 5, priceIndex: 118, priceIndexChange: 8.2, riskLevel: 'high', affectedBGs: ['ISG', 'SSG'], region: 'NA' },
  { name: 'Samsung', category: 'Memory/SSD', leadTimeDays: 21, leadTimeChange: -1, priceIndex: 112, priceIndexChange: 6.3, riskLevel: 'medium', affectedBGs: ['IDG', 'ISG'], region: 'AP' },
  { name: 'SK Hynix', category: 'Memory/HBM', leadTimeDays: 25, leadTimeChange: 3, priceIndex: 125, priceIndexChange: 12.5, riskLevel: 'high', affectedBGs: ['ISG'], region: 'AP' },
  { name: 'TSMC', category: 'Foundry', leadTimeDays: 56, leadTimeChange: -8, priceIndex: 105, priceIndexChange: 2.0, riskLevel: 'medium', affectedBGs: ['IDG', 'ISG', 'SSG'], region: 'AP' },
  { name: 'BOE', category: 'Display Panel', leadTimeDays: 18, leadTimeChange: -2, priceIndex: 88, priceIndexChange: -5.4, riskLevel: 'low', affectedBGs: ['IDG'], region: 'PRC' },
  { name: 'LG Display', category: 'Display Panel', leadTimeDays: 22, leadTimeChange: 0, priceIndex: 92, priceIndexChange: -3.1, riskLevel: 'low', affectedBGs: ['IDG'], region: 'AP' },
  { name: 'Foxconn', category: 'Assembly/ODM', leadTimeDays: 14, leadTimeChange: -1, priceIndex: 103, priceIndexChange: 1.8, riskLevel: 'low', affectedBGs: ['IDG'], region: 'PRC' },
  { name: 'Broadcom', category: 'Networking', leadTimeDays: 35, leadTimeChange: 2, priceIndex: 108, priceIndexChange: 3.5, riskLevel: 'medium', affectedBGs: ['ISG'], region: 'NA' },
];

const componentCostBases: ComponentCostTrend[] = [
  { component: 'CPU (x86)', quarters: [], priceIndex: [], affectedBGs: ['IDG', 'ISG'] },
  { component: 'GPU/AI Accelerator', quarters: [], priceIndex: [], affectedBGs: ['ISG', 'SSG'] },
  { component: 'DRAM', quarters: [], priceIndex: [], affectedBGs: ['IDG', 'ISG'] },
  { component: 'NAND/SSD', quarters: [], priceIndex: [], affectedBGs: ['IDG', 'ISG'] },
  { component: 'Display Panel', quarters: [], priceIndex: [], affectedBGs: ['IDG'] },
  { component: 'HBM', quarters: [], priceIndex: [], affectedBGs: ['ISG'] },
];

const componentPriceSeries: Record<string, number[]> = {
  'CPU (x86)':          [100, 98, 96, 95, 94, 93, 95, 96, 95],
  'GPU/AI Accelerator': [100, 102, 108, 112, 115, 118, 122, 125, 118],
  'DRAM':               [100, 95, 92, 98, 105, 108, 112, 115, 112],
  'NAND/SSD':           [100, 96, 90, 88, 92, 96, 100, 104, 100],
  'Display Panel':      [100, 98, 95, 92, 90, 88, 86, 85, 88],
  'HBM':                [100, 105, 112, 120, 128, 135, 140, 145, 125],
};

export function getSupplyChainData(filters: FilterState): SupplyChainData {
  const qIdx = QUARTERS.indexOf(periodToQuarter(filters.quarter));
  const bgFilter = filters.selectedBGs;

  // Filter suppliers by BG if specified
  let suppliers = [...suppliersBase];
  if (bgFilter.length > 0) {
    suppliers = suppliers.filter(s => s.affectedBGs.some(bg => bgFilter.includes(bg as any)));
  }

  // Vary data slightly by quarter
  suppliers = suppliers.map(s => ({
    ...s,
    leadTimeDays: s.leadTimeDays + Math.round((qIdx - 8) * 0.5),
    priceIndex: s.priceIndex + Math.round((qIdx - 8) * 0.3),
  }));

  // Build component cost trends
  const startIdx = Math.max(0, qIdx - 4);
  const quarters = QUARTERS.slice(startIdx, qIdx + 1);
  const componentCosts = componentCostBases.map(c => ({
    ...c,
    quarters,
    priceIndex: quarters.map((_, i) => componentPriceSeries[c.component]?.[startIdx + i] ?? 100),
  }));

  // Summary
  const avgLeadTime = Math.round(suppliers.reduce((s, sup) => s + sup.leadTimeDays, 0) / suppliers.length);
  const avgLeadTimeChange = Math.round(suppliers.reduce((s, sup) => s + sup.leadTimeChange, 0) / suppliers.length * 10) / 10;
  const highRiskCount = suppliers.filter(s => s.riskLevel === 'high').length;
  const overallCostIndex = Math.round(suppliers.reduce((s, sup) => s + sup.priceIndex, 0) / suppliers.length);
  const overallCostChange = Math.round(suppliers.reduce((s, sup) => s + sup.priceIndexChange, 0) / suppliers.length * 10) / 10;

  return {
    suppliers,
    componentCosts,
    summary: { avgLeadTimeDays: avgLeadTime, avgLeadTimeChange: avgLeadTimeChange, highRiskCount, overallCostIndex, overallCostChange },
  };
}

/* ================================================================== */
/*  PEER / COMPETITOR DATA                                             */
/* ================================================================== */

export interface PeerCompany {
  name: string;
  segment: string;              // 对标业务线
  matchesBG: string;            // 对标的联想 BG
  quarterlyRevenue: number;     // $M
  revenueGrowthYoY: number;     // %
  grossMargin: number;          // %
  operatingMargin: number;      // %
  marketShare: number;          // %
  marketShareChange: number;    // pp vs prior year
}

export interface MarketSegment {
  segment: string;
  totalMarketSize: number;      // $B
  growthRate: number;            // YoY %
  lenovoRevenue: number;        // $M
  lenovoShare: number;          // %
  lenovoShareChange: number;    // pp vs prior year
  topPlayers: { name: string; share: number }[];
}

export interface PeerData {
  companies: PeerCompany[];
  markets: MarketSegment[];
}

const peerBase: Record<string, PeerCompany[]> = {
  FY26Q1: [
    { name: 'HP Inc.', segment: 'PC', matchesBG: 'IDG', quarterlyRevenue: 13800, revenueGrowthYoY: 3.2, grossMargin: 21.5, operatingMargin: 8.8, marketShare: 20.8, marketShareChange: -0.5 },
    { name: 'Dell Technologies', segment: 'PC', matchesBG: 'IDG', quarterlyRevenue: 12200, revenueGrowthYoY: 2.8, grossMargin: 22.0, operatingMargin: 6.5, marketShare: 16.2, marketShareChange: -0.3 },
    { name: 'Apple', segment: 'PC', matchesBG: 'IDG', quarterlyRevenue: 7800, revenueGrowthYoY: 4.5, grossMargin: 38.2, operatingMargin: 30.1, marketShare: 8.5, marketShareChange: 0.2 },
    { name: 'ASUS', segment: 'PC', matchesBG: 'IDG', quarterlyRevenue: 3600, revenueGrowthYoY: 5.2, grossMargin: 15.8, operatingMargin: 5.2, marketShare: 7.1, marketShareChange: 0.3 },
    { name: 'Dell Technologies', segment: 'Server/ISG', matchesBG: 'ISG', quarterlyRevenue: 11500, revenueGrowthYoY: 12.5, grossMargin: 32.0, operatingMargin: 11.2, marketShare: 31.5, marketShareChange: 0.8 },
    { name: 'HPE', segment: 'Server/ISG', matchesBG: 'ISG', quarterlyRevenue: 7200, revenueGrowthYoY: 8.3, grossMargin: 34.5, operatingMargin: 10.5, marketShare: 15.2, marketShareChange: -0.4 },
    { name: 'Inspur', segment: 'Server/ISG', matchesBG: 'ISG', quarterlyRevenue: 4200, revenueGrowthYoY: 15.8, grossMargin: 12.5, operatingMargin: 3.8, marketShare: 10.8, marketShareChange: 1.2 },
    { name: 'Accenture', segment: 'IT Services', matchesBG: 'SSG', quarterlyRevenue: 16200, revenueGrowthYoY: 6.5, grossMargin: 33.0, operatingMargin: 15.8, marketShare: 5.2, marketShareChange: 0.1 },
    { name: 'IBM', segment: 'IT Services', matchesBG: 'SSG', quarterlyRevenue: 4500, revenueGrowthYoY: 3.2, grossMargin: 56.5, operatingMargin: 18.2, marketShare: 3.8, marketShareChange: -0.1 },
  ],
};

const marketSegments: MarketSegment[] = [
  {
    segment: 'Global PC',
    totalMarketSize: 62.5,
    growthRate: 3.8,
    lenovoRevenue: 14200,
    lenovoShare: 23.5,
    lenovoShareChange: 0.6,
    topPlayers: [
      { name: 'Lenovo', share: 23.5 },
      { name: 'HP', share: 20.8 },
      { name: 'Dell', share: 16.2 },
      { name: 'Apple', share: 8.5 },
      { name: 'ASUS', share: 7.1 },
    ],
  },
  {
    segment: 'Server & Infrastructure',
    totalMarketSize: 32.8,
    growthRate: 14.2,
    lenovoRevenue: 3400,
    lenovoShare: 6.2,
    lenovoShareChange: 0.5,
    topPlayers: [
      { name: 'Dell', share: 31.5 },
      { name: 'HPE', share: 15.2 },
      { name: 'Inspur', share: 10.8 },
      { name: 'Lenovo', share: 6.2 },
      { name: 'Supermicro', share: 5.8 },
    ],
  },
  {
    segment: 'IT Services & Solutions',
    totalMarketSize: 120.0,
    growthRate: 7.5,
    lenovoRevenue: 1800,
    lenovoShare: 1.5,
    lenovoShareChange: 0.3,
    topPlayers: [
      { name: 'Accenture', share: 5.2 },
      { name: 'IBM', share: 3.8 },
      { name: 'TCS', share: 3.2 },
      { name: 'Infosys', share: 2.8 },
      { name: 'Lenovo SSG', share: 1.5 },
    ],
  },
];

export function getPeerData(filters: FilterState): PeerData {
  const q = periodToQuarter(filters.quarter);
  const companies = peerBase[q] || peerBase.FY26Q1 || [];

  // Filter by BG if specified
  let filteredCompanies = companies;
  if (filters.selectedBGs.length > 0) {
    filteredCompanies = companies.filter(c =>
      filters.selectedBGs.includes(c.matchesBG as any)
    );
  }

  return { companies: filteredCompanies, markets: marketSegments };
}

/* ================================================================== */
/*  MACRO ECONOMIC DATA                                                */
/* ================================================================== */

export interface MacroIndicator {
  name: string;
  region: string;
  value: number;
  unit: string;
  change: number;               // vs prior period
  trend: 'improving' | 'stable' | 'deteriorating';
  impactOnLenovo: string;       // Brief description
  affectedBGs: string[];
}

export interface MacroData {
  indicators: MacroIndicator[];
  itSpendingForecast: {
    quarters: string[];
    global: number[];           // $B
    enterprise: number[];       // $B
    consumer: number[];         // $B
  };
  currencyImpact: {
    pair: string;
    rate: number;
    changeYoY: number;          // %
    revenueImpactM: number;     // $M impact on Lenovo
  }[];
}

export function getMacroData(filters: FilterState): MacroData {
  const qIdx = QUARTERS.indexOf(periodToQuarter(filters.quarter));
  const startIdx = Math.max(0, qIdx - 4);
  const quarters = QUARTERS.slice(startIdx, qIdx + 1);

  const indicators: MacroIndicator[] = [
    { name: 'GDP Growth', region: 'Global', value: 3.1, unit: '%', change: 0.2, trend: 'improving', impactOnLenovo: '全球经济温和复苏，IT 支出增长预期上调', affectedBGs: ['IDG', 'ISG', 'SSG'] },
    { name: 'GDP Growth', region: 'PRC', value: 4.8, unit: '%', change: -0.3, trend: 'stable', impactOnLenovo: '中国市场增速放缓，消费电子需求承压', affectedBGs: ['IDG'] },
    { name: 'GDP Growth', region: 'NA', value: 2.5, unit: '%', change: 0.3, trend: 'improving', impactOnLenovo: '北美企业级 IT 更新需求回暖', affectedBGs: ['ISG', 'SSG'] },
    { name: 'GDP Growth', region: 'Europe', value: 1.2, unit: '%', change: 0.1, trend: 'stable', impactOnLenovo: '欧洲经济低增长，但数字化转型投资持续', affectedBGs: ['ISG', 'SSG'] },
    { name: 'PMI (Manufacturing)', region: 'Global', value: 52.3, unit: '', change: 1.1, trend: 'improving', impactOnLenovo: 'PMI 回升至扩张区间，企业采购意愿增强', affectedBGs: ['IDG', 'ISG'] },
    { name: 'IT Spending Growth', region: 'Global', value: 8.6, unit: '%', change: 1.5, trend: 'improving', impactOnLenovo: 'AI 驱动 IT 支出加速增长，服务器需求旺盛', affectedBGs: ['ISG', 'SSG'] },
    { name: 'Consumer Confidence', region: 'PRC', value: 88.5, unit: '', change: -2.1, trend: 'deteriorating', impactOnLenovo: '消费者信心下降，PC 消费升级放缓', affectedBGs: ['IDG'] },
    { name: 'Consumer Confidence', region: 'NA', value: 105.2, unit: '', change: 3.5, trend: 'improving', impactOnLenovo: '北美消费信心走强，有利于高端 PC 销售', affectedBGs: ['IDG'] },
    { name: 'Inflation Rate', region: 'Global', value: 3.2, unit: '%', change: -0.5, trend: 'improving', impactOnLenovo: '通胀缓和，运营成本压力减轻', affectedBGs: ['IDG', 'ISG', 'SSG'] },
    { name: 'AI Infrastructure Index', region: 'Global', value: 145, unit: '', change: 18, trend: 'improving', impactOnLenovo: 'AI 基础设施需求指数持续走高，ISG 受益明显', affectedBGs: ['ISG', 'SSG'] },
  ];

  // IT Spending Forecast
  const baseSpending = [280, 275, 295, 310, 290, 285, 305, 325, 300];
  const itSpendingForecast = {
    quarters,
    global: quarters.map((_, i) => baseSpending[startIdx + i] ?? 300),
    enterprise: quarters.map((_, i) => Math.round((baseSpending[startIdx + i] ?? 300) * 0.65)),
    consumer: quarters.map((_, i) => Math.round((baseSpending[startIdx + i] ?? 300) * 0.35)),
  };

  const currencyImpact = [
    { pair: 'USD/CNY', rate: 7.25, changeYoY: 2.1, revenueImpactM: -180 },
    { pair: 'USD/EUR', rate: 0.92, changeYoY: -1.5, revenueImpactM: 85 },
    { pair: 'USD/JPY', rate: 152.3, changeYoY: 5.8, revenueImpactM: -45 },
    { pair: 'USD/BRL', rate: 5.15, changeYoY: 3.2, revenueImpactM: -30 },
  ];

  return { indicators, itSpendingForecast, currencyImpact };
}

/* ================================================================== */
/*  INTERNAL-EXTERNAL CORRELATION ANALYSIS                             */
/* ================================================================== */

export interface CorrelationInsight {
  internalMetric: string;
  externalFactor: string;
  correlation: 'strong_positive' | 'moderate_positive' | 'weak' | 'moderate_negative' | 'strong_negative';
  description: string;
  dataPoints: { label: string; internal: number; external: number }[];
}

export function getCorrelationInsights(filters: FilterState): CorrelationInsight[] {
  return [
    {
      internalMetric: 'ISG Revenue',
      externalFactor: 'AI Infrastructure Index',
      correlation: 'strong_positive',
      description: 'ISG 营收与 AI 基础设施需求指数高度正相关 (r=0.92)。AI 投资每增长 10%，ISG 营收约增长 6-8%。',
      dataPoints: [
        { label: 'FY25Q1', internal: 3200, external: 110 },
        { label: 'FY25Q2', internal: 3100, external: 108 },
        { label: 'FY25Q3', internal: 3500, external: 125 },
        { label: 'FY25Q4', internal: 3800, external: 138 },
        { label: 'FY26Q1', internal: 3400, external: 145 },
      ],
    },
    {
      internalMetric: 'IDG GP%',
      externalFactor: 'DRAM Price Index',
      correlation: 'moderate_negative',
      description: 'IDG 毛利率与 DRAM 价格指数中度负相关 (r=-0.68)。内存价格上涨压缩 PC 利润空间。',
      dataPoints: [
        { label: 'FY25Q1', internal: 28.5, external: 105 },
        { label: 'FY25Q2', internal: 29.2, external: 108 },
        { label: 'FY25Q3', internal: 27.8, external: 112 },
        { label: 'FY25Q4', internal: 27.2, external: 115 },
        { label: 'FY26Q1', internal: 27.8, external: 112 },
      ],
    },
    {
      internalMetric: 'IDG PRC Revenue',
      externalFactor: 'PRC Consumer Confidence',
      correlation: 'moderate_positive',
      description: '中国区 IDG 营收与消费者信心指数正相关 (r=0.75)。信心指数每下降 5 个点，PRC PC 销量约下降 3%。',
      dataPoints: [
        { label: 'FY25Q1', internal: 3500, external: 95.2 },
        { label: 'FY25Q2', internal: 3200, external: 92.1 },
        { label: 'FY25Q3', internal: 3400, external: 91.5 },
        { label: 'FY25Q4', internal: 3600, external: 90.6 },
        { label: 'FY26Q1', internal: 3300, external: 88.5 },
      ],
    },
    {
      internalMetric: 'Overall Revenue',
      externalFactor: 'USD/CNY Exchange Rate',
      correlation: 'moderate_negative',
      description: '美元走强对联想以美元计价的营收产生负面影响 (r=-0.55)。美元每升值 1%，换算营收约减少 $60M。',
      dataPoints: [
        { label: 'FY25Q1', internal: 15600, external: 7.12 },
        { label: 'FY25Q2', internal: 15200, external: 7.18 },
        { label: 'FY25Q3', internal: 16800, external: 7.20 },
        { label: 'FY25Q4', internal: 19200, external: 7.22 },
        { label: 'FY26Q1', internal: 17200, external: 7.25 },
      ],
    },
  ];
}
