/**
 * Resumo executivo: o placar conta só indicadores visíveis com meta; o motivo de cada meta é a
 * evidência do sinal de maior peso daquele indicador, preferindo o desfavorável.
 */

import { describe, expect, it } from 'vitest';
import { motorCliente } from '@/lib/analytics/cliente';
import type { Sinal } from '@/lib/analytics/signals';
import { FILTROS_PADRAO } from '@/lib/painel/filtros';
import { OCULTOS_PAINEL } from '@/lib/painel/indicadores';
import { periodoSinais } from '@/lib/painel/periodos';
import { montarResumo, motivoDe } from '@/lib/painel/resumo';
import { sinaisVisiveis } from '@/lib/painel/sinais';

const sinal = (id: string, direcao: Sinal['direcao'], score: number, evidencia: string): Sinal =>
  ({ id, tipo: id.split(':')[0], indicadores: ['turnover'], diretoria: null, periodo: { inicio: '2025-10', fim: '2026-09' }, direcao, score, scoreBase: score, evidencia, pontos: [] }) as unknown as Sinal;

describe('resumo executivo', () => {
  const sinais = sinaisVisiveis(motorCliente, periodoSinais('2026-09'), null, 'ceo');
  const r = montarResumo(motorCliente, FILTROS_PADRAO, sinais);
  const itens = r.dominios.flatMap(d => d.itens);

  it('placar: 15 indicadores visíveis com meta, mesmas contagens do gerencial no acumulado', () => {
    expect(r.placar.total).toBe(15);
    expect(itens).toHaveLength(15);
    expect(r.placar.ytd).toEqual({ dentro: 2, atencao: 4, fora: 9 });
    for (const c of [r.placar.mes, r.placar.aa!]) expect(c.dentro + c.atencao + c.fora).toBe(15);
  });

  it('dentro do domínio: fora da meta primeiro, depois atenção, depois na meta', () => {
    const peso = { fora: 0, atencao: 1, dentro: 2 } as Record<string, number>;
    for (const d of r.dominios) {
      const ordem = d.itens.map(i => peso[i.status]);
      expect(ordem).toEqual([...ordem].sort((a, b) => a - b));
    }
  });

  it('nenhum sinal de indicador oculto chega às telas', () => {
    expect(sinais.length).toBeGreaterThan(0);
    expect(sinais.every(s => s.indicadores.every(id => !(OCULTOS_PAINEL as readonly string[]).includes(id)))).toBe(true);
  });
});

describe('motivoDe', () => {
  it('prefere o sinal desfavorável de maior peso, mesmo com um favorável de score maior', () => {
    const lista = [
      sinal('outlier_entre_diretorias:turnover:Gente', 'favoravel', 0.9, 'Gente bem abaixo.'),
      sinal('sazonalidade:turnover:empresa', 'desfavoravel', 0.6, 'Pico em janeiro.'),
      sinal('fora_da_meta:turnover:empresa', 'desfavoravel', 0.4, 'Acima da meta.'),
    ];
    expect(motivoDe('turnover', lista, 'fora')).toEqual({ tipo: 'sazonalidade', texto: 'Pico em janeiro.' });
  });

  it('sem desfavorável usa o de maior peso; sem sinal, texto neutro conforme o status', () => {
    expect(motivoDe('turnover', [sinal('outlier_entre_diretorias:turnover:Gente', 'favoravel', 0.9, 'Gente bem abaixo.')], 'dentro'))
      .toEqual({ tipo: 'fora da curva', texto: 'Gente bem abaixo.' });
    expect(motivoDe('turnover', [], 'fora').tipo).toBeNull();
    expect(motivoDe('turnover', [], 'fora').texto).toMatch(/difuso/);
    expect(motivoDe('turnover', [], 'dentro').texto).toMatch(/na meta/i);
  });
});
