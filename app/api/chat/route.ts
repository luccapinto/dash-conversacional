import { NextRequest } from 'next/server';
import {
  getTurnoverRate,
  getTrend,
  getProjection,
  getYTD,
  rankDiretoriasByTurnover,
  breakdownByDimension,
  getHeadcount,
  getSegmentRates,
  getDrivers,
  crossBreakdown,
  compareGroups,
  getCohortByTenure,
  quantifyCost,
  getRegrettedAttrition,
  META_TURNOVER_MENSAL,
} from '@/lib/calculations';
import { TOOL_DEFINITIONS } from '@/lib/calculations/toolDefinitions';
import type {
  Periodo, Diretoria, TipoDesligamento, ChatGraph, DimensaoBreakdown,
  ResultadoDrivers, ResultadoSegmentRates, ResultadoCohort, ResultadoCrossBreakdown,
  ResultadoComparacao, BarItem,
} from '@/lib/types';

// Streaming + múltiplas chamadas sequenciais ao modelo exigem Node runtime e
// janela de execução maior que o default do Vercel.
export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = process.env.OPENROUTER_MODEL ?? 'anthropic/claude-3.5-sonnet';
const MAX_TOOL_ITERATIONS = 5;

// ── Rate limiting (in-memory, por instância) ───────────────────────────────────
// Proteção mínima contra abuso da chave OpenRouter num endpoint público.
// Limitação conhecida: o estado é por instância serverless (não global).
const RATE_LIMIT = 20;          // requisições
const RATE_WINDOW_MS = 60_000;  // por minuto
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT) return false;
  bucket.count++;
  return true;
}

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
  const m = /^(\d{4})-(\d{2})$/.exec(periodo);
  if (m) {
    const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${months[parseInt(m[2]) - 1]}/${m[1]}`;
  }
  return periodo;
}

function buildSystemPrompt(periodo: Periodo, diretoria: Diretoria): string {
  return `Você é o analista sênior de People Analytics da Verta S.A., empresa de mercado financeiro.
Responde sobre turnover, retenção e desligamentos usando EXCLUSIVAMENTE os dados que vêm das funções.

PRINCÍPIOS:
1. Nunca invente números. Todo dado vem de uma função — encadeie quantas precisar para uma resposta completa.
2. Pense como analista, não como tabela: confirme a tendência, ache a causa, quantifique o impacto e aponte a ação.
3. Distinga COMPOSIÇÃO de TAXA. "60% das saídas eram júnior" (composição) ≠ "júniors saem 2× mais" (taxa). Para taxa real por perfil use getSegmentRates ou getDrivers — eles usam a população ativa como base e retornam o lift (sobre-representação).
4. Trate amostras pequenas com cautela: se uma fatia tem poucos desligamentos, sinalize a incerteza em vez de cravar conclusão.
5. Português brasileiro, tom executivo. Vá direto ao ponto, mas seja completo.

COMO ESCOLHER A FUNÇÃO:
- "cresceu / aumentou / piorou / tendência / desde quando" → getTrend.
- "por que / o que está puxando / qual perfil sai mais" → getDrivers (diagnóstico multivariado por lift). Aprofunde com getSegmentRates ou crossBreakdown.
- "quanto custa / impacto financeiro" → quantifyCost.
- "estamos perdendo os melhores / perda de talento" → getRegrettedAttrition.
- "estamos perdendo gente nova / em quanto tempo saem" → getCohortByTenure.
- "X vs Y / como se compara" → compareGroups.
- "YTD / acumulado / no ano" → getYTD (a meta YTD cresce: ${(META_TURNOVER_MENSAL * 100).toFixed(1)}%/mês × meses). NUNCA use getTurnoverRate para YTD.
- "como estamos / qual o turnover" (valor pontual) → getTurnoverRate.

FORMATO DA RESPOSTA (a interface renderiza Markdown):
- Use **negrito** nos números-chave e nas conclusões.
- Use listas com "- " para enumerar fatores/causas.
- Use tabelas Markdown quando comparar 3+ itens (ex: ranking, drivers, comparações).
- Um gráfico pode ser anexado automaticamente — não descreva o gráfico, complemente-o com a leitura.

CONTEXTO DO FILTRO ATIVO:
- Período: ${periodo} → ${describePeriodo(periodo)}
- Diretoria em foco: ${diretoria === 'Geral' ? 'empresa toda' : diretoria}
- Referência temporal dos dados: Dezembro de 2024
Use o período e a diretoria acima como padrão nas funções, salvo pedido explícito do usuário.`;
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
    case 'getSegmentRates':
      return getSegmentRates(periodo, diretoria, args.dimensao as DimensaoBreakdown, tipo);
    case 'getDrivers':
      return getDrivers(periodo, diretoria, tipo);
    case 'crossBreakdown':
      return crossBreakdown(periodo, diretoria, args.dimensao1 as DimensaoBreakdown, args.dimensao2 as DimensaoBreakdown, tipo);
    case 'compareGroups':
      return compareGroups(
        args.periodoA as Periodo, args.diretoriaA as Diretoria,
        args.periodoB as Periodo, args.diretoriaB as Diretoria, tipo);
    case 'getCohortByTenure':
      return getCohortByTenure(periodo, diretoria, tipo);
    case 'quantifyCost':
      return quantifyCost(periodo, diretoria, tipo);
    case 'getRegrettedAttrition':
      return getRegrettedAttrition(periodo, diretoria);
    default:
      throw new Error(`Função desconhecida: ${name}`);
  }
}

/** Rótulo amigável de progresso enquanto a função roda */
function progressLabel(name: string, args: ToolArgs): string {
  const dir = (args.diretoria as string | undefined) ?? (args.diretoriaA as string | undefined) ?? 'a empresa';
  const labels: Record<string, string> = {
    getTurnoverRate: `Calculando o turnover de ${dir}…`,
    getTrend: `Analisando a tendência de ${dir}…`,
    getProjection: `Projetando os próximos meses…`,
    rankDiretoriasByTurnover: `Ranqueando as diretorias…`,
    breakdownByDimension: `Detalhando por ${args.dimensao ?? 'dimensão'}…`,
    getYTD: `Apurando o acumulado do ano…`,
    getHeadcount: `Levantando o headcount…`,
    getSegmentRates: `Calculando taxas reais por ${args.dimensao ?? 'segmento'}…`,
    getDrivers: `Diagnosticando os drivers de ${dir}…`,
    crossBreakdown: `Cruzando ${args.dimensao1 ?? ''} × ${args.dimensao2 ?? ''}…`,
    compareGroups: `Comparando os recortes…`,
    getCohortByTenure: `Analisando saída por tempo de casa…`,
    quantifyCost: `Quantificando o custo do turnover…`,
    getRegrettedAttrition: `Medindo a perda de talento…`,
  };
  return labels[name] ?? `Consultando os dados…`;
}

// ── Graph spec derivation ────────────────────────────────────────────────────

type ToolResult = { name: string; args: ToolArgs; result: unknown };

function deriveGraphSpec(toolResults: ToolResult[]): ChatGraph | null {
  const find = (n: string) => toolResults.find(r => r.name === n);

  const trend = find('getTrend');
  if (trend) {
    const dir = (trend.args.diretoria as Diretoria | undefined) ?? 'Geral';
    const tipo = trend.args.tipoDesligamento as TipoDesligamento | undefined;
    const projecaoResult = find('getProjection')?.result ?? getProjection(dir, tipo);
    return {
      type: 'trend',
      tendencia: trend.result as ChatGraph extends { type: 'trend' } ? ChatGraph['tendencia'] : never,
      projecao: projecaoResult as ChatGraph extends { type: 'trend' } ? ChatGraph['projecao'] : never,
      meta: META_TURNOVER_MENSAL,
    };
  }

  const ranking = find('rankDiretoriasByTurnover');
  if (ranking) return { type: 'ranking', data: ranking.result as never };

  // Drivers → barras de lift (fatores de risco)
  const drivers = find('getDrivers');
  if (drivers) {
    const r = drivers.result as ResultadoDrivers;
    if (r.fatoresDeRisco.length) {
      return {
        type: 'bars',
        title: 'Fatores de risco — lift vs. o esperado',
        unit: 'x',
        data: r.fatoresDeRisco.map<BarItem>(d => ({
          label: `${d.valor}`,
          value: d.lift,
          highlight: d.lift >= 2,
          sub: `${d.dimensao} · ${(d.taxaSegmento * 100).toFixed(1)}%/mês · n=${d.desligamentos}`,
        })),
      };
    }
  }

  // Segment rates → barras de lift (ou composição se sem população)
  const seg = find('getSegmentRates');
  if (seg) {
    const r = seg.result as ResultadoSegmentRates;
    if (r.itens.length) {
      const usaLift = r.temPopulacaoBase;
      return {
        type: 'bars',
        title: usaLift ? `Lift por ${r.dimensao}` : `Composição por ${r.dimensao}`,
        unit: usaLift ? 'x' : '%',
        data: r.itens.map<BarItem>(i => ({
          label: i.label,
          value: usaLift ? (i.lift ?? 0) : i.composicaoPct,
          highlight: usaLift ? (i.lift ?? 0) >= 2 : i.composicaoPct >= 30,
          sub: i.amostraSuficiente
            ? (usaLift && i.taxaSegmento !== null ? `${(i.taxaSegmento * 100).toFixed(1)}%/mês · n=${i.desligamentos}` : `n=${i.desligamentos}`)
            : `amostra baixa · n=${i.desligamentos}`,
        })),
      };
    }
  }

  // Cohort por tempo de casa → barras de %
  const cohort = find('getCohortByTenure');
  if (cohort) {
    const r = cohort.result as ResultadoCohort;
    return {
      type: 'bars',
      title: 'Saídas por tempo de casa',
      unit: '%',
      data: r.buckets.map<BarItem>(b => ({
        label: b.faixa,
        value: b.percentual,
        highlight: b.percentual >= 30,
        sub: `${b.voluntarioPct}% voluntário · n=${b.desligamentos}`,
      })),
    };
  }

  // Cross-breakdown → barras das células de maior interseção
  const cross = find('crossBreakdown');
  if (cross) {
    const r = cross.result as ResultadoCrossBreakdown;
    if (r.celulas.length) {
      return {
        type: 'bars',
        title: `${r.dimensao1} × ${r.dimensao2}`,
        unit: '%',
        data: r.celulas.slice(0, 8).map<BarItem>((c, i) => ({
          label: `${c.valor1} × ${c.valor2}`,
          value: c.percentual,
          highlight: i === 0,
          sub: `n=${c.desligamentos}`,
        })),
      };
    }
  }

  // Comparação → barras das duas taxas
  const cmp = find('compareGroups');
  if (cmp) {
    const r = cmp.result as ResultadoComparacao;
    return {
      type: 'bars',
      title: 'Comparação de turnover (mensal)',
      unit: '%',
      data: [r.grupoA, r.grupoB].map<BarItem>(g => ({
        label: g.rotulo,
        value: parseFloat((g.taxa * 100).toFixed(2)),
        highlight: g.rotulo === r.liderTaxa,
        sub: `${g.voluntarioPct}% vol · ${g.altaPerformancePct}% alta perf`,
      })),
    };
  }

  const breakdown = find('breakdownByDimension');
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

async function callOR(messages: OAIMessage[], stream: boolean, useTools: boolean): Promise<Response> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY não configurada');

  const body: Record<string, unknown> = {
    model: MODEL,
    messages,
    temperature: 0.2,
    stream,
  };
  if (useTools) {
    body.tools = TOOL_DEFINITIONS;
    body.tool_choice = 'auto';
  }

  return fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://dash-conversacional.vercel.app',
      'X-Title': 'Verta People Analytics',
    },
    body: JSON.stringify(body),
  });
}

/** Itera tokens de conteúdo de uma resposta SSE streamada da OpenRouter */
async function* streamContent(resp: Response): AsyncGenerator<string> {
  if (!resp.body) return;
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const data = t.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const j = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
        const delta = j.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch { /* ignora keep-alives / linhas parciais */ }
    }
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  const sse = (obj: unknown) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);
  const done = () => encoder.encode('data: [DONE]\n\n');

  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local';
    if (!checkRateLimit(ip)) {
      return new Response(
        `data: ${JSON.stringify({ t: 'e', v: 'Muitas perguntas em sequência. Aguarde um instante e tente de novo.' })}\ndata: [DONE]\n\n`,
        { status: 429, headers: { 'Content-Type': 'text/event-stream' } }
      );
    }

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

    const stream = new ReadableStream({
      async start(controller) {
        const toolResults: ToolResult[] = [];
        try {
          // ── Fase de ferramentas (detecção não-streamada) ──────────────────
          let answeredInline = '';
          for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
            const resp = await callOR(history, false, true);
            if (!resp.ok) {
              const errText = await resp.text();
              console.error('OpenRouter tool phase error:', resp.status, errText.slice(0, 300));
              throw new Error('upstream');
            }
            const data = (await resp.json()) as { choices: Array<{ message: OAIMessage }> };
            const msg = data.choices[0].message;

            if (msg.tool_calls?.length) {
              history.push(msg);
              for (const tc of msg.tool_calls) {
                controller.enqueue(sse({ t: 's', v: progressLabel(tc.function.name, safeParse(tc.function.arguments)) }));
                let result: unknown;
                try {
                  const args = safeParse(tc.function.arguments);
                  result = executeTool(tc.function.name, args);
                  toolResults.push({ name: tc.function.name, args, result });
                } catch (e) {
                  result = { error: String(e) };
                }
                history.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
              }
            } else {
              answeredInline = msg.content ?? '';
              break;
            }
          }

          // ── Fase de resposta (streaming real) ─────────────────────────────
          let streamed = '';
          if (toolResults.length > 0) {
            // Sintetiza a resposta final a partir dos dados, em streaming.
            const resp = await callOR(history, true, false);
            if (!resp.ok) {
              const errText = await resp.text();
              console.error('OpenRouter answer phase error:', resp.status, errText.slice(0, 300));
              throw new Error('upstream');
            }
            for await (const chunk of streamContent(resp)) {
              streamed += chunk;
              controller.enqueue(sse({ t: 'c', v: chunk }));
            }
          } else {
            // Sem ferramentas: emite o que o modelo já respondeu.
            streamed = answeredInline;
            for (const chunk of answeredInline.split(/(\s+)/)) {
              if (chunk) controller.enqueue(sse({ t: 'c', v: chunk }));
            }
          }

          if (!streamed.trim()) {
            controller.enqueue(sse({ t: 'c', v: 'Não consegui gerar uma resposta. Tente reformular a pergunta.' }));
          }

          const graphSpec = deriveGraphSpec(toolResults);
          if (graphSpec) controller.enqueue(sse({ t: 'g', v: graphSpec }));

          controller.enqueue(done());
          controller.close();
        } catch (err) {
          console.error('Chat stream error:', err);
          controller.enqueue(sse({ t: 'e', v: 'Tive um problema ao consultar os dados agora. Tente de novo em instantes.' }));
          controller.enqueue(done());
          controller.close();
        }
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
    console.error('Chat handler error:', err);
    return new Response(
      `data: ${JSON.stringify({ t: 'e', v: 'Erro inesperado. Tente novamente.' })}\ndata: [DONE]\n\n`,
      { headers: { 'Content-Type': 'text/event-stream' } }
    );
  }
}

function safeParse(s: string): ToolArgs {
  try { return JSON.parse(s) as ToolArgs; } catch { return {}; }
}
