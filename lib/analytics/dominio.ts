/**
 * Domínio da Verta S.A.: constantes, tipos do roster e convenções de tempo.
 *
 * Este módulo é puro (não importa dados) e pode ser usado no client e no servidor.
 *
 * ── Convenções de tempo (valem para gerador, tabela de fatos, cubo e motor) ──────
 *
 * Mês `t` é um rótulo "YYYY-MM". A janela exportada tem 36 meses (MESES).
 *
 * 1. Estado no início de `t`: o segmento do histórico com `desde <= t` mais recente.
 * 2. Fluxos do mês `t` (desligamento, promoção, movimentação, horas, eNPS) são contados
 *    contra o estado no INÍCIO de `t`. Admissão em `t` é contada no estado de entrada.
 * 3. Transições (promoção, movimentação, troca de gestor) decididas em `t` passam a valer
 *    em `t+1`: o novo segmento tem `desde = t+1`.
 * 4. Quem é desligado em `t` está ativo no início de `t` e não está no fim de `t`.
 *    Quem é admitido em `t` não está no início de `t` e está no fim de `t`.
 * 5. Estoques do mês `t` (headcount, liderança, folha, diversidade) são medidos no FIM de
 *    `t`, já com as transições aplicadas, ou seja, no estado do início de `t+1`.
 *    Consequência: hcIni(t+1) = hc(t) em qualquer recorte, e por diretoria
 *    hc(t) = hcIni(t) + admissões(t) − desligamentos(t) + entradas(t) − saídas internas(t).
 * 6. Taxas de evento usam como denominador o headcount do início do mês somado na janela
 *    (pessoa-mês de exposição). Taxas anualizadas multiplicam a média mensal por 12.
 */

// ── Janela ────────────────────────────────────────────────────────────────────

export type Mes = string; // "YYYY-MM"

export const MES_INICIO: Mes = '2023-10';
export const MES_FIM: Mes = '2026-09';
/** Aquecimento da simulação (não exportado): vagas, eNPS e tempo de casa já em regime */
export const MES_INICIO_SIMULACAO: Mes = '2023-04';

export function mesIdx(mes: Mes): number {
  const [y, m] = mes.split('-').map(Number);
  return y * 12 + (m - 1);
}

