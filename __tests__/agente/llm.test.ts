/**
 * Cliente LLM: DeepSeek direto (principal, raciocínio desligado) e OpenRouter (reserva), com
 * fallback em erro de rede, HTTP de erro e timeout. Sem rede: fetch falso.
 */

import { describe, expect, it, vi } from 'vitest';
import { chamarLLM, ErroLLM, provedoresDoAmbiente, type PedidoLLM } from '@/lib/agente/llm';
import { erroHttp, fetchFalso, fetchTravado, ferramentas, respostaSSE, texto } from './sse';

const provedores = provedoresDoAmbiente({ DEEPSEEK_API_KEY: 'chave-ds-teste', OPENROUTER_API_KEY: 'chave-or-teste' });
const pedido: PedidoLLM = { mensagens: [{ role: 'user', content: 'oi' }] };
const silencioso = { log: () => {} };

describe('provedoresDoAmbiente', () => {
  it('DeepSeek é o principal e OpenRouter a reserva, com os modelos padrão; sem chave, o provedor fica de fora', () => {
    expect(provedores.map(p => [p.nome, p.modelo, p.url])).toEqual([
      ['deepseek', 'deepseek-flash', 'https://api.deepseek.com/chat/completions'],
      ['openrouter', 'deepseek/deepseek-v4.1-flash', 'https://openrouter.ai/api/v1/chat/completions'],
    ]);
    expect(provedoresDoAmbiente({ OPENROUTER_API_KEY: 'x', OPENROUTER_MODEL: 'outro/modelo' }).map(p => [p.nome, p.modelo])).toEqual([['openrouter', 'outro/modelo']]);
    expect(provedoresDoAmbiente({ DEEPSEEK_API_KEY: 'x', DEEPSEEK_MODEL: 'deepseek-v4-pro' })[0].modelo).toBe('deepseek-v4-pro');
    expect(provedoresDoAmbiente({})).toEqual([]);
  });
});

describe('chamarLLM', () => {
  it('chama a DeepSeek com raciocínio desligado e streama o texto', async () => {
    const { fetch, pedidos } = fetchFalso([texto('Olá', ', Lucca')]);
    const deltas: string[] = [];
    const r = await chamarLLM(pedido, { provedores, fetch, aoTexto: d => deltas.push(d), ...silencioso });
    expect(deltas).toEqual(['Olá', ', Lucca']);
    expect(r).toMatchObject({ texto: 'Olá, Lucca', chamadas: [], provedor: 'deepseek', uso: { entrada: 1000, saida: 50, cacheEntrada: 800 } });
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].url).toBe('https://api.deepseek.com/chat/completions');
    expect(pedidos[0].cabecalhos.authorization).toBe('Bearer chave-ds-teste');
    expect(pedidos[0].corpo).toMatchObject({ model: 'deepseek-flash', stream: true, thinking: { type: 'disabled' } });
    expect(pedidos[0].corpo).not.toHaveProperty('reasoning_effort');
  });

  it('acumula chamadas de tool paralelas vindas em pedaços', async () => {
    const { fetch } = fetchFalso([
      ferramentas({ id: 'a', nome: 'valor', args: { indicador: 'turnover' } }, { id: 'b', nome: 'serie', args: { indicador: 'enps' } }),
    ]);
    const r = await chamarLLM(pedido, { provedores, fetch, ...silencioso });
    expect(r.chamadas).toEqual([
      { id: 'a', type: 'function', function: { name: 'valor', arguments: '{"indicador":"turnover"}' } },
      { id: 'b', type: 'function', function: { name: 'serie', arguments: '{"indicador":"enps"}' } },
    ]);
    expect(r.motivoFim).toBe('tool_calls');
  });

  it.each([
    ['modelo inexistente (404)', () => erroHttp(404, 'Model Not Exist')],
    ['modelo inválido (400)', () => erroHttp(400, 'invalid model')],
    ['erro do servidor (503)', () => erroHttp(503)],
    ['limite de taxa (429)', () => erroHttp(429)],
    ['erro de rede', () => Promise.reject(new TypeError('fetch failed'))],
  ])('cai para a OpenRouter (raciocínio desligado) em %s', async (_, falha) => {
    const { fetch, pedidos } = fetchFalso([falha, texto('da reserva')]);
    const r = await chamarLLM(pedido, { provedores, fetch, ...silencioso });
    expect(r).toMatchObject({ texto: 'da reserva', provedor: 'openrouter' });
    expect(pedidos.map(p => p.url)).toEqual(['https://api.deepseek.com/chat/completions', 'https://openrouter.ai/api/v1/chat/completions']);
    expect(pedidos[1].corpo).toMatchObject({ model: 'deepseek/deepseek-v4.1-flash', reasoning: { enabled: false } });
    expect(pedidos[1].corpo).not.toHaveProperty('thinking');
    expect(pedidos[1].cabecalhos.authorization).toBe('Bearer chave-or-teste');
    expect(r.tentativas[0]).toMatchObject({ provedor: 'deepseek', ok: false });
  });

  it('cai para a reserva quando a principal não responde dentro do timeout', async () => {
    const { fetch } = fetchFalso([fetchTravado, texto('ok')]);
    const r = await chamarLLM(pedido, { provedores, fetch, timeoutMs: 30, ...silencioso });
    expect(r.provedor).toBe('openrouter');
    expect(r.tentativas[0]).toMatchObject({ provedor: 'deepseek', ok: false, erro: 'timeout' });
  });

  it('loga provedor, status e latência sem expor a chave; se todos falham, o erro não carrega detalhe interno', async () => {
    const log = vi.fn();
    const { fetch } = fetchFalso([erroHttp(500, 'boom chave-ds-teste'), erroHttp(502)]);
    const erro = await chamarLLM(pedido, { provedores, fetch, log }).catch(e => e);
    expect(erro).toBeInstanceOf(ErroLLM);
    const linhas = log.mock.calls.map(c => String(c[0]));
    expect(linhas.some(l => /deepseek/.test(l) && /500/.test(l) && /\d+ ?ms/.test(l))).toBe(true);
    expect(linhas.some(l => /openrouter/.test(l) && /502/.test(l))).toBe(true);
    expect(linhas.join('\n')).not.toMatch(/chave-(ds|or)-teste/);
    expect(String(erro.message)).not.toMatch(/chave|boom/);
  });

  it('não troca de provedor depois de já ter emitido texto (evita resposta duplicada)', async () => {
    const quebrado = respostaSSE([{ choices: [{ index: 0, delta: { content: 'meio' } }] }, { error: { message: 'upstream reset' } }]);
    const { fetch, pedidos } = fetchFalso([quebrado, texto('não deveria')]);
    await expect(chamarLLM(pedido, { provedores, fetch, aoTexto: () => {}, ...silencioso })).rejects.toBeInstanceOf(ErroLLM);
    expect(pedidos).toHaveLength(1);
  });

  it('pede JSON quando solicitado (layout spec)', async () => {
    const { fetch, pedidos } = fetchFalso([texto('{"a":1}')]);
    await chamarLLM({ ...pedido, json: true, maxTokens: 900 }, { provedores, fetch, ...silencioso });
    expect(pedidos[0].corpo).toMatchObject({ response_format: { type: 'json_object' }, max_tokens: 900 });
  });
});
