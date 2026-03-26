import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAIChat } from '@/hooks/useAIChat';
import { useLanguage } from '@/hooks/useLanguage';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { SuggestedQueries } from './SuggestedQueries';
import { Bot } from 'lucide-react';

export function ChatPanel() {
  const { messages, isOpen, isLoading, sendMessage, setIsOpen } = useAIChat();
  const { t } = useLanguage();

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="w-[420px] sm:w-[420px] p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border shrink-0">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <Bot className="h-4 w-4 text-lenovo-blue" />
            {t.aiChatTitle}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 px-4 py-3">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <Bot className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                {t.aiChatWelcome}
              </p>
              <SuggestedQueries onSelect={sendMessage} />
            </div>
          )}
          <div className="space-y-3">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-lenovo-blue rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-lenovo-blue rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-lenovo-blue rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                Analyzing...
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="shrink-0 border-t border-border px-4 py-3">
          <ChatInput onSend={sendMessage} disabled={isLoading} placeholder={t.aiChatPlaceholder} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
