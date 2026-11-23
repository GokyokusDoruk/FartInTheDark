import { showMenu } from './ui/menu';
import { createScene } from './render/scene';
import { runGame } from './game/play';
import { createLocalTransport } from './net/localTransport';
import { showOnline } from './ui/online';

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
  showMenu(ui, opts => { ui.innerHTML = ''; runGame(ui, gs, createLocalTransport(opts), { onMenu: menu }); }, () => showOnline(ui, gs, menu));
};

// a shared link (?oda=CODE) opens the online screen with the code filled in
const shared = new URLSearchParams(location.search).get('oda');
if (shared) {
  history.replaceState(null, '', location.pathname);
  gs.resize();
  showOnline(ui, gs, menu, { code: shared.toUpperCase().slice(0, 8) });
} else {
  menu();
}
