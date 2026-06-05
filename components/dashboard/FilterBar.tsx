'use client';

import { useFilter } from '@/lib/context/FilterContext';
import type { Periodo, Diretoria, TipoDesligamento } from '@/lib/types';

const MES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const MESES = MES_LABELS.map((label, i) => ({
  label,
  value: String(i + 1).padStart(2, '0'),
}));

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

function periodoToSelectValue(periodo: Periodo): string {
  if (periodo === '2023') return '2023';
  if (/^2023-\d{2}$/.test(periodo)) return periodo;
  if (/^2024-\d{2}$/.test(periodo)) return periodo;
  return '12m'; // '12m', '6m', '3m', 'q1'-'q4' all show as "2024 Ano inteiro"
}

interface FilterBarProps {
  tipo: TipoDesligamento | 'todos';
  onTipoChange: (tipo: TipoDesligamento | 'todos') => void;
}

export function FilterBar({ tipo, onTipoChange }: FilterBarProps) {
  const { periodo, diretoria, setPeriodo, setDiretoria } = useFilter();
  const selectValue = periodoToSelectValue(periodo);

  const selectStyle = {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)',
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Período — dropdown hierárquico Ano > Mês */}
      <select
        value={selectValue}
        onChange={(e) => setPeriodo(e.target.value as Periodo)}
        className="rounded-lg px-3 py-1.5 text-xs font-medium outline-none"
        style={selectStyle}
        aria-label="Período"
      >
        <optgroup label="2024">
          <option value="12m">Ano inteiro</option>
          {MESES.map((m) => (
            <option key={m.value} value={`2024-${m.value}`}>
              {m.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="2023">
          <option value="2023">Ano inteiro</option>
          {MESES.map((m) => (
            <option key={m.value} value={`2023-${m.value}`}>
              {m.label}
            </option>
          ))}
        </optgroup>
      </select>

      {/* Diretoria */}
      <select
        value={diretoria}
        onChange={(e) => setDiretoria(e.target.value as Diretoria)}
        className="rounded-lg px-3 py-1.5 text-xs font-medium outline-none"
        style={selectStyle}
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
