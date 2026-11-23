import { describe, it, expect } from 'vitest';
import { createResolution, stepResolution, runResolution, emptyStats, createRng } from '../src';
import { mkPlayer, empty } from './helpers';

describe('resolution', () => {
  it('runs until all gas is gone and stamps death time', () => {
    const strong = { ...emptyStats(), damage: 10, duration: 10 };
    const A = mkPlayer('A', { x: 3, y: 10 }, 0, strong); A.hp = 10;
    const B = mkPlayer('B', { x: 6, y: 10 }, Math.PI / 2, strong); B.hp = 10;
    const res = createResolution([A, B], 2, empty);
    expect(res.clouds).toHaveLength(2);
    runResolution(res, empty, [A, B], createRng(1));
    expect(res.done).toBe(true);
    expect(res.clouds.every(c => !c.alive)).toBe(true);
    expect(B.alive).toBe(false);
    expect(A.alive).toBe(true);
    expect(Math.floor(B.diedAt! / 1_000_000)).toBe(2);
    expect(B.diedAt! % 1_000_000).toBeGreaterThan(0);
  });
  it('skips dead players when spawning clouds', () => {
    const A = mkPlayer('A', { x: 3, y: 10 }, 0), B = mkPlayer('B', { x: 6, y: 10 }, 0);
    B.alive = false;
    expect(createResolution([A, B], 0, empty).clouds).toHaveLength(1);
  });
  it('step advances the tick', () => {
    const A = mkPlayer('A', { x: 3, y: 10 }, 0);
    const res = createResolution([A], 0, empty);
    stepResolution(res, empty, [A], createRng(1));
    expect(res.tick).toBe(1);
  });
});
