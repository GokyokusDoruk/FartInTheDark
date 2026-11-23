import { describe, it, expect } from 'vitest';
import {
  spawnCloud, stepGas, emptyStats, createRng, DT, generateRoom, rotateRoom, transformForNewMove, spawnPoints, MIN_ROOM_SIZE,
  startMatch, allocateSkills, endSkills, submitPlan, beginResolve, finishResolve, nextRound, runResolution,
  botAllocate, botPlan, SUDDEN_DEATH_MOVE, type MatchState, type Cloud,
} from '../src';
import { mkPlayer, run, empty, rect } from './helpers';

describe('review fixes', () => {
  it('gas does not damage through a wall', () => {
    const room = { ...empty, walls: [rect(5, 0, 6, 20)] };
    const A = mkPlayer('A', { x: 3, y: 10 }, 0, { ...emptyStats(), thickness: 8 });
    const B = mkPlayer('B', { x: 6.4, y: 10 }, 0);
    const cs: Cloud[] = [spawnCloud(A, 1, room)], rng = createRng(1);
    run(() => stepGas(cs, [], room, [A, B], rng, DT), 3);
    expect(B.hp).toBe(100);
  });
  it('gas clouds do not clash through a wall', () => {
    const room = { ...empty, walls: [rect(6.8, 0, 7.2, 20)] };
    const a = spawnCloud(mkPlayer('A', { x: 5, y: 10 }, 0, { ...emptyStats(), thickness: 10 }), 1, room);
    const b = spawnCloud(mkPlayer('B', { x: 9, y: 10 }, Math.PI, { ...emptyStats(), thickness: 10, power: 3 }), 2, room);
    run(() => stepGas([a, b], [], room, [], createRng(1), DT), 0.5);
    expect(a.alive).toBe(true);
  });
  it('a level-0 cloud passing a standing player deals at least a quarter of their hp', () => {
    const A = mkPlayer('A', { x: 2, y: 10 }, 0), B = mkPlayer('B', { x: 5, y: 10 }, 0);
    const cs = [spawnCloud(A, 1, empty)], rng = createRng(1);
    run(() => stepGas(cs, [], empty, [A, B], rng, DT), 1.2);
    expect(100 - B.hp).toBeGreaterThanOrEqual(25);
  });
  it('the room never shrinks below the minimum size', () => {
    let room = generateRoom(createRng(1));
    let pos = spawnPoints(room, 2, createRng(2));
    const rng = createRng(3);
    for (let i = 0; i < 300; i++) ({ room, positions: pos } = transformForNewMove(room, pos, rng));
    const r0 = rotateRoom(room, 0);
    const w = Math.hypot(r0.bounds[1].x - r0.bounds[0].x, r0.bounds[1].y - r0.bounds[0].y);
    expect(w).toBeGreaterThanOrEqual(MIN_ROOM_SIZE - 1e-6);
  });
  it('sudden death damages survivors after the move cap', () => {
    const s = startMatch({ seed: 4, players: [{ id: 'A', name: 'A', isBot: true }, { id: 'B', name: 'B', isBot: true }] });
    endSkills(s);
    s.move = SUDDEN_DEATH_MOVE;
    for (const p of s.players) submitPlan(s, p.id, { pos: p.pos, aim: 0 });
    for (const p of s.players) p.stats.range = 0;
    beginResolve(s);
    // park the clouds so nobody is hit by gas
    for (const c of s.resolution!.clouds) c.alive = false;
    runResolution(s.resolution!, s.room, s.players, s.rng);
    finishResolve(s);
    expect(s.players.every(p => p.hp < 100)).toBe(true);
  });
  it('every bot-only round ends within a bounded number of moves', () => {
    for (const d of ['hard', 'medium', 'easy'] as const) for (let seed = 1; seed <= 15; seed++) {
      const s: MatchState = startMatch({ seed: seed * 7919, players: [{ id: 'X', name: 'X', isBot: true, difficulty: d }, { id: 'Y', name: 'Y', isBot: true, difficulty: d }] });
      let maxMove = 0, guard = 0;
      while (s.phase !== 'matchEnd' && guard++ < 5000) {
        if (s.phase === 'skills') { for (const p of s.players) if (p.alive && p.unspent) allocateSkills(s, p.id, botAllocate(s, p.id)); endSkills(s); }
        else if (s.phase === 'dark') { for (const p of s.players) if (p.alive) submitPlan(s, p.id, botPlan(s, p.id)); beginResolve(s); }
        else if (s.phase === 'resolve') { runResolution(s.resolution!, s.room, s.players, s.rng); maxMove = Math.max(maxMove, s.move); finishResolve(s); }
        else nextRound(s);
      }
      expect(s.phase).toBe('matchEnd');
      expect(maxMove).toBeLessThanOrEqual(SUDDEN_DEATH_MOVE + 8);
    }
  }, 60_000);
});
