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
