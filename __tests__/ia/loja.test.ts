/**
 * Estado do painel da IA: reabrir o mesmo contexto usa a resposta em memória (sem novo pedido);
 * fechar no meio da resposta cancela o pedido e descarta o turno incompleto.
 */

import { describe, expect, it } from 'vitest';
import { LojaIA } from '@/lib/ia/loja';
import type { PedidoIA } from '@/lib/ia/pedidos';

const PEDIDO: PedidoIA = {
  chave: 'k1',
  contexto: { indicador: 'turnover', periodo: { inicio: '2025-10', fim: '2026-09' } },
  pergunta: 'O que influenciou o resultado de turnover total em Set/26?',
  chips: ['Turnover total'],
};

const EVENTOS = [
  { tipo: 'passo', resultado: 'r1', ferramenta: 'valor', rotulo: 'Valor', estado: 'fim' },
  { tipo: 'texto', delta: 'ok' },
  { tipo: 'fim', verificacao: { total: 0, verificados: 0, naoVerificados: [] } },
];
const completo = () => new Response(EVENTOS.map(e => `data: ${JSON.stringify(e)}\n\n`).join(''));

describe('LojaIA', () => {
  it('reabrir o mesmo contexto não pede de novo', async () => {
    let chamadas = 0;
    const loja = new LojaIA({ fetch: (async () => (chamadas++, completo())) as unknown as typeof fetch });
    await loja.abrir(PEDIDO);
    expect(loja.foto().conversas.k1.turnos[0].estado).toBe('concluido');
    loja.fechar();
    await loja.abrir(PEDIDO);
    expect(chamadas).toBe(1);
    expect(loja.foto().conversas.k1.turnos).toHaveLength(1);
  });

  it('fechar no meio cancela o pedido, descarta o turno e reabrir pergunta de novo', async () => {
    const sinais: AbortSignal[] = [];
    const travado = (async (_: unknown, init: RequestInit) => {
      sinais.push(init.signal!);
      const { promise, reject } = Promise.withResolvers<Response>();
      init.signal!.addEventListener('abort', () => reject(new DOMException('cancelado', 'AbortError')));
      return promise;
    }) as unknown as typeof fetch;
    const loja = new LojaIA({ fetch: travado });
    const primeira = loja.abrir(PEDIDO);
    expect(loja.foto().conversas.k1.turnos[0].estado).toBe('aguardando');
    loja.fechar();
    await primeira;
    expect(sinais[0].aborted).toBe(true);
    expect(loja.foto().conversas.k1.turnos).toHaveLength(0);
    void loja.abrir(PEDIDO);
    expect(loja.foto().conversas.k1.turnos).toHaveLength(1);
    loja.fechar();
  });
});
