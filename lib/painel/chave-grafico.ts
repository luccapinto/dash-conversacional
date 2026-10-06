/**
 * Chave dos dados de um gráfico do layout. O servidor monta os dados de todos os gráficos possíveis
 * do recorte; o cliente acha os de cada gráfico pelo layout, que pode chegar depois (/api/layout).
 * Módulo à parte para o bundle do cliente não levar catálogo, spec e detector.
 */

import type { GraficoLayout } from '@/lib/layout/spec';

export function chaveGrafico(g: Pick<GraficoLayout, 'tipo' | 'indicadores' | 'diretoria'>): string {
  return `${g.tipo}|${g.indicadores.join('>')}|${g.diretoria ?? ''}`;
}
