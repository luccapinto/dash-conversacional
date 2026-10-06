/**
 * Sinais do detector (fase 1) para as telas: só os que falam de indicadores visíveis, com memória
 * por recorte. O detector leva ~0,5 s na empresa toda (todas as diretorias); a mesma lista serve a
 * página do indicador, o resumo e a entrada do layout da IA.
 */

import type { Diretoria } from '@/lib/analytics/dominio';
import type { MotorCliente, Periodo } from '@/lib/analytics/engine';
import { detectarSinais, type Lente, type Sinal, type TipoSinal } from '@/lib/analytics/signals';
import { noPainel } from './indicadores';

const MAX_MEMORIA = 64;
const memoria = new WeakMap<MotorCliente, Map<string, readonly Sinal[]>>();

/** Sinais do recorte (ordem do detector: score para o público), sem indicadores ocultos. Não mutar. */
export function sinaisVisiveis(motor: MotorCliente, periodo: Periodo, diretoria: Diretoria | null, lente: Lente): readonly Sinal[] {
  let doMotor = memoria.get(motor);
  if (!doMotor) memoria.set(motor, (doMotor = new Map()));
  const chave = `${periodo.inicio}..${periodo.fim}|${diretoria ?? ''}|${lente}`;
  let sinais = doMotor.get(chave);
  if (!sinais) {
    sinais = detectarSinais(motor, { periodo, diretoria: diretoria ?? undefined, lente }).filter(s => s.indicadores.every(noPainel));
    if (doMotor.size >= MAX_MEMORIA) doMotor.delete(doMotor.keys().next().value!);
    doMotor.set(chave, sinais);
  }
  return sinais;
}

export const ROTULO_SINAL: Record<TipoSinal, string> = {
  fora_da_meta: 'fora da meta',
  outlier_entre_diretorias: 'fora da curva',
  quebra_de_tendencia: 'quebra de tendência',
  piora_acelerada: 'piora acelerada',
  sazonalidade: 'sazonalidade',
  indicador_antecedente: 'indicador antecedente',
};
