/**
 * Estado do painel da IA fora do React (useSyncExternalStore): qual conversa está aberta, as
 * conversas em memória por pedido (reabrir o mesmo contexto não gasta de novo) e as sugestões do
 * botão "Perguntar". Fechar com resposta em andamento cancela o pedido (AbortController) e descarta
 * o turno incompleto; reabrir pergunta de novo.
 *
 * Modo demonstração: em vez de chamar /api/agente, o turno toca uma resposta gravada (lib/demo):
 * abrir um pedido toca a gravação dele, `tocar(id)` toca outra (cancelando a que estiver tocando) e
 * `mostrarTudo()` completa a que está tocando.
 */

import type { ModoIA } from '@/lib/agente/contrato';
import { GRAVACOES, gravacaoDoPedido } from '@/lib/demo/indice';
import { tocarGravacao, type Reproducao } from '@/lib/demo/tocador';
import type { PedidoIA, SugestaoIA } from './pedidos';
import { historico, novoTurno, perguntarAgente, type Turno } from './stream';

export interface Conversa {
  pedido: PedidoIA;
  turnos: Turno[];
}

export interface EstadoIA {
  aberta: string | null;
  conversas: Readonly<Record<string, Conversa>>;
  sugestoes: readonly SugestaoIA[];
}

const ativo = (t: Turno | undefined) => t !== undefined && (t.estado === 'aguardando' || t.estado === 'transmitindo');

