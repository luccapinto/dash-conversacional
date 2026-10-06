/**
 * Loop do agente: rodadas de LLM com tools até a resposta em texto.
 *
 *  - Cada rodada é streamada: texto sai na hora; chamadas de tool são acumuladas.
 *  - As tool calls de uma rodada são preparadas juntas (todos os passos "inicio" saem antes de
 *    qualquer resultado) e executadas com Promise.all; os resultados voltam ao modelo num único
 *    pedido. O motor é síncrono e leva milissegundos: o ganho está em não gastar uma ida ao modelo
 *    por consulta.
 *  - No máximo MAX_RODADAS_FERRAMENTAS rodadas com tools; depois disso o pedido sai com
 *    tool_choice = none e o modelo responde com o que tem.
 *  - Se a principal falhar numa rodada, as seguintes começam pela reserva.
 *  - Blocos: os que o modelo pediu com `mostrar`; sem nenhum, até 2 automáticos a partir dos
 *    resultados principais. Sempre montados dos resultados das tools.
 *  - Fim: rastro e guarda de números (números do texto contra os resumos que o modelo recebeu e o
 *    system prompt). Não bloqueia: mede.
 *
 * Métricas internas (provedor, tokens, latência) voltam para o chamador (log do servidor e
 * avaliação); o cliente só recebe os eventos do contrato.
 */

import { montarBloco, TIPOS_POR_FERRAMENTA } from './blocos';
import type { BlocoVisualizacao, EntradaAgente, EventoAgente, NomeFerramenta, Verificacao } from './contrato';
import { criarSessao, DEFINICOES_FERRAMENTAS, type AmbienteFerramentas, type ResultadoFerramenta } from './ferramentas';
import { coletarValores, verificarNumeros } from './guarda';
import { chamarLLM, type MensagemLLM, type NomeProvedor, type Provedor, type Uso } from './llm';
import { montarPromptSistema } from './prompt';

export const MAX_RODADAS_FERRAMENTAS = 6;
const MAX_TOKENS_RESPOSTA = 1600;
const MAX_BLOCOS_AUTOMATICOS = 2;
/** ordem de preferência dos blocos automáticos */
const PRIORIDADE_AUTOMATICA = ['serie', 'decompor', 'comparar', 'drivers', 'cruzar', 'valor', 'impacto'];

const SEM_RESPOSTA = 'Não consegui montar uma resposta com os dados. Tente reformular a pergunta.';
const ERRO_AMIGAVEL = 'Não consegui consultar a IA agora. Tente de novo em instantes.';

export interface OpcoesAgente {
  ambiente: AmbienteFerramentas;
  /** em ordem de preferência (principal, reserva) */
  provedores: readonly Provedor[];
  emitir: (evento: EventoAgente) => void;
  fetch?: typeof fetch;
  /** cliente desconectou: para sem emitir mais nada */
  sinal?: AbortSignal;
  timeoutMs?: number;
  log?: (linha: string) => void;
}

export interface MetricasAgente {
  /** pedidos ao modelo */
  rodadas: number;
  rodadasFerramentas: number;
  /** provedor que respondeu cada pedido */
  provedores: NomeProvedor[];
  uso: Uso;
  latenciaPrimeiroTextoMs: number | null;
  latenciaTotalMs: number;
  ferramentas: Array<{ nome: string; ok: boolean; duracaoMs: number }>;
  blocos: number;
  texto: string;
  verificacao: Verificacao | null;
  erro?: string;
}

function blocosAutomaticos(resultados: ResultadoFerramenta[]): BlocoVisualizacao[] {
  const candidatos = resultados
    .filter(r => r.ok && TIPOS_POR_FERRAMENTA[r.ferramenta as NomeFerramenta])
    .sort((a, b) => PRIORIDADE_AUTOMATICA.indexOf(a.ferramenta) - PRIORIDADE_AUTOMATICA.indexOf(b.ferramenta));
  const blocos: BlocoVisualizacao[] = [];
  for (const r of candidatos) {
    if (blocos.length >= MAX_BLOCOS_AUTOMATICOS) break;
    try {
      const b = montarBloco({ id: r.id, ferramenta: r.ferramenta as NomeFerramenta, dados: r.dados });
      if (!blocos.some(x => x.id === b.id)) blocos.push(b);
    } catch {
      // resultado sem visualização (ex.: impacto não aplicável): segue para o próximo
    }
  }
  return blocos;
}

