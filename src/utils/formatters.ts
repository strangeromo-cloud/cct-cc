export function formatCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const m = abs / 1e6;
  if (m >= 1000) return `${sign}$${m.toLocaleString('en-US', { maximumFractionDigits: 0 })}M`;
  if (m >= 1) return `${sign}$${m.toLocaleString('en-US', { maximumFractionDigits: 0 })}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const m = abs / 1e6;
  if (m >= 1) return `${sign}${m.toLocaleString('en-US', { maximumFractionDigits: 0 })}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

export function formatMultiple(value: number): string {
  return `${value.toFixed(1)}x`;
}

export function formatDays(value: number, label = 'days'): string {
  return `${Math.round(value)} ${label}`;
}

export function getChangeIndicator(current: number, previous: number) {
  if (previous === 0) return { direction: 'flat' as const, pct: 0 };
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  return {
    direction: pct > 0.5 ? ('up' as const) : pct < -0.5 ? ('down' as const) : ('flat' as const),
    pct: Math.abs(pct),
  };
}
