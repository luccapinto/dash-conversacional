/**
 * Roster individual — módulo SERVER-ONLY
 *
 * Importa pessoas.json (~1MB: todas as pessoas, ativas e desligadas) para
 * habilitar TAXA real por qualquer junção de atributos e a base de uma
 * watchlist preditiva de retenção.
 *
 * Vive separado de lib/calculations/index.ts de propósito: o index é puxado
 * pelo dashboard (client component) e não deve carregar o roster no bundle do
 * navegador. Este módulo é consumido apenas pela rota de chat (server-side).
 *
 * Reusa os primitivos determinísticos do index (resolvePeriodo, filter, etc.)
 * para que a fonte de números continue única.
 */

import pessoasRaw from '@/lib/data/pessoas.json';
import type {
  RegistroPessoa,
  RegistroDesligamento,
  Diretoria,
  Periodo,
  TipoDesligamento,
  DimensaoBreakdown,
  ResultadoCrossBreakdown,
  CelulaCross,
} from '@/lib/types';
import {
  resolvePeriodo,
  filterDesligamentos,
  sumHeadcount,
  calcTaxa,
  MIN_AMOSTRA,
} from './index';

const PESSOAS = pessoasRaw as unknown as RegistroPessoa[];
const ATIVOS = PESSOAS.filter(p => p.status === 'ativo');

/** Atributos categóricos presentes em TODA pessoa — habilitam taxa real por junção */
const ATRIBUTOS_POPULACAO: DimensaoBreakdown[] = [
  'senioridade', 'posicionamentoFaixa', 'nivelPerformance', 'clusterLideranca',
  'nivelSatisfacao', 'modalidadeTrabalho', 'especialidade', 'cargo', 'tendenciaPerformance',
];

/** Conta funcionários ATIVOS numa diretoria que batem com um predicado de atributos */
export function countAtivos(diretoria: Diretoria, match: (p: RegistroPessoa) => boolean): number {
  return ATIVOS.filter(p => (diretoria === 'Geral' || p.diretoria === diretoria) && match(p)).length;
}

/**
 * Cruzamento de duas dimensões — encontra o segmento de interseção mais crítico
 * e, quando ambas as dimensões existem na população, calcula a TAXA e o LIFT
 * REAIS da junção (não o produto de marginais). Ex: alta performance × piso
 * salarial sai muito acima do que cada fator isolado preveria.
 *
 * @param periodo    - Período de análise
 * @param diretoria  - Diretoria ou 'Geral'
 * @param dimensao1  - Primeira dimensão de corte
 * @param dimensao2  - Segunda dimensão de corte
 * @param tipoDesligamento - Pré-filtrar por tipo de saída
 */
export function crossBreakdown(
  periodo: Periodo,
  diretoria: Diretoria = 'Geral',
  dimensao1: DimensaoBreakdown,
  dimensao2: DimensaoBreakdown,
  tipoDesligamento?: TipoDesligamento,
): ResultadoCrossBreakdown {
  const { mesesAtual, label } = resolvePeriodo(periodo);
  const desl = filterDesligamentos(mesesAtual, diretoria, tipoDesligamento);
  const total = desl.length;

  // Taxa mensal geral e tamanho da população ativa — base para taxa/lift por célula
  const taxaGeral = calcTaxa(total, sumHeadcount(mesesAtual, diretoria));
  const totalAtivos = countAtivos(diretoria, () => true);
  // Junção real só é possível quando ambas as dimensões existem em toda pessoa
  const podeJuntar = ATRIBUTOS_POPULACAO.includes(dimensao1) && ATRIBUTOS_POPULACAO.includes(dimensao2) && totalAtivos > 0;

  const buckets = new Map<string, { v1: string; v2: string; n: number }>();
  for (const d of desl) {
    const v1 = String(d[dimensao1 as keyof RegistroDesligamento]);
    const v2 = String(d[dimensao2 as keyof RegistroDesligamento]);
    const key = `${v1}||${v2}`;
    const cur = buckets.get(key) ?? { v1, v2, n: 0 };
    cur.n++;
    buckets.set(key, cur);
  }

  const celulas: CelulaCross[] = [...buckets.values()]
    .map(c => {
      const cell: CelulaCross = {
        valor1: c.v1, valor2: c.v2, desligamentos: c.n,
        percentual: total > 0 ? parseFloat((c.n / total * 100).toFixed(1)) : 0,
      };
      if (podeJuntar) {
        // População ativa exata da junção (não o produto de marginais)
        const popCelula = countAtivos(diretoria, p =>
          String(p[dimensao1 as keyof RegistroPessoa]) === c.v1 &&
          String(p[dimensao2 as keyof RegistroPessoa]) === c.v2);
        const jointShare = popCelula / totalAtivos;
        cell.lift = jointShare > 0 && total > 0 ? parseFloat(((c.n / total) / jointShare).toFixed(2)) : null;
        cell.taxaCelula = cell.lift !== null ? parseFloat((taxaGeral * cell.lift).toFixed(4)) : null;
      }
      return cell;
    })
    .sort((a, b) => b.desligamentos - a.desligamentos)
    .slice(0, 12);

  const top = celulas[0];
  const destaque = top && top.desligamentos >= MIN_AMOSTRA
    ? (top.lift != null
        ? `${top.valor1} × ${top.valor2} concentra ${top.percentual}% das saídas (${top.desligamentos} pessoas) e sai ${top.lift}× acima do esperado.`
        : `${top.valor1} × ${top.valor2} concentra ${top.percentual}% das saídas (${top.desligamentos} pessoas).`)
    : null;

  return { dimensao1, dimensao2, diretoria, periodo: label, totalDesligamentos: total, celulas, destaque };
}
