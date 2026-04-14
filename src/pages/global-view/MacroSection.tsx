import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { BaseChart } from '@/components/charts/BaseChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { MacroData, TimeSeries } from '@/api/global-client';
import { useLanguage } from '@/hooks/useLanguage';
import { SourceBadge } from './SourceBadge';

interface Props {
  data: MacroData | null;
  loading: boolean;
}

export function MacroSection({ data, loading }: Props) {
  const { language } = useLanguage();
  const sectionTitle = language === 'zh' ? '维度一：宏观与资本环境' : 'Dimension 1: Macro & Capital Environment';

  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-1 h-4 bg-lenovo-red rounded-full" />
        <h3 className="text-sm font-semibold">{sectionTitle}</h3>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <YieldVsPEChart yield10Y={data?.treasury10Y ?? null} pe={data?.nasdaqPE ?? null} loading={loading} />
        <DXYVsVIXChart dxy={data?.dxy ?? null} vix={data?.vix ?? null} loading={loading} />
        <EPUChart epu={data?.epu ?? null} loading={loading} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Chart 1: 10Y Treasury vs NASDAQ P/E                                */
/* ------------------------------------------------------------------ */
function YieldVsPEChart({ yield10Y, pe, loading }: { yield10Y: TimeSeries | null; pe: TimeSeries | null; loading: boolean }) {
  const { language } = useLanguage();
  const title = language === 'zh' ? '美债 10Y 收益率 vs 科技股 P/E' : '10Y Treasury Yield vs Tech P/E';
  const yAxis1 = language === 'zh' ? '10Y 收益率 (%)' : '10Y Yield (%)';
  const yAxis2 = language === 'zh' ? 'NDX P/E' : 'NDX P/E';

  const option = useMemo<EChartsOption>(() => {
    const dates = yield10Y?.dates ?? pe?.dates ?? [];
    return {
      tooltip: { trigger: 'axis' },
      legend: { top: 0, left: 'center', textStyle: { fontSize: 10 }, itemGap: 20 },
      grid: { left: 50, right: 45, top: 40, bottom: 40 },
      xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 10, hideOverlap: true } },
      yAxis: [
        { type: 'value', axisLabel: { fontSize: 10, formatter: '{value}%', color: '#0073CE' }, splitLine: { lineStyle: { color: '#F0F0F0', type: 'dashed' } } },
        { type: 'value', axisLabel: { fontSize: 10, color: '#F5A623' }, splitLine: { show: false } },
      ],
      series: [
        { name: yAxis1, type: 'line', yAxisIndex: 0, data: yield10Y?.values ?? [], smooth: true, symbol: 'none', lineStyle: { color: '#0073CE', width: 2 } },
        { name: yAxis2, type: 'line', yAxisIndex: 1, data: pe?.values ?? [], smooth: true, symbol: 'none', lineStyle: { color: '#F5A623', width: 2 } },
      ],
    };
  }, [yield10Y, pe, yAxis1, yAxis2]);

  const sources = [yield10Y?.source, pe?.source].filter(Boolean) as string[];

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-semibold flex items-center justify-between">
          <span>{title}</span>
          <SourceBadge sources={sources} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <BaseChart option={option} height="240px" loading={loading} />
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Chart 2: DXY + VIX                                                 */
/* ------------------------------------------------------------------ */
function DXYVsVIXChart({ dxy, vix, loading }: { dxy: TimeSeries | null; vix: TimeSeries | null; loading: boolean }) {
  const { language } = useLanguage();
  const title = language === 'zh' ? 'DXY 美元指数 + VIX 波动率' : 'DXY + VIX Volatility';
  const label1 = language === 'zh' ? '美元指数 (DXY)' : 'DXY';
  const label2 = language === 'zh' ? '波动率 (VIX，代替 CVIX)' : 'VIX (proxy for CVIX)';

  const option = useMemo<EChartsOption>(() => {
    const dates = dxy?.dates ?? vix?.dates ?? [];
    // VIX threshold ~25 = elevated volatility
    const vixThreshold = 25;

    return {
      tooltip: { trigger: 'axis' },
      legend: { top: 0, left: 'center', textStyle: { fontSize: 10 }, itemGap: 20 },
      grid: { left: 50, right: 45, top: 40, bottom: 40 },
      xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 10, hideOverlap: true } },
      yAxis: [
        { type: 'value', axisLabel: { fontSize: 10, color: '#0073CE' } },
        { type: 'value', axisLabel: { fontSize: 10, color: '#E12726' }, splitLine: { show: false } },
      ],
      series: [
        { name: label1, type: 'line', yAxisIndex: 0, data: dxy?.values ?? [], smooth: true, symbol: 'none', lineStyle: { color: '#0073CE', width: 2 } },
        {
          name: label2,
          type: 'line',
          yAxisIndex: 1,
          data: vix?.values ?? [],
          smooth: true,
          symbol: 'none',
          areaStyle: { color: 'rgba(225, 39, 38, 0.15)' },
          lineStyle: { color: '#E12726', width: 1.5 },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#E12726', type: 'dashed', opacity: 0.5 },
            data: [{ yAxis: vixThreshold, label: { formatter: `VIX ${vixThreshold}`, fontSize: 9, color: '#E12726' } }],
          },
        },
      ],
    };
  }, [dxy, vix, label1, label2]);

  const sources = [dxy?.source, vix?.source].filter(Boolean) as string[];

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-semibold flex items-center justify-between">
          <span>{title}</span>
          <SourceBadge sources={sources} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <BaseChart option={option} height="240px" loading={loading} />
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Chart 3: EPU Index                                                 */
/* ------------------------------------------------------------------ */
function EPUChart({ epu, loading }: { epu: TimeSeries | null; loading: boolean }) {
  const { language } = useLanguage();
  const title = language === 'zh' ? '全球经济政策不确定性指数 (EPU)' : 'Global Policy Uncertainty Index (EPU)';
  const label = language === 'zh' ? 'EPU 指数' : 'EPU Index';

  const option = useMemo<EChartsOption>(() => {
    const dates = epu?.dates ?? [];
    const values = epu?.values ?? [];
    const alertThreshold = 300; // historically high level

    return {
      tooltip: { trigger: 'axis' },
      legend: { show: false },
      grid: { left: 50, right: 20, top: 20, bottom: 40 },
      xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 10, hideOverlap: true } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10 } },
      series: [
        {
          name: label,
          type: 'line',
          data: values,
          smooth: true,
          symbol: 'none',
          lineStyle: { color: '#E12726', width: 2 },
          areaStyle: { color: 'rgba(225, 39, 38, 0.1)' },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#E12726', type: 'dashed', opacity: 0.5 },
            data: [{ yAxis: alertThreshold, label: { formatter: `${language === 'zh' ? '预警线' : 'Alert'} ${alertThreshold}`, fontSize: 9 } }],
          },
          markPoint: {
            symbol: 'pin',
            symbolSize: 30,
            data: values.length > 0
              ? [
                  { name: 'max', type: 'max', label: { fontSize: 9, formatter: '{c}' } },
                ]
              : [],
          },
        },
      ],
    };
  }, [epu, label, language]);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-semibold flex items-center justify-between">
          <span>{title}</span>
          <SourceBadge sources={epu?.source ? [epu.source] : []} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <BaseChart option={option} height="240px" loading={loading} />
      </CardContent>
    </Card>
  );
}
