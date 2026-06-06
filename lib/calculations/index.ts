/**
 * Camada semântica — funções de cálculo determinísticas
 *
 * Estas funções são a ÚNICA fonte de números do projeto:
 *   - alimentam os gráficos do dashboard (M4)
 *   - são expostas como tools ao modelo via function calling (M6)
 *
 * Princípio de guardrail: o modelo nunca calcula nem inventa valores.
 * Ele chama estas funções e usa os resultados na resposta.
 *
 * Todos os parâmetros opcionais têm default explícito para facilitar
 * a geração de tool calls pelo modelo.
 *
 * Refs: LUC-163, LUC-164
 */

import desligamentosRaw from '@/lib/data/desligamentos.json';
import headcountRaw from '@/lib/data/headcount.json';
import populacaoRaw from '@/lib/data/populacao.json';
import type {
  RegistroDesligamento,
  HeadcountMensal,
  PopulacaoDiretoria,
  Diretoria,
  Periodo,
  TipoDesligamento,
  DimensaoBreakdown,
  ResultadoTurnover,
  ResultadoTendencia,
  ResultadoProjecao,
  ResultadoRanking,
  ResultadoBreakdown,
  ItemBreakdown,
  ItemRanking,
  PontoSerie,
  ResultadoSegmentRates,
  ItemSegmentRate,
  ResultadoDrivers,
  DriverItem,
  ResultadoComparacao,
  GrupoComparado,
  ResultadoCohort,
  CohortBucket,
  ResultadoCusto,
  ResultadoRegretido,
} from '@/lib/types';

// NOTA: pessoas.json (~1MB) NÃO é importado aqui de propósito. Este módulo é
// puxado pelo dashboard (client component), então o roster individual vive em
// lib/calculations/roster.ts, consumido só pela rota de chat (server-side).

const DESLIGAMENTOS = desligamentosRaw as RegistroDesligamento[];
const HEADCOUNT = headcountRaw as HeadcountMensal[];
const POPULACAO = populacaoRaw as unknown as PopulacaoDiretoria[];

/** Meta interna mensal de turnover da Verta S.A. */
export const META_TURNOVER_MENSAL = 0.020; // 2.0%

/** Amostra mínima para uma fatia ser estatisticamente confiável */
export const MIN_AMOSTRA = 5;

/** Dimensões que têm composição de população base (permitem taxa real + lift) */
const DIMENSOES_COM_POPULACAO: DimensaoBreakdown[] = [
  'senioridade', 'posicionamentoFaixa', 'nivelPerformance',
  'clusterLideranca', 'nivelSatisfacao', 'modalidadeTrabalho', 'especialidade',
];

/** Multiplicador de custo de reposição: ~6 meses de salário (hiring + ramp-up) */
const MULT_REPOSICAO = 6;

// ── Helpers internos ──────────────────────────────────────────────────────────

const MES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function mesLabel(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  return `${MES_LABELS[m - 1]}/${String(y).slice(2)}`;
}

function generateRange(from: string, to: string): string[] {
  const months: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) { m = 1; y++; }
  }
  return months;
}

/** Resolve um Periodo nas três janelas de comparação */
export function resolvePeriodo(periodo: Periodo): {
  mesesAtual: string[];
  mesesAnterior: string[];
  mesesAnoAnterior: string[] | null;
  label: string;
} {
  // Handle full-year 2023
  if (periodo === '2023') {
    return {
      mesesAtual: generateRange('2023-01', '2023-12'),
      mesesAnterior: [],
      mesesAnoAnterior: null,
      label: 'Jan–Dez 2023',
    };
  }

  // Handle YYYY-MM monthly periods
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(periodo);
  if (monthMatch) {
    const y = parseInt(monthMatch[1]);
    const m = parseInt(monthMatch[2]);
    const prevM = m === 1 ? 12 : m - 1;
    const prevY = m === 1 ? y - 1 : y;
    const prevMes = `${prevY}-${String(prevM).padStart(2, '0')}`;
    const aaMes = `${y - 1}-${String(m).padStart(2, '0')}`;
    return {
      mesesAtual: [periodo],
      mesesAnterior: [prevMes],
      mesesAnoAnterior: y > 2023 ? [aaMes] : null,
      label: mesLabel(periodo),
    };
  }

  switch (periodo) {
    case '12m': return {
      mesesAtual:       generateRange('2024-01', '2024-12'),
      mesesAnterior:    generateRange('2023-01', '2023-12'),
      mesesAnoAnterior: generateRange('2023-01', '2023-12'),
      label: 'Jan–Dez 2024',
    };
    case '6m': return {
      mesesAtual:       generateRange('2024-07', '2024-12'),
      mesesAnterior:    generateRange('2024-01', '2024-06'),
      mesesAnoAnterior: generateRange('2023-07', '2023-12'),
      label: 'Jul–Dez 2024',
    };
    case '3m': return {
      mesesAtual:       generateRange('2024-10', '2024-12'),
      mesesAnterior:    generateRange('2024-07', '2024-09'),
      mesesAnoAnterior: generateRange('2023-10', '2023-12'),
      label: 'Out–Dez 2024',
    };
    case 'q1': return {
      mesesAtual:       generateRange('2024-01', '2024-03'),
      mesesAnterior:    generateRange('2023-10', '2023-12'),
      mesesAnoAnterior: generateRange('2023-01', '2023-03'),
      label: 'Q1 2024',
    };
    case 'q2': return {
      mesesAtual:       generateRange('2024-04', '2024-06'),
      mesesAnterior:    generateRange('2024-01', '2024-03'),
      mesesAnoAnterior: generateRange('2023-04', '2023-06'),
      label: 'Q2 2024',
    };
    case 'q3': return {
      mesesAtual:       generateRange('2024-07', '2024-09'),
      mesesAnterior:    generateRange('2024-04', '2024-06'),
      mesesAnoAnterior: generateRange('2023-07', '2023-09'),
      label: 'Q3 2024',
    };
    case 'q4': return {
      mesesAtual:       generateRange('2024-10', '2024-12'),
      mesesAnterior:    generateRange('2024-07', '2024-09'),
      mesesAnoAnterior: generateRange('2023-10', '2023-12'),
      label: 'Q4 2024',
    };
    default:
      throw new Error(`Período inválido: ${periodo as string}`);
  }
}

