/**
 * As histórias de docs/narrativa.md emergem dos dados e o detector de sinais as encontra.
 *
 * Cada história confere (1) o indicador que a mostra, (2) o deep dive que revela a causa (motor
 * do servidor, sobre o roster) e (3) o sinal que o detector emite. Os limiares têm folga sobre os
 * valores medidos (anotados em docs/narrativa.md): o teste falha se a história sumir ou mudar de
 * forma, não se um número mudar uma casa decimal.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { IdIndicador } from '@/lib/analytics/catalog';
import { motorCliente as cliente } from '@/lib/analytics/cliente';
import { DIRETORIAS, type Diretoria } from '@/lib/analytics/dominio';
import type { Fator, Motor, Periodo } from '@/lib/analytics/engine';
import type { Dimensao } from '@/lib/analytics/fatos';
import { motorServidor } from '@/lib/analytics/servidor';
import { detectarSinais, type Sinal } from '@/lib/analytics/signals';

const ULTIMOS_12: Periodo = { inicio: '2025-10', fim: '2026-09' };
const JANELA: Periodo = { inicio: '2023-10', fim: '2026-09' };
const ano = (a: number): Periodo => ({ inicio: `${a}-01`, fim: `${a}-12` });

let servidor: Motor;
let empresa: Sinal[];
const porDiretoria = {} as Record<Diretoria, Sinal[]>;

beforeAll(() => {
  servidor = motorServidor();
  empresa = detectarSinais(cliente, { periodo: ULTIMOS_12 });
  for (const d of DIRETORIAS) porDiretoria[d] = detectarSinais(cliente, { periodo: ULTIMOS_12, diretoria: d });
});

function valor(indicador: IdIndicador, diretoria?: Diretoria, periodo = ULTIMOS_12): number {
  return cliente.valor({ indicador, periodo, filtros: diretoria ? { diretoria } : {} }).valor!;
}

function mediana(v: number[]): number {
  const o = [...v].sort((a, b) => a - b);
  return o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2;
}

/** Posição (1 = primeiro) do sinal na lista; Infinity se não estiver */
function posicao(lista: Sinal[], id: string): number {
  const i = lista.findIndex(s => s.id === id);
  return i < 0 ? Infinity : i + 1;
}

function sinal(lista: Sinal[], id: string): Sinal {
  const s = lista.find(x => x.id === id);
  expect(s, `sinal ${id} não encontrado`).toBeDefined();
  return s!;
}

const tem = (fatores: Fator[], dimensao: Dimensao, valor: string) => fatores.some(f => f.segmento[dimensao] === valor);

function taxaPorSegmento(indicador: IdIndicador, dimensao: Dimensao, periodo: Periodo, filtros: Partial<Record<Dimensao, string>>): Record<string, number> {
  const r = servidor.decompor({ indicador, dimensao, periodo, filtros });
  return Object.fromEntries(r.segmentos.map(s => [s.segmento, s.valor!]));
}

describe('L1. Fuga de talento em Tecnologia', () => {
  it('turnover lamentado de Tecnologia é o maior, perto de 2× a mediana das demais; o voluntário subiu de 2024 para 2025', () => {
    const tech = valor('turnover_lamentado', 'Tecnologia');
    const demais = DIRETORIAS.filter(d => d !== 'Tecnologia').map(d => valor('turnover_lamentado', d));
    expect(tech).toBeGreaterThan(Math.max(...demais));
    expect(tech).toBeGreaterThan(1.8 * mediana(demais));
    expect(valor('turnover_voluntario', 'Tecnologia', ano(2025))).toBeGreaterThan(1.25 * valor('turnover_voluntario', 'Tecnologia', ano(2024)));
  });

  it('deep dive: piso e Q1 da faixa salarial são fatores de risco; o piso sai 3× mais que o teto', () => {
    const d = servidor.drivers({ indicador: 'turnover_lamentado', periodo: ULTIMOS_12, filtros: { diretoria: 'Tecnologia' } });
    expect(tem(d.fatoresDeRisco, 'faixaSalarial', 'piso')).toBe(true);
    expect(tem(d.fatoresDeRisco, 'faixaSalarial', 'q1')).toBe(true);
    const faixa = taxaPorSegmento('turnover', 'faixaSalarial', ULTIMOS_12, { diretoria: 'Tecnologia' });
    expect(faixa.piso).toBeGreaterThan(3 * faixa.teto);
  });

  it('detector: fora da meta e outlier desfavorável, nos 3 primeiros sinais de Tecnologia', () => {
    const tech = porDiretoria.Tecnologia;
    expect(posicao(tech, 'fora_da_meta:turnover_lamentado:Tecnologia')).toBeLessThanOrEqual(3);
    expect(posicao(tech, 'outlier_entre_diretorias:turnover_lamentado:Tecnologia')).toBeLessThanOrEqual(3);
    expect(sinal(tech, 'outlier_entre_diretorias:turnover_lamentado:Tecnologia').direcao).toBe('desfavoravel');
  });
});

