# CFO 智能对话助手改造方案

## 一、现状分析

当前 AI 助手是一个基于**正则匹配**的简单问答系统：
- 通过关键词检测指标（revenue, GP%, CCC 等）、BG 和 Geo
- 匹配到预设路径后返回固定模板文本 + 图表
- 仅能查询当前 mock 数据中已有的单一维度指标
- 无外部数据、无预测能力、无多轮推理

---

## 二、目标架构：三层智能引擎

```
┌─────────────────────────────────────────────────────────────┐
│                     CFO 对话界面 (Chat UI)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ 文本回复  │  │ 交互图表  │  │ 数据卡片  │  │ 操作建议卡 │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                   意图理解层 (Intent Engine)                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  LLM 意图分类 → 实体提取 → 多轮上下文管理              │   │
│  │  支持：查询 / 对比 / 归因 / 预测 / 建议 五大意图        │   │
│  └──────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│                   数据编排层 (Data Orchestration)             │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────┐    │
│  │ 内部数据引擎 │  │ 外部数据引擎 │  │ 分析 & 预测引擎    │    │
│  │ BG×Geo×Time │  │ 供应链/同行  │  │ 归因/预测/路径推荐 │    │
│  └────────────┘  └────────────┘  └────────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│                   数据层 (Data Sources)                       │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌────────────────┐  │
│  │内部财务DB │ │供应链数据 │ │行业报告   │ │Bloomberg/Wind │  │
│  └─────────┘ └─────────┘ └──────────┘ └────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、五大核心能力模块

### 模块 1：内部数据交叉查询

**目标**：CFO 可用自然语言对 BG × Geo × Time 任意组合进行交叉查询。

**典型问题**：
- "ISG 在北美 Q3 的 revenue 和 GP% 是多少？"
- "对比 IDG 和 SSG 过去四个季度的 OI 变化趋势"
- "哪个大区的 CCC 最高？按 BG 拆分给我看"
- "PRC 区域各 BG 的毛利贡献占比是多少？"

**实现方案**：

```
src/
  data/
    query-engine.ts          # 统一查询引擎
      ├── crossQuery()       # BG × Geo × Time 交叉查询
      ├── compareQuery()     # 多维对比查询
      ├── rankQuery()        # 排名查询
      └── trendQuery()       # 趋势查询
```

**查询引擎核心接口**：
```typescript
interface QueryParams {
  metrics: string[];           // ['revenue', 'grossProfitPct', 'ccc']
  dimensions: {
    bgs?: BusinessGroup[];     // 不传 = 全部
    geos?: Geography[];        // 不传 = 全部
    periods?: string[];        // 支持区间: ['FY25Q1', 'FY26Q1']
  };
  comparison?: {
    type: 'yoy' | 'qoq' | 'vs_budget' | 'vs_consensus';
  };
  groupBy?: 'bg' | 'geo' | 'period';
  sortBy?: { metric: string; order: 'asc' | 'desc' };
  limit?: number;
}

interface QueryResult {
  data: DataRow[];
  summary: string;             // 自然语言总结
  chartSuggestion: ChartType;  // 推荐图表类型
  insights: string[];          // 自动洞察
}
```

**图表自动选择逻辑**：
| 查询模式 | 推荐图表 |
|---------|---------|
| 单指标 × 多BG | 柱状图 |
| 单指标 × 时间趋势 | 折线图 |
| BG × Geo 矩阵 | 热力图 |
| 占比分析 | 饼图/环形图 |
| 多指标对比 | 雷达图 |
| 排名 | 水平条形图 |
| Waterfall 分解 | 瀑布图 |

---

### 模块 2：外部数据集成

**目标**：引入供应链、同行竞争、宏观经济等外部数据，与内部数据关联。

**数据源设计**：

```typescript
// src/data/external-data.ts

// 1. 供应链数据
interface SupplyChainData {
  suppliers: {
    name: string;              // "Intel", "AMD", "TSMC"
    category: string;          // "CPU", "Memory", "Display"
    leadTime: number;          // 交付周期 (天)
    leadTimeChange: number;    // 较上期变化
    priceIndex: number;        // 价格指数 (基期=100)
    priceIndexChange: number;
    riskLevel: 'low' | 'medium' | 'high';
    affectedBGs: BusinessGroup[];
  }[];
  componentCosts: TrendData[]; // 关键组件成本趋势
}

