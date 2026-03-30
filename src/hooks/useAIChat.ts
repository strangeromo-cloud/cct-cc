import { useContext, useCallback, useRef } from 'react';
import { ChatContext } from '@/context/ChatContext';
import { useFilters } from '@/hooks/useFilters';
import { generateAIResponse } from '@/data/ai-responses';
import { sendChatMessage, sendChatMessageStream } from '@/api/client';
import type { RichChatMessage, MessageBlock } from '@/types/ai-types';

let msgId = 0;

/**
 * AI mode: 'local' uses frontend regex engine, 'api' calls backend LLM.
 * Controlled by VITE_AI_MODE env var. Defaults to 'local' for dev.
 */
const AI_MODE = (import.meta.env.VITE_AI_MODE || 'local') as 'local' | 'api' | 'api-stream';

export function useAIChat() {
  const {
    messages, isOpen, isLoading, conversationContext,
    addMessage, updateMessage, setIsOpen, setIsLoading, updateConversationContext, clearMessages,
  } = useContext(ChatContext);
  const { filters } = useFilters();
  const _streamAbortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (text: string) => {
    const userMsg: RichChatMessage = {
      id: `msg-${++msgId}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    addMessage(userMsg);
    setIsLoading(true);

    try {
      if (AI_MODE === 'local') {
        // ── Frontend-only mode (existing regex engine) ──
        await new Promise((r) => setTimeout(r, 300 + Math.random() * 500));
        const response = generateAIResponse(text, filters, conversationContext);
        const assistantMsg: RichChatMessage = {
          id: `msg-${++msgId}`,
          role: 'assistant',
          content: response.text,
          blocks: response.blocks,
          timestamp: new Date(),
        };
        addMessage(assistantMsg);
        updateConversationContext(response.updatedContext);

      } else if (AI_MODE === 'api-stream') {
        // ── Streaming SSE mode ──
        const assistantMsgId = `msg-${++msgId}`;
        let fullText = '';
        let finalBlocks: MessageBlock[] = [];
        const thinkingSteps: string[] = [];

        // Add placeholder message with initial thinking state
        addMessage({
          id: assistantMsgId,
          role: 'assistant',
          content: '...',
          blocks: [{ type: 'thinking', steps: [] }],
          timestamp: new Date(),
        });

        const history = messages
          .slice(-10)
          .map(m => ({ role: m.role, content: m.content }));

        const stream = sendChatMessageStream({
          message: text,
          filters: {
            quarter: filters.quarter,
            selectedBGs: filters.selectedBGs,
            selectedGeos: filters.selectedGeos,
          },
          conversationHistory: history,
        });

        for await (const event of stream) {
          if (event.type === 'thinking' && event.content) {
            thinkingSteps.push(event.content);
            // Live-update the message with accumulated thinking steps
            updateMessage(assistantMsgId, {
              blocks: [{ type: 'thinking', steps: [...thinkingSteps] }],
            });
          } else if (event.type === 'delta' && event.content) {
            fullText += event.content;
            // Live-update with accumulated text + thinking block
            updateMessage(assistantMsgId, {
              content: fullText,
              blocks: [
                { type: 'thinking', steps: [...thinkingSteps] },
                { type: 'text', content: fullText },
              ],
            });
          } else if (event.type === 'complete') {
            fullText = event.text || fullText;
            finalBlocks = convertApiBlocks((event.blocks || []) as Array<{ type: string; data?: Record<string, unknown> }>);
          } else if (event.type === 'error') {
            fullText = `分析出错: ${event.content || '未知错误'}`;
          }
        }

        // Final update: prepend ThinkingBlock (marked complete) to final blocks
        const allBlocks: MessageBlock[] = [];
        if (thinkingSteps.length > 0) {
          allBlocks.push({ type: 'thinking', steps: thinkingSteps, complete: true });
        }
        if (finalBlocks.length > 0) {
          allBlocks.push(...finalBlocks);
        } else if (fullText) {
          allBlocks.push({ type: 'text', content: fullText });
        }

        updateMessage(assistantMsgId, {
          content: fullText,
          blocks: allBlocks,
        });

      } else {
        // ── Non-streaming API mode ──
        const history = messages
          .slice(-10)
          .map(m => ({ role: m.role, content: m.content }));

        const result = await sendChatMessage({
          message: text,
          filters: {
            quarter: filters.quarter,
            selectedBGs: filters.selectedBGs,
            selectedGeos: filters.selectedGeos,
          },
          conversationHistory: history,
        });

        const blocks = convertApiBlocks(result.blocks);

        const assistantMsg: RichChatMessage = {
          id: `msg-${++msgId}`,
          role: 'assistant',
          content: result.text,
          blocks: blocks.length > 0 ? blocks : [{ type: 'text', content: result.text }],
          timestamp: new Date(),
        };
        addMessage(assistantMsg);
      }

    } catch (err) {
      const errorMsg: RichChatMessage = {
        id: `msg-${++msgId}`,
        role: 'assistant',
        content: `请求失败: ${err instanceof Error ? err.message : '未知错误'}`,
        blocks: [{
          type: 'insight',
          level: 'alert',
          text: `连接后端服务失败。请确认服务器是否运行在 ${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}`,
        }],
        timestamp: new Date(),
      };
      addMessage(errorMsg);
    }

    setIsLoading(false);
  }, [addMessage, updateMessage, setIsLoading, filters, conversationContext, updateConversationContext, messages]);

  return {
    messages, isOpen, isLoading, conversationContext,
    sendMessage, setIsOpen, clearMessages,
  };
}

/**
 * Convert API block format {type, data} to frontend MessageBlock union type.
 */
function convertApiBlocks(apiBlocks: Array<{ type: string; data?: Record<string, unknown> }>): MessageBlock[] {
  return apiBlocks.map(block => {
    const d = block.data || {};
    switch (block.type) {
      case 'text':
        return { type: 'text' as const, content: (d.content as string) || '' };
      case 'kpi_card':
        return { type: 'kpi_card' as const, cards: (d.cards as any[]) || [] };
      case 'table':
        return {
          type: 'table' as const,
          title: (d.title as string) || undefined,
          headers: (d.headers as string[]) || [],
          rows: (d.rows as string[][]) || [],
        };
      case 'insight':
        return {
          type: 'insight' as const,
          level: (d.level as 'info' | 'warning' | 'alert') || 'info',
          text: (d.text as string) || '',
        };
      case 'source_tag':
        return { type: 'source_tag' as const, sources: (d.sources as string[]) || [] };
      case 'chart':
        return {
          type: 'chart' as const,
          chartOption: (d.chartOption as any) || {},
          title: (d.title as string) || undefined,
          height: (d.height as number) || undefined,
        };
      default:
        return { type: 'text' as const, content: JSON.stringify(d) };
    }
  });
}
