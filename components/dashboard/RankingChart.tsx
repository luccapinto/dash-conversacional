'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import type { ResultadoRanking, ResultadoBreakdown, Periodo } from '@/lib/types';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { META_TURNOVER_MENSAL, getMesesPeriodo } from '@/lib/calculations';

interface RankingChartGeral {
  mode: 'ranking';
  data: ResultadoRanking;
  narrativeTitle?: string;
  compact?: boolean;
  periodo?: Periodo;
}

interface RankingChartBreakdown {
  mode: 'breakdown';
  data: ResultadoBreakdown;
  narrativeTitle?: string;
  compact?: boolean;
  periodo?: Periodo;
}

type RankingChartProps = RankingChartGeral | RankingChartBreakdown;

const META = META_TURNOVER_MENSAL;

function statusColor(status: string) {
  if (status === 'good') return 'var(--color-good)';
  if (status === 'warn') return 'var(--color-warn)';
  return 'var(--color-bad)';
}

function calcStatus(taxa: number, meta = META): 'good' | 'warn' | 'bad' {
  if (taxa <= meta) return 'good';
  if (taxa <= meta * 1.5) return 'warn';
  return 'bad';
}

function pctStr(v: number, d = 2) { return `${(v * 100).toFixed(d)}%`; }

function DeltaCell({ delta }: { delta: number | null }) {
  if (delta === null) return <span style={{ color: 'var(--color-text-muted)' }}>—</span>;
  const bad   = delta > 0;
  const color = Math.abs(delta) < 0.0005
    ? 'var(--color-text-muted)'
    : bad ? 'var(--color-bad)' : 'var(--color-good)';
  const sign  = delta >= 0 ? '+' : '';
  return (
    <span className="tabular-nums font-medium" style={{ color }}>
      {sign}{(delta * 100).toFixed(1)}pp
    </span>
  );
}

// ── Ranking table (mode=ranking) ──────────────────────────────────────────────

const TH = "py-1.5 px-2 text-right font-semibold uppercase tracking-wide";
const TH_SZ = { fontSize: 10, color: 'var(--color-text-muted)' };

