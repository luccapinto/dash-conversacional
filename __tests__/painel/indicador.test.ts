/**
 * Página do indicador: regra do card do mês para indicador de ciclo, quebra do pior para o melhor
 * (por senioridade quando há diretoria) e a frase determinística do destaque.
 */

import { describe, expect, it } from 'vitest';
import { CATALOGO } from '@/lib/analytics/catalog';
import { motorCliente } from '@/lib/analytics/cliente';
import { FILTROS_PADRAO, lerFiltros } from '@/lib/painel/filtros';
import { montarIndicador } from '@/lib/painel/indicador';

const pagina = (id: keyof typeof CATALOGO, f = FILTROS_PADRAO) => montarIndicador(motorCliente, CATALOGO[id], f, []);

describe('página do indicador', () => {
  it('taxa de promoção: o card do mês mostra os 12 meses até Set/26, não o mês de ciclo', () => {
    const p = pagina('taxa_promocao');
    const doze = motorCliente.valor({ indicador: 'taxa_promocao', periodo: { inicio: '2025-10', fim: '2026-09' } }).valor!;
    expect(p.leitura.mes.janela?.rotulo).toBe('12 meses até Set/26');
    expect(p.leitura.mes.medida?.valor).toBeCloseTo(doze, 9);
    // o mês isolado (ciclo de setembro) passa de 30% a.a.; a janela de 12 meses fica perto da meta de 8%
    expect(motorCliente.valor({ indicador: 'taxa_promocao', periodo: { inicio: '2026-09', fim: '2026-09' } }).valor!).toBeGreaterThan(30);
    expect(doze).toBeLessThan(15);
    // a evolução também é em 12 meses móveis: nenhum ponto de mês isolado
    expect(Math.max(...p.evolucao.map(x => x.valor))).toBeLessThan(15);
  });

  it('quebra por diretoria do pior para o melhor no acumulado, com a empresa no total', () => {
    const p = pagina('turnover_voluntario');
    expect(p.quebra.dimensao).toBe('diretoria');
    const ytd = p.quebra.linhas.map(l => l.ytd!);
    expect(ytd).toEqual([...ytd].sort((a, b) => b - a));
    expect(p.quebra.total.rotulo).toBe('Empresa');
    expect(p.quebra.total.ytd).toBeCloseTo(18.357356540658145, 6);
  });

  it('com diretoria filtrada a quebra é por senioridade e o total é a diretoria', () => {
    const p = pagina('enps', lerFiltros({ diretoria: 'tecnologia' }));
    expect(p.quebra.dimensao).toBe('senioridade');
    expect(p.quebra.linhas.map(l => l.rotulo).sort()).toEqual(['diretoria', 'gerência', 'júnior', 'pleno', 'sênior']);
    // maior_melhor: pior (menor) primeiro
    const ytd = p.quebra.linhas.filter(l => l.ytd !== null).map(l => l.ytd!);
    expect(ytd).toEqual([...ytd].sort((a, b) => a - b));
    expect(p.quebra.total.rotulo).toBe('Tecnologia');
  });

  it('destaque determinístico: acumulado, meta, ano anterior, pior e melhor diretoria', () => {
    const p = pagina('turnover_voluntario');
    const [pior, melhor] = [p.quebra.linhas[0], p.quebra.linhas[p.quebra.linhas.length - 1]];
    expect(p.destaque).toBe(
      `Turnover voluntário acumula **18,4 % a.a.** no ano, +2,4 p.p. vs a meta de 16,0 % a.a. (−0,3 p.p. contra Jan–Set/25). ` +
        `Pior resultado em **${pior.rotulo}** (${pior.ytd!.toFixed(1).replace('.', ',')} % a.a.); melhor em **${melhor.rotulo}** (${melhor.ytd!.toFixed(1).replace('.', ',')} % a.a.).`,
    );
  });
});
