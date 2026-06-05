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
import { ChatPanel } from './ChatPanel';

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
    ? breakdownByDimension(periodo, diretoria, 'especialidade', tipoFiltro)
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

          {/* Sidebar — Chat */}
          <aside className="hidden lg:block lg:w-72 lg:shrink-0">
            <div className="sticky top-[72px] h-[calc(100vh-96px)]">
              <ChatPanel />
            </div>
          </aside>
        </div>
      </div>
    </FilterProvider>
  );
}
