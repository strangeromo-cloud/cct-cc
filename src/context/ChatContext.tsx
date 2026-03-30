import { createContext, useCallback, useState, type ReactNode } from 'react';
import type { RichChatMessage, ConversationContext } from '@/types/ai-types';
import { EMPTY_CONTEXT } from '@/types/ai-types';

export interface ChatContextValue {
  messages: RichChatMessage[];
  isOpen: boolean;
  isLoading: boolean;
  conversationContext: ConversationContext;
  addMessage: (msg: RichChatMessage) => void;
  updateMessage: (id: string, patch: Partial<RichChatMessage>) => void;
  setIsOpen: (open: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  updateConversationContext: (update: Partial<ConversationContext>) => void;
  clearMessages: () => void;
}

export const ChatContext = createContext<ChatContextValue>({
  messages: [],
  isOpen: false,
  isLoading: false,
  conversationContext: EMPTY_CONTEXT,
  addMessage: () => {},
  updateMessage: () => {},
  setIsOpen: () => {},
  setIsLoading: () => {},
  updateConversationContext: () => {},
  clearMessages: () => {},
});

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<RichChatMessage[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationContext, setConversationContext] = useState<ConversationContext>(EMPTY_CONTEXT);

  const addMessage = useCallback((msg: RichChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateMessage = useCallback((id: string, patch: Partial<RichChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const updateConversationContext = useCallback((update: Partial<ConversationContext>) => {
    setConversationContext((prev) => ({ ...prev, ...update }));
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setConversationContext(EMPTY_CONTEXT);
  }, []);

  return (
    <ChatContext.Provider value={{
      messages, isOpen, isLoading, conversationContext,
      addMessage, updateMessage, setIsOpen, setIsLoading, updateConversationContext, clearMessages,
    }}>
      {children}
    </ChatContext.Provider>
  );
}
