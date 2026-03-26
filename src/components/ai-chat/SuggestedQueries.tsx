import { useLanguage } from '@/hooks/useLanguage';

interface SuggestedQueriesProps {
  onSelect: (query: string) => void;
}

export function SuggestedQueries({ onSelect }: SuggestedQueriesProps) {
  const { t } = useLanguage();

  const suggestions = [
    t.suggestGP,
    t.suggestRevConsensus,
    t.suggestCCC,
    t.suggestBGBreakdown,
    t.suggestExpenses,
  ];

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {suggestions.map((s) => (
        <button
          key={s}
          onClick={() => onSelect(s)}
          className="px-3 py-1.5 text-xs bg-muted hover:bg-muted/80 text-foreground rounded-full border border-border/50 transition-colors"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
