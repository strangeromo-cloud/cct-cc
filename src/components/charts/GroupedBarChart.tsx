import { BaseChart } from './BaseChart';
import type { EChartsOption } from 'echarts';
import { formatCurrency } from '@/utils/formatters';

interface GroupedBarChartProps {
  categories: string[];
  series: { name: string; data: number[]; color?: string }[];
  title?: string;
  height?: string;
  onChartClick?: (params: Record<string, unknown>) => void;
}

export function GroupedBarChart({ categories, series, title, height, onChartClick }: GroupedBarChartProps) {
  const option: EChartsOption = {
    title: title ? { text: title, left: 'left', textStyle: { fontSize: 13, fontWeight: 600, color: '#333' } } : undefined,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const items = params as Array<{ seriesName: string; value: number; color: string; axisValue?: string }>;
        let html = `<div style="font-size:12px"><strong>${items[0]?.axisValue ?? ''}</strong>`;
        for (const item of items) {
          html += `<br/><span style="color:${item.color}">●</span> ${item.seriesName}: ${formatCurrency(item.value)}`;
        }
        return html + '</div>';
      },
    },
    legend: { top: 5, right: 0, textStyle: { fontSize: 11 } },
    xAxis: { type: 'category', data: categories, axisLabel: { fontSize: 11 } },
    yAxis: { type: 'value', axisLabel: { fontSize: 11, formatter: (v: number) => formatCurrency(v) } },
    series: series.map((s) => ({
      name: s.name,
      type: 'bar' as const,
      data: s.data,
      barMaxWidth: 40,
      itemStyle: s.color ? { color: s.color } : undefined,
    })),
  };

  return <BaseChart option={option} height={height} onChartClick={onChartClick} />;
}
