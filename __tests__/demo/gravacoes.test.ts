/**
 * Gravações do modo demonstração: public/demo/<id>.json (uma por resposta) e o índice leve
 * lib/dados/cliente/demo.json contra o roteiro (lib/demo/roteiro.ts).
 *
 * Confere que todas existem e batem com o índice, que a guarda conferiu 100% dos números de cada
 * texto, que nada de pessoa vai ao navegador, que recorte suprimido não leva valor e que o arquivo
 * commitado é o que o roteiro grava hoje (dados ou texto mudaram → `npm run gravar-demo`).
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { CATALOGO } from '@/lib/analytics/catalog';
import { motorCliente } from '@/lib/analytics/cliente';
import { ESTRUTURA } from '@/lib/analytics/dominio';
import { MIN_AMOSTRA } from '@/lib/analytics/engine';
import { motorServidor } from '@/lib/analytics/servidor';
import type { BlocoVisualizacao, EventoAgente } from '@/lib/agente/contrato';
import { P12 } from '@/lib/demo/consultas';
import { gravar, itemDoIndice } from '@/lib/demo/gravar';
import { ROTEIRO, validarRoteiro } from '@/lib/demo/roteiro';
import type { GravacaoDemo, IndiceDemo } from '@/lib/demo/tipos';
import { layoutPadrao } from '@/lib/layout/padrao';
import { lerJson } from '../analytics/carregar';

const RAIZ = path.resolve(__dirname, '..', '..');
const PASTA = path.join(RAIZ, 'public/demo');
const AVISO = `amostra insuficiente (menos de ${MIN_AMOSTRA} pessoas) — valor não divulgado`;

const indice = lerJson<IndiceDemo>('lib/dados/cliente/demo.json');
const arquivos = fs.readdirSync(PASTA).filter(a => a.endsWith('.json')).sort();
const gravacoes = arquivos.map(a => lerJson<GravacaoDemo>(`public/demo/${a}`));

/** Campos do roster e dos eventos que identificam ou descrevem uma pessoa (`gestores` fica de fora: no rastreio é a contagem agregada do span) */
const CAMPOS_DE_PESSOA: Record<string, true> = { pessoa: true, nascimento: true, admissao: true, historico: true, mensal: true, salario: true, cargo: true, ocupante: true, desligamento: true, tempoDeCasaMeses: true };
const NOMES = Object.values(ESTRUTURA).flatMap(d => [d.diretor, ...d.especialidades.map(e => e.superintendente)]);

function chaves(x: unknown, saida: string[] = []): string[] {
  if (Array.isArray(x)) for (const v of x) chaves(v, saida);
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) saida.push(k), chaves(v, saida);
  return saida;
}

/**
 * Indicador cuja amostra é de pessoas: recorte abaixo do mínimo sai sem valor, n nem composição.
 * Contagem de vagas ou ofertas pequena é só "amostra pequena" e mostra o número.
 */
function vazamentos(b: BlocoVisualizacao): string[] {
  if (!CATALOGO[b.indicador].amostra.pessoas) return [];
  const lados = (r: string, x: { valor: number | null; n: number | null; amostraSuficiente: boolean }) => (!x.amostraSuficiente && (x.valor !== null || x.n !== null) ? [`${b.id} ${r}`] : []);
  switch (b.tipo) {
    case 'kpi':
      return lados('kpi', b);
    case 'serie':
      return b.pontos.flatMap(p => lados(p.rotulo, p));
    case 'barras':
      return b.barras.flatMap(x => lados(x.rotulo, x).concat(!x.amostraSuficiente && x.composicao !== null ? [`${b.id} ${x.rotulo} composição`] : []));
    case 'comparacao':
      return [...lados('a', b.a), ...lados('b', b.b), ...((!b.a.amostraSuficiente || !b.b.amostraSuficiente) && b.diferenca !== null ? [`${b.id} diferença`] : [])];
    case 'tabela':
      // linha suprimida: o aviso do bloco e nenhum número na linha
      return b.linhas.filter(l => l.n === null && Object.entries(l).some(([k, v]) => k !== 'segmento' && typeof v === 'number')).map(l => `${b.id} ${String(l.segmento)}`);
  }
}

