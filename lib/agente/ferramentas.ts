/**
 * Tools do agente = motor da fase 1, sem uma tool por métrica: os parâmetros são os schemas JSON
 * de lib/analytics/schemas.ts e a validação é o mesmo `validarArgs`. Mais três tools:
 * `listarIndicadores` (ficha do catálogo), `sinais` (detector da fase 1 para um recorte) e
 * `mostrar` (escolhe quais resultados viram bloco de visualização; não recebe números).
 *
 * Cada chamada ganha um id (r1, r2…) antes de rodar, para o passo aparecer no stream na hora. O
 * resultado bruto fica no servidor (blocos, rastro); o modelo recebe um resumo com números
 * arredondados e destaques calculados aqui (maior/menor segmento, razão, variação), para que ele
 * não precise fazer conta. A guarda de números confere o texto contra esses resumos.
 *
 * Argumento inválido, JSON quebrado, ferramenta desconhecida ou regra do motor (ErroConsulta)
 * voltam ao modelo como `{ erro }` legível, para ele se corrigir. Nunca lançam.
 */

import { CATALOGO, DOMINIOS, INDICADORES, type Dominio, type IdIndicador, type Unidade } from '@/lib/analytics/catalog';
import { DIRETORIAS, type Diretoria } from '@/lib/analytics/dominio';
import {
  ErroConsulta,
  type Motor,
  type MotorCliente,
  type NomeFuncao,
  type Periodo,
  type Rastreio,
  type ResultadoComparar,
  type ResultadoCruzar,
  type ResultadoDecompor,
  type ResultadoDrivers,
  type ResultadoImpacto,
  type ResultadoSerie,
  type ResultadoValor,
} from '@/lib/analytics/engine';
import { DESCRICAO_DIMENSAO, type Dimensao, type Filtros } from '@/lib/analytics/fatos';
import { ESQUEMAS_ARGUMENTOS, validarArgs, validarEsquema, type JsonSchema } from '@/lib/analytics/schemas';
import { detectarSinais, LENTES, type Lente, type Sinal } from '@/lib/analytics/signals';
import { ErroBloco, montarBloco } from './blocos';
import { NOMES_FERRAMENTAS, TIPOS_BLOCO, type BlocoVisualizacao, type ItemRastro, type NomeFerramenta, type TipoBloco } from './contrato';
import type { ChamadaFerramenta, DefinicaoFerramenta } from './llm';
import { descreverRecorte, rotuloPeriodo } from './rotulos';

// ── Definições ────────────────────────────────────────────────────────────────

const FUNCOES_MOTOR: readonly NomeFuncao[] = ['valor', 'serie', 'decompor', 'cruzar', 'comparar', 'drivers', 'impacto'];
const { indicador: INDICADOR, periodo: PERIODO } = ESQUEMAS_ARGUMENTOS.valor.properties!;

const ESQUEMAS_EXTRAS: Record<'listarIndicadores' | 'sinais' | 'mostrar', JsonSchema> = {
  listarIndicadores: {
    type: 'object',
    description:
      'Ficha de indicadores do catálogo: pergunta que responde, fórmula, unidade, polaridade, meta, dimensões de recorte válidas e se tem drivers e custo. Filtre por domínio ou indicador.',
    properties: { dominio: { type: 'string', enum: DOMINIOS }, indicador: INDICADOR },
    additionalProperties: false,
  },
  sinais: {
    type: 'object',
    description:
      'Sinais detectados automaticamente num recorte (fora da meta, outlier entre diretorias, quebra de tendência, piora acelerada, sazonalidade, indicador antecedente), do mais ao menos relevante para o público, com evidência numérica.',
    properties: {
      periodo: PERIODO,
      diretoria: { type: 'string', enum: DIRETORIAS, description: 'sem diretoria: empresa toda e comparação entre diretorias' },
      lente: { type: 'string', enum: LENTES, description: 'público: ceo, chro ou gestor' },
    },
    required: ['periodo'],
    additionalProperties: false,
  },
  mostrar: {
    type: 'object',
    description:
      'Exibe resultados já obtidos como visualização para o usuário (o servidor monta o gráfico com os números do resultado). Chame depois de ter os dados e antes da resposta final, com 1 a 3 resultados que sustentam a conclusão.',
    properties: {
      blocos: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            resultado: { type: 'string', maxLength: 8, description: 'id de um resultado anterior (ex.: r2)' },
            tipo: { type: 'string', enum: TIPOS_BLOCO, description: 'opcional: kpi (valor, impacto), serie ou tabela (serie), barras ou tabela (decompor), tabela (cruzar, drivers), comparacao (comparar)' },
          },
          required: ['resultado'],
          additionalProperties: false,
        },
      },
    },
    required: ['blocos'],
    additionalProperties: false,
  },
};

