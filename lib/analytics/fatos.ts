/**
 * Tabela de fatos: a ponte entre o roster e o motor de consulta.
 *
 * Toda medida é ADITIVA (contagem ou soma em BRL/horas/dias), então qualquer recorte é a
 * soma das linhas que passam nos filtros, e a soma dos segmentos reconcilia com o total
 * por construção. Três tabelas, todas com `mes` (código em MESES):
 *
 *  - fluxo:   uma linha por pessoa presente no mês (ativa no início ou admitida no mês),
 *             com o estado do INÍCIO do mês. Denominadores de taxa e eventos.
 *  - estoque: uma linha por pessoa ativa no FIM do mês, com o estado do início do mês
 *             seguinte (transições já aplicadas). Headcount, liderança, folha, diversidade.
 *  - vagas:   uma linha por requisição e mês em que algo acontece (aberta no fim do mês,
 *             aberta no mês, fechada no mês).
 *
 * As convenções de tempo estão em ./dominio.ts. O cubo do client é esta mesma fonte
 * agregada por (mes, diretoria, senioridade), com todas as medidas.
 */

import {
  CATEGORIAS_ENPS,
  CICLOS_ENPS,
  DIRETORIAS,
  ESPECIALIDADES,
  FAIXAS_ETARIAS,
  FAIXAS_SALARIAIS,
  FAIXAS_TEMPO_CASA,
  GENEROS,
  MESES,
  MODALIDADES,
  ONBOARDINGS,
  PERFORMANCES,
  RACAS,
  SENIORIDADES,
  SIM_NAO,
  TROCAS_GESTOR,
  ativaNoFim,
  ativaNoInicio,
  categoriaEnps,
  ehLideranca,
  ehNegra,
  faixaEtaria,
  faixaTempoCasa,
  gestorEm,
  mesIdx,
  segmentoEm,
  somarMeses,
  tempoDeCasa,
  type Mes,
  type Pessoa,
  type Requisicao,
} from './dominio';

// ── Dimensões ─────────────────────────────────────────────────────────────────

export const VALORES_DIMENSAO = {
  mes: MESES,
  diretoria: DIRETORIAS,
  especialidade: ESPECIALIDADES,
  senioridade: SENIORIDADES,
  genero: GENEROS,
  raca: RACAS,
  pcd: SIM_NAO,
  faixaEtaria: FAIXAS_ETARIAS,
  tempoCasa: FAIXAS_TEMPO_CASA,
  faixaSalarial: FAIXAS_SALARIAIS,
  performance: PERFORMANCES,
  modalidade: MODALIDADES,
  enps: CATEGORIAS_ENPS,
  mobilidadeRecente: SIM_NAO,
  trocasGestor: TROCAS_GESTOR,
  onboarding: ONBOARDINGS,
} as const satisfies Record<string, readonly string[]>;

export type Dimensao = keyof typeof VALORES_DIMENSAO;
export const DIMENSOES = Object.keys(VALORES_DIMENSAO) as Dimensao[];

/** Descrição de cada dimensão (vira texto de tool e de rastreio) */
export const DESCRICAO_DIMENSAO: Record<Dimensao, string> = {
  mes: 'mês (YYYY-MM)',
  diretoria: 'diretoria',
  especialidade: 'especialidade dentro da diretoria',
  senioridade: 'senioridade',
  genero: 'gênero',
  raca: 'cor ou raça (IBGE)',
  pcd: 'pessoa com deficiência',
  faixaEtaria: 'faixa etária',
  tempoCasa: 'tempo de casa',
  faixaSalarial: 'posição na faixa salarial do cargo',
  performance: 'avaliação de performance mais recente',
  modalidade: 'modalidade de trabalho',
  enps: 'categoria da última resposta de eNPS',
  mobilidadeRecente: 'movimentou-se ou foi promovida nos últimos 12 meses',
  trocasGestor: 'trocas de gestor nos últimos 12 meses',
  onboarding: 'trilha de onboarding na entrada',
};

const DIMENSOES_PESSOA: readonly Dimensao[] = DIMENSOES;
const DIMENSOES_VAGA: readonly Dimensao[] = ['mes', 'diretoria', 'especialidade', 'senioridade'];

// ── Medidas ───────────────────────────────────────────────────────────────────