/** Filtra desligamentos pelos critérios dados */
export function filterDesligamentos(
  meses: string[],
  diretoria?: Diretoria,
  tipo?: TipoDesligamento,
): RegistroDesligamento[] {
  return DESLIGAMENTOS.filter(d => {
    if (!meses.includes(d.mes)) return false;
    if (diretoria && diretoria !== 'Geral' && d.diretoria !== diretoria) return false;
    if (tipo && d.tipoDesligamento !== tipo) return false;
    return true;
  });
}

/** Soma de headcountInicio para uma janela de meses e diretoria */
export function sumHeadcount(meses: string[], diretoria?: Diretoria): number {
  return HEADCOUNT
    .filter(h => {
      if (!meses.includes(h.mes)) return false;
      if (diretoria && diretoria !== 'Geral' && h.diretoria !== diretoria) return false;
      return true;
    })
    .reduce((sum, h) => sum + h.headcountInicio, 0);
}

/**
 * Taxa mensal média = total_desligamentos / soma_headcountInicio_periodo
 *
 * Denominador é a soma dos headcounts de cada mês-diretoria (não o headcount
 * médio simples), o que pondera corretamente períodos com headcount crescente.
 * O resultado é a fração do workforce que saiu em cada mês, em média.
 */
export function calcTaxa(desligamentos: number, hcTotal: number): number {
  return hcTotal > 0 ? desligamentos / hcTotal : 0;
}

function calcStatus(taxa: number): ResultadoTurnover['status'] {
  if (taxa <= META_TURNOVER_MENSAL) return 'good';
  if (taxa <= META_TURNOVER_MENSAL * 1.5) return 'warn';
  return 'bad';
}

function calcStatusLabel(taxa: number, meta: number): string {
  const pct = ((taxa / meta - 1) * 100).toFixed(0);
  if (taxa <= meta) return `${Math.abs(Number(pct))}% abaixo da meta`;
  return `${pct}% acima da meta`;
}

/** Série mensal completa (todos os 24 meses) para um recorte */
function buildSerieMensal(diretoria?: Diretoria, tipo?: TipoDesligamento): PontoSerie[] {
  const allMonths = generateRange('2023-01', '2024-12');
  return allMonths.map(mes => {
    const hcRows = HEADCOUNT.filter(h => {
      if (h.mes !== mes) return false;
      if (diretoria && diretoria !== 'Geral' && h.diretoria !== diretoria) return false;
      return true;
    });
    const hcInicio = hcRows.reduce((s, h) => s + h.headcountInicio, 0);
    const admissoes = hcRows.reduce((s, h) => s + h.admissoes, 0);
    const hcFim = hcRows.reduce((s, h) => s + h.headcountFim, 0);
    const desl = filterDesligamentos([mes], diretoria, tipo);
    const taxa = hcInicio > 0 ? desl.length / hcInicio : 0;
    return { mes, label: mesLabel(mes), taxa, desligamentos: desl.length, admissoes, headcount: hcInicio > 0 ? hcInicio : hcFim };
  });
}

/**
 * Detecta o mês onde começou uma escalada sustentada (3 meses consecutivos
 * acima da média da primeira metade da série). Usado em getTrend para
 * responder "quando o problema começou?".
 */
function detectMesDaVirada(serie: PontoSerie[]): string | null {
  if (serie.length < 6) return null;
  const baseline = serie.slice(0, 6).reduce((s, p) => s + p.taxa, 0) / 6;
  const threshold = baseline * 1.4; // 40% acima da baseline
  for (let i = 0; i < serie.length - 2; i++) {
    if (serie[i].taxa > threshold && serie[i + 1].taxa > threshold && serie[i + 2].taxa > threshold) {
      return serie[i].mes;
    }
  }
  return null;
}

// ── Funções públicas ──────────────────────────────────────────────────────────

