/**
 * Layouts pré-gerados (lib/dados/cliente/layouts.json): cobrem todas as combinações padrão, cada
 * spec ainda é válido contra os sinais atuais (se os dados ou o detector mudarem, o teste pede para
 * regenerar) e o arquivo cabe no orçamento do client.
 */

import * as fs from 'fs';
import * as path from 'path';
import { gzipSync } from 'zlib';
import { describe, expect, it } from 'vitest';
import { motorCliente } from '@/lib/analytics/cliente';
import { LAYOUTS_PADRAO, layoutPadrao } from '@/lib/layout/padrao';
import { chaveLayout, COMBINACOES_PADRAO, sinaisDoRecorte, validarLayout } from '@/lib/layout/spec';

const ARQUIVO = path.resolve(__dirname, '..', '..', 'lib/dados/cliente/layouts.json');
const LIMITE_GZIP = 60 * 1024;

describe('layouts pré-gerados', () => {
  it('um spec por combinação padrão, na chave certa', () => {
    expect(Object.keys(LAYOUTS_PADRAO.layouts).sort()).toEqual(COMBINACOES_PADRAO.map(chaveLayout).sort());
    for (const r of COMBINACOES_PADRAO) expect(layoutPadrao(r)?.recorte).toEqual(r);
  });

  it('todo spec é válido contra os sinais atuais (senão: rode scripts/generate-layouts.ts)', () => {
    for (const r of COMBINACOES_PADRAO) expect(validarLayout(layoutPadrao(r), sinaisDoRecorte(motorCliente, r)), chaveLayout(r)).toEqual([]);
  });

  it(`cabe em ${LIMITE_GZIP / 1024} KB gzip`, () => {
    const gz = gzipSync(fs.readFileSync(ARQUIVO), { level: 9 }).length;
    expect(gz).toBeLessThan(LIMITE_GZIP);
  });
});
