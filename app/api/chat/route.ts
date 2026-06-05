import { NextRequest } from 'next/server';
import {
  getTurnoverRate,
  getTrend,
  getProjection,
  getYTD,
  rankDiretoriasByTurnover,
  breakdownByDimension,
  getHeadcount,
  META_TURNOVER_MENSAL,
} from '@/lib/calculations';
import { TOOL_DEFINITIONS } from '@/lib/calculations/toolDefinitions';
import type { Periodo, Diretoria, TipoDesligamento, ChatGraph, DimensaoBreakdown } from '@/lib/types';

const MODEL = process.env.OPENROUTER_MODEL ?? 'meta-llama/llama-3.1-8b-instruct';
const MAX_TOOL_ITERATIONS = 4;

// ── System prompt ─────────────────────────────────────────────────────────────

function describePeriodo(periodo: Periodo): string {
  const fixed: Partial<Record<Periodo, string>> = {
    '12m': 'Jan–Dez/2024 (ano completo)',
    '6m':  'Jul–Dez/2024 (2º semestre)',
    '3m':  'Out–Dez/2024 (4º trimestre)',
    'q1':  'Jan–Mar/2024 (1º trimestre)',
    'q2':  'Abr–Jun/2024 (2º trimestre)',
    'q3':  'Jul–Set/2024 (3º trimestre)',
    'q4':  'Out–Dez/2024 (4º trimestre)',
    '2023': 'Jan–Dez/2023 (ano completo)',
  };
  if (fixed[periodo]) return fixed[periodo]!;
  // YYYY-MM monthly period
  const m = /^(\d{4})-(\d{2})$/.exec(periodo);
  if (m) {
    const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${months[parseInt(m[2]) - 1]}/${m[1]}`;
  }
  return periodo;
}

function buildSystemPrompt(periodo: Periodo, diretoria: Diretoria): string {
  return `Você é o assistente de People Analytics da Verta S.A., empresa de mercado financeiro.
Responde perguntas sobre turnover, retenção e desligamentos com base exclusivamente nos dados disponíveis via funções.

REGRAS — NUNCA IGNORE:
1. NUNCA invente números. Use sempre as funções para buscar dados reais.
2. Para "cresceu", "aumentou", "piorou", "tendência", "desde quando", "escalada", "evolução" → getTrend OBRIGATÓRIO.
3. Para "por que?" → getTrend primeiro, depois breakdownByDimension (especialidade + nivelPerformance).
4. Perguntas fora do escopo: diga claramente que não tem essa informação.
5. Responda em português brasileiro, tom executivo e direto. Máximo 3 parágrafos curtos.
6. Use os números das funções. Não mencione "as funções" — fale como quem conhece os dados diretamente.

TAXA MENSAL vs YTD — DIFERENÇA CRÍTICA:
- getTurnoverRate → taxa MENSAL pontual (~2–4% por mês). Use para "qual o turnover de dezembro?", "como estamos este mês?".
- getYTD → taxa ACUMULADA no ano (~24–36% para o ano completo). Meta YTD cresce: ${(META_TURNOVER_MENSAL * 100).toFixed(1)}%/mês × meses (ex: 12% em junho, 24% em dezembro).
- Para qualquer pergunta com "YTD", "acumulado", "no ano", "desde janeiro", "acumulado do ano" → chame getYTD, NUNCA getTurnoverRate.
- Ao responder sobre YTD: mencione a taxa acumulada (ex: "36%") E a meta YTD do período (ex: "meta de 24% para o ano").

CONTEXTO DO FILTRO ATIVO:
- Período: ${periodo} → ${describePeriodo(periodo)}
- Diretoria em foco: ${diretoria === 'Geral' ? 'empresa toda' : diretoria}
- Referência temporal dos dados: Dezembro de 2024

Use o período e diretoria acima como padrão para as funções, salvo pedido explícito do usuário.`;
}

// ── Tool execution ────────────────────────────────────────────────────────────

type ToolArgs = Record<string, unknown>;

function executeTool(name: string, args: ToolArgs): unknown {
  const periodo = args.periodo as Periodo;
  const diretoria = (args.diretoria as Diretoria | undefined) ?? 'Geral';
  const tipo = args.tipoDesligamento as TipoDesligamento | undefined;

  switch (name) {
    case 'getTurnoverRate':
      return getTurnoverRate(periodo, diretoria, tipo);
    case 'getTrend':
      return getTrend(diretoria, (args.periodoReferencia as Periodo | undefined) ?? '12m', tipo);
    case 'getProjection':
      return getProjection(diretoria, tipo);
    case 'rankDiretoriasByTurnover':
      return rankDiretoriasByTurnover(periodo, tipo);
    case 'breakdownByDimension':
      return breakdownByDimension(periodo, diretoria, args.dimensao as DimensaoBreakdown, tipo);
    case 'getYTD':
      return getYTD(periodo, diretoria, tipo);
    case 'getHeadcount':
      return getHeadcount(periodo, diretoria);
    default:
      throw new Error(`Função desconhecida: ${name}`);
  }
}

// ── Graph spec derivation ────────────────────────────────────────────────────

type ToolResult = { name: string; args: ToolArgs; result: unknown };

function deriveGraphSpec(toolResults: ToolResult[]): ChatGraph | null {
  const trend = toolResults.find(r => r.name === 'getTrend');
  if (trend) {
    const dir = (trend.args.diretoria as Diretoria | undefined) ?? 'Geral';
    const tipo = trend.args.tipoDesligamento as TipoDesligamento | undefined;
    const projecaoResult = toolResults.find(r => r.name === 'getProjection')?.result
      ?? getProjection(dir, tipo);
    return {
      type: 'trend',
      tendencia: trend.result as ChatGraph extends { type: 'trend' } ? ChatGraph['tendencia'] : never,
      projecao: projecaoResult as ChatGraph extends { type: 'trend' } ? ChatGraph['projecao'] : never,
      meta: META_TURNOVER_MENSAL,
    };
  }
  const ranking = toolResults.find(r => r.name === 'rankDiretoriasByTurnover');
  if (ranking) return { type: 'ranking', data: ranking.result as never };

  const breakdown = toolResults.find(r => r.name === 'breakdownByDimension');
  if (breakdown) return { type: 'breakdown', data: breakdown.result as never };

  return null;
}

// ── OpenRouter client ─────────────────────────────────────────────────────────

type OAIMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};

async function callOR(messages: OAIMessage[], stream = false, tools = true): Promise<Response> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY não configurada');

  const body: Record<string, unknown> = {
    model: MODEL,
    messages,
    temperature: 0.15,
    stream,
  };
  if (tools) {
    body.tools = TOOL_DEFINITIONS;
    body.tool_choice = 'auto';
  }

  return fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://dash-conversacional.vercel.app',
      'X-Title': 'Verta People Analytics',
    },
    body: JSON.stringify(body),
  });
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  function sse(obj: unknown) {
    return encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);
  }

  try {
    const { messages, periodo, diretoria } = (await req.json()) as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      periodo: Periodo;
      diretoria: Diretoria;
    };

    if (!process.env.OPENROUTER_API_KEY) {
      return new Response(
        `data: ${JSON.stringify({ t: 'e', v: 'Configure OPENROUTER_API_KEY nas variáveis de ambiente do Vercel.' })}\ndata: [DONE]\n\n`,
        { headers: { 'Content-Type': 'text/event-stream' } }
      );
    }

    const systemPrompt = buildSystemPrompt(periodo, diretoria);
    const history: OAIMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ];

    const toolResults: ToolResult[] = [];
    let finalText = '';

    // ── Agentic tool-call loop ───────────────────────────────────────────────
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const resp = await callOR(history, false, true);
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`OpenRouter ${resp.status}: ${err.slice(0, 200)}`);
      }

      const data = (await resp.json()) as {
        choices: Array<{
          finish_reason: string;
          message: OAIMessage;
        }>;
      };

      const msg = data.choices[0].message;

      if (msg.tool_calls?.length) {
        history.push(msg);
        for (const tc of msg.tool_calls) {
          let result: unknown;
          try {
            const args = JSON.parse(tc.function.arguments) as ToolArgs;
            result = executeTool(tc.function.name, args);
            toolResults.push({ name: tc.function.name, args, result });
          } catch (e) {
            result = { error: String(e) };
          }
          history.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          });
        }
      } else {
        finalText = msg.content ?? '';
        break;
      }
    }

    if (!finalText) {
      finalText = 'Não consegui gerar uma resposta. Tente reformular a pergunta.';
    }

    const graphSpec = deriveGraphSpec(toolResults);

    // ── Stream response ──────────────────────────────────────────────────────
    const stream = new ReadableStream({
      async start(controller) {
        // Word-by-word streaming com delay natural
        const words = finalText.split(/(\s+)/);
        for (const chunk of words) {
          if (chunk) {
            controller.enqueue(sse({ t: 'c', v: chunk }));
            await new Promise(r => setTimeout(r, 18));
          }
        }

        if (graphSpec) {
          controller.enqueue(sse({ t: 'g', v: graphSpec }));
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      `data: ${JSON.stringify({ t: 'e', v: `Erro: ${msg}` })}\ndata: [DONE]\n\n`,
      { headers: { 'Content-Type': 'text/event-stream' } }
    );
  }
}
