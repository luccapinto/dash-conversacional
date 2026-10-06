/**
 * Amostra pequena pela rota pública: o resumo que vai ao modelo, os blocos e o rastro que vão ao
 * navegador não levam número nem n de um recorte de pessoas abaixo do mínimo, só a frase
 * "amostra insuficiente (menos de N pessoas) — valor não divulgado".
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { motorCliente } from '@/lib/analytics/cliente';
import { MIN_AMOSTRA, type Motor } from '@/lib/analytics/engine';
import { motorServidor } from '@/lib/analytics/servidor';
import { executarAgente } from '@/lib/agente/agente';
import type { EventoAgente } from '@/lib/agente/contrato';
import { criarSessao, type SessaoFerramentas } from '@/lib/agente/ferramentas';
import type { ChamadaFerramenta } from '@/lib/agente/llm';
import { provedoresDoAmbiente } from '@/lib/agente/llm';
import { ferramentas, fetchFalso, texto } from './sse';

const SET26 = { inicio: '2026-09', fim: '2026-09' };
const ULTIMOS_12 = { inicio: '2025-10', fim: '2026-09' };
/** n = 1: a folha deste recorte é o salário de uma pessoa (R$ 44.200) */
const UMA_PESSOA = { diretoria: 'Gente', senioridade: 'diretoria', pcd: 'não', raca: 'branca', genero: 'homem' };
const DIRETORES_GENTE = { diretoria: 'Gente', senioridade: 'diretoria' };
const AVISO = `amostra insuficiente (menos de ${MIN_AMOSTRA} pessoas) — valor não divulgado`;
const SALARIO = /44[.,]?2/;

let motor: Motor;
let seq = 0;

beforeAll(() => {
  motor = motorServidor();
});

