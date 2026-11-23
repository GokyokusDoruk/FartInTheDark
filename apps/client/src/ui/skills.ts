import { STAT_KEYS, MAX_STAT, type Stats, type StatKey } from '@fitd/sim';
import { T } from './strings';

export interface SkillsOptions {
  stats: Stats;
  unspent: number;
  seconds: number;
  onConfirm: (alloc: Partial<Stats>) => void;
}

/** Skill allocation screen. "Hazır" unlocks only when every point is placed; timeout confirms what is placed. */
export function showSkills(root: HTMLElement, opts: SkillsOptions): { close(): void } {
  const add: Partial<Record<StatKey, number>> = {};
  const used = () => STAT_KEYS.reduce((t, k) => t + (add[k] ?? 0), 0);
  const el = document.createElement('div');
  el.className = 'screen clear';
  root.appendChild(el);
  let left = opts.seconds;
  let done = false;

  const finish = () => {
    if (done) return;
    done = true;
    clearInterval(timer);
    el.remove();
    opts.onConfirm({ ...add });
  };

  const render = () => {
    const rem = opts.unspent - used();
    el.innerHTML = `
      <div class="title" style="font-size:30px">${T.skillsTitle}</div>
      <div class="pill">${T.pointsLeft(rem)} · ${Math.ceil(left)} sn</div>
      <div class="card">
        ${STAT_KEYS.map(k => {
          const cur = opts.stats[k], extra = add[k] ?? 0;
          const bar = Array.from({ length: MAX_STAT }, (_, i) => `<i class="${i < cur ? 'on' : i < cur + extra ? 'new' : ''}"></i>`).join('');
          return `<div class="skill">
            <div><div class="name">${T.stats[k][0]} <span style="color:var(--muted)">${cur + extra}/10</span></div>
            <div class="desc">${T.stats[k][1]}</div><div class="bar">${bar}</div></div>
            <div class="pm"><button data-k="${k}" data-d="-1" ${extra === 0 ? 'disabled' : ''}>−</button>
            <button data-k="${k}" data-d="1" ${rem === 0 || cur + extra >= MAX_STAT ? 'disabled' : ''}>+</button></div>
          </div>`;
        }).join('')}
      </div>
      <button class="btn" data-a="ok" ${rem > 0 ? 'disabled' : ''}>${T.ready}</button>`;
    el.querySelectorAll<HTMLButtonElement>('.pm button').forEach(b => b.onclick = () => {
      const k = b.dataset.k as StatKey;
      add[k] = Math.max(0, (add[k] ?? 0) + Number(b.dataset.d));
      render();
    });
    el.querySelector<HTMLButtonElement>('[data-a=ok]')!.onclick = finish;
  };
  const timer = setInterval(() => {
    left -= 1;
    if (left <= 0) finish();
    else { const pill = el.querySelector('.pill'); if (pill) pill.textContent = `${T.pointsLeft(opts.unspent - used())} · ${Math.ceil(left)} sn`; }
  }, 1000);
  render();
  return { close: () => { if (!done) { done = true; clearInterval(timer); el.remove(); } } };
}
