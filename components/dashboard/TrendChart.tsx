'use client';

import { useState } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
  ResponsiveContainer,
} from 'recharts';
import type { ResultadoTendencia, ResultadoProjecao, PontoSerie, Periodo } from '@/lib/types';
import { getMesesPeriodo } from '@/lib/calculations';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';

interface TrendChartProps {
  tendencia: ResultadoTendencia;
  projecao: ResultadoProjecao;
  meta: number;
  narrativeTitle?: string;
  compact?: boolean;
  periodo?: Periodo;
}

type ViewMode = 'mensal' | 'ytd';

// ── YTD series computation ────────────────────────────────────────────────────

function buildYTDData(serie: PontoSerie[], mesesPeriodo: string[], meta: number) {
  const lastMes  = mesesPeriodo[mesesPeriodo.length - 1];
  const ytdYear  = lastMes.slice(0, 4);
  const ytdStart = `${ytdYear}-01`;

  const ytdMonths = serie.filter(p => p.mes >= ytdStart && p.mes <= lastMes);

  let cumDesl = 0;
  let cumHC   = 0;

  return ytdMonths.map((p, i) => {
    cumDesl += p.desligamentos;
    cumHC   += p.headcount;
    const n     = i + 1;
    const avgHC = cumHC / n;
    // Annualized YTD rate: total_desl / avg_monthly_hc
    const ytdTaxa    = avgHC > 0 ? (cumDesl / avgHC) * 100 : 0;
    // Growing meta: meta_mensal × months_elapsed (in %)
    const ytdMetaLine = meta * 100 * n;

    return {
      label: p.label,
      mes: p.mes,
      ytdCount: cumDesl,
      ytdTaxa:     parseFloat(ytdTaxa.toFixed(2)),
      ytdMetaLine: parseFloat(ytdMetaLine.toFixed(2)),
      projected: false,
    };
  });
}

// ── Bar color ─────────────────────────────────────────────────────────────────

