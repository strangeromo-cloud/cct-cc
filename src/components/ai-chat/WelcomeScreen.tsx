/**
 * WelcomeScreen — Rich onboarding view when chat is empty
 * Shows capabilities overview + categorized starter questions
 */
import { useLanguage } from '@/hooks/useLanguage';
import { SuggestedQueries } from './SuggestedQueries';
import type { ConversationContext } from '@/types/ai-types';
import {
  Bot, BarChart3, TrendingUp, Puzzle, Globe, Sparkles,
} from 'lucide-react';

interface WelcomeScreenProps {
  onSelect: (query: string) => void;
  context: ConversationContext;
}

const capabilities = [
  { icon: BarChart3, labelZh: '多维数据查询', labelEn: 'Cross-dimensional Queries', color: 'text-blue-500 bg-blue-50' },
  { icon: TrendingUp, labelZh: '趋势与归因', labelEn: 'Trends & Attribution', color: 'text-emerald-500 bg-emerald-50' },
  { icon: Puzzle, labelZh: '同行对标', labelEn: 'Peer Benchmarking', color: 'text-violet-500 bg-violet-50' },
  { icon: Globe, labelZh: '宏观与供应链', labelEn: 'Macro & Supply Chain', color: 'text-amber-500 bg-amber-50' },
];

export function WelcomeScreen({ onSelect, context }: WelcomeScreenProps) {
  const { language } = useLanguage();

  return (
    <div className="flex flex-col items-center pt-6 pb-4 px-2 animate-in fade-in duration-500">
      {/* Avatar */}
      <div className="relative mb-4">
        <div className="w-14 h-14 rounded-2xl bg-[#E12726] flex items-center justify-center shadow-lg shadow-red-200/50">
          <Bot className="h-7 w-7 text-white" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-400 border-2 border-white flex items-center justify-center">
          <Sparkles className="h-2.5 w-2.5 text-white" />
        </div>
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-foreground mb-1">
        {language === 'zh' ? 'CFO 智能助手' : 'CFO Intelligence Assistant'}
      </h3>
      <p className="text-[11px] text-muted-foreground mb-5 text-center max-w-[300px] leading-relaxed">
        {language === 'zh'
          ? '基于集团财务数据的智能分析，支持多维查询、归因分析与外部数据洞察'
          : 'Smart analytics powered by financial data — cross-queries, attribution analysis & external insights'}
      </p>

      {/* Capability pills */}
      <div className="grid grid-cols-2 gap-2 mb-5 w-full max-w-[340px]">
        {capabilities.map((cap, i) => {
          const Icon = cap.icon;
          return (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/40 bg-white"
            >
              <div className={`w-6 h-6 rounded-md flex items-center justify-center ${cap.color}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <span className="text-[11px] font-medium text-foreground">
                {language === 'zh' ? cap.labelZh : cap.labelEn}
              </span>
            </div>
          );
        })}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-2 mb-3 w-full max-w-[340px]">
        <div className="h-px flex-1 bg-border/40" />
        <span className="text-[10px] text-muted-foreground">
          {language === 'zh' ? '试试这些问题' : 'Try asking'}
        </span>
        <div className="h-px flex-1 bg-border/40" />
      </div>

      {/* Suggested queries */}
      <SuggestedQueries onSelect={onSelect} context={context} />
    </div>
  );
}