const blocos = (eventos: readonly EventoAgente[]) => eventos.flatMap(e => (e.tipo === 'bloco' ? [e.bloco] : []));

describe('roteiro e índice', () => {
  it('o roteiro passa nas regras (ids, continuações, 2 perguntas por indicador do painel)', () => {
    expect(validarRoteiro(ROTEIRO)).toEqual([]);
  });

  it('o índice é o do roteiro e cada item tem a sua gravação, sem arquivo sobrando', () => {
    expect(indice).toEqual({ itens: ROTEIRO.map(itemDoIndice) });
    expect(arquivos).toEqual(indice.itens.map(i => `${i.id}.json`).sort());
    for (const g of gravacoes) {
      const item = indice.itens.find(i => i.id === g.id);
      expect(item, g.id).toBeDefined();
      expect({ pergunta: g.pergunta, recorte: g.recorte }, g.id).toEqual({ pergunta: item!.pergunta, recorte: item!.recorte });
    }
  });

  it('cada pergunta sugerida do resumo no recorte padrão (Geral, Set/26) tem gravação na sua lente', () => {
    for (const lente of ['ceo', 'chro', 'gestor'] as const) {
      const perguntas = layoutPadrao({ periodo: P12, diretoria: null, lente })?.deepDives.map(d => d.pergunta) ?? [];
      expect(perguntas.length, lente).toBeGreaterThan(0);
      for (const p of perguntas) expect(indice.itens.some(i => i.grupo === 'resumo' && i.pergunta === p && i.lentes?.includes(lente)), `${lente}: ${p}`).toBe(true);
    }
  });
});

describe('cada gravação', () => {
  it('termina com a guarda conferindo 100% dos números do texto, sem erro nem passo falho', () => {
    for (const g of gravacoes) {
      const fim = g.eventos.at(-1);
      expect(fim?.tipo, g.id).toBe('fim');
      if (fim?.tipo !== 'fim') continue;
      expect(fim.verificacao.total, g.id).toBeGreaterThan(0);
      expect(fim.verificacao.naoVerificados, g.id).toEqual([]);
      expect(fim.verificacao.verificados, g.id).toBe(fim.verificacao.total);
      expect(g.eventos.some(e => e.tipo === 'erro' || (e.tipo === 'passo' && e.estado === 'erro')), g.id).toBe(false);
      expect(blocos(g.eventos).length, g.id).toBeGreaterThan(0);
    }
  });

  it('não leva campo, id nem nome de pessoa', () => {
    for (const g of gravacoes) {
      expect(chaves(g).filter(k => CAMPOS_DE_PESSOA[k]), g.id).toEqual([]);
      const json = JSON.stringify(g);
      expect(json, g.id).not.toMatch(/\b[VR]\d{5}\b/);
      for (const nome of NOMES) expect(json.includes(nome), `${g.id}: ${nome}`).toBe(false);
    }
  });

  it('recorte de pessoas abaixo do mínimo sai sem valor e com o aviso; todo n que sobra é ≥ mínimo', () => {
    for (const g of gravacoes) {
      for (const b of blocos(g.eventos)) {
        expect(vazamentos(b), g.id).toEqual([]);
        if (!CATALOGO[b.indicador].amostra.pessoas) continue;
        const json = JSON.stringify(b);
        if (json.includes('"amostraSuficiente":false')) expect(b.aviso, `${g.id} ${b.id}`).toBe(AVISO);
        for (const [, n] of json.matchAll(/"n":(\d+(?:\.\d+)?)/g)) expect(Number(n), `${g.id} ${b.id}`).toBeGreaterThanOrEqual(MIN_AMOSTRA);
      }
    }
  });

  it('o arquivo commitado é o que o roteiro grava hoje', async () => {
    const ambiente = { motor: motorServidor(), motorSinais: motorCliente, log: () => {} };
    for (const e of ROTEIRO) {
      const r = await gravar(e, ambiente);
      expect(r.problemas, e.id).toEqual([]);
      expect(`${JSON.stringify(r.gravacao)}\n` === fs.readFileSync(path.join(PASTA, `${e.id}.json`), 'utf8'), `${e.id} desatualizada: rode npm run gravar-demo`).toBe(true);
    }
  }, 120_000);
});
