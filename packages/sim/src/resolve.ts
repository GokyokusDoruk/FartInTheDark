import type { Cloud, Particle, Player, Room } from './types';
import type { Rng } from './rng';
import { spawnCloud, stepGas } from './gas';
import { DT, TICK_HZ } from './config';

export interface Resolution { moveSeq: number; tick: number; clouds: Cloud[]; particles: Particle[]; done: boolean }

export const DEATH_SEQ_SCALE = 1_000_000;
const SAFETY_TICKS = 60 * TICK_HZ;

export function createResolution(players: Player[], moveSeq: number, room?: Room): Resolution {
  const clouds = players.filter(p => p.alive).map((p, i) => spawnCloud(p, i + 1, room));
  return { moveSeq, tick: 0, clouds, particles: [], done: clouds.length === 0 };
}

export function stepResolution(res: Resolution, room: Room, players: Player[], rng: Rng): void {
  if (res.done) return;
  res.tick++;
  const wasAlive = new Set(players.filter(p => p.alive).map(p => p.id));
  stepGas(res.clouds, res.particles, room, players, rng, DT);
  for (const p of players) if (wasAlive.has(p.id) && !p.alive) p.diedAt = res.moveSeq * DEATH_SEQ_SCALE + res.tick;
  res.particles = res.particles.filter(p => p.alive);
  if (res.tick >= SAFETY_TICKS || (res.clouds.every(c => !c.alive) && res.particles.length === 0)) res.done = true;
}

export function runResolution(res: Resolution, room: Room, players: Player[], rng: Rng): Resolution {
  while (!res.done) stepResolution(res, room, players, rng);
  return res;
}
