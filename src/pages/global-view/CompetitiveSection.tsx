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

// Lenovo reference benchmark (mock — would come from internal data in production)
const LENOVO_BENCHMARK = {
  name: 'Lenovo',
  revenueGrowthYoY: 4.2,
  grossMargin: 18.5,
  operatingMargin: 5.1,
};

export function CompetitiveSection({ data, loading }: Props) {
  const { language } = useLanguage();
  const sectionTitle = language === 'zh' ? '维度三：竞争格局' : 'Dimension 3: Competitive Landscape';

  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-1 h-4 bg-lenovo-red rounded-full" />
        <h3 className="text-sm font-semibold">{sectionTitle}</h3>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <RevenueGrowthChart competitors={data?.competitors ?? []} source={data?.competitorsSource ?? 'mock'} loading={loading} />
        <MarginComparisonChart competitors={data?.competitors ?? []} source={data?.competitorsSource ?? 'mock'} loading={loading} />
        <MarketShareChart marketShare={data?.marketShare ?? null} loading={loading} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Chart 7: Revenue Growth YoY (bar + Lenovo reference line)          */
/* ------------------------------------------------------------------ */
function RevenueGrowthChart({ competitors, source, loading }: { competitors: Competitor[]; source: string; loading: boolean }) {
  const { language } = useLanguage();
  const title = language === 'zh' ? '竞对营收增速对比 (YoY)' : 'Competitor Revenue Growth YoY';

  const option = useMemo<EChartsOption>(() => {
    const names = competitors.map((c) => c.name);
    const colors = competitors.map((c) => (c.revenueGrowthYoY ?? 0) >= 0 ? '#00A650' : '#E12726');

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: unknown) => {
          const items = params as Array<{ name: string; value: number }>;
          const p = items[0];
          const comp = competitors.find((c) => c.name === p.name);
          return `<strong>${p.name}</strong><br/>${language === 'zh' ? '增速' : 'Growth'}: ${p.value?.toFixed(1)}%<br/>${language === 'zh' ? '业务线' : 'Segment'}: ${comp?.segment}`;
        },
      },
      grid: { left: 55, right: 20, top: 30, bottom: 40 },
      xAxis: { type: 'category', data: names, axisLabel: { fontSize: 9, interval: 0, rotate: 30 } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: '{value}%' } },
      series: [
        {
          name: language === 'zh' ? '营收增速' : 'Revenue Growth',
          type: 'bar',
          data: competitors.map((c, i) => ({ value: c.revenueGrowthYoY ?? 0, itemStyle: { color: colors[i] } })),
          barMaxWidth: 30,
          label: { show: true, position: 'top', fontSize: 10, formatter: (p) => `${Number(p.value ?? 0).toFixed(1)}%` },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#E12726', type: 'dashed', width: 2 },
            data: [
              {
                yAxis: LENOVO_BENCHMARK.revenueGrowthYoY,
                label: { formatter: `Lenovo ${LENOVO_BENCHMARK.revenueGrowthYoY}%`, fontSize: 9, color: '#E12726' },
              },
            ],
          },
        },
      ],
    };
  }, [competitors, language]);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-semibold flex items-center justify-between">
          <span>{title}</span>
          <SourceBadge sources={[source]} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <BaseChart option={option} height="240px" loading={loading} />
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Chart 8: Margin Comparison (GP% + OI% grouped bar)                 */
/* ------------------------------------------------------------------ */
function MarginComparisonChart({ competitors, source, loading }: { competitors: Competitor[]; source: string; loading: boolean }) {
  const { language } = useLanguage();
  const title = language === 'zh' ? '竞对利润率对比' : 'Competitor Margins';

  const option = useMemo<EChartsOption>(() => {
    const names = competitors.map((c) => c.name);
    const gm = competitors.map((c) => c.grossMargin ?? 0);
    const om = competitors.map((c) => c.operatingMargin ?? 0);

    return {
      tooltip: { trigger: 'axis' },
      legend: { top: 0, right: 0, textStyle: { fontSize: 10 } },
      grid: { left: 50, right: 20, top: 30, bottom: 40 },
      xAxis: { type: 'category', data: names, axisLabel: { fontSize: 9, interval: 0, rotate: 30 } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: '{value}%' } },
      series: [
        {
          name: language === 'zh' ? '毛利率' : 'Gross Margin',
          type: 'bar',
          data: gm,
          barMaxWidth: 18,
          itemStyle: { color: '#0073CE' },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#0073CE', type: 'dashed' },
            data: [{ yAxis: LENOVO_BENCHMARK.grossMargin, label: { formatter: `Lenovo GM ${LENOVO_BENCHMARK.grossMargin}%`, fontSize: 8 } }],
          },
        },
        {
          name: language === 'zh' ? '经营利润率' : 'Operating Margin',
          type: 'bar',
          data: om,
          barMaxWidth: 18,
          itemStyle: { color: '#00A650' },
        },
      ],
    };
  }, [competitors, language]);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-semibold flex items-center justify-between">
          <span>{title}</span>
          <SourceBadge sources={[source]} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <BaseChart option={option} height="240px" loading={loading} />
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
        <BaseChart option={option} height="240px" loading={loading} />
        {marketShare?.note && <p className="text-[10px] text-muted-foreground mt-1">⚠️ {marketShare.note}</p>}
      </CardContent>
    </Card>
  );
}
