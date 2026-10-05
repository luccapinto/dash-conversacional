/**
 * Calibração da simulação da Verta S.A.
 *
 * Tudo que define tamanho, salários, taxas-base e os mecanismos das histórias de
 * docs/narrativa.md mora aqui, com o rótulo da história (L1-L3, N1-N5) ao lado.
 * Valores pensados para uma corretora de investimentos brasileira (2023-2026).
 */

import type { Diretoria, FaixaSalarial, Mes, Performance, Raca, Senioridade } from '../../lib/analytics/dominio';

export const SEED = 20261005;

// ── Estrutura e tamanho ───────────────────────────────────────────────────────

/** Headcount no início do aquecimento (Abr/2023) */
export const HC_INICIAL: Record<Diretoria, number> = {
  Tecnologia: 1290,
  'Distribuição & Assessoria': 990,
  Operações: 900,
  'Financeiro & Risco': 620,
  Gente: 380,
  'Produtos & Plataforma': 440,
};

/** Peso de cada especialidade dentro da diretoria (mesma ordem de ESTRUTURA) */
export const PESO_ESPECIALIDADE: Record<Diretoria, readonly number[]> = {
  Tecnologia: [40, 28, 20, 12],
  'Distribuição & Assessoria': [50, 28, 22],
  Operações: [40, 35, 25],
  'Financeiro & Risco': [38, 37, 25],
  Gente: [38, 32, 30],
  'Produtos & Plataforma': [36, 37, 27],
};

/** Mix de contribuidores individuais (júnior, pleno, sênior) */
export const MIX_CI: Record<Diretoria, readonly [number, number, number]> = {
  Tecnologia: [0.24, 0.4, 0.36],
  'Distribuição & Assessoria': [0.32, 0.42, 0.26],
  Operações: [0.32, 0.42, 0.26],
  'Financeiro & Risco': [0.22, 0.4, 0.38],
  Gente: [0.26, 0.4, 0.34],
  'Produtos & Plataforma': [0.2, 0.4, 0.4],
};

/** Contribuidores individuais por gerente */
export const CI_POR_GERENTE: Record<Diretoria, number> = {
  Tecnologia: 8,
  'Distribuição & Assessoria': 11,
  Operações: 12,
  'Financeiro & Risco': 8,
  Gente: 8,
  'Produtos & Plataforma': 7,
};

/** Gênero dos diretores e superintendentes (fixos, não saem na simulação) */
export const MULHERES_FIXAS: Record<string, true> = {
  'Ana Beatriz Fontes': true, 'Camila Drummond': true, 'Isabela Ferreira': true,
  'Fernanda Okamoto': true, 'Patricia Vieira': true, 'Mariana Fonseca': true, 'Juliana Carvalho': true,
  'Vanessa Rocha': true, 'Luciana Borges': true, 'Amanda Silveira': true, 'Priscila Moura': true,
  'Gabriela Machado': true, 'Beatriz Cunha': true,
};

/** Plano de vagas novas por mês (origem "crescimento") */
export function vagasDeCrescimento(dir: Diretoria, mes: Mes): number {
  switch (dir) {
    case 'Tecnologia': return mes <= '2025-12' ? 5 : 3;
    case 'Distribuição & Assessoria': return 2;
    case 'Operações': return 1;
    case 'Financeiro & Risco': return 1;
    case 'Gente': return Number(mes.slice(5, 7)) % 2 === 0 ? 1 : 0;
    // N4: onda de contratação para a plataforma nova
    case 'Produtos & Plataforma': return mes >= '2025-01' && mes <= '2025-09' ? 22 : 2;
  }
}

/** Senioridade das vagas de crescimento (júnior, pleno, sênior, gerência) */
export const MIX_VAGA_CRESCIMENTO: readonly [number, number, number, number] = [0.42, 0.33, 0.15, 0.1];

// ── Salários (BRL/mês) ────────────────────────────────────────────────────────

/** Ponto médio da faixa por senioridade (mercado financeiro, 2024) */
export const SAL_REFERENCIA: Record<Senioridade, number> = {
  júnior: 4500,
  pleno: 8500,
  sênior: 15000,
  gerência: 27000,
  diretoria: 52000,
};

export const SAL_FATOR_AREA: Record<Diretoria, number> = {
  Tecnologia: 1.18,
  'Produtos & Plataforma': 1.1,
  'Financeiro & Risco': 1.05,
  'Distribuição & Assessoria': 1.0,
  Operações: 0.88,
  Gente: 0.85,
};

export const SAL_FATOR_FAIXA: Record<FaixaSalarial, number> = {
  piso: 0.72,
  q1: 0.86,
  mediana: 1.0,
  q3: 1.18,
  teto: 1.4,
};

/** Posição na faixa (piso, q1, mediana, q3, teto) */
export const FAIXA_HOMENS = [0.07, 0.18, 0.42, 0.21, 0.12];
/** N3: mulheres entram em posições mais baixas da faixa */
export const FAIXA_MULHERES = [0.1, 0.24, 0.41, 0.16, 0.09];
/** L1: Tecnologia contrata gente forte em bandas baixas a partir de Jan/2024 */
export const FAIXA_TALENTO_TECH = [0.16, 0.3, 0.36, 0.12, 0.06];
export const INICIO_TALENTO_TECH: Mes = '2024-01';

