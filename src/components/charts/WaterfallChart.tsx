import { BaseChart } from './BaseChart';
import type { EChartsOption } from 'echarts';
import type { WaterfallStep } from '@/types';
import { formatCurrency } from '@/utils/formatters';

interface WaterfallChartProps {
  steps: WaterfallStep[];
  title?: string;
  height?: string;
  /** Optional horizontal dashed budget reference line */
  budgetLine?: { value: number; label: string };
}

export function WaterfallChart({ steps, title, height, budgetLine }: WaterfallChartProps) {
  const categories = steps.map((s) => s.name);
  const assistData: (number | string)[] = [];
  const positiveData: (number | string)[] = [];
  const negativeData: (number | string)[] = [];

  let runningTotal = 0;
  for (const step of steps) {
    if (step.type === 'total') {
      assistData.push(0);
      positiveData.push(step.value);
      negativeData.push('-');
      runningTotal = step.value;
    } else if (step.type === 'positive') {
      assistData.push(runningTotal);
      positiveData.push(step.value);
      negativeData.push('-');
      runningTotal += step.value;
    } else {
      runningTotal += step.value; // value is negative
      assistData.push(runningTotal);
      positiveData.push('-');
      negativeData.push(Math.abs(step.value));
    }
  }

  const option: EChartsOption = {
    title: title ? { text: title, left: 'left', textStyle: { fontSize: 13, fontWeight: 600, color: '#333' } } : undefined,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const items = params as Array<{ seriesName: string; value: number | string; dataIndex: number }>;
        const step = steps[items[0]?.dataIndex ?? 0];
        if (!step) return '';
        return `<div style="font-size:12px"><strong>${step.name}</strong><br/>${formatCurrency(step.value)}</div>`;
      },
    },
    xAxis: { type: 'category', data: categories, axisLabel: { fontSize: 11 } },
    yAxis: { type: 'value', axisLabel: { fontSize: 11, formatter: (v: number) => formatCurrency(v) } },
    series: [
      {
        name: 'Assist',
        type: 'bar',
        stack: 'waterfall',
        itemStyle: { borderColor: 'transparent', color: 'transparent' },
        emphasis: { itemStyle: { borderColor: 'transparent', color: 'transparent' } },
        data: assistData,
      },
      {
        name: 'Positive',
        type: 'bar',
        stack: 'waterfall',
        data: positiveData,
        itemStyle: { color: '#0073CE' },
        label: {
          show: true,
          position: 'top',
          fontSize: 10,
          formatter: (p: { dataIndex: number }) => {
            const step = steps[p.dataIndex];
            return step && step.type !== 'total' ? '' : formatCurrency(step?.value ?? 0);
          },
        },
        ...(budgetLine ? {
          markLine: {
            silent: true,
            symbol: 'none',
            data: [{ yAxis: budgetLine.value, name: budgetLine.label }],
            lineStyle: { type: 'dashed', color: '#999', width: 1.5 },
            label: { formatter: `${budgetLine.label}: ${formatCurrency(budgetLine.value)}`, fontSize: 10, position: 'insideEndTop' },
          },
        } : {}),
      },
      {
        name: 'Negative',
        type: 'bar',
        stack: 'waterfall',
        data: negativeData,
        itemStyle: { color: '#E12726' },
      },
    ],
  };

  return <BaseChart option={option} height={height} />;
}
