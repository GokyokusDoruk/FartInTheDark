import { describe, it, expect } from 'vitest';
import type { PlayerView } from '@fitd/net';
import { scoreTable } from '../src/ui/hud';

const view = (name: string): PlayerView => ({
  phase: 'roundEnd', round: 1, move: 3, moveSeq: 3, room: null, remainingMs: 5000, hostId: 'p1',
  members: [], me: null, replay: null, winners: null,
  roundHistory: [{ p1: 2, p2: 1 }],
  players: [
    { id: 'p1', name, isBot: false, connected: true, hp: 50, alive: true, score: 2, pos: { x: 0, y: 0 }, aim: 0 },
    { id: 'p2', name: 'B', isBot: true, connected: true, hp: 0, alive: false, score: 1, pos: { x: 0, y: 0 }, aim: 0 },
  ],
});

describe('scoreTable', () => {
  it('escapes player names', () => {
    const html = scoreTable(view('<img src=x onerror=1>'), 'p1', { p1: 2, p2: 1 });
    expect(html).not.toContain('<img');
    expect(html).toContain('&#60;img');
  });
  it('sorts by total and shows round points', () => {
    const html = scoreTable(view('A'), 'p2', { p1: 2, p2: 1 });
    expect(html.indexOf('A')).toBeLessThan(html.indexOf('>B'));
    expect(html).toContain('+2');
  });
});
