'use client';

/**
 * TrendChart — gráfico de tendência de turnover (24 meses históricos + projeção 3m).
 * Client Component porque Recharts requer ambiente de browser.
 */

import {
  ComposedChart,
  Area,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { ResultadoTendencia, ResultadoProjecao } from '@/lib/types';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';

interface TrendChartProps {
  tendencia: ResultadoTendencia;
  projecao: ResultadoProjecao;
  meta: number;
}

interface ChartDataPoint {
  label: string;
  taxa?: number;
  projetado?: number;
}

function fmt(v: number) {
  return `${(v * 100).toFixed(2)}%`;
}

export function TrendChart({ tendencia, projecao, meta }: TrendChartProps) {
  // Combina série histórica + pontos projetados
  const historico: ChartDataPoint[] = tendencia.serie.map((p) => ({
    label: p.label,
    taxa: parseFloat((p.taxa * 100).toFixed(3)),
  }));

  const projetados: ChartDataPoint[] = projecao.serieProjetada.map((p) => ({
    label: p.label,
    projetado: parseFloat((p.taxaProjetada * 100).toFixed(3)),
  }));

  // Para conectar a linha, adiciona o último ponto histórico no início dos projetados
  const lastHistorico = historico[historico.length - 1];
  const projetadosConnected: ChartDataPoint[] = [
    { label: lastHistorico.label, projetado: lastHistorico.taxa },
    ...projetados,
  ];

  const data: ChartDataPoint[] = [
    ...historico,
    ...projetados,
  ];

  // Juntar tudo numa única série para o gráfico
  const merged = new Map<string, ChartDataPoint>();
  for (const d of data) {
    merged.set(d.label, { ...merged.get(d.label), ...d });
  }
  // Re-add connected projected data
  for (const d of projetadosConnected) {
    const existing = merged.get(d.label);
    if (existing) {
      merged.set(d.label, { ...existing, projetado: d.projetado });
    }
  }

  const chartData = [...merged.values()];
  const metaPct = parseFloat((meta * 100).toFixed(3));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Evolução do Turnover</CardTitle>
        <span
          className="text-xs"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Jan/23 – Mar/25
        </span>
      </CardHeader>

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-border)"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            interval={3}
          />
          <YAxis
            tickFormatter={(v) => `${v.toFixed(1)}%`}
            tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              color: 'var(--color-text-primary)',
              fontSize: 12,
            }}
            formatter={(value, name) => {
              const v = typeof value === 'number' ? value : Number(value);
              const n = String(name);
              const labels: Record<string, string> = {
                taxa: 'Turnover',
                projetado: 'Projetado',
              };
              return [`${v.toFixed(2)}%`, labels[n] ?? n];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: 'var(--color-text-secondary)' }}
            formatter={(value) => {
              const labels: Record<string, string> = {
                taxa: 'Turnover histórico',
                projetado: 'Projeção (Jan–Mar/25)',
              };
              return labels[value] ?? value;
            }}
          />

          {/* Meta — linha tracejada horizontal */}
          <ReferenceLine
            y={metaPct}
            stroke="var(--color-warn)"
            strokeDasharray="5 3"
            strokeWidth={1.5}
            label={{
              value: `Meta ${fmt(meta)}`,
              position: 'insideTopRight',
              fill: 'var(--color-warn-text)',
              fontSize: 10,
            }}
          />

          {/* Área de fundo — série histórica */}
          <Area
            type="monotone"
            dataKey="taxa"
            stroke="var(--color-chart-1)"
            strokeWidth={2}
            fill="var(--color-chart-1)"
            fillOpacity={0.08}
            dot={false}
            activeDot={{ r: 4, fill: 'var(--color-chart-1)' }}
            connectNulls={false}
          />

          {/* Área projetada — tom diferente */}
          <Area
            type="monotone"
            dataKey="projetado"
            stroke="var(--color-chart-2)"
            strokeWidth={2}
            strokeDasharray="6 3"
            fill="var(--color-chart-2)"
            fillOpacity={0.06}
            dot={false}
            activeDot={{ r: 4, fill: 'var(--color-chart-2)' }}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
}
