import { RoomHost, type ServerMsg } from '@fitd/net';
import type { Transport } from './transport';
import type { StartOptions } from '../ui/menu';

/**
 * Bots mode: the same RoomHost the server runs, inside the page. Its clock is the game loop's
 * time, so a hidden tab pauses the match. Messages are queued and delivered from advance(), so
 * a client reacting to a message never re-enters the host.
 */
export function createLocalTransport(opts: StartOptions): Transport {
  let now = 0;
  let me = '';
  const inbox: ServerMsg[] = [];
  let listener: ((m: ServerMsg) => void) | null = null;
  const host = new RoomHost({
    code: 'LOCAL', now: () => now, random: Math.random,
    send: (id, msg) => { if (id === me) inbox.push(msg); },
  });
  const r = host.join(opts.name);
  if (!r.ok) throw new Error(r.code);
  me = r.id;
  host.connected(me);
  for (let i = 0; i < opts.bots; i++) host.handle(me, { t: 'addBot', difficulty: opts.difficulty });
  host.handle(me, { t: 'start' });

  const flush = () => {
    while (listener && inbox.length) listener(inbox.shift()!);
  };
  let closed = false;
  return {
    send: msg => { if (!closed) host.handle(me, msg); },
    onMessage: cb => { listener = cb; },
    advance: dt => {
      if (closed) return;
      now += dt * 1000;
      host.tick();
      flush();
    },
    close: () => { closed = true; listener = null; },
  };
}
