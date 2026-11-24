import { describe, it, expect } from 'vitest';
import { spawnCloud, stepGas, emptyStats, createRng, DT, CLASH_DAMPING, type Room, type Particle } from '../src';
import { mkPlayer, run, empty, rect } from './helpers';

const tick = (clouds: any[], room: Room, players: any[] = [], parts: Particle[] = []) => {
  const rng = createRng(1);
  return () => stepGas(clouds, parts, room, players, rng, DT);
};

describe('gas interactions', () => {
  it('bounces off a wall', () => {
    const room = { ...empty, walls: [rect(6, 0, 7, 20)] };
    const c = spawnCloud(mkPlayer('A', { x: 4, y: 10 }, 0), 1, room);
    run(tick([c], room), 1);
    expect(c.dir.x).toBeLessThan(0);
    expect(c.pos.x).toBeLessThan(6);
  });
  it('bounces off the room bounds', () => {
    const c = spawnCloud(mkPlayer('A', { x: 12, y: 10 }, 0), 1, empty);
    run(tick([c], empty), 1);
    expect(c.dir.x).toBeLessThan(0);
    expect(c.pos.x).toBeLessThan(14);
  });
  it('does not tunnel through a thin wall next to the player, even with a large dt', () => {
    const thin = { ...empty, walls: [rect(6, 0, 6.2, 20)] };
    const c = spawnCloud(mkPlayer('A', { x: 5.3, y: 10 }, 0), 2, thin);
    expect(c.pos.x).toBeLessThan(6);
    stepGas([c], [], thin, [], createRng(1), 0.5);
    expect(c.pos.x).toBeLessThan(6);
  });
  it('each bounce halves its damage and its remaining range', () => {
    const room = { ...empty, walls: [rect(6, 0, 7, 20)] };
    const c = spawnCloud(mkPlayer('A', { x: 4, y: 10 }, 0, { ...emptyStats(), duration: 10 }), 1, room);
    const dps0 = c.dps, range0 = c.range;
    const t = tick([c], room);
    let bounced = false;
    for (let i = 0; i < 300 && !bounced; i++) { t(); bounced = c.dir.x < 0; }
    expect(bounced).toBe(true);
    expect(c.dps).toBeCloseTo(dps0 / 2);
    // the wall face is 6 - radius away from the start of the sweep; what was left of the range is halved
    const atHit = c.travelled;
    expect(c.range).toBeLessThan(range0);
    expect(c.range - atHit).toBeLessThanOrEqual((range0 - atHit) / 2 + 0.11);
    run(t, 10);
    expect(c.travelled).toBeCloseTo(c.range, 5);
  });
  it('two bounces quarter the damage', () => {
    const room = { ...empty, walls: [rect(6, 0, 6.3, 20), rect(2, 0, 2.3, 20)] };
    const c = spawnCloud(mkPlayer('A', { x: 4, y: 10 }, 0, { ...emptyStats(), range: 10, duration: 10 }), 1, room);
    const dps0 = c.dps;
    let flips = 0, last = c.dir.x;
    const t = tick([c], room);
    for (let i = 0; i < 600 && flips < 2; i++) { t(); if (Math.sign(c.dir.x) !== Math.sign(last)) { flips++; last = c.dir.x; } }
    expect(flips).toBe(2);
    expect(c.dps).toBeCloseTo(dps0 / 4);
  });
  it('stronger gas survives a clash with reduced damage', () => {
    const strong = spawnCloud(mkPlayer('A', { x: 2, y: 10 }, 0, { ...emptyStats(), power: 6 }), 5, empty);
    const weak = spawnCloud(mkPlayer('B', { x: 8, y: 10 }, Math.PI, { ...emptyStats(), power: 2 }), 6, empty);
    const d0 = strong.dps;
    run(tick([strong, weak], empty), 1);
    expect(weak.alive).toBe(false);
    expect(strong.alive).toBe(true);
    expect(strong.dps).toBeCloseTo(d0 * (1 - (3 / 7) * CLASH_DAMPING));
  });
  it('equal gases cancel each other', () => {
    const a = spawnCloud(mkPlayer('A', { x: 2, y: 10 }, 0), 5, empty);
    const b = spawnCloud(mkPlayer('B', { x: 8, y: 10 }, Math.PI), 6, empty);
    run(tick([a, b], empty), 1);
    expect(a.alive).toBe(false);
    expect(b.alive).toBe(false);
  });
  it('particles die when they hit a wall', () => {
    const room = { ...empty, walls: [rect(0, 10.6, 14, 11)] };
    const S = mkPlayer('S', { x: 2, y: 10 }, 0, { ...emptyStats(), scatter: 10 });
    const parts: Particle[] = [];
    run(tick([spawnCloud(S, 1, room)], room, [S], parts), 1.5);
    expect(parts.some(p => p.vel.y > 0 && p.alive && p.pos.y > 10.6)).toBe(false);
  });
});
