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

/** rankDiretoriasByTurnover → ranking com contexto */
export interface ItemRanking {
  diretoria: Diretoria;
  taxa: number;
  desligamentos: number;
  headcountMedio: number;
  variacaoMoM: number | null;
  status: 'good' | 'bad' | 'warn';
}

export interface ResultadoRanking {
  ranking: ItemRanking[];
  periodo: string;
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

/** Gráfico inline que a IA indica na resposta — usa os mesmos componentes M4 */
export type ChatGraph =
  | { type: 'trend'; tendencia: ResultadoTendencia; projecao: ResultadoProjecao; meta: number }
  | { type: 'ranking'; data: ResultadoRanking }
  | { type: 'breakdown'; data: ResultadoBreakdown };

/** Mensagem no histórico do chat */
export interface MensagemChat {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  graph?: ChatGraph;
  streaming?: boolean;
}

/** Estado do filtro ativo — compartilhado entre dashboard e chat */
export interface ContextoFiltro {
  periodo: Periodo;
  diretoria: Diretoria;
}
