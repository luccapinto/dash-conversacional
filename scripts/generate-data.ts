#!/usr/bin/env npx tsx
/**
 * generate-data.ts
 *
 * Gera o dataset sintético da Verta S.A. — corretora de investimentos fictícia.
 * Determinístico com seed fixa (42). Rodar: npx tsx scripts/generate-data.ts
 *
 * Outputs:
 *   lib/data/desligamentos.json  — eventos de desligamento individuais
 *   lib/data/headcount.json      — headcount mensal por diretoria
 *   lib/data/meta.json           — estatísticas de validação
 */

import * as fs from 'fs';
import * as path from 'path';

// ── Seeded PRNG (Mulberry32) — garante reprodutibilidade ──────────────────────

function createRng(seed: number) {
  let s = seed;
  const next = (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    choice: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    weighted: <T>(items: readonly T[], weights: readonly number[]): T => {
      const total = weights.reduce((a, b) => a + b, 0);
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    },
    // Box-Muller, clamped to int
    normal: (mean: number, std: number, min = 0, max = 999): number => {
      const u1 = Math.max(1e-10, next());
      const u2 = next();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return Math.max(min, Math.min(max, Math.round(mean + z * std)));
    },
  };
}

const rng = createRng(42);

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Diretoria =
  | 'Tecnologia'
  | 'Distribuição & Assessoria'
  | 'Operações'
  | 'Financeiro & Risco'
  | 'Gente'
  | 'Produtos & Plataforma';

type Senioridade = 'júnior' | 'pleno' | 'sênior' | 'gerência' | 'diretoria';
type PosicionamentoFaixa = 'piso' | 'q1' | 'mediana' | 'q3' | 'teto';
type ClusterLideranca = 'contribuidor individual' | 'líder de CI' | 'líder de líderes';
type Performance = 'abaixo' | 'dentro' | 'acima';
type TendenciaPerformance = 'melhorando' | 'estável' | 'piorando';
type Satisfacao = 'baixo' | 'médio' | 'alto';
type Modalidade = 'presencial' | 'híbrido' | 'remoto';
type TipoDesligamento = 'voluntário' | 'involuntário';
type Motivo = 'remuneração' | 'carreira' | 'cultura' | 'performance' | 'pessoal' | 'outro';

interface Desligamento {
  id: string;
  mes: string;
  diretoria: Diretoria;
  especialidade: string;
  diretor: string;
  superintendente: string;
  cargo: string;
  senioridade: Senioridade;
  clusterLideranca: ClusterLideranca;
  eSocio: boolean;
  modalidadeTrabalho: Modalidade;
  salarioBRL: number;
  posicionamentoFaixa: PosicionamentoFaixa;
  tempoEmpresaMeses: number;
  tempoNoCargaMeses: number;
  tempoDesdePromocaoMeses: number;
  tempoDesdeAumentoMeses: number;
  trocasDeLiderUltimos12Meses: number;
  nivelPerformance: Performance;
  tendenciaPerformance: TendenciaPerformance;
  nivelSatisfacao: Satisfacao;
  npsInterno: number;
  tipoDesligamento: TipoDesligamento;
  motivoDesligamento: Motivo;
}

interface HeadcountMensal {
  mes: string;
  diretoria: Diretoria;
  headcountInicio: number;
  admissoes: number;
  desligamentos: number;
  headcountFim: number;
}

/**
 * Composição da força de trabalho ATIVA (quem ficou) por dimensão.
 *
 * Sem isto, só conseguimos calcular a *composição* de quem saiu
 * ("60% dos desligados eram júnior") — nunca a *taxa* por segmento
 * ("júniors saem 2× mais") nem o *lift* (índice de sobre-representação).
 *
 * `distribuicoes[dimensao][valor]` = fração do headcount naquele valor.
 * As taxas reais por segmento e os drivers (lib/calculations) derivam daqui.
 */
interface PopulacaoDiretoria {
  diretoria: Diretoria | 'Geral';
  headcountMedio: number;
  distribuicoes: Record<string, Record<string, number>>;
}

// ── Estrutura da Verta S.A. ───────────────────────────────────────────────────

