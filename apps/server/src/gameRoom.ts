import { DurableObject } from 'cloudflare:workers';
import { RoomHost, parseClientMsg, type HostDeps, type HostSnapshot, type ServerMsg } from '@fitd/net';

export interface Env { ROOMS: DurableObjectNamespace<GameRoom> }

const random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

/**
 * One room code = one Durable Object. RoomHost holds every rule; this class only wires it to
 * hibernatable WebSockets (tagged with the member id), an alarm for deadlines and storage.
 */
export class GameRoom extends DurableObject<Env> {
  private host: RoomHost | null = null;
  private code = '';

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<{ code: string; snap: HostSnapshot }>('room');
      if (saved) {
        this.code = saved.code;
        this.host = RoomHost.restore(saved.snap, this.deps());
      }
    });
  }

  private deps(): HostDeps {
    return {
      code: this.code, now: () => Date.now(), random,
      send: (id, msg) => this.sendTo(id, msg),
    };
  }

  private sendTo(id: string, msg: ServerMsg) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets(id)) {
      try { ws.send(data); } catch { /* closing socket */ }
    }
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/init' && req.method === 'POST') {
      if (this.host) return new Response('taken', { status: 409 });
      this.code = url.searchParams.get('code') ?? '';
      this.host = new RoomHost(this.deps());
      await this.persist();
      return new Response('ok');
    }
    if (url.pathname === '/ws') {
      const pair = new WebSocketPair();
      const [clientWs, serverWs] = [pair[0], pair[1]];
      const r = this.host && !this.host.closed()
        ? this.host.join(url.searchParams.get('name') ?? '', url.searchParams.get('token') ?? undefined)
        : ({ ok: false, code: 'roomNotFound' } as const);
      if (!r.ok) {
        serverWs.accept();
        serverWs.send(JSON.stringify({ t: 'error', code: r.code } satisfies ServerMsg));
        serverWs.close(4004, r.code);
        return new Response(null, { status: 101, webSocket: clientWs });
      }
      // a reconnect replaces any stale socket for the same seat
      for (const old of this.ctx.getWebSockets(r.id)) { try { old.close(4000, 'replaced'); } catch { /* already closed */ } }
      this.ctx.acceptWebSocket(serverWs, [r.id]);
      this.host!.connected(r.id);
      await this.persist();
      return new Response(null, { status: 101, webSocket: clientWs });
    }
    return new Response('not found', { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const id = this.ctx.getTags(ws)[0];
    if (!this.host || !id) return;
    const msg = typeof data === 'string' ? parseClientMsg(data) : null;
    if (!msg) { ws.send(JSON.stringify({ t: 'error', code: 'badMessage' } satisfies ServerMsg)); return; }
    this.host.handle(id, msg);
    if (msg.t === 'leave') { try { ws.close(1000, 'left'); } catch { /* ignore */ } }
    await this.persist();
  }

  async webSocketClose(ws: WebSocket): Promise<void> { await this.dropped(ws); }
  async webSocketError(ws: WebSocket): Promise<void> { await this.dropped(ws); }

  private async dropped(ws: WebSocket) {
    const id = this.ctx.getTags(ws)[0];
    if (!this.host || !id) return;
    const stillOpen = this.ctx.getWebSockets(id).some(w => w !== ws && w.readyState === WebSocket.OPEN);
    if (!stillOpen) this.host.disconnected(id);
    await this.persist();
  }

  async alarm(): Promise<void> {
    this.host?.tick();
    await this.persist();
  }

  private async persist() {
    const h = this.host;
    if (!h) return;
    if (h.closed()) {
      for (const ws of this.ctx.getWebSockets()) {
        try { ws.send(JSON.stringify({ t: 'error', code: 'roomNotFound' } satisfies ServerMsg)); ws.close(4004, 'closed'); } catch { /* ignore */ }
      }
      this.host = null;
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.ctx.storage.put('room', { code: this.code, snap: h.snapshot() });
    const d = h.nextDeadline();
    if (d === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(d);
  }
}
