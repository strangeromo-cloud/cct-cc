import { BaseChart } from './BaseChart';
import type { EChartsOption } from 'echarts';

interface GaugeChartProps {
  value: number;
  target?: number;
  label: string;
  min?: number;
  max?: number;
  height?: string;
}

export function GaugeChart({ value, target, label, min = 0, max = 100, height = '200px' }: GaugeChartProps) {
  const option: EChartsOption = {
    tooltip: { show: false },
    series: [
      {
        type: 'gauge',
        min,
        max,
        progress: { show: true, width: 14 },
        axisLine: { lineStyle: { width: 14, color: [[1, '#E5E5E5']] } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        pointer: { show: false },
        anchor: { show: false },
        title: {
          show: true,
          offsetCenter: [0, '70%'],
          fontSize: 12,
          color: '#666',
        },
        detail: {
          valueAnimation: true,
          offsetCenter: [0, '30%'],
          fontSize: 22,
          fontWeight: 700,
          color: '#333',
          formatter: `{value}%`,
        },
        data: [{ value, name: label }],
        itemStyle: {
          color: value >= (target ?? value) ? '#00A650' : '#E12726',
        },
      },
    ],
  };

  return <BaseChart option={option} height={height} />;
}