export async function executarAgente(entrada: EntradaAgente, opcoes: OpcoesAgente): Promise<MetricasAgente> {
  const inicio = Date.now();
  const log = opcoes.log ?? ((l: string) => console.info(l));
  const sessao = criarSessao(opcoes.ambiente);
  const sistema = montarPromptSistema(entrada.contexto);
  const mensagens: MensagemLLM[] = [
    { role: 'system', content: sistema },
    ...entrada.mensagens.map((m): MensagemLLM => ({ role: m.papel === 'usuario' ? 'user' : 'assistant', content: m.conteudo })),
  ];
  const metricas: MetricasAgente = {
    rodadas: 0, rodadasFerramentas: 0, provedores: [], uso: { entrada: 0, saida: 0, cacheEntrada: 0 },
    latenciaPrimeiroTextoMs: null, latenciaTotalMs: 0, ferramentas: [], blocos: 0, texto: '', verificacao: null,
  };
  let provedores = [...opcoes.provedores];
  let separar = false;
  const aoTexto = (delta: string) => {
    if (separar && metricas.texto) {
      metricas.texto += '\n\n';
      opcoes.emitir({ tipo: 'texto', delta: '\n\n' });
    }
    separar = false;
    metricas.texto += delta;
    metricas.latenciaPrimeiroTextoMs ??= Date.now() - inicio;
    opcoes.emitir({ tipo: 'texto', delta });
  };

  try {
    for (;;) {
      const forcarTexto = metricas.rodadasFerramentas >= MAX_RODADAS_FERRAMENTAS;
      const r = await chamarLLM(
        { mensagens, ferramentas: DEFINICOES_FERRAMENTAS, escolhaFerramenta: forcarTexto ? 'none' : 'auto', maxTokens: MAX_TOKENS_RESPOSTA },
        { provedores, fetch: opcoes.fetch, aoTexto, sinal: opcoes.sinal, timeoutMs: opcoes.timeoutMs, log },
      );
      metricas.rodadas++;
      metricas.provedores.push(r.provedor);
      metricas.uso.entrada += r.uso.entrada;
      metricas.uso.saida += r.uso.saida;
      metricas.uso.cacheEntrada += r.uso.cacheEntrada;
      // quem respondeu passa a ser o primeiro da fila nas próximas rodadas
      provedores = [...provedores.filter(p => p.nome === r.provedor), ...provedores.filter(p => p.nome !== r.provedor)];
      if (forcarTexto || r.chamadas.length === 0) break;

      mensagens.push({ role: 'assistant', content: r.texto || null, tool_calls: r.chamadas });
      if (r.texto) separar = true;
      const preparadas = r.chamadas.map(c => sessao.preparar(c));
      for (const p of preparadas) opcoes.emitir({ tipo: 'passo', resultado: p.id, ferramenta: p.ferramenta, rotulo: p.rotulo, estado: 'inicio' });
      const resultados = await Promise.all(preparadas.map(p => sessao.executar(p)));
      for (const res of resultados) {
        opcoes.emitir({ tipo: 'passo', resultado: res.id, ferramenta: res.ferramenta, rotulo: res.rotulo, estado: res.ok ? 'fim' : 'erro' });
        for (const bloco of res.blocos ?? []) opcoes.emitir({ tipo: 'bloco', bloco });
        metricas.ferramentas.push({ nome: res.ferramenta, ok: res.ok, duracaoMs: res.duracaoMs });
        mensagens.push({ role: 'tool', tool_call_id: res.idChamada, content: JSON.stringify(res.paraModelo) });
      }
      metricas.rodadasFerramentas++;
    }

    if (!metricas.texto.trim()) aoTexto(SEM_RESPOSTA);
    let blocos = sessao.blocos();
    if (blocos.length === 0) {
      blocos = blocosAutomaticos(sessao.resultados());
      for (const bloco of blocos) opcoes.emitir({ tipo: 'bloco', bloco });
    }
    metricas.blocos = blocos.length;
    opcoes.emitir({ tipo: 'rastro', itens: sessao.rastro() });
    const valores = coletarValores([sistema, ...sessao.resultados().map(r => r.paraModelo)]);
    metricas.verificacao = verificarNumeros(metricas.texto, valores);
    opcoes.emitir({ tipo: 'fim', verificacao: metricas.verificacao });
  } catch (e) {
    metricas.erro = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    if (!opcoes.sinal?.aborted) {
      log(`[agente] falhou: ${metricas.erro}`);
      opcoes.emitir({ tipo: 'erro', mensagem: ERRO_AMIGAVEL });
    }
  }
  metricas.latenciaTotalMs = Date.now() - inicio;
  return metricas;
}
