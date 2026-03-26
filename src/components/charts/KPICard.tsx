import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import { getChangeIndicator } from '@/utils/formatters';
import { InfoTooltip } from './InfoTooltip';
import { getMetricDef } from '@/data/metric-definitions';
import { useLanguage } from '@/hooks/useLanguage';

type AlertStatus = 'normal' | 'warning' | 'danger';

interface KPICardProps {
  label: string;
  value: string;
  previousValue?: number;
  currentValue?: number;
  subtitle?: string;
  /** Alert-driven border/background coloring */
  alertStatus?: AlertStatus;
  /** Small reference text, e.g. "Target: <42 days" */
  thresholdLabel?: string;
  /** Metric key for auto (?) tooltip with definition & formula */
  metricKey?: string;
}

const alertStyles: Record<AlertStatus, string> = {
  normal: 'border-border/50 bg-white',
  warning: 'border-orange-400/60 bg-orange-50',
  danger: 'border-lenovo-red/50 bg-red-50',
};

export function KPICard({
  label,
  value,
  previousValue,
  currentValue,
  subtitle,
  alertStatus = 'normal',
  thresholdLabel,
  metricKey,
}: KPICardProps) {
  const { language } = useLanguage();
  const change = previousValue !== undefined && currentValue !== undefined
    ? getChangeIndicator(currentValue, previousValue)
    : null;

  const def = metricKey ? getMetricDef(language, metricKey) : undefined;

  return (
    <Card className={`shadow-sm border ${alertStyles[alertStatus]}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1 flex items-center">
            {label}
            {def && <InfoTooltip definition={def.definition} formula={def.formula} />}
          </p>
          {alertStatus === 'danger' && <AlertTriangle className="h-4 w-4 text-lenovo-red" />}
          {alertStatus === 'warning' && <AlertTriangle className="h-4 w-4 text-orange-500" />}
        </div>
        <p className={`text-2xl font-bold leading-tight ${alertStatus === 'danger' ? 'text-lenovo-red' : 'text-foreground'}`}>
          {value}
        </p>
        {change && (
          <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${
            change.direction === 'up' ? 'text-lenovo-green' : change.direction === 'down' ? 'text-lenovo-red' : 'text-muted-foreground'
          }`}>
            {change.direction === 'up' && <TrendingUp className="h-3 w-3" />}
            {change.direction === 'down' && <TrendingDown className="h-3 w-3" />}
            {change.direction === 'flat' && <Minus className="h-3 w-3" />}
            {change.pct.toFixed(1)}% {subtitle || 'vs prior'}
          </div>
        )}
        {thresholdLabel && (
          <p className="text-[10px] text-muted-foreground mt-1">{thresholdLabel}</p>
        )}
      </CardContent>
    </Card>
  );
}