/**
 * Retorna a taxa de turnover de um período com status vs. meta.
 *
 * Para entender se o turnover **cresceu**, use `getTrend` — que compara
 * com o período anterior e com o mesmo período do ano passado.
 *
 * @param periodo  - Janela de análise
 * @param diretoria - Diretoria específica ou 'Geral' (default) para toda a empresa
 * @param tipoDesligamento - Filtrar por 'voluntário', 'involuntário' ou omitir para ambos
 */
export function getTurnoverRate(
  periodo: Periodo,
  diretoria: Diretoria = 'Geral',
  tipoDesligamento?: TipoDesligamento,
): ResultadoTurnover {
  const { mesesAtual } = resolvePeriodo(periodo);
  const desl = filterDesligamentos(mesesAtual, diretoria, tipoDesligamento);
  const hcTotal = sumHeadcount(mesesAtual, diretoria);
  const taxa = calcTaxa(desl.length, hcTotal);
  const status = calcStatus(taxa);
  return {
    taxa,
    desligamentos: desl.length,
    headcountMedio: Math.round(hcTotal / mesesAtual.length),
    meta: META_TURNOVER_MENSAL,
    status,
    statusLabel: calcStatusLabel(taxa, META_TURNOVER_MENSAL),
  };
}

/**
 * Retorna a tendência completa: taxa atual vs. período anterior (MoM) e
 * vs. mesmo período do ano anterior (YoY). Inclui a série mensal completa
 * e detecta quando a escalada começou.
 *
 * ⚠️ Use SEMPRE esta função quando a pergunta contiver palavras como
 * "cresceu", "aumentou", "piorou", "está alto", "tendência" — nunca
 * conclua sobre crescimento a partir de um único valor pontual.
 *
 * @param diretoria        - Diretoria ou 'Geral'
 * @param periodoReferencia - Período a usar como "atual" (default: '12m')
 * @param tipoDesligamento  - Filtrar por tipo de saída
 */
export function getTrend(
  diretoria: Diretoria = 'Geral',
  periodoReferencia: Periodo = '12m',
  tipoDesligamento?: TipoDesligamento,
): ResultadoTendencia {
  const { mesesAtual, mesesAnterior, mesesAnoAnterior } = resolvePeriodo(periodoReferencia);

  const deslAtual    = filterDesligamentos(mesesAtual, diretoria, tipoDesligamento).length;
  const deslAnterior = filterDesligamentos(mesesAnterior, diretoria, tipoDesligamento).length;

  const hcAtual    = sumHeadcount(mesesAtual, diretoria);
  const hcAnterior = sumHeadcount(mesesAnterior, diretoria);

  const taxaAtual    = calcTaxa(deslAtual, hcAtual);
  const taxaAnterior = calcTaxa(deslAnterior, hcAnterior);
  const variacaoMoM  = taxaAtual - taxaAnterior;

  let taxaAnoAnterior: number | null = null;
  let variacaoYoY: number | null = null;
  if (mesesAnoAnterior) {
    const deslAA = filterDesligamentos(mesesAnoAnterior, diretoria, tipoDesligamento).length;
    const hcAA   = sumHeadcount(mesesAnoAnterior, diretoria);
    taxaAnoAnterior = calcTaxa(deslAA, hcAA);
    variacaoYoY = taxaAtual - taxaAnoAnterior;
  }

  const direcao: ResultadoTendencia['direcao'] =
    Math.abs(variacaoMoM) < 0.001 ? 'estável' :
    variacaoMoM > 0 ? 'subindo' : 'caindo';

  const serie = buildSerieMensal(diretoria, tipoDesligamento);
  const mesDaVirada = detectMesDaVirada(serie);

  return {
    taxaAtual,
    taxaPeriodoAnterior: taxaAnterior,
    taxaMesmoPeriodoAnoAnterior: taxaAnoAnterior,
    variacaoMoM,
    variacaoYoY,
    direcao,
    mesDaVirada,
    serie,
  };
}

/**
 * Projeta a taxa de turnover para os próximos 3 meses usando média móvel
 * dos últimos 3 meses disponíveis.
 *
 * @param diretoria        - Diretoria ou 'Geral'
 * @param tipoDesligamento - Filtrar por tipo de saída
 */
export function getProjection(
  diretoria: Diretoria = 'Geral',
  tipoDesligamento?: TipoDesligamento,
): ResultadoProjecao {
  const serieHistorica = buildSerieMensal(diretoria, tipoDesligamento);

  // Média móvel dos últimos 3 meses do dataset
  const ultimos3 = serieHistorica.slice(-3);
  const mediaMov = ultimos3.reduce((s, p) => s + p.taxa, 0) / 3;

  // Projeta Jan-Mar 2025
  const serieProjetada = ['2025-01', '2025-02', '2025-03'].map(mes => ({
    mes,
    label: mesLabel(mes),
    taxaProjetada: mediaMov,
  }));

  return {
    taxaProjetadaProximo3Meses: mediaMov,
    metodologia: 'Média móvel dos últimos 3 meses (Out–Dez 2024)',
    serieHistorica,
    serieProjetada,
  };
}

