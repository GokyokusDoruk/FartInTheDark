import * as THREE from 'three';
import type { Resolution } from '@fitd/sim';
import { GAS_SPEED } from '@fitd/sim';

const MAX_PARTICLES = 600;
const STREAK_LEN = 1.8; // metres of tracer behind the head
const HEIGHT = 0.6; // butt height
const SIDES = 12;

export interface GasView { sync(res: Resolution, ownerColor: (id: string) => number): void; clear(): void }

interface CloudView {
  trail: THREE.Vector3[];
  core: THREE.Mesh;
  coreMat: THREE.MeshStandardMaterial;
  glow: THREE.Mesh;
  glowMat: THREE.MeshBasicMaterial;
  head: THREE.Mesh;
  headMat: THREE.MeshStandardMaterial;
}

const gasColor = (c: number) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), 0.15);

/** Drop points that lie on the straight line between their neighbours (the path is straight between bounces). */
function corners(pts: THREE.Vector3[]): THREE.Vector3[] {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 1; i < pts.length - 1; i++) {
    a.subVectors(pts[i], out[out.length - 1]).normalize();
    b.subVectors(pts[i + 1], pts[i]).normalize();
    if (a.dot(b) < 0.999) out.push(pts[i]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * Gas is a straight tracer in the owner's colour, exactly as wide as the area it hurts: a solid,
 * glowing core that tapers towards its tail, a faint soft sheath around it, and a rounded head.
 * It bends only where it bounced off a wall.
 */
export function createGasView(scene: THREE.Object3D): GasView {
  const root = new THREE.Group();
  scene.add(root);
  const clouds = new Map<number, CloudView>();
  const sphere = new THREE.SphereGeometry(1, 16, 12);

  // scatter: small pellets flying out sideways, stretched along their flight
  const pMat = new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: 0x333333 });
  const particles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), pMat, MAX_PARTICLES);
  particles.count = 0;
  particles.frustumCulled = false;
  root.add(particles);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const X = new THREE.Vector3(1, 0, 0);
  const dir = new THREE.Vector3();

  const make = (id: number, owner: number): CloudView => {
    const color = gasColor(owner);
    const coreMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.5, transparent: true, opacity: 0.92 });
    const core = new THREE.Mesh(new THREE.BufferGeometry(), coreMat);
    const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false });
    const glow = new THREE.Mesh(new THREE.BufferGeometry(), glowMat);
    const headMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, roughness: 0.4, transparent: true, opacity: 0.95 });
    const head = new THREE.Mesh(sphere, headMat);
    core.frustumCulled = glow.frustumCulled = false;
    root.add(glow, core, head);
    const v: CloudView = { trail: [], core, coreMat, glow, glowMat, head, headMat };
    clouds.set(id, v);
    return v;
  };

  /** Tube along straight segments, tapering from `radius` at the head to a point-ish tail. */
  const tube = (pts: THREE.Vector3[], radius: number, tail: number): THREE.BufferGeometry => {
    const path = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(pts[i - 1], pts[i]));
    const segs = Math.max(4, pts.length * 8);
    const geo = new THREE.TubeGeometry(path, segs, radius, SIDES, false);
    const p = geo.attributes.position as THREE.BufferAttribute, n = geo.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const centre = path.getPointAt(u);
      const r = radius * (tail + (1 - tail) * Math.min(1, u * 1.4));
      for (let j = 0; j <= SIDES; j++) {
        const k = i * (SIDES + 1) + j;
        pos.set(n.getX(k), n.getY(k), n.getZ(k)).multiplyScalar(r).add(centre);
        p.setXYZ(k, pos.x, pos.y, pos.z);
      }
    }
    p.needsUpdate = true;
    return geo;
  };

  return {
    sync(res, ownerColor) {
      for (const c of res.clouds) {
        const v = clouds.get(c.id) ?? make(c.id, ownerColor(c.owner));
        v.core.visible = v.glow.visible = v.head.visible = c.alive;
        if (!c.alive) continue;
        const at = new THREE.Vector3(c.pos.x, HEIGHT, c.pos.y);
        const last = v.trail[v.trail.length - 1];
        if (!last || last.distanceTo(at) > 0.02) v.trail.push(at);
        // once it stops (range used up) the tail catches up and it shrinks into the head
        const moving = c.travelled < c.range - 1e-3;
        let keep = moving ? STREAK_LEN : Math.max(0, STREAK_LEN - (c.age - c.range / GAS_SPEED) * GAS_SPEED * 2);
        for (let i = v.trail.length - 1; i > 0; i--) {
          const d = v.trail[i].distanceTo(v.trail[i - 1]);
          if (keep < d) {
            // cut the oldest segment exactly at the streak length
            const cut = v.trail[i].clone().lerp(v.trail[i - 1], Math.max(0, keep) / d);
            v.trail = [cut, ...v.trail.slice(i)];
            break;
          }
          keep -= d;
        }
        const fade = Math.min(1, (c.life - c.age) / (c.life * 0.25));
        const pts = corners(v.trail);
        v.core.geometry.dispose();
        v.glow.geometry.dispose();
        if (pts.length >= 2 && pts[0].distanceTo(pts[pts.length - 1]) > 0.05) {
          v.core.geometry = tube(pts, c.radius * 0.65, 0.15);
          v.glow.geometry = tube(pts, c.radius, 0.3);
        } else {
          v.core.geometry = new THREE.BufferGeometry();
          v.glow.geometry = new THREE.BufferGeometry();
        }
        v.coreMat.opacity = 0.92 * fade;
        v.glowMat.opacity = 0.3 * fade;
        v.headMat.opacity = 0.95 * fade;
        // rounded, slightly stretched head pointing where it flies
        dir.set(c.dir.x, 0, c.dir.y).normalize();
        q.setFromUnitVectors(X, dir);
        const stretch = moving ? 1.6 : 1;
        m4.compose(at, q, sc.set(c.radius * stretch, c.radius, c.radius));
        v.head.matrixAutoUpdate = false;
        v.head.matrix.copy(m4);
      }

      let m = 0;
      for (const p of res.particles) {
        if (!p.alive || m >= MAX_PARTICLES) continue;
        const s = 0.06 * (1 - (p.age / p.life) * 0.4);
        dir.set(p.vel.x, 0, p.vel.y).normalize();
        q.setFromUnitVectors(X, dir);
        m4.compose(pos.set(p.pos.x, HEIGHT * 0.9, p.pos.y), q, sc.set(s * 2.6, s, s));
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
        root.remove(v.core, v.glow, v.head);
        v.core.geometry.dispose(); v.glow.geometry.dispose();
        v.coreMat.dispose(); v.glowMat.dispose(); v.headMat.dispose();
      }
      clouds.clear();
      particles.count = 0;
    },
  };
}
