import { describe, it, expect } from 'vitest';
import { spawnCloud, stepGas, gasParams, emptyStats, createRng, DT, GAS_SPEED, type Cloud } from '../src';
import { mkPlayer, run, empty } from './helpers';

describe('bullet gas', () => {
  it('flies fast, at a constant speed', () => {
    expect(GAS_SPEED).toBeGreaterThanOrEqual(10);
    const A = mkPlayer('A', { x: 1, y: 10 }, Math.PI / 2);
    const c = spawnCloud(A, 1);
    const rng = createRng(1);
    run(() => stepGas([c], [], empty, [A], rng, DT), 0.5);
    expect(c.travelled).toBeCloseTo(GAS_SPEED * 0.5, 1);
  });

  it('has a long range and lives long enough to use all of it', () => {
    const g0 = gasParams(emptyStats()), g10 = gasParams({ ...emptyStats(), range: 10 });
    expect(g0.range).toBeGreaterThanOrEqual(10);
    expect(g10.range).toBeGreaterThan(g0.range);
    for (const g of [g0, g10]) expect(g.life).toBeGreaterThan(g.range / GAS_SPEED);
  });

  it('a hit still takes about a quarter of the health at level 0', () => {
    const A = mkPlayer('A', { x: 1, y: 10 }, 0), B = mkPlayer('B', { x: 6, y: 10 }, 0);
    const c = spawnCloud(A, 1);
    const rng = createRng(1);
    run(() => stepGas([c], [], empty, [A, B], rng, DT), 0.8);
    expect(100 - B.hp).toBeGreaterThanOrEqual(20);
    expect(100 - B.hp).toBeLessThanOrEqual(40);
  });

  it('fast head-on bullets cannot slip past each other', () => {
    for (let gap = 6; gap < 7; gap += 0.05) {
      const A = mkPlayer('A', { x: 3, y: 10 }, 0), B = mkPlayer('B', { x: 3 + gap, y: 10 }, Math.PI);
      const cs: Cloud[] = [spawnCloud(A, 1), spawnCloud(B, 2)];
      const rng = createRng(1);
      run(() => stepGas(cs, [], empty, [A, B], rng, DT), 0.6);
      expect(cs.every(c => !c.alive), `gap ${gap.toFixed(2)}`).toBe(true);
    }
  });

  it('a bullet that stopped only seeps at its normal rate', () => {
    const A = mkPlayer('A', { x: 1, y: 10 }, 0, { ...emptyStats(), duration: 10 });
    const c = spawnCloud(A, 1);
    const end = 1 + 0.35 + c.radius + c.range; // roughly where it stops
    const B = mkPlayer('B', { x: end, y: 10 }, 0);
    B.hp = 1000;
    const rng = createRng(1);
    run(() => stepGas([c], [], empty, [A, B], rng, DT), c.range / GAS_SPEED + 1);
    // one second of lingering at the base rate, plus at most one pass
    expect(1000 - B.hp).toBeLessThan(gasParams(A.stats).dps + 40);
  });
});
