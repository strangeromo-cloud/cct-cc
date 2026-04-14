import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { BaseChart } from '@/components/charts/BaseChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CompetitiveData, Competitor, MarketShareData } from '@/api/global-client';
import { useLanguage } from '@/hooks/useLanguage';
import { SourceBadge } from './SourceBadge';

interface Props {
  data: CompetitiveData | null;
  loading: boolean;
}

// Lenovo reference data (internal — would come from getOpeningData in production)
const LENOVO_DATA: Competitor = {
  name: 'Lenovo',
  segment: 'PC/Server',
  matchesBG: 'IDG',
  quarterlyRevenue: 17200,
  revenueGrowthYoY: 4.2,
  grossMargin: 18.5,
  operatingMargin: 5.1,
  marketCap: null,
  marketShare: 23.8,
  marketShareChange: 0.5,
  source: 'Lenovo internal',
};

/** Current reporting quarter — shown as a chart-level annotation */
const CURRENT_QUARTER = 'FY26Q1';

export function CompetitiveSection({ data, loading }: Props) {
  const { language } = useLanguage();
  const sectionTitle = language === 'zh' ? '维度三：竞争格局' : 'Dimension 3: Competitive Landscape';

  // Prepend Lenovo to competitor list so it shows as the first bar
  const competitorsWithLenovo = [LENOVO_DATA, ...(data?.competitors ?? [])];

  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-1 h-4 bg-lenovo-red rounded-full" />
        <h3 className="text-sm font-semibold">{sectionTitle}</h3>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <RevenueGrowthChart competitors={competitorsWithLenovo} source={data?.competitorsSource ?? 'mock'} loading={loading} />
        <MarginComparisonChart competitors={competitorsWithLenovo} source={data?.competitorsSource ?? 'mock'} loading={loading} />
        <MarketShareChart marketShare={data?.marketShare ?? null} loading={loading} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Period annotation label (shown under chart title)                  */
/* ------------------------------------------------------------------ */
function PeriodLabel({ language, quarter }: { language: string; quarter: string }) {
  const label = language === 'zh' ? `数据期：${quarter}（最新报告季度）` : `Data as of: ${quarter} (Latest Quarter)`;
  return (
    <div className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
      <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <span>{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Chart 7: Revenue Growth YoY — Lenovo + competitors                 */
/* ------------------------------------------------------------------ */
function RevenueGrowthChart({ competitors, source, loading }: { competitors: Competitor[]; source: string; loading: boolean }) {
  const { language } = useLanguage();
  const title = language === 'zh' ? '营收增速对比 (YoY)' : 'Revenue Growth YoY';

  const option = useMemo<EChartsOption>(() => {
    const names = competitors.map((c) => c.name);
    // Lenovo → red highlight; others → green (positive) / amber (negative)
    const colors = competitors.map((c) => {
      if (c.name === 'Lenovo') return '#E12726';
      const v = c.revenueGrowthYoY ?? 0;
      return v >= 0 ? '#00A650' : '#F5A623';
    });

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: unknown) => {
          const items = params as Array<{ name: string; value: number }>;
          const p = items[0];
          const comp = competitors.find((c) => c.name === p.name);
          return `<strong>${p.name}</strong><br/>${language === 'zh' ? '增速' : 'Growth'}: ${Number(p.value ?? 0).toFixed(1)}%<br/>${language === 'zh' ? '业务线' : 'Segment'}: ${comp?.segment}`;
        },
      },
      grid: { left: 55, right: 20, top: 30, bottom: 40 },
      xAxis: {
        type: 'category',
        data: names,
        axisLabel: {
          fontSize: 9,
          interval: 0,
          rotate: 30,
          // Bold Lenovo label
          formatter: (val: string) => (val === 'Lenovo' ? `{lenovo|${val}}` : val),
          rich: { lenovo: { color: '#E12726', fontWeight: 'bold' } },
        },
      },
      yAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: '{value}%' } },
      series: [
        {
          name: language === 'zh' ? '营收增速' : 'Revenue Growth',
          type: 'bar',
          data: competitors.map((c, i) => ({
            value: c.revenueGrowthYoY ?? 0,
            itemStyle: {
              color: colors[i],
              borderColor: c.name === 'Lenovo' ? '#E12726' : undefined,
              borderWidth: c.name === 'Lenovo' ? 2 : 0,
            },
          })),
          barMaxWidth: 30,
          label: { show: true, position: 'top', fontSize: 10, formatter: (p) => `${Number(p.value ?? 0).toFixed(1)}%` },
        },
      ],
    };
  }, [competitors, language]);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-semibold flex items-center justify-between">
          <span>{title}</span>
          <SourceBadge sources={[source, 'Lenovo internal']} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <PeriodLabel language={language} quarter={CURRENT_QUARTER} />
        <BaseChart option={option} height="220px" loading={loading} />
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Chart 8: Margin Comparison — Lenovo + competitors                  */
/* ------------------------------------------------------------------ */
function MarginComparisonChart({ competitors, source, loading }: { competitors: Competitor[]; source: string; loading: boolean }) {
  const { language } = useLanguage();
  const title = language === 'zh' ? '利润率对比' : 'Margin Comparison';

  const option = useMemo<EChartsOption>(() => {
    const names = competitors.map((c) => c.name);

    return {
      tooltip: { trigger: 'axis' },
      legend: { top: 0, right: 0, textStyle: { fontSize: 10 } },
      grid: { left: 50, right: 20, top: 30, bottom: 40 },
      xAxis: {
        type: 'category',
        data: names,
        axisLabel: {
          fontSize: 9,
          interval: 0,
          rotate: 30,
          formatter: (val: string) => (val === 'Lenovo' ? `{lenovo|${val}}` : val),
          rich: { lenovo: { color: '#E12726', fontWeight: 'bold' } },
        },
      },
      yAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: '{value}%' } },
      series: [
        {
          name: language === 'zh' ? '毛利率' : 'Gross Margin',
          type: 'bar',
          itemStyle: { color: '#0073CE' },
          data: competitors.map((c) => c.grossMargin ?? 0),
          barMaxWidth: 18,
        },
        {
          name: language === 'zh' ? '经营利润率' : 'Operating Margin',
          type: 'bar',
          itemStyle: { color: '#00A650' },
          data: competitors.map((c) => c.operatingMargin ?? 0),
          barMaxWidth: 18,
        },
      ],
    };
  }, [competitors, language]);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-semibold flex items-center justify-between">
          <span>{title}</span>
          <SourceBadge sources={[source, 'Lenovo internal']} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <PeriodLabel language={language} quarter={CURRENT_QUARTER} />
        <BaseChart option={option} height="220px" loading={loading} />
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Chart 9: PC Market Share                                           */
/* ------------------------------------------------------------------ */
function MarketShareChart({ marketShare, loading }: { marketShare: MarketShareData | null; loading: boolean }) {
  const { language } = useLanguage();
  const title = language === 'zh' ? 'PC 全球市场份额' : 'PC Global Market Share';
  const periodQuarter = marketShare?.quarter ?? CURRENT_QUARTER;

  const option = useMemo<EChartsOption>(() => {
    const shares = marketShare?.shares ?? [];
    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: unknown) => {
          const p = params as { name: string; value: number; percent: number };
          const entry = shares.find((s) => s.name === p.name);
          const changeStr = entry && entry.change !== 0
            ? ` (${entry.change > 0 ? '+' : ''}${entry.change}pp)`
            : '';
          return `<strong>${p.name}</strong><br/>${p.value}%${changeStr}`;
        },
      },
      legend: { orient: 'vertical', right: 0, top: 'center', textStyle: { fontSize: 10 } },
      series: [
        {
          name: title,
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['35%', '50%'],
          avoidLabelOverlap: true,
          label: { show: true, formatter: '{b}\n{d}%', fontSize: 9 },
          labelLine: { length: 6, length2: 4 },
          data: shares.map((s) => ({ name: s.name, value: s.share, itemStyle: { color: s.color } })),
        },
      ],
    };
  }, [marketShare, title]);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-semibold flex items-center justify-between">
          <span>{title}</span>
          <SourceBadge sources={marketShare?.source ? [marketShare.source] : []} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <PeriodLabel language={language} quarter={periodQuarter} />
        <BaseChart option={option} height="220px" loading={loading} />
        {marketShare?.note && <p className="text-[10px] text-muted-foreground mt-1">⚠️ {marketShare.note}</p>}
      </CardContent>
    </Card>
  );
}
