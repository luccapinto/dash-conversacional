/**
 * Bloco de drivers: a gaveta tem 460 px (390 px no celular), então a tabela abre com os fatores
 * mais fortes de cada lado e guarda o resto atrás de "ver todos". Os números são os do motor.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { Motor } from '@/lib/analytics/engine';
import { motorServidor } from '@/lib/analytics/servidor';
import { montarBloco } from '@/lib/agente/blocos';
import type { BlocoTabela } from '@/lib/agente/contrato';
import { rotuloSegmento } from '@/lib/agente/rotulos';

const periodo = { inicio: '2025-10', fim: '2026-09' };
let motor: Motor;

beforeAll(() => {
  motor = motorServidor();
});

describe('bloco de drivers', () => {
  it('risco e proteção em grupos, do mais forte ao mais fraco, com 5 e 3 visíveis e nenhum fator perdido', () => {
    const dados = motor.drivers({ indicador: 'turnover_voluntario', periodo });
    const b = montarBloco({ id: 'r1', ferramenta: 'drivers', dados }) as BlocoTabela;
    expect(b.tipo).toBe('tabela');

    const todos = [...dados.fatoresDeRisco, ...dados.fatoresProtetivos, ...dados.combinacoes];
    const [risco, protecao] = b.grupos!;
    expect(risco).toEqual({ rotulo: 'Risco', linhas: todos.filter(f => f.lift >= 1).length, visiveis: 5 });
    expect(protecao).toEqual({ rotulo: 'Proteção', linhas: todos.filter(f => f.lift < 1).length, visiveis: 3 });
    expect(risco.linhas + protecao.linhas).toBe(b.linhas.length);
    expect(b.linhas.length).toBeGreaterThan(8);

    const lifts = b.linhas.map(l => l.lift as number);
    const [lr, lp] = [lifts.slice(0, risco.linhas), lifts.slice(risco.linhas)];
    expect(lr).toEqual([...lr].sort((x, y) => y - x));
    expect(lp).toEqual([...lp].sort((x, y) => x - y));
    // o mais forte de cada lado está entre os visíveis, venha de um atributo ou de uma combinação
    expect(lr[0]).toBe(Math.max(...todos.map(f => f.lift)));
    expect(lp[0]).toBe(Math.min(...todos.map(f => f.lift)));

    // cada linha é um fator do motor, sem conta nova
    const doMotor = new Map(todos.map(f => [rotuloSegmento(f.segmento), f]));
    for (const l of b.linhas) {
      const f = doMotor.get(l.fator as string)!;
      expect(l).toEqual({ fator: rotuloSegmento(f.segmento), valor: f.valor, lift: f.lift, eventos: f.eventos, n: f.n });
    }
  });

  it('combinação lida como frase curta, sem o nome técnico das dimensões', () => {
    expect(rotuloSegmento({ especialidade: 'Controladoria & FP&A', performance: 'acima' })).toBe('Controladoria & FP&A + avaliação acima');
    expect(rotuloSegmento({ faixaSalarial: 'q1', enps: 'detrator' })).toBe('Q1 da faixa salarial + eNPS detrator');
  });
});
