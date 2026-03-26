import { CircleHelp } from 'lucide-react';
import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface InfoTooltipProps {
  /** Short definition text */
  definition: string;
  /** Optional formula string, e.g. "Revenue - COGS" */
  formula?: string;
}

/**
 * A small (?) icon that shows a tooltip on hover with a metric definition
 * and optional formula. Uses Portal to escape overflow:hidden containers.
 */
export function InfoTooltip({ definition, formula }: InfoTooltipProps) {
  const [show, setShow] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0, position: 'top' as 'top' | 'bottom' });
  const triggerRef = useRef<HTMLSpanElement>(null);

  const handleEnter = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const showBelow = rect.top < 100;
    setCoords({
      x: rect.left + rect.width / 2,
      y: showBelow ? rect.bottom + 8 : rect.top - 8,
      position: showBelow ? 'bottom' : 'top',
    });
    setShow(true);
  }, []);

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex items-center ml-1.5 cursor-help"
        onMouseEnter={handleEnter}
        onMouseLeave={() => setShow(false)}
      >
        <CircleHelp className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-muted-foreground transition-colors" />
      </span>
      {show && createPortal(
        <span
          className="fixed z-[9999] w-64 px-3 py-2 rounded-md bg-foreground text-background text-xs leading-relaxed shadow-lg pointer-events-none"
          style={{
            left: coords.x,
            top: coords.position === 'top' ? undefined : coords.y,
            bottom: coords.position === 'top' ? `calc(100vh - ${coords.y}px)` : undefined,
            transform: 'translateX(-50%)',
          }}
        >
          <span className="block">{definition}</span>
          {formula && (
            <span className="block mt-1 pt-1 border-t border-background/20 font-mono text-[10px] text-background/80">
              {formula}
            </span>
          )}
          {/* Arrow */}
          <span
            className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-foreground rotate-45 ${
              coords.position === 'top' ? '-bottom-1' : '-top-1'
            }`}
          />
        </span>,
        document.body,
      )}
    </>
  );
}
