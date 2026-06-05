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

function RankingTable({ data, narrativeTitle, periodo: periodoProp }: { data: ResultadoRanking; narrativeTitle?: string; periodo?: Periodo }) {
  const { ranking, periodo } = data;

  // nMeses: used to scale the meta (meta_mensal × n_meses = meta do período)
  const nMeses = periodoProp ? getMesesPeriodo(periodoProp).length : 12;
  const metaPeriodo = META * nMeses;

  // Each row: taxa acumulada = desl / hcMédio  (same formula as BigStatsRow YTD card)
  const totalHC   = ranking.reduce((s, r) => s + r.headcountMedio, 0);
  const totalDesl = ranking.reduce((s, r) => s + r.desligamentos, 0);
  const totalTaxa = totalHC > 0 ? totalDesl / totalHC : 0;
  const totalStatus = calcStatus(totalTaxa, metaPeriodo);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{narrativeTitle ?? 'Resultado por Diretoria'}</CardTitle>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{periodo}</span>
      </CardHeader>

      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th className="py-2 pl-4 pr-2 text-left font-semibold uppercase tracking-wide"
                style={{ color: 'var(--color-text-muted)', width: '38%' }}>
                Diretoria
              </th>
              <th className="py-2 px-2 text-right font-semibold uppercase tracking-wide"
                style={{ color: 'var(--color-text-muted)' }}>HC Méd</th>
              <th className="py-2 px-2 text-right font-semibold uppercase tracking-wide"
                style={{ color: 'var(--color-text-muted)' }}>Saídas</th>
              <th className="py-2 px-2 text-right font-semibold uppercase tracking-wide"
                style={{ color: 'var(--color-text-muted)' }}>Acumulado</th>
              <th className="py-2 px-2 text-right font-semibold uppercase tracking-wide"
                style={{ color: 'var(--color-text-muted)' }}>Meta</th>
              <th className="py-2 px-2 text-right font-semibold uppercase tracking-wide"
                style={{ color: 'var(--color-text-muted)' }}>Δ Mês ant.</th>
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
              <td className="py-2 px-2 text-right font-bold tabular-nums" style={{ color: statusColor(totalStatus) }}>
                {pctStr(totalTaxa)}
              </td>
              <td className="py-2 px-2 text-right tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                {pctStr(metaPeriodo)}
              </td>
              <td className="py-2 px-2 text-right">—</td>
            </tr>

            {/* Per-diretoria rows — taxa = desl / hcMédio (acumulada do período) */}
            {ranking.map((item, i) => {
              const acum = item.headcountMedio > 0 ? item.desligamentos / item.headcountMedio : 0;
              const st   = calcStatus(acum, metaPeriodo);
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
                  <td className="py-2 px-2 text-right tabular-nums font-semibold" style={{ color: statusColor(st) }}>
                    {pctStr(acum)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                    {pctStr(metaPeriodo)}
                  </td>
                  <td className="py-2 px-2 text-right">
                    <DeltaCell delta={item.variacaoMoM ? item.variacaoMoM * nMeses : null} />
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
