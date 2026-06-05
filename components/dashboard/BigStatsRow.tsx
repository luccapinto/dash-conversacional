/**
 * BigStatsRow — dois cards de storytelling: Visão Mensal e Visão YTD.
 * Recebe dados pré-calculados via props (server-friendly, sem hooks).
 */

import { Card } from '@/components/ui/Card';
import type { ResultadoTurnover, ResultadoTendencia, ResultadoProjecao, PontoSerie } from '@/lib/types';

interface BigStatsRowProps {
  turnover: ResultadoTurnover;
  tendencia: ResultadoTendencia;
  projecao: ResultadoProjecao;
}

function pct(v: number) { return `${(v * 100).toFixed(2)}%`; }
function pp(v: number) {
  const sign = v >= 0 ? '+' : '';
  return `${sign}${(v * 100).toFixed(1)}pp`;
}

interface DeltaRowProps {
  label: string;
  delta: number | null;
  benchmark: number | null;
  invert?: boolean;
}

function DeltaRow({ label, delta, benchmark, invert = false }: DeltaRowProps) {
  if (delta === null) return null;
  const isPositive = delta > 0;
  const isBad = invert ? isPositive : !isPositive;
  const color = Math.abs(delta) < 0.001
    ? 'var(--color-text-muted)'
    : isBad ? 'var(--color-bad)' : 'var(--color-good)';

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold tabular-nums" style={{ color }}>
          {pp(delta)}
        </span>
        {benchmark !== null && (
          <span className="text-xs tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
            ({pct(benchmark)})
          </span>
        )}
      </div>
    </div>
  );
}

function computeYTD(serie: PontoSerie[], meta: number) {
  const yr2024 = serie.filter(p => p.mes.startsWith('2024'));
  const yr2023 = serie.filter(p => p.mes.startsWith('2023'));

  const totalDesl = yr2024.reduce((s, p) => s + p.desligamentos, 0);
  const totalHC   = yr2024.reduce((s, p) => s + p.headcount, 0);
  const taxa = totalHC > 0 ? totalDesl / totalHC : 0;

  // vs mês anterior YTD (Jan–Nov)
  const prevSlice = yr2024.slice(0, -1);
  const pDesl = prevSlice.reduce((s, p) => s + p.desligamentos, 0);
  const pHC   = prevSlice.reduce((s, p) => s + p.headcount, 0);
  const taxaPrev = pHC > 0 ? pDesl / pHC : null;

  // vs ano anterior (full year 2023)
  const aaDesl = yr2023.reduce((s, p) => s + p.desligamentos, 0);
  const aaHC   = yr2023.reduce((s, p) => s + p.headcount, 0);
  const taxaAA = aaHC > 0 ? aaDesl / aaHC : null;

  return {
    taxa,
    desligamentos: totalDesl,
    headcountMedio: Math.round(totalHC / Math.max(yr2024.length, 1)),
    vsMeta: taxa - meta,
    vsPrev: taxaPrev !== null ? taxa - taxaPrev : null,
    vsYoy: taxaAA !== null ? taxa - taxaAA : null,
    taxaPrev,
    taxaAA,
  };
}

function StoryCard({
  mode,
  taxa,
  desligamentos,
  headcountMedio,
  periodoLabel,
  vsMeta,
  vsPrev,
  vsYoy,
  meta,
  taxaPrev,
  taxaAA,
  projecao,
}: {
  mode: 'mensal' | 'ytd';
  taxa: number;
  desligamentos: number;
  headcountMedio: number;
  periodoLabel: string;
  vsMeta: number;
  vsPrev: number | null;
  vsYoy: number | null;
  meta: number;
  taxaPrev: number | null;
  taxaAA: number | null;
  projecao?: number;
}) {
  const status = taxa <= meta ? 'good' : taxa <= meta * 1.5 ? 'warn' : 'bad';
  const statusColor = {
    good: 'var(--color-good)',
    warn: 'var(--color-warn)',
    bad: 'var(--color-bad)',
  }[status];

  return (
    <Card className="flex flex-col gap-3 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColor }} />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
            Visão {mode === 'mensal' ? 'Mensal' : 'YTD'}
          </span>
        </div>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {periodoLabel}
        </span>
      </div>

      {/* Big metric */}
      <div className="flex items-end gap-2">
        <span className="text-4xl font-bold tabular-nums leading-none" style={{ color: 'var(--color-text-primary)' }}>
          {pct(taxa)}
        </span>
      </div>

      {/* Deltas */}
      <div className="flex flex-col gap-1.5 border-t pt-2" style={{ borderColor: 'var(--color-border)' }}>
        <DeltaRow label="Vs Meta" delta={vsMeta} benchmark={meta} invert />
        <DeltaRow label="Vs Período Anterior" delta={vsPrev} benchmark={taxaPrev} invert />
        <DeltaRow label="Vs Ano Anterior" delta={vsYoy} benchmark={taxaAA} invert />
      </div>

      {/* Footer: absolute numbers */}
      <div className="flex items-center gap-3 pt-0.5">
        <span className="text-xs tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
          <span className="font-semibold">{desligamentos}</span>
          <span style={{ color: 'var(--color-text-muted)' }}> saídas</span>
        </span>
        <span style={{ color: 'var(--color-border)' }}>·</span>
        <span className="text-xs tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
          {headcountMedio.toLocaleString('pt-BR')} HC médio
        </span>
        {projecao !== undefined && (
          <>
            <span style={{ color: 'var(--color-border)' }}>·</span>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              proj. <span className="tabular-nums font-medium">{pct(projecao)}</span>
            </span>
          </>
        )}
      </div>
    </Card>
  );
}

export function BigStatsRow({ turnover, tendencia, projecao }: BigStatsRowProps) {
  const meta = turnover.meta;
  const ytd = computeYTD(tendencia.serie, meta);

  // Mensal: current period values from turnover + tendencia
  const mensalVsMeta = turnover.taxa - meta;
  const mensalVsPrev = tendencia.variacaoMoM;
  const mensalVsYoy  = tendencia.variacaoYoY;
  const mensalTaxaPrev = tendencia.taxaPeriodoAnterior;
  const mensalTaxaAA   = tendencia.taxaMesmoPeriodoAnoAnterior;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <StoryCard
        mode="mensal"
        taxa={turnover.taxa}
        desligamentos={turnover.desligamentos}
        headcountMedio={turnover.headcountMedio}
        periodoLabel="Período selecionado"
        vsMeta={mensalVsMeta}
        vsPrev={mensalVsPrev}
        vsYoy={mensalVsYoy}
        meta={meta}
        taxaPrev={mensalTaxaPrev}
        taxaAA={mensalTaxaAA}
        projecao={projecao.taxaProjetadaProximo3Meses}
      />
      <StoryCard
        mode="ytd"
        taxa={ytd.taxa}
        desligamentos={ytd.desligamentos}
        headcountMedio={ytd.headcountMedio}
        periodoLabel="Jan–Dez 2024"
        vsMeta={ytd.vsMeta}
        vsPrev={ytd.vsPrev}
        vsYoy={ytd.vsYoy}
        meta={meta}
        taxaPrev={ytd.taxaPrev}
        taxaAA={ytd.taxaAA}
      />
    </div>
  );
}