/**
 * Retorna o ranking das diretorias por taxa de turnover no período,
 * do maior para o menor.
 *
 * @param periodo          - Período de análise
 * @param tipoDesligamento - Filtrar por tipo de saída
 */
export function rankDiretoriasByTurnover(
  periodo: Periodo,
  tipoDesligamento?: TipoDesligamento,
): ResultadoRanking {
  const { mesesAtual, mesesAnterior, mesesAnoAnterior, label } = resolvePeriodo(periodo);

  const DIRETORIAS: Diretoria[] = [
    'Tecnologia', 'Distribuição & Assessoria', 'Operações',
    'Financeiro & Risco', 'Gente', 'Produtos & Plataforma',
  ];

  const n    = mesesAtual.length;
  const nAnt = mesesAnterior.length;
  const nAA  = mesesAnoAnterior?.length ?? 0;

  const ranking: ItemRanking[] = DIRETORIAS.map(dir => {
    const deslAtual    = filterDesligamentos(mesesAtual,    dir, tipoDesligamento).length;
    const deslAnterior = filterDesligamentos(mesesAnterior, dir, tipoDesligamento).length;
    const deslVol      = filterDesligamentos(mesesAtual,    dir, 'voluntário').length;
    const deslInvol    = filterDesligamentos(mesesAtual,    dir, 'involuntário').length;

    const hcAtual    = sumHeadcount(mesesAtual,    dir);
    const hcAnterior = sumHeadcount(mesesAnterior, dir);

    const hcMedio    = n    > 0 ? hcAtual    / n    : 0;
    const hcMedioAnt = nAnt > 0 ? hcAnterior / nAnt : 0;

    const taxa    = calcTaxa(deslAtual,    hcAtual);
    const taxaAnt = calcTaxa(deslAnterior, hcAnterior);

    const ytdTotal       = hcMedio > 0 ? deslAtual  / hcMedio : 0;
    const ytdVoluntario  = hcMedio > 0 ? deslVol    / hcMedio : 0;
    const ytdInvoluntario= hcMedio > 0 ? deslInvol  / hcMedio : 0;
    const ytdAnterior    = hcMedioAnt > 0 ? deslAnterior / hcMedioAnt : null;

    let ytdAnoAnterior: number | null = null;
    if (mesesAnoAnterior && nAA > 0) {
      const deslAA = filterDesligamentos(mesesAnoAnterior, dir, tipoDesligamento).length;
      const hcAA   = sumHeadcount(mesesAnoAnterior, dir);
      const hcMedioAA = hcAA / nAA;
      ytdAnoAnterior = hcMedioAA > 0 ? deslAA / hcMedioAA : null;
    }

    return {
      diretoria: dir,
      taxa,
      desligamentos: deslAtual,
      headcountMedio: Math.round(hcMedio),
      variacaoMoM: taxaAnt > 0 ? taxa - taxaAnt : null,
      status: calcStatus(taxa),
      ytdTotal,
      ytdVoluntario,
      ytdInvoluntario,
      ytdAnterior,
      ytdAnoAnterior,
    };
  });

  ranking.sort((a, b) => b.taxa - a.taxa);
  return { ranking, periodo: label };
}

/**
 * Analisa a distribuição de desligamentos por uma dimensão categórica.
 * Use para responder "onde está concentrado o problema?" dentro de uma
 * diretoria ou empresa.
 *
 * Combine com o parâmetro `tipoDesligamento` para análises focadas:
 * ex. "Dos voluntários de Tecnologia, qual faixa salarial concentra mais saídas?"
 *
 * @param periodo          - Período de análise
 * @param diretoria        - Diretoria ou 'Geral'
 * @param dimensao         - Dimensão de corte
 * @param tipoDesligamento - Pré-filtrar por tipo de saída antes do corte
 */
