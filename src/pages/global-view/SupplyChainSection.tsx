import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { BaseChart } from '@/components/charts/BaseChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { SupplyChainData, ComponentPriceSeries, TimeSeries } from '@/api/global-client';
import { useLanguage } from '@/hooks/useLanguage';
import { SourceBadge } from './SourceBadge';

interface Props {
  data: SupplyChainData | null;
  loading: boolean;
}

export function SupplyChainSection({ data, loading }: Props) {
  const { language } = useLanguage();
  const sectionTitle = language === 'zh' ? '维度二：上游成本与供应链' : 'Dimension 2: Upstream Cost & Supply Chain';

  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-1 h-4 bg-lenovo-red rounded-full" />
        <h3 className="text-sm font-semibold">{sectionTitle}</h3>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <ComponentPriceChart components={data?.components ?? null} loading={loading} />
        <SemiLeadTimeChart semi={data?.semiLeadTime ?? null} loading={loading} />
        <GSCPIChart gscpi={data?.gscpi ?? null} loading={loading} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Chart 4: Component Price Index (DRAM/NAND/LCD)                     */
/* ------------------------------------------------------------------ */
function ComponentPriceChart({ components, loading }: { components: ComponentPriceSeries | null; loading: boolean }) {
  const { language } = useLanguage();
  const title = language === 'zh' ? '核心元器件价格指数' : 'Core Component Price Index';

  const option = useMemo<EChartsOption>(() => {
    return {
      tooltip: { trigger: 'axis' },
      legend: { top: 0, right: 0, textStyle: { fontSize: 10 } },
      grid: { left: 50, right: 20, top: 30, bottom: 40 },
      xAxis: { type: 'category', data: components?.dates ?? [], axisLabel: { fontSize: 10, hideOverlap: true } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10 }, name: 'Index (100)', nameTextStyle: { fontSize: 10 } },
      series: [
        { name: 'DRAM', type: 'line', data: components?.dram ?? [], smooth: true, symbol: 'none', itemStyle: { color: '#0073CE' }, lineStyle: { color: '#0073CE', width: 2 } },
        { name: 'NAND', type: 'line', data: components?.nand ?? [], smooth: true, symbol: 'none', itemStyle: { color: '#00A650' }, lineStyle: { color: '#00A650', width: 2 } },
        { name: 'LCD', type: 'line', data: components?.lcd ?? [], smooth: true, symbol: 'none', itemStyle: { color: '#F5A623' }, lineStyle: { color: '#F5A623', width: 2 } },
      ],
    };
  }, [components]);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-semibold flex items-center justify-between">
          <span>{title}</span>
          <SourceBadge sources={components?.source ? [components.source] : []} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <BaseChart option={option} height="240px" loading={loading} />
        {components?.note && <p className="text-[10px] text-muted-foreground mt-1">⚠️ {components.note}</p>}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Chart 5: Semiconductor Lead Time                                   */
/* ------------------------------------------------------------------ */
function SemiLeadTimeChart({ semi, loading }: { semi: TimeSeries | null; loading: boolean }) {
  const { language } = useLanguage();
  const title = language === 'zh' ? '半导体平均交货周期' : 'Semiconductor Lead Time';
  const threshold = semi?.threshold ?? 15;

  const option = useMemo<EChartsOption>(() => {
    const values = semi?.values ?? [];
    // Color bars above threshold in red
    const dataWithColor = values.map((v) => ({
      value: v,
      itemStyle: { color: v > threshold ? '#E12726' : '#0073CE' },
    }));

    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 50, right: 20, top: 20, bottom: 40 },
      xAxis: { type: 'category', data: semi?.dates ?? [], axisLabel: { fontSize: 10, hideOverlap: true } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: '{value}w' }, name: language === 'zh' ? '周' : 'weeks', nameTextStyle: { fontSize: 10 } },
      series: [
        {
          name: language === 'zh' ? '交货周期' : 'Lead Time',
          type: 'bar',
          data: dataWithColor,
          barMaxWidth: 12,
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#E12726', type: 'dashed' },
            data: [{ yAxis: threshold, label: { formatter: `${threshold}w ${language === 'zh' ? '警戒线' : 'alert'}`, fontSize: 9 } }],
          },
        },
      ],
    };
  }, [semi, threshold, language]);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-semibold flex items-center justify-between">
          <span>{title}</span>
          <SourceBadge sources={semi?.source ? [semi.source] : []} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <BaseChart option={option} height="240px" loading={loading} />
        {semi?.note && <p className="text-[10px] text-muted-foreground mt-1">⚠️ {semi.note}</p>}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Chart 6: GSCPI                                                     */
/* ------------------------------------------------------------------ */
function GSCPIChart({ gscpi, loading }: { gscpi: TimeSeries | null; loading: boolean }) {
  const { language } = useLanguage();
  const title = language === 'zh' ? '全球供应链压力指数 (GSCPI)' : 'Global Supply Chain Pressure (GSCPI)';

  const option = useMemo<EChartsOption>(() => {
    const values = gscpi?.values ?? [];
    // Positive = red (pressure), Negative = green (relief)
    const dataWithColor = values.map((v) => ({
      value: v,
      itemStyle: { color: v > 0 ? '#E12726' : '#00A650' },
    }));

    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 50, right: 20, top: 20, bottom: 40 },
      xAxis: { type: 'category', data: gscpi?.dates ?? [], axisLabel: { fontSize: 10, hideOverlap: true } },
      yAxis: {
        type: 'value',
        axisLabel: { fontSize: 10 },
        splitLine: { lineStyle: { color: '#F0F0F0' } },
      },
      series: [
        {
          name: 'GSCPI',
          type: 'bar',
          data: dataWithColor,
          barMaxWidth: 12,
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#A2A2A2', type: 'solid', width: 1 },
            data: [{ yAxis: 0 }],
          },
        },
      ],
    };
  }, [gscpi]);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-semibold flex items-center justify-between">
          <span>{title}</span>
          <SourceBadge sources={gscpi?.source ? [gscpi.source] : []} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <BaseChart option={option} height="240px" loading={loading} />
        {gscpi?.note && <p className="text-[10px] text-muted-foreground mt-1">{gscpi.note}</p>}
      </CardContent>
    </Card>
  );
}
