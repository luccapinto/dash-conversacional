/** Minigráfico de 12 meses (SVG puro, sem JS no client); a cor segue o status do acumulado */

import type { Status } from '@/lib/analytics/engine';

export function Spark({ valores, status, largura = 96, altura = 28 }: { valores: readonly number[]; status: Status | null; largura?: number; altura?: number }) {
  if (valores.length < 2) return null;
  const mn = Math.min(...valores);
  const mx = Math.max(...valores);
  const r = mx - mn || 1;
  const pts = valores.map((y, i) => [(i / (valores.length - 1)) * largura, altura - 3 - ((y - mn) / r) * (altura - 6)]);
  const cor = status === 'fora' ? 'var(--ruim)' : status === 'atencao' ? 'var(--atencao)' : 'var(--ink-2)';
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${largura} ${altura}`} aria-hidden="true">
      <path d={`M${pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')}`} fill="none" stroke={cor} strokeWidth="1.4" />
      <circle cx={lx} cy={ly} r="2.3" fill={cor} />
    </svg>
  );
}
