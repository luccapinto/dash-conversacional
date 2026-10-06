'use client';

/**
 * Aba Resumo executivo. Chega pronta do servidor com o layout pré-gerado ou, fora das combinações
 * pré-geradas, com o determinístico (nunca vazia) enquanto pede o layout ao vivo em /api/layout.
 * A IA decide manchete, ordem dos domínios e quais gráficos destacar (com anotações ancoradas);
 * placar, valores e motivos vêm do motor e do detector de sinais.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { LayoutSpec, RecorteLayout } from '@/lib/layout/spec';
import { pedidoDeContexto, type PedidoIA } from '@/lib/ia/pedidos';
import type { DadosGrafico } from '@/lib/painel/graficos';
import { chaveGrafico } from '@/lib/painel/chave-grafico';
import type { Contagem, ResumoBase } from '@/lib/painel/resumo';
import { BotaoIA } from '@/components/ia/BotaoIA';
import { SugestoesIA } from '@/components/ia/ProvedorIA';
import { BarrasH } from '@/components/graficos/BarrasH';
import { Linha } from '@/components/graficos/Linha';

type ItemComPedido = ResumoBase['dominios'][number]['itens'][number] & { pedido: PedidoIA };

export interface PropsResumo {
  placar: ResumoBase['placar'];
  dominios: { dominio: string; itens: ItemComPedido[] }[];
  nSinais: number;
  rotuloMes: string;
  layout: LayoutSpec;
  pregerado: boolean;
  recorte: RecorteLayout;
  graficos: Record<string, DadosGrafico>;
  nomes: Record<string, string>;
  /** pedido padrão de cada indicador (botão "Investigar" sem deep dive sugerido) */
  pedidos: Record<string, PedidoIA>;
  lentes: { id: string; rotulo: string; href: string; atual: boolean }[];
  /** query dos filtros da tela (links para as páginas dos indicadores) */
  consulta: string;
}

const ROT_STATUS: Record<string, string> = { fora: 'fora da meta', atencao: 'atenção', dentro: 'na meta' };

function Placar({ titulo, c, total }: { titulo: string; c: Contagem | null; total: number }) {
  return (
    <div className="p">
      <div className="q">{titulo}</div>
      {c ? (
        <>
          <div className="n">
            {c.dentro}
            <small> de {total} na meta</small>
          </div>
          <div className="barra-farol" role="img" aria-label={`${c.dentro} na meta, ${c.atencao} em atenção, ${c.fora} fora`}>
            <i style={{ flex: c.dentro, background: 'var(--bom)' }} />
            <i style={{ flex: c.atencao, background: 'var(--atencao)' }} />
            <i style={{ flex: c.fora, background: 'var(--ruim)' }} />
          </div>
          <div className="rodape">
            {c.atencao} em atenção · {c.fora} fora
          </div>
        </>
      ) : (
        <div className="n">
          —<small> sem base no ano anterior</small>
        </div>
      )}
    </div>
  );
}

