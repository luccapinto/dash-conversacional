/**
 * Invariantes do dataset gerado (lib/dados). Valem para os arquivos commitados.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import {
  DIRETORIAS,
  MESES,
  ativaNoFim,
  gestorEm,
  segmentoEm,
  somarMeses,
  type Eventos,
  type Pessoa,
} from '@/lib/analytics/dominio';
import { MEDIDAS, construirCubo, construirFatos, type TabelaFatos } from '@/lib/analytics/fatos';
import { cubo as lerCubo, eventos as lerEventos, roster as lerRoster } from './carregar';

let pessoas: Pessoa[];
let ev: Eventos;
let cubo: TabelaFatos;

/** Soma uma medida do cubo por (mês, diretoria) */
function porMesDiretoria(medida: string): number[][] {
  const out = MESES.map(() => DIRETORIAS.map(() => 0));
  const mes = cubo.codigos.mes!;
  const dir = cubo.codigos.diretoria!;
  const valores = cubo.medidas[medida as keyof typeof cubo.medidas]!;
  for (let i = 0; i < cubo.n; i++) out[mes[i]][dir[i]] += valores[i];
  return out;
}

beforeAll(() => {
  pessoas = lerRoster();
  ev = lerEventos();
  cubo = lerCubo();
});

describe('headcount e fluxos', () => {
  it('por diretoria e mês: hc(t) = hcIni(t) + admissões − desligamentos + entradas − saídas internas', () => {
    const hc = porMesDiretoria('hc');
    const ini = porMesDiretoria('hcIni');
    const adm = porMesDiretoria('adm');
    const desl = porMesDiretoria('desl');
    const entra = porMesDiretoria('entraDiretoria');
    const sai = porMesDiretoria('saiDiretoria');
    for (let m = 0; m < MESES.length; m++) {
      for (let d = 0; d < DIRETORIAS.length; d++) {
        expect(hc[m][d], `${MESES[m]} ${DIRETORIAS[d]}`).toBe(ini[m][d] + adm[m][d] - desl[m][d] + entra[m][d] - sai[m][d]);
      }
    }
  });

  it('o estoque do fim de t é o início de t+1 em cada célula do cubo', () => {
    const porCelula = (medida: 'hc' | 'hcIni') => {
      const v = cubo.medidas[medida]!;
      const map = new Map<string, number>();
      for (let i = 0; i < cubo.n; i++) map.set(`${cubo.codigos.mes![i]}|${cubo.codigos.diretoria![i]}|${cubo.codigos.senioridade![i]}`, v[i]);
      return map;
    };
    const hc = porCelula('hc');
    const ini = porCelula('hcIni');
    for (const [chave, valor] of hc) {
      const [m, d, s] = chave.split('|').map(Number);
      if (m + 1 < MESES.length) expect(ini.get(`${m + 1}|${d}|${s}`)).toBe(valor);
    }
  });

  it('headcount contado pessoa a pessoa bate com admissões, desligamentos e movimentações da tabela de eventos', () => {
    const contar = (mes: string) => {
      const c = Object.fromEntries(DIRETORIAS.map(d => [d, 0])) as Record<string, number>;
      for (const p of pessoas) if (ativaNoFim(p, mes)) c[segmentoEm(p, somarMeses(mes, 1))!.diretoria]++;
      return c;
    };
    let anterior = contar(somarMeses(MESES[0], -1));
    for (const t of MESES) {
      const atual = contar(t);
      for (const d of DIRETORIAS) {
        const adm = ev.admissoes.filter(e => e.mes === t && e.diretoria === d).length;
        const desl = ev.desligamentos.filter(e => e.mes === t && e.diretoria === d).length;
        const entra = ev.movimentacoes.filter(e => e.mes === t && e.para.diretoria === d && e.de.diretoria !== d).length;
        const sai = ev.movimentacoes.filter(e => e.mes === t && e.de.diretoria === d && e.para.diretoria !== d).length;
        expect(atual[d], `${t} ${d}`).toBe(anterior[d] + adm - desl + entra - sai);
      }
      anterior = atual;
    }
  });
});

