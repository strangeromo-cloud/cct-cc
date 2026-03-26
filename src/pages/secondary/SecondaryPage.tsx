import { useMemo } from 'react';
import { useFilters } from '@/hooks/useFilters';
import { useLanguage } from '@/hooks/useLanguage';
import { getSecondaryData, getWaterfallData, getBudgetData, getThresholds, getExpenseRatios } from '@/data/mock-secondary';
import { periodLabel } from '@/data/constants';
import { formatCurrency } from '@/utils/formatters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { TierMomentum } from './TierMomentum';
import { TierProfitability } from './TierProfitability';
import { TierAssetVelocity } from './TierAssetVelocity';
import { TierCashFlow } from './TierCashFlow';

/* ------------------------------------------------------------------ */
/*  Full metrics table (always visible at bottom)                      */
/* ------------------------------------------------------------------ */
const metricKeys = [
  'pipeline', 'backlog', 'revenues', 'cogs', 'grossProfit',
  'smExpense', 'rdExpense', 'fixedExpense', 'inventory', 'woiIdg',
  'ar', 'ap', 'cccUnfunded',
] as const;

const metricTranslationKeys: Record<string, string> = {
  pipeline: 'metricPipeline',
  backlog: 'metricBacklog',
  revenues: 'metricRevenues',
  cogs: 'metricCOGS',
  grossProfit: 'metricGrossProfit',
  smExpense: 'metricSMExpense',
  rdExpense: 'metricRDExpense',
  fixedExpense: 'metricFixedExpense',
  inventory: 'metricInventory',
  woiIdg: 'metricWOI',
  ar: 'metricAR',
  ap: 'metricAP',
  cccUnfunded: 'metricCCC',
};

/* Tier section label styles */
const tierLabelClass = 'text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3';

export function SecondaryPage() {
  const { filters } = useFilters();
  const { t } = useLanguage();

  const data = useMemo(() => getSecondaryData(filters), [filters]);
  const waterfall = useMemo(() => getWaterfallData(filters), [filters]);
  const budgetData = useMemo(() => getBudgetData(filters), [filters]);
  const thresholds = useMemo(() => getThresholds(), []);
  const expenseRatios = useMemo(() => getExpenseRatios(data), [data]);

  const periods = data.map((d) => d.period);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">
        {periodLabel(filters.quarter)} — {t.secondaryTitle}
      </h2>

      {/* Tier 1: Forward-Looking Momentum */}
      <section>
        <h3 className={tierLabelClass}>{t.tierForwardMomentum}</h3>
        <TierMomentum data={data} thresholds={thresholds} />
      </section>

      <div className="h-px bg-border" />

      {/* Tier 2: Profitability & Operating Leverage */}
      <section>
        <h3 className={tierLabelClass}>{t.tierProfitability}</h3>
        <TierProfitability
          data={data}
          waterfall={waterfall}
          budgetData={budgetData}
          expenseRatios={expenseRatios}
        />
      </section>

      <div className="h-px bg-border" />

      {/* Tier 3: Asset Velocity */}
      <section>
        <h3 className={tierLabelClass}>{t.tierAssetVelocity}</h3>
        <TierAssetVelocity data={data} thresholds={thresholds} />
      </section>

      <div className="h-px bg-border" />

      {/* Tier 4: Cash Flow & Liquidity */}
      <section>
        <h3 className={tierLabelClass}>{t.tierCashFlow}</h3>
        <TierCashFlow data={data} thresholds={thresholds} />
      </section>

      <div className="h-px bg-border" />

      {/* Full Operating Metrics Table — always visible */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">{t.fullOperatingMetrics}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 px-3 font-medium text-muted-foreground">{t.metric}</th>
                  {periods.map((p) => (
                    <th key={p} className="py-2 px-3 font-medium text-muted-foreground text-right">{p}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metricKeys.map((key) => (
                  <tr key={key} className="border-b border-border/50 hover:bg-muted/50">
                    <td className="py-2 px-3 font-medium">
                      {t[metricTranslationKeys[key] as keyof typeof t] ?? key}
                    </td>
                    {data.map((d) => {
                      const val = d[key] as number;
                      const isDays = key === 'woiIdg' || key === 'cccUnfunded';
                      return (
                        <td key={d.period} className="py-2 px-3 text-right tabular-nums">
                          {isDays ? `${val} ${t.days}` : formatCurrency(val)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
