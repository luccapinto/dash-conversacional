/**
 * Detector de sinais: base da camada adaptativa (adendo v3). Para um recorte (período,
 * diretoria opcional, lente de público) calcula, de forma determinística, o que merece
 * destaque. Cada sinal traz tipo, indicador(es), recorte, score em [0, 1], evidência textual
 * curta sem adjetivos e os pontos de dados exatos que a sustentam.
 *
 * Roda sobre qualquer MotorCliente (o cubo basta), então pode rodar no client ou no build.
 *
 * Tipos (limiares em LIMIARES; valores perto de zero usam escala absoluta: eNPS com 50 pontos
 * ≡ 100%, gap salarial com 10 p.p. ≡ 100%):
 *  - fora_da_meta: valor do recorte além da tolerância da meta do catálogo.
 *  - outlier_entre_diretorias: diretoria ≥ 25% pior ou melhor que a mediana das demais.
 *  - quebra_de_tendencia: ponto de mudança de média na série mensal (eNPS: por ciclo) nos
 *    últimos 24 meses, com t ≥ limiar e deslocamento ≥ 20%. Só para fluxos: estoques mudam
 *    devagar e a autocorrelação infla o t.
 *  - piora_acelerada: trimestres móveis piorando, a última piora ≥ 1,5× a anterior.
 *  - sazonalidade: pico no mesmo mês do calendário em todos os anos disponíveis (≥ 5 eventos
 *    em cada pico); quando há sazonalidade, o pico não é lido como quebra nem como piora.
 *  - indicador_antecedente: pares declarados em PARES_ANTECEDENTES, só quando o efeito está
 *    fora da meta ou piorou ≥ 10% sobre os 12 meses anteriores:
 *      · variações: correlação entre as variações mensais da causa em t e do efeito em t+L,
 *        mais forte que sem defasagem;
 *      · mudança de patamar: a causa muda de patamar e o efeito muda 1 a 6 meses depois, no
 *        sentido esperado (degraus, como eNPS → turnover, não se medem bem por correlação).
 */

import { CATALOGO, INDICADORES, type Dominio, type IdIndicador, type Indicador, type Unidade } from './catalog';
import { DIRETORIAS, MESES, mesDoAno, mesIdx, rotuloMes, somarMeses, type Diretoria, type Mes } from './dominio';
import { leituraDe, type MotorCliente, type Periodo, type PontoSerie, type ResultadoValor } from './engine';

export const TIPOS_SINAL = [
  'fora_da_meta',
  'outlier_entre_diretorias',
  'quebra_de_tendencia',
  'piora_acelerada',
  'sazonalidade',
  'indicador_antecedente',
] as const;
export type TipoSinal = (typeof TIPOS_SINAL)[number];

export const LENTES = ['ceo', 'chro', 'gestor'] as const;
export type Lente = (typeof LENTES)[number];

export interface RecorteSinais {
  periodo: Periodo;
  diretoria?: Diretoria;
  /** padrão: gestor quando há diretoria, chro quando não há */
  lente?: Lente;
}

export interface PontoDado {
  indicador: IdIndicador;
  /** null = empresa toda, ou a referência de comparação (ver rótulo) */
  diretoria: Diretoria | null;
  periodo: Periodo;
  rotulo: string;
  valor: number | null;
  n: number;
}

export interface Sinal {
  id: string;
  tipo: TipoSinal;
  indicadores: IdIndicador[];
  diretoria: Diretoria | null;
  periodo: Periodo;
  direcao: 'desfavoravel' | 'favoravel';
  /** score base × peso do domínio na lente */
  score: number;
  scoreBase: number;
  evidencia: string;
  pontos: PontoDado[];
}