export function breakdownByDimension(
  periodo: Periodo,
  diretoria: Diretoria = 'Geral',
  dimensao: DimensaoBreakdown,
  tipoDesligamento?: TipoDesligamento,
): ResultadoBreakdown {
  const { mesesAtual, label } = resolvePeriodo(periodo);
  const desl = filterDesligamentos(mesesAtual, diretoria, tipoDesligamento);
  const total = desl.length;

  const buckets = new Map<string, RegistroDesligamento[]>();
  for (const d of desl) {
    const key = String(d[dimensao as keyof RegistroDesligamento]);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(d);
  }

  // Ordem semântica para dimensões ordinais
  const ORDER: Partial<Record<DimensaoBreakdown, string[]>> = {
    senioridade:        ['júnior', 'pleno', 'sênior', 'gerência', 'diretoria'],
    posicionamentoFaixa: ['piso', 'q1', 'mediana', 'q3', 'teto'],
    nivelPerformance:   ['abaixo', 'dentro', 'acima'],
    tendenciaPerformance: ['melhorando', 'estável', 'piorando'],
    nivelSatisfacao:    ['baixo', 'médio', 'alto'],
    clusterLideranca:   ['contribuidor individual', 'líder de CI', 'líder de líderes'],
  };

  const keys = [...buckets.keys()];
  const order = ORDER[dimensao];
  if (order) {
    keys.sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  } else {
    // Ordena por frequência decrescente para dimensões nominais
    keys.sort((a, b) => buckets.get(b)!.length - buckets.get(a)!.length);
  }

  const itens: ItemBreakdown[] = keys.map(label => {
    const grupo = buckets.get(label)!;
    const hcTotal = sumHeadcount(mesesAtual, diretoria);
    const taxaTurnover = hcTotal > 0 ? grupo.length / hcTotal : undefined;
    const salarioMedioAteSaida = grupo.length > 0
      ? Math.round(grupo.reduce((s, d) => s + d.salarioBRL, 0) / grupo.length / 100) * 100
      : undefined;
    const tempoMedioDesdeAumento = grupo.length > 0
      ? Math.round(grupo.reduce((s, d) => s + d.tempoDesdeAumentoMeses, 0) / grupo.length)
      : undefined;
    const npsInternoMedio = grupo.length > 0
      ? parseFloat((grupo.reduce((s, d) => s + d.npsInterno, 0) / grupo.length).toFixed(1))
      : undefined;

    return {
      label,
      desligamentos: grupo.length,
      percentual: total > 0 ? parseFloat((grupo.length / total * 100).toFixed(1)) : 0,
      taxaTurnover,
      salarioMedioAteSaida,
      tempoMedioDesdeAumento,
      npsInterno: npsInternoMedio,
    };
  });

  return { dimensao, diretoria, periodo: label, totalDesligamentos: total, itens };
}

/**
 * Retorna o headcount de um período com evolução mensal.
 *
 * @param periodo   - Período de análise
 * @param diretoria - Diretoria ou 'Geral'
 */
/** Retorna os meses do período selecionado (útil para highlighting no chart) */
export function getMesesPeriodo(periodo: Periodo): string[] {
  return resolvePeriodo(periodo).mesesAtual;
}

/** Meta anual: meta_mensal × 12 */
export const META_TURNOVER_ANUAL = META_TURNOVER_MENSAL * 12;

/**
 * Retorna o turnover ACUMULADO YTD (Year-to-Date).
 *
 * Fórmula: totalDesligamentos / headcountMédioMensal (desde Jan do ano).
 * Meta YTD cresce: meta_mensal × n_meses (ex: 2%/mês × 12 = 24% no ano).
 *
 * NÃO confundir com getTurnoverRate, que retorna a taxa MENSAL média (~2-3%).
 *
 * @param periodo - Determina o ano e o último mês do YTD
 * @param diretoria - Diretoria ou 'Geral'
 * @param tipoDesligamento - Filtrar por tipo de saída
 */
import type { ResultadoYTD } from '@/lib/types';

export function getYTD(
  periodo: Periodo,
  diretoria: Diretoria = 'Geral',
  tipoDesligamento?: TipoDesligamento,
): ResultadoYTD {
  const meses   = getMesesPeriodo(periodo);
  const lastMes = meses.length > 0 ? meses[meses.length - 1] : '2024-12';
  const ytdYear  = lastMes.slice(0, 4);
  const ytdStart = `${ytdYear}-01`;

  const ytdMonths = generateRange(ytdStart, lastMes);
  const n = ytdMonths.length;

  const desl    = filterDesligamentos(ytdMonths, diretoria, tipoDesligamento);
  const totalHC = sumHeadcount(ytdMonths, diretoria);
  const avgHC   = n > 0 ? totalHC / n : 0;
  const taxa    = avgHC > 0 ? desl.length / avgHC : 0;
  const metaYTD = META_TURNOVER_MENSAL * n;

  // vs mesmo YTD do ano anterior
  const aaYear   = String(parseInt(ytdYear) - 1);
  const aaMonths = generateRange(`${aaYear}-01`, `${aaYear}-${lastMes.slice(5)}`);
  const aaDesl   = filterDesligamentos(aaMonths, diretoria, tipoDesligamento);
  const aaHC     = sumHeadcount(aaMonths, diretoria);
  const aaAvgHC  = aaMonths.length > 0 ? aaHC / aaMonths.length : 0;
  const taxaAA   = aaAvgHC > 0 ? aaDesl.length / aaAvgHC : null;

  const lastLabel = MES_LABELS[parseInt(lastMes.slice(5)) - 1];
  const label = n === 12 ? `Jan–Dez ${ytdYear}` : `Jan–${lastLabel} ${ytdYear}`;

  const status = taxa <= metaYTD ? 'good' : taxa <= metaYTD * 1.5 ? 'warn' : 'bad';

  return {
    taxa,
    taxaPercentual:    parseFloat((taxa    * 100).toFixed(2)),
    desligamentos:     desl.length,
    headcountMedio:    Math.round(avgHC),
    metaYTD,
    metaYTDPercentual: parseFloat((metaYTD * 100).toFixed(2)),
    vsMeta:            taxa - metaYTD,
    vsMetaPercentual:  parseFloat(((taxa - metaYTD) * 100).toFixed(2)),
    taxaAnoAnterior:   taxaAA,
    vsAnoAnterior:     taxaAA !== null ? taxa - taxaAA : null,
    numMeses:          n,
    label,
    status,
    statusLabel:       calcStatusLabel(taxa, metaYTD),
  };
}

