import { createJoystick } from './joystick';
import type { V } from './stick';

export interface Controls {
  /** walk input in sim space, length ≤ 1 */
  move(): V;
  /** gas direction in sim radians, or null if never aimed */
  aim(): number | null;
  isTouch(): boolean;
  destroy(): void;
}

/**
 * Screen right = sim +x, screen down = sim +y (camera never rotates),
 * so screen vectors map straight to sim vectors.
 */
export function createControls(canvas: HTMLElement, overlay: HTMLElement, playerScreen: () => V | null): Controls {
  const left = createJoystick(canvas, overlay, 'left');
  const right = createJoystick(canvas, overlay, 'right');
  const keys = new Set<string>();
  let mouseAim: number | null = null;
  let stickAim: number | null = null;
  let touch = matchMedia('(pointer: coarse)').matches;

  const kd = (e: KeyboardEvent) => { keys.add(e.key.toLowerCase()); };
  const ku = (e: KeyboardEvent) => { keys.delete(e.key.toLowerCase()); };
  const mm = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') { touch = true; return; }
    touch = false;
    const p = playerScreen();
    if (!p) return;
    const r = canvas.getBoundingClientRect();
    mouseAim = Math.atan2(e.clientY - r.top - p.y, e.clientX - r.left - p.x);
  };
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  window.addEventListener('pointermove', mm);

  return {
    move() {
      const s = left.value();
      let x = s.x, y = s.y;
      if (keys.has('a') || keys.has('arrowleft')) x -= 1;
      if (keys.has('d') || keys.has('arrowright')) x += 1;
      if (keys.has('w') || keys.has('arrowup')) y -= 1;
      if (keys.has('s') || keys.has('arrowdown')) y += 1;
      const l = Math.hypot(x, y);
      return l > 1 ? { x: x / l, y: y / l } : { x, y };
    },
    aim() {
      const r = right.value();
      if (Math.hypot(r.x, r.y) > 0.3) stickAim = Math.atan2(r.y, r.x);
      return touch ? stickAim ?? mouseAim : mouseAim ?? stickAim;
    },
    isTouch: () => touch,
    destroy() {
      left.destroy(); right.destroy();
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('pointermove', mm);
    },
  };
}
