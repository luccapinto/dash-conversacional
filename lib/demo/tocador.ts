/**
 * Tocador do modo demonstração: põe os eventos gravados numa linha do tempo de "pensando e
 * escrevendo na hora" e os entrega, um a um, ao mesmo `aplicarEvento` do stream ao vivo. A ordem
 * é a da gravação; só o texto final é re-picotado em pedaços de 1 a 3 palavras.
 *
 * Linha do tempo (sorteio com semente = id da gravação: a mesma resposta toca sempre igual):
 * - Pensando (1,5 a 3 s): "Analisando…" sozinho por um instante; depois a narração e os passos, que
 *   aparecem um a um e passam a concluídos 300–900 ms depois de começar.
 * - Blocos: entram quando o passo que os gerou (`mostrar`) termina, um a cada 150–250 ms.
 * - Escrevendo: pedaços de 1–3 palavras, pausa maior em fim de frase e de parágrafo. A velocidade
 *   parte de 50–70 caracteres/s e acelera o necessário para a resposta inteira caber em 6–10 s
 *   (os textos gravados têm 420–870 caracteres; a mediana ao vivo é 7 s).
 * - Rastro ("Como calculei") e selo da guarda (`fim`) no final.
 */

import type { EventoAgente } from '@/lib/agente/contrato';
import { aplicarEvento, type Turno } from '@/lib/ia/stream';
import type { GravacaoDemo } from './tipos';

export interface Momento {
  /** ms desde o início da resposta */
  em: number;
  evento: EventoAgente;
}

export const LIMITES_TEMPO = {
  total: { min: 6000, max: 10000 },
  pensando: { min: 1500, max: 3000 },
  passo: { min: 300, max: 900 },
  blocos: { min: 150, max: 250 },
} as const;

