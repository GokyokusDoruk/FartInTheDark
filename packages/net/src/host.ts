import { startMatch, type Difficulty, type MatchState } from '@fitd/sim';
import type { ClientMsg, ErrorCode, Member, PlayerView, ServerMsg } from './protocol';
import { cleanName, CODE_ALPHABET } from './validate';
import { MAX_MEMBERS } from './timing';

export interface HostDeps { code: string; now: () => number; random: () => number; send: (memberId: string, msg: ServerMsg) => void }
export type JoinResult = { ok: true; id: string; token: string } | { ok: false; code: ErrorCode };

interface MemberRec { id: string; name: string; isBot: boolean; difficulty?: Difficulty; connected: boolean; token: string | null }

export class RoomHost {
  protected members: MemberRec[] = [];
  protected hostId = '';
  protected nextHuman = 1;
  protected nextBot = 1;
  protected match: MatchState | null = null;
  protected isClosed = false;

  constructor(protected deps: HostDeps) {}

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
    if (!this.hostConnected()) this.hostId = id;
    this.deps.send(id, { t: 'welcome', you: id, token: m.token!, code: this.deps.code });
    this.broadcast();
  }

  disconnected(id: string): void {
    const m = this.member(id);
    if (!m || m.isBot || !m.connected) return;
    m.connected = false;
    this.passHost(id);
    this.broadcast();
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
        this.startMatch();
        return this.broadcast();
      }
      case 'leave':
        return this.leave(id);
      default:
        return this.matchMessage(id, msg);
    }
  }

  tick(): void { /* deadlines: Task 3/4 */ }
  nextDeadline(): number | null { return null; }
  closed(): boolean { return this.isClosed; }

  // ---- views --------------------------------------------------------------
  viewFor(id: string): PlayerView {
    return {
      phase: this.match ? this.match.phase : 'lobby', round: this.match?.round ?? 0, move: this.match?.move ?? 0,
      moveSeq: this.match?.moveSeq ?? 0, room: this.match?.room ?? null, remainingMs: null, hostId: this.hostId,
      members: this.publicMembers(), players: [], me: null, replay: null,
      roundHistory: this.match?.roundHistory ?? [], winners: null,
    };
  }

  // ---- internals ----------------------------------------------------------
  protected matchMessage(_id: string, _msg: ClientMsg): void { /* Task 3 */ }

  protected leave(id: string): void {
    if (this.inMatch()) return; // Task 4
    this.members = this.members.filter(x => x.id !== id);
    this.passHost(id);
    this.broadcast();
  }

  protected startMatch(): void {
    this.match = startMatch({
      seed: Math.floor(this.deps.random() * 2 ** 32),
      players: this.members.map(m => ({ id: m.id, name: m.name, isBot: m.isBot, difficulty: m.difficulty })),
    });
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
