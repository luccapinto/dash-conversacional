/**
 * Modo da IA nas rotas de verdade (app/api): com as duas chaves no ambiente e sem IA_AO_VIVO=1,
 * nada chama a IA (o fetch global falso não é chamado nenhuma vez); com IA_AO_VIVO=1, o
 * comportamento ao vivo continua o mesmo.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/agente/route';
import { GET } from '@/app/api/layout/route';
import type { LayoutSpec } from '@/lib/layout/spec';
import { fetchFalso, ferramentas, texto, type RespostaFalsa } from './sse';

const CHAVES = { DEEPSEEK_API_KEY: 'chave-ds-teste', OPENROUTER_API_KEY: 'chave-or-teste' };
const periodo = { inicio: '2025-10', fim: '2026-09' };

function ambiente(iaAoVivo: string | undefined, fila: RespostaFalsa[] = []) {
  for (const [k, v] of Object.entries(CHAVES)) vi.stubEnv(k, v);
  vi.stubEnv('IA_AO_VIVO', iaAoVivo);
  const falso = fetchFalso(fila);
  vi.stubGlobal('fetch', falso.fetch);
  return falso;
}

const perguntar = (ip: string) =>
  POST(
    new Request('http://localhost/api/agente', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ mensagens: [{ papel: 'usuario', conteudo: 'Como está o turnover?' }], contexto: { indicador: 'turnover', periodo } }),
    }),
  );

const layout = (qs: string, ip: string) => GET(new Request(`http://localhost/api/layout?${qs}`, { headers: { host: 'localhost', referer: 'http://localhost/resumo', 'x-forwarded-for': ip } }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('modo demonstração (padrão)', () => {
  for (const valor of [undefined, '', '0', 'true', 'sim']) {
    it(`IA_AO_VIVO=${JSON.stringify(valor)}: /api/agente responde 403 e /api/layout sai sem IA, sem nenhum fetch`, async () => {
      const { fetch } = ambiente(valor);
      const agente = await perguntar('10.0.0.1');
      expect(agente.status).toBe(403);
      expect(await agente.json()).toEqual({ erro: 'modo demonstração' });

      const fora = await layout('inicio=2025-03&fim=2026-02&diretoria=Tecnologia&lente=ceo', '10.0.0.1');
      expect(fora.status).toBe(200);
      expect(fora.headers.get('x-layout-fonte')).toBe('demonstracao');
      expect(((await fora.json()) as LayoutSpec).origem).toBe('deterministico');

      const padrao = await layout('inicio=2025-10&fim=2026-09&diretoria=Geral&lente=ceo', '10.0.0.1');
      expect(padrao.headers.get('x-layout-fonte')).toBe('pre-gerado');

      expect(fetch).not.toHaveBeenCalled();
    });
  }
});

describe('IA_AO_VIVO=1', () => {
  it('/api/agente chama o modelo e streama a resposta', async () => {
    const { fetch, pedidos } = ambiente('1', [ferramentas({ nome: 'valor', args: { indicador: 'turnover', periodo } }), texto('Feito.')]);
    const resp = await perguntar('10.0.0.2');
    expect(resp.status).toBe(200);
    const eventos = (await resp.text()).split('\n\n').filter(l => l.startsWith('data:')).map(l => JSON.parse(l.slice(5)) as { tipo: string });
    expect(eventos.map(e => e.tipo)).toEqual(['passo', 'passo', 'texto', 'bloco', 'rastro', 'fim']);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(pedidos[0].url).toMatch(/deepseek/);
  });

  it('/api/layout gera ao vivo fora do pré-gerado', async () => {
    const { fetch } = ambiente('1', [texto('não é json')]);
    const resp = await layout('inicio=2025-02&fim=2026-01&diretoria=Gente&lente=chro', '10.0.0.3');
    expect(resp.headers.get('x-layout-fonte')).toBe('gerado');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
