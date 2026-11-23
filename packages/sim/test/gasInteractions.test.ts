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
  it('travels through a pipe', () => {
    const room = { ...empty, pipes: [{ inlet: { x: 5, y: 10 }, outlet: { x: 2, y: 8 }, outDir: { x: 0, y: -1 }, radius: 0.5 }] };
    const c = spawnCloud(mkPlayer('A', { x: 3, y: 10 }, 0), 3, room);
    run(tick([c], room), 1);
    expect(c.dir).toEqual({ x: 0, y: -1 });
    expect(c.pos.y).toBeLessThan(8);
  });
  it('grow zone enlarges once', () => {
    const room: Room = { ...empty, zones: [{ kind: 'grow', center: { x: 5, y: 10 }, radius: 0.5 }] };
    const g = spawnCloud(mkPlayer('A', { x: 3, y: 10 }, 0), 4, room);
    const r0 = g.radius, d0 = g.dps;
    run(tick([g], room), 1);
    expect(g.radius).toBeCloseTo(r0 * 1.5);
    expect(g.dps).toBeCloseTo(d0 * 1.3);
  });
  it('shrink zone shrinks', () => {
    const room: Room = { ...empty, zones: [{ kind: 'shrink', center: { x: 5, y: 10 }, radius: 0.5 }] };
    const g = spawnCloud(mkPlayer('A', { x: 3, y: 10 }, 0), 4, room);
    const r0 = g.radius;
    run(tick([g], room), 1);
    expect(g.radius).toBeCloseTo(r0 * 0.6);
  });
  it('redirect zone turns the cloud', () => {
    const room: Room = { ...empty, zones: [{ kind: 'redirect', center: { x: 5, y: 10 }, radius: 0.5, turn: Math.PI / 2 }] };
    const g = spawnCloud(mkPlayer('A', { x: 3, y: 10 }, 0), 4, room);
    run(tick([g], room), 1);
    expect(g.dir.x).toBeCloseTo(0);
    expect(g.dir.y).toBeCloseTo(1);
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
