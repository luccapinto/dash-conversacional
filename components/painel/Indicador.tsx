/**
 * Página do indicador (servidor): cabeçalho com o catálogo, destaque (frase determinística + título
 * da IA quando existe), cards do mês e do acumulado, evolução mês a mês, quebra por diretoria (ou
 * senioridade) e os sinais do detector.
 */

import Link from 'next/link';
import { Fragment } from 'react';
import type { Indicador } from '@/lib/analytics/catalog';
import { rotuloMes, type Mes } from '@/lib/analytics/dominio';
import type { Status } from '@/lib/analytics/engine';
import { pedidoDoIndicador } from '@/lib/ia/pedidos';
import { consulta, type FiltrosPainel } from '@/lib/painel/filtros';
import { partes, SEM_VALOR, valorComUnidade, type Delta } from '@/lib/painel/formato';
import type { PaginaIndicador } from '@/lib/painel/indicador';
import { DOMINIOS_PAINEL, INDICADORES_PAINEL } from '@/lib/painel/indicadores';
import type { BlocoLeitura } from '@/lib/painel/leitura';
import { rotuloIntervalo } from '@/lib/painel/periodos';
import { BotaoIA } from '@/components/ia/BotaoIA';
import { BarrasMensais } from '@/components/graficos/BarrasMensais';
import { Spark } from '@/components/graficos/Spark';
import { ChipsCentralizados } from './Interativos';
import { ROTULO_STATUS } from './TabelaGerencial';

/** "**x**" → <b>x</b> (frase determinística do destaque) */
export function ComNegrito({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/\*\*(.+?)\*\*/g).map((parte, i) => (i % 2 ? <b key={i}>{parte}</b> : <Fragment key={i}>{parte}</Fragment>))}
    </>
  );
}

interface Comparativo {
  rotulo: string;
  delta: Delta;
  base: string;
}

