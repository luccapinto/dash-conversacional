/**
 * Orçamento de JS da primeira carga, por rota, depois de `npm run build`.
 *
 * Primeira carga = rootMainFiles + polyfills do build-manifest + todos os chunks de entrada do
 * client-reference-manifest da rota (layout, loading, error, not-found e página). Conta os
 * polyfills mesmo que navegador moderno não os baixe (nomodule): o número é o pior caso.
 * Tamanho em gzip (nível padrão do zlib). Falha acima de LIMITE_KB em qualquer rota.
 *
 *   npm run orcamento
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { runInNewContext } from 'node:vm';
import { gzipSync } from 'node:zlib';

const LIMITE_KB = 400;
const NEXT = join(process.cwd(), '.next');
const APP = join(NEXT, 'server', 'app');
const MANIFESTO = 'page_client-reference-manifest.js';

if (!existsSync(join(NEXT, 'build-manifest.json'))) {
  console.error('Sem build: rode `npm run build` antes.');
  process.exit(1);
}

const build: { rootMainFiles: string[]; polyfillFiles: string[] } = JSON.parse(readFileSync(join(NEXT, 'build-manifest.json'), 'utf8'));

function manifestos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const caminho = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'api' && dir === APP ? [] : manifestos(caminho);
    return e.name === MANIFESTO ? [caminho] : [];
  });
}

const gzip: Record<string, number> = {};
const tamanho = (arquivo: string) => (gzip[arquivo] ??= gzipSync(readFileSync(join(NEXT, arquivo))).length);

const linhas = manifestos(APP).map(caminho => {
  const pasta = relative(APP, caminho).split(sep).slice(0, -1).join('/');
  const chave = `/${pasta ? `${pasta}/` : ''}page`;
  const ctx: { globalThis: { __RSC_MANIFEST?: Record<string, { entryJSFiles: Record<string, string[]> }> } } = { globalThis: {} };
  runInNewContext(readFileSync(caminho, 'utf8'), ctx);
  const entradas = ctx.globalThis.__RSC_MANIFEST?.[chave]?.entryJSFiles;
  if (!entradas) throw new Error(`${caminho}: sem entryJSFiles para ${chave}`);
  const arquivos = [...new Set([...build.rootMainFiles, ...build.polyfillFiles, ...Object.values(entradas).flat()])];
  const kb = arquivos.reduce((s, a) => s + tamanho(a), 0) / 1024;
  return { rota: `/${pasta}`, arquivos: arquivos.length, kb };
});

linhas.sort((a, b) => a.rota.localeCompare(b.rota));
const largura = Math.max(...linhas.map(l => l.rota.length));
console.log(`JS da primeira carga (gzip), limite ${LIMITE_KB} KB por rota\n`);
for (const l of linhas) console.log(`${l.kb > LIMITE_KB ? '✗' : '✓'} ${l.rota.padEnd(largura)}  ${l.kb.toFixed(1).padStart(6)} KB  (${l.arquivos} arquivos)`);

const estouradas = linhas.filter(l => l.kb > LIMITE_KB);
if (estouradas.length) {
  console.error(`\n${estouradas.length} rota(s) acima de ${LIMITE_KB} KB.`);
  process.exit(1);
}
