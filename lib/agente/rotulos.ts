/**
 * Rótulos em PT-BR para recortes e segmentos (passos, títulos de bloco, prompt). Sem números além
 * de meses: títulos e rótulos nunca carregam valores.
 */

import { rotuloMes } from '@/lib/analytics/dominio';
import type { Periodo } from '@/lib/analytics/engine';
import { DESCRICAO_DIMENSAO, type Dimensao, type Filtros } from '@/lib/analytics/fatos';

/** "Out/25 a Set/26" ou "Jan/26" */
export function rotuloPeriodo(p: Periodo): string {
  return p.inicio === p.fim ? rotuloMes(p.inicio) : `${rotuloMes(p.inicio)} a ${rotuloMes(p.fim)}`;
}

/** "Operações · pleno · Out/25 a Set/26" (sem filtros: "Empresa · …") */
export function descreverRecorte(periodo: Periodo, filtros: Filtros = {}): string {
  const valores = Object.values(filtros).filter(Boolean);
  return [...(valores.length ? valores : ['Empresa']), rotuloPeriodo(periodo)].join(' · ');
}

/** { faixaSalarial: 'piso', enps: 'detrator' } → "posição na faixa salarial do cargo: piso + categoria da última resposta de eNPS: detrator" */
export function rotuloSegmento(segmento: Partial<Record<Dimensao, string>>): string {
  return Object.entries(segmento)
    .map(([d, v]) => `${DESCRICAO_DIMENSAO[d as Dimensao]}: ${v}`)
    .join(' + ');
}
