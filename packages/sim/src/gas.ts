import type { Cloud, Particle, Player, Room, Vec2 } from './types';
import type { Rng } from './rng';
import { add, sub, scale, dist, fromAngle, v, reflect, segmentHitsPoly, pointInPoly } from './vec';
import { gasParams, GAS_SPEED, PLAYER_RADIUS, CLASH_DAMPING, BOUNCE_DAMPING } from './config';
import { emptyStats } from './stats';

export const PARTICLE_SPEED = 1.5;
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

/** Advances all gas by dt. Mutates clouds, particles and players in place. */
export function stepGas(clouds: Cloud[], particles: Particle[], room: Room, players: Player[], rng: Rng, dt: number): void {
  for (const c of clouds) {
    if (!c.alive) continue;
    c.age += dt;
    if (c.age >= c.life) { c.alive = false; continue; }
    const step = Math.min(GAS_SPEED * dt, c.range - c.travelled);
    if (step > 0) {
      c.travelled += sweep(c, step, room);
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
  clash(clouds, room);
  for (const c of clouds) if (c.alive) damage(room, players, c.owner, c.pos, c.radius, c.dps * dt);
  for (const p of particles) {
    if (!p.alive) continue;
    p.age += dt;
    if (p.age >= p.life) { p.alive = false; continue; }
    p.pos = add(p.pos, scale(p.vel, dt));
    if (!pointInPoly(p.pos, room.bounds) || room.walls.some(w => pointInPoly(p.pos, w))) { p.alive = false; continue; }
    damage(room, players, p.owner, p.pos, p.radius, p.dps * dt);
  }
}

/** Gas-vs-gas: stronger survives with reduced damage; equal power cancels both. */
function clash(clouds: Cloud[], room: Room) {
  for (let i = 0; i < clouds.length; i++) for (let j = i + 1; j < clouds.length; j++) {
    const a = clouds[i], b = clouds[j];
    if (!a.alive || !b.alive || a.owner === b.owner) continue;
    if (dist(a.pos, b.pos) >= a.radius + b.radius || wallBetween(room, a.pos, b.pos)) continue;
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
function sweep(c: Cloud, step: number, room: Room): number {
  let left = step;
  let done = 0;
  for (let bounce = 0; bounce <= 3 && left > 0; bounce++) {
    const a = c.pos, b = add(a, scale(c.dir, left));
    let hit = segmentHitsPoly(a, b, room.bounds, 'exit');
    for (const w of room.walls) {
      const h = segmentHitsPoly(a, b, w, 'enter');
      if (h && (!hit || h.t < hit.t)) hit = h;
    }
    if (!hit) { c.pos = b; return done + left; }
    c.pos = add(add(a, scale(sub(b, a), hit.t)), scale(hit.normal, EPS));
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
