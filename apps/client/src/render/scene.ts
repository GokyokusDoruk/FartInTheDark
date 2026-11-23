import * as THREE from 'three';
import type { Room, Vec2 } from '@fitd/sim';
import { FLASHLIGHT_RANGE } from '@fitd/sim';

/** Sim (x, y) → world (x, height, y). */
export const toW = (p: Vec2, h = 0) => new THREE.Vector3(p.x, h, p.y);

export interface GameScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** 0 = pitch dark, 1 = lights on. */
  setLight(level: number): void;
  setFlashlight(on: boolean, pos?: Vec2, aim?: number): void;
  fit(room: Room): void;
  resize(): void;
  render(): void;
}

const DARK_BG = new THREE.Color(0x04050a);
const LIT_BG = new THREE.Color(0x1b1f34);
const TILT = (58 * Math.PI) / 180;

export function createScene(canvas: HTMLCanvasElement): GameScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = LIT_BG.clone();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);

  const hemi = new THREE.HemisphereLight(0xfff6e5, 0x30355a, 1.4);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-6, 20, -4);
  scene.add(hemi, sun);

  const flash = new THREE.SpotLight(0xffe9b0, 40, FLASHLIGHT_RANGE * 1.9, 0.75, 0.5, 1.2);
  const flashTarget = new THREE.Object3D();
  flash.target = flashTarget;
  flash.visible = false;
  scene.add(flash, flashTarget);
  const glow = new THREE.PointLight(0xffe9b0, 3, 1.1, 1.5);
  glow.visible = false;
  scene.add(glow);

  let center = new THREE.Vector3(7, 0, 10);
  let corners: THREE.Vector3[] = [];

  const place = (d: number) => {
    camera.position.set(center.x, center.y + d * Math.sin(TILT), center.z + d * Math.cos(TILT));
    camera.lookAt(center);
    camera.updateMatrixWorld();
  };

  /** Pull the camera in until the room (incl. wall/character height) just fits the screen. */
  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    let d = 30;
    for (let i = 0; i < 6 && corners.length; i++) {
      place(d);
      let m = 0;
      for (const c of corners) {
        const p = c.clone().project(camera);
        m = Math.max(m, Math.abs(p.x), Math.abs(p.y));
      }
      d *= (m / 0.94) ** 0.9;
    }
    place(d);
  };

  return {
    renderer, scene, camera,
    setLight(level) {
      const l = Math.max(0, Math.min(1, level));
      hemi.intensity = 1.4 * l;
      sun.intensity = 1.6 * l;
      (scene.background as THREE.Color).copy(DARK_BG).lerp(LIT_BG, l);
    },
    setFlashlight(on, pos, aim) {
      flash.visible = glow.visible = on;
      if (!on || !pos || aim === undefined) return;
      flash.position.copy(toW(pos, 0.9));
      flashTarget.position.copy(toW({ x: pos.x + Math.cos(aim) * FLASHLIGHT_RANGE, y: pos.y + Math.sin(aim) * FLASHLIGHT_RANGE }, 0));
      glow.position.copy(toW(pos, 1.2));
    },
    fit(room) {
      center = toW(room.center);
      corners = room.bounds.flatMap(b => [toW(b, 0), toW(b, 1.2)]);
      resize();
    },
    resize,
    render: () => renderer.render(scene, camera),
  };
}
