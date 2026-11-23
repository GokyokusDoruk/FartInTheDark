import { STAT_KEYS, type Stats } from './types';
import { MAX_STAT, POINTS_PER_MOVE } from './config';
import type { Rng } from './rng';

export const emptyStats = (): Stats => ({ thickness: 0, scatter: 0, range: 0, damage: 0, power: 0, duration: 0 });

const capacity = (s: Stats) => STAT_KEYS.reduce((t, k) => t + (MAX_STAT - s[k]), 0);

export function grantPoints(stats: Stats): number {
  return Math.min(POINTS_PER_MOVE, capacity(stats));
}

export function allocate(stats: Stats, unspent: number, alloc: Partial<Stats>): { stats: Stats; unspent: number } {
  const next = { ...stats };
  let used = 0;
  for (const k of STAT_KEYS) {
    const n = alloc[k] ?? 0;
    if (!Number.isInteger(n) || n < 0) throw new Error(`invalid allocation for ${k}`);
    if (next[k] + n > MAX_STAT) throw new Error(`${k} would exceed ${MAX_STAT}`);
    next[k] += n;
    used += n;
  }
  if (used > unspent) throw new Error('not enough points');
  return { stats: next, unspent: unspent - used };
}

export function autoAllocate(stats: Stats, unspent: number, rng: Rng): { stats: Stats; unspent: 0 } {
  const next = { ...stats };
  let left = Math.min(unspent, capacity(next));
  while (left > 0) {
    const open = STAT_KEYS.filter(k => next[k] < MAX_STAT);
    next[rng.pick(open)]++;
    left--;
  }
  return { stats: next, unspent: 0 };
}
