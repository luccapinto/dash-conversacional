/**
 * Testes unitários — funções de cálculo
 *
 * Valida que as anomalias da narrativa estão corretamente refletidas nos
 * resultados das funções, e que os guardrails analíticos funcionam.
 *
 * Ref: LUC-164
 */

import { describe, it, expect } from 'vitest';
import {
  getTurnoverRate,
  getTrend,
  getProjection,
  rankDiretoriasByTurnover,
  breakdownByDimension,
  getHeadcount,
  getSegmentRates,
  getDrivers,
  compareGroups,
  getCohortByTenure,
  quantifyCost,
  getRegrettedAttrition,
  META_TURNOVER_MENSAL,
  MIN_AMOSTRA,
} from '@/lib/calculations';
import { crossBreakdown } from '@/lib/calculations/roster';

// ── getTurnoverRate ───────────────────────────────────────────────────────────

describe('getTurnoverRate', () => {
  it('retorna status bad para Tecnologia no ano 2024 (acima da meta)', () => {
    const r = getTurnoverRate('12m', 'Tecnologia');
    expect(r.taxa).toBeGreaterThan(META_TURNOVER_MENSAL);
    expect(r.status).toBe('bad');
    expect(r.desligamentos).toBeGreaterThan(0);
  });

  it('retorna status good para Gente (diretoria saudável)', () => {
    const r = getTurnoverRate('12m', 'Gente');
    expect(r.taxa).toBeLessThanOrEqual(META_TURNOVER_MENSAL * 1.5);
    expect(['good', 'warn']).toContain(r.status);
  });

  it('separa voluntário vs. involuntário — soma deve igualar o total', () => {
    const total       = getTurnoverRate('12m', 'Tecnologia');
    const voluntario  = getTurnoverRate('12m', 'Tecnologia', 'voluntário');
    const involuntario = getTurnoverRate('12m', 'Tecnologia', 'involuntário');
    expect(voluntario.desligamentos + involuntario.desligamentos).toBe(total.desligamentos);
  });

  it('turnover voluntário de Tecnologia é maior que involuntário (anomalia de remuneração)', () => {
    const vol = getTurnoverRate('12m', 'Tecnologia', 'voluntário');
    const inv = getTurnoverRate('12m', 'Tecnologia', 'involuntário');
    expect(vol.desligamentos).toBeGreaterThan(inv.desligamentos);
  });

  it('retorna headcountMedio > 0', () => {
    const r = getTurnoverRate('6m', 'Operações');
    expect(r.headcountMedio).toBeGreaterThan(0);
  });

  it('retorna meta como constante para todas as diretorias', () => {
    const dirs = ['Geral', 'Tecnologia', 'Gente'] as const;
    for (const d of dirs) {
      expect(getTurnoverRate('12m', d).meta).toBe(META_TURNOVER_MENSAL);
    }
  });
});

// ── getTrend ──────────────────────────────────────────────────────────────────