function Destaque({ g, dados, layout, nomes, pedido }: { g: LayoutSpec['graficos'][number]; dados: DadosGrafico | undefined; layout: LayoutSpec; nomes: Record<string, string>; pedido: PedidoIA }) {
  if (!dados) return null;
  const notas = (id: string, diretoria: string | null) =>
    layout.anotacoes.filter(a => a.ancora.indicador === id && a.ancora.diretoria === diretoria).map(a => ({ mes: a.ancora.periodo.fim, texto: a.texto, rotulo: a.ancora.rotulo }));
  let grafico;
  if (dados.tipo === 'ranking_diretorias') {
    const doRanking = layout.anotacoes.filter(a => a.ancora.indicador === dados.indicador);
    grafico = (
      <BarrasH
        unidade={dados.unidade}
        meta={dados.meta}
        polaridade={dados.polaridade}
        descricao={`${dados.nome} por diretoria, ${dados.janela}`}
        barras={[...dados.barras]
          .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0))
          .map(b => ({ rotulo: b.rotulo, valor: b.valor, destaque: b.rotulo === dados.diretoria, nota: doRanking.find(a => a.ancora.diretoria === b.rotulo || a.ancora.rotulo === b.rotulo)?.texto }))}
      />
    );
  } else {
    grafico = dados.series.map((s, i) => (
      <div key={s.indicador}>
        {dados.series.length > 1 && <div className="sub" style={{ marginTop: 8 }}>{i === 0 ? 'Causa' : 'Efeito'}: {s.nome}</div>}
        <div className="so-desk">
          <Linha pontos={s.pontos} unidade={s.unidade} meta={s.meta} notas={notas(s.indicador, dados.diretoria)} baixa={dados.series.length > 1} descricao={`${s.nome}, ${dados.diretoria ?? 'empresa toda'}, ${dados.janela}`} />
        </div>
        <div className="so-mob-g">
          <Linha pontos={s.pontos} unidade={s.unidade} meta={s.meta} notas={notas(s.indicador, dados.diretoria)} baixa={dados.series.length > 1} compacto descricao={`${s.nome}, ${dados.diretoria ?? 'empresa toda'}, ${dados.janela}`} />
        </div>
      </div>
    ));
  }
  return (
    <article className="historia">
      <div className="ac">
        <BotaoIA pedido={pedido} rotuloAcessivel={`Investigar: ${g.titulo}`}>
          Investigar
        </BotaoIA>
      </div>
      <h3>{g.titulo}</h3>
      <div className="ml">
        <span>{g.indicadores.map(id => nomes[id] ?? id).join(' → ')}</span>
        <span aria-hidden="true">·</span>
        <span>{g.diretoria ?? 'Empresa toda'}</span>
        <span aria-hidden="true">·</span>
        <span>{dados.tipo === 'ranking_diretorias' ? `por diretoria, ${dados.janela}` : dados.janela}</span>
      </div>
      {grafico}
    </article>
  );
}