export const MEDIDAS_FLUXO = [
  'hcIni', 'hcNovIni', 'hcAltaIni',
  'adm', 'desl', 'deslVol', 'deslLam', 'deslNov',
  'promo', 'mob', 'saiDiretoria',
  'treino', 'ausencia', 'extras',
  'salDesl', 'custoAusencia', 'custoExtras',
  'enpsResp', 'enpsProm', 'enpsDetr',
] as const;

export const MEDIDAS_ESTOQUE = [
  'hc', 'lid', 'mulheres', 'lidMulheres', 'negros', 'lidNegros', 'pcd',
  'tempoCasaSoma', 'folha', 'folhaMulheres', 'refMulheres', 'folhaHomens', 'refHomens',
  'gestores', 'liderados', 'entraDiretoria',
] as const;

export const MEDIDAS_VAGA = [
  'vagasAbertas', 'vagasNovas', 'vagasFechadas', 'vagasInternas', 'diasTtf',
  'candidatos', 'ofertas', 'aceites', 'custoRecrut',
] as const;

export type Medida = (typeof MEDIDAS_FLUXO)[number] | (typeof MEDIDAS_ESTOQUE)[number] | (typeof MEDIDAS_VAGA)[number];
export const MEDIDAS: readonly Medida[] = [...MEDIDAS_FLUXO, ...MEDIDAS_ESTOQUE, ...MEDIDAS_VAGA];
export type Medidas = Record<Medida, number>;

/** Jornada mensal de referência da CLT e adicional mínimo de hora extra */
const HORAS_MES = 220;
const ADICIONAL_HORA_EXTRA = 1.5;
const DIAS_UTEIS_MES = 21;

// ── Tabela colunar ────────────────────────────────────────────────────────────

export interface TabelaFatos {
  dims: readonly Dimensao[];
  n: number;
  /** código da linha i na dimensão d = índice em VALORES_DIMENSAO[d] */
  codigos: Partial<Record<Dimensao, ArrayLike<number>>>;
  medidas: Partial<Record<Medida, ArrayLike<number>>>;
}

export type Fonte = readonly TabelaFatos[];

class Construtor {
  private readonly cod: number[][];
  private readonly med: number[][];
  n = 0;

  constructor(readonly dims: readonly Dimensao[], readonly nomes: readonly Medida[]) {
    this.cod = dims.map(() => []);
    this.med = nomes.map(() => []);
  }

  linha(codigos: readonly number[], valores: Partial<Record<Medida, number>>): void {
    for (let i = 0; i < this.dims.length; i++) this.cod[i].push(codigos[i]);
    for (let i = 0; i < this.nomes.length; i++) this.med[i].push(valores[this.nomes[i]] ?? 0);
    this.n++;
  }

  tabela(): TabelaFatos {
    const codigos: Partial<Record<Dimensao, ArrayLike<number>>> = {};
    this.dims.forEach((d, i) => (codigos[d] = Uint8Array.from(this.cod[i])));
    const medidas: Partial<Record<Medida, ArrayLike<number>>> = {};
    this.nomes.forEach((m, i) => (medidas[m] = Float64Array.from(this.med[i])));
    return { dims: this.dims, n: this.n, codigos, medidas };
  }
}

const INDICE: Record<Dimensao, Map<string, number>> = Object.fromEntries(
  DIMENSOES.map(d => [d, new Map((VALORES_DIMENSAO[d] as readonly string[]).map((v, i) => [v, i]))]),
) as Record<Dimensao, Map<string, number>>;

export function codigoDe(dim: Dimensao, valor: string): number | undefined {
  return INDICE[dim].get(valor);
}

// ── Construção a partir do roster ─────────────────────────────────────────────

