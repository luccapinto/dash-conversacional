/**
 * Janelas do mês selecionado: "mês" (ou o ciclo trimestral do eNPS, ou 12 meses para indicador de
 * ciclo), "acumulado" (Jan até o mês), e as bases de comparação; sem base = null ("—").
 */

import { describe, expect, it } from 'vitest';
import { CATALOGO, type IdIndicador } from '@/lib/analytics/catalog';
import { motorCliente } from '@/lib/analytics/cliente';
import { leituraDe } from '@/lib/analytics/engine';
import { INDICADORES_PAINEL } from '@/lib/painel/indicadores';
import { INDICADORES_CICLO, janelas, periodoSinais, rotuloIntervalo } from '@/lib/painel/periodos';

const j = (id: IdIndicador, mes: string) => janelas(CATALOGO[id], mes);

describe('janelas do mês selecionado', () => {
  it('mensal: mês, mês anterior, mesmo mês do ano anterior e YTD Jan..mês', () => {
    const r = j('turnover_voluntario', '2026-09');
    expect(r.tipoMes).toBe('mes');
    expect(r.mes).toMatchObject({ periodo: { inicio: '2026-09', fim: '2026-09' }, rotulo: 'Set/26' });
    expect(r.mesAnt).toMatchObject({ periodo: { inicio: '2026-08', fim: '2026-08' }, rotulo: 'Ago/26' });
    expect(r.mesAA).toMatchObject({ periodo: { inicio: '2025-09', fim: '2025-09' }, rotulo: 'Set/25' });
    expect(r.ytd).toMatchObject({ periodo: { inicio: '2026-01', fim: '2026-09' }, rotulo: 'Jan–Set/26' });
    expect(r.ytdM1).toMatchObject({ periodo: { inicio: '2026-01', fim: '2026-08' }, rotulo: 'Jan–Ago/26' });
    expect(r.ytdAA).toMatchObject({ periodo: { inicio: '2025-01', fim: '2025-09' }, rotulo: 'Jan–Set/25' });
  });

  it('eNPS: o último ciclo trimestral fechado até o mês', () => {
    const set = j('enps', '2026-09');
    expect(set.tipoMes).toBe('trimestre');
    expect(set.mes).toMatchObject({ periodo: { inicio: '2026-07', fim: '2026-09' }, rotulo: '3T26' });
    expect(set.mesAnt).toMatchObject({ periodo: { inicio: '2026-04', fim: '2026-06' }, rotulo: '2T26' });
    expect(set.mesAA).toMatchObject({ periodo: { inicio: '2025-07', fim: '2025-09' }, rotulo: '3T25' });
    expect(j('enps', '2026-08').mes).toMatchObject({ periodo: { inicio: '2026-04', fim: '2026-06' }, rotulo: '2T26' });
    expect(j('enps', '2023-11').mes).toBeNull();
  });

  it('indicador de ciclo: o "mês" vira os 12 meses até o mês, com rótulo explícito', () => {
    const r = j('taxa_promocao', '2026-09');
    expect(r.tipoMes).toBe('doze_meses');
    expect(r.mes).toMatchObject({ periodo: { inicio: '2025-10', fim: '2026-09' }, rotulo: '12 meses até Set/26' });
    expect(r.mesAnt).toMatchObject({ periodo: { inicio: '2025-09', fim: '2026-08' }, rotulo: '12 meses até Ago/26' });
    expect(r.mesAA).toMatchObject({ periodo: { inicio: '2024-10', fim: '2025-09' }, rotulo: '12 meses até Set/25' });
    // sem 12 meses completos de dado, não há "mês"
    expect(j('taxa_promocao', '2024-06').mes).toBeNull();
  });

  it('comparativo sem base é null: início dos dados, janeiro e ano anterior incompleto', () => {
    const out23 = j('turnover', '2023-10');
    expect(out23.mesAnt).toBeNull();
    expect(out23.mesAA).toBeNull();
    expect(out23.ytdM1).toBeNull();
    expect(out23.ytdAA).toBeNull();
    // o acumulado de 2023 começa no primeiro mês com dado, com o rótulo real
    expect(j('turnover', '2023-12').ytd).toMatchObject({ periodo: { inicio: '2023-10', fim: '2023-12' }, rotulo: 'Out–Dez/23' });
    expect(j('turnover', '2026-01').ytd).toMatchObject({ periodo: { inicio: '2026-01', fim: '2026-01' }, rotulo: 'Jan/26' });
    expect(j('turnover', '2026-01').ytdM1).toBeNull();
    expect(j('turnover', '2024-11').ytdAA).toBeNull();
    expect(j('turnover', '2025-03').ytdAA).toMatchObject({ periodo: { inicio: '2024-01', fim: '2024-03' } });
  });

  it('sinais: 12 meses até o mês, cortados no início dos dados', () => {
    expect(periodoSinais('2026-09')).toEqual({ inicio: '2025-10', fim: '2026-09' });
    expect(periodoSinais('2024-02')).toEqual({ inicio: '2023-10', fim: '2024-02' });
    expect(rotuloIntervalo({ inicio: '2025-10', fim: '2026-09' })).toBe('Out/25–Set/26');
  });
});

describe('indicadores de ciclo (evento concentrado num mês)', () => {
  /** Fatia dos 2 meses do calendário com mais eventos, na soma dos 3 anos de série mensal */
  function concentracao(id: IdIndicador): number {
    const s = motorCliente.serie({ indicador: id, periodo: { inicio: '2023-10', fim: '2026-09' } });
    const porMes = new Array(12).fill(0);
    for (const p of s.pontos) porMes[Number(p.periodo.inicio.slice(5, 7)) - 1] += p.valor ?? 0;
    const total = porMes.reduce((a, b) => a + b, 0);
    const [a, b] = [...porMes].sort((x, y) => y - x);
    return (a + b) / total;
  }

  it('só a taxa de promoção concentra o ano em ciclos (Mar e Set > 70% das promoções)', () => {
    expect(INDICADORES_CICLO).toEqual(['taxa_promocao']);
    const fluxos = INDICADORES_PAINEL.filter(i => leituraDe(i) === 'soma dos meses' && i.calculo.tipo === 'razao');
    for (const i of fluxos) {
      const c = concentracao(i.id);
      if (INDICADORES_CICLO.includes(i.id)) expect(c, i.id).toBeGreaterThan(0.7);
      // 2 meses de 12 dariam 1/6 ≈ 17% sem sazonalidade; picos sazonais (ex.: turnover em Jan) ficam abaixo de 35%
      else expect(c, i.id).toBeLessThan(0.35);
    }
  });
});
