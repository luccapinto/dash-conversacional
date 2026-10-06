/**
 * Gravação do modo demonstração: o agente de verdade (`executarAgente`) com um provedor
 * roteirizado no lugar do modelo. O "modelo" é um `fetch` falso que devolve, no formato SSE da API
 * de chat, a narração e as chamadas de ferramenta do roteiro, depois o `mostrar` e por fim o texto
 * escrito à mão. Ferramentas, blocos, rastro e guarda são o código do agente ao vivo: os eventos
 * gravados saem exatamente dele, sem rede e sem chave.
 *
 * Só para scripts e testes (Node): o navegador recebe o índice (lib/dados/cliente/demo.json) e as
 * gravações (public/demo/<id>.json).
 */

import { CATALOGO, type IdIndicador } from '@/lib/analytics/catalog';
import type { Lente } from '@/lib/analytics/signals';
import { executarAgente, type MetricasAgente } from '@/lib/agente/agente';
import type { ContextoDeepDive, EventoAgente, NomeFerramenta, TipoBloco } from '@/lib/agente/contrato';
import { criarSessao, type AmbienteFerramentas } from '@/lib/agente/ferramentas';
import type { ChamadaFerramenta, Provedor } from '@/lib/agente/llm';
import type { GravacaoDemo, GrupoDemo, ItemDemo } from './tipos';

export interface Consulta {
  ferramenta: Exclude<NomeFerramenta, 'mostrar'>;
  args: Record<string, unknown>;
}

export interface EntradaRoteiro {
  id: string;
  grupo: GrupoDemo;
  pergunta: string;
  /** contexto de deep dive da pergunta: é o recorte que a resposta cobre */
  recorte: ContextoDeepDive;
  /** indicadores ligados à resposta (padrão: o indicador do recorte) */
  indicadores?: IdIndicador[];
  /** resumo: as lentes do resumo executivo em que a pergunta é sugerida */
  lentes?: Lente[];
  /** frase curta antes das ferramentas */
  narracao: string;
  /** rodadas de ferramentas; os resultados recebem r1, r2… na ordem das chamadas */
  rodadas: Consulta[][];
  /** o que vira bloco, numa rodada própria depois dos resultados */
  mostrar: Array<{ resultado: string; tipo?: TipoBloco }>;
  /** a resposta final, escrita depois de ler os resultados */
  texto: string;
  continuacoes: string[];
}

/** Provedor que nunca vai à rede: a URL só identifica o roteiro no log */
const PROVEDOR_ROTEIRO: Provedor = { nome: 'deepseek', url: 'roteiro://demo', modelo: 'roteiro', chave: 'sem-chave', extras: {}, cabecalhos: {} };

interface RespostaRoteirizada {
  texto?: string;
  chamadas?: ChamadaFerramenta[];
}

