import { Info, AlertTriangle, AlertCircle } from 'lucide-react';

interface InsightBadgeProps {
  level: 'info' | 'warning' | 'alert';
  text: string;
}

export function InsightBadge({ level, text }: InsightBadgeProps) {
  const config = {
    info: {
      bg: 'bg-blue-50/80 border-blue-200/60',
      icon: <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />,
      textColor: 'text-blue-700',
      accent: 'border-l-blue-400',
    },
    warning: {
      bg: 'bg-amber-50/80 border-amber-200/60',
      icon: <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />,
      textColor: 'text-amber-700',
      accent: 'border-l-amber-400',
    },
    alert: {
      bg: 'bg-red-50/80 border-red-200/60',
      icon: <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />,
      textColor: 'text-red-700',
      accent: 'border-l-red-400',
    },
  };

  const c = config[level];

  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border border-l-[3px] text-[11px] ${c.bg} ${c.textColor} ${c.accent}`}>
      {c.icon}
      <span className="leading-relaxed">{text}</span>
    </div>
  );
}
