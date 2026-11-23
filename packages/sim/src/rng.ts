export type Rng = {
  next(): number;
  int(min: number, maxIncl: number): number;
  range(min: number, max: number): number;
  pick<T>(arr: T[]): T;
  state(): number;
};

/** mulberry32 seeded generator. */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, maxIncl) => min + Math.floor(next() * (maxIncl - min + 1)),
    range: (min, max) => min + next() * (max - min),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    state: () => s,
  };
}
