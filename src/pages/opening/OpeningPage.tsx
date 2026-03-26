import { useMemo } from 'react';
import { useFilters } from '@/hooks/useFilters';
import { useLanguage } from '@/hooks/useLanguage';
import { getOpeningData, getOpeningTrendData, getMetricTrends, getProfitabilityWaterfall } from '@/data/mock-opening';
import type { ProfitWaterfallItem } from '@/data/mock-opening';
import { periodLabel } from '@/data/constants';
import { formatCurrency, formatPercent } from '@/utils/formatters';
import { KPICard } from '@/components/charts/KPICard';
import { MetricTabbedChart } from '@/components/charts/MetricTabbedChart';
import { TrendLineChart } from '@/components/charts/TrendLineChart';
import { ChartTitle } from '@/components/charts/ChartTitle';
import { BaseChart } from '@/components/charts/BaseChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { EChartsOption } from 'echarts';

/* ------------------------------------------------------------------ */
/*  Profitability Waterfall ECharts builder                            */
/* ------------------------------------------------------------------ */
function buildProfitWaterfallOption(steps: ProfitWaterfallItem[], language: string): EChartsOption {
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
      runningTotal += step.value;
      assistData.push(runningTotal);
      positiveData.push('-');
      negativeData.push(Math.abs(step.value));
    }
  }

  const qoqLabel = language === 'zh' ? '环比' : 'QoQ';
  const yoyLabel = language === 'zh' ? '同比' : 'YoY';

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const items = params as Array<{ dataIndex: number }>;
        const step = steps[items[0]?.dataIndex ?? 0];
        if (!step) return '';
        let html = `<div style="font-size:12px"><strong>${step.name}</strong><br/>${formatCurrency(step.value)}`;
        if (step.margin) html += `<br/><span style="color:#999">Margin: ${step.margin}</span>`;
        if (step.qoqPct !== undefined) html += `<br/>${qoqLabel}: <span style="color:${step.qoqPct >= 0 ? '#00A650' : '#E12726'}">${step.qoqPct > 0 ? '+' : ''}${step.qoqPct}%</span>`;
        if (step.yoyPct !== undefined) html += `<br/>${yoyLabel}: <span style="color:${step.yoyPct >= 0 ? '#00A650' : '#E12726'}">${step.yoyPct > 0 ? '+' : ''}${step.yoyPct}%</span>`;
        return html + '</div>';
      },
    },
    grid: { left: 60, right: 20, top: 30, bottom: 60 },
    xAxis: { type: 'category', data: categories, axisLabel: { fontSize: 11, interval: 0 } },
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
            if (!step || step.type !== 'total') return '';
            let label = formatCurrency(step.value);
            if (step.margin) label += `\n${step.margin}`;
            return label;
          },
        },
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
}

