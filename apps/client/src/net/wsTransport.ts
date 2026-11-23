import type { ClientMsg, ServerMsg } from '@fitd/net';
import type { LinkStatus, Transport } from './transport';
import { wsUrl } from './serverUrl';

const BACKOFF = [1000, 2000, 4000, 8000, 8000];

/** Per tab, so two tabs of one browser never share (and steal) a seat; survives reloads. */
export function seatStorage(): Storage | null {
  try { return sessionStorage; } catch { return null; }
}

/**
 * A WebSocket to one room. The seat token from `welcome` is kept per room code so a reload or a
 * dropped connection takes the same seat back. Unexpected closes retry with backoff; a server
 * error (e.g. room not found) or leaving ends the link for good.
 */
export function connectRoom(code: string, name: string, deps: { WebSocket?: typeof WebSocket; storage?: Storage | null; setTimeout?: typeof setTimeout } = {}): Transport {
  const WS = deps.WebSocket ?? WebSocket;
  const storage = deps.storage === undefined ? seatStorage() : deps.storage;
  const later = deps.setTimeout ?? setTimeout;
  const key = `fitd.token.${code}`;
  const get = () => { try { return storage?.getItem(key) ?? null; } catch { return null; } };
  const put = (v: string | null) => { try { v === null ? storage?.removeItem(key) : storage?.setItem(key, v); } catch { /* private mode */ } };

  let ws: WebSocket;
  let listener: ((m: ServerMsg) => void) | null = null;
  const buffer: ServerMsg[] = [];
  let statusCb: ((s: LinkStatus) => void) | null = null;
  let attempts = 0;
  let closed = false;
  let fatal = false;
  let left = false;

  const status = (s: LinkStatus) => statusCb?.(s);
  const deliver = (m: ServerMsg) => { if (listener) listener(m); else buffer.push(m); };

  const open = () => {
    if (closed) return;
    const token = get();
    ws = new WS(`${wsUrl()}/api/rooms/${code}/ws?name=${encodeURIComponent(name)}${token ? `&token=${encodeURIComponent(token)}` : ''}`);
    ws.onopen = () => { attempts = 0; status('online'); };
    ws.onmessage = ev => {
      let m: ServerMsg;
      try { m = JSON.parse(String(ev.data)); } catch { return; }
      if (m.t === 'welcome') put(m.token);
      if (m.t === 'error' && m.code !== 'notHost' && m.code !== 'needTwo' && m.code !== 'badMessage') { fatal = true; put(null); }
      deliver(m);
    };
    ws.onerror = () => { /* onclose follows */ };
    ws.onclose = () => {
      if (closed || fatal) return;
      if (attempts >= BACKOFF.length) { status('lost'); return; }
      status('reconnecting');
      later(open, BACKOFF[attempts++]);
    };
  };
  open();

  return {
    send(msg: ClientMsg) {
      if (msg.t === 'leave') left = true;
      if (ws.readyState === 1) ws.send(JSON.stringify(msg));
    },
    onMessage(cb) {
      listener = cb;
      while (buffer.length) cb(buffer.shift()!);
    },
    onStatus(cb) { statusCb = cb; },
    close() {
      closed = true;
      if (left) put(null);
      try { ws.close(); } catch { /* already closed */ }
    },
  };
}
