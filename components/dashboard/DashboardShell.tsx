'use client';

/**
 * DashboardShell — layout principal do dashboard executivo.
 *
 * Client Component: gerencia estado de filtros (periodo, diretoria, tipo)
 * via FilterContext + estado local de tipo de desligamento.
 * Chama as funções de cálculo para derivar dados sempre que os filtros mudam.
 * Os dados calculados são passados como props serializáveis para os
 * componentes de exibição.
 */

import { useState } from 'react';
import { FilterProvider, useFilter } from '@/lib/context/FilterContext';
import { useInsight } from '@/lib/hooks/useInsight';
import {
  getTurnoverRate,
  getTrend,
  getProjection,
  rankDiretoriasByTurnover,
  breakdownByDimension,
  getHeadcount,
  META_TURNOVER_MENSAL,
} from '@/lib/calculations';
import type { TipoDesligamento } from '@/lib/types';
import { FilterBar } from './FilterBar';
import { InsightBanner } from './InsightBanner';
import { BigStatsRow } from './BigStatsRow';
import { TrendChart } from './TrendChart';
import { RankingChart } from './RankingChart';

// ── Chat placeholder (M6) ─────────────────────────────────────────────────────
function ChatPlaceholder() {
  return (
    <div
      className="flex flex-col gap-3 rounded-xl p-5 h-full min-h-[400px]"
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="h-2 w-2 rounded-full animate-pulse"
          style={{ backgroundColor: 'var(--color-accent)' }}
        />
        <span
          className="text-xs font-medium uppercase tracking-wide"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Chat Analytics
        </span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: 'var(--color-accent-muted)' }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <p
          className="text-sm font-medium"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Chat Conversacional
        </p>
        <p
          className="text-xs max-w-[180px]"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Disponível na M6 — perguntas em linguagem natural sobre os dados
        </p>
      </div>
    </div>
  );
}

// ── Inner dashboard (uses FilterContext) ──────────────────────────────────────
function DashboardContent() {
  const { periodo, diretoria } = useFilter();
  const [tipo, setTipo] = useState<TipoDesligamento | 'todos'>('todos');
  const { insight, loading: insightLoading } = useInsight(periodo, diretoria);

  const tipoFiltro = tipo !== 'todos' ? tipo : undefined;

  // Cálculos via funções da camada semântica
  const turnover = getTurnoverRate(periodo, diretoria, tipoFiltro);
  const tendencia = getTrend(diretoria, periodo, tipoFiltro);
  const projecao = getProjection(diretoria, tipoFiltro);
  const headcount = getHeadcount(periodo, diretoria);

  // Gráfico 2: ranking geral ou breakdown por diretoria
  const isGeralView = diretoria === 'Geral';
  const rankingData = isGeralView
    ? rankDiretoriasByTurnover(periodo, tipoFiltro)
    : null;
  const breakdownData = !isGeralView
    ? breakdownByDimension(periodo, diretoria, 'posicionamentoFaixa', tipoFiltro)
    : null;

  // Substitui headcountMedio do turnover pelo valor mais preciso do getHeadcount
  const turnoverComHC = {
    ...turnover,
    headcountMedio: headcount.headcountFim || turnover.headcountMedio,
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros */}
      <FilterBar tipo={tipo} onTipoChange={setTipo} />

      {/* Banner de manchete IA */}
      <InsightBanner insight={insight} loading={insightLoading} />

      {/* Big Numbers */}
      <BigStatsRow
        turnover={turnoverComHC}
        tendencia={tendencia}
        projecao={projecao}
      />

      {/* Gráficos */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TrendChart
          tendencia={tendencia}
          projecao={projecao}
          meta={META_TURNOVER_MENSAL}
          narrativeTitle={insight?.titulos.graficoTendencia}
        />

        {isGeralView && rankingData ? (
          <RankingChart
            mode="ranking"
            data={rankingData}
            narrativeTitle={insight?.titulos.graficoRanking}
          />
        ) : breakdownData ? (
          <RankingChart
            mode="breakdown"
            data={breakdownData}
            narrativeTitle={insight?.titulos.graficoRanking}
          />
        ) : null}
      </div>
    </div>
  );
}

// ── Shell público ─────────────────────────────────────────────────────────────
export function DashboardShell() {
  return (
    <FilterProvider>
      <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--color-canvas)' }}>
        {/* Header */}
        <header
          className="sticky top-0 z-10 flex items-center justify-between px-6 py-4"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <div className="flex flex-col">
            <span
              className="text-base font-bold tracking-tight"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Verta S.A.
            </span>
            <span
              className="text-xs"
              style={{ color: 'var(--color-text-muted)' }}
            >
              People Analytics
            </span>
          </div>

          {/* Indicador de status */}
          <div
            className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
            style={{
              backgroundColor: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-muted)',
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: 'var(--color-good)' }}
            />
            Dados atualizados · Dez 2024
          </div>
        </header>

        {/* Conteúdo principal */}
        <div className="flex flex-1 gap-4 p-6">
          {/* Dashboard area */}
          <main className="flex-1 min-w-0">
            <DashboardContent />
          </main>

          {/* Sidebar — Chat (M6 placeholder) */}
          <aside className="hidden xl:flex xl:w-80 xl:flex-col xl:shrink-0">
            <ChatPlaceholder />
          </aside>
        </div>
      </div>
    </FilterProvider>
  );
}
