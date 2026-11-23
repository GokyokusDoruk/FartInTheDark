import type { ClientMsg, ServerMsg } from '@fitd/net';

export type LinkStatus = 'online' | 'reconnecting' | 'lost';

/** How the game screen talks to a room: in-process for bots mode, WebSocket for online. */
export interface Transport {
  send(msg: ClientMsg): void;
  onMessage(cb: (msg: ServerMsg) => void): void;
  onStatus?(cb: (s: LinkStatus) => void): void;
  /** Called by the game loop every frame; only the local transport uses it (its clock is game time). */
  advance?(dt: number): void;
  /** Try to reconnect now (after the link was lost). */
  retry?(): void;
  close(): void;
}
