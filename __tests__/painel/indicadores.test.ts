/**
 * Lista do painel: 25 indicadores nas telas, 5 ocultos a pedido do Lucca. Os ocultos continuam no
 * catálogo e nas tools do agente (ele ainda pode citá-los ao explicar).
 */

import { describe, expect, it } from 'vitest';
import { CATALOGO, IDS_INDICADORES } from '@/lib/analytics/catalog';
import { ESQUEMAS_ARGUMENTOS } from '@/lib/analytics/schemas';
import { montarPromptSistema } from '@/lib/agente/prompt';
import { DOMINIOS_PAINEL, IDS_PAINEL, INDICADORES_PAINEL, noPainel, OCULTOS_PAINEL } from '@/lib/painel/indicadores';

const OCULTOS = ['crescimento_liquido', 'pct_lideranca', 'turnover_lamentado', 'tempo_medio_casa', 'horas_treinamento_pc'];

describe('indicadores do painel', () => {
  it('25 visíveis, nenhum dos 5 ocultos, na ordem do catálogo', () => {
    expect(INDICADORES_PAINEL).toHaveLength(25);
    expect([...OCULTOS_PAINEL].sort()).toEqual([...OCULTOS].sort());
    for (const id of OCULTOS) expect(IDS_PAINEL).not.toContain(id);
    expect(IDS_PAINEL).toEqual(IDS_INDICADORES.filter(id => !OCULTOS.includes(id)));
  });

  it('noPainel separa visíveis de ocultos e de ids inexistentes', () => {
    expect(noPainel('turnover_voluntario')).toBe(true);
    expect(noPainel('turnover_lamentado')).toBe(false);
    expect(noPainel('nao_existe')).toBe(false);
  });

  it('domínios agrupam só os visíveis e cobrem todos eles', () => {
    expect(DOMINIOS_PAINEL.flatMap(d => d.indicadores.map(i => i.id))).toEqual(IDS_PAINEL);
    expect(DOMINIOS_PAINEL.every(d => d.indicadores.length > 0)).toBe(true);
  });

  it('o catálogo e as tools do agente continuam com os 30, inclusive os ocultos', () => {
    expect(IDS_INDICADORES).toHaveLength(30);
    for (const id of OCULTOS) {
      expect(CATALOGO[id as keyof typeof CATALOGO]).toBeDefined();
      expect(ESQUEMAS_ARGUMENTOS.valor.properties!.indicador.enum).toContain(id);
    }
    expect(montarPromptSistema()).toContain('turnover_lamentado');
  });
});
