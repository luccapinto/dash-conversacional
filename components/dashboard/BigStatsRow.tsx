/**
 * BigStatsRow — 4 big numbers no topo do dashboard.
 * Server Component: recebe dados pré-calculados via props.
 */

import { BigStat } from '@/components/ui/BigStat';
import { Card } from '@/components/ui/Card';
import type { ResultadoTurnover, ResultadoTendencia, ResultadoProjecao } from '@/lib/types';

interface BigStatsRowProps {
  turnover: ResultadoTurnover;
  tendencia: ResultadoTendencia;
  projecao: ResultadoProjecao;
}

function fmt(taxa: number): string {
  return `${(taxa * 100).toFixed(1)}%`;
}

export function BigStatsRow({ turnover, tendencia, projecao }: BigStatsRowProps) {
  const momPP =
    tendencia.variacaoMoM !== null
      ? parseFloat((tendencia.variacaoMoM * 100).toFixed(2))
      : undefined;

  const yoyPP =
    tendencia.variacaoYoY !== null
      ? parseFloat((tendencia.variacaoYoY * 100).toFixed(2))
      : undefined;

  const deslVariacao =
    tendencia.variacaoMoM !== null
      ? Math.round(tendencia.variacaoMoM * turnover.headcountMedio)
      : undefined;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {/* 1. Turnover do Período */}
      <Card>
        <BigStat
          label="Turnover do Período"
          value={fmt(turnover.taxa)}
          status={turnover.status}
          statusLabel={turnover.statusLabel}
          momChange={momPP}
          yoyChange={yoyPP}
        />
      </Card>

      {/* 2. Desligamentos */}
      <Card>
        <BigStat
          label="Desligamentos"
          value={String(turnover.desligamentos)}
          momChange={deslVariacao !== undefined ? deslVariacao : undefined}
        />
      </Card>

      {/* 3. Headcount */}
      <Card>
        <BigStat
          label="Headcount Médio"
          value={String(turnover.headcountMedio)}
        />
      </Card>

      {/* 4. Projeção 3m */}
      <Card>
        <BigStat
          label="Projeção 3m"
          value={fmt(projecao.taxaProjetadaProximo3Meses)}
          statusLabel="Jan–Mar 2025"
          status="neutral"
        />
      </Card>
    </div>
  );
}
