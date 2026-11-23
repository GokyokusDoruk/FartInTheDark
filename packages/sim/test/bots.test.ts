import { describe, it, expect } from 'vitest';
import {
  startMatch, endSkills, allocateSkills, submitPlan, beginResolve, finishResolve, nextRound, runResolution, winners,
  botAllocate, botPlan, validatePlan, STAT_KEYS, MAX_STAT, type Difficulty, type MatchState,
} from '../src';

const diffs: Difficulty[] = ['easy', 'medium', 'hard'];

function playBots(s: MatchState) {
  let guard = 0;
  while (s.phase !== 'matchEnd' && guard++ < 20_000) {
    if (s.phase === 'skills') { for (const p of s.players) if (p.alive && p.unspent) allocateSkills(s, p.id, botAllocate(s, p.id)); endSkills(s); }
    else if (s.phase === 'dark') { for (const p of s.players) if (p.alive) submitPlan(s, p.id, botPlan(s, p.id)); beginResolve(s); }
    else if (s.phase === 'resolve') { runResolution(s.resolution!, s.room, s.players, s.rng); finishResolve(s); }
    else nextRound(s);
  }
}

describe('bots', () => {
  it('always produce valid plans and allocations', () => {
    for (const d of diffs) for (let seed = 1; seed <= 20; seed++) {
      const s = startMatch({ seed, players: [{ id: 'X', name: 'X', isBot: true, difficulty: d }, { id: 'Y', name: 'Y', isBot: true, difficulty: 'easy' }] });
      const alloc = botAllocate(s, 'X');
      expect(STAT_KEYS.reduce((t, k) => t + (alloc[k] ?? 0), 0)).toBe(5);
      allocateSkills(s, 'X', alloc);
      expect(STAT_KEYS.every(k => s.players[0].stats[k] <= MAX_STAT)).toBe(true);
      endSkills(s);
      const plan = botPlan(s, 'X');
      expect(validatePlan(s.room, s.moveStart.X, plan)).toBe(true);
    }
  });
  it('hard beats easy most of the time', () => {
    let wins = 0;
    const N = 40;
    for (let seed = 1; seed <= N; seed++) {
      const s = startMatch({ seed, players: [{ id: 'H', name: 'H', isBot: true, difficulty: 'hard' }, { id: 'E', name: 'E', isBot: true, difficulty: 'easy' }] });
      playBots(s);
      expect(s.phase).toBe('matchEnd');
      if (winners(s).includes('H')) wins++;
    }
    expect(wins / N).toBeGreaterThan(0.6);
  }, 60_000);
});