function CardKpi({ titulo, referencia, bloco, unidade, comparativos, nota }: { titulo: string; referencia: string; bloco: BlocoLeitura; unidade: Indicador['unidade']; comparativos: Comparativo[]; nota?: string }) {
  const status: Status = bloco.medida?.status ?? 'sem_dados';
  const [numero, sufixo] = partes(bloco.medida?.valor ?? null, unidade);
  return (
    <section className="kcard" aria-label={`${titulo} · ${referencia}`}>
      <div className="t">
        {titulo} <span className="ref">· {referencia}</span>
        <span className={`pill ${status}`}>{ROTULO_STATUS[status]}</span>
      </div>
      <div className="v">
        {numero}
        {sufixo && <small>{sufixo}</small>}
      </div>
      {nota && <p className="nota">{nota}</p>}
      <div className="comp">
        {comparativos.map(c => (
          <div key={c.rotulo}>
            <small>{c.rotulo}</small>
            <div className={`d ${c.delta.tom}`}>{c.delta.texto}</div>
            <div className="base">{c.base}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

const curtoJanela = (r: string) => r.replace('12 meses até ', '12m até ');

export function PaginaDoIndicador({ ind, p, f, status, titulo, periodoSinais }: { ind: Indicador; p: PaginaIndicador; f: FiltrosPainel; status: Record<string, Status | null>; titulo: string | null; periodoSinais: { inicio: Mes; fim: Mes } }) {
  const l = p.leitura;
  const u = l.unidade;
  const q = consulta(f);
  const j = l.janelas;
  const meta = p.meta;
  const vsMeta = (b: BlocoLeitura): Delta => b.vsMeta ?? { texto: SEM_VALOR, tom: 'neutro' };
  const baseMeta = meta !== null ? `meta ${valorComUnidade(meta, u)}` : 'sem meta';
  const base = (v: number | null) => valorComUnidade(v, u);
  const ciclo = l.tipoMes === 'doze_meses';
  const mobile = p.evolucao.slice(l.trimestral ? -4 : -12);
  const dimensao = p.quebra.dimensao === 'diretoria' ? 'Diretoria' : 'Senioridade';
  const descricao = (pts: typeof p.evolucao) =>
    pts.length ? `${l.nome}, ${pts[0].rotulo} a ${pts[pts.length - 1].rotulo}: último ${valorComUnidade(pts[pts.length - 1].valor, u)}${meta !== null ? `, meta ${valorComUnidade(meta, u)}` : ''}` : `${l.nome}: sem dado`;

  return (
    <div className="ind-layout">
      <nav className="lista" aria-label="Indicadores">
        {DOMINIOS_PAINEL.map(d => (
          <Fragment key={d.dominio}>
            <h4>{d.dominio}</h4>
            {d.indicadores.map(x => (
              <Link key={x.id} href={`/indicadores/${x.id}${q}`} aria-current={x.id === ind.id ? 'true' : undefined}>
                <span className={`dot ${status[x.id] ?? 'sem_dados'}`} aria-hidden="true" />
                {x.nome}
              </Link>
            ))}
          </Fragment>
        ))}
      </nav>
      <div>
        <ChipsCentralizados>
          {INDICADORES_PAINEL.map(x => (
            <Link key={x.id} href={`/indicadores/${x.id}${q}`} aria-current={x.id === ind.id ? 'true' : undefined}>
              <span className={`dot ${status[x.id] ?? 'sem_dados'}`} aria-hidden="true" />
              {x.nome}
            </Link>
          ))}
        </ChipsCentralizados>

        <div className="ind-cab">
          <div>
            <div className="dom">{ind.dominio}</div>
            <h1>{ind.nome}</h1>
            <div className="perg">
              {ind.pergunta} {ind.explicacao}
            </div>
            <div className="formula">
              {ind.formula}
              {meta !== null && ind.meta ? ` · meta ${valorComUnidade(meta, u)} (${ind.meta.origem})` : ''}
            </div>
          </div>
          <div className="ac">
            <BotaoIA className="grande" pedido={pedidoDoIndicador(ind.id, ind.nome, l.trimestral, f)}>
              O que influenciou o resultado
            </BotaoIA>
          </div>
        </div>

        {!l.aplicavel ? (
          <p className="aviso-filtro" style={{ marginTop: 16 }}>
            {ind.nome} não se abre por senioridade (é medido sobre a liderança ou não tem essa dimensão). Limpe o filtro de senioridade para ver os números.
          </p>
        ) : (
          <>
            <div className="destaque">
              <span className={`tag ${titulo ? 'ia' : ''}`}>{titulo ? 'título da IA' : 'destaque automático'}</span>
              <p>
                {titulo && <span className="titulo-ia">{titulo.replace(/\.$/, '')}. </span>}
                <ComNegrito texto={p.destaque} />
              </p>
            </div>

            <div className="cards2">
              <CardKpi
                titulo="Mês"
                referencia={j.mes?.rotulo ?? rotuloMes(f.mes)}
                bloco={l.mes}
                unidade={u}
                nota={ciclo ? `Promoções se concentram nos ciclos de março e setembro: o mês isolado não se compara à meta anual, então o card usa os 12 meses até ${rotuloMes(f.mes)}.` : undefined}
                comparativos={[
                  { rotulo: 'vs meta', delta: vsMeta(l.mes), base: baseMeta },
                  { rotulo: `vs ${j.mesAnt ? curtoJanela(j.mesAnt.rotulo) : 'período ant.'}`, delta: l.mes.ant.delta, base: base(l.mes.ant.base) },
                  { rotulo: `vs ${j.mesAA ? curtoJanela(j.mesAA.rotulo) : 'ano ant.'}`, delta: l.mes.aa.delta, base: base(l.mes.aa.base) },
                ]}
              />
              <CardKpi
                titulo="Acumulado no ano"
                referencia={j.ytd.rotulo}
                bloco={l.ytd}
                unidade={u}
                comparativos={[
                  { rotulo: 'vs meta YTD', delta: vsMeta(l.ytd), base: baseMeta },
                  { rotulo: `vs YTD ${j.ytdM1 ? rotuloMes(j.ytdM1.periodo.fim) : 'mês ant.'}`, delta: l.ytd.ant.delta, base: base(l.ytd.ant.base) },
                  { rotulo: `vs ${j.ytdAA?.rotulo ?? 'ano anterior'}`, delta: l.ytd.aa.delta, base: base(l.ytd.aa.base) },
                ]}
              />
            </div>

            <section className="painel" aria-labelledby="t-evolucao">
              <h2 id="t-evolucao">Evolução mês a mês</h2>
              <div className="sub">
                <span className="so-desk-i">
                  {l.trimestral ? 'Ciclos trimestrais (8)' : ciclo ? '12 meses móveis, 24 meses' : '24 meses'} · barras coloridas pela meta · tracejado = mesmo {l.trimestral ? 'trimestre' : 'mês'} do ano anterior
                </span>
                <span className="so-mob-i">
                  {l.trimestral ? 'Últimos 4 ciclos' : ciclo ? '12 meses móveis, últimos 12' : '12 meses'} · barras coloridas pela meta
                </span>
              </div>
              <div className="so-desk">
                <BarrasMensais pontos={p.evolucao} unidade={u} meta={meta} polaridade={l.polaridade} trimestral={l.trimestral} descricao={descricao(p.evolucao)} />
              </div>
              <div className="so-mob-g">
                <BarrasMensais pontos={mobile} unidade={u} meta={meta} polaridade={l.polaridade} trimestral={l.trimestral} compacto descricao={descricao(mobile)} />
              </div>
            </section>

            <section className="painel" aria-labelledby="t-quebra">
              <h2 id="t-quebra">Quebra por {dimensao.toLowerCase()}</h2>
              <div className="sub">
                {p.quebra.dimensao === 'senioridade' ? `Dentro de ${f.diretoria} · ` : ''}Ordenado do pior para o melhor no acumulado do ano
              </div>
              {p.quebra.aplicavel ? (
                <div className="tdir-wrap">
                  <table className="tdir">
                    <thead>
                      <tr>
                        <th scope="col">{dimensao}</th>
                        <th scope="col">{j.mes?.rotulo.replace('12 meses até ', '12m · ') ?? 'Mês'}</th>
                        <th scope="col">YTD</th>
                        <th scope="col">YTD vs meta</th>
                        <th scope="col" className="barcell">YTD{meta !== null ? ' · tracejado = meta' : ''}</th>
                        <th scope="col" className="sparkcell">12 meses</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...p.quebra.linhas, p.quebra.total].map((x, i, todas) => {
                        const total = i === todas.length - 1;
                        const maximo = Math.max(...p.quebra.linhas.map(y => Math.abs(y.ytd ?? 0)), Math.abs(meta ?? 0), Math.abs(p.quebra.total.ytd ?? 0)) * 1.12 || 1;
                        const ruim = x.status === 'fora' || x.status === 'atencao';
                        const cor = meta === null || l.polaridade === 'neutro' ? 'var(--ink-2)' : ruim ? 'var(--ruim)' : 'var(--bom)';
                        return (
                          <tr key={x.rotulo} className={total ? 'total' : undefined} aria-current={x.atual ? 'true' : undefined} style={x.atual ? { fontWeight: 600 } : undefined}>
                            <td>
                              {x.rotulo}
                              {x.fragil && <span className="fragil">amostra pequena</span>}
                            </td>
                            <td>{valorComUnidade(x.mes, u)}</td>
                            <td>{valorComUnidade(x.ytd, u)}</td>
                            <td className={`d ${x.vsMeta?.tom ?? 'neutro'}`}>{x.vsMeta?.texto ?? SEM_VALOR}</td>
                            <td className="barcell">
                              {!total && (
                                <div className="hbar">
                                  <i style={{ width: `${(Math.abs(x.ytd ?? 0) / maximo) * 100}%`, background: cor, opacity: ruim ? 1 : 0.55 }} />
                                  {meta !== null && <b style={{ left: `${(Math.abs(meta) / maximo) * 100}%` }} />}
                                </div>
                              )}
                            </td>
                            <td className="sparkcell">{!total && <Spark valores={x.spark} status={x.status} />}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="sub" style={{ marginTop: 10 }}>{ind.nome} não se abre por {dimensao.toLowerCase()}.</p>
              )}
            </section>

            {p.sinais.length > 0 && (
              <section className="painel" aria-labelledby="t-sinais">
                <h2 id="t-sinais">Sinais detectados neste indicador</h2>
                <div className="sub">Calculados pelo motor ({rotuloIntervalo(periodoSinais)}{f.diretoria ? `, ${f.diretoria}` : ''}), base do deep dive da IA</div>
                <div className="sinais">
                  {p.sinais.map(s => (
                    <div key={`${s.tipo}-${s.onde}-${s.evidencia}`}>
                      <span className="k">
                        {s.tipo} · {s.onde}
                      </span>
                      <span>{s.evidencia}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
