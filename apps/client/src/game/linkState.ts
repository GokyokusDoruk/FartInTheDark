import type { ErrorCode, PlayerView } from '@fitd/net';
import type { LinkStatus } from '../net/transport';

/** What the round/match-end overlay depends on; a change means it must be redrawn (e.g. host handed over). */
export const overlayKey = (v: PlayerView, me: string) =>
  v.phase === 'roundEnd' || v.phase === 'matchEnd' ? `${v.phase}:${v.hostId === me}` : v.phase;

const GONE: ErrorCode[] = ['roomNotFound', 'roomFull', 'matchRunning'];

/** A lost link or a room that no longer exists stops the game until the player retries or leaves. */
export const blocksGame = (e: { status?: LinkStatus; error?: ErrorCode }) =>
  e.status === 'lost' || (!!e.error && GONE.includes(e.error));