// 2. 行业同行数据
interface PeerData {
  companies: {
    name: string;              // "HP", "Dell", "ASUS"
    segment: string;           // 对标业务线
    quarterlyRevenue: number;
    revenueGrowthYoY: number;
    grossMargin: number;
    operatingMargin: number;
    marketShare: number;
  }[];
  marketTrends: {
    segment: string;           // "PC", "Server", "Software"
    totalMarketSize: number;
    growthRate: number;
    lenovoShare: number;
    shareChange: number;
  }[];
}

// 3. 宏观经济指标
interface MacroData {
  gdpGrowth: Record<string, number>;      // 按地区
  currencyRates: Record<string, number>;   // 汇率波动
  inflationRate: Record<string, number>;
  techSpendingIndex: number;               // IT 支出指数
  pmiIndex: Record<string, number>;        // 采购经理人指数
}
```

**典型问题**：
- "内存价格上涨对我们 GP% 的影响有多大？"
- "联想 PC 业务和 HP、Dell 相比市场份额如何变化？"
- "供应链交付周期延长会影响哪些 BG 的 revenue？"
- "北美市场 IT 支出趋势如何？对 ISG 有什么影响？"

---

### 模块 3：驱动因素归因分析

**目标**：自动识别内部指标变化的关键驱动因素，结合内外部数据给出归因。

**归因引擎设计**：

```typescript
// src/data/attribution-engine.ts

interface AttributionResult {
  metric: string;              // 被分析的指标
  period: string;
  totalChange: number;         // 总变化量
  totalChangePct: number;      // 总变化率
  factors: AttributionFactor[];
  narrative: string;           // 自然语言归因叙述
}

interface AttributionFactor {
  name: string;                // "IDG Revenue Decline"
  category: 'internal' | 'external' | 'macro';
  impact: number;              // 贡献金额
  impactPct: number;           // 贡献占比
  direction: 'positive' | 'negative';
  evidence: string;            // 支撑依据
  relatedData?: ChartData;     // 可视化证据
}
```

**归因维度**：

```
Revenue 变化归因
├── 内部因素
│   ├── 各 BG 贡献拆分 (IDG +3%, ISG -1%, SSG +2%)
│   ├── 各 Geo 贡献拆分 (PRC +5%, NA -2%, ...)
│   ├── 产品组合变化 (高端占比提升)
│   └── 定价策略调整
├── 外部因素
│   ├── 市场需求变化 (PC 市场回暖 +2pp)
│   ├── 竞争格局变化 (HP 丢失份额 → 联想承接)
│   └── 供应链改善 (交期缩短 → 积压订单释放)
└── 宏观因素
    ├── 汇率影响 (美元走强 -1.5%)
    ├── IT 支出周期 (企业更新周期启动)
    └── 区域经济 (PRC 消费复苏)
```

**可视化方案**：瀑布图展示各因素贡献

```
Revenue QoQ Change: +$1.2B (+7.1%)
═══════════════════════════════════
IDG Volume      ████████████  +$600M
ISG AI Server   ██████        +$320M
SSG Growth      ███           +$180M
FX Impact       ▓▓            -$120M
Price Pressure  ▓             -$80M
Market Shift    ██            +$100M
                ─────────────────────
Net Change                    +$1.0B
```

---

### 模块 4：KPI 预测与达成分析

**目标**：基于历史趋势和当前数据，预测各 KPI 达成情况，评估差距。

**预测模型设计**：

```typescript
// src/data/forecast-engine.ts

interface ForecastResult {
  metric: string;
  target: number;              // KPI 目标值
  currentActual: number;       // 当前实际值
  forecastValue: number;       // 预测值
  confidence: number;          // 置信度 (0-1)
  gap: number;                 // 差距 (forecast - target)
  gapPct: number;
  status: 'on_track' | 'at_risk' | 'off_track';
  scenarios: Scenario[];
  achievementPaths: Path[];    // 达成路径建议
}

interface Scenario {
  name: string;                // "Base", "Optimistic", "Pessimistic"
  probability: number;
  forecastValue: number;
  assumptions: string[];
}

interface Path {
  id: string;
  description: string;
  feasibility: 'high' | 'medium' | 'low';
  impact: number;              // 预计提升金额
  timeframe: string;           // "本季度内" / "下季度"
  actions: string[];           // 具体行动
  risks: string[];             // 风险因素
  responsibleBG?: string;
}
```

**预测方法**（前端 mock 阶段用简化模型，后端迁移后接入真实模型）：

```
预测方法选择:
├── 短期 (季度内): 线性回归 + 季节性调整
├── 中期 (1-2季度): ARIMA / 指数平滑
└── 长期 (年度): 多因子回归
    ├── 内部因子: Pipeline, Backlog, 历史增长率
    ├── 外部因子: 市场规模增长, 同行增速
    └── 宏观因子: GDP, IT支出指数
