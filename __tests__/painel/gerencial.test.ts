/**
 * Modelo de vista do gerencial. Para Set/26 os valores batem com painel.json da maquete aprovada
 * (gerado por motorCliente em .git/project-upgrade/design/painel.ts; valores copiados aqui).
 */

import { describe, expect, it } from 'vitest';
import { motorCliente } from '@/lib/analytics/cliente';
import { FILTROS_PADRAO, lerFiltros } from '@/lib/painel/filtros';
import { montarGerencial } from '@/lib/painel/gerencial';
import { IDS_PAINEL } from '@/lib/painel/indicadores';

const g = montarGerencial(motorCliente, FILTROS_PADRAO);
const linha = (id: string) => g.dominios.flatMap(d => d.linhas).find(l => l.id === id)!;

/** painel.json da maquete: [mês, mês anterior, mesmo mês do ano anterior, YTD, YTD até o mês anterior, YTD do ano anterior] */
const MAQUETE: Record<string, number[]> = {
  turnover_voluntario: [16.268717118575477, 18.233387358184764, 17.899159663865547, 18.357356540658145, 18.62079526313103, 18.66615926172581],
  enps: [4.013464526152252, 5.146867689108396, -0.45188729399255717, 4.562043795620438, 4.839131572063824, -1.4177352356871953],
  headcount: [4972, 4942, 4808, 4972, 4942, 4808],
  time_to_fill: [51.83582089552239, 56.07086614173228, 55.8109756097561, 56.19609507640068, 56.75574712643678, 55.69171185127808],
};

describe('gerencial de Set/26, empresa toda', () => {
  it('25 linhas agrupadas por domínio, só indicadores visíveis', () => {
    expect(g.dominios.flatMap(d => d.linhas.map(l => l.id))).toEqual(IDS_PAINEL);
  });

  it('valores batem com a maquete (mensal, trimestral e sem meta)', () => {
    for (const [id, [mes, mesAnt, mesAA, ytd, ytdM1, ytdAA]] of Object.entries(MAQUETE)) {
      const l = linha(id);
      expect(l.mes.medida?.valor, id).toBeCloseTo(mes, 6);
      expect(l.mes.ant.base, id).toBeCloseTo(mesAnt, 6);
      expect(l.mes.aa.base, id).toBeCloseTo(mesAA, 6);
      expect(l.ytd.medida?.valor, id).toBeCloseTo(ytd, 6);
      expect(l.ytd.ant.base, id).toBeCloseTo(ytdM1, 6);
      expect(l.ytd.aa.base, id).toBeCloseTo(ytdAA, 6);
    }
  });

  it('status e Δ: p.p. em %, pontos no eNPS, variação % nos demais, cor pela polaridade', () => {
    const tv = linha('turnover_voluntario');
    expect(tv.mes.medida?.status).toBe('atencao');
    expect(tv.ytd.medida?.status).toBe('fora');
    expect(tv.mes.vsMeta).toEqual({ texto: '+0,3 p.p.', tom: 'ruim' });
    expect(tv.mes.ant.delta).toEqual({ texto: '−2,0 p.p.', tom: 'bom' });
    expect(tv.ytd.vsMeta).toEqual({ texto: '+2,4 p.p.', tom: 'ruim' });

    const enps = linha('enps');
    expect(enps.mes.janela?.rotulo).toBe('3T26');
    expect(enps.mes.vsMeta).toEqual({ texto: '−16 pts', tom: 'ruim' });
    expect(enps.mes.aa.delta).toEqual({ texto: '+4 pts', tom: 'bom' });

    expect(linha('time_to_fill').mes.vsMeta).toEqual({ texto: '+15,2%', tom: 'ruim' });
  });

  it('indicador sem meta: Δ vs meta "—", status sem_meta e comparações em cinza', () => {
    const hc = linha('headcount');
    expect(hc.mes.medida?.status).toBe('sem_meta');
    expect(hc.mes.vsMeta).toBeNull();
    expect(hc.mes.ant.delta).toEqual({ texto: '+0,6%', tom: 'neutro' });
  });

  it('YTD usa Jan..mês e o cabeçalho conta o acumulado como a maquete (2 na meta, 4 em atenção, 9 fora)', () => {
    expect(linha('turnover').ytd.janela?.periodo).toEqual({ inicio: '2026-01', fim: '2026-09' });
    expect(g.contagem).toEqual({ dentro: 2, atencao: 4, fora: 9 });
    expect(g.rotulos).toMatchObject({ mes: 'Set/26', mesAA: 'Set/25', ytd: 'Jan–Set/26', ytdM1: 'Ago', ytdAA: '2025' });
  });
});

describe('gerencial em outros recortes', () => {
  it('comparativo sem base sai "—" (Out/23 não tem mês nem ano anterior)', () => {
    const out23 = montarGerencial(motorCliente, lerFiltros({ mes: '2023-10' }));
    const l = out23.dominios.flatMap(d => d.linhas).find(x => x.id === 'turnover')!;
    expect(l.mes.medida?.valor).not.toBeNull();
    expect(l.mes.ant).toEqual({ base: null, delta: { texto: '—', tom: 'neutro' } });
    expect(l.mes.aa.delta.texto).toBe('—');
    expect(l.ytd.aa.delta.texto).toBe('—');
  });

  it('senioridade filtrada: indicador sem essa dimensão fica "não se aplica", sem número', () => {
    const pleno = montarGerencial(motorCliente, lerFiltros({ senioridade: 'pleno' }));
    const ml = pleno.dominios.flatMap(d => d.linhas).find(x => x.id === 'mulheres_lideranca')!;
    expect(ml.aplicavel).toBe(false);
    expect(ml.mes.medida).toBeNull();
    const tv = pleno.dominios.flatMap(d => d.linhas).find(x => x.id === 'turnover_voluntario')!;
    expect(tv.aplicavel).toBe(true);
    expect(tv.mes.medida?.valor).not.toBeCloseTo(MAQUETE.turnover_voluntario[0], 3);
  });
});
