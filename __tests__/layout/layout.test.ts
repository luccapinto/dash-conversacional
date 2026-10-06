/**
 * Camada adaptativa: layout spec válido, rejeição de spec com número inventado (cai no layout
 * determinístico) e layout determinístico válido para todas as combinações padrão, sem IA.
 */

import { describe, expect, it } from 'vitest';
import { motorCliente } from '@/lib/analytics/cliente';
import { DIRETORIAS } from '@/lib/analytics/dominio';
import { CATALOGO } from '@/lib/analytics/catalog';
import { detectarSinais, formatar, LENTES } from '@/lib/analytics/signals';
import { verificarNumeros } from '@/lib/agente/guarda';
import { provedoresDoAmbiente } from '@/lib/agente/llm';
import { layoutDeterministico } from '@/lib/layout/deterministico';
import { gerarLayout, prepararEntradaIA, type RespostaLayoutIA } from '@/lib/layout/gerador';
import {
  ancorasDoSinal,
  chaveLayout,
  COMBINACOES_PADRAO,
  contextoDoSinal,
  MAX_SINAIS_LAYOUT,
  PERIODOS_PADRAO,
  sinaisDoRecorte,
  validarLayout,
  valoresDosSinais,
  type RecorteLayout,
} from '@/lib/layout/spec';
import { erroHttp, fetchFalso, texto } from '../agente/sse';

const provedores = provedoresDoAmbiente({ DEEPSEEK_API_KEY: 'chave-ds-teste', OPENROUTER_API_KEY: 'chave-or-teste' });
const recorte: RecorteLayout = { periodo: PERIODOS_PADRAO[0].periodo, diretoria: 'Operações', lente: 'chro' };
const sinais = sinaisDoRecorte(motorCliente, recorte);
const entrada = prepararEntradaIA(sinais);
const silencioso = () => {};

/** Resposta da IA bem-comportada, montada só com referências e números da entrada */
function respostaValida(): RespostaLayoutIA {
  const [s1, s2] = entrada.sinais;
  const a1 = s1.ancoras[0];
  return {
    manchete: 'O clima de Operações mudou de patamar e puxa a retenção',
    cards: ['enps', 'turnover_voluntario', 'turnover', 'absenteismo', 'horas_extras_pc', 'early_attrition', 'taxa_promocao', 'headcount'].map((indicador, i) => ({
      indicador: indicador as RespostaLayoutIA['cards'][number]['indicador'],
      destaque: i < 2 ? 'alto' : 'normal',
      titulo: i === 0 ? 'Clima em queda desde o início de 2025' : null,
    })),
    graficos: [{ sinal: s1.ref, titulo: 'eNPS de Operações mudou de patamar' }, { sinal: s2.ref, titulo: 'Turnover acompanha o clima' }],
    anotacoes: [{ ancora: a1.ref, texto: `${a1.ancora.rotulo}: ${a1.valorFormatado}` }],
    deepDives: [
      { sinal: s1.ref, ancora: a1.ref, pergunta: 'O que mudou no clima de Operações?' },
      { sinal: s2.ref, ancora: null, pergunta: 'Quem está saindo de Operações?' },
      { sinal: s1.ref, ancora: null, pergunta: 'Quanto custa a perda de pessoas em Operações?' },
    ],
  };
}

describe('combinações padrão', () => {
  it(`${PERIODOS_PADRAO.length} períodos × (Geral + ${DIRETORIAS.length} diretorias) × ${LENTES.length} lentes, chaves únicas`, () => {
    expect(COMBINACOES_PADRAO).toHaveLength(PERIODOS_PADRAO.length * (DIRETORIAS.length + 1) * LENTES.length);
    expect(new Set(COMBINACOES_PADRAO.map(chaveLayout)).size).toBe(COMBINACOES_PADRAO.length);
  });

  it('o layout determinístico é válido (schema, âncoras e números) em todas, sem IA', () => {
    for (const r of COMBINACOES_PADRAO) {
      const s = sinaisDoRecorte(motorCliente, r);
      const spec = layoutDeterministico(r, s);
      expect(validarLayout(spec, s), chaveLayout(r)).toEqual([]);
      expect(spec.origem).toBe('deterministico');
      expect(spec.cards.length).toBeGreaterThanOrEqual(6);
      if (s.length) expect(spec.cards[0].indicador).toBe(s[0].indicadores.at(-1));
    }
  });
});

