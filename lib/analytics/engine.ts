/**
 * Motor de consulta genérico: funções puras que funcionam para QUALQUER indicador do catálogo,
 * sobre qualquer fonte de fatos.
 *
 * Lado de cada função (a fonte define o que é possível; o código é o mesmo):
 *  - client (lib/analytics/cliente.ts, sobre o cubo mês × diretoria × senioridade):
 *      valor, serie, decompor, cruzar, comparar, impacto — recortes por diretoria e senioridade.
 *  - servidor (lib/analytics/servidor.ts, `server-only`, sobre o roster individual):
 *      as mesmas funções em todas as dimensões do catálogo + drivers (lift multivariado).
 *
 * Todo resultado carrega `rastreio` (indicador, fórmula, parâmetros, período efetivo, n e as
 * somas usadas no cálculo) para o "Como calculei", e todo recorte traz o guardrail de amostra:
 * recorte de pessoas abaixo de MIN_AMOSTRA não devolve número (ver `Supressao`).
 * Nenhuma função arredonda: a formatação é da UI.
 */

import {
  CATALOGO,
  amostraDe,
  somarTermo,
  type Agregado,
  type Calculo,
  type IdIndicador,
  type Indicador,
  type JanelaTermo,
  type Termo,
  type Unidade,
} from './catalog';
import { ehCicloEnps, intervaloMeses, mesDoAno, MESES, rotuloMes, type Mes } from './dominio';
import {
  VALORES_DIMENSAO,
  agregar,
  dimensoesDaMedida,
  medidasZeradas,
  type Dimensao,
  type Filtros,
  type Fonte,
  type Medida,
  type Medidas,
} from './fatos';

/**
 * Abaixo disso a fatia é frágil (pessoas, respostas ou vagas). Se a amostra conta pessoas, o
 * recorte não é divulgado: valor, n e somas saem vazios, com o motivo e o mínimo (k-anonimato).
 * Cruzando diretoria, senioridade, gênero, raça e PCD, um recorte menor que isso chega a uma ou
 * duas pessoas e ao salário, à saída ou à nota de eNPS delas.
 */
export const MIN_AMOSTRA = 30;
/** Drivers: lift mínimo de risco, máximo de proteção e eventos esperados mínimos por segmento */
export const LIFT_RISCO = 1.3;
export const LIFT_PROTECAO = 1 / LIFT_RISCO;
export const MIN_EVENTOS_ESPERADOS = 5;
/** Drivers: um par de atributos só entra se o lift dele passa o de cada atributo sozinho nesta proporção */
export const GANHO_COMBINACAO = 1.15;

export class ErroConsulta extends Error {
  override name = 'ErroConsulta';
}

/** Recorte não divulgado: no lugar do valor e do n, o motivo e o mínimo exigido */
export interface Supressao {
  motivo: 'amostra_insuficiente';
  minimo: number;
}

const SUPRESSAO: Supressao = { motivo: 'amostra_insuficiente', minimo: MIN_AMOSTRA };

/** A frase que sai no lugar do número, para o modelo e para a tela */
export function avisoSupressao({ minimo }: Supressao): string {
  return `amostra insuficiente (menos de ${minimo} pessoas) — valor não divulgado`;
}

export interface Periodo {
  inicio: Mes;
  fim: Mes;
}

export interface Recorte {
  periodo: Periodo;
  filtros?: Filtros;
}

export type Granularidade = 'mes' | 'trimestre' | 'ano';
export type Leitura = 'soma dos meses' | 'fim do período' | 'variação no período' | 'ciclos de eNPS';
export type Status = 'dentro' | 'atencao' | 'fora' | 'sem_meta' | 'sem_dados';
export type Origem = 'cubo' | 'roster';
export type NomeFuncao = 'valor' | 'serie' | 'decompor' | 'cruzar' | 'comparar' | 'drivers' | 'impacto';

