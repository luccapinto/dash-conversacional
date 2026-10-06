/**
 * Dados dos gráficos do resumo ("Destaques da IA"). O layout só pode pedir gráficos que saem dos
 * seus sinais de entrada (graficoDoSinal), então o servidor calcula os dados de todos eles: quando
 * o layout ao vivo chega pelo /api/layout, o client só escolhe quais mostrar, sem motor no navegador.
 */

import { CATALOGO, type IdIndicador, type Polaridade, type Unidade } from '@/lib/analytics/catalog';
import { DIRETORIAS, MES_INICIO, type Diretoria, type Mes } from '@/lib/analytics/dominio';
import type { MotorCliente, Periodo } from '@/lib/analytics/engine';
import type { Sinal } from '@/lib/analytics/signals';
import { graficoDoSinal, type GraficoLayout, type RecorteLayout } from '@/lib/layout/spec';
import { rotuloIntervalo, rotuloTrimestre } from './periodos';

export interface SerieGrafico {
  indicador: IdIndicador;
  nome: string;
  unidade: Unidade;
  meta: number | null;
  pontos: { mes: Mes; rotulo: string; valor: number }[];
}

export type DadosGrafico =
  | { tipo: 'serie' | 'antecedente'; diretoria: Diretoria | null; series: SerieGrafico[]; janela: string }
  | { tipo: 'ranking_diretorias'; diretoria: Diretoria | null; indicador: IdIndicador; nome: string; unidade: Unidade; meta: number | null; polaridade: Polaridade; barras: { rotulo: Diretoria; valor: number | null }[]; janela: string };

export function chaveGrafico(g: Pick<GraficoLayout, 'tipo' | 'indicadores' | 'diretoria'>): string {
  return `${g.tipo}|${g.indicadores.join('>')}|${g.diretoria ?? ''}`;
}

const metaDe = (id: IdIndicador) => {
  const ind = CATALOGO[id];
  return ind.meta && ind.polaridade !== 'neutro' ? ind.meta.valor : null;
};

function serie(motor: MotorCliente, id: IdIndicador, diretoria: Diretoria | null, periodo: Periodo): SerieGrafico {
  const ind = CATALOGO[id];
  const s = motor.serie({ indicador: id, periodo, filtros: diretoria ? { diretoria } : {} });
  return {
    indicador: id,
    nome: ind.nome,
    unidade: ind.unidade,
    meta: metaDe(id),
    pontos: s.pontos.flatMap(p => (p.valor === null ? [] : [{ mes: p.periodo.fim, rotulo: ind.granularidade === 'trimestral' ? rotuloTrimestre(p.periodo.fim) : p.rotulo, valor: p.valor }])),
  };
}

/** Dados de cada gráfico possível do recorte, por chaveGrafico */
export function dadosDosGraficos(motor: MotorCliente, recorte: RecorteLayout, sinais: readonly Sinal[]): Record<string, DadosGrafico> {
  // séries: todo o histórico até o fim do recorte (até 36 meses), como na maquete
  const historico: Periodo = { inicio: MES_INICIO, fim: recorte.periodo.fim };
  const out: Record<string, DadosGrafico> = {};
  for (const s of sinais) {
    const g = graficoDoSinal(s, recorte);
    const chave = chaveGrafico(g);
    if (out[chave]) continue;
    if (g.tipo === 'ranking_diretorias') {
      const id = g.indicadores[0];
      const ind = CATALOGO[id];
      out[chave] = {
        tipo: g.tipo,
        diretoria: g.diretoria,
        indicador: id,
        nome: ind.nome,
        unidade: ind.unidade,
        meta: metaDe(id),
        polaridade: ind.polaridade,
        barras: DIRETORIAS.map(d => ({ rotulo: d, valor: motor.valor({ indicador: id, periodo: recorte.periodo, filtros: { diretoria: d } }).valor })),
        janela: rotuloIntervalo(recorte.periodo),
      };
    } else {
      const series = g.indicadores.map(id => serie(motor, id, g.diretoria, historico));
      out[chave] = { tipo: g.tipo, diretoria: g.diretoria, series, janela: rotuloIntervalo(historico) };
    }
  }
  return out;
}