export function mesDeIdx(idx: number): Mes {
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function somarMeses(mes: Mes, n: number): Mes {
  return mesDeIdx(mesIdx(mes) + n);
}

export function intervaloMeses(inicio: Mes, fim: Mes): Mes[] {
  const out: Mes[] = [];
  for (let i = mesIdx(inicio); i <= mesIdx(fim); i++) out.push(mesDeIdx(i));
  return out;
}

export const MESES: readonly Mes[] = intervaloMeses(MES_INICIO, MES_FIM);

/** Mês do calendário (1-12) */
export function mesDoAno(mes: Mes): number {
  return Number(mes.slice(5, 7));
}

/** Ciclos trimestrais de eNPS: Dez, Mar, Jun, Set */
export function ehCicloEnps(mes: Mes): boolean {
  return mesDoAno(mes) % 3 === 0;
}

export const CICLOS_ENPS: readonly Mes[] = MESES.filter(ehCicloEnps);

const ROTULOS_MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** "2026-01" → "Jan/26" */
export function rotuloMes(mes: Mes): string {
  return `${ROTULOS_MES[mesDoAno(mes) - 1]}/${mes.slice(2, 4)}`;
}

// ── Estrutura da Verta S.A. ───────────────────────────────────────────────────

export const DIRETORIAS = [
  'Tecnologia',
  'Distribuição & Assessoria',
  'Operações',
  'Financeiro & Risco',
  'Gente',
  'Produtos & Plataforma',
] as const;
export type Diretoria = (typeof DIRETORIAS)[number];

export interface Especialidade {
  nome: string;
  superintendente: string;
}

export const ESTRUTURA: Record<Diretoria, { diretor: string; especialidades: readonly Especialidade[] }> = {
  Tecnologia: {
    diretor: 'Ana Beatriz Fontes',
    especialidades: [
      { nome: 'Engenharia de Software', superintendente: 'Carlos Lima' },
      { nome: 'Engenharia de Dados & Analytics', superintendente: 'Fernanda Okamoto' },
      { nome: 'Infraestrutura & Cloud', superintendente: 'Bruno Assunção' },
      { nome: 'Segurança da Informação', superintendente: 'Patricia Vieira' },
    ],
  },
  'Distribuição & Assessoria': {
    diretor: 'Ricardo Nogueira',
    especialidades: [
      { nome: 'Assessores de Investimentos', superintendente: 'Eduardo Batista' },
      { nome: 'Inside Sales Digital', superintendente: 'Mariana Fonseca' },
      { nome: 'Parcerias & Expansão de Escritórios', superintendente: 'Thiago Cavalcanti' },
    ],
  },
  Operações: {
    diretor: 'Marcos Teixeira',
    especialidades: [
      { nome: 'Back Office & Custódia', superintendente: 'Juliana Carvalho' },
      { nome: 'Compliance & Regulatório', superintendente: 'Roberto Almeida' },
      { nome: 'Processamento & Liquidação', superintendente: 'Vanessa Rocha' },
    ],
  },
  'Financeiro & Risco': {
    diretor: 'Camila Drummond',
    especialidades: [
      { nome: 'Controladoria & FP&A', superintendente: 'Felipe Nakamura' },
      { nome: 'Risco de Mercado & Crédito', superintendente: 'Luciana Borges' },
      { nome: 'Tesouraria', superintendente: 'Diego Santana' },
    ],
  },
  Gente: {
    diretor: 'Isabela Ferreira',
    especialidades: [
      { nome: 'Recrutamento & Seleção', superintendente: 'Amanda Silveira' },
      { nome: 'Desenvolvimento Organizacional', superintendente: 'Renato Prado' },
      { nome: 'Remuneração & Benefícios', superintendente: 'Priscila Moura' },
    ],
  },
  'Produtos & Plataforma': {
    diretor: 'Leonardo Azevedo',
    especialidades: [
      { nome: 'Produtos de Investimento', superintendente: 'Gabriela Machado' },
      { nome: 'Plataforma Digital & UX', superintendente: 'Henrique Torres' },
      { nome: 'Wealth Management', superintendente: 'Beatriz Cunha' },
    ],
  },
};

export const ESPECIALIDADES: readonly string[] = DIRETORIAS.flatMap(d => ESTRUTURA[d].especialidades.map(e => e.nome));

// ── Atributos ─────────────────────────────────────────────────────────────────

export const SENIORIDADES = ['júnior', 'pleno', 'sênior', 'gerência', 'diretoria'] as const;
export type Senioridade = (typeof SENIORIDADES)[number];

/** Liderança = gerência + diretoria (diretores e superintendentes) */
export function ehLideranca(s: Senioridade): boolean {
  return s === 'gerência' || s === 'diretoria';
}

export const GENEROS = ['mulher', 'homem'] as const;
export type Genero = (typeof GENEROS)[number];

/** Cor ou raça, categorias do IBGE */
export const RACAS = ['branca', 'preta', 'parda', 'amarela', 'indígena'] as const;
export type Raca = (typeof RACAS)[number];

/** Pessoas negras = pretas + pardas (convenção do IBGE) */
export function ehNegra(r: Raca): boolean {
  return r === 'preta' || r === 'parda';
}

export const FAIXAS_ETARIAS = ['até 24', '25-34', '35-44', '45-54', '55+'] as const;
export type FaixaEtaria = (typeof FAIXAS_ETARIAS)[number];

export function idadeEm(nascimento: Mes, mes: Mes): number {
  return Math.floor((mesIdx(mes) - mesIdx(nascimento)) / 12);
}

export function faixaEtaria(nascimento: Mes, mes: Mes): FaixaEtaria {
  const idade = idadeEm(nascimento, mes);
  if (idade <= 24) return 'até 24';
  if (idade <= 34) return '25-34';
  if (idade <= 44) return '35-44';
  if (idade <= 54) return '45-54';
  return '55+';
}

export const FAIXAS_TEMPO_CASA = ['< 1 ano', '1-3 anos', '3-5 anos', '5+ anos'] as const;
export type FaixaTempoCasa = (typeof FAIXAS_TEMPO_CASA)[number];

/** Meses completos de casa no início do mês `mes` */
export function tempoDeCasa(admissao: Mes, mes: Mes): number {
  return mesIdx(mes) - mesIdx(admissao);
}

export function faixaTempoCasa(meses: number): FaixaTempoCasa {
  if (meses < 12) return '< 1 ano';
  if (meses < 36) return '1-3 anos';
  if (meses < 60) return '3-5 anos';
  return '5+ anos';
}

export const FAIXAS_SALARIAIS = ['piso', 'q1', 'mediana', 'q3', 'teto'] as const;
export type FaixaSalarial = (typeof FAIXAS_SALARIAIS)[number];

export const PERFORMANCES = ['abaixo', 'dentro', 'acima'] as const;
export type Performance = (typeof PERFORMANCES)[number];

export const SATISFACOES = ['baixa', 'média', 'alta'] as const;
export type Satisfacao = (typeof SATISFACOES)[number];

export const MODALIDADES = ['presencial', 'híbrido', 'remoto'] as const;
export type Modalidade = (typeof MODALIDADES)[number];

export const ONBOARDINGS = ['completo', 'incompleto'] as const;
export type Onboarding = (typeof ONBOARDINGS)[number];

/** Categoria da última resposta de eNPS (0-6 detrator, 7-8 neutro, 9-10 promotor) */
export const CATEGORIAS_ENPS = ['promotor', 'neutro', 'detrator', 'sem resposta'] as const;
export type CategoriaEnps = (typeof CATEGORIAS_ENPS)[number];

export function categoriaEnps(nota: number | null | undefined): CategoriaEnps {
  if (nota == null) return 'sem resposta';
  if (nota >= 9) return 'promotor';
  if (nota >= 7) return 'neutro';
  return 'detrator';
}

export const SIM_NAO = ['sim', 'não'] as const;
export type SimNao = (typeof SIM_NAO)[number];

export const TROCAS_GESTOR = ['0', '1', '2+'] as const;
export type TrocasGestor = (typeof TROCAS_GESTOR)[number];

export const TIPOS_DESLIGAMENTO = ['voluntário', 'involuntário'] as const;
export type TipoDesligamento = (typeof TIPOS_DESLIGAMENTO)[number];

export const MOTIVOS_DESLIGAMENTO = [
  'remuneração',
  'carreira',
  'liderança e clima',
  'pessoal',
  'performance',
  'reestruturação',
] as const;
export type MotivoDesligamento = (typeof MOTIVOS_DESLIGAMENTO)[number];

// ── Roster (server-only em runtime; os tipos são compartilhados) ─────────────────

export type MotivoSegmento = 'admissão' | 'promoção' | 'movimentação';

/** Estado de uma pessoa a partir de `desde` (inclusive) até o próximo segmento */
export interface Segmento {
  desde: Mes;
  motivo: MotivoSegmento;
  diretoria: Diretoria;
  especialidade: string;
  senioridade: Senioridade;
  cargo: string;
  /** salário mensal em BRL */
  salario: number;
  /** ponto médio da faixa salarial do cargo (BRL/mês), base do compa-ratio */
  referencia: number;
  faixa: FaixaSalarial;
}

export interface Desligamento {
  mes: Mes;
  tipo: TipoDesligamento;
  motivo: MotivoDesligamento;
}

export interface Pessoa {
  id: string;
  genero: Genero;
  raca: Raca;
  pcd: boolean;
  nascimento: Mes;
  admissao: Mes;
  desligamento: Desligamento | null;
  performance: Performance;
  satisfacao: Satisfacao;
  modalidade: Modalidade;
  onboarding: Onboarding;
  /** segmentos em ordem cronológica; o primeiro tem desde = admissão */
  historico: Segmento[];
  /** gestor direto a partir de `desde`; id null = reporta ao CEO (fora do roster) */
  gestores: { desde: Mes; id: string | null }[];
  /**
   * Séries mensais de quem estava ativo no INÍCIO do mês, alinhadas a partir de `desde`
   * (o primeiro mês da janela em que a pessoa está ativa no início do mês).
   */
  mensal: { desde: Mes; treino: number[]; ausencia: number[]; extras: number[] } | null;
  /** nota 0-10 por ciclo de CICLOS_ENPS (null = não estava ativa ou não respondeu) */
  enps: (number | null)[];
}

export type OrigemVaga = 'reposição' | 'crescimento';
export type Preenchimento = 'externo' | 'interno';

export interface Requisicao {
  id: string;
  diretoria: Diretoria;
  especialidade: string;
  senioridade: Senioridade;
  origem: OrigemVaga;
  abertura: Mes;
  /** null = ainda aberta no fim da janela */
  fechamento: Mes | null;
  preenchimento: Preenchimento | null;
  /** id de quem ocupou a vaga */
  ocupante: string | null;
  diasParaPreencher: number | null;
  candidatos: number;
  ofertas: number;
  aceites: number;
  /** custo de recrutamento em BRL */
  custo: number;
}

// ── Tabelas de eventos (derivadas do roster; `mes` = mês em que o fluxo é contado) ──

export interface EventoAdmissao {
  pessoa: string;
  mes: Mes;
  diretoria: Diretoria;
  especialidade: string;
  senioridade: Senioridade;
  requisicao: string;
}

export interface EventoDesligamento {
  pessoa: string;
  mes: Mes;
  diretoria: Diretoria;
  especialidade: string;
  senioridade: Senioridade;
  tipo: TipoDesligamento;
  motivo: MotivoDesligamento;
  tempoDeCasaMeses: number;
  performance: Performance;
  faixa: FaixaSalarial;
  salario: number;
}

/** Promoção decidida em `mes`; a nova senioridade vale a partir do mês seguinte */
export interface EventoPromocao {
  pessoa: string;
  mes: Mes;
  diretoria: Diretoria;
  especialidade: string;
  de: Senioridade;
  para: Senioridade;
  /** vaga preenchida pela promoção (null = promoção de ciclo, sem vaga) */
  requisicao: string | null;
}

/** Movimentação lateral decidida em `mes`; a nova posição vale a partir do mês seguinte */
export interface EventoMovimentacao {
  pessoa: string;
  mes: Mes;
  senioridade: Senioridade;
  de: { diretoria: Diretoria; especialidade: string };
  para: { diretoria: Diretoria; especialidade: string };
  /** vaga preenchida pela movimentação (null = rotação sem vaga) */
  requisicao: string | null;
}

export interface Eventos {
  admissoes: EventoAdmissao[];
  desligamentos: EventoDesligamento[];
  promocoes: EventoPromocao[];
  movimentacoes: EventoMovimentacao[];
  requisicoes: Requisicao[];
}

// ── Helpers de histórico ──────────────────────────────────────────────────────

/** Segmento em vigor no mês `mes` (ou null se a pessoa ainda não tinha sido admitida) */
export function segmentoEm(p: Pessoa, mes: Mes): Segmento | null {
  let atual: Segmento | null = null;
  for (const s of p.historico) {
    if (s.desde <= mes) atual = s;
    else break;
  }
  return atual;
}

export function gestorEm(p: Pessoa, mes: Mes): string | null {
  let atual: string | null = null;
  for (const g of p.gestores) {
    if (g.desde <= mes) atual = g.id;
    else break;
  }
  return atual;
}

/** Ativa no início do mês: admitida antes de `mes` e não desligada antes de `mes` */
export function ativaNoInicio(p: Pessoa, mes: Mes): boolean {
  return p.admissao < mes && (p.desligamento === null || p.desligamento.mes >= mes);
}

/** Ativa no fim do mês: admitida até `mes` e não desligada até `mes` */
export function ativaNoFim(p: Pessoa, mes: Mes): boolean {
  return p.admissao <= mes && (p.desligamento === null || p.desligamento.mes > mes);
}
