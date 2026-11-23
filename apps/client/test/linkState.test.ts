import { describe, it, expect } from 'vitest';
import type { PlayerView } from '@fitd/net';
import { overlayKey, blocksGame } from '../src/game/linkState';

const v = (phase: PlayerView['phase'], hostId: string) => ({ phase, hostId } as PlayerView);

describe('overlayKey', () => {
  it('changes on round/match end when the local player becomes host', () => {
    expect(overlayKey(v('matchEnd', 'p1'), 'p2')).not.toBe(overlayKey(v('matchEnd', 'p2'), 'p2'));
    expect(overlayKey(v('roundEnd', 'p1'), 'p2')).not.toBe(overlayKey(v('roundEnd', 'p2'), 'p2'));
  });
  it('ignores host changes in other phases', () => {
    expect(overlayKey(v('dark', 'p1'), 'p2')).toBe(overlayKey(v('dark', 'p2'), 'p2'));
  });
});

describe('blocksGame', () => {
  it('blocks on a lost link or a room that is gone', () => {
    expect(blocksGame({ status: 'lost' })).toBe(true);
    expect(blocksGame({ error: 'roomNotFound' })).toBe(true);
  });
  it('does not block on transient states', () => {
    expect(blocksGame({ status: 'reconnecting' })).toBe(false);
    expect(blocksGame({ status: 'online' })).toBe(false);
    expect(blocksGame({ error: 'notHost' })).toBe(false);
  });
});
