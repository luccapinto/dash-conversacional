/**
 * Atalhos para escrever as chamadas de ferramenta do roteiro da demonstração: os mesmos argumentos
 * que o modelo mandaria (validados pelo agente na gravação).
 */

import type { IdIndicador } from '@/lib/analytics/catalog';
import type { Diretoria } from '@/lib/analytics/dominio';
import type { Periodo } from '@/lib/analytics/engine';
import type { Dimensao, Filtros } from '@/lib/analytics/fatos';
import type { Lente } from '@/lib/analytics/signals';
import type { Consulta } from './gravar';

/** Últimos 12 meses (o recorte das gravações, salvo indicação) */
export const P12: Periodo = { inicio: '2025-10', fim: '2026-09' };
/** 12 meses anteriores */
export const P12_ANTERIOR: Periodo = { inicio: '2024-10', fim: '2025-09' };
/** 24 meses: a série que dá o mesmo mês do ano anterior */
export const P24: Periodo = { inicio: '2024-10', fim: '2026-09' };
/** a janela inteira dos dados */
export const JANELA: Periodo = { inicio: '2023-10', fim: '2026-09' };
export const mes = (m: string): Periodo => ({ inicio: m, fim: m });

const comFiltros = (filtros?: Filtros) => (filtros && Object.keys(filtros).length ? { filtros } : {});

export function valor(indicador: IdIndicador, periodo: Periodo = P12, filtros?: Filtros): Consulta {
  return { ferramenta: 'valor', args: { indicador, periodo, ...comFiltros(filtros) } };
}

export function serie(indicador: IdIndicador, periodo: Periodo = P24, filtros?: Filtros, granularidade?: 'mes' | 'trimestre' | 'ano'): Consulta {
  return { ferramenta: 'serie', args: { indicador, periodo, ...comFiltros(filtros), ...(granularidade ? { granularidade } : {}) } };
}

export function decompor(indicador: IdIndicador, dimensao: Dimensao, periodo: Periodo = P12, filtros?: Filtros): Consulta {
  return { ferramenta: 'decompor', args: { indicador, periodo, dimensao, ...comFiltros(filtros) } };
}

export function cruzar(indicador: IdIndicador, dimensoes: [Dimensao, Dimensao], periodo: Periodo = P12, filtros?: Filtros): Consulta {
  return { ferramenta: 'cruzar', args: { indicador, periodo, dimensoes, ...comFiltros(filtros) } };
}

export function comparar(indicador: IdIndicador, a: { periodo: Periodo; filtros?: Filtros }, b: { periodo: Periodo; filtros?: Filtros }): Consulta {
  const lado = (r: { periodo: Periodo; filtros?: Filtros }) => ({ periodo: r.periodo, ...comFiltros(r.filtros) });
  return { ferramenta: 'comparar', args: { indicador, a: lado(a), b: lado(b) } };
}

export function drivers(indicador: IdIndicador, periodo: Periodo = P12, filtros?: Filtros): Consulta {
  return { ferramenta: 'drivers', args: { indicador, periodo, ...comFiltros(filtros) } };
}

export function impacto(indicador: IdIndicador, periodo: Periodo = P12, filtros?: Filtros): Consulta {
  return { ferramenta: 'impacto', args: { indicador, periodo, ...comFiltros(filtros) } };
}

export function sinais(periodo: Periodo = P12, d?: Diretoria, lente?: Lente): Consulta {
  return { ferramenta: 'sinais', args: { periodo, ...(d ? { diretoria: d } : {}), ...(lente ? { lente } : {}) } };
}
