#!/usr/bin/env npx tsx
/**
 * generate-layouts.ts
 *
 * Pré-gera o layout spec de cada combinação padrão (períodos × Geral + 6 diretorias × 3 lentes)
 * e grava lib/dados/cliente/layouts.json, que o client importa (lib/layout/padrao.ts). Cada spec
 * passa pela validação e pela guarda de números; o que a IA errar vira layout determinístico.
 *
 *   node --env-file=.env.local --import tsx scripts/generate-layouts.ts            # com IA
 *   node --env-file=.env.local --import tsx scripts/generate-layouts.ts --limite=2 # amostra, não grava
 *   npx tsx scripts/generate-layouts.ts --sem-ia                                    # só determinístico
 *
 * Custo estimado com o preço de pico da DeepSeek (teto): entrada US$ 0,30/M (cache US$ 0,006/M),
 * saída US$ 1,20/M.
 */

import * as fs from 'fs';
import * as path from 'path';
import { gzipSync } from 'zlib';
import { motorCliente } from '../lib/analytics/cliente';
import { provedoresDoAmbiente } from '../lib/agente/llm';
import { gerarLayout, type ResultadoLayout } from '../lib/layout/gerador';
import type { ArquivoLayouts } from '../lib/layout/padrao';
import { chaveLayout, COMBINACOES_PADRAO } from '../lib/layout/spec';

const DESTINO = path.join(process.cwd(), 'lib/dados/cliente/layouts.json');
const CONCORRENCIA = 4;
const PRECO = { entrada: 0.3, cache: 0.006, saida: 1.2 };

async function main() {
  const semIa = process.argv.includes('--sem-ia');
  const limite = Number(process.argv.find(a => a.startsWith('--limite='))?.split('=')[1] ?? 0);
  const provedores = semIa ? [] : provedoresDoAmbiente();
  if (!semIa && provedores.length === 0) throw new Error('Sem chave de IA no ambiente: rode com --env-file=.env.local ou use --sem-ia.');
  const combinacoes = limite > 0 ? COMBINACOES_PADRAO.slice(0, limite) : COMBINACOES_PADRAO;

  const inicio = Date.now();
  const resultados: ResultadoLayout[] = new Array(combinacoes.length);
  let proximo = 0;
  const log = (l: string) => {
    if (!l.startsWith('[llm]')) console.log(l);
  };
  await Promise.all(
    Array.from({ length: CONCORRENCIA }, async () => {
      while (proximo < combinacoes.length) {
        const i = proximo++;
        resultados[i] = await gerarLayout(combinacoes[i], { motor: motorCliente, provedores, log });
        const r = resultados[i];
        console.log(`${String(i + 1).padStart(2)}/${combinacoes.length} ${chaveLayout(combinacoes[i]).padEnd(48)} ${r.spec.origem.padEnd(14)} ${r.latenciaMs} ms`);
      }
    }),
  );

  const uso = resultados.reduce((s, r) => ({ entrada: s.entrada + (r.uso?.entrada ?? 0), cache: s.cache + (r.uso?.cacheEntrada ?? 0), saida: s.saida + (r.uso?.saida ?? 0) }), { entrada: 0, cache: 0, saida: 0 });
  const custo = ((uso.entrada - uso.cache) * PRECO.entrada + uso.cache * PRECO.cache + uso.saida * PRECO.saida) / 1e6;
  const ia = resultados.filter(r => r.spec.origem === 'ia').length;
  const motivos = resultados.filter(r => r.motivo).map(r => `${r.spec.chave}: ${r.motivo}`);

  console.log(`\n${resultados.length} combinações · IA ${ia} · determinístico ${resultados.length - ia} · ${((Date.now() - inicio) / 1000).toFixed(0)} s`);
  console.log(`tokens: entrada ${uso.entrada} (cache ${uso.cache}) · saída ${uso.saida} · custo estimado ≤ US$ ${custo.toFixed(4)}`);
  if (motivos.length) console.log(`fallbacks:\n  ${motivos.join('\n  ')}`);

  if (limite > 0) {
    console.log('\n--limite: amostra, nada gravado. Primeiro spec:\n', JSON.stringify(resultados[0].spec, null, 1));
    return;
  }
  const provedor = resultados.find(r => r.provedor)?.provedor;
  const arquivo: ArquivoLayouts = {
    geradoEm: new Date().toISOString(),
    modelo: provedor ? `${provedor}:${provedores.find(p => p.nome === provedor)!.modelo}` : null,
    layouts: Object.fromEntries(resultados.map(r => [r.spec.chave, r.spec])),
  };
  const conteudo = `${JSON.stringify(arquivo)}\n`;
  fs.writeFileSync(DESTINO, conteudo);
  console.log(`\n${path.relative(process.cwd(), DESTINO)}: ${(Buffer.byteLength(conteudo) / 1024).toFixed(0)} KB, gzip ${(gzipSync(conteudo, { level: 9 }).length / 1024).toFixed(1)} KB`);
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
