import { BaseChart } from './BaseChart';
import type { EChartsOption } from 'echarts';
import { formatCurrency } from '@/utils/formatters';

interface TreemapNode {
  name: string;
  value: number;
  children?: TreemapNode[];
  itemStyle?: { color: string };
}

interface TreemapChartProps {
  data: TreemapNode[];
  title?: string;
  height?: string;
  onChartClick?: (params: Record<string, unknown>) => void;
}

export function TreemapChart({ data, title, height, onChartClick }: TreemapChartProps) {
  const option: EChartsOption = {
    title: title ? { text: title, left: 'left', textStyle: { fontSize: 13, fontWeight: 600, color: '#333' } } : undefined,
    tooltip: {
      formatter: (params: unknown) => {
        const p = params as { name: string; value: number; treePathInfo: Array<{ name: string }> };
        const path = p.treePathInfo?.map((n) => n.name).filter(Boolean).join(' > ');
        return `<div style="font-size:12px"><strong>${path || p.name}</strong><br/>Revenue: ${formatCurrency(p.value)}</div>`;
      },
    },
    series: [
      {
        type: 'treemap',
        data,
        roam: false,
        nodeClick: 'zoomToNode',
        breadcrumb: { show: true, top: 'bottom' },
        label: {
          show: true,
          formatter: '{b}',
          fontSize: 12,
          color: '#fff',
        },
        upperLabel: {
          show: true,
          height: 24,
          color: '#fff',
          fontSize: 12,
          fontWeight: 600,
        },
        levels: [
          {
            itemStyle: { borderColor: '#fff', borderWidth: 2, gapWidth: 2 },
            upperLabel: { show: true },
          },
          {
            itemStyle: { borderColor: 'rgba(255,255,255,0.5)', borderWidth: 1, gapWidth: 1 },
            label: { show: true, fontSize: 10 },
          },
        ],
      },
    ],
  };

  return <BaseChart option={option} height={height} onChartClick={onChartClick} />;
}
