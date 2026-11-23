import type { Room, Vec2 } from './types';
import type { Rng } from './rng';
import { rotate, add, sub, scale, v, closestPointOnPoly, centroidOf } from './vec';
import { isClear } from './roomgen';
import { PLAYER_RADIUS, SHRINK_PER_MOVE, MIN_ROOM_SIZE } from './config';

export function rotateRoom(room: Room, rad: number): Room {
  const c = room.center;
  const r = (p: Vec2) => rotate(p, rad, c);
  return {
    center: c,
    bounds: room.bounds.map(r),
    walls: room.walls.map(w => w.map(r)),
    pipes: room.pipes.map(p => ({ ...p, inlet: r(p.inlet), outlet: r(p.outlet), outDir: rotate(p.outDir, rad) })),
    zones: room.zones.map(z => ({ ...z, center: r(z.center) })),
  };
}

export function shrinkRoom(room: Room, factor: number): Room {
  const c = room.center;
  const s = (p: Vec2) => add(c, scale(sub(p, c), factor));
  return {
    center: c,
    bounds: room.bounds.map(s),
    walls: room.walls.map(w => w.map(s)),
    pipes: room.pipes.map(p => ({ ...p, inlet: s(p.inlet), outlet: s(p.outlet) })),
    zones: room.zones.map(z => ({ ...z, center: s(z.center) })),
  };
}

const R = PLAYER_RADIUS + 0.01;

/** Same point if valid, else the nearest valid point (spiral search). */
export function findValidPos(room: Room, p: Vec2): Vec2 {
  if (isClear(room, p, PLAYER_RADIUS)) return p;
  let start = p;
  if (!isClear({ bounds: room.bounds, walls: [] }, p, R)) {
    const edge = closestPointOnPoly(p, room.bounds);
    const toCenter = sub(centroidOf(room.bounds), edge);
    start = add(edge, scale(toCenter, (R + 0.05) / Math.hypot(toCenter.x, toCenter.y)));
    if (isClear(room, start, R)) return start;
  }
  for (let ring = 1; ring <= 300; ring++) {
    const rad = ring * 0.1;
    const n = Math.max(8, Math.ceil(rad * 20));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const q = v(start.x + Math.cos(a) * rad, start.y + Math.sin(a) * rad);
      if (isClear(room, q, R)) return q;
    }
  }
  return room.center;
}

export function transformForNewMove(room: Room, positions: Vec2[], rng: Rng): { room: Room; positions: Vec2[] } {
  const b = room.bounds;
  const shortest = Math.min(...b.map((p, i) => Math.hypot(b[(i + 1) % b.length].x - p.x, b[(i + 1) % b.length].y - p.y)));
  const factor = Math.max(SHRINK_PER_MOVE, Math.min(1, MIN_ROOM_SIZE / shortest));
  const next = shrinkRoom(rotateRoom(room, rng.range(0, Math.PI * 2)), factor);
  return { room: next, positions: positions.map(p => findValidPos(next, p)) };
}
