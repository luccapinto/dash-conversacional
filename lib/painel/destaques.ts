/**
 * Títulos narrativos da IA por indicador, pré-gerados para o recorte padrão (Set/26, empresa toda e
 * as 6 diretorias) por scripts/generate-destaques.ts, com a guarda de números bloqueante: título
 * com número fora da frase determinística e dos sinais do indicador foi descartado na geração.
 * Zero custo de IA por visitante; fora do recorte padrão a página mostra só o destaque automático.
 */

import destaquesJson from '@/lib/dados/cliente/destaques.json';
import { MES_FIM, type Diretoria } from '@/lib/analytics/dominio';
import type { Periodo } from '@/lib/analytics/engine';
import type { FiltrosPainel } from './filtros';
import { periodoSinais } from './periodos';

export interface ArquivoDestaques {
  geradoEm: string | null;
  /** provedor:modelo (null = nenhum título da IA) */
  modelo: string | null;
  /** chave do recorte → indicador → título */
  recortes: Record<string, Record<string, string>>;
}

export const DESTAQUES_IA = destaquesJson as ArquivoDestaques;

export function chaveDestaques(periodo: Periodo, diretoria: Diretoria | null): string {
  return `${periodo.inicio}..${periodo.fim}|${diretoria ?? 'Geral'}`;
}

/** Título da IA para o indicador na tela, só no recorte padrão (sem senioridade) */
export function tituloIA(id: string, f: FiltrosPainel): string | null {
  if (f.mes !== MES_FIM || f.senioridade) return null;
  return DESTAQUES_IA.recortes[chaveDestaques(periodoSinais(f.mes), f.diretoria)]?.[id] ?? null;
}
