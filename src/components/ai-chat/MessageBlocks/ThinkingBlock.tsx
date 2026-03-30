import { useState, useEffect } from 'react';
import { Brain, ChevronDown, ChevronUp, Check, Loader2 } from 'lucide-react';

interface ThinkingBlockProps {
  steps: string[];
  complete?: boolean;
}

export function ThinkingBlock({ steps, complete = false }: ThinkingBlockProps) {
  const [userToggled, setUserToggled] = useState(false);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (!userToggled) {
      setExpanded(!complete);
    }
  }, [complete, userToggled]);

  const handleToggle = () => {
    setUserToggled(true);
    setExpanded(!expanded);
  };

  if (steps.length === 0 && !complete) {
    return (
      <div className="px-1 py-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 text-muted-foreground/60 animate-spin" />
        <span>正在思考...</span>
      </div>
    );
  }

  return (
    <div className="overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-2 px-1 py-1.5 text-[11px] text-muted-foreground hover:text-foreground/70 transition-colors"
      >
        {complete ? (
          <Brain className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0 animate-spin" />
        )}
        <span>
          {complete ? `思考过程（${steps.length} 步）` : `正在思考...（${steps.length} 步）`}
        </span>
        {complete && <Check className="h-3 w-3 text-muted-foreground/50 ml-0.5" />}
        <div className="ml-auto">
          {expanded
            ? <ChevronUp className="h-3 w-3 text-muted-foreground/50" />
            : <ChevronDown className="h-3 w-3 text-muted-foreground/50" />
          }
        </div>
      </button>

      {/* Steps list */}
      {expanded && (
        <div className="px-1 pb-2 pt-0.5">
          <ol className="space-y-1">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-[10px] text-muted-foreground/70 leading-relaxed">
                <span className="shrink-0 w-4 h-4 rounded-full bg-muted/60 text-muted-foreground/60 flex items-center justify-center text-[8px] font-bold mt-0.5">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
