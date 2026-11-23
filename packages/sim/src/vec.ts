import type { Vec2, Poly } from './types';

const z = (n: number) => n + 0; // normalise -0 to 0
export const v = (x: number, y: number): Vec2 => ({ x: z(x), y: z(y) });
export const add = (a: Vec2, b: Vec2): Vec2 => v(a.x + b.x, a.y + b.y);
export const sub = (a: Vec2, b: Vec2): Vec2 => v(a.x - b.x, a.y - b.y);
export const scale = (a: Vec2, k: number): Vec2 => v(a.x * k, a.y * k);
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a: Vec2): Vec2 => { const l = len(a); return l === 0 ? v(0, 0) : v(a.x / l, a.y / l); };
export const fromAngle = (rad: number): Vec2 => v(Math.cos(rad), Math.sin(rad));
export const angleOf = (a: Vec2): number => Math.atan2(a.y, a.x);

export function rotate(p: Vec2, rad: number, about: Vec2 = { x: 0, y: 0 }): Vec2 {
  const c = Math.cos(rad), s = Math.sin(rad);
  const dx = p.x - about.x, dy = p.y - about.y;
  return v(about.x + dx * c - dy * s, about.y + dx * s + dy * c);
}

/** Reflect a direction off a surface with the given unit normal. */
export function reflect(dir: Vec2, normal: Vec2): Vec2 {
  const d = 2 * dot(dir, normal);
  return v(dir.x - d * normal.x, dir.y - d * normal.y);
}

/** Outward unit normal of edge a→b in a CCW polygon. */
export function edgeNormal(a: Vec2, b: Vec2): Vec2 {
  return norm(v(b.y - a.y, -(b.x - a.x)));
}

export function pointInPoly(p: Vec2, poly: Poly): boolean {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if (cross(sub(b, a), sub(p, a)) < 0) return false;
  }
  return true;
}

export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return add(a, scale(ab, t));
}

/** Closest point on the polygon's boundary. */
export function closestPointOnPoly(p: Vec2, poly: Poly): Vec2 {
  let best = poly[0], bd = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const q = closestPointOnSegment(p, poly[i], poly[(i + 1) % poly.length]);
    const d = dist(p, q);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

/** Circle vs polygon. Returns outward normal (from polygon towards circle) and penetration depth. */
export function circleHitsPoly(c: Vec2, r: number, poly: Poly): { normal: Vec2; depth: number } | null {
  if (pointInPoly(c, poly)) {
    let bestN = v(0, 0), bd = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const q = closestPointOnSegment(c, a, b);
      const d = dist(c, q);
      if (d < bd) { bd = d; bestN = edgeNormal(a, b); }
    }
    return { normal: bestN, depth: r + bd };
  }
  const q = closestPointOnPoly(c, poly);
  const d = dist(c, q);
  if (d >= r) return null;
  return { normal: norm(sub(c, q)), depth: r - d };
}

/**
 * First crossing of segment a→b through a polygon edge.
 * mode 'enter': crossing from outside to inside (walls). normal = outward edge normal.
 * mode 'exit': crossing from inside to outside (room bounds). normal = inward edge normal.
 */
export function segmentHitsPoly(a: Vec2, b: Vec2, poly: Poly, mode: 'enter' | 'exit' = 'enter'): { t: number; normal: Vec2 } | null {
  const d = sub(b, a);
  let best: { t: number; normal: Vec2 } | null = null;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const n = edgeNormal(p, q);
    const dn = dot(d, n);
    if (mode === 'enter' ? dn >= 0 : dn <= 0) continue;
    const e = sub(q, p);
    const den = cross(d, e);
    if (den === 0) continue;
    const ap = sub(p, a);
    const t = cross(ap, e) / den;
    const u = cross(ap, d) / den;
    if (t < 0 || t > 1 || u < 0 || u > 1) continue;
    if (!best || t < best.t) best = { t: z(t), normal: mode === 'enter' ? n : scale(n, -1) };
  }
  return best;
}

export function centroidOf(poly: Poly): Vec2 {
  let x = 0, y = 0;
  for (const p of poly) { x += p.x; y += p.y; }
  return v(x / poly.length, y / poly.length);
}
