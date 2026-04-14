interface Props {
  sources: string[];
}

/**
 * Displays data source badges with color-coding:
 *   🟢 green = real-time (FRED, yfinance, NY Fed, etc.)
 *   🟡 amber = mock (paid sources we haven't subscribed to)
 */
export function SourceBadge({ sources }: Props) {
  if (!sources || sources.length === 0) {
    return (
      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
        unknown
      </span>
    );
  }

  // Deduplicate
  const unique = [...new Set(sources)];

  return (
    <div className="flex gap-1 items-center">
      {unique.map((s) => {
        const isMock = s === 'mock' || s === 'error' || s.includes('approx');
        const color = isMock
          ? 'bg-amber-50 text-amber-700 border-amber-200'
          : 'bg-green-50 text-green-700 border-green-200';
        const dot = isMock ? '🟡' : '🟢';
        return (
          <span key={s} className={`text-[9px] px-1.5 py-0.5 rounded-full border ${color} flex items-center gap-0.5`}>
            <span className="text-[8px]">{dot}</span>
            <span>{s}</span>
          </span>
        );
      })}
    </div>
  );
}
