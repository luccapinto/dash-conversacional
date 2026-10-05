/**
 * O gerador é determinístico: duas execuções produzem bytes idênticos, e os arquivos
 * commitados em lib/dados são exatamente a saída do gerador atual.
 */

import { describe, expect, it } from 'vitest';
import { gerar } from '@/scripts/sim/gerar';
import { lerTexto } from './carregar';

describe('gerador', () => {
  it('duas execuções produzem os mesmos bytes, iguais aos arquivos commitados', () => {
    const a = gerar().arquivos;
    const b = gerar().arquivos;
    expect(Object.keys(a).sort()).toEqual(['lib/dados/cliente/cubo.json', 'lib/dados/servidor/eventos.json', 'lib/dados/servidor/roster.json']);
    for (const arquivo of Object.keys(a)) {
      expect(a[arquivo] === b[arquivo], `${arquivo} mudou entre execuções`).toBe(true);
      expect(a[arquivo] === lerTexto(arquivo), `${arquivo} commitado está desatualizado: rode npx tsx scripts/generate-data.ts`).toBe(true);
    }
  }, 180_000);
});
