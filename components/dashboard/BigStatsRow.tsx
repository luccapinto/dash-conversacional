/**
 * BigStatsRow — dois cards de storytelling: Visão Mensal e Visão YTD.
 * YTD = desligamentos acumulados / headcount médio (fórmula anualizada).
 * Meta YTD = meta_mensal × n_meses (cresce com o período).
 */

import { Card } from '@/components/ui/Card';
import { getMesesPeriodo } from '@/lib/calculations';
import type { ResultadoTurnover, ResultadoTendencia, ResultadoProjecao, Periodo, PontoSerie } from '@/lib/types';

const MES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

interface BigStatsRowProps {
  turnover: ResultadoTurnover;
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

export function BigStatsRow({ turnover, tendencia, projecao, periodo }: BigStatsRowProps) {
  const meta = turnover.meta; // monthly meta

  const ytd = computeYTD(tendencia.serie, periodo, meta);

  // Mensal card uses existing turnover + tendencia data
  const mensalVsMeta = turnover.taxa - meta;

  // Label for the mensal card
  const meses = getMesesPeriodo(periodo);
  const n = meses.length;
  const firstM = meses[0];
  const lastM  = meses[n - 1];
  const mensalLabel = n === 1
    ? `${mesLabel(firstM)} ${firstM.slice(0, 4)}`
    : n === 12
    ? `Jan–Dez ${lastM.slice(0, 4)}`
    : `${mesLabel(firstM)}–${mesLabel(lastM)} ${lastM.slice(0, 4)}`;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <StoryCard
        mode="mensal"
        taxa={turnover.taxa}
        desligamentos={turnover.desligamentos}
        headcountMedio={turnover.headcountMedio}
        periodoLabel={mensalLabel}
        vsMeta={mensalVsMeta}
        vsPrev={tendencia.variacaoMoM}
        vsYoy={tendencia.variacaoYoY}
        metaRef={meta}
        taxaPrev={tendencia.taxaPeriodoAnterior}
        taxaAA={tendencia.taxaMesmoPeriodoAnoAnterior}
        projecao={projecao.taxaProjetadaProximo3Meses}
      />
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
