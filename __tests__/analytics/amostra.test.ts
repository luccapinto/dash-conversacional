/**
 * Amostra pequena não sai (k-anonimato): recorte de pessoas com n abaixo de MIN_AMOSTRA não
 * devolve valor, n nem as somas do rastreio, em nenhuma função do motor. Vagas e ofertas não
 * identificam ninguém e só ficam marcadas como frágeis.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { INDICADORES, type Indicador } from '@/lib/analytics/catalog';
import { motorCliente } from '@/lib/analytics/cliente';
import { DIRETORIAS, SENIORIDADES } from '@/lib/analytics/dominio';
import { MIN_AMOSTRA, type Motor, type Periodo } from '@/lib/analytics/engine';
import type { Dimensao, Filtros } from '@/lib/analytics/fatos';
import { motorServidor } from '@/lib/analytics/servidor';
import { INDICADORES_PAINEL } from '@/lib/painel/indicadores';
import { janelas } from '@/lib/painel/periodos';

const SET26: Periodo = { inicio: '2026-09', fim: '2026-09' };
const ULTIMOS_12: Periodo = { inicio: '2025-10', fim: '2026-09' };
/** o recorte que isolava uma pessoa (n = 1) e o salário dela */
const UMA_PESSOA: Filtros = { diretoria: 'Gente', senioridade: 'diretoria', pcd: 'não', raca: 'branca', genero: 'homem' };
const SUPRESSAO = { motivo: 'amostra_insuficiente', minimo: MIN_AMOSTRA };
const DE_PESSOAS = INDICADORES.filter(i => i.amostra.pessoas);

let servidor: Motor;

beforeAll(() => {
  servidor = motorServidor();
});

interface Item {
  valor: number | null;
  n: number | null;
  amostraSuficiente: boolean;
  suprimido?: unknown;
  peso?: number | null;
  composicao?: number | null;
  medidas?: object;
}

/** Item suprimido: nenhum número do recorte, só o motivo e o mínimo */
function conferirSuprimido(item: Item) {
  expect(item.valor).toBeNull();
  expect(item.n).toBeNull();
  expect(item.amostraSuficiente).toBe(false);
  expect(item.suprimido).toEqual(SUPRESSAO);
  if ('peso' in item) expect(item.peso).toBeNull();
  if ('composicao' in item) expect(item.composicao).toBeNull();
  if ('medidas' in item) expect(item.medidas).toEqual({});
}