/** Atributos que variam no tempo, avaliados no início do mês `mes` */
function codigosPessoa(p: Pessoa, mes: Mes, mesIdxJanela: number): number[] {
  const seg = segmentoEm(p, mes)!;
  // eNPS: última resposta em ciclo anterior a `mes`
  let nota: number | null = null;
  for (let c = 0; c < CICLOS_ENPS.length && CICLOS_ENPS[c] < mes; c++) if (p.enps[c] !== null) nota = p.enps[c];
  let mobilidade = false;
  for (let i = 1; i < p.historico.length; i++) {
    const desde = p.historico[i].desde;
    if (desde <= mes && mesIdx(mes) - mesIdx(desde) < 12) mobilidade = true;
  }
  let trocas = 0;
  for (let i = 1; i < p.gestores.length; i++) {
    const desde = p.gestores[i].desde;
    if (desde <= mes && mesIdx(mes) - mesIdx(desde) < 12) trocas++;
  }
  const v: Record<Dimensao, string> = {
    mes: MESES[mesIdxJanela],
    diretoria: seg.diretoria,
    especialidade: seg.especialidade,
    senioridade: seg.senioridade,
    genero: p.genero,
    raca: p.raca,
    pcd: p.pcd ? 'sim' : 'não',
    faixaEtaria: faixaEtaria(p.nascimento, mes),
    tempoCasa: faixaTempoCasa(tempoDeCasa(p.admissao, mes)),
    faixaSalarial: seg.faixa,
    performance: p.performance,
    modalidade: p.modalidade,
    enps: categoriaEnps(nota),
    mobilidadeRecente: mobilidade ? 'sim' : 'não',
    trocasGestor: trocas >= 2 ? '2+' : String(trocas),
    onboarding: p.onboarding,
  };
  return DIMENSOES_PESSOA.map(d => INDICE[d].get(v[d])!);
}

export function construirFatos(pessoas: readonly Pessoa[], requisicoes: readonly Requisicao[]): Fonte {
  const fluxo = new Construtor(DIMENSOES_PESSOA, MEDIDAS_FLUXO);
  const estoque = new Construtor(DIMENSOES_PESSOA, MEDIDAS_ESTOQUE);
  const vagas = new Construtor(DIMENSOES_VAGA, MEDIDAS_VAGA);

  for (let mi = 0; mi < MESES.length; mi++) {
    const t = MESES[mi];
    const proximo = somarMeses(t, 1);
    const ciclo = CICLOS_ENPS.indexOf(t);

    // quem está ativo no fim de t e quem tem ao menos um liderado ativo no fim de t
    const ativosFim = new Set<string>();
    const comLiderados = new Set<string>();
    for (const p of pessoas) {
      if (!ativaNoFim(p, t)) continue;
      ativosFim.add(p.id);
      const g = gestorEm(p, proximo);
      if (g !== null) comLiderados.add(g);
    }

    for (const p of pessoas) {
      const inicio = ativaNoInicio(p, t);
      const admitida = p.admissao === t;
      if (inicio || admitida) {
        const seg = segmentoEm(p, t)!;
        const depois = segmentoEm(p, proximo)!;
        const mudou = depois !== seg;
        const desl = p.desligamento?.mes === t;
        const vol = desl && p.desligamento!.tipo === 'voluntário';
        const casa = tempoDeCasa(p.admissao, t);
        const k = inicio && p.mensal ? mi - MESES.indexOf(p.mensal.desde) : -1;
        const ausencia = k >= 0 ? p.mensal!.ausencia[k] : 0;
        const extras = k >= 0 ? p.mensal!.extras[k] : 0;
        const nota = inicio && ciclo >= 0 ? p.enps[ciclo] : null;
        fluxo.linha(codigosPessoa(p, t, mi), {
          hcIni: inicio ? 1 : 0,
          hcNovIni: inicio && casa < 12 ? 1 : 0,
          hcAltaIni: inicio && p.performance === 'acima' ? 1 : 0,
          adm: admitida ? 1 : 0,
          desl: desl ? 1 : 0,
          deslVol: vol ? 1 : 0,
          deslLam: vol && p.performance === 'acima' ? 1 : 0,
          deslNov: desl && casa < 12 ? 1 : 0,
          promo: !desl && mudou && depois.motivo === 'promoção' ? 1 : 0,
          mob: !desl && mudou && depois.motivo === 'movimentação' ? 1 : 0,
          saiDiretoria: !desl && depois.diretoria !== seg.diretoria ? 1 : 0,
          treino: k >= 0 ? p.mensal!.treino[k] : 0,
          ausencia,
          extras,
          salDesl: desl ? seg.salario : 0,
          custoAusencia: Math.round(ausencia * seg.salario / DIAS_UTEIS_MES),
          custoExtras: Math.round(extras * seg.salario / HORAS_MES * ADICIONAL_HORA_EXTRA),
          enpsResp: nota !== null ? 1 : 0,
          enpsProm: nota !== null && nota >= 9 ? 1 : 0,
          enpsDetr: nota !== null && nota <= 6 ? 1 : 0,
        });
      }
      if (ativosFim.has(p.id)) {
        // estado do início de t+1 (transições aplicadas), mas a linha pertence ao mês t
        const cod = codigosPessoa(p, proximo, mi);
        const seg = segmentoEm(p, proximo)!;
        const antes = segmentoEm(p, t)!;
        const lider = ehLideranca(seg.senioridade);
        const mulher = p.genero === 'mulher';
        const negra = ehNegra(p.raca);
        const gestor = gestorEm(p, proximo);
        estoque.linha(cod, {
          hc: 1,
          lid: lider ? 1 : 0,
          mulheres: mulher ? 1 : 0,
          lidMulheres: lider && mulher ? 1 : 0,
          negros: negra ? 1 : 0,
          lidNegros: lider && negra ? 1 : 0,
          pcd: p.pcd ? 1 : 0,
          tempoCasaSoma: tempoDeCasa(p.admissao, proximo),
          folha: seg.salario,
          folhaMulheres: mulher ? seg.salario : 0,
          refMulheres: mulher ? seg.referencia : 0,
          folhaHomens: mulher ? 0 : seg.salario,
          refHomens: mulher ? 0 : seg.referencia,
          gestores: comLiderados.has(p.id) ? 1 : 0,
          liderados: gestor !== null && ativosFim.has(gestor) ? 1 : 0,
          entraDiretoria: p.admissao !== t && antes.diretoria !== seg.diretoria ? 1 : 0,
        });
      }
    }

    for (const r of requisicoes) {
      const aberta = r.abertura <= t && (r.fechamento === null || r.fechamento > t);
      const nova = r.abertura === t;
      const fechada = r.fechamento === t;
      if (!aberta && !nova && !fechada) continue;
      vagas.linha(
        [mi, INDICE.diretoria.get(r.diretoria)!, INDICE.especialidade.get(r.especialidade)!, INDICE.senioridade.get(r.senioridade)!],
        {
          vagasAbertas: aberta ? 1 : 0,
          vagasNovas: nova ? 1 : 0,
          vagasFechadas: fechada ? 1 : 0,
          vagasInternas: fechada && r.preenchimento === 'interno' ? 1 : 0,
          diasTtf: fechada ? r.diasParaPreencher ?? 0 : 0,
          candidatos: fechada ? r.candidatos : 0,
          ofertas: fechada ? r.ofertas : 0,
          aceites: fechada ? r.aceites : 0,
          custoRecrut: fechada ? r.custo : 0,
        },
      );
    }
  }

  return [fluxo.tabela(), estoque.tabela(), vagas.tabela()];
}

