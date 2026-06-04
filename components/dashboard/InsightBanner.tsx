'use client';

import type { InsightPreGerado } from '@/lib/types';

interface InsightBannerProps {
  insight: InsightPreGerado | null;
  loading: boolean;
}

export function InsightBanner({ insight, loading }: InsightBannerProps) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl px-4 py-3"
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        minHeight: '52px',
      }}
    >
      {/* Ícone */}
      <div
        className={`mt-0.5 h-4 w-4 shrink-0 rounded-full ${loading ? 'animate-pulse' : ''}`}
        style={{ backgroundColor: 'var(--color-accent-muted)' }}
      >
        {!loading && (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        )}
      </div>

      {/* Conteúdo */}
      <div className="flex flex-1 flex-col gap-1.5 min-w-0">
        {loading ? (
          <>
            <div
              className="h-3 w-2/3 animate-pulse rounded"
              style={{ backgroundColor: 'var(--color-surface-raised)' }}
            />
            <div
              className="h-3 w-2/5 animate-pulse rounded"
              style={{ backgroundColor: 'var(--color-surface-raised)' }}
            />
          </>
        ) : insight ? (
          <p
            className="text-sm leading-relaxed"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {insight.manchete}
          </p>
        ) : null}
      </div>

      {/* Badge de status */}
      <span
        className="shrink-0 text-xs mt-0.5"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {loading ? 'IA analisando...' : 'Análise IA'}
      </span>
    </div>
  );
}
