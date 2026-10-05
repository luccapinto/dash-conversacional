/**
 * Isolamento e orçamento de dados do client.
 *
 * Percorre o grafo de imports estáticos a partir de todo módulo de lib/analytics que o client
 * pode importar e verifica que (1) nenhum chega ao roster/eventos nem ao motor do servidor e
 * (2) os JSON alcançados somam menos de 150 KB gzip.
 */

import * as fs from 'fs';
import * as path from 'path';
import { gzipSync } from 'zlib';
import { describe, expect, it } from 'vitest';

const RAIZ = path.resolve(__dirname, '..', '..');
const LIMITE_GZIP = 150 * 1024;
const ENTRADAS_CLIENT = ['cliente.ts', 'signals.ts', 'schemas.ts', 'engine.ts', 'catalog.ts', 'fatos.ts', 'dominio.ts']
  .map(f => path.join(RAIZ, 'lib/analytics', f));

function resolver(de: string, alvo: string): string | null {
  const base = alvo.startsWith('@/') ? path.join(RAIZ, alvo.slice(2)) : alvo.startsWith('.') ? path.resolve(path.dirname(de), alvo) : null;
  if (base === null) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  throw new Error(`import não resolvido: ${alvo} em ${de}`);
}

function grafo(entradas: string[]): { modulos: Set<string>; pacotes: Set<string> } {
  const modulos = new Set<string>();
  const pacotes = new Set<string>();
  const fila = [...entradas];
  while (fila.length) {
    const arquivo = fila.pop()!;
    if (modulos.has(arquivo)) continue;
    modulos.add(arquivo);
    if (arquivo.endsWith('.json')) continue;
    const fonte = fs.readFileSync(arquivo, 'utf8');
    // imports de tipo somem na compilação e não entram no bundle
    const re = /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
    for (const m of fonte.matchAll(re)) {
      const destino = resolver(arquivo, m[1]);
      if (destino) fila.push(destino);
      else pacotes.add(m[1]);
    }
  }
  return { modulos, pacotes };
}

describe('dados no client', () => {
  const { modulos, pacotes } = grafo(ENTRADAS_CLIENT);
  const relativos = [...modulos].map(m => path.relative(RAIZ, m)).sort();
  const jsons = relativos.filter(m => m.endsWith('.json'));

  it('nenhum módulo do client alcança o roster, os eventos ou o motor do servidor', () => {
    expect(relativos.some(m => m.startsWith('lib/dados/servidor/'))).toBe(false);
    expect(relativos).not.toContain('lib/analytics/servidor.ts');
    expect(pacotes.has('server-only')).toBe(false);
    expect(jsons).toEqual(['lib/dados/cliente/cubo.json']);
  });

  it('o motor do servidor é marcado como server-only (o build do Next falha se o client importar)', () => {
    const fonte = fs.readFileSync(path.join(RAIZ, 'lib/analytics/servidor.ts'), 'utf8');
    expect(fonte).toMatch(/^import 'server-only';$/m);
  });

  it(`os dados importados pelo client somam menos de ${LIMITE_GZIP / 1024} KB gzip`, () => {
    const total = jsons.reduce((s, j) => s + gzipSync(fs.readFileSync(path.join(RAIZ, j)), { level: 9 }).length, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(LIMITE_GZIP);
  });
});
