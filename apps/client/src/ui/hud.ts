import { ROUNDS } from '@fitd/sim';
import type { PlayerView } from '@fitd/net';
import { T } from './strings';
import { PLAYER_COLORS } from '../render/colors';
import { esc } from './esc';

export interface Hud {
  setTop(round: number, move: number, spectating: boolean): void;
  setTimer(seconds: number | null): void;
  banner(text: string | null): void;
  hint(text: string | null): void;
  status(text: string | null): void;
  destroy(): void;
}

export function createHud(root: HTMLElement): Hud {
  const el = document.createElement('div');
  el.innerHTML = `<div class="hud-top"></div><div class="timer"></div><div class="banner"></div><div class="hint"></div><div class="net-status"></div>`;
  root.appendChild(el);
  const q = (c: string) => el.querySelector<HTMLElement>(c)!;
  return {
    setTop(round, move, spectating) {
      q('.hud-top').innerHTML = `<span class="pill">${T.round(round, ROUNDS)}</span><span class="pill">${T.move(move)}</span>${spectating ? `<span class="pill" style="color:#ff8f8f">${T.spectating}</span>` : ''}`;
    },
    setTimer(s) { q('.timer').textContent = s === null ? '' : String(Math.ceil(s)); },
    banner(t) { q('.banner').textContent = t ?? ''; },
    hint(t) { q('.hint').textContent = t ?? ''; },
    status(t) { const s = q('.net-status'); s.textContent = t ?? ''; s.style.display = t ? 'block' : 'none'; },
    destroy: () => el.remove(),
  };
}

const colorOf = (v: PlayerView, id: string) => '#' + PLAYER_COLORS[Math.max(0, v.players.findIndex(p => p.id === id))].toString(16).padStart(6, '0');

export function scoreTable(v: PlayerView, localId: string, last?: Record<string, number>): string {
  const rows = [...v.players].sort((a, b) => b.score - a.score);
  return `<table class="score"><tr><th>${T.player}</th>${last ? `<th>${T.points}</th>` : ''}<th>${T.total}</th></tr>
    ${rows.map(p => `<tr><td><span class="dot" style="background:${colorOf(v, p.id)}"></span>${esc(p.name)} ${p.id === localId ? T.you : ''}</td>
    ${last ? `<td>+${last[p.id] ?? 0}</td>` : ''}<td><b>${p.score}</b></td></tr>`).join('')}</table>`;
}

/** Round-end table. Only the host gets a button; others see that the next round starts by itself. */
export function showRoundEnd(root: HTMLElement, v: PlayerView, localId: string, isHost: boolean, onNext: () => void): () => void {
  const el = document.createElement('div');
  el.className = 'screen clear';
  const lastRound = v.round >= ROUNDS;
  el.innerHTML = `<div class="title" style="font-size:32px">${T.roundOver(v.round)}</div>
    <div class="card">${scoreTable(v, localId, v.roundHistory[v.roundHistory.length - 1])}</div>
    ${isHost ? `<button class="btn">${lastRound ? T.seeResults : T.nextRound}</button>` : `<div class="subtitle">${lastRound ? T.resultsSoon : T.nextRoundSoon}</div>`}`;
  root.appendChild(el);
  const btn = el.querySelector('button');
  if (btn) btn.onclick = () => { btn.disabled = true; onNext(); };
  return () => el.remove();
}

export function showMatchEnd(root: HTMLElement, v: PlayerView, localId: string, isHost: boolean, onAgain: () => void, onMenu: () => void): () => void {
  const ids = v.winners ?? [];
  const names = ids.map(id => esc(v.players.find(p => p.id === id)?.name ?? '?')).join(', ');
  const el = document.createElement('div');
  el.className = 'screen';
  el.innerHTML = `<div class="title" style="font-size:36px">${T.matchOver}</div>
    <div class="title" style="font-size:24px"><span>${ids.length > 1 ? T.winners(names) : T.winner(names)}</span></div>
    <div class="card">${scoreTable(v, localId)}</div>
    ${isHost ? `<button class="btn" data-a="again">${T.playAgain}</button>` : `<div class="subtitle">${T.waitHostAgain}</div>`}
    <button class="btn ghost" data-a="menu">${T.menu}</button>`;
  root.appendChild(el);
  const again = el.querySelector<HTMLButtonElement>('[data-a=again]');
  if (again) again.onclick = () => { again.disabled = true; onAgain(); };
  el.querySelector<HTMLButtonElement>('[data-a=menu]')!.onclick = () => { el.remove(); onMenu(); };
  return () => el.remove();
}
