/**
 * Layout spec: como o painel se organiza para um recorte (período, diretoria, lente). A IA decide a
 * apresentação; o código decide os números. O spec só referencia ids do catálogo, sinais e pontos
 * de dados (âncoras) que o detector da fase 1 produziu; o único texto livre é narrativo (manchete,
 * títulos, anotações, perguntas) e todo número nele precisa estar nos sinais de entrada.
 *
 * Roda no client e no servidor: nada aqui chama a IA (ver gerador.ts). Só indicadores visíveis do
 * painel entram (lib/painel/indicadores.ts): sinais de entrada, cards, gráficos e âncoras.
 */

import type { IdIndicador } from '@/lib/analytics/catalog';
import { DIRETORIAS, MES_FIM, MESES, somarMeses, type Diretoria } from '@/lib/analytics/dominio';
import type { MotorCliente, Periodo } from '@/lib/analytics/engine';
import { validarEsquema, type JsonSchema } from '@/lib/analytics/schemas';
import { LENTES, type Lente, type PontoDado, type Sinal } from '@/lib/analytics/signals';
import { validarContexto, type ContextoDeepDive } from '@/lib/agente/contrato';
import { coletarValores, verificarNumeros } from '@/lib/agente/guarda';
import { IDS_PAINEL } from '@/lib/painel/indicadores';
import { sinaisVisiveis } from '@/lib/painel/sinais';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface RecorteLayout {
  periodo: Periodo;
  /** null = empresa toda (visão "Geral") */
  diretoria: Diretoria | null;
  lente: Lente;
}

export const DESTAQUES = ['alto', 'medio', 'normal'] as const;
export type Destaque = (typeof DESTAQUES)[number];

/** serie: evolução do indicador no recorte · ranking_diretorias: barras por diretoria no período · antecedente: duas séries (causa e efeito) */
export const TIPOS_GRAFICO = ['serie', 'ranking_diretorias', 'antecedente'] as const;
export type TipoGrafico = (typeof TIPOS_GRAFICO)[number];

/** Ponto de dado exato (indicador + recorte + período): o mesmo PontoDado de um sinal, sem o valor */
export interface AncoraLayout {
  indicador: IdIndicador;
  diretoria: Diretoria | null;
  periodo: Periodo;
  /** rótulo do ponto: mês ("Jan/26"), trimestre ("1T25"), período ou diretoria (barras) */
  rotulo: string;
}

export interface CardLayout {
  indicador: IdIndicador;
  destaque: Destaque;
  /** frase narrativa curta, ou null para o título padrão do catálogo */
  titulo: string | null;
  /** sinal que justifica o destaque */
  sinal: string | null;
}

export interface GraficoLayout {
  tipo: TipoGrafico;
  /** 1 indicador, ou [causa, efeito] no antecedente */
  indicadores: IdIndicador[];
  /** recorte da série, ou a diretoria destacada no ranking */
  diretoria: Diretoria | null;
  titulo: string;
  sinal: string;
}

export interface AnotacaoLayout {
  ancora: AncoraLayout;
  texto: string;
  sinal: string;
}

export interface DeepDiveSugerido {
  pergunta: string;
  /** vai direto para POST /api/agente */
  contexto: ContextoDeepDive;
  sinal: string | null;
}

export interface LayoutSpec {
  chave: string;
  recorte: RecorteLayout;
  origem: 'ia' | 'deterministico';
  manchete: string;
  /** em ordem de exibição */
  cards: CardLayout[];
  graficos: GraficoLayout[];
  anotacoes: AnotacaoLayout[];
  deepDives: DeepDiveSugerido[];
}

/** Limites duros do schema (o prompt da IA pede menos, com folga) */
export const LIMITES_LAYOUT = {
  cards: { min: 6, max: 12 },
  graficos: { min: 0, max: 4 },
  anotacoes: { min: 0, max: 6 },
  deepDives: { min: 3, max: 5 },
  /** 42px serifado em 24ch: 110 caracteres já são 4 linhas no resumo */
  manchete: 110,
  titulo: 100,
  anotacao: 90,
  pergunta: 140,
} as const;

