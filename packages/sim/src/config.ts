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
/** Gas flies like a bullet: fast and at a constant speed. */
export const GAS_SPEED = 10; // m/s
/** A moving bullet deals `dps / DAMAGE_REF_SPEED` per metre it travels through a player, so a
 *  hit hurts the same as it did when gas drifted at 3 m/s; a stopped cloud seeps at plain `dps`. */
export const DAMAGE_REF_SPEED = 3;
export const FLASHLIGHT_RANGE = 1; // m
export const SHRINK_PER_MOVE = 0.98;
/** Each wall bounce multiplies damage and the remaining range by this. */
export const BOUNCE_DAMPING = 0.5;
export const CLASH_DAMPING = 0.5;
/** The room stops shrinking once its shortest side reaches this (m). */
export const MIN_ROOM_SIZE = 7;
/** From this move of a round on, the floor poisons every survivor: SUDDEN_DEATH_STEP × (move − SUDDEN_DEATH_MOVE + 1) hp per move. Guarantees every round ends. */
export const SUDDEN_DEATH_MOVE = 15;
export const SUDDEN_DEATH_STEP = 10;

export interface GasParams {
  radius: number; range: number; dps: number; power: number; life: number;
  particlesPerSec: number; particleDps: number;
}

/** Balance curves. All tuning lives here. */
export function gasParams(s: Stats): GasParams {
  // narrow streak: it only hurts what it actually touches, so a hit is short and has to hurt
  const dps = 80 + 10 * s.damage;
  return {
    radius: 0.12 + 0.04 * s.thickness,
    range: 10 + 1.5 * s.range,
    dps,
    power: 1 + s.power,
    // flight time + how long the gas hangs where it stops
    life: (10 + 1.5 * s.range) / GAS_SPEED + 0.5 + 0.3 * s.duration,
    particlesPerSec: 1.5 * s.scatter,
    particleDps: 0.4 * dps,
  };
}
