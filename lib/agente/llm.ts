/**
 * Cliente LLM (servidor): API de chat compatível com OpenAI, sempre com stream, com principal e
 * reserva.
 *
 *  - Principal: DeepSeek direto, raciocínio desligado (`thinking: {type: 'disabled'}`; nada de
 *    `reasoning_effort`, que liga o raciocínio).
 *  - Reserva: OpenRouter, raciocínio desligado (`reasoning: {enabled: false}`, equivalente
 *    documentado de `thinking: {type: 'disabled'}`).
 *
 * Fallback: qualquer falha da principal antes de emitir texto (rede, HTTP ≠ 2xx — 400/404 de
 * modelo, 429, 5xx —, timeout ou erro no meio do stream) passa para a reserva. Depois de emitir
 * texto não troca: a resposta sairia duplicada. Loga provedor, status e latência; nunca a chave
 * nem o corpo de erro do provedor. O erro lançado (ErroLLM) não carrega detalhe interno.
 *
 * Escrito à mão (fetch + SSE) em vez do Vercel AI SDK: o SDK não tem fallback entre provedores no
 * core (só via AI Gateway). Ver o resumo da fase 2.
 */

import type { JsonSchema } from '@/lib/analytics/schemas';

export type NomeProvedor = 'deepseek' | 'openrouter';

export interface Provedor {
  nome: NomeProvedor;
  url: string;
  modelo: string;
  chave: string;
  /** campos extras do corpo (raciocínio desligado) */
  extras: Record<string, unknown>;
  cabecalhos: Record<string, string>;
}

