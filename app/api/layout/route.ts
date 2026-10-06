/**
 * GET /api/layout: layout spec de um recorte (camada adaptativa, fase 2). Combinações padrão vêm
 * do JSON pré-gerado; as demais são geradas ao vivo pela IA (uma chamada, sem tools) com cache em
 * memória e fallback determinístico. Ver lib/layout/http.ts.
 *
 * maxDuration: uma chamada de ~4 s; o teto cobre principal e reserva com timeout de 20 s cada.
 */

import { motorCliente } from '@/lib/analytics/cliente';
import { provedoresDoAmbiente } from '@/lib/agente/llm';
import { criarHandlerLayout } from '@/lib/layout/http';
import { LAYOUTS_PADRAO } from '@/lib/layout/padrao';

export const runtime = 'nodejs';
export const maxDuration = 60;

export const GET = criarHandlerLayout(() => ({ motor: motorCliente, provedores: provedoresDoAmbiente(), padrao: LAYOUTS_PADRAO.layouts }));