export function Resumo(p: PropsResumo) {
  const [vivo, setVivo] = useState<{ layout: LayoutSpec | null; estado: 'carregando' | 'pronto' | 'falhou' }>({ layout: null, estado: p.pregerado ? 'pronto' : 'carregando' });
  const layout = vivo.layout ?? p.layout;

  useEffect(() => {
    if (p.pregerado) return;
    const controle = new AbortController();
    const { periodo, diretoria, lente } = p.recorte;
    const q = new URLSearchParams({ inicio: periodo.inicio, fim: periodo.fim, diretoria: diretoria ?? 'Geral', lente });
    fetch(`/api/layout?${q}`, { signal: controle.signal })
      .then(r => (r.ok ? (r.json() as Promise<LayoutSpec>) : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(spec => setVivo({ layout: spec, estado: 'pronto' }))
      .catch(() => {
        if (!controle.signal.aborted) setVivo({ layout: null, estado: 'falhou' });
      });
    return () => controle.abort();
  }, [p.pregerado, p.recorte]);

  const sugestoes = useMemo(() => layout.deepDives.map(d => ({ pergunta: d.pergunta, pedido: pedidoDeContexto(d.contexto, d.pergunta, d.contexto.indicador ? p.nomes[d.contexto.indicador] ?? null : null) })), [layout, p.nomes]);

  // a IA ordena os domínios: pela primeira aparição dos seus indicadores nos cards do layout
  const dominios = useMemo(() => {
    const posicao = (id: string) => {
      const i = layout.cards.findIndex(c => c.indicador === id);
      return i < 0 ? Infinity : i;
    };
    return p.dominios
      .map((d, k) => ({ ...d, k, ordem: Math.min(...d.itens.map(i => posicao(i.id))) }))
      .sort((a, b) => a.ordem - b.ordem || a.k - b.k);
  }, [layout, p.dominios]);

  const ia = layout.origem === 'ia';
  const pedidoDoGrafico = (g: LayoutSpec['graficos'][number]): PedidoIA => {
    const d = layout.deepDives.find(x => x.sinal === g.sinal);
    const efeito = g.indicadores[g.indicadores.length - 1];
    return d ? pedidoDeContexto(d.contexto, d.pergunta, d.contexto.indicador ? p.nomes[d.contexto.indicador] ?? null : null) : p.pedidos[efeito];
  };

  return (
    <>
      <SugestoesIA sugestoes={sugestoes} />
      <div className="resumo-cab">
        <div>
          <div className="selo" style={ia ? undefined : { color: 'var(--muted)' }}>
            <i style={ia ? undefined : { background: 'var(--muted)', boxShadow: '0 0 0 4px var(--surface-2)' }} />
            {ia ? 'Leitura da IA' : 'Leitura automática (sem IA)'} a partir de {p.nSinais} sinais calculados · {p.rotuloMes}
            {vivo.estado === 'carregando' && <span className="carregando-ia"> · a IA está organizando este recorte…</span>}
            {vivo.estado === 'falhou' && <span> · a IA não respondeu agora</span>}
          </div>
        </div>
        <nav className="lentes" aria-label="Público">
          {p.lentes.map(l => (
            <Link key={l.id} href={l.href} aria-current={l.atual ? 'true' : undefined} scroll={false}>
              {l.rotulo}
            </Link>
          ))}
        </nav>
      </div>
      <h1 className="manchete">{layout.manchete}</h1>
      <p className="apoio">Consolidação das metas e o que explica cada resultado. Os números vêm do motor; a IA escolhe o que destacar e escreve os títulos.</p>

      <div className="placar">
        <Placar titulo={`Metas no mês · ${p.placar.rotulos.mes}`} c={p.placar.mes} total={p.placar.total} />
        <Placar titulo={`Metas no acumulado · ${p.placar.rotulos.ytd}`} c={p.placar.ytd} total={p.placar.total} />
        <Placar titulo={`Mesmo período · ${p.placar.rotulos.aa ?? 'ano anterior'}`} c={p.placar.aa} total={p.placar.total} />
      </div>

      <div className="grid2">
        <section aria-labelledby="t-metas">
          <div className="secao-tit">
            <h2 id="t-metas">Resultado de cada meta e o que o explica</h2>
            <span>YTD · motivo = sinal de maior peso detectado pelo motor</span>
          </div>
          {dominios.map(d => (
            <div key={d.dominio} className="dom-bloco">
              <h3>
                {d.dominio}
                <span className="cont" aria-hidden="true">
                  {d.itens.map(i => (
                    <i key={i.id} className={`dot ${i.status}`} title={i.nome} />
                  ))}
                </span>
              </h3>
              {d.itens.map(i => (
                <div key={i.id} className="motivo">
                  <span className={`dot ${i.status}`} aria-hidden="true" />
                  <div>
                    <b>
                      <Link href={`/indicadores/${i.id}${p.consulta}`}>{i.nome}</Link>
                    </b>{' '}
                    <span className="sr-only">({ROT_STATUS[i.status] ?? i.status}) </span>
                    <span className="valor">{i.valor}</span>{' '}
                    {i.vsMeta && <span className={`d ${i.vsMeta.tom}`} style={{ display: 'inline' }}>{i.vsMeta.texto} vs meta</span>}
                    <p>
                      {i.motivo.tipo && <span className="tipo-sinal">{i.motivo.tipo}</span>}
                      {i.motivo.tipo && ' · '}
                      {i.motivo.texto}
                    </p>
                  </div>
                  <BotaoIA pedido={i.pedido} rotuloAcessivel={`Investigar ${i.nome}`} />
                </div>
              ))}
            </div>
          ))}
        </section>
        <section aria-labelledby="t-destaques">
          <div className="secao-tit">
            <h2 id="t-destaques">Destaques da IA</h2>
            <span>gráficos escolhidos a partir dos sinais</span>
          </div>
          {layout.graficos.length === 0 && <div className="vazio">Nenhum desvio relevante detectado neste recorte: sem gráfico a destacar.</div>}
          {layout.graficos.slice(0, 3).map(g => (
            <Destaque key={`${g.sinal}-${g.titulo}`} g={g} dados={p.graficos[chaveGrafico(g)]} layout={layout} nomes={p.nomes} pedido={pedidoDoGrafico(g)} />
          ))}
        </section>
      </div>
    </>
  );
}
