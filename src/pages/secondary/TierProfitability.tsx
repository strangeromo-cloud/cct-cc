import type { OperatingMetrics, WaterfallStep, BudgetData, ExpenseRatios } from '@/types';
import { useLanguage } from '@/hooks/useLanguage';
import { formatCurrency, formatPercent } from '@/utils/formatters';
import { WaterfallChart } from '@/components/charts/WaterfallChart';
import { StackedBarChart } from '@/components/charts/StackedBarChart';
import { TrendLineChart } from '@/components/charts/TrendLineChart';
import { AlignedDataTable } from '@/components/charts/AlignedDataTable';
import { ChartTitle } from '@/components/charts/ChartTitle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface TierProfitabilityProps {
  data: OperatingMetrics[];
  waterfall: WaterfallStep[];
  budgetData: BudgetData[];
  expenseRatios: ExpenseRatios;
}

export function TierProfitability({ data, waterfall, budgetData, expenseRatios }: TierProfitabilityProps) {
  const { t } = useLanguage();

  const periods = data.map((d) => d.period);
  const latestBudget = budgetData[budgetData.length - 1];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="shadow-sm lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            <ChartTitle metricKey="revToOIBridge">{t.revToOIBridge}</ChartTitle>
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-3">
          <WaterfallChart
            steps={waterfall}
            height="280px"
            budgetLine={latestBudget ? { value: latestBudget.oiTarget, label: t.budgetLabel } : undefined}
          />
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            <ChartTitle metricKey="smExpense">{t.expenseBreakdown}</ChartTitle>
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-3">
          <StackedBarChart
            categories={periods}
            series={[
              { name: t.metricSMExpense, data: data.map((d) => d.smExpense), color: '#E12726' },
              { name: t.metricRDExpense, data: data.map((d) => d.rdExpense), color: '#0073CE' },
              { name: t.metricFixedExpense, data: data.map((d) => d.fixedExpense), color: '#F5A623' },
            ]}
            height="260px"
          />
          <AlignedDataTable
            columns={periods}
            rows={[
              { label: t.metricSMExpense, cells: data.map((d) => formatCurrency(d.smExpense)), labelClass: 'text-foreground' },
              { label: t.metricRDExpense, cells: data.map((d) => formatCurrency(d.rdExpense)) },
              { label: t.metricFixedExpense, cells: data.map((d) => formatCurrency(d.fixedExpense)) },
              { label: t.total ?? 'Total', cells: data.map((d) => <span className="font-semibold">{formatCurrency(d.smExpense + d.rdExpense + d.fixedExpense)}</span>), labelClass: 'text-foreground' },
            ]}
          />
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            <ChartTitle metricKey="expenseRatio">{t.expenseRatioTrends}</ChartTitle>
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-3">
          <TrendLineChart
            xData={expenseRatios.periods}
            series={[
              { name: 'S&M / Rev', data: expenseRatios.smPct, color: '#E12726' },
              { name: 'R&D / Rev', data: expenseRatios.rdPct, color: '#0073CE' },
              { name: 'Fixed / Rev', data: expenseRatios.fixedPct, color: '#F5A623' },
            ]}
            yAxisFormatter={(v) => formatPercent(v)}
            height="260px"
          />
          <AlignedDataTable
            columns={expenseRatios.periods}
            rows={[
              { label: 'S&M / Rev', cells: expenseRatios.smPct.map((v) => formatPercent(v)), labelClass: 'text-foreground' },
              { label: 'R&D / Rev', cells: expenseRatios.rdPct.map((v) => formatPercent(v)) },
              { label: 'Fixed / Rev', cells: expenseRatios.fixedPct.map((v) => formatPercent(v)) },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
