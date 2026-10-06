/**
 * Modelo de vista da página do indicador: leitura do mês e do acumulado, evolução mês a mês,
 * quebra por diretoria (ou por senioridade quando há diretoria filtrada), destaque determinístico
 * montado dos números e os sinais do detector para o indicador.
 */

import type { Indicador } from '@/lib/analytics/catalog';
import { DIRETORIAS, MES_INICIO, SENIORIDADES, rotuloMes, somarMeses, type Mes } from '@/lib/analytics/dominio';
import type { MotorCliente, Status } from '@/lib/analytics/engine';
import type { Filtros } from '@/lib/analytics/fatos';
import type { Sinal } from '@/lib/analytics/signals';
import { filtrosDoMotor, type FiltrosPainel } from './filtros';
import { delta, valorComUnidade, type Delta } from './formato';
import { INDICADORES_PAINEL } from './indicadores';
import { lerIndicador, medir, type Leitura } from './leitura';
import { janelas, periodoSinais, rotuloTrimestre, type Janela } from './periodos';
import { ROTULO_SINAL } from './sinais';

export interface PontoEvolucao {
  /** último mês do ponto (mês, fim do ciclo ou fim dos 12 meses móveis) */
  mes: Mes;
  rotulo: string;
  valor: number;
}

export interface LinhaQuebra {
  rotulo: string;
  mes: number | null;
  ytd: number | null;
  status: Status | null;
  vsMeta: Delta | null;
  /** últimos 12 meses (sem meses vazios) */
  spark: number[];
  /** amostra abaixo do mínimo no acumulado */
  fragil: boolean;
  /** segmento que está filtrado na tela */
  atual: boolean;
}

export interface Quebra {
  dimensao: 'diretoria' | 'senioridade';
  aplicavel: boolean;
  linhas: LinhaQuebra[];
  total: LinhaQuebra;
}

export interface SinalIndicador {
  tipo: string;
  onde: string;
  evidencia: string;
}

export interface PaginaIndicador {
  leitura: Leitura;
  meta: number | null;
  /** 24 meses (ou 8 ciclos) até o mês; o celular mostra os últimos 12 meses (4 ciclos) */
  evolucao: PontoEvolucao[];
  quebra: Quebra;
  /** frase determinística com **negrito** markdown */
  destaque: string;
  sinais: SinalIndicador[];
}

const N_EVOLUCAO = 24;

function evolucao(motor: MotorCliente, ind: Indicador, l: Leitura, mes: Mes, filtros: Filtros): PontoEvolucao[] {
  if (!l.aplicavel) return [];
  const ini = somarMeses(mes, -(N_EVOLUCAO - 1));
  const inicio = ini < MES_INICIO ? MES_INICIO : ini;
  if (l.tipoMes === 'doze_meses') {
    const pontos: PontoEvolucao[] = [];
    for (let m = inicio; m <= mes; m = somarMeses(m, 1)) {
      const j = janelas(ind, m).mes;
      const v = j ? medir(motor, ind, j, filtros)?.valor ?? null : null;
      if (v !== null) pontos.push({ mes: m, rotulo: rotuloMes(m), valor: v });
    }
    return pontos;
  }
  const s = motor.serie({ indicador: ind.id, periodo: { inicio, fim: mes }, filtros });
  return s.pontos.flatMap(p => {
    if (p.valor === null) return [];
    // eNPS: um ponto por ciclo (o mês de ciclo tem valor; os demais vêm vazios)
    return [{ mes: p.periodo.fim, rotulo: l.trimestral ? rotuloTrimestre(p.periodo.fim) : p.rotulo, valor: p.valor }];
  });
}

function linhaQuebra(motor: MotorCliente, ind: Indicador, j: { mes: Janela | null; ytd: Janela }, mes: Mes, rotulo: string, filtros: Filtros, atual: boolean): LinhaQuebra {
  const m = medir(motor, ind, j.mes, filtros);
  const y = medir(motor, ind, j.ytd, filtros);
  const ytd = y?.valor ?? null;
  const spark = motor.serie({ indicador: ind.id, periodo: periodoSinais(mes), filtros }).pontos.flatMap(p => (p.valor === null ? [] : [p.valor]));
  return {
    rotulo,
    mes: m?.valor ?? null,
    ytd,
    status: y?.status ?? null,
    vsMeta: ind.meta && ind.polaridade !== 'neutro' ? delta(ytd, ind.meta.valor, ind.unidade, ind.polaridade) : null,
    spark,
    fragil: y ? !y.amostraSuficiente : false,
    atual,
  };
}

