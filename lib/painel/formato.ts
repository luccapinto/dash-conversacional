/**
 * Formatação dos números do painel (pt-BR) e do Δ entre dois valores. Puro e sem catálogo: roda no
 * servidor (telas) e no client (blocos da IA).
 *
 * Δ: indicador em % → p.p.; eNPS (pontos) → pontos inteiros; demais → variação %. Cor pela
 * polaridade (verde melhora, laranja piora, cinza neutro). Zero no arredondamento exibido sai sem
 * sinal e cinza. Sem base (ou base zero na variação %) = "—".
 */

import type { Polaridade, Unidade } from '@/lib/analytics/catalog';

export type Tom = 'bom' | 'ruim' | 'neutro';
export interface Delta {
  texto: string;
  tom: Tom;
}

export const SEM_VALOR = '—';
const MENOS = '−';

const FORMATOS: Record<number, Intl.NumberFormat> = {
  0: new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  1: new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  2: new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};

/** Número pt-BR com `casas` decimais e sinal de menos tipográfico ("−0,0" sai "0,0") */
export function br(v: number, casas = 1): string {
  const s = FORMATOS[casas].format(v);
  return /^-0(,0+)?$/.test(s) ? s.slice(1) : s.replace('-', MENOS);
}

export function ehPercentual(u: Unidade): boolean {
  return u === '%' || u === '% a.a.';
}

const ehMonetario = (u: Unidade) => u === 'R$' || u === 'R$/mês';

/** [número, unidade] para exibir com tamanhos diferentes (cards) */
export function partes(v: number | null, u: Unidade): [string, string] {
  if (v === null) return [SEM_VALOR, ''];
  if (ehPercentual(u)) return [br(v), u];
  if (u === 'pontos') return [`${v >= 0.5 ? '+' : ''}${br(v, 0)}`, ''];
  if (ehMonetario(u)) return Math.abs(v) >= 1e6 ? [`R$ ${br(v / 1e6)}`, 'mi'] : [`R$ ${br(v / 1e3)}`, 'mil'];
  if (u === 'dias') return [br(v, 0), 'dias'];
  if (u === 'pessoas' || u === 'vagas') return [br(v, 0), ''];
  if (u === 'anos') return [br(v), 'anos'];
  if (u === 'h/pessoa/mês' || u === 'h/pessoa/ano') return [br(v), 'h'];
  return [br(v), ''];
}

/** "16,0 % a.a.", "45 dias", "R$ 6,2 mi" */
export function valorComUnidade(v: number | null, u: Unidade): string {
  return partes(v, u).join(' ').trim();
}

/** Número da tabela: "16,3%", "4.972", "6,2 mi", "+4" */
export function curto(v: number | null, u: Unidade): string {
  if (v === null) return SEM_VALOR;
  if (ehMonetario(u)) return Math.abs(v) >= 1e6 ? `${br(v / 1e6)} mi` : `${br(v / 1e3)} mil`;
  const [n] = partes(v, u);
  return ehPercentual(u) ? `${n}%` : n;
}

/** Rótulo de eixo de gráfico */
export function eixo(t: number, u: Unidade): string {
  if (t === 0) return '0';
  if (ehMonetario(u)) return Math.abs(t) >= 1e6 ? `${br(t / 1e6)} mi` : `${br(t / 1e3, 0)} mil`;
  if (u === 'pontos') return `${t > 0 ? '+' : ''}${br(t, 0)}`;
  if (ehPercentual(u)) return `${br(t, 0)}%`;
  return br(t, Math.abs(t) < 10 ? 1 : 0);
}

/** Δ de `a` contra a base `b` */
export function delta(a: number | null, b: number | null, u: Unidade, pol: Polaridade): Delta {
  if (a === null || b === null) return { texto: SEM_VALOR, tom: 'neutro' };
  let d: number;
  let casas: number;
  let sufixo: string;
  if (ehPercentual(u)) [d, casas, sufixo] = [a - b, 1, ' p.p.'];
  else if (u === 'pontos') [d, casas, sufixo] = [a - b, 0, ' pts'];
  else {
    if (b === 0) return { texto: SEM_VALOR, tom: 'neutro' };
    [d, casas, sufixo] = [(a / b - 1) * 100, 1, '%'];
  }
  const zero = Math.round(Math.abs(d) * 10 ** casas) === 0;
  const sinal = zero ? '' : d > 0 ? '+' : MENOS;
  const tom: Tom = zero || pol === 'neutro' ? 'neutro' : (d > 0) === (pol === 'maior_melhor') ? 'bom' : 'ruim';
  return { texto: `${sinal}${FORMATOS[casas].format(Math.abs(d))}${sufixo}`, tom };
}
