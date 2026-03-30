import { useState } from 'react';
import type { RichChatMessage } from '@/types/ai-types';
import { MessageBlockRenderer } from './MessageBlocks';
import ReactECharts from 'echarts-for-react';
import { lenovoChartTheme } from '@/utils/chart-theme';
import { Bot, User, Copy, Check } from 'lucide-react';

interface ChatMessageProps {
  message: RichChatMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const timeStr = message.timestamp.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  if (isUser) {
    return (
      <div className="flex items-start gap-2 justify-end group">
        <div className="flex flex-col items-end max-w-[85%]">
          <div className="rounded-2xl rounded-tr-sm px-3.5 py-2 text-sm bg-[#0073CE] text-white shadow-sm">
            <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
          </div>
          <span className="text-[9px] text-muted-foreground/50 mt-1 mr-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {timeStr}
          </span>
        </div>
        <div className="w-7 h-7 rounded-full bg-[#0073CE]/10 flex items-center justify-center shrink-0 mt-0.5">
          <User className="h-3.5 w-3.5 text-[#0073CE]" />
        </div>
      </div>
    );
  }

  // Assistant message with rich blocks
  return (
    <div className="flex items-start gap-2 group">
      <div className="w-7 h-7 rounded-full bg-[#E12726] flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
        <Bot className="h-3.5 w-3.5 text-white" />
      </div>
      <div className="flex flex-col max-w-[90%]">
        <div className="rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm bg-white border border-border/40 shadow-sm">
          {message.blocks && message.blocks.length > 0 ? (
            <MessageBlockRenderer blocks={message.blocks} />
          ) : (
            <>
              <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
              {message.chartData && (
                <div className="mt-2 bg-muted/30 rounded-md p-2">
                  <ReactECharts
                    option={{
                      ...message.chartData,
                      color: lenovoChartTheme.color,
                      grid: { left: 40, right: 10, top: 20, bottom: 20 },
                    }}
                    style={{ height: '180px', width: '100%' }}
                    opts={{ renderer: 'canvas' }}
                  />
                </div>
              )}
            </>
          )}
        </div>
        {/* Action bar */}
        <div className="flex items-center gap-2 mt-1 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-[9px] text-muted-foreground/50">{timeStr}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-0.5 text-[9px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            title="Copy"
          >
            {copied ? (
              <><Check className="h-2.5 w-2.5" /> Copied</>
            ) : (
              <><Copy className="h-2.5 w-2.5" /> Copy</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
