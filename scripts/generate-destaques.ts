#!/usr/bin/env npx tsx
/**
 * generate-destaques.ts
 *
 * Pré-gera o título narrativo de cada indicador visível para o recorte padrão (Set/26, empresa toda
 * e as 6 diretorias) e grava lib/dados/cliente/destaques.json, que a página do indicador importa
 * (lib/painel/destaques.ts). Guarda bloqueante por título (lib/layout/titulos.ts): o que tiver
 * número fora da frase determinística e dos sinais do indicador é descartado.
 *
 *   node --env-file=.env.local --import tsx scripts/generate-destaques.ts            # com IA
 *   node --env-file=.env.local --import tsx scripts/generate-destaques.ts --limite=1 # amostra, não grava
 *
 * Custo estimado com o preço de pico da DeepSeek (teto), como em generate-layouts.ts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { gzipSync } from 'zlib';
import { motorCliente } from '../lib/analytics/cliente';
import { DIRETORIAS } from '../lib/analytics/dominio';
import { provedoresDoAmbiente } from '../lib/agente/llm';
import { gerarTitulos, type ResultadoTitulos } from '../lib/layout/titulos';
import type { ArquivoDestaques } from '../lib/painel/destaques';
import { IDS_PAINEL } from '../lib/painel/indicadores';

const DESTINO = path.join(process.cwd(), 'lib/dados/cliente/destaques.json');
const CONCORRENCIA = 3;
const PRECO = { entrada: 0.3, cache: 0.006, saida: 1.2 };

async function main() {
  const limite = Number(process.argv.find(a => a.startsWith('--limite='))?.split('=')[1] ?? 0);
  const provedores = provedoresDoAmbiente();
  if (provedores.length === 0) throw new Error('Sem chave de IA no ambiente: rode com --env-file=.env.local.');
  const recortes = [null, ...DIRETORIAS].slice(0, limite > 0 ? limite : undefined);

  const inicio = Date.now();
  const resultados: ResultadoTitulos[] = new Array(recortes.length);
  let proximo = 0;
  const log = (l: string) => {
    if (!l.startsWith('[llm]')) console.log(l);
  };
  await Promise.all(
    Array.from({ length: CONCORRENCIA }, async () => {
      while (proximo < recortes.length) {
        const i = proximo++;
        const r = (resultados[i] = await gerarTitulos(recortes[i], { motor: motorCliente, provedores, log }));
        console.log(`${i + 1}/${recortes.length} ${r.chave.padEnd(34)} ${Object.keys(r.titulos).length}/${IDS_PAINEL.length} títulos · ${r.descartados.length} descartados${r.motivo ? ` · ${r.motivo}` : ''} · ${r.latenciaMs} ms`);
      }
    }),
  );

  const uso = resultados.reduce((s, r) => ({ entrada: s.entrada + (r.uso?.entrada ?? 0), cache: s.cache + (r.uso?.cacheEntrada ?? 0), saida: s.saida + (r.uso?.saida ?? 0) }), { entrada: 0, cache: 0, saida: 0 });
  const custo = ((uso.entrada - uso.cache) * PRECO.entrada + uso.cache * PRECO.cache + uso.saida * PRECO.saida) / 1e6;
  const aceitos = resultados.reduce((s, r) => s + Object.keys(r.titulos).length, 0);
  const descartados = resultados.flatMap(r => r.descartados.map(d => `${r.chave} · ${d.indicador}: "${d.titulo}" (${d.motivo})`));

  console.log(`\n${resultados.length} recortes · ${aceitos}/${resultados.length * IDS_PAINEL.length} títulos aceitos · ${descartados.length} tentativas descartadas pela guarda · ${((Date.now() - inicio) / 1000).toFixed(0)} s`);
  console.log(`tokens: entrada ${uso.entrada} (cache ${uso.cache}) · saída ${uso.saida} · custo estimado ≤ US$ ${custo.toFixed(4)}`);
  if (descartados.length) console.log(`descartados:\n  ${descartados.join('\n  ')}`);

  if (limite > 0) {
    console.log('\n--limite: amostra, nada gravado. Títulos:\n', JSON.stringify(resultados[0].titulos, null, 1));
    return;
  }
  const provedor = resultados.find(r => r.provedor)?.provedor;
  const arquivo: ArquivoDestaques = {
    geradoEm: new Date().toISOString(),
    modelo: provedor ? `${provedor}:${provedores.find(p => p.nome === provedor)!.modelo}` : null,
    recortes: Object.fromEntries(resultados.filter(r => Object.keys(r.titulos).length).map(r => [r.chave, r.titulos])),
  };
  const conteudo = `${JSON.stringify(arquivo)}\n`;
  fs.writeFileSync(DESTINO, conteudo);
  console.log(`\n${path.relative(process.cwd(), DESTINO)}: ${(Buffer.byteLength(conteudo) / 1024).toFixed(0)} KB, gzip ${(gzipSync(conteudo, { level: 9 }).length / 1024).toFixed(1)} KB`);
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
