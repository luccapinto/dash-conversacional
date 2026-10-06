/**
 * Tocador do modo demonstração com relógio falso: a ordem tocada é a da gravação, os tempos cabem
 * no "pensando e escrevendo" (6–10 s), "Mostrar tudo" completa, cancelar e trocar de pergunta não
 * deixam timer vivo e o prefers-reduced-motion não anima. A loja em demonstração nunca chama
 * /api/agente: só baixa public/demo/<id>.json.
 */

import * as fs from 'fs';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventoAgente } from '@/lib/agente/contrato';
import type { GravacaoDemo } from '@/lib/demo/tipos';
import { LIMITES_TEMPO, linhaDoTempo, tocar, type Momento } from '@/lib/demo/tocador';
import { LojaIA } from '@/lib/ia/loja';
import { pedidoDoIndicador } from '@/lib/ia/pedidos';
import { aplicarEvento, novoTurno, type Turno } from '@/lib/ia/stream';
import { FILTROS_PADRAO } from '@/lib/painel/filtros';
import { lerJson } from '../analytics/carregar';

const PASTA = path.resolve(__dirname, '..', '..', 'public/demo');
const gravacoes = fs
  .readdirSync(PASTA)
  .filter(a => a.endsWith('.json'))
  .map(a => lerJson<GravacaoDemo>(`public/demo/${a}`));
const gravacao = (id: string) => gravacoes.find(g => g.id === id)!;
const G = gravacao('turnover-voluntario');

/** Textos seguidos viram um só: a gravação vem em linhas, o tocador em pedaços de 1–3 palavras */
function juntar(eventos: readonly EventoAgente[]): EventoAgente[] {
  const saida: EventoAgente[] = [];
  for (const e of eventos) {
    const anterior = saida.at(-1);
    if (e.tipo === 'texto' && anterior?.tipo === 'texto') saida[saida.length - 1] = { tipo: 'texto', delta: anterior.delta + e.delta };
    else saida.push(e);
  }
  return saida;
}

const turnoDe = (eventos: readonly EventoAgente[]): Turno => eventos.reduce(aplicarEvento, novoTurno(G.pergunta));
const palavras = (s: string) => s.split(/\s+/).filter(Boolean).length;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('linha do tempo', () => {
  it('toca os eventos de cada gravação na ordem gravada, com o mesmo texto, em tempos que só avançam', () => {
    for (const g of gravacoes) {
      const linha = linhaDoTempo(g.eventos, g.id);
      expect(juntar(linha.map(m => m.evento)), g.id).toEqual(juntar(g.eventos));
      expect(linha.every((m, i) => i === 0 || m.em >= linha[i - 1].em), g.id).toBe(true);
      expect(linhaDoTempo(g.eventos, g.id), `${g.id}: a mesma resposta toca sempre igual`).toEqual(linha);
    }
  });

  it('cabe no pensando e escrevendo: 6–10 s no total, 1,5–3 s pensando, passos de 300–900 ms, blocos a cada 150–250 ms, pedaços de 1–3 palavras', () => {
    const { total, pensando, passo, blocos } = LIMITES_TEMPO;
    for (const g of gravacoes) {
      const linha = linhaDoTempo(g.eventos, g.id);
      const em = (f: (m: Momento) => boolean) => linha.filter(f).map(m => m.em);
      expect(linha.at(-1)!.em, `${g.id} total`).toBeGreaterThanOrEqual(total.min);
      expect(linha.at(-1)!.em, `${g.id} total`).toBeLessThanOrEqual(total.max);
      const fimDoPensar = Math.max(...em(m => m.evento.tipo === 'passo'));
      expect(fimDoPensar, `${g.id} pensando`).toBeGreaterThanOrEqual(pensando.min);
      expect(fimDoPensar, `${g.id} pensando`).toBeLessThanOrEqual(pensando.max);

      const inicio = new Map<string, number>();
      for (const m of linha) {
        if (m.evento.tipo !== 'passo') continue;
        if (m.evento.estado === 'inicio') inicio.set(m.evento.resultado, m.em);
        else {
          const d = m.em - inicio.get(m.evento.resultado)!;
          expect(d, `${g.id} ${m.evento.resultado}`).toBeGreaterThanOrEqual(passo.min);
          expect(d, `${g.id} ${m.evento.resultado}`).toBeLessThanOrEqual(passo.max);
        }
      }
      // blocos entram depois do passo que os gerou (mostrar), um a um
      const tBlocos = em(m => m.evento.tipo === 'bloco');
      expect(tBlocos[0], `${g.id} bloco depois do passo`).toBeGreaterThan(fimDoPensar);
      for (let i = 1; i < tBlocos.length; i++) {
        expect(tBlocos[i] - tBlocos[i - 1], g.id).toBeGreaterThanOrEqual(blocos.min - 1);
        expect(tBlocos[i] - tBlocos[i - 1], g.id).toBeLessThanOrEqual(blocos.max + 1);
      }
      // o texto final sai depois dos blocos, em pedaços de 1 a 3 palavras; selo e rastro no fim
      const pedacos = linha.filter(m => m.em > fimDoPensar && m.evento.tipo === 'texto').map(m => (m.evento.tipo === 'texto' ? m.evento.delta : ''));
      expect(pedacos.filter(p => p.trim()).every(p => palavras(p) >= 1 && palavras(p) <= 3), g.id).toBe(true);
      expect(linha.slice(-2).map(m => m.evento.tipo), g.id).toEqual(['rastro', 'fim']);
    }
  });
});

