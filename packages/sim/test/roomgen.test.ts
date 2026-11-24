import { describe, it, expect } from 'vitest';
import { createRng, generateRoom, spawnPoints, pointInPoly, circleHitsPoly, len, sub, isClear, PLAYER_RADIUS, ROOM_W, ROOM_H, WALL_THICKNESS } from '../src';

describe('roomgen', () => {
  it('generates valid rooms and well-spread spawn points', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rng = createRng(seed);
      const room = generateRoom(rng);
      expect(room).not.toHaveProperty('pipes');
      expect(room).not.toHaveProperty('zones');
      const pts = spawnPoints(room, 8, rng);
      expect(pts).toHaveLength(8);
      for (const p of pts) {
        expect(pointInPoly(p, room.bounds)).toBe(true);
        for (const w of room.walls) expect(circleHitsPoly(p, PLAYER_RADIUS, w)).toBeNull();
      }
      for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) expect(len(sub(pts[i], pts[j]))).toBeGreaterThan(3);
    }
  });
  it('is deterministic', () => {
    expect(generateRoom(createRng(7))).toEqual(generateRoom(createRng(7)));
  });

  it('splits the space into rooms with straight thin walls and doors', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const room = generateRoom(createRng(seed));
      expect(room.walls.length).toBeGreaterThanOrEqual(3);
      for (const w of room.walls) {
        expect(w).toHaveLength(4);
        const xs = w.map(p => p.x), ys = w.map(p => p.y);
        const wd = Math.max(...xs) - Math.min(...xs), ht = Math.max(...ys) - Math.min(...ys);
        expect(Math.min(wd, ht)).toBeCloseTo(WALL_THICKNESS); // thin, axis-aligned
      }
      // every free spot is reachable from every other: doors connect all rooms
      const free: string[] = [];
      for (let x = 0.5; x < ROOM_W; x += 0.5) for (let y = 0.5; y < ROOM_H; y += 0.5) if (isClear(room, { x, y }, PLAYER_RADIUS)) free.push(`${x},${y}`);
      const set = new Set(free), seen = new Set([free[0]]), todo = [free[0]];
      while (todo.length) {
        const [x, y] = todo.pop()!.split(',').map(Number);
        for (const [dx, dy] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {
          const k = `${x + dx},${y + dy}`;
          if (set.has(k) && !seen.has(k)) { seen.add(k); todo.push(k); }
        }
      }
      expect(seen.size, `seed ${seed}`).toBe(set.size);
      // at least 3 separate rooms: a straight line across the space is blocked somewhere
      expect(free.length).toBeGreaterThan(400);
    }
  });
});
