/**
 * Roteiro do modo demonstração: as 72 perguntas gravadas (25 indicadores × 2, 8 histórias e 14
 * perguntas do resumo executivo). Cada entrada traz o recorte, as chamadas de ferramenta, a frase
 * de narração, o texto final escrito à mão e as continuações. Gravado por scripts/gravar-demo.ts.
 */

import { CATALOGO } from '@/lib/analytics/catalog';
import { IDS_PAINEL } from '@/lib/painel/indicadores';
import type { EntradaRoteiro } from './gravar';
import { ROTEIRO_HISTORIAS } from './roteiro-historias';
import { ROTEIRO_INDICADORES } from './roteiro-indicadores';
import { ROTEIRO_RESUMO } from './roteiro-resumo';

export const ROTEIRO: EntradaRoteiro[] = [...ROTEIRO_INDICADORES, ...ROTEIRO_HISTORIAS, ...ROTEIRO_RESUMO];

/** Regras que o script e o teste conferem antes de gravar (vazio = ok) */
export function validarRoteiro(roteiro: readonly EntradaRoteiro[]): string[] {
  const erros: string[] = [];
  const ids = new Set<string>();
  for (const e of roteiro) {
    if (ids.has(e.id)) erros.push(`${e.id}: id repetido`);
    ids.add(e.id);
  }
  for (const e of roteiro) {
    if (!/^[a-z0-9-]+$/.test(e.id)) erros.push(`${e.id}: id fora do padrão (minúsculas, números e hífen)`);
    if (!e.texto.trim()) erros.push(`${e.id}: sem texto`);
    if (!e.narracao.trim() || e.narracao.length > 240 || e.narracao.includes('\n')) erros.push(`${e.id}: a narração é uma frase curta, sem quebra de linha`);
    if (e.continuacoes.length < 1 || e.continuacoes.length > 2) erros.push(`${e.id}: 1 ou 2 continuações`);
    for (const c of e.continuacoes) if (c === e.id || !ids.has(c)) erros.push(`${e.id}: continuação "${c}" não é outra gravação`);
    const consultas = e.rodadas.flat().length;
    for (const m of e.mostrar) {
      const n = Number(m.resultado.slice(1));
      if (!/^r\d+$/.test(m.resultado) || n < 1 || n > consultas) erros.push(`${e.id}: mostrar ${m.resultado} não é uma consulta do roteiro`);
    }
    if (e.mostrar.length < 1 || e.mostrar.length > 3) erros.push(`${e.id}: mostrar com 1 a 3 blocos`);
    if (e.recorte.indicador && !Object.hasOwn(CATALOGO, e.recorte.indicador)) erros.push(`${e.id}: indicador desconhecido`);
  }
  // cada indicador do painel tem a pergunta do ✦ e uma segunda
  for (const id of IDS_PAINEL) {
    for (const grupo of ['influencia', 'indicador'] as const) {
      const n = roteiro.filter(e => e.grupo === grupo && e.recorte.indicador === id).length;
      if (n !== 1) erros.push(`${id}: ${n} perguntas do grupo ${grupo} (esperado 1)`);
    }
  }
  return erros;
}