describe('validarLayout', () => {
  const base = layoutDeterministico(recorte, sinais);

  it('recusa número que não está nos sinais, âncora que não existe e contexto de deep dive inválido', () => {
    const inventado = { ...base, manchete: 'Turnover de Operações chega a 31,4% a.a.' };
    expect(validarLayout(inventado, sinais)).toEqual(['manchete: número não rastreável nos sinais: "31,4%"']);

    const ancora = { ...base.anotacoes[0].ancora, rotulo: 'Fev/21' };
    expect(validarLayout({ ...base, anotacoes: [{ ...base.anotacoes[0], ancora }] }, sinais)[0]).toMatch(/^anotacoes\[0\]\.ancora: não é um ponto do sinal/);

    const deepDives = [{ ...base.deepDives[0], contexto: { periodo: { inicio: '2026-09', fim: '2025-10' } } }, ...base.deepDives.slice(1)];
    expect(validarLayout({ ...base, deepDives }, sinais)[0]).toMatch(/^deepDives\[0\]\.contexto: periodo: início depois do fim/);

    expect(validarLayout({ ...base, cards: [...base.cards, base.cards[0]].slice(-12) }, sinais).some(e => /repetido/.test(e))).toBe(true);
  });

  it('as âncoras são pontos exatos dos sinais', () => {
    for (const s of sinais) for (const a of ancorasDoSinal(s)) expect(s.pontos.some(p => p.rotulo === a.rotulo && p.indicador === a.indicador && p.periodo.inicio === a.periodo.inicio)).toBe(true);
  });

  it('só aceita números dos sinais de entrada: um valor real de outro sinal ou de um ponto não ancorado é recusado', () => {
    const todos = detectarSinais(motorCliente, { periodo: recorte.periodo, diretoria: 'Operações', lente: 'chro' });
    expect(sinais).toEqual(todos.slice(0, MAX_SINAIS_LAYOUT));
    const permitidos = valoresDosSinais(sinais);
    const recusavel = (pontos: typeof todos[number]['pontos']) =>
      pontos.map(p => (p.valor === null ? null : formatar(p.valor, CATALOGO[p.indicador].unidade))).find(t => t && verificarNumeros(t, permitidos).naoVerificados.length === 1);

    const deOutroSinal = recusavel(todos.slice(MAX_SINAIS_LAYOUT).flatMap(s => s.pontos));
    const daSerie = recusavel(sinais.flatMap(s => s.pontos));
    for (const real of [deOutroSinal, daSerie]) {
      expect(real).toBeTruthy();
      const erros = validarLayout({ ...base, manchete: `Operações registra ${real} no período` }, sinais);
      expect(erros).toHaveLength(1);
      expect(erros[0]).toMatch(/^manchete: número não rastreável nos sinais/);
    }
  });

  it('o deep dive só leva o ponto clicado quando é um mês do mesmo indicador dentro do período', () => {
    for (const s of sinais) {
      for (const a of ancorasDoSinal(s)) {
        const { ponto, indicador } = contextoDoSinal(s, recorte, a);
        const dentro = a.periodo.inicio === a.periodo.fim && a.periodo.fim >= recorte.periodo.inicio && a.periodo.fim <= recorte.periodo.fim;
        expect(ponto?.mes, `${s.id} ${a.rotulo}`).toBe(dentro && a.indicador === indicador ? a.periodo.fim : undefined);
      }
    }
  });
});

describe('gerarLayout', () => {
  it('spec da IA válido: monta o layout a partir das referências, em JSON mode, sem IA escrever números novos', async () => {
    const { fetch, pedidos } = fetchFalso([texto(JSON.stringify(respostaValida()))]);
    const r = await gerarLayout(recorte, { motor: motorCliente, provedores, fetch, log: silencioso });
    expect(r.motivo).toBeNull();
    expect(r.spec.origem).toBe('ia');
    expect(validarLayout(r.spec, sinais)).toEqual([]);
    expect(r.spec.graficos[0]).toMatchObject({ sinal: entrada.sinais[0].sinal.id, titulo: 'eNPS de Operações mudou de patamar' });
    expect(r.spec.anotacoes[0].ancora).toEqual(entrada.sinais[0].ancoras[0].ancora);
    expect(r.spec.deepDives[0].contexto).toMatchObject({ indicador: entrada.sinais[0].sinal.indicadores.at(-1), periodo: recorte.periodo, lente: 'chro' });
    expect(pedidos[0].corpo).toMatchObject({ response_format: { type: 'json_object' }, thinking: { type: 'disabled' } });
    expect(pedidos[0].corpo).not.toHaveProperty('tools');
  });

  it.each([
    ['número inventado no texto', () => texto(JSON.stringify({ ...respostaValida(), manchete: 'Turnover de Operações vai a 31,4% a.a.' }))],
    ['referência a sinal inexistente', () => texto(JSON.stringify({ ...respostaValida(), graficos: [{ sinal: 's99', titulo: 'Gráfico' }] }))],
    ['JSON quebrado', () => texto('{"manchete": "Operações')],
    ['resposta vazia', () => texto('')],
  ])('rejeita %s e cai no layout determinístico', async (_, resposta) => {
    const { fetch } = fetchFalso([resposta]);
    const r = await gerarLayout(recorte, { motor: motorCliente, provedores, fetch, log: silencioso });
    expect(r.spec).toEqual(layoutDeterministico(recorte, sinais));
    expect(r.motivo).toBeTruthy();
  });

  it('IA fora do ar (principal e reserva) ou sem chave: layout determinístico completo', async () => {
    const { fetch } = fetchFalso([erroHttp(503), erroHttp(503)]);
    const r = await gerarLayout(recorte, { motor: motorCliente, provedores, fetch, log: silencioso });
    expect(r.spec.origem).toBe('deterministico');
    const semChave = await gerarLayout(recorte, { motor: motorCliente, provedores: [], log: silencioso });
    expect(semChave.spec).toEqual(r.spec);
    expect(semChave.spec.cards.length).toBeGreaterThanOrEqual(6);
  });
});
