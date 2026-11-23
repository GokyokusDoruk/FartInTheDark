import { emptyStats, rectPoly, DT, MAX_HP, v, angleOf, sub, type Player, type Room, type Stats, type Vec2, type MatchState } from '../src';

export function mkPlayer(id: string, pos: Vec2, aim: number, stats: Stats = emptyStats()): Player {
  return { id, name: id, isBot: false, pos, aim, hp: MAX_HP, alive: true, stats, unspent: 0, diedAt: null, score: 0 };
}
export const rect = rectPoly;
export function run(fn: () => void, seconds: number) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) fn();
}
export const empty: Room = { center: v(7, 10), bounds: rectPoly(0, 0, 14, 20), walls: [], pipes: [], zones: [] };
export function aimAtOther(s: MatchState, p: Player): number {
  const o = s.players.find(q => q.alive && q.id !== p.id);
  return o ? angleOf(sub(o.pos, p.pos)) : p.aim;
}