describe('reconciliação entre tabelas', () => {
  const soma = (medida: string) => {
    const v = cubo.medidas[medida as keyof typeof cubo.medidas]!;
    let s = 0;
    for (let i = 0; i < cubo.n; i++) s += v[i];
    return s;
  };

  it('eventos de pessoas batem com o cubo', () => {
    expect(ev.admissoes.length).toBe(soma('adm'));
    expect(ev.desligamentos.length).toBe(soma('desl'));
    expect(ev.desligamentos.filter(d => d.tipo === 'voluntário').length).toBe(soma('deslVol'));
    expect(ev.promocoes.length).toBe(soma('promo'));
    expect(ev.movimentacoes.length).toBe(soma('mob'));
  });

  it('vagas batem com admissões e preenchimentos internos', () => {
    const naJanela = (m: string | null) => m !== null && m >= MESES[0] && m <= MESES[MESES.length - 1];
    const fechadas = ev.requisicoes.filter(r => naJanela(r.fechamento));
    expect(fechadas.length).toBe(soma('vagasFechadas'));
    expect(ev.requisicoes.filter(r => naJanela(r.abertura)).length).toBe(soma('vagasNovas'));
    // toda admissão da janela vem de uma vaga externa fechada no mesmo mês, e vice-versa
    expect(fechadas.filter(r => r.preenchimento === 'externo').length).toBe(ev.admissoes.length);
    const vagaPorId = new Map(ev.requisicoes.map(r => [r.id, r]));
    for (const a of ev.admissoes) {
      const r = vagaPorId.get(a.requisicao)!;
      expect(r.ocupante).toBe(a.pessoa);
      expect(r.fechamento).toBe(a.mes);
    }
    // preenchimento interno = promoção ou movimentação ligada à vaga
    const internas = ev.promocoes.filter(p => p.requisicao).length + ev.movimentacoes.filter(m => m.requisicao).length;
    expect(fechadas.filter(r => r.preenchimento === 'interno').length).toBe(internas);
    expect(internas).toBe(soma('vagasInternas'));
  });

  it('o cubo é o roster agregado por mês × diretoria × senioridade', () => {
    const recalculado = construirCubo(construirFatos(pessoas, ev.requisicoes));
    expect(recalculado.n).toBe(cubo.n);
    for (const m of MEDIDAS) expect(Array.from(recalculado.medidas[m]!), m).toEqual(Array.from(cubo.medidas[m]!));
  });
});

describe('calibração', () => {
  it('~5.000 pessoas ativas no fim, nas 6 diretorias', () => {
    const fim = MESES[MESES.length - 1];
    const ativas = pessoas.filter(p => ativaNoFim(p, fim));
    expect(ativas.length).toBeGreaterThan(4800);
    expect(ativas.length).toBeLessThan(5200);
    expect(new Set(ativas.map(p => segmentoEm(p, somarMeses(fim, 1))!.diretoria))).toEqual(new Set(DIRETORIAS));
  });

  it('mix voluntário/involuntário ≈ 70/30 na janela', () => {
    const vol = ev.desligamentos.filter(d => d.tipo === 'voluntário').length / ev.desligamentos.length;
    expect(vol).toBeGreaterThan(0.65);
    expect(vol).toBeLessThan(0.75);
  });

  it('todo gestor de quem está ativo é uma pessoa ativa (exceto diretores, que reportam ao CEO)', () => {
    const orfaos: string[] = [];
    for (const t of MESES) {
      const proximo = somarMeses(t, 1);
      const ativos = new Set(pessoas.filter(p => ativaNoFim(p, t)).map(p => p.id));
      let semGestor = 0;
      for (const p of pessoas) {
        if (!ativos.has(p.id)) continue;
        const g = gestorEm(p, proximo);
        if (g === null) semGestor++;
        else if (!ativos.has(g)) orfaos.push(`${t} ${p.id} → ${g}`);
      }
      expect(semGestor, t).toBe(DIRETORIAS.length);
    }
    expect(orfaos).toEqual([]);
  });
});
