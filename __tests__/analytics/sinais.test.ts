/**
 * Detector de sinais: estatística pura em séries sintéticas e o contrato dos sinais sobre o cubo.
 */

import { describe, expect, it } from 'vitest';
import { CATALOGO } from '@/lib/analytics/catalog';
import { motorCliente } from '@/lib/analytics/cliente';
import {
  PESO_LENTE,
  TIPOS_SINAL,
  correlacoesDefasadas,
  detectarSinais,
  formatar,
  pioraAcelerada,
  pontoDeMudanca,
} from '@/lib/analytics/signals';

const periodo = { inicio: '2025-10', fim: '2026-09' };

describe('estatística', () => {
  it('pontoDeMudanca acha o degrau e a estatística t; série plana não tem degrau', () => {
    const ruido = [0.3, -0.2, 0.1, -0.4, 0.2, 0, -0.1, 0.3];
    const degrau = [...ruido.map(r => 10 + r), ...ruido.map(r => 20 + r)];
    const pm = pontoDeMudanca(degrau, 4)!;
    expect(pm.indice).toBe(8);
    expect(pm.antes).toBeCloseTo(10.025, 6);
    expect(pm.depois).toBeCloseTo(20.025, 6);
    expect(pm.t).toBeGreaterThan(30);
    expect(Math.abs(pontoDeMudanca([...ruido, ...ruido].map(r => 10 + r), 4)!.t)).toBeLessThan(2);
  });

  it('correlacoesDefasadas encontra a defasagem de 1 período', () => {
    // passeio aleatório: as variações são pouco autocorrelacionadas
    const x = [2, 1, 4, 4, 2, 6, 7, 4, 6, 6, 7, 6, 9, 7, 7, 9];
    const y = [0, ...x.slice(0, -1)]; // y(t) = x(t − 1)
    const rs = correlacoesDefasadas(x, y, 3);
    expect(rs[1]!).toBeCloseTo(1, 9);
    expect(Math.abs(rs[0]!)).toBeLessThan(0.6);
  });

  it('pioraAcelerada exige pioras seguidas e a última maior', () => {
    expect(pioraAcelerada([10, 11, 13, 17], 1.5)).toBe(true);
    expect(pioraAcelerada([10, 12, 14, 16], 1.5)).toBe(false);
    expect(pioraAcelerada([10, 9, 12, 20], 1.5)).toBe(false);
    expect(pioraAcelerada([10, 11, 13, 12], 1.5)).toBe(false);
  });

  it('formata em pt-BR', () => {
    expect(formatar(35.94, '% a.a.')).toBe('35,9% a.a.');
    expect(formatar(-41.2, 'pontos')).toBe('-41');
    expect(formatar(20, 'pontos')).toBe('+20');
    expect(formatar(86.9, 'dias')).toBe('87 dias');
    expect(formatar(1234567, 'R$')).toBe('R$ 1.234.567');
  });
});

describe('contrato dos sinais', () => {
  const empresa = detectarSinais(motorCliente, { periodo });
  const ADJETIVOS = /\b(alarmante|preocupante|grave|cr[ií]tic[oa]|forte|frac[oa]|significativ[oa]|expressiv[oa]|elevad[oa]|alt[oa]|baix[oa]|ruim|bom|boa|excelente|p[ée]ssim[oa]|enorme|dr[aá]stic[oa])\b/i;

  it('cada sinal tem tipo, indicadores do catálogo, score em [0, 1], evidência com números e pontos', () => {
    expect(empresa.length).toBeGreaterThan(10);
    for (const s of empresa) {
      expect(TIPOS_SINAL).toContain(s.tipo);
      for (const id of s.indicadores) expect(CATALOGO[id]).toBeDefined();
      expect(s.score).toBeGreaterThan(0);
      expect(s.score).toBeLessThanOrEqual(1);
      expect(s.score).toBeCloseTo(s.scoreBase * PESO_LENTE.chro[CATALOGO[s.indicadores[s.indicadores.length - 1]].dominio], 12);
      expect(s.evidencia).toMatch(/\d/);
      expect(s.evidencia, s.evidencia).not.toMatch(ADJETIVOS);
      expect(s.pontos.length).toBeGreaterThan(0);
      expect(s.pontos.every(p => p.valor !== null)).toBe(true);
    }
  });

  it('o número da evidência vem dos pontos de dados', () => {
    for (const s of empresa.filter(x => x.tipo === 'fora_da_meta' || x.tipo === 'outlier_entre_diretorias')) {
      const ind = CATALOGO[s.indicadores[0]];
      expect(s.evidencia).toContain(formatar(s.pontos[0].valor!, ind.unidade));
    }
  });

  it('ordenado por score, ids únicos e determinístico', () => {
    for (let i = 1; i < empresa.length; i++) expect(empresa[i - 1].score).toBeGreaterThanOrEqual(empresa[i].score);
    expect(new Set(empresa.map(s => s.id)).size).toBe(empresa.length);
    expect(detectarSinais(motorCliente, { periodo })).toEqual(empresa);
  });

  it('recorte por diretoria só traz sinais daquela diretoria', () => {
    const ops = detectarSinais(motorCliente, { periodo, diretoria: 'Operações' });
    expect(ops.length).toBeGreaterThan(0);
    expect(ops.every(s => s.diretoria === 'Operações')).toBe(true);
  });

  it('a lente muda a ordem, não o conjunto de sinais', () => {
    const ceo = detectarSinais(motorCliente, { periodo, lente: 'ceo' });
    expect(new Set(ceo.map(s => s.id))).toEqual(new Set(empresa.map(s => s.id)));
    const promocao = (lista: typeof empresa) => lista.find(s => s.indicadores.includes('mobilidade_interna'))!;
    expect(promocao(ceo).score).toBeCloseTo(promocao(empresa).score * PESO_LENTE.ceo.Desenvolvimento, 12);
    expect(ceo.map(s => s.id)).not.toEqual(empresa.map(s => s.id));
  });
});
