import { describe, it, expect } from 'vitest';
import { makeHost, playOut, respond } from './helpers';
import { SKILL_MS, DARK_MS, ROUND_END_MS, REPLAY_TIMEOUT } from '../src';

function twoPlusBot(seed = 3, diff: 'easy' | 'hard' = 'easy') {
  const h = makeHost(seed);
  const a = h.enter('A');
  const b = h.enter('B');
  h.host.handle(a.id, { t: 'addBot', difficulty: diff });
  h.host.handle(a.id, { t: 'start' });
  return { h, a: a.id, b: b.id };
}
type X = ReturnType<typeof twoPlusBot>;
const toDark = (x: X) => {
  x.h.host.handle(x.a, { t: 'skills', alloc: { damage: 5 } });
  x.h.host.handle(x.b, { t: 'skills', alloc: { range: 5 } });
};
const planAll = (x: X, aim: number) => {
  for (const id of [x.a, x.b]) x.h.host.handle(id, { t: 'plan', pos: x.h.lastView(id).me!.start, aim });
};

describe('RoomHost match flow', () => {
  it('skills end as soon as every connected human is done', () => {
    const x = twoPlusBot();
    expect(x.h.lastView(x.a).phase).toBe('skills');
    expect(x.h.lastView(x.a).remainingMs).toBe(SKILL_MS);
    x.h.host.handle(x.a, { t: 'skills', alloc: { damage: 5 } });
    expect(x.h.lastView(x.a).phase).toBe('skills');
    x.h.host.handle(x.b, { t: 'skills', alloc: { range: 5 } });
    const v = x.h.lastView(x.a);
    expect(v.phase).toBe('dark');
    expect(v.remainingMs).toBe(DARK_MS);
    expect(v.me!.stats.damage).toBe(5);
  });

  it('skills time out and auto-allocate the idle player', () => {
    const x = twoPlusBot();
    x.h.host.handle(x.a, { t: 'skills', alloc: { damage: 5 } });
    x.h.clock.advance(SKILL_MS - 1);
    expect(x.h.lastView(x.b).phase).toBe('skills');
    x.h.clock.advance(1);
    const v = x.h.lastView(x.b);
    expect(v.phase).toBe('dark');
    expect(v.me!.unspent).toBe(0);
  });

  it('dark ends at its deadline even if a connected player never plans', () => {
    const x = twoPlusBot();
    toDark(x);
    x.h.host.handle(x.a, { t: 'plan', pos: x.h.lastView(x.a).me!.start, aim: 0 });
    x.h.clock.advance(DARK_MS - 1);
    expect(x.h.lastView(x.a).phase).toBe('dark');
    x.h.clock.advance(1);
    const v = x.h.lastView(x.a);
    expect(v.phase).toBe('resolve');
    const bStart = x.h.lastView(x.b).me!.start;
    expect(v.replay!.players.find(p => p.id === x.b)!.pos).toEqual(bStart);
  });

  it("never leaks another player's plan or stats before the reveal", () => {
    const x = twoPlusBot();
    toDark(x);
    const vb = x.h.lastView(x.b);
    const secret = { x: vb.me!.start.x + 0.123457, y: vb.me!.start.y + 0.234567 };
    x.h.host.handle(x.b, { t: 'plan', pos: secret, aim: 1.234567 });
    const before = x.h.out.get(x.a)!.map(m => JSON.stringify(m)).join('\n');
    for (const s of ['1.234567', String(secret.x), String(secret.y), '"range":5']) expect(before).not.toContain(s);
    const va = x.h.lastView(x.a);
    expect(va.phase).toBe('dark');
    expect(va.replay).toBeNull();
    for (const p of va.players) expect(p).not.toHaveProperty('stats');
    x.h.host.handle(x.a, { t: 'plan', pos: x.h.lastView(x.a).me!.start, aim: 0 });
    const vr = x.h.lastView(x.a);
    expect(vr.phase).toBe('resolve');
    expect(vr.replay!.players.find(p => p.id === x.b)!.aim).toBe(1.234567);
  });

  it('resolve carries authoritative results', () => {
    const x = twoPlusBot();
    toDark(x);
    planAll(x, 0.7);
    const v = x.h.lastView(x.a);
    expect(v.replay!.ticks).toBeGreaterThan(0);
    for (const after of v.replay!.after) {
      const pub = v.players.find(p => p.id === after.id)!;
      expect(pub.hp).toBe(after.hp);
      expect(pub.alive).toBe(after.alive);
    }
  });

  it('an impossible plan falls back to the start position', () => {
    const x = twoPlusBot();
    toDark(x);
    const start = x.h.lastView(x.a).me!.start;
    x.h.host.handle(x.a, { t: 'plan', pos: { x: start.x + 40, y: start.y }, aim: 0 });
    x.h.host.handle(x.b, { t: 'plan', pos: x.h.lastView(x.b).me!.start, aim: 0 });
    expect(x.h.lastView(x.a).replay!.players.find(p => p.id === x.a)!.pos).toEqual(start);
  });

  it('resolve waits for replayDone from connected humans', () => {
    const x = twoPlusBot();
    toDark(x);
    planAll(x, 2);
    const seq = x.h.lastView(x.a).moveSeq;
    x.h.host.handle(x.a, { t: 'replayDone', moveSeq: seq });
    x.h.host.handle(x.b, { t: 'replayDone', moveSeq: seq + 7 });
    expect(x.h.lastView(x.a).phase).toBe('resolve');
    x.h.host.handle(x.b, { t: 'replayDone', moveSeq: seq });
    expect(x.h.lastView(x.a).phase).not.toBe('resolve');
  });

  it('resolve times out when replayDone never comes', () => {
    const x = twoPlusBot(9);
    toDark(x);
    planAll(x, 2);
    const ticks = x.h.lastView(x.a).replay!.ticks;
    x.h.clock.advance(REPLAY_TIMEOUT(ticks) - 1);
    expect(x.h.lastView(x.a).phase).toBe('resolve');
    x.h.clock.advance(1);
    expect(x.h.lastView(x.a).phase).not.toBe('resolve');
  });

  it('round end advances after 10 s, or at once when the host says next', () => {
    const h = makeHost(5);
    const a = h.enter('A').id;
    const b = h.enter('B').id;
    h.host.handle(a, { t: 'start' });
    const seen = new Map<string, string>();
    for (let i = 0; i < 20000 && h.lastView(a).phase !== 'roundEnd'; i++) {
      respond(h, [a, b], 'nobody', seen, i);
      if (h.lastView(a).phase !== 'roundEnd') h.clock.advance(100);
    }
    expect(h.lastView(a).phase).toBe('roundEnd');
    expect(h.lastView(a).roundHistory).toHaveLength(1);
    h.host.handle(b, { t: 'next' });
    expect(h.lastView(a).phase).toBe('roundEnd');
    h.clock.advance(ROUND_END_MS - 1);
    expect(h.lastView(a).phase).toBe('roundEnd');
    h.clock.advance(1);
    expect(h.lastView(a).round).toBe(2);
    for (let i = 0; i < 20000 && h.lastView(a).phase !== 'roundEnd'; i++) {
      respond(h, [a, b], 'nobody', seen, i);
      if (h.lastView(a).phase !== 'roundEnd') h.clock.advance(100);
    }
    h.host.handle(a, { t: 'next' });
    expect(h.lastView(a).round).toBe(3);
  });

  it('plays a full match with two humans and two hard bots, then rematches', () => {
    const h = makeHost(11);
    const a = h.enter('A').id;
    const b = h.enter('B').id;
    h.host.handle(a, { t: 'addBot', difficulty: 'hard' });
    h.host.handle(a, { t: 'addBot', difficulty: 'hard' });
    h.host.handle(a, { t: 'start' });
    playOut(h, [a, b], a);
    const v = h.lastView(b);
    expect(v.phase).toBe('matchEnd');
    expect(v.roundHistory).toHaveLength(5);
    expect(v.winners!.length).toBeGreaterThan(0);
    expect(v.remainingMs).toBeNull();
    h.host.handle(b, { t: 'start' });
    expect(h.lastError(b)).toBe('notHost');
    h.host.handle(a, { t: 'start' });
    const r = h.lastView(b);
    expect(r.round).toBe(1);
    expect(r.players.every(p => p.score === 0)).toBe(true);
  });
});
