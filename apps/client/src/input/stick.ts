export type V = { x: number; y: number };
const DEAD = 0.1;

/** Joystick deflection in [-1,1]², length ≤ 1, with a dead zone. */
export function stickVector(origin: V, touch: V, maxRadius: number): V {
  const dx = touch.x - origin.x, dy = touch.y - origin.y;
  const l = Math.hypot(dx, dy) / maxRadius;
  if (l < DEAD) return { x: 0, y: 0 };
  const k = Math.min(1, l) / l / maxRadius;
  return { x: dx * k + 0, y: dy * k + 0 };
}
