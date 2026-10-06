/**
 * Títulos por indicador pré-gerados: a guarda é bloqueante (número fora da frase e dos sinais do
 * indicador descarta o título), o descartado ganha uma segunda chance com o motivo, e IA fora do ar
 * deixa o recorte sem títulos (a página fica com a frase determinística).
 */

import { describe, expect, it } from 'vitest';
import { motorCliente } from '@/lib/analytics/cliente';
import { provedoresDoAmbiente } from '@/lib/agente/llm';
import { entradaTitulos, gerarTitulos } from '@/lib/layout/titulos';
import { erroHttp, fetchFalso, texto } from '../agente/sse';

const provedores = provedoresDoAmbiente({ DEEPSEEK_API_KEY: 'chave-ds-teste' });
const silencioso = () => {};
const json = (titulos: Array<{ indicador: string; titulo: string }>) => texto(JSON.stringify({ titulos }));

describe('gerarTitulos', () => {
  const entrada = entradaTitulos(motorCliente, 'Gente');
  const turnover = entrada.find(e => e.indicador === 'turnover_voluntario')!;
  // número que a página mostra: a IA pode citá-lo
  const acumulado = /\d+,\d+ % a\.a\./.exec(turnover.frase)![0];

  it('descarta título com número inventado, dá uma segunda chance e aceita número da frase', async () => {
    const { fetch, pedidos } = fetchFalso([
      json([
        { indicador: 'turnover_voluntario', titulo: `Saídas voluntárias em ${acumulado} no ano.` },
        { indicador: 'enps', titulo: 'eNPS em 55,5 pontos, longe da meta' },
      ]),
      json([{ indicador: 'enps', titulo: 'eNPS longe da meta, sem virada' }]),
    ]);
    const r = await gerarTitulos('Gente', { motor: motorCliente, provedores, fetch, log: silencioso });
    expect(r.motivo).toBeNull();
    expect(r.titulos).toEqual({ turnover_voluntario: `Saídas voluntárias em ${acumulado} no ano`, enps: 'eNPS longe da meta, sem virada' });
    expect(r.descartados).toEqual([{ indicador: 'enps', titulo: 'eNPS em 55,5 pontos, longe da meta', motivo: expect.stringContaining('55,5') }]);
    // a segunda chance vai na mesma conversa, só com o recusado e o motivo
    const ultima = pedidos[1].corpo.messages.at(-1);
    expect(ultima?.content).toContain('enps');
    expect(ultima?.content).not.toContain('turnover_voluntario');
  });

  it('recusado de novo fica sem título; IA fora do ar deixa o recorte sem títulos', async () => {
    const inventado = { indicador: 'enps', titulo: 'eNPS em 55,5 pontos' };
    const { fetch } = fetchFalso([json([inventado]), json([inventado])]);
    const r = await gerarTitulos('Gente', { motor: motorCliente, provedores, fetch, log: silencioso });
    expect(r.titulos).toEqual({});
    expect(r.descartados).toHaveLength(2);

    const fora = fetchFalso([erroHttp(503)]);
    const semIA = await gerarTitulos('Gente', { motor: motorCliente, provedores, fetch: fora.fetch, log: silencioso });
    expect(semIA).toMatchObject({ titulos: {}, motivo: 'IA indisponível' });
  });
});
