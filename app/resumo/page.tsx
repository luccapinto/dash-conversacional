/**
 * Aba Resumo executivo (/resumo): placar de metas, o motivo de cada resultado e os destaques da IA
 * para o público escolhido (CEO · CHRO · Gestor). O resumo é por diretoria: a senioridade não entra.
 */

import type { Metadata } from 'next';
import { motorCliente } from '@/lib/analytics/cliente';
import { rotuloMes } from '@/lib/analytics/dominio';
import { pedidoDoIndicador } from '@/lib/ia/pedidos';
import { consulta, lenteDe, lerFiltros } from '@/lib/painel/filtros';
import { dadosDosGraficos } from '@/lib/painel/graficos';
import { INDICADORES_PAINEL } from '@/lib/painel/indicadores';
import { montarResumo } from '@/lib/painel/resumo';
import { sinaisVisiveis } from '@/lib/painel/sinais';
import { layoutDaTela } from '@/lib/painel/tela';
import { BarraSuperior } from '@/components/painel/BarraSuperior';
import { Resumo } from '@/components/painel/Resumo';

export const metadata: Metadata = { title: 'Resumo executivo · Verta S.A. · People Analytics' };

const LENTES = [
  { id: 'ceo', rotulo: 'CEO' },
  { id: 'chro', rotulo: 'CHRO' },
  { id: 'gestor', rotulo: 'Gestor' },
] as const;

export default async function ResumoExecutivo({ searchParams }: PageProps<'/resumo'>) {
  const lido = lerFiltros(await searchParams);
  const f = { ...lido, senioridade: null };
  const lente = lenteDe(f);
  const tela = layoutDaTela(motorCliente, f);
  const todos = sinaisVisiveis(motorCliente, tela.recorte.periodo, f.diretoria, lente);
  const base = montarResumo(motorCliente, f, todos);
  const nomes = Object.fromEntries(INDICADORES_PAINEL.map(i => [i.id, i.nome]));
  const pedidos = Object.fromEntries(INDICADORES_PAINEL.map(i => [i.id, pedidoDoIndicador(i.id, i.nome, i.granularidade === 'trimestral', f)]));
  return (
    <>
      <BarraSuperior filtros={lido} aba="resumo" />
      <main id="conteudo" className="pagina">
        <Resumo
          placar={base.placar}
          dominios={base.dominios.map(d => ({ dominio: d.dominio, itens: d.itens.map(i => ({ ...i, pedido: pedidos[i.id] })) }))}
          nSinais={todos.length}
          rotuloMes={rotuloMes(f.mes)}
          layout={tela.spec}
          pregerado={tela.pregerado}
          recorte={tela.recorte}
          graficos={dadosDosGraficos(motorCliente, tela.recorte, tela.sinais)}
          nomes={nomes}
          pedidos={pedidos}
          lentes={LENTES.map(l => ({ ...l, href: `/resumo${consulta({ ...lido, lente: l.id })}`, atual: l.id === lente }))}
          consulta={consulta(lido)}
        />
      </main>
    </>
  );
}