export interface ArgsValor { indicador: IdIndicador; periodo: Periodo; filtros?: Filtros }
export interface ArgsSerie extends ArgsValor { granularidade?: Granularidade }
export interface ArgsDecompor extends ArgsValor { dimensao: Dimensao }
export interface ArgsCruzar extends ArgsValor { dimensoes: [Dimensao, Dimensao] }
export interface ArgsComparar { indicador: IdIndicador; a: Recorte; b: Recorte }
export type ArgsDrivers = ArgsValor;
export type ArgsImpacto = ArgsValor;

export interface Rastreio {
  funcao: NomeFuncao;
  indicador: IdIndicador;
  nome: string;
  formula: string;
  parametros: Record<string, unknown>;
  periodoEfetivo: { inicio: Mes; fim: Mes; meses: number; leitura: Leitura };
  /** tamanho da amostra do recorte principal; null se o recorte não é divulgado */
  n: number | null;
  amostraMinima: number;
  fonte: Origem;
  /** somas lidas pelo cálculo, na janela de cada termo */
  medidas: Partial<Medidas>;
}

export interface ResultadoValor {
  indicador: IdIndicador;
  valor: number | null;
  unidade: Unidade;
  meta: number | null;
  status: Status;
  n: number | null;
  amostraSuficiente: boolean;
  suprimido?: Supressao;
  rastreio: Rastreio;
}

export interface PontoSerie {
  periodo: Periodo;
  rotulo: string;
  valor: number | null;
  n: number | null;
  amostraSuficiente: boolean;
  suprimido?: Supressao;
  medidas: Partial<Medidas>;
}

export interface ResultadoSerie {
  indicador: IdIndicador;
  unidade: Unidade;
  granularidade: Granularidade;
  pontos: PontoSerie[];
  rastreio: Rastreio;
}

export interface Segmento {
  segmento: string;
  valor: number | null;
  n: number | null;
  amostraSuficiente: boolean;
  /** fatia do denominador (taxas) ou do total (contagens): peso na reconciliação */
  peso: number | null;
  /** fatia do numerador (composição): "dos desligamentos, X% eram deste segmento" */
  composicao: number | null;
  suprimido?: Supressao;
}

export interface ResultadoDecompor {
  indicador: IdIndicador;
  dimensao: Dimensao;
  unidade: Unidade;
  total: ResultadoValor;
  segmentos: Segmento[];
  /** média ponderada (taxas) ou soma (contagens) dos segmentos contra o total; null se não aditivo */
  reconciliacao: { segmentos: number; total: number; diferenca: number } | null;
  rastreio: Rastreio;
}

export interface Celula extends Omit<Segmento, 'segmento'> {
  segmento: Partial<Record<Dimensao, string>>;
}

export interface ResultadoCruzar {
  indicador: IdIndicador;
  dimensoes: [Dimensao, Dimensao];
  unidade: Unidade;
  total: ResultadoValor;
  celulas: Celula[];
  rastreio: Rastreio;
}

export interface ResultadoComparar {
  indicador: IdIndicador;
  unidade: Unidade;
  a: ResultadoValor;
  b: ResultadoValor;
  /** a − b */
  diferenca: number | null;
  unidadeDiferenca: string;
  /** (a − b) ÷ |b| × 100 */
  variacaoRelativa: number | null;
  melhor: 'a' | 'b' | 'empate' | null;
  rastreio: Rastreio;
}

export interface Fator {
  segmento: Partial<Record<Dimensao, string>>;
  valor: number;
  lift: number;
  eventos: number;
  n: number;
  amostraSuficiente: boolean;
}

export interface ResultadoDrivers {
  indicador: IdIndicador;
  unidade: Unidade;
  total: ResultadoValor;
  fatoresDeRisco: Fator[];
  fatoresProtetivos: Fator[];
  /** pares de atributos cujo lift passa o de cada atributo sozinho */
  combinacoes: Fator[];
  metodo: string;
  aviso: string | null;
  rastreio: Rastreio;
}