/** prefers-reduced-motion: a resposta gravada aparece inteira, sem animação */
const semMovimentoReduzido = () => typeof window === 'undefined' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class LojaIA {
  private estado: EstadoIA = { aberta: null, conversas: {}, sugestoes: [] };
  private readonly ouvintes = new Set<() => void>();
  private pedidoEmCurso: { chave: string; controle: AbortController } | null = null;
  private reproducao: Reproducao | null = null;
  /** elemento que abriu o painel (o foco volta para ele) */
  origem: HTMLElement | null = null;
  readonly modo: ModoIA;

  constructor(
    private readonly opcoes: {
      fetch?: typeof fetch;
      /** padrão: ao vivo */
      modo?: ModoIA;
      /** false (prefers-reduced-motion) = a resposta gravada aparece inteira, sem animação */
      animar?: () => boolean;
    } = {},
  ) {
    this.modo = opcoes.modo ?? 'ao-vivo';
  }

  assinar = (ouvinte: () => void) => {
    this.ouvintes.add(ouvinte);
    return () => this.ouvintes.delete(ouvinte);
  };

  foto = (): EstadoIA => this.estado;

  private mudar(parcial: Partial<EstadoIA>) {
    this.estado = { ...this.estado, ...parcial };
    for (const o of this.ouvintes) o();
  }

  private trocarTurnos(chave: string, f: (turnos: Turno[]) => Turno[]) {
    const c = this.estado.conversas[chave];
    if (c) this.mudar({ conversas: { ...this.estado.conversas, [chave]: { ...c, turnos: f(c.turnos) } } });
  }

  definirSugestoes(sugestoes: readonly SugestaoIA[]) {
    if (sugestoes !== this.estado.sugestoes) this.mudar({ sugestoes });
  }

  /** Abre a conversa do pedido; resolve quando a pergunta inicial (se houver) termina */
  abrir(pedido: PedidoIA, origem: HTMLElement | null = null): Promise<void> {
    if (origem) this.origem = origem;
    const nova = !this.estado.conversas[pedido.chave];
    if (this.pedidoEmCurso && this.pedidoEmCurso.chave !== pedido.chave) this.cancelar();
    this.mudar({
      aberta: pedido.chave,
      conversas: nova ? { ...this.estado.conversas, [pedido.chave]: { pedido, turnos: [] } } : this.estado.conversas,
    });
    if (this.estado.conversas[pedido.chave].turnos.length > 0) return Promise.resolve();
    if (this.modo === 'demonstracao') {
      const gravacao = gravacaoDoPedido(pedido);
      return gravacao ? this.tocar(gravacao.id) : Promise.resolve();
    }
    return pedido.pergunta ? this.perguntar(pedido.pergunta) : Promise.resolve();
  }

  fechar() {
    this.cancelar();
    this.mudar({ aberta: null });
  }

  /** Cancela o pedido em curso e descarta o turno incompleto */
  private cancelar() {
    const emCurso = this.pedidoEmCurso;
    if (!emCurso) return;
    this.pedidoEmCurso = null;
    emCurso.controle.abort();
    this.trocarTurnos(emCurso.chave, ts => (ativo(ts[ts.length - 1]) ? ts.slice(0, -1) : ts));
  }

  /** Atualiza o último turno da conversa; depois de cancelado, atualizações atrasadas não sobrescrevem o turno anterior */
  private atualizador(chave: string, controle: AbortController) {
    return (t: Turno) => {
      if (!controle.signal.aborted) this.trocarTurnos(chave, ts => [...ts.slice(0, -1), t]);
    };
  }

  /** Ao vivo: pergunta livre ao agente. Na demonstração não há pergunta livre (só `tocar`) */
  async perguntar(pergunta: string) {
    const chave = this.estado.aberta;
    const texto = pergunta.trim();
    if (this.modo !== 'ao-vivo' || !chave || !texto || this.pedidoEmCurso) return;
    const conversa = this.estado.conversas[chave];
    const mensagens = historico(conversa.turnos, texto);
    const controle = new AbortController();
    this.pedidoEmCurso = { chave, controle };
    this.trocarTurnos(chave, ts => [...ts, novoTurno(texto)]);
    const atualizar = this.atualizador(chave, controle);
    try {
      const final = await perguntarAgente({ pergunta: texto, mensagens, contexto: conversa.pedido.contexto, sinal: controle.signal, fetch: this.opcoes.fetch, aoAtualizar: atualizar });
      atualizar(final);
    } catch {
      // cancelado ao fechar: o turno já foi descartado
    } finally {
      if (this.pedidoEmCurso?.controle === controle) this.pedidoEmCurso = null;
    }
  }

  /** Demonstração: toca a resposta gravada `id` num turno novo; a que estiver tocando é cancelada */
  async tocar(id: string) {
    const chave = this.estado.aberta;
    const item = GRAVACOES.get(id);
    if (this.modo !== 'demonstracao' || !chave || !item) return;
    this.cancelar();
    const controle = new AbortController();
    this.pedidoEmCurso = { chave, controle };
    const turno: Turno = { ...novoTurno(item.pergunta), gravacao: id };
    this.trocarTurnos(chave, ts => [...ts, turno]);
    const atualizar = this.atualizador(chave, controle);
    const animar = this.opcoes.animar ?? semMovimentoReduzido;
    try {
      const final = await tocarGravacao({ id, turno, sinal: controle.signal, fetch: this.opcoes.fetch, animar: animar(), aoAtualizar: atualizar, aoTocar: r => (this.reproducao = r) });
      atualizar(final);
    } catch {
      // trocou de pergunta ou fechou: o turno já foi descartado
    } finally {
      if (this.pedidoEmCurso?.controle === controle) {
        this.pedidoEmCurso = null;
        this.reproducao = null;
      }
    }
  }

  /** Demonstração: completa na hora a resposta que está tocando ("Mostrar tudo" ou clique nela) */
  mostrarTudo() {
    this.reproducao?.mostrarTudo();
  }

  /** Repete a última pergunta (resposta interrompida ou com erro) */
  tentarDeNovo() {
    const chave = this.estado.aberta;
    const ultimo = chave ? this.estado.conversas[chave]?.turnos.at(-1) : undefined;
    if (!chave || !ultimo || ativo(ultimo)) return;
    this.trocarTurnos(chave, ts => ts.slice(0, -1));
    void (ultimo.gravacao ? this.tocar(ultimo.gravacao) : this.perguntar(ultimo.pergunta));
  }
}
