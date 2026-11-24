import type { Cloud, Particle, Player, Room, Vec2 } from './types';
import type { Rng } from './rng';
import { add, sub, scale, dist, dot, fromAngle, v, reflect, segmentHitsPoly, pointInPoly } from './vec';
import { gasParams, GAS_SPEED, PLAYER_RADIUS, CLASH_DAMPING, BOUNCE_DAMPING, DAMAGE_REF_SPEED } from './config';
import { emptyStats } from './stats';

export const PARTICLE_SPEED = 4;
export const PARTICLE_LIFE = 0.8;
export const PARTICLE_RADIUS = 0.15;

/** Spawns a cloud at the player's rear. With a room, the offset is swept so it never starts inside a wall. */
export function spawnCloud(p: Player, id: number, room?: Room): Cloud {
  const g = gasParams(p.stats);
  const dir = fromAngle(p.aim);
  const c: Cloud = {
    id, owner: p.id, pos: p.pos, dir,
    radius: g.radius, dps: g.dps, power: g.power, travelled: 0, range: g.range,
    age: 0, life: g.life, alive: true,
  };
  const offset = PLAYER_RADIUS + g.radius;
  if (room) sweep(c, offset, room);
  else c.pos = add(p.pos, scale(dir, offset));
  return c;
}

/** True if a wall stands between a and b. */
export function wallBetween(room: Room, a: Vec2, b: Vec2): boolean {
  return room.walls.some(w => segmentHitsPoly(a, b, w, 'enter') !== null || segmentHitsPoly(b, a, w, 'enter') !== null);
}

function damage(room: Room, players: Player[], owner: string, pos: Vec2, r: number, amount: number) {
  for (const pl of players) {
    if (!pl.alive || pl.id === owner) continue;
    if (dist(pl.pos, pos) < r + PLAYER_RADIUS && !wallBetween(room, pos, pl.pos)) {
      pl.hp -= amount;
      if (pl.hp <= 0) { pl.hp = 0; pl.alive = false; }
    }
  }
}

/** Part of segment a→b (as t0..t1 in [0,1]) that lies within distance r of p, or null. */
function insideSpan(a: Vec2, b: Vec2, p: Vec2, r: number): [number, number] | null {
  const d = sub(b, a), f = sub(a, p);
  const A = dot(d, d);
  if (A < 1e-12) return dist(a, p) < r ? [0, 1] : null;
  const B = 2 * dot(f, d), C = dot(f, f) - r * r;
  const disc = B * B - 4 * A * C;
  if (disc <= 0) return null;
  const s = Math.sqrt(disc);
  const t0 = Math.max(0, (-B - s) / (2 * A)), t1 = Math.min(1, (-B + s) / (2 * A));
  return t1 > t0 ? [t0, t1] : null;
}

/** A moving bullet hurts by the distance it travels inside each player (frame-rate independent). */
function damageAlong(room: Room, players: Player[], owner: string, path: Seg[], r: number) {
  for (const pl of players) {
    if (!pl.alive || pl.id === owner) continue;
    let amount = 0;
    for (const sg of path) {
      const span = insideSpan(sg.a, sg.b, pl.pos, r + PLAYER_RADIUS);
      if (!span) continue;
      const mid = add(sg.a, scale(sub(sg.b, sg.a), (span[0] + span[1]) / 2));
      if (wallBetween(room, mid, pl.pos)) continue;
      amount += (sg.dps / DAMAGE_REF_SPEED) * dist(sg.a, sg.b) * (span[1] - span[0]);
    }
    if (amount > 0) {
      pl.hp -= amount;
      if (pl.hp <= 0) { pl.hp = 0; pl.alive = false; }
    }
  }
}

interface Seg { a: Vec2; b: Vec2; dps: number }

