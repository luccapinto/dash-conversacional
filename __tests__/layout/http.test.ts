/**
 * GET /api/layout: pré-gerado sem IA, recorte fora do padrão gerado ao vivo com cache em memória,
 * falha transitória da IA não fica no cache, parâmetros inválidos, rate limit, mesma origem e
 * cota global (gerações e custo por janela) que cai no determinístico sem chamar a IA.
 */

import { describe, expect, it } from 'vitest';
import { motorCliente } from '@/lib/analytics/cliente';
import { provedoresDoAmbiente } from '@/lib/agente/llm';
import { criarHandlerLayout, type CotaLayout } from '@/lib/layout/http';
import { LAYOUTS_PADRAO } from '@/lib/layout/padrao';
import { chaveLayout, COMBINACOES_PADRAO, type LayoutSpec } from '@/lib/layout/spec';
import { erroHttp, fetchFalso, texto, type RespostaFalsa } from '../agente/sse';

const provedores = provedoresDoAmbiente({ DEEPSEEK_API_KEY: 'chave-ds-teste', OPENROUTER_API_KEY: 'chave-or-teste' });
/** o fetch do próprio painel: mesmo host, com Referer (Referrer-Policy strict-origin-when-cross-origin) */
const DO_PAINEL = { referer: 'http://localhost/resumo?mes=2026-03' };
const get = (qs: string, ip = '9.9.9.9', cabecalhos: Record<string, string> = DO_PAINEL) =>
  new Request(`http://localhost/api/layout?${qs}`, { headers: { 'x-forwarded-for': ip, host: 'localhost', ...cabecalhos } });
const COTA_FOLGADA: CotaLayout = { geracoes: 1000, custoUsd: 1000, janelaMs: 3_600_000 };

function handler(fila: RespostaFalsa[], limite = { limite: 100, janelaMs: 60_000 }, cota = COTA_FOLGADA) {
  const falso = fetchFalso(fila);
  const logs: string[] = [];
  const h = criarHandlerLayout(() => ({ motor: motorCliente, modo: 'ao-vivo', provedores, padrao: LAYOUTS_PADRAO.layouts, fetch: falso.fetch, log: l => logs.push(l) }), limite, cota);
  return { h, pedidos: falso.pedidos, logs };
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

  it('400 para recorte inválido (sem gastar a cota) e 429 acima do limite por IP', async () => {
    const { h } = handler([], { limite: 2, janelaMs: 60_000 });
    const invalido = await h(get('inicio=2026-09&fim=2025-10', '7.7.7.7'));
    expect(invalido.status).toBe(400);
    expect((await invalido.json()).detalhes).toEqual(['periodo: início depois do fim']);
    expect((await h(get('inicio=2025-10&fim=2026-09&diretoria=Marketing', '7.7.7.7'))).status).toBe(400);
    const padrao = 'inicio=2025-10&fim=2026-09';
    expect([(await h(get(padrao, '7.7.7.7'))).status, (await h(get(padrao, '7.7.7.7'))).status, (await h(get(padrao, '7.7.7.7'))).status]).toEqual([200, 200, 429]);
  });

  it('403 para Origin ou Referer de outro domínio e sem nenhum dos dois, sem chamar a IA', async () => {
    const { h, pedidos } = handler([texto('{}')]);
    const qs = 'inicio=2025-04&fim=2026-03&diretoria=Gente';
    expect((await h(get(qs, '1.1.1.1', { origin: 'https://outro.example' }))).status).toBe(403);
    expect((await h(get(qs, '1.1.1.1', { referer: 'https://outro.example/pagina' }))).status).toBe(403);
    expect((await h(get(qs, '1.1.1.1', {}))).status).toBe(403);
    expect((await h(get(qs, '1.1.1.1', { origin: 'null' }))).status).toBe(403);
    expect(pedidos).toHaveLength(0);
    // o mesmo host passa, por Origin ou por Referer
    expect((await h(get('inicio=2025-04&fim=2026-03&diretoria=Gente', '1.1.1.1', { origin: 'http://localhost' }))).status).toBe(200);
  });

  it('cota global de gerações estourada: determinístico, sem chamar a IA, e loga', async () => {
    let agora = 0;
    const { h, pedidos, logs } = handler([texto('não é json'), texto('não é json')], undefined, { geracoes: 1, custoUsd: 1000, janelaMs: 60_000, agora: () => agora });
    expect((await h(get('inicio=2025-01&fim=2025-12'))).headers.get('x-layout-fonte')).toBe('gerado');
    const barrado = await h(get('inicio=2025-02&fim=2026-01'));
    expect(barrado.status).toBe(200);
    expect(barrado.headers.get('x-layout-fonte')).toBe('cota');
    expect(barrado.headers.get('cache-control')).toBe('no-store');
    expect(((await barrado.json()) as LayoutSpec)).toMatchObject({ chave: '2025-02..2026-01|Geral|chro', origem: 'deterministico' });
    expect(pedidos).toHaveLength(1);
    expect(logs.some(l => /cota/.test(l))).toBe(true);
    // janela nova: volta a gerar, e o recorte barrado não ficou no cache
    agora = 60_001;
    expect((await h(get('inicio=2025-02&fim=2026-01'))).headers.get('x-layout-fonte')).toBe('gerado');
    expect(pedidos).toHaveLength(2);
  });

  it('teto de custo estourado: determinístico, sem chamar a IA', async () => {
    // cada resposta falsa custa ~US$ 0,000125 (1.000 tokens de entrada, 800 em cache, 50 de saída)
    const { h, pedidos } = handler([texto('não é json')], undefined, { geracoes: 1000, custoUsd: 0.0001, janelaMs: 60_000 });
    await h(get('inicio=2025-01&fim=2025-12&lente=ceo'));
    const barrado = await h(get('inicio=2025-02&fim=2026-01&lente=ceo'));
    expect(barrado.headers.get('x-layout-fonte')).toBe('cota');
    expect(((await barrado.json()) as LayoutSpec).origem).toBe('deterministico');
    expect(pedidos).toHaveLength(1);
  });
});