function respostaSSE({ texto, chamadas = [] }: RespostaRoteirizada): Response {
  const chunks: unknown[] = [];
  // um pedaço por linha, como chega do provedor: o painel re-picota na hora de tocar
  for (const pedaco of texto?.split(/(?<=\n)/) ?? []) chunks.push({ choices: [{ index: 0, delta: { content: pedaco }, finish_reason: null }] });
  chamadas.forEach((c, index) => chunks.push({ choices: [{ index: 0, delta: { tool_calls: [{ index, ...c }] }, finish_reason: null }] }));
  chunks.push({ choices: [{ index: 0, delta: {}, finish_reason: chamadas.length ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 0, completion_tokens: 0 } });
  const corpo = [...chunks.map(c => `data: ${JSON.stringify(c)}\n\n`), 'data: [DONE]\n\n'].join('');
  return new Response(corpo, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

/** As respostas do "modelo", rodada a rodada: narração + 1ª rodada, demais rodadas, mostrar, texto */
function respostasDoRoteiro(e: EntradaRoteiro): RespostaRoteirizada[] {
  let seq = 0;
  const chamada = (name: string, args: unknown): ChamadaFerramenta => ({ id: `call_${++seq}`, type: 'function', function: { name, arguments: JSON.stringify(args) } });
  return [
    ...e.rodadas.map((rodada, i) => ({ ...(i === 0 ? { texto: e.narracao } : {}), chamadas: rodada.map(c => chamada(c.ferramenta, c.args)) })),
    ...(e.mostrar.length ? [{ chamadas: [chamada('mostrar', { blocos: e.mostrar })] }] : []),
    { texto: e.texto },
  ];
}

export function fetchRoteirizado(e: EntradaRoteiro): typeof fetch {
  const fila = respostasDoRoteiro(e);
  return (async () => {
    const r = fila.shift();
    if (!r) throw new Error(`${e.id}: o agente pediu mais uma rodada que o roteiro não tem`);
    return respostaSSE(r);
  }) as unknown as typeof fetch;
}

export interface ResultadoGravacao {
  gravacao: GravacaoDemo;
  metricas: MetricasAgente;
  /** o que impede a gravação de valer (vazio = ok) */
  problemas: string[];
}

export async function gravar(e: EntradaRoteiro, ambiente: AmbienteFerramentas): Promise<ResultadoGravacao> {
  const eventos: EventoAgente[] = [];
  const metricas = await executarAgente(
    { mensagens: [{ papel: 'usuario', conteudo: e.pergunta }], contexto: e.recorte },
    { ambiente, provedores: [PROVEDOR_ROTEIRO], fetch: fetchRoteirizado(e), emitir: ev => eventos.push(ev), log: () => {} },
  );
  // o tempo de cada consulta não é gravado: o arquivo sai com os mesmos bytes a cada gravação
  const semTempo = eventos.map((ev): EventoAgente => (ev.tipo === 'rastro' ? { ...ev, itens: ev.itens.map(i => ({ ...i, duracaoMs: 0 })) } : ev));

  const problemas: string[] = [];
  if (metricas.erro) problemas.push(`agente falhou: ${metricas.erro}`);
  for (const f of metricas.ferramentas) if (!f.ok) problemas.push(`${f.nome} falhou: ${f.erro}`);
  const v = metricas.verificacao;
  if (!v) problemas.push('sem verificação da guarda');
  else if (v.verificados !== v.total) problemas.push(`guarda: ${v.verificados}/${v.total} números conferidos; fora: ${v.naoVerificados.map(n => `"${n.texto}"`).join(', ')}`);
  if (metricas.blocos !== e.mostrar.length) problemas.push(`${metricas.blocos} blocos exibidos, o roteiro pede ${e.mostrar.length}`);
  return { gravacao: { id: e.id, pergunta: e.pergunta, recorte: e.recorte, eventos: semTempo }, metricas, problemas };
}

/** O que cada consulta do roteiro devolve ao modelo: é o que se lê antes de escrever o texto */
export async function resultadosDoRoteiro(e: EntradaRoteiro, ambiente: AmbienteFerramentas): Promise<Array<{ id: string; rotulo: string; paraModelo: unknown }>> {
  const sessao = criarSessao(ambiente);
  let seq = 0;
  const saida = [];
  for (const c of e.rodadas.flat()) {
    const r = await sessao.executar(sessao.preparar({ id: `call_${++seq}`, type: 'function', function: { name: c.ferramenta, arguments: JSON.stringify(c.args) } }));
    saida.push({ id: r.id, rotulo: r.rotulo, paraModelo: r.paraModelo });
  }
  return saida;
}

export function itemDoIndice(e: EntradaRoteiro): ItemDemo {
  const indicador = e.recorte.indicador ?? null;
  return {
    id: e.id,
    grupo: e.grupo,
    pergunta: e.pergunta,
    indicador,
    nome: indicador ? CATALOGO[indicador].nome : null,
    indicadores: e.indicadores ?? (indicador ? [indicador] : []),
    recorte: e.recorte,
    continuacoes: e.continuacoes,
    ...(e.lentes ? { lentes: e.lentes } : {}),
  };
}
