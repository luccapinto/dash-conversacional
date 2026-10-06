/**
 * Formatação dos números do painel e Δ: % → p.p., eNPS → pontos, demais → variação %. Cor pela
 * polaridade, zero sem sinal, sem base = "—".
 */

import { describe, expect, it } from 'vitest';
import { curto, delta, eixo, valorComUnidade } from '@/lib/painel/formato';

describe('delta', () => {
  it('indicador em % compara em p.p.; piora em menor_melhor é ruim', () => {
    expect(delta(16.27, 16, '% a.a.', 'menor_melhor')).toEqual({ texto: '+0,3 p.p.', tom: 'ruim' });
    expect(delta(18.36, 18.62, '% a.a.', 'menor_melhor')).toEqual({ texto: '−0,3 p.p.', tom: 'bom' });
    expect(delta(81.2, 85, '%', 'maior_melhor')).toEqual({ texto: '−3,8 p.p.', tom: 'ruim' });
  });

  it('eNPS compara em pontos inteiros', () => {
    expect(delta(4.01, 20, 'pontos', 'maior_melhor')).toEqual({ texto: '−16 pts', tom: 'ruim' });
    expect(delta(4.01, -0.45, 'pontos', 'maior_melhor')).toEqual({ texto: '+4 pts', tom: 'bom' });
  });

  it('demais unidades comparam em variação %', () => {
    expect(delta(51.84, 45, 'dias', 'menor_melhor')).toEqual({ texto: '+15,2%', tom: 'ruim' });
    expect(delta(4972, 4808, 'pessoas', 'maior_melhor')).toEqual({ texto: '+3,4%', tom: 'bom' });
  });

  it('polaridade neutra fica cinza nos dois sentidos', () => {
    expect(delta(4972, 4942, 'pessoas', 'neutro')).toEqual({ texto: '+0,6%', tom: 'neutro' });
    expect(delta(4.6, 6.1, '% a.a.', 'neutro')).toEqual({ texto: '−1,5 p.p.', tom: 'neutro' });
  });

  it('zero (no arredondamento exibido) sai sem sinal e neutro', () => {
    expect(delta(10, 10, '%', 'maior_melhor')).toEqual({ texto: '0,0 p.p.', tom: 'neutro' });
    expect(delta(10.03, 10, '%', 'menor_melhor')).toEqual({ texto: '0,0 p.p.', tom: 'neutro' });
    expect(delta(20.3, 20, 'pontos', 'maior_melhor')).toEqual({ texto: '0 pts', tom: 'neutro' });
    expect(delta(100.02, 100, 'dias', 'menor_melhor')).toEqual({ texto: '0,0%', tom: 'neutro' });
  });

  it('sem base (ou base zero na variação %) = "—"', () => {
    expect(delta(10, null, '%', 'maior_melhor')).toEqual({ texto: '—', tom: 'neutro' });
    expect(delta(null, 10, '%', 'maior_melhor')).toEqual({ texto: '—', tom: 'neutro' });
    expect(delta(5, 0, 'vagas', 'neutro')).toEqual({ texto: '—', tom: 'neutro' });
  });
});

describe('formatação', () => {
  it('curto: o número da tabela', () => {
    expect(curto(16.27, '% a.a.')).toBe('16,3%');
    expect(curto(4972, 'pessoas')).toBe('4.972');
    expect(curto(51.84, 'dias')).toBe('52');
    expect(curto(4.01, 'pontos')).toBe('+4');
    expect(curto(-1.42, 'pontos')).toBe('−1');
    expect(curto(-3.24, '%')).toBe('−3,2%');
    expect(curto(-0.45, 'pontos')).toBe('0');
    expect(curto(-0.01, '%')).toBe('0,0%');
    expect(curto(6_168_600, 'R$')).toBe('6,2 mi');
    expect(curto(28_450, 'R$')).toBe('28,5 mil');
    expect(curto(null, '%')).toBe('—');
  });

  it('valorComUnidade: o número com a unidade por extenso', () => {
    expect(valorComUnidade(16, '% a.a.')).toBe('16,0 % a.a.');
    expect(valorComUnidade(45, 'dias')).toBe('45 dias');
    expect(valorComUnidade(6_168_600, 'R$')).toBe('R$ 6,2 mi');
    expect(valorComUnidade(8.4, 'h/pessoa/mês')).toBe('8,4 h');
    expect(valorComUnidade(null, '%')).toBe('—');
  });

  it('eixo: unidade curta', () => {
    expect(eixo(0, '%')).toBe('0');
    expect(eixo(32, '% a.a.')).toBe('32%');
    expect(eixo(20, 'pontos')).toBe('+20');
    expect(eixo(4_600_000, 'R$')).toBe('4,6 mi');
    expect(eixo(8.5, 'h/pessoa/mês')).toBe('8,5');
  });
});
