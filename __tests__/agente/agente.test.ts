/**
 * Loop do agente com o modelo mockado (fetch falso): tools em paralelo na mesma rodada, erro de
 * argumento devolvido ao modelo, limite de rodadas, blocos só de resultados de tools, rastro,
 * guarda de números no evento final e fallback de provedor que gruda na reserva.
 */

import { describe, expect, it } from 'vitest';
import { criarMotor } from '@/lib/analytics/engine';
import { motorCliente } from '@/lib/analytics/cliente';
import { executarAgente, MAX_RODADAS_FERRAMENTAS } from '@/lib/agente/agente';
import type { EntradaAgente, EventoAgente } from '@/lib/agente/contrato';
import { provedoresDoAmbiente } from '@/lib/agente/llm';
import { cubo } from '../analytics/carregar';
import { erroHttp, ferramentas, fetchFalso, texto, type PedidoCapturado, type RespostaFalsa } from './sse';

const motor = criarMotor([cubo()], 'cubo');
const ambiente = { motor, motorSinais: motorCliente, log: () => {} };
const provedores = provedoresDoAmbiente({ DEEPSEEK_API_KEY: 'chave-ds-teste', OPENROUTER_API_KEY: 'chave-or-teste' });
const periodo = { inicio: '2025-10', fim: '2026-09' };
const pergunta = { mensagens: [{ papel: 'usuario' as const, conteudo: 'Como está o turnover?' }] };
const br = (v: number) => v.toFixed(1).replace('.', ',');

async function rodar(fila: RespostaFalsa[], entrada: EntradaAgente = pergunta) {
  const { fetch, pedidos } = fetchFalso(fila);
  const eventos: EventoAgente[] = [];
  const metricas = await executarAgente(entrada, { ambiente, provedores, fetch, emitir: e => eventos.push(e), log: () => {} });
  return { eventos, pedidos, metricas };
}

const mensagensTool = (p: PedidoCapturado) => p.corpo.messages.filter(m => m.role === 'tool');