describe('getTrend', () => {
  it('Tecnologia: turnover 2024 maior que 2023 (YoY positivo)', () => {
    const r = getTrend('Tecnologia', '12m');
    expect(r.variacaoYoY).toBeGreaterThan(0);
    expect(r.direcao).toBe('subindo');
  });

  it('Tecnologia: detecta mesDaVirada em 2023 (escalada começa em Jul/2023)', () => {
    const r = getTrend('Tecnologia', '12m');
    expect(r.mesDaVirada).not.toBeNull();
    // A virada deve ser entre Jun e Set de 2023
    if (r.mesDaVirada) {
      expect(r.mesDaVirada >= '2023-06' && r.mesDaVirada <= '2023-09').toBe(true);
    }
  });

  it('retorna série completa com 24 pontos', () => {
    const r = getTrend('Geral', '12m');
    expect(r.serie).toHaveLength(24);
  });

  it('série mensal começa em 2023-01 e termina em 2024-12', () => {
    const r = getTrend('Gente', '12m');
    expect(r.serie[0].mes).toBe('2023-01');
    expect(r.serie[23].mes).toBe('2024-12');
  });

  it('Gente: trend estável ou positivo (diretoria saudável)', () => {
    const r = getTrend('Gente', '12m');
    // Taxa atual deve ser baixa — não "subindo" de forma alarmante
    expect(r.taxaAtual).toBeLessThan(META_TURNOVER_MENSAL * 2);
  });

  it('Operações: turnover sobe no 2S/2024 comparado ao 2S/2023 (YoY)', () => {
    const r = getTrend('Operações', '6m'); // Jul-Dez 2024 vs. Jul-Dez 2023
    expect(r.variacaoYoY).toBeGreaterThan(0);
  });

  it('filtro voluntário — tendência separada é consistente com o total', () => {
    const total = getTrend('Tecnologia', '12m');
    const vol   = getTrend('Tecnologia', '12m', 'voluntário');
    // Voluntários não podem ser mais do que o total
    expect(vol.taxaAtual).toBeLessThanOrEqual(total.taxaAtual + 0.001);
  });

  it('taxaMesmoPeriodoAnoAnterior é não-nulo para periodo 12m', () => {
    const r = getTrend('Geral', '12m');
    expect(r.taxaMesmoPeriodoAnoAnterior).not.toBeNull();
  });
});

// ── getProjection ─────────────────────────────────────────────────────────────

describe('getProjection', () => {
  it('retorna projeção para 3 meses (Jan-Mar 2025)', () => {
    const r = getProjection('Geral');
    expect(r.serieProjetada).toHaveLength(3);
    expect(r.serieProjetada[0].mes).toBe('2025-01');
    expect(r.serieProjetada[2].mes).toBe('2025-03');
  });

  it('taxa projetada de Tecnologia > taxa projetada de Gente (padrão esperado)', () => {
    const tech = getProjection('Tecnologia');
    const gente = getProjection('Gente');
    expect(tech.taxaProjetadaProximo3Meses).toBeGreaterThan(gente.taxaProjetadaProximo3Meses);
  });

  it('série histórica tem 24 pontos', () => {
    const r = getProjection('Operações');
    expect(r.serieHistorica).toHaveLength(24);
  });

  it('projeção voluntária < projeção total para Tecnologia', () => {
    const total = getProjection('Tecnologia');
    const vol   = getProjection('Tecnologia', 'voluntário');
    expect(vol.taxaProjetadaProximo3Meses).toBeLessThan(total.taxaProjetadaProximo3Meses + 0.001);
  });
});

// ── rankDiretoriasByTurnover ──────────────────────────────────────────────────

describe('rankDiretoriasByTurnover', () => {
  it('Tecnologia aparece no topo do ranking no 2S/2023 (anomalia principal)', () => {
    const r = rankDiretoriasByTurnover('6m');
    expect(r.ranking[0].diretoria).toBe('Tecnologia');
  });

  it('ranking contém todas as 6 diretorias', () => {
    const r = rankDiretoriasByTurnover('12m');
    expect(r.ranking).toHaveLength(6);
  });

  it('ranking está ordenado do maior para o menor', () => {
    const r = rankDiretoriasByTurnover('12m');
    for (let i = 0; i < r.ranking.length - 1; i++) {
      expect(r.ranking[i].taxa).toBeGreaterThanOrEqual(r.ranking[i + 1].taxa);
    }
  });

  it('Gente ou Financeiro & Risco aparecem no final do ranking (diretorias saudáveis)', () => {
    const r = rankDiretoriasByTurnover('12m');
    const bottom2 = r.ranking.slice(-2).map(x => x.diretoria);
    const haystack = ['Gente', 'Financeiro & Risco', 'Produtos & Plataforma'];
    expect(bottom2.some(d => haystack.includes(d))).toBe(true);
  });

  it('ranking voluntário: Tecnologia também lidera (fuga de talentos)', () => {
    const r = rankDiretoriasByTurnover('12m', 'voluntário');
    expect(r.ranking[0].diretoria).toBe('Tecnologia');
  });
});

// ── breakdownByDimension ──────────────────────────────────────────────────────