describe('tocar', () => {
  const linha = linhaDoTempo(G.eventos, G.id);

  it('entrega cada evento no seu tempo, pelo relógio, e termina sem timer vivo', async () => {
    const tocados: EventoAgente[] = [];
    const r = tocar(linha, e => tocados.push(e));
    let agora = 0;
    for (const t of [0, 300, 1000, 2500, 4000, 6000, linha.at(-1)!.em - 1, linha.at(-1)!.em]) {
      vi.advanceTimersByTime(t - agora);
      agora = t;
      expect(tocados.length, `${t} ms`).toBe(linha.filter(m => m.em <= t).length);
    }
    expect(tocados).toEqual(linha.map(m => m.evento));
    expect(vi.getTimerCount()).toBe(0);
    await expect(r.fim).resolves.toBe('concluida');
  });

  it('"Mostrar tudo" completa na hora: o turno é o da gravação inteira e não sobra timer', async () => {
    const tocados: EventoAgente[] = [];
    const r = tocar(linha, e => tocados.push(e));
    vi.advanceTimersByTime(2000);
    const meio = turnoDe(tocados);
    expect(meio.estado).not.toBe('concluido');
    r.mostrarTudo();
    expect(vi.getTimerCount()).toBe(0);
    const final = turnoDe(tocados);
    expect(final).toEqual(turnoDe(G.eventos));
    expect(final.estado).toBe('concluido');
    await expect(r.fim).resolves.toBe('concluida');
  });

  it('cancelar para no meio, não deixa timer vivo e não aplica mais nada', async () => {
    const tocados: EventoAgente[] = [];
    const r = tocar(linha, e => tocados.push(e));
    vi.advanceTimersByTime(1500);
    const n = tocados.length;
    r.cancelar();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(20_000);
    expect(tocados).toHaveLength(n);
    await expect(r.fim).resolves.toBe('cancelada');
  });

  it('sem animação (prefers-reduced-motion) aplica a resposta inteira de uma vez, sem timer', async () => {
    const tocados: EventoAgente[] = [];
    const r = tocar(linha, e => tocados.push(e), false);
    expect(vi.getTimerCount()).toBe(0);
    expect(turnoDe(tocados)).toEqual(turnoDe(G.eventos));
    await expect(r.fim).resolves.toBe('concluida');
  });
});

