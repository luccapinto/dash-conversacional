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

// ── Geração de um registro de desligamento ────────────────────────────────────

function generateDesligamento(
  diretoria: Diretoria,
  mes: string,
  monthIndex: number,
  seq: number,
): Desligamento {
  const est = ESTRUTURA[diretoria];
  const month = ((monthIndex - 1) % 12) + 1;

  // Especialidade (pesos)
  type Esp = { nome: string; superintendente: string; peso: number };
  const esps = est.especialidades as readonly Esp[];
  const espPesos = esps.map(e => e.peso);
  const esp = rng.weighted(esps, espPesos);

  // ── Distribuições default ───────────────────────────────────────────────────
  let senDist      = [...est.senDist]                         as number[];
  let posicaoDist  = [0.05, 0.20, 0.35, 0.25, 0.15]          as number[];
  let perfDist     = [0.15, 0.55, 0.30]                       as number[];
  let tipo: TipoDesligamento = rng.next() < 0.72 ? 'voluntário' : 'involuntário';
  let motivoDist   = [0.20, 0.25, 0.15, 0.20, 0.10, 0.10]    as number[];
  // motivos:         remun  carrei  cult   perf   pess   outro

  // ── Anomalia Tecnologia (Jul/2023 +) ───────────────────────────────────────
  if (diretoria === 'Tecnologia' && monthIndex >= 7) {
    senDist     = [0.08, 0.22, 0.38, 0.28, 0.04]; // mais sênior/gerência
    posicaoDist = [0.22, 0.39, 0.25, 0.10, 0.04]; // concentrado em piso/q1
    perfDist    = [0.08, 0.19, 0.73];              // 73% alta performance
    tipo        = 'voluntário';
    motivoDist  = [0.62, 0.20, 0.08, 0.02, 0.05, 0.03]; // dominado por remuneração
  }

  // ── Anomalia Distribuição — Janeiro ───────────────────────────────────────
  if (diretoria === 'Distribuição & Assessoria' && month === 1) {
    const isInvoluntario = rng.next() < 0.60;
    tipo       = isInvoluntario ? 'involuntário' : 'voluntário';
    perfDist   = isInvoluntario ? [0.55, 0.35, 0.10] : [0.05, 0.30, 0.65];
    motivoDist = isInvoluntario
      ? [0.05, 0.10, 0.10, 0.65, 0.05, 0.05]  // performance (corte)
      : [0.15, 0.55, 0.10, 0.05, 0.10, 0.05]; // carreira (migração)
  }

  // ── Anomalia Operações (Jul/2024 +) ───────────────────────────────────────
  if (diretoria === 'Operações' && monthIndex >= 19) {
    tipo       = rng.next() < 0.68 ? 'voluntário' : 'involuntário';
    perfDist   = [0.20, 0.50, 0.30];
    motivoDist = [0.20, 0.25, 0.38, 0.08, 0.05, 0.04]; // cultura em alta
  }

  // ── Atributos sorteados ────────────────────────────────────────────────────
  const SENIORIDADES: Senioridade[]       = ['júnior', 'pleno', 'sênior', 'gerência', 'diretoria'];
  const POSICOES: PosicionamentoFaixa[]   = ['piso', 'q1', 'mediana', 'q3', 'teto'];
  const PERFORMANCES: Performance[]      = ['abaixo', 'dentro', 'acima'];
  const MOTIVOS: Motivo[]                 = ['remuneração', 'carreira', 'cultura', 'performance', 'pessoal', 'outro'];
  const SATISFACOES: Satisfacao[]         = ['baixo', 'médio', 'alto'];
  const TENDENCIAS: TendenciaPerformance[] = ['melhorando', 'estável', 'piorando'];
  const MODALIDADES: Modalidade[]         = ['presencial', 'híbrido', 'remoto'];

  const senioridade        = rng.weighted(SENIORIDADES, senDist);
  const posicionamentoFaixa = rng.weighted(POSICOES, posicaoDist);
  const nivelPerformance   = rng.weighted(PERFORMANCES, perfDist);
  const motivoDesligamento = rng.weighted(MOTIVOS, motivoDist);
  const modalidadeTrabalho = rng.weighted(MODALIDADES, est.modalDist);
  const cargo              = rng.choice(est.cargos);

  // Salário com variação ±3%
  const salBase  = SALARIOS[senioridade][posicionamentoFaixa][diretoria];
  const salarioBRL = Math.round(salBase * (1 + rng.next() * 0.06 - 0.03) / 100) * 100;

  // Cluster de liderança derivado da senioridade
  const clusterLideranca: ClusterLideranca =
    senioridade === 'diretoria' ? 'líder de líderes' :
    senioridade === 'gerência'  ? 'líder de CI' :
    senioridade === 'sênior' && rng.next() < 0.35 ? 'líder de CI' :
    'contribuidor individual';

  // eSócio: raro, só diretoria/gerência sênior
  const eSocio = (senioridade === 'diretoria' || (senioridade === 'gerência' && rng.next() < 0.12)) && rng.next() < 0.15;

  // Tempos — correlacionados com senioridade
  const tempoEmpresaMeses      = rng.normal(senioridade === 'sênior' ? 42 : senioridade === 'gerência' ? 60 : 24, 18, 3, 144);
  const tempoNoCargaMeses      = rng.normal(Math.min(tempoEmpresaMeses, senioridade === 'sênior' ? 24 : 18), 12, 1, tempoEmpresaMeses);
  const tempoDesdePromocaoBase = diretoria === 'Tecnologia' && monthIndex >= 7 ? 22 : 14;
  const tempoDesdePromocaoMeses = rng.normal(tempoDesdePromocaoBase, 10, 1, tempoEmpresaMeses);
  const tempoDesdeAumentoBase  = diretoria === 'Tecnologia' && monthIndex >= 7 ? 19 : 10;
  const tempoDesdeAumentoMeses = rng.normal(tempoDesdeAumentoBase, 8, 1, tempoEmpresaMeses);

  // Trocas de líder — mais em Operações durante anomalia
  const trocasBase = diretoria === 'Operações' && monthIndex >= 19 ? 2.2 : 0.8;
  const trocasDeLiderUltimos12Meses = rng.normal(trocasBase, 0.9, 0, 4);

  // Satisfação — alto performer subpago = muito insatisfeito
  const isSubpago = posicionamentoFaixa === 'piso' || posicionamentoFaixa === 'q1';
  const satDist =
    nivelPerformance === 'acima' && isSubpago ? [0.68, 0.27, 0.05] :
    nivelPerformance === 'abaixo'             ? [0.18, 0.45, 0.37] :
                                               [0.32, 0.44, 0.24];
  const nivelSatisfacao = rng.weighted(SATISFACOES, satDist);

  // NPS interno correlacionado com satisfação
  const npsBase = nivelSatisfacao === 'baixo' ? 3.2 : nivelSatisfacao === 'médio' ? 5.8 : 8.4;
  const npsInterno = Math.max(0, Math.min(10, rng.normal(npsBase, 1.5, 0, 10)));

  // Tendência de performance — insatisfeito tende a performar pior
  const tendDist =
    nivelSatisfacao === 'baixo' ? [0.12, 0.33, 0.55] :
    nivelSatisfacao === 'médio' ? [0.28, 0.48, 0.24] :
                                  [0.40, 0.45, 0.15];
  const tendenciaPerformance = rng.weighted(TENDENCIAS, tendDist);

  const idStr = `D${String(seq).padStart(4, '0')}`;

  return {
    id: idStr,
    mes,
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
    tempoEmpresaMeses,
    tempoNoCargaMeses,
    tempoDesdePromocaoMeses,
    tempoDesdeAumentoMeses,
    trocasDeLiderUltimos12Meses,
    nivelPerformance,
    tendenciaPerformance,
    nivelSatisfacao,
    npsInterno,
    tipoDesligamento: tipo,
    motivoDesligamento,
  };
}

