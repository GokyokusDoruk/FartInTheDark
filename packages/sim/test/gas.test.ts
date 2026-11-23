import { describe, it, expect } from 'vitest';
import { spawnCloud, stepGas, gasParams, emptyStats, createRng, DT, type Particle, type Cloud } from '../src';
import { mkPlayer, run, empty } from './helpers';

describe('gas', () => {
  it('passes through and damages multiple enemies, never its owner, stops at range, dies after life', () => {
    const A = mkPlayer('A', { x: 2, y: 10 }, 0), B = mkPlayer('B', { x: 5, y: 10 }, Math.PI), C = mkPlayer('C', { x: 7, y: 10 }, Math.PI / 2);
    const clouds: Cloud[] = [spawnCloud(A, 1)];
    const parts: Particle[] = [];
    const rng = createRng(1);
    const tick = () => stepGas(clouds, parts, empty, [A, B, C], rng, DT);
    run(tick, 1.8);
    expect(B.hp).toBeLessThan(100);
    expect(C.hp).toBeLessThan(100);
    expect(A.hp).toBe(100);
    expect(clouds[0].travelled).toBeCloseTo(gasParams(A.stats).range, 1);
    run(tick, 10);
    expect(clouds[0].alive).toBe(false);
    const hpAfter = B.hp;
    run(tick, 2);
    expect(B.hp).toBe(hpAfter);
  });
  it('kills a player whose hp reaches 0', () => {
    const A = mkPlayer('A', { x: 2, y: 10 }, 0), B = mkPlayer('B', { x: 4, y: 10 }, 0);
    B.hp = 1;
    const cs = [spawnCloud(A, 1)], rng = createRng(1);
    run(() => stepGas(cs, [], empty, [A, B], rng, DT), 1);
    expect(B.alive).toBe(false);
    expect(B.hp).toBe(0);
  });
  it('emits scatter particles only when scatter > 0', () => {
    const S = mkPlayer('S', { x: 2, y: 10 }, 0, { ...emptyStats(), scatter: 10 });
    const ps: Particle[] = [];
    const cs = [spawnCloud(S, 2)], rng = createRng(1);
    run(() => stepGas(cs, ps, empty, [S], rng, DT), 1);
    expect(ps.length).toBeGreaterThan(5);
    const Z = mkPlayer('Z', { x: 2, y: 10 }, 0);
    const zs: Particle[] = [];
    const zc = [spawnCloud(Z, 3)], zrng = createRng(1);
    run(() => stepGas(zc, zs, empty, [Z], zrng, DT), 1);
    expect(zs.length).toBe(0);
  });
});