export function getHeadcount(
  periodo: Periodo,
  diretoria: Diretoria = 'Geral',
): { headcountInicio: number; headcountFim: number; crescimento: number; serieMensal: Array<{ mes: string; label: string; headcount: number }> } {
  const { mesesAtual } = resolvePeriodo(periodo);
  const hcRows = HEADCOUNT.filter(h => {
    if (!mesesAtual.includes(h.mes)) return false;
    if (diretoria !== 'Geral' && h.diretoria !== diretoria) return false;
    return true;
  });

  // Headcount no início do primeiro mês
  const primeiros = hcRows.filter(h => h.mes === mesesAtual[0]);
  const ultimos   = hcRows.filter(h => h.mes === mesesAtual[mesesAtual.length - 1]);
  const hcInicio  = primeiros.reduce((s, h) => s + h.headcountInicio, 0);
  const hcFim     = ultimos.reduce((s, h) => s + h.headcountFim, 0);

  const serieMensal = mesesAtual.map(mes => {
    const rows = hcRows.filter(h => h.mes === mes);
    return { mes, label: mesLabel(mes), headcount: rows.reduce((s, h) => s + h.headcountInicio, 0) };
  });

  return { headcountInicio: hcInicio, headcountFim: hcFim, crescimento: hcFim - hcInicio, serieMensal };
}

// ── Análises avançadas (taxas reais, drivers, cohort, custo) ───────────────────

/** Distribuição da população ativa para uma diretoria × dimensão (ou null) */
function getPopDist(diretoria: Diretoria, dimensao: DimensaoBreakdown): Record<string, number> | null {
  const entry = POPULACAO.find(p => p.diretoria === diretoria) ?? POPULACAO.find(p => p.diretoria === 'Geral');
  return entry?.distribuicoes[dimensao] ?? null;
}

/** Agrupa desligamentos por valor de uma dimensão categórica */
function bucketBy(desl: RegistroDesligamento[], dimensao: DimensaoBreakdown): Map<string, RegistroDesligamento[]> {
  const buckets = new Map<string, RegistroDesligamento[]>();
  for (const d of desl) {
    const key = String(d[dimensao as keyof RegistroDesligamento]);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(d);
  }
  return buckets;
}

/**
 * Taxa REAL de turnover por valor de uma dimensão, com lift vs. a população.
 *
 * Diferença crítica para breakdownByDimension: esta função usa a composição
 * da força de trabalho ativa (populacao.json) como denominador, devolvendo a
 * taxa de saída do segmento — não apenas a sua participação nas saídas.
 * lift = composição_saídas ÷ composição_população (1.0 = neutro; 2.0 = sai 2× mais).
 *
 * @param periodo   - Período de análise
 * @param diretoria - Diretoria ou 'Geral'
 * @param dimensao  - Dimensão de corte (taxa/lift só para dimensões com população base)
 * @param tipoDesligamento - Pré-filtrar por tipo de saída
 */
export function getSegmentRates(
  periodo: Periodo,
  diretoria: Diretoria = 'Geral',
  dimensao: DimensaoBreakdown,
  tipoDesligamento?: TipoDesligamento,
): ResultadoSegmentRates {
  const { mesesAtual, label } = resolvePeriodo(periodo);
  const desl = filterDesligamentos(mesesAtual, diretoria, tipoDesligamento);
  const total = desl.length;
  const hcTotal = sumHeadcount(mesesAtual, diretoria);
  const taxaGeral = calcTaxa(total, hcTotal);
  const popDist = getPopDist(diretoria, dimensao);
  const temPopulacaoBase = popDist !== null;

  const buckets = bucketBy(desl, dimensao);
  const itens: ItemSegmentRate[] = [...buckets.entries()].map(([valor, grupo]) => {
    const composicaoPct = total > 0 ? parseFloat((grupo.length / total * 100).toFixed(1)) : 0;
    const popShare = popDist?.[valor] ?? null;
    const lift = popShare && popShare > 0 ? parseFloat((composicaoPct / 100 / popShare).toFixed(2)) : null;
    const taxaSegmento = lift !== null ? parseFloat((taxaGeral * lift).toFixed(4)) : null;
    return {
      label: valor,
      desligamentos: grupo.length,
      composicaoPct,
      populacaoPct: popShare !== null ? parseFloat((popShare * 100).toFixed(1)) : null,
      taxaSegmento,
      lift,
      amostraSuficiente: grupo.length >= MIN_AMOSTRA,
    };
  });

  // Ordena por lift desc quando há população; senão por composição
  itens.sort((a, b) => (b.lift ?? b.composicaoPct) - (a.lift ?? a.composicaoPct));

  return { dimensao, diretoria, periodo: label, totalDesligamentos: total, taxaGeral, temPopulacaoBase, itens };
}

