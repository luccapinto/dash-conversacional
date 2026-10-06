/**
 * GET /api/layout: pré-gerado sem IA, recorte fora do padrão gerado ao vivo com cache em memória,
 * falha transitória da IA não fica no cache, parâmetros inválidos e rate limit.
 */

import { describe, expect, it } from 'vitest';
import { motorCliente } from '@/lib/analytics/cliente';
import { provedoresDoAmbiente } from '@/lib/agente/llm';
import { criarHandlerLayout } from '@/lib/layout/http';
import { LAYOUTS_PADRAO } from '@/lib/layout/padrao';
import { chaveLayout, COMBINACOES_PADRAO, type LayoutSpec } from '@/lib/layout/spec';
import { erroHttp, fetchFalso, texto, type RespostaFalsa } from '../agente/sse';

const provedores = provedoresDoAmbiente({ DEEPSEEK_API_KEY: 'chave-ds-teste', OPENROUTER_API_KEY: 'chave-or-teste' });
const get = (qs: string, ip = '9.9.9.9') => new Request(`http://localhost/api/layout?${qs}`, { headers: { 'x-forwarded-for': ip } });

function handler(fila: RespostaFalsa[], limite = { limite: 100, janelaMs: 60_000 }) {
  const falso = fetchFalso(fila);
  const h = criarHandlerLayout(() => ({ motor: motorCliente, provedores, padrao: LAYOUTS_PADRAO.layouts, fetch: falso.fetch, log: () => {} }), limite);
  return { h, pedidos: falso.pedidos };
}

describe('GET /api/layout', () => {
  it('combinação padrão sai do JSON pré-gerado, sem chamar a IA', async () => {
    const r = COMBINACOES_PADRAO[5];
    const { h, pedidos } = handler([]);
    const resp = await h(get(`inicio=${r.periodo.inicio}&fim=${r.periodo.fim}&diretoria=${encodeURIComponent(r.diretoria ?? 'Geral')}&lente=${r.lente}`));
    expect(resp.status).toBe(200);
    expect(resp.headers.get('x-layout-fonte')).toBe('pre-gerado');
    expect(((await resp.json()) as LayoutSpec).chave).toBe(chaveLayout(r));
    expect(pedidos).toHaveLength(0);
  });

  it('recorte fora do padrão: gera ao vivo uma vez e serve do cache depois', async () => {
    const { h, pedidos } = handler([texto('não é json')]);
    const qs = 'inicio=2025-04&fim=2026-03&diretoria=Tecnologia';
    const a = await h(get(qs));
    const b = await h(get(qs));
    expect(a.headers.get('x-layout-fonte')).toBe('gerado');
    expect(b.headers.get('x-layout-fonte')).toBe('cache');
    const spec = (await b.json()) as LayoutSpec;
    expect(spec).toMatchObject({ chave: '2025-04..2026-03|Tecnologia|gestor', origem: 'deterministico' });
    expect(pedidos).toHaveLength(1);
  });

  it('IA fora do ar: responde com o layout determinístico e tenta de novo no próximo pedido', async () => {
    const { h, pedidos } = handler([erroHttp(503), erroHttp(503), erroHttp(503), erroHttp(503)]);
    const qs = 'inicio=2024-04&fim=2025-03&lente=ceo';
    const a = await h(get(qs));
    expect(((await a.json()) as LayoutSpec).origem).toBe('deterministico');
    expect(a.headers.get('cache-control')).toBe('no-store');
    await h(get(qs));
    expect(pedidos).toHaveLength(4);
  });

  it('400 para recorte inválido e 429 acima do limite por IP', async () => {
    const { h } = handler([], { limite: 2, janelaMs: 60_000 });
    const invalido = await h(get('inicio=2026-09&fim=2025-10', '7.7.7.7'));
    expect(invalido.status).toBe(400);
    expect((await invalido.json()).detalhes).toEqual(['periodo: início depois do fim']);
    expect((await h(get('inicio=2025-10&fim=2026-09&diretoria=Marketing', '7.7.7.7'))).status).toBe(400);
    expect((await h(get('inicio=2025-10&fim=2026-09', '7.7.7.7'))).status).toBe(429);
  });
});
