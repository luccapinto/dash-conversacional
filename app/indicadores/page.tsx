/** /indicadores sem id: abre o primeiro indicador de retenção, mantendo os filtros */

import { redirect } from 'next/navigation';
import { consulta, lerFiltros } from '@/lib/painel/filtros';

export default async function Indicadores({ searchParams }: PageProps<'/indicadores'>) {
  redirect(`/indicadores/turnover${consulta(lerFiltros(await searchParams))}`);
}
