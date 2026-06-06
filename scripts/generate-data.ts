#!/usr/bin/env npx tsx
/**
 * generate-data.ts
 *
 * Gera o dataset sintético da Verta S.A. — corretora de investimentos fictícia.
 * Determinístico com seed fixa (42). Rodar: npx tsx scripts/generate-data.ts
 *
 * Outputs:
 *   lib/data/pessoas.json        — roster completo (ativos + desligados)
 *   lib/data/desligamentos.json  — derivado: eventos de desligamento
 *   lib/data/headcount.json      — derivado: headcount mensal por diretoria
 *   lib/data/populacao.json      — derivado: composição da força ativa
 *   lib/data/meta.json           — estatísticas de validação
 *
 * Calibração: ~5.000 funcionários; turnover ~35%/ano (≈70% voluntário /
 * 30% involuntário); salários no padrão do mercado financeiro brasileiro.
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
    headcountInicial: 1400,
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
    headcountInicial: 1000,
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
    headcountInicial: 900,
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
    headcountInicial: 650,
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
    headcountInicial: 420,
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
    headcountInicial: 630,
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

// ── Salários (BRL/mês) — modelo: base[senioridade] × área × posição na faixa ──
// Calibrado para o mercado financeiro brasileiro (2024). Em vez de uma tabela
// fixa de 150 números, deriva de uma base mensal por senioridade, ajustada por
// um fator de área (Tech/Produtos pagam mais; Operações/Gente menos) e pela
// posição na faixa salarial (piso a teto). Mantém realismo e fácil calibração.

const SAL_BASE: Record<Senioridade, number> = {
  'júnior':    4000,
  'pleno':     8000,
  'sênior':    15000,
  'gerência':  26000,
  'diretoria': 55000,
};

const SAL_FATOR_AREA: Record<Diretoria, number> = {
  'Tecnologia':                 1.18,
  'Produtos & Plataforma':      1.10,
  'Financeiro & Risco':         1.05,
  'Distribuição & Assessoria':  1.00,
  'Operações':                  0.88,
  'Gente':                      0.85,
};

const SAL_FATOR_FAIXA: Record<PosicionamentoFaixa, number> = {
  piso:    0.72,
  q1:      0.86,
  mediana: 1.00,
  q3:      1.18,
  teto:    1.40,
};

/** Salário-base de referência (mediana com jitter aplicado em createPessoa) */
function salarioBase(sen: Senioridade, pos: PosicionamentoFaixa, dir: Diretoria): number {
  return Math.round(SAL_BASE[sen] * SAL_FATOR_AREA[dir] * SAL_FATOR_FAIXA[pos] / 100) * 100;
}

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

  // Alvo de turnover ANUAL da empresa ≈ 35%. As áreas-problema puxam para cima
  // (Tech ~60%/ano, Distribuição ~40%), as saudáveis ancoram embaixo (Gente
  // ~14%, Financeiro ~18%). Ranking preservado.
  switch (diretoria) {
    case 'Tecnologia': {
      // Escala a partir de Jul/2023 (idx 7); 2024 fica ~4.0-5.0%/mês (~52%/ano)
      if (monthIndex < 7) return Math.max(0.010, 0.016 + jitter);
      const months = monthIndex - 6;
      const escalation = Math.min(months * 0.0036, 0.036);
      return Math.max(0.016, Math.min(0.054, 0.016 + escalation + jitter));
    }
    case 'Distribuição & Assessoria': {
      // Pico em Janeiro (cortes sazonais), base ~2.4%/mês (~35%/ano)
      const month = ((monthIndex - 1) % 12) + 1;
      if (month === 1) return Math.max(0.045, 0.060 + jitter * 2);
      if (month === 12) return Math.max(0.026, 0.035 + jitter); // Dez: assessores antecipando
      return Math.max(0.015, 0.024 + jitter);
    }
    case 'Operações': {
      // Escala a partir de Jul/2024 (idx 19); base ~1.8%/mês (~27%/ano)
      if (monthIndex < 19) return Math.max(0.011, 0.018 + jitter);
      const months = monthIndex - 18;
      const escalation = Math.min(months * 0.0038, 0.022);
      return Math.max(0.018, Math.min(0.046, 0.018 + escalation + jitter));
    }
    case 'Financeiro & Risco': return Math.max(0.008, 0.013 + jitter);  // ~16%/ano
    case 'Gente':               return Math.max(0.006, 0.011 + jitter); // ~13%/ano
    case 'Produtos & Plataforma': return Math.max(0.010, 0.016 + jitter); // ~19%/ano
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

  const salBase = salarioBase(senioridade, posicionamentoFaixa, diretoria);
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

  // Mix-alvo da empresa: ~70% voluntário / ~30% involuntário.
  // A fuga de talento (Tech, alta perf) é voluntária; o involuntário vem de
  // gestão de baixa performance e dos cortes sazonais de Distribuição.

  // Tecnologia — fuga de talento: alto performer PEDE demissão (remuneração)
  if (diretoria === 'Tecnologia' && highperf) {
    p.tipoDesligamento = rng.next() < 0.90 ? 'voluntário' : 'involuntário';
    p.motivoDesligamento = p.tipoDesligamento === 'involuntário' ? 'performance'
      : underpaid ? 'remuneração' : (rng.next() < 0.5 ? 'carreira' : 'remuneração');
    return;
  }

  // Distribuição em Janeiro: cortes sazonais (involuntário) + migração (voluntário)
  if (diretoria === 'Distribuição & Assessoria' && month === 1) {
    const involuntario = lowperf ? rng.next() < 0.80 : rng.next() < 0.50;
    p.tipoDesligamento = involuntario ? 'involuntário' : 'voluntário';
    p.motivoDesligamento = involuntario ? 'performance' : (rng.next() < 0.7 ? 'carreira' : 'remuneração');
    return;
  }

  // Baixa performance: gestão de saída (mais involuntário, mas parte pede as contas)
  if (lowperf) {
    p.tipoDesligamento = rng.next() < 0.64 ? 'involuntário' : 'voluntário';
    p.motivoDesligamento = p.tipoDesligamento === 'involuntário' ? 'performance' : (rng.next() < 0.5 ? 'carreira' : 'pessoal');
    return;
  }

  // Operações na escalada (Jul/2024+): cultura em alta (mais voluntário)
  if (diretoria === 'Operações' && monthIndex >= 19) {
    p.tipoDesligamento = rng.next() < 0.40 ? 'involuntário' : 'voluntário';
    p.motivoDesligamento = p.tipoDesligamento === 'involuntário' ? (rng.next() < 0.5 ? 'performance' : 'outro')
      : lowsat ? 'cultura' : underpaid ? 'remuneração' : 'carreira';
    return;
  }

  // Geral: maioria pede demissão (voluntário). Insatisfeito/subpago ainda mais.
  let pInvol = 0.385;
  if (lowsat) pInvol -= 0.14;
  if (underpaid) pInvol -= 0.08;
  p.tipoDesligamento = rng.next() < pInvol ? 'involuntário' : 'voluntário';
  p.motivoDesligamento = p.tipoDesligamento === 'involuntário'
    ? (rng.next() < 0.55 ? 'performance' : 'outro')
    : underpaid ? 'remuneração' : lowsat ? 'cultura' : (rng.next() < 0.4 ? 'carreira' : rng.next() < 0.7 ? 'pessoal' : 'outro');
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
