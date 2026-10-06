/**
 * Roteiro das perguntas sugeridas do resumo executivo no recorte padrão (empresa toda, Set/26,
 * lentes CEO, CHRO e gestor), com o texto exato do layout pré-gerado. A mesma pergunta em duas
 * lentes é gravada uma vez (`lentes` diz onde ela aparece).
 */

import { comparar, decompor, drivers, impacto, mes, P12, P12_ANTERIOR, P24, serie, sinais, valor } from './consultas';
import type { EntradaRoteiro } from './gravar';

const TEC = { diretoria: 'Tecnologia' };
const DA = { diretoria: 'Distribuição & Assessoria' };
const OP = { diretoria: 'Operações' };
const PP = { diretoria: 'Produtos & Plataforma' };
const FR = { diretoria: 'Financeiro & Risco' };
const GENTE = { diretoria: 'Gente' };
const JAN26 = mes('2026-01');

const texto = (...linhas: string[]) => linhas.join('\n');

export const ROTEIRO_RESUMO: EntradaRoteiro[] = [
  // ── CEO ─────────────────────────────────────────────────────────────────────
  {
    id: 'resumo-early-attrition-produtos',
    grupo: 'resumo',
    lentes: ['ceo', 'gestor'],
    pergunta: 'O que explica o salto do early attrition em Produtos & Plataforma a partir de Abr/25?',
    recorte: { indicador: 'early_attrition', periodo: P12, filtros: PP, lente: 'ceo' },
    narracao: 'Vou puxar a série de Produtos & Plataforma, comparar com o ano anterior e abrir por onboarding.',
    rodadas: [[serie('early_attrition', P24, PP), comparar('early_attrition', { periodo: P12, filtros: PP }, { periodo: P12_ANTERIOR, filtros: PP }), decompor('early_attrition', 'onboarding', P12, PP), impacto('early_attrition', P12, PP)]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r3' }],
    texto: texto(''),
    continuacoes: ['historia-onboarding-produtos', 'resumo-custo-turnover-produtos'],
  },
  {
    id: 'resumo-custo-turnover-da',
    grupo: 'resumo',
    lentes: ['ceo'],
    pergunta: 'Por que o custo do turnover em Distribuição & Assessoria atinge R$ 4.636.200 em Jan/26?',
    recorte: { indicador: 'custo_turnover', periodo: P12, filtros: DA, ponto: { mes: '2026-01' }, lente: 'ceo' },
    narracao: 'Vou levantar o custo de janeiro, a série de 24 meses e quem saiu naquele mês.',
    rodadas: [[valor('custo_turnover', JAN26, DA), serie('custo_turnover', P24, DA), valor('turnover', JAN26, DA), decompor('turnover_involuntario', 'performance', JAN26, DA)]],
    mostrar: [{ resultado: 'r2' }, { resultado: 'r4' }],
    texto: texto(''),
    continuacoes: ['historia-janeiro-da', 'resumo-pico-janeiro-mitigar'],
  },
  {
    id: 'resumo-enps-operacoes-reverter',
    grupo: 'resumo',
    lentes: ['ceo'],
    pergunta: 'Como reverter a queda do eNPS em Operações, que chegou a -38 no 3T26?',
    recorte: { indicador: 'enps', periodo: P12, filtros: OP, lente: 'ceo' },
    narracao: 'Vou puxar os ciclos de eNPS de Operações, o efeito das trocas de gestor e o custo das saídas.',
    rodadas: [[serie('enps', P24, OP, 'trimestre'), decompor('enps', 'trocasGestor', P12, OP), impacto('turnover_voluntario', P12, OP)]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r2' }],
    texto: texto(''),
    continuacoes: ['historia-enps-operacoes', 'resumo-enps-operacoes-acoes'],
  },
  {
    id: 'resumo-enps-antecipa-turnover',
    grupo: 'resumo',
    lentes: ['ceo'],
    pergunta: 'A queda do eNPS em Operações antecipa novo aumento do turnover voluntário?',
    recorte: { indicador: 'turnover_voluntario', periodo: P12, filtros: OP, lente: 'ceo' },
    narracao: 'Vou buscar o sinal de antecedente no detector e abrir as saídas por resposta de eNPS.',
    rodadas: [[sinais(P12, 'Operações', 'ceo'), serie('turnover_voluntario', P24, OP), decompor('turnover_voluntario', 'enps', P12, OP), valor('turnover_voluntario', P12, OP)]],
    mostrar: [{ resultado: 'r2' }, { resultado: 'r3' }],
    texto: texto(''),
    continuacoes: ['historia-enps-operacoes', 'enps-saidas'],
  },
  {
    id: 'resumo-early-attrition-gente',
    grupo: 'resumo',
    lentes: ['ceo'],
    pergunta: 'O que Gente faz para manter o early attrition em 10,9% a.a.?',
    recorte: { indicador: 'early_attrition', periodo: P12, filtros: GENTE, lente: 'ceo' },
    narracao: 'Vou comparar Gente com as outras diretorias e abrir por onboarding.',
    rodadas: [[valor('early_attrition', P12, GENTE), decompor('early_attrition', 'diretoria'), decompor('early_attrition', 'onboarding', P12, GENTE), decompor('early_attrition', 'onboarding')]],
    mostrar: [{ resultado: 'r2' }, { resultado: 'r4' }],
    texto: texto(''),
    continuacoes: ['early-attrition-onboarding', 'historia-onboarding-produtos'],
  },

  // ── CHRO ────────────────────────────────────────────────────────────────────
  {
    id: 'resumo-early-attrition-quebra',
    grupo: 'resumo',
    lentes: ['chro'],
    pergunta: 'O que explica a quebra de tendência do early attrition em Produtos & Plataforma a partir de Abr/25?',
    recorte: { indicador: 'early_attrition', periodo: P12, filtros: PP, lente: 'chro' },
    narracao: 'Vou buscar os fatores de risco e de proteção do early attrition de Produtos & Plataforma.',
    rodadas: [[serie('early_attrition', P24, PP), drivers('early_attrition', P12, PP), decompor('early_attrition', 'onboarding', P12, PP)]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r2' }],
    texto: texto(''),
    continuacoes: ['historia-onboarding-produtos', 'early-attrition-onboarding'],
  },
  {
    id: 'resumo-enps-operacoes-alavancas',
    grupo: 'resumo',
    lentes: ['chro'],
    pergunta: 'Quais alavancas de política de pessoas podem reverter o eNPS de Operações após 1T25?',
    recorte: { indicador: 'enps', periodo: P12, filtros: OP, lente: 'chro' },
    narracao: 'Vou abrir o eNPS de Operações por trocas de gestor, faixa salarial e tempo de casa.',
    rodadas: [[valor('enps', P12, OP), decompor('enps', 'trocasGestor', P12, OP), decompor('enps', 'faixaSalarial', P12, OP), decompor('enps', 'tempoCasa', P12, OP)]],
    mostrar: [{ resultado: 'r2' }, { resultado: 'r3' }],
    texto: texto(''),
    continuacoes: ['historia-operacoes', 'resumo-enps-operacoes-acoes'],
  },
  {
    id: 'resumo-custo-turnover-produtos',
    grupo: 'resumo',
    lentes: ['chro'],
    pergunta: 'Como conter a alta do custo estimado do turnover em Produtos & Plataforma desde Jul/25?',
    recorte: { indicador: 'custo_turnover', periodo: P12, filtros: PP, lente: 'chro' },
    narracao: 'Vou puxar a série de custo de Produtos & Plataforma e separar o que vem das saídas no primeiro ano.',
    rodadas: [[serie('custo_turnover', P24, PP), valor('custo_turnover', P12, PP), impacto('early_attrition', P12, PP), comparar('custo_turnover', { periodo: P12, filtros: PP }, { periodo: P12_ANTERIOR, filtros: PP })]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r4' }],
    texto: texto(''),
    continuacoes: ['historia-onboarding-produtos', 'custo-turnover-tipo'],
  },
  {
    id: 'resumo-time-to-fill-tecnologia',
    grupo: 'resumo',
    lentes: ['chro'],
    pergunta: 'Que ações reduzem o time to fill de Tecnologia, hoje em 88 dias?',
    recorte: { indicador: 'time_to_fill', periodo: P12, filtros: TEC, lente: 'chro' },
    narracao: 'Vou abrir o time to fill de Tecnologia por especialidade e senioridade e ver o aceite de oferta.',
    rodadas: [[valor('time_to_fill', P12, TEC), decompor('time_to_fill', 'especialidade', P12, TEC), decompor('time_to_fill', 'senioridade', P12, TEC), valor('aceite_oferta', P12, TEC)]],
    mostrar: [{ resultado: 'r2', tipo: 'tabela' }, { resultado: 'r3' }],
    texto: texto(''),
    continuacoes: ['historia-vagas-tecnologia', 'aceite-oferta-tecnologia'],
  },
  {
    id: 'resumo-pico-janeiro-da',
    grupo: 'resumo',
    lentes: ['chro'],
    pergunta: 'O pico de turnover total em Distribuição & Assessoria em Jan/26 é sazonal ou estrutural?',
    recorte: { indicador: 'turnover', periodo: P12, filtros: DA, ponto: { mes: '2026-01' }, lente: 'chro' },
    narracao: 'Vou comparar Jan/26 com Jan/25 e checar o sinal de sazonalidade do detector.',
    rodadas: [[serie('turnover', P24, DA), comparar('turnover', { periodo: JAN26, filtros: DA }, { periodo: mes('2025-01'), filtros: DA }), sinais(P12, 'Distribuição & Assessoria', 'chro'), valor('turnover', P12, DA)]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r2' }],
    texto: texto(''),
    continuacoes: ['historia-janeiro-da', 'resumo-pico-janeiro-mitigar'],
  },

  // ── Gestor ──────────────────────────────────────────────────────────────────
  {
    id: 'resumo-mobilidade-fr-replicar',
    grupo: 'resumo',
    lentes: ['gestor'],
    pergunta: 'Como replicar a mobilidade interna de 13,2% a.a. de Financeiro & Risco no meu time?',
    recorte: { indicador: 'mobilidade_interna', periodo: P12, filtros: FR, lente: 'gestor' },
    narracao: 'Vou comparar a mobilidade de Financeiro & Risco com as outras diretorias e ver o efeito na retenção.',
    rodadas: [[decompor('mobilidade_interna', 'diretoria'), decompor('mobilidade_interna', 'especialidade', P12, FR), decompor('turnover_voluntario', 'mobilidadeRecente', P12, FR)]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r3' }],
    texto: texto(''),
    continuacoes: ['historia-mobilidade-fr', 'mobilidade-interna-retencao'],
  },
  {
    id: 'resumo-enps-operacoes-acoes',
    grupo: 'resumo',
    lentes: ['gestor'],
    pergunta: 'Quais ações práticas podem reverter o eNPS de -47 em Operações?',
    recorte: { indicador: 'enps', periodo: P12, filtros: OP, lente: 'gestor' },
    narracao: 'Vou abrir o eNPS de Operações por trocas de gestor, especialidade e modalidade.',
    rodadas: [[valor('enps', P12, OP), decompor('enps', 'trocasGestor', P12, OP), decompor('enps', 'especialidade', P12, OP), decompor('enps', 'modalidade', P12, OP)]],
    mostrar: [{ resultado: 'r2' }, { resultado: 'r3', tipo: 'tabela' }],
    texto: texto(''),
    continuacoes: ['resumo-enps-operacoes-alavancas', 'historia-operacoes'],
  },
  {
    id: 'resumo-pico-janeiro-mitigar',
    grupo: 'resumo',
    lentes: ['gestor'],
    pergunta: 'Como mitigar o pico sazonal de turnover total em Distribuição & Assessoria em Jan/26?',
    recorte: { indicador: 'turnover', periodo: P12, filtros: DA, ponto: { mes: '2026-01' }, lente: 'gestor' },
    narracao: 'Vou abrir as saídas de Jan/26 em Distribuição & Assessoria por performance e por tipo.',
    rodadas: [[valor('turnover', JAN26, DA), decompor('turnover', 'performance', JAN26, DA), valor('turnover_voluntario', JAN26, DA), valor('turnover_involuntario', JAN26, DA)]],
    mostrar: [{ resultado: 'r2' }],
    texto: texto(''),
    continuacoes: ['historia-janeiro-da', 'resumo-pico-janeiro-da'],
  },
  {
    id: 'resumo-horas-extras-absenteismo',
    grupo: 'resumo',
    lentes: ['gestor'],
    pergunta: 'A alta de horas extras em Tecnologia antecipa aumento de absenteísmo no meu time?',
    recorte: { indicador: 'absenteismo', periodo: P12, filtros: TEC, lente: 'gestor' },
    narracao: 'Vou buscar o sinal de antecedente de Tecnologia e puxar as séries de horas extras e ausências.',
    rodadas: [[sinais(P12, 'Tecnologia', 'gestor'), serie('absenteismo', P24, TEC), serie('horas_extras_pc', P24, TEC), valor('absenteismo', P12, TEC), valor('horas_extras_pc', P12, TEC)]],
    mostrar: [{ resultado: 'r3' }, { resultado: 'r2' }],
    texto: texto(''),
    continuacoes: ['historia-vagas-tecnologia', 'absenteismo-custo'],
  },
];
