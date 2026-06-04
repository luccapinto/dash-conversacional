'use client';

import { useFilter } from '@/lib/context/FilterContext';
import type { Periodo, Diretoria, TipoDesligamento } from '@/lib/types';

const PERIODOS: { value: Periodo; label: string }[] = [
  { value: '3m', label: '3m' },
  { value: '6m', label: '6m' },
  { value: '12m', label: '12m' },
  { value: 'q1', label: 'Q1' },
  { value: 'q2', label: 'Q2' },
  { value: 'q3', label: 'Q3' },
  { value: 'q4', label: 'Q4' },
];

const DIRETORIAS: { value: Diretoria; label: string }[] = [
  { value: 'Geral', label: 'Geral' },
  { value: 'Tecnologia', label: 'Tecnologia' },
  { value: 'Distribuição & Assessoria', label: 'Distrib. & Assessoria' },
  { value: 'Operações', label: 'Operações' },
  { value: 'Financeiro & Risco', label: 'Financeiro & Risco' },
  { value: 'Gente', label: 'Gente' },
  { value: 'Produtos & Plataforma', label: 'Produtos & Plataforma' },
];

const TIPOS: { value: TipoDesligamento | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'voluntário', label: 'Voluntário' },
  { value: 'involuntário', label: 'Involuntário' },
];

interface FilterBarProps {
  tipo: TipoDesligamento | 'todos';
  onTipoChange: (tipo: TipoDesligamento | 'todos') => void;
}

export function FilterBar({ tipo, onTipoChange }: FilterBarProps) {
  const { periodo, diretoria, setPeriodo, setDiretoria } = useFilter();

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Período */}
      <div
        className="flex items-center rounded-lg overflow-hidden"
        style={{ border: '1px solid var(--color-border)' }}
        role="group"
        aria-label="Período"
      >
        {PERIODOS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriodo(p.value)}
            className="px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              backgroundColor: periodo === p.value ? 'var(--color-accent)' : 'transparent',
              color: periodo === p.value ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
              borderRight: '1px solid var(--color-border)',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Diretoria */}
      <select
        value={diretoria}
        onChange={(e) => setDiretoria(e.target.value as Diretoria)}
        className="rounded-lg px-3 py-1.5 text-xs font-medium outline-none"
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-primary)',
        }}
        aria-label="Diretoria"
      >
        {DIRETORIAS.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>

      {/* Tipo de desligamento */}
      <div
        className="flex items-center rounded-lg overflow-hidden"
        style={{ border: '1px solid var(--color-border)' }}
        role="group"
        aria-label="Tipo de desligamento"
      >
        {TIPOS.map((t) => (
          <button
            key={t.value}
            onClick={() => onTipoChange(t.value)}
            className="px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              backgroundColor: tipo === t.value ? 'var(--color-surface-raised)' : 'transparent',
              color: tipo === t.value ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              borderRight: t.value !== 'involuntário' ? '1px solid var(--color-border)' : undefined,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
