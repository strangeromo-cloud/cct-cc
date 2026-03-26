import { useMemo } from 'react';
import { useFilters } from '@/hooks/useFilters';
import { useLanguage } from '@/hooks/useLanguage';
import { getTertiaryData, getIDGData, getBGSummary } from '@/data/mock-tertiary';
import { formatCurrency, formatPercent } from '@/utils/formatters';
import { StackedBarChart } from '@/components/charts/StackedBarChart';
import { TreemapChart } from '@/components/charts/TreemapChart';
import { RadarChart } from '@/components/charts/RadarChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BG_COLORS, QUARTERS, periodToQuarter, periodLabel } from '@/data/constants';

type MetricExtractor = (r: { revenues: number; grossProfit: number; operatingIncome: number }) => number;

export function TertiaryPage() {
  const { filters } = useFilters();
  const { t } = useLanguage();

  const allData = useMemo(() => getTertiaryData(filters), [filters]);
  const idgData = useMemo(() => getIDGData(filters), [filters]);
  const bgSummary = useMemo(() => getBGSummary(filters), [filters]);

  const idx = QUARTERS.indexOf(periodToQuarter(filters.quarter));
  const startIdx = Math.max(0, idx - 4);
  const periods = QUARTERS.slice(startIdx, idx + 1);

  // Helper: build stacked bar series for a given metric across BGs
  const buildBGSeries = (metric: MetricExtractor) => {
    const bgNames = ['IDG', 'ISG', 'SSG'];
    return bgNames.map((bg) => {
      const data = periods.map((p) => {
        if (bg === 'IDG') {
          return idgData.filter((r) => r.period === p).reduce((sum, r) => sum + metric(r), 0);
        }
        return allData.filter((r) => r.bg === bg && r.period === p).reduce((sum, r) => sum + metric(r), 0);
      });
      return { name: bg, data, color: BG_COLORS[bg] };
    });
  };

  const bgRevenue = useMemo(() => buildBGSeries((r) => r.revenues), [allData, idgData, periods]);
  const bgGrossProfit = useMemo(() => buildBGSeries((r) => r.grossProfit), [allData, idgData, periods]);
  const bgOpIncome = useMemo(() => buildBGSeries((r) => r.operatingIncome), [allData, idgData, periods]);

  const treemapData = useMemo(() => {
    const currentQ = QUARTERS[idx] ?? 'FY25Q3';
    const bgNames = ['IDG', 'ISG', 'SSG'] as const;
    return bgNames.map((bg) => {
      const rows = bg === 'IDG'
        ? idgData.filter((r) => r.period === currentQ)
        : allData.filter((r) => r.bg === bg && r.period === currentQ);
      return {
        name: bg,
        value: rows.reduce((sum, r) => sum + r.revenues, 0),
        itemStyle: { color: BG_COLORS[bg] },
        children: rows.map((r) => ({ name: r.geo, value: r.revenues })),
      };
    });
  }, [allData, idgData, idx]);

  const radarData = useMemo(() => {
    if (bgSummary.length === 0) return { indicators: [], series: [] };
    const maxRev = Math.max(...bgSummary.map((b) => b.revenues), 1);
    const maxGP = Math.max(...bgSummary.map((b) => b.grossProfit), 1);
    const maxOI = Math.max(...bgSummary.map((b) => b.operatingIncome), 1);
    return {
      indicators: [
        { name: t.revenue, max: maxRev * 1.2 },
        { name: t.grossProfit, max: maxGP * 1.2 },
        { name: t.grossProfitPct, max: 70 },
        { name: t.opIncome, max: maxOI * 1.2 },
      ],
      series: bgSummary.map((b) => ({
        name: b.bg,
        values: [b.revenues, b.grossProfit, b.grossProfitPct, b.operatingIncome],
        color: BG_COLORS[b.bg],
      })),
    };
  }, [bgSummary, t]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">
        {periodLabel(filters.quarter)} — {t.tertiaryTitle}
      </h2>

      {/* Three key metrics by BG — Revenue, Gross Profit, Operating Income */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t.revenue}</CardTitle>
          </CardHeader>
          <CardContent>
            <StackedBarChart categories={periods} series={bgRevenue} height="260px" />
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t.grossProfit}</CardTitle>
          </CardHeader>
          <CardContent>
            <StackedBarChart categories={periods} series={bgGrossProfit} height="260px" />
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t.operatingIncome}</CardTitle>
          </CardHeader>
          <CardContent>
            <StackedBarChart categories={periods} series={bgOpIncome} height="260px" />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t.revenueShare}</CardTitle>
          </CardHeader>
          <CardContent>
            <TreemapChart data={treemapData} height="300px" />
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t.bgPerformanceComparison}</CardTitle>
          </CardHeader>
          <CardContent>
            <RadarChart
              indicators={radarData.indicators}
              series={radarData.series}
              height="300px"
            />
          </CardContent>
        </Card>

        {/* BG Comparison Table — full width */}
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t.bgComparison}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 px-3 font-medium text-muted-foreground">BG</th>
                    <th className="py-2 px-3 font-medium text-muted-foreground text-right">{t.revenue}</th>
                    <th className="py-2 px-3 font-medium text-muted-foreground text-right">{t.grossProfit}</th>
                    <th className="py-2 px-3 font-medium text-muted-foreground text-right">{t.grossProfitPct}</th>
                    <th className="py-2 px-3 font-medium text-muted-foreground text-right">{t.opIncome}</th>
                  </tr>
                </thead>
                <tbody>
                  {bgSummary.map((row) => (
                    <tr key={row.bg} className="border-b border-border/50 hover:bg-muted/50">
                      <td className="py-2 px-3">
                        <span className="inline-flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: BG_COLORS[row.bg] }} />
                          <span className="font-medium">{row.bg}</span>
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(row.revenues)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(row.grossProfit)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{formatPercent(row.grossProfitPct)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(row.operatingIncome)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
