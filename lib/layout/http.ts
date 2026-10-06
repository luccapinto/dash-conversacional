/**
 * Borda HTTP do layout: GET /api/layout?inicio=YYYY-MM&fim=YYYY-MM[&diretoria=…][&lente=…].
 * Combinação padrão → JSON pré-gerado (sem IA). Fora do padrão → gerado ao vivo, com cache em
 * memória por chave de recorte (pedidos simultâneos da mesma chave esperam a mesma geração) e o
 * mesmo fallback determinístico. Responde o LayoutSpec; o cabeçalho X-Layout-Fonte diz de onde veio.
 *
 * Custo: só a mesma origem (403 fora dela, ver `mesmaOrigem`), limite por IP (429) e, por
 * instância, uma cota de gerações e um teto de custo estimado por janela. Cota estourada nunca é
 * erro HTTP: sai o layout determinístico (X-Layout-Fonte: cota), sem chamar a IA, e fica no log.
 */

import { DIRETORIAS, MESES, type Diretoria } from '@/lib/analytics/dominio';
import type { MotorCliente } from '@/lib/analytics/engine';
import { LENTES, type Lente } from '@/lib/analytics/signals';
import { criarLimitadorPorIp, MENSAGEM_LIMITE, mesmaOrigem, respostaJson, type OpcoesLimitador } from '@/lib/agente/http';
import { custoEstimadoUsd, type Provedor, type Uso } from '@/lib/agente/llm';
import { layoutDeterministico } from './deterministico';
import { gerarLayout, type ResultadoLayout } from './gerador';
import { chaveLayout, sinaisDoRecorte, type LayoutSpec, type RecorteLayout } from './spec';

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

/** Cota de geração com IA por instância, numa janela fixa (além do limite por IP) */
export interface CotaLayout {
  geracoes: number;
  /** teto de custo estimado na janela, em US$ pelo preço de pico (PRECO_PICO_USD_POR_M) */
  custoUsd: number;
  janelaMs: number;
  agora?: () => number;
}

/** ~US$ 0,002 por geração: 40 por hora ficam abaixo do teto de US$ 0,10 por hora */
export const COTA_LAYOUT: CotaLayout = { geracoes: 40, custoUsd: 0.1, janelaMs: 60 * 60_000 };

function criarCota({ geracoes, custoUsd, janelaMs, agora = Date.now }: CotaLayout) {
  let janela = { inicio: agora(), geracoes: 0, custo: 0 };
  const atual = () => {
    const t = agora();
    if (t - janela.inicio >= janelaMs) janela = { inicio: t, geracoes: 0, custo: 0 };
    return janela;
  };
  return {
    /** Reserva uma geração; devolve o motivo se a janela já gastou a cota */
    reservar(): string | null {
      const j = atual();
      if (j.geracoes >= geracoes) return `${j.geracoes} gerações na janela (cota ${geracoes})`;
      if (j.custo >= custoUsd) return `US$ ${j.custo.toFixed(4)} gastos na janela (teto US$ ${custoUsd})`;
      j.geracoes++;
      return null;
    },
    gastar(uso: Uso | null): void {
      if (uso) atual().custo += custoEstimadoUsd(uso);
    },
  };
}

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

function resposta(spec: LayoutSpec, fonte: 'pre-gerado' | 'cache' | 'gerado' | 'cota', cachear: boolean): Response {
  return new Response(JSON.stringify(spec), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cachear ? CACHE_CDN : 'no-store', 'X-Layout-Fonte': fonte },
  });
}

export function criarHandlerLayout(
  config: () => ConfigLayout,
  limite: OpcoesLimitador = { limite: 30, janelaMs: 60_000 },
  cota: CotaLayout = COTA_LAYOUT,
): (req: Request) => Promise<Response> {
  const permitir = criarLimitadorPorIp(limite);
  const orcamento = criarCota(cota);
  const cache = new Map<string, Promise<ResultadoLayout>>();
  return async req => {
    if (!mesmaOrigem(req)) return respostaJson(403, { erro: 'Origem não permitida.' });
    const lido = lerRecorte(new URL(req.url).searchParams);
    if (!lido.ok) return respostaJson(400, { erro: 'Recorte inválido.', detalhes: lido.erros });
    if (!permitir(req)) return respostaJson(429, { erro: MENSAGEM_LIMITE });
    const cfg = config();
    const chave = chaveLayout(lido.recorte);
    const pre = cfg.padrao[chave];
    if (pre) return resposta(pre, 'pre-gerado', true);

    let geracao = cache.get(chave);
    const fonte = geracao ? 'cache' : 'gerado';
    if (!geracao) {
      const estourou = orcamento.reservar();
      if (estourou) {
        (cfg.log ?? console.info)(`[layout] ${chave}: determinístico (cota da instância: ${estourou})`);
        return resposta(layoutDeterministico(lido.recorte, sinaisDoRecorte(cfg.motor, lido.recorte)), 'cota', false);
      }
      geracao = gerarLayout(lido.recorte, { motor: cfg.motor, provedores: cfg.provedores, fetch: cfg.fetch, timeoutMs: cfg.timeoutMs, log: cfg.log });
      geracao.then(r => orcamento.gastar(r.uso), () => {});
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