const ESTRUTURA = {
  Tecnologia: {
    diretor: 'Ana Beatriz Fontes',
    headcountInicial: 250,
    especialidades: [
      { nome: 'Engenharia de Software',       superintendente: 'Carlos Lima',       peso: 40 },
      { nome: 'Engenharia de Dados & Analytics', superintendente: 'Fernanda Okamoto', peso: 28 },
      { nome: 'Infraestrutura & Cloud',       superintendente: 'Bruno Assunção',    peso: 20 },
      { nome: 'Segurança da Informação',       superintendente: 'Patricia Vieira',   peso: 12 },
    ],
    cargos: ['Desenvolvedor', 'Engenheiro de Software', 'Cientista de Dados', 'Arquiteto de Soluções', 'Tech Lead', 'Analista de TI'],
    senDist: [0.15, 0.30, 0.30, 0.20, 0.05],
    modalDist: [0.10, 0.55, 0.35],
  },
  'Distribuição & Assessoria': {
    diretor: 'Ricardo Nogueira',
    headcountInicial: 180,
    especialidades: [
      { nome: 'Assessores de Investimentos',        superintendente: 'Eduardo Batista',   peso: 50 },
      { nome: 'Inside Sales Digital',               superintendente: 'Mariana Fonseca',   peso: 28 },
      { nome: 'Parcerias & Expansão de Escritórios', superintendente: 'Thiago Cavalcanti', peso: 22 },
    ],
    cargos: ['Assessor de Investimentos', 'Analista Comercial', 'Gerente de Relacionamento', 'Especialista em Produtos', 'Coordenador de Parcerias'],
    senDist: [0.20, 0.35, 0.25, 0.18, 0.02],
    modalDist: [0.30, 0.55, 0.15],
  },
  Operações: {
    diretor: 'Marcos Teixeira',
    headcountInicial: 160,
    especialidades: [
      { nome: 'Back Office & Custódia',    superintendente: 'Juliana Carvalho', peso: 40 },
      { nome: 'Compliance & Regulatório',  superintendente: 'Roberto Almeida',  peso: 35 },
      { nome: 'Processamento & Liquidação', superintendente: 'Vanessa Rocha',    peso: 25 },
    ],
    cargos: ['Analista de Operações', 'Analista de Compliance', 'Especialista Regulatório', 'Analista de Back Office', 'Coordenador de Operações'],
    senDist: [0.18, 0.32, 0.28, 0.18, 0.04],
    modalDist: [0.45, 0.45, 0.10],
  },
  'Financeiro & Risco': {
    diretor: 'Camila Drummond',
    headcountInicial: 120,
    especialidades: [
      { nome: 'Controladoria & FP&A',        superintendente: 'Felipe Nakamura', peso: 38 },
      { nome: 'Risco de Mercado & Crédito',   superintendente: 'Luciana Borges',  peso: 37 },
      { nome: 'Tesouraria',                   superintendente: 'Diego Santana',   peso: 25 },
    ],
    cargos: ['Analista Financeiro', 'Analista de Risco', 'Controlador', 'Especialista em Risco', 'Gerente Financeiro'],
    senDist: [0.12, 0.28, 0.35, 0.20, 0.05],
    modalDist: [0.35, 0.50, 0.15],
  },
  Gente: {
    diretor: 'Isabela Ferreira',
    headcountInicial: 80,
    especialidades: [
      { nome: 'Recrutamento & Seleção',        superintendente: 'Amanda Silveira', peso: 38 },
      { nome: 'Desenvolvimento Organizacional', superintendente: 'Renato Prado',    peso: 32 },
      { nome: 'Remuneração & Benefícios',       superintendente: 'Priscila Moura',  peso: 30 },
    ],
    cargos: ['Analista de RH', 'Recruiter', 'Especialista de Gente', 'HRBP', 'Gerente de Pessoas'],
    senDist: [0.15, 0.30, 0.30, 0.20, 0.05],
    modalDist: [0.25, 0.60, 0.15],
  },
  'Produtos & Plataforma': {
    diretor: 'Leonardo Azevedo',
    headcountInicial: 110,
    especialidades: [
      { nome: 'Produtos de Investimento',   superintendente: 'Gabriela Machado', peso: 36 },
      { nome: 'Plataforma Digital & UX',    superintendente: 'Henrique Torres',  peso: 37 },
      { nome: 'Wealth Management',          superintendente: 'Beatriz Cunha',    peso: 27 },
    ],
    cargos: ['Product Manager', 'Product Designer', 'UX Researcher', 'Analista de Produto', 'Gerente de Produto', 'Especialista em Investimentos'],
    senDist: [0.10, 0.28, 0.32, 0.22, 0.08],
    modalDist: [0.15, 0.55, 0.30],
  },
} as const satisfies Record<string, {
  diretor: string;
  headcountInicial: number;
  especialidades: readonly { nome: string; superintendente: string; peso: number }[];
  cargos: readonly string[];
  senDist: readonly number[];
  modalDist: readonly number[];
}>;

// ── Salários base por senioridade × posicionamento na faixa (BRL) ─────────────