describe('L2. Pico de janeiro em Distribuição & Assessoria', () => {
  const DA = 'Distribuição & Assessoria';

  it('nos três janeiros o turnover mensal passa de 3× a mediana dos outros meses, com maioria involuntária', () => {
    const pontos = cliente.serie({ indicador: 'turnover', periodo: JANELA, filtros: { diretoria: DA }, granularidade: 'mes' }).pontos;
    const janeiros = pontos.filter(p => p.periodo.inicio.endsWith('-01'));
    expect(janeiros.map(p => p.rotulo)).toEqual(['Jan/24', 'Jan/25', 'Jan/26']);
    const base = mediana(pontos.filter(p => !p.periodo.inicio.endsWith('-01')).map(p => p.valor!));
    for (const j of janeiros) {
      expect(j.valor!, j.rotulo).toBeGreaterThan(3 * base);
      const involuntario = valor('turnover_involuntario', DA, j.periodo);
      expect(involuntario / j.valor!, j.rotulo).toBeGreaterThan(0.5);
    }
  });

  it('deep dive: no corte de janeiro, quem está abaixo do esperado sai 4× mais do que quem está dentro', () => {
    const perf = taxaPorSegmento('turnover_involuntario', 'performance', { inicio: '2026-01', fim: '2026-01' }, { diretoria: DA });
    expect(perf.abaixo).toBeGreaterThan(4 * perf.dentro);
  });

  it('detector: sazonalidade com os três picos, no topo de D&A, e o pico não vira quebra de tendência', () => {
    const da = porDiretoria[DA];
    const s = sinal(da, `sazonalidade:turnover:${DA}`);
    expect(s.pontos.map(p => p.rotulo)).toEqual(['Jan/24', 'Jan/25', 'Jan/26']);
    expect(posicao(da, s.id)).toBe(1);
    expect(posicao(da, `quebra_de_tendencia:turnover:${DA}`)).toBe(Infinity);
    expect(posicao(da, `piora_acelerada:turnover:${DA}`)).toBe(Infinity);
  });
});

describe('L3 + N1. Reorganização de Operações: o eNPS cai antes do turnover', () => {
  it('eNPS positivo em todos os ciclos até Dez/24 e negativo em todos desde Mar/25; turnover dos últimos 12 meses ≥ 1,3× o de 2024', () => {
    const ciclos = cliente.serie({ indicador: 'enps', periodo: JANELA, filtros: { diretoria: 'Operações' } }).pontos;
    for (const c of ciclos) {
      if (c.periodo.fim <= '2024-12') expect(c.valor!, c.rotulo).toBeGreaterThan(0);
      else expect(c.valor!, c.rotulo).toBeLessThan(0);
    }
    expect(valor('turnover', 'Operações')).toBeGreaterThan(1.3 * valor('turnover', 'Operações', ano(2024)));
  });

  it('deep dive: eNPS detrator e 2+ trocas de gestor são fatores de risco do turnover voluntário', () => {
    const periodo = { inicio: '2025-05', fim: '2026-09' };
    const d = servidor.drivers({ indicador: 'turnover_voluntario', periodo, filtros: { diretoria: 'Operações' } });
    expect(tem(d.fatoresDeRisco, 'enps', 'detrator')).toBe(true);
    expect(tem(d.fatoresDeRisco, 'trocasGestor', '2+')).toBe(true);
    const enps = taxaPorSegmento('turnover_voluntario', 'enps', periodo, { diretoria: 'Operações' });
    expect(enps.detrator).toBeGreaterThan(3 * enps.promotor);
  });

  it('detector: eNPS antecede o turnover voluntário (mudança em Mar/25, 1 a 6 meses antes); o eNPS lidera os sinais de Operações', () => {
    const ops = porDiretoria.Operações;
    const s = sinal(ops, 'indicador_antecedente:enps>turnover_voluntario:Operações');
    expect(s.evidencia).toMatch(/mudança de patamar em Mar\/25/);
    expect(s.evidencia).toMatch(/, [1-6] (mês|meses) depois\.$/);
    expect(ops[0].indicadores).toContain('enps');
    expect(posicao(ops, 'quebra_de_tendencia:enps:Operações')).toBeLessThanOrEqual(3);
  });
});

