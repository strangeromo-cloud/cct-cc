import type { EChartsOption } from 'echarts';
import type { BusinessGroup, Geography } from './index';

/* ------------------------------------------------------------------ */
/*  Intent & Entity Types                                              */
/* ------------------------------------------------------------------ */

export type IntentType =
  | 'query'           // 查询具体数据
  | 'compare'         // 对比分析
  | 'trend'           // 趋势分析
  | 'breakdown'       // 拆分分析
  | 'rank'            // 排名查询
  | 'supply_chain'    // 供应链分析
  | 'peer_compare'    // 同行对标
  | 'macro'           // 宏观经济
  | 'correlation'     // 内外部关联分析
  | 'attribution'     // 归因分析 (Phase 3)
  | 'forecast'        // 预测分析 (Phase 4)
  | 'general';        // 通用/兜底

export interface ParsedIntent {
  type: IntentType;
  metrics: string[];
  bgs: BusinessGroup[];
  geos: Geography[];
  periods: string[];
  comparisonType?: 'yoy' | 'qoq' | 'vs_budget' | 'vs_consensus' | 'cross';
  groupBy?: 'bg' | 'geo' | 'period';
  sortOrder?: 'asc' | 'desc';
  externalDomain?: 'supply_chain' | 'peer' | 'macro';
  rawQuery: string;
}

/* ------------------------------------------------------------------ */
/*  Query Engine Types                                                 */
/* ------------------------------------------------------------------ */

export interface QueryParams {
  metrics: string[];
  dimensions: {
    bgs?: BusinessGroup[];
    geos?: Geography[];
    periods?: string[];
  };
  comparison?: {
    type: 'yoy' | 'qoq' | 'vs_budget' | 'vs_consensus';
  };
  groupBy?: 'bg' | 'geo' | 'period';
  sortBy?: { metric: string; order: 'asc' | 'desc' };
  limit?: number;
}

export interface DataRow {
  bg?: string;
  geo?: string;
  period?: string;
  [metric: string]: string | number | undefined;
}

export type ChartType = 'bar' | 'line' | 'pie' | 'heatmap' | 'radar' | 'horizontal_bar' | 'waterfall' | 'grouped_bar' | 'stacked_bar';

export interface QueryResult {
  data: DataRow[];
  summary: string;
  chartSuggestion: ChartType;
  insights: string[];
}

/* ------------------------------------------------------------------ */
/*  Message Block Types (Rich Response)                                */
/* ------------------------------------------------------------------ */

export type MessageBlock =
  | TextBlock
  | ChartBlock
  | KPIBlock
  | TableBlock
  | InsightBlock
  | SourceTagBlock
  | ThinkingBlock;

export interface TextBlock {
  type: 'text';
  content: string;
}

export interface ChartBlock {
  type: 'chart';
  chartOption: EChartsOption;
  title?: string;
  height?: number;
}

export interface KPICardData {
  label: string;
  value: string;
  change?: string;
  changeDirection?: 'up' | 'down' | 'flat';
  status?: 'normal' | 'warning' | 'danger';
}

export interface KPIBlock {
  type: 'kpi_card';
  cards: KPICardData[];
}

export interface TableBlock {
  type: 'table';
  title?: string;
  headers: string[];
  rows: string[][];
  highlights?: { row: number; col: number; color: string }[];
}

export interface InsightBlock {
  type: 'insight';
  level: 'info' | 'warning' | 'alert';
  text: string;
}

export interface SourceTagBlock {
  type: 'source_tag';
  sources: string[];
}

export interface ThinkingBlock {
  type: 'thinking';
  steps: string[];                // Accumulated thinking steps
  complete?: boolean;             // true when thinking is done → auto-collapse
}

/* ------------------------------------------------------------------ */
/*  Chat Message (Extended)                                            */
/* ------------------------------------------------------------------ */

export interface RichChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;               // Plain text fallback
  blocks?: MessageBlock[];       // Rich content blocks
  chartData?: EChartsOption | null; // Legacy support
  timestamp: Date;
}

/* ------------------------------------------------------------------ */
/*  Conversation Context (Multi-turn)                                  */
/* ------------------------------------------------------------------ */

export interface ConversationContext {
  currentTopic: string | null;
  mentionedMetrics: string[];
  mentionedBGs: BusinessGroup[];
  mentionedGeos: Geography[];
  mentionedPeriod: string | null;
  lastIntent: ParsedIntent | null;
}

export const EMPTY_CONTEXT: ConversationContext = {
  currentTopic: null,
  mentionedMetrics: [],
  mentionedBGs: [],
  mentionedGeos: [],
  mentionedPeriod: null,
  lastIntent: null,
};

/* ------------------------------------------------------------------ */
/*  AI Response                                                        */
/* ------------------------------------------------------------------ */

export interface AIResponse {
  text: string;
  blocks: MessageBlock[];
  updatedContext: Partial<ConversationContext>;
}
