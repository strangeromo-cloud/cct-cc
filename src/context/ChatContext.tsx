import { createContext, useCallback, useState, type ReactNode } from 'react';
import type { ChatMessage } from '@/types';

export interface ChatContextValue {
  messages: ChatMessage[];
  isOpen: boolean;
  isLoading: boolean;
  addMessage: (msg: ChatMessage) => void;
  setIsOpen: (open: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  clearMessages: () => void;
}

export const ChatContext = createContext<ChatContextValue>({
  messages: [],
  isOpen: false,
  isLoading: false,
  addMessage: () => {},
  setIsOpen: () => {},
  setIsLoading: () => {},
  clearMessages: () => {},
});

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return (
    <ChatContext.Provider value={{ messages, isOpen, isLoading, addMessage, setIsOpen, setIsLoading, clearMessages }}>
      {children}
    </ChatContext.Provider>
  );
}
