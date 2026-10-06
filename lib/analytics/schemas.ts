/**
 * Schemas JSON (subconjunto do JSON Schema 2020-12) dos argumentos de cada função do motor.
 * Na fase 2 eles viram os parâmetros das tools do agente; `validarArgs` aplica o mesmo schema
 * no servidor antes de chamar o motor.
 *
 * O schema cobre forma e vocabulário (ids do catálogo, meses da janela, valores de cada
 * dimensão). Regras que dependem do indicador (ex.: "mulheres" não se decompõe por gênero,
 * o cubo do client só tem diretoria e senioridade) ficam no motor, que lança ErroConsulta
 * com a lista de dimensões válidas.
 *
 * Sem dependência de schema: são ~7 objetos e um validador de ~50 linhas para o subconjunto
 * usado (type, enum, properties, required, additionalProperties, items, minItems, maxItems,
 * minLength, maxLength). `validarEsquema` aplica o mesmo validador a outros contratos (contexto
 * de deep dive, layout spec).
 */

import { IDS_INDICADORES } from './catalog';
import { MESES } from './dominio';
import type { ArgsComparar, ArgsCruzar, ArgsDecompor, ArgsDrivers, ArgsImpacto, ArgsSerie, ArgsValor, NomeFuncao } from './engine';
import { DESCRICAO_DIMENSAO, DIMENSOES, VALORES_DIMENSAO } from './fatos';

export type TipoJson = 'object' | 'string' | 'array' | 'number' | 'integer' | 'boolean' | 'null';

export interface JsonSchema {
  /** um tipo ou uma união (ex.: ['string', 'null']) */
  type?: TipoJson | readonly TipoJson[];
  description?: string;
  enum?: readonly (string | number | null)[];
  properties?: Record<string, JsonSchema>;
  required?: readonly string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
}

const DIMENSOES_RECORTE = DIMENSOES.filter(d => d !== 'mes');

const INDICADOR: JsonSchema = { type: 'string', enum: IDS_INDICADORES, description: 'id do indicador no catálogo' };

const PERIODO: JsonSchema = {
  type: 'object',
  description: `Janela de meses, inclusive (dados de ${MESES[0]} a ${MESES[MESES.length - 1]}). Estoques são lidos no fim do último mês.`,
  properties: {
    inicio: { type: 'string', enum: MESES, description: 'primeiro mês (YYYY-MM)' },
    fim: { type: 'string', enum: MESES, description: 'último mês (YYYY-MM)' },
  },
  required: ['inicio', 'fim'],
  additionalProperties: false,
};

const FILTROS: JsonSchema = {
  type: 'object',
  description: 'Recorte: um valor por dimensão. As dimensões válidas dependem do indicador.',
  properties: Object.fromEntries(
    DIMENSOES_RECORTE.map(d => [d, { type: 'string', enum: VALORES_DIMENSAO[d], description: DESCRICAO_DIMENSAO[d] } satisfies JsonSchema]),
  ),
  additionalProperties: false,
};

const DIMENSAO: JsonSchema = { type: 'string', enum: DIMENSOES_RECORTE, description: 'dimensão de recorte' };

const RECORTE: JsonSchema = {
  type: 'object',
  properties: { periodo: PERIODO, filtros: FILTROS },
  required: ['periodo'],
  additionalProperties: false,
};

function objeto(description: string, properties: Record<string, JsonSchema>, required: string[]): JsonSchema {
  return { type: 'object', description, properties, required, additionalProperties: false };
}

const BASE = { indicador: INDICADOR, periodo: PERIODO, filtros: FILTROS };