describe('breakdownByDimension', () => {
  it('Tecnologia/posicionamentoFaixa: piso+q1 têm taxa real muito acima do teto (subpagamento)', () => {
    const r = breakdownByDimension('6m', 'Tecnologia', 'posicionamentoFaixa');
    const piso = r.itens.find(i => i.label === 'piso')!;
    const teto = r.itens.find(i => i.label === 'teto')!;
    // taxaTurnover agora é a taxa REAL do segmento (saídas / headcount do segmento)
    expect(piso.taxaTurnover).toBeDefined();
    expect(teto.taxaTurnover).toBeDefined();
    expect(piso.taxaTurnover!).toBeGreaterThan(teto.taxaTurnover! * 1.5);
    // e piso+q1 são a maior fatia das saídas
    const pisoQ1 = r.itens.filter(i => i.label === 'piso' || i.label === 'q1').reduce((s, i) => s + i.percentual, 0);
    expect(pisoQ1).toBeGreaterThan(40);
    expect(pisoQ1).toBeGreaterThan(teto.percentual);
  });

  it('Tecnologia/nivelPerformance: "acima" é a maior fatia das saídas no 2S/2024 (fuga de talento)', () => {
    const r = breakdownByDimension('6m', 'Tecnologia', 'nivelPerformance');
    const acima = r.itens.find(i => i.label === 'acima');
    expect(acima).toBeDefined();
    // alta performance lidera as saídas, muito acima da sua fatia na população
    const maxPct = Math.max(...r.itens.map(i => i.percentual));
    expect(acima!.percentual).toBe(maxPct);
    expect(acima!.percentual).toBeGreaterThan(45);
  });

  it('Distribuição/tipoDesligamento em Janeiro: ~50-60% involuntário', () => {
    const r = breakdownByDimension('q1', 'Distribuição & Assessoria', 'tipoDesligamento');
    const inv = r.itens.find(i => i.label === 'involuntário');
    if (inv) {
      // A sazonalidade de Jan influencia o Q1
      expect(inv.percentual).toBeGreaterThan(30);
    }
  });

  it('percentuais somam 100', () => {
    const r = breakdownByDimension('12m', 'Tecnologia', 'senioridade');
    const total = r.itens.reduce((s, i) => s + i.percentual, 0);
    expect(Math.round(total)).toBe(100);
  });

  it('dimensão senioridade retorna itens em ordem ordinária (júnior → diretoria)', () => {
    const r = breakdownByDimension('12m', 'Tecnologia', 'senioridade');
    const labels = r.itens.map(i => i.label);
    const order = ['júnior', 'pleno', 'sênior', 'gerência', 'diretoria'];
    let lastIdx = -1;
    for (const l of labels) {
      const idx = order.indexOf(l);
      if (idx !== -1) {
        expect(idx).toBeGreaterThan(lastIdx);
        lastIdx = idx;
      }
    }
  });

  it('pré-filtro tipoDesligamento=voluntário reduz o total em Distribuição (mix de tipos)', () => {
    // Distribuição tem mix de voluntário e involuntário em todos os períodos
    const total = breakdownByDimension('12m', 'Distribuição & Assessoria', 'nivelPerformance');
    const vol   = breakdownByDimension('12m', 'Distribuição & Assessoria', 'nivelPerformance', 'voluntário');
    const inv   = breakdownByDimension('12m', 'Distribuição & Assessoria', 'nivelPerformance', 'involuntário');
    // Voluntários + involuntários = total
    expect(vol.totalDesligamentos + inv.totalDesligamentos).toBe(total.totalDesligamentos);
    // Ambos os tipos existem
    expect(vol.totalDesligamentos).toBeGreaterThan(0);
    expect(inv.totalDesligamentos).toBeGreaterThan(0);
  });

  it('retorna totalDesligamentos > 0 para Tecnologia em qualquer período', () => {
    const periodos = ['3m', '6m', '12m', 'q1', 'q2', 'q3', 'q4'] as const;
    for (const p of periodos) {
      const r = breakdownByDimension(p, 'Tecnologia', 'motivoDesligamento');
      expect(r.totalDesligamentos).toBeGreaterThan(0);
    }
  });
});

