'use client';

import { useState } from 'react';
import { FilterProvider, useFilter } from '@/lib/context/FilterContext';
import { useInsight } from '@/lib/hooks/useInsight';
import {
  getTrend,
  getProjection,
  rankDiretoriasByTurnover,
  breakdownByDimension,
  META_TURNOVER_MENSAL,
} from '@/lib/calculations';
import type { TipoDesligamento } from '@/lib/types';
import { FilterBar } from './FilterBar';
import { InsightBanner } from './InsightBanner';
import { BigStatsRow } from './BigStatsRow';
import { TrendChart } from './TrendChart';
import { RankingChart } from './RankingChart';
import { ChatPanel } from './ChatPanel';

// ── Inner dashboard (uses FilterContext) ──────────────────────────────────────
function DashboardContent() {
  const { periodo, diretoria } = useFilter();
  const [tipo, setTipo] = useState<TipoDesligamento | 'todos'>('todos');
  const { insight, loading: insightLoading } = useInsight(periodo, diretoria);

  const tipoFiltro = tipo !== 'todos' ? tipo : undefined;

  const tendencia = getTrend(diretoria, periodo, tipoFiltro);
  const projecao  = getProjection(diretoria, tipoFiltro);

  const isGeralView = diretoria === 'Geral';
  const rankingData = isGeralView
    ? rankDiretoriasByTurnover(periodo, tipoFiltro)
    : null;
  const breakdownData = !isGeralView
    ? breakdownByDimension(periodo, diretoria, 'especialidade', tipoFiltro)
    : null;

  return (
    <div className="flex flex-col gap-4">
      <FilterBar tipo={tipo} onTipoChange={setTipo} />
      <InsightBanner insight={insight} loading={insightLoading} />
      <BigStatsRow tendencia={tendencia} projecao={projecao} periodo={periodo} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TrendChart
          tendencia={tendencia}
          projecao={projecao}
          meta={META_TURNOVER_MENSAL}
          narrativeTitle={insight?.titulos.graficoTendencia}
          periodo={periodo}
        />
        {isGeralView && rankingData ? (
          <RankingChart mode="ranking" data={rankingData} periodo={periodo} narrativeTitle={insight?.titulos.graficoRanking} />
        ) : breakdownData ? (
          <RankingChart mode="breakdown" data={breakdownData} periodo={periodo} narrativeTitle={insight?.titulos.graficoRanking} />
        ) : null}
      </div>
    </div>
  );
}

// ── Shell público ─────────────────────────────────────────────────────────────
export function DashboardShell() {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <FilterProvider>
      <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--color-canvas)' }}>

        {/* Header */}
        <header
          className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4"
          style={{ backgroundColor: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}
        >
          <div className="flex flex-col">
            <span className="text-base font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
              Verta S.A.
            </span>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              People Analytics
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Status pill */}
            <div
              className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
              style={{ backgroundColor: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--color-good)' }} />
              <span className="hidden sm:inline">Dados atualizados · </span>Dez 2024
            </div>

            {/* Chat button — visible on mobile only */}
            <button
              onClick={() => setChatOpen(true)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold lg:hidden"
              style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
              aria-label="Abrir chat"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Chat IA
            </button>
          </div>
        </header>

        {/* Conteúdo principal */}
        <div className="flex flex-1 gap-4 p-3 sm:p-6">
          <main className="flex-1 min-w-0">
            <DashboardContent />
          </main>

          {/* Sidebar chat — desktop only */}
          <aside className="hidden lg:block lg:w-72 lg:shrink-0">
            <div className="sticky top-[68px] h-[calc(100vh-92px)]">
              <ChatPanel />
            </div>
          </aside>
        </div>

        {/* Mobile chat drawer ──────────────────────────────────────────────── */}
        {chatOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40 lg:hidden"
              style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
              onClick={() => setChatOpen(false)}
            />

            {/* Bottom sheet */}
            <div
              className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl lg:hidden"
              style={{
                height: '88vh',
                backgroundColor: 'var(--color-surface)',
                borderTop: '1px solid var(--color-border)',
              }}
            >
              {/* Drag handle + title + close */}
              <div
                className="flex shrink-0 items-center justify-between px-4 py-3"
                style={{ borderBottom: '1px solid var(--color-border)' }}
              >
                <div className="flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    Assistente IA
                  </span>
                </div>
                <button
                  onClick={() => setChatOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-full"
                  style={{ backgroundColor: 'var(--color-surface-raised)', color: 'var(--color-text-muted)' }}
                  aria-label="Fechar chat"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* ChatPanel fills the rest */}
              <div className="flex-1 overflow-hidden">
                <ChatPanel />
              </div>
            </div>
          </>
        )}
      </div>
    </FilterProvider>
  );
}
