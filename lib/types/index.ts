/* ─── Contratos de dados — Dashboard Conversacional (Verta S.A.) ─────────────
 *
 * Fonte de verdade para todos os shapes que trafegam na aplicação:
 * dataset estático → funções de cálculo → gráficos → chat (function calling).
 *
 * Referências: LUC-159, LUC-161
 * ──────────────────────────────────────────────────────────────────────────── */

// ─── Enumerações ─────────────────────────────────────────────────────────────

export type Diretoria =
  | 'Tecnologia'
  | 'Distribuição & Assessoria'
  | 'Operações'
  | 'Financeiro & Risco'
  | 'Gente'
  | 'Produtos & Plataforma'
  | 'Geral'; // visão consolidada da empresa

export type Senioridade    = 'júnior' | 'pleno' | 'sênior' | 'gerência' | 'diretoria';
export type PosicionamentoFaixa = 'piso' | 'q1' | 'mediana' | 'q3' | 'teto';
export type ClusterLideranca = 'contribuidor individual' | 'líder de CI' | 'líder de líderes';
export type TipoDesligamento = 'voluntário' | 'involuntário';
export type MotivoDesligamento = 'remuneração' | 'carreira' | 'cultura' | 'performance' | 'pessoal' | 'outro';
export type NivelPerformance = 'abaixo' | 'dentro' | 'acima';
export type TendenciaPerformance = 'melhorando' | 'estável' | 'piorando';
export type NivelSatisfacao = 'baixo' | 'médio' | 'alto';
export type ModalidadeTrabalho = 'presencial' | 'híbrido' | 'remoto';
export type Periodo =
  | '3m' | '6m' | '12m' | 'q1' | 'q2' | 'q3' | 'q4'
  | '2023'
  | '2023-01' | '2023-02' | '2023-03' | '2023-04' | '2023-05' | '2023-06'
  | '2023-07' | '2023-08' | '2023-09' | '2023-10' | '2023-11' | '2023-12'
  | '2024-01' | '2024-02' | '2024-03' | '2024-04' | '2024-05' | '2024-06'
  | '2024-07' | '2024-08' | '2024-09' | '2024-10' | '2024-11' | '2024-12';

// ─── Registro de desligamento (dataset bruto) ────────────────────────────────

/** Um evento de desligamento — shape exato do lib/data/desligamentos.json */
export interface RegistroDesligamento {
  id: string;
  mes: string; // "YYYY-MM"

  // Estrutura
  diretoria: Diretoria;
  especialidade: string;
  diretor: string;
  superintendente: string;

  // Pessoa
  cargo: string;
  senioridade: Senioridade;
  clusterLideranca: ClusterLideranca;
  eSocio: boolean;
  modalidadeTrabalho: ModalidadeTrabalho;

  // Remuneração
  salarioBRL: number;
  posicionamentoFaixa: PosicionamentoFaixa;

  // Tempo / trajetória
  tempoEmpresaMeses: number;
  tempoNoCargaMeses: number;
  tempoDesdePromocaoMeses: number;
  tempoDesdeAumentoMeses: number;
  trocasDeLiderUltimos12Meses: number;

  // Desempenho / clima
  nivelPerformance: NivelPerformance;
  tendenciaPerformance: TendenciaPerformance;
  nivelSatisfacao: NivelSatisfacao;
  npsInterno: number; // 0–10

  // Desligamento
  tipoDesligamento: TipoDesligamento;
  motivoDesligamento: MotivoDesligamento;
}

// ─── Roster individual (todas as pessoas, ativas e desligadas) ───────────────

/** Status de vínculo de uma pessoa */
export type StatusPessoa = 'ativo' | 'desligado';

/**
 * Uma pessoa no roster — shape exato de lib/data/pessoas.json.
 * Estende o registro de desligamento com vínculo e datas: para os ativos,
 * tipoDesligamento/motivoDesligamento/mesDesligamento são null.
 *
 * Ter a população completa (não só quem saiu) permite TAXA real por qualquer
 * cruzamento de atributos e a base para watchlist preditiva de retenção.
 */
