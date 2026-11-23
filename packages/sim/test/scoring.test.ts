import { describe, it, expect } from 'vitest';
import { roundPoints } from '../src';
import { mkPlayer } from './helpers';

const ps = (d: (number | null)[]) => d.map((diedAt, i) => ({ ...mkPlayer('P' + i, { x: 0, y: 0 }, 0), diedAt, alive: diedAt === null }));

describe('roundPoints', () => {
  it('matches the spec example 1-2-2-4', () => expect(roundPoints(ps([5, 9, 9, null]))).toEqual({ P0: 1, P1: 2, P2: 2, P3: 4 }));
  it('orders by death time', () => expect(roundPoints(ps([3, 1, null]))).toEqual({ P0: 2, P1: 1, P2: 3 }));
  it('everyone dying together share last place', () => expect(roundPoints(ps([7, 7]))).toEqual({ P0: 1, P1: 1 }));
});
