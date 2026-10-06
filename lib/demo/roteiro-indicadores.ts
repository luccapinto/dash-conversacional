/**
 * Roteiro dos 25 indicadores do painel, duas perguntas cada: a do botão ✦ ("O que influenciou o
 * resultado de …?", com valor, série de 24 meses e quebra por diretoria na 1ª rodada) e uma segunda,
 * específica do indicador. Empresa toda, Out/25–Set/26. Os textos foram escritos depois de ler os
 * resultados das consultas (npm run gravar-demo -- --resultados).
 */

import { CATALOGO, type IdIndicador } from '@/lib/analytics/catalog';
import { nomeNaFrase } from '@/lib/ia/pedidos';
import { comparar, decompor, drivers, impacto, mes, P12, P12_ANTERIOR, P24, serie, sinais, valor } from './consultas';
import type { Consulta, EntradaRoteiro } from './gravar';

const SET26 = mes('2026-09');
const SET25 = mes('2025-09');
const OUT24 = mes('2024-10');
const TEC = { diretoria: 'Tecnologia' };

interface Influencia {
  narracao?: string;
  /** 2ª rodada (drivers, impacto, outra quebra) */
  extras?: Consulta[];
  mostrar?: EntradaRoteiro['mostrar'];
  texto: string;
  continuacoes: string[];
}

const id = (indicador: IdIndicador) => indicador.replace(/_/g, '-');

function influencia(indicador: IdIndicador, s: Influencia): EntradaRoteiro {
  const ind = CATALOGO[indicador];
  return {
    id: id(indicador),
    grupo: 'influencia',
    pergunta: `O que influenciou o resultado de ${nomeNaFrase(ind.nome)}?`,
    recorte: { indicador, periodo: P12, lente: 'chro' },
    narracao: s.narracao ?? 'Vou levantar o resultado contra a meta, a evolução em 24 meses e onde se concentra.',
    rodadas: [
      [valor(indicador), serie(indicador, P24, undefined, ind.granularidade === 'trimestral' ? 'trimestre' : undefined), decompor(indicador, 'diretoria')],
      ...(s.extras?.length ? [s.extras] : []),
    ],
    mostrar: s.mostrar ?? [{ resultado: 'r2' }, { resultado: 'r3' }],
    texto: s.texto,
    continuacoes: s.continuacoes,
  };
}

function segunda(indicador: IdIndicador, sufixo: string, e: Omit<EntradaRoteiro, 'id' | 'grupo' | 'recorte'> & { recorte?: EntradaRoteiro['recorte'] }): EntradaRoteiro {
  return { id: `${id(indicador)}-${sufixo}`, grupo: 'indicador', recorte: { indicador, periodo: P12, lente: 'chro' }, ...e };
}

const texto = (...linhas: string[]) => linhas.join('\n');