export interface RegistroPessoa {
  id: string;
  status: StatusPessoa;
  diretoria: Diretoria;
  especialidade: string;
  diretor: string;
  superintendente: string;
  cargo: string;
  senioridade: Senioridade;
  clusterLideranca: ClusterLideranca;
  eSocio: boolean;
  modalidadeTrabalho: ModalidadeTrabalho;
  salarioBRL: number;
  posicionamentoFaixa: PosicionamentoFaixa;
  dataAdmissao: string;            // "YYYY-MM"
  mesDesligamento: string | null;  // null se ativo
  tempoEmpresaMeses: number;
  tempoNoCargaMeses: number;
  tempoDesdePromocaoMeses: number;
  tempoDesdeAumentoMeses: number;
  trocasDeLiderUltimos12Meses: number;
  nivelPerformance: NivelPerformance;
  tendenciaPerformance: TendenciaPerformance;
  nivelSatisfacao: NivelSatisfacao;
  npsInterno: number;
  tipoDesligamento: TipoDesligamento | null;
  motivoDesligamento: MotivoDesligamento | null;
}

// ─── Headcount mensal ────────────────────────────────────────────────────────

/** Shape exato do lib/data/headcount.json */
export interface HeadcountMensal {
  mes: string;
  diretoria: Diretoria;
  headcountInicio: number;
  admissoes: number;
  desligamentos: number;
  headcountFim: number;
}

// ─── População ativa (quem ficou) ────────────────────────────────────────────

/** Composição da força de trabalho ativa por dimensão — lib/data/populacao.json */
export interface PopulacaoDiretoria {
  diretoria: Diretoria;
  headcountMedio: number;
  /** distribuicoes[dimensao][valor] = fração do headcount */
  distribuicoes: Record<string, Record<string, number>>;
}

// ─── Resultados das funções de cálculo ───────────────────────────────────────

/** Ponto de dados numa série temporal */
export interface PontoSerie {
  mes: string; // "YYYY-MM"
  label: string; // "Jan/23"
  taxa: number; // % mensal
  desligamentos: number;
  admissoes: number;
  headcount: number;
}

/** getYTD → turnover acumulado desde Janeiro do ano até o mês do período */
export interface ResultadoYTD {
  taxa: number;               // decimal acumulado ex: 0.3614
  taxaPercentual: number;     // ex: 36.14
  desligamentos: number;      // total de saídas acumuladas no período
  headcountMedio: number;     // headcount médio mensal
  metaYTD: number;            // meta acumulada decimal ex: 0.24
  metaYTDPercentual: number;  // ex: 24.0
  vsMeta: number;             // taxa - metaYTD (decimal)
  vsMetaPercentual: number;   // pp
  taxaAnoAnterior: number | null;
  vsAnoAnterior: number | null;
  numMeses: number;           // meses decorridos no YTD
  label: string;              // ex: "Jan–Dez 2024"
  status: 'good' | 'warn' | 'bad';
  statusLabel: string;
}

/** getTurnoverRate → resultado com contexto de meta */
export interface ResultadoTurnover {
  taxa: number;
  desligamentos: number;
  headcountMedio: number;
  meta: number;
  status: 'good' | 'bad' | 'warn';
  statusLabel: string; // "Acima da meta", "Dentro da meta", etc.
}

/** getTrend → resultado completo com MoM, YoY e série */
export interface ResultadoTendencia {
  taxaAtual: number;
  taxaPeriodoAnterior: number | null;
  taxaMesmoPeriodoAnoAnterior: number | null;
  variacaoMoM: number | null; // pp
  variacaoYoY: number | null; // pp
  direcao: 'subindo' | 'caindo' | 'estável';
  mesDaVirada: string | null; // quando começou a escalada
  serie: PontoSerie[];
}

/** getProjection → série histórica + projeção */
export interface ResultadoProjecao {
  taxaProjetadaProximo3Meses: number;
  metodologia: string;
  serieHistorica: PontoSerie[];
  serieProjetada: Array<{ mes: string; label: string; taxaProjetada: number }>;
}

/** rankDiretoriasByTurnover → ranking com contexto.
 *  Todas as taxas são YTD (acumulado de Janeiro até o último mês do período):
 *  ytdTotal/Vol/Invol são taxas reais (desligamentos / headcount médio mensal),
 *  ytdAnterior é o YTD do MÊS ANTERIOR e ytdAnoAnterior é o YTD do mesmo
 *  período do ano anterior. taxa === ytdTotal (usada na ordenação e nas barras). */
