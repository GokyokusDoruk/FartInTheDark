import { describe, it, expect, beforeEach } from 'vitest';
import type { ServerMsg } from '@fitd/net';
import { connectRoom } from '../src/net/wsTransport';

class FakeWS {
  static all: FakeWS[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) { FakeWS.all.push(this); }
  send(d: string) { this.sent.push(d); }
  close() { this.readyState = 3; this.onclose?.(); }
  // test helpers
  open() { this.readyState = 1; this.onopen?.(); }
  recv(m: ServerMsg) { this.onmessage?.({ data: JSON.stringify(m) }); }
  drop() { this.readyState = 3; this.onclose?.(); }
}

function memStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), map: m };
}

function setup() {
  FakeWS.all = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const storage = memStorage();
  const statuses: string[] = [];
  const got: ServerMsg[] = [];
  const t = connectRoom('ABCDE', 'Ay şe', {
    WebSocket: FakeWS as unknown as typeof WebSocket,
    storage: storage as unknown as Storage,
    setTimeout: ((fn: () => void, ms: number) => { timers.push({ fn, ms }); return 0; }) as unknown as typeof setTimeout,
  });
  t.onMessage(m => got.push(m));
  t.onStatus!(s => statuses.push(s));
  const runTimer = () => { const x = timers.shift()!; x.fn(); return x.ms; };
  return { t, storage, statuses, got, timers, runTimer, ws: () => FakeWS.all[FakeWS.all.length - 1] };
}

describe('connectRoom', () => {
  beforeEach(() => { FakeWS.all = []; });

  it('connects with the name and stores the token from welcome', () => {
    const s = setup();
    expect(s.ws().url).toMatch(/\/api\/rooms\/ABCDE\/ws\?name=Ay%20%C5%9Fe$/);
    s.ws().open();
    s.ws().recv({ t: 'welcome', you: 'p1', token: 'TOK123', code: 'ABCDE' });
    expect(s.storage.getItem('fitd.token.ABCDE')).toBe('TOK123');
    expect(s.got[0]).toMatchObject({ t: 'welcome' });
    s.t.send({ t: 'start' });
    expect(s.ws().sent).toEqual(['{"t":"start"}']);
  });

  it('reuses a stored token on the first connection', () => {
    FakeWS.all = [];
    const storage = memStorage();
    storage.setItem('fitd.token.ABCDE', 'OLD');
    connectRoom('ABCDE', 'A', { WebSocket: FakeWS as unknown as typeof WebSocket, storage: storage as unknown as Storage });
    expect(FakeWS.all[0].url).toContain('&token=OLD');
  });

  it('reconnects with the token after an unexpected close, with backoff', () => {
    const s = setup();
    s.ws().open();
    s.ws().recv({ t: 'welcome', you: 'p1', token: 'TOK', code: 'ABCDE' });
    s.ws().drop();
    expect(s.statuses).toContain('reconnecting');
    expect(s.runTimer()).toBe(1000);
    expect(s.ws().url).toContain('&token=TOK');
    s.ws().open();
    expect(s.statuses[s.statuses.length - 1]).toBe('online');
  });

  it('gives up after 5 failed attempts', () => {
    const s = setup();
    s.ws().open();
    s.ws().drop();
    const delays: number[] = [];
    for (let i = 0; i < 5; i++) { delays.push(s.runTimer()); s.ws().drop(); }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 8000]);
    expect(s.statuses[s.statuses.length - 1]).toBe('lost');
    expect(s.timers).toHaveLength(0);
  });

  it('does not reconnect after a server error', () => {
    const s = setup();
    s.ws().open();
    s.ws().recv({ t: 'error', code: 'roomNotFound' });
    s.ws().drop();
    expect(s.timers).toHaveLength(0);
    expect(s.got[0]).toEqual({ t: 'error', code: 'roomNotFound' });
  });

  it('leave + close forgets the token and does not reconnect', () => {
    const s = setup();
    s.ws().open();
    s.ws().recv({ t: 'welcome', you: 'p1', token: 'TOK', code: 'ABCDE' });
    s.t.send({ t: 'leave' });
    s.t.close();
    expect(s.storage.getItem('fitd.token.ABCDE')).toBeNull();
    expect(s.timers).toHaveLength(0);
  });

  it('buffers messages until a listener is set', () => {
    FakeWS.all = [];
    const t = connectRoom('ABCDE', 'A', { WebSocket: FakeWS as unknown as typeof WebSocket, storage: memStorage() as unknown as Storage });
    FakeWS.all[0].open();
    FakeWS.all[0].recv({ t: 'welcome', you: 'p1', token: 'T', code: 'ABCDE' });
    const got: ServerMsg[] = [];
    t.onMessage(m => got.push(m));
    expect(got).toHaveLength(1);
  });

  it('queues messages while reconnecting and sends them once open', () => {
    const s = setup();
    s.ws().open();
    s.ws().drop();
    s.t.send({ t: 'plan', pos: { x: 1, y: 2 }, aim: 0 });
    s.runTimer();
    expect(s.ws().sent).toEqual([]);
    s.ws().open();
    expect(s.ws().sent).toEqual(['{"t":"plan","pos":{"x":1,"y":2},"aim":0}']);
  });

  it('retry() starts over after the link was lost', () => {
    const s = setup();
    s.ws().open();
    s.ws().drop();
    for (let i = 0; i < 5; i++) { s.runTimer(); s.ws().drop(); }
    expect(s.statuses[s.statuses.length - 1]).toBe('lost');
    const before = FakeWS.all.length;
    s.t.retry!();
    expect(FakeWS.all.length).toBe(before + 1);
    s.ws().open();
    expect(s.statuses[s.statuses.length - 1]).toBe('online');
  });

  it('a retry during backoff does not open a second socket when the timer fires', () => {
    const s = setup();
    s.ws().open();
    s.ws().drop();
    s.t.retry!();
    const n = FakeWS.all.length;
    s.runTimer();
    expect(FakeWS.all.length).toBe(n);
  });
});
