/**
 * Contratos do agente que a UI (fase 3) consome: entrada da rota `/api/agente`, contexto de deep
 * dive (botão "Investigar" de cada card, barra e ponto), blocos de visualização, rastro e os
 * eventos do stream.
 *
 * Stream: `text/event-stream`, uma linha `data: <EventoAgente em JSON>` por evento. Ordem típica:
 * passo(inicio)… passo(fim)… bloco… texto… rastro, fim. `erro` encerra o stream no lugar de `fim`.
 *
 * Regra: todo número de um bloco vem de um resultado de tool (motor da fase 1). O modelo só escolhe
 * QUAIS resultados viram bloco (tool `mostrar`) e o tipo; não fornece números nem títulos.
 */

import type { IdIndicador, Unidade } from '@/lib/analytics/catalog';
import { MESES, type Mes } from '@/lib/analytics/dominio';
import type { Granularidade, Origem, Periodo, Rastreio, Status } from '@/lib/analytics/engine';
import { DIMENSOES, VALORES_DIMENSAO, type Dimensao, type Filtros } from '@/lib/analytics/fatos';
import { ESQUEMAS_ARGUMENTOS, validarEsquema, type JsonSchema } from '@/lib/analytics/schemas';
import { LENTES, type Lente } from '@/lib/analytics/signals';

// ── Entrada ───────────────────────────────────────────────────────────────────

export type DimensaoRecorte = Exclude<Dimensao, 'mes'>;

/** O que foi clicado: um mês da série e/ou um segmento de uma dimensão (barra, célula) */
export interface PontoClicado {
  mes?: Mes;
  dimensao?: DimensaoRecorte;
  segmento?: string;
}

/** Contexto de deep dive: de onde a pergunta parte. Sem `indicador`, é uma pergunta livre sobre o recorte. */
export interface ContextoDeepDive {
  indicador?: IdIndicador;
  periodo: Periodo;
  filtros?: Filtros;
  ponto?: PontoClicado;
  lente?: Lente;
}

export interface MensagemChat {
  papel: 'usuario' | 'assistente';
  conteudo: string;
}

/** Corpo do POST em /api/agente */
export interface EntradaAgente {
  mensagens: MensagemChat[];
  contexto?: ContextoDeepDive;
}

const DIMENSOES_RECORTE = DIMENSOES.filter((d): d is DimensaoRecorte => d !== 'mes');
const BASE_VALOR = ESQUEMAS_ARGUMENTOS.valor.properties!;

export const ESQUEMA_CONTEXTO: JsonSchema = {
  type: 'object',
  description: 'Contexto de deep dive: indicador, recorte, ponto clicado e público.',
  properties: {
    indicador: BASE_VALOR.indicador,
    periodo: BASE_VALOR.periodo,
    filtros: BASE_VALOR.filtros,
    ponto: {
      type: 'object',
      properties: {
        mes: { type: 'string', enum: MESES, description: 'mês clicado (YYYY-MM)' },
        dimensao: { type: 'string', enum: DIMENSOES_RECORTE, description: 'dimensão do segmento clicado' },
        segmento: { type: 'string', maxLength: 80, description: 'valor do segmento clicado' },
      },
      additionalProperties: false,
    },
    lente: { type: 'string', enum: LENTES, description: 'público: ceo, chro ou gestor' },
  },
  required: ['periodo'],
  additionalProperties: false,
};

export type ResultadoContexto = { ok: true; contexto: ContextoDeepDive } | { ok: false; erros: string[] };

export function validarContexto(valor: unknown): ResultadoContexto {
  const erros = validarEsquema(ESQUEMA_CONTEXTO, valor);
  if (erros.length) return { ok: false, erros };
  const contexto = valor as ContextoDeepDive;
  if (contexto.periodo.inicio > contexto.periodo.fim) erros.push('periodo: início depois do fim');
  const { ponto } = contexto;
  const { inicio, fim } = contexto.periodo;
  if (ponto?.mes !== undefined && (ponto.mes < inicio || ponto.mes > fim)) erros.push(`ponto.mes: ${ponto.mes} fora do período (${inicio} a ${fim})`);
  if (ponto?.segmento !== undefined) {
    if (!ponto.dimensao) erros.push('ponto.segmento: informe a dimensão do segmento');
    else if (!(VALORES_DIMENSAO[ponto.dimensao] as readonly string[]).includes(ponto.segmento)) {
      erros.push(`ponto.segmento: "${ponto.segmento}" não é um valor de ${ponto.dimensao}`);
    }
  }
  return erros.length ? { ok: false, erros } : { ok: true, contexto };
}

// ── Ferramentas ───────────────────────────────────────────────────────────────

export const NOMES_FERRAMENTAS = [
  'listarIndicadores',
  'valor',
  'serie',
  'decompor',
  'cruzar',
  'comparar',
  'drivers',
  'impacto',
  'sinais',
  'mostrar',
] as const;
export type NomeFerramenta = (typeof NOMES_FERRAMENTAS)[number];

// ── Blocos de visualização ────────────────────────────────────────────────────

