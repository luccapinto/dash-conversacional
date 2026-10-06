/**
 * Rótulos em PT-BR para recortes e segmentos (passos, títulos de bloco, prompt). Sem valores
 * medidos: títulos e rótulos só carregam meses e nomes de categoria.
 */

import { rotuloMes } from '@/lib/analytics/dominio';
import type { Periodo } from '@/lib/analytics/engine';
import type { Dimensao, Filtros } from '@/lib/analytics/fatos';

/** "Out/25 a Set/26" ou "Jan/26" */
export function rotuloPeriodo(p: Periodo): string {
  return p.inicio === p.fim ? rotuloMes(p.inicio) : `${rotuloMes(p.inicio)} a ${rotuloMes(p.fim)}`;
}

/** "Operações · pleno · Out/25 a Set/26" (sem filtros: "Empresa · …") */
export function descreverRecorte(periodo: Periodo, filtros: Filtros = {}): string {
  const valores = Object.values(filtros).filter(Boolean);
  return [...(valores.length ? valores : ['Empresa']), rotuloPeriodo(periodo)].join(' · ');
}

/** Valor de cada dimensão como se lê numa linha de tabela; diretoria, especialidade, gênero e modalidade se explicam sozinhos */
const LEITURA_VALOR: Partial<Record<Dimensao, (v: string) => string>> = {
  senioridade: v => (v === 'diretoria' ? 'nível diretoria' : v),
  raca: v => `cor/raça ${v}`,
  pcd: v => (v === 'sim' ? 'PcD' : 'sem deficiência'),
  faixaEtaria: v => `${v} anos`,
  tempoCasa: v => `${v} de casa`,
  faixaSalarial: v => `${/^q\d$/.test(v) ? v.toUpperCase() : v} da faixa salarial`,
  performance: v => `avaliação ${v}`,
  enps: v => `eNPS ${v}`,
  mobilidadeRecente: v => (v === 'sim' ? 'movimentou-se em 12 meses' : 'sem movimentação em 12 meses'),
  trocasGestor: v => (v === '0' ? 'sem troca de gestor' : `${v} ${v === '1' ? 'troca' : 'trocas'} de gestor`),
  onboarding: v => `onboarding ${v}`,
};

/** { especialidade: 'Controladoria & FP&A', performance: 'acima' } → "Controladoria & FP&A + avaliação acima" */
export function rotuloSegmento(segmento: Partial<Record<Dimensao, string>>): string {
  return Object.entries(segmento)
    .map(([d, v]) => LEITURA_VALOR[d as Dimensao]?.(v) ?? v)
    .join(' + ');
}
