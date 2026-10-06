/**
 * Motor de consulta: funções genéricas sobre qualquer indicador do catálogo, nos dois lados
 * (cubo no client, roster no servidor). Casos reais do dataset da Verta S.A.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { CATALOGO, INDICADORES, type IdIndicador } from '@/lib/analytics/catalog';
import { GANHO_COMBINACAO, MIN_AMOSTRA, ErroConsulta, type Periodo } from '@/lib/analytics/engine';
import { motorCliente } from '@/lib/analytics/cliente';
import { motorServidor } from '@/lib/analytics/servidor';
import type { Motor } from '@/lib/analytics/engine';

const ULTIMOS_12: Periodo = { inicio: '2025-10', fim: '2026-09' };
const JANELA: Periodo = { inicio: '2023-10', fim: '2026-09' };

let servidor: Motor;

beforeAll(() => {
  servidor = motorServidor();
});

describe('valor', () => {
  it('cubo e roster dão o mesmo número para todo indicador nos recortes do cubo', () => {
    for (const ind of INDICADORES) {
      for (const filtros of [{}, { diretoria: 'Tecnologia' }, { diretoria: 'Operações', senioridade: 'pleno' }]) {
        const valido = Object.keys(filtros).every(d => ind.dimensoes.includes(d as never));
        if (!valido) continue;
        const a = motorCliente.valor({ indicador: ind.id, periodo: ULTIMOS_12, filtros });
        const b = servidor.valor({ indicador: ind.id, periodo: ULTIMOS_12, filtros });
        expect(a.valor, `${ind.id} ${JSON.stringify(filtros)}`).toBeCloseTo(b.valor!, 9);
        expect(a.n).toBeCloseTo(b.n!, 9);
      }
    }
  });

  it('traz status contra a meta e rastreio completo (fórmula, parâmetros, período efetivo, n)', () => {
    const r = motorCliente.valor({ indicador: 'turnover', periodo: ULTIMOS_12, filtros: { diretoria: 'Tecnologia' } });
    expect(r.meta).toBe(24);
    expect(r.status).toBe('fora');
    expect(r.rastreio.indicador).toBe('turnover');
    expect(r.rastreio.formula).toBe(CATALOGO.turnover.formula);
    expect(r.rastreio.parametros).toEqual({ periodo: ULTIMOS_12, filtros: { diretoria: 'Tecnologia' } });
    expect(r.rastreio.periodoEfetivo).toEqual({ inicio: '2025-10', fim: '2026-09', meses: 12, leitura: 'soma dos meses' });
    expect(r.rastreio.fonte).toBe('cubo');
    expect(r.rastreio.medidas.desl).toBeGreaterThan(0);
    expect(r.valor).toBeCloseTo(r.rastreio.medidas.desl! / r.rastreio.medidas.hcIni! * 1200, 9);
    expect(r.n).toBeCloseTo(r.rastreio.medidas.hcIni! / 12, 9);
  });

  it('estoques leem só o último mês; eNPS lê só os meses de ciclo', () => {
    const hc = motorCliente.valor({ indicador: 'headcount', periodo: ULTIMOS_12 });
    expect(hc.rastreio.periodoEfetivo).toEqual({ inicio: '2026-09', fim: '2026-09', meses: 1, leitura: 'fim do período' });
    const enps = motorCliente.valor({ indicador: 'enps', periodo: { inicio: '2026-01', fim: '2026-05' } });
    expect(enps.rastreio.periodoEfetivo).toEqual({ inicio: '2026-03', fim: '2026-03', meses: 1, leitura: 'ciclos de eNPS' });
    const semCiclo = motorCliente.valor({ indicador: 'enps', periodo: { inicio: '2026-01', fim: '2026-02' } });
    expect(semCiclo.valor).toBeNull();
    expect(semCiclo.status).toBe('sem_dados');
  });

  it('guardrail: recorte pequeno de pessoas não é divulgado', () => {
    const r = motorCliente.valor({ indicador: 'turnover', periodo: ULTIMOS_12, filtros: { diretoria: 'Gente', senioridade: 'diretoria' } });
    expect(r).toMatchObject({ valor: null, n: null, amostraSuficiente: false, status: 'sem_dados' });
    expect(motorCliente.valor({ indicador: 'turnover', periodo: ULTIMOS_12 }).amostraSuficiente).toBe(true);
  });

  it('rejeita dimensão que o indicador ou a fonte não aceitam, e período fora da janela', () => {
    expect(() => servidor.valor({ indicador: 'mulheres', periodo: ULTIMOS_12, filtros: { genero: 'mulher' } })).toThrow(ErroConsulta);
    expect(() => motorCliente.valor({ indicador: 'turnover', periodo: ULTIMOS_12, filtros: { genero: 'mulher' } })).toThrow(ErroConsulta);
    expect(() => motorCliente.valor({ indicador: 'turnover', periodo: { inicio: '2026-09', fim: '2026-01' } })).toThrow(ErroConsulta);
    expect(() => motorCliente.valor({ indicador: 'turnover', periodo: { inicio: '2022-01', fim: '2026-01' } })).toThrow(ErroConsulta);
    expect(() => motorCliente.valor({ indicador: 'nao_existe' as IdIndicador, periodo: ULTIMOS_12 })).toThrow(ErroConsulta);
  });
});

describe('serie', () => {
  it('mensal: 36 pontos, e numeradores/denominadores dos pontos reconstroem o valor da janela', () => {
    const s = motorCliente.serie({ indicador: 'turnover', periodo: JANELA, filtros: { diretoria: 'Operações' } });
    expect(s.pontos).toHaveLength(36);
    expect(s.pontos[0].periodo).toEqual({ inicio: '2023-10', fim: '2023-10' });
    expect(s.pontos[0].rotulo).toBe('Out/23');
    const num = s.pontos.reduce((a, p) => a + p.medidas.desl!, 0);
    const den = s.pontos.reduce((a, p) => a + p.medidas.hcIni!, 0);
    const total = motorCliente.valor({ indicador: 'turnover', periodo: JANELA, filtros: { diretoria: 'Operações' } });
    expect(num / den * 1200).toBeCloseTo(total.valor!, 9);
  });

  it('contagens somam o total; estoques acompanham o mês', () => {
    const adm = motorCliente.serie({ indicador: 'admissoes', periodo: ULTIMOS_12 });
    expect(adm.pontos.reduce((a, p) => a + p.valor!, 0)).toBe(motorCliente.valor({ indicador: 'admissoes', periodo: ULTIMOS_12 }).valor);
    const hc = motorCliente.serie({ indicador: 'headcount', periodo: ULTIMOS_12 });
    expect(hc.pontos[11].valor).toBe(motorCliente.valor({ indicador: 'headcount', periodo: ULTIMOS_12 }).valor);
    expect(hc.pontos[0].valor).toBe(motorCliente.valor({ indicador: 'headcount', periodo: { inicio: '2025-10', fim: '2025-10' } }).valor);
  });

  it('eNPS é trimestral por padrão; granularidade anual agrega por ano-calendário', () => {
    const e = motorCliente.serie({ indicador: 'enps', periodo: JANELA });
    expect(e.granularidade).toBe('trimestre');
    expect(e.pontos).toHaveLength(12);
    expect(e.pontos[0].rotulo).toBe('4T23');
    const anual = motorCliente.serie({ indicador: 'turnover', periodo: JANELA, granularidade: 'ano' });
    expect(anual.pontos.map(p => p.rotulo)).toEqual(['2023', '2024', '2025', '2026']);
    expect(anual.pontos[1].periodo).toEqual({ inicio: '2024-01', fim: '2024-12' });
  });
});

describe('decompor', () => {
  const casos: [IdIndicador, string][] = [
    ['turnover', 'diretoria'], ['turnover_voluntario', 'genero'], ['early_attrition', 'onboarding'],
    ['absenteismo', 'faixaEtaria'], ['enps', 'trocasGestor'], ['time_to_fill', 'senioridade'],
    ['mulheres_lideranca', 'diretoria'], ['tempo_medio_casa', 'raca'],
  ];
  for (const [indicador, dimensao] of casos) {
    it(`${indicador} por ${dimensao}: média ponderada dos segmentos = total`, () => {
      const r = servidor.decompor({ indicador, dimensao: dimensao as never, periodo: ULTIMOS_12 });
      expect(r.segmentos.length).toBeGreaterThan(1);
      expect(r.reconciliacao!.diferenca).toBeCloseTo(0, 9);
      // segmento com menos de MIN_AMOSTRA pessoas não é divulgado (absenteísmo, 55+): a conta pública
      // não fecha sem ele, e a reconciliação acima (do motor, com o valor bruto) é que cobre o caso
      if (r.segmentos.some(s => s.suprimido)) return;
      const pesos = r.segmentos.reduce((a, s) => a + s.peso!, 0);
      expect(pesos).toBeCloseTo(1, 9);
      const ponderada = r.segmentos.reduce((a, s) => a + s.peso! * (s.valor ?? 0), 0);
      expect(ponderada).toBeCloseTo(r.total.valor!, 9);
    });
  }

  it('contagens: segmentos somam o total', () => {
    const r = motorCliente.decompor({ indicador: 'headcount', dimensao: 'diretoria', periodo: ULTIMOS_12 });
    expect(r.segmentos.reduce((a, s) => a + s.valor!, 0)).toBe(r.total.valor);
  });

  it('taxa por segmento, não só composição: em Tecnologia o piso da faixa sai muito mais que o teto', () => {
    const r = servidor.decompor({ indicador: 'turnover', dimensao: 'faixaSalarial', periodo: ULTIMOS_12, filtros: { diretoria: 'Tecnologia' } });
    const piso = r.segmentos.find(s => s.segmento === 'piso')!;
    const teto = r.segmentos.find(s => s.segmento === 'teto')!;
    expect(piso.valor!).toBeGreaterThan(teto.valor! * 2);
    // composição (fatia das saídas) e peso (fatia do quadro) são coisas diferentes
    expect(piso.composicao!).toBeGreaterThan(piso.peso!);
  });

  it('guardrail em toda fatia: a pequena não é divulgada', () => {
    const r = servidor.decompor({ indicador: 'turnover', dimensao: 'senioridade', periodo: ULTIMOS_12, filtros: { diretoria: 'Gente' } });
    for (const s of r.segmentos) expect(s.amostraSuficiente).toBe(s.n !== null && s.n >= MIN_AMOSTRA);
    expect(r.segmentos.some(s => s.suprimido && s.valor === null && s.n === null)).toBe(true);
  });

  it('o cubo só decompõe pelas dimensões que tem', () => {
    expect(motorCliente.dimensoes('turnover')).toEqual(['diretoria', 'senioridade']);
    expect(() => motorCliente.decompor({ indicador: 'turnover', dimensao: 'genero', periodo: ULTIMOS_12 })).toThrow(ErroConsulta);
  });
});

describe('cruzar', () => {
  // genero × faixaSalarial: todas as células de Tecnologia passam do mínimo (em performance ×
  // faixaSalarial a linha "abaixo" tem menos de 30 pessoas por faixa e não é divulgada)
  it('células reconciliam com o total e trazem n', () => {
    const r = servidor.cruzar({ indicador: 'turnover', dimensoes: ['genero', 'faixaSalarial'], periodo: ULTIMOS_12, filtros: { diretoria: 'Tecnologia' } });
    expect(r.celulas.length).toBe(10);
    const ponderada = r.celulas.reduce((a, c) => a + c.peso! * (c.valor ?? 0), 0);
    expect(ponderada).toBeCloseTo(r.total.valor!, 9);
    for (const c of r.celulas) expect(c.n!).toBeGreaterThanOrEqual(MIN_AMOSTRA);
  });

  it('em Tecnologia, alta performance no piso da faixa sai mais que a média', () => {
    const r = servidor.cruzar({ indicador: 'turnover', dimensoes: ['performance', 'faixaSalarial'], periodo: ULTIMOS_12, filtros: { diretoria: 'Tecnologia' } });
    expect(r.celulas.length).toBe(15);
    const alta = r.celulas.find(c => c.segmento.performance === 'acima' && c.segmento.faixaSalarial === 'piso')!;
    expect(alta.valor!).toBeGreaterThan(r.total.valor!);
  });

  it('exige duas dimensões diferentes', () => {
    expect(() => servidor.cruzar({ indicador: 'turnover', dimensoes: ['genero', 'genero'], periodo: ULTIMOS_12 })).toThrow(ErroConsulta);
  });
});

describe('comparar', () => {
  it('Tecnologia vs Gente: diferença, variação e qual lado está melhor pela polaridade', () => {
    const r = motorCliente.comparar({
      indicador: 'turnover',
      a: { periodo: ULTIMOS_12, filtros: { diretoria: 'Tecnologia' } },
      b: { periodo: ULTIMOS_12, filtros: { diretoria: 'Gente' } },
    });
    expect(r.a.valor!).toBeGreaterThan(r.b.valor!);
    expect(r.diferenca).toBeCloseTo(r.a.valor! - r.b.valor!, 9);
    expect(r.variacaoRelativa).toBeCloseTo((r.a.valor! - r.b.valor!) / r.b.valor! * 100, 9);
    expect(r.melhor).toBe('b');
  });

  it('YoY do mesmo recorte', () => {
    const r = motorCliente.comparar({
      indicador: 'turnover',
      a: { periodo: { inicio: '2025-04', fim: '2026-03' }, filtros: { diretoria: 'Operações' } },
      b: { periodo: { inicio: '2024-04', fim: '2025-03' }, filtros: { diretoria: 'Operações' } },
    });
    expect(r.diferenca).toBeGreaterThan(0);
    expect(r.melhor).toBe('b');
  });
});

describe('drivers', () => {
  it('só para taxas de evento', () => {
    expect(() => servidor.drivers({ indicador: 'headcount', periodo: ULTIMOS_12 })).toThrow(ErroConsulta);
  });

  it('fatores de risco têm lift ≥ 1,3 e amostra suficiente; protetivos têm lift ≤ 0,77', () => {
    const r = servidor.drivers({ indicador: 'turnover', periodo: JANELA });
    expect(r.fatoresDeRisco.length).toBeGreaterThan(0);
    expect(r.fatoresProtetivos.length).toBeGreaterThan(0);
    for (const f of r.fatoresDeRisco) {
      expect(f.lift).toBeGreaterThanOrEqual(1.3);
      expect(f.n).toBeGreaterThanOrEqual(MIN_AMOSTRA);
      expect(f.valor).toBeCloseTo(r.total.valor! * f.lift, 9);
    }
    for (const f of r.fatoresProtetivos) expect(f.lift).toBeLessThanOrEqual(0.77);
    // ordenados do mais forte para o mais fraco
    for (let i = 1; i < r.fatoresDeRisco.length; i++) expect(r.fatoresDeRisco[i - 1].lift).toBeGreaterThanOrEqual(r.fatoresDeRisco[i].lift);
  });

  it('fatores são atributos isolados; combinações são pares que dizem mais do que cada atributo sozinho', () => {
    const r = servidor.drivers({ indicador: 'turnover', periodo: JANELA });
    for (const f of [...r.fatoresDeRisco, ...r.fatoresProtetivos]) expect(Object.keys(f.segmento)).toHaveLength(1);
    expect(r.combinacoes.length).toBeGreaterThan(0);
    for (const c of r.combinacoes) {
      const dims = Object.keys(c.segmento) as (keyof typeof c.segmento)[];
      expect(dims).toHaveLength(2);
      expect(c.n).toBeGreaterThanOrEqual(2 * MIN_AMOSTRA);
      const sozinhos = dims.map(d => servidor.decompor({ indicador: 'turnover', dimensao: d, periodo: JANELA }).segmentos.find(s => s.segmento === c.segmento[d])!.valor! / r.total.valor!);
      if (c.lift > 1) expect(c.lift).toBeGreaterThanOrEqual(Math.max(...sozinhos) * GANHO_COMBINACAO - 1e-9);
      else expect(c.lift).toBeLessThanOrEqual(Math.min(...sozinhos) / GANHO_COMBINACAO + 1e-9);
    }
  });

  it('não roda no cliente (o cubo não tem os atributos individuais)', () => {
    expect('drivers' in motorCliente).toBe(false);
  });
});

describe('impacto', () => {
  it('turnover: custo de reposição = custo estimado do turnover', () => {
    const r = motorCliente.impacto({ indicador: 'turnover', periodo: ULTIMOS_12 });
    expect(r.aplicavel).toBe(true);
    expect(r.valor).toBe(motorCliente.valor({ indicador: 'custo_turnover', periodo: ULTIMOS_12 }).valor);
    expect(r.metodologia).toContain('6 salários');
  });

  it('voluntário + involuntário = total', () => {
    const v = motorCliente.impacto({ indicador: 'turnover_voluntario', periodo: ULTIMOS_12 }).valor!;
    const i = motorCliente.impacto({ indicador: 'turnover_involuntario', periodo: ULTIMOS_12 }).valor!;
    expect(v + i).toBe(motorCliente.impacto({ indicador: 'turnover', periodo: ULTIMOS_12 }).valor);
  });

  it('indicador sem custo associado responde que não se aplica', () => {
    const r = motorCliente.impacto({ indicador: 'headcount', periodo: ULTIMOS_12 });
    expect(r.aplicavel).toBe(false);
    expect(r.valor).toBeNull();
  });
});
