/**
 * Catálogo de indicadores: fonte única de definição. Painel, motor, detector de sinais e o
 * agente (fase 2) leem o mesmo registro. Cada indicador responde a uma pergunta que um
 * executivo de RH faz e é calculado só a partir de medidas aditivas da tabela de fatos.
 *
 * Forma do cálculo (declarativa, para o "Como calculei" e para a reconciliação):
 *  - total:  escala × Σ termo                  (contagens e valores em BRL; segmentos somam o total)
 *  - razao:  escala × Σ numerador ÷ Σ denominador (média ponderada dos segmentos pelo
 *            denominador = total)
 *  - compa:  (Σa/Σb) ÷ (Σc/Σd) − 1, em %        (gap salarial ajustado; não é aditivo)
 *
 * Janela de cada termo: `soma` (fluxos somados nos meses), `ultimo` (estoque no fim do
 * último mês) ou `primeiro` (estoque de abertura, lido como hcIni do primeiro mês).
 */

import { DIMENSOES, type Dimensao, type Medida, type Medidas } from './fatos';

export const DOMINIOS = [
  'Força de trabalho',
  'Retenção',
  'Atração',
  'Engajamento & bem-estar',
  'Desenvolvimento',
  'Diversidade & equidade',
  'Custo',
] as const;
export type Dominio = (typeof DOMINIOS)[number];

export const UNIDADES = ['pessoas', 'vagas', '%', '% a.a.', 'dias', 'R$', 'R$/mês', 'pontos', 'h/pessoa/mês', 'h/pessoa/ano', 'anos', 'liderados/gestor'] as const;
export type Unidade = (typeof UNIDADES)[number];

export const POLARIDADES = ['maior_melhor', 'menor_melhor', 'neutro'] as const;
export type Polaridade = (typeof POLARIDADES)[number];

export type Granularidade = 'mensal' | 'trimestral';
export type JanelaTermo = 'soma' | 'primeiro' | 'ultimo';
export type Termo = readonly (readonly [coeficiente: number, medida: Medida, janela: JanelaTermo])[];

export type Calculo =
  | { tipo: 'total'; termo: Termo; escala: number }
  | { tipo: 'razao'; numerador: Termo; denominador: Termo; escala: number }
  | { tipo: 'compa'; a: Termo; b: Termo; c: Termo; d: Termo };

export interface Referencia {
  valor: number;
  origem: string;
  /** distância da meta, na unidade do indicador, que ainda conta como "atenção" (default 10% da meta) */
  tolerancia?: number;
}

/** Medidas agregadas numa janela */
export interface Agregado {
  soma: Medidas;
  primeiro: Medidas;
  ultimo: Medidas;
  meses: number;
}

export interface Indicador {
  id: IdIndicador;
  nome: string;
  dominio: Dominio;
  pergunta: string;
  formula: string;
  unidade: Unidade;
  polaridade: Polaridade;
  meta?: Referencia;
  benchmark?: Referencia;
  granularidade: Granularidade;
  /** dimensões válidas para filtro, decompor e cruzar */
  dimensoes: readonly Dimensao[];
  explicacao: string;
  calculo: Calculo;
  /** medidas lidas pelo cálculo, pela amostra e pelo impacto */
  medidas: readonly Medida[];
  /**
   * amostra (n) do recorte: pessoas, respondentes, vagas ou ofertas. `pessoas`: a amostra conta
   * gente (quadro, exposição, liderança, gestores, respondentes), e abaixo de MIN_AMOSTRA o motor
   * não divulga o valor (k-anonimato); vagas e ofertas não identificam ninguém e só ficam frágeis.
   */
  amostra: { termo: Termo; porMes: boolean; descricao: string; pessoas: boolean };
  /** taxa de evento sobre pessoas: habilita `drivers` (lift por segmento no roster) */
  evento: boolean;
  /** custo estimado em BRL, quando faz sentido */
  impacto?: { termo: Termo; escala: number; metodologia: string };
  calcular(a: Agregado): number | null;
}

