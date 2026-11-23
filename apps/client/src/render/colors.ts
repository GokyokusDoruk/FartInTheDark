const SKIN = [0xf1, 0xc2, 0x7d], GREEN = [0x7b, 0xd3, 0x6b], PURPLE = [0x8e, 0x44, 0xad];
const hex = (c: number[]) => '#' + c.map(n => Math.round(n).toString(16).padStart(2, '0')).join('');
const mix = (a: number[], b: number[], t: number) => a.map((x, i) => x + (b[i] - x) * t);

/** Face colour by hp: skin (100) → green (50) → purple (0). */
export function faceColor(hp: number): string {
  const h = Math.max(0, Math.min(100, hp));
  return h >= 50 ? hex(mix(GREEN, SKIN, (h - 50) / 50)) : hex(mix(PURPLE, GREEN, h / 50));
}

/** Hp bar colour: green (100) → red (0). */
export function hpBarColor(hp: number): string {
  const h = Math.max(0, Math.min(100, hp)) / 100;
  return hex(mix([0xe7, 0x4c, 0x3c], [0x2e, 0xcc, 0x71], h));
}

/** Distinct player colours (index 0 = local player). */
export const PLAYER_COLORS = [0x3ddc84, 0xff5a5f, 0x4aa3ff, 0xffc145, 0xb36bff, 0xff8fd6, 0x40e0d0, 0xff9a3c];
