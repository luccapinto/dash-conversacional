'use client';

/**
 * Painel da IA: gaveta à direita no desktop (~460 px, com véu) e folha de baixo para cima no
 * celular (~92dvh). Esc fecha, o foco fica preso dentro enquanto aberto e volta ao botão de origem.
 * Mostra os chips do contexto, os passos das tools em tempo real, o texto em streaming (Markdown),
 * os blocos de visualização, "Como calculei" e o selo da guarda de números.
 *
 * Modo demonstração: sem campo de texto; no lugar, as perguntas prontas da tela e, no fim de cada
 * resposta, as continuações. Cada resposta mostra o recorte real da gravação; "Mostrar tudo" (ou
 * um clique na resposta) completa a animação na hora.
 */

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { ContextoDeepDive, ItemRastro, Verificacao } from '@/lib/agente/contrato';
import { GRAVACOES, gravacaoDeOutroRecorte, perguntasProntas } from '@/lib/demo/indice';
import type { Conversa, LojaIA } from '@/lib/ia/loja';
import { pedidoDeContexto, type SugestaoIA } from '@/lib/ia/pedidos';
import type { Turno } from '@/lib/ia/stream';
import { rotuloIntervalo } from '@/lib/painel/periodos';
import { BlocoIA } from './Blocos';
import { Markdown } from './Markdown';
import { useEstadoIA, useLojaIA } from './ProvedorIA';

const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, summary, [tabindex]:not([tabindex="-1"])';

/** Seção do README que explica os dois modos (demonstração e IA ao vivo) */
const README_MODOS = 'https://github.com/luccapinto/dash-conversacional#modo-demo-e-ia-ao-vivo';

const ativo = (t: Turno | undefined) => t !== undefined && (t.estado === 'aguardando' || t.estado === 'transmitindo');

export function PainelIA() {
  const loja = useLojaIA();
  const estado = useEstadoIA();
  const conversa = estado.aberta ? estado.conversas[estado.aberta] : null;
  if (!conversa) return null;
  return <Gaveta key={conversa.pedido.chave} loja={loja} conversa={conversa} sugestoes={estado.sugestoes} />;
}

