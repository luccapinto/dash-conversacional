#!/usr/bin/env npx tsx
/**
 * avaliar-agente.ts — avaliação real do agente (fora do CI: gasta a chave da DeepSeek).
 *
 *   node --env-file=.env.local --import tsx scripts/avaliar-agente.ts [--saida=caminho.md] [--so=1,5,12]
 *
 * 20 perguntas cobrindo os 7 domínios do catálogo e as 8 histórias de docs/narrativa.md, metade
 * livre e metade como deep dive (contexto do botão "Investigar"). Para cada uma registra as tools
 * chamadas, se a tool esperada apareceu, a % de números verificados pela guarda, a latência até o
 * 1º texto, até a resposta final e total, e os tokens. Roda em sequência (latência limpa) e grava
 * o relatório em .git/project-upgrade/fase2/avaliacao.md (fora da árvore), com as respostas.
 */

import * as fs from 'fs';
import * as path from 'path';
import { motorCliente } from '../lib/analytics/cliente';
import { criarMotor } from '../lib/analytics/engine';
import { construirFatos } from '../lib/analytics/fatos';
import type { Eventos, Pessoa } from '../lib/analytics/dominio';
import { executarAgente, type MetricasAgente } from '../lib/agente/agente';
import type { BlocoVisualizacao, ContextoDeepDive, NomeFerramenta } from '../lib/agente/contrato';
import { provedoresDoAmbiente } from '../lib/agente/llm';

const PERIODO = { inicio: '2025-10', fim: '2026-09' };
const PRECO = { entrada: 0.3, cache: 0.006, saida: 1.2 };

interface Caso {
  pergunta: string;
  /** domínio(s) e história(s) cobertos */
  cobre: string;
  /** basta uma delas aparecer (com sucesso) */
  esperadas: NomeFerramenta[];
  contexto?: ContextoDeepDive;
}

