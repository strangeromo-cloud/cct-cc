import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [text]);

  // Focus on mount and when not disabled
  useEffect(() => {
    if (!disabled) textareaRef.current?.focus();
  }, [disabled]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="relative flex items-end gap-2">
      <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? 'Ask about financial data...'}
          disabled={disabled}
          rows={1}
          className="w-full resize-none rounded-lg border border-border bg-white px-3 py-2.5 text-sm leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-[#0073CE]/30 focus:border-[#0073CE] disabled:opacity-50 transition-shadow"
          style={{ minHeight: '40px', maxHeight: '120px' }}
        />
        {text.length > 0 && (
          <span className="absolute right-2 bottom-1 text-[9px] text-muted-foreground/40">
            {text.length}
          </span>
        )}
      </div>
      <Button
        size="icon"
        onClick={handleSend}
        disabled={disabled || !text.trim()}
        className="shrink-0 h-10 w-10 rounded-lg bg-[#E12726] hover:bg-[#C42120] transition-colors shadow-sm"
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}
