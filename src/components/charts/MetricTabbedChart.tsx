import { useState } from 'react';
import { BaseChart } from './BaseChart';
import type { EChartsOption } from 'echarts';
import type { MetricTrendData } from '@/data/mock-opening';
import { formatCurrency, formatPercent } from '@/utils/formatters';
import { useLanguage } from '@/hooks/useLanguage';

interface MetricTabbedChartProps {
  metrics: MetricTrendData[];
  height?: string;
}

const metricI18nKeys: Record<string, string> = {
  revenues: 'revenue',
  grossProfit: 'grossProfit',
  grossProfitPct: 'grossProfitPct',
  operatingIncome: 'operatingIncome',
  netIncome: 'netIncome',
};

// Grid margins must stay in sync between chart and table
const GRID_LEFT = 70;
const GRID_RIGHT_CONSENSUS = 70;
const GRID_RIGHT_DEFAULT = 20;

export function MetricTabbedChart({ metrics, height = '320px' }: MetricTabbedChartProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const { t } = useLanguage();
  const active = metrics[activeIdx];
  if (!active) return null;

  const quarters = active.points.map((p) => p.quarter);
  const actuals = active.points.map((p) => p.actual);
  const fmt = active.isPercent ? formatPercent : formatCurrency;
  const gridRight = active.hasConsensus ? GRID_RIGHT_CONSENSUS : GRID_RIGHT_DEFAULT;

  // Build ECharts option
  const series: EChartsOption['series'] = [];
  const yAxis: EChartsOption['yAxis'] = [];

  yAxis.push({
    type: 'value',
    position: 'left',
    axisLabel: {
      fontSize: 11,
      color: '#999',
      formatter: (v: number) => fmt(v),
    },
    splitLine: { lineStyle: { color: '#F0F0F0', type: 'dashed' as const } },
  });

  series.push({
    name: t[metricI18nKeys[active.key] as keyof typeof t] as string || active.label,
    type: 'bar',
    yAxisIndex: 0,
    data: actuals,
    barMaxWidth: 45,
    itemStyle: { color: '#0073CE', borderRadius: [3, 3, 0, 0] },
    label: {
      show: true,
      position: 'top',
      fontSize: 10,
      color: '#666',
      formatter: (p: unknown) => {
        const params = p as { value: number };
        return fmt(params.value);
      },
    },
  });

  if (active.hasConsensus) {
    const consensusVals = active.points.map((p) => p.consensus ?? 0);
    const beatPcts = active.points.map((p) => p.beatPct ?? 0);

    series.push({
      name: t.consensus,
      type: 'bar',
      yAxisIndex: 0,
      data: consensusVals,
      barMaxWidth: 45,
      itemStyle: { color: '#F5A623', borderRadius: [3, 3, 0, 0] },
    });

    yAxis.push({
      type: 'value',
      position: 'right',
      name: 'Beat %',
      nameTextStyle: { fontSize: 10, color: '#999' },
      axisLabel: {
        fontSize: 11,
        color: '#999',
        formatter: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`,
      },
      splitLine: { show: false },
      axisLine: { show: true, lineStyle: { color: '#E5E5E5' } },
    });

    series.push({
      name: 'Beat %',
      type: 'line',
      yAxisIndex: 1,
      data: beatPcts,
      smooth: true,
      symbol: 'circle',
      symbolSize: 8,
      lineStyle: { width: 2, color: '#00A650' },
      itemStyle: { color: '#00A650' },
      label: {
        show: true,
        position: 'top',
        fontSize: 10,
        formatter: (p: unknown) => {
          const params = p as { value: number };
          return `${params.value > 0 ? '+' : ''}${params.value.toFixed(1)}%`;
        },
        color: '#666',
      },
    });
  }

  const option: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const items = params as Array<{ seriesName: string; value: number; color: string; axisValue: string; seriesIndex: number }>;
        let html = `<div style="font-size:12px"><strong>${items[0]?.axisValue}</strong>`;
        for (const item of items) {
          const isRightAxis = active.hasConsensus && item.seriesIndex === 2;
          const val = isRightAxis
            ? `${item.value > 0 ? '+' : ''}${item.value.toFixed(1)}%`
            : fmt(item.value);
          html += `<br/><span style="color:${item.color}">●</span> ${item.seriesName}: ${val}`;
        }
        return html + '</div>';
      },
    },
    legend: {
      top: 0,
      right: 0,
      textStyle: { fontSize: 11 },
      itemGap: 16,
    },
    grid: { left: GRID_LEFT, right: gridRight, top: 50, bottom: 10 },
    xAxis: {
      type: 'category',
      data: quarters,
      axisLabel: { fontSize: 11 },
    },
    yAxis,
    series,
  };

  // Table row helper
  const renderRow = (
    label: string,
    cells: React.ReactNode[],
    opts?: { labelClass?: string; border?: boolean }
  ) => (
    <div
      className={`flex items-center text-xs ${opts?.border !== false ? 'border-b border-border/50' : ''}`}
    >
      <div
        className={`shrink-0 py-1.5 font-medium ${opts?.labelClass ?? ''}`}
        style={{ width: GRID_LEFT }}
      >
        {label}
      </div>
      <div className="flex-1 flex" style={{ marginRight: gridRight }}>
        {cells.map((cell, i) => (
          <div key={i} className="flex-1 text-center py-1.5 tabular-nums">
            {cell}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      {/* Tabs */}
      <div className="flex border-b border-border mb-3 -mt-1">
        {metrics.map((m, i) => {
          const label = t[metricI18nKeys[m.key] as keyof typeof t] as string || m.label;
          return (
            <button
              key={m.key}
              onClick={() => setActiveIdx(i)}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                i === activeIdx
                  ? 'border-lenovo-red text-lenovo-red'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Chart */}
      <BaseChart option={option} height={height} />

      {/* Aligned Data Table */}
      <div className="mt-1">
        {/* Header */}
        {renderRow(
          '',
          quarters.map((q) => <span key={q} className="text-muted-foreground font-medium">{q}</span>),
          { border: true }
        )}

        {/* Actual */}
        {renderRow(
          t.actual,
          active.points.map((p) => <span className="font-semibold">{fmt(p.actual)}</span>),
          { labelClass: 'text-foreground' }
        )}

        {/* Consensus rows */}
        {active.hasConsensus && (
          <>
            {renderRow(
              t.consensus,
              active.points.map((p) => (
                <span className="text-muted-foreground">{fmt(p.consensus ?? 0)}</span>
              )),
              { labelClass: 'text-muted-foreground' }
            )}
            {renderRow(
              t.delta,
              active.points.map((p) => {
                const d = p.actual - (p.consensus ?? 0);
                return (
                  <span className={`font-semibold ${d >= 0 ? 'text-lenovo-green' : 'text-lenovo-red'}`}>
                    {d >= 0 ? '+' : ''}{fmt(d)}
                  </span>
                );
              }),
              { labelClass: 'text-muted-foreground' }
            )}
            {renderRow(
              'Beat %',
              active.points.map((p) => {
                const bp = p.beatPct ?? 0;
                return (
                  <span className={`font-semibold ${bp >= 0 ? 'text-lenovo-green' : 'text-lenovo-red'}`}>
                    {bp > 0 ? '+' : ''}{bp.toFixed(1)}%
                  </span>
                );
              }),
              { labelClass: 'text-muted-foreground', border: false }
            )}
          </>
        )}
      </div>
    </div>
  );
}
