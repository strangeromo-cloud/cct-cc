import type { OperatingMetrics, ThresholdConfig } from '@/types';
import { useLanguage } from '@/hooks/useLanguage';
import { formatCurrency } from '@/utils/formatters';
import { KPICard } from '@/components/charts/KPICard';
import { BaseChart } from '@/components/charts/BaseChart';
import { AlignedDataTable } from '@/components/charts/AlignedDataTable';
import { ChartTitle } from '@/components/charts/ChartTitle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { EChartsOption } from 'echarts';

interface TierCashFlowProps {
  data: OperatingMetrics[];
  thresholds: ThresholdConfig;
}

export function TierCashFlow({ data, thresholds }: TierCashFlowProps) {
  const { t } = useLanguage();

  const latest = data[data.length - 1];
  const prev = data.length >= 2 ? data[data.length - 2] : undefined;
  if (!latest) return null;

  const periods = data.map((d) => d.period);
  const cccAlert = latest.cccUnfunded >= thresholds.cccDanger ? 'danger' : latest.cccUnfunded >= thresholds.cccDanger * 0.9 ? 'warning' : 'normal';

  const chartOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const items = params as Array<{ seriesName: string; value: number; color: string; axisValue: string; seriesIndex: number }>;
        let html = `<div style="font-size:12px"><strong>${items[0]?.axisValue}</strong>`;
        for (const item of items) {
          const val = item.seriesIndex === 2 ? `${item.value} ${t.days}` : formatCurrency(item.value);
          html += `<br/><span style="color:${item.color}">●</span> ${item.seriesName}: ${val}`;
        }
        return html + '</div>';
      },
    },
    legend: { top: 0, right: 0, textStyle: { fontSize: 11 } },
    grid: { left: 60, right: 60, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: periods, axisLabel: { fontSize: 11 } },
    yAxis: [
      { type: 'value', axisLabel: { fontSize: 11, formatter: (v: number) => formatCurrency(v) } },
      { type: 'value', position: 'right', axisLabel: { fontSize: 11, formatter: (v: number) => `${v}d` }, splitLine: { show: false } },
    ],
    series: [
      {
        name: t.metricAR,
        type: 'bar',
        data: data.map((d) => d.ar),
        itemStyle: { color: '#0073CE' },
        barMaxWidth: 30,
      },
      {
        name: t.metricAP,
        type: 'bar',
        data: data.map((d) => d.ap),
        itemStyle: { color: '#00A650' },
        barMaxWidth: 30,
      },
      {
        name: 'CCC',
        type: 'line',
        yAxisIndex: 1,
        data: data.map((d) => d.cccUnfunded),
        smooth: true,
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: { width: 2.5, color: '#E12726' },
        itemStyle: { color: '#E12726' },
        markLine: {
          silent: true,
          symbol: 'none',
          data: [{
            yAxis: thresholds.cccDanger,
            lineStyle: { type: 'dashed', color: '#E12726', width: 1.5 },
            label: { formatter: `${thresholds.cccDanger}d`, fontSize: 10, position: 'insideEndTop', color: '#E12726' },
          }],
        },
      },
    ],
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="shadow-sm lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            <ChartTitle metricKey="arVsAp">{t.arVsAp}</ChartTitle>
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-3">
          <BaseChart option={chartOption} height="280px" />
          <AlignedDataTable
            columns={periods}
            gridRight={60}
            rows={[
              { label: t.metricAR, cells: data.map((d) => formatCurrency(d.ar)), labelClass: 'text-foreground' },
              { label: t.metricAP, cells: data.map((d) => formatCurrency(d.ap)) },
              { label: `CCC (${t.days})`, cells: data.map((d) => <span className={`font-semibold ${d.cccUnfunded >= thresholds.cccDanger ? 'text-lenovo-red' : ''}`}>{d.cccUnfunded}</span>), labelClass: 'text-foreground' },
            ]}
          />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <KPICard
          label={t.cccKpi}
          value={`${latest.cccUnfunded} ${t.days}`}
          currentValue={latest.cccUnfunded}
          previousValue={prev?.cccUnfunded}
          alertStatus={cccAlert as 'normal' | 'warning' | 'danger'}
          thresholdLabel={`${t.dangerThreshold}: ${thresholds.cccDanger} ${t.days}`}
          subtitle={t.vsPrior}
          metricKey="cccUnfunded"
        />
        <KPICard
          label={t.metricAR}
          value={formatCurrency(latest.ar)}
          currentValue={latest.ar}
          previousValue={prev?.ar}
          subtitle={t.vsPrior}
          metricKey="ar"
        />
        <KPICard
          label={t.metricAP}
          value={formatCurrency(latest.ap)}
          currentValue={latest.ap}
          previousValue={prev?.ap}
          subtitle={t.vsPrior}
          metricKey="ap"
        />
      </div>
    </div>
  );
}