/** Faixa de quem é promovido (piso, q1, mediana) */
export const FAIXA_PROMOVIDO = [0.25, 0.6, 0.15];

// ── Atributos pessoais ────────────────────────────────────────────────────────

/** Performance de quem é contratado (abaixo, dentro, acima) */
export const PERFORMANCE_BASE: readonly number[] = [0.1, 0.62, 0.28];
/** População de Abr/2023 já em regime: baixa performance foi sendo desligada antes */
export const PERFORMANCE_INICIAL: readonly number[] = [0.055, 0.645, 0.3];
export const PERFORMANCE_TALENTO_TECH: readonly number[] = [0.1, 0.45, 0.45];

/** Probabilidade de ser mulher numa contratação de contribuidor individual */
export const MULHERES_CI: Record<Diretoria, number> = {
  Tecnologia: 0.33,
  'Distribuição & Assessoria': 0.48,
  Operações: 0.6,
  'Financeiro & Risco': 0.52,
  Gente: 0.75,
  'Produtos & Plataforma': 0.49,
};
/** N3: contratação externa de gerentes e composição inicial da gerência */
export const MULHERES_GERENCIA = 0.27;
/** N3: peso relativo de uma mulher na seleção interna para gerência */
export const PESO_MULHER_PROMOCAO_GERENCIA = 0.4;

export const RACAS_ORDEM: readonly Raca[] = ['branca', 'preta', 'parda', 'amarela', 'indígena'];
export const RACA_CI = [0.58, 0.11, 0.26, 0.04, 0.01];
export const RACA_LIDERANCA = [0.8, 0.04, 0.11, 0.05, 0];

export const PCD_CI = 0.026;
export const PCD_LIDERANCA = 0.01;

export const MODALIDADE: Record<Diretoria, readonly number[]> = {
  Tecnologia: [0.1, 0.55, 0.35],
  'Distribuição & Assessoria': [0.3, 0.55, 0.15],
  Operações: [0.45, 0.45, 0.1],
  'Financeiro & Risco': [0.35, 0.5, 0.15],
  Gente: [0.25, 0.6, 0.15],
  'Produtos & Plataforma': [0.15, 0.55, 0.3],
};

/** Idade (média, desvio, mínimo, máximo) na entrada da senioridade */
export const IDADE: Record<Senioridade, readonly [number, number, number, number]> = {
  júnior: [25, 3, 20, 34],
  pleno: [30, 4, 23, 45],
  sênior: [36, 6, 27, 58],
  gerência: [41, 6, 31, 60],
  diretoria: [48, 6, 38, 62],
};

/** Satisfação de base (baixa, média, alta) */
export function pesosSatisfacao(perf: Performance, subpago: boolean): readonly number[] {
  if (perf === 'acima' && subpago) return [0.6, 0.3, 0.1];
  if (perf === 'abaixo') return [0.22, 0.45, 0.33];
  return [0.14, 0.5, 0.36];
}

/** Probabilidade de entrar sem trilha de onboarding */
export function chanceOnboardingIncompleto(dir: Diretoria, mes: Mes): number {
  // N4: Produtos & Plataforma acelera a contratação em 2025 sem estruturar a trilha de onboarding
  if (dir === 'Produtos & Plataforma' && mes >= '2025-01') return 0.8;
  return 0.1;
}

// ── Saídas ────────────────────────────────────────────────────────────────────

/** Turnover voluntário anual de base, antes dos multiplicadores individuais */
export const BASE_VOLUNTARIO_ANUAL: Record<Diretoria, number> = {
  Tecnologia: 0.115,
  'Distribuição & Assessoria': 0.105,
  Operações: 0.08,
  'Financeiro & Risco': 0.065,
  Gente: 0.075,
  'Produtos & Plataforma': 0.085,
};

export const MULT_FAIXA: Record<FaixaSalarial, number> = { piso: 2.0, q1: 1.5, mediana: 1.0, q3: 0.75, teto: 0.55 };

/** L1: aquecimento do mercado de tecnologia (contexto externo) */
export function aquecimentoTech(mes: Mes): number {
  if (mes < '2024-04') return 1;
  if (mes < '2024-10') return 1 + 0.12 * (Number(mes.slice(5, 7)) - 3);
  if (mes < '2026-01') return 1.7;
  return 1.5;
}

/** Multiplicador de saída voluntária por nota latente de eNPS (lida com 2 meses de defasagem) */
export function multNota(nota: number | null): number {
  if (nota === null) return 1;
  if (nota <= 4) return 3.5;
  if (nota <= 6) return 2.0;
  if (nota <= 8) return 1;
  return 0.5;
}

