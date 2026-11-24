import { describe, it, expect } from 'vitest';
import { createRng, generateRoom, spawnPoints, rotateRoom, shrinkRoom, findValidPos, transformForNewMove, isClear, len, sub, centroidOf, pointInPoly, PLAYER_RADIUS } from '../src';

const room = generateRoom(createRng(3));

describe('room transforms', () => {
  it('rotates around the room center preserving distances', () => {
    const r90 = rotateRoom(room, Math.PI / 2);
    expect(len(sub(r90.walls[0][0], room.center))).toBeCloseTo(len(sub(room.walls[0][0], room.center)));
    expect(r90.walls[0][0]).not.toEqual(room.walls[0][0]);
    expect(len(sub(r90.walls[0][0], room.center))).toBeCloseTo(len(sub(room.walls[0][0], room.center)));
  });
  it('shrinks towards the center', () => {
    const s = shrinkRoom(room, 0.5);
    expect(len(sub(s.bounds[0], room.center))).toBeCloseTo(len(sub(room.bounds[0], room.center)) * 0.5);
  });
  it('pushes a player out of a wall to a nearby valid point', () => {
    const inside = centroidOf(room.walls[0]);
    const fixed = findValidPos(room, inside);
    expect(isClear(room, fixed, PLAYER_RADIUS)).toBe(true);
    expect(len(sub(fixed, inside))).toBeLessThan(3);
  });
  it('pulls a player from outside the room back in', () => {
    expect(pointInPoly(findValidPos(room, { x: 1000, y: 1000 }), room.bounds)).toBe(true);
  });
  it('keeps valid positions unchanged', () => {
    const p = spawnPoints(room, 1, createRng(1))[0];
    expect(findValidPos(room, p)).toEqual(p);
  });
  it('transformForNewMove leaves every player in a valid position', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const t = transformForNewMove(room, spawnPoints(room, 8, createRng(seed)), createRng(seed + 100));
      for (const p of t.positions) expect(isClear(t.room, p, PLAYER_RADIUS)).toBe(true);
    }
  });
});
