/**
 * Tools do agente = motor da fase 1. Argumento inválido volta como erro legível para o modelo;
 * blocos de visualização só saem de resultados de tools; rastro com fórmula, argumentos e n.
 */

import { describe, expect, it } from 'vitest';
import { criarMotor } from '@/lib/analytics/engine';
import { motorCliente } from '@/lib/analytics/cliente';
import { ESQUEMAS_ARGUMENTOS } from '@/lib/analytics/schemas';
import { NOMES_FERRAMENTAS } from '@/lib/agente/contrato';
import { DEFINICOES_FERRAMENTAS, criarSessao, type SessaoFerramentas } from '@/lib/agente/ferramentas';
import type { ChamadaFerramenta } from '@/lib/agente/llm';
import { cubo } from '../analytics/carregar';

const motor = criarMotor([cubo()], 'cubo');
const periodo = { inicio: '2025-10', fim: '2026-09' };
let seq = 0;
const chamada = (name: string, args: unknown): ChamadaFerramenta => ({
  id: `call_${++seq}`,
  type: 'function',
  function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) },
});
const novaSessao = () => criarSessao({ motor, motorSinais: motorCliente });
async function rodar(sessao: SessaoFerramentas, nome: string, args: unknown) {
  return sessao.executar(sessao.preparar(chamada(nome, args)));
}

describe('definições das tools', () => {
  it('uma tool genérica por função do motor, com o schema JSON da fase 1, mais catálogo, sinais e mostrar', () => {
    expect(DEFINICOES_FERRAMENTAS.map(d => d.function.name)).toEqual([...NOMES_FERRAMENTAS]);
    const valor = DEFINICOES_FERRAMENTAS.find(d => d.function.name === 'valor')!;
    expect(valor.function.parameters.properties).toEqual(ESQUEMAS_ARGUMENTOS.valor.properties);
    expect(valor.function.description).toBe(ESQUEMAS_ARGUMENTOS.valor.description);
    for (const d of DEFINICOES_FERRAMENTAS) expect(d.function.parameters.additionalProperties).toBe(false);
  });
});

describe('execução', () => {
  it('chamada válida devolve o resultado do motor (bruto) e um resumo para o modelo com id', async () => {
    const sessao = novaSessao();
    const args = { indicador: 'turnover', periodo, filtros: { diretoria: 'Tecnologia' } };
    const r = await rodar(sessao, 'valor', args);
    expect(r).toMatchObject({ id: 'r1', ferramenta: 'valor', ok: true });
    expect(r.dados).toEqual(motor.valor(args as Parameters<typeof motor.valor>[0]));
    expect(r.paraModelo).toMatchObject({ id: 'r1', indicador: 'turnover', unidade: '% a.a.', periodo: 'Out/25 a Set/26' });
    expect(r.rotulo).toMatch(/Turnover total.*Tecnologia/);
  });

  it('argumento inválido vira erro legível para o modelo se corrigir, sem exceção', async () => {
    const sessao = novaSessao();
    const invalido = await rodar(sessao, 'valor', { indicador: 'rotatividade', periodo });
    expect(invalido.ok).toBe(false);
    expect(invalido.paraModelo).toMatchObject({ id: 'r1', erro: expect.stringContaining('indicador: "rotatividade" não é um valor aceito') });

    // regra do motor (o cubo só tem diretoria e senioridade): ErroConsulta com as dimensões válidas
    const motorRecusa = await rodar(sessao, 'decompor', { indicador: 'turnover', periodo, dimensao: 'genero' });
    expect(motorRecusa.ok).toBe(false);
    expect(String((motorRecusa.paraModelo as { erro: string }).erro)).toMatch(/Dimensões válidas: diretoria, senioridade/);

    const json = await rodar(sessao, 'valor', '{"indicador": "turnover",');
    expect((json.paraModelo as { erro: string }).erro).toMatch(/JSON/);

    const desconhecida = await rodar(sessao, 'turnoverPorMes', {});
    expect((desconhecida.paraModelo as { erro: string }).erro).toMatch(/Ferramentas disponíveis: listarIndicadores, valor/);
  });

  it('sinais e catálogo respondem sem tocar no motor do roster', async () => {
    const sessao = novaSessao();
    const sinais = await rodar(sessao, 'sinais', { periodo, diretoria: 'Operações' });
    expect(sinais.ok).toBe(true);
    const lista = (sinais.paraModelo as { sinais: Array<{ diretoria: string | null; evidencia: string }> }).sinais;
    expect(lista.length).toBeGreaterThan(0);
    expect(lista.every(s => s.diretoria === 'Operações')).toBe(true);
    const catalogo = await rodar(sessao, 'listarIndicadores', { indicador: 'enps' });
    expect(catalogo.paraModelo).toMatchObject({ indicadores: [{ id: 'enps', meta: 20 }] });
  });
});

