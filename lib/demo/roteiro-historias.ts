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
/** a partir da mudança de patamar do turnover voluntário de Operações (o detector marca Jun/25), com folga */
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
    texto: texto(
      'Tecnologia perde justamente quem queria manter: o **turnover lamentado chegou a 36,7% a.a.**, fora da meta de 15% (acima), 2,45 vezes a meta.',
      '',
      '- **Contra as outras diretorias:** a empresa toda tem 22,5% a.a.; Tecnologia concentra 45,1% das saídas lamentadas e tem 3,93 vezes a taxa de Financeiro & Risco.',
      '- **O que mudou:** o turnover voluntário de Tecnologia subiu de 20,7% a.a. em 2024 para 29,8% a.a. em 2025 (+44,1%).',
      '- **Associação com salário:** no piso da faixa, o turnover é de 57,6% a.a.; no teto, 13,8% (4,17 vezes menos).',
      '- **Quem sai:** os maiores fatores de risco são ser detrator no eNPS (65,8% a.a., lift 1,79) e estar no piso da faixa (62,8% a.a., lift 1,71).',
      '- **O que fazer:** testar o reposicionamento na faixa de quem tem boa performance e está no piso ou no Q1, e acompanhar se as saídas caem.',
    ),
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
    texto: texto(
      'Janeiro concentra as saídas nas duas pontas, desligamentos e pedidos de demissão: o turnover de Distribuição & Assessoria chegou a **95,8% a.a. em Jan/26**.',
      '',
      '- **Padrão:** o pico se repete (90,2% em Jan/24 e 86,3% em Jan/25); nos demais meses, a taxa fica entre 15,1% e 27,1% a.a.',
      '- **Corte:** no involuntário de Jan/26, quem tinha avaliação abaixo do esperado saiu a uma taxa anualizada de 380,5%, 34,88 vezes a de quem estava acima (10,9%).',
      '- **Pedidos de demissão:** o voluntário de janeiro também cresce, de 28,0% a.a. em Jan/24 para 40,2% em Jan/26.',
      '- **Custo:** só Jan/26 custou R$ 4.636.200, 4,6× a mediana dos 12 meses anteriores.',
      '- **O que fazer:** investigar o que concentra as saídas em janeiro (o calendário de metas e de bônus é a primeira hipótese a checar) e planejar a reposição antes do mês.',
    ),
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
    texto: texto(
      'O turnover de Operações subiu de 15,9% a.a. em 2024 para **23,2% a.a. nos últimos 12 meses** (+45,3%), ainda dentro da meta, mas em escalada.',
      '',
      '- **Quem trocou de gestor sai mais:** de Mai/25 a Set/26, quem trocou de gestor 2 ou mais vezes saiu a 23,9% a.a., contra 14,8% de quem não trocou (1,62 vezes).',
      '- **Clima:** os detratores do eNPS saem a 24,9% a.a., contra 5,8% dos promotores, e respondem por 71,6% das saídas voluntárias.',
      '- **Combinação mais arriscada:** detratores de 35 a 44 anos, com 33,0% a.a. (lift 1,93).',
      '- **O que fazer:** evitar novas trocas de gestor, dar estabilidade às lideranças e montar plano de ação com os detratores.',
    ),
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
    texto: texto(
      'Sim, segundo o detector: o eNPS de Operações despencou de +17,7 no 4T24 para **−47,4 no 1T25**, e o turnover voluntário só mudou de patamar em Jun/25, 3 meses depois.',
      '',
      '- **Antes:** de 4T23 a 4T24 o eNPS ficava entre +14,9 e +20,4, perto da meta de +20.',
      '- **Mudança de patamar:** o detector aponta o eNPS caindo em Mar/25 (média de +18 para -43) e o turnover voluntário subindo de 10,8% a.a. para 17,6% a.a.',
      '- **Hoje:** o eNPS segue em −37,9 no 3T26, e o voluntário fechou Set/26 em 18,5% a.a., contra 6,7% em Out/24.',
      '- **Leitura:** o detector marca o eNPS como indicador antecedente do turnover voluntário: a queda do clima apareceu 3 meses antes da alta das saídas.',
      '- **O que fazer:** tratar cada queda de patamar do eNPS como alerta de turnover e agir na diretoria antes do ciclo seguinte.',
    ),
    continuacoes: ['enps-saidas', 'historia-operacoes'],
  },
  {
    id: 'historia-vagas-tecnologia',
    grupo: 'historia',
    pergunta: 'Por que as horas extras de Tecnologia subiram?',
    recorte: { indicador: 'horas_extras_pc', periodo: P12, filtros: TEC, lente: 'chro' },
    indicadores: ['vagas_abertas', 'time_to_fill', 'horas_extras_pc', 'absenteismo'],
    narracao: 'Vou cruzar vagas abertas, horas extras e ausências de Tecnologia e estimar o custo.',
    rodadas: [[sinais(P24, 'Tecnologia'), serie('vagas_abertas', { inicio: '2024-01', fim: '2025-12' }, TEC), valor('horas_extras_pc', P12, TEC), valor('absenteismo', P12, TEC), impacto('horas_extras_pc', P12, TEC)]],
    mostrar: [{ resultado: 'r2' }, { resultado: 'r5' }],
    texto: texto(
      'O detector liga as horas extras às vagas abertas: as vagas de Tecnologia mudaram de patamar em Set/24 (média de 62 para 133) e as **horas extras subiram de 5,5 para 9,9 h/pessoa/mês** um mês depois.',
      '',
      '- **Vagas:** de 59 em Jan/24 para o máximo de 150 em Mai/25; ainda eram 140 em Dez/25.',
      '- **Junto com as vagas:** de Out/24 a Set/26, o time to fill de Tecnologia foi de 86 dias, contra 38 dias da mediana das outras diretorias, e o turnover lamentado chegou a 43,1% a.a.',
      '- **Hoje:** 9,56 h/pessoa/mês nos últimos 12 meses, fora da meta de 8 (acima), a um custo de R$ 12,6 mi, cerca de R$ 1,05 mi por mês.',
      '- **Desgaste:** as horas extras antecedem ausências no mês seguinte (correlação r = 0,76 com 1 mês de defasagem); o absenteísmo está em 3,96%, fora da meta de 3% (acima).',
      '- **O que fazer:** acelerar as contratações de Tecnologia e acompanhar se as horas extras e as ausências caem junto com as vagas.',
    ),
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
    texto: texto(
      'Os dados apontam a passagem para a gerência: as mulheres são 44,9% do quadro, mas só **28,4% da liderança**, fora da meta de 40% (abaixo).',
      '',
      '- **Pleno para sênior:** a promoção é igual para os dois gêneros (8,56% a.a. das mulheres e 8,59% dos homens, de Out/23 a Set/26).',
      '- **Sênior para gerência:** os homens são promovidos a 5,33% a.a.; as mulheres, a 2,52%: 2,11 vezes menos.',
      '- **Leitura:** a diferença aparece na promoção de sênior para gerência, não antes.',
      '- **O que fazer:** revisar os critérios da seleção interna para gerência, montar painéis de avaliação diversos e acompanhar a taxa de promoção por gênero a cada ciclo.',
    ),
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
    texto: texto(
      'O early attrition de Produtos & Plataforma saltou de 17,6% a.a. em 2024 para **53,9% a.a. nos últimos 12 meses** (3,06 vezes), o maior da empresa.',
      '',
      '- **Contra as outras:** a empresa toda tem 33,6% a.a.; Gente, a menor taxa, tem 10,9% (4,93 vezes menos).',
      '- **Onboarding:** quem entrou sem a trilha completa sai a 65,0% a.a. no primeiro ano, contra 16,1% de quem completou (4,04 vezes); 93,2% dessas saídas vieram de quem não completou.',
      '- **Fatores:** Q1 da faixa (90,8% a.a., lift 1,68) e detratores no eNPS (85,0% a.a., lift 1,58) pesam; o onboarding completo é o maior fator de proteção (lift 0,3).',
      '- **O que fazer:** tornar a trilha de onboarding obrigatória antes de abrir novas turmas.',
    ),
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
      [drivers('turnover_voluntario', JANELA, FR), decompor('turnover_voluntario', 'mobilidadeRecente', P12, FR)],
    ],
    mostrar: [{ resultado: 'r4' }, { resultado: 'r6' }],
    texto: texto(
      'Na janela inteira, sim; nos últimos 12 meses, não. De Out/23 a Set/26, quem tinha se movimentado em Financeiro & Risco pediu demissão a **4,9% a.a.**, contra 9,75% de quem não tinha (1,99 vezes mais).',
      '',
      '- **Últimos 12 meses:** o efeito se inverteu: quem se movimentou saiu a 9,98% a.a., contra 7,62% de quem não se movimentou.',
      '- **Movimentação:** a mobilidade interna está em 13,2% a.a., dentro da meta de 6% (2,21 vezes a meta), e 37,6% das vagas são preenchidas por gente de dentro, dentro da meta de 25%.',
      '- **Turnover da diretoria:** 13,1% a.a., dentro da meta de 24%.',
      '- **Fatores (janela inteira):** a mobilidade recente aparece entre os fatores de proteção (lift 0,54); o maior risco é estar no Q1 sem ter se movimentado (18,4% a.a., lift 2,05).',
      '- **O que fazer:** entender por que quem se movimentou no último ano voltou a sair antes de levar a rotação para outras diretorias.',
    ),
    continuacoes: ['mobilidade-interna-retencao', 'resumo-mobilidade-fr-replicar'],
  },
];
