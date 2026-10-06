/**
 * Tabela da aba Gerencial (servidor): por indicador, o bloco do mês e o do acumulado, minigráfico
 * de 12 meses e botão de IA. No celular vira cartões, um bloco por vez (seletor preso no topo).
 */

import { consulta, type FiltrosPainel } from '@/lib/painel/filtros';
import { curto, SEM_VALOR, type Delta } from '@/lib/painel/formato';
import type { Gerencial, LinhaGerencial } from '@/lib/painel/gerencial';
import type { BlocoLeitura } from '@/lib/painel/leitura';
import { pedidoDoIndicador } from '@/lib/ia/pedidos';
import { BotaoIA } from '@/components/ia/BotaoIA';
import { Spark } from '@/components/graficos/Spark';
import { BlocoGerencial, LinhaLink } from './Interativos';

export const ROTULO_STATUS: Record<string, string> = { fora: 'fora da meta', atencao: 'atenção', dentro: 'na meta', sem_meta: 'sem meta', sem_dados: 'sem dados' };

const Dif = ({ d, classe }: { d: Delta; classe: string }) => <div className={`d ${classe} ${d.tom}`}>{d.texto}</div>;

function Bloco({ b, l, classe }: { b: BlocoLeitura; l: LinhaGerencial; classe: 'bm' | 'by' }) {
  const status = b.medida?.status ?? 'sem_dados';
  return (
    <>
      <div className={`c real ${classe}`}>
        <span className={`dot ${status}`} title={ROTULO_STATUS[status]} aria-hidden="true" />
        <span className="sr-only">{ROTULO_STATUS[status]}: </span>
        {curto(b.medida?.valor ?? null, l.unidade)}
      </div>
      <div className={`c meta ${classe}`}>
        {b.medida?.meta != null && b.vsMeta ? (
          <>
            {curto(b.medida.meta, l.unidade)}
            <small className={`d ${b.vsMeta.tom}`}>{b.vsMeta.texto}</small>
          </>
        ) : (
          SEM_VALOR
        )}
      </div>
      <Dif d={b.ant.delta} classe={classe} />
      <Dif d={b.aa.delta} classe={classe} />
    </>
  );
}

export function TabelaGerencial({ g, filtros }: { g: Gerencial; filtros: FiltrosPainel }) {
  const q = consulta(filtros);
  const r = g.rotulos;
  return (
    <BlocoGerencial rotuloMes={`Mês · ${r.mes}`} rotuloYtd={`Acumulado · ${r.ytd.replace(/\/\d{2}$/, '')}`}>
      <div className="linha-g th1" aria-hidden="true">
        <div />
        <div className="grupo">Mês · {r.mes}</div>
        <div />
        <div className="grupo">Acumulado no ano · {r.ytd}</div>
        <div />
        <div />
      </div>
      <div className="linha-g th2" aria-hidden="true">
        <div>Indicador</div>
        <div className="bm">Real</div>
        <div className="bm">Meta · Δ</div>
        <div className="bm">vs mês ant.</div>
        <div className="bm">vs {r.mesAA}</div>
        <div className="sep" />
        <div className="by">Real</div>
        <div className="by">Meta · Δ</div>
        <div className="by">{r.ytdM1 ? `vs YTD ${r.ytdM1}` : 'vs YTD ant.'}</div>
        <div className="by">vs YTD {r.ytdAA}</div>
        <div className="spk" style={{ textAlign: 'right' }}>12 meses</div>
        <div />
      </div>
      {g.dominios.map(({ dominio, linhas, fora }, k) => (
        <section key={dominio} aria-label={dominio}>
          <div className={`dominio ${k === 0 ? 'primeiro' : ''}`}>
            {dominio}
            <small>
              {linhas.length} indicadores{fora ? ` · ${fora} fora da meta` : ''}
            </small>
          </div>
          {linhas.map(l => (
            <LinhaLink key={l.id} href={`/indicadores/${l.id}${q}`} className="linha-g lin" rotulo={`${l.nome}: abrir a página do indicador`}>
              <div className="nome">
                <div style={{ minWidth: 0 }}>
                  <b>{l.nome}</b>
                  <small>
                    {l.unidade}
                    {l.trimestral ? ' · trimestral' : ''}
                    {l.tipoMes === 'doze_meses' ? ' · mês = 12 meses' : ''}
                    {!l.aplicavel ? ' · não se abre por senioridade' : ''}
                  </small>
                </div>
              </div>
              <Bloco b={l.mes} l={l} classe="bm" />
              <div className="sep" />
              <Bloco b={l.ytd} l={l} classe="by" />
              <div className="spk">
                <Spark valores={l.spark} status={l.ytd.medida?.status ?? null} />
              </div>
              <div className="iac">
                <BotaoIA pedido={pedidoDoIndicador(l.id, l.nome, l.trimestral, filtros)} rotuloAcessivel={`O que influenciou ${l.nome}`} />
              </div>
            </LinhaLink>
          ))}
        </section>
      ))}
    </BlocoGerencial>
  );
}
