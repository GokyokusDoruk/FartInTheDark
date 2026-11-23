import { DARK_SECONDS, DT, SKILL_SECONDS } from '@fitd/sim';

/** Network grace on top of the on-screen timers. */
export const NET_GRACE_MS = 1000;
export const SKILL_MS = SKILL_SECONDS * 1000 + NET_GRACE_MS;
export const DARK_MS = DARK_SECONDS * 1000 + NET_GRACE_MS;
export const ROUND_END_MS = 10_000;
export const EMPTY_CLOSE_MS = 60_000;
export const MAX_MEMBERS = 8;

/** Client reveal animation timing (seconds); the server sizes its replay timeout from it. */
export const REVEAL = { lightUp: 0.4, bendLead: 0.5, slowmo: 0.35, after: 1.5 } as const;

export function replayMs(ticks: number): number {
  return (REVEAL.lightUp + REVEAL.bendLead + (ticks * DT) / REVEAL.slowmo + REVEAL.after) * 1000;
}
export const REPLAY_TIMEOUT = (ticks: number) => replayMs(ticks) * 1.5 + 2000;
