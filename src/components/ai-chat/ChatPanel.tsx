import { useEffect, useRef, useState, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAIChat } from '@/hooks/useAIChat';
import { useLanguage } from '@/hooks/useLanguage';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { SuggestedQueries } from './SuggestedQueries';
import { WelcomeScreen } from './WelcomeScreen';
import { TypingIndicator } from './TypingIndicator';
import { Bot, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MIN_WIDTH = 380;
const MAX_WIDTH = 900;
const DEFAULT_WIDTH = 460;

export function ChatPanel() {
  const { messages, isOpen, isLoading, conversationContext, sendMessage, setIsOpen, clearMessages } = useAIChat();
  const { language } = useLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const isDragging = useRef(false);

  // Resize drag handler
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const startX = e.clientX;
    const startWidth = panelWidth;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startX - ev.clientX; // dragging left = wider
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
      setPanelWidth(newWidth);
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [panelWidth]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        setTimeout(() => {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }, 50);
      }
    }
  }, [messages, isLoading]);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent showCloseButton={false} className="p-0 flex flex-col h-full overflow-hidden border-l border-border/50 shadow-2xl" style={{ width: panelWidth, maxWidth: panelWidth }}>
        {/* Drag handle on left edge */}
        <div
          onMouseDown={handleMouseDown}
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 hover:bg-[#0073CE]/20 active:bg-[#0073CE]/30 transition-colors group"
        >
          <div className="absolute left-0.5 top-1/2 -translate-y-1/2 w-0.5 h-8 rounded-full bg-border/60 group-hover:bg-[#0073CE]/60 transition-colors" />
        </div>

        {/* Header */}
        <SheetHeader className="px-4 py-3 border-b border-border/40 shrink-0 bg-gradient-to-r from-white to-muted/20">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2.5 text-sm">
              <div className="w-6 h-6 rounded-lg bg-[#E12726] flex items-center justify-center shadow-sm">
                <Bot className="h-3.5 w-3.5 text-white" />
              </div>
              <div>
                <span className="font-semibold">
                  {language === 'zh' ? 'CFO 智能助手' : 'CFO Assistant'}
                </span>
                <span className="ml-2 text-[9px] text-emerald-500 font-normal">● Online</span>
              </div>
            </SheetTitle>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg hover:bg-red-50 hover:text-red-500 transition-colors"
                  onClick={clearMessages}
                  title={language === 'zh' ? '清除对话' : 'Clear chat'}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg hover:bg-muted transition-colors"
                onClick={() => setIsOpen(false)}
                title={language === 'zh' ? '关闭' : 'Close'}
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        {/* Messages area */}
        <ScrollArea className="flex-1 min-h-0 px-4 py-3" ref={scrollRef}>
          {/* Welcome screen when empty */}
          {messages.length === 0 && (
            <WelcomeScreen onSelect={sendMessage} context={conversationContext} />
          )}

          {/* Messages */}
          <div className="space-y-4">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}

            {/* Typing indicator */}
            {isLoading && <TypingIndicator />}
          </div>

          {/* Follow-up suggestions after messages */}
          {messages.length > 0 && !isLoading && conversationContext.lastIntent && (
            <div className="mt-4 pt-3 border-t border-border/20">
              <p className="text-[10px] text-muted-foreground/60 mb-2 text-center">
                {language === 'zh' ? '继续探索' : 'Explore more'}
              </p>
              <SuggestedQueries onSelect={sendMessage} context={conversationContext} />
            </div>
          )}
        </ScrollArea>

        {/* Input area */}
        <div className="shrink-0 border-t border-border/40 px-4 py-3 bg-gradient-to-t from-muted/20 to-white">
          <ChatInput
            onSend={sendMessage}
            disabled={isLoading}
            placeholder={language === 'zh' ? '输入问题，如"为什么营收下降"...' : 'Ask "Why did revenue decline"...'}
          />
          <p className="text-[9px] text-muted-foreground/40 text-center mt-1.5">
            {language === 'zh' ? 'Enter 发送 · Shift+Enter 换行' : 'Enter to send · Shift+Enter for new line'}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
