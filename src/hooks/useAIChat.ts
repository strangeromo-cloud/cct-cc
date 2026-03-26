import { useContext, useCallback } from 'react';
import { ChatContext } from '@/context/ChatContext';
import { useFilters } from '@/hooks/useFilters';
import { generateAIResponse } from '@/data/ai-responses';
import type { ChatMessage } from '@/types';

let msgId = 0;

export function useAIChat() {
  const { messages, isOpen, isLoading, addMessage, setIsOpen, setIsLoading, clearMessages } = useContext(ChatContext);
  const { filters } = useFilters();

  const sendMessage = useCallback(async (text: string) => {
    const userMsg: ChatMessage = {
      id: `msg-${++msgId}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    addMessage(userMsg);
    setIsLoading(true);

    // Simulate delay
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));

    const response = generateAIResponse(text, filters);
    const assistantMsg: ChatMessage = {
      id: `msg-${++msgId}`,
      role: 'assistant',
      content: response.text,
      chartData: response.chart ?? null,
      timestamp: new Date(),
    };
    addMessage(assistantMsg);
    setIsLoading(false);
  }, [addMessage, setIsLoading, filters]);

  return { messages, isOpen, isLoading, sendMessage, setIsOpen, clearMessages };
}
