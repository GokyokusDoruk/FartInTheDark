import { MAX_STAT, STAT_KEYS, type Stats } from '@fitd/sim';
import type { ClientMsg } from './protocol';

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;
export const NAME_MAX = 14;
export const DEFAULT_NAME = 'Oyuncu';
const MAX_RAW = 4096;
const DIFFS = ['easy', 'medium', 'hard'];

export function makeRoomCode(random: () => number): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length) % CODE_ALPHABET.length];
  return s;
}

export function normalizeCode(raw: string): string | null {
  const c = String(raw).replace(/\s+/g, '').toUpperCase();
  if (c.length !== CODE_LENGTH) return null;
  for (const ch of c) if (!CODE_ALPHABET.includes(ch)) return null;
  return c;
}

export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_NAME;
  // eslint-disable-next-line no-control-regex
  const s = raw.slice(0, 200).replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim();
  return Array.from(s).slice(0, NAME_MAX).join('').trim() || DEFAULT_NAME;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function parseClientMsg(raw: string): ClientMsg | null {
  if (typeof raw !== 'string' || raw.length > MAX_RAW) return null;
  let m: unknown;
  try { m = JSON.parse(raw); } catch { return null; }
  if (!isObj(m)) return null;
  switch (m.t) {
    case 'start': case 'next': case 'leave':
      return { t: m.t };
    case 'addBot':
      return typeof m.difficulty === 'string' && DIFFS.includes(m.difficulty) ? { t: 'addBot', difficulty: m.difficulty as 'easy' } : null;
    case 'removeBot':
      return typeof m.id === 'string' && m.id.length <= 16 ? { t: 'removeBot', id: m.id } : null;
    case 'replayDone':
      return num(m.moveSeq) ? { t: 'replayDone', moveSeq: m.moveSeq } : null;
    case 'plan': {
      const p = m.pos;
      if (!isObj(p) || !num(p.x) || !num(p.y) || !num(m.aim)) return null;
      return { t: 'plan', pos: { x: p.x, y: p.y }, aim: m.aim };
    }
    case 'skills': {
      if (!isObj(m.alloc)) return null;
      const alloc: Partial<Stats> = {};
      for (const [k, v] of Object.entries(m.alloc)) {
        if (!(STAT_KEYS as string[]).includes(k) || !Number.isInteger(v) || (v as number) < 0 || (v as number) > MAX_STAT) return null;
        alloc[k as keyof Stats] = v as number;
      }
      return { t: 'skills', alloc };
    }
    default:
      return null;
  }
}
