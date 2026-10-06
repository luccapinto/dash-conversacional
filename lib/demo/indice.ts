/**
 * Índice das respostas gravadas no navegador (lib/dados/cliente/demo.json, ~3 KB gzip): que
 * gravação cada pedido toca, as perguntas prontas de cada tela e se a gravação é de outro recorte
 * que o da tela. As gravações em si (public/demo/<id>.json) só são baixadas no clique.
 */

import type { ContextoDeepDive } from '@/lib/agente/contrato';
import indiceJson from '@/lib/dados/cliente/demo.json';
import type { PedidoIA } from '@/lib/ia/pedidos';
import { FILTROS_PADRAO } from '@/lib/painel/filtros';
import { periodoSinais } from '@/lib/painel/periodos';
import type { IndiceDemo, ItemDemo } from './tipos';

const INDICE = indiceJson as unknown as IndiceDemo;

export const GRAVACOES: ReadonlyMap<string, ItemDemo> = new Map(INDICE.itens.map(i => [i.id, i]));

const ehDoIndicador = (i: ItemDemo) => i.grupo === 'influencia' || i.grupo === 'indicador';

/** A gravação que o pedido toca: a da mesma pergunta; senão, o "O que influenciou" do indicador */
export function gravacaoDoPedido(p: PedidoIA): ItemDemo | null {
  const indicador = p.contexto?.indicador;
  return INDICE.itens.find(i => i.pergunta === p.pergunta) ?? INDICE.itens.find(i => i.grupo === 'influencia' && indicador !== undefined && i.indicador === indicador) ?? null;
}

/**
 * Perguntas prontas da conversa. Na página e no ✦ de um indicador: as 2 perguntas dele + as
 * histórias ligadas a ele. No resumo executivo e no ✦ geral: as histórias + as perguntas do resumo
 * (só as da lente, quando o pedido tem uma).
 */
export function perguntasProntas(p: PedidoIA): ItemDemo[] {
  const inicial = gravacaoDoPedido(p);
  const historias = INDICE.itens.filter(i => i.grupo === 'historia');
  if (inicial && ehDoIndicador(inicial) && inicial.indicador) {
    const id = inicial.indicador;
    return [...INDICE.itens.filter(i => ehDoIndicador(i) && i.indicador === id), ...historias.filter(h => h.indicadores.includes(id))];
  }
  const lente = p.contexto?.lente;
  return [...historias, ...INDICE.itens.filter(i => i.grupo === 'resumo' && (!lente || i.lentes?.includes(lente)))];
}

const PERIODO_PADRAO = periodoSinais(FILTROS_PADRAO.mes);
const filtrosIguais = (a: ContextoDeepDive['filtros'], b: ContextoDeepDive['filtros']) =>
  JSON.stringify(Object.entries(a ?? {}).filter(([, v]) => v).sort()) === JSON.stringify(Object.entries(b ?? {}).filter(([, v]) => v).sort());

/**
 * Recorte honesto: a tela está filtrada (diretoria, senioridade ou outro mês) e a gravação é de
 * outro recorte. Aí a resposta diz que a demonstração só tem a gravação daquele recorte.
 */
export function gravacaoDeOutroRecorte(tela: ContextoDeepDive | undefined, gravacao: ContextoDeepDive): boolean {
  if (!tela) return false;
  const mesmoPeriodo = (a: ContextoDeepDive['periodo'], b: ContextoDeepDive['periodo']) => a.inicio === b.inicio && a.fim === b.fim;
  const filtrada = !filtrosIguais(tela.filtros, undefined) || !mesmoPeriodo(tela.periodo, PERIODO_PADRAO);
  return filtrada && (!filtrosIguais(tela.filtros, gravacao.filtros) || !mesmoPeriodo(tela.periodo, gravacao.periodo));
}
