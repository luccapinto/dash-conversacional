/**
 * Barras horizontais com a meta marcada (ranking por diretoria do resumo e blocos "barras" da IA).
 * HTML + CSS: o rótulo e o valor ficam legíveis em qualquer largura.
 */

import type { Polaridade, Unidade } from '@/lib/analytics/catalog';
import { valorComUnidade } from '@/lib/painel/formato';

export interface BarraH {
  rotulo: string;
  valor: number | null;
  destaque?: boolean;
  /** pílula violeta (anotação da IA) */
  nota?: string;
  /** texto extra à direita do valor (ex.: composição) */
  extra?: string;
}

export function BarrasH({ barras, unidade, meta, polaridade, descricao }: { barras: readonly BarraH[]; unidade: Unidade; meta: number | null; polaridade: Polaridade | null; descricao: string }) {
  const maximo = Math.max(...barras.map(b => Math.abs(b.valor ?? 0)), Math.abs(meta ?? 0)) * 1.12 || 1;
  const ruim = (v: number | null) => (v === null || meta === null || !polaridade || polaridade === 'neutro' ? null : polaridade === 'menor_melhor' ? v > meta : v < meta);
  return (
    <table className="tdir barras-h" aria-label={descricao}>
      <tbody>
        {barras.map(b => {
          const r = ruim(b.valor);
          const cor = r === null ? 'var(--ink-2)' : r ? 'var(--ruim)' : 'var(--bom)';
          return (
            <tr key={b.rotulo}>
              <td style={{ fontWeight: b.destaque ? 600 : 400 }}>
                {b.rotulo}
                {b.nota && <span className="nota-ia">{b.nota}</span>}
              </td>
              <td className="barcell" style={{ width: '45%' }}>
                <div className="hbar">
                  <i style={{ width: `${(Math.abs(b.valor ?? 0) / maximo) * 100}%`, background: cor, opacity: r || b.destaque ? 1 : 0.55 }} />
                  {meta !== null && <b style={{ left: `${(Math.abs(meta) / maximo) * 100}%` }} />}
                </div>
              </td>
              <td>
                {valorComUnidade(b.valor, unidade)}
                {b.extra && <span className="fragil">{b.extra}</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
