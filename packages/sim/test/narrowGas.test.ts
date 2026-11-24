import { describe, it, expect } from 'vitest';
import { spawnCloud, stepGas, gasParams, emptyStats, createRng, DT, type Cloud } from '../src';
import { mkPlayer, run, empty } from './helpers';

const fire = (shooter: ReturnType<typeof mkPlayer>, others: ReturnType<typeof mkPlayer>[], seconds = 3) => {
  const cs: Cloud[] = [spawnCloud(shooter, 1)];
  const rng = createRng(1);
  run(() => stepGas(cs, [], empty, [shooter, ...others], rng, DT), seconds);
};

describe('narrow gas', () => {
  it('only hurts within its own width', () => {
    const A = mkPlayer('A', { x: 2, y: 10 }, 0);
    const side = mkPlayer('S', { x: 5, y: 10.8 }, 0);
    const inLine = mkPlayer('L', { x: 5, y: 10 }, 0);
    fire(A, [side, inLine]);
    expect(side.hp).toBe(100);
    expect(inLine.hp).toBeLessThan(100);
  });

  it('thickness makes it wider', () => {
    expect(gasParams(emptyStats()).radius).toBeLessThanOrEqual(0.15);
    const A = mkPlayer('A', { x: 2, y: 10 }, 0, { ...emptyStats(), thickness: 10 });
    const side = mkPlayer('S', { x: 5, y: 10.8 }, 0);
    fire(A, [side]);
    expect(side.hp).toBeLessThan(100);
  });

  it('clouds passing side by side do not clash', () => {
    const A = mkPlayer('A', { x: 2, y: 10 }, 0), B = mkPlayer('B', { x: 12, y: 10.6 }, Math.PI);
    const cs: Cloud[] = [spawnCloud(A, 1), spawnCloud(B, 2)];
    const rng = createRng(1);
    // they pass each other after ~0.4 s; stop before either reaches a far wall and bounces back
    run(() => stepGas(cs, [], empty, [A, B], rng, DT), 0.7);
    expect(cs.every(c => c.alive)).toBe(true);
  });

  it('head-on clouds still clash', () => {
    const A = mkPlayer('A', { x: 2, y: 10 }, 0), B = mkPlayer('B', { x: 12, y: 10 }, Math.PI);
    const cs: Cloud[] = [spawnCloud(A, 1), spawnCloud(B, 2)];
    const rng = createRng(1);
    run(() => stepGas(cs, [], empty, [A, B], rng, DT), 2);
    expect(cs.every(c => !c.alive)).toBe(true);
  });
});
