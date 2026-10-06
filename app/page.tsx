/**
 * Aba Gerencial (/): todos os indicadores visíveis no mês e no acumulado, agrupados por domínio.
 * Renderizada no servidor a partir do cubo (sem IA): a tela chega completa.
 */

import { motorCliente } from '@/lib/analytics/cliente';
import { lerFiltros } from '@/lib/painel/filtros';
import { montarGerencial } from '@/lib/painel/gerencial';
import { layoutDaTela, sugestoesDoLayout } from '@/lib/painel/tela';
import { SugestoesIA } from '@/components/ia/ProvedorIA';
import { BarraSuperior } from '@/components/painel/BarraSuperior';
import { TabelaGerencial } from '@/components/painel/TabelaGerencial';

export default async function Gerencial({ searchParams }: PageProps<'/'>) {
  const f = lerFiltros(await searchParams);
  const g = montarGerencial(motorCliente, f);
  const { spec } = layoutDaTela(motorCliente, f);
  const n = g.dominios.reduce((s, d) => s + d.linhas.length, 0);
  const { dentro, atencao, fora } = g.contagem;
  const recorte = [f.diretoria, f.senioridade].filter(Boolean).join(' · ');
  return (
    <>
      <BarraSuperior filtros={f} aba="gerencial" />
      <SugestoesIA sugestoes={sugestoesDoLayout(spec)} />
      <main id="conteudo" className="pagina">
        <div className="cab">
          <div>
            <h1>Painel gerencial</h1>
            <p>
              {n} indicadores{recorte ? ` · ${recorte}` : ''} · {g.rotulos.mes} e acumulado {g.rotulos.ytd} · {dentro} na meta, {atencao} em atenção, {fora} fora (YTD)
            </p>
          </div>
          <div className="acoes legenda" aria-label="Legenda">
            <span><i className="dot dentro" />na meta</span>
            <span><i className="dot atencao" />atenção</span>
            <span><i className="dot fora" />fora</span>
            <span><i className="dot sem_meta" />sem meta</span>
          </div>
        </div>
        <TabelaGerencial g={g} filtros={f} />
      </main>
    </>
  );
}
