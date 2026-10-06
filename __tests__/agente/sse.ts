/**
 * Respostas falsas da API de chat (formato OpenAI com stream) para testar sem rede.
 */

import { vi } from 'vitest';

export interface ChamadaFalsa {
  id?: string;
  nome: string;
  args: unknown;
}

/** Corpo SSE a partir de chunks já no formato da API */
export function respostaSSE(chunks: unknown[], status = 200): Response {
  const linhas = [...chunks.map(c => `data: ${JSON.stringify(c)}\n\n`), 'data: [DONE]\n\n'];
  const corpo = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      // quebra no meio de uma linha para exercitar o buffer do parser
      for (const l of linhas) {
        const meio = Math.floor(l.length / 2);
        controller.enqueue(enc.encode(l.slice(0, meio)));
        controller.enqueue(enc.encode(l.slice(meio)));
      }
      controller.close();
    },
  });
  return new Response(corpo, { status, headers: { 'Content-Type': 'text/event-stream' } });
}

export const USO_FALSO = { prompt_tokens: 1000, completion_tokens: 50, total_tokens: 1050, prompt_cache_hit_tokens: 800 };

/** Resposta de texto, em pedaços */
export function texto(...pedacos: string[]): Response {
  return respostaSSE([
    ...pedacos.map(p => ({ choices: [{ index: 0, delta: { content: p }, finish_reason: null }] })),
    { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: USO_FALSO },
  ]);
}

/** Resposta com chamadas de tool (paralelas se houver mais de uma), com argumentos em pedaços */
export function ferramentas(...chamadas: ChamadaFalsa[]): Response {
  const chunks: unknown[] = [];
  chamadas.forEach((c, index) => {
    const args = typeof c.args === 'string' ? c.args : JSON.stringify(c.args);
    const meio = Math.floor(args.length / 2);
    chunks.push({ choices: [{ index: 0, delta: { tool_calls: [{ index, id: c.id ?? `call_${index}`, type: 'function', function: { name: c.nome, arguments: args.slice(0, meio) } }] } }] });
    chunks.push({ choices: [{ index: 0, delta: { tool_calls: [{ index, function: { arguments: args.slice(meio) } }] } }] });
  });
  chunks.push({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: USO_FALSO });
  return respostaSSE(chunks);
}

export function erroHttp(status: number, mensagem = 'erro'): Response {
  return new Response(JSON.stringify({ error: { message: mensagem } }), { status, headers: { 'Content-Type': 'application/json' } });
}

/** fetch que só termina quando abortado (simula provedor travado) */
export function fetchTravado(): Promise<Response> {
  return Promise.withResolvers<Response>().promise;
}

export interface PedidoCapturado {
  url: string;
  corpo: Record<string, unknown> & { messages: Array<Record<string, unknown>>; tools?: Array<{ function: { name: string } }> };
  cabecalhos: Record<string, string>;
}

type Proxima = Response | ((p: PedidoCapturado, init: RequestInit) => Response | Promise<Response>);

/**
 * fetch falso: cada chamada consome a próxima resposta da fila (ou chama a função com o pedido).
 * Guarda os pedidos para asserções e respeita o AbortSignal como o fetch real.
 */
export function fetchFalso(fila: Proxima[]) {
  const pedidos: PedidoCapturado[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const pedido: PedidoCapturado = {
      url: String(url),
      corpo: JSON.parse(String(init.body)),
      cabecalhos: Object.fromEntries(new Headers(init.headers).entries()),
    };
    pedidos.push(pedido);
    const proxima = fila.shift();
    if (!proxima) throw new Error(`fetch inesperado (${pedidos.length}º pedido)`);
    if (typeof proxima !== 'function') return proxima;
    if (!init.signal) return proxima(pedido, init);
    const abortado = Promise.withResolvers<Response>();
    init.signal.addEventListener('abort', () => abortado.reject(new DOMException('aborted', 'AbortError')));
    return Promise.race([proxima(pedido, init), abortado.promise]);
  });
  return { fetch: fn as unknown as typeof fetch, pedidos };
}
