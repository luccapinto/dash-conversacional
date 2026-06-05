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
import type { ResultadoTendencia, ResultadoProjecao, PontoSerie } from '@/lib/types';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';

interface TrendChartProps {
  tendencia: ResultadoTendencia;
  projecao: ResultadoProjecao;
  meta: number;
  narrativeTitle?: string;
  compact?: boolean;
}

type ViewMode = 'mensal' | 'ytd';

function computeYTD(serie: PontoSerie[]) {
  let cumDesl = 0;
  let cumHC = 0;
  let currentYear = '';
  return serie.map((p) => {
    const year = p.mes.slice(0, 4);
    if (year !== currentYear) { cumDesl = 0; cumHC = 0; currentYear = year; }
    cumDesl += p.desligamentos;
    cumHC += p.headcount;
    return { ytdCount: cumDesl, ytdTaxa: cumHC > 0 ? (cumDesl / cumHC) * 100 : 0 };
  });
}

function barFill(taxa: number, meta: number) {
  if (taxa > meta * 1.5) return 'var(--color-bad)';
  if (taxa > meta) return 'var(--color-warn)';
  return 'var(--color-good)';
}

export function TrendChart({ tendencia, projecao, meta, narrativeTitle, compact }: TrendChartProps) {
  const [mode, setMode] = useState<ViewMode>('mensal');

  const metaPct = parseFloat((meta * 100).toFixed(3));
  const ytd = computeYTD(tendencia.serie);

  const historicalData = tendencia.serie.map((p, i) => ({
    label: p.label,
    count: p.desligamentos,
    taxa: parseFloat((p.taxa * 100).toFixed(2)),
    ytdCount: ytd[i].ytdCount,
    ytdTaxa: parseFloat(ytd[i].ytdTaxa.toFixed(2)),
    projected: false,
  }));

  const projectedData = projecao.serieProjetada.map((p) => ({
    label: p.label,
    count: 0,
    taxa: parseFloat((p.taxaProjetada * 100).toFixed(2)),
    ytdCount: 0,
    ytdTaxa: 0,
    projected: true,
  }));

  // Compact: last 12 months only, simple bars no line
  if (compact) {
    const slice = historicalData.slice(-12);
    return (
      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart data={slice} margin={{ top: 14, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: 'var(--color-text-muted)', fontSize: 9 }} tickLine={false} axisLine={false} interval={2} />
          <YAxis hide />
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11 }}
            formatter={(value: unknown, name: unknown) => { const v = typeof value === 'number' ? value : Number(value); const n = String(name ?? ''); return n === 'taxa' ? [`${v.toFixed(2)}%`, 'Taxa'] : [v, 'Saídas']; }}
          />
          <ReferenceLine y={metaPct} yAxisId="right" stroke="var(--color-warn)" strokeDasharray="4 2" strokeWidth={1} />
          <Bar yAxisId="left" dataKey="count" maxBarSize={14} radius={[2, 2, 0, 0]}>
            {slice.map((d, i) => <Cell key={i} fill={barFill(d.taxa, metaPct)} fillOpacity={0.8} />)}
          </Bar>
          <YAxis yAxisId="left" hide />
          <YAxis yAxisId="right" hide orientation="right" domain={[0, 'auto']} />
          <Line yAxisId="right" dataKey="taxa" stroke="var(--color-accent)" strokeWidth={1.5} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  const chartData = mode === 'ytd'
    ? historicalData
    : [...historicalData, ...projectedData];

  const countKey = mode === 'ytd' ? 'ytdCount' : 'count';
  const taxaKey = mode === 'ytd' ? 'ytdTaxa' : 'taxa';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{narrativeTitle ?? 'Resultado Mês a Mês'}</CardTitle>
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Jan/23 – {mode === 'ytd' ? 'Dez/24' : 'Mar/25'}
          </span>
          {/* Mensal | YTD toggle */}
          <div
            className="flex items-center rounded overflow-hidden"
            style={{ border: '1px solid var(--color-border)' }}
          >
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
            interval={3}
          />
          {/* Left axis: count (for bars) — hidden, labels on bars */}
          <YAxis yAxisId="left" hide />
          {/* Right axis: % rate (for line) */}
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={(v) => `${v.toFixed(1)}%`}
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
              const v = typeof value === 'number' ? value : Number(value);
              const n = String(name ?? '');
              if (n === taxaKey) return [`${v.toFixed(2)}%`, mode === 'ytd' ? 'Taxa YTD' : 'Taxa mensal'];
              return [v, mode === 'ytd' ? 'Saídas acumuladas' : 'Saídas'];
            }}
          />

          {/* Meta reference line */}
          <ReferenceLine
            yAxisId="right"
            y={metaPct}
            stroke="var(--color-warn)"
            strokeDasharray="5 3"
            strokeWidth={1.5}
            label={{ value: `Meta ${metaPct.toFixed(1)}%`, position: 'insideTopRight', fill: 'var(--color-warn-text)', fontSize: 10 }}
          />

          {/* Bars: desligamentos count */}
          <Bar yAxisId="left" dataKey={countKey} maxBarSize={16} radius={[2, 2, 0, 0]}>
            <LabelList
              dataKey={countKey}
              position="top"
              style={{ fontSize: 8, fill: 'var(--color-text-muted)' }}
              formatter={(v: unknown) => { const n = Number(v); return n > 0 ? n : ''; }}
            />
            {chartData.map((d, i) => (
              <Cell
                key={i}
                fill={d.projected ? 'var(--color-chart-2)' : barFill(d[taxaKey as keyof typeof d] as number, metaPct)}
                fillOpacity={d.projected ? 0.35 : 0.75}
              />
            ))}
          </Bar>

          {/* Line: taxa % */}
          <Line
            yAxisId="right"
            dataKey={taxaKey}
            stroke="var(--color-accent)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--color-accent)', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            strokeDasharray={undefined}
          >
            <LabelList
              dataKey={taxaKey}
              position="top"
              style={{ fontSize: 8, fill: 'var(--color-accent)' }}
              formatter={(v: unknown) => `${Number(v).toFixed(1)}%`}
            />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
}
