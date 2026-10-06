/**
 * Pedidos ao painel da IA: o que abrir (contexto de deep dive, pergunta inicial) e os chips que
 * mostram o recorte. Montados no servidor (botões das telas) ou no client (deep dives do layout);
 * sem catálogo aqui, para o client não carregar o motor: os nomes chegam prontos.
 */

import type { IdIndicador } from '@/lib/analytics/catalog';
import { mesDoAno, rotuloMes, somarMeses } from '@/lib/analytics/dominio';
import type { ContextoDeepDive } from '@/lib/agente/contrato';
import { filtrosDoMotor, lenteDe, type FiltrosPainel } from '@/lib/painel/filtros';
import { periodoSinais, rotuloIntervalo, rotuloTrimestre } from '@/lib/painel/periodos';

export interface PedidoIA {
  /** conversa em memória por chave: reabrir o mesmo pedido não gasta de novo */
  chave: string;
  contexto?: ContextoDeepDive;
  /** feita assim que abre (null = só abre, ex.: botão "Perguntar") */
  pergunta: string | null;
  chips: string[];
}

export interface SugestaoIA {
  pergunta: string;
  pedido: PedidoIA;
}

export const PEDIDO_LIVRE: PedidoIA = { chave: 'livre', pergunta: null, chips: ['Pergunta livre'] };

/** "Turnover voluntário" → "turnover voluntário"; siglas ("eNPS") e "% de vagas…" ficam como estão */
export function nomeNaFrase(nome: string): string {
  return /^\p{Lu}\p{Ll}/u.test(nome) ? nome[0].toLowerCase() + nome.slice(1) : nome;
}

export function pedidoDeContexto(contexto: ContextoDeepDive, pergunta: string, nome: string | null): PedidoIA {
  const filtros = Object.values(contexto.filtros ?? {}).filter(Boolean);
  const chips = [
    ...(nome ? [nome] : []),
    ...(filtros.length ? filtros : ['Empresa toda']),
    rotuloIntervalo(contexto.periodo),
    ...(contexto.ponto?.mes ? [`foco em ${rotuloMes(contexto.ponto.mes)}`] : []),
  ];
  return { chave: JSON.stringify([contexto, pergunta]), contexto, pergunta, chips };
}

/** Botão de IA de uma linha ou da página: "O que influenciou o resultado de <indicador> em <mês>?" */
export function pedidoDoIndicador(id: IdIndicador, nome: string, trimestral: boolean, f: FiltrosPainel): PedidoIA {
  const periodo = periodoSinais(f.mes);
  // eNPS: o ponto é o último ciclo fechado até o mês (o mesmo do "mês" do painel)
  const pontoMes = trimestral ? somarMeses(f.mes, -(mesDoAno(f.mes) % 3)) : f.mes;
  const ponto = pontoMes >= periodo.inicio ? { ponto: { mes: pontoMes } } : {};
  const filtros = filtrosDoMotor(f);
  const contexto: ContextoDeepDive = {
    indicador: id,
    periodo,
    ...(Object.keys(filtros).length ? { filtros } : {}),
    ...ponto,
    lente: lenteDe(f),
  };
  const quando = trimestral && ponto.ponto ? rotuloTrimestre(ponto.ponto.mes) : rotuloMes(f.mes);
  return pedidoDeContexto(contexto, `O que influenciou o resultado de ${nomeNaFrase(nome)} em ${quando}?`, nome);
}
