import { describe, it, expect } from 'vitest';
import { makeHost, respond } from './helpers';
import { DARK_MS, EMPTY_CLOSE_MS } from '../src';

function inDark(seed = 4) {
  const h = makeHost(seed);
  const a = h.enter('A');
  const b = h.enter('B');
  h.host.handle(a.id, { t: 'addBot', difficulty: 'easy' });
  h.host.handle(a.id, { t: 'start' });
  h.host.handle(a.id, { t: 'skills', alloc: { damage: 5 } });
  h.host.handle(b.id, { t: 'skills', alloc: { damage: 5 } });
  expect(h.lastView(a.id).phase).toBe('dark');
  return { h, a, b };
}

describe('RoomHost resilience', () => {
  it('a dropped player is not waited for; the bot logic plays them', () => {
    const { h, a, b } = inDark();
    h.host.disconnected(a.id);
    expect(h.lastView(b.id).players.find(p => p.id === a.id)!.connected).toBe(false);
    h.host.handle(b.id, { t: 'plan', pos: h.lastView(b.id).me!.start, aim: 0 });
    expect(h.lastView(b.id).phase).toBe('resolve');
  });

  it('a dropped player who returns in time rejoins the dark phase with the time left', () => {
    const { h, a } = inDark();
    h.host.disconnected(a.id);
    h.clock.advance(2000);
    const again = h.host.join('A', a.token);
    expect(again).toEqual({ ok: true, id: a.id, token: a.token });
    h.host.connected(a.id);
    const v = h.lastView(a.id);
    expect(v.phase).toBe('dark');
    expect(Math.abs(v.remainingMs! - (DARK_MS - 2000))).toBeLessThanOrEqual(50);
    expect(v.players.find(p => p.id === a.id)!.connected).toBe(true);
  });

  it('a player who returns too late lands in the reveal', () => {
    const { h, a } = inDark();
    h.host.disconnected(a.id);
    h.clock.advance(DARK_MS);
    h.host.join('A', a.token);
    h.host.connected(a.id);
    expect(h.lastView(a.id).phase).toBe('resolve');
  });

  it('leaving mid-match turns the player into a bot and passes the host role', () => {
    const { h, a, b } = inDark();
    h.host.handle(a.id, { t: 'leave' });
    const v = h.lastView(b.id);
    expect(v.hostId).toBe(b.id);
    const m = v.members.find(x => x.id === a.id)!;
    expect(m.isBot).toBe(true);
    expect(m.name).toBe('A (bot)');
    expect(v.players.find(p => p.id === a.id)!.isBot).toBe(true);
    // the old token no longer takes the seat back
    const r = h.host.join('A', a.token);
    expect(r).toEqual({ ok: false, code: 'matchRunning' });
    h.host.handle(b.id, { t: 'plan', pos: v.me!.start, aim: 0 });
    expect(h.lastView(b.id).phase).toBe('resolve');
  });

  it('closes 60 s after the last human disconnects, unless someone returns', () => {
    const { h, a, b } = inDark();
    h.host.disconnected(a.id);
    h.host.disconnected(b.id);
    h.clock.advance(EMPTY_CLOSE_MS - 1000);
    expect(h.host.closed()).toBe(false);
    h.host.join('B', b.token);
    h.host.connected(b.id);
    h.clock.advance(EMPTY_CLOSE_MS);
    expect(h.host.closed()).toBe(false);
    h.host.disconnected(b.id);
    h.clock.advance(EMPTY_CLOSE_MS - 1);
    expect(h.host.closed()).toBe(false);
    h.clock.advance(1);
    expect(h.host.closed()).toBe(true);
    expect(h.host.join('B', b.token)).toEqual({ ok: false, code: 'roomNotFound' });
    expect(h.host.nextDeadline()).toBeNull();
  });

  it('a room nobody ever joins closes after 60 s', () => {
    const h = makeHost();
    expect(h.host.nextDeadline()).toBe(h.clock.t + EMPTY_CLOSE_MS);
    h.clock.advance(EMPTY_CLOSE_MS);
    expect(h.host.closed()).toBe(true);
  });

  it('nextDeadline includes the empty-room close', () => {
    const h = makeHost();
    const a = h.enter('A');
    expect(h.host.nextDeadline()).toBeNull();
    h.host.disconnected(a.id);
    expect(h.host.nextDeadline()).toBe(h.clock.t + EMPTY_CLOSE_MS);
  });

  it('a restored snapshot behaves exactly like the original in every phase', () => {
    const h = makeHost(21);
    const a = h.enter('A').id;
    const b = h.enter('B').id;
    h.host.handle(a, { t: 'addBot', difficulty: 'hard' });
    h.host.handle(a, { t: 'start' });
    const seen = new Map<string, string>();
    const phases = new Set<string>();
    for (let i = 0; i < 4000 && h.lastView(a).phase !== 'matchEnd'; i++) {
      if (i % 7 === 0) {
        const f = h.forkHost();
        const s1 = new Map(seen), s2 = new Map(seen);
        const frozen = new Map([a, b].map(id => [id, h.lastView(id)]));
        respond(h, [a, b], a, s1, i, undefined, id => frozen.get(id)!);
        respond(f, [a, b], a, s2, i, undefined, id => frozen.get(id)!);
        for (const id of [a, b]) {
          expect(JSON.stringify(f.host.viewFor(id))).toBe(JSON.stringify(h.host.viewFor(id)));
        }
        h.clock.advance(3000);
        f.clock.advance(3000);
        for (const id of [a, b]) expect(JSON.stringify(f.host.viewFor(id))).toBe(JSON.stringify(h.host.viewFor(id)));
        phases.add(h.lastView(a).phase);
        for (const [k, v] of s1) seen.set(k, v);
        continue;
      }
      respond(h, [a, b], a, seen, i);
      h.clock.advance(100);
    }
    expect([...phases].sort()).toEqual(expect.arrayContaining(['dark', 'resolve', 'skills']));
  });

  it('the host role never sticks to a leaver turned bot', () => {
    const { h, a, b } = inDark();
    h.host.disconnected(b.id);
    h.host.handle(a.id, { t: 'leave' });
    h.host.join('B', b.token);
    h.host.connected(b.id);
    expect(h.lastView(b.id).hostId).toBe(b.id);
  });
});

describe('RoomHost lobby hygiene', () => {
  it('the host can remove an offline human from the lobby, not an online one', () => {
    const h = makeHost();
    const a = h.enter('A');
    const b = h.enter('B');
    const c = h.enter('C');
    h.host.disconnected(b.id);
    h.host.handle(a.id, { t: 'removeBot', id: c.id });
    expect(h.lastView(a.id).members).toHaveLength(3);
    h.host.handle(a.id, { t: 'removeBot', id: b.id });
    expect(h.lastView(a.id).members.map(m => m.id)).toEqual([a.id, c.id]);
  });

  it('offline humans are dropped from the lobby when the match starts', () => {
    const h = makeHost();
    const a = h.enter('A');
    const b = h.enter('B');
    h.enter('C');
    h.host.disconnected(b.id);
    h.host.handle(a.id, { t: 'start' });
    const v = h.lastView(a.id);
    expect(v.phase).toBe('skills');
    expect(v.players.map(p => p.name)).toEqual(['A', 'C']);
  });

  it('start still needs two after dropping offline humans', () => {
    const h = makeHost();
    const a = h.enter('A');
    const b = h.enter('B');
    h.host.disconnected(b.id);
    h.host.handle(a.id, { t: 'start' });
    expect(h.lastError(a.id)).toBe('needTwo');
  });
});
