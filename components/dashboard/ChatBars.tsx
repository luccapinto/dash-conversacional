'use client';

/**
 * Gráfico de barras horizontais para as análises avançadas do chat
 * (drivers/lift, cohort, comparações, cross-breakdown). Mantém o estilo
 * compacto dos gráficos inline e formata o valor conforme a unidade.
 */

import type { BarItem } from '@/lib/types';

function fmt(value: number, unit: '%' | 'x' | 'n' | 'R$'): string {
  switch (unit) {
    case '%':   return `${value}%`;
    case 'x':   return `${value}×`;
    case 'R$':  return `R$ ${value.toLocaleString('pt-BR')}`;
    default:    return String(value);
  }
}

export function ChatBars({ title, unit, data }: { title: string; unit: '%' | 'x' | 'n' | 'R$'; data: BarItem[] }) {
  const max = Math.max(...data.map(d => Math.abs(d.value)), unit === 'x' ? 1 : 0.0001);

  return (
    <div className="p-3" style={{ backgroundColor: 'var(--color-surface)' }}>
      <p className="mb-2 text-[0.78rem] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>{title}</p>
      <div className="flex flex-col gap-2">
        {data.map((d, i) => {
          const pct = Math.max(2, (Math.abs(d.value) / max) * 100);
          const color = d.highlight ? 'var(--color-bad)' : 'var(--color-accent)';
          return (
            <div key={i} className="flex flex-col gap-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[0.78rem] font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{d.label}</span>
                <span className="text-[0.78rem] tabular-nums shrink-0" style={{ color, fontWeight: 600 }}>{fmt(d.value, unit)}</span>
              </div>
              <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-raised)' }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
              </div>
              {d.sub && <span className="text-[0.68rem]" style={{ color: 'var(--color-text-muted)' }}>{d.sub}</span>}
            </div>
          );
        })}
      </div>
      {unit === 'x' && (
        <p className="mt-2 text-[0.68rem]" style={{ color: 'var(--color-text-muted)' }}>
          Lift = quantas vezes o segmento sai acima do esperado pela população (1× = neutro).
        </p>
      )}
    </div>
  );
}