```

**典型问题**：
- "本季度 revenue 能达标吗？"
- "要达成全年 OI target，下半年需要做到什么水平？"
- "如果 ISG 增速下降 5%，整体 NI 会怎样？"
- "为了补上 GP% 的缺口，有哪些可行方案？"

**KPI 达成路径可视化** — 仪表盘卡片组：

```
┌─────────────────────────────────────────────┐
│  Revenue KPI Tracker              FY26Q1    │
│  ┌─────────────────────────────┐            │
│  │ Target    $17.5B            │  ● On Track│
│  │ Forecast  $17.2B  (98.3%)   │            │
│  │ Gap       -$300M            │            │
│  └─────────────────────────────┘            │
│                                             │
│  Scenario Fan Chart:                        │
│  ╭─────────────╮                            │
│  │  Optimistic ─── $17.8B (102%)           │
│  │  Base Case ──── $17.2B (98%)            │
│  │  Pessimistic ── $16.5B (94%)            │
│  ╰─────────────╯                            │
│                                             │
│  Top 3 Paths to Close Gap:                  │
│  1. ISG AI Server 加速交付   +$180M  ★★★   │
│  2. IDG PRC 促销活动         +$120M  ★★☆   │
│  3. SSG 新客户签约            +$80M  ★★☆   │
└─────────────────────────────────────────────┘
```

---

### 模块 5：智能对话体验升级

**5.1 多轮对话上下文管理**

```typescript
// src/context/ChatContext.tsx 扩展

interface ConversationContext {
  currentTopic: string | null;      // 当前话题
  mentionedMetrics: string[];       // 提到过的指标
  mentionedBGs: BusinessGroup[];    // 提到过的 BG
  mentionedGeos: Geography[];       // 提到过的 Geo
  mentionedPeriod: string | null;   // 提到过的时段
  previousResults: QueryResult[];   // 前几轮查询结果 (用于追问)
  conversationMode: 'query' | 'analysis' | 'forecast' | 'freeform';
}
```

**多轮追问示例**：
```
用户: ISG 的收入趋势如何？
AI:   [展示 ISG 过去 5 季度 revenue 折线图]
      ISG 收入从 FY25Q1 的 $3.4B 增长至 FY26Q1 的 $3.8B，YoY +11.2%...

用户: 和 Dell 比呢？       ← 自动继承 "ISG" + "收入" 上下文
AI:   [展示 ISG vs Dell Server 对比图]
      ISG 收入增速 11.2% vs Dell ISG 增速 8.5%，联想跑赢 2.7pp...

用户: 主要是哪个区域贡献的？ ← 自动继承 "ISG" + "收入增长" 上下文
AI:   [展示 ISG 各 Geo revenue 增速瀑布图]
      PRC (+18%) 和 NA (+12%) 是主要贡献...

用户: PRC 增长的原因是什么？ ← 触发归因分析
AI:   [展示归因瀑布图]
      三大驱动因素：1) AI Server 需求激增 (+60% YoY)...
```

**5.2 智能推荐问题**

根据当前页面、筛选条件、对话历史动态生成推荐问题：

```typescript
interface SmartSuggestion {
  text: string;
  category: 'deep_dive' | 'comparison' | 'attribution' | 'forecast';
  priority: number;
  trigger: string;      // 何时推荐
}

// 示例推荐逻辑
function getSuggestions(context: ConversationContext, page: string): SmartSuggestion[] {
  // 在 Opening 页看到 revenue beat consensus → 推荐
  //   "Revenue beat consensus 的主要驱动因素是什么？"
  //   "各 BG 对 beat 的贡献分别是多少？"

  // 在 Secondary 页看到 CCC 升高 → 推荐
  //   "CCC 上升是 AR 还是 AP 驱动的？"
  //   "哪个 BG 的 inventory 周转最慢？"

  // 在 Tertiary 页看到 IDG PRC 下滑 → 推荐
  //   "IDG PRC 下滑的外部原因是什么？"
  //   "竞争对手在 PRC PC 市场的表现如何？"
}
```

**5.3 富文本回复格式**

升级消息渲染，支持：

```typescript
interface RichMessage {
  id: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  blocks: MessageBlock[];      // 多个内容块组合
}

type MessageBlock =
  | { type: 'text'; content: string }
  | { type: 'chart'; chartOption: EChartsOption; title?: string }
  | { type: 'kpi_card'; data: KPICardData }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'action_card'; paths: Path[] }
  | { type: 'insight'; level: 'info' | 'warning' | 'alert'; text: string }
  | { type: 'comparison'; items: ComparisonItem[] }
  | { type: 'source_tag'; sources: string[] }   // 数据来源标注