const ESQUEMAS: Record<NomeFerramenta, JsonSchema> = { ...ESQUEMAS_ARGUMENTOS, ...ESQUEMAS_EXTRAS };

export const DEFINICOES_FERRAMENTAS: DefinicaoFerramenta[] = NOMES_FERRAMENTAS.map(nome => {
  const { description, ...parameters } = ESQUEMAS[nome];
  return { type: 'function', function: { name: nome, description: description ?? nome, parameters } };
});

// ── Resumos para o modelo ─────────────────────────────────────────────────────

/** 2 casas abaixo de 100, 1 casa até 1.000, inteiro acima */
function arred(v: number | null): number | null {
  if (v === null || !Number.isFinite(v)) return null;
  const a = Math.abs(v);
  const f = a >= 1000 ? 1 : a >= 100 ? 10 : 100;
  return Math.round(v * f) / f;
}

const pct = (fracao: number | null) => (fracao === null ? null : arred(fracao * 100));
const unidadeDiferenca = (u: Unidade) => (u === '%' || u === '% a.a.' ? 'p.p.' : u);
const segmentoCurto = (s: Partial<Record<Dimensao, string>>) => Object.entries(s).map(([d, v]) => `${d}=${v}`).join(' + ');

interface Item {
  rotulo: string;
  valor: number;
}

/** Maior e menor item com amostra suficiente, razão e diferença entre eles */
function destaques(itens: Item[], unidade: Unidade) {
  if (itens.length < 2) return null;
  const ordenados = [...itens].sort((a, b) => b.valor - a.valor);
  const [maior, menor] = [ordenados[0], ordenados[ordenados.length - 1]];
  return {
    maior: { segmento: maior.rotulo, valor: arred(maior.valor) },
    menor: { segmento: menor.rotulo, valor: arred(menor.valor) },
    razaoMaiorMenor: menor.valor > 0 && maior.valor > 0 ? arred(maior.valor / menor.valor) : null,
    diferencaMaiorMenor: arred(maior.valor - menor.valor),
    unidadeDiferenca: unidadeDiferenca(unidade),
  };
}

function resumoValor(id: string, d: ResultadoValor) {
  const ind = CATALOGO[d.indicador];
  const { filtros } = d.rastreio.parametros as { filtros?: Filtros };
  const calc = ind.calculo;
  // eventos do numerador (saídas, promoções…): as somas do rastreio já estão na janela de cada termo
  const eventos = ind.evento && calc.tipo === 'razao' ? calc.numerador.reduce((s, [coef, m]) => s + coef * (d.rastreio.medidas[m] ?? 0), 0) : null;
  return {
    id,
    indicador: d.indicador,
    nome: ind.nome,
    periodo: rotuloPeriodo(d.rastreio.periodoEfetivo),
    filtros,
    valor: arred(d.valor),
    unidade: d.unidade,
    meta: d.meta,
    status: d.status,
    n: d.n,
    ...(eventos !== null ? { eventos } : {}),
    ...(d.meta !== null && d.valor !== null
      ? { distanciaDaMeta: arred(d.valor - d.meta), unidadeDistancia: unidadeDiferenca(d.unidade), ...(d.meta > 0 && d.valor > 0 ? { razaoMeta: arred(d.valor / d.meta) } : {}) }
      : {}),
    ...(d.amostraSuficiente ? {} : { aviso: `amostra abaixo de ${d.rastreio.amostraMinima}: leitura frágil` }),
  };
}

