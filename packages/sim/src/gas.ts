import type { Cloud, Particle, Player, Room } from './types';
import type { Rng } from './rng';
import { add, scale, dist, fromAngle, v } from './vec';
import { gasParams, GAS_SPEED, PLAYER_RADIUS } from './config';
import { emptyStats } from './stats';

export const PARTICLE_SPEED = 1.5;
export const PARTICLE_LIFE = 0.8;
export const PARTICLE_RADIUS = 0.15;

export function spawnCloud(p: Player, id: number): Cloud {
  const g = gasParams(p.stats);
  const dir = fromAngle(p.aim);
  return {
    id, owner: p.id, pos: add(p.pos, scale(dir, PLAYER_RADIUS + g.radius)), dir,
    radius: g.radius, dps: g.dps, power: g.power, travelled: 0, range: g.range,
    age: 0, life: g.life, alive: true, touched: [], pipeCooldown: 0,
  };
}

function damage(players: Player[], owner: string, pos: { x: number; y: number }, r: number, amount: number) {
  for (const pl of players) {
    if (!pl.alive || pl.id === owner) continue;
    if (dist(pl.pos, pos) < r + PLAYER_RADIUS) {
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
      moveCloud(c, step, room);
      c.travelled += step;
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
    damage(players, c.owner, c.pos, c.radius, c.dps * dt);
  }
  for (const p of particles) {
    if (!p.alive) continue;
    p.age += dt;
    if (p.age >= p.life) { p.alive = false; continue; }
    p.pos = add(p.pos, scale(p.vel, dt));
    damage(players, p.owner, p.pos, p.radius, p.dps * dt);
  }
}

/** Moves a cloud forward by `step` metres. Interactions with the room are added in Task 6. */
export function moveCloud(c: Cloud, step: number, _room: Room): void {
  c.pos = add(c.pos, scale(c.dir, step));
}
