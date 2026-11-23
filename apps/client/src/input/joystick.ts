import { stickVector, type V } from './stick';

export interface Joystick { value(): V; active(): boolean; destroy(): void }

const RADIUS = 55;

/**
 * Floating touch joystick: appears where a finger lands on its half of `el`.
 * Each stick follows only its own pointerId, so both thumbs work at once.
 */
export function createJoystick(el: HTMLElement, overlay: HTMLElement, side: 'left' | 'right'): Joystick {
  let id: number | null = null;
  let origin: V = { x: 0, y: 0 };
  let val: V = { x: 0, y: 0 };
  const base = document.createElement('div');
  base.className = 'stick';
  base.style.display = 'none';
  const knob = document.createElement('div');
  knob.className = 'knob';
  base.appendChild(knob);
  overlay.appendChild(base);

  const mine = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    const left = e.clientX - r.left < r.width / 2;
    return side === 'left' ? left : !left;
  };
  const down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' || id !== null || !mine(e)) return;
    id = e.pointerId;
    origin = { x: e.clientX, y: e.clientY };
    val = { x: 0, y: 0 };
    base.style.display = 'block';
    base.style.left = `${origin.x}px`;
    base.style.top = `${origin.y}px`;
    knob.style.transform = 'translate(-50%, -50%)';
    e.preventDefault();
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    val = stickVector(origin, { x: e.clientX, y: e.clientY }, RADIUS);
    knob.style.transform = `translate(calc(-50% + ${val.x * RADIUS}px), calc(-50% + ${val.y * RADIUS}px))`;
    e.preventDefault();
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = null;
    // the right stick keeps its last direction (aim persists); the left stops walking
    if (side === 'left') val = { x: 0, y: 0 };
    base.style.display = 'none';
  };
  el.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  return {
    value: () => val,
    active: () => id !== null,
    destroy() {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      base.remove();
    },
  };
}