describe('N2. Vagas abertas em Tecnologia pressionam horas extras e absenteísmo', () => {
  it('vagas abertas mais que dobram; time to fill ≥ 1,4× o da empresa; horas extras e absenteísmo de Tecnologia são os maiores', () => {
    const vagasInicio = valor('vagas_abertas', 'Tecnologia', { inicio: '2024-01', fim: '2024-03' });
    const vagasPico = valor('vagas_abertas', 'Tecnologia', { inicio: '2025-07', fim: '2025-09' });
    expect(vagasPico).toBeGreaterThan(2 * vagasInicio);
    expect(valor('time_to_fill', 'Tecnologia')).toBeGreaterThan(1.4 * valor('time_to_fill'));
    for (const ind of ['horas_extras_pc', 'absenteismo'] as const) {
      const tech = valor(ind, 'Tecnologia');
      for (const d of DIRETORIAS) if (d !== 'Tecnologia') expect(tech, `${ind} ${d}`).toBeGreaterThan(valor(ind, d));
    }
  });

  it('impacto: o custo mensal das horas extras de Tecnologia nos últimos 12 meses passa de 1,5× o do 1º semestre de 2024, antes do acúmulo de vagas', () => {
    const agora = cliente.impacto({ indicador: 'horas_extras_pc', periodo: ULTIMOS_12, filtros: { diretoria: 'Tecnologia' } });
    const antes = cliente.impacto({ indicador: 'horas_extras_pc', periodo: { inicio: '2024-01', fim: '2024-06' }, filtros: { diretoria: 'Tecnologia' } });
    expect(agora.valor! / 12).toBeGreaterThan(1.5 * (antes.valor! / 6));
  });

  it('detector: vagas abertas → horas extras e horas extras → absenteísmo em Tecnologia', () => {
    const tech = porDiretoria.Tecnologia;
    expect(posicao(tech, 'indicador_antecedente:vagas_abertas>horas_extras_pc:Tecnologia')).toBeLessThanOrEqual(8);
    expect(posicao(tech, 'indicador_antecedente:horas_extras_pc>absenteismo:Tecnologia')).toBeLessThanOrEqual(8);
    expect(posicao(tech, 'outlier_entre_diretorias:time_to_fill:Tecnologia')).toBeLessThanOrEqual(8);
  });
});

describe('N3. Teto de vidro', () => {
  it('base perto da paridade; liderança abaixo de 35% de mulheres', () => {
    expect(valor('mulheres')).toBeGreaterThan(40);
    expect(valor('mulheres')).toBeLessThan(55);
    expect(valor('mulheres_lideranca')).toBeLessThan(35);
  });

  it('deep dive: de sênior para gerência, mulheres são promovidas a menos de 70% da taxa dos homens; em pleno, não', () => {
    const senior = taxaPorSegmento('taxa_promocao', 'genero', JANELA, { senioridade: 'sênior' });
    expect(senior.mulher / senior.homem).toBeLessThan(0.7);
    const pleno = taxaPorSegmento('taxa_promocao', 'genero', JANELA, { senioridade: 'pleno' });
    expect(pleno.mulher / pleno.homem).toBeGreaterThan(0.8);
    expect(pleno.mulher / pleno.homem).toBeLessThan(1.25);
  });

  it('detector: mulheres na liderança fora da meta na empresa', () => {
    expect(sinal(empresa, 'fora_da_meta:mulheres_lideranca:empresa').direcao).toBe('desfavoravel');
  });
});