// ── Agregação ─────────────────────────────────────────────────────────────────

export type Filtros = Partial<Record<Dimensao, string>>;

export interface Consulta {
  /** primeiro e último mês (inclusive) */
  inicio: Mes;
  fim: Mes;
  filtros?: Filtros;
  agrupar?: readonly Dimensao[];
  medidas: readonly Medida[];
}

export interface Grupo {
  chave: Partial<Record<Dimensao, string>>;
  /** soma na janela */
  soma: Medidas;
  /** valores do primeiro mês da janela (estoques de abertura) */
  primeiro: Medidas;
  /** valores do último mês da janela (estoques de fechamento) */
  ultimo: Medidas;
}

export function medidasZeradas(): Medidas {
  const m = {} as Medidas;
  for (const k of MEDIDAS) m[k] = 0;
  return m;
}

/** Dimensões disponíveis para filtrar/agrupar uma medida nesta fonte */
export function dimensoesDaMedida(fonte: Fonte, medida: Medida): readonly Dimensao[] {
  return fonte.find(t => t.medidas[medida] !== undefined)?.dims ?? [];
}

/**
 * Soma as medidas pedidas por grupo. Filtros e agrupamentos precisam existir em toda
 * tabela que tem alguma das medidas pedidas (o catálogo garante isso via `dimensoes`).
 */