// ── Simulação principal ───────────────────────────────────────────────────────

function main() {
  const diretorias = Object.keys(ESTRUTURA) as Diretoria[];
  const meses: string[] = [];
  for (let y = 2023; y <= 2024; y++)
    for (let m = 1; m <= 12; m++)
      meses.push(`${y}-${String(m).padStart(2, '0')}`);

  const desligamentos: Desligamento[] = [];
  const headcountData: HeadcountMensal[] = [];

  // Headcount corrente por diretoria
  const hcAtual = Object.fromEntries(
    diretorias.map(d => [d, ESTRUTURA[d].headcountInicial])
  ) as Record<Diretoria, number>;

  let seq = 1;

  for (let mi = 0; mi < meses.length; mi++) {
    const mes = meses[mi];
    const monthIndex = mi + 1; // 1-based

    for (const dir of diretorias) {
      const hcInicio = hcAtual[dir];
      const noise = rng.next(); // sorteio de ruído para a taxa (determinístico)
      const taxa = baseTurnoverRate(dir, monthIndex, noise);
      const numSaidas = Math.max(0, Math.round(hcInicio * taxa));

      // Admissões: repõe as saídas + crescimento orgânico leve
      const crescimento = dir === 'Tecnologia' ? 0.007 : 0.004;
      const numEntradas = numSaidas + Math.max(0, Math.round(hcInicio * crescimento + rng.next() * 2 - 1));

      // Gerar registros de desligamento
      for (let i = 0; i < numSaidas; i++) {
        desligamentos.push(generateDesligamento(dir, mes, monthIndex, seq++));
      }

      const hcFim = hcInicio + numEntradas - numSaidas;
      headcountData.push({ mes, diretoria: dir, headcountInicio: hcInicio, admissoes: numEntradas, desligamentos: numSaidas, headcountFim: hcFim });
      hcAtual[dir] = hcFim;
    }
  }

  // ── Gravar outputs ──────────────────────────────────────────────────────────
  const dataDir = path.join(process.cwd(), 'lib', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'desligamentos.json'), JSON.stringify(desligamentos));
  fs.writeFileSync(path.join(dataDir, 'headcount.json'), JSON.stringify(headcountData));

  // ── Validação de sanidade ──────────────────────────────────────────────────
  console.log('\n══ Validação do Dataset — Verta S.A. ══════════════════════════════');
  console.log(`Total de registros de desligamento: ${desligamentos.length}\n`);

  const stats: Record<string, unknown>[] = [];
  let allConsistent = true;

  for (const dir of diretorias) {
    const hcDir = headcountData.filter(h => h.diretoria === dir);
    const desDir = desligamentos.filter(d => d.diretoria === dir);

    // Consistência: headcountFim[t] === headcountInicio[t+1]
    let consistent = true;
    for (let i = 0; i < hcDir.length - 1; i++) {
      if (hcDir[i].headcountFim !== hcDir[i + 1].headcountInicio) { consistent = false; allConsistent = false; break; }
    }

    // Taxa média de turnover
    const totalHC = hcDir.reduce((s, h) => s + h.headcountInicio, 0);
    const taxaMedia = (desDir.length / totalHC * 100).toFixed(2);

    // Anomalias esperadas
    const s1_2023 = desDir.filter(d => d.mes >= '2023-01' && d.mes <= '2023-06').length;
    const s2_2023 = desDir.filter(d => d.mes >= '2023-07' && d.mes <= '2023-12').length;
    const hcS1    = hcDir.filter(h => h.mes >= '2023-01' && h.mes <= '2023-06').reduce((s, h) => s + h.headcountInicio, 0);
    const hcS2    = hcDir.filter(h => h.mes >= '2023-07' && h.mes <= '2023-12').reduce((s, h) => s + h.headcountInicio, 0);
    const taxaS1  = hcS1  ? (s1_2023 / hcS1  * 100).toFixed(2) : 'n/a';
    const taxaS2  = hcS2  ? (s2_2023 / hcS2  * 100).toFixed(2) : 'n/a';

    console.log(`${dir}`);
    console.log(`  Desligamentos: ${desDir.length} | Taxa média: ${taxaMedia}%/mês | HC final: ${hcDir[hcDir.length - 1].headcountFim}`);
    console.log(`  2023-S1: ${s1_2023} saídas (${taxaS1}%) | 2023-S2: ${s2_2023} saídas (${taxaS2}%)`);
    console.log(`  Consistência de headcount: ${consistent ? '✓' : '✗ FALHA'}\n`);

    stats.push({ diretoria: dir, totalDesligamentos: desDir.length, taxaMediaMensal: parseFloat(taxaMedia), headcountFinal: hcDir[hcDir.length - 1].headcountFim, consistente: consistent });
  }

  // Validação das anomalias principais
  console.log('── Validação de anomalias ───────────────────────────────────────────');
  const techS2 = desligamentos.filter(d => d.diretoria === 'Tecnologia' && d.mes >= '2023-07' && d.mes <= '2023-12');
  const techS2AltaPerf = techS2.filter(d => d.nivelPerformance === 'acima');
  const techS2SubPago  = techS2.filter(d => d.posicionamentoFaixa === 'piso' || d.posicionamentoFaixa === 'q1');
  console.log(`Tech 2023-S2: ${techS2.length} saídas`);
  console.log(`  Alta performance: ${techS2AltaPerf.length} (${(techS2AltaPerf.length / techS2.length * 100).toFixed(0)}%) — esperado ~73%`);
  console.log(`  Piso/Q1 da faixa: ${techS2SubPago.length} (${(techS2SubPago.length / techS2.length * 100).toFixed(0)}%) — esperado ~61%`);

  const distJan = desligamentos.filter(d => d.diretoria === 'Distribuição & Assessoria' && (d.mes === '2023-01' || d.mes === '2024-01'));
  const distJanInvoluntario = distJan.filter(d => d.tipoDesligamento === 'involuntário');
  console.log(`\nDistribuição Janeiro (2023+2024): ${distJan.length} saídas | Involuntários: ${distJanInvoluntario.length} (${(distJanInvoluntario.length / distJan.length * 100).toFixed(0)}%) — esperado ~60%`);

  const opsH2_2024 = desligamentos.filter(d => d.diretoria === 'Operações' && d.mes >= '2024-07' && d.mes <= '2024-12');
  const opsH2_2023 = desligamentos.filter(d => d.diretoria === 'Operações' && d.mes >= '2023-07' && d.mes <= '2023-12');
  console.log(`\nOperações 2023-S2: ${opsH2_2023.length} saídas | 2024-S2: ${opsH2_2024.length} saídas — esperado crescimento`);

  console.log(`\nConsistência geral de headcount: ${allConsistent ? '✓ PASSOU' : '✗ FALHOU'}`);

  // Meta JSON
  fs.writeFileSync(path.join(dataDir, 'meta.json'), JSON.stringify({
    empresa: 'Verta S.A.',
    geradoEm: new Date().toISOString(),
    seed: 42,
    janela: { inicio: '2023-01', fim: '2024-12', meses: 24 },
    totalDesligamentos: desligamentos.length,
    diretorias: stats,
  }, null, 2));

  console.log('\n✓ Arquivos gerados: lib/data/desligamentos.json, headcount.json, meta.json');
}

main();
