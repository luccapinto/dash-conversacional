/**
 * Série em linha (SVG puro) com meta tracejada e anotações ancoradas nos pontos: pílula violeta,
 * porque o texto da anotação vem da IA. Portado de linhaSerie da maquete aprovada.
 */

import type { Unidade } from '@/lib/analytics/catalog';
import type { Mes } from '@/lib/analytics/dominio';
import { eixo, valorComUnidade } from '@/lib/painel/formato';

export interface PontoLinha {
  mes: Mes;
  rotulo: string;
  valor: number;
}

export interface NotaLinha {
  mes: Mes;
  texto: string;
}

interface Props {
  pontos: readonly PontoLinha[];
  unidade: Unidade;
  meta: number | null;
  notas?: readonly NotaLinha[];
  compacto?: boolean;
  /** altura menor (duas séries empilhadas no antecedente) */
  baixa?: boolean;
  descricao: string;
}

export function Linha({ pontos, unidade: u, meta, notas = [], compacto = false, baixa = false, descricao }: Props) {
  if (pontos.length < 2) return <p className="sub">Série curta demais para o gráfico.</p>;
  const v = pontos.map(p => p.valor);
  let mn = Math.min(...v, meta ?? Infinity);
  let mx = Math.max(...v, meta ?? -Infinity);
  if (mn > 0 && u !== 'pontos') mn = 0;
  const pad = (mx - mn) * 0.12 || 1;
  mx += pad;
  if (mn < 0) mn -= pad;
  const w = compacto ? 370 : 640;
  const h = baixa ? 130 : compacto ? 210 : 190;
  const [L, R, Tp, B] = [6, 48, 26, 22];
  const X = (i: number) => L + (i / (pontos.length - 1)) * (w - L - R);
  const Y = (y: number) => Tp + (1 - (y - mn) / (mx - mn)) * (h - Tp - B);
  const ticks = [...new Set([mn < 0 ? mn + pad : mn, (mn + mx) / 2, mx - pad].map(t => +t.toPrecision(2)))];
  const caminho = `M${pontos.map((p, i) => `${X(i).toFixed(1)},${Y(p.valor).toFixed(1)}`).join('L')}`;
  const n = pontos.length;

  return (
    <svg className="g" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={descricao}>
      {ticks.map(t => (
        <g key={t}>
          <line x1={L} x2={w - R} y1={Y(t)} y2={Y(t)} stroke="var(--line-2)" />
          <text x={w - R + 6} y={Y(t) + 4} fontSize="10" fill="var(--muted)">{eixo(t, u)}</text>
        </g>
      ))}
      {meta !== null && (
        <g>
          <line x1={L} x2={w - R} y1={Y(meta)} y2={Y(meta)} stroke="var(--meta)" strokeDasharray="4 4" />
          <text x={L + 2} y={Y(meta) - 5} fontSize="10" fill="var(--muted)">meta {valorComUnidade(meta, u)}</text>
        </g>
      )}
      {pontos.map((p, i) =>
        p.mes.endsWith('-01') || i === n - 1 ? (
          <text key={p.mes} x={X(i)} y={h - 6} fontSize="10" fill="var(--muted)" textAnchor={i === n - 1 ? 'end' : 'middle'}>{p.rotulo}</text>
        ) : null,
      )}
      <path d={caminho} fill="none" stroke="var(--ink)" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx={X(n - 1)} cy={Y(v[n - 1])} r="3" fill="var(--ink)" />
      {notas.map(nota => {
        const i = pontos.findIndex(p => p.mes === nota.mes);
        if (i < 0) return null;
        const [x, y] = [X(i), Y(v[i])];
        const esq = i > n * 0.62;
        const ty = Math.max(4, y - 22);
        const tw = Math.min(nota.texto.length * 6.1 + 14, w - 20);
        const bx = Math.max(2, Math.min(esq ? x - tw - 8 : x + 8, w - tw - 2));
        return (
          <g key={`${nota.mes}-${nota.texto}`}>
            <circle cx={x} cy={y} r="5" fill="var(--surface)" stroke="var(--ia)" strokeWidth="2" />
            <line x1={x} y1={y - 5} x2={esq ? bx + tw : bx} y2={ty + 9} stroke="var(--ia)" />
            <rect x={bx} y={ty} width={tw} height="19" rx="9.5" fill="var(--ia-soft)" stroke="var(--ia-line)" />
            <text x={bx + 7} y={ty + 13} fontSize="11" fill="var(--ia)" fontWeight="500">{nota.texto}</text>
          </g>
        );
      })}
    </svg>
  );
}