export interface ItemRanking {
  diretoria: Diretoria;
  taxa: number;
  desligamentos: number;
  headcountMedio: number;
  variacaoMoM: number | null;
  status: 'good' | 'bad' | 'warn';
  ytdTotal: number;
  ytdVoluntario: number;
  ytdInvoluntario: number;
  ytdAnterior: number | null;     // YTD acumulado até o mês anterior
  ytdAnoAnterior: number | null;  // YTD do mesmo período no ano anterior
}

/** Linha de total (empresa) do ranking — reconciliada com getYTD('Geral') */
export interface TotalRanking {
  headcountMedio: number;
  desligamentos: number;
  ytdTotal: number;
  ytdVoluntario: number;
  ytdInvoluntario: number;
  ytdAnterior: number | null;
  ytdAnoAnterior: number | null;
  status: 'good' | 'bad' | 'warn';
}

export interface ResultadoRanking {
  ranking: ItemRanking[];
  periodo: string;
  numMesesYTD: number;   // meses acumulados no YTD (Jan → último mês do período)
  metaYTD: number;       // meta acumulada até o período (META_MENSAL × numMesesYTD)
  metaFY: number;        // meta do ano cheio (META_MENSAL × 12)
  total: TotalRanking;   // linha da empresa (Geral)
}

/** breakdownByDimension → análise por dimensão */
export type DimensaoBreakdown =
  | 'posicionamentoFaixa'
  | 'nivelPerformance'
  | 'senioridade'
  | 'clusterLideranca'
  | 'tipoDesligamento'
  | 'motivoDesligamento'
  | 'modalidadeTrabalho'
  | 'tendenciaPerformance'
  | 'nivelSatisfacao'
  | 'especialidade'
  | 'cargo';

export interface ItemBreakdown {
  label: string;
  desligamentos: number;
  percentual: number;
  taxaTurnover?: number;
  salarioMedioAteSaida?: number;
  tempoMedioDesdeAumento?: number;
  npsInterno?: number;
}

export interface ResultadoBreakdown {
  dimensao: DimensaoBreakdown;
  diretoria: Diretoria;
  periodo: string;
  totalDesligamentos: number;
  itens: ItemBreakdown[];
}

// ─── Análises avançadas (taxas reais, drivers, cohort, custo) ────────────────

/** getSegmentRates → taxa REAL por valor de uma dimensão, com lift vs população */
export interface ItemSegmentRate {
  label: string;
  desligamentos: number;
  composicaoPct: number;        // % das saídas neste segmento
  populacaoPct: number | null;  // % do headcount neste segmento (null se sem base)
  taxaSegmento: number | null;  // taxa mensal real do segmento (null se sem base)
  lift: number | null;          // sobre-representação: composição ÷ população (1 = neutro)
  amostraSuficiente: boolean;   // false se desligamentos < limite de confiança
}

export interface ResultadoSegmentRates {
  dimensao: DimensaoBreakdown;
  diretoria: Diretoria;
  periodo: string;
  totalDesligamentos: number;
  taxaGeral: number;            // taxa mensal média do recorte (base do lift)
  temPopulacaoBase: boolean;    // se a dimensão tem composição de população
  itens: ItemSegmentRate[];
}

/** getDrivers → fatores que mais sobre/sub-representam as saídas, ranqueados por lift */
export interface DriverItem {
  dimensao: string;
  valor: string;
  desligamentos: number;
  composicaoPct: number;
  populacaoPct: number;
  lift: number;
  taxaSegmento: number;
}

export interface ResultadoDrivers {
  diretoria: Diretoria;
  periodo: string;
  totalDesligamentos: number;
  taxaGeral: number;
  /** fatores de risco: lift alto (segmento sai muito acima do esperado) */
  fatoresDeRisco: DriverItem[];
  /** fatores protetivos: lift baixo (segmento retém acima do esperado) */
  fatoresProtetivos: DriverItem[];
  aviso: string | null;         // alerta de amostra/limitação
}

