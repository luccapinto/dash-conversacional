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

function deriveSeleção(periodo: Periodo): { year: '2023' | '2024'; month: string } {
  if (periodo === '2023') return { year: '2023', month: 'all' };
  if (periodo === '12m' || periodo === 'q1' || periodo === 'q2' || periodo === 'q3' || periodo === 'q4' || periodo === '6m' || periodo === '3m') {
    return { year: '2024', month: 'all' };
  }
  const m = /^(2023|2024)-(\d{2})$/.exec(periodo);
  if (m) return { year: m[1] as '2023' | '2024', month: m[2] };
  return { year: '2024', month: 'all' };
}

interface FilterBarProps {
  tipo: TipoDesligamento | 'todos';
  onTipoChange: (tipo: TipoDesligamento | 'todos') => void;
}

export function FilterBar({ tipo, onTipoChange }: FilterBarProps) {
  const { periodo, diretoria, setPeriodo, setDiretoria } = useFilter();
  const { year, month } = deriveSeleção(periodo);

  function selectYear(y: '2023' | '2024') {
    setPeriodo(y === '2024' ? '12m' : '2023');
  }

  function selectMonth(m: string) {
    const p = m === 'all' ? (year === '2024' ? '12m' : '2023') : (`${year}-${m}` as Periodo);
    setPeriodo(p);
  }

  return (
    <div className="flex flex-wrap items-start gap-3">
      {/* Período — hierarquia Ano > Mês */}
      <div className="flex flex-col gap-1.5">
        {/* Year tabs */}
        <div
          className="flex items-center rounded-lg overflow-hidden self-start"
          style={{ border: '1px solid var(--color-border)' }}
          role="group"
          aria-label="Ano"
        >
          {(['2023', '2024'] as const).map((y) => (
            <button
              key={y}
              onClick={() => selectYear(y)}
              className="px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{
                backgroundColor: year === y ? 'var(--color-accent)' : 'transparent',
                color: year === y ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
                borderRight: y === '2023' ? '1px solid var(--color-border)' : undefined,
              }}
            >
              {y}
            </button>
          ))}
        </div>

        {/* Month grid */}
        <div
          className="flex items-center rounded-lg overflow-hidden"
          style={{ border: '1px solid var(--color-border)' }}
          role="group"
          aria-label="Mês"
        >
          <button
            onClick={() => selectMonth('all')}
            className="px-2.5 py-1.5 text-xs font-medium transition-colors"
            style={{
              backgroundColor: month === 'all' ? 'var(--color-surface-raised)' : 'transparent',
              color: month === 'all' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              borderRight: '1px solid var(--color-border)',
            }}
          >
            Ano
          </button>
          {MESES.map((m, i) => (
            <button
              key={m.value}
              onClick={() => selectMonth(m.value)}
              className="px-2 py-1.5 text-xs font-medium transition-colors"
              style={{
                backgroundColor: month === m.value ? 'var(--color-accent)' : 'transparent',
                color: month === m.value ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
                borderRight: i < 11 ? '1px solid var(--color-border)' : undefined,
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Diretoria */}
      <select
        value={diretoria}
        onChange={(e) => setDiretoria(e.target.value as Diretoria)}
        className="rounded-lg px-3 py-1.5 text-xs font-medium outline-none self-start"
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
        className="flex items-center rounded-lg overflow-hidden self-start"
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