describe('executarAgente', () => {
  it('executa as tool calls da mesma rodada juntas e devolve os resultados num único pedido seguinte', async () => {
    const { eventos, pedidos } = await rodar([
      ferramentas(
        { id: 'c1', nome: 'valor', args: { indicador: 'turnover', periodo } },
        { id: 'c2', nome: 'serie', args: { indicador: 'turnover', periodo, filtros: { diretoria: 'Tecnologia' } } },
      ),
      ferramentas({ id: 'c3', nome: 'mostrar', args: { blocos: [{ resultado: 'r2' }] } }),
      texto('O turnover', ' está estável.'),
    ]);
    const passos = eventos.filter(e => e.tipo === 'passo').map(e => e.tipo === 'passo' && `${e.resultado}:${e.estado}`);
    expect(passos).toEqual(['r1:inicio', 'r2:inicio', 'r1:fim', 'r2:fim', 'r3:inicio', 'r3:fim']);
    expect(pedidos).toHaveLength(3);
    const tools = mensagensTool(pedidos[1]);
    expect(tools.map(m => m.tool_call_id)).toEqual(['c1', 'c2']);
    expect(tools.map(m => JSON.parse(String(m.content)).id)).toEqual(['r1', 'r2']);
    expect(pedidos[0].corpo.tools!.map(t => t.function.name)).toContain('drivers');

    const tipos = eventos.map(e => e.tipo);
    expect(tipos.indexOf('bloco')).toBeLessThan(tipos.indexOf('texto'));
    expect(tipos.slice(-2)).toEqual(['rastro', 'fim']);
    expect(eventos.filter(e => e.tipo === 'texto').map(e => e.tipo === 'texto' && e.delta).join('')).toBe('O turnover está estável.');
    const bloco = eventos.find(e => e.tipo === 'bloco');
    const serie = motor.serie({ indicador: 'turnover', periodo, filtros: { diretoria: 'Tecnologia' } });
    expect(bloco?.tipo === 'bloco' && bloco.bloco.tipo === 'serie' && bloco.bloco.pontos.map(p => p.valor)).toEqual(serie.pontos.map(p => p.valor));
    const rastro = eventos.find(e => e.tipo === 'rastro');
    expect(rastro?.tipo === 'rastro' && rastro.itens.map(i => i.ferramenta)).toEqual(['valor', 'serie', 'mostrar']);
  });

  it('argumento inválido volta ao modelo como erro e ele se corrige na rodada seguinte', async () => {
    const { eventos, pedidos } = await rodar([
      ferramentas({ id: 'c1', nome: 'valor', args: { indicador: 'rotatividade', periodo } }),
      ferramentas({ id: 'c2', nome: 'valor', args: { indicador: 'turnover', periodo } }),
      texto('Pronto.'),
    ]);
    const erro = JSON.parse(String(mensagensTool(pedidos[1])[0].content));
    expect(erro.erro).toMatch(/rotatividade/);
    expect(eventos.some(e => e.tipo === 'passo' && e.resultado === 'r1' && e.estado === 'erro')).toBe(true);
    expect(eventos.some(e => e.tipo === 'passo' && e.resultado === 'r2' && e.estado === 'fim')).toBe(true);
    expect(eventos.at(-1)?.tipo).toBe('fim');
  });

  it(`para de oferecer tools depois de ${MAX_RODADAS_FERRAMENTAS} rodadas e força a resposta em texto`, async () => {
    const insistente = (p: PedidoCapturado) =>
      p.corpo.tool_choice === 'none' ? texto('Resposta com o que tenho.') : ferramentas({ nome: 'valor', args: { indicador: 'turnover', periodo } });
    const { pedidos, metricas, eventos } = await rodar(Array.from({ length: 10 }, () => insistente));
    expect(pedidos).toHaveLength(MAX_RODADAS_FERRAMENTAS + 1);
    expect(pedidos.slice(0, -1).every(p => p.corpo.tool_choice === 'auto')).toBe(true);
    expect(pedidos.at(-1)!.corpo.tool_choice).toBe('none');
    expect(metricas.rodadasFerramentas).toBe(MAX_RODADAS_FERRAMENTAS);
    expect(eventos.filter(e => e.tipo === 'passo' && e.estado === 'inicio')).toHaveLength(MAX_RODADAS_FERRAMENTAS);
  });

  it('sem mostrar, exibe automaticamente o resultado principal; a guarda marca o número inventado', async () => {
    const real = motor.valor({ indicador: 'turnover', periodo }).valor!;
    const { eventos, metricas } = await rodar([
      ferramentas({ nome: 'valor', args: { indicador: 'turnover', periodo } }),
      texto(`O turnover foi de **${br(real)}% a.a.** nos últimos 12 meses, com custo de R$ 9,99 mi.`),
    ]);
    const blocos = eventos.filter(e => e.tipo === 'bloco');
    expect(blocos).toHaveLength(1);
    expect(blocos[0].tipo === 'bloco' && blocos[0].bloco).toMatchObject({ tipo: 'kpi', valor: real, resultado: 'r1' });
    const fim = eventos.at(-1);
    expect(fim?.tipo === 'fim' && fim.verificacao).toEqual({ total: 2, verificados: 1, naoVerificados: [{ texto: 'R$ 9,99 mi', valor: 9_990_000 }] });
    expect(metricas.latenciaPrimeiroTextoMs).not.toBeNull();
  });

  it('com contexto de deep dive, o recorte clicado vai no system prompt', async () => {
    const { pedidos } = await rodar([texto('ok')], {
      ...pergunta,
      contexto: { indicador: 'enps', periodo, filtros: { diretoria: 'Operações' }, ponto: { mes: '2025-03' } },
    });
    expect(String(pedidos[0].corpo.messages[0].content)).toMatch(/Deep dive em andamento[\s\S]*eNPS \(enps\)[\s\S]*Mar\/25/);
    expect(pedidos[0].corpo.messages.at(-1)).toEqual({ role: 'user', content: 'Como está o turnover?' });
  });

  it('se a principal cai, as rodadas seguintes vão direto para a reserva', async () => {
    const { pedidos } = await rodar([erroHttp(503), ferramentas({ nome: 'valor', args: { indicador: 'turnover', periodo } }), texto('ok')]);
    expect(pedidos.map(p => new URL(p.url).hostname)).toEqual(['api.deepseek.com', 'openrouter.ai', 'openrouter.ai']);
  });

  it('se nenhum provedor responde, emite um erro amigável sem detalhe interno', async () => {
    const { eventos, metricas } = await rodar([erroHttp(500), erroHttp(500)]);
    expect(eventos).toEqual([{ tipo: 'erro', mensagem: expect.stringMatching(/instantes/) }]);
    expect(JSON.stringify(eventos)).not.toMatch(/chave|deepseek|openrouter|500/);
    expect(metricas.erro).toBeTruthy();
  });
});
