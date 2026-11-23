import type { Difficulty } from '@fitd/sim';
import { normalizeCode, CODE_LENGTH, MAX_MEMBERS, type PlayerView, type ServerMsg, type ClientMsg } from '@fitd/net';
import type { GameScene } from '../render/scene';
import { PLAYER_COLORS } from '../render/colors';
import { connectRoom, seatStorage } from '../net/wsTransport';
import { createRoom } from '../net/serverUrl';
import type { LinkStatus, Transport } from '../net/transport';
import { runGame } from '../game/play';
import { T } from './strings';
import { esc } from './esc';

const load = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const FATAL = new Set(['roomNotFound', 'roomFull', 'matchRunning']);
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

/** Online home: create a room or join one by code. */
export function showOnline(ui: HTMLElement, gs: GameScene, onMenu: () => void, opts: { code?: string; error?: string } = {}): void {
  let name = load('fitd.name') || T.defaultName;
  const seats = seatStorage();
  const last = seats?.getItem('fitd.lastRoom') ?? null;
  const canRejoin = !!last && !!seats?.getItem(`fitd.token.${last}`);
  ui.innerHTML = `
    <div class="screen">
      <div class="title" style="font-size:34px">${T.onlineTitle}</div>
      <div class="card">
        <label>${T.yourName}</label>
        <input class="name" maxlength="14" value="${esc(name)}" />
      </div>
      <button class="btn" data-a="create">${T.createRoom}</button>
      <div class="card">
        <label>${T.roomCode}</label>
        <input class="code" maxlength="${CODE_LENGTH + 2}" autocapitalize="characters" autocomplete="off" spellcheck="false" value="${esc(opts.code ?? '')}" placeholder="ABCDE" />
      </div>
      <button class="btn ghost" data-a="join">${T.joinRoom}</button>
      ${canRejoin ? `<button class="btn ghost" data-a="rejoin">${T.rejoin(last!)}</button>` : ''}
      <div class="err">${esc(opts.error ?? '')}</div>
      <button class="btn ghost" data-a="back">${T.back}</button>
    </div>`;
  const q = <E extends HTMLElement>(s: string) => ui.querySelector<E>(s)!;
  const err = (t: string) => { q('.err').textContent = t; };
  const nameIn = q<HTMLInputElement>('input.name');
  nameIn.oninput = () => { name = nameIn.value; };
  const codeIn = q<HTMLInputElement>('input.code');
  codeIn.oninput = () => { codeIn.value = codeIn.value.toUpperCase(); };
  const finalName = () => { const n = name.trim().slice(0, 14) || T.defaultName; save('fitd.name', n); return n; };

  q<HTMLButtonElement>('[data-a=create]').onclick = async e => {
    const b = e.currentTarget as HTMLButtonElement;
    b.disabled = true;
    err('');
    try {
      const code = await createRoom();
      enterRoom(ui, gs, code, finalName(), onMenu);
    } catch {
      b.disabled = false;
      err(T.connectionLost);
    }
  };
  q<HTMLButtonElement>('[data-a=join]').onclick = () => {
    const code = normalizeCode(codeIn.value);
    if (!code) return err(T.badCode);
    enterRoom(ui, gs, code, finalName(), onMenu);
  };
  const rejoin = ui.querySelector<HTMLButtonElement>('[data-a=rejoin]');
  if (rejoin) rejoin.onclick = () => enterRoom(ui, gs, last!, finalName(), onMenu);
  q<HTMLButtonElement>('[data-a=back]').onclick = onMenu;
}

