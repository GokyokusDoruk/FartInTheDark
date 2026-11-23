import { createRng } from '@fitd/sim';
import { RoomHost, type ServerMsg, type PlayerView } from '../src';

export function makeHost(seed = 7) {
  const clock = { t: 1_000_000, advance(ms: number) { this.t += ms; host.tick(); } };
  const rng = createRng(seed);
  const out = new Map<string, ServerMsg[]>();
  const host = new RoomHost({
    code: 'ABCDE', now: () => clock.t, random: rng.next,
    send: (id, msg) => { if (!out.has(id)) out.set(id, []); out.get(id)!.push(msg); },
  });
  const msgs = (id: string) => out.get(id) ?? [];
  const lastView = (id: string): PlayerView => {
    const v = [...msgs(id)].reverse().find(m => m.t === 'view');
    if (!v || v.t !== 'view') throw new Error(`no view for ${id}`);
    return v.view;
  };
  const lastError = (id: string) => { const e = [...msgs(id)].reverse().find(m => m.t === 'error'); return e && e.t === 'error' ? e.code : null; };
  /** join + connect a human; returns its id and token */
  const enter = (name: string, token?: string) => {
    const r = host.join(name, token);
    if (!r.ok) throw new Error(r.code);
    host.connected(r.id);
    return r;
  };
  return { host, clock, out, msgs, lastView, lastError, enter };
}

type H = ReturnType<typeof makeHost>;
type Strategy = (id: string, v: PlayerView, step: number) => void;

/** Act like an instantly-responding client for each id, once per phase instance. */
export function respond(h: H, ids: string[], hostId: string, seen = new Map<string, string>(), step = 0, extra?: Strategy) {
  for (const id of ids) {
    let v: PlayerView;
    try { v = h.lastView(id); } catch { continue; }
    const key = `${v.round}:${v.moveSeq}:${v.phase}`;
    if (seen.get(id) === key) continue;
    seen.set(id, key);
    extra?.(id, v, step);
    if (v.phase === 'skills' && v.me?.alive && v.me.unspent > 0) h.host.handle(id, { t: 'skills', alloc: { damage: Math.min(v.me.unspent, 10 - v.me.stats.damage) } });
    else if (v.phase === 'dark' && v.me?.alive) h.host.handle(id, { t: 'plan', pos: v.me.start, aim: v.me.aim + 0.5 + step * 0.37 });
    else if (v.phase === 'resolve') h.host.handle(id, { t: 'replayDone', moveSeq: v.moveSeq });
    else if (v.phase === 'roundEnd' && id === hostId) h.host.handle(id, { t: 'next' });
  }
  return seen;
}

/** Drive a match to matchEnd with instantly-responding clients. */
export function playOut(h: H, ids: string[], hostId: string, extra?: Strategy, maxSteps = 20000) {
  const seen = new Map<string, string>();
  for (let i = 0; i < maxSteps; i++) {
    respond(h, ids, hostId, seen, i, extra);
    if (h.lastView(ids[0]).phase === 'matchEnd') return i;
    h.clock.advance(100);
  }
  throw new Error('match did not end');
}
