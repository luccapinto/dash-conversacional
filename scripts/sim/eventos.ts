/**
 * Tabelas de eventos derivadas do roster (fonte única). Só entram eventos cujo mês de
 * contagem está na janela; a ordem é (mês, pessoa) para a saída ser determinística.
 */

import {
  MES_FIM,
  MES_INICIO,
  segmentoEm,
  somarMeses,
  tempoDeCasa,
  type EventoAdmissao,
  type EventoDesligamento,
  type EventoMovimentacao,
  type EventoPromocao,
  type Eventos,
  type Mes,
  type Pessoa,
  type Requisicao,
} from '../../lib/analytics/dominio';

function naJanela(mes: Mes): boolean {
  return mes >= MES_INICIO && mes <= MES_FIM;
}

function porMesEPessoa<T extends { mes: Mes; pessoa: string }>(a: T, b: T): number {
  if (a.mes !== b.mes) return a.mes < b.mes ? -1 : 1;
  return a.pessoa < b.pessoa ? -1 : a.pessoa > b.pessoa ? 1 : 0;
}

export function derivarEventos(pessoas: Pessoa[], requisicoes: Requisicao[]): Eventos {
  const vagaPorOcupacao = new Map<string, Requisicao>();
  for (const r of requisicoes) {
    if (r.ocupante !== null && r.fechamento !== null) vagaPorOcupacao.set(`${r.ocupante}|${r.fechamento}`, r);
  }

  const admissoes: EventoAdmissao[] = [];
  const desligamentos: EventoDesligamento[] = [];
  const promocoes: EventoPromocao[] = [];
  const movimentacoes: EventoMovimentacao[] = [];

  for (const p of pessoas) {
    if (naJanela(p.admissao)) {
      const seg = p.historico[0];
      const vaga = vagaPorOcupacao.get(`${p.id}|${p.admissao}`);
      if (!vaga || vaga.preenchimento !== 'externo') throw new Error(`admissão sem vaga externa: ${p.id} ${p.admissao}`);
      admissoes.push({
        pessoa: p.id, mes: p.admissao, diretoria: seg.diretoria, especialidade: seg.especialidade,
        senioridade: seg.senioridade, requisicao: vaga.id,
      });
    }
    if (p.desligamento && naJanela(p.desligamento.mes)) {
      const mes = p.desligamento.mes;
      const seg = segmentoEm(p, mes)!;
      desligamentos.push({
        pessoa: p.id, mes, diretoria: seg.diretoria, especialidade: seg.especialidade, senioridade: seg.senioridade,
        tipo: p.desligamento.tipo, motivo: p.desligamento.motivo, tempoDeCasaMeses: tempoDeCasa(p.admissao, mes),
        performance: p.performance, faixa: seg.faixa, salario: seg.salario,
      });
    }
    for (let i = 1; i < p.historico.length; i++) {
      const seg = p.historico[i];
      const anterior = p.historico[i - 1];
      const mes = somarMeses(seg.desde, -1);
      if (!naJanela(mes)) continue;
      const vaga = vagaPorOcupacao.get(`${p.id}|${mes}`);
      const requisicao = vaga && vaga.preenchimento === 'interno' ? vaga.id : null;
      if (seg.motivo === 'promoção') {
        promocoes.push({
          pessoa: p.id, mes, diretoria: seg.diretoria, especialidade: seg.especialidade,
          de: anterior.senioridade, para: seg.senioridade, requisicao,
        });
      } else {
        movimentacoes.push({
          pessoa: p.id, mes, senioridade: seg.senioridade,
          de: { diretoria: anterior.diretoria, especialidade: anterior.especialidade },
          para: { diretoria: seg.diretoria, especialidade: seg.especialidade },
          requisicao,
        });
      }
    }
  }

  admissoes.sort(porMesEPessoa);
  desligamentos.sort(porMesEPessoa);
  promocoes.sort(porMesEPessoa);
  movimentacoes.sort(porMesEPessoa);
  return { admissoes, desligamentos, promocoes, movimentacoes, requisicoes };
}