export interface ResultadoImpacto {
  indicador: IdIndicador;
  aplicavel: boolean;
  valor: number | null;
  unidade: 'R$';
  metodologia: string;
  suprimido?: Supressao;
  rastreio: Rastreio;
}

export interface MotorCliente {
  origem: Origem;
  /** dimensões de recorte do indicador que existem nesta fonte */
  dimensoes(indicador: IdIndicador): Dimensao[];
  valor(args: ArgsValor): ResultadoValor;
  serie(args: ArgsSerie): ResultadoSerie;
  decompor(args: ArgsDecompor): ResultadoDecompor;
  cruzar(args: ArgsCruzar): ResultadoCruzar;
  comparar(args: ArgsComparar): ResultadoComparar;
  impacto(args: ArgsImpacto): ResultadoImpacto;
}

export interface Motor extends MotorCliente {
  drivers(args: ArgsDrivers): ResultadoDrivers;
}

// ── Helpers puros ─────────────────────────────────────────────────────────────

function termosDo(c: Calculo): Termo[] {
  if (c.tipo === 'total') return [c.termo];
  if (c.tipo === 'razao') return [c.numerador, c.denominador];
  return [c.a, c.b, c.c, c.d];
}

function janelasDo(ind: Indicador): Set<JanelaTermo> {
  return new Set(termosDo(ind.calculo).flatMap(t => t.map(([, , j]) => j)));
}

/** Como a janela é lida pelo indicador (fluxo somado, estoque no fim, variação ou ciclos) */
export function leituraDe(ind: Indicador): Leitura {
  const janelas = janelasDo(ind);
  if (janelas.has('primeiro')) return 'variação no período';
  if (!janelas.has('soma')) return 'fim do período';
  return ind.granularidade === 'trimestral' ? 'ciclos de eNPS' : 'soma dos meses';
}

function periodoEfetivo(ind: Indicador, p: Periodo): Rastreio['periodoEfetivo'] {
  const leitura = leituraDe(ind);
  if (leitura === 'fim do período') return { inicio: p.fim, fim: p.fim, meses: 1, leitura };
  const meses = intervaloMeses(p.inicio, p.fim);
  if (leitura === 'ciclos de eNPS') {
    const ciclos = meses.filter(ehCicloEnps);
    if (ciclos.length === 0) return { inicio: p.inicio, fim: p.fim, meses: 0, leitura };
    return { inicio: ciclos[0], fim: ciclos[ciclos.length - 1], meses: ciclos.length, leitura };
  }
  return { inicio: p.inicio, fim: p.fim, meses: meses.length, leitura };
}

/** Somas usadas pelo cálculo, cada medida na janela do seu termo */
function medidasUsadas(ind: Indicador, a: Agregado): Partial<Medidas> {
  const out: Partial<Medidas> = {};
  for (const termo of termosDo(ind.calculo)) for (const [, m, j] of termo) if (out[m] === undefined) out[m] = a[j][m];
  return out;
}

function statusDe(ind: Indicador, valor: number | null): Status {
  if (valor === null) return 'sem_dados';
  if (!ind.meta || ind.polaridade === 'neutro') return 'sem_meta';
  const tolerancia = ind.meta.tolerancia ?? Math.abs(ind.meta.valor) * 0.1;
  const desvio = ind.polaridade === 'menor_melhor' ? valor - ind.meta.valor : ind.meta.valor - valor;
  if (desvio <= 0) return 'dentro';
  return desvio <= tolerancia ? 'atencao' : 'fora';
}

function agregadoVazio(meses: number): Agregado {
  return { soma: medidasZeradas(), primeiro: medidasZeradas(), ultimo: medidasZeradas(), meses };
}

/** Peso de um segmento: denominador (taxas) ou valor (contagens); null se não aditivo */
function pesoBruto(ind: Indicador, a: Agregado, valor: number | null): number | null {
  const c = ind.calculo;
  if (c.tipo === 'razao') return somarTermo(c.denominador, a);
  if (c.tipo === 'total') return valor ?? 0;
  return null;
}

