import type { Poly, Room, Vec2, Pipe, Zone, ZoneKind } from './types';
import type { Rng } from './rng';
import { v, dist, fromAngle, pointInPoly, circleHitsPoly, closestPointOnPoly } from './vec';
import { PLAYER_RADIUS } from './config';

export const ROOM_W = 14;
export const ROOM_H = 20;

export const rectPoly = (x1: number, y1: number, x2: number, y2: number): Poly =>
  [v(x1, y1), v(x2, y1), v(x2, y2), v(x1, y2)];

/** True if a circle at p with radius r is inside bounds and clear of every wall. */
export function isClear(room: Pick<Room, 'bounds' | 'walls'>, p: Vec2, r: number): boolean {
  if (!pointInPoly(p, room.bounds) || distToBoundary(p, room.bounds) < r) return false;
  return room.walls.every(w => circleHitsPoly(p, r, w) === null);
}

export const distToBoundary = (p: Vec2, poly: Poly): number => dist(p, closestPointOnPoly(p, poly));

export function generateRoom(rng: Rng): Room {
  const bounds = rectPoly(0, 0, ROOM_W, ROOM_H);
  const center = v(ROOM_W / 2, ROOM_H / 2);
  const walls: Poly[] = [];
  const wallCount = rng.int(4, 7);
  const GAP = 1.2;
  for (let tries = 0; walls.length < wallCount && tries < 500; tries++) {
    const w = rng.range(1, 3), h = rng.range(1, 3);
    const x = rng.range(1.5, ROOM_W - 1.5 - w), y = rng.range(1.5, ROOM_H - 1.5 - h);
    const ok = walls.every(o => x > o[1].x + GAP || x + w < o[0].x - GAP || y > o[2].y + GAP || y + h < o[0].y - GAP);
    if (ok) walls.push(rectPoly(x, y, x + w, y + h));
  }
  const base = { bounds, walls };
  const taken: { c: Vec2; r: number }[] = [];
  const freeSpot = (r: number): Vec2 => {
    for (let tries = 0; tries < 500; tries++) {
      const p = v(rng.range(1, ROOM_W - 1), rng.range(1, ROOM_H - 1));
      if (isClear(base, p, r + 0.3) && taken.every(t => dist(t.c, p) > t.r + r + 0.5)) {
        taken.push({ c: p, r });
        return p;
      }
    }
    return center;
  };
  const pipes: Pipe[] = [];
  const pipeCount = rng.int(1, 2);
  for (let i = 0; i < pipeCount; i++) {
    const inlet = freeSpot(0.5);
    let outlet = freeSpot(0.5);
    for (let k = 0; k < 20 && dist(inlet, outlet) < 5; k++) { taken.pop(); outlet = freeSpot(0.5); }
    pipes.push({ inlet, outlet, outDir: fromAngle(rng.range(0, Math.PI * 2)), radius: 0.5 });
  }
  const zones: Zone[] = [];
  const kinds: ZoneKind[] = ['grow', 'shrink', 'redirect'];
  const zoneCount = rng.int(1, 3);
  for (let i = 0; i < zoneCount; i++) {
    const kind = rng.pick(kinds);
    const radius = rng.range(0.9, 1.3);
    const z: Zone = { kind, center: freeSpot(radius), radius };
    if (kind === 'redirect') z.turn = rng.pick([Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4]);
    zones.push(z);
  }
  return { center, bounds, walls, pipes, zones };
}

/** Farthest-point sampling over a grid of valid positions. */
export function spawnPoints(room: Room, count: number, rng: Rng): Vec2[] {
  const cands: Vec2[] = [];
  for (let x = 0.5; x < ROOM_W; x += 0.5) for (let y = 0.5; y < ROOM_H; y += 0.5) {
    const p = v(x, y);
    if (isClear(room, p, PLAYER_RADIUS + 0.2)) cands.push(p);
  }
  if (cands.length === 0) return Array.from({ length: count }, () => room.center);
  const chosen: Vec2[] = [rng.pick(cands)];
  while (chosen.length < count) {
    let best = cands[0], bd = -1;
    for (const c of cands) {
      const d = Math.min(...chosen.map(p => dist(p, c))) + rng.next() * 0.3;
      if (d > bd) { bd = d; best = c; }
    }
    chosen.push(best);
  }
  return chosen;
}
