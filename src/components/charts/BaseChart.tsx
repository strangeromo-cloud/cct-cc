import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { lenovoChartTheme } from '@/utils/chart-theme';

interface BaseChartProps {
  option: EChartsOption;
  height?: string;
  loading?: boolean;
  onChartClick?: (params: Record<string, unknown>) => void;
  className?: string;
}

export function BaseChart({ option, height = '300px', loading = false, onChartClick, className }: BaseChartProps) {
  const mergedOption: EChartsOption = {
    ...option,
    textStyle: { ...lenovoChartTheme.textStyle, ...((option.textStyle as Record<string, unknown>) ?? {}) },
    tooltip: {
      trigger: 'axis',
      ...lenovoChartTheme.tooltip,
      ...((option.tooltip as Record<string, unknown>) ?? {}),
    },
    grid: { left: 60, right: 20, top: 40, bottom: 30, containLabel: false, ...((option.grid as Record<string, unknown>) ?? {}) },
    color: option.color ?? lenovoChartTheme.color,
  };

  return (
    <ReactECharts
      option={mergedOption}
      style={{ height, width: '100%' }}
      className={className}
      showLoading={loading}
      onEvents={onChartClick ? { click: onChartClick } : undefined}
      opts={{ renderer: 'canvas' }}
      notMerge
    />
  );
}