function resumoSerie(id: string, d: ResultadoSerie) {
  const ind = CATALOGO[d.indicador];
  const { filtros, periodo } = d.rastreio.parametros as { filtros?: Filtros; periodo: Periodo };
  const validos = d.pontos.filter(p => p.valor !== null) as Array<(typeof d.pontos)[number] & { valor: number }>;
  let resumo = null;
  if (validos.length) {
    const [primeiro, ultimo] = [validos[0], validos[validos.length - 1]];
    const ordem = [...validos].sort((a, b) => b.valor - a.valor);
    resumo = {
      primeiro: { rotulo: primeiro.rotulo, valor: arred(primeiro.valor) },
      ultimo: { rotulo: ultimo.rotulo, valor: arred(ultimo.valor) },
      maximo: { rotulo: ordem[0].rotulo, valor: arred(ordem[0].valor) },
      minimo: { rotulo: ordem[ordem.length - 1].rotulo, valor: arred(ordem[ordem.length - 1].valor) },
      mediaDosPontos: arred(validos.reduce((s, p) => s + p.valor, 0) / validos.length),
      variacao: arred(ultimo.valor - primeiro.valor),
      unidadeVariacao: unidadeDiferenca(d.unidade),
      variacaoRelativaPct: primeiro.valor !== 0 ? arred(((ultimo.valor - primeiro.valor) / Math.abs(primeiro.valor)) * 100) : null,
    };
  }
  return {
    id,
    indicador: d.indicador,
    nome: ind.nome,
    recorte: descreverRecorte(periodo, filtros),
    unidade: d.unidade,
    granularidade: d.granularidade,
    meta: ind.meta?.valor ?? null,
    pontos: d.pontos.map(p => ({ rotulo: p.rotulo, valor: arred(p.valor), n: p.n, ...(p.amostraSuficiente ? {} : { amostraInsuficiente: true }) })),
    resumo,
  };
}

function resumoDecompor(id: string, d: ResultadoDecompor) {
  const { filtros } = d.rastreio.parametros as { filtros?: Filtros };
  return {
    id,
    indicador: d.indicador,
    nome: CATALOGO[d.indicador].nome,
    dimensao: d.dimensao,
    recorte: descreverRecorte(d.rastreio.periodoEfetivo, filtros),
    unidade: d.unidade,
    total: { valor: arred(d.total.valor), n: d.total.n },
    segmentos: d.segmentos.map(s => ({
      segmento: s.segmento,
      valor: arred(s.valor),
      n: s.n,
      pesoPct: pct(s.peso),
      composicaoPct: pct(s.composicao),
      ...(s.amostraSuficiente ? {} : { amostraInsuficiente: true }),
    })),
    destaques: destaques(d.segmentos.filter(s => s.amostraSuficiente && s.valor !== null).map(s => ({ rotulo: s.segmento, valor: s.valor! })), d.unidade),
  };
}

const MAX_CELULAS = 60;

function resumoCruzar(id: string, d: ResultadoCruzar) {
  const { filtros } = d.rastreio.parametros as { filtros?: Filtros };
  const rotulo = (c: (typeof d.celulas)[number]) => d.dimensoes.map(x => c.segmento[x]).join(' · ');
  const celulas = [...d.celulas].sort((a, b) => b.n - a.n);
  return {
    id,
    indicador: d.indicador,
    nome: CATALOGO[d.indicador].nome,
    dimensoes: d.dimensoes,
    recorte: descreverRecorte(d.rastreio.periodoEfetivo, filtros),
    unidade: d.unidade,
    total: { valor: arred(d.total.valor), n: d.total.n },
    celulas: celulas.slice(0, MAX_CELULAS).map(c => ({
      segmento: rotulo(c),
      valor: arred(c.valor),
      n: c.n,
      composicaoPct: pct(c.composicao),
      ...(c.amostraSuficiente ? {} : { amostraInsuficiente: true }),
    })),
    ...(celulas.length > MAX_CELULAS ? { celulasOmitidas: celulas.length - MAX_CELULAS } : {}),
    destaques: destaques(d.celulas.filter(c => c.amostraSuficiente && c.valor !== null).map(c => ({ rotulo: rotulo(c), valor: c.valor! })), d.unidade),
  };
}