const CASOS: Caso[] = [
  // ── livres ──
  { cobre: 'Retenção · L1', pergunta: 'Qual diretoria tem o maior turnover lamentado nos últimos 12 meses e por quê?', esperadas: ['decompor', 'drivers'] },
  { cobre: 'Retenção · L2', pergunta: 'O turnover de Distribuição & Assessoria tem algum padrão ao longo do ano?', esperadas: ['serie'] },
  { cobre: 'Força de trabalho', pergunta: 'Como evoluiu o headcount da empresa nos últimos 12 meses?', esperadas: ['serie', 'valor', 'comparar'] },
  { cobre: 'Desenvolvimento · Diversidade · N3', pergunta: 'Existe diferença na taxa de promoção entre homens e mulheres na passagem para a liderança?', esperadas: ['decompor', 'cruzar'] },
  { cobre: 'Custo · N2', pergunta: 'Quanto custaram as horas extras de Tecnologia nos últimos 12 meses?', esperadas: ['impacto'] },
  { cobre: 'Atração', pergunta: 'Como estão o time to fill e a taxa de aceite de oferta por diretoria?', esperadas: ['decompor'] },
  { cobre: 'Macro (sinais)', pergunta: 'Quais são os 3 pontos de maior atenção para o CEO hoje?', esperadas: ['sinais'] },
  { cobre: 'Diversidade', pergunta: 'Como estamos em mulheres e pessoas negras na liderança contra a meta?', esperadas: ['valor', 'comparar'] },
  { cobre: 'Desenvolvimento · N5', pergunta: 'A mobilidade interna ajuda a reter pessoas em Financeiro & Risco?', esperadas: ['drivers', 'decompor', 'comparar'] },
  { cobre: 'Engajamento', pergunta: 'Qual o eNPS de cada diretoria no último ciclo?', esperadas: ['decompor'] },
  // ── deep dives (contexto do botão "Investigar") ──
  {
    cobre: 'Retenção · L1', pergunta: 'Por que o turnover lamentado está tão alto no piso da faixa?', esperadas: ['drivers', 'decompor', 'cruzar'],
    contexto: { indicador: 'turnover_lamentado', periodo: PERIODO, filtros: { diretoria: 'Tecnologia' }, ponto: { dimensao: 'faixaSalarial', segmento: 'piso' }, lente: 'chro' },
  },
  {
    cobre: 'Retenção · L2', pergunta: 'O que aconteceu neste mês?', esperadas: ['decompor', 'drivers'],
    contexto: { indicador: 'turnover', periodo: PERIODO, filtros: { diretoria: 'Distribuição & Assessoria' }, ponto: { mes: '2026-01' }, lente: 'gestor' },
  },
  {
    cobre: 'Retenção · L3', pergunta: 'Por que o turnover voluntário de Operações subiu?', esperadas: ['drivers'],
    contexto: { indicador: 'turnover_voluntario', periodo: PERIODO, filtros: { diretoria: 'Operações' }, lente: 'chro' },
  },
  {
    cobre: 'Engajamento · N1', pergunta: 'O que explica a queda do eNPS neste ciclo e o que ela antecipa?', esperadas: ['sinais', 'serie'],
    contexto: { indicador: 'enps', periodo: { inicio: '2024-10', fim: '2025-09' }, filtros: { diretoria: 'Operações' }, ponto: { mes: '2025-03' }, lente: 'chro' },
  },
  {
    cobre: 'Engajamento · N2', pergunta: 'Por que as horas extras de Tecnologia estão acima da meta?', esperadas: ['sinais', 'serie'],
    contexto: { indicador: 'horas_extras_pc', periodo: PERIODO, filtros: { diretoria: 'Tecnologia' }, lente: 'gestor' },
  },
  {
    cobre: 'Diversidade · N3', pergunta: 'Onde está o gargalo?', esperadas: ['decompor', 'cruzar'],
    contexto: { indicador: 'mulheres_lideranca', periodo: PERIODO, lente: 'chro' },
  },
  {
    cobre: 'Retenção · N4', pergunta: 'Por que tantas pessoas saem no primeiro ano?', esperadas: ['drivers'],
    contexto: { indicador: 'early_attrition', periodo: PERIODO, filtros: { diretoria: 'Produtos & Plataforma' }, lente: 'chro' },
  },
  {
    cobre: 'Desenvolvimento · N5', pergunta: 'O que esse destaque significa para a retenção?', esperadas: ['drivers', 'comparar', 'decompor'],
    contexto: { indicador: 'mobilidade_interna', periodo: PERIODO, filtros: { diretoria: 'Financeiro & Risco' }, lente: 'chro' },
  },
  {
    cobre: 'Engajamento · N2', pergunta: 'O que está puxando o absenteísmo do meu time?', esperadas: ['sinais', 'serie', 'decompor'],
    contexto: { indicador: 'absenteismo', periodo: PERIODO, filtros: { diretoria: 'Tecnologia' }, lente: 'gestor' },
  },
  {
    cobre: 'Custo · L2', pergunta: 'Quanto o turnover custa e onde se concentra?', esperadas: ['impacto', 'decompor'],
    contexto: { indicador: 'custo_turnover', periodo: PERIODO, lente: 'ceo' },
  },
];

interface Linha {
  n: number;
  caso: Caso;
  m: MetricasAgente;
  ferramentas: string[];
  esperadaOk: boolean;
  blocos: BlocoVisualizacao[];
}

const s = (ms: number | null) => (ms === null ? '—' : (ms / 1000).toFixed(1).replace('.', ','));
/** 1 casa, truncada: 600/603 vira 99,5%, nunca "100%" */
const pct = (v: number, t: number) => (t === 0 ? '—' : `${(Math.floor((v / t) * 1000) / 10).toFixed(1).replace('.', ',')}%`);
function quantil(v: number[], q: number): number {
  const o = [...v].sort((a, b) => a - b);
  return o[Math.min(o.length - 1, Math.floor(q * o.length))];
}

