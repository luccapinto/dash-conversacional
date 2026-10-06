/**
 * Indicadores do painel: o que aparece nas telas (gerencial, resumo, lista, chips e layouts).
 * Lugar único da regra. Os ocultos continuam no catálogo e nas tools do agente, que ainda pode
 * citá-los ao explicar (ex.: turnover lamentado numa análise de perda de talentos).
 */

import { DOMINIOS, INDICADORES, type Dominio, type IdIndicador, type Indicador } from '@/lib/analytics/catalog';

/** Fora das telas a pedido do Lucca (fase 3) */
export const OCULTOS_PAINEL = [
  'crescimento_liquido',
  'pct_lideranca',
  'turnover_lamentado',
  'tempo_medio_casa',
  'horas_treinamento_pc',
] as const satisfies readonly IdIndicador[];

export const INDICADORES_PAINEL: readonly Indicador[] = INDICADORES.filter(i => !(OCULTOS_PAINEL as readonly string[]).includes(i.id));
export const IDS_PAINEL: readonly IdIndicador[] = INDICADORES_PAINEL.map(i => i.id);

const VISIVEIS: Record<string, true> = Object.fromEntries(IDS_PAINEL.map(id => [id, true]));

export function noPainel(id: string): id is IdIndicador {
  return VISIVEIS[id] === true;
}

/** Domínios na ordem do catálogo, cada um com seus indicadores visíveis */
export const DOMINIOS_PAINEL: readonly { dominio: Dominio; indicadores: readonly Indicador[] }[] = DOMINIOS
  .map(dominio => ({ dominio, indicadores: INDICADORES_PAINEL.filter(i => i.dominio === dominio) }))
  .filter(d => d.indicadores.length > 0);
