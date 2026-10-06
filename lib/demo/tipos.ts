/**
 * Tipos do modo demonstração, sem dependência de servidor: o índice leve (entra no bundle do
 * painel) e a gravação de uma resposta (public/demo/<id>.json, baixada só no clique).
 *
 * A gravação é a lista de eventos que o agente de verdade emitiu (`executarAgente` com um provedor
 * roteirizado, ver lib/demo/gravar.ts): o painel toca pelo mesmo `aplicarEvento` do stream ao vivo.
 */

import type { IdIndicador } from '@/lib/analytics/catalog';
import type { Lente } from '@/lib/analytics/signals';
import type { ContextoDeepDive, EventoAgente } from '@/lib/agente/contrato';

/**
 * influencia: a pergunta do botão ✦ de um indicador ("O que influenciou o resultado de …?");
 * indicador: a segunda pergunta do indicador; historia: uma história de docs/narrativa.md;
 * resumo: uma pergunta sugerida do resumo executivo no recorte padrão.
 */
export type GrupoDemo = 'influencia' | 'indicador' | 'historia' | 'resumo';

export interface ItemDemo {
  id: string;
  grupo: GrupoDemo;
  pergunta: string;
  /** indicador principal da resposta (null em pergunta livre) */
  indicador: IdIndicador | null;
  /** nome do indicador principal, pronto (o client não carrega o catálogo) */
  nome: string | null;
  /** indicadores ligados à resposta: a história aparece nas telas deles */
  indicadores: IdIndicador[];
  /** o recorte real da gravação (período, filtros, ponto, lente) */
  recorte: ContextoDeepDive;
  /** ids de outras gravações oferecidas no fim da resposta */
  continuacoes: string[];
  /** resumo: as lentes do resumo executivo em que a pergunta é sugerida */
  lentes?: Lente[];
}

export interface IndiceDemo {
  itens: ItemDemo[];
}

export interface GravacaoDemo {
  id: string;
  pergunta: string;
  recorte: ContextoDeepDive;
  eventos: EventoAgente[];
}
