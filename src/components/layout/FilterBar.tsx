import { useRef, useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useFilters } from '@/hooks/useFilters';
import { useLanguage } from '@/hooks/useLanguage';
import { BUSINESS_GROUPS, GEOGRAPHIES, QUARTERS, TIME_GRANULARITIES, getPeriodsForGranularity, periodLabel } from '@/data/constants';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import type { TimeGranularity } from '@/types';
import { ChevronDown, Check } from 'lucide-react';

const timeLabels: Record<string, Record<TimeGranularity, string>> = {
  en: { daily: 'Daily', monthly: 'Monthly', quarterly: 'Quarterly' },
  zh: { daily: '按日', monthly: '按月', quarterly: '按季度' },
};

const periodTypeLabels: Record<string, Record<TimeGranularity, string>> = {
  en: { quarterly: 'QUARTER', monthly: 'MONTH', daily: 'DAY' },
  zh: { quarterly: '季度', monthly: '月份', daily: '日期' },
};

/* ------------------------------------------------------------------ */
/*  Generic multi-select dropdown                                      */
/* ------------------------------------------------------------------ */
function MultiSelectDropdown<T extends string>({
  label,
  allLabel,
  items,
  selected,
  allItems,
  onChange,
}: {
  label: string;
  allLabel: string;
  items: readonly T[];
  selected: T[];
  allItems: readonly T[];
  onChange: (v: T[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const isAll = selected.length === allItems.length;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggleAll = useCallback(() => {
    // Toggle: all selected → clear all; otherwise → select all
    onChange(isAll ? [] : [...allItems]);
  }, [isAll, allItems, onChange]);

  const toggleItem = useCallback(
    (item: T) => {
      if (selected.includes(item)) {
        // Allow deselecting even the last item (empty = no filter)
        onChange(selected.filter((s) => s !== item));
      } else {
        onChange([...selected, item]);
      }
    },
    [selected, onChange],
  );

  const isNone = selected.length === 0;

  const displayText = isAll ? allLabel : isNone ? '—' : selected.length <= 2 ? selected.join(', ') : `${selected.length} selected`;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-input bg-background text-xs hover:bg-muted transition-colors min-w-[100px]"
        >
          <span className="truncate">{displayText}</span>
          <ChevronDown className={`h-3.5 w-3.5 opacity-50 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="absolute top-full left-0 mt-1 z-50 min-w-[160px] rounded-md border border-border bg-white shadow-lg py-1 animate-in fade-in-0 zoom-in-95">
            <button
              onClick={toggleAll}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted transition-colors text-left"
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded border ${isAll ? 'bg-lenovo-dark border-lenovo-dark text-white' : 'border-input'}`}>
                {isAll && <Check className="h-3 w-3" />}
              </span>
              <span className="font-medium">{allLabel}</span>
            </button>
            <div className="h-px bg-border mx-2 my-1" />
            {items.map((item) => {
              const checked = selected.includes(item);
              return (
                <button
                  key={item}
                  onClick={() => toggleItem(item)}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted transition-colors text-left"
                >
                  <span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? 'bg-lenovo-dark border-lenovo-dark text-white' : 'border-input'}`}>
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  <span>{item}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FilterBar                                                          */
/* ------------------------------------------------------------------ */
export function FilterBar() {
  const { filters, setTimeGranularity, setSelectedBGs, setSelectedGeos, setQuarter } = useFilters();
  const { language, t } = useLanguage();
  const location = useLocation();

  // Opening page: hide time granularity, always quarterly
  const isOpening = location.pathname === '/';

  const periods = isOpening ? [...QUARTERS] : getPeriodsForGranularity(filters.timeGranularity);
  const periodTypeLabel = isOpening
    ? periodTypeLabels[language].quarterly
    : periodTypeLabels[language][filters.timeGranularity];
  const currentPeriod = isOpening
    ? (QUARTERS.includes(filters.quarter) ? filters.quarter : QUARTERS[QUARTERS.length - 1])
    : filters.quarter;

  return (
    <div className="bg-white border-b border-border px-6 py-2.5 flex items-center gap-6 shrink-0 flex-wrap">
      {/* Time granularity — hidden on opening page */}
      {!isOpening && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{t.filterTime}</span>
          <Select
            value={filters.timeGranularity}
            onValueChange={(v) => { if (v) setTimeGranularity(v as TimeGranularity); }}
          >
            <SelectTrigger className="w-28 h-8 text-xs">
              <span>{timeLabels[language][filters.timeGranularity]}</span>
            </SelectTrigger>
            <SelectContent>
              {TIME_GRANULARITIES.map((tg) => (
                <SelectItem key={tg} value={tg} className="text-xs">
                  {timeLabels[language][tg]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Period (quarterly only on opening, dynamic on other pages) */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{periodTypeLabel}</span>
        <Select value={currentPeriod} onValueChange={(v) => { if (v) setQuarter(v); }}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <span className="truncate">{periodLabel(currentPeriod)}</span>
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {periods.map((p) => (
              <SelectItem key={p} value={p} className="text-xs">
                {periodLabel(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* BG multi-select dropdown */}
      <MultiSelectDropdown
        label={t.filterBG}
        allLabel={t.filterAll}
        items={BUSINESS_GROUPS}
        allItems={BUSINESS_GROUPS}
        selected={filters.selectedBGs}
        onChange={setSelectedBGs}
      />

      {/* Geo multi-select dropdown */}
      <MultiSelectDropdown
        label={t.filterGeo}
        allLabel={t.filterAll}
        items={GEOGRAPHIES}
        allItems={GEOGRAPHIES}
        selected={filters.selectedGeos}
        onChange={setSelectedGeos}
      />
    </div>
  );
}
