import {
  startMatch, allocateSkills, endSkills, submitPlan, beginResolve, runResolution, finishResolve, nextRound, winners,
  botAllocate, botPlan, skillsPending, createRng, type Difficulty, type MatchState,
} from '@fitd/sim';
import type { ClientMsg, ErrorCode, Member, PlayerView, PublicPlayer, Replay, ServerMsg } from './protocol';
import { cleanName, CODE_ALPHABET } from './validate';
import { DARK_MS, EMPTY_CLOSE_MS, MAX_MEMBERS, REPLAY_TIMEOUT, ROUND_END_MS, SKILL_MS } from './timing';
import { buildReplay } from './replay';

export interface HostDeps { code: string; now: () => number; random: () => number; send: (memberId: string, msg: ServerMsg) => void }
export type JoinResult = { ok: true; id: string; token: string } | { ok: false; code: ErrorCode };

export interface HostSnapshot {
  v: 1; members: MemberRec[]; hostId: string; nextHuman: number; nextBot: number; isClosed: boolean;
  deadline: number | null; phaseKey: string; replay: Replay | null; replayDone: string[]; nextRequested: boolean;
  closeAt: number | null; match: Omit<MatchState, 'rng'> | null; rngState: number;
}

export interface MemberRec { id: string; name: string; isBot: boolean; difficulty?: Difficulty; connected: boolean; token: string | null }

export class RoomHost {
  protected members: MemberRec[] = [];
  protected hostId = '';
  protected nextHuman = 1;
  protected nextBot = 1;
  protected match: MatchState | null = null;
  protected isClosed = false;
  protected deadline: number | null = null;
  protected phaseKey = '';
  protected replay: Replay | null = null;
  protected replayDone = new Set<string>();
  protected nextRequested = false;
  protected closeAt: number | null = null;

  constructor(protected deps: HostDeps) {
    // a room nobody ever connects to closes like an abandoned one
    this.closeAt = deps.now() + EMPTY_CLOSE_MS;
  }

  // ---- membership ---------------------------------------------------------
  join(name: unknown, token?: string): JoinResult {
    if (this.isClosed) return { ok: false, code: 'roomNotFound' };
    if (token) {
      const m = this.members.find(x => !x.isBot && x.token === token);
      if (m) return { ok: true, id: m.id, token };
    }
    if (this.inMatch()) return { ok: false, code: 'matchRunning' };
    if (this.members.length >= MAX_MEMBERS) return { ok: false, code: 'roomFull' };
    const m: MemberRec = { id: `p${this.nextHuman++}`, name: cleanName(name), isBot: false, connected: false, token: this.makeToken() };
    this.members.push(m);
    if (!this.hostId) this.hostId = m.id;
    return { ok: true, id: m.id, token: m.token! };
  }

  connected(id: string): void {
    const m = this.member(id);
    if (!m || m.isBot) return;
    m.connected = true;
    this.closeAt = null;
    if (!this.hostConnected()) this.hostId = id;
    this.deps.send(id, { t: 'welcome', you: id, token: m.token!, code: this.deps.code });
    this.broadcast();
  }

  disconnected(id: string): void {
    const m = this.member(id);
    if (!m || m.isBot || !m.connected) return;
    m.connected = false;
    this.passHost(id);
    this.armClose();
    // the dropped player may have been the one everybody was waiting for
    if (!this.advance()) this.broadcast();
  }

  handle(id: string, msg: ClientMsg): void {
    const m = this.member(id);
    if (!m || m.isBot) return;
    switch (msg.t) {
      case 'addBot': {
        if (!this.lobbyCheck(id)) return;
        if (this.members.length >= MAX_MEMBERS) return this.error(id, 'roomFull');
        const n = this.nextBot++;
        this.members.push({ id: `b${n}`, name: `Bot ${n}`, isBot: true, difficulty: msg.difficulty, connected: true, token: null });
        return this.broadcast();
      }
      case 'removeBot': {
        if (!this.lobbyCheck(id)) return;
        const i = this.members.findIndex(x => x.id === msg.id && x.isBot);
        if (i < 0) return;
        this.members.splice(i, 1);
        return this.broadcast();
      }
      case 'start': {
        if (!this.lobbyCheck(id)) return;
        if (this.members.length < 2) return this.error(id, 'needTwo');
        return this.startMatch();
      }
      case 'leave':
        return this.leave(id);
      default:
        return this.matchMessage(id, msg);
    }
  }

  tick(): void {
    if (this.isClosed) return;
    if (this.closeAt !== null && this.deps.now() >= this.closeAt) return this.close();
    this.advance();
  }
  nextDeadline(): number | null {
    if (this.isClosed) return null;
    const phase = this.match && this.match.phase !== 'matchEnd' ? this.deadline : null;
    const all = [phase, this.closeAt].filter((x): x is number => x !== null);
    return all.length ? Math.min(...all) : null;
  }
  closed(): boolean { return this.isClosed; }

