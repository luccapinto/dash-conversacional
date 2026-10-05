/**
 * Simulação mês a mês da Verta S.A. (pessoa a pessoa, seed fixa).
 *
 * Ordem dos acontecimentos dentro do mês `t` (ver convenções em lib/analytics/dominio.ts):
 *  1. atividade de quem está ativo no início de `t` (treino, ausência, horas extras);
 *  2. ciclo de eNPS (Dez, Mar, Jun, Set);
 *  3. desligamentos (involuntário, corte de janeiro de Distribuição, voluntário por hazard),
 *     cada saída abre uma vaga de reposição;
 *  4. vagas que fecham em `t`: preenchimento interno (promoção ou movimentação, vale em t+1)
 *     ou admissão externa (a pessoa entra em `t`);
 *  5. promoções de ciclo (Mar e Set), rotação de Financeiro & Risco, reorganização de Operações;
 *  6. vagas de crescimento;
 *  7. fechamento do mês: transições e trocas de gestor passam a valer em t+1.
 */

import {
  CICLOS_ENPS,
  ESTRUTURA,
  DIRETORIAS,
  FAIXAS_SALARIAIS,
  MES_FIM,
  MES_INICIO,
  MES_INICIO_SIMULACAO,
  MODALIDADES,
  PERFORMANCES,
  SATISFACOES,
  SENIORIDADES,
  ehCicloEnps,
  ehLideranca,
  intervaloMeses,
  mesDoAno,
  mesIdx,
  somarMeses,
  tempoDeCasa,
  type Diretoria,
  type FaixaSalarial,
  type Mes,
  type MotivoDesligamento,
  type MotivoSegmento,
  type OrigemVaga,
  type Pessoa,
  type Requisicao,
  type Segmento,
  type Senioridade,
  type TipoDesligamento,
} from '../../lib/analytics/dominio';
import * as C from './calibracao';
import { criarRng, type Rng } from './rng';

export interface ResultadoSimulacao {
  pessoas: Pessoa[];
  requisicoes: Requisicao[];
}

interface Sim {
  p: Pessoa;
  seg: Segmento;
  pendente: Segmento | null;
  ativo: boolean;
  saindo: boolean;
  ocupado: boolean;
  fixo: boolean;
  gestor: string | null;
  offsetNota: number;
  notas: { mes: Mes; nota: number }[];
  ultimaMobilidade: Mes | null;
  trocas: Mes[];
  extrasAnterior: number;
  extrasMes: number;
  inicioPosicao: Mes;
}

interface Vaga {
  r: Requisicao;
  fechaEm: Mes;
  interna: boolean;
  soPropriaDiretoria: boolean;
}

const CARGOS_CI: Record<Diretoria, readonly string[]> = {
  Tecnologia: ['Desenvolvedor(a)', 'Engenheiro(a) de Software', 'Cientista de Dados', 'Arquiteto(a) de Soluções', 'Analista de TI'],
  'Distribuição & Assessoria': ['Assessor(a) de Investimentos', 'Analista Comercial', 'Especialista em Produtos', 'Coordenador(a) de Parcerias'],
  Operações: ['Analista de Operações', 'Analista de Compliance', 'Especialista Regulatório', 'Analista de Back Office'],
  'Financeiro & Risco': ['Analista Financeiro', 'Analista de Risco', 'Controller', 'Especialista em Risco'],
  Gente: ['Analista de RH', 'Recruiter', 'Especialista de Gente', 'HRBP'],
  'Produtos & Plataforma': ['Product Manager', 'Product Designer', 'UX Researcher', 'Analista de Produto', 'Especialista em Investimentos'],
};

const MESES_SIMULACAO = intervaloMeses(MES_INICIO_SIMULACAO, MES_FIM);
const PESO_PERF_INTERNO_GERENCIA = { abaixo: 0, dentro: 1, acima: 4 } as const;
const PESO_PERF_INTERNO_CI = { abaixo: 0.2, dentro: 1, acima: 2 } as const;
const PESO_PERF_PROMOCAO = { abaixo: 0, dentro: 1, acima: 3 } as const;
const PESO_PERF_CORTE = { abaixo: 8, dentro: 1, acima: 0.2 } as const;

function arred100(v: number): number {
  return Math.round(v / 100) * 100;
}