function RankingTable({ data, narrativeTitle, periodo: periodoProp }: { data: ResultadoRanking; narrativeTitle?: string; periodo?: Periodo }) {
  const { ranking, periodo } = data;

  const nMeses = periodoProp ? getMesesPeriodo(periodoProp).length : 12;
  const metaPeriodo = META * nMeses;
  const metaFY = META * 12;

  const totalHC   = ranking.reduce((s, r) => s + r.headcountMedio, 0);
  const totalDesl = ranking.reduce((s, r) => s + r.desligamentos, 0);
  const totalTaxa = totalHC > 0 ? totalDesl / totalHC : 0;
  const totalStatus = calcStatus(totalTaxa, metaPeriodo);

  // Weighted vol/invol totals
  const totalDeslVol   = ranking.reduce((s, r) => s + r.ytdVoluntario   * r.headcountMedio, 0);
  const totalDeslInvol = ranking.reduce((s, r) => s + r.ytdInvoluntario * r.headcountMedio, 0);
  const totalYtdVol    = totalHC > 0 ? totalDeslVol   / totalHC : 0;
  const totalYtdInvol  = totalHC > 0 ? totalDeslInvol / totalHC : 0;

  // Weighted previous-period and YoY totals
  const antRows    = ranking.filter(r => r.ytdAnterior    !== null);
  const aaRows     = ranking.filter(r => r.ytdAnoAnterior !== null);
  const totalHcAnt = antRows.reduce((s, r) => s + r.headcountMedio, 0);
  const totalHcAA  = aaRows.reduce( (s, r) => s + r.headcountMedio, 0);
  const totalYtdAnt = totalHcAnt > 0
    ? antRows.reduce((s, r) => s + r.ytdAnterior!    * r.headcountMedio, 0) / totalHcAnt
    : null;
  const totalYtdAA  = totalHcAA  > 0
    ? aaRows.reduce( (s, r) => s + r.ytdAnoAnterior! * r.headcountMedio, 0) / totalHcAA
    : null;

  const groupBorderL = { borderLeft: '1px solid var(--color-border)' };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{narrativeTitle ?? 'Resultado por Diretoria'}</CardTitle>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{periodo}</span>
      </CardHeader>

      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            {/* Group header row */}
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th rowSpan={2} className="py-2 pl-4 pr-2 text-left font-semibold uppercase tracking-wide"
                style={{ ...TH_SZ, width: '22%', verticalAlign: 'bottom' }}>
                Diretoria
              </th>
              <th rowSpan={2} className={TH} style={{ ...TH_SZ, verticalAlign: 'bottom' }}>HC Méd</th>
              <th rowSpan={2} className={TH} style={{ ...TH_SZ, verticalAlign: 'bottom' }}>Saídas</th>
              <th colSpan={4} className="py-1 px-2 text-center font-semibold uppercase tracking-wide"
                style={{ fontSize: 9, color: 'var(--color-accent)', borderBottom: '1px solid var(--color-border)', ...groupBorderL }}>
                Turnover YTD
              </th>
              <th colSpan={3} className="py-1 px-2 text-center font-semibold uppercase tracking-wide"
                style={{ fontSize: 9, color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)', ...groupBorderL, backgroundColor: 'var(--color-surface-raised)' }}>
                Detalhamento
              </th>
              <th rowSpan={2} className={TH} style={{ ...TH_SZ, verticalAlign: 'bottom', ...groupBorderL }}>
                Meta FY
              </th>
            </tr>
            <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
              <th className={TH} style={{ ...TH_SZ, ...groupBorderL }}>Real YTD</th>
              <th className={TH} style={TH_SZ}>Meta</th>
              <th className={TH} style={TH_SZ}>M-1</th>
              <th className={TH} style={TH_SZ}>YoY</th>
              <th className={TH} style={{ ...TH_SZ, ...groupBorderL }}>TO Vol</th>
              <th className={TH} style={TH_SZ}>TO Invol</th>
              <th className={TH} style={TH_SZ}>TO Geral</th>
            </tr>
          </thead>
          <tbody>
            {/* Total row */}
            <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface-raised)' }}>
              <td className="py-2 pl-4 pr-2 font-bold" style={{ color: 'var(--color-text-primary)' }}>
                Verta S.A.
              </td>
              <td className="py-2 px-2 text-right font-bold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                {totalHC.toLocaleString('pt-BR')}
              </td>
              <td className="py-2 px-2 text-right font-bold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                {totalDesl}
              </td>
              <td className="py-2 px-2 text-right font-bold tabular-nums" style={{ color: statusColor(totalStatus), ...groupBorderL }}>
                {pctStr(totalTaxa)}
              </td>
              <td className="py-2 px-2 text-right tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                {pctStr(metaPeriodo)}
              </td>
              <td className="py-2 px-2 text-right">
                {totalYtdAnt !== null
                  ? <DeltaCell delta={totalTaxa - totalYtdAnt} />
                  : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
              </td>
              <td className="py-2 px-2 text-right">
                {totalYtdAA !== null
                  ? <DeltaCell delta={totalTaxa - totalYtdAA} />
                  : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
              </td>
              <td className="py-2 px-2 text-right tabular-nums" style={{ color: 'var(--color-text-secondary)', ...groupBorderL }}>
                {pctStr(totalYtdVol)}
              </td>
              <td className="py-2 px-2 text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
                {pctStr(totalYtdInvol)}
              </td>
              <td className="py-2 px-2 text-right font-bold tabular-nums" style={{ color: statusColor(totalStatus) }}>
                {pctStr(totalTaxa)}
              </td>
              <td className="py-2 px-2 text-right tabular-nums" style={{ color: 'var(--color-text-muted)', ...groupBorderL }}>
                {pctStr(metaFY)}
              </td>
            </tr>

            {/* Per-diretoria rows */}
            {ranking.map((item, i) => {
              const acum  = item.ytdTotal;
              const st    = calcStatus(acum, metaPeriodo);
              const m1Delta  = item.ytdAnterior    !== null ? acum - item.ytdAnterior    : null;
              const yoyDelta = item.ytdAnoAnterior !== null ? acum - item.ytdAnoAnterior : null;
              return (
                <tr
                  key={item.diretoria}
                  style={{ borderBottom: i < ranking.length - 1 ? '1px solid var(--color-border)' : undefined }}
                >
                  <td className="py-2 pl-4 pr-2" style={{ color: 'var(--color-text-primary)' }}>
                    {item.diretoria}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
                    {item.headcountMedio.toLocaleString('pt-BR')}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
                    {item.desligamentos}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums font-semibold" style={{ color: statusColor(st), ...groupBorderL }}>
                    {pctStr(acum)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                    {pctStr(metaPeriodo)}
                  </td>
                  <td className="py-2 px-2 text-right">
                    <DeltaCell delta={m1Delta} />
                  </td>
                  <td className="py-2 px-2 text-right">
                    <DeltaCell delta={yoyDelta} />
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums" style={{ color: 'var(--color-text-secondary)', ...groupBorderL }}>
                    {pctStr(item.ytdVoluntario)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
                    {pctStr(item.ytdInvoluntario)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums font-semibold" style={{ color: statusColor(st) }}>
                    {pctStr(acum)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums" style={{ color: 'var(--color-text-muted)', ...groupBorderL }}>
                    {pctStr(metaFY)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Breakdown table (mode=breakdown) ─────────────────────────────────────────

function BreakdownTable({ data, narrativeTitle }: { data: ResultadoBreakdown; narrativeTitle?: string }) {
  const hasHC   = data.itens.some(i => i.taxaTurnover !== undefined);
  const hasSal  = data.itens.some(i => i.salarioMedioAteSaida !== undefined);
  const hasNps  = data.itens.some(i => i.npsInterno !== undefined);

  const DIM_LABELS: Record<string, string> = {
    especialidade: 'Especialidade',
    posicionamentoFaixa: 'Faixa Salarial',
    nivelPerformance: 'Performance',
    senioridade: 'Senioridade',
    tipoDesligamento: 'Tipo',
    motivoDesligamento: 'Motivo',
    modalidadeTrabalho: 'Modalidade',
    cargo: 'Cargo',
  };
  const dimLabel = DIM_LABELS[data.dimensao] ?? data.dimensao;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{narrativeTitle ?? `Breakdown por ${dimLabel}`}</CardTitle>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {data.diretoria} · {data.periodo}
        </span>
      </CardHeader>

      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th className="py-2 pl-4 pr-2 text-left font-semibold uppercase tracking-wide"
                style={{ color: 'var(--color-text-muted)', width: '36%' }}>
                {dimLabel}
              </th>
              <th className="py-2 px-2 text-right font-semibold uppercase tracking-wide"
                style={{ color: 'var(--color-text-muted)' }}>Saídas</th>
              <th className="py-2 px-2 text-right font-semibold uppercase tracking-wide"
                style={{ color: 'var(--color-text-muted)' }}>% Total</th>
              {hasHC && (
                <th className="py-2 px-2 text-right font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--color-text-muted)' }}>Taxa</th>
              )}
              {hasSal && (
                <th className="py-2 px-2 text-right font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--color-text-muted)' }}>Sal. Médio</th>
              )}
              {hasNps && (
                <th className="py-2 px-2 text-right font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--color-text-muted)' }}>NPS Interno</th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.itens.map((item, i) => {
              const st = item.taxaTurnover !== undefined ? calcStatus(item.taxaTurnover) : null;
              return (
                <tr
                  key={item.label}
                  style={{ borderBottom: i < data.itens.length - 1 ? '1px solid var(--color-border)' : undefined }}
                >
                  <td className="py-2 pl-4 pr-2" style={{ color: 'var(--color-text-primary)' }}>
                    {item.label}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
                    {item.desligamentos}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                    {item.percentual.toFixed(1)}%
                  </td>
                  {hasHC && (
                    <td className="py-2 px-2 text-right tabular-nums font-semibold"
                      style={{ color: st ? statusColor(st) : 'var(--color-text-secondary)' }}>
                      {item.taxaTurnover !== undefined ? pctStr(item.taxaTurnover) : '—'}
                    </td>
                  )}
                  {hasSal && (
                    <td className="py-2 px-2 text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
                      {item.salarioMedioAteSaida
                        ? `R$ ${item.salarioMedioAteSaida.toLocaleString('pt-BR')}`
                        : '—'}
                    </td>
                  )}
                  {hasNps && (
                    <td className="py-2 px-2 text-right tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                      {item.npsInterno?.toFixed(1) ?? '—'}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Compact mode (chat inline — bar chart unchanged) ──────────────────────────

function CompactBars({ items }: { items: Array<{ name: string; taxa: number; status: string }> }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={items} layout="vertical" margin={{ top: 0, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
        <XAxis type="number" tickFormatter={(v) => `${v.toFixed(1)}%`}
          tick={{ fill: 'var(--color-text-muted)', fontSize: 9 }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" width={80}
          tick={{ fill: 'var(--color-text-secondary)', fontSize: 9 }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ backgroundColor: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11 }}
          formatter={(v: unknown) => [`${Number(v).toFixed(2)}%`, 'Taxa']}
        />
        <Bar dataKey="taxa" radius={[0, 3, 3, 0]} maxBarSize={12}>
          {items.map((entry, i) => (
            <Cell key={i} fill={statusColor(entry.status)} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export function RankingChart(props: RankingChartProps) {
  if (props.mode === 'ranking') {
    const { data, narrativeTitle, compact } = props;

    if (compact) {
      const items = data.ranking.map(r => ({
        name: r.diretoria.length > 16 ? r.diretoria.slice(0, 14) + '…' : r.diretoria,
        taxa: parseFloat((r.taxa * 100).toFixed(2)),
        status: r.status,
      }));
      return <CompactBars items={items} />;
    }

    return <RankingTable data={data} narrativeTitle={narrativeTitle} periodo={props.periodo} />;
  }

  // mode === 'breakdown'
  const { data, narrativeTitle, compact } = props;

  if (compact) {
    const items = data.itens.slice(0, 8).map((item, i) => ({
      name: item.label,
      taxa: item.taxaTurnover !== undefined
        ? parseFloat((item.taxaTurnover * 100).toFixed(2))
        : parseFloat(item.percentual.toFixed(1)),
      status: item.taxaTurnover !== undefined ? calcStatus(item.taxaTurnover) : ['good','warn','bad'][i % 3],
    }));
    return <CompactBars items={items} />;
  }

  return <BreakdownTable data={data} narrativeTitle={narrativeTitle} />;
}
