'use client';

/**
 * RankingChart — ranking de diretorias (visão geral) ou breakdown por
 * posicionamentoFaixa (visão de diretoria específica).
 * Client Component porque Recharts requer ambiente de browser.
 */

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
import type { ResultadoRanking, ResultadoBreakdown } from '@/lib/types';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';

interface RankingChartGeral {
  mode: 'ranking';
  data: ResultadoRanking;
}

interface RankingChartBreakdown {
  mode: 'breakdown';
  data: ResultadoBreakdown;
}

type RankingChartProps = RankingChartGeral | RankingChartBreakdown;

const STATUS_COLORS: Record<string, string> = {
  good: 'var(--color-good)',
  warn: 'var(--color-warn)',
  bad: 'var(--color-bad)',
};

const CHART_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  'var(--color-chart-6)',
];

function calcStatus(taxa: number, meta = 0.02): 'good' | 'warn' | 'bad' {
  if (taxa <= meta) return 'good';
  if (taxa <= meta * 1.5) return 'warn';
  return 'bad';
}

export function RankingChart(props: RankingChartProps) {
  if (props.mode === 'ranking') {
    const { data } = props;
    const chartData = data.ranking.map((item) => ({
      name: item.diretoria.length > 18 ? item.diretoria.slice(0, 16) + '…' : item.diretoria,
      fullName: item.diretoria,
      taxa: parseFloat((item.taxa * 100).toFixed(2)),
      status: item.status,
    }));

    return (
      <Card>
        <CardHeader>
          <CardTitle>Ranking por Diretoria</CardTitle>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {data.periodo}
          </span>
        </CardHeader>

        <ResponsiveContainer width="100%" height={260}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border)"
              horizontal={false}
            />
            <XAxis
              type="number"
              tickFormatter={(v) => `${v.toFixed(1)}%`}
              tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={120}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-surface-raised)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                color: 'var(--color-text-primary)',
                fontSize: 12,
              }}
              formatter={(value, _name, entry) => {
                const v = typeof value === 'number' ? value : Number(value);
                return [`${v.toFixed(2)}%`, (entry as { payload?: { fullName?: string } }).payload?.fullName ?? String(_name)];
              }}
              labelFormatter={() => 'Turnover'}
            />
            <Bar dataKey="taxa" radius={[0, 4, 4, 0]} maxBarSize={20}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={STATUS_COLORS[entry.status] ?? 'var(--color-chart-1)'}
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
    );
  }

  // mode === 'breakdown'
  const { data } = props;
  const chartData = data.itens.map((item, i) => ({
    name: item.label,
    taxa: item.taxaTurnover !== undefined
      ? parseFloat((item.taxaTurnover * 100).toFixed(2))
      : parseFloat((item.percentual).toFixed(1)),
    hasTaxa: item.taxaTurnover !== undefined,
    color: CHART_COLORS[i % CHART_COLORS.length],
    status: item.taxaTurnover !== undefined ? calcStatus(item.taxaTurnover) : 'neutral',
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Breakdown por Posição Salarial</CardTitle>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {data.diretoria} · {data.periodo}
        </span>
      </CardHeader>

      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-border)"
            horizontal={false}
          />
          <XAxis
            type="number"
            tickFormatter={(v) => `${v.toFixed(1)}${chartData[0]?.hasTaxa ? '%' : '%'}`}
            tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={80}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              color: 'var(--color-text-primary)',
              fontSize: 12,
            }}
            formatter={(value, _name, entry) => {
              const v = typeof value === 'number' ? value : Number(value);
              const label = (entry as { payload?: { hasTaxa?: boolean } }).payload?.hasTaxa ? 'Taxa turnover' : '% desligamentos';
              return [`${v.toFixed(2)}%`, label];
            }}
          />
          <Bar dataKey="taxa" radius={[0, 4, 4, 0]} maxBarSize={20}>
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.status !== 'neutral' ? STATUS_COLORS[entry.status] : entry.color}
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
