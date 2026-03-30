import { Database } from 'lucide-react';

interface SourceTagProps {
  sources: string[];
}

export function SourceTag({ sources }: SourceTagProps) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 pt-1.5 mt-1 border-t border-border/10">
      <Database className="h-2.5 w-2.5 shrink-0" />
      <span className="leading-none">数据来源：{sources.join(' · ')}</span>
    </div>
  );
}
