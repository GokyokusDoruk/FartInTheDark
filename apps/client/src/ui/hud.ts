import { ROUNDS, type MatchState } from '@fitd/sim';
import { T } from './strings';
import { PLAYER_COLORS } from '../render/colors';

export interface Hud {
  setTop(round: number, move: number, spectating: boolean): void;
  setTimer(seconds: number | null): void;
  banner(text: string | null): void;
  hint(text: string | null): void;
  destroy(): void;
}

export function createHud(root: HTMLElement): Hud {
  const el = document.createElement('div');
  el.innerHTML = `<div class="hud-top"></div><div class="timer"></div><div class="banner"></div><div class="hint"></div>`;
  root.appendChild(el);
  const q = (c: string) => el.querySelector<HTMLElement>(c)!;
  return {
    setTop(round, move, spectating) {
      q('.hud-top').innerHTML = `<span class="pill">${T.round(round, ROUNDS)}</span><span class="pill">${T.move(move)}</span>${spectating ? `<span class="pill" style="color:#ff8f8f">${T.spectating}</span>` : ''}`;
    },
    setTimer(s) { q('.timer').textContent = s === null ? '' : String(Math.ceil(s)); },
    banner(t) { q('.banner').textContent = t ?? ''; },
    hint(t) { q('.hint').textContent = t ?? ''; },
    destroy: () => el.remove(),
  };
}

const colorOf = (s: MatchState, id: string) => '#' + PLAYER_COLORS[s.players.findIndex(p => p.id === id)].toString(16).padStart(6, '0');

function table(s: MatchState, localId: string, last?: Record<string, number>) {
  const rows = [...s.players].sort((a, b) => b.score - a.score);
  return `<table class="score"><tr><th>${T.player}</th>${last ? `<th>${T.points}</th>` : ''}<th>${T.total}</th></tr>
    ${rows.map(p => `<tr><td><span class="dot" style="background:${colorOf(s, p.id)}"></span>${p.name} ${p.id === localId ? T.you : ''}</td>
    ${last ? `<td>+${last[p.id]}</td>` : ''}<td><b>${p.score}</b></td></tr>`).join('')}</table>`;
}

export function showRoundEnd(root: HTMLElement, s: MatchState, localId: string, onNext: () => void) {
  const el = document.createElement('div');
  el.className = 'screen clear';
  el.innerHTML = `<div class="title" style="font-size:32px">${T.roundOver(s.round)}</div>
    <div class="card">${table(s, localId, s.roundHistory[s.roundHistory.length - 1])}</div>
    <button class="btn">${T.nextRound}</button>`;
  root.appendChild(el);
  el.querySelector('button')!.onclick = () => { el.remove(); onNext(); };
}

export function showMatchEnd(root: HTMLElement, s: MatchState, localId: string, winnerIds: string[], onAgain: () => void, onMenu: () => void) {
  const names = winnerIds.map(id => s.players.find(p => p.id === id)!.name).join(', ');
  const el = document.createElement('div');
  el.className = 'screen';
  el.innerHTML = `<div class="title" style="font-size:36px">${T.matchOver}</div>
    <div class="title" style="font-size:24px"><span>${winnerIds.length > 1 ? T.winners(names) : T.winner(names)}</span></div>
    <div class="card">${table(s, localId)}</div>
    <button class="btn" data-a="again">${T.playAgain}</button>
    <button class="btn ghost" data-a="menu">${T.menu}</button>`;
  root.appendChild(el);
  el.querySelector<HTMLButtonElement>('[data-a=again]')!.onclick = () => { el.remove(); onAgain(); };
  el.querySelector<HTMLButtonElement>('[data-a=menu]')!.onclick = () => { el.remove(); onMenu(); };
}