const SALARIOS: Record<Senioridade, Record<PosicionamentoFaixa, Record<Diretoria, number>>> = {
  júnior: {
    piso:    { Tecnologia: 4500,  'Distribuição & Assessoria': 3500,  Operações: 3200,  'Financeiro & Risco': 4000,  Gente: 3000,  'Produtos & Plataforma': 4200  },
    q1:      { Tecnologia: 5500,  'Distribuição & Assessoria': 4200,  Operações: 3800,  'Financeiro & Risco': 4800,  Gente: 3600,  'Produtos & Plataforma': 5000  },
    mediana: { Tecnologia: 6800,  'Distribuição & Assessoria': 5000,  Operações: 4500,  'Financeiro & Risco': 5800,  Gente: 4200,  'Produtos & Plataforma': 6200  },
    q3:      { Tecnologia: 8000,  'Distribuição & Assessoria': 5800,  Operações: 5200,  'Financeiro & Risco': 6800,  Gente: 4900,  'Produtos & Plataforma': 7200  },
    teto:    { Tecnologia: 9500,  'Distribuição & Assessoria': 7000,  Operações: 6000,  'Financeiro & Risco': 8000,  Gente: 5800,  'Produtos & Plataforma': 8500  },
  },
  pleno: {
    piso:    { Tecnologia: 9000,  'Distribuição & Assessoria': 6500,  Operações: 5500,  'Financeiro & Risco': 7500,  Gente: 5500,  'Produtos & Plataforma': 8500  },
    q1:      { Tecnologia: 11000, 'Distribuição & Assessoria': 7800,  Operações: 6800,  'Financeiro & Risco': 9000,  Gente: 6500,  'Produtos & Plataforma': 10000 },
    mediana: { Tecnologia: 13500, 'Distribuição & Assessoria': 9500,  Operações: 8000,  'Financeiro & Risco': 11000, Gente: 7800,  'Produtos & Plataforma': 12500 },
    q3:      { Tecnologia: 16000, 'Distribuição & Assessoria': 11000, Operações: 9500,  'Financeiro & Risco': 13000, Gente: 9000,  'Produtos & Plataforma': 14500 },
    teto:    { Tecnologia: 19000, 'Distribuição & Assessoria': 13000, Operações: 11000, 'Financeiro & Risco': 15000, Gente: 10500, 'Produtos & Plataforma': 17000 },
  },
  sênior: {
    piso:    { Tecnologia: 18000, 'Distribuição & Assessoria': 12000, Operações: 10000, 'Financeiro & Risco': 14000, Gente: 10000, 'Produtos & Plataforma': 16000 },
    q1:      { Tecnologia: 22000, 'Distribuição & Assessoria': 15000, Operações: 12500, 'Financeiro & Risco': 17000, Gente: 12000, 'Produtos & Plataforma': 19500 },
    mediana: { Tecnologia: 27000, 'Distribuição & Assessoria': 18000, Operações: 15000, 'Financeiro & Risco': 21000, Gente: 14500, 'Produtos & Plataforma': 24000 },
    q3:      { Tecnologia: 33000, 'Distribuição & Assessoria': 22000, Operações: 18000, 'Financeiro & Risco': 25000, Gente: 17000, 'Produtos & Plataforma': 29000 },
    teto:    { Tecnologia: 40000, 'Distribuição & Assessoria': 26000, Operações: 21000, 'Financeiro & Risco': 30000, Gente: 20000, 'Produtos & Plataforma': 35000 },
  },
  gerência: {
    piso:    { Tecnologia: 35000, 'Distribuição & Assessoria': 25000, Operações: 22000, 'Financeiro & Risco': 28000, Gente: 20000, 'Produtos & Plataforma': 32000 },
    q1:      { Tecnologia: 42000, 'Distribuição & Assessoria': 30000, Operações: 27000, 'Financeiro & Risco': 34000, Gente: 24000, 'Produtos & Plataforma': 38000 },
    mediana: { Tecnologia: 52000, 'Distribuição & Assessoria': 37000, Operações: 33000, 'Financeiro & Risco': 42000, Gente: 30000, 'Produtos & Plataforma': 47000 },
    q3:      { Tecnologia: 62000, 'Distribuição & Assessoria': 44000, Operações: 39000, 'Financeiro & Risco': 50000, Gente: 36000, 'Produtos & Plataforma': 56000 },
    teto:    { Tecnologia: 75000, 'Distribuição & Assessoria': 55000, Operações: 48000, 'Financeiro & Risco': 62000, Gente: 44000, 'Produtos & Plataforma': 68000 },
  },
  diretoria: {
    piso:    { Tecnologia: 70000,  'Distribuição & Assessoria': 60000,  Operações: 55000,  'Financeiro & Risco': 65000,  Gente: 50000,  'Produtos & Plataforma': 65000  },
    q1:      { Tecnologia: 85000,  'Distribuição & Assessoria': 72000,  Operações: 65000,  'Financeiro & Risco': 78000,  Gente: 60000,  'Produtos & Plataforma': 78000  },
    mediana: { Tecnologia: 105000, 'Distribuição & Assessoria': 90000,  Operações: 80000,  'Financeiro & Risco': 95000,  Gente: 75000,  'Produtos & Plataforma': 95000  },
    q3:      { Tecnologia: 130000, 'Distribuição & Assessoria': 110000, Operações: 100000, 'Financeiro & Risco': 120000, Gente: 90000,  'Produtos & Plataforma': 118000 },
    teto:    { Tecnologia: 160000, 'Distribuição & Assessoria': 140000, Operações: 125000, 'Financeiro & Risco': 150000, Gente: 110000, 'Produtos & Plataforma': 145000 },
  },
};

// ── Composição base da população ativa (quem fica) ────────────────────────────
// Distribuições do workforce ATIVO por dimensão. Calibradas para serem
// realistas E para que o lift (composição de saídas ÷ composição da população)
// revele as histórias plantadas: ex. alta performance e piso/q1 estão
// sub-representados na população, então quando dominam as saídas o lift dispara.
// senioridade, modalidade e especialidade vêm de ESTRUTURA (já são da população).

const POP_BASE = {
  posicionamentoFaixa: { piso: 0.08, q1: 0.20, mediana: 0.42, q3: 0.20, teto: 0.10 },
  nivelPerformance:    { abaixo: 0.10, dentro: 0.62, acima: 0.28 },
  clusterLideranca:    { 'contribuidor individual': 0.82, 'líder de CI': 0.13, 'líder de líderes': 0.05 },
  nivelSatisfacao:     { baixo: 0.15, médio: 0.50, alto: 0.35 },
} as const;