function quebra(motor: MotorCliente, ind: Indicador, l: Leitura, f: FiltrosPainel): Quebra {
  const dimensao = f.diretoria ? 'senioridade' : 'diretoria';
  const base = filtrosDoMotor(f);
  const { [dimensao]: selecionado, ...semDimensao } = base;
  const j = { mes: l.janelas.mes, ytd: l.janelas.ytd };
  const rotuloTotal = [f.diretoria ?? 'Empresa', ...(f.senioridade && dimensao !== 'senioridade' ? [f.senioridade] : [])].join(' · ');
  const total = linhaQuebra(motor, ind, j, f.mes, rotuloTotal, semDimensao, false);
  const aplicavel = l.aplicavel && ind.dimensoes.includes(dimensao);
  if (!aplicavel) return { dimensao, aplicavel, linhas: [], total };
  const valores: readonly string[] = dimensao === 'diretoria' ? DIRETORIAS : SENIORIDADES;
  const linhas = valores.map(v => linhaQuebra(motor, ind, j, f.mes, v, { ...semDimensao, [dimensao]: v }, v === selecionado));
  // do pior para o melhor no acumulado; sem polaridade, do maior para o menor; sem valor no fim
  const ordem = (x: LinhaQuebra) => (x.ytd === null ? Infinity : ind.polaridade === 'maior_melhor' ? x.ytd : -x.ytd);
  linhas.sort((a, b) => ordem(a) - ordem(b));
  return { dimensao, aplicavel, linhas, total };
}

/** Frase determinística: acumulado vs meta, vs ano anterior, pior e melhor segmento da quebra */
export function destaqueAutomatico(l: Leitura, q: Quebra): string {
  const y = l.ytd;
  const v = y.medida?.valor ?? null;
  if (v === null || !y.janela) return `${l.nome}: sem dado no recorte.`;
  const u = l.unidade;
  const quando = y.janela.periodo.inicio.endsWith('-01') ? 'no ano' : `em ${y.janela.rotulo}`;
  const vsMeta = y.vsMeta && y.medida?.meta != null ? `, ${y.vsMeta.texto} vs a meta de ${valorComUnidade(y.medida.meta, u)}` : '';
  const vsAA = y.aa.base !== null && l.janelas.ytdAA ? ` (${y.aa.delta.texto} contra ${l.janelas.ytdAA.rotulo})` : '';
  let frase = `${l.nome} acumula **${valorComUnidade(v, u)}** ${quando}${vsMeta}${vsAA}.`;
  const comValor = q.linhas.filter(x => x.ytd !== null);
  if (comValor.length >= 2) {
    const [pior, melhor] = [comValor[0], comValor[comValor.length - 1]];
    const neutro = l.polaridade === 'neutro';
    frase += ` ${neutro ? 'Maior valor' : 'Pior resultado'} em **${pior.rotulo}** (${valorComUnidade(pior.ytd, u)}); ${neutro ? 'menor' : 'melhor'} em **${melhor.rotulo}** (${valorComUnidade(melhor.ytd, u)}).`;
  }
  return frase;
}

export function montarIndicador(motor: MotorCliente, ind: Indicador, f: FiltrosPainel, sinais: readonly Sinal[]): PaginaIndicador {
  const filtros = filtrosDoMotor(f);
  const leitura = lerIndicador(motor, ind, f.mes, filtros);
  const q = quebra(motor, ind, leitura, f);
  return {
    leitura,
    meta: ind.meta && ind.polaridade !== 'neutro' ? ind.meta.valor : null,
    evolucao: evolucao(motor, ind, leitura, f.mes, filtros),
    quebra: q,
    destaque: destaqueAutomatico(leitura, q),
    sinais: sinais
      .filter(s => s.indicadores.includes(ind.id))
      .slice(0, 4)
      .map(s => ({ tipo: ROTULO_SINAL[s.tipo], onde: s.diretoria ?? 'empresa', evidencia: s.evidencia })),
  };
}

/** Status do acumulado de cada indicador visível (bolinhas da lista e dos chips) */
export function statusDoPainel(motor: MotorCliente, f: FiltrosPainel): Record<string, Status | null> {
  const filtros = filtrosDoMotor(f);
  return Object.fromEntries(INDICADORES_PAINEL.map(ind => [ind.id, medir(motor, ind, janelas(ind, f.mes).ytd, filtros)?.status ?? null]));
}
