/**
 * System prompt: catálogo inteiro (indicador novo já nasce investigável), convenções de tempo e,
 * só quando há contexto de deep dive, o recorte clicado e o roteiro.
 */

import { describe, expect, it } from 'vitest';
import { IDS_INDICADORES } from '@/lib/analytics/catalog';
import { montarPromptSistema } from '@/lib/agente/prompt';

describe('montarPromptSistema', () => {
  it('traz todo indicador do catálogo e a convenção de hoje = Set/2026', () => {
    const p = montarPromptSistema();
    for (const id of IDS_INDICADORES) expect(p).toContain(`${id} ·`);
    expect(p).toMatch(/Hoje = Set\/2026/);
    expect(p).not.toMatch(/Deep dive em andamento/);
  });

  it('manda qualificar o resultado contra a meta pelo status calculado (atenção não é "dentro da meta")', () => {
    const p = montarPromptSistema();
    expect(p).toMatch(/status calculado/);
    expect(p).toMatch(/statusTexto/);
    expect(p).toMatch(/em atenção/);
  });

  it('com contexto, fixa o recorte clicado, a lente e o roteiro de deep dive', () => {
    const p = montarPromptSistema({
      indicador: 'turnover_voluntario',
      periodo: { inicio: '2025-10', fim: '2026-09' },
      filtros: { diretoria: 'Operações' },
      ponto: { mes: '2025-06', dimensao: 'faixaSalarial', segmento: 'piso' },
      lente: 'ceo',
    });
    expect(p).toMatch(/Deep dive em andamento/);
    expect(p).toMatch(/Turnover voluntário \(turnover_voluntario\)/);
    expect(p).toMatch(/diretoria = Operações/);
    expect(p).toMatch(/Jun\/25 \(2025-06\)/);
    expect(p).toMatch(/faixaSalarial = piso/);
    expect(p).toMatch(/CEO/);
    for (const etapa of ['O que aconteceu', 'Onde se concentra', 'Por quê', 'Quanto custa', 'O que fazer']) expect(p).toContain(etapa);
  });
});