export function agregar(fonte: Fonte, consulta: Consulta): Grupo[] {
  const { filtros = {}, agrupar = [], medidas } = consulta;
  const mi0 = MESES.indexOf(consulta.inicio);
  const mi1 = MESES.indexOf(consulta.fim);
  if (mi0 < 0 || mi1 < 0 || mi0 > mi1) throw new Error(`janela inválida: ${consulta.inicio}..${consulta.fim}`);
  const filtroCod: [Dimensao, number][] = [];
  for (const [d, v] of Object.entries(filtros) as [Dimensao, string][]) {
    const c = INDICE[d].get(v);
    if (c === undefined) throw new Error(`valor inválido para ${d}: ${v}`);
    filtroCod.push([d, c]);
  }

  const grupos = new Map<number, Grupo>();
  const tamanhos = agrupar.map(d => VALORES_DIMENSAO[d].length);

  for (const tabela of fonte) {
    const minhas = medidas.filter(m => tabela.medidas[m] !== undefined);
    if (minhas.length === 0) continue;
    for (const d of [...filtroCod.map(f => f[0]), ...agrupar]) {
      if (!tabela.dims.includes(d)) throw new Error(`dimensão ${d} não existe para ${minhas.join(', ')}`);
    }
    const mes = tabela.codigos.mes!;
    const fcols = filtroCod.map(([d, c]) => [tabela.codigos[d]!, c] as const);
    const gcols = agrupar.map(d => tabela.codigos[d]!);
    const mcols = minhas.map(m => tabela.medidas[m]!);
    for (let i = 0; i < tabela.n; i++) {
      const m = mes[i];
      if (m < mi0 || m > mi1) continue;
      let ok = true;
      for (const [col, c] of fcols) if (col[i] !== c) { ok = false; break; }
      if (!ok) continue;
      let chave = 0;
      for (let g = 0; g < gcols.length; g++) chave = chave * tamanhos[g] + gcols[g][i];
      let grupo = grupos.get(chave);
      if (!grupo) {
        const ch: Partial<Record<Dimensao, string>> = {};
        agrupar.forEach((d, g) => (ch[d] = VALORES_DIMENSAO[d][gcols[g][i]]));
        grupo = { chave: ch, soma: medidasZeradas(), primeiro: medidasZeradas(), ultimo: medidasZeradas() };
        grupos.set(chave, grupo);
      }
      for (let k = 0; k < minhas.length; k++) {
        const v = mcols[k][i];
        if (v === 0) continue;
        grupo.soma[minhas[k]] += v;
        if (m === mi0) grupo.primeiro[minhas[k]] += v;
        if (m === mi1) grupo.ultimo[minhas[k]] += v;
      }
    }
  }
  return [...grupos.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]);
}

// ── Cubo (client) ─────────────────────────────────────────────────────────────

export const DIMENSOES_CUBO: readonly Dimensao[] = ['mes', 'diretoria', 'senioridade'];

/** Agrega a fonte num cubo denso (todas as combinações de `dims`, todas as medidas) */
export function construirCubo(fonte: Fonte, dims: readonly Dimensao[] = DIMENSOES_CUBO): TabelaFatos {
  const grupos = agregar(fonte, { inicio: MESES[0], fim: MESES[MESES.length - 1], agrupar: dims, medidas: MEDIDAS });
  const porChave = new Map(grupos.map(g => [dims.map(d => g.chave[d]).join('|'), g.soma]));
  const tamanhos = dims.map(d => VALORES_DIMENSAO[d].length);
  const n = tamanhos.reduce((a, b) => a * b, 1);
  const codigos: Partial<Record<Dimensao, number[]>> = {};
  for (const d of dims) codigos[d] = [];
  const medidas: Partial<Record<Medida, number[]>> = {};
  for (const m of MEDIDAS) medidas[m] = [];
  for (let i = 0; i < n; i++) {
    let resto = i;
    const cod: number[] = [];
    for (let g = dims.length - 1; g >= 0; g--) {
      cod[g] = resto % tamanhos[g];
      resto = Math.floor(resto / tamanhos[g]);
    }
    dims.forEach((d, g) => codigos[d]!.push(cod[g]));
    const soma = porChave.get(dims.map((d, g) => VALORES_DIMENSAO[d][cod[g]]).join('|'));
    for (const m of MEDIDAS) medidas[m]!.push(soma ? soma[m] : 0);
  }
  return { dims, n, codigos, medidas };
}