describe('N4. Onboarding fraco em Produtos & Plataforma', () => {
  const PP = 'Produtos & Plataforma';

  it('early attrition de Produtos é a maior, ≥ 1,3× a segunda, e ≥ 2× a de 2024', () => {
    const pp = valor('early_attrition', PP);
    const demais = DIRETORIAS.filter(d => d !== PP).map(d => valor('early_attrition', d));
    expect(pp).toBeGreaterThan(1.3 * Math.max(...demais));
    expect(pp).toBeGreaterThan(2 * valor('early_attrition', PP, ano(2024)));
  });

  it('deep dive: onboarding completo é fator protetivo; sem onboarding, a saída no 1º ano é ≥ 2,5×', () => {
    const d = servidor.drivers({ indicador: 'early_attrition', periodo: ULTIMOS_12, filtros: { diretoria: PP } });
    expect(tem(d.fatoresProtetivos, 'onboarding', 'completo')).toBe(true);
    const onb = taxaPorSegmento('early_attrition', 'onboarding', ULTIMOS_12, { diretoria: PP });
    expect(onb.incompleto).toBeGreaterThan(2.5 * onb.completo);
  });

  it('detector: early attrition lidera os sinais de Produtos e é outlier desfavorável', () => {
    const pp = porDiretoria[PP];
    expect(pp[0].indicadores).toContain('early_attrition');
    expect(sinal(pp, `outlier_entre_diretorias:early_attrition:${PP}`).direcao).toBe('desfavoravel');
  });
});

describe('N5. Mobilidade interna protege a retenção em Financeiro & Risco', () => {
  const FR = 'Financeiro & Risco';

  it('mobilidade e preenchimento interno ≥ 2× os da empresa; turnover abaixo do da empresa', () => {
    expect(valor('mobilidade_interna', FR)).toBeGreaterThan(2 * valor('mobilidade_interna'));
    expect(valor('preenchimento_interno', FR)).toBeGreaterThan(2 * valor('preenchimento_interno'));
    expect(valor('turnover', FR)).toBeLessThan(valor('turnover'));
  });

  it('deep dive: ter se movimentado nos últimos 12 meses é fator protetivo do turnover voluntário', () => {
    const d = servidor.drivers({ indicador: 'turnover_voluntario', periodo: JANELA, filtros: { diretoria: FR } });
    expect(tem(d.fatoresProtetivos, 'mobilidadeRecente', 'sim')).toBe(true);
    const mob = taxaPorSegmento('turnover_voluntario', 'mobilidadeRecente', JANELA, { diretoria: FR });
    expect(mob.sim).toBeLessThan(0.7 * mob['não']);
  });

  it('detector: mobilidade e preenchimento interno de F&R são os dois primeiros sinais da diretoria, favoráveis', () => {
    const fr = porDiretoria[FR];
    for (const ind of ['mobilidade_interna', 'preenchimento_interno']) {
      const id = `outlier_entre_diretorias:${ind}:${FR}`;
      expect(posicao(fr, id), id).toBeLessThanOrEqual(2);
      expect(sinal(fr, id).direcao).toBe('favoravel');
    }
  });
});

describe('Contexto (não plantado)', () => {
  it('PcD abaixo da cota legal de 5% e pessoas negras sub-representadas na liderança', () => {
    expect(valor('pcd')).toBeLessThan(5);
    expect(valor('negros_lideranca')).toBeLessThan(valor('negros'));
    expect(sinal(empresa, 'fora_da_meta:pcd:empresa').direcao).toBe('desfavoravel');
  });
});

describe('visão da empresa (lente CHRO)', () => {
  const da = (d: Diretoria, ...inds: IdIndicador[]) => (s: Sinal) => s.diretoria === d && s.indicadores.some(i => inds.includes(i));
  const HISTORIAS: Record<string, (s: Sinal) => boolean> = {
    L1: da('Tecnologia', 'turnover_lamentado', 'turnover_voluntario'),
    L2: da('Distribuição & Assessoria', 'turnover', 'turnover_involuntario'),
    'L3/N1': da('Operações', 'enps', 'turnover_voluntario'),
    N2: da('Tecnologia', 'vagas_abertas', 'time_to_fill', 'horas_extras_pc', 'absenteismo'),
    N4: da('Produtos & Plataforma', 'early_attrition'),
    N5: da('Financeiro & Risco', 'mobilidade_interna', 'preenchimento_interno'),
  };

  it('toda história plantada, menos o teto de vidro, tem um sinal entre os 15 primeiros', () => {
    const topo = empresa.slice(0, 15);
    for (const [historia, pertence] of Object.entries(HISTORIAS)) expect(topo.some(pertence), historia).toBe(true);
  });
});