  snapshot(): HostSnapshot {
    const { rng, ...match } = this.match ?? ({} as MatchState);
    return JSON.parse(JSON.stringify({
      v: 1, members: this.members, hostId: this.hostId, nextHuman: this.nextHuman, nextBot: this.nextBot,
      isClosed: this.isClosed, deadline: this.deadline, phaseKey: this.phaseKey, replay: this.replay,
      replayDone: [...this.replayDone], nextRequested: this.nextRequested, closeAt: this.closeAt,
      match: this.match ? match : null, rngState: this.match ? rng.state() : 0,
    }));
  }

  static restore(snap: HostSnapshot, deps: HostDeps): RoomHost {
    const h = new RoomHost(deps);
    h.members = snap.members;
    h.hostId = snap.hostId;
    h.nextHuman = snap.nextHuman;
    h.nextBot = snap.nextBot;
    h.isClosed = snap.isClosed;
    h.deadline = snap.deadline;
    h.phaseKey = snap.phaseKey;
    h.replay = snap.replay;
    h.replayDone = new Set(snap.replayDone);
    h.nextRequested = snap.nextRequested;
    h.closeAt = snap.closeAt;
    h.match = snap.match ? ({ ...snap.match, rng: createRng(snap.rngState) } as MatchState) : null;
    return h;
  }

  // ---- views --------------------------------------------------------------
  viewFor(id: string): PlayerView {
    const s = this.match;
    const base: PlayerView = {
      phase: 'lobby', round: 0, move: 0, moveSeq: 0, room: null, remainingMs: null, hostId: this.hostId,
      members: this.publicMembers(), players: [], me: null, replay: null, roundHistory: [], winners: null,
    };
    if (!s) return base;
    // p.pos/p.aim only ever hold revealed values: plans live in s.plans until beginResolve
    const players: PublicPlayer[] = s.players.map(p => {
      const m = this.member(p.id);
      return {
        id: p.id, name: p.name, isBot: m?.isBot ?? p.isBot, connected: m ? m.connected : false,
        hp: p.hp, alive: p.alive, score: p.score, pos: p.pos, aim: p.aim,
      };
    });
    const p = s.players.find(q => q.id === id);
    return {
      ...base,
      phase: s.phase, round: s.round, move: s.move, moveSeq: s.moveSeq, room: s.room,
      remainingMs: this.deadline !== null && s.phase !== 'matchEnd' ? Math.max(0, this.deadline - this.deps.now()) : null,
      players,
      me: p ? { id, stats: p.stats, unspent: p.unspent, start: s.moveStart[id] ?? p.pos, aim: p.aim, alive: p.alive } : null,
      replay: s.phase === 'resolve' ? this.replay : null,
      roundHistory: s.roundHistory,
      winners: s.phase === 'matchEnd' ? winners(s) : null,
    };
  }

  // ---- match flow ---------------------------------------------------------
  protected matchMessage(id: string, msg: ClientMsg): void {
    const s = this.match;
    if (!s) return;
    const p = s.players.find(q => q.id === id);
    switch (msg.t) {
      case 'skills':
        if (s.phase !== 'skills' || !p?.alive || p.unspent <= 0) return;
        try { allocateSkills(s, id, msg.alloc); } catch { return; }
        break;
      case 'plan':
        if (s.phase !== 'dark' || !p?.alive) return;
        submitPlan(s, id, { pos: msg.pos, aim: msg.aim });
        break;
      case 'replayDone':
        if (s.phase !== 'resolve' || msg.moveSeq !== s.moveSeq) return;
        this.replayDone.add(id);
        break;
      case 'next':
        if (s.phase !== 'roundEnd' || id !== this.hostId) return;
        this.nextRequested = true;
        break;
      default:
        return;
    }
    this.advance();
  }

  /** Enter new phases and leave finished ones until nothing is left to do; broadcasts on change. */
  protected advance(): boolean {
    let changed = false;
    for (let guard = 0; guard < 64 && this.match; guard++) {
      const s = this.match;
      const key = `${s.round}:${s.moveSeq}:${s.phase}`;
      if (key !== this.phaseKey) { this.phaseKey = key; this.enter(s); changed = true; }
      if (!this.leaveIfDone(s)) break;
    }
    if (changed) this.broadcast();
    return changed;
  }

  protected enter(s: MatchState): void {
    const now = this.deps.now();
    if (s.phase === 'skills') {
      for (const p of s.players) {
        if (p.alive && p.unspent > 0 && !this.liveHuman(p.id)) allocateSkills(s, p.id, botAllocate(s, p.id));
      }
      this.deadline = now + SKILL_MS;
    } else if (s.phase === 'dark') {
      this.deadline = now + DARK_MS;
    } else if (s.phase === 'roundEnd') {
      this.nextRequested = false;
      this.deadline = now + ROUND_END_MS;
    } else if (s.phase === 'matchEnd') {
      this.deadline = null;
    }
  }