describe('loja no modo demonstração', () => {
  /** fetch falso: serve as gravações de public/demo e anota cada URL pedida */
  function servidor() {
    const urls: string[] = [];
    const fetch = (async (url: string) => {
      urls.push(url);
      const id = /^\/demo\/(.+)\.json$/.exec(url)?.[1];
      const g = id ? gravacao(id) : undefined;
      return { ok: Boolean(g), status: g ? 200 : 404, json: async () => g };
    }) as unknown as typeof globalThis.fetch;
    return { urls, fetch };
  }
  const PEDIDO = pedidoDoIndicador('turnover_voluntario', 'Turnover voluntário', false, FILTROS_PADRAO);
  const ultimo = (loja: LojaIA) => loja.foto().conversas[PEDIDO.chave].turnos.at(-1)!;

  it('o ✦ do indicador toca a gravação do "O que influenciou", sem chamar /api/agente', async () => {
    const { urls, fetch } = servidor();
    const loja = new LojaIA({ modo: 'demonstracao', fetch, animar: () => true });
    const fim = loja.abrir(PEDIDO);
    await vi.advanceTimersByTimeAsync(1000);
    expect(ultimo(loja)).toMatchObject({ gravacao: 'turnover-voluntario', pergunta: 'O que influenciou o resultado de turnover voluntário?', estado: 'aguardando' });
    await vi.runAllTimersAsync();
    await fim;
    expect(ultimo(loja)).toEqual({ ...turnoDe(G.eventos), gravacao: 'turnover-voluntario' });
    expect(urls).toEqual(['/demo/turnover-voluntario.json']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('trocar de pergunta cancela a anterior: o turno incompleto sai, só a nova toca e nenhum timer fica', async () => {
    const { fetch } = servidor();
    const loja = new LojaIA({ modo: 'demonstracao', fetch, animar: () => true });
    void loja.abrir(PEDIDO);
    await vi.advanceTimersByTimeAsync(2500);
    expect(ultimo(loja).gravacao).toBe('turnover-voluntario');
    const nova = loja.tocar('historia-fuga-tecnologia');
    expect(loja.foto().conversas[PEDIDO.chave].turnos.map(t => t.gravacao)).toEqual(['historia-fuga-tecnologia']);
    await vi.runAllTimersAsync();
    await nova;
    expect(loja.foto().conversas[PEDIDO.chave].turnos).toHaveLength(1);
    expect(ultimo(loja)).toMatchObject({ gravacao: 'historia-fuga-tecnologia', estado: 'concluido' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fechar no meio não deixa timer vivo; "Mostrar tudo" da loja completa a resposta', async () => {
    const { fetch } = servidor();
    const loja = new LojaIA({ modo: 'demonstracao', fetch, animar: () => true });
    void loja.abrir(PEDIDO);
    await vi.advanceTimersByTimeAsync(1500);
    loja.fechar();
    expect(vi.getTimerCount()).toBe(0);
    expect(loja.foto().conversas[PEDIDO.chave].turnos).toHaveLength(0);

    const reaberta = loja.abrir(PEDIDO);
    await vi.advanceTimersByTimeAsync(3000);
    loja.mostrarTudo();
    await reaberta;
    expect(ultimo(loja)).toEqual({ ...turnoDe(G.eventos), gravacao: 'turnover-voluntario' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('com prefers-reduced-motion a resposta aparece inteira, sem animação', async () => {
    const { fetch } = servidor();
    const loja = new LojaIA({ modo: 'demonstracao', fetch, animar: () => false });
    await loja.abrir(PEDIDO);
    expect(vi.getTimerCount()).toBe(0);
    expect(ultimo(loja)).toEqual({ ...turnoDe(G.eventos), gravacao: 'turnover-voluntario' });
  });

  it('na demonstração não há pergunta livre: perguntar não chama nada', async () => {
    const { urls, fetch } = servidor();
    const loja = new LojaIA({ modo: 'demonstracao', fetch, animar: () => false });
    await loja.abrir({ chave: 'livre', pergunta: null, chips: [] });
    await loja.perguntar('Qual o turnover de Tecnologia?');
    expect(urls).toEqual([]);
    expect(loja.foto().conversas.livre.turnos).toHaveLength(0);
  });
});
