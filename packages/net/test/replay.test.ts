import { describe, it, expect } from 'vitest';
import { makeHost, playOut } from './helpers';
import { simulateReplay } from '../src';

describe('simulateReplay', () => {
  it('reproduces the server outcome exactly', () => {
    let checked = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const h = makeHost(seed);
      const a = h.enter('A').id;
      const b = h.enter('B').id;
      h.host.handle(a, { t: 'addBot', difficulty: 'hard' });
      h.host.handle(a, { t: 'start' });
      playOut(h, [a, b], a, (id, v) => {
        if (id !== a || v.phase !== 'resolve') return;
        const sim = simulateReplay(v.replay!);
        expect(sim.ticks).toBe(v.replay!.ticks);
        for (const after of v.replay!.after) {
          const p = sim.players.find(q => q.id === after.id)!;
          expect([p.hp, p.alive, p.diedAt]).toEqual([after.hp, after.alive, after.diedAt]);
        }
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(100);
  });
});