/** crossBreakdown → cruzamento de duas dimensões */
export interface CelulaCross {
  valor1: string;
  valor2: string;
  desligamentos: number;
  percentual: number;
  /** taxa mensal real do cruzamento (null se alguma dimensão não existe na população) */
  taxaCelula?: number | null;
  /** lift do cruzamento vs. a taxa geral da diretoria (junção real, não marginais) */
  lift?: number | null;
}

export interface ResultadoCrossBreakdown {
  dimensao1: DimensaoBreakdown;
  dimensao2: DimensaoBreakdown;
  diretoria: Diretoria;
  periodo: string;
  totalDesligamentos: number;
  celulas: CelulaCross[];       // ordenadas por desligamentos desc
  destaque: string | null;      // narrativa do segmento mais crítico
}

/** compareGroups → comparação lado a lado de dois recortes */
export interface GrupoComparado {
  rotulo: string;
  taxa: number;
  desligamentos: number;
  headcountMedio: number;
  voluntarioPct: number;
  altaPerformancePct: number;   // % das saídas que eram alta performance
}

export interface ResultadoComparacao {
  grupoA: GrupoComparado;
  grupoB: GrupoComparado;
  diferencaTaxaPp: number;      // pp (A - B)
  liderTaxa: string;            // qual grupo tem maior taxa
}

/** getCohortByTenure → saídas por faixa de tempo de casa */
export interface CohortBucket {
  faixa: string;                // ex: "0-12 meses"
  desligamentos: number;
  percentual: number;
  voluntarioPct: number;
  salarioMedio: number;
}

export interface ResultadoCohort {
  diretoria: Diretoria;
  periodo: string;
  totalDesligamentos: number;
  buckets: CohortBucket[];
  earlyAttritionPct: number;    // % que saiu em ≤12 meses
  tempoMedioMeses: number;
}

/** quantifyCost → custo estimado do turnover */
export interface ResultadoCusto {
  diretoria: Diretoria;
  periodo: string;
  desligamentos: number;
  folhaMensalPerdida: number;        // soma dos salários mensais
  custoReposicaoEstimado: number;    // folha × multiplicador
  multiplicador: number;
  custoRegretido: number;            // custo só das saídas voluntárias de alta performance
  metodologia: string;
}

/** getRegrettedAttrition → saídas voluntárias de alta performance (a perda cara) */
export interface ResultadoRegretido {
  diretoria: Diretoria;
  periodo: string;
  totalDesligamentos: number;
  desligamentosRegretidos: number;   // voluntário + performance "acima"
  percentualRegretido: number;       // % do total de saídas
  custoRegretido: number;
  salarioMedio: number;
  npsInternoMedio: number;
  motivoPrincipal: string | null;
}

// ─── Insights pré-gerados ────────────────────────────────────────────────────

/** Insight pré-gerado para uma combinação periodo × diretoria */
export interface InsightPreGerado {
  manchete: string; // frase executiva principal
  titulos: {
    graficoPrincipal: string;
    graficoRanking: string;
    graficoTendencia: string;
  };
  geradoEm: string; // ISO timestamp
}

/** Índice de insights — lib/data/insights.json
 *  Chave: `${periodo}:${diretoria}` */
export type IndiceInsights = Record<string, InsightPreGerado>;

// ─── Chat conversacional ─────────────────────────────────────────────────────

/** Item genérico de gráfico de barras horizontais para análises avançadas */
export interface BarItem {
  label: string;
  value: number;
  highlight?: boolean;
  sub?: string; // rótulo secundário (ex: "n=49 · 18%/mês")
}

/** Gráfico inline que a IA indica na resposta — usa os mesmos componentes M4 */
export type ChatGraph =
  | { type: 'trend'; tendencia: ResultadoTendencia; projecao: ResultadoProjecao; meta: number }
  | { type: 'ranking'; data: ResultadoRanking }
  | { type: 'breakdown'; data: ResultadoBreakdown }
  | { type: 'bars'; title: string; unit: '%' | 'x' | 'n' | 'R$'; data: BarItem[] };

/** Mensagem no histórico do chat */
export interface MensagemChat {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  graph?: ChatGraph;
  streaming?: boolean;
  status?: string; // rótulo de progresso enquanto as funções rodam
}

/** Estado do filtro ativo — compartilhado entre dashboard e chat */
export interface ContextoFiltro {
  periodo: Periodo;
  diretoria: Diretoria;
}
