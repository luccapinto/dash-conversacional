/**
 * Contrato do contexto de deep dive: é o que o botão "Investigar" da fase 3 manda para o agente.
 */

import { describe, expect, it } from 'vitest';
import { validarContexto } from '@/lib/agente/contrato';

const periodo = { inicio: '2025-10', fim: '2026-09' };

describe('validarContexto', () => {
  it('aceita o contexto de um ponto clicado (indicador, filtros, mês, segmento e lente)', () => {
    const contexto = {
      indicador: 'turnover_voluntario',
      periodo,
      filtros: { diretoria: 'Operações', senioridade: 'pleno' },
      ponto: { mes: '2026-01', dimensao: 'faixaSalarial', segmento: 'piso' },
      lente: 'chro',
    };
    expect(validarContexto(contexto)).toEqual({ ok: true, contexto });
    expect(validarContexto({ periodo })).toEqual({ ok: true, contexto: { periodo } });
  });

  it('recusa indicador fora do catálogo, período invertido e segmento sem dimensão ou fora dela', () => {
    const erros = (x: unknown) => {
      const r = validarContexto(x);
      return r.ok ? [] : r.erros;
    };
    expect(erros({ indicador: 'rotatividade', periodo })[0]).toMatch(/^indicador:/);
    expect(erros({ periodo: { inicio: '2026-09', fim: '2025-10' } })).toEqual(['periodo: início depois do fim']);
    expect(erros({ periodo, ponto: { segmento: 'piso' } })).toEqual(['ponto.segmento: informe a dimensão do segmento']);
    expect(erros({ periodo, ponto: { dimensao: 'genero', segmento: 'piso' } })).toEqual(['ponto.segmento: "piso" não é um valor de genero']);
    expect(erros({ periodo, lente: 'cfo' })[0]).toMatch(/^lente:/);
    expect(erros({ periodo, filtros: { diretoria: 'Marketing' } })[0]).toMatch(/^filtros\.diretoria:/);
    expect(erros(undefined)[0]).toMatch(/esperado object/);
    expect(erros({ periodo, ponto: { mes: '2025-06' } })).toEqual(['ponto.mes: 2025-06 fora do período (2025-10 a 2026-09)']);
  });
});
