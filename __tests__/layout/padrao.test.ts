/**
 * Layouts e títulos pré-gerados (lib/dados/cliente/layouts.json e destaques.json): cobrem as
 * combinações padrão, cada spec e cada título ainda passam pela validação e pela guarda contra os
 * sinais atuais (se os dados ou o detector mudarem, o teste pede para regenerar) e os dois
 * arquivos juntos cabem no orçamento do client.
 */

import * as fs from 'fs';
import * as path from 'path';
import { gzipSync } from 'zlib';
import { describe, expect, it } from 'vitest';
import { motorCliente } from '@/lib/analytics/cliente';
import { DIRETORIAS, MES_FIM } from '@/lib/analytics/dominio';
import { LAYOUTS_PADRAO, layoutPadrao } from '@/lib/layout/padrao';
import { chaveLayout, COMBINACOES_PADRAO, sinaisDoRecorte, validarLayout } from '@/lib/layout/spec';
import { conferirTitulo, entradaTitulos } from '@/lib/layout/titulos';
import { chaveDestaques, DESTAQUES_IA } from '@/lib/painel/destaques';
import { periodoSinais } from '@/lib/painel/periodos';

const DADOS = path.resolve(__dirname, '..', '..', 'lib/dados/cliente');
const LIMITE_GZIP = 60 * 1024;

describe('layouts pré-gerados', () => {
  it('um spec por combinação padrão, na chave certa', () => {
    expect(Object.keys(LAYOUTS_PADRAO.layouts).sort()).toEqual(COMBINACOES_PADRAO.map(chaveLayout).sort());
    for (const r of COMBINACOES_PADRAO) expect(layoutPadrao(r)?.recorte).toEqual(r);
  });

  it('todo spec é válido contra os sinais atuais (senão: rode scripts/generate-layouts.ts)', () => {
    for (const r of COMBINACOES_PADRAO) expect(validarLayout(layoutPadrao(r), sinaisDoRecorte(motorCliente, r)), chaveLayout(r)).toEqual([]);
  });

  it(`layouts + títulos cabem em ${LIMITE_GZIP / 1024} KB gzip`, () => {
    const gz = ['layouts.json', 'destaques.json'].reduce((s, a) => s + gzipSync(fs.readFileSync(path.join(DADOS, a)), { level: 9 }).length, 0);
    expect(gz).toBeLessThan(LIMITE_GZIP);
  });
});

describe('títulos pré-gerados', () => {
  const recortes = [null, ...DIRETORIAS].map(d => ({ diretoria: d, chave: chaveDestaques(periodoSinais(MES_FIM), d) }));

  it('só recortes padrão; todo título passa pela guarda contra a entrada atual (senão: rode scripts/generate-destaques.ts)', () => {
    expect(recortes.map(r => r.chave)).toEqual(expect.arrayContaining(Object.keys(DESTAQUES_IA.recortes)));
    for (const { diretoria, chave } of recortes) {
      const titulos = DESTAQUES_IA.recortes[chave] ?? {};
      const entrada = Object.fromEntries(entradaTitulos(motorCliente, diretoria).map(e => [e.indicador, e]));
      for (const [id, titulo] of Object.entries(titulos)) {
        expect(entrada[id], `${chave} · ${id}: indicador fora do painel`).toBeDefined();
        expect(conferirTitulo(titulo, entrada[id]), `${chave} · ${id}`).toBeNull();
      }
    }
  });
});
