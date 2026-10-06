/**
 * POST /api/agente: agente de People Analytics com deep dive (fase 2). Contrato de entrada e dos
 * eventos SSE em lib/agente/contrato.ts; o painel da IA (fase 3) consome em lib/ia/stream.ts.
 *
 * maxDuration = 120 é um teto deliberado, não o pior caso teórico: um deep dive típico leva 3 a 4
 * pedidos ao modelo e 8 a 13 s (avaliação da fase 2). O pior caso (7 pedidos, cada um podendo
 * esperar 20 s sem chunk na principal e de novo na reserva) passaria de 120 s; nesse caso a
 * plataforma encerra a função e o stream termina SEM o evento `fim` nem `erro`. A UI (fase 3)
 * precisa tratar stream encerrado sem `fim` como resposta interrompida.
 *
 * O valor depende do fluid compute da Vercel, ligado por padrão neste projeto: com ele o plano
 * Hobby aceita até 300 s. Sem fluid compute o teto do Hobby é 60 s e o deploy recusa 120; quem
 * desligar precisa baixar maxDuration para 60.
 *
 * Modo demonstração (padrão, ver lib/agente/modo.ts): responde 403 na hora, sem ler o corpo, montar
 * provedor nem chamar a IA. O painel toca as respostas gravadas em public/demo.
 */

import { motorCliente } from '@/lib/analytics/cliente';
import { motorServidor } from '@/lib/analytics/servidor';
import { criarHandlerAgente, respostaJson } from '@/lib/agente/http';
import { provedoresDoAmbiente } from '@/lib/agente/llm';
import { modoIA } from '@/lib/agente/modo';

export const runtime = 'nodejs';
export const maxDuration = 120;

const aoVivo = criarHandlerAgente(() => ({
  ambiente: { motor: motorServidor(), motorSinais: motorCliente },
  provedores: provedoresDoAmbiente(),
}));

export async function POST(req: Request): Promise<Response> {
  return modoIA() === 'ao-vivo' ? aoVivo(req) : respostaJson(403, { erro: 'modo demonstração' });
}
