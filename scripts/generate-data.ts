#!/usr/bin/env npx tsx
/**
 * generate-data.ts
 *
 * Gera o dataset sintético da Verta S.A. (corretora de investimentos fictícia), Out/2023 a
 * Set/2026, com seed fixa. Rodar duas vezes produz bytes idênticos.
 *
 *   npx tsx scripts/generate-data.ts
 *
 * Simulação: scripts/sim/simular.ts · calibração e histórias: scripts/sim/calibracao.ts ·
 * narrativa: docs/narrativa.md · convenções de tempo: lib/analytics/dominio.ts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { gzipSync } from 'zlib';
import { gerar } from './sim/gerar';

const { pessoas, eventos, arquivos } = gerar();

for (const [relativo, conteudo] of Object.entries(arquivos)) {
  const destino = path.join(process.cwd(), relativo);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, conteudo);
  const bruto = Buffer.byteLength(conteudo);
  const gz = gzipSync(conteudo, { level: 9 }).length;
  console.log(`${relativo.padEnd(34)} ${(bruto / 1024).toFixed(0).padStart(6)} KB  gzip ${(gz / 1024).toFixed(0).padStart(5)} KB`);
}

const ativas = pessoas.filter(p => p.desligamento === null).length;
const vol = eventos.desligamentos.filter(d => d.tipo === 'voluntário').length;
console.log(`\nPessoas no roster: ${pessoas.length} (ativas em Set/2026: ${ativas})`);
console.log(`Admissões ${eventos.admissoes.length} · desligamentos ${eventos.desligamentos.length} (voluntários ${(vol / eventos.desligamentos.length * 100).toFixed(1)}%)`);
console.log(`Promoções ${eventos.promocoes.length} · movimentações ${eventos.movimentacoes.length} · vagas ${eventos.requisicoes.length}`);