function resumoComparar(id: string, d: ResultadoComparar) {
  const { a, b } = d.rastreio.parametros as { a: { periodo: Periodo; filtros?: Filtros }; b: { periodo: Periodo; filtros?: Filtros } };
  const lado = (r: ResultadoValor, rec: { periodo: Periodo; filtros?: Filtros }) => ({
    recorte: descreverRecorte(r.rastreio.periodoEfetivo, rec.filtros),
    valor: arred(r.valor),
    n: r.n,
    status: r.status,
    ...(r.amostraSuficiente ? {} : { amostraInsuficiente: true }),
  });
  const razao = d.a.valor !== null && d.b.valor ? d.a.valor / d.b.valor : null;
  return {
    id,
    indicador: d.indicador,
    nome: CATALOGO[d.indicador].nome,
    unidade: d.unidade,
    a: lado(d.a, a),
    b: lado(d.b, b),
    diferenca: arred(d.diferenca),
    unidadeDiferenca: d.unidadeDiferenca,
    variacaoRelativaPct: arred(d.variacaoRelativa),
    razaoAB: razao !== null && razao > 0 ? arred(razao) : null,
    melhor: d.melhor,
  };
}

function resumoDrivers(id: string, d: ResultadoDrivers) {
  const { filtros } = d.rastreio.parametros as { filtros?: Filtros };
  const fator = (f: ResultadoDrivers['fatoresDeRisco'][number]) => ({ segmento: segmentoCurto(f.segmento), valor: arred(f.valor), lift: arred(f.lift), eventos: f.eventos, n: f.n });
  return {
    id,
    indicador: d.indicador,
    nome: CATALOGO[d.indicador].nome,
    recorte: descreverRecorte(d.rastreio.periodoEfetivo, filtros),
    unidade: d.unidade,
    total: { valor: arred(d.total.valor), n: d.total.n },
    fatoresDeRisco: d.fatoresDeRisco.map(fator),
    fatoresProtetivos: d.fatoresProtetivos.map(fator),
    combinacoes: d.combinacoes.map(fator),
    metodo: d.metodo,
    aviso: d.aviso,
  };
}

function resumoImpacto(id: string, d: ResultadoImpacto) {
  const { filtros } = d.rastreio.parametros as { filtros?: Filtros };
  const meses = d.rastreio.periodoEfetivo.meses;
  return {
    id,
    indicador: d.indicador,
    nome: CATALOGO[d.indicador].nome,
    recorte: descreverRecorte(d.rastreio.periodoEfetivo, filtros),
    aplicavel: d.aplicavel,
    valor: d.valor === null ? null : Math.round(d.valor),
    unidade: 'R$',
    ...(d.valor !== null && meses > 0 ? { mediaMensal: Math.round(d.valor / meses), meses } : {}),
    metodologia: d.metodologia,
  };
}

function resumoMotor(funcao: NomeFuncao, id: string, dados: unknown) {
  switch (funcao) {
    case 'valor': return resumoValor(id, dados as ResultadoValor);
    case 'serie': return resumoSerie(id, dados as ResultadoSerie);
    case 'decompor': return resumoDecompor(id, dados as ResultadoDecompor);
    case 'cruzar': return resumoCruzar(id, dados as ResultadoCruzar);
    case 'comparar': return resumoComparar(id, dados as ResultadoComparar);
    case 'drivers': return resumoDrivers(id, dados as ResultadoDrivers);
    case 'impacto': return resumoImpacto(id, dados as ResultadoImpacto);
  }
}

// ── Sinais (cache por recorte: o detector percorre o catálogo inteiro) ─────────

