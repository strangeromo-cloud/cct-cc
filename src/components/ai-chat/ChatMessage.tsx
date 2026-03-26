import type { ChatMessage as ChatMessageType } from '@/types';
import ReactECharts from 'echarts-for-react';
import { lenovoChartTheme } from '@/utils/chart-theme';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
        isUser
          ? 'bg-lenovo-blue text-white'
          : 'bg-muted text-foreground'
      }`}>
        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        {message.chartData && (
          <div className="mt-2 bg-white rounded-md p-2">
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
      </div>
    </div>
  );
}
