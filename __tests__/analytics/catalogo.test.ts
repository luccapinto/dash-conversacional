/**
 * Contrato do catálogo: todo indicador tem cálculo, unidade, polaridade, explicação, e o valor
 * calculado pela fórmula do catálogo bate com uma conta independente feita direto no roster e
 * nas tabelas de eventos (sem passar pela tabela de fatos).
 */

import { beforeAll, describe, expect, it } from 'vitest';
import {
  CICLOS_ENPS,
  MESES,
  ativaNoFim,
  ativaNoInicio,
  ehLideranca,
  ehNegra,
  gestorEm,
  intervaloMeses,
  segmentoEm,
  tempoDeCasa,
  type Eventos,
  type Pessoa,
} from '@/lib/analytics/dominio';
import { DIMENSOES, agregar, construirFatos, dimensoesDaMedida, type Fonte } from '@/lib/analytics/fatos';
import { CATALOGO, DOMINIOS, INDICADORES, POLARIDADES, UNIDADES, type IdIndicador } from '@/lib/analytics/catalog';
import { eventos as lerEventos, roster as lerRoster } from './carregar';

const INICIO = '2025-10';
const FIM = '2026-09';
const PROXIMO = '2026-10';
const JANELA = intervaloMeses(INICIO, FIM);

let pessoas: Pessoa[];
let ev: Eventos;
let fonte: Fonte;

beforeAll(() => {
  pessoas = lerRoster();
  ev = lerEventos();
  fonte = construirFatos(pessoas, ev.requisicoes);
});

// ── Referências independentes (roster + eventos) ─────────────────────────────

const naJanela = (m: string | null) => m !== null && m >= INICIO && m <= FIM;
const ativasFim = () => pessoas.filter(p => ativaNoFim(p, FIM));
const segFim = (p: Pessoa) => segmentoEm(p, PROXIMO)!;
const exposicao = (filtro: (p: Pessoa, t: string) => boolean = () => true) =>
  JANELA.reduce((acc, t) => acc + pessoas.filter(p => ativaNoInicio(p, t) && filtro(p, t)).length, 0);
const deslJanela = () => ev.desligamentos.filter(d => naJanela(d.mes));
const fechadas = () => ev.requisicoes.filter(r => naJanela(r.fechamento));
const somaMensal = (campo: 'treino' | 'ausencia' | 'extras') => {
  let s = 0;
  for (const p of pessoas) {
    if (!p.mensal) continue;
    const i0 = MESES.indexOf(p.mensal.desde);
    p.mensal[campo].forEach((v, k) => { if (naJanela(MESES[i0 + k])) s += v; });
  }
  return s;
};
const proporcaoFim = (num: (p: Pessoa) => boolean, den: (p: Pessoa) => boolean = () => true) => {
  const base = ativasFim().filter(den);
  return base.filter(num).length / base.length * 100;
};
const lider = (p: Pessoa) => ehLideranca(segFim(p).senioridade);

