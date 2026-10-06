/**
 * Roteiro das 8 histórias de docs/narrativa.md, como perguntas livres de executivo, cada uma no
 * recorte que a história pede. `indicadores` diz em que telas a história aparece como sugestão.
 */

import { comparar, decompor, drivers, impacto, JANELA, mes, P12, P24, serie, sinais, valor } from './consultas';
import type { EntradaRoteiro } from './gravar';

const TEC = { diretoria: 'Tecnologia' };
const DA = { diretoria: 'Distribuição & Assessoria' };
const OP = { diretoria: 'Operações' };
const PP = { diretoria: 'Produtos & Plataforma' };
const FR = { diretoria: 'Financeiro & Risco' };
const A2024 = { inicio: '2024-01', fim: '2024-12' };
const A2025 = { inicio: '2025-01', fim: '2025-12' };
/** depois das duas reorganizações de Operações e do tempo de procura */
const OP_DEPOIS = { inicio: '2025-05', fim: '2026-09' };

const texto = (...linhas: string[]) => linhas.join('\n');

export const ROTEIRO_HISTORIAS: EntradaRoteiro[] = [
  {
    id: 'historia-fuga-tecnologia',
    grupo: 'historia',
    pergunta: 'Por que estamos perdendo talento em Tecnologia?',
    recorte: { indicador: 'turnover_lamentado', periodo: P12, filtros: TEC, lente: 'chro' },
    indicadores: ['turnover_voluntario', 'turnover', 'aceite_oferta'],
    narracao: 'Vou medir as saídas lamentadas de Tecnologia, comparar com as outras diretorias e buscar os fatores de risco.',
    rodadas: [
      [valor('turnover_lamentado', P12, TEC), decompor('turnover_lamentado', 'diretoria'), comparar('turnover_voluntario', { periodo: A2025, filtros: TEC }, { periodo: A2024, filtros: TEC })],
      [drivers('turnover_lamentado', P12, TEC), decompor('turnover', 'faixaSalarial', P12, TEC)],
    ],
    mostrar: [{ resultado: 'r2' }, { resultado: 'r5' }, { resultado: 'r4' }],
    texto: texto(''),
    continuacoes: ['turnover-voluntario', 'aceite-oferta-tecnologia'],
  },
  {
    id: 'historia-janeiro-da',
    grupo: 'historia',
    pergunta: 'Por que as saídas disparam todo janeiro em Distribuição & Assessoria?',
    recorte: { indicador: 'turnover', periodo: P12, filtros: DA, ponto: { mes: '2026-01' }, lente: 'chro' },
    indicadores: ['turnover', 'turnover_involuntario', 'custo_turnover'],
    narracao: 'Vou puxar a série de Distribuição & Assessoria, o mês de janeiro e quem saiu por performance.',
    rodadas: [[serie('turnover', P24, DA), valor('turnover', mes('2026-01'), DA), decompor('turnover_involuntario', 'performance', mes('2026-01'), DA), sinais(P12, 'Distribuição & Assessoria')]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r3' }],
    texto: texto(''),
    continuacoes: ['turnover-involuntario-janeiro', 'custo-turnover'],
  },
  {
    id: 'historia-operacoes',
    grupo: 'historia',
    pergunta: 'Por que o turnover de Operações escalou?',
    recorte: { indicador: 'turnover_voluntario', periodo: P12, filtros: OP, lente: 'chro' },
    indicadores: ['turnover', 'turnover_voluntario', 'enps', 'span_controle'],
    narracao: 'Vou comparar o turnover de Operações com 2024 e abrir as saídas voluntárias por eNPS e trocas de gestor.',
    rodadas: [
      [comparar('turnover', { periodo: P12, filtros: OP }, { periodo: A2024, filtros: OP }), decompor('turnover_voluntario', 'enps', OP_DEPOIS, OP), decompor('turnover_voluntario', 'trocasGestor', OP_DEPOIS, OP)],
      [drivers('turnover_voluntario', OP_DEPOIS, OP)],
    ],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r3' }, { resultado: 'r4' }],
    texto: texto(''),
    continuacoes: ['historia-enps-operacoes', 'turnover-voluntario'],
  },
  {
    id: 'historia-enps-operacoes',
    grupo: 'historia',
    pergunta: 'O eNPS antecipou o turnover em Operações?',
    recorte: { indicador: 'enps', periodo: P24, filtros: OP, lente: 'chro' },
    indicadores: ['enps', 'turnover_voluntario'],
    narracao: 'Vou puxar os ciclos de eNPS de Operações, o turnover voluntário mês a mês e os sinais do detector.',
    rodadas: [[serie('enps', JANELA, OP, 'trimestre'), serie('turnover_voluntario', P24, OP), sinais(P24, 'Operações')]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r2' }],
    texto: texto(''),
    continuacoes: ['enps-saidas', 'historia-operacoes'],
  },
  {
    id: 'historia-vagas-tecnologia',
    grupo: 'historia',
    pergunta: 'Por que as horas extras de Tecnologia subiram?',
    recorte: { indicador: 'horas_extras_pc', periodo: P12, filtros: TEC, lente: 'chro' },
    indicadores: ['vagas_abertas', 'time_to_fill', 'horas_extras_pc', 'absenteismo'],
    narracao: 'Vou cruzar vagas abertas, horas extras e ausências de Tecnologia e estimar o custo.',
    rodadas: [[sinais(JANELA, 'Tecnologia'), serie('vagas_abertas', { inicio: '2024-01', fim: '2025-12' }, TEC), valor('horas_extras_pc', P12, TEC), valor('absenteismo', P12, TEC), impacto('horas_extras_pc', P12, TEC)]],
    mostrar: [{ resultado: 'r2' }, { resultado: 'r5' }],
    texto: texto(''),
    continuacoes: ['horas-extras-pc-custo', 'resumo-horas-extras-absenteismo'],
  },
  {
    id: 'historia-teto-de-vidro',
    grupo: 'historia',
    pergunta: 'Por que há tão poucas mulheres na liderança?',
    recorte: { indicador: 'mulheres_lideranca', periodo: P12, lente: 'chro' },
    indicadores: ['mulheres_lideranca', 'mulheres', 'taxa_promocao', 'gap_salarial_genero'],
    narracao: 'Vou comparar mulheres no quadro e na liderança e abrir a taxa de promoção por gênero em cada degrau.',
    rodadas: [[valor('mulheres_lideranca'), valor('mulheres'), decompor('taxa_promocao', 'genero', JANELA, { senioridade: 'sênior' }), decompor('taxa_promocao', 'genero', JANELA, { senioridade: 'pleno' })]],
    mostrar: [{ resultado: 'r3' }, { resultado: 'r4' }],
    texto: texto(''),
    continuacoes: ['mulheres-lideranca', 'gap-salarial-genero'],
  },
  {
    id: 'historia-onboarding-produtos',
    grupo: 'historia',
    pergunta: 'Por que tanta gente sai no primeiro ano em Produtos & Plataforma?',
    recorte: { indicador: 'early_attrition', periodo: P12, filtros: PP, lente: 'chro' },
    indicadores: ['early_attrition', 'admissoes'],
    narracao: 'Vou comparar o early attrition de Produtos & Plataforma com 2024 e abrir por onboarding.',
    rodadas: [
      [comparar('early_attrition', { periodo: P12, filtros: PP }, { periodo: A2024, filtros: PP }), decompor('early_attrition', 'diretoria'), decompor('early_attrition', 'onboarding', P12, PP)],
      [drivers('early_attrition', P12, PP)],
    ],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r3' }, { resultado: 'r4' }],
    texto: texto(''),
    continuacoes: ['early-attrition-onboarding', 'resumo-custo-turnover-produtos'],
  },
  {
    id: 'historia-mobilidade-fr',
    grupo: 'historia',
    pergunta: 'A mobilidade interna ajuda a reter talentos em Financeiro & Risco?',
    recorte: { indicador: 'mobilidade_interna', periodo: P12, filtros: FR, lente: 'chro' },
    indicadores: ['mobilidade_interna', 'preenchimento_interno', 'turnover_voluntario'],
    narracao: 'Vou levantar mobilidade, preenchimento interno e turnover de Financeiro & Risco e abrir as saídas por movimentação.',
    rodadas: [
      [valor('mobilidade_interna', P12, FR), valor('preenchimento_interno', P12, FR), valor('turnover', P12, FR), decompor('turnover_voluntario', 'mobilidadeRecente', JANELA, FR)],
      [drivers('turnover_voluntario', JANELA, FR)],
    ],
    mostrar: [{ resultado: 'r4' }, { resultado: 'r5' }],
    texto: texto(''),
    continuacoes: ['mobilidade-interna-retencao', 'resumo-mobilidade-fr-replicar'],
  },
];

export { A2025 };