describe('mostrar → blocos de visualização', () => {
  it('monta cada tipo só a partir do resultado da tool, com rastreio e id estável', async () => {
    const sessao = novaSessao();
    const serie = await rodar(sessao, 'serie', { indicador: 'enps', periodo, filtros: { diretoria: 'Operações' } });
    const decompor = await rodar(sessao, 'decompor', { indicador: 'turnover', periodo, dimensao: 'diretoria' });
    const comparar = await rodar(sessao, 'comparar', { indicador: 'turnover', a: { periodo, filtros: { diretoria: 'Tecnologia' } }, b: { periodo } });
    const valor = await rodar(sessao, 'valor', { indicador: 'absenteismo', periodo });
    const mostrar = await rodar(sessao, 'mostrar', { blocos: [{ resultado: 'r1' }, { resultado: 'r2' }, { resultado: 'r3' }] });
    const mostrar2 = await rodar(sessao, 'mostrar', { blocos: [{ resultado: 'r4' }, { resultado: 'r2', tipo: 'tabela' }] });
    expect(mostrar.ok && mostrar2.ok).toBe(true);
    const blocos = sessao.blocos();
    expect(blocos.map(b => b.tipo)).toEqual(['serie', 'barras', 'comparacao', 'kpi', 'tabela']);

    const [bSerie, bBarras, bComp, bKpi] = blocos;
    const dSerie = serie.dados as { pontos: Array<{ valor: number | null; rotulo: string }>; rastreio: unknown };
    expect(bSerie.tipo === 'serie' && bSerie.pontos.map(p => [p.rotulo, p.valor])).toEqual(dSerie.pontos.map(p => [p.rotulo, p.valor]));
    expect(bSerie.rastreio).toEqual(dSerie.rastreio);
    const dDec = decompor.dados as { segmentos: Array<{ segmento: string; valor: number | null }>; total: { valor: number } };
    expect(bBarras.tipo === 'barras' && bBarras.barras.map(b => [b.rotulo, b.valor])).toEqual(dDec.segmentos.map(s => [s.segmento, s.valor]));
    expect(bBarras.tipo === 'barras' && bBarras.total).toBe(dDec.total.valor);
    expect(bComp.tipo === 'comparacao' && bComp.diferenca).toBe((comparar.dados as { diferenca: number }).diferenca);
    expect(bKpi.tipo === 'kpi' && bKpi.valor).toBe((valor.dados as { valor: number }).valor);
    expect(bSerie.titulo).not.toMatch(/\d/);
    expect(blocos.every(b => /^v-[a-z0-9]+$/.test(b.id))).toBe(true);

    // mesma consulta em outra conversa (filtros em outra ordem) → mesmo id
    const outra = novaSessao();
    await rodar(outra, 'serie', { indicador: 'enps', filtros: { diretoria: 'Operações' }, periodo });
    await rodar(outra, 'mostrar', { blocos: [{ resultado: 'r1' }] });
    expect(outra.blocos()[0].id).toBe(bSerie.id);
  });

  it('o modelo não fornece números: id inexistente, tipo incompatível ou campo extra viram erro, sem bloco', async () => {
    const sessao = novaSessao();
    await rodar(sessao, 'valor', { indicador: 'turnover', periodo });
    const inexistente = await rodar(sessao, 'mostrar', { blocos: [{ resultado: 'r9' }] });
    const incompativel = await rodar(sessao, 'mostrar', { blocos: [{ resultado: 'r1', tipo: 'serie' }] });
    const comNumero = await rodar(sessao, 'mostrar', { blocos: [{ resultado: 'r1', valor: 99 }] });
    const deErro = await rodar(sessao, 'mostrar', { blocos: [{ resultado: 'r3' }] }); // r3 é o próprio "mostrar" que falhou
    expect([inexistente, incompativel, comNumero, deErro].map(r => r.ok)).toEqual([false, false, false, false]);
    expect((inexistente.paraModelo as { erro: string }).erro).toMatch(/r9/);
    expect((comNumero.paraModelo as { erro: string }).erro).toMatch(/valor: propriedade não permitida/);
    expect(sessao.blocos()).toEqual([]);
  });
});

describe('rastro', () => {
  it('lista cada tool chamada com argumentos resolvidos, fórmula do catálogo, n e erros', async () => {
    const sessao = novaSessao();
    await rodar(sessao, 'serie', { indicador: 'turnover', periodo });
    await rodar(sessao, 'valor', { indicador: 'rotatividade', periodo });
    const [ok, falha] = sessao.rastro();
    expect(ok).toMatchObject({
      resultado: 'r1',
      ferramenta: 'serie',
      ok: true,
      argumentos: { indicador: 'turnover', periodo, filtros: {}, granularidade: 'mes' },
      formula: expect.stringContaining('desligamentos'),
      fonte: 'cubo',
    });
    expect(ok.n).toBeGreaterThan(1000);
    expect(falha).toMatchObject({ resultado: 'r2', ferramenta: 'valor', ok: false, erro: expect.stringContaining('rotatividade') });
  });
});
