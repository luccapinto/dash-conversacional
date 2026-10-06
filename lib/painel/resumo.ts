/**
 * Modelo de vista do Resumo executivo (parte sem IA): placar de metas (mês, acumulado e mesmo
 * período do ano anterior, só indicadores visíveis com meta) e, por domínio, cada meta com status,
 * valor, Δ vs meta e o motivo (evidência do sinal de maior peso, preferindo o desfavorável). O
 * resumo é por diretoria: a senioridade não entra (os sinais e os layouts não se abrem por ela).
 */

import type { Dominio, IdIndicador } from '@/lib/analytics/catalog';
import type { MotorCliente, Status } from '@/lib/analytics/engine';
import type { Sinal } from '@/lib/analytics/signals';
import { filtrosDoMotor, type FiltrosPainel } from './filtros';
import type { Delta } from './formato';
import { valorComUnidade } from './formato';
import { DOMINIOS_PAINEL } from './indicadores';
import { lerIndicador, medir } from './leitura';
import { ROTULO_SINAL } from './sinais';

export interface Contagem {
  dentro: number;
  atencao: number;
  fora: number;
}

export interface ItemResumo {
  id: IdIndicador;
  nome: string;
  status: Status;
  /** acumulado com unidade */
  valor: string;
  vsMeta: Delta | null;
  motivo: { tipo: string | null; texto: string };
}

export interface ResumoBase {
  placar: { mes: Contagem; ytd: Contagem; aa: Contagem | null; total: number; rotulos: { mes: string; ytd: string; aa: string | null } };
  dominios: { dominio: Dominio; itens: ItemResumo[] }[];
}

const ORDEM_STATUS: Record<string, number> = { fora: 0, atencao: 1, dentro: 2 };

export function motivoDe(id: IdIndicador, sinais: readonly Sinal[], status: Status): ItemResumo['motivo'] {
  const doIndicador = sinais.filter(s => s.indicadores.includes(id));
  const s = doIndicador.find(x => x.direcao === 'desfavoravel') ?? doIndicador[0];
  if (s) return { tipo: ROTULO_SINAL[s.tipo], texto: s.evidencia };
  return {
    tipo: null,
    texto: status === 'dentro' ? 'Na meta, sem sinal de risco detectado no período.' : 'Sem sinal relevante detectado: desvio difuso, sem diretoria ou mês que concentre.',
  };
}

export function montarResumo(motor: MotorCliente, f: FiltrosPainel, sinais: readonly Sinal[]): ResumoBase {
  const filtros = filtrosDoMotor({ ...f, senioridade: null });
  const conta = (): Contagem => ({ dentro: 0, atencao: 0, fora: 0 });
  const [mes, ytd, aa] = [conta(), conta(), conta()];
  const somar = (c: Contagem, s: Status | undefined) => {
    if (s === 'dentro' || s === 'atencao' || s === 'fora') c[s]++;
  };
  let total = 0;
  let rotulos: ResumoBase['placar']['rotulos'] = { mes: '', ytd: '', aa: null };

  const dominios = DOMINIOS_PAINEL.map(({ dominio, indicadores }) => {
    const itens = indicadores
      .filter(ind => ind.meta && ind.polaridade !== 'neutro')
      .map((ind): ItemResumo => {
        const l = lerIndicador(motor, ind, f.mes, filtros);
        const status = l.ytd.medida?.status ?? 'sem_dados';
        total++;
        somar(mes, l.mes.medida?.status);
        somar(ytd, status);
        somar(aa, medir(motor, ind, l.janelas.ytdAA, filtros)?.status);
        if (l.tipoMes === 'mes') rotulos = { mes: l.mes.janela?.rotulo ?? '', ytd: l.janelas.ytd.rotulo, aa: l.janelas.ytdAA?.rotulo ?? null };
        return { id: ind.id, nome: ind.nome, status, valor: valorComUnidade(l.ytd.medida?.valor ?? null, ind.unidade), vsMeta: l.ytd.vsMeta, motivo: motivoDe(ind.id, sinais, status) };
      })
      .sort((a, b) => (ORDEM_STATUS[a.status] ?? 3) - (ORDEM_STATUS[b.status] ?? 3));
    return { dominio, itens };
  }).filter(d => d.itens.length > 0);

  return { placar: { mes, ytd, aa: rotulos.aa ? aa : null, total, rotulos }, dominios };
}