const MAX_CACHE_SINAIS = 64;
const cacheSinais = new Map<string, Sinal[]>();

function sinaisDe(motor: MotorCliente, periodo: Periodo, diretoria: Diretoria | undefined, lente: Lente | undefined): Sinal[] {
  const chave = `${periodo.inicio}|${periodo.fim}|${diretoria ?? ''}|${lente ?? ''}`;
  let sinais = cacheSinais.get(chave);
  if (!sinais) {
    sinais = detectarSinais(motor, { periodo, diretoria, lente });
    if (cacheSinais.size >= MAX_CACHE_SINAIS) cacheSinais.delete(cacheSinais.keys().next().value!);
    cacheSinais.set(chave, sinais);
  }
  return sinais;
}

// ── Rótulos dos passos ────────────────────────────────────────────────────────

function rotuloDe(nome: string, args: unknown): string {
  const a = (args && typeof args === 'object' ? args : {}) as {
    indicador?: string; periodo?: Periodo; filtros?: Filtros; dimensao?: Dimensao; dimensoes?: Dimensao[]; diretoria?: string;
    a?: { periodo?: Periodo; filtros?: Filtros }; b?: { periodo?: Periodo; filtros?: Filtros };
  };
  const ind = (CATALOGO as Record<string, { nome: string } | undefined>)[a.indicador ?? '']?.nome ?? 'indicador';
  const recorte = (p?: Periodo, f?: Filtros) => (p?.inicio && p?.fim ? descreverRecorte(p, f) : 'recorte');
  const dim = (d?: Dimensao) => (d && DESCRICAO_DIMENSAO[d]) || 'dimensão';
  switch (nome) {
    case 'listarIndicadores': return 'Consultando o catálogo de indicadores';
    case 'valor': return `Calculando ${ind} · ${recorte(a.periodo, a.filtros)}`;
    case 'serie': return `Montando a série de ${ind} · ${recorte(a.periodo, a.filtros)}`;
    case 'decompor': return `Decompondo ${ind} por ${dim(a.dimensao)}`;
    case 'cruzar': return `Cruzando ${ind} por ${dim(a.dimensoes?.[0])} e ${dim(a.dimensoes?.[1])}`;
    case 'comparar': return `Comparando ${ind}: ${recorte(a.a?.periodo, a.a?.filtros)} × ${recorte(a.b?.periodo, a.b?.filtros)}`;
    case 'drivers': return `Buscando fatores de risco e de proteção de ${ind}`;
    case 'impacto': return `Estimando o custo de ${ind}`;
    case 'sinais': return `Procurando sinais em ${a.diretoria ?? 'toda a empresa'}`;
    case 'mostrar': return 'Montando a visualização';
    default: return `Consultando ${nome}`;
  }
}

// ── Sessão (uma por pergunta) ─────────────────────────────────────────────────

export interface AmbienteFerramentas {
  /** motor do servidor (roster): todas as dimensões + drivers */
  motor: Motor;
  /** motor do cubo: o detector de sinais roda nele (mesmos números por diretoria, bem mais rápido) */
  motorSinais: MotorCliente;
  log?: (linha: string) => void;
}

export interface ChamadaPreparada {
  id: string;
  ferramenta: string;
  rotulo: string;
  args: unknown;
  /** argumentos não eram JSON válido (args guarda o texto cru) */
  jsonInvalido: boolean;
  /** id da tool call do provedor, para a mensagem de resultado */
  idChamada: string;
}

export interface ResultadoFerramenta {
  id: string;
  ferramenta: string;
  rotulo: string;
  idChamada: string;
  /** resolvidos pelo motor quando ok; como chegaram quando não */
  argumentos: unknown;
  ok: boolean;
  erro?: string;
  /** resultado bruto do motor (ou lista de sinais), só no servidor */
  dados?: unknown;
  /** o que vai para o modelo, em JSON */
  paraModelo: unknown;
  /** blocos que esta chamada exibiu (só `mostrar`) */
  blocos?: BlocoVisualizacao[];
  duracaoMs: number;
}

