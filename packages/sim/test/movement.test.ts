import { describe, it, expect } from 'vitest';
import { createRng, generateRoom, stepMove, validatePlan, rectPoly, isClear, DT, MOVE_SPEED, DARK_SECONDS, PLAYER_RADIUS, type Room } from '../src';

const base = generateRoom(createRng(3));
const empty: Room = { ...base, walls: [] };

describe('movement', () => {
  it('walks at MOVE_SPEED', () => {
    let p = { x: 1, y: 1 };
    for (let i = 0; i < 30; i++) p = stepMove(empty, p, { x: 1, y: 0 }, DT);
    expect(p.x).toBeCloseTo(1 + MOVE_SPEED, 1);
  });
  it('stops at the room boundary', () => {
    let p = { x: 12, y: 10 };
    for (let i = 0; i < 90; i++) p = stepMove(empty, p, { x: 1, y: 0 }, DT);
    expect(p.x).toBeLessThanOrEqual(14 - PLAYER_RADIUS + 1e-6);
  });
  it('slides along a wall', () => {
    const room: Room = { ...empty, walls: [rectPoly(5, 0, 6, 20)] };
    let p = { x: 4, y: 5 };
    for (let i = 0; i < 30; i++) p = stepMove(room, p, { x: 0.7, y: 0.7 }, DT);
    expect(p.x).toBeLessThan(5);
    expect(p.y).toBeGreaterThan(6);
    expect(isClear(room, p, PLAYER_RADIUS)).toBe(true);
  });
  it('rejects plans that move too far', () => {
    expect(validatePlan(empty, { x: 1, y: 1 }, { pos: { x: 1 + MOVE_SPEED * DARK_SECONDS + 1, y: 1 } })).toBe(false);
    expect(validatePlan(empty, { x: 1, y: 1 }, { pos: { x: 5, y: 1 } })).toBe(true);
  });
  it('rejects plans inside walls', () => {
    const room: Room = { ...empty, walls: [rectPoly(5, 0, 6, 20)] };
    expect(validatePlan(room, { x: 4, y: 1 }, { pos: { x: 5.5, y: 1 } })).toBe(false);
  });
});