/**
 * Drivers de turnover: varre todas as dimensões com população base e ranqueia
 * os segmentos por lift, separando fatores de RISCO (saem muito acima do
 * esperado) de fatores PROTETIVOS (retêm acima do esperado).
 *
 * Responde "o que está puxando o turnover?" com evidência quantitativa real,
 * em vez de uma fatia descritiva por vez.
 *
 * @param periodo   - Período de análise
 * @param diretoria - Diretoria ou 'Geral'
 * @param tipoDesligamento - Pré-filtrar por tipo de saída
 */
export function getDrivers(
  periodo: Periodo,
  diretoria: Diretoria = 'Geral',
  tipoDesligamento?: TipoDesligamento,
): ResultadoDrivers {
  const { mesesAtual, label } = resolvePeriodo(periodo);
  const desl = filterDesligamentos(mesesAtual, diretoria, tipoDesligamento);
  const total = desl.length;
  const taxaGeral = calcTaxa(total, sumHeadcount(mesesAtual, diretoria));

  const todos: DriverItem[] = [];
  for (const dim of DIMENSOES_COM_POPULACAO) {
    const rates = getSegmentRates(periodo, diretoria, dim, tipoDesligamento);
    for (const it of rates.itens) {
      if (it.lift === null || it.populacaoPct === null || !it.amostraSuficiente) continue;
      todos.push({
        dimensao: dim,
        valor: it.label,
        desligamentos: it.desligamentos,
        composicaoPct: it.composicaoPct,
        populacaoPct: it.populacaoPct,
        lift: it.lift,
        taxaSegmento: it.taxaSegmento ?? 0,
      });
    }
  }

  const fatoresDeRisco = todos.filter(d => d.lift >= 1.3).sort((a, b) => b.lift - a.lift).slice(0, 6);
  const fatoresProtetivos = todos.filter(d => d.lift <= 0.7).sort((a, b) => a.lift - b.lift).slice(0, 4);

  const aviso = total < MIN_AMOSTRA * 3
    ? `Amostra pequena (${total} saídas) — leia os drivers como indicativos, não conclusivos.`
    : null;

  return { diretoria, periodo: label, totalDesligamentos: total, taxaGeral, fatoresDeRisco, fatoresProtetivos, aviso };
}

/** Métricas-resumo de um recorte, usado por compareGroups */
function resumoGrupo(rotulo: string, periodo: Periodo, diretoria: Diretoria, tipo?: TipoDesligamento): GrupoComparado {
  const { mesesAtual } = resolvePeriodo(periodo);
  const desl = filterDesligamentos(mesesAtual, diretoria, tipo);
  const total = desl.length;
  const hcTotal = sumHeadcount(mesesAtual, diretoria);
  const vol = desl.filter(d => d.tipoDesligamento === 'voluntário').length;
  const alta = desl.filter(d => d.nivelPerformance === 'acima').length;
  return {
    rotulo,
    taxa: calcTaxa(total, hcTotal),
    desligamentos: total,
    headcountMedio: Math.round(hcTotal / mesesAtual.length),
    voluntarioPct: total > 0 ? parseFloat((vol / total * 100).toFixed(1)) : 0,
    altaPerformancePct: total > 0 ? parseFloat((alta / total * 100).toFixed(1)) : 0,
  };
}

/**
 * Compara dois recortes lado a lado (duas diretorias, ou dois períodos da mesma
 * diretoria). Responde "como X se compara com Y?".
 *
 * @param periodoA / diretoriaA - Primeiro recorte
 * @param periodoB / diretoriaB - Segundo recorte
 * @param tipoDesligamento      - Filtro de tipo aplicado a ambos
 */
export function compareGroups(
  periodoA: Periodo,
  diretoriaA: Diretoria,
  periodoB: Periodo,
  diretoriaB: Diretoria,
  tipoDesligamento?: TipoDesligamento,
): ResultadoComparacao {
  const { label: labelA } = resolvePeriodo(periodoA);
  const { label: labelB } = resolvePeriodo(periodoB);
  const rotA = diretoriaA === diretoriaB ? labelA : diretoriaA;
  const rotB = diretoriaA === diretoriaB ? labelB : diretoriaB;
  const grupoA = resumoGrupo(rotA, periodoA, diretoriaA, tipoDesligamento);
  const grupoB = resumoGrupo(rotB, periodoB, diretoriaB, tipoDesligamento);
  return {
    grupoA,
    grupoB,
    diferencaTaxaPp: parseFloat(((grupoA.taxa - grupoB.taxa) * 100).toFixed(2)),
    liderTaxa: grupoA.taxa >= grupoB.taxa ? grupoA.rotulo : grupoB.rotulo,
  };
}

/**
 * Cohort de saída por tempo de casa. Revela early attrition (saída precoce) —
 * a análise nº 1 de retenção. Responde "estamos perdendo gente nova?".
 *
 * @param periodo   - Período de análise
 * @param diretoria - Diretoria ou 'Geral'
 * @param tipoDesligamento - Pré-filtrar por tipo de saída
 */