// ── Avaliação ─────────────────────────────────────────────────────────────────

export function somarTermo(termo: Termo, a: Agregado): number {
  let s = 0;
  for (const [coef, medida, janela] of termo) s += coef * a[janela][medida];
  return s;
}

export function avaliar(calculo: Calculo, a: Agregado): number | null {
  switch (calculo.tipo) {
    case 'total':
      return calculo.escala * somarTermo(calculo.termo, a);
    case 'razao': {
      const den = somarTermo(calculo.denominador, a);
      return den === 0 ? null : calculo.escala * somarTermo(calculo.numerador, a) / den;
    }
    case 'compa': {
      const [a1, b1, c1, d1] = [calculo.a, calculo.b, calculo.c, calculo.d].map(t => somarTermo(t, a));
      if (b1 === 0 || c1 === 0 || d1 === 0) return null;
      return ((a1 / b1) / (c1 / d1) - 1) * 100;
    }
  }
}

export function amostraDe(ind: Indicador, a: Agregado): number {
  const n = somarTermo(ind.amostra.termo, a);
  return ind.amostra.porMes ? n / Math.max(1, a.meses) : n;
}

// ── Construção ────────────────────────────────────────────────────────────────

type Definicao = Omit<Indicador, 'id' | 'medidas' | 'calcular' | 'evento' | 'granularidade'> & {
  evento?: boolean;
  granularidade?: Granularidade;
};

const s = (m: Medida, coef = 1): readonly [number, Medida, JanelaTermo] => [coef, m, 'soma'];
const u = (m: Medida, coef = 1): readonly [number, Medida, JanelaTermo] => [coef, m, 'ultimo'];

const PESSOAS: readonly Dimensao[] = DIMENSOES.filter(d => d !== 'mes');
const VAGAS: readonly Dimensao[] = ['diretoria', 'especialidade', 'senioridade'];
const sem = (...fora: Dimensao[]) => PESSOAS.filter(d => !fora.includes(d));

const EXPOSICAO = { termo: [s('hcIni')], porMes: true, descricao: 'headcount médio no início dos meses da janela', pessoas: true } as const;
const QUADRO_FIM = { termo: [u('hc')], porMes: false, descricao: 'headcount no fim do período', pessoas: true } as const;
const LIDERANCA_FIM = { termo: [u('lid')], porMes: false, descricao: 'pessoas na liderança no fim do período', pessoas: true } as const;
const FECHADAS = { termo: [s('vagasFechadas')], porMes: false, descricao: 'vagas fechadas no período', pessoas: false } as const;

const META_INTERNA = 'meta interna da Verta S.A. (fictícia)';
const CUSTO_REPOSICAO = 'Custo de reposição ≈ 6 salários mensais por saída (recrutamento, integração e rampa de produtividade).';

