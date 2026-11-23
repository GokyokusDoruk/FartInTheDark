export type Vec2 = { x: number; y: number };
/** Convex polygon, counter-clockwise. */
export type Poly = Vec2[];

export type StatKey = 'thickness' | 'scatter' | 'range' | 'damage' | 'power' | 'duration';
export const STAT_KEYS: StatKey[] = ['thickness', 'scatter', 'range', 'damage', 'power', 'duration'];
export type Stats = Record<StatKey, number>;
