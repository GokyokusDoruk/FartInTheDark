import { describe, it, expect } from 'vitest';
import type { PlayerView, ServerMsg } from '@fitd/net';
import { createLocalTransport } from '../src/net/localTransport';

describe('LocalTransport', () => {
  it('runs a whole bots match in-process, driven by advance()', () => {
    const t = createLocalTransport({ name: 'A', bots: 3, difficulty: 'hard' });
    let me = '';
    let view: PlayerView | null = null;
    const seen = new Set<string>();
    t.onMessage((m: ServerMsg) => {
      if (m.t === 'welcome') me = m.you;
      if (m.t !== 'view') return;
      view = m.view;
      const v = m.view;
      const key = `${v.round}:${v.moveSeq}:${v.phase}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (v.phase === 'skills' && v.me!.alive && v.me!.unspent) t.send({ t: 'skills', alloc: { damage: Math.min(v.me!.unspent, 10 - v.me!.stats.damage) } });
      if (v.phase === 'dark' && v.me!.alive) t.send({ t: 'plan', pos: v.me!.start, aim: v.moveSeq });
      if (v.phase === 'resolve') t.send({ t: 'replayDone', moveSeq: v.moveSeq });
      if (v.phase === 'roundEnd') t.send({ t: 'next' });
    });
    for (let i = 0; i < 50000 && (view as PlayerView | null)?.phase !== 'matchEnd'; i++) t.advance!(0.1);
    const v = view as unknown as PlayerView;
    expect(me).not.toBe('');
    expect(v.phase).toBe('matchEnd');
    expect(v.hostId).toBe(me);
    expect(v.players).toHaveLength(4);
    expect(v.roundHistory).toHaveLength(5);
  });

  it('delivers messages only through advance, never re-entrantly from send', () => {
    const t = createLocalTransport({ name: 'A', bots: 1, difficulty: 'easy' });
    const got: string[] = [];
    t.onMessage(m => got.push(m.t));
    expect(got).toEqual([]);
    t.advance!(0);
    expect(got[0]).toBe('welcome');
    const n = got.length;
    t.send({ t: 'skills', alloc: { damage: 5 } });
    expect(got.length).toBe(n);
  });
});