/** Connect to a room: lobby until the match starts, then the game screen on the same link. */
function enterRoom(ui: HTMLElement, gs: GameScene, code: string, name: string, onMenu: () => void) {
  try { seatStorage()?.setItem('fitd.lastRoom', code); } catch { /* private mode */ }
  ui.innerHTML = `<div class="screen"><div class="subtitle">${T.connecting}</div></div>`;
  const t = connectRoom(code, name);
  let welcome: ServerMsg | null = null;
  let me = '';
  let gameCb: ((m: ServerMsg) => void) | null = null;
  let gameStatus: ((s: LinkStatus) => void) | null = null;
  let inGame = false;
  let botDiff: Difficulty = (load('fitd.diff') as Difficulty) || 'medium';
  let lastView: PlayerView | null = null;

  const backHome = (error?: string) => { t.close(); showOnline(ui, gs, onMenu, { code, error }); };

  const startGame = (first: ServerMsg) => {
    inGame = true;
    ui.innerHTML = '';
    const proxy: Transport = {
      send: (m: ClientMsg) => t.send(m),
      onMessage: cb => { gameCb = cb; },
      onStatus: cb => { gameStatus = cb; },
      close: () => t.close(),
    };
    runGame(ui, gs, proxy, { onMenu });
    if (welcome) gameCb?.(welcome);
    gameCb?.(first);
  };

  t.onStatus!(s => {
    if (inGame) return gameStatus?.(s);
    if (s === 'lost') backHome(T.connectionLost);
    else { const st = ui.querySelector('.err'); if (st) st.textContent = s === 'reconnecting' ? T.reconnecting : ''; }
  });

  t.onMessage(m => {
    if (inGame) return gameCb?.(m);
    if (m.t === 'welcome') { welcome = m; me = m.you; return; }
    if (m.t === 'error') {
      if (FATAL.has(m.code)) return backHome(T.errors[m.code]);
      const e = ui.querySelector('.err');
      if (e) e.textContent = T.errors[m.code] ?? m.code;
      return;
    }
    if (m.view.phase !== 'lobby') return startGame(m);
    lastView = m.view;
    renderLobby(m.view);
  });

  function renderLobby(v: PlayerView) {
    const host = v.hostId === me;
    const full = v.members.length >= MAX_MEMBERS;
    ui.innerHTML = `
      <div class="screen">
        <div class="subtitle">${T.roomCode}</div>
        <div class="room-code">${esc(code)}</div>
        <button class="btn ghost" data-a="share">${T.share}</button>
        <div class="card">
          <label>${T.playersCount(v.members.length, MAX_MEMBERS)}</label>
          <ul class="members">${v.members.map((m, i) => `
            <li><span class="dot" style="background:${hex(PLAYER_COLORS[i])}"></span>
              <span class="mname">${esc(m.name)}${m.id === me ? ` ${T.you}` : ''}</span>
              ${m.id === v.hostId ? `<span class="tag host">${T.hostTag}</span>` : ''}
              ${m.isBot ? `<span class="tag">${T.diff[m.difficulty ?? 'easy']}</span>` : ''}
              ${!m.isBot && !m.connected ? `<span class="tag off">${T.offline}</span>` : ''}
              ${host && (m.isBot || !m.connected) ? `<button class="x" data-rm="${esc(m.id)}" aria-label="${T.removeBot}">×</button>` : ''}
            </li>`).join('')}
          </ul>
          ${host ? `
            <label>${T.difficulty}</label>
            <div class="seg" data-g="diff">${(['easy', 'medium', 'hard'] as const).map(d => `<button data-v="${d}" class="${d === botDiff ? 'on' : ''}">${T.diff[d]}</button>`).join('')}</div>
            <button class="btn ghost small" data-a="addbot" ${full ? 'disabled' : ''}>${T.addBot}</button>` : ''}
        </div>
        ${host
          ? `<button class="btn" data-a="start" ${v.members.length < 2 ? 'disabled' : ''}>${T.start}</button>`
          : `<div class="subtitle">${T.waitHostStart}</div>`}
        <div class="err"></div>
        <button class="btn ghost" data-a="leave">${T.leaveRoom}</button>
      </div>`;
    const q = (s: string) => ui.querySelector<HTMLButtonElement>(s);
    q('[data-a=share]')!.onclick = () => share(code, ui);
    q('[data-a=leave]')!.onclick = () => { t.send({ t: 'leave' }); t.close(); onMenu(); };
    if (host) {
      ui.querySelectorAll<HTMLButtonElement>('[data-g=diff] button').forEach(b => b.onclick = () => {
        botDiff = b.dataset.v as Difficulty;
        save('fitd.diff', botDiff);
        if (lastView) renderLobby(lastView);
      });
      q('[data-a=addbot]')!.onclick = () => t.send({ t: 'addBot', difficulty: botDiff });
      ui.querySelectorAll<HTMLButtonElement>('[data-rm]').forEach(b => b.onclick = () => t.send({ t: 'removeBot', id: b.dataset.rm! }));
      q('[data-a=start]')!.onclick = () => t.send({ t: 'start' });
    }
  }
}

async function share(code: string, ui: HTMLElement) {
  const url = `${location.origin}${location.pathname}?oda=${code}`;
  const text = T.shareText(code);
  const note = (s: string) => { const e = ui.querySelector('.err'); if (e) e.textContent = s; };
  try {
    if (navigator.share) { await navigator.share({ title: T.title, text, url }); return; }
  } catch { /* cancelled */ return; }
  try { await navigator.clipboard.writeText(`${text} ${url}`); note(T.copied); } catch { note(url); }
}
