/**
 * Layouts pré-gerados das combinações padrão (scripts/generate-layouts.ts). O client importa este
 * módulo: zero custo de IA por visitante. Recorte fora do padrão: GET /api/layout (ao vivo, com
 * cache e o mesmo fallback determinístico).
 */

import layoutsJson from '@/lib/dados/cliente/layouts.json';
import { chaveLayout, type LayoutSpec, type RecorteLayout } from './spec';

export interface ArquivoLayouts {
  geradoEm: string;
  /** provedor:modelo que gerou os specs da IA (null = só determinístico) */
  modelo: string | null;
  layouts: Record<string, LayoutSpec>;
}

export const LAYOUTS_PADRAO = layoutsJson as unknown as ArquivoLayouts;

export function layoutPadrao(r: RecorteLayout): LayoutSpec | null {
  return LAYOUTS_PADRAO.layouts[chaveLayout(r)] ?? null;
}
