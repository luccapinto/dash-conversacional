/**
 * Borda HTTP do agente: rate limit por IP, validação e corte do histórico, contexto inválido e o
 * stream SSE de ponta a ponta com o modelo mockado.
 */

import { describe, expect, it } from 'vitest';
import { criarMotor } from '@/lib/analytics/engine';
import { motorCliente } from '@/lib/analytics/cliente';
import type { EventoAgente } from '@/lib/agente/contrato';
import { criarHandlerAgente, criarLimitador, LIMITES_HISTORICO, prepararEntrada } from '@/lib/agente/http';
import { provedoresDoAmbiente } from '@/lib/agente/llm';
import { cubo } from '../analytics/carregar';
import { fetchFalso, ferramentas, texto } from './sse';

const periodo = { inicio: '2025-10', fim: '2026-09' };
const ambiente = { motor: criarMotor([cubo()], 'cubo'), motorSinais: motorCliente, log: () => {} };
const provedores = provedoresDoAmbiente({ DEEPSEEK_API_KEY: 'chave-ds-teste' });
const msg = (conteudo: string, papel: 'usuario' | 'assistente' = 'usuario') => ({ papel, conteudo });

function pedido(corpo: unknown, ip = '1.2.3.4'): Request {
  return new Request('http://localhost/api/agente', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `${ip}, 10.0.0.1` },
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });
}

async function eventosDe(resp: Response): Promise<EventoAgente[]> {
  const corpo = await resp.text();
  return corpo.split('\n\n').filter(Boolean).map(l => JSON.parse(l.replace(/^data: /, '')) as EventoAgente);
}

describe('criarLimitador', () => {
  it('limita por IP dentro da janela e libera depois dela', () => {
    let agora = 0;
    const limitar = criarLimitador({ limite: 2, janelaMs: 60_000, agora: () => agora });
    expect([limitar('a'), limitar('a'), limitar('a'), limitar('b')]).toEqual([true, true, false, true]);
    agora = 60_001;
    expect(limitar('a')).toBe(true);
  });
});

describe('prepararEntrada', () => {
  it('aceita histórico + contexto e mantém só as mensagens recentes dentro do orçamento', () => {
    const longa = 'x'.repeat(LIMITES_HISTORICO.caracteresPorMensagem);
    const mensagens = Array.from({ length: 30 }, (_, i) => msg(longa, i % 2 ? 'assistente' : 'usuario'));
    mensagens[28] = msg(longa, 'assistente');
    mensagens[29] = msg('e agora?');
    const r = prepararEntrada({ mensagens, contexto: { indicador: 'enps', periodo } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const total = r.entrada.mensagens.reduce((s, m) => s + m.conteudo.length, 0);
    expect(total).toBeLessThanOrEqual(LIMITES_HISTORICO.caracteresTotal);
    expect(r.entrada.mensagens.length).toBeLessThanOrEqual(LIMITES_HISTORICO.mensagens);
    expect(r.entrada.mensagens.at(-1)).toEqual(msg('e agora?'));
    expect(r.entrada.mensagens[0].papel).toBe('usuario');
    expect(r.entrada.contexto).toEqual({ indicador: 'enps', periodo });
  });

  it('recusa corpo malformado, última mensagem que não é do usuário, mensagem gigante e contexto inválido', () => {
    const erros = (x: unknown) => {
      const r = prepararEntrada(x);
      return r.ok ? [] : r.erros;
    };
    expect(erros(null)[0]).toMatch(/esperado object/);
    expect(erros({ mensagens: [] })[0]).toMatch(/mensagens: mínimo de 1/);
    expect(erros({ mensagens: [msg('oi', 'assistente')] })).toEqual(['mensagens: a última precisa ser do usuário']);
    expect(erros({ mensagens: [msg('x'.repeat(LIMITES_HISTORICO.caracteresPorMensagem + 1))] })[0]).toMatch(/máximo de \d+ caracteres/);
    expect(erros({ mensagens: [msg('oi')], contexto: { periodo: { inicio: '2030-01', fim: '2030-02' } } })[0]).toMatch(/^contexto\.periodo\.inicio/);
  });
});

describe('handler POST /api/agente', () => {
  it('streama eventos SSE do agente até o fim', async () => {
    const { fetch } = fetchFalso([ferramentas({ nome: 'valor', args: { indicador: 'turnover', periodo } }), texto('Feito.')]);
    const handler = criarHandlerAgente(() => ({ ambiente, provedores, fetch, log: () => {} }));
    const resp = await handler(pedido({ mensagens: [msg('Turnover?')] }));
    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toMatch(/text\/event-stream/);
    const eventos = await eventosDe(resp);
    expect(eventos.map(e => e.tipo)).toEqual(['passo', 'passo', 'texto', 'bloco', 'rastro', 'fim']);
  });

  it('responde 400 legível para entrada inválida, 503 sem chave e 429 acima do limite por IP', async () => {
    const handler = criarHandlerAgente(() => ({ ambiente, provedores, fetch: fetchFalso([]).fetch, log: () => {} }), { limite: 1, janelaMs: 60_000 });
    const invalido = await handler(pedido('{"mensagens":', '5.5.5.5'));
    expect(invalido.status).toBe(400);
    expect(await invalido.json()).toEqual({ erro: 'Pedido inválido.', detalhes: ['corpo não é JSON'] });
    const limitado = await handler(pedido({ mensagens: [msg('oi')] }, '5.5.5.5'));
    expect(limitado.status).toBe(429);
    expect((await limitado.json()).erro).toMatch(/Aguarde/);

    const semChave = criarHandlerAgente(() => ({ ambiente, provedores: [], log: () => {} }));
    const r = await semChave(pedido({ mensagens: [msg('oi')] }, '6.6.6.6'));
    expect(r.status).toBe(503);
    expect(JSON.stringify(await r.json())).not.toMatch(/DEEPSEEK|OPENROUTER|KEY/);
  });
});