export interface ChamadaFerramenta {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type MensagemLLM =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ChamadaFerramenta[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface DefinicaoFerramenta {
  type: 'function';
  function: { name: string; description: string; parameters: JsonSchema };
}

export interface PedidoLLM {
  mensagens: MensagemLLM[];
  ferramentas?: DefinicaoFerramenta[];
  escolhaFerramenta?: 'auto' | 'none';
  /** response_format json_object (o prompt precisa mencionar JSON e trazer um exemplo) */
  json?: boolean;
  maxTokens?: number;
  temperatura?: number;
}

export interface Uso {
  entrada: number;
  saida: number;
  /** tokens de entrada servidos do cache de prefixo (mais baratos) */
  cacheEntrada: number;
}

export interface Tentativa {
  provedor: NomeProvedor;
  ok: boolean;
  status: number | null;
  latenciaMs: number;
  erro?: 'timeout' | 'rede' | 'http' | 'stream';
}

export interface RespostaLLM {
  texto: string;
  chamadas: ChamadaFerramenta[];
  motivoFim: string | null;
  uso: Uso;
  provedor: NomeProvedor;
  /** do envio ao fim do stream, no provedor que respondeu */
  latenciaMs: number;
  tentativas: Tentativa[];
}

export interface OpcoesLLM {
  /** em ordem de preferência */
  provedores: readonly Provedor[];
  fetch?: typeof fetch;
  aoTexto?: (delta: string) => void;
  /** tempo máximo sem resposta nem chunk novo (padrão 20 s) */
  timeoutMs?: number;
  /** cancelamento externo (cliente desconectou) */
  sinal?: AbortSignal;
  log?: (linha: string) => void;
}

export class ErroLLM extends Error {
  override name = 'ErroLLM';
  constructor(
    message: string,
    readonly tentativas: Tentativa[],
  ) {
    super(message);
  }
}

const TIMEOUT_PADRAO_MS = 20_000;

export function provedoresDoAmbiente(env: Record<string, string | undefined> = process.env): Provedor[] {
  const lista: Provedor[] = [];
  if (env.DEEPSEEK_API_KEY) {
    lista.push({
      nome: 'deepseek',
      url: 'https://api.deepseek.com/chat/completions',
      modelo: env.DEEPSEEK_MODEL || 'deepseek-flash',
      chave: env.DEEPSEEK_API_KEY,
      extras: { thinking: { type: 'disabled' } },
      cabecalhos: {},
    });
  }
  if (env.OPENROUTER_API_KEY) {
    lista.push({
      nome: 'openrouter',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      modelo: env.OPENROUTER_MODEL || 'deepseek/deepseek-v4.1-flash',
      chave: env.OPENROUTER_API_KEY,
      extras: { reasoning: { enabled: false } },
      cabecalhos: { 'HTTP-Referer': env.NEXT_PUBLIC_APP_URL || 'https://dash-conversacional.vercel.app', 'X-Title': 'Verta People Analytics' },
    });
  }
  return lista;
}

class ErroStream extends Error {}

interface Acumulado {
  texto: string;
  chamadas: ChamadaFerramenta[];
  motivoFim: string | null;
  uso: Uso;
}

interface DeltaChunk {
  choices?: Array<{
    delta?: { content?: string | null; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  error?: unknown;
}

/** Lê o SSE da API de chat; `aoChunk` rearma o timeout a cada pedaço recebido */
async function lerStream(corpo: ReadableStream<Uint8Array>, aoTexto: (d: string) => void, aoChunk: () => void): Promise<Acumulado> {
  const acc: Acumulado = { texto: '', chamadas: [], motivoFim: null, uso: { entrada: 0, saida: 0, cacheEntrada: 0 } };
  const leitor = corpo.getReader();
  const decodificador = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    aoChunk();
    buffer += decodificador.decode(value, { stream: true });
    const linhas = buffer.split('\n');
    buffer = linhas.pop() ?? '';
    for (const linha of linhas) {
      const t = linha.trim();
      if (!t.startsWith('data:')) continue; // comentários (": OPENROUTER PROCESSING") e linhas vazias
      const dados = t.slice(5).trim();
      if (dados === '[DONE]') return acc;
      let chunk: DeltaChunk;
      try {
        chunk = JSON.parse(dados) as DeltaChunk;
      } catch {
        continue;
      }
      if (chunk.error) throw new ErroStream('erro no meio do stream');
      const escolha = chunk.choices?.[0];
      const delta = escolha?.delta;
      if (delta?.content) {
        acc.texto += delta.content;
        aoTexto(delta.content);
      }
      for (const tc of delta?.tool_calls ?? []) {
        const atual = (acc.chamadas[tc.index] ??= { id: '', type: 'function', function: { name: '', arguments: '' } });
        if (tc.id) atual.id = tc.id;
        if (tc.function?.name) atual.function.name += tc.function.name;
        if (tc.function?.arguments) atual.function.arguments += tc.function.arguments;
      }
      if (escolha?.finish_reason) acc.motivoFim = escolha.finish_reason;
      if (chunk.usage) {
        acc.uso = {
          entrada: chunk.usage.prompt_tokens ?? 0,
          saida: chunk.usage.completion_tokens ?? 0,
          cacheEntrada: chunk.usage.prompt_cache_hit_tokens ?? chunk.usage.prompt_tokens_details?.cached_tokens ?? 0,
        };
      }
    }
  }
  return acc;
}

export async function chamarLLM(pedido: PedidoLLM, opcoes: OpcoesLLM): Promise<RespostaLLM> {
  const f = opcoes.fetch ?? fetch;
  const log = opcoes.log ?? ((l: string) => console.info(l));
  const timeoutMs = opcoes.timeoutMs ?? TIMEOUT_PADRAO_MS;
  const tentativas: Tentativa[] = [];

  for (const p of opcoes.provedores) {
    const inicio = Date.now();
    const controle = new AbortController();
    let estourou = false;
    let timer: NodeJS.Timeout | undefined;
    const rearmar = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        estourou = true;
        controle.abort();
      }, timeoutMs);
    };
    rearmar();
    const repassarAbort = () => controle.abort();
    opcoes.sinal?.addEventListener('abort', repassarAbort);
    let emitiu = false;
    let status: number | null = null;

    try {
      const corpo: Record<string, unknown> = {
        model: p.modelo,
        messages: pedido.mensagens,
        stream: true,
        stream_options: { include_usage: true },
        temperature: pedido.temperatura ?? 0.2,
        ...(pedido.maxTokens ? { max_tokens: pedido.maxTokens } : {}),
        ...(pedido.ferramentas?.length ? { tools: pedido.ferramentas, tool_choice: pedido.escolhaFerramenta ?? 'auto' } : {}),
        ...(pedido.json ? { response_format: { type: 'json_object' } } : {}),
        ...p.extras,
      };
      const resp = await f(p.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${p.chave}`, 'Content-Type': 'application/json', ...p.cabecalhos },
        body: JSON.stringify(corpo),
        signal: controle.signal,
      });
      status = resp.status;
      if (!resp.ok || !resp.body) {
        await resp.body?.cancel().catch(() => {});
        const latenciaMs = Date.now() - inicio;
        tentativas.push({ provedor: p.nome, ok: false, status, latenciaMs, erro: 'http' });
        log(`[llm] ${p.nome} falhou: HTTP ${status} em ${latenciaMs} ms`);
        continue;
      }
      rearmar();
      const acc = await lerStream(
        resp.body,
        d => {
          emitiu = true;
          opcoes.aoTexto?.(d);
        },
        rearmar,
      );
      const latenciaMs = Date.now() - inicio;
      tentativas.push({ provedor: p.nome, ok: true, status, latenciaMs });
      log(`[llm] ${p.nome} ok: HTTP ${status} em ${latenciaMs} ms (${acc.uso.entrada} tokens de entrada, ${acc.uso.cacheEntrada} em cache, ${acc.uso.saida} de saída)`);
      return { ...acc, chamadas: acc.chamadas.filter(Boolean), provedor: p.nome, latenciaMs, tentativas };
    } catch (e) {
      if (opcoes.sinal?.aborted) throw e;
      const latenciaMs = Date.now() - inicio;
      const erro: Tentativa['erro'] = estourou ? 'timeout' : e instanceof ErroStream ? 'stream' : 'rede';
      tentativas.push({ provedor: p.nome, ok: false, status, latenciaMs, erro });
      log(`[llm] ${p.nome} falhou: ${erro}${status ? ` (HTTP ${status})` : ''} em ${latenciaMs} ms`);
      if (emitiu) throw new ErroLLM('A resposta foi interrompida no meio.', tentativas);
    } finally {
      clearTimeout(timer);
      opcoes.sinal?.removeEventListener('abort', repassarAbort);
    }
  }
  throw new ErroLLM(opcoes.provedores.length ? 'Nenhum provedor de IA respondeu.' : 'Nenhum provedor de IA configurado.', tentativas);
}