/** Peso de cada domínio por público */
export const PESO_LENTE: Record<Lente, Record<Dominio, number>> = {
  ceo: {
    'Força de trabalho': 0.8, Retenção: 1, Atração: 0.6, 'Engajamento & bem-estar': 0.7,
    Desenvolvimento: 0.5, 'Diversidade & equidade': 0.7, Custo: 1,
  },
  chro: {
    'Força de trabalho': 1, Retenção: 1, Atração: 1, 'Engajamento & bem-estar': 1,
    Desenvolvimento: 1, 'Diversidade & equidade': 1, Custo: 1,
  },
  gestor: {
    'Força de trabalho': 0.6, Retenção: 1, Atração: 0.9, 'Engajamento & bem-estar': 1,
    Desenvolvimento: 0.9, 'Diversidade & equidade': 0.7, Custo: 0.5,
  },
};

export const LIMIARES = {
  /** eNPS: diferença de 50 pontos conta como 100% */
  pontosPorCemPorCento: 50,
  /** gap salarial (perto de zero): diferença de 10 p.p. conta como 100% */
  ppGapPorCemPorCento: 10,
  outlier: 0.25,
  quebraT: 4.5,
  quebraTCiclos: 3.5,
  quebra: 0.2,
  quebraJanelaMeses: 24,
  piora: 0.15,
  pioraAceleracao: 1.5,
  sazonalRazao: 1.8,
  sazonalRazaoAnterior: 1.5,
  sazonalEventos: 5,
  antecedenteR: 0.6,
  antecedenteGanho: 0.2,
  antecedenteDefasagemMaxMeses: 6,
  antecedentePiora: 0.1,
} as const;

interface ParAntecedente {
  causa: IdIndicador;
  efeito: IdIndicador;
  /** +1: causa e efeito andam juntos; −1: em sentidos opostos */
  sentido: 1 | -1;
  metodo: 'variacoes' | 'mudanca_de_patamar';
}

export const PARES_ANTECEDENTES: readonly ParAntecedente[] = [
  { causa: 'enps', efeito: 'turnover_voluntario', sentido: -1, metodo: 'mudanca_de_patamar' },
  { causa: 'vagas_abertas', efeito: 'horas_extras_pc', sentido: 1, metodo: 'variacoes' },
  { causa: 'horas_extras_pc', efeito: 'absenteismo', sentido: 1, metodo: 'variacoes' },
];

// ── Estatística pura (exportada para teste) ───────────────────────────────────

export interface PontoDeMudanca {
  /** índice do primeiro ponto do novo patamar */
  indice: number;
  antes: number;
  depois: number;
  t: number;
}

/** Melhor ponto de mudança de média (um corte), com estatística t de duas amostras */
export function pontoDeMudanca(y: readonly number[], minSegmento: number): PontoDeMudanca | null {
  let melhor: PontoDeMudanca | null = null;
  const n = y.length;
  for (let k = minSegmento; k <= n - minSegmento; k++) {
    const a = y.slice(0, k);
    const b = y.slice(k);
    const ma = a.reduce((s, v) => s + v, 0) / a.length;
    const mb = b.reduce((s, v) => s + v, 0) / b.length;
    const ss = a.reduce((s, v) => s + (v - ma) ** 2, 0) + b.reduce((s, v) => s + (v - mb) ** 2, 0);
    const ep = Math.sqrt(ss / Math.max(1, n - 2)) * Math.sqrt(1 / a.length + 1 / b.length);
    const t = ep > 0 ? (mb - ma) / ep : 0;
    if (!melhor || Math.abs(t) > Math.abs(melhor.t)) melhor = { indice: k, antes: ma, depois: mb, t };
  }
  return melhor;
}

export function correlacao(x: readonly number[], y: readonly number[]): number | null {
  const n = Math.min(x.length, y.length);
  if (n < 3) return null;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) { mx += x[i] / n; my += y[i] / n; }
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

/** Correlação entre as variações de x em t e as variações de y em t + L, para L = 0..max */
export function correlacoesDefasadas(x: readonly number[], y: readonly number[], maxDefasagem: number): (number | null)[] {
  const dx = x.slice(1).map((v, i) => v - x[i]);
  const dy = y.slice(1).map((v, i) => v - y[i]);
  const out: (number | null)[] = [];
  for (let L = 0; L <= maxDefasagem; L++) out.push(correlacao(dx.slice(0, dx.length - L), dy.slice(L)));
  return out;
}

