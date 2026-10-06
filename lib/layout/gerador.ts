/**
 * Gerador do layout spec pela IA (servidor). Entram os sinais do recorte (fase 1) e o catálogo;
 * sai um spec validado. A IA só escolhe e escreve: referencia sinais (s1…), âncoras (a1…) e ids
 * do catálogo, e o código monta a estrutura (tipo de gráfico, ponto ancorado, contexto do deep
 * dive). Mesmo cliente LLM do agente, sem tools, em JSON mode (response_format json_object,
 * suportado pela DeepSeek; o prompt traz a palavra JSON e um exemplo, como a doc pede).
 *
 * Qualquer falha cai no layout determinístico: IA fora do ar, JSON quebrado ou vazio, resposta
 * fora do schema, referência inexistente, ou texto com número que não está nos sinais (guarda de
 * números, aqui bloqueante).
 */

import { INDICADORES, IDS_INDICADORES, CATALOGO, type IdIndicador } from '@/lib/analytics/catalog';
import type { MotorCliente } from '@/lib/analytics/engine';
import { validarEsquema, type JsonSchema } from '@/lib/analytics/schemas';
import { formatar, type Sinal } from '@/lib/analytics/signals';
import { chamarLLM, type NomeProvedor, type Provedor, type Uso } from '@/lib/agente/llm';
import { DESCRICAO_LENTE } from '@/lib/agente/prompt';
import { descreverRecorte } from '@/lib/agente/rotulos';
import { layoutDeterministico } from './deterministico';
import {
  ancorasDoSinal,
  chaveLayout,
  contextoDoSinal,
  DESTAQUES,
  graficoDoSinal,
  LIMITES_LAYOUT,
  sinaisDoRecorte,
  validarLayout,
  valorDaAncora,
  type AncoraLayout,
  type Destaque,
  type LayoutSpec,
  type RecorteLayout,
} from './spec';

/** Sinais mostrados à IA (os de maior score para o público) */
const MAX_SINAIS_IA = 12;
const MAX_TOKENS_SPEC = 1500;

// ── Entrada da IA ─────────────────────────────────────────────────────────────

export interface AncoraIA {
  ref: string;
  ancora: AncoraLayout;
  /** valor do ponto como o detector formata (a IA pode citar exatamente isto) */
  valorFormatado: string | null;
}

export interface SinalIA {
  ref: string;
  sinal: Sinal;
  ancoras: AncoraIA[];
}

export interface EntradaIA {
  sinais: SinalIA[];
}

export function prepararEntradaIA(sinais: readonly Sinal[]): EntradaIA {
  let nAncora = 0;
  return {
    sinais: sinais.slice(0, MAX_SINAIS_IA).map((sinal, i) => ({
      ref: `s${i + 1}`,
      sinal,
      ancoras: ancorasDoSinal(sinal).map(ancora => {
        const v = valorDaAncora(sinal, ancora);
        return { ref: `a${++nAncora}`, ancora, valorFormatado: v === null ? null : formatar(v, CATALOGO[ancora.indicador].unidade) };
      }),
    })),
  };
}

// ── Resposta da IA ────────────────────────────────────────────────────────────

export interface RespostaLayoutIA {
  manchete: string;
  cards: Array<{ indicador: IdIndicador; destaque: Destaque; titulo: string | null }>;
  graficos: Array<{ sinal: string; titulo: string }>;
  anotacoes: Array<{ ancora: string; texto: string }>;
  deepDives: Array<{ sinal: string; ancora: string | null; pergunta: string }>;
}

function esquemaResposta(e: EntradaIA): JsonSchema {
  const sinais = e.sinais.map(s => s.ref);
  const ancoras = e.sinais.flatMap(s => s.ancoras.map(a => a.ref));
  const texto = (max: number): JsonSchema => ({ type: 'string', minLength: 3, maxLength: max });
  const obj = (properties: Record<string, JsonSchema>): JsonSchema => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
  return obj({
    manchete: texto(LIMITES_LAYOUT.manchete),
    cards: {
      type: 'array', minItems: LIMITES_LAYOUT.cards.min, maxItems: LIMITES_LAYOUT.cards.max,
      items: obj({ indicador: { type: 'string', enum: IDS_INDICADORES }, destaque: { type: 'string', enum: DESTAQUES }, titulo: { type: ['string', 'null'], maxLength: LIMITES_LAYOUT.titulo } }),
    },
    graficos: { type: 'array', minItems: 1, maxItems: LIMITES_LAYOUT.graficos.max, items: obj({ sinal: { type: 'string', enum: sinais }, titulo: texto(LIMITES_LAYOUT.titulo) }) },
    anotacoes: { type: 'array', maxItems: LIMITES_LAYOUT.anotacoes.max, items: obj({ ancora: { type: 'string', enum: ancoras }, texto: texto(LIMITES_LAYOUT.anotacao) }) },
    deepDives: {
      type: 'array', minItems: LIMITES_LAYOUT.deepDives.min, maxItems: LIMITES_LAYOUT.deepDives.max,
      items: obj({ sinal: { type: 'string', enum: sinais }, ancora: { type: ['string', 'null'], enum: [...ancoras, null] }, pergunta: texto(LIMITES_LAYOUT.pergunta) }),
    },
  });
}

