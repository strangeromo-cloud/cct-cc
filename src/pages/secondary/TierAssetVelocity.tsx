import type { OperatingMetrics, ThresholdConfig } from '@/types';
import { useLanguage } from '@/hooks/useLanguage';
import { formatCurrency } from '@/utils/formatters';
import { KPICard } from '@/components/charts/KPICard';
import { BaseChart } from '@/components/charts/BaseChart';
import { ChartTitle } from '@/components/charts/ChartTitle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { EChartsOption } from 'echarts';

interface TierAssetVelocityProps {
  data: OperatingMetrics[];
  thresholds: ThresholdConfig;
}

export function TierAssetVelocity({ data, thresholds }: TierAssetVelocityProps) {
  const { t } = useLanguage();

  const latest = data[data.length - 1];
  const prev = data.length >= 2 ? data[data.length - 2] : undefined;
  if (!latest) return null;

  const periods = data.map((d) => d.period);
  const woiAlert = latest.woiIdg >= thresholds.woiDanger ? 'danger' : latest.woiIdg >= thresholds.woiDanger * 0.9 ? 'warning' : 'normal';

  const woiOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const items = params as Array<{ value: number; axisValue: string; color: string }>;
        return `<div style="font-size:12px"><strong>${items[0]?.axisValue}</strong><br/><span style="color:${items[0]?.color}">●</span> WOI: ${items[0]?.value} ${t.days}</div>`;
      },
    },
    xAxis: { type: 'category', data: periods, axisLabel: { fontSize: 11 } },
    yAxis: { type: 'value', axisLabel: { fontSize: 11, formatter: (v: number) => `${v}` }, min: 30 },
    series: [{
      name: 'WOI',
      type: 'line',
      data: data.map((d) => d.woiIdg),
      smooth: true,
      symbol: 'circle',
      symbolSize: 8,
      lineStyle: { width: 2.5, color: '#F5A623' },
      itemStyle: { color: '#F5A623' },
      areaStyle: { opacity: 0.06 },
      markLine: {
        silent: true,
        symbol: 'none',
        data: [{
          yAxis: thresholds.woiDanger,
          lineStyle: { type: 'dashed', color: '#E12726', width: 1.5 },
          label: { formatter: `${t.dangerThreshold}: ${thresholds.woiDanger} ${t.days}`, fontSize: 10, position: 'insideEndTop', color: '#E12726' },
        }],
      },
    }],
  };

  const invOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const items = params as Array<{ value: number; axisValue: string; color: string }>;
        return `<div style="font-size:12px"><strong>${items[0]?.axisValue}</strong><br/><span style="color:${items[0]?.color}">●</span> ${t.metricInventory}: ${formatCurrency(items[0]?.value ?? 0)}</div>`;
      },
    },
    xAxis: { type: 'category', data: periods, axisLabel: { fontSize: 11 } },
    yAxis: { type: 'value', axisLabel: { fontSize: 11, formatter: (v: number) => formatCurrency(v) } },
    series: [{
      name: t.metricInventory,
      type: 'bar',
      data: data.map((d) => d.inventory),
      itemStyle: { color: '#F5A623' },
      barMaxWidth: 40,
    }],
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            <ChartTitle metricKey="woiIdg">{t.woiTrend}</ChartTitle>
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-3">
          <BaseChart option={woiOption} height="240px" />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <KPICard
          label={t.metricWOI}
          value={`${latest.woiIdg} ${t.days}`}
          currentValue={latest.woiIdg}
          previousValue={prev?.woiIdg}
          alertStatus={woiAlert as 'normal' | 'warning' | 'danger'}
          thresholdLabel={`${t.dangerThreshold}: ${thresholds.woiDanger} ${t.days}`}
          subtitle={t.vsPrior}
          metricKey="woiIdg"
        />
        <Card className="shadow-sm flex-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              <ChartTitle metricKey="inventory">{t.inventoryTrend}</ChartTitle>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <BaseChart option={invOption} height="180px" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
