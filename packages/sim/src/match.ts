import type { Difficulty, Player, Room, Stats, Vec2 } from './types';
import { createRng, type Rng } from './rng';
import { generateRoom, spawnPoints } from './roomgen';
import { transformForNewMove } from './room';
import { validatePlan } from './movement';
import { emptyStats, grantPoints, allocate, autoAllocate } from './stats';
import { createResolution, type Resolution } from './resolve';
import { roundPoints } from './scoring';
import { MAX_HP, ROUNDS, SUDDEN_DEATH_MOVE, SUDDEN_DEATH_STEP } from './config';
import { DEATH_SEQ_SCALE } from './resolve';

export type Phase = 'skills' | 'dark' | 'resolve' | 'roundEnd' | 'matchEnd';
export interface MatchConfig { seed: number; players: { id: string; name: string; isBot: boolean; difficulty?: Difficulty }[] }
export interface PlanInput { pos: Vec2; aim: number }
export interface MatchState {
  config: MatchConfig; phase: Phase; round: number; move: number; moveSeq: number;
  room: Room; players: Player[]; rng: Rng; resolution: Resolution | null;
  plans: Record<string, PlanInput>; roundHistory: Record<string, number>[];
  /** positions everyone could see at the last reveal (after the room transform) */ lastSeen: Record<string, Vec2>;
  /** start positions for the current dark phase */ moveStart: Record<string, Vec2>;
}

const find = (s: MatchState, id: string) => {
  const p = s.players.find(q => q.id === id);
  if (!p) throw new Error(`unknown player ${id}`);
  return p;
};

export function startMatch(cfg: MatchConfig): MatchState {
  if (cfg.players.length < 2 || cfg.players.length > 8) throw new Error('a match needs 2-8 players');
  const rng = createRng(cfg.seed);
  const s: MatchState = {
    config: cfg, phase: 'skills', round: 0, move: 0, moveSeq: 0, room: generateRoom(rng),
    players: cfg.players.map(p => ({
      id: p.id, name: p.name, isBot: p.isBot, difficulty: p.difficulty, pos: { x: 0, y: 0 }, aim: 0,
      hp: MAX_HP, alive: true, stats: emptyStats(), unspent: 0, diedAt: null, score: 0,
    })),
    rng, resolution: null, plans: {}, roundHistory: [], lastSeen: {}, moveStart: {},
  };
  startRound(s);
  return s;
}

function startRound(s: MatchState) {
  s.round++;
  s.move = 1;
  s.moveSeq++;
  s.room = generateRoom(s.rng);
  const spawns = spawnPoints(s.room, s.players.length, s.rng);
  s.players.forEach((p, i) => {
    Object.assign(p, { pos: spawns[i], aim: s.rng.range(0, Math.PI * 2), hp: MAX_HP, alive: true, stats: emptyStats(), diedAt: null });
    p.unspent = grantPoints(p.stats);
  });
  s.resolution = null;
  s.plans = {};
  beginSkills(s);
}

function beginSkills(s: MatchState) {
  s.phase = 'skills';
  if (skillsPending(s).length === 0) endSkills(s);
}

export function skillsPending(s: MatchState): string[] {
  return s.players.filter(p => p.alive && p.unspent > 0).map(p => p.id);
}

export function allocateSkills(s: MatchState, id: string, alloc: Partial<Stats>): void {
  const p = find(s, id);
  const r = allocate(p.stats, p.unspent, alloc);
  p.stats = r.stats;
  p.unspent = r.unspent;
}

export function endSkills(s: MatchState): void {
  for (const p of s.players) if (p.alive && p.unspent > 0) Object.assign(p, autoAllocate(p.stats, p.unspent, s.rng));
  const alive = s.players.filter(p => p.alive);
  const t = transformForNewMove(s.room, alive.map(p => p.pos), s.rng);
  s.room = t.room;
  alive.forEach((p, i) => { p.pos = t.positions[i]; });
  s.lastSeen = Object.fromEntries(s.players.map(p => [p.id, { ...p.pos }]));
  s.moveStart = Object.fromEntries(alive.map(p => [p.id, { ...p.pos }]));
  s.plans = {};
  s.phase = 'dark';
}

export function submitPlan(s: MatchState, id: string, plan: PlanInput): void {
  const p = find(s, id);
  if (!p.alive || s.phase !== 'dark') return;
  const start = s.moveStart[id] ?? p.pos;
  s.plans[id] = { pos: validatePlan(s.room, start, plan) ? plan.pos : start, aim: plan.aim };
}

export function beginResolve(s: MatchState): void {
  for (const p of s.players) {
    if (!p.alive) continue;
    const plan = s.plans[p.id];
    if (plan) { p.pos = plan.pos; p.aim = plan.aim; }
  }
  s.resolution = createResolution(s.players, s.moveSeq, s.room);
  s.phase = 'resolve';
}

export function finishResolve(s: MatchState): void {
  if (!s.resolution?.done) throw new Error('resolution not finished');
  if (s.move >= SUDDEN_DEATH_MOVE) {
    const dmg = SUDDEN_DEATH_STEP * (s.move - SUDDEN_DEATH_MOVE + 1);
    for (const p of s.players) {
      if (!p.alive) continue;
      p.hp -= dmg;
      if (p.hp <= 0) { p.hp = 0; p.alive = false; p.diedAt = s.moveSeq * DEATH_SEQ_SCALE + s.resolution.tick + 1; }
    }
  }
  const alive = s.players.filter(p => p.alive);
  if (alive.length <= 1) {
    const pts = roundPoints(s.players);
    for (const p of s.players) p.score += pts[p.id];
    s.roundHistory.push(pts);
    s.phase = 'roundEnd';
    return;
  }
  s.move++;
  s.moveSeq++;
  for (const p of alive) p.unspent = grantPoints(p.stats);
  beginSkills(s);
}

export function nextRound(s: MatchState): void {
  if (s.round >= ROUNDS) { s.phase = 'matchEnd'; return; }
  startRound(s);
}

/** Highest total; ties broken by better placement in the last round; still tied → all. */
export function winners(s: MatchState): string[] {
  const best = Math.max(...s.players.map(p => p.score));
  let top = s.players.filter(p => p.score === best);
  const last = s.roundHistory[s.roundHistory.length - 1];
  if (top.length > 1 && last) {
    const b = Math.max(...top.map(p => last[p.id]));
    top = top.filter(p => last[p.id] === b);
  }
  return top.map(p => p.id);
}
