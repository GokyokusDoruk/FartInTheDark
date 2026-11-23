import type { Stats } from './types';

export const TICK_HZ = 30;
export const DT = 1 / TICK_HZ;
export const ROUNDS = 5;
export const MAX_HP = 100;
export const POINTS_PER_MOVE = 5;
export const MAX_STAT = 10;
export const SKILL_SECONDS = 15;
export const DARK_SECONDS = 5;
export const MOVE_SPEED = 3; // m/s
export const PLAYER_RADIUS = 0.35;
export const GAS_SPEED = 4; // m/s
export const FLASHLIGHT_RANGE = 1; // m
export const SHRINK_PER_MOVE = 0.98;
export const CLASH_DAMPING = 0.5;

export interface GasParams {
  radius: number; range: number; dps: number; power: number; life: number;
  particlesPerSec: number; particleDps: number;
}

/** Balance curves. All tuning lives here. */
export function gasParams(s: Stats): GasParams {
  const dps = 20 + 5 * s.damage;
  return {
    radius: 0.5 + 0.1 * s.thickness,
    range: 5 + 1 * s.range,
    dps,
    power: 1 + s.power,
    life: 2 + 0.3 * s.duration,
    particlesPerSec: 1.5 * s.scatter,
    particleDps: 0.4 * dps,
  };
}
