import { describe, it, expect } from 'vitest';
import { STAT_KEYS, emptyStats, grantPoints, allocate, autoAllocate, gasParams, createRng, type Stats } from '../src';

const full = Object.fromEntries(STAT_KEYS.map(k => [k, 10])) as Stats;

describe('stats', () => {
  it('grants 5 points normally', () => expect(grantPoints(emptyStats())).toBe(5));
  it('grants 0 when every stat is maxed', () => expect(grantPoints(full)).toBe(0));
  it('grants only remaining capacity', () => expect(grantPoints({ ...full, power: 7 })).toBe(3));
  it('allocates points', () => {
    const r = allocate(emptyStats(), 5, { damage: 3, range: 2 });
    expect(r.stats.damage).toBe(3);
    expect(r.stats.range).toBe(2);
    expect(r.unspent).toBe(0);
  });
  it('rejects overspending', () => expect(() => allocate(emptyStats(), 5, { damage: 6 })).toThrow());
  it('rejects exceeding level 10', () => expect(() => allocate({ ...emptyStats(), damage: 9 }, 5, { damage: 2 })).toThrow());
  it('rejects negative values', () => expect(() => allocate(emptyStats(), 5, { damage: -1 })).toThrow());
  it('auto-allocates all unspent points within caps', () => {
    const a = autoAllocate({ ...emptyStats(), damage: 10 }, 5, createRng(1));
    expect(STAT_KEYS.reduce((s, k) => s + a.stats[k], 0)).toBe(15);
    expect(a.stats.damage).toBe(10);
    expect(a.unspent).toBe(0);
  });
  it('level-0 gas has base damage', () => expect(gasParams(emptyStats()).dps).toBe(20));
});
