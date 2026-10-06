/**
 * Peças do servidor comuns às telas: o recorte do layout para os filtros, o layout da tela
 * (pré-gerado ou determinístico, nunca vazio) e as sugestões do botão "Perguntar".
 */

import 'server-only';
import { CATALOGO } from '@/lib/analytics/catalog';
import type { MotorCliente } from '@/lib/analytics/engine';
import type { Sinal } from '@/lib/analytics/signals';
import { pedidoDeContexto, type SugestaoIA } from '@/lib/ia/pedidos';
import { layoutDeterministico } from '@/lib/layout/deterministico';
import { layoutPadrao } from '@/lib/layout/padrao';
import { sinaisDoRecorte, type LayoutSpec, type RecorteLayout } from '@/lib/layout/spec';
import { lenteDe, type FiltrosPainel } from './filtros';
import { periodoSinais } from './periodos';

export function recorteDaTela(f: FiltrosPainel): RecorteLayout {
  return { periodo: periodoSinais(f.mes), diretoria: f.diretoria, lente: lenteDe(f) };
}

export interface LayoutDaTela {
  recorte: RecorteLayout;
  spec: LayoutSpec;
  /** true = veio do JSON pré-gerado; false = determinístico até /api/layout responder */
  pregerado: boolean;
  /** os sinais de entrada do layout (top 12 visíveis) */
  sinais: Sinal[];
}

export function layoutDaTela(motor: MotorCliente, f: FiltrosPainel): LayoutDaTela {
  const recorte = recorteDaTela(f);
  const sinais = sinaisDoRecorte(motor, recorte);
  const pre = layoutPadrao(recorte);
  return { recorte, spec: pre ?? layoutDeterministico(recorte, sinais), pregerado: pre !== null, sinais };
}

export function nomeIndicador(id: string | undefined): string | null {
  return id && Object.hasOwn(CATALOGO, id) ? CATALOGO[id as keyof typeof CATALOGO].nome : null;
}

/** Os deep dives sugeridos do layout, prontos para o painel da IA */
export function sugestoesDoLayout(spec: LayoutSpec): SugestaoIA[] {
  return spec.deepDives.map(d => ({ pergunta: d.pergunta, pedido: pedidoDeContexto(d.contexto, d.pergunta, nomeIndicador(d.contexto.indicador)) }));
}
