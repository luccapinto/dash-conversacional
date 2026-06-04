'use client';

import { createContext, useContext, useState } from 'react';
import type { Periodo, Diretoria } from '@/lib/types';

interface FilterState {
  periodo: Periodo;
  diretoria: Diretoria;
  setPeriodo: (p: Periodo) => void;
  setDiretoria: (d: Diretoria) => void;
}

const FilterContext = createContext<FilterState | null>(null);

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [periodo, setPeriodo] = useState<Periodo>('12m');
  const [diretoria, setDiretoria] = useState<Diretoria>('Geral');

  return (
    <FilterContext.Provider value={{ periodo, diretoria, setPeriodo, setDiretoria }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilter(): FilterState {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilter must be used within FilterProvider');
  return ctx;
}
