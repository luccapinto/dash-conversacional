'use client';

/**
 * InsightBanner — placeholder shimmer para a manchete de IA.
 * M6 substituirá este componente por uma manchete pré-gerada real.
 */
export function InsightBanner() {
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4 py-3"
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
      }}
    >
      {/* Ícone shimmer */}
      <div
        className="h-4 w-4 shrink-0 animate-pulse rounded-full"
        style={{ backgroundColor: 'var(--color-accent-muted)' }}
      />
      {/* Texto shimmer */}
      <div className="flex flex-1 flex-col gap-1.5">
        <div
          className="h-3 w-2/3 animate-pulse rounded"
          style={{ backgroundColor: 'var(--color-surface-raised)' }}
        />
        <div
          className="h-3 w-1/3 animate-pulse rounded"
          style={{ backgroundColor: 'var(--color-surface-raised)' }}
        />
      </div>
      <span
        className="shrink-0 text-xs"
        style={{ color: 'var(--color-text-muted)' }}
      >
        IA analisando...
      </span>
    </div>
  );
}
