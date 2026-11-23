import { describe, it, expect } from 'vitest';
import {
  startMatch, allocateSkills, endSkills, submitPlan, beginResolve, finishResolve, nextRound, runResolution, winners, skillsPending,
  STAT_KEYS, MAX_STAT, type MatchState, type MatchConfig,
} from '../src';
import { aimAtOther } from './helpers';

const cfg: MatchConfig = { seed: 1, players: [{ id: 'A', name: 'A', isBot: false }, { id: 'B', name: 'B', isBot: true, difficulty: 'easy' }] };

function autoplay(s: MatchState) {
  let guard = 0;
  while (s.phase !== 'matchEnd' && guard++ < 10_000) {
    if (s.phase === 'skills') endSkills(s);
    else if (s.phase === 'dark') {
      for (const p of s.players) if (p.alive) submitPlan(s, p.id, { pos: p.pos, aim: aimAtOther(s, p) });
      beginResolve(s);
    } else if (s.phase === 'resolve') { runResolution(s.resolution!, s.room, s.players, s.rng); finishResolve(s); }
    else if (s.phase === 'roundEnd') nextRound(s);
  }
}

describe('match', () => {
  it('starts in skills with 5 points and full hp', () => {
    const s = startMatch(cfg);
    expect(s.phase).toBe('skills');
    expect(s.round).toBe(1);
    expect(s.players.every(p => p.unspent === 5 && p.hp === 100 && p.alive)).toBe(true);
  });
  it('rejects fewer than 2 or more than 8 players', () => {
    expect(() => startMatch({ seed: 1, players: [cfg.players[0]] })).toThrow();
    expect(() => startMatch({ seed: 1, players: Array.from({ length: 9 }, (_, i) => ({ id: 'p' + i, name: 'p', isBot: true })) })).toThrow();
  });
  it('endSkills auto-allocates and moves to dark, recording lastSeen', () => {
    const s = startMatch(cfg);
    allocateSkills(s, 'A', { damage: 5 });
    expect(skillsPending(s)).toEqual(['B']);
    endSkills(s);
    expect(s.phase).toBe('dark');
    expect(s.players.find(p => p.id === 'A')!.stats.damage).toBe(5);
    expect(s.players.find(p => p.id === 'B')!.unspent).toBe(0);
    expect(s.lastSeen.A).toEqual(s.players[0].pos);
  });
  it('invalid plan positions fall back to the start position', () => {
    const s = startMatch(cfg); endSkills(s);
    const start = { ...s.players[0].pos };
    submitPlan(s, 'A', { pos: { x: start.x + 100, y: start.y }, aim: 1 });
    beginResolve(s);
    expect(s.players[0].pos).toEqual(start);
    expect(s.players[0].aim).toBe(1);
  });
  it('plays a whole match with consistent scores', () => {
    const s = startMatch(cfg);
    autoplay(s);
    expect(s.phase).toBe('matchEnd');
    expect(s.roundHistory).toHaveLength(5);
    const total = s.roundHistory.flatMap(r => Object.values(r)).reduce((a, b) => a + b, 0);
    expect(s.players.reduce((t, p) => t + p.score, 0)).toBe(total);
    expect(winners(s).length).toBeGreaterThanOrEqual(1);
  });
  it('is deterministic for a seed', () => {
    const a = startMatch(cfg), b = startMatch(cfg);
    autoplay(a); autoplay(b);
    expect(a.players.map(p => p.score)).toEqual(b.players.map(p => p.score));
  });
  it('skips the skills phase when everyone is maxed', () => {
    const s = startMatch(cfg); endSkills(s);
    for (const p of s.players) { for (const k of STAT_KEYS) p.stats[k] = MAX_STAT; p.aim = Math.PI / 2; p.pos = { ...p.pos }; }
    // keep both alive: aim away from each other into nothing for a non-lethal move
    for (const p of s.players) submitPlan(s, p.id, { pos: p.pos, aim: p.id === 'A' ? 0 : Math.PI });
    for (const p of s.players) p.hp = 100_000;
    beginResolve(s); runResolution(s.resolution!, s.room, s.players, s.rng); finishResolve(s);
    expect(s.phase).toBe('dark');
    expect(s.move).toBe(2);
  });
  it('resets stats and hp on a new round', () => {
    const s = startMatch(cfg);
    allocateSkills(s, 'A', { damage: 5 });
    s.phase = 'roundEnd';
    nextRound(s);
    expect(s.round).toBe(2);
    expect(s.players.every(p => p.hp === 100 && p.alive && p.stats.damage === 0 && p.unspent === 5)).toBe(true);
  });
});