/* ------------------------------------------------------------------ */
/*  QoQ / YoY annotation row below the waterfall                       */
/* ------------------------------------------------------------------ */
function ChangeAnnotations({ steps, language }: { steps: ProfitWaterfallItem[]; language: string }) {
  const totals = steps.filter((s) => s.type === 'total' || s.type === 'positive');
  const qoqLabel = language === 'zh' ? '环比' : 'QoQ';
  const yoyLabel = language === 'zh' ? '同比' : 'YoY';

  return (
    <div className="flex justify-around mt-2 text-[11px]">
      {totals.map((s) => (
        <div key={s.name} className="text-center">
          <div className="font-medium text-muted-foreground mb-0.5">{s.name}</div>
          {s.qoqPct !== undefined && (
            <span className={`mr-2 ${s.qoqPct >= 0 ? 'text-lenovo-green' : 'text-lenovo-red'}`}>
              {qoqLabel} {s.qoqPct > 0 ? '+' : ''}{s.qoqPct}%
            </span>
          )}
          {s.yoyPct !== undefined && (
            <span className={s.yoyPct >= 0 ? 'text-lenovo-green' : 'text-lenovo-red'}>
              {yoyLabel} {s.yoyPct > 0 ? '+' : ''}{s.yoyPct}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export function OpeningPage() {
  const { filters } = useFilters();
  const { t, language } = useLanguage();

  const data = useMemo(() => getOpeningData(filters), [filters]);
  const trend = useMemo(() => getOpeningTrendData(filters), [filters]);
  const metricTrends = useMemo(() => getMetricTrends(filters), [filters]);
  const profitWaterfall = useMemo(() => getProfitabilityWaterfall(filters), [filters]);
  const waterfallOption = useMemo(() => buildProfitWaterfallOption(profitWaterfall, language), [profitWaterfall, language]);

  // Margin trend data: GP%, OI%, Net% over 5 quarters
  const marginTrendLabel = language === 'zh' ? '利润率趋势' : 'Margin Trends';

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">
        {periodLabel(filters.quarter)} — {t.openingTitle}
      </h2>

      {/* ① KPI Cards — "一眼看全局" */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KPICard label={t.revenue} value={formatCurrency(data.revenues.actual)} currentValue={data.revenues.actual} previousValue={data.revenues.priorYear} subtitle={t.vsPrior} metricKey="revenues" />
        <KPICard label={t.grossProfit} value={formatCurrency(data.grossProfit.actual)} currentValue={data.grossProfit.actual} previousValue={data.grossProfit.priorYear} subtitle={t.vsPrior} metricKey="grossProfit" />
        <KPICard label={t.grossProfitPct} value={formatPercent(data.grossProfitPct.actual)} currentValue={data.grossProfitPct.actual} previousValue={data.grossProfitPct.priorYear} subtitle={t.vsPrior} metricKey="grossProfitPct" />
        <KPICard label={t.operatingIncome} value={formatCurrency(data.operatingIncome.actual)} currentValue={data.operatingIncome.actual} previousValue={data.operatingIncome.priorYear} subtitle={t.vsPrior} metricKey="operatingIncome" />
        <KPICard label={t.netIncome} value={formatCurrency(data.netIncome.actual)} currentValue={data.netIncome.actual} previousValue={data.netIncome.priorYear} subtitle={t.vsPrior} metricKey="netIncome" />
      </div>

      {/* ② Actual vs Bloomberg Consensus — "我跑赢市场预期了吗？" */}
      <Card className="shadow-sm">
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-semibold">{t.actualVsConsensus}</CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          <MetricTabbedChart metrics={metricTrends} height="300px" />
        </CardContent>
      </Card>

      {/* ③ Profitability Waterfall — "钱去哪了？" */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            <ChartTitle metricKey="revToOIBridge">{t.profitabilityAnalysis}</ChartTitle>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BaseChart option={waterfallOption} height="300px" />
          <ChangeAnnotations steps={profitWaterfall} language={language} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ④ Margin Trends — "利润率在改善吗？" */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              <ChartTitle metricKey="grossProfitPct">{marginTrendLabel}</ChartTitle>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TrendLineChart
              xData={trend.quarters}
              series={[
                {
                  name: 'GP%',
                  data: trend.quarters.map((_, i) => {
                    const rev = trend.series.revenues[i];
                    const gp = trend.series.grossProfit[i];
                    return rev > 0 ? Math.round(gp / rev * 1000) / 10 : 0;
                  }),
                  color: '#0073CE',
                },
                {
                  name: 'OI%',
                  data: trend.quarters.map((_, i) => {
                    const rev = trend.series.revenues[i];
                    const oi = trend.series.operatingIncome[i];
                    return rev > 0 ? Math.round(oi / rev * 1000) / 10 : 0;
                  }),
                  color: '#00A650',
                },
                {
                  name: 'Net%',
                  data: trend.quarters.map((_, i) => {
                    const rev = trend.series.revenues[i];
                    const ni = trend.series.netIncome[i];
                    return rev > 0 ? Math.round(ni / rev * 1000) / 10 : 0;
                  }),
                  color: '#F5A623',
                },
              ]}
              yAxisFormatter={(v) => `${v}%`}
              height="280px"
            />
          </CardContent>
        </Card>

        {/* ⑤ Revenue Trend vs Consensus — "增长动能如何？" */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t.quarterlyRevenueTrend}</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendLineChart
              xData={trend.quarters}
              series={[
                { name: t.revenue, data: trend.series.revenues, color: '#0073CE', areaStyle: true },
                { name: t.consensus, data: trend.series.consensus, color: '#F5A623' },
              ]}
              height="280px"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