/** Estrutura vem dos sinais; da IA só a escolha, a ordem e o texto */
function montarSpec(recorte: RecorteLayout, e: EntradaIA, r: RespostaLayoutIA): LayoutSpec {
  const sinalDe = new Map(e.sinais.map(s => [s.ref, s.sinal]));
  const ancoraDe = new Map(e.sinais.flatMap(s => s.ancoras.map(a => [a.ref, { ancora: a.ancora, sinal: s.sinal }] as const)));
  const sinais = e.sinais.map(s => s.sinal);
  return {
    chave: chaveLayout(recorte),
    recorte,
    origem: 'ia',
    manchete: r.manchete,
    cards: r.cards.map(c => ({ ...c, sinal: sinais.find(s => s.indicadores.includes(c.indicador))?.id ?? null })),
    graficos: r.graficos.map(g => ({ ...graficoDoSinal(sinalDe.get(g.sinal)!, recorte), titulo: g.titulo })),
    anotacoes: r.anotacoes.map(a => {
      const { ancora, sinal } = ancoraDe.get(a.ancora)!;
      return { ancora, texto: a.texto, sinal: sinal.id };
    }),
    deepDives: r.deepDives.map(d => {
      const sinal = sinalDe.get(d.sinal)!;
      const ancora = d.ancora ? ancoraDe.get(d.ancora) : undefined;
      // a âncora só vira "ponto clicado" se for do mesmo sinal do deep dive
      return { pergunta: d.pergunta, contexto: contextoDoSinal(sinal, recorte, ancora?.sinal === sinal ? ancora.ancora : undefined), sinal: sinal.id };
    }),
  };
}

// ── Prompt ────────────────────────────────────────────────────────────────────

const EXEMPLO: RespostaLayoutIA = {
  manchete: 'Frase curta com a leitura principal do recorte para este público',
  cards: [
    { indicador: 'turnover_voluntario', destaque: 'alto', titulo: 'Saídas voluntárias acima da meta' },
    { indicador: 'enps', destaque: 'medio', titulo: null },
    { indicador: 'headcount', destaque: 'normal', titulo: null },
  ],
  graficos: [{ sinal: 's1', titulo: 'Título narrativo do gráfico' }],
  anotacoes: [{ ancora: 'a2', texto: 'Jan/26: pico sazonal de 95,8% a.a.' }],
  deepDives: [
    { sinal: 's1', ancora: 'a1', pergunta: 'Pergunta que este público faria sobre o sinal?' },
    { sinal: 's2', ancora: null, pergunta: 'Outra pergunta?' },
    { sinal: 's3', ancora: null, pergunta: 'Mais uma pergunta?' },
  ],
};

const SISTEMA = `Você organiza o painel executivo de People Analytics da Verta S.A. (dados sintéticos) para um público específico. A IA decide a apresentação; os números são do código.

Responda só com um objeto JSON, no formato do exemplo.

Regras:
- Use só as referências dadas: ids do catálogo, sinais (s1, s2…) e âncoras (a1, a2…).
- Números em textos: só os que aparecem na evidência de um sinal ou no valor de uma âncora, escritos como estão lá. Na dúvida, escreva sem número. Datas como Jan/26 podem.
- PT-BR, tom executivo e factual, sem adjetivos alarmistas, sem emojis.
- manchete: 1 frase curta (no máximo 15 palavras, até 100 caracteres) com a leitura principal para o público.
- cards: 8 a 10 indicadores, sem repetir, em ordem de importância para o público; destaque "alto" em no máximo 3, "medio" nos que têm sinal, "normal" nos demais; titulo: frase narrativa curta (até 70 caracteres) ou null.
- graficos: 2 ou 3 sinais que merecem gráfico, cada um com um título narrativo (até 70 caracteres).
- anotacoes: 2 a 4 âncoras com texto curto (até 70 caracteres) que explica o ponto.
- deepDives: 3 a 5 perguntas que o público faria (até 110 caracteres), cada uma ligada a um sinal e, se fizer sentido, a uma âncora desse sinal.

Exemplo de JSON:
${JSON.stringify(EXEMPLO, null, 1)}`;