function numeradorBruto(ind: Indicador, a: Agregado): number | null {
  const c = ind.calculo;
  if (c.tipo === 'razao') return somarTermo(c.numerador, a);
  if (c.tipo === 'total') return somarTermo(c.termo, a);
  return null;
}

function rotuloBalde(g: Granularidade, inicio: Mes): string {
  if (g === 'mes') return rotuloMes(inicio);
  if (g === 'ano') return inicio.slice(0, 4);
  return `${Math.ceil(mesDoAno(inicio) / 3)}T${inicio.slice(2, 4)}`;
}

function baldes(g: Granularidade, p: Periodo): Periodo[] {
  const out: Periodo[] = [];
  for (const m of intervaloMeses(p.inicio, p.fim)) {
    const chave = g === 'mes' ? m : g === 'ano' ? m.slice(0, 4) : `${m.slice(0, 4)}-${Math.ceil(mesDoAno(m) / 3)}`;
    const ultimo = out[out.length - 1];
    const chaveUltimo = ultimo && (g === 'mes' ? ultimo.inicio : g === 'ano' ? ultimo.inicio.slice(0, 4) : `${ultimo.inicio.slice(0, 4)}-${Math.ceil(mesDoAno(ultimo.inicio) / 3)}`);
    if (ultimo && chaveUltimo === chave) ultimo.fim = m;
    else out.push({ inicio: m, fim: m });
  }
  return out;
}

const UNIDADES_PERCENTUAIS: readonly Unidade[] = ['%', '% a.a.'];

// ── Motor ─────────────────────────────────────────────────────────────────────

