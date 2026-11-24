import type { Poly, Room, Vec2 } from './types';
import type { Rng } from './rng';
import { v, dist, pointInPoly, circleHitsPoly, closestPointOnPoly } from './vec';
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

export const WALL_THICKNESS = 0.3;
export const DOOR_WIDTH = 2;
const MIN_ROOM_SIDE = 4;

interface Area { x0: number; y0: number; x1: number; y1: number }

/**
 * A floor plan: the outer rectangle is split (BSP style) into 3-5 rooms by straight, thin walls.
 * Every dividing wall has a door (long ones sometimes two), so all rooms stay connected.
 */
export function generateRoom(rng: Rng): Room {
  const bounds = rectPoly(0, 0, ROOM_W, ROOM_H);
  const center = v(ROOM_W / 2, ROOM_H / 2);
  const walls: Poly[] = [];
  const areas: Area[] = [{ x0: 0, y0: 0, x1: ROOM_W, y1: ROOM_H }];
  const splits = rng.int(2, 4);
  const h = WALL_THICKNESS / 2;
  /** door gaps so far: a new wall must not end inside one (it would cut the door in half) */
  const doorsOn: { vertical: boolean; at: number; g0: number; g1: number }[] = [];
  const blocksDoor = (vertical: boolean, at: number, ends: number[]) =>
    doorsOn.some(d => d.vertical !== vertical && ends.some(e => Math.abs(d.at - e) < 0.01) && at > d.g0 - 0.6 && at < d.g1 + 0.6);
  const pick = (vertical: boolean, lo: number, hi: number, ends: number[]) => {
    let at = lo;
    for (let k = 0; k < 30; k++) {
      at = Math.round(rng.range(lo, hi) * 2) / 2;
      if (!blocksDoor(vertical, at, ends)) return at;
    }
    return null;
  };

  /** A wall along [from, to] on the line `at`, minus the door gaps; `vertical` = constant x. */
  const addWall = (vertical: boolean, at: number, from: number, to: number) => {
    const length = to - from;
    const doors = length > 9 && rng.next() < 0.5 ? 2 : 1;
    const gaps: [number, number][] = [];
    for (let d = 0; d < doors; d++) {
      const lo = from + 0.8 + (length / doors) * d, hi = from + (length / doors) * (d + 1) - 0.8 - DOOR_WIDTH;
      const g = rng.range(lo, Math.max(lo, hi));
      gaps.push([g, g + DOOR_WIDTH]);
      doorsOn.push({ vertical, at, g0: g, g1: g + DOOR_WIDTH });
    }
    let cur = from;
    for (const [g0, g1] of [...gaps, [to, to] as [number, number]]) {
      if (g0 - cur > 0.4) walls.push(vertical ? rectPoly(at - h, cur, at + h, g0) : rectPoly(cur, at - h, g0, at + h));
      cur = g1;
    }
  };

  for (let i = 0; i < splits; i++) {
    // split the largest area that is still big enough, across its longer side
    const order = [...areas].sort((p, q) => (q.x1 - q.x0) * (q.y1 - q.y0) - (p.x1 - p.x0) * (p.y1 - p.y0));
    for (const area of order) {
      const w = area.x1 - area.x0, ht = area.y1 - area.y0;
      if (Math.max(w, ht) < 2 * MIN_ROOM_SIDE) continue;
      const vertical = w > ht;
      const at = vertical
        ? pick(true, area.x0 + MIN_ROOM_SIDE, area.x1 - MIN_ROOM_SIDE, [area.y0, area.y1])
        : pick(false, area.y0 + MIN_ROOM_SIDE, area.y1 - MIN_ROOM_SIDE, [area.x0, area.x1]);
      if (at === null) continue;
      areas.splice(areas.indexOf(area), 1);
      if (vertical) {
        addWall(true, at, area.y0, area.y1);
        areas.push({ ...area, x1: at }, { ...area, x0: at });
      } else {
        addWall(false, at, area.x0, area.x1);
        areas.push({ ...area, y1: at }, { ...area, y0: at });
      }
      break;
    }
  }
  return { center, bounds, walls };
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