describe('recorte pequeno de pessoas', () => {
  it('a folha de uma pessoa não sai: valor e n nulos, motivo e mínimo, sem somas no rastreio', () => {
    const r = servidor.valor({ indicador: 'folha', periodo: SET26, filtros: UMA_PESSOA });
    conferirSuprimido(r);
    expect(r.status).toBe('sem_dados');
    expect(r.rastreio.n).toBeNull();
    expect(r.rastreio.medidas).toEqual({});
    expect(JSON.stringify(r)).not.toMatch(/44200/);
  });

  it('recorte grande continua devolvendo valor e n', () => {
    const gente = servidor.valor({ indicador: 'folha', periodo: SET26, filtros: { diretoria: 'Gente' } });
    expect(gente).toMatchObject({ valor: 4220400, n: 391, amostraSuficiente: true });
    expect(gente.suprimido).toBeUndefined();
    const pcd = servidor.valor({ indicador: 'folha', periodo: SET26, filtros: { diretoria: 'Tecnologia', pcd: 'sim' } });
    expect(pcd).toMatchObject({ valor: 509700, n: 31, amostraSuficiente: true });
  });

  it('série: ponto pequeno sai vazio, sem medidas; o rastreio do recorte também', () => {
    const s = servidor.serie({ indicador: 'folha', periodo: ULTIMOS_12, filtros: UMA_PESSOA });
    expect(s.pontos).toHaveLength(12);
    for (const p of s.pontos) conferirSuprimido(p);
    expect(s.rastreio.n).toBeNull();
    expect(s.rastreio.medidas).toEqual({});
  });

  it('decompor: segmento pequeno sai vazio, sem peso nem composição, e a reconciliação não entrega a diferença', () => {
    const r = servidor.decompor({ indicador: 'folha', dimensao: 'senioridade', periodo: SET26, filtros: { diretoria: 'Gente' } });
    expect(r.total.valor).toBe(4220400);
    const diretoria = r.segmentos.find(s => s.segmento === 'diretoria')!;
    conferirSuprimido(diretoria);
    const visiveis = r.segmentos.filter(s => s.valor !== null);
    expect(visiveis.length).toBeGreaterThan(2);
    for (const s of visiveis) expect(s.n!).toBeGreaterThanOrEqual(MIN_AMOSTRA);
    expect(Math.abs(r.reconciliacao!.diferenca)).toBeLessThan(1e-6);

    const tudoPequeno = servidor.decompor({ indicador: 'folha', dimensao: 'genero', periodo: SET26, filtros: { diretoria: 'Gente', senioridade: 'diretoria' } });
    conferirSuprimido(tudoPequeno.total);
    for (const s of tudoPequeno.segmentos) conferirSuprimido(s);
    expect(tudoPequeno.reconciliacao).toBeNull();
    expect(tudoPequeno.rastreio.medidas).toEqual({});
  });

  it('cruzar: célula pequena sai vazia', () => {
    const r = servidor.cruzar({ indicador: 'folha', dimensoes: ['senioridade', 'pcd'], periodo: SET26, filtros: { diretoria: 'Gente' } });
    const pequenas = r.celulas.filter(c => c.suprimido);
    expect(pequenas.length).toBeGreaterThan(0);
    for (const c of pequenas) conferirSuprimido(c);
    for (const c of r.celulas.filter(c => !c.suprimido)) expect(c.n!).toBeGreaterThanOrEqual(MIN_AMOSTRA);
  });

  it('comparar: lado pequeno sai vazio e não há diferença nem variação', () => {
    const r = servidor.comparar({ indicador: 'folha', a: { periodo: SET26, filtros: UMA_PESSOA }, b: { periodo: SET26, filtros: { diretoria: 'Gente' } } });
    conferirSuprimido(r.a);
    expect(r.b.valor).toBe(4220400);
    expect(r).toMatchObject({ diferenca: null, variacaoRelativa: null, melhor: null });
  });

  it('impacto: custo de recorte pequeno sai vazio, sem somas no rastreio', () => {
    const r = servidor.impacto({ indicador: 'turnover', periodo: ULTIMOS_12, filtros: { diretoria: 'Gente', senioridade: 'diretoria' } });
    expect(r.aplicavel).toBe(true);
    expect(r.valor).toBeNull();
    expect(r.suprimido).toEqual(SUPRESSAO);
    expect(r.rastreio.n).toBeNull();
    expect(r.rastreio.medidas).toEqual({});
  });

  it('drivers: recorte pequeno não tem fatores nem contagem de eventos no aviso', () => {
    const r = servidor.drivers({ indicador: 'turnover', periodo: ULTIMOS_12, filtros: { diretoria: 'Gente', senioridade: 'diretoria' } });
    conferirSuprimido(r.total);
    expect([...r.fatoresDeRisco, ...r.fatoresProtetivos, ...r.combinacoes]).toEqual([]);
    expect(r.aviso).toBe(`amostra insuficiente (menos de ${MIN_AMOSTRA} pessoas) — valor não divulgado`);
  });

  it('o cubo do painel segue a mesma regra (diretoria × senioridade)', () => {
    conferirSuprimido(motorCliente.valor({ indicador: 'folha', periodo: SET26, filtros: { diretoria: 'Gente', senioridade: 'diretoria' } }));
    const r = motorCliente.decompor({ indicador: 'headcount', dimensao: 'senioridade', periodo: SET26, filtros: { diretoria: 'Gente' } });
    conferirSuprimido(r.segmentos.find(s => s.segmento === 'diretoria')!);
  });

  it('vagas e ofertas não identificam ninguém: amostra pequena fica só marcada como frágil', () => {
    const r = servidor.valor({ indicador: 'time_to_fill', periodo: SET26, filtros: { diretoria: 'Gente' } });
    expect(r.valor).not.toBeNull();
    expect(r.n!).toBeLessThan(MIN_AMOSTRA);
    expect(r.amostraSuficiente).toBe(false);
    expect(r.suprimido).toBeUndefined();
  });
});

