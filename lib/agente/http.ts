/**
 * Borda HTTP das rotas de IA: rate limit por IP, validação e corte do histórico e o handler SSE do
 * agente. As rotas em app/api só ligam isso ao motor do servidor e às chaves do ambiente (rota do
 * Next não pode exportar nada além dos métodos e da configuração do segmento).
 *
 * Erros antes do stream saem como JSON com status HTTP (400, 429, 503) e mensagem em PT-BR sem
 * detalhe interno; depois de aberto o stream, só pelo evento `erro`.
 */

import { executarAgente, type MetricasAgente, type OpcoesAgente } from './agente';
import { validarContexto, type EntradaAgente, type EventoAgente, type MensagemChat } from './contrato';
import { validarEsquema, type JsonSchema } from '@/lib/analytics/schemas';

// ── Rate limit (em memória, por instância) ────────────────────────────────────

export interface OpcoesLimitador {
  limite: number;
  janelaMs: number;
  agora?: () => number;
}

/** Janela fixa por chave. Estado por instância serverless: proteção mínima da chave, não cota global. */
export function criarLimitador({ limite, janelaMs, agora = Date.now }: OpcoesLimitador): (chave: string) => boolean {
  const baldes = new Map<string, { contagem: number; reiniciaEm: number }>();
  return chave => {
    const t = agora();
    if (baldes.size > 5000) for (const [k, b] of baldes) if (t > b.reiniciaEm) baldes.delete(k);
    const balde = baldes.get(chave);
    if (!balde || t > balde.reiniciaEm) {
      baldes.set(chave, { contagem: 1, reiniciaEm: t + janelaMs });
      return true;
    }
    if (balde.contagem >= limite) return false;
    balde.contagem++;
    return true;
  };
}

export function ipDe(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
}

/**
 * Mesma origem: `Origin` (ou, sem ele, `Referer`) precisa apontar para o host que recebeu o pedido.
 * Sem nenhum dos dois, recusa. O fetch do próprio painel sempre manda Referer (Referrer-Policy
 * strict-origin-when-cross-origin em next.config.ts), em qualquer domínio, inclusive o de preview;
 * já um `<img src>` de outro site manda o domínio dele ou, com referrerpolicy="no-referrer", nada.
 * Não barra cliente programado (que forja cabeçalho): isso é com o limite por IP e a cota.
 */
export function mesmaOrigem(req: Request): boolean {
  const fonte = req.headers.get('origin') ?? req.headers.get('referer');
  if (!fonte) return false;
  let host: string;
  try {
    host = new URL(fonte).host;
  } catch {
    return false;
  }
  return host !== '' && [req.headers.get('x-forwarded-host')?.split(',')[0].trim(), req.headers.get('host'), new URL(req.url).host].includes(host);
}

