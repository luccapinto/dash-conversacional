/**
 * PRNG com seed fixa (Mulberry32) e as distribuições usadas pela simulação.
 * Cada chamada a `criarRng` começa do zero: rodar a simulação duas vezes no mesmo
 * processo produz exatamente a mesma sequência.
 */

export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(itens: readonly T[]): T;
  weighted<T>(itens: readonly T[], pesos: readonly number[]): T;
  /** Normal (Box-Muller) */
  normal(media: number, desvio: number): number;
  /** Poisson (Knuth); adequado para médias pequenas (< 60) */
  poisson(media: number): number;
}

export function criarRng(seed: number): Rng {
  let s = seed | 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    chance: p => next() < p,
    pick: itens => itens[Math.floor(next() * itens.length)],
    weighted: (itens, pesos) => {
      let total = 0;
      for (const w of pesos) total += w;
      let r = next() * total;
      for (let i = 0; i < itens.length; i++) {
        r -= pesos[i];
        if (r < 0) return itens[i];
      }
      return itens[itens.length - 1];
    },
    normal: (media, desvio) => {
      const u1 = Math.max(1e-12, next());
      const u2 = next();
      return media + desvio * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    },
    poisson: media => {
      if (media <= 0) return 0;
      const limite = Math.exp(-media);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= next();
      } while (p > limite);
      return k - 1;
    },
  };
  return rng;
}