const REFERENCIA: Record<IdIndicador, () => number> = {
  headcount: () => ativasFim().length,
  admissoes: () => ev.admissoes.filter(a => naJanela(a.mes)).length,
  crescimento_liquido: () => {
    const ini = pessoas.filter(p => ativaNoInicio(p, INICIO)).length;
    return (ativasFim().length - ini) / ini * 100;
  },
  span_controle: () => {
    const ativos = new Set(ativasFim().map(p => p.id));
    const gestores = new Set<string>();
    let liderados = 0;
    for (const p of ativasFim()) {
      const g = gestorEm(p, PROXIMO);
      if (g !== null && ativos.has(g)) { liderados++; gestores.add(g); }
    }
    return liderados / gestores.size;
  },
  pct_lideranca: () => proporcaoFim(lider),
  turnover: () => deslJanela().length / exposicao() * 1200,
  turnover_voluntario: () => deslJanela().filter(d => d.tipo === 'voluntário').length / exposicao() * 1200,
  turnover_involuntario: () => deslJanela().filter(d => d.tipo === 'involuntário').length / exposicao() * 1200,
  turnover_lamentado: () =>
    deslJanela().filter(d => d.tipo === 'voluntário' && d.performance === 'acima').length
    / exposicao(p => p.performance === 'acima') * 1200,
  early_attrition: () =>
    deslJanela().filter(d => d.tempoDeCasaMeses < 12).length
    / exposicao((p, t) => tempoDeCasa(p.admissao, t) < 12) * 1200,
  tempo_medio_casa: () => ativasFim().reduce((s, p) => s + tempoDeCasa(p.admissao, PROXIMO), 0) / ativasFim().length / 12,
  vagas_abertas: () => ev.requisicoes.filter(r => r.abertura <= FIM && (r.fechamento === null || r.fechamento > FIM)).length,
  time_to_fill: () => fechadas().reduce((s, r) => s + r.diasParaPreencher!, 0) / fechadas().length,
  aceite_oferta: () => fechadas().reduce((s, r) => s + r.aceites, 0) / fechadas().reduce((s, r) => s + r.ofertas, 0) * 100,
  preenchimento_interno: () => fechadas().filter(r => r.preenchimento === 'interno').length / fechadas().length * 100,
  custo_por_contratacao: () => fechadas().reduce((s, r) => s + r.custo, 0) / fechadas().length,
  enps: () => {
    let prom = 0, detr = 0, resp = 0;
    CICLOS_ENPS.forEach((c, i) => {
      if (!naJanela(c)) return;
      for (const p of pessoas) {
        const nota = p.enps[i];
        if (nota === null) continue;
        resp++;
        if (nota >= 9) prom++;
        else if (nota <= 6) detr++;
      }
    });
    return (prom - detr) / resp * 100;
  },
  absenteismo: () => somaMensal('ausencia') / (exposicao() * 21) * 100,
  horas_extras_pc: () => somaMensal('extras') / exposicao(),
  taxa_promocao: () => ev.promocoes.filter(p => naJanela(p.mes)).length / exposicao() * 1200,
  mobilidade_interna: () => ev.movimentacoes.filter(m => naJanela(m.mes)).length / exposicao() * 1200,
  horas_treinamento_pc: () => somaMensal('treino') / exposicao() * 12,
  mulheres: () => proporcaoFim(p => p.genero === 'mulher'),
  mulheres_lideranca: () => proporcaoFim(p => p.genero === 'mulher', lider),
  negros: () => proporcaoFim(p => ehNegra(p.raca)),
  negros_lideranca: () => proporcaoFim(p => ehNegra(p.raca), lider),
  pcd: () => proporcaoFim(p => p.pcd),
  gap_salarial_genero: () => {
    const compa = (g: string) => {
      const grupo = ativasFim().filter(p => p.genero === g);
      return grupo.reduce((s, p) => s + segFim(p).salario, 0) / grupo.reduce((s, p) => s + segFim(p).referencia, 0);
    };
    return (compa('mulher') / compa('homem') - 1) * 100;
  },
  folha: () => ativasFim().reduce((s, p) => s + segFim(p).salario, 0),
  custo_turnover: () => deslJanela().reduce((s, d) => s + d.salario, 0) * 6,
};

describe('contrato do catálogo', () => {
  it('cada indicador tem nome, pergunta, fórmula, explicação, unidade, polaridade e cálculo', () => {
    expect(INDICADORES.length).toBeGreaterThanOrEqual(20);
    for (const ind of INDICADORES) {
      expect(CATALOGO[ind.id]).toBe(ind);
      expect(ind.nome.trim().length, ind.id).toBeGreaterThan(2);
      for (const campo of [ind.pergunta, ind.formula, ind.explicacao]) expect(campo.trim().length, ind.id).toBeGreaterThan(10);
      expect(DOMINIOS).toContain(ind.dominio);
      expect(UNIDADES).toContain(ind.unidade);
      expect(POLARIDADES).toContain(ind.polaridade);
      expect(typeof ind.calcular).toBe('function');
      expect(ind.medidas.length).toBeGreaterThan(0);
      for (const ref of [ind.meta, ind.benchmark]) if (ref) expect(ref.origem.length, ind.id).toBeGreaterThan(5);
      if (ind.polaridade !== 'neutro' && ind.meta) expect(Number.isFinite(ind.meta.valor)).toBe(true);
    }
  });

  it('as dimensões de recorte existem em todas as tabelas que o cálculo lê', () => {
    for (const ind of INDICADORES) {
      expect(ind.dimensoes.length, ind.id).toBeGreaterThan(0);
      for (const d of ind.dimensoes) {
        expect(DIMENSOES).toContain(d);
        expect(d).not.toBe('mes');
        for (const m of ind.medidas) expect(dimensoesDaMedida(fonte, m), `${ind.id} × ${d} (${m})`).toContain(d);
      }
    }
  });

  it('todo indicador do catálogo tem uma referência independente neste teste', () => {
    expect(Object.keys(REFERENCIA).sort()).toEqual(INDICADORES.map(i => i.id).sort());
  });

  for (const id of Object.keys(REFERENCIA) as IdIndicador[]) {
    it(`${id}: fórmula do catálogo = conta direta no roster (Out/25 a Set/26, empresa toda)`, () => {
      const ind = CATALOGO[id];
      const [g] = agregar(fonte, { inicio: INICIO, fim: FIM, medidas: ind.medidas });
      const valor = ind.calcular({ ...g, meses: JANELA.length });
      const esperado = REFERENCIA[id]();
      expect(valor).not.toBeNull();
      expect(Number.isFinite(esperado)).toBe(true);
      expect(valor!).toBeCloseTo(esperado, 6);
    });
  }
});