export function respostaJson(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export const MENSAGEM_LIMITE = 'Muitas perguntas em sequência. Aguarde um instante e tente de novo.';

// ── Entrada ───────────────────────────────────────────────────────────────────

export const LIMITES_HISTORICO = {
  /** mensagens mantidas (as mais recentes) */
  mensagens: 12,
  caracteresPorMensagem: 4000,
  /** soma dos caracteres mantidos */
  caracteresTotal: 16_000,
  /** mensagens aceitas no corpo antes do corte */
  mensagensNoCorpo: 100,
} as const;

const ESQUEMA_ENTRADA: JsonSchema = {
  type: 'object',
  properties: {
    mensagens: {
      type: 'array',
      minItems: 1,
      maxItems: LIMITES_HISTORICO.mensagensNoCorpo,
      items: {
        type: 'object',
        properties: {
          papel: { type: 'string', enum: ['usuario', 'assistente'] },
          conteudo: { type: 'string', minLength: 1, maxLength: LIMITES_HISTORICO.caracteresPorMensagem },
        },
        required: ['papel', 'conteudo'],
        additionalProperties: false,
      },
    },
    contexto: { type: 'object' },
  },
  required: ['mensagens'],
  additionalProperties: false,
};

export type EntradaPreparada = { ok: true; entrada: EntradaAgente } | { ok: false; erros: string[] };

/** Valida o corpo e corta o histórico antigo: mais recentes primeiro, dentro do orçamento, começando no usuário */
export function prepararEntrada(corpo: unknown): EntradaPreparada {
  const erros = validarEsquema(ESQUEMA_ENTRADA, corpo);
  if (erros.length) return { ok: false, erros };
  const { mensagens, contexto } = corpo as { mensagens: MensagemChat[]; contexto?: unknown };
  if (mensagens[mensagens.length - 1].papel !== 'usuario') return { ok: false, erros: ['mensagens: a última precisa ser do usuário'] };
  let ctx: EntradaAgente['contexto'];
  if (contexto !== undefined) {
    const v = validarContexto(contexto);
    if (!v.ok) return { ok: false, erros: v.erros.map(e => `contexto.${e}`) };
    ctx = v.contexto;
  }
  const mantidas: MensagemChat[] = [];
  let total = 0;
  for (let i = mensagens.length - 1; i >= 0 && mantidas.length < LIMITES_HISTORICO.mensagens; i--) {
    total += mensagens[i].conteudo.length;
    if (total > LIMITES_HISTORICO.caracteresTotal && mantidas.length > 0) break;
    mantidas.unshift(mensagens[i]);
  }
  while (mantidas[0].papel !== 'usuario') mantidas.shift();
  return { ok: true, entrada: { mensagens: mantidas, ...(ctx ? { contexto: ctx } : {}) } };
}

// ── Handler do agente ─────────────────────────────────────────────────────────

export type ConfigAgente = Omit<OpcoesAgente, 'emitir' | 'sinal'>;

const LIMITE_PADRAO: OpcoesLimitador = { limite: 10, janelaMs: 60_000 };

export function criarHandlerAgente(config: () => ConfigAgente, limite: OpcoesLimitador = LIMITE_PADRAO): (req: Request) => Promise<Response> {
  const permitir = criarLimitador(limite);
  return async req => {
    if (!permitir(ipDe(req))) return respostaJson(429, { erro: MENSAGEM_LIMITE });
    let corpo: unknown;
    try {
      corpo = await req.json();
    } catch {
      return respostaJson(400, { erro: 'Pedido inválido.', detalhes: ['corpo não é JSON'] });
    }
    const preparada = prepararEntrada(corpo);
    if (!preparada.ok) return respostaJson(400, { erro: 'Pedido inválido.', detalhes: preparada.erros });
    const cfg = config();
    if (cfg.provedores.length === 0) return respostaJson(503, { erro: 'O agente está indisponível: a IA não foi configurada neste ambiente.' });
    const log = cfg.log ?? ((l: string) => console.info(l));

    const codificador = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let aberto = true;
        const emitir = (e: EventoAgente) => {
          if (!aberto) return;
          try {
            controller.enqueue(codificador.encode(`data: ${JSON.stringify(e)}\n\n`));
          } catch {
            aberto = false;
          }
        };
        const m: MetricasAgente = await executarAgente(preparada.entrada, { ...cfg, emitir, sinal: req.signal });
        log(
          `[agente] ${m.erro ? 'erro' : 'ok'} · rodadas ${m.rodadas} (tools ${m.rodadasFerramentas}) · provedores ${m.provedores.join('>') || '-'} · ` +
            `tokens ${m.uso.entrada}/${m.uso.cacheEntrada} cache/${m.uso.saida} · 1º texto ${m.latenciaPrimeiroTextoMs ?? '-'} ms · total ${m.latenciaTotalMs} ms · ` +
            `números ${m.verificacao ? `${m.verificacao.verificados}/${m.verificacao.total}` : '-'}`,
        );
        try {
          controller.close();
        } catch {
          // o cliente já cancelou o stream
        }
      },
    });
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
    });
  };
}