/** Tira o ponto final de um texto da IA sem cortar abreviação no fim ("18,5% a.a.", "+2 p.p.") */
export function semPontoFinal(texto: string): string {
  const t = texto.trim();
  return /(?:^|[^\p{L}])\p{L}\.\p{L}\.$/u.test(t) ? t : t.replace(/\.$/, '');
}

// ── Schema ────────────────────────────────────────────────────────────────────

const PERIODO: JsonSchema = {
  type: 'object',
  properties: { inicio: { type: 'string', enum: MESES }, fim: { type: 'string', enum: MESES } },
  required: ['inicio', 'fim'],
  additionalProperties: false,
};
const INDICADOR: JsonSchema = { type: 'string', enum: IDS_PAINEL };
const DIRETORIA: JsonSchema = { type: ['string', 'null'], enum: [...DIRETORIAS, null] };
const ID_SINAL: JsonSchema = { type: 'string', maxLength: 120 };
const texto = (max: number): JsonSchema => ({ type: 'string', minLength: 3, maxLength: max });
const objeto = (properties: Record<string, JsonSchema>): JsonSchema => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const lista = (items: JsonSchema, { min, max }: { min: number; max: number }): JsonSchema => ({ type: 'array', items, minItems: min, maxItems: max });

export const ESQUEMA_LAYOUT_SPEC: JsonSchema = objeto({
  chave: { type: 'string' },
  recorte: objeto({ periodo: PERIODO, diretoria: DIRETORIA, lente: { type: 'string', enum: LENTES } }),
  origem: { type: 'string', enum: ['ia', 'deterministico'] },
  manchete: texto(LIMITES_LAYOUT.manchete),
  cards: lista(
    objeto({ indicador: INDICADOR, destaque: { type: 'string', enum: DESTAQUES }, titulo: { type: ['string', 'null'], maxLength: LIMITES_LAYOUT.titulo }, sinal: { ...ID_SINAL, type: ['string', 'null'] } }),
    LIMITES_LAYOUT.cards,
  ),
  graficos: lista(
    objeto({ tipo: { type: 'string', enum: TIPOS_GRAFICO }, indicadores: { type: 'array', items: INDICADOR, minItems: 1, maxItems: 2 }, diretoria: DIRETORIA, titulo: texto(LIMITES_LAYOUT.titulo), sinal: ID_SINAL }),
    LIMITES_LAYOUT.graficos,
  ),
  anotacoes: lista(
    objeto({ ancora: objeto({ indicador: INDICADOR, diretoria: DIRETORIA, periodo: PERIODO, rotulo: { type: 'string', maxLength: 40 } }), texto: texto(LIMITES_LAYOUT.anotacao), sinal: ID_SINAL }),
    LIMITES_LAYOUT.anotacoes,
  ),
  deepDives: lista(objeto({ pergunta: texto(LIMITES_LAYOUT.pergunta), contexto: { type: 'object' }, sinal: { ...ID_SINAL, type: ['string', 'null'] } }), LIMITES_LAYOUT.deepDives),
});

// ── Recortes padrão ───────────────────────────────────────────────────────────

/**
 * Recortes pré-gerados: os 12 meses até o mês padrão do painel (Set/2026), que é a janela dos
 * sinais e do resumo para o mês selecionado. Outros meses são gerados ao vivo por /api/layout.
 */
export const PERIODOS_PADRAO: readonly { id: string; rotulo: string; periodo: Periodo }[] = [
  { id: 'ultimos-12-meses', rotulo: 'Últimos 12 meses', periodo: { inicio: somarMeses(MES_FIM, -11), fim: MES_FIM } },
];

export const COMBINACOES_PADRAO: readonly RecorteLayout[] = PERIODOS_PADRAO.flatMap(({ periodo }) =>
  [null, ...DIRETORIAS].flatMap(diretoria => LENTES.map(lente => ({ periodo, diretoria, lente }))),
);

export function chaveLayout(r: RecorteLayout): string {
  return `${r.periodo.inicio}..${r.periodo.fim}|${r.diretoria ?? 'Geral'}|${r.lente}`;
}

