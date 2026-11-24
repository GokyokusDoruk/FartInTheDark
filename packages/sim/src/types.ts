export type Vec2 = { x: number; y: number };
/** Convex polygon, counter-clockwise. */
export type Poly = Vec2[];

export type StatKey = 'thickness' | 'scatter' | 'range' | 'damage' | 'power' | 'duration';
export const STAT_KEYS: StatKey[] = ['thickness', 'scatter', 'range', 'damage', 'power', 'duration'];
export type Stats = Record<StatKey, number>;

/** Outer bounds plus thin inner walls that split it into rooms connected by door gaps. */
export interface Room { center: Vec2; bounds: Poly; walls: Poly[] }

export type Difficulty = 'easy' | 'medium' | 'hard';
export interface Player {
  id: string; name: string; isBot: boolean; difficulty?: Difficulty;
  pos: Vec2; /** direction the gas travels, radians */ aim: number;
  hp: number; alive: boolean; stats: Stats; unspent: number; diedAt: number | null; score: number;
}
export interface Cloud {
  id: number; owner: string; pos: Vec2; dir: Vec2; radius: number; dps: number; power: number;
  travelled: number; range: number; age: number; life: number; alive: boolean;
}
export interface Particle { owner: string; pos: Vec2; vel: Vec2; radius: number; dps: number; age: number; life: number; alive: boolean }
