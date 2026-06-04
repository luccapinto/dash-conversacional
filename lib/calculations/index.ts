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
import type {
  RegistroDesligamento,
  HeadcountMensal,
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
} from '@/lib/types';

const DESLIGAMENTOS = desligamentosRaw as RegistroDesligamento[];
const HEADCOUNT = headcountRaw as HeadcountMensal[];

/** Meta interna mensal de turnover da Verta S.A. */
export const META_TURNOVER_MENSAL = 0.020; // 2.0%

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
function resolvePeriodo(periodo: Periodo): {
  mesesAtual: string[];
  mesesAnterior: string[];
  mesesAnoAnterior: string[] | null;
  label: string;
} {
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
  }
}

/** Filtra desligamentos pelos critérios dados */
function filterDesligamentos(
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
function sumHeadcount(meses: string[], diretoria?: Diretoria): number {
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
function calcTaxa(desligamentos: number, hcTotal: number): number {
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
  const { mesesAtual, mesesAnterior, label } = resolvePeriodo(periodo);

  const DIRETORIAS: Diretoria[] = [
    'Tecnologia', 'Distribuição & Assessoria', 'Operações',
    'Financeiro & Risco', 'Gente', 'Produtos & Plataforma',
  ];

  const ranking: ItemRanking[] = DIRETORIAS.map(dir => {
    const deslAtual    = filterDesligamentos(mesesAtual, dir, tipoDesligamento).length;
    const deslAnterior = filterDesligamentos(mesesAnterior, dir, tipoDesligamento).length;
    const hcAtual      = sumHeadcount(mesesAtual, dir);
    const hcAnterior   = sumHeadcount(mesesAnterior, dir);
    const taxa         = calcTaxa(deslAtual, hcAtual);
    const taxaAnt      = calcTaxa(deslAnterior, hcAnterior);

    return {
      diretoria: dir,
      taxa,
      desligamentos: deslAtual,
      headcountMedio: Math.round(hcAtual / mesesAtual.length),
      variacaoMoM: taxaAnt > 0 ? taxa - taxaAnt : null,
      status: calcStatus(taxa),
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

  let keys = [...buckets.keys()];
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
