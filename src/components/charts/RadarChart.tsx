import { BaseChart } from './BaseChart';
import type { EChartsOption } from 'echarts';

interface RadarChartProps {
  indicators: { name: string; max: number }[];
  series: { name: string; values: number[]; color?: string }[];
  title?: string;
  height?: string;
}

export function RadarChart({ indicators, series, title, height }: RadarChartProps) {
  const option: EChartsOption = {
    title: title ? { text: title, left: 'left', textStyle: { fontSize: 13, fontWeight: 600, color: '#333' } } : undefined,
    tooltip: { trigger: 'item' },
    legend: { top: 5, right: 0, textStyle: { fontSize: 11 } },
    radar: {
      indicator: indicators,
      shape: 'polygon',
      splitNumber: 4,
      axisName: { color: '#666', fontSize: 11 },
      splitLine: { lineStyle: { color: '#E5E5E5' } },
      splitArea: { areaStyle: { color: ['rgba(0,0,0,0.02)', 'rgba(0,0,0,0.04)'] } },
    },
    series: [
      {
        type: 'radar',
        data: series.map((s) => ({
          value: s.values,
          name: s.name,
          areaStyle: { opacity: 0.15 },
          lineStyle: { width: 2, color: s.color },
          itemStyle: s.color ? { color: s.color } : undefined,
        })),
      },
    ],
  };

  return <BaseChart option={option} height={height} />;
}