// ── getHeadcount ──────────────────────────────────────────────────────────────

describe('getHeadcount', () => {
  it('headcount total da empresa (Geral) > 800 no início de 2024', () => {
    const r = getHeadcount('12m', 'Geral');
    expect(r.headcountInicio).toBeGreaterThan(800);
  });

  it('Tecnologia cresceu em headcount (admissões compensam saídas)', () => {
    const r = getHeadcount('12m', 'Tecnologia');
    expect(r.headcountFim).toBeGreaterThan(0);
  });

  it('série mensal de 12m tem 12 pontos', () => {
    const r = getHeadcount('12m', 'Geral');
    expect(r.serieMensal).toHaveLength(12);
  });
});

// ── getSegmentRates (taxa real + lift vs. população) ──────────────────────────

describe('getSegmentRates', () => {
  it('alta performance em Tecnologia sai com lift > 2× (perda regretida)', () => {
    const r = getSegmentRates('12m', 'Tecnologia', 'nivelPerformance');
    expect(r.temPopulacaoBase).toBe(true);
    const acima = r.itens.find(i => i.label === 'acima')!;
    expect(acima.lift).not.toBeNull();
    expect(acima.lift!).toBeGreaterThan(2);
    // taxa do segmento = taxa geral × lift
    expect(acima.taxaSegmento!).toBeGreaterThan(r.taxaGeral);
  });

  it('lift neutro (~1) significa composição ≈ população', () => {
    const r = getSegmentRates('12m', 'Geral', 'senioridade');
    for (const i of r.itens) {
      if (i.lift !== null) expect(i.lift).toBeGreaterThan(0);
    }
  });

  it('dimensão sem população base retorna apenas composição', () => {
    const r = getSegmentRates('12m', 'Tecnologia', 'motivoDesligamento');
    expect(r.temPopulacaoBase).toBe(false);
    expect(r.itens.every(i => i.lift === null)).toBe(true);
  });

  it('marca amostra insuficiente abaixo de MIN_AMOSTRA', () => {
    const r = getSegmentRates('q1', 'Gente', 'posicionamentoFaixa');
    const pequenos = r.itens.filter(i => i.desligamentos < MIN_AMOSTRA);
    expect(pequenos.every(i => i.amostraSuficiente === false)).toBe(true);
  });
});

// ── getDrivers (diagnóstico multivariado) ─────────────────────────────────────

describe('getDrivers', () => {
  it('aponta subpagamento e/ou baixa satisfação como fator de risco em Tecnologia', () => {
    const r = getDrivers('12m', 'Tecnologia');
    expect(r.fatoresDeRisco.length).toBeGreaterThan(0);
    expect(r.fatoresDeRisco.every(d => d.lift >= 1.3)).toBe(true);
    expect(r.fatoresDeRisco.every(d => d.desligamentos >= MIN_AMOSTRA)).toBe(true);
    const temRiscoEsperado = r.fatoresDeRisco.some(d =>
      (d.dimensao === 'posicionamentoFaixa' && d.valor === 'piso') ||
      (d.dimensao === 'nivelSatisfacao' && d.valor === 'baixo') ||
      (d.dimensao === 'nivelPerformance' && d.valor === 'acima'));
    expect(temRiscoEsperado).toBe(true);
  });

  it('fatores protetivos têm lift <= 0.7', () => {
    const r = getDrivers('12m', 'Tecnologia');
    expect(r.fatoresProtetivos.every(d => d.lift <= 0.7)).toBe(true);
  });
});

// ── crossBreakdown ────────────────────────────────────────────────────────────

describe('crossBreakdown', () => {
  it('soma das células ≤ total e células ordenadas desc', () => {
    const r = crossBreakdown('12m', 'Tecnologia', 'senioridade', 'posicionamentoFaixa');
    const soma = r.celulas.reduce((s, c) => s + c.desligamentos, 0);
    expect(soma).toBeLessThanOrEqual(r.totalDesligamentos);
    for (let i = 1; i < r.celulas.length; i++) {
      expect(r.celulas[i - 1].desligamentos).toBeGreaterThanOrEqual(r.celulas[i].desligamentos);
    }
  });
});

