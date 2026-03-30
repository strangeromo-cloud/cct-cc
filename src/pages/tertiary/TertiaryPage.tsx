import { useMemo } from 'react';
import { useFilters } from '@/hooks/useFilters';
import { useLanguage } from '@/hooks/useLanguage';
import { getTertiaryData, getIDGData } from '@/data/mock-tertiary';
import { formatCurrency } from '@/utils/formatters';
import { StackedBarChart } from '@/components/charts/StackedBarChart';
import { GroupedBarChart } from '@/components/charts/GroupedBarChart';
import { TrendLineChart } from '@/components/charts/TrendLineChart';
import { HeatmapChart } from '@/components/charts/HeatmapChart';
import { TreemapChart } from '@/components/charts/TreemapChart';
import { AlignedDataTable } from '@/components/charts/AlignedDataTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BG_COLORS, GEOGRAPHIES, QUARTERS, periodToQuarter, periodLabel } from '@/data/constants';


type MetricExtractor = (r: { revenues: number; grossProfit: number; operatingIncome: number }) => number;

export function TertiaryPage() {
  const { filters } = useFilters();
  const { t } = useLanguage();

  const allData = useMemo(() => getTertiaryData(filters), [filters]);
  const idgData = useMemo(() => getIDGData(filters), [filters]);

  const idx = QUARTERS.indexOf(periodToQuarter(filters.quarter));
  const startIdx = Math.max(0, idx - 4);
  const periods = QUARTERS.slice(startIdx, idx + 1);
  const currentQ = QUARTERS[idx] ?? QUARTERS[QUARTERS.length - 1];

  const bgNames = ['IDG', 'ISG', 'SSG'] as const;

  // Helper: build stacked bar series for a given metric across BGs
  const buildBGSeries = (metric: MetricExtractor) => {
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

  // ── BG GP% trend (line chart) ──
  const bgGPPctSeries = useMemo(() => {
    return bgNames.map((bg) => {
      const data = periods.map((p) => {
        let rev = 0; let gp = 0;
        if (bg === 'IDG') {
          const rows = idgData.filter((r) => r.period === p);
          rev = rows.reduce((s, r) => s + r.revenues, 0);
          gp = rows.reduce((s, r) => s + r.grossProfit, 0);
        } else {
          const rows = allData.filter((r) => r.bg === bg && r.period === p);
          rev = rows.reduce((s, r) => s + r.revenues, 0);
          gp = rows.reduce((s, r) => s + r.grossProfit, 0);
        }
        return rev > 0 ? Math.round(gp / rev * 1000) / 10 : 0;
      });
      return { name: bg, data, color: BG_COLORS[bg] };
    });
  }, [allData, idgData, periods]);

  // ── BG OI% trend (line chart) ──
  const bgOIPctSeries = useMemo(() => {
    return bgNames.map((bg) => {
      const data = periods.map((p) => {
        let rev = 0; let oi = 0;
        if (bg === 'IDG') {
          const rows = idgData.filter((r) => r.period === p);
          rev = rows.reduce((s, r) => s + r.revenues, 0);
          oi = rows.reduce((s, r) => s + r.operatingIncome, 0);
        } else {
          const rows = allData.filter((r) => r.bg === bg && r.period === p);
          rev = rows.reduce((s, r) => s + r.revenues, 0);
          oi = rows.reduce((s, r) => s + r.operatingIncome, 0);
        }
        return rev > 0 ? Math.round(oi / rev * 1000) / 10 : 0;
      });
      return { name: bg, data, color: BG_COLORS[bg] };
    });
  }, [allData, idgData, periods]);

  // ── Geo × BG revenue heatmap ──
  const activeGeos = filters.selectedGeos.length > 0 ? filters.selectedGeos : [...GEOGRAPHIES];
  const heatmapData = useMemo(() => {
    const data: [number, number, number][] = [];
    bgNames.forEach((bg, xi) => {
      activeGeos.forEach((geo, yi) => {
        let rev = 0;
        if (bg === 'IDG') {
          rev = idgData.filter((r) => r.period === currentQ && r.geo === geo).reduce((s, r) => s + r.revenues, 0);
        } else {
          rev = allData.filter((r) => r.bg === bg && r.period === currentQ && r.geo === geo).reduce((s, r) => s + r.revenues, 0);
        }
        data.push([xi, yi, rev]);
      });
    });
    return data;
  }, [allData, idgData, currentQ, activeGeos]);

  // ── Geo GP% comparison (grouped bar) ──
  const geoGPPctSeries = useMemo(() => {
    return bgNames.map((bg) => {
      const data = activeGeos.map((geo) => {
        let rev = 0; let gp = 0;
        if (bg === 'IDG') {
          const rows = idgData.filter((r) => r.period === currentQ && r.geo === geo);
          rev = rows.reduce((s, r) => s + r.revenues, 0);
          gp = rows.reduce((s, r) => s + r.grossProfit, 0);
        } else {
          const rows = allData.filter((r) => r.bg === bg && r.period === currentQ && r.geo === geo);
          rev = rows.reduce((s, r) => s + r.revenues, 0);
          gp = rows.reduce((s, r) => s + r.grossProfit, 0);
        }
        return rev > 0 ? Math.round(gp / rev * 1000) / 10 : 0;
      });
      return { name: bg as string, data, color: BG_COLORS[bg] };
    });
  }, [allData, idgData, currentQ, activeGeos]);

  // ── Treemap (revenue share) ──
  const treemapData = useMemo(() => {
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
  }, [allData, idgData, currentQ]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">
        {periodLabel(filters.quarter)} — {t.tertiaryTitle}
      </h2>

      {/* ① Three key absolute metrics by BG — Revenue, Gross Profit, Operating Income */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t.revenue}</CardTitle>
          </CardHeader>
          <CardContent>
            <StackedBarChart categories={periods} series={bgRevenue} height="260px" />
            <AlignedDataTable
              columns={periods}
              rows={[
                ...bgRevenue.map((s) => ({
                  label: s.name,
                  cells: s.data.map((v) => formatCurrency(v)),
                })),
                { label: t.total, cells: periods.map((_, i) => <span className="font-semibold">{formatCurrency(bgRevenue.reduce((sum, s) => sum + s.data[i], 0))}</span>), labelClass: 'text-foreground' },
              ]}
            />
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t.grossProfit}</CardTitle>
          </CardHeader>
          <CardContent>
            <StackedBarChart categories={periods} series={bgGrossProfit} height="260px" />
            <AlignedDataTable
              columns={periods}
              rows={[
                ...bgGrossProfit.map((s) => ({
                  label: s.name,
                  cells: s.data.map((v) => formatCurrency(v)),
                })),
                { label: t.total, cells: periods.map((_, i) => <span className="font-semibold">{formatCurrency(bgGrossProfit.reduce((sum, s) => sum + s.data[i], 0))}</span>), labelClass: 'text-foreground' },
              ]}
            />
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t.operatingIncome}</CardTitle>
          </CardHeader>
          <CardContent>
            <StackedBarChart categories={periods} series={bgOpIncome} height="260px" />
            <AlignedDataTable
              columns={periods}
              rows={[
                ...bgOpIncome.map((s) => ({
                  label: s.name,
                  cells: s.data.map((v) => formatCurrency(v)),
                })),
                { label: t.total, cells: periods.map((_, i) => <span className="font-semibold">{formatCurrency(bgOpIncome.reduce((sum, s) => sum + s.data[i], 0))}</span>), labelClass: 'text-foreground' },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      {/* ② BG margin trends — GP% and OI% */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t.bgGPMarginTrend}</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendLineChart
              xData={periods}
              series={bgGPPctSeries}
              yAxisFormatter={(v) => `${v}%`}
              height="280px"
            />
            <AlignedDataTable
              columns={periods}
              rows={bgGPPctSeries.map((s) => ({
                label: s.name,
                cells: s.data.map((v) => `${v}%`),
                labelClass: 'text-foreground',
              }))}
            />
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t.bgOIMarginComparison}</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendLineChart
              xData={periods}
              series={bgOIPctSeries}
              yAxisFormatter={(v) => `${v}%`}
              height="280px"
            />
            <AlignedDataTable
              columns={periods}
              rows={bgOIPctSeries.map((s) => ({
                label: s.name,
                cells: s.data.map((v) => `${v}%`),
                labelClass: 'text-foreground',
              }))}
            />
          </CardContent>
        </Card>
      </div>

      {/* ③ Geo analysis — Heatmap + GP% by region + Treemap */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t.geoRevHeatmap}</CardTitle>
          </CardHeader>
          <CardContent>
            <HeatmapChart
              xCategories={[...bgNames]}
              yCategories={activeGeos as string[]}
              data={heatmapData}
              height="320px"
              valueFormatter={formatCurrency}
            />
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t.geoProfitabilityComparison}</CardTitle>
          </CardHeader>
          <CardContent>
            <GroupedBarChart
              categories={activeGeos as string[]}
              series={geoGPPctSeries}
              height="320px"
              yAxisFormatter={(v) => `${v}%`}
              tooltipFormatter={(v) => `${v}%`}
            />
            <AlignedDataTable
              columns={activeGeos as string[]}
              rows={geoGPPctSeries.map((s) => ({
                label: s.name,
                cells: s.data.map((v) => `${v}%`),
                labelClass: 'text-foreground',
              }))}
            />
          </CardContent>
        </Card>
      </div>

      {/* ④ Revenue share treemap */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">{t.revenueShare}</CardTitle>
        </CardHeader>
        <CardContent>
          <TreemapChart data={treemapData} height="300px" />
        </CardContent>
      </Card>
    </div>
  );
}
