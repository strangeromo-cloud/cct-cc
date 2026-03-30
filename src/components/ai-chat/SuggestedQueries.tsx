import { useLanguage } from '@/hooks/useLanguage';
import { useFilters } from '@/hooks/useFilters';
import { getSmartSuggestions } from '@/data/smart-suggestions';
import type { ConversationContext } from '@/types/ai-types';
import { EMPTY_CONTEXT } from '@/types/ai-types';
import {
  Search, TrendingUp, ArrowLeftRight, PieChart, Trophy,
  Link2, Users, Globe, Truck, GitBranch,
} from 'lucide-react';

interface SuggestedQueriesProps {
  onSelect: (query: string) => void;
  context?: ConversationContext;
  page?: string;
}

const categoryIcons: Record<string, typeof Search> = {
  query: Search,
  trend: TrendingUp,
  compare: ArrowLeftRight,
  breakdown: PieChart,
  rank: Trophy,
  supply_chain: Truck,
  peer_compare: Users,
  macro: Globe,
  correlation: Link2,
  attribution: GitBranch,
};

const categoryColors: Record<string, string> = {
  query: 'hover:border-blue-300 hover:bg-blue-50/50',
  trend: 'hover:border-emerald-300 hover:bg-emerald-50/50',
  compare: 'hover:border-violet-300 hover:bg-violet-50/50',
  breakdown: 'hover:border-amber-300 hover:bg-amber-50/50',
  rank: 'hover:border-orange-300 hover:bg-orange-50/50',
  supply_chain: 'hover:border-red-300 hover:bg-red-50/50',
  peer_compare: 'hover:border-indigo-300 hover:bg-indigo-50/50',
  macro: 'hover:border-teal-300 hover:bg-teal-50/50',
  correlation: 'hover:border-pink-300 hover:bg-pink-50/50',
  attribution: 'hover:border-cyan-300 hover:bg-cyan-50/50',
};

export function SuggestedQueries({ onSelect, context, page }: SuggestedQueriesProps) {
  const { language } = useLanguage();
  const { filters } = useFilters();

  const suggestions = getSmartSuggestions(
    context || EMPTY_CONTEXT,
    filters,
    page,
  );

  return (
    <div className="flex flex-wrap gap-1.5 justify-center">
      {suggestions.map((s, idx) => {
        const Icon = categoryIcons[s.category] || Search;
        const hoverColor = categoryColors[s.category] || 'hover:border-gray-300 hover:bg-gray-50/50';
        const displayText = language === 'zh' ? s.textZh : s.text;
        return (
          <button
            key={idx}
            onClick={() => onSelect(displayText)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] bg-white text-foreground rounded-full border border-border/40 transition-all shadow-sm active:scale-95 ${hoverColor}`}
          >
            <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="truncate max-w-[180px]">{displayText}</span>
          </button>
        );
      })}
    </div>
  );
}
