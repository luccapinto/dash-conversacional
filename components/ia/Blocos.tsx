/**
 * Blocos de visualização que o servidor monta a partir dos resultados das tools (kpi, série,
 * barras, tabela, comparação). Todo número aqui veio do motor; o modelo só escolheu o resultado.
 */

import type { BlocoVisualizacao, ColunaTabela } from '@/lib/agente/contrato';
import { br, curto, valorComUnidade } from '@/lib/painel/formato';
import { BarrasH } from '@/components/graficos/BarrasH';
import { Linha } from '@/components/graficos/Linha';

const ROTULO_STATUS: Record<string, string> = { fora: 'fora da meta', atencao: 'atenção', dentro: 'na meta', sem_meta: 'sem meta', sem_dados: 'sem dados' };

function celula(v: string | number | null | undefined, c: ColunaTabela, unidade: BlocoVisualizacao['unidade']): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  switch (c.formato) {
    case 'valor':
      return curto(v, unidade);
    case 'n':
      return br(v, 0);
    case 'fracao':
      return `${br(v * 100)}%`;
    case 'lift':
      return `${br(v, 2)}×`;
    default:
      return String(v);
  }
}

export function BlocoIA({ bloco: b }: { bloco: BlocoVisualizacao }) {
  const cab = (
    <>
      <h4>{b.titulo}</h4>
      <div className="sub">{b.subtitulo}</div>
    </>
  );
  switch (b.tipo) {
    case 'kpi':
      return (
        <figure className="bloco" aria-label={b.titulo}>
          {cab}
          <div className="kpi">
            <span className="v">{valorComUnidade(b.valor, b.unidade)}</span>
            {b.status && <span className={`pill ${b.status}`}>{ROTULO_STATUS[b.status]}</span>}
          </div>
          <div className="sub">
            {b.meta !== null ? `meta ${valorComUnidade(b.meta, b.unidade)} · ` : ''}n = {br(b.n, 0)}
            {!b.amostraSuficiente && ' · amostra pequena'}
          </div>
        </figure>
      );
    case 'serie': {
      const pontos = b.pontos.flatMap(p => (p.valor === null ? [] : [{ mes: p.periodo.fim, rotulo: p.rotulo, valor: p.valor }]));
      return (
        <figure className="bloco">
          {cab}
          <Linha pontos={pontos} unidade={b.unidade} meta={b.meta} compacto descricao={`${b.titulo}, ${b.subtitulo}: ${pontos.length} pontos de ${pontos[0]?.rotulo ?? ''} a ${pontos[pontos.length - 1]?.rotulo ?? ''}`} />
        </figure>
      );
    }
    case 'barras':
      return (
        <figure className="bloco">
          {cab}
          <BarrasH
            unidade={b.unidade}
            meta={b.meta}
            polaridade={null}
            descricao={`${b.titulo} por ${b.dimensao}`}
            barras={b.barras.map(x => ({ rotulo: x.rotulo, valor: x.valor, extra: [x.composicao !== null ? `${br(x.composicao * 100, 0)}% dos eventos` : '', x.amostraSuficiente ? '' : 'amostra pequena'].filter(Boolean).join(' · ') || undefined }))}
          />
          {b.total !== null && <div className="sub">Total do recorte: {valorComUnidade(b.total, b.unidade)}</div>}
        </figure>
      );
    case 'tabela':
      return (
        <figure className="bloco">
          {cab}
          <div className="rolagem">
            <table>
              <thead>
                <tr>{b.colunas.map(c => <th key={c.chave} scope="col" className={c.formato === 'texto' ? 'txt' : undefined}>{c.rotulo}</th>)}</tr>
              </thead>
              <tbody>
                {b.linhas.map((l, i) => (
                  <tr key={i}>{b.colunas.map(c => <td key={c.chave} className={c.formato === 'texto' ? 'txt' : undefined}>{celula(l[c.chave], c, b.unidade)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </figure>
      );
    case 'comparacao':
      return (
        <figure className="bloco">
          {cab}
          <div className="lados">
            {[b.a, b.b].map((lado, i) => (
              <div key={i} style={b.melhor === (i ? 'b' : 'a') ? { borderColor: 'var(--bom)' } : undefined}>
                <small>{lado.rotulo}</small>
                <b>{valorComUnidade(lado.valor, b.unidade)}</b>
                <small>n = {br(lado.n, 0)}{lado.amostraSuficiente ? '' : ' · amostra pequena'}</small>
              </div>
            ))}
          </div>
          {b.diferenca !== null && (
            <div className="sub" style={{ marginTop: 6 }}>
              Diferença: {br(b.diferenca)} {b.unidadeDiferenca}
              {b.variacaoRelativa !== null ? ` (${br(b.variacaoRelativa)}%)` : ''}
            </div>
          )}
        </figure>
      );
  }
}
