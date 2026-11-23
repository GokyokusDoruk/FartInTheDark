import { showMenu } from './ui/menu';
import { createScene } from './render/scene';
import { runLocalGame } from './game/localGame';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const gs = createScene(canvas);
window.addEventListener('resize', () => gs.resize());
// block page scroll/zoom gestures on the game surface
document.addEventListener('touchmove', e => { if (!(e.target as HTMLElement).closest?.('.screen')) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', e => e.preventDefault());

const menu = () => {
  ui.innerHTML = '';
  gs.resize();
  gs.render();
  showMenu(ui, opts => { ui.innerHTML = ''; runLocalGame(ui, gs, opts, menu); });
};
menu();
