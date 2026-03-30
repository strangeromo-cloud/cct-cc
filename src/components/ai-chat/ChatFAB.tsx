/**
 * ChatFAB — Floating Action Button fixed at bottom-right
 * Replaces the header button as the primary AI assistant entry point.
 * Shows unread indicator, tooltip, pulse animation on first load.
 */
import { useContext, useState, useEffect } from 'react';
import { ChatContext } from '@/context/ChatContext';
import { useLanguage } from '@/hooks/useLanguage';
import { Bot, X, Sparkles } from 'lucide-react';

export function ChatFAB() {
  const { isOpen, setIsOpen, messages } = useContext(ChatContext);
  const { language } = useLanguage();
  const [hasNewReply, setHasNewReply] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  // Show unread dot when a new assistant message arrives while panel is closed
  useEffect(() => {
    if (!isOpen && messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last.role === 'assistant') {
        setHasNewReply(true);
      }
    }
  }, [messages, isOpen]);

  // Clear unread when panel opens
  useEffect(() => {
    if (isOpen) setHasNewReply(false);
  }, [isOpen]);

  const handleClick = () => {
    setIsOpen(!isOpen);
    setHasNewReply(false);
  };

  const tooltipText = language === 'zh' ? 'CFO 智能助手' : 'CFO Assistant';

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {/* Tooltip — shown on hover when panel is closed */}
      {showTooltip && !isOpen && (
        <div className="bg-foreground text-white text-xs px-3 py-1.5 rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200 whitespace-nowrap mr-1">
          {tooltipText}
          <div className="absolute -bottom-1 right-5 w-2 h-2 bg-foreground rotate-45" />
        </div>
      )}

      {/* FAB button */}
      <button
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`
          relative group
          w-14 h-14 rounded-2xl
          flex items-center justify-center
          shadow-lg shadow-red-500/25
          transition-all duration-300 ease-out
          hover:scale-105 hover:shadow-xl hover:shadow-red-500/30
          active:scale-95
          ${isOpen
            ? 'bg-foreground rotate-0'
            : 'bg-[#E12726]'
          }
        `}
        aria-label={tooltipText}
      >
        {/* Icon transition */}
        <div className="relative">
          {isOpen ? (
            <X className="h-6 w-6 text-white transition-transform duration-200" />
          ) : (
            <div className="relative">
              <Bot className="h-6 w-6 text-white transition-transform duration-200 group-hover:scale-110" />
              <Sparkles className="absolute -top-1 -right-1.5 h-3 w-3 text-amber-300 opacity-80" />
            </div>
          )}
        </div>

        {/* Unread indicator */}
        {hasNewReply && !isOpen && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 border-2 border-white" />
          </span>
        )}

        {/* Message count badge */}
        {messages.length > 0 && !isOpen && !hasNewReply && (
          <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-foreground/80 text-white text-[9px] font-bold flex items-center justify-center border-2 border-white">
            {messages.filter(m => m.role === 'assistant').length}
          </span>
        )}
      </button>
    </div>
  );
}
