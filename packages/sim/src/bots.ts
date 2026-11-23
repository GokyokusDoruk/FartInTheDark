import { STAT_KEYS, type StatKey, type Stats, type Vec2 } from './types';
import type { MatchState, PlanInput } from './match';
import { MAX_STAT, DT, MOVE_SPEED } from './config';
import { stepMove } from './movement';
import { angleOf, dist, fromAngle, sub } from './vec';

const PRIORITY: StatKey[] = ['damage', 'thickness', 'range', 'duration', 'power', 'scatter'];

export function botAllocate(s: MatchState, id: string): Partial<Stats> {
  const p = s.players.find(q => q.id === id)!;
  const out: Partial<Stats> = {};
  const lvl = (k: StatKey) => p.stats[k] + (out[k] ?? 0);
  let left = p.unspent;
  let i = 0;
  while (left > 0 && STAT_KEYS.some(k => lvl(k) < MAX_STAT)) {
    const k = p.difficulty === 'easy' || !p.difficulty ? s.rng.pick(STAT_KEYS) : PRIORITY[i++ % PRIORITY.length];
    if (lvl(k) >= MAX_STAT) continue;
    out[k] = (out[k] ?? 0) + 1;
    left--;
  }
  return out;
}

/** Walk from start in a direction for `metres`, respecting walls (always a valid, reachable plan). */
function walk(s: MatchState, start: Vec2, angle: number, metres: number): Vec2 {
  let pos = start;
  const steps = Math.round(metres / (MOVE_SPEED * DT));
  const dir = fromAngle(angle);
  for (let i = 0; i < steps; i++) pos = stepMove(s.room, pos, dir, DT);
  return pos;
}

export function botPlan(s: MatchState, id: string): PlanInput {
  const me = s.players.find(q => q.id === id)!;
  const start = s.moveStart[id] ?? me.pos;
  const rng = s.rng;
  const enemies = s.players.filter(q => q.alive && q.id !== id).map(q => s.lastSeen[q.id]).filter(Boolean);
  const nearest = enemies.sort((a, b) => dist(a, start) - dist(b, start))[0];
  const d = me.difficulty ?? 'easy';
  if (d === 'easy' || !nearest) {
    const pos = walk(s, start, rng.range(0, Math.PI * 2), rng.range(0, 5));
    return { pos, aim: rng.range(0, Math.PI * 2) };
  }
  if (d === 'medium') {
    const pos = walk(s, start, rng.range(0, Math.PI * 2), rng.range(0, 4));
    return { pos, aim: angleOf(sub(nearest, start)) + rng.range(-0.3, 0.3) };
  }
  // hard: sidestep (never straight back, so clouds don't meet head-on), then lead the
  // target: assume it also moves 1-3 m sideways from where it was last seen
  const toEnemy = angleOf(sub(nearest, start));
  const side = rng.next() < 0.5 ? 1 : -1;
  const pos = walk(s, start, toEnemy + side * rng.range(1.9, 2.6), rng.range(1.5, 4));
  const lead = rng.range(1, 3) * (rng.next() < 0.5 ? 1 : -1);
  const guess = { x: nearest.x + Math.cos(toEnemy + Math.PI / 2) * lead, y: nearest.y + Math.sin(toEnemy + Math.PI / 2) * lead };
  return { pos, aim: angleOf(sub(guess, pos)) };
}