export function getCohortByTenure(
  periodo: Periodo,
  diretoria: Diretoria = 'Geral',
  tipoDesligamento?: TipoDesligamento,
): ResultadoCohort {
  const { mesesAtual, label } = resolvePeriodo(periodo);
  const desl = filterDesligamentos(mesesAtual, diretoria, tipoDesligamento);
  const total = desl.length;

  const FAIXAS: Array<{ faixa: string; min: number; max: number }> = [
    { faixa: '0–12 meses',  min: 0,  max: 12 },
    { faixa: '13–24 meses', min: 13, max: 24 },
    { faixa: '25–48 meses', min: 25, max: 48 },
    { faixa: '49+ meses',   min: 49, max: Infinity },
  ];

  const buckets: CohortBucket[] = FAIXAS.map(({ faixa, min, max }) => {
    const grupo = desl.filter(d => d.tempoEmpresaMeses >= min && d.tempoEmpresaMeses <= max);
    const vol = grupo.filter(d => d.tipoDesligamento === 'voluntário').length;
    return {
      faixa,
      desligamentos: grupo.length,
      percentual: total > 0 ? parseFloat((grupo.length / total * 100).toFixed(1)) : 0,
      voluntarioPct: grupo.length > 0 ? parseFloat((vol / grupo.length * 100).toFixed(1)) : 0,
      salarioMedio: grupo.length > 0 ? Math.round(grupo.reduce((s, d) => s + d.salarioBRL, 0) / grupo.length / 100) * 100 : 0,
    };
  });

  const early = desl.filter(d => d.tempoEmpresaMeses <= 12).length;
  const tempoMedio = total > 0 ? Math.round(desl.reduce((s, d) => s + d.tempoEmpresaMeses, 0) / total) : 0;

  return {
    diretoria, periodo: label, totalDesligamentos: total, buckets,
    earlyAttritionPct: total > 0 ? parseFloat((early / total * 100).toFixed(1)) : 0,
    tempoMedioMeses: tempoMedio,
  };
}

/**
 * Quantifica o custo financeiro do turnover. Responde "quanto isso está
 * custando?" — o número que move decisão de C-level.
 *
 * @param periodo   - Período de análise
 * @param diretoria - Diretoria ou 'Geral'
 * @param tipoDesligamento - Pré-filtrar por tipo de saída
 */
export function quantifyCost(
  periodo: Periodo,
  diretoria: Diretoria = 'Geral',
  tipoDesligamento?: TipoDesligamento,
): ResultadoCusto {
  const { mesesAtual, label } = resolvePeriodo(periodo);
  const desl = filterDesligamentos(mesesAtual, diretoria, tipoDesligamento);
  const folhaMensalPerdida = desl.reduce((s, d) => s + d.salarioBRL, 0);
  const regretidos = desl.filter(d => d.tipoDesligamento === 'voluntário' && d.nivelPerformance === 'acima');
  const folhaRegretida = regretidos.reduce((s, d) => s + d.salarioBRL, 0);
  return {
    diretoria, periodo: label,
    desligamentos: desl.length,
    folhaMensalPerdida,
    custoReposicaoEstimado: folhaMensalPerdida * MULT_REPOSICAO,
    multiplicador: MULT_REPOSICAO,
    custoRegretido: folhaRegretida * MULT_REPOSICAO,
    metodologia: `Custo de reposição ≈ ${MULT_REPOSICAO} meses de salário por saída (recrutamento + onboarding + ramp-up).`,
  };
}

/**
 * Regretted attrition: saídas VOLUNTÁRIAS de quem tinha performance "acima".
 * É a perda cara — talento bom que pediu para sair. Métrica de 1ª classe.
 *
 * @param periodo   - Período de análise
 * @param diretoria - Diretoria ou 'Geral'
 */
export function getRegrettedAttrition(
  periodo: Periodo,
  diretoria: Diretoria = 'Geral',
): ResultadoRegretido {
  const { mesesAtual, label } = resolvePeriodo(periodo);
  const desl = filterDesligamentos(mesesAtual, diretoria);
  const total = desl.length;
  const regretidos = desl.filter(d => d.tipoDesligamento === 'voluntário' && d.nivelPerformance === 'acima');
  const n = regretidos.length;

  // Motivo dominante entre os regretidos
  const motivos = new Map<string, number>();
  for (const d of regretidos) motivos.set(d.motivoDesligamento, (motivos.get(d.motivoDesligamento) ?? 0) + 1);
  const motivoPrincipal = [...motivos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    diretoria, periodo: label,
    totalDesligamentos: total,
    desligamentosRegretidos: n,
    percentualRegretido: total > 0 ? parseFloat((n / total * 100).toFixed(1)) : 0,
    custoRegretido: regretidos.reduce((s, d) => s + d.salarioBRL, 0) * MULT_REPOSICAO,
    salarioMedio: n > 0 ? Math.round(regretidos.reduce((s, d) => s + d.salarioBRL, 0) / n / 100) * 100 : 0,
    npsInternoMedio: n > 0 ? parseFloat((regretidos.reduce((s, d) => s + d.npsInterno, 0) / n).toFixed(1)) : 0,
    motivoPrincipal,
  };
}
