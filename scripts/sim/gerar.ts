/**
 * Gera o conteúdo de todos os arquivos de dados, sem tocar no disco. Puro e determinístico:
 * duas chamadas no mesmo processo devolvem strings idênticas (o teste de determinismo usa isso).
 *
 * Saídas (caminhos relativos à raiz do repo):
 *  - lib/dados/servidor/roster.json   roster individual (server-only)
 *  - lib/dados/servidor/eventos.json  admissões, desligamentos, promoções, movimentações, vagas (server-only)
 *  - lib/dados/cliente/cubo.json      cubo mês × diretoria × senioridade com todas as medidas (client)
 */

import { construirCubo, construirFatos, type TabelaFatos } from '../../lib/analytics/fatos';
import type { Eventos, Pessoa } from '../../lib/analytics/dominio';
import { derivarEventos } from './eventos';
import { simular } from './simular';

export const ARQUIVO_ROSTER = 'lib/dados/servidor/roster.json';
export const ARQUIVO_EVENTOS = 'lib/dados/servidor/eventos.json';
export const ARQUIVO_CUBO = 'lib/dados/cliente/cubo.json';

export interface Gerado {
  pessoas: Pessoa[];
  eventos: Eventos;
  cubo: TabelaFatos;
  arquivos: Record<string, string>;
}

/** Cubo serializável: arrays simples, chaves em ordem fixa */
export function serializarCubo(cubo: TabelaFatos): string {
  const codigos: Record<string, number[]> = {};
  for (const d of cubo.dims) codigos[d] = Array.from(cubo.codigos[d]!);
  const medidas: Record<string, number[]> = {};
  for (const [m, v] of Object.entries(cubo.medidas)) medidas[m] = Array.from(v!);
  return JSON.stringify({ dims: cubo.dims, n: cubo.n, codigos, medidas });
}

export function gerar(): Gerado {
  const { pessoas, requisicoes } = simular();
  const eventos = derivarEventos(pessoas, requisicoes);
  const cubo = construirCubo(construirFatos(pessoas, requisicoes));
  return {
    pessoas,
    eventos,
    cubo,
    arquivos: {
      [ARQUIVO_ROSTER]: JSON.stringify(pessoas),
      [ARQUIVO_EVENTOS]: JSON.stringify(eventos),
      [ARQUIVO_CUBO]: serializarCubo(cubo),
    },
  };
}
