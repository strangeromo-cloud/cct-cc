/**
 * Global View API Client — External environment data + news + AI summary.
 */
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://cct-backend.zeabur.app';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TimeSeries {
  dates: string[];
  values: number[];
  source: string;
  unit?: string;
  note?: string;
  seriesId?: string;
  ticker?: string;
  threshold?: number;
}

export interface ComponentPriceSeries {
  dates: string[];
  dram: number[];
  nand: number[];
  lcd: number[];
  source: string;
  unit?: string;
  note?: string;
}

export interface MacroData {
  treasury10Y: TimeSeries | null;
  nasdaqPE: TimeSeries | null;
  dxy: TimeSeries | null;
  vix: TimeSeries | null;
  epu: TimeSeries | null;
}

export interface SupplyChainData {
  components: ComponentPriceSeries;
  semiLeadTime: TimeSeries;
  gscpi: TimeSeries | null;
}

export interface Competitor {
  name: string;
  segment: string;
  matchesBG: string;
  quarterlyRevenue: number | null;
  revenueGrowthYoY: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  marketCap: number | null;
  marketShare: number | null;
  marketShareChange: number | null;
  source: string;
}

export interface MarketShareEntry {
  name: string;
  share: number;
  change: number;
  color: string;
}

export interface MarketShareData {
  shares: MarketShareEntry[];
  quarter: string;
  source: string;
  note?: string;
}

export interface CompetitiveData {
  competitors: Competitor[];
  competitorsSource: string;
  marketShare: MarketShareData;
}

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  tag: 'company' | 'macro' | 'supply_chain' | 'competitor';
  description: string;
}

export interface NewsResponse {
  items: NewsItem[];
  source: string;
  fetchedAt?: string;
  error?: string;
}

export interface SummaryRisk {
  level: 'alert' | 'warning' | 'info';
  title: string;
  detail: string;
}

export interface SummaryAction {
  title: string;
  detail: string;
  priority: 'high' | 'medium' | 'low';
}

export interface GlobalSummary {
  snapshot: string;
  risks: SummaryRisk[];
  actions: SummaryAction[];
}

/* ------------------------------------------------------------------ */
/*  Fetchers                                                           */
/* ------------------------------------------------------------------ */

export async function fetchMacroData(years: number = 5): Promise<MacroData> {
  const res = await fetch(`${API_BASE}/api/global/macro?years=${years}`);
  if (!res.ok) throw new Error(`Macro fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchSupplyChainData(years: number = 5): Promise<SupplyChainData> {
  const res = await fetch(`${API_BASE}/api/global/supply-chain?years=${years}`);
  if (!res.ok) throw new Error(`Supply chain fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchCompetitiveData(): Promise<CompetitiveData> {
  const res = await fetch(`${API_BASE}/api/global/competitive`);
  if (!res.ok) throw new Error(`Competitive fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchGlobalNews(limit: number = 15): Promise<NewsResponse> {
  const res = await fetch(`${API_BASE}/api/global/news?limit=${limit}`);
  if (!res.ok) throw new Error(`News fetch failed: ${res.status}`);
  return res.json();
}

/** Stream AI-generated summary SSE events. */
export async function* streamGlobalSummary(payload: {
  macro: MacroData | null;
  supplyChain: SupplyChainData | null;
  competitive: CompetitiveData | null;
}): AsyncGenerator<{ type: string; content?: string; summary?: GlobalSummary }> {
  const res = await fetch(`${API_BASE}/api/global/summary/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Summary stream error: ${res.status}`);

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data && data !== '[DONE]') {
          try {
            yield JSON.parse(data);
          } catch {
            // skip malformed
          }
        }
      }
    }
  }
}
