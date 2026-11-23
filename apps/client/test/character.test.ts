import { describe, it, expect } from 'vitest';
import { faceColor } from '../src/render/colors';

describe('faceColor', () => {
  it('is skin at full hp', () => expect(faceColor(100)).toBe('#f1c27d'));
  it('is green at half hp', () => expect(faceColor(50)).toBe('#7bd36b'));
  it('is purple at 0 hp', () => expect(faceColor(0)).toBe('#8e44ad'));
  it('clamps above 100', () => expect(faceColor(150)).toBe(faceColor(100)));
  it('clamps below 0', () => expect(faceColor(-5)).toBe(faceColor(0)));
});