// ── Taxa de turnover mensal por diretoria ─────────────────────────────────────
// Cada função recebe monthIndex (1 = Jan/2023 … 24 = Dez/2024) e um valor de
// ruído já sorteado [0,1] para não consumir entropy do rng principal aqui.

function baseTurnoverRate(diretoria: Diretoria, monthIndex: number, noise: number): number {
  const jitter = noise * 0.008 - 0.004; // ±0.4pp de ruído

  switch (diretoria) {
    case 'Tecnologia': {
      // Escala a partir de Jul/2023 (idx 7), pico ~6% em Dez/2023, mantém ~4.5-5.5% em 2024
      if (monthIndex < 7) return Math.max(0.010, 0.018 + jitter);
      const months = monthIndex - 6;
      const escalation = Math.min(months * 0.0042, 0.045);
      return Math.max(0.018, Math.min(0.065, 0.018 + escalation + jitter));
    }
    case 'Distribuição & Assessoria': {
      // Pico em Janeiro (idx 1 e 13), base 1.8%
      const month = ((monthIndex - 1) % 12) + 1;
      if (month === 1) return Math.max(0.040, 0.055 + jitter * 2);
      if (month === 12) return Math.max(0.025, 0.030 + jitter); // Dez: assessores já antecipando
      return Math.max(0.010, 0.018 + jitter);
    }
    case 'Operações': {
      // Escala a partir de Jul/2024 (idx 19)
      if (monthIndex < 19) return Math.max(0.008, 0.015 + jitter);
      const months = monthIndex - 18;
      const escalation = Math.min(months * 0.0045, 0.030);
      return Math.max(0.015, Math.min(0.048, 0.015 + escalation + jitter));
    }
    case 'Financeiro & Risco': return Math.max(0.006, 0.012 + jitter);
    case 'Gente':               return Math.max(0.005, 0.010 + jitter);
    case 'Produtos & Plataforma': return Math.max(0.008, 0.015 + jitter);
  }
}

// ── Roster individual — simulação por hazard ──────────────────────────────────
// Cada pessoa é uma linha. A cada mês, quem sai é SELECIONADO entre os ativos
// com peso proporcional ao seu hazard (probabilidade de sair, dirigida pelos
// atributos). O número de saídas por diretoria-mês ainda segue baseTurnoverRate,
// então a curva agregada de turnover é preservada — mas QUEM sai (e a composição
// das saídas: alta performance, subpago, insatisfeito) emerge dos atributos,
// em vez de ser hardcoded. As anomalias da narrativa passam a ser emergentes.

interface Pessoa {
  id: string;
  status: 'ativo' | 'desligado';
  diretoria: Diretoria;
  especialidade: string;
  diretor: string;
  superintendente: string;
  cargo: string;
  senioridade: Senioridade;
  clusterLideranca: ClusterLideranca;
  eSocio: boolean;
  modalidadeTrabalho: Modalidade;
  salarioBRL: number;
  posicionamentoFaixa: PosicionamentoFaixa;
  dataAdmissao: string;            // "YYYY-MM"
  mesDesligamento: string | null;  // null se ativo
  tempoEmpresaMeses: number;
  tempoNoCargaMeses: number;
  tempoDesdePromocaoMeses: number;
  tempoDesdeAumentoMeses: number;
  trocasDeLiderUltimos12Meses: number;
  nivelPerformance: Performance;
  tendenciaPerformance: TendenciaPerformance;
  nivelSatisfacao: Satisfacao;
  npsInterno: number;
  tipoDesligamento: TipoDesligamento | null;
  motivoDesligamento: Motivo | null;
}

const SENIORIDADES: Senioridade[]        = ['júnior', 'pleno', 'sênior', 'gerência', 'diretoria'];
const POSICOES: PosicionamentoFaixa[]    = ['piso', 'q1', 'mediana', 'q3', 'teto'];
const PERFORMANCES: Performance[]        = ['abaixo', 'dentro', 'acima'];
const SATISFACOES: Satisfacao[]          = ['baixo', 'médio', 'alto'];
const TENDENCIAS: TendenciaPerformance[] = ['melhorando', 'estável', 'piorando'];
const MODALIDADES: Modalidade[]          = ['presencial', 'híbrido', 'remoto'];

const POP_POS_WEIGHTS  = POSICOES.map(p => (POP_BASE.posicionamentoFaixa as Record<string, number>)[p]);
const POP_PERF_WEIGHTS = PERFORMANCES.map(p => (POP_BASE.nivelPerformance as Record<string, number>)[p]);

