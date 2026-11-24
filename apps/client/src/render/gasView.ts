import * as THREE from 'three';
import type { Resolution } from '@fitd/sim';
import { GAS_SPEED } from '@fitd/sim';

const MAX_PARTICLES = 600;
const MAX_PUFFS = 8 * 18;
const PUFFS_PER_CLOUD = 18;
const TRAIL_LEN = 3.2; // metres of tube behind the head
const HEIGHT = 0.6; // butt height
const TUBE_SEGMENTS = 40;
const TUBE_SIDES = 10;

export interface GasView { sync(res: Resolution, ownerColor: (id: string) => number): void; clear(): void }

interface CloudView {
  trail: THREE.Vector3[];
  tube: THREE.Mesh;
  tubeMat: THREE.MeshStandardMaterial;
  head: THREE.Mesh;
  headMat: THREE.MeshStandardMaterial;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  color: THREE.Color;
  seed: number;
}

/** Light, slightly washed-out version of the player colour for the gas. */
const gasColor = (c: number) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), 0.18);

/**
 * Gas is drawn as a thin, soft tube in the owner's colour: a translucent sheath along the path the
 * cloud took, with brighter puffs swirling inside it and a puffy head. A faint ring on the floor
 * shows the real (wider) area that hurts.
 */
export function createGasView(scene: THREE.Object3D): GasView {
  const root = new THREE.Group();
  scene.add(root);
  const clouds = new Map<number, CloudView>();
  const sphere = new THREE.SphereGeometry(1, 12, 10);

  const puffMat = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.75, roughness: 1, depthWrite: false, emissive: 0x222222 });
  const puffs = new THREE.InstancedMesh(sphere, puffMat, MAX_PUFFS);
  puffs.count = 0;
  puffs.frustumCulled = false;
  root.add(puffs);

  const pMat = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.8, roughness: 1, depthWrite: false, emissive: 0x222222 });
  const particles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), pMat, MAX_PARTICLES);
  particles.count = 0;
  particles.frustumCulled = false;
  root.add(particles);

  const m4 = new THREE.Matrix4();
  const tmp = new THREE.Vector3();

  const make = (id: number, owner: number): CloudView => {
    const color = gasColor(owner);
    const tubeMat = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.35, transparent: true, opacity: 0.38, roughness: 1, depthWrite: false, side: THREE.DoubleSide,
    });
    const tube = new THREE.Mesh(new THREE.BufferGeometry(), tubeMat);
    tube.frustumCulled = false;
    const headMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45, transparent: true, opacity: 0.65, roughness: 1, depthWrite: false });
    const head = new THREE.Mesh(sphere, headMat);
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2), ringMat);
    root.add(tube, head, ring);
    const v: CloudView = { trail: [], tube, tubeMat, head, headMat, ring, ringMat, color, seed: id * 1.37 };
    clouds.set(id, v);
    return v;
  };

  /** Rebuild the tube along the trail, thin at the tail and fattest just behind the head. */
  const rebuildTube = (v: CloudView, radius: number) => {
    v.tube.geometry.dispose();
    if (v.trail.length < 2) { v.tube.geometry = new THREE.BufferGeometry(); return null; }
    const curve = new THREE.CatmullRomCurve3(v.trail);
    const geo = new THREE.TubeGeometry(curve, TUBE_SEGMENTS, radius, TUBE_SIDES, false);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const nrm = geo.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i <= TUBE_SEGMENTS; i++) {
      const u = i / TUBE_SEGMENTS;
      const centre = curve.getPointAt(u);
      const taper = 0.25 + 0.75 * Math.min(1, u * 1.6);
      for (let j = 0; j <= TUBE_SIDES; j++) {
        const k = i * (TUBE_SIDES + 1) + j;
        tmp.set(nrm.getX(k), nrm.getY(k), nrm.getZ(k)).multiplyScalar(radius * taper).add(centre);
        pos.setXYZ(k, tmp.x, tmp.y, tmp.z);
      }
    }
    pos.needsUpdate = true;
    v.tube.geometry = geo;
    return curve;
  };

  return {
    sync(res, ownerColor) {
      let n = 0;
      for (const c of res.clouds) {
        const v = clouds.get(c.id) ?? make(c.id, ownerColor(c.owner));
        const show = c.alive;
        v.tube.visible = v.head.visible = v.ring.visible = show;
        if (!show) continue;
        const at = new THREE.Vector3(c.pos.x, HEIGHT, c.pos.y);
        const last = v.trail[v.trail.length - 1];
        if (last && last.distanceTo(at) > 1.2) v.trail = []; // big jump: start a new trail
        if (!last || last.distanceTo(at) > 0.04) v.trail.push(at);
        // once the cloud has stopped, the tail catches up and the tube shrinks into a puff
        const moving = c.travelled < c.range - 1e-3;
        let keep = moving ? TRAIL_LEN : Math.max(0, TRAIL_LEN - (c.age - c.range / GAS_SPEED) * GAS_SPEED * 1.5);
        for (let i = v.trail.length - 1; i > 0; i--) {
          keep -= v.trail[i].distanceTo(v.trail[i - 1]);
          if (keep < 0) { v.trail = v.trail.slice(i); break; }
        }
        const fade = Math.min(1, (c.life - c.age) / (c.life * 0.3));
        const tubeR = 0.09 + c.radius * 0.09; // thin: 0.15-0.24 m for radius 0.7-1.7
        const curve = rebuildTube(v, tubeR);
        v.tubeMat.opacity = 0.38 * fade;
        v.headMat.opacity = 0.65 * fade;
        v.ringMat.opacity = 0.16 * fade;
        const wob = 1 + Math.sin(c.age * 9 + v.seed) * 0.12;
        v.head.position.copy(at);
        v.head.scale.setScalar(tubeR * 1.9 * wob);
        v.ring.position.set(c.pos.x, 0.03, c.pos.y);
        v.ring.scale.setScalar(c.radius);
        // gas swirling inside the tube
        if (curve) {
          for (let k = 0; k < PUFFS_PER_CLOUD && n < MAX_PUFFS; k++) {
            const u = (k / PUFFS_PER_CLOUD + c.age * 0.9 + v.seed) % 1;
            const p = curve.getPointAt(u);
            const ang = c.age * 6 + k * 2.4;
            const off = tubeR * 0.35;
            const s = tubeR * (0.45 + 0.35 * Math.abs(Math.sin(k * 1.7 + c.age * 3))) * (0.3 + 0.7 * u) * fade;
            m4.makeScale(s, s, s).setPosition(p.x + Math.cos(ang) * off, p.y + Math.sin(ang) * off, p.z + Math.sin(ang * 0.7) * off);
            puffs.setMatrixAt(n, m4);
            puffs.setColorAt(n, v.color);
            n++;
          }
        }
      }
      puffs.count = n;
      puffs.instanceMatrix.needsUpdate = true;
      if (puffs.instanceColor) puffs.instanceColor.needsUpdate = true;

      let m = 0;
      for (const p of res.particles) {
        if (!p.alive || m >= MAX_PARTICLES) continue;
        const s = p.radius * (1 - p.age / p.life * 0.5);
        m4.makeScale(s, s, s).setPosition(p.pos.x, 0.35, p.pos.y);
        particles.setMatrixAt(m, m4);
        particles.setColorAt(m, gasColor(ownerColor(p.owner)));
        m++;
      }
      particles.count = m;
      particles.instanceMatrix.needsUpdate = true;
      if (particles.instanceColor) particles.instanceColor.needsUpdate = true;
    },
    clear() {
      for (const v of clouds.values()) {
        root.remove(v.tube, v.head, v.ring);
        v.tube.geometry.dispose();
        v.ring.geometry.dispose();
        v.tubeMat.dispose(); v.headMat.dispose(); v.ringMat.dispose();
      }
      clouds.clear();
      puffs.count = 0;
      particles.count = 0;
    },
  };
}