export const TIPOS_BLOCO = ['kpi', 'serie', 'barras', 'tabela', 'comparacao'] as const;
export type TipoBloco = (typeof TIPOS_BLOCO)[number];

interface BlocoBase {
  /** resultado + tipo: único na resposta (chave da lista e deduplicação) */
  id: string;
  tipo: TipoBloco;
  /** gerado pelo servidor a partir do catálogo e do recorte (sem números) */
  titulo: string;
  /** recorte e período, ex.: "Operações · Out/25 a Set/26" */
  subtitulo: string;
  indicador: IdIndicador;
  unidade: Unidade;
  /** id do resultado de tool que originou o bloco (r1, r2…), o mesmo do rastro */
  resultado: string;
  rastreio: Rastreio;
  /** algum número do bloco não foi divulgado (recorte de pessoas abaixo do mínimo): a frase que a tela mostra */
  aviso?: string;
}

export interface BlocoKpi extends BlocoBase {
  tipo: 'kpi';
  valor: number | null;
  meta: number | null;
  status: Status | null;
  n: number | null;
  amostraSuficiente: boolean;
}

export interface PontoBloco {
  rotulo: string;
  periodo: Periodo;
  valor: number | null;
  n: number | null;
  amostraSuficiente: boolean;
}

export interface BlocoSerie extends BlocoBase {
  tipo: 'serie';
  granularidade: Granularidade;
  meta: number | null;
  pontos: PontoBloco[];
}

export interface Barra {
  rotulo: string;
  valor: number | null;
  n: number | null;
  amostraSuficiente: boolean;
  /** fatia do numerador (0 a 1): "dos eventos, X% eram deste segmento"; null se não se aplica */
  composicao: number | null;
}

export interface BlocoBarras extends BlocoBase {
  tipo: 'barras';
  dimensao: DimensaoRecorte;
  /** valor do recorte inteiro (linha de referência) */
  total: number | null;
  meta: number | null;
  barras: Barra[];
}

export interface ColunaTabela {
  chave: string;
  rotulo: string;
  /**
   * texto · valor (na `unidade` do bloco) · n (tamanho da amostra) · fracao (0 a 1, exibir em %) ·
   * lift (razão, exibir com ×)
   */
  formato: 'texto' | 'valor' | 'n' | 'fracao' | 'lift';
}

/** Seção da tabela: `linhas` consecutivas, das quais só as `visiveis` primeiras aparecem até o leitor pedir todas */
export interface GrupoTabela {
  rotulo: string;
  linhas: number;
  visiveis: number;
}

export interface BlocoTabela extends BlocoBase {
  tipo: 'tabela';
  colunas: ColunaTabela[];
  linhas: Record<string, string | number | null>[];
  /** seções que cobrem as linhas em ordem (ex.: risco e proteção); sem grupos, a tabela mostra tudo */
  grupos?: GrupoTabela[];
}

export interface LadoComparacao {
  rotulo: string;
  valor: number | null;
  n: number | null;
  amostraSuficiente: boolean;
}

export interface BlocoComparacao extends BlocoBase {
  tipo: 'comparacao';
  a: LadoComparacao;
  b: LadoComparacao;
  /** a − b */
  diferenca: number | null;
  unidadeDiferenca: string;
  variacaoRelativa: number | null;
  melhor: 'a' | 'b' | 'empate' | null;
}

export type BlocoVisualizacao = BlocoKpi | BlocoSerie | BlocoBarras | BlocoTabela | BlocoComparacao;

// ── Rastro ("Como calculei") ──────────────────────────────────────────────────

export interface ItemRastro {
  resultado: string;
  /** um de NOMES_FERRAMENTAS (ou o nome inválido que o modelo tentou, com ok = false) */
  ferramenta: string;
  rotulo: string;
  /** argumentos como o motor os resolveu (com padrões aplicados), ou como chegaram quando inválidos */
  argumentos: unknown;
  ok: boolean;
  erro?: string;
  formula?: string;
  n?: number;
  periodoEfetivo?: Rastreio['periodoEfetivo'];
  fonte?: Origem;
  duracaoMs: number;
}

// ── Guarda de números ─────────────────────────────────────────────────────────

export interface NumeroNaoVerificado {
  /** trecho como apareceu no texto, ex.: "R$ 3,2 mi" */
  texto: string;
  valor: number;
}

export interface Verificacao {
  /** números checados no texto (anos, datas e contagens triviais ficam de fora) */
  total: number;
  verificados: number;
  naoVerificados: NumeroNaoVerificado[];
}

// ── Eventos do stream ─────────────────────────────────────────────────────────

export type EventoAgente =
  | { tipo: 'passo'; resultado: string; ferramenta: string; rotulo: string; estado: 'inicio' | 'fim' | 'erro' }
  | { tipo: 'texto'; delta: string }
  | { tipo: 'bloco'; bloco: BlocoVisualizacao }
  | { tipo: 'rastro'; itens: ItemRastro[] }
  | { tipo: 'fim'; verificacao: Verificacao }
  | { tipo: 'erro'; mensagem: string };