/** Mulberry32 com semente do texto: valores em [0, 1) */
function sorteador(semente: string): () => number {
  let s = 2166136261;
  for (let i = 0; i < semente.length; i++) s = Math.imul(s ^ semente.charCodeAt(i), 16777619);
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ehInicio = (e: EventoAgente | undefined) => e?.tipo === 'passo' && e.estado === 'inicio';
const fimDe = (linha: readonly Momento[]) => linha.at(-1)?.em ?? 0;

/**
 * Pensando: narração e passos. `f` (0 a 1) encolhe as variações até o pensar caber no alvo; os
 * sorteios vêm prontos, então o mesmo `f` dá sempre a mesma linha.
 */
function pensar(eventos: readonly EventoAgente[], sorteios: readonly number[], f: number): Momento[] {
  const { passo } = LIMITES_TEMPO;
  const saida: Momento[] = [];
  const pendentes: EventoAgente[] = [];
  const inicioDe = new Map<string, number>();
  let k = 0;
  const u = () => sorteios[k++ % sorteios.length];
  let t = 350 + 450 * u() * f;
  for (let i = 0; i < eventos.length; i++) {
    const e = eventos[i];
    // a narração entra junto do passo seguinte: vai direto para a narração, sem piscar como resposta
    if (e.tipo !== 'passo') {
      pendentes.push(e);
      continue;
    }
    if (e.estado === 'inicio') {
      if (ehInicio(eventos[i - 1])) {
        // passos da mesma rodada, um a um, sem que o primeiro passe de 900 ms esperando o último começar
        let rodada = 1;
        for (let j = i - 1; ehInicio(eventos[j]); j--) rodada++;
        for (let j = i + 1; ehInicio(eventos[j]); j++) rodada++;
        t += Math.min(100 + 140 * u() * f, (passo.max - 140) / (rodada - 1));
      } else if (saida.length) t += 150 + 150 * u() * f;
      inicioDe.set(e.resultado, t);
    } else {
      const inicio = inicioDe.get(e.resultado) ?? t;
      t = Math.max(t + 40 + 60 * u() * f, inicio + passo.min + (passo.max - passo.min) * u() * f);
    }
    for (const p of pendentes.splice(0)) saida.push({ em: t, evento: p });
    saida.push({ em: t, evento: e });
  }
  for (const p of pendentes) saida.push({ em: t, evento: p });
  return saida;
}

/** Pedaços de 1 a 3 palavras, com o espaço que vem depois; a concatenação é o texto original */
function picotar(texto: string, u: () => number): string[] {
  const palavras = texto.match(/\s*\S+\s*|\s+/g) ?? [];
  const pedacos: string[] = [];
  for (let i = 0; i < palavras.length; ) {
    let n = 1 + Math.floor(u() * 3);
    let pedaco = '';
    while (n-- > 0 && i < palavras.length) {
      pedaco += palavras[i++];
      if (pedaco.includes('\n')) break;
    }
    pedacos.push(pedaco);
  }
  return pedacos;
}

const FIM_DE_FRASE = /[.!?:;]\**\s*$/;
const FIM_DE_LINHA = /\n\s*$/;

export function linhaDoTempo(eventos: readonly EventoAgente[], semente: string): Momento[] {
  const u = sorteador(semente);
  const corte = eventos.findLastIndex(e => e.tipo === 'passo') + 1;
  const alvoPensar = 1800 + 1000 * u();
  const alvoTotal = 6600 + 2400 * u();

  // pensar: encolhe as variações até caber no alvo; se sobrar, "Analisando…" fica mais um pouco
  const sorteios = Array.from({ length: 3 * corte + 1 }, u);
  let linha = pensar(eventos.slice(0, corte), sorteios, 1);
  for (let d = 9; d >= 0 && fimDe(linha) > alvoPensar; d--) linha = pensar(eventos.slice(0, corte), sorteios, d / 10);
  const sobra = Math.max(0, alvoPensar - fimDe(linha));
  const saida = linha.map(m => ({ em: m.em + sobra, evento: m.evento }));

  let t = fimDe(saida) || alvoPensar;
  let blocos = 0;
  let porCaractere = 0;
  let pausaFrase = 0;
  let pausaLinha = 0;
  const textoFinal = eventos.slice(corte).flatMap(e => (e.tipo === 'texto' ? [e.delta] : [])).join('');
  for (const e of eventos.slice(corte)) {
    if (e.tipo === 'bloco') {
      t += blocos++ ? LIMITES_TEMPO.blocos.min + 100 * u() : 100 + 100 * u();
      saida.push({ em: t, evento: e });
    } else if (e.tipo === 'texto') {
      if (!porCaractere) {
        // ritmo da escrita: o que sobra do alvo, com as pausas de frase e de parágrafo
        t += 250 + 200 * u();
        const janela = Math.max(2500, alvoTotal - t - 450);
        const caracteres = Math.max(1, textoFinal.trim().length);
        const frases = (textoFinal.match(/[.!?:;]\**(?=\s)/g) ?? []).length;
        const linhas = (textoFinal.trim().match(/\n/g) ?? []).length;
        const pausas = Math.min(0.3 * janela, frases * 160 + linhas * 320) / Math.max(1, frases * 160 + linhas * 320);
        pausaFrase = 160 * pausas;
        pausaLinha = 320 * pausas;
        // 50–70 caracteres/s é o piso; acelera até 400/s se o texto não couber
        const piso = 1000 / (50 + 20 * u());
        porCaractere = Math.min(piso, Math.max(2.5, (janela - frases * pausaFrase - linhas * pausaLinha) / caracteres));
      }
      for (const pedaco of picotar(e.delta, u)) {
        if (pedaco.trim()) t += pedaco.length * porCaractere * (0.8 + 0.4 * u());
        saida.push({ em: t, evento: { tipo: 'texto', delta: pedaco } });
        if (FIM_DE_LINHA.test(pedaco)) t += pausaLinha * (0.8 + 0.4 * u());
        else if (FIM_DE_FRASE.test(pedaco)) t += pausaFrase * (0.8 + 0.4 * u());
      }
    } else {
      t += e.tipo === 'rastro' ? 250 + 150 * u() : 100 + 100 * u();
      saida.push({ em: t, evento: e });
    }
  }
  return saida.map(m => ({ em: Math.round(m.em), evento: m.evento }));
}

// ── Reprodução ────────────────────────────────────────────────────────────────

export interface Reproducao {
  /** aplica na hora o que falta (botão "Mostrar tudo" ou clique na resposta) */
  mostrarTudo(): void;
  /** para sem aplicar o resto e sem deixar timer vivo */
  cancelar(): void;
  readonly fim: Promise<'concluida' | 'cancelada'>;
}

/**
 * Entrega os eventos no tempo da linha, um timer por vez. `animar = false` (prefers-reduced-motion)
 * aplica tudo de uma vez, sem timer nenhum.
 */
export function tocar(momentos: readonly Momento[], aplicar: (e: EventoAgente) => void, animar = true): Reproducao {
  let i = 0;
  let agora = 0;
  let pararTimer: (() => void) | null = null;
  let encerrar: (s: 'concluida' | 'cancelada') => void = () => {};
  const fim = new Promise<'concluida' | 'cancelada'>(r => (encerrar = r));
  let ativa = true;

  const ate = (limite: number) => {
    while (ativa && i < momentos.length && momentos[i].em <= limite) aplicar(momentos[i++].evento);
  };
  const terminar = (s: 'concluida' | 'cancelada') => {
    pararTimer?.();
    pararTimer = null;
    ativa = false;
    encerrar(s);
  };
  const seguir = () => {
    pararTimer = null;
    ate(agora);
    if (!ativa) return;
    if (i >= momentos.length) return terminar('concluida');
    const proximo = momentos[i].em;
    const id = setTimeout(() => {
      agora = proximo;
      seguir();
    }, proximo - agora);
    pararTimer = () => clearTimeout(id);
  };

  if (animar) seguir();
  else {
    ate(Infinity);
    terminar('concluida');
  }
  return {
    mostrarTudo: () => {
      if (!ativa) return;
      ate(Infinity);
      terminar('concluida');
    },
    cancelar: () => {
      if (ativa) terminar('cancelada');
    },
    fim,
  };
}

// ── Gravação inteira: baixar e tocar ──────────────────────────────────────────

const SEM_GRAVACAO = 'Não consegui carregar a resposta gravada. Verifique a rede e tente de novo.';

const abortada = () => new DOMException('A reprodução foi cancelada.', 'AbortError');

export interface OpcoesGravacao {
  id: string;
  /** turno já criado com a pergunta da gravação */
  turno: Turno;
  sinal: AbortSignal;
  fetch?: typeof fetch;
  animar: boolean;
  aoAtualizar: (t: Turno) => void;
  /** recebe o controle da reprodução assim que ela começa (para o "Mostrar tudo") */
  aoTocar?: (r: Reproducao) => void;
}

/**
 * Baixa public/demo/<id>.json e toca. Como `perguntarAgente`: erro de rede vira mensagem no turno,
 * cancelamento (AbortSignal) propaga como AbortError para quem chamou descartar o turno.
 */
export async function tocarGravacao(o: OpcoesGravacao): Promise<Turno> {
  let t = o.turno;
  let gravacao: GravacaoDemo;
  try {
    const r = await (o.fetch ?? fetch)(`/demo/${o.id}.json`, { signal: o.sinal });
    if (!r.ok) return { ...t, estado: 'erro', erro: SEM_GRAVACAO };
    gravacao = await r.json();
  } catch {
    if (o.sinal.aborted) throw abortada();
    return { ...t, estado: 'erro', erro: SEM_GRAVACAO };
  }
  if (o.sinal.aborted) throw abortada();
  const reproducao = tocar(
    linhaDoTempo(gravacao.eventos, gravacao.id),
    e => {
      t = aplicarEvento(t, e);
      o.aoAtualizar(t);
    },
    o.animar,
  );
  o.aoTocar?.(reproducao);
  const cancelar = () => reproducao.cancelar();
  o.sinal.addEventListener('abort', cancelar, { once: true });
  const status = await reproducao.fim;
  o.sinal.removeEventListener('abort', cancelar);
  if (status === 'cancelada') throw abortada();
  return t;
}
