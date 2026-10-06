/**
 * Borda HTTP do layout: GET /api/layout?inicio=YYYY-MM&fim=YYYY-MM[&diretoria=…][&lente=…].
 * Combinação padrão → JSON pré-gerado (sem IA). Fora do padrão → gerado ao vivo, com cache em
 * memória por chave de recorte (pedidos simultâneos da mesma chave esperam a mesma geração) e o
 * mesmo fallback determinístico. Responde o LayoutSpec; o cabeçalho X-Layout-Fonte diz de onde veio.
 */

import { DIRETORIAS, MESES, type Diretoria } from '@/lib/analytics/dominio';
import type { MotorCliente } from '@/lib/analytics/engine';
import { LENTES, type Lente } from '@/lib/analytics/signals';
import { criarLimitador, ipDe, MENSAGEM_LIMITE, respostaJson, type OpcoesLimitador } from '@/lib/agente/http';
import type { Provedor } from '@/lib/agente/llm';
import { gerarLayout, type ResultadoLayout } from './gerador';
import { chaveLayout, type LayoutSpec, type RecorteLayout } from './spec';

export interface ConfigLayout {
  motor: MotorCliente;
  provedores: readonly Provedor[];
  /** layouts pré-gerados por chave */
  padrao: Readonly<Record<string, LayoutSpec>>;
  fetch?: typeof fetch;
  timeoutMs?: number;
  log?: (linha: string) => void;
}

const MAX_CACHE = 200;
const CACHE_CDN = 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800';

export type RecorteLido = { ok: true; recorte: RecorteLayout } | { ok: false; erros: string[] };

export function lerRecorte(params: URLSearchParams): RecorteLido {
  const erros: string[] = [];
  const inicio = params.get('inicio') ?? '';
  const fim = params.get('fim') ?? '';
  const d = params.get('diretoria');
  const l = params.get('lente');
  if (!MESES.includes(inicio)) erros.push(`inicio: use um mês de ${MESES[0]} a ${MESES[MESES.length - 1]} (YYYY-MM)`);
  if (!MESES.includes(fim)) erros.push(`fim: use um mês de ${MESES[0]} a ${MESES[MESES.length - 1]} (YYYY-MM)`);
  if (!erros.length && inicio > fim) erros.push('periodo: início depois do fim');
  const diretoria = d && d !== 'Geral' ? d : null;
  if (diretoria && !(DIRETORIAS as readonly string[]).includes(diretoria)) erros.push(`diretoria: use Geral ou ${DIRETORIAS.join(', ')}`);
  if (l && !(LENTES as readonly string[]).includes(l)) erros.push(`lente: use ${LENTES.join(', ')}`);
  if (erros.length) return { ok: false, erros };
  const lente = (l as Lente | null) ?? (diretoria ? 'gestor' : 'chro');
  return { ok: true, recorte: { periodo: { inicio, fim }, diretoria: diretoria as Diretoria | null, lente } };
}

function resposta(spec: LayoutSpec, fonte: 'pre-gerado' | 'cache' | 'gerado', cachear: boolean): Response {
  return new Response(JSON.stringify(spec), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cachear ? CACHE_CDN : 'no-store', 'X-Layout-Fonte': fonte },
  });
}

export function criarHandlerLayout(config: () => ConfigLayout, limite: OpcoesLimitador = { limite: 30, janelaMs: 60_000 }): (req: Request) => Promise<Response> {
  const permitir = criarLimitador(limite);
  const cache = new Map<string, Promise<ResultadoLayout>>();
  return async req => {
    if (!permitir(ipDe(req))) return respostaJson(429, { erro: MENSAGEM_LIMITE });
    const lido = lerRecorte(new URL(req.url).searchParams);
    if (!lido.ok) return respostaJson(400, { erro: 'Recorte inválido.', detalhes: lido.erros });
    const cfg = config();
    const chave = chaveLayout(lido.recorte);
    const pre = cfg.padrao[chave];
    if (pre) return resposta(pre, 'pre-gerado', true);

    let geracao = cache.get(chave);
    const fonte = geracao ? 'cache' : 'gerado';
    if (!geracao) {
      geracao = gerarLayout(lido.recorte, { motor: cfg.motor, provedores: cfg.provedores, fetch: cfg.fetch, timeoutMs: cfg.timeoutMs, log: cfg.log });
      if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
      cache.set(chave, geracao);
    }
    const r = await geracao;
    // falha transitória (IA fora do ar): não guarda, o próximo pedido tenta de novo
    const transitoria = r.motivo === 'IA indisponível';
    if (transitoria) cache.delete(chave);
    return resposta(r.spec, fonte, r.spec.origem === 'ia');
  };
}