/** Sinais que o layout usa (IA e determinístico): os de maior score para o público */
export const MAX_SINAIS_LAYOUT = 12;

/**
 * Os sinais de entrada do layout: os MAX_SINAIS_LAYOUT primeiros do detector entre os de
 * indicadores visíveis. A IA vê exatamente estes, o layout determinístico usa estes e a guarda de
 * números só aceita números destes.
 */
export function sinaisDoRecorte(motor: MotorCliente, r: RecorteLayout): Sinal[] {
  return sinaisVisiveis(motor, r.periodo, r.diretoria, r.lente).slice(0, MAX_SINAIS_LAYOUT);
}

// ── Sinais → estrutura (compartilhado pelo layout determinístico e pelo da IA) ──

const ancoraDe = (p: PontoDado): AncoraLayout => ({ indicador: p.indicador, diretoria: p.diretoria, periodo: p.periodo, rotulo: p.rotulo });

/** Pontos de um sinal que podem receber anotação: o ponto que o sinal descreve, não a série inteira */
export function ancorasDoSinal(s: Sinal): AncoraLayout[] {
  const p = s.pontos;
  if (p.length === 0) return [];
  switch (s.tipo) {
    case 'fora_da_meta':
    case 'outlier_entre_diretorias':
      return [ancoraDe(p[0])];
    case 'piora_acelerada':
      return [ancoraDe(p[p.length - 1])];
    case 'sazonalidade':
      return p.map(ancoraDe);
    case 'quebra_de_tendencia': {
      const inicioNovo = p.find(x => x.periodo.inicio === s.periodo.inicio);
      const ultimo = p[p.length - 1];
      return inicioNovo && inicioNovo !== ultimo ? [ancoraDe(inicioNovo), ancoraDe(ultimo)] : [ancoraDe(ultimo)];
    }
    case 'indicador_antecedente':
      return s.indicadores.flatMap(id => {
        const doIndicador = p.filter(x => x.indicador === id);
        return doIndicador.length ? [ancoraDe(doIndicador[doIndicador.length - 1])] : [];
      });
  }
}

/** Valor do ponto ancorado (para o prompt da IA e os textos do layout determinístico) */
export function valorDaAncora(s: Sinal, a: AncoraLayout): number | null {
  return s.pontos.find(p => p.indicador === a.indicador && p.periodo.inicio === a.periodo.inicio && p.periodo.fim === a.periodo.fim && p.rotulo === a.rotulo)?.valor ?? null;
}

export function graficoDoSinal(s: Sinal, r: RecorteLayout): Omit<GraficoLayout, 'titulo'> {
  const indicador = s.indicadores[s.indicadores.length - 1];
  switch (s.tipo) {
    case 'outlier_entre_diretorias':
      return { tipo: 'ranking_diretorias', indicadores: [indicador], diretoria: s.diretoria, sinal: s.id };
    case 'fora_da_meta':
      return r.diretoria === null && s.diretoria === null
        ? { tipo: 'ranking_diretorias', indicadores: [indicador], diretoria: null, sinal: s.id }
        : { tipo: 'serie', indicadores: [indicador], diretoria: s.diretoria, sinal: s.id };
    case 'indicador_antecedente':
      return { tipo: 'antecedente', indicadores: [...s.indicadores], diretoria: s.diretoria, sinal: s.id };
    default:
      return { tipo: 'serie', indicadores: [indicador], diretoria: s.diretoria, sinal: s.id };
  }
}

/**
 * Contexto do botão "Investigar" a partir de um sinal. A âncora vira "ponto clicado" só se for um
 * mês do mesmo indicador e dentro do período do recorte (antecedentes e quebras ancoram no histórico).
 */
export function contextoDoSinal(s: Sinal, r: RecorteLayout, ancora?: AncoraLayout): ContextoDeepDive {
  const indicador = s.indicadores[s.indicadores.length - 1];
  const mes = ancora?.periodo.fim;
  const ponto = ancora && mes && ancora.indicador === indicador && ancora.periodo.inicio === mes && mes >= r.periodo.inicio && mes <= r.periodo.fim;
  return {
    indicador,
    periodo: r.periodo,
    ...(s.diretoria ? { filtros: { diretoria: s.diretoria } } : {}),
    ...(ponto ? { ponto: { mes } } : {}),
    lente: r.lente,
  };
}

