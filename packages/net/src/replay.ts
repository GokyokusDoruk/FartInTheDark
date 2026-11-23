import { createResolution, createRng, stepResolution, type MatchState, type Player } from '@fitd/sim';
import type { Replay } from './protocol';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Call after beginResolve and before the resolution runs: captures everything a client needs to replay it. */
export function buildReplay(s: MatchState): Replay {
  return { moveSeq: s.moveSeq, rngState: s.rng.state(), room: clone(s.room), players: clone(s.players), ticks: 0, after: [] };
}

/** Re-run a replay with the shared engine (used by clients for the slow-motion reveal and by tests). */
export function simulateReplay(r: Replay): { players: Player[]; ticks: number } {
  const players = clone(r.players);
  const rng = createRng(r.rngState);
  const res = createResolution(players, r.moveSeq, r.room);
  while (!res.done) stepResolution(res, r.room, players, rng);
  return { players, ticks: res.tick };
}