export function criarMotor(fonte: Fonte, origem: Origem): Motor {
  const cacheDims = new Map<IdIndicador, Dimensao[]>();

  function indicadorDe(id: IdIndicador): Indicador {
    const ind = (CATALOGO as Record<string, Indicador | undefined>)[id];
    if (!ind) throw new ErroConsulta(`Indicador desconhecido: "${id}".`);
    return ind;
  }

  function dimensoes(id: IdIndicador): Dimensao[] {
    let dims = cacheDims.get(id);
    if (!dims) {
      const ind = indicadorDe(id);
      dims = ind.dimensoes.filter(d => ind.medidas.every(m => dimensoesDaMedida(fonte, m).includes(d)));
      cacheDims.set(id, dims);
    }
    return dims;
  }

  function validarRecorte(ind: Indicador, periodo: Periodo, filtros: Filtros = {}): void {
    if (!periodo || !MESES.includes(periodo.inicio) || !MESES.includes(periodo.fim)) {
      throw new ErroConsulta(`Período fora da janela de dados (${MESES[0]} a ${MESES[MESES.length - 1]}).`);
    }
    if (periodo.inicio > periodo.fim) throw new ErroConsulta(`Período invertido: ${periodo.inicio} é depois de ${periodo.fim}.`);
    const validas = dimensoes(ind.id);
    for (const [d, v] of Object.entries(filtros) as [Dimensao, string][]) {
      if (!validas.includes(d)) {
        throw new ErroConsulta(`"${ind.nome}" não pode ser filtrado por ${d} nesta fonte (${origem}). Dimensões válidas: ${validas.join(', ')}.`);
      }
      if (!(VALORES_DIMENSAO[d] as readonly string[]).includes(v)) {
        throw new ErroConsulta(`Valor inválido para ${d}: "${v}". Valores: ${VALORES_DIMENSAO[d].join(', ')}.`);
      }
    }
  }

  function validarDimensao(ind: Indicador, d: Dimensao, filtros: Filtros = {}): void {
    const validas = dimensoes(ind.id);
    if (!validas.includes(d)) {
      throw new ErroConsulta(`"${ind.nome}" não pode ser decomposto por ${d} nesta fonte (${origem}). Dimensões válidas: ${validas.join(', ')}.`);
    }
    if (filtros[d] !== undefined) throw new ErroConsulta(`A dimensão ${d} já está filtrada; não dá para decompor por ela.`);
  }

  function rastreio(funcao: NomeFuncao, ind: Indicador, parametros: Record<string, unknown>, periodo: Periodo, n: number | null, medidas: Partial<Medidas>): Rastreio {
    return {
      funcao, indicador: ind.id, nome: ind.nome, formula: ind.formula, parametros,
      periodoEfetivo: periodoEfetivo(ind, periodo), n, amostraMinima: MIN_AMOSTRA, fonte: origem, medidas,
    };
  }

  function agregados(ind: Indicador, periodo: Periodo, filtros: Filtros, agrupar: Dimensao[] = []) {
    const meses = intervaloMeses(periodo.inicio, periodo.fim).length;
    const grupos = agregar(fonte, { inicio: periodo.inicio, fim: periodo.fim, filtros, agrupar, medidas: ind.medidas });
    return grupos.map(g => ({ chave: g.chave, a: { soma: g.soma, primeiro: g.primeiro, ultimo: g.ultimo, meses } as Agregado }));
  }

  /** Recorte de pessoas abaixo do mínimo; janela sem dado nenhum (mês sem ciclo de eNPS) não conta */
  function suprimir(ind: Indicador, n: number, periodo: Periodo): boolean {
    return ind.amostra.pessoas && n < MIN_AMOSTRA && periodoEfetivo(ind, periodo).meses > 0;
  }

  function resultadoDe(funcao: NomeFuncao, ind: Indicador, periodo: Periodo, filtros: Filtros, a: Agregado): ResultadoValor {
    const n = amostraDe(ind, a);
    const meta = ind.meta?.valor ?? null;
    if (suprimir(ind, n, periodo)) {
      return {
        indicador: ind.id, valor: null, unidade: ind.unidade, meta, status: 'sem_dados', n: null, amostraSuficiente: false, suprimido: SUPRESSAO,
        rastreio: rastreio(funcao, ind, { periodo, filtros }, periodo, null, {}),
      };
    }
    const valor = ind.calcular(a);
    return {
      indicador: ind.id, valor, unidade: ind.unidade, meta, status: statusDe(ind, valor),
      n, amostraSuficiente: n >= MIN_AMOSTRA,
      rastreio: rastreio(funcao, ind, { periodo, filtros }, periodo, n, medidasUsadas(ind, a)),
    };
  }

  /** Resultado do recorte inteiro, com o agregado para quem precisa de pesos e numeradores */
  function totalCom(funcao: NomeFuncao, ind: Indicador, periodo: Periodo, filtros: Filtros): { r: ResultadoValor; a: Agregado } {
    const [g] = agregados(ind, periodo, filtros);
    const a = g?.a ?? agregadoVazio(intervaloMeses(periodo.inicio, periodo.fim).length);
    return { r: resultadoDe(funcao, ind, periodo, filtros, a), a };
  }

  function total(funcao: NomeFuncao, ind: Indicador, periodo: Periodo, filtros: Filtros): ResultadoValor {
    return totalCom(funcao, ind, periodo, filtros).r;
  }

  /**
   * Fatias do recorte. `bruto` (valor e peso sem supressão) fica no motor, só para a reconciliação;
   * fatia de pessoas abaixo do mínimo sai sem valor, n, peso nem composição.
   */
  function segmentar(ind: Indicador, tot: { a: Agregado }, periodo: Periodo, filtros: Filtros, agrupar: Dimensao[]) {
    const pesoTotal = pesoBruto(ind, tot.a, ind.calcular(tot.a));
    const numTotal = numeradorBruto(ind, tot.a);
    return agregados(ind, periodo, filtros, agrupar).map(({ chave, a }) => {
      const valor = ind.calcular(a);
      const n = amostraDe(ind, a);
      const p = pesoBruto(ind, a, valor);
      const peso = p !== null && pesoTotal ? p / pesoTotal : 0;
      const bruto = { valor, peso };
      if (suprimir(ind, n, periodo)) {
        return { chave, bruto, fatia: { valor: null, n: null, amostraSuficiente: false, peso: null, composicao: null, suprimido: SUPRESSAO } };
      }
      const num = numeradorBruto(ind, a);
      return {
        chave,
        bruto,
        fatia: { valor, n, amostraSuficiente: n >= MIN_AMOSTRA, peso, composicao: num !== null && numTotal ? num / numTotal : null },
      };
    });
  }

  const motor: Motor = {
    origem,
    dimensoes,

    valor({ indicador, periodo, filtros = {} }) {
      const ind = indicadorDe(indicador);
      validarRecorte(ind, periodo, filtros);
      return total('valor', ind, periodo, filtros);
    },

    serie({ indicador, periodo, filtros = {}, granularidade }) {
      const ind = indicadorDe(indicador);
      validarRecorte(ind, periodo, filtros);
      const g: Granularidade = granularidade ?? (ind.granularidade === 'trimestral' ? 'trimestre' : 'mes');
      const porMes = new Map<Mes, Medidas>();
      for (const grupo of agregar(fonte, { inicio: periodo.inicio, fim: periodo.fim, filtros, agrupar: ['mes'], medidas: ind.medidas })) {
        porMes.set(grupo.chave.mes!, grupo.soma);
      }
      const pontos = baldes(g, periodo).map(b => {
        const meses = intervaloMeses(b.inicio, b.fim);
        const a = agregadoVazio(meses.length);
        for (const m of meses) {
          const v = porMes.get(m);
          if (!v) continue;
          for (const k of ind.medidas) a.soma[k] += v[k];
        }
        const primeiro = porMes.get(b.inicio);
        const ultimo = porMes.get(b.fim);
        if (primeiro) a.primeiro = primeiro;
        if (ultimo) a.ultimo = ultimo;
        const n = amostraDe(ind, a);
        const rotulo = rotuloBalde(g, b.inicio);
        if (suprimir(ind, n, b)) return { periodo: b, rotulo, valor: null, n: null, amostraSuficiente: false, suprimido: SUPRESSAO, medidas: {} };
        return { periodo: b, rotulo, valor: ind.calcular(a), n, amostraSuficiente: n >= MIN_AMOSTRA, medidas: medidasUsadas(ind, a) };
      });
      const tot = total('serie', ind, periodo, filtros);
      return {
        indicador, unidade: ind.unidade, granularidade: g, pontos,
        rastreio: { ...tot.rastreio, funcao: 'serie', parametros: { periodo, filtros, granularidade: g } },
      };
    },

    decompor({ indicador, dimensao, periodo, filtros = {} }) {
      const ind = indicadorDe(indicador);
      validarRecorte(ind, periodo, filtros);
      validarDimensao(ind, dimensao, filtros);
      const tot = totalCom('decompor', ind, periodo, filtros);
      const fatias = segmentar(ind, tot, periodo, filtros, [dimensao]);
      const segmentos: Segmento[] = fatias.map(s => ({ segmento: s.chave[dimensao]!, ...s.fatia }));
      // com os valores brutos: a diferença contra o total não entrega a fatia suprimida
      let reconciliacao: ResultadoDecompor['reconciliacao'] = null;
      const { r: totalR } = tot;
      if (ind.calculo.tipo !== 'compa' && totalR.valor !== null) {
        const soma = ind.calculo.tipo === 'razao'
          ? fatias.reduce((acc, s) => acc + s.bruto.peso * (s.bruto.valor ?? 0), 0)
          : fatias.reduce((acc, s) => acc + (s.bruto.valor ?? 0), 0);
        reconciliacao = { segmentos: soma, total: totalR.valor, diferenca: soma - totalR.valor };
      }
      return {
        indicador, dimensao, unidade: ind.unidade, total: totalR, segmentos, reconciliacao,
        rastreio: { ...totalR.rastreio, parametros: { periodo, filtros, dimensao } },
      };
    },

    cruzar({ indicador, dimensoes: dims, periodo, filtros = {} }) {
      const ind = indicadorDe(indicador);
      validarRecorte(ind, periodo, filtros);
      if (!Array.isArray(dims) || dims.length !== 2 || dims[0] === dims[1]) {
        throw new ErroConsulta('cruzar precisa de exatamente duas dimensões diferentes.');
      }
      for (const d of dims) validarDimensao(ind, d, filtros);
      const tot = totalCom('cruzar', ind, periodo, filtros);
      const celulas: Celula[] = segmentar(ind, tot, periodo, filtros, dims).map(s => ({ segmento: s.chave, ...s.fatia }));
      return {
        indicador, dimensoes: dims, unidade: ind.unidade, total: tot.r, celulas,
        rastreio: { ...tot.r.rastreio, parametros: { periodo, filtros, dimensoes: dims } },
      };
    },

    comparar({ indicador, a, b }) {
      const ind = indicadorDe(indicador);
      for (const r of [a, b]) validarRecorte(ind, r?.periodo, r?.filtros);
      const ra = total('comparar', ind, a.periodo, a.filtros ?? {});
      const rb = total('comparar', ind, b.periodo, b.filtros ?? {});
      const diferenca = ra.valor !== null && rb.valor !== null ? ra.valor - rb.valor : null;
      const variacaoRelativa = diferenca !== null && rb.valor ? diferenca / Math.abs(rb.valor) * 100 : null;
      let melhor: ResultadoComparar['melhor'] = null;
      if (diferenca !== null && ind.polaridade !== 'neutro') {
        if (diferenca === 0) melhor = 'empate';
        else melhor = (diferenca < 0) === (ind.polaridade === 'menor_melhor') ? 'a' : 'b';
      }
      return {
        indicador, unidade: ind.unidade, a: ra, b: rb, diferenca,
        unidadeDiferenca: UNIDADES_PERCENTUAIS.includes(ind.unidade) ? 'p.p.' : ind.unidade,
        variacaoRelativa, melhor,
        rastreio: { ...ra.rastreio, parametros: { a, b } },
      };
    },

    drivers({ indicador, periodo, filtros = {} }) {
      const ind = indicadorDe(indicador);
      validarRecorte(ind, periodo, filtros);
      if (!ind.evento || ind.calculo.tipo !== 'razao') {
        throw new ErroConsulta(`drivers só se aplica a taxas de evento sobre pessoas (turnover, early attrition, promoção, mobilidade). "${ind.nome}" não é uma delas.`);
      }
      const calc = ind.calculo;
      const { r: tot, a: totalA } = totalCom('drivers', ind, periodo, filtros);
      const metodo = `Lift = taxa do segmento ÷ taxa do recorte. Fatores: cada atributo do roster, com pelo menos ${MIN_AMOSTRA} pessoas e ${MIN_EVENTOS_ESPERADOS} eventos esperados; risco com lift ≥ ${LIFT_RISCO}, proteção com lift ≤ ${LIFT_PROTECAO.toFixed(2)}. Combinações: pares de atributos fortes, com o dobro de amostra, que só entram se o lift do par passa o de cada atributo sozinho em ${Math.round((GANHO_COMBINACAO - 1) * 100)}%.`;
      const rastreioDrivers = { ...tot.rastreio, parametros: { periodo, filtros } };
      if (tot.suprimido) {
        return {
          indicador, unidade: ind.unidade, total: tot, fatoresDeRisco: [], fatoresProtetivos: [], combinacoes: [], metodo,
          aviso: avisoSupressao(tot.suprimido), rastreio: rastreioDrivers,
        };
      }
      const taxaTotal = tot.valor ?? 0;
      const candidatas = dimensoes(ind.id).filter(d => filtros[d] === undefined);

      const avaliarGrupos = (agrupar: Dimensao[], minN: number, minEsperado: number): Fator[] =>
        agregados(ind, periodo, filtros, agrupar).flatMap(({ chave, a }) => {
          const valor = ind.calcular(a);
          const den = somarTermo(calc.denominador, a);
          const n = amostraDe(ind, a);
          const esperado = taxaTotal / calc.escala * den;
          if (valor === null || taxaTotal === 0 || n < minN || esperado < minEsperado) return [];
          return [{ segmento: chave, valor, lift: valor / taxaTotal, eventos: somarTermo(calc.numerador, a), n, amostraSuficiente: true }];
        });
      const risco = (f: Fator) => f.lift >= LIFT_RISCO;
      const protecao = (f: Fator) => f.lift <= LIFT_PROTECAO;

      const univariados = candidatas.flatMap(d => avaliarGrupos([d], MIN_AMOSTRA, MIN_EVENTOS_ESPERADOS));
      const liftDe = new Map(univariados.map(f => [JSON.stringify(f.segmento), f.lift]));
      const dimsFortes = candidatas.filter(d => univariados.some(f => f.segmento[d] !== undefined && (risco(f) || protecao(f))));
      // pares: amostra em dobro e o par precisa dizer mais do que cada atributo sozinho
      const combinacoes: Fator[] = [];
      for (let i = 0; i < dimsFortes.length; i++) {
        for (let j = i + 1; j < dimsFortes.length; j++) {
          const [d1, d2] = [dimsFortes[i], dimsFortes[j]];
          for (const f of avaliarGrupos([d1, d2], 2 * MIN_AMOSTRA, 2 * MIN_EVENTOS_ESPERADOS)) {
            const l1 = liftDe.get(JSON.stringify({ [d1]: f.segmento[d1] })) ?? 1;
            const l2 = liftDe.get(JSON.stringify({ [d2]: f.segmento[d2] })) ?? 1;
            if ((risco(f) && f.lift >= Math.max(l1, l2) * GANHO_COMBINACAO) || (protecao(f) && f.lift <= Math.min(l1, l2) / GANHO_COMBINACAO)) combinacoes.push(f);
          }
        }
      }
      const forca = (f: Fator) => Math.abs(Math.log(f.lift));
      const eventos = somarTermo(calc.numerador, totalA);
      return {
        indicador, unidade: ind.unidade, total: tot,
        fatoresDeRisco: univariados.filter(risco).sort((x, y) => y.lift - x.lift).slice(0, 8),
        fatoresProtetivos: univariados.filter(protecao).sort((x, y) => x.lift - y.lift).slice(0, 6),
        combinacoes: combinacoes.sort((x, y) => forca(y) - forca(x)).slice(0, 6),
        metodo,
        aviso: eventos < MIN_EVENTOS_ESPERADOS * 3 ? `Só ${eventos} eventos no recorte: leia os drivers como indicativos.` : null,
        rastreio: rastreioDrivers,
      };
    },

    impacto({ indicador, periodo, filtros = {} }) {
      const ind = indicadorDe(indicador);
      validarRecorte(ind, periodo, filtros);
      const { r: tot, a } = totalCom('impacto', ind, periodo, filtros);
      if (!ind.impacto) {
        return {
          indicador, aplicavel: false, valor: null, unidade: 'R$',
          metodologia: `"${ind.nome}" não tem custo financeiro associado no catálogo.`,
          rastreio: { ...tot.rastreio, parametros: { periodo, filtros } },
        };
      }
      if (tot.suprimido) {
        return {
          indicador, aplicavel: true, valor: null, unidade: 'R$', metodologia: ind.impacto.metodologia, suprimido: tot.suprimido,
          rastreio: { ...tot.rastreio, parametros: { periodo, filtros } },
        };
      }
      const medidas: Partial<Medidas> = {};
      for (const [, m, j] of ind.impacto.termo) medidas[m as Medida] = a[j][m];
      return {
        indicador, aplicavel: true, valor: ind.impacto.escala * somarTermo(ind.impacto.termo, a), unidade: 'R$',
        metodologia: ind.impacto.metodologia,
        rastreio: { ...tot.rastreio, parametros: { periodo, filtros }, medidas },
      };
    },
  };
  return motor;
}