describe('varredura', () => {
  /** Todo item com número tem n ≥ mínimo; conta os suprimidos para a varredura não passar no vazio */
  function varrer(ind: Indicador, itens: Item[], onde: string): number {
    let suprimidos = 0;
    for (const item of itens) {
      if (item.valor === null && item.suprimido) {
        conferirSuprimido(item);
        suprimidos++;
      } else {
        expect(item.n, `${ind.id} · ${onde}`).not.toBeNull();
        expect(item.n!, `${ind.id} · ${onde}`).toBeGreaterThanOrEqual(MIN_AMOSTRA);
      }
    }
    return suprimidos;
  }

  it('nenhum recorte de pessoas abaixo do mínimo devolve número (roster: todas as dimensões em Gente, Set/26)', () => {
    let suprimidos = 0;
    for (const ind of DE_PESSOAS) {
      for (const dimensao of servidor.dimensoes(ind.id).filter((d): d is Dimensao => d !== 'diretoria')) {
        const r = servidor.decompor({ indicador: ind.id, dimensao, periodo: SET26, filtros: { diretoria: 'Gente' } });
        suprimidos += varrer(ind, [r.total, ...r.segmentos], `Gente por ${dimensao}`);
      }
    }
    expect(suprimidos).toBeGreaterThan(100);
  });

  it('nem cruzando dimensões sensíveis (gênero, raça, PCD, faixa salarial) em Gente', () => {
    const pares: [Dimensao, Dimensao][] = [['genero', 'raca'], ['senioridade', 'pcd'], ['faixaSalarial', 'genero']];
    let suprimidos = 0;
    for (const ind of DE_PESSOAS) {
      const dims = servidor.dimensoes(ind.id);
      for (const par of pares.filter(p => p.every(d => dims.includes(d)))) {
        const r = servidor.cruzar({ indicador: ind.id, dimensoes: par, periodo: SET26, filtros: { diretoria: 'Gente' } });
        suprimidos += varrer(ind, r.celulas, `Gente por ${par.join(' × ')}`);
      }
    }
    expect(suprimidos).toBeGreaterThan(100);
  });

  it('nem no cubo: diretoria × senioridade, mês a mês', () => {
    let suprimidos = 0;
    for (const ind of DE_PESSOAS.filter(i => motorCliente.dimensoes(i.id).includes('senioridade'))) {
      for (const diretoria of DIRETORIAS) {
        for (const senioridade of SENIORIDADES) {
          const s = motorCliente.serie({ indicador: ind.id, periodo: ULTIMOS_12, filtros: { diretoria, senioridade } });
          suprimidos += varrer(ind, s.pontos.filter(p => p.valor !== null || p.suprimido), `${diretoria} · ${senioridade}`);
        }
      }
    }
    expect(suprimidos).toBeGreaterThan(100);
  });

  it('o painel continua com número: os 25 indicadores, na empresa e nas 6 diretorias', () => {
    for (const ind of INDICADORES_PAINEL) {
      const periodo = janelas(ind, '2026-09').mes!.periodo;
      for (const filtros of [{}, ...DIRETORIAS.map(diretoria => ({ diretoria }))]) {
        const r = motorCliente.valor({ indicador: ind.id, periodo, filtros });
        expect(r.suprimido, `${ind.id} · ${JSON.stringify(filtros)}`).toBeUndefined();
        expect(r.valor, `${ind.id} · ${JSON.stringify(filtros)}`).not.toBeNull();
      }
    }
  });
});
