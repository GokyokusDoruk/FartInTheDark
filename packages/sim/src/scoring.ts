import type { Player } from './types';

/** N players: survivor gets N; dead ranked by diedAt from 1; simultaneous deaths share the group's first rank. */
export function roundPoints(players: Player[]): Record<string, number> {
  const out: Record<string, number> = {};
  const dead = players.filter(p => p.diedAt !== null).sort((a, b) => a.diedAt! - b.diedAt!);
  dead.forEach((p, i) => {
    const prev = dead[i - 1];
    out[p.id] = prev && prev.diedAt === p.diedAt ? out[prev.id] : i + 1;
  });
  for (const p of players) if (p.diedAt === null) out[p.id] = players.length;
  return out;
}