/** Três trimestres de piora seguidos, com a última piora ≥ fator × a anterior (valores já em "quanto maior, pior") */
export function pioraAcelerada(q: readonly [number, number, number, number], fator: number): boolean {
  const [q3, q2, q1, q0] = q;
  const e2 = q1 - q2;
  const e3 = q0 - q1;
  return q2 - q3 >= 0 && e2 > 0 && e3 >= fator * e2;
}

// ── Formatação (pt-BR, sem adjetivos) ─────────────────────────────────────────

const UMA_CASA = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export function formatar(valor: number, unidade: Unidade | 'p.p.'): string {
  switch (unidade) {
    case '%': return `${UMA_CASA.format(valor)}%`;
    case '% a.a.': return `${UMA_CASA.format(valor)}% a.a.`;
    case 'p.p.': return `${UMA_CASA.format(valor)} p.p.`;
    case 'pontos': return `${valor > 0 ? '+' : ''}${INTEIRO.format(valor)}`;
    case 'R$': return `R$ ${INTEIRO.format(valor)}`;
    case 'R$/mês': return `R$ ${INTEIRO.format(valor)}/mês`;
    case 'dias': return `${INTEIRO.format(valor)} dias`;
    case 'pessoas': return `${INTEIRO.format(valor)} pessoas`;
    case 'vagas': return `${INTEIRO.format(valor)} vagas`;
    default: return `${UMA_CASA.format(valor)} ${unidade}`;
  }
}

function diferenca(valor: number, unidade: Unidade): string {
  const u = unidade === '%' || unidade === '% a.a.' ? 'p.p.' : unidade;
  return `${valor >= 0 ? '+' : '−'}${formatar(Math.abs(valor), u).replace(/^\+/, '')}`;
}

function rotuloPeriodo(p: Periodo): string {
  return p.inicio === p.fim ? rotuloMes(p.inicio) : `${rotuloMes(p.inicio)} a ${rotuloMes(p.fim)}`;
}

// ── Detector ──────────────────────────────────────────────────────────────────

/** Quanto `para` é pior que `de`, na direção ruim do indicador (positivo = piorou) */
function piora(ind: Indicador, de: number, para: number): number {
  return ind.polaridade === 'maior_melhor' ? de - para : para - de;
}

/** Tamanho de uma diferença: relativa, ou em pontos convertidos (eNPS) */
function distancia(ind: Indicador, x: number, ref: number): number {
  if (ind.unidade === 'pontos') return Math.abs(x - ref) / LIMIARES.pontosPorCemPorCento;
  if (ind.calculo.tipo === 'compa') return Math.abs(x - ref) / LIMIARES.ppGapPorCemPorCento;
  return ref !== 0 ? Math.abs(x - ref) / Math.abs(ref) : 0;
}

/** Eventos (numerador) de um ponto mensal de série */
function eventosDoPonto(ind: Indicador, p: PontoSerie): number {
  const c = ind.calculo;
  const termo = c.tipo === 'razao' ? c.numerador : c.tipo === 'total' ? c.termo : [];
  return termo.reduce((s, [coef, m]) => s + coef * (p.medidas[m] ?? 0), 0);
}

function mediana(v: number[]): number {
  const o = [...v].sort((a, b) => a - b);
  return o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2;
}

