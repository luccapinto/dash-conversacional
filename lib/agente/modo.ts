/**
 * Modo da IA, lido só no servidor. `IA_AO_VIVO=1` liga o agente e o layout ao vivo; ausente ou
 * qualquer outro valor é demonstração, mesmo com DEEPSEEK_API_KEY ou OPENROUTER_API_KEY no
 * ambiente: a versão publicada não gasta crédito de IA de ninguém.
 *
 * Em demonstração, `/api/agente` responde 403 sem montar provedor, `/api/layout` só devolve o
 * pré-gerado ou o determinístico, e o painel da IA toca respostas gravadas (lib/demo). O modo chega
 * ao navegador como prop do layout raiz, nunca por NEXT_PUBLIC_*.
 */

import 'server-only';
import type { ModoIA } from './contrato';

export function modoIA(env: Record<string, string | undefined> = process.env): ModoIA {
  return env.IA_AO_VIVO === '1' ? 'ao-vivo' : 'demonstracao';
}