function mensagemUsuario(recorte: RecorteLayout, e: EntradaIA): string {
  const catalogo = INDICADORES.map(i => `${i.id} · ${i.nome} · ${i.polaridade}`).join('\n');
  const sinais = e.sinais.map(({ ref, sinal: s, ancoras }) => {
    const ancorasTxt = ancoras.map(a => `${a.ref} = ${CATALOGO[a.ancora.indicador].nome} · ${a.ancora.diretoria ?? 'empresa'} · ${a.ancora.rotulo}${a.valorFormatado ? `: ${a.valorFormatado}` : ''}`).join(' | ');
    return `${ref} · ${s.tipo} · ${s.indicadores.join(' > ')} · ${s.diretoria ?? 'empresa'} · ${s.direcao}\n  evidência: ${s.evidencia}\n  âncoras: ${ancorasTxt || 'nenhuma'}`;
  });
  return `Recorte: ${descreverRecorte(recorte.periodo, recorte.diretoria ? { diretoria: recorte.diretoria } : {})}.
Público: ${DESCRICAO_LENTE[recorte.lente]}.

Catálogo (id · nome · polaridade):
${catalogo}

Sinais detectados (do mais ao menos relevante para este público):
${sinais.join('\n')}`;
}

// ── Geração ───────────────────────────────────────────────────────────────────

export interface OpcoesGerador {
  /** motor do cubo: o detector de sinais roda nele */
  motor: MotorCliente;
  provedores: readonly Provedor[];
  fetch?: typeof fetch;
  timeoutMs?: number;
  log?: (linha: string) => void;
}

export interface ResultadoLayout {
  spec: LayoutSpec;
  /** por que caiu no determinístico (null = spec da IA aceito) */
  motivo: string | null;
  uso: Uso | null;
  provedor: NomeProvedor | null;
  latenciaMs: number;
}

export async function gerarLayout(recorte: RecorteLayout, opcoes: OpcoesGerador): Promise<ResultadoLayout> {
  const inicio = Date.now();
  const log = opcoes.log ?? ((l: string) => console.info(l));
  const sinais = sinaisDoRecorte(opcoes.motor, recorte);
  const deterministico = (motivo: string, uso: Uso | null = null, provedor: NomeProvedor | null = null): ResultadoLayout => {
    log(`[layout] ${chaveLayout(recorte)}: determinístico (${motivo})`);
    return { spec: layoutDeterministico(recorte, sinais), motivo, uso, provedor, latenciaMs: Date.now() - inicio };
  };
  if (opcoes.provedores.length === 0) return deterministico('sem provedor de IA');
  if (sinais.length === 0) return deterministico('sem sinais no recorte');

  const entrada = prepararEntradaIA(sinais);
  let resposta;
  try {
    resposta = await chamarLLM(
      { mensagens: [{ role: 'system', content: SISTEMA }, { role: 'user', content: mensagemUsuario(recorte, entrada) }], json: true, maxTokens: MAX_TOKENS_SPEC, temperatura: 0.3 },
      { provedores: opcoes.provedores, fetch: opcoes.fetch, timeoutMs: opcoes.timeoutMs, log },
    );
  } catch {
    return deterministico('IA indisponível');
  }
  const { uso, provedor } = resposta;
  let bruto: unknown;
  try {
    bruto = JSON.parse(resposta.texto);
  } catch {
    return deterministico('resposta não é JSON', uso, provedor);
  }
  const errosResposta = validarEsquema(esquemaResposta(entrada), bruto);
  if (errosResposta.length) return deterministico(`resposta fora do schema: ${errosResposta.slice(0, 3).join('; ')}`, uso, provedor);
  const spec = montarSpec(recorte, entrada, bruto as RespostaLayoutIA);
  const errosSpec = validarLayout(spec, sinais);
  if (errosSpec.length) return deterministico(`spec rejeitado: ${errosSpec.slice(0, 3).join('; ')}`, uso, provedor);
  return { spec, motivo: null, uso, provedor, latenciaMs: Date.now() - inicio };
}
