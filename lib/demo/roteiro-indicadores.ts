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
      '- **O que aconteceu:** crescimento contínuo, com recuo só nos meses de janeiro. O headcount não tem meta.',
      '- **Onde se concentra:** Tecnologia tem 1.367 pessoas, 27,5% do quadro; Gente, a menor diretoria, tem 391.',
      '- **Por quê:** nos últimos 12 meses entraram 1.380 pessoas e saíram 1.216, com turnover de 24,9% a.a., acima da meta, em atenção.',
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
      '- **Demais diretorias:** Distribuição & Assessoria (1.029), Operações (910), Financeiro & Risco (615) e Gente (391) ficaram perto do ano anterior.',
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
      '- **Perfil:** pleno (509) e sênior (486) são a maior parte; gerência teve 46. No nível diretoria, amostra insuficiente (menos de 30 pessoas) — valor não divulgado.',
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
      '- **Produtos & Plataforma:** desacelerou, com 237 contra 261 (−9,2%), depois da onda de contratação de 2025.',
      '- **Leitura:** o ritmo da empresa ficou estável; o que mudou foi a mistura entre as diretorias.',
      '- **O que fazer:** antes de reabrir vagas em Produtos & Plataforma, olhar o early attrition das turmas contratadas em 2025.',
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
      'Não: o tamanho do time não explica as saídas. **Tecnologia**, com 8,6 liderados por gestor, tem o maior turnover voluntário, **26,7% a.a.**',
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
      '- **Por quê:** avaliação abaixo do esperado (lift 2,35), onboarding incompleto (1,76) e piso da faixa salarial (1,73) são os maiores fatores de risco.',
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
    texto: texto(''),
    continuacoes: ['turnover-voluntario-custo', 'historia-fuga-tecnologia'],
  }),
  segunda('turnover_voluntario', 'custo', {
    pergunta: 'Quanto custa o turnover voluntário e em que faixa salarial ele se concentra?',
    narracao: 'Vou estimar o custo das saídas voluntárias e abrir a taxa por faixa salarial.',
    rodadas: [[impacto('turnover_voluntario'), decompor('turnover_voluntario', 'faixaSalarial'), valor('turnover_voluntario')]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r2' }],
    texto: texto(''),
    continuacoes: ['turnover-voluntario', 'historia-fuga-tecnologia'],
  }),
  influencia('turnover_involuntario', {
    extras: [drivers('turnover_involuntario')],
    mostrar: [{ resultado: 'r2' }, { resultado: 'r3' }, { resultado: 'r4' }],
    texto: texto(''),
    continuacoes: ['turnover-involuntario-janeiro', 'historia-janeiro-da'],
  }),
  segunda('turnover_involuntario', 'janeiro', {
    pergunta: 'Quanto pesa o corte de janeiro no turnover involuntário?',
    narracao: 'Vou comparar Jan/26 com os 12 meses e ver onde o corte se concentrou.',
    rodadas: [[comparar('turnover_involuntario', { periodo: mes('2026-01') }, { periodo: P12 }), decompor('turnover_involuntario', 'diretoria', mes('2026-01')), impacto('turnover_involuntario')]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r2' }],
    texto: texto(''),
    continuacoes: ['turnover-involuntario', 'historia-janeiro-da'],
  }),
  influencia('early_attrition', {
    extras: [drivers('early_attrition')],
    mostrar: [{ resultado: 'r2' }, { resultado: 'r3' }, { resultado: 'r4' }],
    texto: texto(''),
    continuacoes: ['early-attrition-onboarding', 'historia-onboarding-produtos'],
  }),
  segunda('early_attrition', 'onboarding', {
    pergunta: 'Quanto o onboarding pesa na saída no primeiro ano?',
    narracao: 'Vou abrir o early attrition por onboarding e estimar o custo dessas saídas.',
    rodadas: [[decompor('early_attrition', 'onboarding'), impacto('early_attrition'), valor('early_attrition')]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r2' }],
    texto: texto(''),
    continuacoes: ['early-attrition', 'historia-onboarding-produtos'],
  }),

  // ── Atração ─────────────────────────────────────────────────────────────────
  influencia('vagas_abertas', {
    extras: [decompor('vagas_abertas', 'senioridade')],
    texto: texto(''),
    continuacoes: ['vagas-abertas-tecnologia', 'historia-vagas-tecnologia'],
  }),
  segunda('vagas_abertas', 'tecnologia', {
    pergunta: 'Por que as vagas de Tecnologia se acumulam?',
    narracao: 'Vou comparar as vagas de Tecnologia com o ano passado e ver prazo e aceite de oferta.',
    rodadas: [[comparar('vagas_abertas', { periodo: SET26, filtros: TEC }, { periodo: SET25, filtros: TEC }), valor('time_to_fill', P12, TEC), valor('aceite_oferta', P12, TEC), valor('time_to_fill'), valor('aceite_oferta')]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r2' }],
    texto: texto(''),
    continuacoes: ['time-to-fill', 'historia-vagas-tecnologia'],
  }),
  influencia('time_to_fill', {
    extras: [comparar('time_to_fill', { periodo: P12 }, { periodo: P12_ANTERIOR }), valor('aceite_oferta')],
    texto: texto(''),
    continuacoes: ['time-to-fill-senioridade', 'aceite-oferta'],
  }),
  segunda('time_to_fill', 'senioridade', {
    pergunta: 'Em que senioridade as vagas demoram mais a fechar?',
    narracao: 'Vou abrir o time to fill por senioridade e, em Tecnologia, por especialidade.',
    rodadas: [[decompor('time_to_fill', 'senioridade'), decompor('time_to_fill', 'especialidade', P12, TEC)]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r2', tipo: 'tabela' }],
    texto: texto(''),
    continuacoes: ['time-to-fill', 'historia-vagas-tecnologia'],
  }),
  influencia('aceite_oferta', {
    extras: [decompor('aceite_oferta', 'senioridade')],
    texto: texto(''),
    continuacoes: ['aceite-oferta-tecnologia', 'historia-fuga-tecnologia'],
  }),
  segunda('aceite_oferta', 'tecnologia', {
    pergunta: 'Onde as ofertas de Tecnologia mais são recusadas?',
    narracao: 'Vou abrir o aceite de oferta de Tecnologia por especialidade e comparar com o ano anterior.',
    rodadas: [[decompor('aceite_oferta', 'especialidade', P12, TEC), comparar('aceite_oferta', { periodo: P12, filtros: TEC }, { periodo: P12_ANTERIOR, filtros: TEC })]],
    mostrar: [{ resultado: 'r1', tipo: 'tabela' }, { resultado: 'r2' }],
    texto: texto(''),
    continuacoes: ['aceite-oferta', 'vagas-abertas-tecnologia'],
  }),
  influencia('preenchimento_interno', {
    extras: [comparar('preenchimento_interno', { periodo: P12 }, { periodo: P12_ANTERIOR })],
    texto: texto(''),
    continuacoes: ['preenchimento-interno-senioridade', 'historia-mobilidade-fr'],
  }),
  segunda('preenchimento_interno', 'senioridade', {
    pergunta: 'Em que senioridade as vagas são preenchidas por gente de dentro?',
    narracao: 'Vou abrir o preenchimento interno por senioridade.',
    rodadas: [[decompor('preenchimento_interno', 'senioridade'), valor('preenchimento_interno')]],
    mostrar: [{ resultado: 'r1' }],
    texto: texto(''),
    continuacoes: ['preenchimento-interno', 'mobilidade-interna'],
  }),
  influencia('custo_por_contratacao', {
    extras: [comparar('custo_por_contratacao', { periodo: P12 }, { periodo: P12_ANTERIOR })],
    texto: texto(''),
    continuacoes: ['custo-por-contratacao-senioridade', 'admissoes'],
  }),
  segunda('custo_por_contratacao', 'senioridade', {
    pergunta: 'Quanto custa contratar em cada senioridade?',
    narracao: 'Vou abrir o custo por contratação por senioridade.',
    rodadas: [[decompor('custo_por_contratacao', 'senioridade'), valor('custo_por_contratacao')]],
    mostrar: [{ resultado: 'r1' }],
    texto: texto(''),
    continuacoes: ['custo-por-contratacao', 'time-to-fill'],
  }),

  // ── Engajamento & bem-estar ─────────────────────────────────────────────────
  influencia('enps', {
    narracao: 'Vou levantar o eNPS contra a meta, os ciclos trimestrais e a quebra por diretoria.',
    extras: [decompor('enps', 'trocasGestor')],
    texto: texto(''),
    continuacoes: ['enps-saidas', 'historia-enps-operacoes'],
  }),
  segunda('enps', 'saidas', {
    pergunta: 'Quem dá nota baixa no eNPS sai mais?',
    narracao: 'Vou abrir o turnover voluntário pela resposta de eNPS de cada pessoa.',
    rodadas: [[decompor('turnover_voluntario', 'enps'), valor('turnover_voluntario')]],
    mostrar: [{ resultado: 'r1' }],
    texto: texto(''),
    continuacoes: ['enps', 'historia-enps-operacoes'],
  }),
  influencia('absenteismo', {
    extras: [decompor('absenteismo', 'senioridade'), valor('horas_extras_pc', P12, TEC)],
    texto: texto(''),
    continuacoes: ['absenteismo-custo', 'historia-vagas-tecnologia'],
  }),
  segunda('absenteismo', 'custo', {
    pergunta: 'Quanto custa o absenteísmo?',
    narracao: 'Vou estimar o custo das ausências na empresa e em Tecnologia.',
    rodadas: [[impacto('absenteismo'), impacto('absenteismo', P12, TEC), valor('absenteismo')]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r2' }],
    texto: texto(''),
    continuacoes: ['absenteismo', 'horas-extras-pc-custo'],
  }),
  influencia('horas_extras_pc', {
    extras: [decompor('horas_extras_pc', 'senioridade')],
    texto: texto(''),
    continuacoes: ['horas-extras-pc-custo', 'historia-vagas-tecnologia'],
  }),
  segunda('horas_extras_pc', 'custo', {
    pergunta: 'Quanto custam as horas extras e onde se concentram?',
    narracao: 'Vou estimar o custo das horas extras na empresa e em Tecnologia.',
    rodadas: [[impacto('horas_extras_pc'), impacto('horas_extras_pc', P12, TEC), valor('horas_extras_pc', P12, TEC)]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r2' }],
    texto: texto(''),
    continuacoes: ['horas-extras-pc', 'historia-vagas-tecnologia'],
  }),

  // ── Desenvolvimento ─────────────────────────────────────────────────────────
  influencia('taxa_promocao', {
    extras: [drivers('taxa_promocao')],
    mostrar: [{ resultado: 'r2' }, { resultado: 'r3' }, { resultado: 'r4' }],
    texto: texto(''),
    continuacoes: ['taxa-promocao-perfil', 'historia-teto-de-vidro'],
  }),
  segunda('taxa_promocao', 'perfil', {
    pergunta: 'Em que senioridade e performance as promoções se concentram?',
    narracao: 'Vou abrir a taxa de promoção por senioridade e por avaliação de performance.',
    rodadas: [[decompor('taxa_promocao', 'senioridade'), decompor('taxa_promocao', 'performance')]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r2' }],
    texto: texto(''),
    continuacoes: ['taxa-promocao', 'historia-teto-de-vidro'],
  }),
  influencia('mobilidade_interna', {
    extras: [drivers('mobilidade_interna')],
    texto: texto(''),
    continuacoes: ['mobilidade-interna-retencao', 'historia-mobilidade-fr'],
  }),
  segunda('mobilidade_interna', 'retencao', {
    pergunta: 'A mobilidade interna reduz o turnover voluntário?',
    narracao: 'Vou abrir o turnover voluntário entre quem se movimentou e quem não se movimentou.',
    rodadas: [[decompor('turnover_voluntario', 'mobilidadeRecente'), valor('mobilidade_interna')]],
    mostrar: [{ resultado: 'r1' }],
    texto: texto(''),
    continuacoes: ['mobilidade-interna', 'historia-mobilidade-fr'],
  }),

  // ── Diversidade & equidade ──────────────────────────────────────────────────
  influencia('mulheres', {
    extras: [decompor('mulheres', 'senioridade')],
    texto: texto(''),
    continuacoes: ['mulheres-queda', 'historia-teto-de-vidro'],
  }),
  segunda('mulheres', 'queda', {
    pergunta: 'Por que a participação de mulheres no quadro está caindo?',
    narracao: 'Vou abrir admissões e saídas por gênero e comparar o quadro com dois anos atrás.',
    rodadas: [[comparar('mulheres', { periodo: SET26 }, { periodo: OUT24 }), decompor('admissoes', 'genero'), decompor('turnover', 'genero')]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r2' }],
    texto: texto(''),
    continuacoes: ['mulheres', 'mulheres-lideranca'],
  }),
  influencia('mulheres_lideranca', {
    extras: [decompor('mulheres', 'senioridade')],
    mostrar: [{ resultado: 'r2' }, { resultado: 'r3' }, { resultado: 'r4' }],
    texto: texto(''),
    continuacoes: ['historia-teto-de-vidro', 'mulheres-lideranca-evolucao'],
  }),
  segunda('mulheres_lideranca', 'evolucao', {
    pergunta: 'A liderança feminina avançou nos últimos dois anos?',
    narracao: 'Vou comparar a liderança e o quadro feminino de Set/26 com Out/24.',
    rodadas: [[comparar('mulheres_lideranca', { periodo: SET26 }, { periodo: OUT24 }), comparar('mulheres', { periodo: SET26 }, { periodo: OUT24 })]],
    mostrar: [{ resultado: 'r1' }],
    texto: texto(''),
    continuacoes: ['mulheres-lideranca', 'historia-teto-de-vidro'],
  }),
  influencia('negros', {
    extras: [decompor('negros', 'senioridade')],
    texto: texto(''),
    continuacoes: ['negros-contratacao', 'negros-lideranca'],
  }),
  segunda('negros', 'contratacao', {
    pergunta: 'A contratação está mudando a composição racial do quadro?',
    narracao: 'Vou abrir as admissões e o turnover por cor/raça.',
    rodadas: [[decompor('admissoes', 'raca'), decompor('turnover', 'raca'), valor('negros')]],
    mostrar: [{ resultado: 'r1' }],
    texto: texto(''),
    continuacoes: ['negros', 'negros-lideranca-evolucao'],
  }),
  influencia('negros_lideranca', {
    extras: [decompor('negros', 'senioridade')],
    mostrar: [{ resultado: 'r2' }, { resultado: 'r3' }, { resultado: 'r4' }],
    texto: texto(''),
    continuacoes: ['negros-lideranca-evolucao', 'negros'],
  }),
  segunda('negros_lideranca', 'evolucao', {
    pergunta: 'A liderança negra melhorou nos últimos dois anos?',
    narracao: 'Vou comparar a liderança negra de Set/26 com a de Out/24.',
    rodadas: [[comparar('negros_lideranca', { periodo: SET26 }, { periodo: OUT24 }), valor('negros_lideranca')]],
    mostrar: [{ resultado: 'r1' }],
    texto: texto(''),
    continuacoes: ['negros-lideranca', 'mulheres-lideranca-evolucao'],
  }),
  influencia('pcd', {
    extras: [decompor('pcd', 'senioridade')],
    texto: texto(''),
    continuacoes: ['pcd-cota', 'negros'],
  }),
  segunda('pcd', 'cota', {
    pergunta: 'Quanto falta para a cota legal de pessoas com deficiência?',
    narracao: 'Vou levantar o percentual contra a cota, a evolução e a entrada de PcD nas admissões.',
    rodadas: [[valor('pcd'), comparar('pcd', { periodo: SET26 }, { periodo: OUT24 }), decompor('admissoes', 'pcd')]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r3' }],
    texto: texto(''),
    continuacoes: ['pcd', 'mulheres-lideranca'],
  }),
  influencia('gap_salarial_genero', {
    extras: [decompor('gap_salarial_genero', 'senioridade')],
    texto: texto(''),
    continuacoes: ['gap-salarial-genero-tempo-casa', 'historia-teto-de-vidro'],
  }),
  segunda('gap_salarial_genero', 'tempo-casa', {
    pergunta: 'Em que tempo de casa o gap salarial de gênero é maior?',
    narracao: 'Vou abrir o gap salarial ajustado por tempo de casa e por faixa salarial.',
    rodadas: [[decompor('gap_salarial_genero', 'tempoCasa'), decompor('gap_salarial_genero', 'faixaSalarial')]],
    mostrar: [{ resultado: 'r1' }],
    texto: texto(''),
    continuacoes: ['gap-salarial-genero', 'mulheres-lideranca'],
  }),

  // ── Custo ───────────────────────────────────────────────────────────────────
  influencia('folha', {
    extras: [comparar('folha', { periodo: SET26 }, { periodo: SET25 })],
    texto: texto(''),
    continuacoes: ['folha-senioridade', 'custo-turnover'],
  }),
  segunda('folha', 'senioridade', {
    pergunta: 'Como a folha se distribui por senioridade?',
    narracao: 'Vou abrir a folha mensal por senioridade.',
    rodadas: [[decompor('folha', 'senioridade'), valor('folha')]],
    mostrar: [{ resultado: 'r1' }],
    texto: texto(''),
    continuacoes: ['folha', 'headcount'],
  }),
  influencia('custo_turnover', {
    extras: [sinais(P12)],
    texto: texto(''),
    continuacoes: ['custo-turnover-tipo', 'historia-janeiro-da'],
  }),
  segunda('custo_turnover', 'tipo', {
    pergunta: 'Que tipo de saída mais pesa no custo do turnover?',
    narracao: 'Vou estimar o custo das saídas voluntárias, involuntárias e no primeiro ano.',
    rodadas: [[impacto('turnover_voluntario'), impacto('turnover_involuntario'), impacto('early_attrition'), valor('custo_turnover')]],
    mostrar: [{ resultado: 'r1' }, { resultado: 'r2' }],
    texto: texto(''),
    continuacoes: ['custo-turnover', 'turnover-voluntario-custo'],
  }),
];