/** Advances all gas by dt. Mutates clouds, particles and players in place. */
export function stepGas(clouds: Cloud[], particles: Particle[], room: Room, players: Player[], rng: Rng, dt: number): void {
  const paths = new Map<Cloud, Seg[]>();
  for (const c of clouds) {
    if (!c.alive) continue;
    c.age += dt;
    if (c.age >= c.life) { c.alive = false; continue; }
    const step = Math.min(GAS_SPEED * dt, c.range - c.travelled);
    if (step > 0) {
      const path: Seg[] = [];
      c.travelled += sweep(c, step, room, path);
      paths.set(c, path);
    }
    const g = gasParams(players.find(p => p.id === c.owner)?.stats ?? emptyStats());
    let n = g.particlesPerSec * dt;
    while (n > 0) {
      if (n >= 1 || rng.next() < n) {
        const side = rng.next() < 0.5 ? 1 : -1;
        const perp = v(-c.dir.y * side, c.dir.x * side);
        const vel = scale(add(perp, scale(c.dir, rng.range(-0.3, 0.3))), PARTICLE_SPEED);
        particles.push({ owner: c.owner, pos: c.pos, vel, radius: PARTICLE_RADIUS, dps: g.particleDps, age: 0, life: PARTICLE_LIFE, alive: true });
      }
      n -= 1;
    }
  }
  clash(clouds, room, paths);
  for (const c of clouds) {
    if (!c.alive) continue;
    const path = paths.get(c);
    if (path) damageAlong(room, players, c.owner, path, c.radius);
    else damage(room, players, c.owner, c.pos, c.radius, c.dps * dt); // stopped: the gas hangs and seeps
  }
  for (const p of particles) {
    if (!p.alive) continue;
    p.age += dt;
    if (p.age >= p.life) { p.alive = false; continue; }
    p.pos = add(p.pos, scale(p.vel, dt));
    if (!pointInPoly(p.pos, room.bounds) || room.walls.some(w => pointInPoly(p.pos, w))) { p.alive = false; continue; }
    damage(room, players, p.owner, p.pos, p.radius, p.dps * dt);
  }
}

/** Closest the two clouds got during this tick (start→end of each path, straight), with where. */
function closestApproach(a: Cloud, b: Cloud, pa?: Seg[], pb?: Seg[]): { d: number; pa: Vec2; pb: Vec2 } {
  const a0 = pa?.length ? pa[0].a : a.pos, b0 = pb?.length ? pb[0].a : b.pos;
  const da = sub(a.pos, a0), db = sub(b.pos, b0);
  const w = sub(a0, b0), rel = sub(da, db);
  const rr = dot(rel, rel);
  const t = rr < 1e-12 ? 1 : Math.max(0, Math.min(1, -dot(w, rel) / rr));
  const ca = add(a0, scale(da, t)), cb = add(b0, scale(db, t));
  return { d: dist(ca, cb), pa: ca, pb: cb };
}

/** Gas-vs-gas: stronger survives with reduced damage; equal power cancels both. Swept, so fast bullets cannot slip past each other. */
function clash(clouds: Cloud[], room: Room, paths: Map<Cloud, Seg[]>) {
  for (let i = 0; i < clouds.length; i++) for (let j = i + 1; j < clouds.length; j++) {
    const a = clouds[i], b = clouds[j];
    if (!a.alive || !b.alive || a.owner === b.owner) continue;
    const near = closestApproach(a, b, paths.get(a), paths.get(b));
    if (near.d >= a.radius + b.radius || wallBetween(room, near.pa, near.pb)) continue;
    if (a.power === b.power) { a.alive = false; b.alive = false; continue; }
    const [strong, weak] = a.power > b.power ? [a, b] : [b, a];
    weak.alive = false;
    strong.dps *= 1 - (weak.power / strong.power) * CLASH_DAMPING;
  }
}

const EPS = 1e-4;

/**
 * Moves the cloud centre `step` metres, bouncing off walls and bounds (max 3 bounces per step).
 * Every bounce halves the cloud's damage and what is left of its range.
 */
function sweep(c: Cloud, step: number, room: Room, path?: Seg[]): number {
  let left = step;
  let done = 0;
  for (let bounce = 0; bounce <= 3 && left > 0; bounce++) {
    const a = c.pos, b = add(a, scale(c.dir, left));
    let hit = segmentHitsPoly(a, b, room.bounds, 'exit');
    for (const w of room.walls) {
      const h = segmentHitsPoly(a, b, w, 'enter');
      if (h && (!hit || h.t < hit.t)) hit = h;
    }
    if (!hit) { path?.push({ a, b, dps: c.dps }); c.pos = b; return done + left; }
    c.pos = add(add(a, scale(sub(b, a), hit.t)), scale(hit.normal, EPS));
    path?.push({ a, b: c.pos, dps: c.dps });
    c.dir = reflect(c.dir, hit.normal);
    const moved = left * hit.t;
    done += moved;
    const travelledAtHit = c.travelled + done;
    c.range = travelledAtHit + (c.range - travelledAtHit) * BOUNCE_DAMPING;
    c.dps *= BOUNCE_DAMPING;
    left = Math.max(0, Math.min(left - moved, c.range - travelledAtHit));
  }
  return done;
}
