import { describe, it, expect } from 'vitest';
import { CODE_ALPHABET, makeRoomCode, normalizeCode, cleanName, parseClientMsg } from '../src';
import { createRng } from '@fitd/sim';

describe('room codes', () => {
  it('makes 5-char codes from the alphabet', () => {
    const r = createRng(1);
    for (let i = 0; i < 1000; i++) {
      const c = makeRoomCode(r.next);
      expect(c).toHaveLength(5);
      for (const ch of c) expect(CODE_ALPHABET).toContain(ch);
    }
  });
  it('normalizes user input', () => {
    expect(normalizeCode(' ab c2d ')).toBe('ABC2D');
    expect(normalizeCode('ABCD')).toBeNull();
    expect(normalizeCode('ABCD0')).toBeNull();
  });
});

describe('cleanName', () => {
  it('trims, strips control chars, caps length, defaults', () => {
    expect(cleanName('  Doruk\u0000\n ')).toBe('Doruk');
    expect(cleanName('x'.repeat(10000))).toHaveLength(14);
    expect(cleanName('')).toBe('Oyuncu');
    expect(cleanName(42)).toBe('Oyuncu');
  });
});

describe('parseClientMsg', () => {
  const ok = [
    { t: 'addBot', difficulty: 'hard' }, { t: 'removeBot', id: 'b1' }, { t: 'start' },
    { t: 'skills', alloc: { damage: 3, range: 2 } }, { t: 'plan', pos: { x: 1.5, y: -2 }, aim: 0.3 },
    { t: 'replayDone', moveSeq: 4 }, { t: 'next' }, { t: 'leave' },
  ];
  it('accepts every valid message', () => {
    for (const m of ok) expect(parseClientMsg(JSON.stringify(m))).toEqual(m);
  });
  it('rejects malformed input', () => {
    const bad = [
      '{bozuk', '{"t":"zzz"}', '{"t":"plan","pos":{"x":"NaN","y":0},"aim":0}', '{"t":"plan","pos":{"x":0,"y":0},"aim":1e999}',
      '{"t":"plan","aim":0}', '{"t":"addBot","difficulty":"insane"}', '{"t":"skills","alloc":{"damage":-1}}',
      '{"t":"skills","alloc":{"luck":1}}', '{"t":"skills","alloc":{"damage":1.5}}', '{"t":"removeBot","id":5}',
      '{"t":"replayDone","moveSeq":"x"}', 'null', '[]', '"start"', JSON.stringify({ t: 'start', pad: 'x'.repeat(20000) }),
    ];
    for (const b of bad) expect(parseClientMsg(b), b.slice(0, 60)).toBeNull();
  });
});
