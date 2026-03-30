import { Bot } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';

export function TypingIndicator() {
  const { language } = useLanguage();

  return (
    <div className="flex items-start gap-2">
      <div className="w-7 h-7 rounded-full bg-[#E12726] flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
        <Bot className="h-3.5 w-3.5 text-white" />
      </div>
      <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-white border border-border/40 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-[#E12726] rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '0.6s' }} />
            <span className="w-2 h-2 bg-[#E12726]/70 rounded-full animate-bounce" style={{ animationDelay: '150ms', animationDuration: '0.6s' }} />
            <span className="w-2 h-2 bg-[#E12726]/40 rounded-full animate-bounce" style={{ animationDelay: '300ms', animationDuration: '0.6s' }} />
          </div>
          <span className="text-xs text-muted-foreground">
            {language === 'zh' ? '正在分析...' : 'Analyzing...'}
          </span>
        </div>
      </div>
    </div>
  );
}
