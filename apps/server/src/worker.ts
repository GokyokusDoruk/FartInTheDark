import { makeRoomCode, normalizeCode, type ServerMsg } from '@fitd/net';
import type { Env } from './gameRoom';

export { GameRoom } from './gameRoom';

const ORIGINS = new Set([
  'https://fartinthedark.dorukplays.com',
  'https://fartinthedark.pages.dev',
  'http://127.0.0.1:5173',
  'capacitor://localhost',
  'https://localhost',
]);

const cors = (req: Request): Record<string, string> => {
  const o = req.headers.get('Origin');
  return o && ORIGINS.has(o)
    ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }
    : {};
};

const random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

/** WebSocket that only says why it is refused (browsers cannot read HTTP errors on an upgrade). */
function refuse(code: 'roomNotFound'): Response {
  const pair = new WebSocketPair();
  pair[1].accept();
  pair[1].send(JSON.stringify({ t: 'error', code } satisfies ServerMsg));
  pair[1].close(4004, code);
  return new Response(null, { status: 101, webSocket: pair[0] });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/api/rooms') {
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
      if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
      for (let i = 0; i < 5; i++) {
        const code = makeRoomCode(random);
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const r = await stub.fetch(`https://room/init?code=${code}`, { method: 'POST' });
        if (r.ok) return Response.json({ code }, { headers: cors(req) });
      }
      return new Response('no free code', { status: 503, headers: cors(req) });
    }

    const m = url.pathname.match(/^\/api\/rooms\/([^/]+)\/ws$/);
    if (m) {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
      const code = normalizeCode(decodeURIComponent(m[1]));
      if (!code) return refuse('roomNotFound');
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      const inner = new URL('https://room/ws');
      for (const k of ['name', 'token']) { const v = url.searchParams.get(k); if (v) inner.searchParams.set(k, v.slice(0, 200)); }
      return stub.fetch(new Request(inner, req));
    }

    if (url.pathname === '/') return new Response('fitd-server ok');
    return new Response('not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
