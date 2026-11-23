export type Vec2 = { x: number; y: number };
/** Convex polygon, counter-clockwise. */
export type Poly = Vec2[];

export type StatKey = 'thickness' | 'scatter' | 'range' | 'damage' | 'power' | 'duration';
export const STAT_KEYS: StatKey[] = ['thickness', 'scatter', 'range', 'damage', 'power', 'duration'];
export type Stats = Record<StatKey, number>;

export interface Pipe { inlet: Vec2; outlet: Vec2; outDir: Vec2; radius: number }
export type ZoneKind = 'grow' | 'shrink' | 'redirect';
export interface Zone { kind: ZoneKind; center: Vec2; radius: number; turn?: number }
export interface Room { center: Vec2; bounds: Poly; walls: Poly[]; pipes: Pipe[]; zones: Zone[] }
