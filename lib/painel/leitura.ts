/**
 * Leitura de um indicador no mês selecionado: valor do "mês" e do acumulado, meta, status e as
 * comparações (período anterior e ano anterior), tudo do motor. Base do gerencial, da página do
 * indicador, do resumo e do destaque determinístico.
 */

import type { Indicador } from '@/lib/analytics/catalog';
import type { Mes } from '@/lib/analytics/dominio';
import { ErroConsulta, type MotorCliente, type Status } from '@/lib/analytics/engine';
import type { Dimensao, Filtros } from '@/lib/analytics/fatos';
import { delta, type Delta } from './formato';
import { janelas, type Janela, type Janelas, type TipoMes } from './periodos';

export interface Medida {
  valor: number | null;
  meta: number | null;
  status: Status;
  n: number | null;
  amostraSuficiente: boolean;
}

export interface Comparacao {
  base: number | null;
  delta: Delta;
}

export interface BlocoLeitura {
  janela: Janela | null;
  medida: Medida | null;
  /** null quando o indicador não tem meta */
  vsMeta: Delta | null;
  /** vs período anterior (mês anterior ou YTD até o mês anterior) */
  ant: Comparacao;
  /** vs mesmo período do ano anterior */
  aa: Comparacao;
}

export interface Leitura {
  id: Indicador['id'];
  nome: string;
  unidade: Indicador['unidade'];
  polaridade: Indicador['polaridade'];
  dominio: Indicador['dominio'];
  trimestral: boolean;
  tipoMes: TipoMes;
  /** false quando um filtro da tela não é dimensão do indicador (ex.: mulheres na liderança × senioridade) */
  aplicavel: boolean;
  janelas: Janelas;
  mes: BlocoLeitura;
  ytd: BlocoLeitura;
}

export function aplicavelA(ind: Indicador, filtros: Filtros): boolean {
  return Object.keys(filtros).every(d => ind.dimensoes.includes(d as Dimensao));
}

export function medir(motor: MotorCliente, ind: Indicador, janela: Janela | null, filtros: Filtros): Medida | null {
  if (!janela) return null;
  try {
    const r = motor.valor({ indicador: ind.id, periodo: janela.periodo, filtros });
    return { valor: r.valor, meta: r.meta, status: r.status, n: r.n, amostraSuficiente: r.amostraSuficiente };
  } catch (e) {
    if (e instanceof ErroConsulta) return null;
    throw e;
  }
}

function bloco(motor: MotorCliente, ind: Indicador, filtros: Filtros, atual: Janela | null, anterior: Janela | null, anoAnterior: Janela | null): BlocoLeitura {
  const medida = medir(motor, ind, atual, filtros);
  const valor = medida?.valor ?? null;
  const comparar = (j: Janela | null): Comparacao => {
    const base = medida ? medir(motor, ind, j, filtros)?.valor ?? null : null;
    return { base, delta: delta(valor, base, ind.unidade, ind.polaridade) };
  };
  return {
    janela: atual,
    medida,
    vsMeta: medida && medida.meta !== null ? delta(valor, medida.meta, ind.unidade, ind.polaridade) : null,
    ant: comparar(anterior),
    aa: comparar(anoAnterior),
  };
}

export function lerIndicador(motor: MotorCliente, ind: Indicador, mes: Mes, filtros: Filtros): Leitura {
  const j = janelas(ind, mes);
  const aplicavel = aplicavelA(ind, filtros);
  const vazio: BlocoLeitura = { janela: null, medida: null, vsMeta: null, ant: { base: null, delta: delta(null, null, ind.unidade, ind.polaridade) }, aa: { base: null, delta: delta(null, null, ind.unidade, ind.polaridade) } };
  return {
    id: ind.id,
    nome: ind.nome,
    unidade: ind.unidade,
    polaridade: ind.polaridade,
    dominio: ind.dominio,
    trimestral: ind.granularidade === 'trimestral',
    tipoMes: j.tipoMes,
    aplicavel,
    janelas: j,
    mes: aplicavel ? bloco(motor, ind, filtros, j.mes, j.mesAnt, j.mesAA) : { ...vazio, janela: j.mes },
    ytd: aplicavel ? bloco(motor, ind, filtros, j.ytd, j.ytdM1, j.ytdAA) : { ...vazio, janela: j.ytd },
  };
}
