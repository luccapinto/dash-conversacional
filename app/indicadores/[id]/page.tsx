/**
 * Página do indicador (/indicadores/[id]): leitura do mês e do acumulado, evolução, quebra e sinais.
 * Só indicadores visíveis do painel; os ocultos e ids inválidos dão 404.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CATALOGO } from '@/lib/analytics/catalog';
import { motorCliente } from '@/lib/analytics/cliente';
import { tituloIA } from '@/lib/painel/destaques';
import { lenteDe, lerFiltros } from '@/lib/painel/filtros';
import { montarIndicador, statusDoPainel } from '@/lib/painel/indicador';
import { noPainel } from '@/lib/painel/indicadores';
import { periodoSinais } from '@/lib/painel/periodos';
import { sinaisVisiveis } from '@/lib/painel/sinais';
import { layoutDaTela, sugestoesDoLayout } from '@/lib/painel/tela';
import { SugestoesIA } from '@/components/ia/ProvedorIA';
import { BarraSuperior } from '@/components/painel/BarraSuperior';
import { PaginaDoIndicador } from '@/components/painel/Indicador';

export async function generateMetadata({ params }: PageProps<'/indicadores/[id]'>): Promise<Metadata> {
  const { id } = await params;
  return { title: noPainel(id) ? `${CATALOGO[id].nome} · Verta S.A. · People Analytics` : 'Indicador não encontrado' };
}

export default async function Indicador({ params, searchParams }: PageProps<'/indicadores/[id]'>) {
  const { id } = await params;
  if (!noPainel(id)) notFound();
  const f = lerFiltros(await searchParams);
  const ind = CATALOGO[id];
  const periodo = periodoSinais(f.mes);
  const sinais = sinaisVisiveis(motorCliente, periodo, f.diretoria, lenteDe(f));
  const p = montarIndicador(motorCliente, ind, f, sinais);
  const { spec } = layoutDaTela(motorCliente, f);
  return (
    <>
      <BarraSuperior filtros={f} aba="indicador" indicador={id} />
      <SugestoesIA sugestoes={sugestoesDoLayout(spec)} />
      <main id="conteudo" className="pagina com-fab">
        <PaginaDoIndicador ind={ind} p={p} f={f} status={statusDoPainel(motorCliente, f)} titulo={tituloIA(id, f)} periodoSinais={periodo} />
      </main>
    </>
  );
}