const DEFINICOES = {
  // ── Força de trabalho ─────────────────────────────────────────────────────
  headcount: {
    nome: 'Headcount',
    dominio: 'Força de trabalho',
    pergunta: 'Quantas pessoas temos hoje?',
    formula: 'pessoas ativas no fim do último mês do período',
    unidade: 'pessoas',
    polaridade: 'neutro',
    dimensoes: PESSOAS,
    explicacao: 'Fotografia do quadro no fim do período, já com promoções e movimentações aplicadas.',
    calculo: { tipo: 'total', termo: [u('hc')], escala: 1 },
    amostra: QUADRO_FIM,
  },
  admissoes: {
    nome: 'Admissões',
    dominio: 'Força de trabalho',
    pergunta: 'Quantas pessoas contratamos de fora?',
    formula: 'soma das admissões externas no período',
    unidade: 'pessoas',
    polaridade: 'neutro',
    dimensoes: PESSOAS,
    explicacao: 'Entradas por contratação externa. Promoções e movimentações internas não contam aqui.',
    calculo: { tipo: 'total', termo: [s('adm')], escala: 1 },
    amostra: EXPOSICAO,
  },
  crescimento_liquido: {
    nome: 'Crescimento líquido do quadro',
    dominio: 'Força de trabalho',
    pergunta: 'O quadro cresceu ou encolheu no período?',
    formula: '(headcount no fim do período − headcount no início do período) ÷ headcount no início × 100',
    unidade: '%',
    polaridade: 'neutro',
    dimensoes: sem('tempoCasa', 'faixaEtaria', 'enps', 'mobilidadeRecente', 'trocasGestor'),
    explicacao: 'Variação percentual do quadro entre o primeiro e o último dia do período.',
    calculo: { tipo: 'razao', numerador: [u('hc'), [-1, 'hcIni', 'primeiro']], denominador: [[1, 'hcIni', 'primeiro']], escala: 100 },
    amostra: { termo: [[1, 'hcIni', 'primeiro']], porMes: false, descricao: 'headcount no início do período', pessoas: true },
  },
  span_controle: {
    nome: 'Span of control',
    dominio: 'Força de trabalho',
    pergunta: 'Quantas pessoas cada gestor lidera, em média?',
    formula: 'pessoas com gestor ativo ÷ gestores com ao menos um liderado (fim do período)',
    unidade: 'liderados/gestor',
    polaridade: 'neutro',
    benchmark: { valor: 8, origem: 'referência de desenho organizacional da Verta S.A. (fictícia)' },
    dimensoes: ['diretoria', 'especialidade'],
    explicacao: 'Média de liderados diretos por gestor. Muito baixo indica camadas demais; muito alto, gestor sobrecarregado.',
    calculo: { tipo: 'razao', numerador: [u('liderados')], denominador: [u('gestores')], escala: 1 },
    amostra: { termo: [u('gestores')], porMes: false, descricao: 'gestores com liderados no fim do período', pessoas: true },
  },
  pct_lideranca: {
    nome: '% em liderança',
    dominio: 'Força de trabalho',
    pergunta: 'Que parte do quadro está em cargos de liderança?',
    formula: 'pessoas em gerência ou diretoria ÷ headcount × 100 (fim do período)',
    unidade: '%',
    polaridade: 'neutro',
    dimensoes: sem('senioridade'),
    explicacao: 'Peso da liderança (gerentes, superintendentes e diretores) no quadro.',
    calculo: { tipo: 'razao', numerador: [u('lid')], denominador: [u('hc')], escala: 100 },
    amostra: QUADRO_FIM,
  },

  // ── Retenção ──────────────────────────────────────────────────────────────
  turnover: {
    nome: 'Turnover total',
    dominio: 'Retenção',
    pergunta: 'Que parte do quadro estamos perdendo por ano?',
    formula: 'desligamentos ÷ headcount de início de mês somado no período × 12 × 100',
    unidade: '% a.a.',
    polaridade: 'menor_melhor',
    meta: { valor: 24, origem: META_INTERNA },
    dimensoes: PESSOAS,
    explicacao: 'Taxa anualizada de saídas (voluntárias e involuntárias). 24% a.a. significa perder 2 em cada 100 pessoas por mês.',
    calculo: { tipo: 'razao', numerador: [s('desl')], denominador: [s('hcIni')], escala: 1200 },
    amostra: EXPOSICAO,
    evento: true,
    impacto: { termo: [s('salDesl')], escala: 6, metodologia: CUSTO_REPOSICAO },
  },
  turnover_voluntario: {
    nome: 'Turnover voluntário',
    dominio: 'Retenção',
    pergunta: 'Quantas pessoas estão pedindo para sair?',
    formula: 'desligamentos voluntários ÷ headcount de início de mês somado no período × 12 × 100',
    unidade: '% a.a.',
    polaridade: 'menor_melhor',
    meta: { valor: 16, origem: META_INTERNA },
    dimensoes: PESSOAS,
    explicacao: 'Taxa anualizada de pedidos de demissão. É a parte do turnover que a gestão consegue influenciar mais.',
    calculo: { tipo: 'razao', numerador: [s('deslVol')], denominador: [s('hcIni')], escala: 1200 },
    amostra: EXPOSICAO,
    evento: true,
    impacto: { termo: [s('salDeslVol')], escala: 6, metodologia: CUSTO_REPOSICAO },
  },
  turnover_involuntario: {
    nome: 'Turnover involuntário',
    dominio: 'Retenção',
    pergunta: 'Quantas pessoas a empresa está desligando?',
    formula: '(desligamentos − desligamentos voluntários) ÷ headcount de início de mês somado no período × 12 × 100',
    unidade: '% a.a.',
    polaridade: 'neutro',
    dimensoes: PESSOAS,
    explicacao: 'Taxa anualizada de desligamentos por decisão da empresa (performance, reestruturação). Nem sempre é ruim: pode refletir gestão de performance.',
    calculo: { tipo: 'razao', numerador: [s('desl'), s('deslVol', -1)], denominador: [s('hcIni')], escala: 1200 },
    amostra: EXPOSICAO,
    evento: true,
    impacto: { termo: [s('salDesl'), s('salDeslVol', -1)], escala: 6, metodologia: CUSTO_REPOSICAO },
  },
  turnover_lamentado: {
    nome: 'Turnover lamentado',
    dominio: 'Retenção',
    pergunta: 'Estamos perdendo as pessoas de alta performance?',
    formula: 'saídas voluntárias de alta performance ÷ headcount de alta performance no início dos meses × 12 × 100',
    unidade: '% a.a.',
    polaridade: 'menor_melhor',
    meta: { valor: 15, origem: META_INTERNA },
    dimensoes: sem('performance'),
    explicacao: 'Taxa anualizada de pedidos de demissão entre quem tem avaliação "acima do esperado". É a perda mais cara.',
    calculo: { tipo: 'razao', numerador: [s('deslLam')], denominador: [s('hcAltaIni')], escala: 1200 },
    amostra: { termo: [s('hcAltaIni')], porMes: true, descricao: 'pessoas de alta performance (média no início dos meses)', pessoas: true },
    evento: true,
    impacto: { termo: [s('salDeslLam')], escala: 6, metodologia: CUSTO_REPOSICAO },
  },
  early_attrition: {
    nome: 'Early attrition',
    dominio: 'Retenção',
    pergunta: 'Estamos perdendo quem acabou de chegar?',
    formula: 'saídas de quem tinha menos de 12 meses de casa ÷ headcount com menos de 12 meses no início dos meses × 12 × 100',
    unidade: '% a.a.',
    polaridade: 'menor_melhor',
    meta: { valor: 30, origem: META_INTERNA },
    dimensoes: sem('tempoCasa'),
    explicacao: 'Taxa anualizada de saída no primeiro ano de casa. Alta indica problema de contratação ou de onboarding.',
    calculo: { tipo: 'razao', numerador: [s('deslNov')], denominador: [s('hcNovIni')], escala: 1200 },
    amostra: { termo: [s('hcNovIni')], porMes: true, descricao: 'pessoas com menos de 12 meses de casa (média no início dos meses)', pessoas: true },
    evento: true,
    impacto: { termo: [s('salDeslNov')], escala: 6, metodologia: CUSTO_REPOSICAO },
  },
  tempo_medio_casa: {
    nome: 'Tempo médio de casa',
    dominio: 'Retenção',
    pergunta: 'Há quanto tempo, em média, as pessoas estão na empresa?',
    formula: 'soma dos meses de casa ÷ headcount ÷ 12 (fim do período)',
    unidade: 'anos',
    polaridade: 'neutro',
    dimensoes: sem('tempoCasa'),
    explicacao: 'Média de anos de empresa de quem está no quadro no fim do período.',
    calculo: { tipo: 'razao', numerador: [u('tempoCasaSoma')], denominador: [u('hc')], escala: 1 / 12 },
    amostra: QUADRO_FIM,
  },

  // ── Atração ───────────────────────────────────────────────────────────────
  vagas_abertas: {
    nome: 'Vagas abertas',
    dominio: 'Atração',
    pergunta: 'Quantas posições estão sem ninguém agora?',
    formula: 'requisições abertas no fim do último mês do período',
    unidade: 'vagas',
    polaridade: 'neutro',
    dimensoes: VAGAS,
    explicacao: 'Estoque de vagas ainda não preenchidas (reposição e crescimento).',
    calculo: { tipo: 'total', termo: [u('vagasAbertas')], escala: 1 },
    amostra: { termo: [u('vagasAbertas')], porMes: false, descricao: 'vagas abertas no fim do período', pessoas: false },
  },
  time_to_fill: {
    nome: 'Time to fill',
    dominio: 'Atração',
    pergunta: 'Quanto tempo levamos para preencher uma vaga?',
    formula: 'soma dos dias entre abertura e preenchimento ÷ vagas fechadas no período',
    unidade: 'dias',
    polaridade: 'menor_melhor',
    meta: { valor: 45, origem: META_INTERNA },
    dimensoes: VAGAS,
    explicacao: 'Média de dias corridos entre abrir a vaga e alguém aceitar a posição, para vagas fechadas no período.',
    calculo: { tipo: 'razao', numerador: [s('diasTtf')], denominador: [s('vagasFechadas')], escala: 1 },
    amostra: FECHADAS,
  },
  aceite_oferta: {
    nome: 'Taxa de aceite de oferta',
    dominio: 'Atração',
    pergunta: 'Nossas propostas estão sendo aceitas?',
    formula: 'ofertas aceitas ÷ ofertas feitas × 100 (vagas fechadas no período)',
    unidade: '%',
    polaridade: 'maior_melhor',
    meta: { valor: 85, origem: META_INTERNA },
    dimensoes: VAGAS,
    explicacao: 'De cada 100 propostas feitas, quantas foram aceitas. Queda costuma indicar salário abaixo do mercado.',
    calculo: { tipo: 'razao', numerador: [s('aceites')], denominador: [s('ofertas')], escala: 100 },
    amostra: { termo: [s('ofertas')], porMes: false, descricao: 'ofertas feitas no período', pessoas: false },
  },
  preenchimento_interno: {
    nome: '% de vagas preenchidas internamente',
    dominio: 'Atração',
    pergunta: 'Estamos aproveitando quem já está na casa?',
    formula: 'vagas preenchidas por promoção ou movimentação interna ÷ vagas fechadas × 100',
    unidade: '%',
    polaridade: 'maior_melhor',
    meta: { valor: 25, origem: META_INTERNA },
    dimensoes: VAGAS,
    explicacao: 'Parcela das vagas fechadas com gente de dentro. Reflete plano de carreira e mobilidade.',
    calculo: { tipo: 'razao', numerador: [s('vagasInternas')], denominador: [s('vagasFechadas')], escala: 100 },
    amostra: FECHADAS,
  },
  custo_por_contratacao: {
    nome: 'Custo por contratação',
    dominio: 'Atração',
    pergunta: 'Quanto custa, em média, preencher uma vaga?',
    formula: 'custos de recrutamento (anúncios, triagem, headhunter) ÷ vagas fechadas no período',
    unidade: 'R$',
    polaridade: 'menor_melhor',
    dimensoes: VAGAS,
    explicacao: 'Custo médio de recrutamento por vaga fechada. Vagas de liderança com headhunter puxam a média para cima.',
    calculo: { tipo: 'razao', numerador: [s('custoRecrut')], denominador: [s('vagasFechadas')], escala: 1 },
    amostra: FECHADAS,
  },

  // ── Engajamento & bem-estar ───────────────────────────────────────────────
  enps: {
    nome: 'eNPS',
    dominio: 'Engajamento & bem-estar',
    pergunta: 'As pessoas recomendariam a Verta como lugar para trabalhar?',
    formula: '(promotores − detratores) ÷ respondentes × 100, nos ciclos trimestrais do período (notas 9-10 promotor, 0-6 detrator)',
    unidade: 'pontos',
    polaridade: 'maior_melhor',
    meta: { valor: 20, origem: META_INTERNA, tolerancia: 5 },
    granularidade: 'trimestral',
    dimensoes: sem('enps'),
    explicacao: 'Vai de −100 a +100. Pesquisa trimestral (Dez, Mar, Jun, Set); acima de zero há mais promotores que detratores.',
    calculo: { tipo: 'razao', numerador: [s('enpsProm'), s('enpsDetr', -1)], denominador: [s('enpsResp')], escala: 100 },
    amostra: { termo: [s('enpsResp')], porMes: false, descricao: 'respostas de eNPS no período', pessoas: true },
  },
  absenteismo: {
    nome: 'Absenteísmo',
    dominio: 'Engajamento & bem-estar',
    pergunta: 'Quanto do tempo de trabalho estamos perdendo com ausências?',
    formula: 'dias de ausência ÷ (headcount de início de mês × 21 dias úteis) × 100',
    unidade: '%',
    polaridade: 'menor_melhor',
    meta: { valor: 3, origem: META_INTERNA },
    dimensoes: PESSOAS,
    explicacao: 'Percentual dos dias úteis perdidos com faltas e licenças curtas.',
    calculo: { tipo: 'razao', numerador: [s('ausencia')], denominador: [s('hcIni', 21)], escala: 100 },
    amostra: EXPOSICAO,
    impacto: { termo: [s('custoAusencia')], escala: 1, metodologia: 'Dias de ausência × salário diário (salário mensal ÷ 21).' },
  },
  horas_extras_pc: {
    nome: 'Horas extras per capita',
    dominio: 'Engajamento & bem-estar',
    pergunta: 'O time está sobrecarregado?',
    formula: 'horas extras registradas ÷ headcount de início de mês somado no período',
    unidade: 'h/pessoa/mês',
    polaridade: 'menor_melhor',
    meta: { valor: 8, origem: META_INTERNA },
    dimensoes: PESSOAS,
    explicacao: 'Média de horas extras por pessoa por mês. Liderança é cargo de confiança e não registra horas extras.',
    calculo: { tipo: 'razao', numerador: [s('extras')], denominador: [s('hcIni')], escala: 1 },
    amostra: EXPOSICAO,
    impacto: { termo: [s('custoExtras')], escala: 1, metodologia: 'Horas extras × salário-hora (salário ÷ 220) × 1,5 (adicional mínimo da CLT).' },
  },

  // ── Desenvolvimento ───────────────────────────────────────────────────────
  taxa_promocao: {
    nome: 'Taxa de promoção',
    dominio: 'Desenvolvimento',
    pergunta: 'As pessoas estão crescendo na carreira aqui dentro?',
    formula: 'promoções ÷ headcount de início de mês somado no período × 12 × 100',
    unidade: '% a.a.',
    polaridade: 'maior_melhor',
    meta: { valor: 8, origem: META_INTERNA },
    dimensoes: PESSOAS,
    explicacao: 'Taxa anualizada de promoções (de ciclo e por vaga de liderança).',
    calculo: { tipo: 'razao', numerador: [s('promo')], denominador: [s('hcIni')], escala: 1200 },
    amostra: EXPOSICAO,
    evento: true,
  },
  mobilidade_interna: {
    nome: 'Mobilidade interna',
    dominio: 'Desenvolvimento',
    pergunta: 'As pessoas conseguem mudar de área sem sair da empresa?',
    formula: 'movimentações laterais (outra especialidade ou diretoria) ÷ headcount de início de mês somado no período × 12 × 100',
    unidade: '% a.a.',
    polaridade: 'maior_melhor',
    meta: { valor: 6, origem: META_INTERNA },
    dimensoes: PESSOAS,
    explicacao: 'Taxa anualizada de mudanças de área na mesma senioridade (vagas internas e programas de rotação).',
    calculo: { tipo: 'razao', numerador: [s('mob')], denominador: [s('hcIni')], escala: 1200 },
    amostra: EXPOSICAO,
    evento: true,
  },
  horas_treinamento_pc: {
    nome: 'Horas de treinamento per capita',
    dominio: 'Desenvolvimento',
    pergunta: 'Estamos investindo no desenvolvimento das pessoas?',
    formula: 'horas de treinamento ÷ headcount de início de mês somado no período × 12',
    unidade: 'h/pessoa/ano',
    polaridade: 'maior_melhor',
    meta: { valor: 24, origem: META_INTERNA },
    dimensoes: PESSOAS,
    explicacao: 'Horas de treinamento por pessoa, anualizadas. Inclui a trilha de onboarding dos 3 primeiros meses.',
    calculo: { tipo: 'razao', numerador: [s('treino')], denominador: [s('hcIni')], escala: 12 },
    amostra: EXPOSICAO,
  },

  // ── Diversidade & equidade ────────────────────────────────────────────────
  mulheres: {
    nome: 'Mulheres no quadro',
    dominio: 'Diversidade & equidade',
    pergunta: 'Temos equilíbrio de gênero na empresa?',
    formula: 'mulheres ÷ headcount × 100 (fim do período)',
    unidade: '%',
    polaridade: 'neutro',
    benchmark: { valor: 50, origem: 'paridade de gênero' },
    dimensoes: sem('genero'),
    explicacao: 'Proporção de mulheres no quadro total.',
    calculo: { tipo: 'razao', numerador: [u('mulheres')], denominador: [u('hc')], escala: 100 },
    amostra: QUADRO_FIM,
  },
  mulheres_lideranca: {
    nome: 'Mulheres na liderança',
    dominio: 'Diversidade & equidade',
    pergunta: 'As mulheres chegam à liderança na mesma proporção em que estão na empresa?',
    formula: 'mulheres em gerência ou diretoria ÷ pessoas em gerência ou diretoria × 100 (fim do período)',
    unidade: '%',
    polaridade: 'maior_melhor',
    meta: { valor: 40, origem: META_INTERNA },
    dimensoes: sem('genero', 'senioridade'),
    explicacao: 'Proporção de mulheres entre gerentes, superintendentes e diretores.',
    calculo: { tipo: 'razao', numerador: [u('lidMulheres')], denominador: [u('lid')], escala: 100 },
    amostra: LIDERANCA_FIM,
  },
  negros: {
    nome: 'Pessoas negras no quadro',
    dominio: 'Diversidade & equidade',
    pergunta: 'O quadro reflete a composição racial do país?',
    formula: 'pessoas pretas e pardas ÷ headcount × 100 (fim do período)',
    unidade: '%',
    polaridade: 'maior_melhor',
    benchmark: { valor: 55.5, origem: 'Censo IBGE 2022: pretos (10,2%) + pardos (45,3%)' },
    dimensoes: sem('raca'),
    explicacao: 'Proporção de pessoas pretas e pardas (categorias do IBGE) no quadro.',
    calculo: { tipo: 'razao', numerador: [u('negros')], denominador: [u('hc')], escala: 100 },
    amostra: QUADRO_FIM,
  },
  negros_lideranca: {
    nome: 'Pessoas negras na liderança',
    dominio: 'Diversidade & equidade',
    pergunta: 'Pessoas negras chegam à liderança?',
    formula: 'pessoas pretas e pardas em gerência ou diretoria ÷ pessoas em gerência ou diretoria × 100 (fim do período)',
    unidade: '%',
    polaridade: 'maior_melhor',
    meta: { valor: 30, origem: META_INTERNA },
    dimensoes: sem('raca', 'senioridade'),
    explicacao: 'Proporção de pessoas pretas e pardas entre gerentes, superintendentes e diretores.',
    calculo: { tipo: 'razao', numerador: [u('lidNegros')], denominador: [u('lid')], escala: 100 },
    amostra: LIDERANCA_FIM,
  },
  pcd: {
    nome: 'Pessoas com deficiência',
    dominio: 'Diversidade & equidade',
    pergunta: 'Cumprimos a cota legal de PcD?',
    formula: 'pessoas com deficiência ÷ headcount × 100 (fim do período)',
    unidade: '%',
    polaridade: 'maior_melhor',
    meta: { valor: 5, origem: 'cota legal para empresas com mais de 1.000 pessoas (Lei 8.213/91, art. 93)', tolerancia: 0.5 },
    dimensoes: sem('pcd'),
    explicacao: 'Proporção de pessoas com deficiência no quadro. A lei exige 5% em empresas com mais de 1.000 pessoas.',
    calculo: { tipo: 'razao', numerador: [u('pcd')], denominador: [u('hc')], escala: 100 },
    amostra: QUADRO_FIM,
  },
  gap_salarial_genero: {
    nome: 'Gap salarial de gênero ajustado',
    dominio: 'Diversidade & equidade',
    pergunta: 'Mulheres ganham menos que homens no mesmo nível de cargo?',
    formula: '(salário ÷ ponto médio da faixa das mulheres) ÷ (salário ÷ ponto médio da faixa dos homens) − 1, × 100 (fim do período)',
    unidade: '%',
    polaridade: 'maior_melhor',
    meta: { valor: -2, origem: META_INTERNA, tolerancia: 1 },
    dimensoes: sem('genero'),
    explicacao: 'Compara o compa-ratio (salário dividido pelo ponto médio da faixa do cargo) de mulheres e homens. −4% quer dizer que, no mesmo nível, as mulheres ganham 4% menos.',
    calculo: { tipo: 'compa', a: [u('folhaMulheres')], b: [u('refMulheres')], c: [u('folhaHomens')], d: [u('refHomens')] },
    amostra: QUADRO_FIM,
  },

  // ── Custo ─────────────────────────────────────────────────────────────────
  folha: {
    nome: 'Folha mensal',
    dominio: 'Custo',
    pergunta: 'Quanto pagamos de salário por mês?',
    formula: 'soma dos salários mensais de quem está no quadro no fim do período',
    unidade: 'R$/mês',
    polaridade: 'neutro',
    dimensoes: PESSOAS,
    explicacao: 'Salário-base mensal somado (sem encargos e benefícios).',
    calculo: { tipo: 'total', termo: [u('folha')], escala: 1 },
    amostra: QUADRO_FIM,
  },
  custo_turnover: {
    nome: 'Custo estimado do turnover',
    dominio: 'Custo',
    pergunta: 'Quanto as saídas estão custando?',
    formula: 'soma dos salários mensais de quem saiu no período × 6',
    unidade: 'R$',
    polaridade: 'menor_melhor',
    dimensoes: PESSOAS,
    explicacao: 'Estimativa do custo de repor quem saiu: cerca de 6 salários por saída (recrutamento, integração e rampa de produtividade).',
    calculo: { tipo: 'total', termo: [s('salDesl')], escala: 6 },
    amostra: EXPOSICAO,
    impacto: { termo: [s('salDesl')], escala: 6, metodologia: CUSTO_REPOSICAO },
  },
} satisfies Record<string, Definicao>;

export type IdIndicador = keyof typeof DEFINICOES;

function medidasDe(d: Definicao): Medida[] {
  const termos: Termo[] = [d.amostra.termo];
  const c = d.calculo;
  if (c.tipo === 'total') termos.push(c.termo);
  else if (c.tipo === 'razao') termos.push(c.numerador, c.denominador);
  else termos.push(c.a, c.b, c.c, c.d);
  if (d.impacto) termos.push(d.impacto.termo);
  const out: Medida[] = [];
  for (const t of termos) for (const [, m] of t) if (!out.includes(m)) out.push(m);
  return out;
}

export const IDS_INDICADORES = Object.keys(DEFINICOES) as IdIndicador[];

export const CATALOGO = {} as Record<IdIndicador, Indicador>;
for (const id of IDS_INDICADORES) {
  const d: Definicao = DEFINICOES[id];
  CATALOGO[id] = {
    ...d,
    id,
    evento: d.evento ?? false,
    granularidade: d.granularidade ?? 'mensal',
    medidas: medidasDe(d),
    calcular: (a: Agregado) => avaliar(d.calculo, a),
  };
}

export const INDICADORES: readonly Indicador[] = IDS_INDICADORES.map(id => CATALOGO[id]);
