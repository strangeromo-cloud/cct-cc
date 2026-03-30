import type { OperatingMetrics, ThresholdConfig } from '@/types';
import { useLanguage } from '@/hooks/useLanguage';
import { formatCurrency, formatMultiple } from '@/utils/formatters';
import { KPICard } from '@/components/charts/KPICard';
import { TrendLineChart } from '@/components/charts/TrendLineChart';
import { AlignedDataTable } from '@/components/charts/AlignedDataTable';
import { ChartTitle } from '@/components/charts/ChartTitle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface TierMomentumProps {
  data: OperatingMetrics[];
  thresholds: ThresholdConfig;
}

export function TierMomentum({ data, thresholds }: TierMomentumProps) {
  const { t } = useLanguage();

  const latest = data[data.length - 1];
  const prev = data.length >= 2 ? data[data.length - 2] : undefined;
  if (!latest) return null;

  const coverageRatio = latest.revenues > 0 ? latest.pipeline / latest.revenues : 0;
  const coverageAlert = coverageRatio < thresholds.coverageMin ? 'danger' : coverageRatio < thresholds.coverageMin * 1.2 ? 'warning' : 'normal';

  const periods = data.map((d) => d.period);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="shadow-sm lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            <ChartTitle metricKey="pipeline">{t.pipelineBacklogTrend}</ChartTitle>
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-3">
          <TrendLineChart
            xData={periods}
            series={[
              { name: t.metricPipeline, data: data.map((d) => d.pipeline), color: '#0073CE' },
              { name: t.metricBacklog, data: data.map((d) => d.backlog), color: '#00A650' },
            ]}
            height="220px"
          />
          <AlignedDataTable
            columns={periods}
            rows={[
              { label: t.metricPipeline, cells: data.map((d) => <span className="font-semibold">{formatCurrency(d.pipeline)}</span>), labelClass: 'text-foreground' },
              { label: t.metricBacklog, cells: data.map((d) => <span>{formatCurrency(d.backlog)}</span>) },
              { label: t.coverageRatio, cells: data.map((d) => <span className="font-semibold">{formatMultiple(d.revenues > 0 ? d.pipeline / d.revenues : 0)}</span>), labelClass: 'text-foreground' },
            ]}
          />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <KPICard
          label={t.metricPipeline}
          value={formatCurrency(latest.pipeline)}
          currentValue={latest.pipeline}
          previousValue={prev?.pipeline}
          subtitle={t.vsPrior}
          metricKey="pipeline"
        />
        <KPICard
          label={t.metricBacklog}
          value={formatCurrency(latest.backlog)}
          currentValue={latest.backlog}
          previousValue={prev?.backlog}
          subtitle={t.vsPrior}
          metricKey="backlog"
        />
        <KPICard
          label={t.coverageRatio}
          value={formatMultiple(coverageRatio)}
          alertStatus={coverageAlert as 'normal' | 'warning' | 'danger'}
          thresholdLabel={`${t.coverageRatioDesc} | Min: ${formatMultiple(thresholds.coverageMin)}`}
          metricKey="coverageRatio"
        />
      </div>
    </div>
  );
}