function idxFromMes(mes: string): number {
  const [y, m] = mes.split('-').map(Number);
  return y * 12 + (m - 1);
}
function mesFromIdx(idx: number): string {
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

// ── Criação de uma pessoa (atributos estáticos + correlações) ──────────────────

function createPessoa(diretoria: Diretoria, dataAdmissao: string, seq: number, techTalent = false): Pessoa {
  const est = ESTRUTURA[diretoria];

  type Esp = { nome: string; superintendente: string; peso: number };
  const esps = est.especialidades as readonly Esp[];
  const esp = rng.weighted(esps, esps.map(e => e.peso));

  const senioridade = rng.weighted(SENIORIDADES, [...est.senDist]);
  // Tecnologia contrata gente forte para bandas subpagas — alimenta a fuga de
  // talentos de forma sustentada (alto performer chega, é mal pago, sai rápido).
  const posicaoWeights = techTalent ? [0.15, 0.28, 0.37, 0.13, 0.07] : POP_POS_WEIGHTS;
  const perfWeights = techTalent ? [0.10, 0.45, 0.45] : POP_PERF_WEIGHTS;
  const posicionamentoFaixa = rng.weighted(POSICOES, posicaoWeights);
  const nivelPerformance = rng.weighted(PERFORMANCES, perfWeights);
  const modalidadeTrabalho = rng.weighted(MODALIDADES, [...est.modalDist]);
  const cargo = rng.choice(est.cargos);

  const salBase = SALARIOS[senioridade][posicionamentoFaixa][diretoria];
  const salarioBRL = Math.round(salBase * (1 + rng.next() * 0.06 - 0.03) / 100) * 100;

  const clusterLideranca: ClusterLideranca =
    senioridade === 'diretoria' ? 'líder de líderes' :
    senioridade === 'gerência'  ? 'líder de CI' :
    senioridade === 'sênior' && rng.next() < 0.35 ? 'líder de CI' :
    'contribuidor individual';

  const eSocio = (senioridade === 'diretoria' || (senioridade === 'gerência' && rng.next() < 0.12)) && rng.next() < 0.15;

  // Satisfação correlacionada: alto performer subpago = muito insatisfeito
  const isSubpago = posicionamentoFaixa === 'piso' || posicionamentoFaixa === 'q1';
  const satDist =
    nivelPerformance === 'acima' && isSubpago ? [0.68, 0.27, 0.05] :
    nivelPerformance === 'abaixo'             ? [0.18, 0.45, 0.37] :
                                               [0.32, 0.44, 0.24];
  const nivelSatisfacao = rng.weighted(SATISFACOES, satDist);

  const npsBase = nivelSatisfacao === 'baixo' ? 3.2 : nivelSatisfacao === 'médio' ? 5.8 : 8.4;
  const npsInterno = Math.max(0, Math.min(10, rng.normal(npsBase, 1.5, 0, 10)));

  const tendDist =
    nivelSatisfacao === 'baixo' ? [0.12, 0.33, 0.55] :
    nivelSatisfacao === 'médio' ? [0.28, 0.48, 0.24] :
                                  [0.40, 0.45, 0.15];
  const tendenciaPerformance = rng.weighted(TENDENCIAS, tendDist);

  return {
    id: `P${String(seq).padStart(4, '0')}`,
    status: 'ativo',
    diretoria,
    especialidade: esp.nome,
    diretor: est.diretor,
    superintendente: esp.superintendente,
    cargo,
    senioridade,
    clusterLideranca,
    eSocio,
    modalidadeTrabalho,
    salarioBRL,
    posicionamentoFaixa,
    dataAdmissao,
    mesDesligamento: null,
    // trajetória preenchida no snapshot (saída ou Dez/2024)
    tempoEmpresaMeses: 0,
    tempoNoCargaMeses: 0,
    tempoDesdePromocaoMeses: 0,
    tempoDesdeAumentoMeses: 0,
    trocasDeLiderUltimos12Meses: 0,
    nivelPerformance,
    tendenciaPerformance,
    nivelSatisfacao,
    npsInterno,
    tipoDesligamento: null,
    motivoDesligamento: null,
  };
}

// ── Hazard: peso relativo de saída dado os atributos + anomalias de contexto ───

function hazardScore(p: Pessoa, diretoria: Diretoria, monthIndex: number, month: number): number {
  let w = 1;
  const underpaid = p.posicionamentoFaixa === 'piso' || p.posicionamentoFaixa === 'q1';

  // Performance: alta performance foge mais (sobretudo em Tecnologia)
  if (p.nivelPerformance === 'acima') w *= diretoria === 'Tecnologia' ? 5.5 : 1.6;
  else if (p.nivelPerformance === 'abaixo') w *= 1.3;

  // Posição na faixa: subpago sai muito mais
  w *= p.posicionamentoFaixa === 'piso' ? 2.6 : p.posicionamentoFaixa === 'q1' ? 1.8 : p.posicionamentoFaixa === 'mediana' ? 1.0 : p.posicionamentoFaixa === 'q3' ? 0.7 : 0.5;

  // Satisfação
  w *= p.nivelSatisfacao === 'baixo' ? 2.2 : p.nivelSatisfacao === 'médio' ? 1.0 : 0.5;

  // Anomalias emergentes
  if (diretoria === 'Tecnologia' && monthIndex >= 7 && p.nivelPerformance === 'acima' && underpaid) w *= 2.2;
  if (diretoria === 'Operações' && monthIndex >= 19 && p.nivelSatisfacao === 'baixo') w *= 1.8;
  if (diretoria === 'Distribuição & Assessoria' && month === 1) w *= 1.15;

  return w;
}

// ── Snapshot de trajetória (tempos correlacionados com atributos) ──────────────

function snapshotTrajectory(p: Pessoa, snapshotMes: string, monthIndex: number): void {
  const tenure = Math.max(1, idxFromMes(snapshotMes) - idxFromMes(p.dataAdmissao));
  const underpaid = p.posicionamentoFaixa === 'piso' || p.posicionamentoFaixa === 'q1';
  p.tempoEmpresaMeses = Math.min(tenure, 360);
  p.tempoNoCargaMeses = rng.normal(Math.min(tenure, p.senioridade === 'sênior' ? 24 : p.senioridade === 'gerência' ? 30 : 18), 12, 1, tenure);
  p.tempoDesdeAumentoMeses = rng.normal(underpaid ? 18 : 10, 8, 1, tenure);
  p.tempoDesdePromocaoMeses = rng.normal(underpaid ? 20 : 14, 10, 1, tenure);
  const trocasBase = p.diretoria === 'Operações' && monthIndex >= 19 ? 2.2 : 0.8;
  p.trocasDeLiderUltimos12Meses = rng.normal(trocasBase, 0.9, 0, 4);
}

// ── Atribuição de tipo/motivo da saída ─────────────────────────────────────────

function assignDeparture(p: Pessoa, diretoria: Diretoria, monthIndex: number, month: number): void {
  const underpaid = p.posicionamentoFaixa === 'piso' || p.posicionamentoFaixa === 'q1';
  const highperf = p.nivelPerformance === 'acima';
  const lowperf = p.nivelPerformance === 'abaixo';
  const lowsat = p.nivelSatisfacao === 'baixo';

  // Distribuição em Janeiro: cortes (involuntário, perf baixa) + migração (voluntário, carreira)
  if (diretoria === 'Distribuição & Assessoria' && month === 1) {
    const involuntario = lowperf ? rng.next() < 0.85 : rng.next() < 0.55;
    p.tipoDesligamento = involuntario ? 'involuntário' : 'voluntário';
    p.motivoDesligamento = involuntario ? 'performance' : (rng.next() < 0.7 ? 'carreira' : 'remuneração');
    return;
  }

  // Operações na escalada (Jul/2024+): cultura em alta
  if (diretoria === 'Operações' && monthIndex >= 19) {
    p.tipoDesligamento = lowperf ? (rng.next() < 0.6 ? 'involuntário' : 'voluntário') : (rng.next() < 0.8 ? 'voluntário' : 'involuntário');
    p.motivoDesligamento = lowsat ? 'cultura' : underpaid ? 'remuneração' : (rng.next() < 0.5 ? 'cultura' : 'carreira');
    return;
  }

  if (lowperf) {
    p.tipoDesligamento = rng.next() < 0.6 ? 'involuntário' : 'voluntário';
    p.motivoDesligamento = p.tipoDesligamento === 'involuntário' ? 'performance' : (rng.next() < 0.5 ? 'carreira' : 'pessoal');
    return;
  }

  p.tipoDesligamento = rng.next() < 0.85 ? 'voluntário' : 'involuntário';
  p.motivoDesligamento =
    underpaid && highperf ? 'remuneração' :
    lowsat                ? (rng.next() < 0.5 ? 'cultura' : 'carreira') :
    underpaid             ? (rng.next() < 0.6 ? 'remuneração' : 'carreira') :
    highperf              ? (rng.next() < 0.5 ? 'carreira' : 'remuneração') :
                            (rng.next() < 0.4 ? 'carreira' : rng.next() < 0.7 ? 'pessoal' : 'outro');
}

// ── Amostragem ponderada sem reposição ─────────────────────────────────────────

function weightedSampleN(pool: Pessoa[], weightFn: (p: Pessoa) => number, n: number): Pessoa[] {
  if (n >= pool.length) return [...pool];
  const candidates = pool.map(p => ({ p, w: Math.max(1e-6, weightFn(p)) }));
  const picked: Pessoa[] = [];
  for (let k = 0; k < n; k++) {
    const total = candidates.reduce((s, c) => s + c.w, 0);
    let r = rng.next() * total;
    let idx = 0;
    for (let i = 0; i < candidates.length; i++) { r -= candidates[i].w; if (r <= 0) { idx = i; break; } }
    picked.push(candidates[idx].p);
    candidates.splice(idx, 1);
  }
  return picked;
}

// ── Derivação dos arquivos legados a partir do roster ──────────────────────────

const DESLIG_FIELDS = (p: Pessoa): Desligamento => ({
  id: p.id,
  mes: p.mesDesligamento!,
  diretoria: p.diretoria,
  especialidade: p.especialidade,
  diretor: p.diretor,
  superintendente: p.superintendente,
  cargo: p.cargo,
  senioridade: p.senioridade,
  clusterLideranca: p.clusterLideranca,
  eSocio: p.eSocio,
  modalidadeTrabalho: p.modalidadeTrabalho,
  salarioBRL: p.salarioBRL,
  posicionamentoFaixa: p.posicionamentoFaixa,
  tempoEmpresaMeses: p.tempoEmpresaMeses,
  tempoNoCargaMeses: p.tempoNoCargaMeses,
  tempoDesdePromocaoMeses: p.tempoDesdePromocaoMeses,
  tempoDesdeAumentoMeses: p.tempoDesdeAumentoMeses,
  trocasDeLiderUltimos12Meses: p.trocasDeLiderUltimos12Meses,
  nivelPerformance: p.nivelPerformance,
  tendenciaPerformance: p.tendenciaPerformance,
  nivelSatisfacao: p.nivelSatisfacao,
  npsInterno: p.npsInterno,
  tipoDesligamento: p.tipoDesligamento!,
  motivoDesligamento: p.motivoDesligamento!,
});

const DIM_POP = ['senioridade', 'posicionamentoFaixa', 'nivelPerformance', 'clusterLideranca', 'nivelSatisfacao', 'modalidadeTrabalho'] as const;

function distFromPeople(people: Pessoa[], dim: keyof Pessoa): Record<string, number> {
  const counts = new Map<string, number>();
  for (const p of people) {
    const key = String(p[dim]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const total = people.length || 1;
  const out: Record<string, number> = {};
  for (const [k, v] of counts) out[k] = parseFloat((v / total).toFixed(4));
  return out;
}

// ── Simulação principal ───────────────────────────────────────────────────────

function main() {
  const diretorias = Object.keys(ESTRUTURA) as Diretoria[];
  const meses: string[] = [];
  for (let y = 2023; y <= 2024; y++)
    for (let m = 1; m <= 12; m++)
      meses.push(`${y}-${String(m).padStart(2, '0')}`);

  const headcountData: HeadcountMensal[] = [];
  const roster: Pessoa[] = [];
  let seq = 1;

  // ── Roster inicial (Jan/2023) com tenure pré-existente ──────────────────────
  for (const dir of diretorias) {
    for (let i = 0; i < ESTRUTURA[dir].headcountInicial; i++) {
      // tenure inicial sorteada por senioridade implícita: 6–60 meses antes de Jan/2023
      const tenure0 = rng.int(6, 60);
      const admissao = mesFromIdx(idxFromMes('2023-01') - tenure0);
      roster.push(createPessoa(dir, admissao, seq++));
    }
  }

  // ── Loop mensal ─────────────────────────────────────────────────────────────
  for (let mi = 0; mi < meses.length; mi++) {
    const mes = meses[mi];
    const monthIndex = mi + 1;
    const month = ((monthIndex - 1) % 12) + 1;

    for (const dir of diretorias) {
      const activeDir = roster.filter(p => p.diretoria === dir && p.status === 'ativo');
      const hcInicio = activeDir.length;
      const noise = rng.next();
      const taxa = baseTurnoverRate(dir, monthIndex, noise);
      const numSaidas = Math.max(0, Math.round(hcInicio * taxa));

      const leavers = weightedSampleN(activeDir, p => hazardScore(p, dir, monthIndex, month), numSaidas);
      for (const p of leavers) {
        snapshotTrajectory(p, mes, monthIndex);
        assignDeparture(p, dir, monthIndex, month);
        p.status = 'desligado';
        p.mesDesligamento = mes;
      }

      const crescimento = dir === 'Tecnologia' ? 0.007 : 0.004;
      const numEntradas = numSaidas + Math.max(0, Math.round(hcInicio * crescimento + rng.next() * 2 - 1));
      const techTalent = dir === 'Tecnologia' && monthIndex >= 6; // fuga sustentada a partir do 2S/2023
      for (let i = 0; i < numEntradas; i++) roster.push(createPessoa(dir, mes, seq++, techTalent));

      const hcFim = hcInicio - numSaidas + numEntradas;
      headcountData.push({ mes, diretoria: dir, headcountInicio: hcInicio, admissoes: numEntradas, desligamentos: numSaidas, headcountFim: hcFim });
    }
  }

  // ── Snapshot final dos ativos (Dez/2024) ────────────────────────────────────
  for (const p of roster) {
    if (p.status === 'ativo') snapshotTrajectory(p, '2024-12', 24);
  }

  // ── Derivações ──────────────────────────────────────────────────────────────
  const desligamentos: Desligamento[] = roster
    .filter(p => p.status === 'desligado')
    .sort((a, b) => (a.mesDesligamento! < b.mesDesligamento! ? -1 : a.mesDesligamento! > b.mesDesligamento! ? 1 : a.id < b.id ? -1 : 1))
    .map(DESLIG_FIELDS);

  function avgHeadcount(dir: Diretoria): number {
    const rows = headcountData.filter(h => h.diretoria === dir);
    return rows.reduce((s, h) => s + h.headcountInicio, 0) / rows.length;
  }

  const ativos = roster.filter(p => p.status === 'ativo');
  const populacao: PopulacaoDiretoria[] = diretorias.map(dir => {
    const peopleDir = ativos.filter(p => p.diretoria === dir);
    const distribuicoes: Record<string, Record<string, number>> = {};
    for (const dim of DIM_POP) distribuicoes[dim] = distFromPeople(peopleDir, dim);
    distribuicoes['especialidade'] = distFromPeople(peopleDir, 'especialidade');
    return { diretoria: dir, headcountMedio: Math.round(avgHeadcount(dir)), distribuicoes };
  });
  // Geral: marginal de toda a população ativa
  const geralDist: Record<string, Record<string, number>> = {};
  for (const dim of DIM_POP) geralDist[dim] = distFromPeople(ativos, dim);
  populacao.unshift({ diretoria: 'Geral', headcountMedio: ativos.length, distribuicoes: geralDist });

  // ── Gravar outputs ──────────────────────────────────────────────────────────
  const dataDir = path.join(process.cwd(), 'lib', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'pessoas.json'), JSON.stringify(roster));
  fs.writeFileSync(path.join(dataDir, 'desligamentos.json'), JSON.stringify(desligamentos));
  fs.writeFileSync(path.join(dataDir, 'headcount.json'), JSON.stringify(headcountData));
  fs.writeFileSync(path.join(dataDir, 'populacao.json'), JSON.stringify(populacao));

  // ── Validação ───────────────────────────────────────────────────────────────
  console.log('\n══ Validação do Roster — Verta S.A. ═══════════════════════════════');
  console.log(`Pessoas no roster: ${roster.length} | Ativas: ${ativos.length} | Desligadas: ${desligamentos.length}\n`);

  const stats: Record<string, unknown>[] = [];
  let allConsistent = true;
  for (const dir of diretorias) {
    const hcDir = headcountData.filter(h => h.diretoria === dir);
    const desDir = desligamentos.filter(d => d.diretoria === dir);
    let consistent = true;
    for (let i = 0; i < hcDir.length - 1; i++)
      if (hcDir[i].headcountFim !== hcDir[i + 1].headcountInicio) { consistent = false; allConsistent = false; break; }
    const totalHC = hcDir.reduce((s, h) => s + h.headcountInicio, 0);
    const taxaMedia = (desDir.length / totalHC * 100).toFixed(2);
    console.log(`${dir}: ${desDir.length} saídas | ${taxaMedia}%/mês | HC final ${hcDir[hcDir.length - 1].headcountFim} | consistência ${consistent ? '✓' : '✗'}`);
    stats.push({ diretoria: dir, totalDesligamentos: desDir.length, taxaMediaMensal: parseFloat(taxaMedia), headcountFinal: hcDir[hcDir.length - 1].headcountFim, consistente: consistent });
  }

  console.log('\n── Anomalias emergentes ─────────────────────────────────────────────');
  const techS2 = desligamentos.filter(d => d.diretoria === 'Tecnologia' && d.mes >= '2023-07' && d.mes <= '2023-12');
  const techAcima = techS2.filter(d => d.nivelPerformance === 'acima').length;
  const techSub = techS2.filter(d => d.posicionamentoFaixa === 'piso' || d.posicionamentoFaixa === 'q1').length;
  console.log(`Tech 2023-S2: ${techS2.length} saídas | alta perf ${(techAcima / techS2.length * 100).toFixed(0)}% | piso/q1 ${(techSub / techS2.length * 100).toFixed(0)}%`);
  const techVol = desligamentos.filter(d => d.diretoria === 'Tecnologia' && d.tipoDesligamento === 'voluntário').length;
  const techTot = desligamentos.filter(d => d.diretoria === 'Tecnologia').length;
  console.log(`Tech voluntário: ${(techVol / techTot * 100).toFixed(0)}% das saídas`);
  const distJan = desligamentos.filter(d => d.diretoria === 'Distribuição & Assessoria' && (d.mes === '2023-01' || d.mes === '2024-01'));
  const distJanInv = distJan.filter(d => d.tipoDesligamento === 'involuntário').length;
  console.log(`Distribuição Janeiro: ${distJan.length} saídas | involuntário ${distJan.length ? (distJanInv / distJan.length * 100).toFixed(0) : '0'}%`);
  const opsS2_23 = desligamentos.filter(d => d.diretoria === 'Operações' && d.mes >= '2023-07' && d.mes <= '2023-12').length;
  const opsS2_24 = desligamentos.filter(d => d.diretoria === 'Operações' && d.mes >= '2024-07' && d.mes <= '2024-12').length;
  console.log(`Operações 2023-S2: ${opsS2_23} → 2024-S2: ${opsS2_24} (esperado crescimento)`);

  const popTech = populacao.find(p => p.diretoria === 'Tecnologia')!;
  const techAll = desligamentos.filter(d => d.diretoria === 'Tecnologia');
  const compAcima = techAll.filter(d => d.nivelPerformance === 'acima').length / techAll.length;
  const lift = compAcima / (popTech.distribuicoes.nivelPerformance['acima'] || 1);
  console.log(`Lift alta perf (Tech, 24m): ${lift.toFixed(1)}× (composição ${(compAcima * 100).toFixed(0)}% vs população ${((popTech.distribuicoes.nivelPerformance['acima'] || 0) * 100).toFixed(0)}%)`);
  console.log(`\nConsistência geral de headcount: ${allConsistent ? '✓ PASSOU' : '✗ FALHOU'}`);

  fs.writeFileSync(path.join(dataDir, 'meta.json'), JSON.stringify({
    empresa: 'Verta S.A.',
    geradoEm: new Date().toISOString(),
    seed: 42,
    janela: { inicio: '2023-01', fim: '2024-12', meses: 24 },
    totalPessoas: roster.length,
    totalAtivos: ativos.length,
    totalDesligamentos: desligamentos.length,
    diretorias: stats,
  }, null, 2));

  console.log('\n✓ Arquivos: pessoas.json, desligamentos.json, headcount.json, populacao.json, meta.json');
}

main();