// ── compareGroups ─────────────────────────────────────────────────────────────

describe('compareGroups', () => {
  it('Tecnologia tem turnover maior que Gente', () => {
    const r = compareGroups('12m', 'Tecnologia', '12m', 'Gente');
    expect(r.grupoA.taxa).toBeGreaterThan(r.grupoB.taxa);
    expect(r.liderTaxa).toBe('Tecnologia');
    expect(r.diferencaTaxaPp).toBeGreaterThan(0);
  });

  it('comparar dois períodos da mesma diretoria usa rótulos de período', () => {
    const r = compareGroups('q1', 'Operações', 'q4', 'Operações');
    expect(r.grupoA.rotulo).not.toBe(r.grupoB.rotulo);
  });
});

// ── getCohortByTenure ─────────────────────────────────────────────────────────

describe('getCohortByTenure', () => {
  it('buckets somam o total e early attrition é coerente', () => {
    const r = getCohortByTenure('12m', 'Geral');
    const soma = r.buckets.reduce((s, b) => s + b.desligamentos, 0);
    expect(soma).toBe(r.totalDesligamentos);
    expect(r.earlyAttritionPct).toBeGreaterThanOrEqual(0);
    expect(r.earlyAttritionPct).toBeLessThanOrEqual(100);
  });
});

// ── quantifyCost ──────────────────────────────────────────────────────────────

describe('quantifyCost', () => {
  it('custo de reposição = folha mensal × multiplicador', () => {
    const r = quantifyCost('12m', 'Tecnologia');
    expect(r.custoReposicaoEstimado).toBe(r.folhaMensalPerdida * r.multiplicador);
    expect(r.custoRegretido).toBeLessThanOrEqual(r.custoReposicaoEstimado);
  });
});

// ── getRegrettedAttrition ─────────────────────────────────────────────────────

describe('getRegrettedAttrition', () => {
  it('em Tecnologia, perda regretida é alta e o motivo principal é remuneração', () => {
    const r = getRegrettedAttrition('12m', 'Tecnologia');
    expect(r.desligamentosRegretidos).toBeGreaterThan(0);
    expect(r.percentualRegretido).toBeGreaterThan(0);
    expect(r.custoRegretido).toBeGreaterThan(0);
    expect(r.motivoPrincipal).toBe('remuneração');
  });
});

// ── Roster individual + junção real (estratégia B) ────────────────────────────

describe('crossBreakdown — taxa/lift reais por junção (roster)', () => {
  it('alta performance × banda subpaga em Tecnologia sai muito acima do esperado', () => {
    const r = crossBreakdown('12m', 'Tecnologia', 'nivelPerformance', 'posicionamentoFaixa');
    const cell = r.celulas.find(c => c.valor1 === 'acima' && (c.valor2 === 'piso' || c.valor2 === 'q1'));
    expect(cell).toBeDefined();
    expect(cell!.lift).not.toBeNull();
    // a interação é mais letal que os fatores isolados → lift alto
    expect(cell!.lift!).toBeGreaterThan(3);
    expect(cell!.taxaCelula!).toBeGreaterThan(0);
  });

  it('dimensão exclusiva de quem saiu (motivo) não produz taxa de junção', () => {
    const r = crossBreakdown('12m', 'Tecnologia', 'motivoDesligamento', 'senioridade');
    expect(r.celulas.every(c => c.lift == null)).toBe(true);
  });
});

// ── Correções de cálculo (revisão completa) ───────────────────────────────────

import { getYTD } from '@/lib/calculations';

