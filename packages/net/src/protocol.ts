import type { Difficulty, Phase, Player, Room, Stats, Vec2 } from '@fitd/sim';

export type ClientMsg =
  | { t: 'addBot'; difficulty: Difficulty }
  | { t: 'removeBot'; id: string }
  | { t: 'start' }
  | { t: 'skills'; alloc: Partial<Stats> }
  | { t: 'plan'; pos: Vec2; aim: number }
  | { t: 'replayDone'; moveSeq: number }
  | { t: 'next' }
  | { t: 'leave' };

export type ErrorCode = 'roomNotFound' | 'roomFull' | 'matchRunning' | 'notHost' | 'needTwo' | 'badMessage';

export interface Member { id: string; name: string; isBot: boolean; difficulty?: Difficulty; connected: boolean }
export interface PublicPlayer { id: string; name: string; isBot: boolean; connected: boolean; hp: number; alive: boolean; score: number; pos: Vec2; aim: number }
export interface ReplayAfter { id: string; hp: number; alive: boolean; diedAt: number | null; score: number }
export interface Replay { moveSeq: number; rngState: number; room: Room; players: Player[]; ticks: number; after: ReplayAfter[] }

export interface PlayerView {
  phase: Phase | 'lobby';
  round: number;
  move: number;
  moveSeq: number;
  room: Room | null;
  remainingMs: number | null;
  hostId: string;
  members: Member[];
  players: PublicPlayer[];
  me: { id: string; stats: Stats; unspent: number; start: Vec2; aim: number; alive: boolean } | null;
  replay: Replay | null;
  roundHistory: Record<string, number>[];
  winners: string[] | null;
}

export type ServerMsg =
  | { t: 'welcome'; you: string; token: string; code: string }
  | { t: 'view'; view: PlayerView }
  | { t: 'error'; code: ErrorCode };
