import { describe, it, expect } from 'vitest';
import { createRng, generateRoom, spawnPoints, pointInPoly, circleHitsPoly, len, sub, PLAYER_RADIUS } from '../src';

describe('roomgen', () => {
  it('generates valid rooms and well-spread spawn points', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rng = createRng(seed);
      const room = generateRoom(rng);
      expect(room.walls.length).toBeGreaterThanOrEqual(4);
      expect(room.walls.length).toBeLessThanOrEqual(7);
      expect(room.pipes.length).toBeGreaterThanOrEqual(1);
      expect(room.zones.length).toBeGreaterThanOrEqual(1);
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
});
