/**
 * Evolução mês a mês (SVG puro): barras coloridas por estar dentro/fora da meta, linha tracejada da
 * meta com rótulo, mês atual em destaque, mesmo mês do ano anterior contornado e rótulos só no
 * atual, no ano anterior, no máximo e no mínimo. Portado de graficoMoM da maquete aprovada.
 */

import type { Polaridade, Unidade } from '@/lib/analytics/catalog';
import { somarMeses, type Mes } from '@/lib/analytics/dominio';
import { eixo, valorComUnidade } from '@/lib/painel/formato';

export interface BarraMes {
  mes: Mes;
  rotulo: string;
  valor: number;
}

interface Props {
  pontos: readonly BarraMes[];
  unidade: Unidade;
  meta: number | null;
  polaridade: Polaridade;
  /** pontos são ciclos trimestrais (rótulo em todos) */
  trimestral: boolean;
  compacto?: boolean;
  descricao: string;
}

export function BarrasMensais({ pontos, unidade: u, meta, polaridade, trimestral, compacto = false, descricao }: Props) {
  if (pontos.length === 0) return <p className="sub">Sem dado no período.</p>;
  const v = pontos.map(p => p.valor);
  let mn = Math.min(0, ...v, meta ?? 0);
  let mx = Math.max(...v, meta ?? -Infinity);
  const pad = (mx - mn) * 0.14 || 1;
  mx += pad;
  if (mn < 0) mn -= pad * 0.6;
  const [w, h] = compacto ? [370, 230] : [980, 220];
  const [L, R, Tp, B] = [4, compacto ? 40 : 52, 30, 24];
  const n = pontos.length;
  const bw = (w - L - R) / n;
  const X = (i: number) => L + i * bw + bw / 2;
  const Y = (y: number) => Tp + (1 - (y - mn) / (mx - mn)) * (h - Tp - B);
  const ticks = [...new Set([mn < 0 ? mn + pad * 0.6 : 0, (mn + mx) / 2, mx - pad].map(t => +t.toPrecision(2)))];
  const iMx = v.indexOf(Math.max(...v));
  const iMn = v.indexOf(Math.min(...v));
  const ultimo = pontos[n - 1].mes;
  const iAA = pontos.findIndex(p => p.mes === somarMeses(ultimo, -12));
  const y0 = Y(Math.max(mn, 0));
  const textoMeta = meta !== null ? `meta ${valorComUnidade(meta, u)}` : '';

  return (
    <svg className="g" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={descricao}>
      {ticks.map(t => (
        <g key={t}>
          <line x1={L} x2={w - R} y1={Y(t)} y2={Y(t)} stroke="var(--line-2)" />
          <text x={w - R + 8} y={Y(t) + 4} fontSize="10" fill="var(--muted)">{eixo(t, u)}</text>
        </g>
      ))}
      {mn < 0 && <line x1={L} x2={w - R} y1={Y(0)} y2={Y(0)} stroke="var(--muted)" strokeWidth=".7" />}
      {pontos.map((p, i) => {
        const atual = i === n - 1;
        const aa = i === iAA;
        let st: 'bom' | 'ruim' | 'neutro' = 'neutro';
        if (meta !== null && polaridade !== 'neutro') st = (polaridade === 'menor_melhor' ? p.valor > meta : p.valor < meta) ? 'ruim' : 'bom';
        const cor = atual
          ? st === 'ruim' ? 'var(--ruim)' : st === 'bom' ? 'var(--bom)' : 'var(--ink)'
          : st === 'ruim' ? 'color-mix(in srgb, var(--ruim) 38%, var(--surface))' : st === 'bom' ? 'color-mix(in srgb, var(--bom) 30%, var(--surface))' : 'var(--line)';
        const y1 = Y(p.valor);
        const rotular = atual || aa || i === iMx || i === iMn;
        const eixoX = trimestral || p.mes.endsWith('-01') || atual || i === 0 || (compacto && i % 3 === 0);
        return (
          <g key={p.mes}>
            <rect x={X(i) - bw * 0.34} y={Math.min(y0, y1)} width={bw * 0.68} height={Math.max(1, Math.abs(y1 - y0))} rx="2" style={{ fill: cor }} {...(aa ? { stroke: 'var(--ink-2)', strokeDasharray: '2 2' } : {})} />
            {rotular && (
              <text x={X(i)} y={(p.valor >= 0 ? Math.min(y0, y1) : Math.max(y0, y1) + 12) - 5} fontSize="10.5" textAnchor="middle" fill={atual ? 'var(--ink)' : 'var(--muted)'} fontWeight={atual ? 600 : 400}>
                {eixo(p.valor, u)}
              </text>
            )}
            {eixoX && <text x={X(i)} y={h - 6} fontSize="10" fill="var(--muted)" textAnchor="middle">{p.rotulo}</text>}
          </g>
        );
      })}
      {meta !== null && (
        <g>
          <line x1={L} x2={w - R} y1={Y(meta)} y2={Y(meta)} stroke="var(--ink-2)" strokeDasharray="5 4" strokeWidth="1.2" />
          <rect x={L} y={Y(meta) - 19} width={textoMeta.length * 6 + 10} height="15" rx="3" fill="var(--surface)" />
          <text x={L + 4} y={Y(meta) - 8} fontSize="10.5" fill="var(--ink-2)">{textoMeta}</text>
        </g>
      )}
    </svg>
  );
}
