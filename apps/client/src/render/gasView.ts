import * as THREE from 'three';
import type { Resolution } from '@fitd/sim';
import { toW } from './scene';

const GAS = new THREE.Color(0xa8d84e);
const MAX_PARTICLES = 600;

export interface GasView { sync(res: Resolution, ownerColor: (id: string) => number): void; clear(): void }

export function createGasView(scene: THREE.Object3D): GasView {
  const root = new THREE.Group();
  scene.add(root);
  const puffGeo = new THREE.SphereGeometry(1, 16, 12);
  const clouds = new Map<number, { g: THREE.Group; mat: THREE.MeshStandardMaterial; seed: number }>();

  const pMat = new THREE.MeshStandardMaterial({ color: GAS, emissive: GAS, emissiveIntensity: 0.35, transparent: true, opacity: 0.8 });
  const particles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), pMat, MAX_PARTICLES);
  particles.count = 0;
  particles.frustumCulled = false;
  root.add(particles);
  const m4 = new THREE.Matrix4();

  const makeCloud = (id: number, tint: number) => {
    const mat = new THREE.MeshStandardMaterial({
      color: GAS.clone().lerp(new THREE.Color(tint), 0.22), emissive: GAS, emissiveIntensity: 0.25,
      transparent: true, opacity: 0.6, roughness: 1, depthWrite: false,
    });
    const g = new THREE.Group();
    const offs = [[0, 0, 0, 1], [0.55, 0.15, 0.2, 0.7], [-0.5, 0.1, -0.25, 0.75], [0.1, 0.45, -0.4, 0.6], [-0.2, 0.35, 0.45, 0.65]];
    for (const [x, y, z, s] of offs) {
      const m = new THREE.Mesh(puffGeo, mat);
      m.position.set(x, y, z);
      m.scale.setScalar(s);
      g.add(m);
    }
    root.add(g);
    const c = { g, mat, seed: id * 1.7 };
    clouds.set(id, c);
    return c;
  };

  return {
    sync(res, ownerColor) {
      for (const c of res.clouds) {
        let v = clouds.get(c.id);
        if (!v) v = makeCloud(c.id, ownerColor(c.owner));
        v.g.visible = c.alive;
        if (!c.alive) continue;
        const wobble = 1 + Math.sin(c.age * 7 + v.seed) * 0.06;
        v.g.position.copy(toW(c.pos, c.radius * 0.7));
        v.g.scale.setScalar(c.radius * wobble);
        v.g.rotation.y = c.age * 0.8 + v.seed;
        const fade = Math.min(1, (c.life - c.age) / (c.life * 0.3));
        v.mat.opacity = 0.6 * fade;
      }
      let n = 0;
      for (const p of res.particles) {
        if (!p.alive || n >= MAX_PARTICLES) continue;
        const s = p.radius * (1 - p.age / p.life * 0.5);
        m4.makeScale(s, s, s).setPosition(p.pos.x, 0.35, p.pos.y);
        particles.setMatrixAt(n++, m4);
      }
      particles.count = n;
      particles.instanceMatrix.needsUpdate = true;
    },
    clear() {
      for (const v of clouds.values()) { root.remove(v.g); v.mat.dispose(); }
      clouds.clear();
      particles.count = 0;
    },
  };
}
