'use client';

import { useState } from 'react';
import {
  BarChart,
  Bar,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
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

type ViewMode = 'mom' | 'ytd';

function computeYTD(serie: PontoSerie[]): number[] {
  let cumDesl = 0;
  let cumHC = 0;
  let currentYear = '';
  return serie.map((p) => {
    const year = p.mes.slice(0, 4);
    if (year !== currentYear) {
      cumDesl = 0;
      cumHC = 0;
      currentYear = year;
    }
    cumDesl += p.desligamentos;
    cumHC += p.headcount;
    return cumHC > 0 ? cumDesl / cumHC : 0;
  });
}

function barColor(taxa: number, meta: number, isProjected: boolean): string {
  if (isProjected) return 'var(--color-chart-2)';
  if (taxa > meta * 150) return 'var(--color-bad)';
  if (taxa > meta * 100) return 'var(--color-warn)';
  return 'var(--color-good)';
}

export function TrendChart({ tendencia, projecao, meta, narrativeTitle, compact }: TrendChartProps) {
  const [mode, setMode] = useState<ViewMode>('mom');

  const ytdRates = computeYTD(tendencia.serie);
  const metaPct = parseFloat((meta * 100).toFixed(3));

  // Show last 12 months in compact mode, all 24 in full
  const historicalSlice = compact ? tendencia.serie.slice(-12) : tendencia.serie;
  const ytdSlice = compact ? ytdRates.slice(-12) : ytdRates;

  const historicalData = historicalSlice.map((p, i) => ({
    label: p.label,
    mom: parseFloat((p.taxa * 100).toFixed(3)),
    ytd: parseFloat((ytdSlice[i] * 100).toFixed(3)),
    projected: false,
  }));

  const projectedData = projecao.serieProjetada.map((p) => ({
    label: p.label,
    mom: parseFloat((p.taxaProjetada * 100).toFixed(3)),
    ytd: null,
    projected: true,
  }));

  const chartData = mode === 'ytd'
    ? historicalData
    : [...historicalData, ...(compact ? [] : projectedData)];

  const dataKey = mode === 'mom' ? 'mom' : 'ytd';
  const height = compact ? 160 : 260;

  const chart = (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={chartData}
        margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
        barCategoryGap="20%"
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--color-border)"
          vertical={false}
        />
        <XAxis
          dataKey="label"
          tick={{ fill: 'var(--color-text-muted)', fontSize: compact ? 9 : 10 }}
          tickLine={false}
          axisLine={false}
          interval={compact ? 2 : 3}
        />
        <YAxis
          tickFormatter={(v) => `${v.toFixed(1)}%`}
          tick={{ fill: 'var(--color-text-muted)', fontSize: compact ? 9 : 10 }}
          tickLine={false}
          axisLine={false}
          width={38}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            color: 'var(--color-text-primary)',
            fontSize: 12,
          }}
          formatter={(value) => {
            const v = typeof value === 'number' ? value : Number(value);
            return [`${v.toFixed(2)}%`, mode === 'ytd' ? 'Acumulado YTD' : 'Turnover mensal'];
          }}
        />
        <ReferenceLine
          y={metaPct}
          stroke="var(--color-warn)"
          strokeDasharray="5 3"
          strokeWidth={1.5}
          label={{
            value: `Meta ${metaPct.toFixed(1)}%`,
            position: 'insideTopRight',
            fill: 'var(--color-warn-text)',
            fontSize: 10,
          }}
        />
        <Bar dataKey={dataKey} maxBarSize={compact ? 12 : 16} radius={[2, 2, 0, 0]}>
          {chartData.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={barColor(entry.mom, metaPct, entry.projected)}
              fillOpacity={entry.projected ? 0.45 : 0.82}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  if (compact) return chart;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{narrativeTitle ?? 'Evolução do Turnover'}</CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Jan/23 – {mode === 'ytd' ? 'Dez/24' : 'Mar/25'}
          </span>
          {/* MoM / YTD toggle */}
          <div
            className="flex items-center rounded overflow-hidden ml-2"
            style={{ border: '1px solid var(--color-border)' }}
          >
            {(['mom', 'ytd'] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="px-2 py-0.5 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: mode === m ? 'var(--color-accent)' : 'transparent',
                  color: mode === m ? 'var(--color-text-inverse)' : 'var(--color-text-muted)',
                  borderRight: m === 'mom' ? '1px solid var(--color-border)' : undefined,
                }}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      {chart}
    </Card>
  );
}
