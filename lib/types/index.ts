/* ─── Contratos de dados — Dashboard Conversacional ─────────────────────────
 *
 * Estes tipos são a fonte de verdade para o shape de todos os dados que
 * trafegam na aplicação: do JSON estático → funções de cálculo → gráficos
 * → serverless function de chat. Qualquer mudança no dataset deve se
 * refletir aqui primeiro.
 *
 * Referência: LUC-159
 * ──────────────────────────────────────────────────────────────────────────── */

// ─── Enumerações ────────────────────────────────────────────────────────────

export type Diretoria =
  | 'Tecnologia'
  | 'Comercial'
  | 'Operações'
  | 'Financeiro'
  | 'RH'
  | 'Marketing'
  | 'Geral'; // visão consolidada da empresa

export type TipoDesligamento = 'voluntário' | 'involuntário';

export type MotivoDesligamento =
  | 'remuneração'
  | 'carreira'
  | 'cultura'
  | 'performance'
  | 'pessoal'
  | 'outro';

export type FaixaSalarial = 'júnior' | 'pleno' | 'sênior' | 'gerência' | 'diretoria';

export type NivelPerformance = 'abaixo' | 'dentro' | 'acima';

export type NivelSatisfacao = 'baixo' | 'médio' | 'alto';

export type Periodo = '3m' | '6m' | '12m' | 'q1' | 'q2' | 'q3' | 'q4';

// ─── Registro de funcionário/evento ─────────────────────────────────────────

/** Registro de desligamento individual — fonte de verdade do dataset */
export interface RegistroDesligamento {
  id: string;
  mes: string; // formato: "YYYY-MM"
  diretoria: Diretoria;
  cargo: string;
  faixaSalarial: FaixaSalarial;
  salarioBRL: number;
  tempoEmpresaMeses: number;
  nivelPerformance: NivelPerformance;
  nivelSatisfacao: NivelSatisfacao;
  tipoDesligamento: TipoDesligamento;
  motivoDesligamento: MotivoDesligamento;
}

/** Registro de headcount mensal por diretoria */
export interface HeadcountMensal {
  mes: string; // formato: "YYYY-MM"
  diretoria: Diretoria;
  headcountInicio: number;
  admissoes: number;
  desligamentos: number;
  headcountFim: number;
}

// ─── Série temporal agregada ─────────────────────────────────────────────────

/** Ponto de dados mensal para um gráfico de série temporal */
export interface PontoSerieTemporal {
  mes: string; // formato: "YYYY-MM" — também usado como label "Jan/24"
  taxaTurnover: number; // % mensal
  desligamentos: number;
  admissoes: number;
  headcount: number;
}

/** Dados agregados por diretoria em um período */
export interface DadosDiretoria {
  diretoria: Diretoria;
  taxaTurnover: number;
  desligamentos: number;
  headcountMedio: number;
  variacaoMoM: number; // diferença em pp vs. mês anterior
  variacaoYoY: number; // diferença em pp vs. mesmo período do ano anterior
}

// ─── Resultado de funções de cálculo ────────────────────────────────────────

/** Resultado de getTurnoverRate */
export interface ResultadoTurnover {
  taxa: number; // % no período
  desligamentos: number;
  headcountMedio: number;
  meta: number; // benchmark configurado
  status: 'good' | 'bad' | 'warn';
  statusLabel: string;
}

/** Resultado de getTrend */
export interface ResultadoTendencia {
  taxaAtual: number;
  variacaoMoM: number; // pp vs. mês anterior
  variacaoYoY: number; // pp vs. mesmo período do ano anterior
  direcao: 'subindo' | 'caindo' | 'estável';
  serie: PontoSerieTemporal[];
}

/** Resultado de getProjection */
export interface ResultadoProjecao {
  projecaoProximo3Meses: number; // % projetado
  metodologia: string;
  serieHistorica: PontoSerieTemporal[];
  serieProjetada: Array<{ mes: string; taxaProjetada: number }>;
}

/** Resultado de rankDiretoriasByTurnover */
export interface ResultadoRanking {
  ranking: DadosDiretoria[];
  periodo: string;
}

/** Resultado de breakdownByDimension */
export interface ResultadoBreakdown {
  dimensao: string;
  itens: Array<{
    label: string;
    taxaTurnover: number;
    desligamentos: number;
    headcount: number;
  }>;
}

// ─── Insights pré-gerados ────────────────────────────────────────────────────

/** Chave de lookup para o JSON de insights pré-gerados */
export interface ChaveInsight {
  periodo: Periodo;
  diretoria: Diretoria;
}

/** Insight pré-gerado para uma combinação periodo × diretoria */
export interface InsightPreGerado {
  manchete: string; // frase executiva de abertura
  titulos: {
    graficoPrincipal: string;
    graficoRanking: string;
    graficoTendencia: string;
  };
  geradoEm: string; // ISO timestamp da geração
}

/** Índice completo de insights — JSON estático no app */
export type IndiceInsights = Record<string, InsightPreGerado>; // key: `${periodo}:${diretoria}`

// ─── Chat conversacional ─────────────────────────────────────────────────────

/** Mensagem no histórico do chat */
export interface MensagemChat {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  grafico?: EspecificacaoGrafico; // gráfico sugerido pela IA na resposta
}

/** Especificação de gráfico que a IA retorna junto com a resposta */
export interface EspecificacaoGrafico {
  tipo: 'linha' | 'barra' | 'area' | 'pie';
  titulo: string;
  dados: unknown; // tipado conforme o componente de gráfico que o renderiza
}

/** Contexto do filtro ativo — passado à serverless function de chat */
export interface ContextoFiltro {
  periodo: Periodo;
  diretoria: Diretoria;
}
