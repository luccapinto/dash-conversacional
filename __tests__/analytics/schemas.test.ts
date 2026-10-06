/**
 * Schemas JSON dos argumentos do motor (viram parâmetros das tools do agente na fase 2) e o
 * validador que os aplica.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { Motor } from '@/lib/analytics/engine';
import { ESQUEMAS_ARGUMENTOS, validarArgs, validarEsquema, type JsonSchema } from '@/lib/analytics/schemas';
import { motorServidor } from '@/lib/analytics/servidor';

const periodo = { inicio: '2025-10', fim: '2026-09' };
let motor: Motor;

// monta a tabela de fatos do roster uma vez (é pesado)
beforeAll(() => {
  motor = motorServidor();
});

describe('esquemas', () => {
  it('um esquema por função do motor, serializável em JSON e fechado a propriedades extras', () => {
    expect(Object.keys(ESQUEMAS_ARGUMENTOS).sort()).toEqual(['comparar', 'cruzar', 'decompor', 'drivers', 'impacto', 'serie', 'valor']);
    for (const esquema of Object.values(ESQUEMAS_ARGUMENTOS)) {
      expect(JSON.parse(JSON.stringify(esquema))).toEqual(esquema);
      expect(esquema.type).toBe('object');
      expect(esquema.additionalProperties).toBe(false);
      expect(esquema.description!.length).toBeGreaterThan(20);
    }
  });
});

describe('validarArgs', () => {
  it('aceita chamadas válidas, e o motor responde a elas', () => {
    const chamadas = [
      ['valor', { indicador: 'turnover', periodo, filtros: { diretoria: 'Tecnologia' } }],
      ['serie', { indicador: 'enps', periodo, granularidade: 'trimestre' }],
      ['decompor', { indicador: 'turnover', periodo, dimensao: 'genero' }],
      ['cruzar', { indicador: 'turnover', periodo, dimensoes: ['performance', 'faixaSalarial'] }],
      ['comparar', { indicador: 'turnover', a: { periodo, filtros: { diretoria: 'Tecnologia' } }, b: { periodo } }],
      ['drivers', { indicador: 'early_attrition', periodo }],
      ['impacto', { indicador: 'horas_extras_pc', periodo }],
    ] as const;
    for (const [funcao, args] of chamadas) {
      const r = validarArgs(funcao, args);
      expect(r, funcao).toEqual({ ok: true, args });
      expect(() => (motor[funcao] as (a: unknown) => unknown)(args)).not.toThrow();
    }
  });

  it('aponta o caminho de cada erro', () => {
    const r = validarArgs('valor', {
      indicador: 'rotatividade',
      periodo: { inicio: '2022-01' },
      filtros: { diretoria: 'Marketing', signo: 'leão' },
      extra: 1,
    });
    expect(r.ok).toBe(false);
    const erros = r.ok ? [] : r.erros;
    expect(erros.some(e => e.startsWith('indicador:'))).toBe(true);
    expect(erros.some(e => e.startsWith('periodo.inicio:'))).toBe(true);
    expect(erros.some(e => e.startsWith('periodo.fim:'))).toBe(true);
    expect(erros.some(e => e.startsWith('filtros.diretoria:'))).toBe(true);
    expect(erros.some(e => e.startsWith('filtros.signo:'))).toBe(true);
    expect(erros.some(e => e.startsWith('extra:'))).toBe(true);
  });

  it('checa tipos, arrays e objetos aninhados', () => {
    const cruzar = validarArgs('cruzar', { indicador: 'turnover', periodo, dimensoes: ['genero'] });
    expect(cruzar.ok).toBe(false);
    if (!cruzar.ok) expect(cruzar.erros[0]).toMatch(/^dimensoes:/);
    const serie = validarArgs('serie', { indicador: 'turnover', periodo, granularidade: 'semana' });
    expect(serie.ok).toBe(false);
    const comparar = validarArgs('comparar', { indicador: 'turnover', a: { periodo }, b: { periodo: 'último ano' } });
    expect(comparar.ok).toBe(false);
    if (!comparar.ok) expect(comparar.erros[0]).toMatch(/^b\.periodo:/);
    expect(validarArgs('valor', null).ok).toBe(false);
    expect(validarArgs('valor', 'turnover').ok).toBe(false);
  });

  it('validarEsquema aplica o mesmo subconjunto a esquemas de fora do motor, com limite de texto', () => {
    const esquema: JsonSchema = {
      type: 'object',
      properties: { texto: { type: 'string', minLength: 3, maxLength: 10 }, itens: { type: 'array', items: { type: 'string' }, maxItems: 2 } },
      required: ['texto'],
      additionalProperties: false,
    };
    expect(validarEsquema(esquema, { texto: 'manchete', itens: ['a'] })).toEqual([]);
    expect(validarEsquema(esquema, { texto: 'manchete longa demais' })).toEqual(['texto: máximo de 10 caracteres']);
    expect(validarEsquema(esquema, { texto: 'ok' })).toEqual(['texto: mínimo de 3 caracteres']);
    expect(validarEsquema(esquema, { texto: 'manchete', itens: ['a', 'b', 'c'] })).toEqual(['itens: máximo de 2 itens']);
  });
});