function barFill(taxa: number, metaPct: number) {
  if (taxa > metaPct * 1.5) return 'var(--color-bad)';
  if (taxa > metaPct)       return 'var(--color-warn)';
  return 'var(--color-good)';
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TrendChart({ tendencia, projecao, meta, narrativeTitle, compact, periodo }: TrendChartProps) {
  const [mode, setMode] = useState<ViewMode>('mensal');

  const metaPct      = parseFloat((meta * 100).toFixed(3));
  const mesesPeriodo = periodo ? getMesesPeriodo(periodo) : [];
  const lastMes      = mesesPeriodo[mesesPeriodo.length - 1] ?? '2024-12';

  // ── Compact mode: simple bars + line, last 12 months ───────────────────────
  if (compact) {
    const slice = tendencia.serie.slice(-12);
    return (
      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart data={slice.map(p => ({ label: p.label, count: p.desligamentos, taxa: parseFloat((p.taxa * 100).toFixed(2)) }))}
          margin={{ top: 14, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: 'var(--color-text-muted)', fontSize: 9 }} tickLine={false} axisLine={false} interval={2} />
          <YAxis yAxisId="left" hide />
          <YAxis yAxisId="right" hide orientation="right" domain={[0, 'auto']} />
          <Tooltip contentStyle={{ backgroundColor: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11 }}
            formatter={(v: unknown, n: unknown) => { const val = Number(v); const nm = String(n ?? ''); return nm === 'taxa' ? [`${val.toFixed(2)}%`, 'Taxa'] : [val, 'Saídas']; }} />
          <ReferenceLine yAxisId="right" y={metaPct} stroke="var(--color-warn)" strokeDasharray="4 2" strokeWidth={1} />
          <Bar yAxisId="left" dataKey="count" maxBarSize={14} radius={[2, 2, 0, 0]}>
            {slice.map((p, i) => <Cell key={i} fill={barFill(parseFloat((p.taxa * 100).toFixed(2)), metaPct)} fillOpacity={0.8} />)}
          </Bar>
          <Line yAxisId="right" dataKey="taxa" stroke="var(--color-accent)" strokeWidth={1.5} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  // ── Full mode ───────────────────────────────────────────────────────────────

  // Mensal: all 24 historical months + projected
  const mensalHistorical = tendencia.serie.map(p => ({
    label: p.label,
    mes: p.mes,
    count: p.desligamentos,
    taxa: parseFloat((p.taxa * 100).toFixed(2)),
    projected: false,
  }));
  const mensalProjected = projecao.serieProjetada.map(p => ({
    label: p.label,
    mes: p.mes,
    count: 0,
    taxa: parseFloat((p.taxaProjetada * 100).toFixed(2)),
    projected: true,
  }));
  const mensalData = [...mensalHistorical, ...mensalProjected];

  // YTD: cumulative from Jan of selected year through last month of period
  const ytdData = buildYTDData(tendencia.serie, mesesPeriodo.length > 0 ? mesesPeriodo : ['2024-12'], meta);

  const chartData = (mode === 'mensal' ? mensalData : ytdData) as Record<string, unknown>[];
  const countKey  = mode === 'mensal' ? 'count'    : 'ytdCount';
  const taxaKey   = mode === 'mensal' ? 'taxa'      : 'ytdTaxa';

  // YTD date range label
  const ytdYear  = lastMes.slice(0, 4);
  const ytdStart = `${ytdYear}-01`;
  const ytdEnd   = lastMes;
  const ytdLabel = ytdData.length > 0
    ? `Jan/23 – ${ytdData[ytdData.length - 1]?.label ?? 'Dez/24'}`
    : 'Jan/23 – Dez/24';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{narrativeTitle ?? 'Resultado Mês a Mês'}</CardTitle>
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {mode === 'mensal' ? 'Jan/23 – Mar/25' : ytdLabel}
          </span>
          {/* Toggle */}
          <div className="flex items-center rounded overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
            {(['mensal', 'ytd'] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="px-2.5 py-0.5 text-xs font-semibold transition-colors"
                style={{
                  backgroundColor: mode === m ? 'var(--color-surface-raised)' : 'transparent',
                  color: mode === m ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  borderRight: m === 'mensal' ? '1px solid var(--color-border)' : undefined,
                }}
              >
                {m === 'mensal' ? 'Mensal' : 'YTD'}
              </button>
            ))}
          </div>
          {mode === 'ytd' && (
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              — linha tracejada = meta acumulada ({(meta * 100).toFixed(1)}%/mês × meses)
            </span>
          )}
        </div>
      </CardHeader>

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval={mode === 'mensal' ? 3 : 0}
          />
          <YAxis yAxisId="left" hide />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={(v) => `${v.toFixed(0)}%`}
            tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={38}
            domain={[0, 'auto']}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              color: 'var(--color-text-primary)',
              fontSize: 12,
            }}
            formatter={(value: unknown, name: unknown) => {
              const v = Number(value);
              const n = String(name ?? '');
              if (n === 'ytdMetaLine') return [`${v.toFixed(1)}%`, 'Meta YTD'];
              if (n === taxaKey) return [`${v.toFixed(2)}%`, mode === 'ytd' ? 'Taxa YTD' : 'Taxa mensal'];
              return [v, mode === 'ytd' ? 'Saídas acumuladas' : 'Saídas'];
            }}
          />

          {/* Mensal: fixed meta reference line */}
          {mode === 'mensal' && (
            <ReferenceLine
              yAxisId="right"
              y={metaPct}
              stroke="var(--color-warn)"
              strokeDasharray="5 3"
              strokeWidth={1.5}
              label={{ value: `Meta ${metaPct.toFixed(1)}%/mês`, position: 'insideTopRight', fill: 'var(--color-warn-text)', fontSize: 10 }}
            />
          )}

          {/* Bars */}
          <Bar yAxisId="left" dataKey={countKey} maxBarSize={16} radius={[2, 2, 0, 0]}>
            <LabelList
              dataKey={countKey}
              position="top"
              style={{ fontSize: 8, fill: 'var(--color-text-muted)' }}
              formatter={(v: unknown) => { const n = Number(v); return n > 0 ? n : ''; }}
            />
            {chartData.map((d, i) => {
              const taxaVal = (d as Record<string, unknown>)[taxaKey] as number;
              const mes = (d as Record<string, unknown>).mes as string | undefined;
              const isProjected = (d as Record<string, unknown>).projected as boolean;
              // Highlight bars in selected period (Mensal mode)
              const inPeriod = !mes || mesesPeriodo.length === 0 || mesesPeriodo.includes(mes);
              const opacity  = isProjected ? 0.35 : mode === 'ytd' ? 0.75 : (inPeriod ? 0.85 : 0.3);
              return (
                <Cell
                  key={i}
                  fill={isProjected ? 'var(--color-chart-2)' : barFill(taxaVal, metaPct)}
                  fillOpacity={opacity}
                />
              );
            })}
          </Bar>

          {/* Taxa line */}
          <Line
            yAxisId="right"
            dataKey={taxaKey}
            stroke="var(--color-accent)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--color-accent)', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          >
            <LabelList
              dataKey={taxaKey}
              position="top"
              style={{ fontSize: 8, fill: 'var(--color-accent)' }}
              formatter={(v: unknown) => `${Number(v).toFixed(1)}%`}
            />
          </Line>

          {/* YTD: growing meta line (dashed) */}
          {mode === 'ytd' && (
            <Line
              yAxisId="right"
              dataKey="ytdMetaLine"
              stroke="var(--color-warn)"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              dot={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
}
