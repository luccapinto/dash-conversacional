/**
 * BigStatsRow — dois cards de storytelling: Visão Mensal e Visão YTD.
 * Mensal = taxa do último mês do período selecionado.
 * YTD    = desligamentos acumulados / headcount médio desde Jan do ano.
 * Meta YTD = meta_mensal × n_meses (cresce com o período).
 */

import { Card } from '@/components/ui/Card';
import { getMesesPeriodo, META_TURNOVER_MENSAL } from '@/lib/calculations';
import type { ResultadoTendencia, ResultadoProjecao, Periodo, PontoSerie } from '@/lib/types';

const MES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

interface BigStatsRowProps {
  tendencia: ResultadoTendencia;
  projecao: ResultadoProjecao;
  periodo: Periodo;
}

function pct(v: number, decimals = 1) { return `${(v * 100).toFixed(decimals)}%`; }

function pp(v: number) {
  const sign = v >= 0 ? '+' : '';
  return `${sign}${(v * 100).toFixed(1)}pp`;
}

function mesLabel(mes: string) {
  const [, m] = mes.split('-').map(Number);
  return MES_LABELS[m - 1];
}

interface DeltaRowProps {
  label: string;
  delta: number | null;
  benchmark: number | null;
  invert?: boolean;
}

function DeltaRow({ label, delta, benchmark, invert = false }: DeltaRowProps) {
  if (delta === null) return null;
  const bad = invert ? delta > 0 : delta < 0;
  const color = Math.abs(delta) < 0.0005
    ? 'var(--color-text-muted)'
    : bad ? 'var(--color-bad)' : 'var(--color-good)';

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold tabular-nums" style={{ color }}>{pp(delta)}</span>
        {benchmark !== null && (
          <span className="text-xs tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
            ({pct(benchmark)})
          </span>
        )}
      </div>
    </div>
  );
}

// ── Mensal computation (last month of selected period) ───────────────────────

interface MensalResult {
  taxa: number;
  desligamentos: number;
  headcount: number;
  vsMeta: number;
  vsPrev: number | null;
  vsYoy: number | null;
  taxaPrev: number | null;
  taxaAA: number | null;
  label: string;
}

function computeMensal(serie: PontoSerie[], periodo: Periodo, meta: number): MensalResult | null {
  const meses = getMesesPeriodo(periodo);
  if (meses.length === 0) return null;

  const lastMes = meses[meses.length - 1];
  const lastIdx = serie.findIndex(p => p.mes === lastMes);
  if (lastIdx < 0) return null;

  const pt = serie[lastIdx];

  const prevPt = lastIdx > 0 ? serie[lastIdx - 1] : null;
  const vsPrev  = prevPt ? pt.taxa - prevPt.taxa : null;

  const y     = parseInt(lastMes.slice(0, 4));
  const mm    = lastMes.slice(5);
  const aaMes = `${y - 1}-${mm}`;
  const aaPt  = serie.find(p => p.mes === aaMes);
  const vsYoy = aaPt ? pt.taxa - aaPt.taxa : null;

  return {
    taxa: pt.taxa,
    desligamentos: pt.desligamentos,
    headcount: pt.headcount,
    vsMeta: pt.taxa - meta,
    vsPrev,
    vsYoy,
    taxaPrev: prevPt?.taxa ?? null,
    taxaAA:   aaPt?.taxa  ?? null,
    label:    pt.label,
  };
}

// ── YTD computation (annualized formula) ──────────────────────────────────────

interface YTDResult {
  taxa: number;
  desligamentos: number;
  headcountMedio: number;
  ytdMeta: number;
  vsMeta: number;
  vsPrev: number | null;
  vsYoy: number | null;
  taxaPrev: number | null;
  taxaAA: number | null;
  label: string;
  numMeses: number;
}

function computeYTD(serie: PontoSerie[], periodo: Periodo, metaMensal: number): YTDResult | null {
  const meses = getMesesPeriodo(periodo);
  if (meses.length === 0) return null;

  const lastMes = meses[meses.length - 1];             // e.g. '2024-06'
  const ytdYear = lastMes.slice(0, 4);                 // '2024'
  const ytdStart = `${ytdYear}-01`;                    // '2024-01'

  // All months from Jan of that year through last month of selected period
  const ytdMonths = serie.filter(p => p.mes >= ytdStart && p.mes <= lastMes);
  const n = ytdMonths.length;
  if (n === 0) return null;

  const totalDesl = ytdMonths.reduce((s, p) => s + p.desligamentos, 0);
  const totalHC   = ytdMonths.reduce((s, p) => s + p.headcount, 0);
  const avgHC     = totalHC / n;                          // average monthly headcount
  const taxa      = avgHC > 0 ? totalDesl / avgHC : 0;   // annualized: e.g. ~0.24 for full year
  const ytdMeta   = metaMensal * n;                       // e.g. 0.02 × 12 = 0.24

  // vs previous month YTD (one month shorter)
  let vsPrev: number | null = null;
  let taxaPrev: number | null = null;
  if (n > 1) {
    const prevMes    = ytdMonths[n - 2].mes;
    const prevSlice  = ytdMonths.slice(0, n - 1);
    const pDesl      = prevSlice.reduce((s, p) => s + p.desligamentos, 0);
    const pHC        = prevSlice.reduce((s, p) => s + p.headcount, 0);
    const pAvg       = pHC / (n - 1);
    taxaPrev         = pAvg > 0 ? pDesl / pAvg : 0;
    void prevMes;
    vsPrev           = taxa - taxaPrev;
  }

  // vs same YTD last year
  const aaYear  = String(parseInt(ytdYear) - 1);
  const aaEnd   = `${aaYear}-${lastMes.slice(5)}`;
  const aaStart = `${aaYear}-01`;
  const aaSlice = serie.filter(p => p.mes >= aaStart && p.mes <= aaEnd);
  let vsYoy: number | null = null;
  let taxaAA: number | null = null;
  if (aaSlice.length > 0) {
    const aaDesl = aaSlice.reduce((s, p) => s + p.desligamentos, 0);
    const aaHC   = aaSlice.reduce((s, p) => s + p.headcount, 0);
    const aaAvg  = aaHC / aaSlice.length;
    taxaAA       = aaAvg > 0 ? aaDesl / aaAvg : 0;
    vsYoy        = taxa - taxaAA;
  }

  const lastLabel = mesLabel(lastMes);
  const label = n === 12 ? `Jan–Dez ${ytdYear}` : `Jan–${lastLabel} ${ytdYear}`;

  return {
    taxa, desligamentos: totalDesl, headcountMedio: Math.round(avgHC),
    ytdMeta, vsMeta: taxa - ytdMeta, vsPrev, vsYoy, taxaPrev, taxaAA,
    label, numMeses: n,
  };
}

