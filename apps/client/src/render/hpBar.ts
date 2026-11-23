import * as THREE from 'three';
import { hpBarColor } from './colors';

export interface HpBar { sprite: THREE.Sprite; set(hp: number): void }

export function createHpBar(name: string, dotColor: number): HpBar {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const g = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(2.2, 0.82, 1);
  sprite.renderOrder = 10;
  let last = -1;
  const set = (hp: number) => {
    const h = Math.max(0, Math.round(hp));
    if (h === last) return;
    last = h;
    g.clearRect(0, 0, 256, 96);
    g.font = 'bold 30px system-ui, sans-serif';
    g.textAlign = 'center';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.7)';
    g.fillStyle = '#' + dotColor.toString(16).padStart(6, '0');
    g.strokeText(name, 128, 32); g.fillText(name, 128, 32);
    g.fillStyle = 'rgba(0,0,0,.65)';
    g.beginPath(); g.roundRect(28, 44, 200, 40, 12); g.fill();
    g.fillStyle = hpBarColor(h);
    g.beginPath(); g.roundRect(32, 48, Math.max(0, 192 * h / 100), 32, 9); g.fill();
    g.fillStyle = '#fff';
    g.font = 'bold 28px system-ui, sans-serif';
    g.strokeText(String(h), 128, 74); g.fillText(String(h), 128, 74);
    tex.needsUpdate = true;
  };
  set(100);
  return { sprite, set };
}
