import { BaseChart } from './BaseChart';
import type { EChartsOption } from 'echarts';
import { formatCurrency } from '@/utils/formatters';

interface MarkLineItem {
  value: number;
  label: string;
  color?: string;
}

interface TrendLineChartProps {
  xData: string[];
  series: { name: string; data: number[]; color?: string; areaStyle?: boolean }[];
  title?: string;
  yAxisLabel?: string;
  height?: string;
  /** Custom Y-axis value formatter (defaults to formatCurrency) */
  yAxisFormatter?: (v: number) => string;
  /** Horizontal reference / threshold lines */
  markLines?: MarkLineItem[];
  onChartClick?: (params: Record<string, unknown>) => void;
}

export function TrendLineChart({ xData, series, title, height, yAxisFormatter, markLines, onChartClick }: TrendLineChartProps) {
  const fmt = yAxisFormatter ?? formatCurrency;

  const option: EChartsOption = {
    title: title ? { text: title, left: 'left', textStyle: { fontSize: 13, fontWeight: 600, color: '#333' } } : undefined,
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const items = params as Array<{ seriesName: string; value: number; color: string; axisValue: string }>;
        let html = `<div style="font-size:12px"><strong>${items[0]?.axisValue}</strong>`;
        for (const item of items) {
          html += `<br/><span style="color:${item.color}">●</span> ${item.seriesName}: ${fmt(item.value)}`;
        }
        return html + '</div>';
      },
    },
    legend: { top: 5, right: 0, textStyle: { fontSize: 11 } },
    xAxis: { type: 'category', data: xData, boundaryGap: false, axisLabel: { fontSize: 11 } },
    yAxis: { type: 'value', axisLabel: { fontSize: 11, formatter: (v: number) => fmt(v) } },
    series: series.map((s, i) => ({
      name: s.name,
      type: 'line' as const,
      data: s.data,
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: { width: 2, color: s.color },
      itemStyle: s.color ? { color: s.color } : undefined,
      areaStyle: s.areaStyle ? { opacity: 0.08 } : undefined,
      // Attach markLines to the first series only
      ...(i === 0 && markLines && markLines.length > 0 ? {
        markLine: {
          silent: true,
          symbol: 'none',
          data: markLines.map((ml) => ({
            yAxis: ml.value,
            name: ml.label,
            lineStyle: { type: 'dashed' as const, color: ml.color ?? '#E12726', width: 1.5 },
            label: { formatter: ml.label, fontSize: 10, position: 'insideEndTop' as const, color: ml.color ?? '#E12726' },
          })),
        },
      } : {}),
    })),
  };

  return <BaseChart option={option} height={height} onChartClick={onChartClick} />;
}