// ── Story card ────────────────────────────────────────────────────────────────

function StoryCard({
  mode, taxa, desligamentos, headcountMedio, periodoLabel,
  vsMeta, vsPrev, vsYoy, metaRef, taxaPrev, taxaAA, projecao,
}: {
  mode: 'mensal' | 'ytd';
  taxa: number;
  desligamentos: number;
  headcountMedio: number;
  periodoLabel: string;
  vsMeta: number;
  vsPrev: number | null;
  vsYoy: number | null;
  metaRef: number;
  taxaPrev: number | null;
  taxaAA: number | null;
  projecao?: number;
}) {
  const status = taxa <= metaRef ? 'good' : taxa <= metaRef * 1.5 ? 'warn' : 'bad';
  const statusColor = { good: 'var(--color-good)', warn: 'var(--color-warn)', bad: 'var(--color-bad)' }[status];

  const metaLabel = mode === 'ytd'
    ? `Meta YTD ${pct(metaRef, 1)}`
    : `Meta mensal ${pct(metaRef, 1)}`;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColor }} />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
            Visão {mode === 'mensal' ? 'Mensal' : 'YTD'}
          </span>
        </div>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{periodoLabel}</span>
      </div>

      {/* Big metric */}
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold tabular-nums leading-none" style={{ color: 'var(--color-text-primary)' }}>
          {pct(taxa, 2)}
        </span>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{metaLabel}</span>
      </div>

      {/* Deltas */}
      <div className="flex flex-col gap-1.5 border-t pt-2" style={{ borderColor: 'var(--color-border)' }}>
        <DeltaRow label="Vs Meta" delta={vsMeta} benchmark={metaRef} invert />
        <DeltaRow label="Vs Período Anterior" delta={vsPrev} benchmark={taxaPrev} invert />
        <DeltaRow label="Vs Ano Anterior" delta={vsYoy} benchmark={taxaAA} invert />
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 pt-0.5 flex-wrap">
        <span className="text-xs tabular-nums">
          <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{desligamentos}</span>
          <span style={{ color: 'var(--color-text-muted)' }}> saídas</span>
        </span>
        <span style={{ color: 'var(--color-border)' }}>·</span>
        <span className="text-xs tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
          HC médio {headcountMedio.toLocaleString('pt-BR')}
        </span>
        {projecao !== undefined && (
          <>
            <span style={{ color: 'var(--color-border)' }}>·</span>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              proj. <span className="tabular-nums font-medium">{pct(projecao, 2)}</span>
            </span>
          </>
        )}
      </div>
    </Card>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export function BigStatsRow({ tendencia, projecao, periodo }: BigStatsRowProps) {
  const meta = META_TURNOVER_MENSAL;

  const mensal = computeMensal(tendencia.serie, periodo, meta);
  const ytd    = computeYTD(tendencia.serie, periodo, meta);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {mensal ? (
        <StoryCard
          mode="mensal"
          taxa={mensal.taxa}
          desligamentos={mensal.desligamentos}
          headcountMedio={mensal.headcount}
          periodoLabel={mensal.label}
          vsMeta={mensal.vsMeta}
          vsPrev={mensal.vsPrev}
          vsYoy={mensal.vsYoy}
          metaRef={meta}
          taxaPrev={mensal.taxaPrev}
          taxaAA={mensal.taxaAA}
          projecao={projecao.taxaProjetadaProximo3Meses}
        />
      ) : null}
      {ytd ? (
        <StoryCard
          mode="ytd"
          taxa={ytd.taxa}
          desligamentos={ytd.desligamentos}
          headcountMedio={ytd.headcountMedio}
          periodoLabel={ytd.label}
          vsMeta={ytd.vsMeta}
          vsPrev={ytd.vsPrev}
          vsYoy={ytd.vsYoy}
          metaRef={ytd.ytdMeta}
          taxaPrev={ytd.taxaPrev}
          taxaAA={ytd.taxaAA}
        />
      ) : null}
    </div>
  );
}
