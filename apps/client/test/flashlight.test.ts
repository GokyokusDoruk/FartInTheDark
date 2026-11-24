import { describe, it, expect } from 'vitest';
import { flashlightAngle } from '../src/game/flashlight';

describe('flashlightAngle', () => {
  it('lights the way the character faces, opposite to where the gas goes', () => {
    expect(flashlightAngle(0)).toBeCloseTo(Math.PI);
    expect(Math.cos(flashlightAngle(Math.PI / 2))).toBeCloseTo(0);
    expect(Math.sin(flashlightAngle(Math.PI / 2))).toBeCloseTo(-1);
  });
});
