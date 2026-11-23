import type { Room, Vec2 } from './types';
import { add, scale, sub, dot, dist, edgeNormal, circleHitsPoly } from './vec';
import { isClear } from './roomgen';
import { MOVE_SPEED, PLAYER_RADIUS, DARK_SECONDS } from './config';

/** Push a circle out of walls and back inside the (convex) bounds. */
export function collide(room: Room, p: Vec2, r: number): Vec2 {
  let q = p;
  for (let iter = 0; iter < 4; iter++) {
    for (const w of room.walls) {
      const hit = circleHitsPoly(q, r, w);
      if (hit) q = add(q, scale(hit.normal, hit.depth + 1e-6));
    }
    const b = room.bounds;
    for (let i = 0; i < b.length; i++) {
      const a = b[i], c = b[(i + 1) % b.length];
      const inward = scale(edgeNormal(a, c), -1);
      const sd = dot(sub(q, a), inward);
      if (sd < r) q = add(q, scale(inward, r - sd));
    }
  }
  return q;
}

export function stepMove(room: Room, pos: Vec2, input: Vec2, dt: number): Vec2 {
  const l = Math.hypot(input.x, input.y);
  const dir = l > 1 ? scale(input, 1 / l) : input;
  return collide(room, add(pos, scale(dir, MOVE_SPEED * dt)), PLAYER_RADIUS);
}

export function validatePlan(room: Room, start: Vec2, plan: { pos: Vec2 }): boolean {
  return dist(start, plan.pos) <= MOVE_SPEED * DARK_SECONDS + 0.05 && isClear(room, plan.pos, PLAYER_RADIUS - 0.01);
}
