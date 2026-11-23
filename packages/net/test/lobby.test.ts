import { describe, it, expect } from 'vitest';
import { makeHost } from './helpers';

describe('RoomHost lobby', () => {
  it('first joiner hosts; welcome carries token and code', () => {
    const h = makeHost();
    const a = h.enter('A');
    const w = h.msgs(a.id).find(m => m.t === 'welcome');
    expect(w).toEqual({ t: 'welcome', you: a.id, token: a.token, code: 'ABCDE' });
    const b = h.enter('B');
    const v = h.lastView(b.id);
    expect(v.phase).toBe('lobby');
    expect(v.hostId).toBe(a.id);
    expect(v.members.map(m => m.name)).toEqual(['A', 'B']);
    expect(h.lastView(a.id).members).toHaveLength(2);
  });

  it('needs two participants to start; a bot counts', () => {
    const h = makeHost();
    const a = h.enter('A');
    h.host.handle(a.id, { t: 'start' });
    expect(h.lastError(a.id)).toBe('needTwo');
    expect(h.lastView(a.id).phase).toBe('lobby');
    h.host.handle(a.id, { t: 'addBot', difficulty: 'hard' });
    expect(h.lastView(a.id).members[1]).toMatchObject({ isBot: true, name: 'Bot 1', difficulty: 'hard' });
    h.host.handle(a.id, { t: 'start' });
    expect(h.lastView(a.id).phase).toBe('skills');
  });

  it('only the host may add bots or start', () => {
    const h = makeHost();
    h.enter('A');
    const b = h.enter('B');
    h.host.handle(b.id, { t: 'addBot', difficulty: 'easy' });
    expect(h.lastError(b.id)).toBe('notHost');
    h.host.handle(b.id, { t: 'start' });
    expect(h.lastError(b.id)).toBe('notHost');
    expect(h.lastView(b.id).members).toHaveLength(2);
    expect(h.lastView(b.id).phase).toBe('lobby');
  });

  it('caps the room at 8', () => {
    const h = makeHost();
    const a = h.enter('A');
    for (let i = 0; i < 7; i++) h.host.handle(a.id, { t: 'addBot', difficulty: 'easy' });
    expect(h.lastView(a.id).members).toHaveLength(8);
    expect(h.host.join('Z')).toEqual({ ok: false, code: 'roomFull' });
    h.host.handle(a.id, { t: 'addBot', difficulty: 'easy' });
    expect(h.lastError(a.id)).toBe('roomFull');
    expect(h.lastView(a.id).members).toHaveLength(8);
  });

  it('host role passes on when the host leaves or drops', () => {
    const h = makeHost();
    const a = h.enter('A');
    const b = h.enter('B');
    const c = h.enter('C');
    h.host.handle(a.id, { t: 'leave' });
    expect(h.lastView(b.id).hostId).toBe(b.id);
    expect(h.lastView(b.id).members.map(m => m.id)).toEqual([b.id, c.id]);
    h.host.disconnected(b.id);
    expect(h.lastView(c.id).hostId).toBe(c.id);
  });

  it('a valid token reconnects to the same member; a wrong one does not', () => {
    const h = makeHost();
    const a = h.enter('A');
    h.host.disconnected(a.id);
    const again = h.host.join('A', a.token);
    expect(again).toEqual({ ok: true, id: a.id, token: a.token });
    const other = h.host.join('A', 'nope');
    expect(other.ok && other.id).not.toBe(a.id);
  });

  it('rejects tokenless joins while a match runs', () => {
    const h = makeHost();
    const a = h.enter('A');
    h.host.handle(a.id, { t: 'addBot', difficulty: 'easy' });
    h.host.handle(a.id, { t: 'start' });
    expect(h.host.join('Late')).toEqual({ ok: false, code: 'matchRunning' });
  });

  it('removeBot removes bots only', () => {
    const h = makeHost();
    const a = h.enter('A');
    const b = h.enter('B');
    h.host.handle(a.id, { t: 'addBot', difficulty: 'easy' });
    const bot = h.lastView(a.id).members.find(m => m.isBot)!;
    h.host.handle(a.id, { t: 'removeBot', id: b.id });
    expect(h.lastView(a.id).members).toHaveLength(3);
    h.host.handle(a.id, { t: 'removeBot', id: bot.id });
    expect(h.lastView(a.id).members.map(m => m.id)).toEqual([a.id, b.id]);
  });

  it('cleans hostile names', () => {
    const h = makeHost();
    const a = h.enter('<b>' + 'x'.repeat(5000));
    expect(h.lastView(a.id).members[0].name).toHaveLength(14);
  });
});
