/**
 * Blocos de visualização montados pelo SERVIDOR a partir dos resultados das tools. O modelo só
 * escolhe qual resultado (id r1, r2…) e, opcionalmente, o tipo; números, título e rastreio vêm do
 * resultado do motor. Id estável: hash da consulta resolvida + tipo, para "fixar no painel".
 */

import { CATALOGO } from '@/lib/analytics/catalog';
import type {
  Periodo,
  Rastreio,
  ResultadoComparar,
  ResultadoCruzar,
  ResultadoDecompor,
  ResultadoDrivers,
  ResultadoImpacto,
  ResultadoSerie,
  ResultadoValor,
} from '@/lib/analytics/engine';
import { DESCRICAO_DIMENSAO, type Filtros } from '@/lib/analytics/fatos';
import type { BlocoVisualizacao, ColunaTabela, DimensaoRecorte, NomeFerramenta, TipoBloco } from './contrato';
import { descreverRecorte, rotuloSegmento } from './rotulos';

export class ErroBloco extends Error {
  override name = 'ErroBloco';
}

/** Tipos aceitos por ferramenta; o primeiro é o padrão */
export const TIPOS_POR_FERRAMENTA: Partial<Record<NomeFerramenta, readonly TipoBloco[]>> = {
  valor: ['kpi'],
  impacto: ['kpi'],
  serie: ['serie', 'tabela'],
  decompor: ['barras', 'tabela'],
  cruzar: ['tabela'],
  comparar: ['comparacao'],
  drivers: ['tabela'],
};

export interface ResultadoVisualizavel {
  id: string;
  ferramenta: NomeFerramenta;
  dados: unknown;
}

/** JSON com chaves ordenadas: a mesma consulta dá o mesmo texto, qualquer que seja a ordem dos argumentos */
function jsonCanonico(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(jsonCanonico).join(',')}]`;
  if (x && typeof x === 'object') {
    const entradas = Object.entries(x).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entradas.map(([k, v]) => `${JSON.stringify(k)}:${jsonCanonico(v)}`).join(',')}}`;
  }
  return JSON.stringify(x);
}