export const ESQUEMAS_ARGUMENTOS: Record<NomeFuncao, JsonSchema> = {
  valor: objeto('Valor de um indicador num período e recorte, com status contra a meta e tamanho da amostra.', BASE, ['indicador', 'periodo']),
  serie: objeto(
    'Série temporal de um indicador (mês, trimestre ou ano) num recorte.',
    { ...BASE, granularidade: { type: 'string', enum: ['mes', 'trimestre', 'ano'], description: 'padrão: mês (eNPS: trimestre)' } },
    ['indicador', 'periodo'],
  ),
  decompor: objeto(
    'Valor do indicador em cada segmento de uma dimensão (taxa por segmento, peso e composição), reconciliando com o total.',
    { ...BASE, dimensao: DIMENSAO },
    ['indicador', 'periodo', 'dimensao'],
  ),
  cruzar: objeto(
    'Valor do indicador em cada combinação de duas dimensões.',
    { ...BASE, dimensoes: { type: 'array', items: DIMENSAO, minItems: 2, maxItems: 2, description: 'duas dimensões diferentes' } },
    ['indicador', 'periodo', 'dimensoes'],
  ),
  comparar: objeto(
    'Compara o indicador entre dois recortes (outra diretoria, outro período): diferença, variação e qual lado está melhor.',
    { indicador: INDICADOR, a: RECORTE, b: RECORTE },
    ['indicador', 'a', 'b'],
  ),
  drivers: objeto(
    'Fatores de risco e de proteção de uma taxa de evento (turnover, early attrition, promoção, mobilidade): lift por atributo e por par de atributos no roster.',
    BASE,
    ['indicador', 'periodo'],
  ),
  impacto: objeto('Custo estimado em BRL associado ao indicador no recorte, quando existe (turnover, absenteísmo, horas extras).', BASE, [
    'indicador',
    'periodo',
  ]),
};

export interface ArgsPorFuncao {
  valor: ArgsValor;
  serie: ArgsSerie;
  decompor: ArgsDecompor;
  cruzar: ArgsCruzar;
  comparar: ArgsComparar;
  drivers: ArgsDrivers;
  impacto: ArgsImpacto;
}

export type ResultadoValidacao<F extends NomeFuncao> = { ok: true; args: ArgsPorFuncao[F] } | { ok: false; erros: string[] };

function tipoDe(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function validar(esquema: JsonSchema, valor: unknown, caminho: string, erros: string[]): void {
  const onde = caminho || '(raiz)';
  const t = tipoDe(valor);
  if (esquema.type) {
    const aceitos: readonly TipoJson[] = typeof esquema.type === 'string' ? [esquema.type] : esquema.type;
    if (!aceitos.includes(t as TipoJson) && !(t === 'integer' && aceitos.includes('number'))) {
      erros.push(`${onde}: esperado ${aceitos.join(' ou ')}, veio ${t}`);
      return;
    }
  }
  if (esquema.enum && !esquema.enum.includes(valor as string | number | null)) {
    erros.push(`${onde}: "${String(valor)}" não é um valor aceito`);
    return;
  }
  if (t === 'object') {
    const obj = valor as Record<string, unknown>;
    for (const r of esquema.required ?? []) if (obj[r] === undefined) erros.push(`${caminho ? `${caminho}.` : ''}${r}: obrigatório`);
    for (const [k, v] of Object.entries(obj)) {
      const filho = esquema.properties?.[k];
      const sub = caminho ? `${caminho}.${k}` : k;
      if (filho) validar(filho, v, sub, erros);
      else if (esquema.additionalProperties === false) erros.push(`${sub}: propriedade não permitida`);
    }
  } else if (t === 'string') {
    const s = valor as string;
    if (esquema.minLength !== undefined && s.length < esquema.minLength) erros.push(`${onde}: mínimo de ${esquema.minLength} caracteres`);
    if (esquema.maxLength !== undefined && s.length > esquema.maxLength) erros.push(`${onde}: máximo de ${esquema.maxLength} caracteres`);
  } else if (t === 'array') {
    const arr = valor as unknown[];
    if (esquema.minItems !== undefined && arr.length < esquema.minItems) erros.push(`${onde}: mínimo de ${esquema.minItems} itens`);
    if (esquema.maxItems !== undefined && arr.length > esquema.maxItems) erros.push(`${onde}: máximo de ${esquema.maxItems} itens`);
    if (esquema.items) arr.forEach((v, i) => validar(esquema.items!, v, `${caminho}[${i}]`, erros));
  }
}

/** Erros de `valor` contra `esquema` (vazio = válido), com o caminho de cada erro */
export function validarEsquema(esquema: JsonSchema, valor: unknown): string[] {
  const erros: string[] = [];
  validar(esquema, valor, '', erros);
  return erros;
}

export function validarArgs<F extends NomeFuncao>(funcao: F, args: unknown): ResultadoValidacao<F> {
  const erros = validarEsquema(ESQUEMAS_ARGUMENTOS[funcao], args);
  return erros.length === 0 ? { ok: true, args: args as ArgsPorFuncao[F] } : { ok: false, erros };
}
