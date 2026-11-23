import { describe, it, expect } from 'vitest';
import { reflect, pointInPoly, closestPointOnPoly, segmentHitsPoly, circleHitsPoly, rotate } from '../src';

const sq = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];

describe('vec', () => {
  it('reflects a direction off a normal', () => {
    expect(reflect({ x: 1, y: -1 }, { x: 0, y: 1 })).toEqual({ x: 1, y: 1 });
  });
  it('tests point in polygon', () => {
    expect(pointInPoly({ x: 1, y: 1 }, sq)).toBe(true);
    expect(pointInPoly({ x: 3, y: 1 }, sq)).toBe(false);
  });
  it('finds closest point on polygon edge', () => {
    expect(closestPointOnPoly({ x: 3, y: 1 }, sq)).toEqual({ x: 2, y: 1 });
  });
  it('intersects a segment with a polygon', () => {
    expect(segmentHitsPoly({ x: -1, y: 1 }, { x: 1, y: 1 }, sq)).toEqual({ t: 0.5, normal: { x: -1, y: 0 } });
    expect(segmentHitsPoly({ x: -1, y: 5 }, { x: 1, y: 5 }, sq)).toBeNull();
  });
  it('detects circle overlap with outward normal', () => {
    expect(circleHitsPoly({ x: 2.3, y: 1 }, 0.5, sq)?.normal).toEqual({ x: 1, y: 0 });
    expect(circleHitsPoly({ x: 3, y: 1 }, 0.5, sq)).toBeNull();
  });
  it('rotates a vector', () => {
    const r = rotate({ x: 1, y: 0 }, Math.PI / 2);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(1);
  });
});