  /** Returns true when the match moved on to another phase. */
  protected leaveIfDone(s: MatchState): boolean {
    const now = this.deps.now();
    const late = this.deadline !== null && now >= this.deadline;
    switch (s.phase) {
      case 'skills':
        if (!late && skillsPending(s).some(id => this.liveHuman(id))) return false;
        endSkills(s);
        return true;
      case 'dark': {
        if (!late && s.players.some(p => p.alive && this.liveHuman(p.id) && !s.plans[p.id])) return false;
        for (const p of s.players) if (p.alive && !this.liveHuman(p.id) && !s.plans[p.id]) submitPlan(s, p.id, botPlan(s, p.id));
        beginResolve(s);
        const r = buildReplay(s);
        runResolution(s.resolution!, s.room, s.players, s.rng);
        r.ticks = s.resolution!.tick;
        r.after = s.players.map(p => ({ id: p.id, hp: p.hp, alive: p.alive, diedAt: p.diedAt, score: p.score }));
        this.replay = r;
        this.replayDone.clear();
        this.deadline = now + REPLAY_TIMEOUT(r.ticks);
        return true;
      }
      case 'resolve':
        if (!late && this.members.some(m => this.liveHuman(m.id) && !this.replayDone.has(m.id))) return false;
        finishResolve(s);
        return true;
      case 'roundEnd':
        if (!late && !this.nextRequested) return false;
        nextRound(s);
        return true;
      default:
        return false;
    }
  }

  /** A connected human controls this player; anyone else is played by the bot logic. */
  protected liveHuman(id: string): boolean {
    const m = this.member(id);
    return !!m && !m.isBot && m.connected;
  }

  // ---- internals ----------------------------------------------------------

  protected leave(id: string): void {
    if (this.inMatch()) {
      // the seat stays in the match, played by the bot logic from now on
      const m = this.member(id)!;
      Object.assign(m, { isBot: true, connected: true, token: null, name: `${m.name} (bot)` });
      const p = this.match!.players.find(q => q.id === id);
      if (p) { p.isBot = true; p.name = m.name; }
    } else {
      this.members = this.members.filter(x => x.id !== id);
    }
    this.passHost(id);
    this.armClose();
    if (!this.advance()) this.broadcast();
  }

  protected armClose(): void {
    if (this.closeAt === null && !this.members.some(m => !m.isBot && m.connected)) this.closeAt = this.deps.now() + EMPTY_CLOSE_MS;
  }

  protected close(): void {
    this.isClosed = true;
    this.match = null;
    this.members = [];
    this.deadline = this.closeAt = null;
  }

  protected startMatch(): void {
    this.match = startMatch({
      seed: Math.floor(this.deps.random() * 2 ** 32),
      players: this.members.map(m => ({ id: m.id, name: m.name, isBot: m.isBot, difficulty: m.difficulty })),
    });
    this.phaseKey = '';
    this.replay = null;
    this.advance();
  }

  protected inMatch(): boolean { return !!this.match && this.match.phase !== 'matchEnd'; }

  protected lobbyCheck(id: string): boolean {
    if (this.inMatch()) return false;
    if (id !== this.hostId) { this.error(id, 'notHost'); return false; }
    return true;
  }

  protected passHost(leaving: string): void {
    if (this.hostId !== leaving && this.hostConnected()) return;
    const next = this.members.find(x => !x.isBot && x.connected && x.id !== leaving);
    if (next) this.hostId = next.id;
    else if (!this.members.some(x => x.id === this.hostId)) this.hostId = this.members.find(x => !x.isBot)?.id ?? '';
  }

  protected hostConnected(): boolean { return !!this.members.find(x => x.id === this.hostId && x.connected); }
  protected member(id: string) { return this.members.find(x => x.id === id); }
  protected publicMembers(): Member[] {
    return this.members.map(({ id, name, isBot, difficulty, connected }) => ({ id, name, isBot, ...(difficulty ? { difficulty } : {}), connected }));
  }
  protected error(id: string, code: ErrorCode) { this.deps.send(id, { t: 'error', code }); }
  protected broadcast(): void {
    for (const m of this.members) if (!m.isBot && m.connected) this.deps.send(m.id, { t: 'view', view: this.viewFor(m.id) });
  }
  protected makeToken(): string {
    let s = '';
    for (let i = 0; i < 16; i++) s += CODE_ALPHABET[Math.floor(this.deps.random() * CODE_ALPHABET.length) % CODE_ALPHABET.length];
    return s;
  }
}