/** FNV-1a de 32 bits em base 36 */
function hash(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const NOME_GRANULARIDADE = { mes: 'mês', trimestre: 'trimestre', ano: 'ano' } as const;

export function montarBloco(r: ResultadoVisualizavel, tipoPedido?: TipoBloco): BlocoVisualizacao {
  const tipos = TIPOS_POR_FERRAMENTA[r.ferramenta];
  if (!tipos) throw new ErroBloco(`${r.id} (${r.ferramenta}) não vira visualização.`);
  const tipo = tipoPedido ?? tipos[0];
  if (!tipos.includes(tipo)) throw new ErroBloco(`${r.id} (${r.ferramenta}) pode ser exibido como ${tipos.join(' ou ')}, não como ${tipo}.`);

  const { rastreio } = r.dados as { rastreio: Rastreio };
  const ind = CATALOGO[rastreio.indicador];
  const { filtros } = rastreio.parametros as { filtros?: Filtros };
  const efetivo: Periodo = { inicio: rastreio.periodoEfetivo.inicio, fim: rastreio.periodoEfetivo.fim };
  const base = {
    id: `v-${hash(jsonCanonico([tipo, rastreio.funcao, rastreio.indicador, rastreio.parametros]))}`,
    indicador: ind.id,
    unidade: ind.unidade,
    resultado: r.id,
    rastreio,
    subtitulo: descreverRecorte(efetivo, filtros),
  };
  const meta = ind.meta?.valor ?? null;

  switch (r.ferramenta) {
    case 'valor': {
      const d = r.dados as ResultadoValor;
      return { ...base, tipo: 'kpi', titulo: ind.nome, valor: d.valor, meta: d.meta, status: d.status, n: d.n, amostraSuficiente: d.amostraSuficiente };
    }
    case 'impacto': {
      const d = r.dados as ResultadoImpacto;
      if (!d.aplicavel) throw new ErroBloco(`${r.id}: "${ind.nome}" não tem custo associado.`);
      return {
        ...base, tipo: 'kpi', unidade: 'R$', titulo: `Custo estimado · ${ind.nome}`,
        valor: d.valor, meta: null, status: null, n: rastreio.n, amostraSuficiente: rastreio.n >= rastreio.amostraMinima,
      };
    }
    case 'serie': {
      const d = r.dados as ResultadoSerie;
      const { periodo } = rastreio.parametros as { periodo: Periodo };
      const titulo = `${ind.nome} por ${NOME_GRANULARIDADE[d.granularidade]}`;
      const subtitulo = descreverRecorte(periodo, filtros);
      if (tipo === 'tabela') {
        return {
          ...base, tipo, titulo, subtitulo,
          colunas: [
            { chave: 'periodo', rotulo: 'Período', formato: 'texto' },
            { chave: 'valor', rotulo: ind.nome, formato: 'valor' },
            { chave: 'n', rotulo: 'n', formato: 'n' },
          ],
          linhas: d.pontos.map(p => ({ periodo: p.rotulo, valor: p.valor, n: p.n })),
        };
      }
      return {
        ...base, tipo: 'serie', titulo, subtitulo, granularidade: d.granularidade, meta,
        pontos: d.pontos.map(p => ({ rotulo: p.rotulo, periodo: p.periodo, valor: p.valor, n: p.n, amostraSuficiente: p.amostraSuficiente })),
      };
    }
    case 'decompor': {
      const d = r.dados as ResultadoDecompor;
      const dimensao = d.dimensao as DimensaoRecorte;
      const titulo = `${ind.nome} por ${DESCRICAO_DIMENSAO[dimensao]}`;
      if (tipo === 'tabela') {
        return {
          ...base, tipo, titulo,
          colunas: [
            { chave: 'segmento', rotulo: DESCRICAO_DIMENSAO[dimensao], formato: 'texto' },
            { chave: 'valor', rotulo: ind.nome, formato: 'valor' },
            { chave: 'n', rotulo: 'n', formato: 'n' },
            { chave: 'peso', rotulo: 'Peso no total', formato: 'fracao' },
            { chave: 'composicao', rotulo: 'Composição', formato: 'fracao' },
          ],
          linhas: d.segmentos.map(s => ({ segmento: s.segmento, valor: s.valor, n: s.n, peso: s.peso, composicao: s.composicao })),
        };
      }
      return {
        ...base, tipo: 'barras', titulo, dimensao, total: d.total.valor, meta,
        barras: d.segmentos.map(s => ({ rotulo: s.segmento, valor: s.valor, n: s.n, amostraSuficiente: s.amostraSuficiente, composicao: s.composicao })),
      };
    }
    case 'cruzar': {
      const d = r.dados as ResultadoCruzar;
      const [d1, d2] = d.dimensoes as [DimensaoRecorte, DimensaoRecorte];
      const colunas: ColunaTabela[] = [
        { chave: d1, rotulo: DESCRICAO_DIMENSAO[d1], formato: 'texto' },
        { chave: d2, rotulo: DESCRICAO_DIMENSAO[d2], formato: 'texto' },
        { chave: 'valor', rotulo: ind.nome, formato: 'valor' },
        { chave: 'n', rotulo: 'n', formato: 'n' },
        { chave: 'composicao', rotulo: 'Composição', formato: 'fracao' },
      ];
      return {
        ...base, tipo: 'tabela', titulo: `${ind.nome} por ${DESCRICAO_DIMENSAO[d1]} e ${DESCRICAO_DIMENSAO[d2]}`, colunas,
        linhas: d.celulas.map(c => ({ [d1]: c.segmento[d1] ?? null, [d2]: c.segmento[d2] ?? null, valor: c.valor, n: c.n, composicao: c.composicao })),
      };
    }
    case 'comparar': {
      const d = r.dados as ResultadoComparar;
      const { a, b } = rastreio.parametros as { a: { periodo: Periodo; filtros?: Filtros }; b: { periodo: Periodo; filtros?: Filtros } };
      const lado = (rv: ResultadoValor, rec: { periodo: Periodo; filtros?: Filtros }) => ({
        rotulo: descreverRecorte(rec.periodo, rec.filtros), valor: rv.valor, n: rv.n, amostraSuficiente: rv.amostraSuficiente,
      });
      const ladoA = lado(d.a, a);
      const ladoB = lado(d.b, b);
      return {
        ...base, tipo: 'comparacao', titulo: `${ind.nome}: comparação`, subtitulo: `${ladoA.rotulo} × ${ladoB.rotulo}`,
        a: ladoA, b: ladoB, diferenca: d.diferenca, unidadeDiferenca: d.unidadeDiferenca, variacaoRelativa: d.variacaoRelativa, melhor: d.melhor,
      };
    }
    case 'drivers': {
      const d = r.dados as ResultadoDrivers;
      const linhas = [
        ...d.fatoresDeRisco.map(f => ({ f, tipo: 'risco' })),
        ...d.fatoresProtetivos.map(f => ({ f, tipo: 'proteção' })),
        ...d.combinacoes.map(f => ({ f, tipo: f.lift >= 1 ? 'combinação de risco' : 'combinação protetiva' })),
      ].map(({ f, tipo: t }) => ({ fator: rotuloSegmento(f.segmento), tipo: t, valor: f.valor, lift: f.lift, eventos: f.eventos, n: f.n }));
      return {
        ...base, tipo: 'tabela', titulo: `Fatores de risco e de proteção · ${ind.nome}`,
        colunas: [
          { chave: 'fator', rotulo: 'Fator', formato: 'texto' },
          { chave: 'tipo', rotulo: 'Tipo', formato: 'texto' },
          { chave: 'valor', rotulo: ind.nome, formato: 'valor' },
          { chave: 'lift', rotulo: 'Lift', formato: 'lift' },
          { chave: 'eventos', rotulo: 'Eventos', formato: 'n' },
          { chave: 'n', rotulo: 'n', formato: 'n' },
        ],
        linhas,
      };
    }
    default:
      throw new ErroBloco(`${r.id} (${r.ferramenta}) não vira visualização.`);
  }
}