const chamada = (name: string, args: unknown): ChamadaFerramenta => ({ id: `call_${++seq}`, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const novaSessao = () => criarSessao({ motor, motorSinais: motorCliente, log: () => {} });
async function rodar(sessao: SessaoFerramentas, nome: string, args: unknown) {
  return sessao.executar(sessao.preparar(chamada(nome, args)));
}

describe('tools com amostra pequena', () => {
  it('valor: o modelo recebe só a frase, sem valor, n, eventos nem distância da meta', async () => {
    const r = await rodar(novaSessao(), 'valor', { indicador: 'folha', periodo: SET26, filtros: UMA_PESSOA });
    expect(r.ok).toBe(true);
    const m = r.paraModelo as Record<string, unknown>;
    expect(m).toMatchObject({ valor: null, aviso: AVISO, minimo: MIN_AMOSTRA });
    for (const campo of ['n', 'eventos', 'distanciaDaMeta', 'razaoMeta']) expect(m).not.toHaveProperty(campo);
    expect(JSON.stringify(m)).not.toMatch(SALARIO);
  });

  it('serie, decompor, cruzar, comparar, impacto e drivers: item pequeno sai sem número e com o aviso', async () => {
    const sessao = novaSessao();
    const pedidos: [string, unknown][] = [
      ['serie', { indicador: 'folha', periodo: ULTIMOS_12, filtros: UMA_PESSOA }],
      ['decompor', { indicador: 'folha', periodo: SET26, dimensao: 'genero', filtros: DIRETORES_GENTE }],
      ['cruzar', { indicador: 'turnover', periodo: ULTIMOS_12, dimensoes: ['genero', 'raca'], filtros: DIRETORES_GENTE }],
      ['comparar', { indicador: 'folha', a: { periodo: SET26, filtros: UMA_PESSOA }, b: { periodo: SET26, filtros: { diretoria: 'Gente' } } }],
      ['impacto', { indicador: 'turnover', periodo: ULTIMOS_12, filtros: DIRETORES_GENTE }],
      ['drivers', { indicador: 'turnover', periodo: ULTIMOS_12, filtros: DIRETORES_GENTE }],
    ];
    for (const [nome, args] of pedidos) {
      const r = await rodar(sessao, nome, args);
      expect(r.ok, nome).toBe(true);
      const json = JSON.stringify(r.paraModelo);
      expect(json, nome).toContain(AVISO);
      expect(json, nome).not.toMatch(SALARIO);
      // nenhum n de recorte pequeno: todo n que sobra é ≥ mínimo
      for (const [, n] of json.matchAll(/"n":(\d+(?:\.\d+)?)/g)) expect(Number(n), nome).toBeGreaterThanOrEqual(MIN_AMOSTRA);
    }
  });

  it('mostrar: os blocos saem sem número do recorte pequeno, com o aviso, e o rastreio sem somas', async () => {
    const sessao = novaSessao();
    await rodar(sessao, 'valor', { indicador: 'folha', periodo: SET26, filtros: UMA_PESSOA });
    await rodar(sessao, 'decompor', { indicador: 'folha', periodo: SET26, dimensao: 'senioridade', filtros: { diretoria: 'Gente' } });
    await rodar(sessao, 'comparar', { indicador: 'folha', a: { periodo: SET26, filtros: UMA_PESSOA }, b: { periodo: SET26, filtros: { diretoria: 'Gente' } } });
    await rodar(sessao, 'mostrar', { blocos: [{ resultado: 'r1' }, { resultado: 'r2', tipo: 'tabela' }, { resultado: 'r3' }] });
    const [kpi, tabela, comparacao] = sessao.blocos();
    expect(kpi).toMatchObject({ tipo: 'kpi', valor: null, n: null, aviso: AVISO });
    expect(kpi.rastreio).toMatchObject({ n: null, medidas: {} });
    expect(tabela.tipo).toBe('tabela');
    const diretoria = tabela.tipo === 'tabela' ? tabela.linhas.find(l => l.segmento === 'diretoria') : undefined;
    expect(diretoria).toEqual({ segmento: 'diretoria', valor: null, n: null, peso: null, composicao: null });
    expect(tabela.aviso).toBe(AVISO);
    expect(comparacao).toMatchObject({ tipo: 'comparacao', a: { valor: null, n: null }, diferenca: null, aviso: AVISO });
    for (const b of [kpi, tabela, comparacao]) expect(JSON.stringify(b)).not.toMatch(SALARIO);
  });
});

describe('rota pública', () => {
  it('pedindo a folha de uma pessoa: nada do valor nem do n chega ao navegador', async () => {
    const { fetch } = fetchFalso([
      ferramentas({ nome: 'valor', args: { indicador: 'folha', periodo: SET26, filtros: UMA_PESSOA } }),
      texto('Esse recorte tem ', AVISO, '.'),
    ]);
    const eventos: EventoAgente[] = [];
    await executarAgente(
      { mensagens: [{ papel: 'usuario', conteudo: 'Qual a folha do diretor homem branco sem deficiência de Gente?' }] },
      {
        ambiente: { motor, motorSinais: motorCliente, log: () => {} },
        provedores: provedoresDoAmbiente({ DEEPSEEK_API_KEY: 'chave-teste' }),
        fetch,
        emitir: e => eventos.push(e),
        log: () => {},
      },
    );
    const bloco = eventos.find(e => e.tipo === 'bloco');
    expect(bloco).toMatchObject({ bloco: { tipo: 'kpi', valor: null, n: null, aviso: AVISO } });
    const rastro = eventos.find(e => e.tipo === 'rastro');
    expect(rastro?.tipo === 'rastro' && rastro.itens[0]).not.toHaveProperty('n');
    const json = JSON.stringify(eventos);
    expect(json).not.toMatch(SALARIO);
    expect(json).not.toMatch(/"n":1\b/);
    expect(json).not.toMatch(/"folha":\d/);
    expect(eventos.at(-1)).toMatchObject({ tipo: 'fim', verificacao: { naoVerificados: [] } });
  });
});