/** Todo número que um texto do layout pode citar: a evidência e os valores das âncoras dos sinais de entrada (não a série inteira) */
export function valoresDosSinais(sinais: readonly Sinal[]): number[] {
  return coletarValores(sinais.flatMap(s => [s.evidencia, ...ancorasDoSinal(s).map(a => valorDaAncora(s, a))]));
}

// ── Validação ─────────────────────────────────────────────────────────────────

const mesmaAncora = (a: AncoraLayout, b: AncoraLayout) =>
  a.indicador === b.indicador && a.diretoria === b.diretoria && a.periodo.inicio === b.periodo.inicio && a.periodo.fim === b.periodo.fim && a.rotulo === b.rotulo;

/**
 * Erros do spec (vazio = válido): schema, chave, referências a sinais e âncoras de entrada,
 * estrutura dos gráficos, contexto dos deep dives e números dos textos contra os sinais.
 */
export function validarLayout(spec: unknown, sinais: readonly Sinal[]): string[] {
  const erros = validarEsquema(ESQUEMA_LAYOUT_SPEC, spec);
  if (erros.length) return erros;
  const l = spec as LayoutSpec;
  const porId = new Map(sinais.map(s => [s.id, s]));
  const sinalValido = (id: string | null, onde: string) => {
    if (id !== null && !porId.has(id)) erros.push(`${onde}: sinal "${id}" não está entre os sinais do recorte`);
  };

  if (l.chave !== chaveLayout(l.recorte)) erros.push(`chave: esperado "${chaveLayout(l.recorte)}"`);
  const vistos = new Set<string>();
  l.cards.forEach((c, i) => {
    if (vistos.has(c.indicador)) erros.push(`cards[${i}]: indicador ${c.indicador} repetido`);
    vistos.add(c.indicador);
    sinalValido(c.sinal, `cards[${i}]`);
  });
  l.graficos.forEach((g, i) => {
    const s = porId.get(g.sinal);
    if (!s) return sinalValido(g.sinal, `graficos[${i}]`);
    const esperado = graficoDoSinal(s, l.recorte);
    if (g.tipo !== esperado.tipo || g.diretoria !== esperado.diretoria || g.indicadores.join() !== esperado.indicadores.join()) {
      erros.push(`graficos[${i}]: estrutura diferente da do sinal ${g.sinal}`);
    }
  });
  l.anotacoes.forEach((a, i) => {
    const s = porId.get(a.sinal);
    if (!s) return sinalValido(a.sinal, `anotacoes[${i}]`);
    if (!ancorasDoSinal(s).some(x => mesmaAncora(x, a.ancora))) erros.push(`anotacoes[${i}].ancora: não é um ponto do sinal ${a.sinal}`);
  });
  l.deepDives.forEach((d, i) => {
    sinalValido(d.sinal, `deepDives[${i}]`);
    const v = validarContexto(d.contexto);
    if (!v.ok) erros.push(...v.erros.map(e => `deepDives[${i}].contexto: ${e}`));
  });

  const valores = valoresDosSinais(sinais);
  const textos: [string, string | null][] = [
    ['manchete', l.manchete],
    ...l.cards.map((c, i): [string, string | null] => [`cards[${i}].titulo`, c.titulo]),
    ...l.graficos.map((g, i): [string, string] => [`graficos[${i}].titulo`, g.titulo]),
    ...l.anotacoes.map((a, i): [string, string] => [`anotacoes[${i}].texto`, a.texto]),
    ...l.deepDives.map((d, i): [string, string] => [`deepDives[${i}].pergunta`, d.pergunta]),
  ];
  for (const [onde, t] of textos) {
    if (!t) continue;
    for (const n of verificarNumeros(t, valores).naoVerificados) erros.push(`${onde}: número não rastreável nos sinais: "${n.texto}"`);
  }
  return erros;
}