/** L3: trocas de gestor nos últimos 12 meses (0, 1, 2+) */
export const MULT_TROCAS_GESTOR = [1, 1.3, 2.0] as const;
export const MULT_NOVATO = 1.1;
/** N4: novato sem onboarding */
export const MULT_ONBOARDING_INCOMPLETO = 4.5;
/** N5: movimentou-se nos últimos 12 meses */
export const MULT_MOBILIDADE_RECENTE = 0.45;
/** N2: horas extras do mês anterior acima do limite */
export const LIMITE_HORAS_EXTRAS = 16;
export const MULT_HORAS_EXTRAS = 1.3;
/** L2: pedidos de demissão depois do bônus de dezembro */
export const MULT_JANEIRO_DISTRIBUICAO = 2.2;

/** Involuntário mensal por performance */
export const INVOLUNTARIO_MENSAL: Record<Performance, number> = { abaixo: 0.025, dentro: 0.0045, acima: 0.0008 };
/** L2: corte anual de janeiro em Distribuição & Assessoria (fração do quadro de CIs) */
export const CORTE_JANEIRO_DISTRIBUICAO = 0.05;

// ── Clima e eNPS ──────────────────────────────────────────────────────────────

export const TAXA_RESPOSTA_ENPS = 0.78;
export const NOTA_SATISFACAO = { baixa: 5.6, média: 7.9, alta: 9.3 } as const;

/** Deslocamento da nota de eNPS por diretoria e mês */
export function clima(dir: Diretoria, mes: Mes): number {
  if (dir === 'Operações') {
    // L3/N1: reorganização de Jan/2025
    if (mes < '2025-01') return 0;
    if (mes === '2025-01') return -0.9;
    if (mes === '2025-02') return -1.2;
    return -1.6;
  }
  if (dir === 'Tecnologia' && mes >= '2024-06') return -0.3;
  return 0;
}

/** L3: reorganização de Operações (mês da decisão → fração de CIs que troca de gestor) */
export const REORG_OPERACOES: Record<Mes, number> = { '2024-12': 0.4, '2025-06': 0.25 };

// ── Atividade mensal ──────────────────────────────────────────────────────────

/** Horas extras/mês de base (CIs; liderança é cargo de confiança e não registra) */
export const HORAS_EXTRAS_BASE: Record<Diretoria, number> = {
  Tecnologia: 2,
  'Distribuição & Assessoria': 3.5,
  Operações: 3,
  'Financeiro & Risco': 2,
  Gente: 1.5,
  'Produtos & Plataforma': 2,
};
/** N2: horas extras adicionais por ponto de taxa de vagas abertas do mês anterior */
export const HORAS_EXTRAS_POR_VAGA = 90;

export const AUSENCIA_BASE = 0.4;
/** N2: dias de ausência adicionais por hora extra acima de 4h no mês anterior */
export const AUSENCIA_POR_HORA_EXTRA = 0.05;
export const LIMITE_HORAS_AUSENCIA = 4;
export const DIAS_UTEIS_MES = 21;

export const TREINO_BASE: Record<Diretoria, number> = {
  Tecnologia: 1.6,
  'Distribuição & Assessoria': 1.6,
  Operações: 1.5,
  'Financeiro & Risco': 2.4,
  Gente: 2.2,
  'Produtos & Plataforma': 1.6,
};
export const TREINO_ONBOARDING = { completo: 6, incompleto: 0.8 } as const;

// ── Recrutamento ──────────────────────────────────────────────────────────────

/** Time to fill de base em dias */
export const TTF_BASE: Record<Diretoria, number> = {
  Tecnologia: 50,
  'Distribuição & Assessoria': 34,
  Operações: 36,
  'Financeiro & Risco': 40,
  Gente: 33,
  'Produtos & Plataforma': 45,
};
export const DIAS_POR_RECUSA = 18;

export const ACEITE_BASE: Record<Diretoria, number> = {
  Tecnologia: 0.84,
  'Distribuição & Assessoria': 0.86,
  Operações: 0.88,
  'Financeiro & Risco': 0.85,
  Gente: 0.9,
  'Produtos & Plataforma': 0.82,
};

export const CANDIDATOS: Record<Diretoria, number> = {
  Tecnologia: 18,
  'Distribuição & Assessoria': 40,
  Operações: 45,
  'Financeiro & Risco': 35,
  Gente: 55,
  'Produtos & Plataforma': 30,
};

/** Chance de a vaga ser preenchida por alguém de dentro */
export function chanceVagaInterna(dir: Diretoria, sen: Senioridade): number {
  if (sen === 'gerência') return 0.55;
  return dir === 'Financeiro & Risco' ? 0.4 : 0.12; // N5
}
/** N5: em Financeiro & Risco a vaga interna prefere gente da própria diretoria */
export const FR_PREFERE_PROPRIA_DIRETORIA = 0.75;
/** N5: programa de rotação entre especialidades (fração mensal dos CIs elegíveis) */
export const ROTACAO_FR_MENSAL = 0.006;

/** Promoção no ciclo (Mar e Set): fração dos elegíveis promovidos */
export const PROMOCAO_CICLO: Partial<Record<Senioridade, number>> = { júnior: 0.1, pleno: 0.065 };
export const MESES_MINIMOS_NO_NIVEL = 12;
