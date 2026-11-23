import type { Difficulty } from '@fitd/sim';
import { T } from './strings';

export interface StartOptions { name: string; bots: number; difficulty: Difficulty }

const load = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

export function showMenu(root: HTMLElement, onStart: (opts: StartOptions) => void): void {
  root.innerHTML = `
    <div class="screen">
      <div class="title">Fart <span>in the</span> Dark</div>
      <div class="subtitle">${T.tagline}</div>
      <button class="btn" data-a="bots">${T.playBots}</button>
      <button class="btn ghost" disabled>${T.online}</button>
    </div>`;
  root.querySelector<HTMLButtonElement>('[data-a=bots]')!.onclick = () => showBotSetup(root, onStart);
}

function showBotSetup(root: HTMLElement, onStart: (opts: StartOptions) => void) {
  let bots = Number(load('fitd.bots') ?? 3) || 3;
  let difficulty = ((load('fitd.diff') as Difficulty) || 'medium');
  let name = load('fitd.name') || T.defaultName;
  const render = () => {
    root.innerHTML = `
      <div class="screen">
        <div class="title" style="font-size:34px">${T.playBots}</div>
        <div class="card">
          <label>${T.yourName}</label>
          <input class="name" maxlength="14" value="${esc(name)}" />
          <label>${T.bots}</label>
          <div class="seg" data-g="bots">${[1, 2, 3, 4, 5, 6, 7].map(n => `<button data-v="${n}" class="${n === bots ? 'on' : ''}">${n}</button>`).join('')}</div>
          <label>${T.difficulty}</label>
          <div class="seg" data-g="diff">${(['easy', 'medium', 'hard'] as const).map(d => `<button data-v="${d}" class="${d === difficulty ? 'on' : ''}">${T.diff[d]}</button>`).join('')}</div>
        </div>
        <button class="btn" data-a="start">${T.start}</button>
        <button class="btn ghost" data-a="back">${T.back}</button>
      </div>`;
    const input = root.querySelector<HTMLInputElement>('input.name')!;
    input.oninput = () => { name = input.value; };
    root.querySelectorAll<HTMLButtonElement>('[data-g=bots] button').forEach(b => b.onclick = () => { bots = Number(b.dataset.v); render(); });
    root.querySelectorAll<HTMLButtonElement>('[data-g=diff] button').forEach(b => b.onclick = () => { difficulty = b.dataset.v as Difficulty; render(); });
    root.querySelector<HTMLButtonElement>('[data-a=back]')!.onclick = () => showMenu(root, onStart);
    root.querySelector<HTMLButtonElement>('[data-a=start]')!.onclick = () => {
      const n = name.trim().slice(0, 14) || T.defaultName;
      save('fitd.name', n); save('fitd.bots', String(bots)); save('fitd.diff', difficulty);
      onStart({ name: n, bots, difficulty });
    };
  };
  render();
}
