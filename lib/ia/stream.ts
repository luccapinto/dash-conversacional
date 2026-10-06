/**
 * Cliente do agente (POST /api/agente) para o painel da IA. Lê o stream SSE (uma linha
 * `data: <EventoAgente>` por evento) e monta o turno: passos das tools em tempo real, texto em
 * streaming, blocos de visualização, rastro ("Como calculei") e a verificação da guarda.
 *
 * Robustez: stream encerrado sem `fim` (função cortada pela plataforma, rede caiu) = resposta
 * interrompida; erro HTTP ou sem rede = mensagem amigável no turno, nunca exceção. Cancelamento
 * (AbortSignal) propaga como AbortError para quem chamou descartar o turno.
 */

import type { BlocoVisualizacao, ContextoDeepDive, EventoAgente, ItemRastro, MensagemChat, Verificacao } from '@/lib/agente/contrato';

export type EstadoTurno = 'aguardando' | 'transmitindo' | 'concluido' | 'interrompido' | 'erro';

export interface PassoTurno {
  resultado: string;
  ferramenta: string;
  rotulo: string;
  estado: 'inicio' | 'fim' | 'erro';
}

export interface Turno {
  pergunta: string;
  passos: PassoTurno[];
  /** frases que o modelo escreve antes de chamar tools ("Vou puxar a série..."): narração, não resposta */
  narracao: string[];
  texto: string;
  blocos: BlocoVisualizacao[];
  rastro: ItemRastro[] | null;
  verificacao: Verificacao | null;
  estado: EstadoTurno;
  erro: string | null;
  /** modo demonstração: id da resposta gravada que o turno toca (public/demo/<id>.json) */
  gravacao?: string;
}

/** Limite de caracteres por mensagem aceito pela rota (LIMITES_HISTORICO no servidor) */
const MAX_CARACTERES = 4000;

const INTERROMPIDA = 'A resposta foi interrompida antes do fim.';
const SEM_CONEXAO = 'Sem conexão com o agente. Verifique a rede e tente de novo.';

export function novoTurno(pergunta: string): Turno {
  return { pergunta, passos: [], narracao: [], texto: '', blocos: [], rastro: null, verificacao: null, estado: 'aguardando', erro: null };
}

export function aplicarEvento(t: Turno, e: EventoAgente): Turno {
  switch (e.tipo) {
    case 'passo': {
      const passo: PassoTurno = { resultado: e.resultado, ferramenta: e.ferramenta, rotulo: e.rotulo, estado: e.estado };
      const i = t.passos.findIndex(p => p.resultado === e.resultado);
      const passos = i < 0 ? [...t.passos, passo] : t.passos.map((p, k) => (k === i ? passo : p));
      // Frase curta antes de uma rodada de tools ("Vou puxar a série...": um parágrafo, sem título,
      // lista ou tabela) é narração. Texto longo ou com estrutura é resposta: o modelo às vezes
      // escreve a análise inteira e chama `mostrar` na mesma rodada; aí o texto fica e a rodada
      // seguinte continua abaixo dele.
      const previa = t.texto.trim();
      if (e.estado === 'inicio' && previa && previa.length <= 240 && !previa.includes('\n')) return { ...t, passos, narracao: [...t.narracao, previa], texto: '', estado: 'aguardando' };
      return { ...t, passos };
    }
    case 'texto': {
      // o separador de rodada ('\n\n') não abre a resposta
      const texto = t.texto ? t.texto + e.delta : e.delta.trimStart();
      return { ...t, texto, estado: texto ? 'transmitindo' : t.estado };
    }
    case 'bloco':
      return t.blocos.some(b => b.id === e.bloco.id) ? t : { ...t, blocos: [...t.blocos, e.bloco] };
    case 'rastro':
      return { ...t, rastro: e.itens };
    case 'fim':
      return { ...t, verificacao: e.verificacao, estado: 'concluido' };
    case 'erro':
      return { ...t, estado: 'erro', erro: e.mensagem };
  }
}

/** Mensagens da conversa para a rota: trocas concluídas + a pergunta nova */
export function historico(turnos: readonly Turno[], pergunta: string): MensagemChat[] {
  const corte = (s: string) => (s.length > MAX_CARACTERES ? `${s.slice(0, MAX_CARACTERES - 1)}…` : s);
  return [
    ...turnos.filter(t => t.estado === 'concluido' && t.texto).flatMap((t): MensagemChat[] => [
      { papel: 'usuario', conteudo: corte(t.pergunta) },
      { papel: 'assistente', conteudo: corte(t.texto) },
    ]),
    { papel: 'usuario', conteudo: corte(pergunta) },
  ];
}

async function mensagemHttp(r: Response): Promise<string> {
  let erro: string | undefined;
  try {
    const corpo: unknown = await r.json();
    if (corpo && typeof corpo === 'object' && 'erro' in corpo && typeof corpo.erro === 'string') erro = corpo.erro;
  } catch {
    // corpo não é JSON (proxy, página de erro)
  }
  if (r.status === 429 || r.status === 503) return erro ?? 'O agente está ocupado agora. Tente de novo em instantes.';
  if (r.status === 400) return 'Não consegui enviar a pergunta (pedido inválido). Reformule e tente de novo.';
  return `O agente falhou ao responder (HTTP ${r.status}). Tente de novo.`;
}

const ehAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

export interface OpcoesPergunta {
  pergunta: string;
  mensagens: MensagemChat[];
  contexto?: ContextoDeepDive;
  sinal?: AbortSignal;
  fetch?: typeof fetch;
  aoAtualizar?: (t: Turno) => void;
}

export async function perguntarAgente(o: OpcoesPergunta): Promise<Turno> {
  let t = novoTurno(o.pergunta);
  const atualizar = (novo: Turno) => {
    t = novo;
    o.aoAtualizar?.(t);
  };
  let resp: Response;
  try {
    resp = await (o.fetch ?? fetch)('/api/agente', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensagens: o.mensagens, ...(o.contexto ? { contexto: o.contexto } : {}) }),
      signal: o.sinal,
    });
  } catch (e) {
    if (ehAbort(e)) throw e;
    return { ...t, estado: 'erro', erro: SEM_CONEXAO };
  }
  if (!resp.ok || !resp.body) return { ...t, estado: 'erro', erro: await mensagemHttp(resp) };

  const leitor = resp.body.getReader();
  const dec = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await leitor.read();
      if (done) break;
      buffer += dec.decode(value, { stream: true });
      let fimEvento: number;
      while ((fimEvento = buffer.indexOf('\n\n')) >= 0) {
        const bloco = buffer.slice(0, fimEvento);
        buffer = buffer.slice(fimEvento + 2);
        for (const linha of bloco.split('\n')) {
          if (!linha.startsWith('data:')) continue;
          try {
            atualizar(aplicarEvento(t, JSON.parse(linha.slice(5).trim()) as EventoAgente));
          } catch {
            // linha corrompida: ignora e segue no stream
          }
        }
      }
    }
  } catch (e) {
    if (ehAbort(e) || o.sinal?.aborted) throw e;
    // a conexão caiu no meio: cai no "interrompido" abaixo
  }
  if (t.estado !== 'concluido' && t.estado !== 'erro') atualizar({ ...t, estado: 'interrompido', erro: INTERROMPIDA });
  return t;
}
