import { createRng, generateRoom, spawnPoints } from '@fitd/sim';
import { showMenu, type StartOptions } from './ui/menu';
import { createScene, toW } from './render/scene';
import { buildRoom } from './render/roomView';
import { createCharacter } from './render/character';
import { createHpBar } from './render/hpBar';
import { PLAYER_COLORS } from './render/colors';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const gs = createScene(canvas);
window.addEventListener('resize', () => gs.resize());

function preview(opts: StartOptions) {
  ui.innerHTML = '';
  const rng = createRng(Date.now() >>> 0);
  const room = generateRoom(rng);
  gs.scene.add(buildRoom(room));
  gs.fit(room);
  const spawns = spawnPoints(room, opts.bots + 1, rng);
  const chars = spawns.map((p, i) => {
    const c = createCharacter(PLAYER_COLORS[i]);
    c.group.position.copy(toW(p));
    c.setFacing(rng.range(0, Math.PI * 2));
    const bar = createHpBar(i === 0 ? opts.name : `Bot ${i}`, PLAYER_COLORS[i]);
    bar.sprite.position.set(0, 2.6, 0);
    c.group.add(bar.sprite);
    gs.scene.add(c.group);
    return c;
  });
  const t0 = performance.now();
  const loop = () => {
    const t = (performance.now() - t0) / 1000;
    chars.forEach((c, i) => c.setPose((['idle', 'bend', 'grin', 'dead'] as const)[i % 4], t % 3));
    gs.render();
    requestAnimationFrame(loop);
  };
  loop();
}

gs.resize();
gs.render();
showMenu(ui, preview);
