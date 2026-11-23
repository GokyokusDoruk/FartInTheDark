import { describe, it, expect } from 'vitest';
import { createRng } from '../src';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = createRng(42), b = createRng(42);
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
  });
  it('differs across seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });
  it('int stays in inclusive range', () => {
    const a = createRng(42);
    for (let i = 0; i < 1000; i++) { const n = a.int(1, 3); expect(n >= 1 && n <= 3).toBe(true); }
  });
});
