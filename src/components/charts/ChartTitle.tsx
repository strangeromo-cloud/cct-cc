import { InfoTooltip } from './InfoTooltip';
import { getMetricDef, type MetricKey } from '@/data/metric-definitions';
import { useLanguage } from '@/hooks/useLanguage';

interface ChartTitleProps {
  /** Display text */
  children: React.ReactNode;
  /** Metric key for automatic definition lookup */
  metricKey?: MetricKey | string;
  /** Override definition text (skips lookup) */
  definition?: string;
  /** Override formula text (skips lookup) */
  formula?: string;
}

/**
 * Chart card title with optional (?) info tooltip.
 * Usage: <ChartTitle metricKey="grossProfit">{t.metricGrossProfit}</ChartTitle>
 */
export function ChartTitle({ children, metricKey, definition, formula }: ChartTitleProps) {
  const { language } = useLanguage();

  const def = metricKey ? getMetricDef(language, metricKey) : undefined;
  const finalDef = definition ?? def?.definition;
  const finalFormula = formula ?? def?.formula;

  return (
    <span className="flex items-center gap-0">
      {children}
      {finalDef && <InfoTooltip definition={finalDef} formula={finalFormula} />}
    </span>
  );
}