export function detectarSinais(motor: MotorCliente, recorte: RecorteSinais): Sinal[] {
  const { periodo } = recorte;
  const lente: Lente = recorte.lente ?? (recorte.diretoria ? 'gestor' : 'chro');
  const historico: Periodo = { inicio: MESES[0], fim: periodo.fim };
  const alvos: (Diretoria | null)[] = recorte.diretoria ? [recorte.diretoria] : [null, ...DIRETORIAS];
  const filtrosDe = (d: Diretoria | null) => (d ? { diretoria: d } : {});
  const onde = (d: Diretoria | null) => (d ? ` em ${d}` : ' na empresa');
  const doValor = (r: ResultadoValor, d: Diretoria | null, p: Periodo, rotulo = rotuloPeriodo(p)): PontoDado =>
    ({ indicador: r.indicador, diretoria: d, periodo: p, rotulo, valor: r.valor, n: r.n });
  const daSerie = (ind: Indicador, d: Diretoria | null, p: PontoSerie): PontoDado =>
    ({ indicador: ind.id, diretoria: d, periodo: p.periodo, rotulo: p.rotulo, valor: p.valor, n: p.n });

  const sinais: Sinal[] = [];
  const emitir = (s: Omit<Sinal, 'id' | 'score' | 'periodo'> & { periodo?: Periodo }) => {
    const peso = PESO_LENTE[lente][CATALOGO[s.indicadores[s.indicadores.length - 1]].dominio];
    sinais.push({
      ...s,
      periodo: s.periodo ?? periodo,
      id: `${s.tipo}:${s.indicadores.join('>')}:${s.diretoria ?? 'empresa'}`,
      score: s.scoreBase * peso,
    });
  };

  /** Efeito relevante: fora da meta, ou piorou sobre os 12 meses anteriores. Devolve a relevância em [0, 1]. */
  function relevanciaDoEfeito(ind: Indicador, d: Diretoria | null): number {
    const agora = motor.valor({ indicador: ind.id, periodo, filtros: filtrosDe(d) });
    if (agora.valor === null) return 0;
    const foraRel = agora.status === 'fora' && ind.meta ? distancia(ind, agora.valor, ind.meta.valor) : 0;
    let pioraRel = 0;
    const inicioAntes = somarMeses(periodo.inicio, -12);
    if (inicioAntes >= MESES[0]) {
      const antes = motor.valor({ indicador: ind.id, periodo: { inicio: inicioAntes, fim: somarMeses(periodo.fim, -12) }, filtros: filtrosDe(d) });
      if (antes.valor !== null && piora(ind, antes.valor, agora.valor) > 0) pioraRel = distancia(ind, agora.valor, antes.valor);
    }
    if (foraRel === 0 && pioraRel < LIMIARES.antecedentePiora) return 0;
    return Math.min(1, Math.max(foraRel, pioraRel) / 0.3);
  }

  function foraDaMeta(ind: Indicador): void {
    if (!ind.meta || (recorte.diretoria && !ind.dimensoes.includes('diretoria'))) return;
    const d = recorte.diretoria ?? null;
    const r = motor.valor({ indicador: ind.id, periodo, filtros: filtrosDe(d) });
    if (r.status !== 'fora' || !r.amostraSuficiente || r.valor === null) return;
    emitir({
      tipo: 'fora_da_meta', indicadores: [ind.id], diretoria: d, direcao: 'desfavoravel',
      scoreBase: Math.min(1, distancia(ind, r.valor, ind.meta.valor) / 0.5),
      evidencia: `${ind.nome}${onde(d)}, ${rotuloPeriodo(periodo)}: ${formatar(r.valor, ind.unidade)}; meta ${formatar(ind.meta.valor, ind.unidade)}; diferença ${diferenca(r.valor - ind.meta.valor, ind.unidade)}.`,
      pontos: [doValor(r, d, periodo)],
    });
  }

  function outliers(ind: Indicador): void {
    if (!ind.dimensoes.includes('diretoria') || ind.calculo.tipo === 'total') return;
    const porDiretoria = DIRETORIAS.map(d => ({ d, r: motor.valor({ indicador: ind.id, periodo, filtros: { diretoria: d } }) }))
      .filter(x => x.r.valor !== null && x.r.amostraSuficiente);
    for (const { d, r } of porDiretoria) {
      if (recorte.diretoria && d !== recorte.diretoria) continue;
      const demais = porDiretoria.filter(x => x.d !== d);
      if (demais.length < 3) continue;
      const ref = mediana(demais.map(x => x.r.valor!));
      const dist = distancia(ind, r.valor!, ref);
      if (dist < LIMIARES.outlier) continue;
      emitir({
        tipo: 'outlier_entre_diretorias', indicadores: [ind.id], diretoria: d,
        direcao: piora(ind, ref, r.valor!) > 0 ? 'desfavoravel' : 'favoravel',
        scoreBase: Math.min(1, dist / 0.75),
        evidencia: `${ind.nome}, ${rotuloPeriodo(periodo)}: ${d} ${formatar(r.valor!, ind.unidade)}; mediana das demais diretorias ${formatar(ref, ind.unidade)}; diferença ${diferenca(r.valor! - ref, ind.unidade)}.`,
        pontos: [
          doValor(r, d, periodo, d),
          ...demais.map(x => doValor(x.r, x.d, periodo, x.d)),
        ],
      });
    }
  }

  function tendencias(ind: Indicador, d: Diretoria | null): void {
    const serie = motor.serie({ indicador: ind.id, periodo: historico, filtros: filtrosDe(d) });
    const validos = serie.pontos.filter(p => p.valor !== null && p.amostraSuficiente);
    const y = validos.map(p => p.valor!);
    const mensal = serie.granularidade === 'mes';

    // sazonalidade: pico no mesmo mês do calendário em todos os anos disponíveis
    let sazonal = false;
    if (mensal) {
      const razao = (i: number): number | null => {
        const m = validos[i].periodo.inicio;
        const base = validos
          .filter(p => p.periodo.inicio < m && mesIdx(m) - mesIdx(p.periodo.inicio) <= 12 && mesDoAno(p.periodo.inicio) !== mesDoAno(m))
          .map(p => p.valor!);
        if (base.length < 3 || eventosDoPonto(ind, validos[i]) < LIMIARES.sazonalEventos) return null;
        const med = mediana(base);
        if (med === 0 || y[i] === 0) return null;
        return ind.polaridade === 'menor_melhor' ? y[i] / med : med / y[i];
      };
      for (let i = Math.max(0, validos.length - 3); i < validos.length && !sazonal; i++) {
        const atual = razao(i);
        if (atual === null || atual < LIMIARES.sazonalRazao) continue;
        const mesmoMes = validos.map((p, j) => ({ p, j })).filter(({ p, j }) => j < i && mesDoAno(p.periodo.inicio) === mesDoAno(validos[i].periodo.inicio));
        if (mesmoMes.length === 0 || !mesmoMes.every(({ j }) => (razao(j) ?? 0) >= LIMIARES.sazonalRazaoAnterior)) continue;
        sazonal = true;
        const picos = [...mesmoMes.map(x => x.p), validos[i]];
        emitir({
          tipo: 'sazonalidade', indicadores: [ind.id], diretoria: d, direcao: 'desfavoravel', periodo: validos[i].periodo,
          scoreBase: Math.min(1, (atual - 1) / 2),
          evidencia: `${ind.nome}${onde(d)}: ${picos.map(p => `${p.rotulo} ${formatar(p.valor!, ind.unidade)}`).join('; ')}; em ${validos[i].rotulo}, ${UMA_CASA.format(atual)}× a mediana dos 12 meses anteriores.`,
          pontos: picos.map(p => daSerie(ind, d, p)),
        });
      }
    }

    // quebra de tendência
    const pm = y.length >= 8 ? pontoDeMudanca(y, mensal ? 4 : 3) : null;
    if (pm && !sazonal) {
      const inicioNovo = validos[pm.indice].periodo.inicio;
      const dist = distancia(ind, pm.depois, pm.antes);
      const recente = mesIdx(periodo.fim) - mesIdx(inicioNovo) < LIMIARES.quebraJanelaMeses;
      if (recente && Math.abs(pm.t) >= (mensal ? LIMIARES.quebraT : LIMIARES.quebraTCiclos) && dist >= LIMIARES.quebra) {
        emitir({
          tipo: 'quebra_de_tendencia', indicadores: [ind.id], diretoria: d,
          direcao: piora(ind, pm.antes, pm.depois) > 0 ? 'desfavoravel' : 'favoravel',
          periodo: { inicio: inicioNovo, fim: periodo.fim },
          scoreBase: Math.min(1, dist / 0.6),
          evidencia: `${ind.nome}${onde(d)}: média de ${formatar(pm.antes, ind.unidade)} de ${validos[0].rotulo} a ${validos[pm.indice - 1].rotulo} e de ${formatar(pm.depois, ind.unidade)} de ${validos[pm.indice].rotulo} a ${validos[validos.length - 1].rotulo} (t = ${UMA_CASA.format(pm.t)}).`,
          pontos: validos.map(p => daSerie(ind, d, p)),
        });
      }
    }

    // piora acelerada: trimestres móveis terminando no fim do período
    if (sazonal || somarMeses(periodo.fim, -11) < MESES[0]) return;
    const trimestres = [9, 6, 3, 0].map(k => {
      const p: Periodo = { inicio: somarMeses(periodo.fim, -k - 2), fim: somarMeses(periodo.fim, -k) };
      return { p, r: motor.valor({ indicador: ind.id, periodo: p, filtros: filtrosDe(d) }) };
    });
    if (!trimestres.every(q => q.r.valor !== null && q.r.amostraSuficiente)) return;
    const sinal = ind.polaridade === 'maior_melhor' ? -1 : 1;
    const q = trimestres.map(x => sinal * x.r.valor!) as [number, number, number, number];
    const total = distancia(ind, trimestres[3].r.valor!, trimestres[1].r.valor!);
    if (pioraAcelerada(q, LIMIARES.pioraAceleracao) && total >= LIMIARES.piora) {
      emitir({
        tipo: 'piora_acelerada', indicadores: [ind.id], diretoria: d, direcao: 'desfavoravel',
        periodo: { inicio: trimestres[0].p.inicio, fim: periodo.fim },
        scoreBase: Math.min(1, total / 0.5),
        evidencia: `${ind.nome}${onde(d)}, trimestres móveis: ${trimestres.map(x => `${rotuloPeriodo(x.p)} ${formatar(x.r.valor!, ind.unidade)}`).join('; ')}.`,
        pontos: trimestres.map(x => doValor(x.r, d, x.p)),
      });
    }
  }

  function antecedente(par: ParAntecedente, d: Diretoria | null): void {
    const causa = CATALOGO[par.causa];
    const efeito = CATALOGO[par.efeito];
    const relevancia = relevanciaDoEfeito(efeito, d);
    if (relevancia === 0) return;
    const filtros = filtrosDe(d);

    if (par.metodo === 'mudanca_de_patamar') {
      const sc = motor.serie({ indicador: causa.id, periodo: historico, filtros }).pontos.filter(p => p.valor !== null && p.amostraSuficiente);
      const se = motor.serie({ indicador: efeito.id, periodo: historico, filtros }).pontos.filter(p => p.valor !== null && p.amostraSuficiente);
      const mc = sc.length >= 6 ? pontoDeMudanca(sc.map(p => p.valor!), 3) : null;
      const me = se.length >= 8 ? pontoDeMudanca(se.map(p => p.valor!), 4) : null;
      if (!mc || !me) return;
      const quebraCausa = Math.abs(mc.t) >= LIMIARES.quebraTCiclos && distancia(causa, mc.depois, mc.antes) >= LIMIARES.quebra;
      const quebraEfeito = Math.abs(me.t) >= LIMIARES.quebraT && distancia(efeito, me.depois, me.antes) >= LIMIARES.quebra;
      const sentido = Math.sign(mc.depois - mc.antes) * Math.sign(me.depois - me.antes);
      // o ciclo de eNPS é medido no último mês do trimestre
      const mesCausa: Mes = sc[mc.indice].periodo.fim;
      const mesEfeito: Mes = se[me.indice].periodo.inicio;
      const defasagem = mesIdx(mesEfeito) - mesIdx(mesCausa);
      if (!quebraCausa || !quebraEfeito || sentido !== par.sentido || defasagem < 1 || defasagem > LIMIARES.antecedenteDefasagemMaxMeses) return;
      emitir({
        tipo: 'indicador_antecedente', indicadores: [causa.id, efeito.id], diretoria: d, direcao: 'desfavoravel', periodo: historico,
        scoreBase: Math.min(1, distancia(efeito, me.depois, me.antes) / 0.6) * relevancia,
        evidencia: `${causa.nome}${onde(d)} mudou de patamar em ${rotuloMes(mesCausa)} (média de ${formatar(mc.antes, causa.unidade)} para ${formatar(mc.depois, causa.unidade)}); ${efeito.nome} mudou em ${rotuloMes(mesEfeito)} (de ${formatar(me.antes, efeito.unidade)} para ${formatar(me.depois, efeito.unidade)}), ${defasagem} ${defasagem === 1 ? 'mês' : 'meses'} depois.`,
        pontos: [...sc.map(p => daSerie(causa, d, p)), ...se.map(p => daSerie(efeito, d, p))],
      });
      return;
    }

    const sx = motor.serie({ indicador: causa.id, periodo: historico, filtros, granularidade: 'mes' }).pontos;
    const sy = motor.serie({ indicador: efeito.id, periodo: historico, filtros, granularidade: 'mes' }).pontos;
    const pares = sx.map((p, i) => [p, sy[i]] as const).filter(([a, b]) => a.valor !== null && b.valor !== null);
    if (pares.length < 12) return;
    const rs = correlacoesDefasadas(pares.map(([a]) => a.valor!), pares.map(([, b]) => b.valor!), 3);
    const r0 = rs[0] ?? 0;
    let melhor = 0;
    for (let L = 1; L < rs.length; L++) {
      const r = rs[L];
      if (r !== null && Math.sign(r) === par.sentido && Math.abs(r) > Math.abs(rs[melhor] ?? 0)) melhor = L;
    }
    const rL = rs[melhor];
    if (melhor === 0 || rL === null || Math.abs(rL) < LIMIARES.antecedenteR) return;
    if (Math.abs(rL) - (Math.sign(r0) === par.sentido ? Math.abs(r0) : 0) < LIMIARES.antecedenteGanho) return;
    emitir({
      tipo: 'indicador_antecedente', indicadores: [causa.id, efeito.id], diretoria: d, direcao: 'desfavoravel', periodo: historico,
      scoreBase: Math.abs(rL) * relevancia,
      evidencia: `${causa.nome} e ${efeito.nome}${onde(d)}: correlação entre as variações mensais com ${melhor} ${melhor === 1 ? 'mês' : 'meses'} de defasagem r = ${UMA_CASA.format(rL)}; sem defasagem r = ${UMA_CASA.format(r0)} (${pares[0][0].rotulo} a ${pares[pares.length - 1][0].rotulo}).`,
      pontos: pares.flatMap(([a, b]) => [daSerie(causa, d, a), daSerie(efeito, d, b)]),
    });
  }

  for (const ind of INDICADORES) {
    if (ind.polaridade === 'neutro') continue;
    foraDaMeta(ind);
    outliers(ind);
    // tendências só em fluxos: estoques mudam devagar e a autocorrelação infla o t
    const leitura = leituraDe(ind);
    if (leitura !== 'soma dos meses' && leitura !== 'ciclos de eNPS') continue;
    for (const d of alvos) if (d === null || ind.dimensoes.includes('diretoria')) tendencias(ind, d);
  }
  for (const par of PARES_ANTECEDENTES) for (const d of alvos) antecedente(par, d);

  return sinais.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
