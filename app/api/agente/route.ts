/**
 * POST /api/agente: agente de People Analytics com deep dive (fase 2). Contrato de entrada e dos
 * eventos SSE em lib/agente/contrato.ts. Substitui /api/chat, que fica intacta até a fase 3 trocar
 * a UI.
 *
 * maxDuration: um deep dive típico leva poucas rodadas de ~1-3 s. O teto cobre o pior caso de 7
 * pedidos ao modelo (6 rodadas de tools + resposta) com timeout de 20 s sem chunk por pedido,
 * dentro do limite de 300 s do plano Hobby da Vercel com fluid compute.
 */

import { motorCliente } from '@/lib/analytics/cliente';
import { motorServidor } from '@/lib/analytics/servidor';
import { criarHandlerAgente } from '@/lib/agente/http';
import { provedoresDoAmbiente } from '@/lib/agente/llm';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = criarHandlerAgente(() => ({
  ambiente: { motor: motorServidor(), motorSinais: motorCliente },
  provedores: provedoresDoAmbiente(),
}));