export interface SessaoFerramentas {
  preparar(chamada: ChamadaFerramenta): ChamadaPreparada;
  executar(p: ChamadaPreparada): Promise<ResultadoFerramenta>;
  /** em ordem de id */
  resultados(): ResultadoFerramenta[];
  /** blocos exibidos via `mostrar`, em ordem, sem repetição */
  blocos(): BlocoVisualizacao[];
  rastro(): ItemRastro[];
}

export function criarSessao(amb: AmbienteFerramentas): SessaoFerramentas {
  const log = amb.log ?? ((l: string) => console.warn(l));
  const porId = new Map<string, ResultadoFerramenta>();
  const exibidos = new Map<string, BlocoVisualizacao>();
  let contador = 0;
  const resultados = () => [...porId.values()].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));

  /** Lança ErroConsulta para argumento inválido; `erro` no retorno = `mostrar` com parte dos pedidos recusada */
  function rodar(nome: NomeFerramenta, args: unknown, id: string): Pick<ResultadoFerramenta, 'dados' | 'paraModelo' | 'argumentos' | 'blocos' | 'erro'> {
    if ((FUNCOES_MOTOR as readonly string[]).includes(nome)) {
      const funcao = nome as NomeFuncao;
      const v = validarArgs(funcao, args);
      if (!v.ok) throw new ErroConsulta(`Argumentos inválidos para ${funcao}: ${v.erros.join('; ')}.`);
      const dados = (amb.motor[funcao] as (a: unknown) => { rastreio: Rastreio })(v.args);
      return { dados, paraModelo: resumoMotor(funcao, id, dados), argumentos: { indicador: dados.rastreio.indicador, ...dados.rastreio.parametros } };
    }
    const erros = validarEsquema(ESQUEMAS[nome], args);
    if (erros.length) throw new ErroConsulta(`Argumentos inválidos para ${nome}: ${erros.join('; ')}.`);

    if (nome === 'listarIndicadores') {
      const { dominio, indicador } = args as { dominio?: Dominio; indicador?: IdIndicador };
      const lista = INDICADORES.filter(i => (!dominio || i.dominio === dominio) && (!indicador || i.id === indicador));
      const indicadores = lista.map(i => ({
        id: i.id, nome: i.nome, dominio: i.dominio, pergunta: i.pergunta, formula: i.formula, unidade: i.unidade, polaridade: i.polaridade,
        meta: i.meta?.valor ?? null, benchmark: i.benchmark?.valor ?? null, granularidade: i.granularidade,
        dimensoes: amb.motor.dimensoes(i.id), drivers: i.evento, custo: Boolean(i.impacto), explicacao: i.explicacao,
      }));
      return { dados: indicadores, paraModelo: { id, indicadores }, argumentos: args };
    }

    if (nome === 'sinais') {
      const { periodo, diretoria, lente } = args as { periodo: Periodo; diretoria?: Diretoria; lente?: Lente };
      if (periodo.inicio > periodo.fim) throw new ErroConsulta(`Período invertido: ${periodo.inicio} é depois de ${periodo.fim}.`);
      const sinais = sinaisDe(amb.motorSinais, periodo, diretoria, lente);
      return {
        dados: sinais,
        argumentos: args,
        paraModelo: {
          id,
          recorte: descreverRecorte(periodo, diretoria ? { diretoria } : {}),
          lente: lente ?? (diretoria ? 'gestor' : 'chro'),
          total: sinais.length,
          sinais: sinais.slice(0, 10).map(s => ({
            id: s.id, tipo: s.tipo, indicadores: s.indicadores, diretoria: s.diretoria, direcao: s.direcao, relevancia: arred(s.score), evidencia: s.evidencia,
          })),
        },
      };
    }

    // mostrar
    const { blocos: pedidos } = args as { blocos: Array<{ resultado: string; tipo?: TipoBloco }> };
    const novos: BlocoVisualizacao[] = [];
    const recusas: string[] = [];
    for (const p of pedidos) {
      const r = porId.get(p.resultado);
      if (!r) {
        recusas.push(`o resultado ${p.resultado} não existe (disponíveis: ${[...porId.keys()].join(', ') || 'nenhum'})`);
        continue;
      }
      if (!r.ok) {
        recusas.push(`${p.resultado} falhou; não há o que exibir`);
        continue;
      }
      try {
        const bloco = montarBloco({ id: r.id, ferramenta: r.ferramenta as NomeFerramenta, dados: r.dados }, p.tipo);
        if (!exibidos.has(bloco.id)) {
          exibidos.set(bloco.id, bloco);
          novos.push(bloco);
        }
      } catch (e) {
        if (!(e instanceof ErroBloco)) throw e;
        recusas.push(e.message);
      }
    }
    const erro = recusas.length ? `Não foi possível exibir: ${recusas.join('; ')}.` : undefined;
    return {
      dados: null,
      argumentos: args,
      blocos: novos,
      erro,
      paraModelo: { id, exibidos: novos.map(b => ({ resultado: b.resultado, tipo: b.tipo, titulo: b.titulo })), ...(erro ? { erro } : {}) },
    };
  }

  return {
    preparar(chamada) {
      const id = `r${++contador}`;
      const bruto = chamada.function.arguments.trim();
      let args: unknown = bruto;
      let jsonInvalido = false;
      try {
        args = bruto ? JSON.parse(bruto) : {};
      } catch {
        jsonInvalido = true;
      }
      return { id, ferramenta: chamada.function.name, rotulo: rotuloDe(chamada.function.name, jsonInvalido ? {} : args), args, jsonInvalido, idChamada: chamada.id };
    },

    async executar(p) {
      const inicio = performance.now();
      const base = { id: p.id, ferramenta: p.ferramenta, rotulo: p.rotulo, idChamada: p.idChamada };
      let resultado: ResultadoFerramenta;
      try {
        if (p.jsonInvalido) throw new ErroConsulta('Os argumentos não são um JSON válido. Envie um objeto JSON conforme o schema da ferramenta.');
        if (!(NOMES_FERRAMENTAS as readonly string[]).includes(p.ferramenta)) {
          throw new ErroConsulta(`Ferramenta desconhecida: "${p.ferramenta}". Ferramentas disponíveis: ${NOMES_FERRAMENTAS.join(', ')}.`);
        }
        const r = rodar(p.ferramenta as NomeFerramenta, p.args, p.id);
        resultado = { ...base, ...r, ok: !r.erro, duracaoMs: Math.round(performance.now() - inicio) };
      } catch (e) {
        const legivel = e instanceof ErroConsulta;
        if (!legivel) log(`[agente] erro interno em ${p.ferramenta}: ${e instanceof Error ? e.message : String(e)}`);
        const erro = legivel ? e.message : 'Erro interno ao calcular. Tente outra consulta.';
        resultado = {
          ...base,
          argumentos: p.args,
          ok: false,
          erro,
          paraModelo: { id: p.id, erro, dica: 'Corrija e tente de novo, ou siga sem este dado.' },
          duracaoMs: Math.round(performance.now() - inicio),
        };
      }
      porId.set(p.id, resultado);
      return resultado;
    },

    resultados,

    blocos() {
      return [...exibidos.values()];
    },

    rastro() {
      return resultados().map(r => {
        const rastreio = (r.ok && r.dados && typeof r.dados === 'object' && 'rastreio' in r.dados ? (r.dados as { rastreio: Rastreio }).rastreio : null);
        return {
          resultado: r.id,
          ferramenta: r.ferramenta,
          rotulo: r.rotulo,
          argumentos: r.argumentos,
          ok: r.ok,
          ...(r.erro ? { erro: r.erro } : {}),
          ...(rastreio ? { formula: rastreio.formula, n: rastreio.n, periodoEfetivo: rastreio.periodoEfetivo, fonte: rastreio.fonte } : {}),
          duracaoMs: r.duracaoMs,
        };
      });
    },
  };
}
