/**
 * Modelo de vista da aba Gerencial: uma linha por indicador visível, agrupada por domínio, com o
 * bloco do mês e o do acumulado (real, meta e Δ, vs período anterior, vs ano anterior), a série de
 * 12 meses do minigráfico e a contagem de status do acumulado.
 */

import type { Dominio } from '@/lib/analytics/catalog';
import { mesDoAno, rotuloMes, somarMeses } from '@/lib/analytics/dominio';
import type { MotorCliente } from '@/lib/analytics/engine';
import { filtrosDoMotor, type FiltrosPainel } from './filtros';
import { DOMINIOS_PAINEL } from './indicadores';
import { lerIndicador, type Leitura } from './leitura';
import { periodoSinais, rotuloIntervalo } from './periodos';

export interface LinhaGerencial extends Leitura {
  /** valores dos últimos 12 meses (sem os meses sem dado) */
  spark: number[];
}

export interface Gerencial {
  dominios: { dominio: Dominio; linhas: LinhaGerencial[]; fora: number }[];
  /** status do acumulado nos indicadores com meta */
  contagem: { dentro: number; atencao: number; fora: number };
  /** rótulos dos cabeçalhos: "Set/26", "Set/25", "Jan–Set/26", "Ago" (YTD do mês anterior), "2025" */
  rotulos: { mes: string; mesAA: string; ytd: string; ytdM1: string | null; ytdAA: string };
}

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function montarGerencial(motor: MotorCliente, f: FiltrosPainel): Gerencial {
  const filtros = filtrosDoMotor(f);
  const doze = periodoSinais(f.mes);
  const dominios = DOMINIOS_PAINEL.map(({ dominio, indicadores }) => {
    const linhas = indicadores.map((ind): LinhaGerencial => {
      const l = lerIndicador(motor, ind, f.mes, filtros);
      const spark = l.aplicavel
        ? motor.serie({ indicador: ind.id, periodo: doze, filtros }).pontos.flatMap(p => (p.valor === null ? [] : [p.valor]))
        : [];
      return { ...l, spark };
    });
    return { dominio, linhas, fora: linhas.filter(l => l.ytd.medida?.status === 'fora').length };
  });
  const todas = dominios.flatMap(d => d.linhas);
  const conta = (s: string) => todas.filter(l => l.ytd.medida?.status === s).length;
  const ytd = todas[0].janelas.ytd.periodo;
  return {
    dominios,
    contagem: { dentro: conta('dentro'), atencao: conta('atencao'), fora: conta('fora') },
    rotulos: {
      mes: rotuloMes(f.mes),
      mesAA: rotuloMes(somarMeses(f.mes, -12)),
      ytd: rotuloIntervalo(ytd),
      ytdM1: mesDoAno(f.mes) === 1 ? null : MESES_CURTOS[mesDoAno(f.mes) - 2],
      ytdAA: String(Number(f.mes.slice(0, 4)) - 1),
    },
  };
}