function referencia(sen: Senioridade, dir: Diretoria): number {
  return arred100(C.SAL_REFERENCIA[sen] * C.SAL_FATOR_AREA[dir]);
}

export function simular(): ResultadoSimulacao {
  const rng: Rng = criarRng(C.SEED);
  const todas: Sim[] = [];
  const porId = new Map<string, Sim>();
  const liderados = new Map<string, Set<string>>();
  const trocasPendentes = new Map<string, string | null>();
  const superintendente = new Map<string, string>();
  const diretor = new Map<Diretoria, string>();
  const vagas: Vaga[] = [];
  const vagasAbertas: Vaga[] = [];
  let seqPessoa = 0;
  let seqVaga = 0;
  let vacanciaAnterior: Record<Diretoria, number> = Object.fromEntries(DIRETORIAS.map(d => [d, 0])) as Record<Diretoria, number>;

  // ── Construção de pessoas e segmentos ─────────────────────────────────────

  function salario(ref: number, faixa: FaixaSalarial): number {
    return arred100(ref * C.SAL_FATOR_FAIXA[faixa] * (1 + rng.next() * 0.06 - 0.03));
  }

  function cargo(dir: Diretoria, sen: Senioridade, ehDiretor: boolean): string {
    if (sen === 'diretoria') return ehDiretor ? 'Diretor(a)' : 'Superintendente';
    if (sen === 'gerência') return 'Gerente';
    return rng.pick(CARGOS_CI[dir]);
  }

  function novoSegmento(desde: Mes, motivo: MotivoSegmento, dir: Diretoria, esp: string, sen: Senioridade, faixa: FaixaSalarial, cargoNome: string, sal?: number, ref?: number): Segmento {
    const r = ref ?? referencia(sen, dir);
    return { desde, motivo, diretoria: dir, especialidade: esp, senioridade: sen, cargo: cargoNome, salario: sal ?? salario(r, faixa), referencia: r, faixa };
  }

  function criarPessoa(opts: {
    admissao: Mes;
    nascimentoRef: Mes;
    dir: Diretoria;
    esp: string;
    sen: Senioridade;
    fixo?: { nome: string; ehDiretor: boolean };
    talentoTech?: boolean;
    mesContratacao: Mes;
  }): Sim {
    const { dir, esp, sen } = opts;
    const lider = ehLideranca(sen);
    const genero = opts.fixo
      ? (C.MULHERES_FIXAS[opts.fixo.nome] ? 'mulher' : 'homem')
      : rng.chance(lider ? C.MULHERES_GERENCIA : C.MULHERES_CI[dir]) ? 'mulher' : 'homem';
    const raca = rng.weighted(C.RACAS_ORDEM, lider ? C.RACA_LIDERANCA : C.RACA_CI);
    const pcd = rng.chance(lider ? C.PCD_LIDERANCA : C.PCD_CI);
    const [media, desvio, min, max] = C.IDADE[sen];
    const idade = Math.max(min, Math.min(max, Math.round(rng.normal(media, desvio))));
    const nascimento = somarMeses(opts.nascimentoRef, -(idade * 12 + rng.int(0, 11)));
    const pesosFaixa = opts.talentoTech ? C.FAIXA_TALENTO_TECH : genero === 'mulher' ? C.FAIXA_MULHERES : C.FAIXA_HOMENS;
    const faixa = rng.weighted(FAIXAS_SALARIAIS, pesosFaixa);
    const pesosPerf = opts.talentoTech ? C.PERFORMANCE_TALENTO_TECH
      : opts.admissao < MES_INICIO_SIMULACAO ? C.PERFORMANCE_INICIAL : C.PERFORMANCE_BASE;
    const performance = rng.weighted(PERFORMANCES, pesosPerf);
    const subpago = faixa === 'piso' || faixa === 'q1';
    const satisfacao = rng.weighted(SATISFACOES, C.pesosSatisfacao(performance, subpago));
    const modalidade = rng.weighted(MODALIDADES, C.MODALIDADE[dir]);
    const onboarding = rng.chance(C.chanceOnboardingIncompleto(dir, opts.mesContratacao)) ? 'incompleto' : 'completo';
    const id = `V${String(++seqPessoa).padStart(5, '0')}`;
    const seg = novoSegmento(opts.admissao, 'admissão', dir, esp, sen, faixa, cargo(dir, sen, opts.fixo?.ehDiretor ?? false));
    const p: Pessoa = {
      id, genero, raca, pcd, nascimento, admissao: opts.admissao, desligamento: null,
      performance, satisfacao, modalidade, onboarding,
      historico: [seg], gestores: [], mensal: null, enps: CICLOS_ENPS.map(() => null),
    };
    const s: Sim = {
      p, seg, pendente: null, ativo: true, saindo: false, ocupado: false, fixo: opts.fixo !== undefined,
      gestor: null, offsetNota: rng.normal(0, 0.8), notas: [], ultimaMobilidade: null, trocas: [],
      extrasAnterior: 0, extrasMes: 0, inicioPosicao: opts.admissao,
    };
    todas.push(s);
    porId.set(id, s);
    liderados.set(id, new Set());
    return s;
  }

  // ── Gestores ──────────────────────────────────────────────────────────────

  function carga(id: string): number {
    return liderados.get(id)!.size;
  }

  /** Gerentes ativos (não saindo) de uma especialidade, em ordem de id */
  function gerentesDe(esp: string, exceto?: string): Sim[] {
    return todas.filter(s => s.ativo && !s.saindo && s.seg.especialidade === esp && s.seg.senioridade === 'gerência' && s.p.id !== exceto);
  }

  function gestorParaCI(esp: string, exceto?: string): string {
    const gerentes = gerentesDe(esp, exceto);
    if (gerentes.length === 0) return superintendente.get(esp)!;
    let melhor = gerentes[0];
    for (const g of gerentes) if (carga(g.p.id) < carga(melhor.p.id)) melhor = g;
    return melhor.p.id;
  }

  function gestorPara(esp: string, sen: Senioridade): string {
    return sen === 'gerência' ? superintendente.get(esp)! : gestorParaCI(esp);
  }

  /** Define o gestor de quem já existe: vale a partir do mês seguinte */
  function trocarGestor(s: Sim, novo: string | null): void {
    if (s.gestor === novo) return;
    if (s.gestor !== null) liderados.get(s.gestor)?.delete(s.p.id);
    if (novo !== null) liderados.get(novo)!.add(s.p.id);
    s.gestor = novo;
    trocasPendentes.set(s.p.id, novo);
  }

  /** Gestor de quem acaba de entrar: vale no próprio mês */
  function definirGestorInicial(s: Sim, id: string | null, desde: Mes): void {
    s.gestor = id;
    if (id !== null) liderados.get(id)!.add(s.p.id);
    s.p.gestores.push({ desde, id });
  }

  /** Novo gerente recebe liderados até a carga média da especialidade */
  function rebalancear(novo: Sim, esp: string): void {
    const movivel = (id: string): boolean => {
      const x = porId.get(id)!;
      return id !== novo.p.id && !x.saindo && x.seg.senioridade !== 'gerência' && x.pendente?.senioridade !== 'gerência';
    };
    const doadores = [superintendente.get(esp)!, ...gerentesDe(esp, novo.p.id).map(g => g.p.id)];
    const totalCI = doadores.reduce((acc, id) => acc + [...liderados.get(id)!].filter(movivel).length, 0);
    const alvo = Math.floor(totalCI / doadores.length);
    while (carga(novo.p.id) < alvo) {
      let doador: string | null = null;
      let maior = 0;
      for (const id of doadores) {
        const n = [...liderados.get(id)!].filter(movivel).length;
        // o superintendente cede primeiro: CIs sem gerente são os primeiros realocados
        const peso = id === doadores[0] ? n * 100 : n;
        if (n > 0 && peso > maior) { maior = peso; doador = id; }
      }
      if (doador === null) break;
      const candidato = [...liderados.get(doador)!].find(movivel)!;
      trocarGestor(porId.get(candidato)!, novo.p.id);
    }
  }

  // ── Vagas ─────────────────────────────────────────────────────────────────

  function abrirVaga(t: Mes, dir: Diretoria, esp: string, sen: Senioridade, origem: OrigemVaga): void {
    const lider = sen === 'gerência';
    const calor = dir === 'Tecnologia' ? C.aquecimentoTech(t) : 1;
    const dia = rng.int(1, 28);
    const interna = rng.chance(C.chanceVagaInterna(dir, sen));
    const soPropriaDiretoria = dir === 'Financeiro & Risco' && rng.chance(C.FR_PREFERE_PROPRIA_DIRETORIA);
    let candidatos: number;
    let ofertas: number;
    let dias: number;
    let custo: number;
    if (interna) {
      candidatos = rng.poisson(4) + 1;
      ofertas = 1;
      dias = Math.round(C.TTF_BASE[dir] * 0.6 * Math.exp(rng.normal(0, 0.25)));
      custo = 900 + 60 * candidatos;
    } else {
      candidatos = Math.max(1, rng.poisson(C.CANDIDATOS[dir] * (lider ? 0.4 : 1) / calor));
      const aceite = C.ACEITE_BASE[dir] / Math.pow(calor, 0.6);
      let recusas = 0;
      while (recusas < 4 && !rng.chance(aceite)) recusas++;
      ofertas = recusas + 1;
      dias = Math.round(C.TTF_BASE[dir] * calor * (lider ? 1.35 : 1) * Math.exp(rng.normal(0, 0.3))) + C.DIAS_POR_RECUSA * recusas;
      const ref = referencia(sen, dir);
      const headhunter = lider ? 2 * ref : sen === 'sênior' && rng.chance(0.5) ? ref : 0;
      custo = 1500 + 120 * candidatos + headhunter;
    }
    dias = Math.max(7, dias);
    const r: Requisicao = {
      id: `R${String(++seqVaga).padStart(5, '0')}`,
      diretoria: dir, especialidade: esp, senioridade: sen, origem, abertura: t,
      fechamento: null, preenchimento: null, ocupante: null, diasParaPreencher: dias,
      candidatos, ofertas, aceites: 1, custo: Math.round(custo / 10) * 10,
    };
    const v: Vaga = { r, fechaEm: somarMeses(t, Math.floor((dia - 1 + dias) / 30.44)), interna, soPropriaDiretoria };
    vagas.push(v);
    vagasAbertas.push(v);
  }

  function escolherInterno(v: Vaga, t: Mes): Sim | null {
    const { diretoria: dir, especialidade: esp, senioridade: sen } = v.r;
    const elegiveis: Sim[] = [];
    const pesos: number[] = [];
    for (const s of todas) {
      if (!s.ativo || s.saindo || s.ocupado || s.fixo || s.p.admissao >= t) continue;
      if (tempoDeCasa(s.p.admissao, t) < 12 || mesIdx(t) - mesIdx(s.inicioPosicao) < 12) continue;
      let w: number;
      if (sen === 'gerência') {
        if (s.seg.senioridade !== 'sênior' || s.seg.diretoria !== dir) continue;
        w = PESO_PERF_INTERNO_GERENCIA[s.p.performance] * (s.seg.especialidade === esp ? 3 : 1) * (s.p.genero === 'mulher' ? C.PESO_MULHER_PROMOCAO_GERENCIA : 1);
      } else {
        if (s.seg.senioridade !== sen || s.seg.especialidade === esp) continue;
        if (v.soPropriaDiretoria && s.seg.diretoria !== dir) continue;
        w = PESO_PERF_INTERNO_CI[s.p.performance];
      }
      if (w > 0) { elegiveis.push(s); pesos.push(w); }
    }
    return elegiveis.length === 0 ? null : rng.weighted(elegiveis, pesos);
  }

  function moverInterno(s: Sim, v: Vaga, t: Mes): void {
    const proximo = somarMeses(t, 1);
    const { diretoria: dir, especialidade: esp, senioridade: sen } = v.r;
    const origem = s.seg;
    const promocao = sen !== origem.senioridade;
    let seg: Segmento;
    if (promocao) {
      const faixa = rng.weighted(['piso', 'q1', 'mediana'] as const, C.FAIXA_PROMOVIDO);
      seg = novoSegmento(proximo, 'promoção', dir, esp, sen, faixa, cargo(dir, sen, false));
    } else if (dir === origem.diretoria) {
      seg = { ...origem, desde: proximo, motivo: 'movimentação', especialidade: esp };
    } else {
      seg = novoSegmento(proximo, 'movimentação', dir, esp, sen, origem.faixa, cargo(dir, sen, false));
    }
    s.pendente = seg;
    s.ocupado = true;
    v.r.preenchimento = 'interno';
    v.r.ocupante = s.p.id;
    abrirVaga(t, origem.diretoria, origem.especialidade, origem.senioridade, 'reposição');
    if (promocao) {
      trocarGestor(s, superintendente.get(esp)!);
      // a gerência nova vale em t+1, mas a carga já é redistribuída na decisão
      rebalancear(s, esp);
    } else {
      trocarGestor(s, gestorParaCI(esp));
    }
  }

  function contratarExterno(v: Vaga, t: Mes): void {
    const { diretoria: dir, especialidade: esp, senioridade: sen } = v.r;
    const s = criarPessoa({
      admissao: t, nascimentoRef: t, dir, esp, sen, mesContratacao: t,
      talentoTech: dir === 'Tecnologia' && t >= C.INICIO_TALENTO_TECH && !ehLideranca(sen),
    });
    definirGestorInicial(s, gestorPara(esp, sen), t);
    v.r.preenchimento = 'externo';
    v.r.ocupante = s.p.id;
    if (sen === 'gerência') rebalancear(s, esp);
  }

  // ── Saídas ────────────────────────────────────────────────────────────────

  function notaDefasada(s: Sim, t: Mes): number | null {
    const limite = somarMeses(t, -2);
    let nota: number | null = null;
    for (const n of s.notas) if (n.mes <= limite) nota = n.nota;
    return nota;
  }

  function multiplicadorVoluntario(s: Sim, t: Mes): number {
    const { diretoria: dir, faixa } = s.seg;
    const perf = s.p.performance;
    const subpago = faixa === 'piso' || faixa === 'q1';
    let m = C.MULT_FAIXA[faixa];
    if (perf === 'acima') m *= 1.15;
    else if (perf === 'abaixo') m *= 1.2;
    if (dir === 'Tecnologia') {
      const calor = C.aquecimentoTech(t);
      m *= 1 + 0.3 * (calor - 1);
      // o mercado assedia quem já tem 1 ano de casa (experiência comprovada na Verta)
      const veterano = tempoDeCasa(s.p.admissao, t) >= 12;
      if (perf === 'acima' && veterano) m *= 1 + 1.5 * (calor - 1);
      if (perf === 'acima' && subpago && veterano) m *= 1 + (calor - 1);
    }
    m *= C.multNota(notaDefasada(s, t));
    m *= C.MULT_TROCAS_GESTOR[Math.min(2, s.trocas.filter(x => x <= t && mesIdx(t) - mesIdx(x) < 12).length)];
    if (tempoDeCasa(s.p.admissao, t) < 12) {
      m *= C.MULT_NOVATO;
      if (s.p.onboarding === 'incompleto') m *= C.MULT_ONBOARDING_INCOMPLETO;
    }
    if (s.ultimaMobilidade !== null && mesIdx(t) - mesIdx(s.ultimaMobilidade) < 12) m *= C.MULT_MOBILIDADE_RECENTE;
    if (s.extrasAnterior > C.LIMITE_HORAS_EXTRAS) m *= C.MULT_HORAS_EXTRAS;
    if (dir === 'Distribuição & Assessoria' && mesDoAno(t) === 1) m *= C.MULT_JANEIRO_DISTRIBUICAO;
    return m;
  }

  function motivoVoluntario(s: Sim, t: Mes): MotivoDesligamento {
    const subpago = s.seg.faixa === 'piso' || s.seg.faixa === 'q1';
    const nota = notaDefasada(s, t);
    if (subpago || (s.seg.diretoria === 'Tecnologia' && s.p.performance === 'acima' && C.aquecimentoTech(t) > 1.2)) {
      return rng.chance(0.7) ? 'remuneração' : 'carreira';
    }
    if (nota !== null && nota <= 6) return rng.chance(0.6) ? 'liderança e clima' : 'carreira';
    return rng.weighted(['carreira', 'pessoal', 'remuneração'] as const, [0.4, 0.35, 0.25]);
  }

  function desligar(s: Sim, t: Mes, tipo: TipoDesligamento, motivo: MotivoDesligamento): void {
    s.saindo = true;
    s.p.desligamento = { mes: t, tipo, motivo };
    if (s.gestor !== null) liderados.get(s.gestor)?.delete(s.p.id);
    for (const id of [...liderados.get(s.p.id)!]) {
      const r = porId.get(id)!;
      trocarGestor(r, r.seg.senioridade === 'gerência' ? superintendente.get(r.seg.especialidade)! : gestorParaCI(s.seg.especialidade, s.p.id));
    }
    abrirVaga(t, s.seg.diretoria, s.seg.especialidade, s.seg.senioridade, 'reposição');
  }

  function amostraSemReposicao(pool: Sim[], pesos: number[], n: number): Sim[] {
    const itens = pool.slice();
    const ws = pesos.slice();
    const out: Sim[] = [];
    for (let k = 0; k < n && itens.length > 0; k++) {
      const i = rng.weighted(itens.map((_, j) => j), ws);
      out.push(itens[i]);
      itens.splice(i, 1);
      ws.splice(i, 1);
    }
    return out;
  }

  // ── População inicial ─────────────────────────────────────────────────────

  const t0 = MES_INICIO_SIMULACAO;
  for (const dir of DIRETORIAS) {
    const est = ESTRUTURA[dir];
    const d = criarPessoa({
      admissao: somarMeses(t0, -rng.int(36, 150)), nascimentoRef: t0, dir, esp: est.especialidades[0].nome, sen: 'diretoria',
      fixo: { nome: est.diretor, ehDiretor: true }, mesContratacao: t0,
    });
    diretor.set(dir, d.p.id);
    definirGestorInicial(d, null, d.p.admissao);
    for (const e of est.especialidades) {
      const sup = criarPessoa({
        admissao: somarMeses(t0, -rng.int(24, 130)), nascimentoRef: t0, dir, esp: e.nome, sen: 'diretoria',
        fixo: { nome: e.superintendente, ehDiretor: false }, mesContratacao: t0,
      });
      superintendente.set(e.nome, sup.p.id);
      definirGestorInicial(sup, d.p.id, sup.p.admissao);
    }
    const restante = C.HC_INICIAL[dir] - 1 - est.especialidades.length;
    const pesos = C.PESO_ESPECIALIDADE[dir];
    const somaPesos = pesos.reduce((a, b) => a + b, 0);
    let alocado = 0;
    est.especialidades.forEach((e, i) => {
      const nEsp = i === est.especialidades.length - 1 ? restante - alocado : Math.round(restante * pesos[i] / somaPesos);
      alocado += nEsp;
      const nGerentes = Math.max(1, Math.round(nEsp / (C.CI_POR_GERENTE[dir] + 1)));
      const gerentes: Sim[] = [];
      for (let g = 0; g < nGerentes; g++) {
        const casa = 6 + Math.floor(-Math.log(Math.max(1e-9, rng.next())) * 55);
        const s = criarPessoa({ admissao: somarMeses(t0, -Math.min(casa, 200)), nascimentoRef: t0, dir, esp: e.nome, sen: 'gerência', mesContratacao: t0 });
        s.inicioPosicao = somarMeses(t0, -rng.int(0, Math.min(casa, 30)));
        definirGestorInicial(s, superintendente.get(e.nome)!, s.p.admissao);
        gerentes.push(s);
      }
      for (let c = 0; c < nEsp - nGerentes; c++) {
        const sen = rng.weighted(['júnior', 'pleno', 'sênior'] as const, C.MIX_CI[dir]);
        const casa = 1 + Math.floor(-Math.log(Math.max(1e-9, rng.next())) * 34);
        const s = criarPessoa({ admissao: somarMeses(t0, -Math.min(casa, 180)), nascimentoRef: t0, dir, esp: e.nome, sen, mesContratacao: t0 });
        s.inicioPosicao = somarMeses(t0, -rng.int(0, Math.min(casa, 30)));
        definirGestorInicial(s, gerentes[c % gerentes.length].p.id, s.p.admissao);
      }
    });
  }

  // ── Loop mensal ───────────────────────────────────────────────────────────

  for (const t of MESES_SIMULACAO) {
    const proximo = somarMeses(t, 1);
    const naJanela = t >= MES_INICIO;
    const ativasInicio = todas.filter(s => s.ativo);
    const cicloIdx = CICLOS_ENPS.indexOf(t);

    // 1. Atividade mensal
    for (const s of ativasInicio) {
      const dir = s.seg.diretoria;
      const extras = ehLideranca(s.seg.senioridade) ? 0 : rng.poisson(C.HORAS_EXTRAS_BASE[dir] + C.HORAS_EXTRAS_POR_VAGA * vacanciaAnterior[dir]);
      const pressaoClima = dir === 'Operações' ? -0.04 * C.clima(dir, t) : 0;
      const ausencia = rng.poisson(C.AUSENCIA_BASE + C.AUSENCIA_POR_HORA_EXTRA * Math.max(0, s.extrasAnterior - C.LIMITE_HORAS_AUSENCIA) + pressaoClima);
      const casa = tempoDeCasa(s.p.admissao, t);
      const onboarding = casa >= 1 && casa <= 3 ? C.TREINO_ONBOARDING[s.p.onboarding] : 0;
      const treino = rng.poisson(C.TREINO_BASE[dir] + onboarding);
      s.extrasMes = extras;
      if (naJanela) {
        if (s.p.mensal === null) s.p.mensal = { desde: t, treino: [], ausencia: [], extras: [] };
        s.p.mensal.treino.push(treino);
        s.p.mensal.ausencia.push(ausencia);
        s.p.mensal.extras.push(extras);
      }
    }

    // 2. eNPS
    if (ehCicloEnps(t)) {
      for (const s of ativasInicio) {
        const trocasRecentes = s.trocas.filter(m => mesIdx(t) - mesIdx(m) < 6).length;
        const media = C.NOTA_SATISFACAO[s.p.satisfacao] + C.clima(s.seg.diretoria, t) + s.offsetNota
          - 0.7 * trocasRecentes - 0.06 * Math.max(0, s.extrasAnterior - 8);
        const nota = Math.max(0, Math.min(10, Math.round(rng.normal(media, 1))));
        s.notas.push({ mes: t, nota });
        const respondeu = rng.chance(C.TAXA_RESPOSTA_ENPS);
        if (naJanela && cicloIdx >= 0) s.p.enps[cicloIdx] = respondeu ? nota : null;
      }
    }

    // 3. Desligamentos
    if (mesDoAno(t) === 1) {
      const pool = ativasInicio.filter(s => !s.fixo && s.seg.diretoria === 'Distribuição & Assessoria' && !ehLideranca(s.seg.senioridade));
      const cortados = amostraSemReposicao(pool, pool.map(s => PESO_PERF_CORTE[s.p.performance]), Math.round(pool.length * C.CORTE_JANEIRO_DISTRIBUICAO));
      for (const s of cortados) desligar(s, t, 'involuntário', 'performance');
    }
    for (const s of ativasInicio) {
      if (s.fixo || s.saindo) continue;
      if (rng.chance(C.INVOLUNTARIO_MENSAL[s.p.performance])) {
        const motivo = s.p.performance === 'abaixo' || rng.chance(0.5) ? 'performance' : 'reestruturação';
        desligar(s, t, 'involuntário', motivo);
        continue;
      }
      const p = Math.min(0.5, C.BASE_VOLUNTARIO_ANUAL[s.seg.diretoria] / 12 * multiplicadorVoluntario(s, t));
      if (rng.chance(p)) desligar(s, t, 'voluntário', motivoVoluntario(s, t));
    }

    // 4. Vagas que fecham neste mês
    for (const v of vagasAbertas.filter(x => x.fechaEm === t)) {
      const interno = v.interna ? escolherInterno(v, t) : null;
      if (interno) moverInterno(interno, v, t);
      else contratarExterno(v, t);
      v.r.fechamento = t;
    }
    for (let i = vagasAbertas.length - 1; i >= 0; i--) if (vagasAbertas[i].r.fechamento !== null) vagasAbertas.splice(i, 1);

    // 5a. Promoções de ciclo (Mar e Set)
    if (mesDoAno(t) === 3 || mesDoAno(t) === 9) {
      for (const sen of ['júnior', 'pleno'] as const) {
        const elegiveis = ativasInicio.filter(s => !s.saindo && !s.ocupado && s.seg.senioridade === sen
          && mesIdx(t) - mesIdx(s.inicioPosicao) >= C.MESES_MINIMOS_NO_NIVEL && s.p.performance !== 'abaixo');
        const n = Math.round(elegiveis.length * C.PROMOCAO_CICLO[sen]!);
        const promovidos = amostraSemReposicao(elegiveis, elegiveis.map(s => PESO_PERF_PROMOCAO[s.p.performance]), n);
        for (const s of promovidos) {
          const novaSen = SENIORIDADES[SENIORIDADES.indexOf(sen) + 1];
          const faixa = rng.weighted(['piso', 'q1', 'mediana'] as const, C.FAIXA_PROMOVIDO);
          s.pendente = novoSegmento(proximo, 'promoção', s.seg.diretoria, s.seg.especialidade, novaSen, faixa, s.seg.cargo);
          s.ocupado = true;
        }
      }
    }

    // 5b. N5: rotação entre especialidades de Financeiro & Risco
    const espFR = ESTRUTURA['Financeiro & Risco'].especialidades.map(e => e.nome);
    for (const s of ativasInicio) {
      if (s.saindo || s.ocupado || s.fixo || s.seg.diretoria !== 'Financeiro & Risco' || ehLideranca(s.seg.senioridade)) continue;
      if (mesIdx(t) - mesIdx(s.inicioPosicao) < 12 || !rng.chance(C.ROTACAO_FR_MENSAL)) continue;
      const destino = rng.pick(espFR.filter(e => e !== s.seg.especialidade));
      s.pendente = { ...s.seg, desde: proximo, motivo: 'movimentação', especialidade: destino };
      s.ocupado = true;
      trocarGestor(s, gestorParaCI(destino));
    }

    // 5c. L3: reorganização de Operações
    const fracaoReorg = C.REORG_OPERACOES[t];
    if (fracaoReorg !== undefined) {
      for (const s of ativasInicio) {
        if (s.saindo || s.fixo || s.seg.diretoria !== 'Operações' || ehLideranca(s.seg.senioridade) || s.pendente) continue;
        if (!rng.chance(fracaoReorg)) continue;
        const outros = gerentesDe(s.seg.especialidade).filter(g => g.p.id !== s.gestor);
        if (outros.length > 0) trocarGestor(s, rng.pick(outros).p.id);
      }
    }

    // 6. Vagas de crescimento
    for (const dir of DIRETORIAS) {
      const especialidades = ESTRUTURA[dir].especialidades.map(e => e.nome);
      for (let i = 0; i < C.vagasDeCrescimento(dir, t); i++) {
        const sen = rng.weighted(['júnior', 'pleno', 'sênior', 'gerência'] as const, C.MIX_VAGA_CRESCIMENTO);
        abrirVaga(t, dir, rng.weighted(especialidades, C.PESO_ESPECIALIDADE[dir]), sen, 'crescimento');
      }
    }

    // 7. Fechamento do mês
    for (const s of todas) {
      if (!s.ativo) continue;
      if (s.saindo) { s.ativo = false; continue; }
      if (s.pendente) {
        s.p.historico.push(s.pendente);
        s.seg = s.pendente;
        s.pendente = null;
        s.ultimaMobilidade = proximo;
        s.inicioPosicao = proximo;
      }
      s.extrasAnterior = s.extrasMes;
      s.extrasMes = 0;
      s.ocupado = false;
    }
    for (const [id, novo] of trocasPendentes) {
      const s = porId.get(id)!;
      if (!s.ativo) continue;
      const ultimo = s.p.gestores[s.p.gestores.length - 1];
      if (ultimo && ultimo.id === novo) continue;
      if (ultimo && s.p.admissao === t && ultimo.desde === t) {
        // recém-admitido realocado no próprio mês: corrige o gestor de entrada, não é troca
        ultimo.id = novo;
        continue;
      }
      s.p.gestores.push({ desde: proximo, id: novo });
      if (ultimo) s.trocas.push(proximo);
    }
    trocasPendentes.clear();
    const vacancia = Object.fromEntries(DIRETORIAS.map(d => [d, 0])) as Record<Diretoria, number>;
    const hc = Object.fromEntries(DIRETORIAS.map(d => [d, 0])) as Record<Diretoria, number>;
    for (const s of todas) if (s.ativo) hc[s.seg.diretoria]++;
    for (const v of vagasAbertas) vacancia[v.r.diretoria]++;
    for (const d of DIRETORIAS) vacancia[d] = hc[d] > 0 ? vacancia[d] / hc[d] : 0;
    vacanciaAnterior = vacancia;
  }

  // ── Saída: só quem passou pela janela ─────────────────────────────────────

  const pessoas = todas
    .filter(s => s.p.desligamento === null || s.p.desligamento.mes >= MES_INICIO)
    .map(s => s.p);
  for (const v of vagasAbertas) {
    v.r.diasParaPreencher = null;
    v.r.ofertas = 0;
    v.r.aceites = 0;
  }
  const requisicoes = vagas
    .filter(v => v.r.fechamento === null || v.r.fechamento >= MES_INICIO)
    .map(v => v.r);
  return { pessoas, requisicoes };
}