function Gaveta({ loja, conversa, sugestoes }: { loja: LojaIA; conversa: Conversa; sugestoes: readonly SugestaoIA[] }) {
  const painel = useRef<HTMLElement>(null);
  const fio = useRef<HTMLDivElement>(null);
  const [texto, setTexto] = useState('');
  const ultimo = conversa.turnos.at(-1);
  const ocupado = ativo(ultimo);
  const livre = !conversa.pedido.contexto;
  const demo = loja.modo === 'demonstracao';

  useEffect(() => {
    const origem = loja.origem;
    const el = painel.current;
    document.body.classList.add('ia-aberto');
    el?.focus({ preventScroll: true });
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        loja.fechar();
        return;
      }
      if (e.key !== 'Tab' || !el) return;
      const itens = [...el.querySelectorAll<HTMLElement>(FOCAVEIS)].filter(x => x.offsetParent !== null);
      if (itens.length === 0) return;
      const [primeiro, ultimoItem] = [itens[0], itens[itens.length - 1]];
      const ativo = document.activeElement;
      if (!el.contains(ativo) || (e.shiftKey && (ativo === primeiro || ativo === el))) {
        e.preventDefault();
        (e.shiftKey ? ultimoItem : primeiro).focus();
      } else if (!e.shiftKey && ativo === ultimoItem) {
        e.preventDefault();
        primeiro.focus();
      }
    };
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.classList.remove('ia-aberto');
      if (origem?.isConnected) origem.focus({ preventScroll: true });
    };
  }, [loja]);

  // pergunta nova: rola até ela, no topo (o turno novo reserva a altura da conversa; ver .turno.novo)
  const nTurnos = conversa.turnos.length;
  useEffect(() => {
    const msgs = fio.current?.querySelectorAll('.msg-u');
    if (nTurnos > 1 && msgs?.length) msgs[msgs.length - 1].scrollIntoView({ block: 'start' });
  }, [nTurnos]);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!texto.trim() || ocupado) return;
    void loja.perguntar(texto);
    setTexto('');
  };

  return (
    <>
      <div className="veu" onClick={() => loja.fechar()} aria-hidden="true" />
      <aside ref={painel} className="drawer" role="dialog" aria-modal="true" aria-labelledby="ia-titulo" tabIndex={-1}>
        <header>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ia)" strokeWidth="1.8" aria-hidden="true">
            <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
            <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
          </svg>
          <div>
            <b id="ia-titulo">{livre ? 'Pergunte à IA' : 'O que influenciou o resultado'}</b>
            <br />
            <span>{demo ? 'Respostas gravadas; números calculados pelo motor' : livre ? 'Qualquer indicador; números calculados pelo motor' : 'Deep dive com números calculados pelo motor'}</span>
          </div>
          <button type="button" className="icone-btn" aria-label="Fechar o painel da IA" onClick={() => loja.fechar()}>
            ×
          </button>
        </header>
        {demo && (
          <p className="demo-aviso">
            Demonstração com respostas gravadas. Rodando localmente com uma chave de IA, o chat aceita qualquer pergunta.{' '}
            <a href={README_MODOS} target="_blank" rel="noreferrer">
              Como rodar
            </a>
          </p>
        )}
        <div ref={fio} className="fio" aria-busy={ocupado}>
          {!demo && (
            <div className="ctx">
              {conversa.pedido.chips.map(c => (
                <span key={c}>{c}</span>
              ))}
            </div>
          )}
          {!demo && livre && conversa.turnos.length === 0 && (
            <>
              <div className="aviso">Pergunte sobre qualquer indicador. A IA consulta o motor e cada número da resposta é conferido.</div>
              {sugestoes.length > 0 && (
                <div className="sugestoes" aria-label="Sugestões">
                  {sugestoes.slice(0, 3).map(s => (
                    <button key={s.pedido.chave} type="button" onClick={e => void loja.abrir(s.pedido, e.currentTarget)}>
                      {s.pergunta}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {demo && conversa.turnos.length === 0 && <div className="aviso">Escolha uma pergunta pronta: a resposta gravada mostra como o agente consulta o motor e escreve a análise.</div>}
          {conversa.turnos.map((t, i) => {
            const ultimo = i === conversa.turnos.length - 1;
            return (
              <div key={i} className={ultimo && i > 0 ? 'turno novo' : 'turno'}>
                {demo ? <TurnoDemo turno={t} ultimo={ultimo} tela={conversa.pedido.contexto} loja={loja} /> : <TurnoIA turno={t} ultimo={ultimo} aoRepetir={() => loja.tentarDeNovo()} />}
              </div>
            );
          })}
        </div>
        {demo ? (
          <RodapeDemo loja={loja} conversa={conversa} ocupado={ocupado} />
        ) : (
          <form className="entrada" onSubmit={enviar}>
            <input value={texto} onChange={e => setTexto(e.target.value)} placeholder={livre ? 'Ex.: onde o turnover voluntário mais subiu?' : 'Continue a investigação...'} aria-label="Pergunta para a IA" maxLength={1000} />
            <button type="submit" disabled={ocupado || !texto.trim()}>
              Perguntar
            </button>
          </form>
        )}
      </aside>
    </>
  );
}

/** Perguntas prontas da tela (no lugar do campo de texto) e o "Mostrar tudo" enquanto uma resposta toca */
function RodapeDemo({ loja, conversa, ocupado }: { loja: LojaIA; conversa: Conversa; ocupado: boolean }) {
  const prontas = useMemo(() => perguntasProntas(conversa.pedido), [conversa.pedido]);
  return (
    <div className="rodape-demo">
      <details className="prontas" open={conversa.turnos.length === 0}>
        <summary>
          Perguntas prontas <span>{prontas.length}</span>
        </summary>
        <div className="sugestoes">
          {prontas.map(p => (
            <button key={p.id} type="button" onClick={() => void loja.tocar(p.id)}>
              {p.pergunta}
            </button>
          ))}
        </div>
      </details>
      {ocupado && (
        <button type="button" className="mostrar-tudo" onClick={() => loja.mostrarTudo()}>
          Mostrar tudo
        </button>
      )}
    </div>
  );
}

/** Resposta gravada: o recorte real da gravação, a animação (clique completa) e as continuações */
function TurnoDemo({ turno: t, ultimo, tela, loja }: { turno: Turno; ultimo: boolean; tela: ContextoDeepDive | undefined; loja: LojaIA }) {
  const item = t.gravacao ? GRAVACOES.get(t.gravacao) : undefined;
  const tocando = ativo(t);
  const continuacoes = item?.continuacoes.flatMap(id => GRAVACOES.get(id) ?? []) ?? [];
  return (
    <>
      <div className="msg-u">{t.pergunta}</div>
      {item && (
        <div className="ctx">
          {pedidoDeContexto(item.recorte, item.pergunta, item.nome).chips.map(c => (
            <span key={c}>{c}</span>
          ))}
        </div>
      )}
      {item && gravacaoDeOutroRecorte(tela, item.recorte) && <p className="recorte-gravado">A demonstração tem respostas gravadas só para este recorte, não para o filtro da tela.</p>}
      <div className={`corpo-turno ${tocando ? 'tocando' : ''}`} onClick={tocando ? () => loja.mostrarTudo() : undefined} title={tocando ? 'Clique para mostrar a resposta inteira' : undefined}>
        <CorpoTurno turno={t} ultimo={ultimo} aoRepetir={() => loja.tentarDeNovo()} />
      </div>
      {ultimo && t.estado === 'concluido' && continuacoes.length > 0 && (
        <div className="continuar">
          <span>Continuar a investigação</span>
          <div className="sugestoes">
            {continuacoes.map(c => (
              <button key={c.id} type="button" onClick={() => void loja.tocar(c.id)}>
                {c.pergunta}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function TurnoIA({ turno: t, ultimo, aoRepetir }: { turno: Turno; ultimo: boolean; aoRepetir: () => void }) {
  return (
    <>
      <div className="msg-u">{t.pergunta}</div>
      <CorpoTurno turno={t} ultimo={ultimo} aoRepetir={aoRepetir} />
    </>
  );
}

/** Narração, passos das tools, texto (com cursor no ponto de escrita), blocos, rastro e selo */
function CorpoTurno({ turno: t, ultimo, aoRepetir }: { turno: Turno; ultimo: boolean; aoRepetir: () => void }) {
  const marcar = t.verificacao?.naoVerificados.map(n => n.texto) ?? [];
  return (
    <>
      {t.narracao.map((n, i) => (
        <p key={i} className="narracao">
          {n}
        </p>
      ))}
      {(t.passos.length > 0 || t.estado === 'aguardando') && (
        <ol className="passos" aria-label="Consultas ao motor">
          {t.passos.map(p => (
            <li key={p.resultado}>
              <span className={p.estado === 'inicio' ? 'rodando' : p.estado === 'erro' ? 'falhou' : 'ok'} aria-hidden="true">
                {p.estado === 'fim' ? '✓' : p.estado === 'erro' ? '!' : ''}
              </span>
              {p.rotulo}
              {p.estado === 'erro' && <span className="sr-only"> (falhou)</span>}
            </li>
          ))}
          {t.estado === 'aguardando' && t.passos.every(p => p.estado !== 'inicio') && (
            <li className="analisando">
              <span className="pulsa" aria-hidden="true" />
              {/* os blocos só chegam depois do `mostrar`, logo antes do texto: até lá é análise, inclusive entre rodadas */}
              {t.blocos.length ? 'Escrevendo a análise…' : 'Analisando…'}
            </li>
          )}
        </ol>
      )}
      {t.texto && <Markdown text={t.texto} marcar={marcar} escrevendo={t.estado === 'transmitindo'} />}
      {t.blocos.map(b => (
        <BlocoIA key={b.id} bloco={b} />
      ))}
      {t.rastro && <ComoCalculei itens={t.rastro} />}
      {t.verificacao && <Selo v={t.verificacao} />}
      {(t.estado === 'interrompido' || t.estado === 'erro') && (
        <div className={`aviso ${t.estado === 'erro' ? 'erro' : ''}`} role="alert">
          {t.erro}
          {ultimo && (
            <button type="button" onClick={aoRepetir}>
              Tentar de novo
            </button>
          )}
        </div>
      )}
    </>
  );
}

function Selo({ v }: { v: Verificacao }) {
  if (v.total === 0) return <div className="verif">✓ Nenhum número no texto para conferir.</div>;
  const n = v.naoVerificados.length;
  return (
    <div className={`verif ${n ? 'parcial' : ''}`}>
      <span aria-hidden="true">{n ? '!' : '✓'}</span>
      <span>
        {v.verificados} de {v.total} números conferidos contra os resultados das funções
        {n > 0 && ` · ${n} não ${n === 1 ? 'verificado, marcado' : 'verificados, marcados'} no texto`}
      </span>
    </div>
  );
}

function ComoCalculei({ itens }: { itens: readonly ItemRastro[] }) {
  return (
    <details className="calc">
      <summary>
        Como calculei · {itens.length} {itens.length === 1 ? 'consulta' : 'consultas'} ao motor
      </summary>
      <ol>
        {itens.map(i => (
          <li key={i.resultado}>
            <b>{i.rotulo}</b> · {i.ferramenta}
            {!i.ok && ` · falhou: ${i.erro ?? 'erro'}`}
            <code>{JSON.stringify(i.argumentos)}</code>
            {i.formula && <div>Fórmula: {i.formula}</div>}
            {(i.n !== undefined || i.periodoEfetivo) && (
              <div>
                {i.periodoEfetivo && `${rotuloIntervalo(i.periodoEfetivo)} (${i.periodoEfetivo.leitura})`}
                {i.n !== undefined && ` · n = ${i.n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`}
                {i.fonte && ` · fonte: ${i.fonte}`}
              </div>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}
