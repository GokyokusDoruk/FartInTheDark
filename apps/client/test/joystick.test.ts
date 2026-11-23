import { describe, it, expect } from 'vitest';
import { stickVector } from '../src/input/stick';

describe('stickVector', () => {
  it('full deflection gives unit vector', () => expect(stickVector({ x: 0, y: 0 }, { x: 50, y: 0 }, 50)).toEqual({ x: 1, y: 0 }));
  it('clamps beyond the radius', () => {
    const v = stickVector({ x: 0, y: 0 }, { x: 200, y: 0 }, 50);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
  });
  it('has a dead zone', () => expect(stickVector({ x: 0, y: 0 }, { x: 2, y: 0 }, 50)).toEqual({ x: 0, y: 0 }));
  it('keeps partial deflection', () => expect(stickVector({ x: 10, y: 10 }, { x: 10, y: 35 }, 50).y).toBeCloseTo(0.5));
});
