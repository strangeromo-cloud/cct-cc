import { useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';

interface TableBlockProps {
  headers: string[];
  rows: string[][];
  title?: string;
}

const COLLAPSED_ROWS = 5;

export function TableBlock({ headers, rows, title }: TableBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const canCollapse = rows.length > COLLAPSED_ROWS;
  const visibleRows = canCollapse && !expanded ? rows.slice(0, COLLAPSED_ROWS) : rows;

  const handleCopyTable = () => {
    const tsv = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
    navigator.clipboard.writeText(tsv).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="bg-white rounded-lg border border-border/30 overflow-hidden">
      {/* Header with title and copy */}
      {(title || rows.length > 0) && (
        <div className="flex items-center justify-between px-2.5 pt-2 pb-1">
          {title && (
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
          )}
          <button
            onClick={handleCopyTable}
            className="flex items-center gap-0.5 text-[9px] text-muted-foreground/60 hover:text-muted-foreground transition-colors ml-auto"
          >
            {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border/30 bg-muted/30">
              {headers.map((h, i) => (
                <th key={i} className="px-2.5 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, i) => (
              <tr key={i} className="border-b border-border/10 last:border-0 hover:bg-muted/20 transition-colors">
                {row.map((cell, j) => {
                  const isPositive = cell.startsWith('+');
                  const isNegative = cell.startsWith('-') && !cell.startsWith('-$');
                  const isDanger = cell.includes('high') || cell.includes('danger') || cell.includes('●●●');
                  return (
                    <td
                      key={j}
                      className={`px-2.5 py-1.5 whitespace-nowrap ${
                        isPositive ? 'text-emerald-600 font-medium' :
                        isNegative ? 'text-red-500 font-medium' :
                        isDanger ? 'text-red-500' : ''
                      } ${j === 0 ? 'font-medium' : ''}`}
                    >
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Expand/collapse footer */}
      {canCollapse && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors border-t border-border/20"
        >
          {expanded ? (
            <><ChevronUp className="h-3 w-3" /> 收起</>
          ) : (
            <><ChevronDown className="h-3 w-3" /> 查看全部 {rows.length} 行</>
          )}
        </button>
      )}
    </div>
  );
}
