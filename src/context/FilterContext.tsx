import { createContext, useCallback, useState, type ReactNode } from 'react';
import type { FilterState, TimeGranularity, BusinessGroup, Geography } from '@/types';
import { BUSINESS_GROUPS, GEOGRAPHIES, CURRENT_QUARTER, getDefaultPeriod } from '@/data/constants';

export interface FilterContextValue {
  filters: FilterState;
  setTimeGranularity: (g: TimeGranularity) => void;
  setSelectedBGs: (bgs: BusinessGroup[]) => void;
  setSelectedGeos: (geos: Geography[]) => void;
  setQuarter: (q: string) => void;
}

const defaultFilters: FilterState = {
  timeGranularity: 'quarterly',
  selectedBGs: [...BUSINESS_GROUPS],
  selectedGeos: [...GEOGRAPHIES],
  quarter: CURRENT_QUARTER,
};

export const FilterContext = createContext<FilterContextValue>({
  filters: defaultFilters,
  setTimeGranularity: () => {},
  setSelectedBGs: () => {},
  setSelectedGeos: () => {},
  setQuarter: () => {},
});

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  const setTimeGranularity = useCallback((g: TimeGranularity) => {
    setFilters((prev) => ({
      ...prev,
      timeGranularity: g,
      // Auto-switch to the latest period for the new granularity
      quarter: getDefaultPeriod(g),
    }));
  }, []);

  const setSelectedBGs = useCallback((bgs: BusinessGroup[]) => {
    setFilters((prev) => ({ ...prev, selectedBGs: bgs }));
  }, []);

  const setSelectedGeos = useCallback((geos: Geography[]) => {
    setFilters((prev) => ({ ...prev, selectedGeos: geos }));
  }, []);

  const setQuarter = useCallback((q: string) => {
    setFilters((prev) => ({ ...prev, quarter: q }));
  }, []);

  return (
    <FilterContext.Provider value={{ filters, setTimeGranularity, setSelectedBGs, setSelectedGeos, setQuarter }}>
      {children}
    </FilterContext.Provider>
  );
}
