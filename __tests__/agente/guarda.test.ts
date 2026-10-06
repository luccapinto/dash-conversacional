/**
 * Guarda de números: todo número do texto do modelo precisa ter vindo de um resultado de tool
 * (com tolerância de arredondamento e formatos BR). Anos, datas e contagens triviais ficam de fora.
 */

import { describe, expect, it } from 'vitest';
import { coletarValores, extrairNumeros, verificarNumeros } from '@/lib/agente/guarda';

describe('extrairNumeros', () => {
  it('lê formatos BR: vírgula decimal, milhar com ponto, R$ com escala, p.p., × e sinal', () => {
    const lidos = extrairNumeros('Turnover de 36,7% a.a., 1.234 pessoas, R$ 1,05 mi, R$ 576 mil, R$ 12,6 milhões, +9,1 p.p., 2,4× e eNPS de −43.');
    expect(lidos.map(n => [n.texto, n.valor])).toEqual([
      ['36,7%', 36.7],
      ['1.234', 1234],
      ['R$ 1,05 mi', 1_050_000],
      ['R$ 576 mil', 576_000],
      ['R$ 12,6 milhões', 12_600_000],
      ['+9,1 p.p.', 9.1],
      ['2,4×', 2.4],
      ['−43', -43],
    ]);
  });

  it('ignora anos, datas, trimestres, ordinais, marcadores de lista, ids e contagens pequenas sem unidade', () => {
    const texto = [
      '1. Em 2026, de Jan/26 a Set/2026 (2025-10 a 2026-09), no 4T24 e no 1º trimestre;',
      '2. nos últimos 12 meses, 3 diretorias e o resultado r3 mostram 8% e +5 pontos.',
    ].join('\n');
    expect(extrairNumeros(texto).map(n => n.texto)).toEqual(['8%', '+5']);
  });
});

describe('verificarNumeros', () => {
  const valores = coletarValores([
    { valor: 36.712, n: 1234, custo: 1_052_340, mensal: 576_120, total: 12_612_000, lift: 2.38, enps: -43.2 },
    { diferenca: 9.12, evidencia: 'em Jan/26, 4,5× a mediana' },
  ]);

  it('aceita arredondamento, escala e sinal invertido ("queda de 43 pontos")', () => {
    const texto = 'Turnover de 36,7% (37% arredondado), 1.234 pessoas, R$ 1,05 mi (R$ 1,1 milhão), R$ 576 mil por mês, R$ 12,6 milhões no período, +9,1 p.p., lift 2,4×, queda de 43 pontos e pico 4,5× a mediana.';
    const v = verificarNumeros(texto, valores);
    expect(v.naoVerificados).toEqual([]);
    expect(v.total).toBe(11);
    expect(v.verificados).toBe(11);
  });

  it('marca o que não está nos resultados, sem confundir casas decimais', () => {
    const v = verificarNumeros('O custo foi de R$ 3,2 mi e o turnover de 36,8%; em 2026, 3 diretorias.', valores);
    expect(v.naoVerificados).toEqual([
      { texto: 'R$ 3,2 mi', valor: 3_200_000 },
      { texto: '36,8%', valor: 36.8 },
    ]);
    expect(v).toMatchObject({ total: 2, verificados: 0 });
  });

  it('números dentro de textos dos resultados (evidência, segmentos) contam como fonte', () => {
    expect(coletarValores(['faixa 25-34', { rotulo: 'R$ 4.362.000' }])).toEqual(expect.arrayContaining([25, 34, 4_362_000]));
  });
});