```

---

## 四、新增文件结构

```
src/
  data/
    query-engine.ts            # [新] 统一交叉查询引擎
    external-data.ts           # [新] 外部数据（供应链、同行、宏观）
    attribution-engine.ts      # [新] 驱动因素归因引擎
    forecast-engine.ts         # [新] KPI 预测引擎
    ai-responses.ts            # [改] 重构为 LLM 意图路由
    smart-suggestions.ts       # [新] 智能推荐问题生成器
    mock-external.ts           # [新] 外部数据 mock

  components/
    ai-chat/
      ChatPanel.tsx            # [改] 升级布局，支持富文本
      ChatMessage.tsx          # [改] 重构为 MessageBlock 渲染器
      ChatInput.tsx            # [改] 添加语音/快捷指令
      SuggestedQueries.tsx     # [改] 动态智能推荐
      MessageBlocks/           # [新] 各 Block 渲染组件
        TextBlock.tsx
        ChartBlock.tsx
        KPIBlock.tsx
        TableBlock.tsx
        ActionCard.tsx
        InsightBadge.tsx
        ComparisonCard.tsx
        SourceTag.tsx

  context/
    ChatContext.tsx             # [改] 增加 ConversationContext

  hooks/
    useAIChat.ts               # [改] 重构意图处理流程

  types/
    index.ts                   # [改] 新增相关类型
    ai-types.ts                # [新] AI 模块专用类型
```

---

## 五、分阶段实施计划

### Phase 1: 内部数据智能查询（1-2 周）

**目标**：让 CFO 能用自然语言查询 BG × Geo × Time 任意组合数据

**具体任务**：
1. 构建 `query-engine.ts` 统一查询引擎
2. 升级意图理解：从正则匹配 → 结构化意图解析
3. 实现交叉查询：支持任意 BG × Geo × Time 组合
4. 图表自动选择：根据查询模式推荐最佳图表类型
5. 升级 `ChatMessage` 支持 MessageBlock 渲染
6. 动态智能推荐问题

### Phase 2: 外部数据集成（1-2 周）

**目标**：引入供应链、同行、宏观数据

**具体任务**：
1. 构建 `external-data.ts` 及 mock 数据
2. 供应链仪表板（关键供应商、交期、成本）
3. 同行对标分析（HP, Dell, ASUS 等对比）
4. 宏观经济指标接入
5. 内外部数据关联查询

### Phase 3: 归因分析引擎（1 周）

**目标**：自动识别指标变化的驱动因素

**具体任务**：
1. 构建 `attribution-engine.ts`
2. 多维度因素分解（内部 + 外部 + 宏观）
3. 归因瀑布图可视化
4. 自然语言归因叙述生成

### Phase 4: KPI 预测与路径建议（1-2 周）

**目标**：预测 KPI 达成情况并推荐可行路径

**具体任务**：
1. 构建 `forecast-engine.ts`
2. 多情景预测（乐观/基准/悲观）
3. KPI Gap 分析仪表盘
4. 达成路径推荐算法
5. Scenario Fan Chart 可视化

### Phase 5: 对话体验优化（1 周）

**目标**：多轮对话、上下文管理、UX 打磨

**具体任务**：
1. 多轮上下文管理
2. 对话历史摘要
3. 快捷指令（/kpi, /compare, /forecast）
4. 回复中标注数据来源
5. 导出对话 & 图表功能

---

## 六、后端 API 迁移预留

当前所有能力基于 mock 数据实现。每个引擎模块预留 API 接口，后续可无缝切换：

```typescript
// 示例：query-engine.ts 的 API 迁移点
async function crossQuery(params: QueryParams): Promise<QueryResult> {
  // Phase 1: Mock 实现
  if (USE_MOCK) {
    return mockCrossQuery(params);
  }
  // Phase 2: API 实现
  const response = await fetch('/api/v1/query', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return response.json();
}
```

同理，`external-data.ts` 后续可对接：
- Bloomberg API (consensus data)
- Wind (国内金融数据)
- 供应链管理系统 API
- 内部 ERP / SAP 数据

---

## 七、交互设计要点

1. **对话面板升级**：从 420px 侧边栏 → 可拖拽宽度，支持全屏模式
2. **图表交互**：图表内点击可进一步钻取（drill-down in chat）
3. **快捷入口**：Dashboard KPI 卡片上增加"Ask AI"按钮，自动带入上下文
4. **数据来源标注**：每条回复标明数据来源（内部/Bloomberg/行业报告）
5. **中英双语**：所有新增文本纳入 i18n 体系
