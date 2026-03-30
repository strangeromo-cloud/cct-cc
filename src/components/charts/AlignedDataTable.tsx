import type { ReactNode } from 'react';

export interface TableRow {
  label: string;
  /** One cell per column (must match columns.length) */
  cells: ReactNode[];
  labelClass?: string;
  cellClass?: string;
}

interface AlignedDataTableProps {
  /** Column headers — must match chart x-axis categories */
  columns: string[];
  /** Data rows */
  rows: TableRow[];
  /** Left margin in px — must match chart grid.left */
  gridLeft?: number;
  /** Right margin in px — must match chart grid.right */
  gridRight?: number;
}

/**
 * A data table whose columns are pixel-aligned with an ECharts bar/line chart above it.
 *
 * Usage: place immediately below a `<BaseChart>` and pass the same
 * `gridLeft` / `gridRight` values used in the chart's `grid` option.
 */
export function AlignedDataTable({
  columns,
  rows,
  gridLeft = 60,
  gridRight = 20,
}: AlignedDataTableProps) {
  return (
    <div className="mt-1">
      {/* Header row */}
      <div className="flex items-center text-xs border-b border-border/50">
        <div className="shrink-0 py-1.5" style={{ width: gridLeft }} />
        <div className="flex-1 flex" style={{ marginRight: gridRight }}>
          {columns.map((col, i) => (
            <div key={i} className="flex-1 text-center py-1.5 text-muted-foreground font-medium text-[11px]">
              {col}
            </div>
          ))}
        </div>
      </div>

      {/* Data rows */}
      {rows.map((row, ri) => (
        <div
          key={ri}
          className={`flex items-center text-xs ${ri < rows.length - 1 ? 'border-b border-border/50' : ''}`}
        >
          <div
            className={`shrink-0 py-1.5 font-medium ${row.labelClass ?? 'text-muted-foreground'}`}
            style={{ width: gridLeft }}
          >
            {row.label}
          </div>
          <div className="flex-1 flex" style={{ marginRight: gridRight }}>
            {row.cells.map((cell, ci) => (
              <div key={ci} className={`flex-1 text-center py-1.5 tabular-nums ${row.cellClass ?? ''}`}>
                {cell}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