async function main() {
  const provedores = provedoresDoAmbiente();
  if (provedores.length === 0) throw new Error('Sem chave de IA: rode com node --env-file=.env.local --import tsx.');
  const saida = process.argv.find(a => a.startsWith('--saida='))?.split('=')[1] ?? '.git/project-upgrade/fase2/avaliacao.md';
  const so = process.argv.find(a => a.startsWith('--so='))?.split('=')[1]?.split(',').map(Number);

  const raiz = process.cwd();
  const roster = JSON.parse(fs.readFileSync(path.join(raiz, 'lib/dados/servidor/roster.json'), 'utf8')) as Pessoa[];
  const eventos = JSON.parse(fs.readFileSync(path.join(raiz, 'lib/dados/servidor/eventos.json'), 'utf8')) as Eventos;
  const motor = criarMotor(construirFatos(roster, eventos.requisicoes), 'roster');
  const ambiente = { motor, motorSinais: motorCliente, log: () => {} };

  const linhas: Linha[] = [];
  for (const [i, caso] of CASOS.entries()) {
    if (so && !so.includes(i + 1)) continue;
    const blocos: BlocoVisualizacao[] = [];
    const m = await executarAgente(
      { mensagens: [{ papel: 'usuario', conteudo: caso.pergunta }], ...(caso.contexto ? { contexto: caso.contexto } : {}) },
      { ambiente, provedores, emitir: e => (e.tipo === 'bloco' ? blocos.push(e.bloco) : undefined), log: () => {} },
    );
    const ferramentas = m.ferramentas.map(f => (f.ok ? f.nome : `${f.nome}✗`));
    const esperadaOk = m.ferramentas.some(f => f.ok && (caso.esperadas as string[]).includes(f.nome));
    linhas.push({ n: i + 1, caso, m, ferramentas, esperadaOk, blocos });
    const v = m.verificacao;
    console.log(
      `${String(i + 1).padStart(2)} ${caso.contexto ? 'deep dive' : 'livre    '} ${esperadaOk ? '✓' : '✗'} números ${v ? `${v.verificados}/${v.total}` : '—'} · 1º texto ${s(m.latenciaPrimeiroTextoMs)} s · resposta ${s(m.latenciaRespostaMs)} s · total ${s(m.latenciaTotalMs)} s · ${ferramentas.join(', ')}${m.erro ? ` · ERRO ${m.erro}` : ''}`,
    );
  }

  const tot = linhas.reduce(
    (a, l) => ({ entrada: a.entrada + l.m.uso.entrada, cache: a.cache + l.m.uso.cacheEntrada, saida: a.saida + l.m.uso.saida, raciocinio: a.raciocinio + l.m.uso.raciocinio, v: a.v + (l.m.verificacao?.verificados ?? 0), t: a.t + (l.m.verificacao?.total ?? 0) }),
    { entrada: 0, cache: 0, saida: 0, raciocinio: 0, v: 0, t: 0 },
  );
  const custo = ((tot.entrada - tot.cache) * PRECO.entrada + tot.cache * PRECO.cache + tot.saida * PRECO.saida) / 1e6;
  const primeiros = linhas.map(l => l.m.latenciaPrimeiroTextoMs ?? l.m.latenciaTotalMs);
  const respostas = linhas.map(l => l.m.latenciaRespostaMs ?? l.m.latenciaTotalMs);
  const totais = linhas.map(l => l.m.latenciaTotalMs);
  const provedoresUsados = [...new Set(linhas.flatMap(l => l.m.provedores))].join(', ');

  const md: string[] = [
    `# Avaliação do agente (fase 2) — ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    '',
    `Modelo: ${provedores.map(p => `${p.nome}:${p.modelo}`).join(' → ')} (provedores que responderam: ${provedoresUsados}). Perguntas: ${linhas.length} (${linhas.filter(l => l.caso.contexto).length} deep dives com contexto).`,
    '',
    '## Resumo',
    '',
    `- Tool esperada apareceu: ${linhas.filter(l => l.esperadaOk).length}/${linhas.length}`,
    `- Números verificados pela guarda: ${tot.v}/${tot.t} (${pct(tot.v, tot.t)}); respostas com 100%: ${linhas.filter(l => l.m.verificacao && l.m.verificacao.verificados === l.m.verificacao.total).length}/${linhas.length}`,
    `- Latência até o 1º texto: mediana ${s(quantil(primeiros, 0.5))} s · p90 ${s(quantil(primeiros, 0.9))} s · máx ${s(Math.max(...primeiros))} s`,
    `- Latência até a resposta final começar: mediana ${s(quantil(respostas, 0.5))} s · p90 ${s(quantil(respostas, 0.9))} s · máx ${s(Math.max(...respostas))} s`,
    `- Latência total: mediana ${s(quantil(totais, 0.5))} s · p90 ${s(quantil(totais, 0.9))} s · máx ${s(Math.max(...totais))} s`,
    `- Tokens: entrada ${tot.entrada} (cache ${tot.cache}) · saída ${tot.saida} · raciocínio ${tot.raciocinio} · custo estimado ≤ US$ ${custo.toFixed(4)} (preço de pico)`,
    `- Erros: ${linhas.filter(l => l.m.erro).length}`,
    '',
    '## Por pergunta',
    '',
    '| # | Tipo | Cobre | Pergunta | Tools | Esperada | Números | 1º texto | Resposta | Total | Tokens (entrada/cache/saída) |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...linhas.map(l => {
      const v = l.m.verificacao;
      return `| ${l.n} | ${l.caso.contexto ? 'deep dive' : 'livre'} | ${l.caso.cobre} | ${l.caso.pergunta} | ${l.ferramentas.join(', ')} | ${l.esperadaOk ? '✓' : `✗ (${l.caso.esperadas.join('/')})`} | ${v ? `${v.verificados}/${v.total} (${pct(v.verificados, v.total)})` : '—'} | ${s(l.m.latenciaPrimeiroTextoMs)} s | ${s(l.m.latenciaRespostaMs)} s | ${s(l.m.latenciaTotalMs)} s | ${l.m.uso.entrada}/${l.m.uso.cacheEntrada}/${l.m.uso.saida} |`;
    }),
    '',
    '## Erros de tools (devolvidos ao modelo)',
    '',
    ...(linhas.some(l => l.m.ferramentas.some(f => f.erro))
      ? linhas.flatMap(l => l.m.ferramentas.filter(f => f.erro).map(f => `- #${l.n} ${f.nome}: ${f.erro}`))
      : ['Nenhum.']),
    '',
    '## Números não verificados',
    '',
    ...(linhas.some(l => l.m.verificacao?.naoVerificados.length)
      ? linhas.flatMap(l => (l.m.verificacao?.naoVerificados.length ? [`- #${l.n}: ${l.m.verificacao.naoVerificados.map(n => `"${n.texto}"`).join(', ')}`] : []))
      : ['Nenhum.']),
    '',
    '## Respostas',
    '',
    ...linhas.flatMap(l => [
      `### ${l.n}. ${l.caso.pergunta}`,
      '',
      ...(l.caso.contexto ? [`Contexto: \`${JSON.stringify(l.caso.contexto)}\``, ''] : []),
      `Tools: ${l.ferramentas.join(', ')} · blocos: ${l.blocos.map(b => `${b.tipo} "${b.titulo}"`).join('; ') || 'nenhum'} · rodadas: ${l.m.rodadas}`,
      '',
      l.m.erro ? `ERRO: ${l.m.erro}` : l.m.texto,
      '',
    ]),
  ];
  fs.mkdirSync(path.dirname(saida), { recursive: true });
  fs.writeFileSync(saida, md.join('\n'));
  console.log(`\n${md.slice(4, 13).join('\n')}\n\nRelatório: ${saida}`);
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
