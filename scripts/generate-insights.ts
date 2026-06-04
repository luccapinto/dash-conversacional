/**
 * Script de geração de insights proativos — M5 (LUC-167)
 *
 * Gera manchetes executivas e títulos narrativos para cada combinação
 * de período × diretoria usando OpenRouter. Output: lib/data/insights.json
 *
 * Uso:
 *   OPENROUTER_API_KEY=sk-... npx tsx scripts/generate-insights.ts
 *
 * Custo estimado: 49 combinações × ~500 tokens = ~24.500 tokens de entrada
 * + ~150 tokens de saída = ~7.350 tokens de saída → ~$0.02 com Gemini Flash
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  getTurnoverRate,
  getTrend,
  getProjection,
  rankDiretoriasByTurnover,
  breakdownByDimension,
  META_TURNOVER_MENSAL,
} from '../lib/calculations/index';
import type { Periodo, Diretoria, InsightPreGerado, IndiceInsights } from '../lib/types/index';

const PERIODOS: Periodo[] = ['3m', '6m', '12m', 'q1', 'q2', 'q3', 'q4'];
const DIRETORIAS: Diretoria[] = [
  'Geral',
  'Tecnologia',
  'Distribuição & Assessoria',
  'Operações',
  'Financeiro & Risco',
  'Gente',
  'Produtos & Plataforma',
];

const MODEL = process.env.OPENROUTER_MODEL ?? 'google/gemini-flash-1.5';
const API_KEY = process.env.OPENROUTER_API_KEY;

if (!API_KEY) {
  console.error('Erro: OPENROUTER_API_KEY não definida. Defina a variável de ambiente antes de rodar.');
  process.exit(1);
}

const SYSTEM_PROMPT = `Você é um analista sênior de People Analytics. Recebe dados estruturados de turnover de uma empresa e gera textos executivos curtos em português brasileiro.

Regras:
- Manchete: exatamente 1 frase, máx. 180 caracteres. Tom direto e executivo — como um CFO falaria. Sem "IA", "modelo" ou termos de machine learning. Mencione o número mais relevante quando possível.
- tituloTendencia: 5-9 palavras que descrevam a história principal do gráfico de tendência.
- tituloRanking: 5-9 palavras que descrevam a história principal do gráfico de ranking ou breakdown.
- Nunca invente dados que não estejam na entrada.
- Responda APENAS JSON válido no formato: {"manchete": "...", "tituloTendencia": "...", "tituloRanking": "..."}`;

function fmt(v: number) {
  return `${(v * 100).toFixed(2)}%`;
}

function buildContext(periodo: Periodo, diretoria: Diretoria): string {
  const turnover = getTurnoverRate(periodo, diretoria);
  const tendencia = getTrend(diretoria, periodo);
  const projecao = getProjection(diretoria);
  const isGeral = diretoria === 'Geral';

  let ctx = `PERÍODO: ${periodo} | DIRETORIA: ${diretoria}\n\n`;
  ctx += `=== TURNOVER ===\n`;
  ctx += `Taxa atual: ${fmt(turnover.taxa)} | Meta: ${fmt(META_TURNOVER_MENSAL)} | Status: ${turnover.status}\n`;
  ctx += `Desligamentos: ${turnover.desligamentos} | Headcount médio: ${Math.round(turnover.headcountMedio)}\n\n`;

  ctx += `=== TENDÊNCIA ===\n`;
  ctx += `Taxa atual: ${fmt(tendencia.taxaAtual)}\n`;
  ctx += `Vs. período anterior: ${tendencia.variacaoMoM !== null ? (tendencia.variacaoMoM > 0 ? '+' : '') + fmt(tendencia.variacaoMoM) + ' pp' : 'n/d'}\n`;
  ctx += `Vs. mesmo período ano anterior: ${tendencia.variacaoYoY !== null ? (tendencia.variacaoYoY > 0 ? '+' : '') + fmt(tendencia.variacaoYoY) + ' pp' : 'n/d'}\n`;
  ctx += `Direção: ${tendencia.direcao}\n`;
  if (tendencia.mesDaVirada) ctx += `Mês da virada (início escalada): ${tendencia.mesDaVirada}\n`;

  ctx += `\n=== PROJEÇÃO (próx. 3m) ===\n`;
  ctx += `Taxa projetada: ${fmt(projecao.taxaProjetadaProximo3Meses)}\n`;
  ctx += projecao.serieProjetada.map(p => `  ${p.label}: ${fmt(p.taxaProjetada)}`).join('\n') + '\n';

  if (isGeral) {
    const ranking = rankDiretoriasByTurnover(periodo);
    ctx += `\n=== RANKING DIRETORIAS ===\n`;
    ranking.ranking.forEach((r, i) => {
      ctx += `${i + 1}. ${r.diretoria}: ${fmt(r.taxa)} (${r.status})\n`;
    });
  } else {
    const breakdown = breakdownByDimension(periodo, diretoria, 'posicionamentoFaixa');
    ctx += `\n=== BREAKDOWN POR FAIXA SALARIAL ===\n`;
    breakdown.itens.forEach(item => {
      ctx += `  ${item.label}: ${item.percentual.toFixed(1)}% das saídas\n`;
    });

    const perf = breakdownByDimension(periodo, diretoria, 'nivelPerformance');
    ctx += `\n=== BREAKDOWN POR PERFORMANCE ===\n`;
    perf.itens.forEach(item => {
      ctx += `  ${item.label}: ${item.percentual.toFixed(1)}% das saídas\n`;
    });
  }

  return ctx;
}

async function callOpenRouter(userContent: string): Promise<InsightPreGerado> {
  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://verta.sa/people-analytics',
      'X-Title': 'Verta People Analytics',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.3,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenRouter error ${resp.status}: ${err}`);
  }

  const json = await resp.json() as { choices: Array<{ message: { content: string } }> };
  const raw = json.choices[0].message.content.trim();

  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const parsed = JSON.parse(cleaned) as { manchete: string; tituloTendencia: string; tituloRanking: string };

  return {
    manchete: parsed.manchete,
    titulos: {
      graficoPrincipal: parsed.tituloTendencia,
      graficoTendencia: parsed.tituloTendencia,
      graficoRanking: parsed.tituloRanking,
    },
    geradoEm: new Date().toISOString(),
  };
}

async function main() {
  const total = PERIODOS.length * DIRETORIAS.length;
  console.log(`Gerando insights para ${total} combinações (${PERIODOS.length} períodos × ${DIRETORIAS.length} diretorias)...`);
  console.log(`Modelo: ${MODEL}\n`);

  const result: IndiceInsights = {};
  let done = 0;

  for (const periodo of PERIODOS) {
    for (const diretoria of DIRETORIAS) {
      const key = `${periodo}:${diretoria}`;
      done++;
      process.stdout.write(`[${done}/${total}] ${key}... `);

      try {
        const ctx = buildContext(periodo, diretoria);
        const insight = await callOpenRouter(ctx);
        result[key] = insight;
        console.log('OK');
      } catch (err) {
        console.error(`ERRO: ${err}`);
      }

      // Rate limiting: 200ms entre chamadas
      await new Promise(r => setTimeout(r, 200));
    }
  }

  const outPath = path.resolve(__dirname, '../lib/data/insights.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`\nPronto! ${Object.keys(result).length} insights salvos em lib/data/insights.json`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
