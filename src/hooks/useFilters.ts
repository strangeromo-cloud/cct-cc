import { useContext } from 'react';
import { FilterContext } from '@/context/FilterContext';

export function useFilters() {
  return useContext(FilterContext);
}