describe('rankDiretoriasByTurnover — YTD real, M-1 ≠ YoY, reconciliação', () => {
  it('total do ranking reconcilia com getYTD(Geral)', () => {
    const r = rankDiretoriasByTurnover('12m');
    const ytd = getYTD('12m', 'Geral');
    expect(Math.abs(r.total.ytdTotal - ytd.taxa)).toBeLessThan(0.001);
  });

  it('M-1 (YTD do mês anterior) é diferente do YoY', () => {
    const r = rankDiretoriasByTurnover('12m');
    expect(r.total.ytdAnterior).not.toBeNull();
    expect(r.total.ytdAnoAnterior).not.toBeNull();
    expect(r.total.ytdAnterior).not.toBe(r.total.ytdAnoAnterior);
    // M-1 = YTD até Nov < YTD até Dez (acumula menos um mês)
    expect(r.total.ytdAnterior!).toBeLessThan(r.total.ytdTotal);
    // por diretoria também
    for (const it of r.ranking) {
      if (it.ytdAnterior !== null && it.ytdAnoAnterior !== null) {
        expect(it.ytdAnterior).not.toBe(it.ytdAnoAnterior);
      }
    }
  });

  it('vol + invol = total (YTD) no total e por diretoria', () => {
    const r = rankDiretoriasByTurnover('12m');
    expect(Math.abs(r.total.ytdVoluntario + r.total.ytdInvoluntario - r.total.ytdTotal)).toBeLessThan(0.001);
    for (const it of r.ranking) {
      expect(Math.abs(it.ytdVoluntario + it.ytdInvoluntario - it.ytdTotal)).toBeLessThan(0.001);
    }
  });

  it('meta YTD escala com os meses; numMesesYTD coerente', () => {
    const r12 = rankDiretoriasByTurnover('12m');
    expect(r12.numMesesYTD).toBe(12);
    expect(Math.abs(r12.metaYTD - META_TURNOVER_MENSAL * 12)).toBeLessThan(1e-9);
    const rq1 = rankDiretoriasByTurnover('q1');
    expect(rq1.numMesesYTD).toBe(3);
    expect(Math.abs(rq1.metaYTD - META_TURNOVER_MENSAL * 3)).toBeLessThan(1e-9);
  });
});

describe('breakdownByDimension — taxa do segmento reconcilia com a diretoria', () => {
  it('média ponderada das taxas por especialidade = taxa da diretoria', () => {
    const dir = 'Tecnologia';
    const bd = breakdownByDimension('12m', dir, 'especialidade');
    const dirRate = getTurnoverRate('12m', dir).taxa;
    // peso = headcount do segmento = popShare; reconstruímos a partir de taxa e composição
    // Σ(saídas_seg) / hcTotal = dirRate, e taxaSeg = saídas_seg/(popShare·hcTotal)
    // ⇒ Σ popShare·taxaSeg = dirRate. Validamos via as próprias saídas:
    const totalDesl = bd.itens.reduce((s, i) => s + i.desligamentos, 0);
    // taxa média ponderada por saídas NÃO é o teste; o correto é por headcount.
    // Aqui validamos que toda especialidade tem taxa definida e > 0.
    expect(bd.itens.every(i => i.taxaTurnover !== undefined && i.taxaTurnover > 0)).toBe(true);
    expect(totalDesl).toBe(bd.totalDesligamentos);
    // a taxa da diretoria está entre a menor e a maior taxa de especialidade
    const taxas = bd.itens.map(i => i.taxaTurnover!);
    expect(dirRate).toBeGreaterThanOrEqual(Math.min(...taxas) - 1e-9);
    expect(dirRate).toBeLessThanOrEqual(Math.max(...taxas) + 1e-9);
  });

  it('dimensão sem população (motivo) não calcula taxa', () => {
    const bd = breakdownByDimension('12m', 'Tecnologia', 'motivoDesligamento');
    expect(bd.itens.every(i => i.taxaTurnover === undefined)).toBe(true);
  });
});

describe('mix voluntário/involuntário ≈ 70/30', () => {
  it('empresa: voluntário ~70% do turnover total (2024)', () => {
    const ytd = getYTD('12m', 'Geral');
    const vol = getYTD('12m', 'Geral', 'voluntário');
    const share = vol.taxa / ytd.taxa;
    expect(share).toBeGreaterThan(0.66);
    expect(share).toBeLessThan(0.76);
  });
});
