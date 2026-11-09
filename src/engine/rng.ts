// A small seeded random generator (mulberry32) and a string hash (FNV-1a), so
// a challenge variant or the daily case is the same every time its seed is.

export interface Rng {
  readonly seed: number;
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [min, max], both included. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** `n` different items, in random order. */
  sample<T>(items: readonly T[], n: number): T[];
  shuffle<T>(items: readonly T[]): T[];
  chance(p: number): boolean;
  /** `n` lowercase hex characters. */
  hex(n: number): string;
}

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const shuffle = <T,>(items: readonly T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(0, i);
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  };
  return {
    seed: seed >>> 0,
    next,
    int,
    pick: (items) => {
      if (items.length === 0) throw new Error('pick from an empty list');
      return items[int(0, items.length - 1)]!;
    },
    sample: (items, n) => shuffle(items).slice(0, n),
    shuffle,
    chance: (p) => next() < p,
    hex: (n) => Array.from({ length: n }, () => '0123456789abcdef'[int(0, 15)]).join(''),
  };
}

/** FNV-1a, 32 bits. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A fresh seed for a new challenge attempt. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
