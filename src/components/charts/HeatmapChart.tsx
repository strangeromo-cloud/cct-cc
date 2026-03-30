import { BaseChart } from './BaseChart';
import type { EChartsOption } from 'echarts';

interface HeatmapChartProps {
  xCategories: string[];
  yCategories: string[];
  data: [number, number, number][];
  title?: string;
  height?: string;
  valueFormatter?: (v: number) => string;
}

export function HeatmapChart({ xCategories, yCategories, data, title, height, valueFormatter }: HeatmapChartProps) {
  const values = data.map((d) => d[2]);
  const min = Math.min(...values);
  const max = Math.max(...values);

  const option: EChartsOption = {
    title: title ? { text: title, left: 'left', textStyle: { fontSize: 13, fontWeight: 600, color: '#333' } } : undefined,
    tooltip: {
      position: 'top',
      formatter: (params: unknown) => {
        const p = params as { value: [number, number, number] };
        const xLabel = xCategories[p.value[0]];
        const yLabel = yCategories[p.value[1]];
        const val = valueFormatter ? valueFormatter(p.value[2]) : p.value[2].toString();
        return `<div style="font-size:12px"><strong>${yLabel}</strong><br/>${xLabel}: ${val}</div>`;
      },
    },
    grid: { left: 80, right: 40, top: 10, bottom: 70 },
    xAxis: { type: 'category', data: xCategories, splitArea: { show: true }, axisLabel: { fontSize: 11 } },
    yAxis: { type: 'category', data: yCategories, splitArea: { show: true }, axisLabel: { fontSize: 11 } },
    visualMap: {
      min,
      max,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 2,
      itemWidth: 12,
      itemHeight: 120,
      inRange: { color: ['#f0f9ff', '#0073CE', '#003d82'] },
      textStyle: { fontSize: 10 },
    },
    series: [
      {
        type: 'heatmap',
        data,
        label: {
          show: true,
          fontSize: 10,
          formatter: (params: unknown) => {
            const p = params as { value: [number, number, number] };
            return valueFormatter ? valueFormatter(p.value[2]) : String(p.value[2]);
          },
        },
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.3)' },
        },
      },
    ],
  };

  return <BaseChart option={option} height={height} />;
}
