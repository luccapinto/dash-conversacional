/**
 * Cliente SSE do painel da IA: monta passos, texto, blocos, rastro e guarda a partir dos eventos de
 * /api/agente; stream que termina sem `fim` vira "interrompido"; erro HTTP vira mensagem amigável.
 */

import { describe, expect, it } from 'vitest';
import type { BlocoKpi, EventoAgente, ItemRastro } from '@/lib/agente/contrato';
import { historico, perguntarAgente, type Turno } from '@/lib/ia/stream';

/** Resposta SSE do agente, quebrada no meio das linhas para exercitar o buffer */
function sse(eventos: EventoAgente[], { status = 200 } = {}): Response {
  const texto = eventos.map(e => `data: ${JSON.stringify(e)}\n\n`).join('');
  const corpo = new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder();
      for (let i = 0; i < texto.length; i += 7) c.enqueue(enc.encode(texto.slice(i, i + 7)));
      c.close();
    },
  });
  return new Response(corpo, { status, headers: { 'Content-Type': 'text/event-stream' } });
}

const fetchCom = (r: Response | (() => Promise<Response>)) => (async () => (typeof r === 'function' ? r() : r)) as unknown as typeof fetch;

const BLOCO = { id: 'b1', tipo: 'kpi', titulo: 'Turnover voluntário', subtitulo: 'Empresa · Out/25 a Set/26', indicador: 'turnover_voluntario', unidade: '% a.a.', resultado: 'r1', valor: 18.4, meta: 16, status: 'fora', n: 4900, amostraSuficiente: true } as unknown as BlocoKpi;
const RASTRO: ItemRastro[] = [{ resultado: 'r1', ferramenta: 'valor', rotulo: 'Valor de turnover voluntário', argumentos: { indicador: 'turnover_voluntario' }, ok: true, formula: 'x ÷ y', n: 4900, duracaoMs: 3 }];

async function perguntar(resposta: Response | (() => Promise<Response>)) {
  const estados: Turno[] = [];
  const final = await perguntarAgente({ pergunta: 'O que influenciou?', mensagens: [{ papel: 'usuario', conteudo: 'O que influenciou?' }], fetch: fetchCom(resposta), aoAtualizar: t => estados.push(t) });
  return { final, estados };
}

describe('perguntarAgente', () => {
  it('monta passos, texto em streaming, blocos, rastro e a verificação final', async () => {
    const { final, estados } = await perguntar(sse([
      { tipo: 'passo', resultado: 'r1', ferramenta: 'valor', rotulo: 'Valor de turnover voluntário', estado: 'inicio' },
      { tipo: 'passo', resultado: 'r2', ferramenta: 'serie', rotulo: 'Série mensal', estado: 'inicio' },
      { tipo: 'passo', resultado: 'r1', ferramenta: 'valor', rotulo: 'Valor de turnover voluntário', estado: 'fim' },
      { tipo: 'passo', resultado: 'r2', ferramenta: 'serie', rotulo: 'Série mensal', estado: 'erro' },
      { tipo: 'bloco', bloco: BLOCO },
      { tipo: 'texto', delta: '**18,4% a.a.**' },
      { tipo: 'texto', delta: ' no acumulado.' },
      { tipo: 'rastro', itens: RASTRO },
      { tipo: 'fim', verificacao: { total: 2, verificados: 1, naoVerificados: [{ texto: '55%', valor: 55 }] } },
    ]));
    expect(final.estado).toBe('concluido');
    expect(final.passos.map(p => [p.resultado, p.estado])).toEqual([['r1', 'fim'], ['r2', 'erro']]);
    expect(final.texto).toBe('**18,4% a.a.** no acumulado.');
    expect(final.blocos).toEqual([BLOCO]);
    expect(final.rastro).toEqual(RASTRO);
    expect(final.verificacao?.naoVerificados).toEqual([{ texto: '55%', valor: 55 }]);
    // o texto aparece aos poucos
    expect(estados.some(t => t.estado === 'transmitindo' && t.texto === '**18,4% a.a.**')).toBe(true);
  });

  it('stream que termina sem `fim` é resposta interrompida (o texto parcial fica)', async () => {
    const { final } = await perguntar(sse([{ tipo: 'texto', delta: 'O turnover voluntário' }]));
    expect(final.estado).toBe('interrompido');
    expect(final.texto).toBe('O turnover voluntário');
    expect(final.erro).toMatch(/interrompida/);
  });

  it('evento `erro` do agente vira estado de erro com a mensagem dele', async () => {
    const { final } = await perguntar(sse([{ tipo: 'erro', mensagem: 'A IA não respondeu a tempo.' }]));
    expect(final).toMatchObject({ estado: 'erro', erro: 'A IA não respondeu a tempo.' });
  });

  it('erro HTTP vira mensagem amigável (limite por IP usa a mensagem do servidor)', async () => {
    const limite = new Response(JSON.stringify({ erro: 'Muitas perguntas em sequência. Aguarde um instante e tente de novo.' }), { status: 429 });
    expect((await perguntar(limite)).final).toMatchObject({ estado: 'erro', erro: 'Muitas perguntas em sequência. Aguarde um instante e tente de novo.' });
    const quebrado = new Response('<html>Bad Gateway</html>', { status: 502 });
    expect((await perguntar(quebrado)).final.erro).toMatch(/HTTP 502/);
  });

  it('sem rede: mensagem de conexão, sem exceção', async () => {
    const { final } = await perguntar(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(final.estado).toBe('erro');
    expect(final.erro).toMatch(/conex/i);
  });
});

describe('historico', () => {
  it('manda as trocas concluídas e a pergunta nova, com cada mensagem dentro do limite da rota', () => {
    const longo = 'x'.repeat(5000);
    const turnos = [
      { pergunta: 'p1', texto: longo, estado: 'concluido' },
      { pergunta: 'p2', texto: '', estado: 'erro' },
    ] as Turno[];
    const m = historico(turnos, 'p3');
    expect(m.map(x => x.papel)).toEqual(['usuario', 'assistente', 'usuario']);
    expect(m[1].conteudo.length).toBeLessThanOrEqual(4000);
    expect(m[2]).toEqual({ papel: 'usuario', conteudo: 'p3' });
  });
});