export const ROTEIRO_INDICADORES: EntradaRoteiro[] = [
  // ── Força de trabalho ───────────────────────────────────────────────────────
  influencia('headcount', {
    extras: [valor('admissoes'), valor('turnover')],
    texto: texto(
      'O quadro fechou Set/26 com **4.972 pessoas**, 371 a mais que em Out/24 (+8,1%).',
      '',
      '- **O que aconteceu:** crescimento quase contínuo; os recuos maiores vêm em janeiro (de 4.875 em Dez/25 para 4.817 em Jan/26). O headcount não tem meta.',
      '- **Onde se concentra:** Tecnologia tem 1.367 pessoas, 27,5% do quadro; Gente, a menor diretoria, tem 391.',
      '- **Entradas e saídas:** nos últimos 12 meses entraram 1.380 pessoas e saíram 1.216, com turnover de 24,9% a.a., acima da meta, em atenção.',
      '- **O que fazer:** planejar o crescimento junto com a retenção: cada saída evitada é uma contratação a menos.',
    ),
    continuacoes: ['headcount-diretorias', 'admissoes'],
  }),
  segunda('headcount', 'diretorias', {
    pergunta: 'Quais diretorias mais cresceram em quadro no último ano?',
    narracao: 'Vou comparar o quadro de Set/26 com o de Set/25, na empresa e por diretoria.',
    rodadas: [[comparar('headcount', { periodo: SET26 }, { periodo: SET25 }), decompor('headcount', 'diretoria', SET25), decompor('headcount', 'diretoria', SET26)]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r3' }],
    texto: texto(
      'Em 12 meses o quadro cresceu **164 pessoas (+3,4%)**, de 4.808 em Set/25 para 4.972 em Set/26.',
      '',
      '- **Onde:** Tecnologia passou de 1.294 para 1.367 pessoas e Produtos & Plataforma, de 613 para 660. Foram as que mais cresceram.',
      '- **Peso no quadro:** Tecnologia foi de 26,9% para 27,5% do total; Produtos & Plataforma, de 12,8% para 13,3%.',
      '- **Demais diretorias:** Distribuição & Assessoria foi de 1.011 para 1.029, Operações de 899 para 910, Financeiro & Risco de 604 para 615 e Gente de 387 para 391.',
      '- **O que fazer:** concentrar onboarding e plano de retenção em Tecnologia e Produtos & Plataforma, onde o quadro mais cresce.',
    ),
    continuacoes: ['headcount', 'admissoes-ritmo'],
  }),
  influencia('admissoes', {
    extras: [decompor('admissoes', 'senioridade')],
    texto: texto(
      'A empresa contratou **1.380 pessoas** de Out/25 a Set/26, com pico de 140 admissões em Mar/26.',
      '',
      '- **O que aconteceu:** a média do período é de 112,8 admissões por mês; em Set/26 foram 116.',
      '- **Onde se concentra:** Tecnologia respondeu por 479 admissões (34,7%), seguida de Distribuição & Assessoria (283) e Produtos & Plataforma (237).',
      '- **Perfil:** pleno (509) e sênior (486) lideram; gerência teve 46. No nível diretoria, amostra insuficiente (menos de 30 pessoas) — valor não divulgado.',
      '- **O que fazer:** acompanhar o early attrition dessas turmas: quem entra sem onboarding completo sai mais no primeiro ano.',
    ),
    continuacoes: ['admissoes-ritmo', 'historia-onboarding-produtos'],
  }),
  segunda('admissoes', 'ritmo', {
    pergunta: 'As contratações aceleraram em relação ao ano anterior?',
    narracao: 'Vou comparar as admissões dos últimos 12 meses com as dos 12 anteriores.',
    rodadas: [[comparar('admissoes', { periodo: P12 }, { periodo: P12_ANTERIOR }), comparar('admissoes', { periodo: P12, filtros: TEC }, { periodo: P12_ANTERIOR, filtros: TEC }), comparar('admissoes', { periodo: P12, filtros: { diretoria: 'Produtos & Plataforma' } }, { periodo: P12_ANTERIOR, filtros: { diretoria: 'Produtos & Plataforma' } })]],
    mostrar: [{ resultado: 'r1' }],
    texto: texto(
      'As contratações cresceram pouco: **1.380 admissões** nos últimos 12 meses, contra 1.328 nos 12 anteriores (+3,9%).',
      '',
      '- **Tecnologia:** 479 contra 451 (+28, ou +6,2%).',
      '- **Produtos & Plataforma:** desacelerou, com 237 contra 261 (−9,2%).',
      '- **Leitura:** o ritmo da empresa ficou estável; o que mudou foi a mistura entre as diretorias.',
      '- **O que fazer:** antes de reabrir vagas em Produtos & Plataforma, olhar o early attrition das turmas recentes.',
    ),
    continuacoes: ['admissoes', 'early-attrition'],
  }),
  influencia('span_controle', {
    extras: [comparar('span_controle', { periodo: SET26 }, { periodo: SET25 })],
    texto: texto(
      'Cada gestor lidera em média **9,5 pessoas** em Set/26, praticamente o mesmo de Set/25 (9,49).',
      '',
      '- **O que aconteceu:** o indicador ficou entre 9,4 e 9,7 desde Out/24; o número de gestores foi de 506 para 521, acompanhando o quadro.',
      '- **Onde se concentra:** Operações (11,7) e Distribuição & Assessoria (11,3) têm os maiores times; Financeiro & Risco tem o menor (8,2). A razão entre o maior e o menor é de 1,42×.',
      '- **Leitura:** o span of control não tem meta e está estável; a diferença é estrutural, entre diretorias.',
      '- **O que fazer:** acompanhar o clima nos times maiores, onde cada gestor tem mais gente para desenvolver.',
    ),
    continuacoes: ['span-controle-saidas', 'headcount'],
  }),
  segunda('span_controle', 'saidas', {
    pergunta: 'Os times maiores perdem mais gente?',
    narracao: 'Vou colocar lado a lado o span of control e o turnover voluntário de cada diretoria.',
    rodadas: [[decompor('span_controle', 'diretoria'), decompor('turnover_voluntario', 'diretoria')]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r2' }],
    texto: texto(
      'Não há relação clara: **Tecnologia**, com 8,6 liderados por gestor, tem o maior turnover voluntário, **26,7% a.a.**',
      '',
      '- **Times maiores:** Operações (11,7) e Distribuição & Assessoria (11,3) têm turnover voluntário de cerca de 17% a.a., abaixo da empresa (18,8%).',
      '- **Times menores:** Financeiro & Risco (8,2) e Gente (8,3) têm as menores taxas, 8,0% e 8,8% a.a.',
      '- **Leitura:** o span vai de 8,2 a 11,7 entre as diretorias e não separa quem perde mais gente.',
      '- **O que fazer:** procurar a causa nos fatores de risco do turnover voluntário antes de mexer na estrutura de gestão.',
    ),
    continuacoes: ['span-controle', 'historia-fuga-tecnologia'],
  }),

  // ── Retenção ────────────────────────────────────────────────────────────────
  influencia('turnover', {
    extras: [drivers('turnover'), impacto('turnover')],
    mostrar: [{ resultado: 'r2' }, { resultado: 'r3' }, { resultado: 'r4' }],
    texto: texto(
      'O turnover total fechou em **24,9% a.a.** nos últimos 12 meses, acima da meta de 24%, em atenção, com 1.216 saídas.',
      '',
      '- **O que aconteceu:** os picos são de janeiro (37,7% em Jan/26 e 35,6% em Jan/25); no resto do ano a taxa oscila perto da meta.',
      '- **Onde se concentra:** Tecnologia (31,0%) e Produtos & Plataforma (29,6%) lideram; Tecnologia responde por 33,9% das saídas.',
      '- **Fatores associados:** avaliação abaixo do esperado (lift 2,35), onboarding incompleto (1,76) e piso da faixa salarial (1,73) são os maiores fatores de risco.',
      '- **Quanto custa:** R$ 82,5 mi no período, cerca de R$ 6,9 mi por mês.',
      '- **O que fazer:** revisar os pisos da faixa salarial e garantir onboarding completo para quem entra.',
    ),
    continuacoes: ['turnover-ano', 'historia-janeiro-da'],
  }),
  segunda('turnover', 'ano', {
    pergunta: 'O turnover de 2026 está melhor ou pior que o de 2025?',
    narracao: 'Vou comparar Jan–Set/26 com Jan–Set/25 no turnover total, voluntário e involuntário.',
    rodadas: [[
      comparar('turnover', { periodo: { inicio: '2026-01', fim: '2026-09' } }, { periodo: { inicio: '2025-01', fim: '2025-09' } }),
      comparar('turnover_voluntario', { periodo: { inicio: '2026-01', fim: '2026-09' } }, { periodo: { inicio: '2025-01', fim: '2025-09' } }),
      comparar('turnover_involuntario', { periodo: { inicio: '2026-01', fim: '2026-09' } }, { periodo: { inicio: '2025-01', fim: '2025-09' } }),
    ]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r2' }],
    texto: texto(
      'Praticamente igual: o turnover total de Jan–Set/26 é **24,9% a.a.**, contra 24,8% no mesmo período de 2025, os dois acima da meta, em atenção.',
      '',
      '- **Voluntário:** caiu de 18,7% para 18,4% a.a. (−0,31 p.p.), mas segue fora da meta.',
      '- **Involuntário:** subiu de 6,1% para 6,6% a.a. (+0,42 p.p.).',
      '- **Leitura:** a pequena melhora nas saídas por vontade própria foi compensada pelos desligamentos feitos pela empresa.',
      '- **O que fazer:** manter as ações de retenção e entender onde cresceram os desligamentos involuntários.',
    ),
    continuacoes: ['turnover', 'historia-operacoes'],
  }),
  influencia('turnover_voluntario', {
    extras: [drivers('turnover_voluntario')],
    mostrar: [{ resultado: 'r2' }, { resultado: 'r3' }, { resultado: 'r4' }],
    texto: texto(
      'O turnover voluntário ficou em **18,8% a.a.**, fora da meta de 16% (acima), com 918 pedidos de demissão em 12 meses.',
      '',
      '- **O que aconteceu:** a taxa saiu de 13,6% em Out/24, passou de 20% em vários meses (o maior, 22,16% em Abr/25) e fechou Set/26 em 16,3%.',
      '- **Onde se concentra:** Tecnologia (26,7%) e Produtos & Plataforma (24,1%); só Tecnologia responde por 38,7% das saídas voluntárias.',
      '- **Fatores associados:** onboarding incompleto (lift 1,95), piso da faixa salarial (1,8), Engenharia de Dados & Analytics (1,61), eNPS detrator (1,6) e 2+ trocas de gestor (1,55) são os maiores fatores de risco; o teto da faixa é fator de proteção (0,35).',
      '- **O que fazer:** revisar os pisos da faixa salarial, a começar por Tecnologia, garantir onboarding completo e estabilizar a gestão dos times com trocas frequentes.',
    ),
    continuacoes: ['turnover-voluntario-custo', 'historia-fuga-tecnologia'],
  }),
  segunda('turnover_voluntario', 'custo', {
    pergunta: 'Quanto custa o turnover voluntário e em que faixa salarial ele se concentra?',
    narracao: 'Vou estimar o custo das saídas voluntárias e abrir a taxa por faixa salarial.',
    rodadas: [[impacto('turnover_voluntario'), decompor('turnover_voluntario', 'faixaSalarial'), valor('turnover_voluntario')]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r2' }],
    texto: texto(
      'O turnover voluntário custou **R$ 62,4 mi** nos últimos 12 meses, cerca de R$ 5,2 mi por mês.',
      '',
      '- **Onde se concentra:** a taxa cai a cada degrau da faixa salarial: 33,8% a.a. no piso, 25,7% no Q1, 17,5% na mediana, 13,3% no Q3 e 6,7% no teto.',
      '- **Leitura:** quem está no piso sai 5,08 vezes mais que quem está no teto, e o Q1 sozinho responde por 32,1% das saídas voluntárias.',
      '- **Contra a meta:** a taxa total é de 18,8% a.a., fora da meta (acima).',
      '- **O que fazer:** revisar o posicionamento salarial de quem está no piso e no Q1, começando pelas áreas com mais saídas.',
    ),
    continuacoes: ['turnover-voluntario', 'historia-fuga-tecnologia'],
  }),
  influencia('turnover_involuntario', {
    extras: [drivers('turnover_involuntario')],
    mostrar: [{ resultado: 'r2' }, { resultado: 'r3' }, { resultado: 'r4' }],
    texto: texto(
      'O turnover involuntário foi de **6,1% a.a.** nos últimos 12 meses, com 298 desligamentos; o indicador não tem meta.',
      '',
      '- **O que aconteceu:** fora de janeiro, a taxa oscila entre 3,61% e 7,09%; em janeiro ela salta: 16,4% em Jan/25 e 16,3% em Jan/26.',
      '- **Onde se concentra:** Distribuição & Assessoria tem a maior taxa (9,3%) e 31,5% dos desligamentos.',
      '- **Fatores associados:** avaliação abaixo do esperado é o fator de risco dominante (33,3% a.a., lift 5,45); com avaliação acima, quase ninguém é desligado (0,87%).',
      '- **O que fazer:** tratar a baixa performance ao longo do ano, com plano de desenvolvimento, em vez de concentrar os desligamentos em janeiro.',
    ),
    continuacoes: ['turnover-involuntario-janeiro', 'historia-janeiro-da'],
  }),
  segunda('turnover_involuntario', 'janeiro', {
    pergunta: 'Quanto pesa o corte de janeiro no turnover involuntário?',
    narracao: 'Vou comparar Jan/26 com os 12 meses e ver onde o corte se concentrou.',
    rodadas: [[comparar('turnover_involuntario', { periodo: mes('2026-01') }, { periodo: P12 }), decompor('turnover_involuntario', 'diretoria', mes('2026-01')), impacto('turnover_involuntario')]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r2' }],
    texto: texto(
      'Janeiro pesa muito: em Jan/26 o turnover involuntário foi de **16,3% a.a.**, 2,66 vezes a taxa dos 12 meses (6,1%).',
      '',
      '- **Onde:** Distribuição & Assessoria concentrou 71,2% dos desligamentos do mês, com taxa anualizada de 55,6%.',
      '- **Demais diretorias:** ficaram entre 1,95% (Financeiro & Risco) e 9,25% (Gente) em janeiro.',
      '- **Quanto custa:** os desligamentos involuntários custaram R$ 20,1 mi em 12 meses, média de R$ 1,7 mi por mês.',
      '- **O que fazer:** em Distribuição & Assessoria, trocar o corte anual por acompanhamento de performance ao longo do ano.',
    ),
    continuacoes: ['turnover-involuntario', 'historia-janeiro-da'],
  }),
  influencia('early_attrition', {
    extras: [drivers('early_attrition')],
    mostrar: [{ resultado: 'r2' }, { resultado: 'r3' }, { resultado: 'r4' }],
    texto: texto(
      'O early attrition chegou a **33,6% a.a.**, fora da meta de 30% (acima): 386 pessoas saíram antes de completar um ano de casa.',
      '',
      '- **O que aconteceu:** subiu de 24,8% em Out/24 para 32,6% em Set/26, com pico de 46,9% em Jan/26.',
      '- **Onde se concentra:** Produtos & Plataforma tem 53,9% a.a., 4,93 vezes a taxa de Gente (10,9%), e 30,6% dessas saídas.',
      '- **Fatores associados:** onboarding incompleto (67,2% a.a.) e avaliação abaixo do esperado (lift 1,98) são os maiores fatores de risco; eNPS promotor é fator de proteção (0,68).',
      '- **O que fazer:** tornar o onboarding completo obrigatório para toda contratação, começando por Produtos & Plataforma.',
    ),
    continuacoes: ['early-attrition-onboarding', 'historia-onboarding-produtos'],
  }),
  segunda('early_attrition', 'onboarding', {
    pergunta: 'Quanto o onboarding pesa na saída no primeiro ano?',
    narracao: 'Vou abrir o early attrition por onboarding e estimar o custo dessas saídas.',
    rodadas: [[decompor('early_attrition', 'onboarding'), impacto('early_attrition'), valor('early_attrition')]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r2' }],
    texto: texto(
      'Muito: quem entra sem onboarding completo sai no primeiro ano a **67,2% a.a.**, contra 24,2% de quem fez a trilha inteira (2,78 vezes).',
      '',
      '- **Peso nas saídas:** quem não completou o onboarding é 21,9% dos recém-chegados, mas 43,8% das saídas no primeiro ano.',
      '- **Contra a meta:** com onboarding completo a taxa fica abaixo da meta de 30%; no total, o early attrition está em 33,6%, fora da meta (acima).',
      '- **Quanto custa:** as saídas no primeiro ano custaram R$ 25,5 mi em 12 meses, cerca de R$ 2,1 mi por mês.',
      '- **O que fazer:** condicionar a data de início à trilha de onboarding e medir a conclusão por gestor.',
    ),
    continuacoes: ['early-attrition', 'historia-onboarding-produtos'],
  }),

  // ── Atração ─────────────────────────────────────────────────────────────────
  influencia('vagas_abertas', {
    extras: [decompor('vagas_abertas', 'senioridade')],
    texto: texto(
      'A empresa fechou Set/26 com **293 vagas abertas**, acima das 238 de Out/24 e abaixo do pico de 372 em Jan/26.',
      '',
      '- **O que aconteceu:** o estoque subiu ao longo de 2025 e oscila perto de 300 desde então, com média de 309,5 no período.',
      '- **Onde se concentra:** Tecnologia tem 115 vagas, 39,3% do total; Financeiro & Risco (47), Distribuição & Assessoria (45) e Produtos & Plataforma (44) vêm depois.',
      '- **Perfil:** sênior concentra 126 vagas (43%), seguido de pleno (82) e júnior (68).',
      '- **O que fazer:** priorizar as vagas sênior e as de Tecnologia, que formam o grosso do estoque.',
    ),
    continuacoes: ['vagas-abertas-tecnologia', 'historia-vagas-tecnologia'],
  }),
  segunda('vagas_abertas', 'tecnologia', {
    pergunta: 'Por que Tecnologia concentra tantas vagas abertas?',
    narracao: 'Vou comparar as vagas de Tecnologia com o ano passado e ver prazo e aceite de oferta.',
    rodadas: [[comparar('vagas_abertas', { periodo: SET26, filtros: TEC }, { periodo: SET25, filtros: TEC }), valor('time_to_fill', P12, TEC), valor('aceite_oferta', P12, TEC), valor('time_to_fill'), valor('aceite_oferta')]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r2' }],
    texto: texto(
      'O estoque de Tecnologia até caiu, de 146 vagas em Set/25 para **115 em Set/26 (−21,2%)**, mas cada vaga demora a fechar.',
      '',
      '- **Prazo:** o time to fill de Tecnologia é de 87,5 dias, fora da meta de 45 (acima), 1,94 vez a meta; na empresa são 57,1 dias.',
      '- **Aceite:** só 67,8% das ofertas de Tecnologia são aceitas, fora da meta de 85% (abaixo); na empresa, 78,6%.',
      '- **Leitura:** com menos ofertas aceitas, a vaga volta ao mercado e o prazo se alonga.',
      '- **O que fazer:** revisar a competitividade das ofertas de Tecnologia e acompanhar as recusas por especialidade.',
    ),
    continuacoes: ['time-to-fill', 'historia-vagas-tecnologia'],
  }),
  influencia('time_to_fill', {
    extras: [comparar('time_to_fill', { periodo: P12 }, { periodo: P12_ANTERIOR }), valor('aceite_oferta')],
    texto: texto(
      'O time to fill está em **57,1 dias**, fora da meta de 45 (acima), e piorou contra os 12 meses anteriores (54,97 dias, +2,13).',
      '',
      '- **O que aconteceu:** o prazo subiu ao longo de 2025, chegou a 61,4 dias em Dez/25 e fechou Set/26 em 51,8.',
      '- **Onde se concentra:** Tecnologia leva 87,5 dias, 2,39 vezes o prazo de Gente (36,6); Produtos & Plataforma (48,6) vem depois, e as demais ficam perto de 39 dias.',
      '- **Junto com o prazo:** o aceite de oferta está em 78,6%, abaixo da meta, em atenção; cada recusa reabre o processo.',
      '- **O que fazer:** atacar Tecnologia primeiro, com oferta mais competitiva e funil de candidatos contínuo.',
    ),
    continuacoes: ['time-to-fill-senioridade', 'aceite-oferta'],
  }),
  segunda('time_to_fill', 'senioridade', {
    pergunta: 'Em que senioridade as vagas demoram mais a fechar?',
    narracao: 'Vou abrir o time to fill por senioridade e, em Tecnologia, por especialidade.',
    rodadas: [[decompor('time_to_fill', 'senioridade'), decompor('time_to_fill', 'especialidade', P12, TEC)]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r2', tipo: 'tabela' }],
    texto: texto(
      'A senioridade muda pouco o prazo: vai de **55,5 dias** no júnior a **60,8 dias** na gerência, razão de 1,1 entre o maior e o menor.',
      '',
      '- **Pleno e sênior:** 56,2 e 58,5 dias; todos os níveis estão acima da meta de 45.',
      '- **Onde está a diferença:** na área. Em Tecnologia, Segurança da Informação leva 96,3 dias; Engenharia de Software, 87,6; Engenharia de Dados & Analytics, 86,6; Infraestrutura & Cloud, 83,4.',
      '- **Leitura:** o prazo depende mais da diretoria e da especialidade que do nível do cargo.',
      '- **O que fazer:** em Tecnologia, manter pipeline contínuo e banco de talentos para Segurança da Informação e Engenharia.',
    ),
    continuacoes: ['time-to-fill', 'historia-vagas-tecnologia'],
  }),
  influencia('aceite_oferta', {
    extras: [decompor('aceite_oferta', 'senioridade')],
    texto: texto(
      'A taxa de aceite de oferta está em **78,6%**, abaixo da meta de 85%, em atenção.',
      '',
      '- **O que aconteceu:** era de 83,9% em Out/24; desde Mar/25 oscila entre 73% e 84%, e fechou Set/26 em 81,2%.',
      '- **Onde se concentra:** Tecnologia aceita só 67,8% das ofertas; Operações, Financeiro & Risco e Gente ficam entre 88,9% e 90,2%.',
      '- **Perfil:** a gerência aceita mais (84,8%) e o júnior, menos (76,2%).',
      '- **O que fazer:** em Tecnologia, revisar faixa e pacote da oferta e registrar o motivo de cada recusa.',
    ),
    continuacoes: ['aceite-oferta-tecnologia', 'historia-fuga-tecnologia'],
  }),
  segunda('aceite_oferta', 'tecnologia', {
    pergunta: 'Onde as ofertas de Tecnologia mais são recusadas?',
    narracao: 'Vou abrir o aceite de oferta de Tecnologia por especialidade e comparar com o ano anterior.',
    rodadas: [[decompor('aceite_oferta', 'especialidade', P12, TEC), comparar('aceite_oferta', { periodo: P12, filtros: TEC }, { periodo: P12_ANTERIOR, filtros: TEC })]],
    mostrar: [{ resultado: 'r1', tipo: 'tabela' }, { resultado: 'r2' }],
    texto: texto(
      'Segurança da Informação é onde as ofertas mais são recusadas: só **59,8%** são aceitas.',
      '',
      '- **Demais especialidades:** Engenharia de Software (69,4%), Infraestrutura & Cloud (68,9%) e Engenharia de Dados & Analytics (68,6%), todas longe da meta de 85%.',
      '- **Evolução:** o aceite de Tecnologia caiu de 70,5% para 67,8% contra os 12 meses anteriores (−2,67 p.p.) e está fora da meta (abaixo).',
      '- **Leitura:** o problema é de toda a diretoria, mais agudo em segurança.',
      '- **O que fazer:** comparar as ofertas recusadas com o mercado, começando por Segurança da Informação.',
    ),
    continuacoes: ['aceite-oferta', 'vagas-abertas-tecnologia'],
  }),
  influencia('preenchimento_interno', {
    extras: [comparar('preenchimento_interno', { periodo: P12 }, { periodo: P12_ANTERIOR })],
    texto: texto(
      'Só **13,4%** das vagas foram preenchidas com gente de dentro, fora da meta de 25% (abaixo); a razão contra a meta é de 0,54.',
      '',
      '- **O que aconteceu:** caiu de 17,5% nos 12 meses anteriores (−4,04 p.p.) e oscilou entre 9,7% e 22,5% desde Out/24.',
      '- **Onde se concentra:** Financeiro & Risco preenche 37,6% das vagas internamente, 4,25 vezes Produtos & Plataforma (8,9%).',
      '- **Nas demais:** fora de Financeiro & Risco, as diretorias ficam entre 8,9% e 13,3%: a contratação externa é o padrão.',
      '- **O que fazer:** abrir as vagas primeiro para candidatos internos e replicar a prática de Financeiro & Risco.',
    ),
    continuacoes: ['preenchimento-interno-senioridade', 'historia-mobilidade-fr'],
  }),
  segunda('preenchimento_interno', 'senioridade', {
    pergunta: 'Em que senioridade as vagas são preenchidas por gente de dentro?',
    narracao: 'Vou abrir o preenchimento interno por senioridade.',
    rodadas: [[decompor('preenchimento_interno', 'senioridade'), valor('preenchimento_interno')]],
    mostrar: [{ resultado: 'r1' }],
    texto: texto(
      'Na gerência: **51,6%** das vagas de gestão foram preenchidas internamente, 6,22 vezes a taxa de pleno (8,3%).',
      '',
      '- **Demais níveis:** sênior com 13,1% e júnior com 12,0%, abaixo do total de 13,4%.',
      '- **Leitura:** a empresa promove gente de dentro para liderar, mas contrata de fora para quase todo o resto.',
      '- **Contra a meta:** o total está fora da meta de 25% (abaixo).',
      '- **O que fazer:** abrir as vagas de pleno e sênior primeiro para quem já está na casa: é onde está o volume.',
    ),
    continuacoes: ['preenchimento-interno', 'mobilidade-interna'],
  }),
  influencia('custo_por_contratacao', {
    extras: [comparar('custo_por_contratacao', { periodo: P12 }, { periodo: P12_ANTERIOR })],
    texto: texto(
      'Cada contratação custou em média **R$ 8.631**, 5,9% a mais que nos 12 meses anteriores (R$ 8.148).',
      '',
      '- **O que aconteceu:** o custo mensal subiu de R$ 6.650 em Out/24 para R$ 9.171 em Set/26, com pico de R$ 10.050 em Mai/26.',
      '- **Onde se concentra:** Gente tem o maior custo (R$ 11.415), 1,58 vez o de Financeiro & Risco (R$ 7.233); Tecnologia fica em R$ 8.514.',
      '- **Leitura:** o indicador não tem meta, mas subiu contra os 12 meses anteriores e a série termina acima de onde começou.',
      '- **O que fazer:** abrir o custo por canal de recrutamento e dar prioridade a indicação e preenchimento interno.',
    ),
    continuacoes: ['custo-por-contratacao-senioridade', 'admissoes'],
  }),
  segunda('custo_por_contratacao', 'senioridade', {
    pergunta: 'Quanto custa contratar em cada senioridade?',
    narracao: 'Vou abrir o custo por contratação por senioridade.',
    rodadas: [[decompor('custo_por_contratacao', 'senioridade'), valor('custo_por_contratacao')]],
    mostrar: [{ resultado: 'r1' }],
    texto: texto(
      'Contratar um gestor custa **R$ 30.172**, 6,62 vezes o custo de um júnior (R$ 4.557).',
      '',
      '- **Sênior:** R$ 11.496 por contratação, e 46,7% de todo o gasto com contratação.',
      '- **Pleno:** R$ 4.884, perto do júnior.',
      '- **Leitura:** a média da empresa (R$ 8.631) é puxada pelas vagas sênior e de gerência.',
      '- **O que fazer:** priorizar sucessão interna para gerência e indicação para sênior, onde cada contratação externa pesa mais.',
    ),
    continuacoes: ['custo-por-contratacao', 'time-to-fill'],
  }),

  // ── Engajamento & bem-estar ─────────────────────────────────────────────────
  influencia('enps', {
    narracao: 'Vou levantar o eNPS contra a meta, os ciclos trimestrais e a quebra por diretoria.',
    extras: [decompor('enps', 'trocasGestor')],
    texto: texto(
      'O eNPS da empresa está em **+3,9 pontos**, fora da meta de +20 (abaixo), 16,1 pontos abaixo dela.',
      '',
      '- **O que aconteceu:** despencou de +13,9 no 4T24 para −2,5 no 1T25 e se recupera devagar: +4,0 no 3T26.',
      '- **Onde se concentra:** Operações está em −40,6 e Tecnologia, em +2,8. Gente (+22,7) e Distribuição & Assessoria (+20,7) estão acima da meta.',
      '- **Fatores associados:** o eNPS cai com as trocas de gestor: +9,4 sem troca, −5,6 com uma troca e −19,1 com duas ou mais.',
      '- **O que fazer:** estabilizar a gestão em Operações e reduzir as trocas de gestor nos próximos ciclos.',
    ),
    continuacoes: ['enps-saidas', 'historia-enps-operacoes'],
  }),
  segunda('enps', 'saidas', {
    pergunta: 'Quem dá nota baixa no eNPS sai mais?',
    narracao: 'Vou abrir o turnover voluntário pela resposta de eNPS de cada pessoa.',
    rodadas: [[decompor('turnover_voluntario', 'enps'), valor('turnover_voluntario')]],
    mostrar: [{ resultado: 'r1' }],
    texto: texto(
      'Sim: quem deu nota de detrator sai a **30,1% a.a.**, 2,97 vezes a taxa dos promotores (10,1%).',
      '',
      '- **Neutros:** 16,3% a.a.; quem não respondeu à pesquisa sai a 25,9%, perto dos detratores.',
      '- **Peso nas saídas:** os detratores respondem por 42,4% dos pedidos de demissão.',
      '- **Contra a meta:** o turnover voluntário total é de 18,8% a.a., fora da meta (acima).',
      '- **O que fazer:** usar o eNPS como alerta: conversa individual com detratores e com quem deixou de responder, logo depois de cada ciclo.',
    ),
    continuacoes: ['enps', 'historia-enps-operacoes'],
  }),
  influencia('absenteismo', {
    extras: [decompor('absenteismo', 'senioridade'), valor('horas_extras_pc', P12, TEC)],
    texto: texto(
      'O absenteísmo está em **3,27%**, acima da meta de 3%, em atenção.',
      '',
      '- **O que aconteceu:** subiu de 2,76% em Out/24 para um pico de 3,65% em Out/25 e fechou Set/26 em 3,07%.',
      '- **Onde se concentra:** Tecnologia tem a maior taxa (3,96%) e 32,9% das ausências; Gente tem a menor (2,03%). Entre os níveis, júnior (3,5%) lidera e gerência (1,99%) fica bem abaixo.',
      '- **Junto com as ausências:** Tecnologia também tem horas extras de 9,56 h/pessoa/mês, fora da meta (acima); a sobrecarga virar ausência é a hipótese a checar.',
      '- **O que fazer:** investigar a sobrecarga de Tecnologia, que aparece nas horas extras e pode estar por trás das ausências.',
    ),
    continuacoes: ['absenteismo-custo', 'historia-vagas-tecnologia'],
  }),
  segunda('absenteismo', 'custo', {
    pergunta: 'Quanto custa o absenteísmo?',
    narracao: 'Vou estimar o custo das ausências na empresa e em Tecnologia.',
    rodadas: [[impacto('absenteismo'), impacto('absenteismo', P12, TEC), valor('absenteismo')]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r2' }],
    texto: texto(
      'As ausências custaram **R$ 23,1 mi** nos últimos 12 meses, cerca de R$ 1,9 mi por mês.',
      '',
      '- **Tecnologia:** R$ 8,5 mi no período, ou R$ 706 mil por mês.',
      '- **Contra a meta:** o absenteísmo está em 3,27%, acima da meta, em atenção.',
      '- **Leitura:** é um custo recorrente, que se repete todo mês enquanto a taxa não voltar para a meta.',
      '- **O que fazer:** atacar as causas em Tecnologia (horas extras e vagas abertas) e acompanhar o custo mês a mês.',
    ),
    continuacoes: ['absenteismo', 'horas-extras-pc-custo'],
  }),
  influencia('horas_extras_pc', {
    extras: [decompor('horas_extras_pc', 'senioridade')],
    texto: texto(
      'As horas extras estão em **7,3 h/pessoa/mês**, dentro da meta, mas a média esconde Tecnologia.',
      '',
      '- **O que aconteceu:** subiram de 6,44 h em Out/24 para 8,72 h em Set/25 e voltaram a 7,44 h em Set/26.',
      '- **Onde se concentra:** Tecnologia faz 9,56 h por pessoa, 2,72 vezes Gente (3,52 h), e responde por 35,6% de todas as horas extras.',
      '- **Perfil:** júnior, pleno e sênior ficam perto de 8 h (8,23, 8,05 e 8,21); a gerência não registra horas extras.',
      '- **O que fazer:** em Tecnologia, tratar a origem da sobrecarga antes de só limitar as horas; a história das vagas abertas levanta a hipótese principal.',
    ),
    continuacoes: ['horas-extras-pc-custo', 'historia-vagas-tecnologia'],
  }),
  segunda('horas_extras_pc', 'custo', {
    pergunta: 'Quanto custam as horas extras e onde se concentram?',
    narracao: 'Vou estimar o custo das horas extras na empresa e em Tecnologia.',
    rodadas: [[impacto('horas_extras_pc'), impacto('horas_extras_pc', P12, TEC), valor('horas_extras_pc', P12, TEC)]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r2' }],
    texto: texto(
      'As horas extras custaram **R$ 32,0 mi** nos últimos 12 meses, cerca de R$ 2,7 mi por mês.',
      '',
      '- **Tecnologia:** R$ 12,6 mi no período, ou R$ 1,05 mi por mês, com 9,56 h/pessoa/mês, fora da meta (acima).',
      '- **Leitura:** em Tecnologia a razão contra a meta é de 1,2; cada hora acima dela vira custo recorrente.',
      '- **O que fazer:** reduzir a dependência de horas extras em Tecnologia acelerando o preenchimento das vagas abertas.',
    ),
    continuacoes: ['horas-extras-pc', 'historia-vagas-tecnologia'],
  }),

  // ── Desenvolvimento ─────────────────────────────────────────────────────────
  influencia('taxa_promocao', {
    extras: [drivers('taxa_promocao')],
    mostrar: [{ resultado: 'r2' }, { resultado: 'r3' }, { resultado: 'r4' }],
    texto: texto(
      'A taxa de promoção foi de **6,3% a.a.**, fora da meta de 8% (abaixo), com 308 promoções em 12 meses.',
      '',
      '- **O que aconteceu:** as promoções saem nos ciclos de março e setembro: 33,1% a.a. em Mar/26 e 32,3% em Set/26; nos outros meses, entre 0,49% e 1,94%.',
      '- **Onde se concentra:** Operações (7,5%) e Distribuição & Assessoria (7,4%) promovem mais; Financeiro & Risco, menos (4,4%).',
      '- **Fatores associados:** júnior (lift 1,92), avaliação acima do esperado (1,76) e 1 a 3 anos de casa (1,67) se associam a mais promoção; na gerência não houve promoção no período.',
      '- **O que fazer:** revisar a régua dos ciclos para quem já é sênior e manter o reconhecimento de quem tem avaliação acima entre um ciclo e outro.',
    ),
    continuacoes: ['taxa-promocao-perfil', 'historia-teto-de-vidro'],
  }),
  segunda('taxa_promocao', 'perfil', {
    pergunta: 'Em que senioridade e performance as promoções se concentram?',
    narracao: 'Vou abrir a taxa de promoção por senioridade e por avaliação de performance.',
    rodadas: [[decompor('taxa_promocao', 'senioridade'), decompor('taxa_promocao', 'performance')]],
    mostrar: [{ resultado: 'r2' }],
    texto: texto(
      'As promoções se concentram no início da carreira: **12,1% a.a.** no júnior e 8,2% no pleno, contra 2,9% no sênior.',
      '',
      '- **Gerência:** nenhuma promoção no período. No nível diretoria, amostra insuficiente (menos de 30 pessoas) — valor não divulgado.',
      '- **Performance:** quem tem avaliação acima do esperado é promovido a 11,1% a.a., contra 4,5% de quem está dentro; abaixo do esperado, ninguém.',
      '- **Peso:** o pleno responde por 46,8% das promoções; a avaliação acima, por 53,6%.',
      '- **O que fazer:** abrir caminho para o sênior, na gestão ou numa carreira de especialista: é onde a promoção mais trava.',
    ),
    continuacoes: ['taxa-promocao', 'historia-teto-de-vidro'],
  }),
  influencia('mobilidade_interna', {
    extras: [drivers('mobilidade_interna')],
    texto: texto(
      'A mobilidade interna foi de **3,95% a.a.**, fora da meta de 6% (abaixo), com 193 movimentações em 12 meses.',
      '',
      '- **O que aconteceu:** chegou a 6,84% em Ago/25, acima da meta, e desde então ficou abaixo dela; em Set/26, 4,13%.',
      '- **Onde se concentra:** Financeiro & Risco (13,2%) responde por 42,0% das movimentações; Operações tem a menor taxa (1,99%), 6,64 vezes menos.',
      '- **Fatores associados:** as especialidades de Financeiro & Risco lideram, como Controladoria & FP&A (lift 3,93) e Tesouraria (3,38); ter de 3 a 5 anos de casa também se associa a mais movimentação (1,7).',
      '- **O que fazer:** levar a prática de movimentação de Financeiro & Risco às outras diretorias, começando por Operações.',
    ),
    continuacoes: ['mobilidade-interna-retencao', 'historia-mobilidade-fr'],
  }),
  segunda('mobilidade_interna', 'retencao', {
    pergunta: 'A mobilidade interna reduz o turnover voluntário?',
    narracao: 'Vou abrir o turnover voluntário entre quem se movimentou e quem não se movimentou.',
    rodadas: [[decompor('turnover_voluntario', 'mobilidadeRecente'), valor('mobilidade_interna')]],
    mostrar: [{ resultado: 'r1' }],
    texto: texto(
      'A mobilidade está associada a menos pedidos de demissão: quem se movimentou ou foi promovido nos últimos 12 meses sai a **11,7% a.a.**, contra 19,6% de quem ficou na mesma posição.',
      '',
      '- **Diferença:** quem não se movimentou sai 1,67 vez mais.',
      '- **Peso:** quem se movimentou responde por só 6,5% das saídas voluntárias.',
      '- **Contra a meta:** a mobilidade está em 3,95% a.a., fora da meta de 6% (abaixo): pouca gente está no grupo que sai menos.',
      '- **O que fazer:** testar a movimentação interna como ferramenta de retenção nas áreas com maior turnover voluntário e medir quem fica no ano seguinte.',
    ),
    continuacoes: ['mobilidade-interna', 'historia-mobilidade-fr'],
  }),

  // ── Diversidade & equidade ──────────────────────────────────────────────────
  influencia('mulheres', {
    extras: [decompor('mulheres', 'senioridade')],
    texto: texto(
      'As mulheres são **44,9% do quadro** em Set/26, abaixo dos 46,6% de Out/24 (−1,75 p.p.).',
      '',
      '- **O que aconteceu:** queda lenta e contínua desde o pico de 46,8% em Dez/24; o indicador não tem meta.',
      '- **Onde se concentra:** Gente tem 64,7% de mulheres e Operações, 52,4%; Tecnologia tem só 31,5%.',
      '- **Ao longo da carreira:** a base é quase paritária até o sênior (48,0%), mas cai para 27,2% na gerência. No nível diretoria, amostra insuficiente (menos de 30 pessoas) — valor não divulgado.',
      '- **O que fazer:** acompanhar a entrada de mulheres em Tecnologia e a passagem de sênior para gerência.',
    ),
    continuacoes: ['mulheres-queda', 'historia-teto-de-vidro'],
  }),
  segunda('mulheres', 'queda', {
    pergunta: 'Por que a participação de mulheres no quadro está caindo?',
    narracao: 'Vou abrir admissões e saídas por gênero e comparar o quadro com dois anos atrás.',
    rodadas: [[comparar('mulheres', { periodo: SET26 }, { periodo: OUT24 }), decompor('admissoes', 'genero'), decompor('turnover', 'genero')]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r2' }],
    texto: texto(
      'A participação caiu de 46,6% em Out/24 para **44,9% em Set/26** (−1,75 p.p.), e o fluxo empurra para baixo: as mulheres entram menos e saem mais.',
      '',
      '- **Entrada:** das 1.380 admissões dos últimos 12 meses, 610 foram de mulheres (44,2%), abaixo da fatia delas no quadro.',
      '- **Saída:** o turnover das mulheres é de 26,4% a.a., contra 23,7% dos homens; elas foram 48,2% das saídas.',
      '- **Leitura:** as duas pontas puxam a proporção para baixo ao mesmo tempo.',
      '- **O que fazer:** acompanhar a fatia de mulheres em cada turma de contratação e entender os motivos de saída por gênero.',
    ),
    continuacoes: ['mulheres', 'mulheres-lideranca'],
  }),
  influencia('mulheres_lideranca', {
    extras: [decompor('mulheres', 'senioridade')],
    mostrar: [{ resultado: 'r2' }, { resultado: 'r3' }],
    texto: texto(
      'As mulheres ocupam **28,4% da liderança**, fora da meta de 40% (abaixo), a 11,6 p.p. dela.',
      '',
      '- **O que aconteceu:** o indicador não sai do lugar: 29,0% em Out/24, máximo de 30,7% em Nov/25 e 28,4% em Set/26.',
      '- **Onde se concentra:** nenhuma diretoria chega à meta; Gente tem a maior fatia (36,2%) e Tecnologia, a menor (22,0%).',
      '- **Onde o funil afina:** a base é quase paritária até o sênior (48,0% de mulheres), mas a gerência tem só 27,2%: a queda aparece na passagem para a liderança.',
      '- **O que fazer:** revisar os critérios de seleção para gerência e garantir sucessoras mulheres em cada plano de sucessão.',
    ),
    continuacoes: ['historia-teto-de-vidro', 'mulheres-lideranca-evolucao'],
  }),
  segunda('mulheres_lideranca', 'evolucao', {
    pergunta: 'A liderança feminina avançou nos últimos dois anos?',
    narracao: 'Vou comparar a liderança e o quadro feminino de Set/26 com Out/24.',
    rodadas: [[comparar('mulheres_lideranca', { periodo: SET26 }, { periodo: OUT24 }), comparar('mulheres', { periodo: SET26 }, { periodo: OUT24 })]],
    mostrar: [{ resultado: 'r1' }],
    texto: texto(
      'Não: a liderança feminina recuou de 29,0% em Out/24 para **28,4% em Set/26** (−0,61 p.p.) e segue fora da meta (abaixo).',
      '',
      '- **Contexto:** o número de líderes cresceu de 486 para 521 no período, sem melhorar a proporção.',
      '- **Base:** as mulheres também perderam espaço no quadro, de 46,6% para 44,9% (−1,75 p.p.).',
      '- **Leitura:** a distância para a meta de 40% aumentou em dois anos.',
      '- **O que fazer:** usar as novas vagas de liderança para corrigir a proporção: cada abertura é uma chance de sucessão feminina.',
    ),
    continuacoes: ['mulheres-lideranca', 'historia-teto-de-vidro'],
  }),
  influencia('negros', {
    extras: [decompor('negros', 'senioridade')],
    texto: texto(
      'Pessoas pretas e pardas são **36,1% do quadro** em Set/26, estável desde Out/24 (35,6%); o indicador não tem meta.',
      '',
      '- **O que aconteceu:** variação de só 0,46 p.p. em dois anos, com máximo de 36,7% em Jul/25.',
      '- **Onde se concentra:** as diretorias ficam entre 32,0% (Gente) e 38,2% (Distribuição & Assessoria).',
      '- **Por senioridade:** a representação cai com a senioridade: 39,7% no júnior, 36,5% no sênior e 23,8% na gerência. No nível diretoria, amostra insuficiente (menos de 30 pessoas) — valor não divulgado.',
      '- **O que fazer:** olhar a passagem de sênior para gerência, onde a proporção despenca.',
    ),
    continuacoes: ['negros-contratacao', 'negros-lideranca'],
  }),
  segunda('negros', 'contratacao', {
    pergunta: 'A contratação está mudando a composição racial do quadro?',
    narracao: 'Vou abrir as admissões e o turnover por cor/raça.',
    rodadas: [[decompor('admissoes', 'raca'), decompor('turnover', 'raca'), valor('negros')]],
    mostrar: [{ resultado: 'r1' }],
    texto: texto(
      'Pouco. Pessoas negras são **36,1% do quadro**; nas 1.380 admissões dos últimos 12 meses, pessoas pretas foram 154 (11,2%) e pardas, 343 (24,9%).',
      '',
      '- **Saídas:** o turnover é um pouco maior entre pessoas pretas (26,9% a.a.) e pardas (25,7%) que entre brancas (24,0%).',
      '- **Leitura:** a contratação mantém a composição sem acelerar a mudança, e a saída um pouco maior anula parte do esforço.',
      '- **O que fazer:** fixar metas de diversidade por turma de contratação e acompanhar a retenção de pessoas negras no primeiro ano.',
    ),
    continuacoes: ['negros', 'negros-lideranca-evolucao'],
  }),
  influencia('negros_lideranca', {
    extras: [decompor('negros', 'senioridade')],
    mostrar: [{ resultado: 'r2' }, { resultado: 'r3' }],
    texto: texto(
      'Pessoas negras ocupam **24,0% da liderança**, fora da meta de 30% (abaixo), a 6,01 p.p. dela.',
      '',
      '- **O que aconteceu:** avanço de 3 p.p. desde Out/24 (21,0%), com pico de 24,3% em Jul/26; em 2026 o indicador parou de subir.',
      '- **Onde se concentra:** Financeiro & Risco tem a maior fatia (28,0%) e Gente, a menor (12,8%), 2,19 vezes menos.',
      '- **Onde a proporção cai:** no sênior, 36,5% são pessoas negras; na gerência, 23,8%: a queda aparece na passagem para a liderança.',
      '- **O que fazer:** incluir sucessores negros nos planos de sucessão e acompanhar a promoção de sênior para gerência por cor/raça.',
    ),
    continuacoes: ['negros-lideranca-evolucao', 'negros'],
  }),
  segunda('negros_lideranca', 'evolucao', {
    pergunta: 'A liderança negra melhorou nos últimos dois anos?',
    narracao: 'Vou comparar a liderança negra de Set/26 com a de Out/24.',
    rodadas: [[comparar('negros_lideranca', { periodo: SET26 }, { periodo: OUT24 }), valor('negros_lideranca')]],
    mostrar: [{ resultado: 'r1' }],
    texto: texto(
      'Sim, mas devagar: a liderança negra subiu de 21,0% em Out/24 para **24,0% em Set/26** (+3 p.p., ou +14,3%).',
      '',
      '- **Contra a meta:** segue fora da meta de 30% (abaixo), a 6,01 p.p.',
      '- **Contexto:** o número de líderes cresceu de 486 para 521, e a proporção melhorou junto.',
      '- **Leitura:** no ritmo dos dois anos, a meta ainda está distante.',
      '- **O que fazer:** manter a prioridade nas promoções internas e nas contratações externas de líderes.',
    ),
    continuacoes: ['negros-lideranca', 'mulheres-lideranca-evolucao'],
  }),
  influencia('pcd', {
    extras: [decompor('pcd', 'senioridade')],
    texto: texto(
      'Pessoas com deficiência são **2,47% do quadro**, fora da meta de 5% (abaixo); a razão contra a cota legal é de 0,49.',
      '',
      '- **O que aconteceu:** a taxa caiu de 2,7% em Out/24 para 2,47% em Set/26 (−0,22 p.p.).',
      '- **Onde se concentra:** Gente tem a maior taxa (4,09%), ainda abaixo da cota; Operações tem a menor (1,54%).',
      '- **Perfil:** pleno tem 2,93% e gerência, 1,61%. No nível diretoria, amostra insuficiente (menos de 30 pessoas) — valor não divulgado.',
      '- **O que fazer:** plano de contratação com meta por diretoria e processos seletivos acessíveis: a cota é obrigação legal para empresas do porte da Verta.',
    ),
    continuacoes: ['pcd-cota', 'negros'],
  }),
  segunda('pcd', 'cota', {
    pergunta: 'Quanto falta para a cota legal de pessoas com deficiência?',
    narracao: 'Vou levantar o percentual contra a cota, a evolução e a entrada de PcD nas admissões.',
    rodadas: [[valor('pcd'), comparar('pcd', { periodo: SET26 }, { periodo: OUT24 }), decompor('admissoes', 'pcd')]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r3' }],
    texto: texto(
      'Faltam **2,53 p.p.**: a empresa tem 2,47% de pessoas com deficiência, contra a cota de 5%, fora da meta (abaixo).',
      '',
      '- **Tendência:** a taxa recuou de 2,7% em Out/24 para 2,47% em Set/26 (−8,2%).',
      '- **Entrada:** só 30 das 1.380 admissões dos últimos 12 meses foram de pessoas com deficiência (2,17%), abaixo da taxa atual do quadro.',
      '- **Leitura:** nesse ritmo de contratação a taxa continua caindo; a cota não se fecha sem mudar a entrada.',
      '- **O que fazer:** fixar meta de PcD por turma de contratação, revisar a acessibilidade dos processos seletivos e buscar parceiros especializados em inclusão.',
    ),
    continuacoes: ['pcd', 'mulheres-lideranca'],
  }),
  influencia('gap_salarial_genero', {
    extras: [decompor('gap_salarial_genero', 'senioridade')],
    texto: texto(
      'O gap salarial de gênero ajustado está em **−2,11%** (no mesmo nível, as mulheres ganham menos), abaixo da meta de −2%, em atenção.',
      '',
      '- **O que aconteceu:** o gap se abriu até −2,59% em Fev/26 e voltou a −2,11% em Set/26, perto de Out/24 (−2,01%).',
      '- **Onde se concentra:** Distribuição & Assessoria (−3,87%) e Produtos & Plataforma (−3,52%) têm os maiores gaps; em Tecnologia o sinal se inverte (+0,24%).',
      '- **Perfil:** o sênior concentra o maior gap (−3,14%); na gerência ele praticamente some (+0,09%). No nível diretoria, amostra insuficiente (menos de 30 pessoas) — valor não divulgado.',
      '- **O que fazer:** revisão de equidade salarial no sênior de Distribuição & Assessoria e de Produtos & Plataforma.',
    ),
    continuacoes: ['gap-salarial-genero-tempo-casa', 'historia-teto-de-vidro'],
  }),
  segunda('gap_salarial_genero', 'tempo-casa', {
    pergunta: 'Em que tempo de casa o gap salarial de gênero é maior?',
    narracao: 'Vou abrir o gap salarial ajustado por tempo de casa e por faixa salarial.',
    rodadas: [[decompor('gap_salarial_genero', 'tempoCasa'), decompor('gap_salarial_genero', 'faixaSalarial')]],
    mostrar: [{ resultado: 'r1' }],
    texto: texto(
      'O gap é maior nas pontas: **−2,84%** para quem tem 5 anos ou mais de casa e −2,62% para quem tem menos de 1 ano.',
      '',
      '- **No meio:** −1,74% entre 1 e 3 anos e −0,97% entre 3 e 5 anos.',
      '- **Dentro da faixa:** em cada posição da faixa salarial o gap quase some (de −0,06% no piso a +0,23% no teto); a hipótese é que a diferença venha da posição das mulheres dentro da faixa do cargo.',
      '- **Leitura:** quem acabou de entrar já começa com gap; vale olhar a oferta de entrada e a progressão dentro da faixa.',
      '- **O que fazer:** calibrar a oferta salarial de entrada por gênero e revisar o posicionamento na faixa a cada ciclo de mérito.',
    ),
    continuacoes: ['gap-salarial-genero', 'mulheres-lideranca'],
  }),

  // ── Custo ───────────────────────────────────────────────────────────────────
  influencia('folha', {
    extras: [comparar('folha', { periodo: SET26 }, { periodo: SET25 })],
    texto: texto(
      'A folha mensal chegou a **R$ 63,7 mi** em Set/26, 5,2% acima de Set/25 (R$ 60,6 mi).',
      '',
      '- **O que aconteceu:** cresceu R$ 6,4 mi por mês desde Out/24 (+11,2%), sem recuo relevante.',
      '- **Onde se concentra:** Tecnologia paga R$ 20,1 mi por mês, 31,5% da folha; Distribuição & Assessoria vem depois, com R$ 12,4 mi.',
      '- **Leitura:** o indicador não tem meta; a folha de Tecnologia é 4,76 vezes a de Gente.',
      '- **O que fazer:** comparar a folha com o custo estimado do turnover de cada diretoria antes de decidir reajustes.',
    ),
    continuacoes: ['folha-crescimento', 'custo-turnover'],
  }),
  segunda('folha', 'crescimento', {
    pergunta: 'A folha está crescendo mais rápido que o quadro?',
    narracao: 'Vou comparar a folha e o quadro de Set/26 com os de Set/25.',
    rodadas: [[comparar('folha', { periodo: SET26 }, { periodo: SET25 }), comparar('headcount', { periodo: SET26 }, { periodo: SET25 }), decompor('folha', 'diretoria', SET26)]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r2' }],
    texto: texto(
      'Sim: em 12 meses a folha mensal cresceu **5,2%**, de R$ 60,6 mi para R$ 63,7 mi, e o quadro, 3,4%, de 4.808 para 4.972 pessoas.',
      '',
      '- **Em reais:** R$ 3,1 mi a mais por mês, com 164 pessoas a mais.',
      '- **Onde se concentra:** Tecnologia paga R$ 20,1 mi por mês, 31,5% da folha.',
      '- **Leitura:** como a folha cresce mais rápido que o quadro, o custo por pessoa está subindo; reajustes, promoções e a mistura de níveis são as hipóteses a checar.',
      '- **O que fazer:** planejar folha e quadro juntos no orçamento e acompanhar o custo por pessoa de cada diretoria.',
    ),
    continuacoes: ['folha', 'headcount-diretorias'],
  }),
  influencia('custo_turnover', {
    extras: [sinais(P12)],
    texto: texto(
      'O turnover custou **R$ 82,5 mi** nos últimos 12 meses; o indicador não tem meta.',
      '',
      '- **O que aconteceu:** o custo mensal subiu de R$ 5,0 mi em Out/24 para R$ 6,2 mi em Set/26, com picos em janeiro (R$ 9,5 mi em Jan/26).',
      '- **Onde se concentra:** Tecnologia responde por R$ 33,0 mi (40,0%), 9,48 vezes o custo de Gente; Distribuição & Assessoria vem depois, com R$ 16,3 mi.',
      '- **Sinais do detector:** o pico de janeiro em Distribuição & Assessoria (R$ 4.636.200 em Jan/26, 4,6× a mediana) e uma quebra de tendência em Produtos & Plataforma, de R$ 507.171 para R$ 1.035.160 por mês a partir de Jul/25.',
      '- **O que fazer:** priorizar a retenção em Tecnologia, onde está o maior custo, e o onboarding em Produtos & Plataforma, onde ele mais cresceu.',
    ),
    continuacoes: ['custo-turnover-tipo', 'historia-janeiro-da'],
  }),
  segunda('custo_turnover', 'tipo', {
    pergunta: 'Que tipo de saída mais pesa no custo do turnover?',
    narracao: 'Vou estimar o custo das saídas voluntárias, involuntárias e no primeiro ano.',
    rodadas: [[impacto('turnover_voluntario'), impacto('turnover_involuntario'), impacto('early_attrition'), valor('custo_turnover')]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r2' }],
    texto: texto(
      'As saídas voluntárias pesam mais: **R$ 62,4 mi** dos R$ 82,5 mi que o turnover custou nos últimos 12 meses.',
      '',
      '- **Involuntárias:** R$ 20,1 mi no período, cerca de R$ 1,7 mi por mês.',
      '- **Primeiro ano:** as saídas de quem tinha menos de um ano de casa custaram R$ 25,5 mi; esse valor já está dentro dos dois anteriores, não se soma a eles.',
      '- **Leitura:** os pedidos de demissão custam cerca de R$ 5,2 mi por mês: é ali que a retenção tem mais retorno.',
      '- **O que fazer:** atacar os fatores de risco do turnover voluntário antes de mexer nos desligamentos.',
    ),
    continuacoes: ['custo-turnover', 'turnover-voluntario-custo'],
  }),
];
