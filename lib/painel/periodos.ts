/**
 * Janelas de tempo do mês selecionado no painel. Uma única regra para o gerencial, a página do
 * indicador, o resumo e o contexto da IA:
 *  - "mês" = o mês; no eNPS, o último ciclo trimestral fechado até o mês (Dez, Mar, Jun, Set: nada
 *    de dado futuro); num indicador de ciclo, os 12 meses até o mês (ver INDICADORES_CICLO).
 *  - "acumulado" = Jan até o mês, no mesmo ano (em 2023 começa no primeiro mês com dado).
 *  - Bases de comparação: período anterior e mesmo período do ano anterior. Sem dado para a base
 *    inteira, a janela é null e a tela mostra "—".
 */

import type { IdIndicador, Indicador } from '@/lib/analytics/catalog';
import { CICLOS_ENPS, MES_INICIO, mesDoAno, rotuloMes, somarMeses, type Mes } from '@/lib/analytics/dominio';
import type { Periodo } from '@/lib/analytics/engine';

/**
 * Indicadores de evento concentrado em ciclos: o mês isolado não se compara com a meta anual (a
 * taxa de promoção de Set/26 é 32% a.a. num mês de ciclo e 1,5% no mês seguinte). Medido nos
 * dados (teste em __tests__/painel/periodos.test.ts): Mar e Set concentram mais de 70% das
 * promoções; nenhum outro fluxo visível passa de 35% nos 2 meses de pico (o turnover involuntário
 * tem pico em janeiro, mas é sazonalidade, não ciclo, e o mês continua comparável).
 */
export const INDICADORES_CICLO: readonly IdIndicador[] = ['taxa_promocao'];

export type TipoMes = 'mes' | 'trimestre' | 'doze_meses';

export interface Janela {
  periodo: Periodo;
  /** "Set/26", "3T26", "12 meses até Set/26", "Jan–Set/26" */
  rotulo: string;
}

export interface Janelas {
  tipoMes: TipoMes;
  mes: Janela | null;
  mesAnt: Janela | null;
  mesAA: Janela | null;
  ytd: Janela;
  ytdM1: Janela | null;
  ytdAA: Janela | null;
}

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** "Set/26"; "Jan–Set/26" no mesmo ano; "Out/25–Set/26" entre anos */
export function rotuloIntervalo(p: Periodo): string {
  if (p.inicio === p.fim) return rotuloMes(p.inicio);
  if (p.inicio.slice(0, 4) === p.fim.slice(0, 4)) return `${MESES_CURTOS[mesDoAno(p.inicio) - 1]}–${rotuloMes(p.fim)}`;
  return `${rotuloMes(p.inicio)}–${rotuloMes(p.fim)}`;
}

/** Mês de fechamento de ciclo de eNPS → "3T26" */
export function rotuloTrimestre(ciclo: Mes): string {
  return `${Math.ceil(mesDoAno(ciclo) / 3)}T${ciclo.slice(2, 4)}`;
}

/** Período dos sinais e do deep dive: 12 meses até o mês, cortados no início dos dados */
export function periodoSinais(mes: Mes): Periodo {
  const inicio = somarMeses(mes, -11);
  return { inicio: inicio < MES_INICIO ? MES_INICIO : inicio, fim: mes };
}

/** Último mês de fechamento de ciclo de eNPS até o mês (Jan e Fev → Dez do ano anterior) */
export function cicloAte(mes: Mes): Mes {
  return somarMeses(mes, -(mesDoAno(mes) % 3));
}

function janelaDoMes(tipo: TipoMes, fim: Mes): Janela | null {
  if (tipo === 'mes') return fim < MES_INICIO ? null : { periodo: { inicio: fim, fim }, rotulo: rotuloMes(fim) };
  if (tipo === 'trimestre') return fim < CICLOS_ENPS[0] ? null : { periodo: { inicio: somarMeses(fim, -2), fim }, rotulo: rotuloTrimestre(fim) };
  const inicio = somarMeses(fim, -11);
  return inicio < MES_INICIO ? null : { periodo: { inicio, fim }, rotulo: `12 meses até ${rotuloMes(fim)}` };
}

function janelaYtd(inicioAno: Mes, fim: Mes): Janela | null {
  const inicio = inicioAno < MES_INICIO ? MES_INICIO : inicioAno;
  if (fim < inicio) return null;
  const periodo = { inicio, fim };
  return { periodo, rotulo: rotuloIntervalo(periodo) };
}

export function janelas(ind: Pick<Indicador, 'id' | 'granularidade'>, mes: Mes): Janelas {
  const tipoMes: TipoMes = ind.granularidade === 'trimestral' ? 'trimestre' : INDICADORES_CICLO.includes(ind.id) ? 'doze_meses' : 'mes';
  // fim da janela do "mês": no eNPS, o último mês de ciclo até o mês selecionado
  const fim = tipoMes === 'trimestre' ? cicloAte(mes) : mes;
  const passo = tipoMes === 'trimestre' ? 3 : 1;
  const ano = mes.slice(0, 4);
  const anoAnterior = String(Number(ano) - 1);
  const ytdAA = `${anoAnterior}-01` < MES_INICIO ? null : janelaYtd(`${anoAnterior}-01`, somarMeses(mes, -12));
  return {
    tipoMes,
    mes: janelaDoMes(tipoMes, fim),
    mesAnt: janelaDoMes(tipoMes, somarMeses(fim, -passo)),
    mesAA: janelaDoMes(tipoMes, somarMeses(fim, -12)),
    ytd: janelaYtd(`${ano}-01`, mes)!,
    ytdM1: mesDoAno(mes) === 1 ? null : janelaYtd(`${ano}-01`, somarMeses(mes, -1)),
    ytdAA,
  };
}
