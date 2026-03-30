import { useState } from 'react';
import { createPortal } from 'react-dom';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { lenovoChartTheme } from '@/utils/chart-theme';
import { Maximize2, X } from 'lucide-react';

interface ChartBlockProps {
  chartOption: EChartsOption;
  title?: string;
  height?: number;
}

export function ChartBlock({ chartOption, title, height = 200 }: ChartBlockProps) {
  const [fullscreen, setFullscreen] = useState(false);

  const mergedOption: EChartsOption = {
    ...chartOption,
    color: chartOption.color || lenovoChartTheme.color,
    grid: chartOption.grid || { left: 50, right: 10, top: 10, bottom: 24 },
  };

  return (
    <>
      <div className="bg-white rounded-lg p-2.5 border border-border/30 group relative">
        {/* Title bar */}
        {title && (
          <div className="flex items-center justify-between mb-1.5 px-0.5">
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <button
              onClick={() => setFullscreen(true)}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
              title="全屏查看"
            >
              <Maximize2 className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
        )}
        <ReactECharts
          option={mergedOption}
          style={{ height: `${height}px`, width: '100%' }}
          opts={{ renderer: 'canvas' }}
        />
      </div>

      {/* Fullscreen overlay */}
      {fullscreen && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-200"
          onClick={() => setFullscreen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-[800px] max-h-[600px] p-6 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-foreground">{title || 'Chart'}</p>
              <button
                onClick={() => setFullscreen(false)}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <ReactECharts
              option={{
                ...mergedOption,
                grid: { left: 60, right: 30, top: 30, bottom: 40 },
              }}
              style={{ height: '480px', width: '100%' }}
              opts={{ renderer: 'canvas' }}
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
