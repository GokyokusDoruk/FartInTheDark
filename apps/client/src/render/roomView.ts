import * as THREE from 'three';
import type { Poly, Room } from '@fitd/sim';
import { toW } from './scene';

const WALL_H = 1;
const ZONE_COLORS = { grow: 0x7bd36b, shrink: 0x4aa3ff, redirect: 0xff9a3c } as const;

function polyShape(poly: Poly): THREE.Shape {
  const s = new THREE.Shape();
  poly.forEach((p, i) => (i ? s.lineTo(p.x, p.y) : s.moveTo(p.x, p.y)));
  s.closePath();
  return s;
}

/** Extrude a sim polygon upwards (sim y → world z). */
function prism(poly: Poly, height: number, mat: THREE.Material): THREE.Mesh {
  const g = new THREE.ExtrudeGeometry(polyShape(poly), { depth: height, bevelEnabled: false });
  g.rotateX(Math.PI / 2); // shape (x,y,z) → (x,-z,y)
  const m = new THREE.Mesh(g, mat);
  m.position.y = height;
  return m;
}

export function buildRoom(room: Room): THREE.Group {
  const group = new THREE.Group();

  const floorGeo = new THREE.ShapeGeometry(polyShape(room.bounds));
  floorGeo.rotateX(Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.95, side: THREE.DoubleSide }));
  group.add(floor);

  // outer walls: thin slabs along each boundary edge + glowing outline always visible in the dark
  const outerMat = new THREE.MeshStandardMaterial({ color: 0x3a4166, roughness: 0.8 });
  const b = room.bounds;
  for (let i = 0; i < b.length; i++) {
    const p = b[i], q = b[(i + 1) % b.length];
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(len + 0.3, WALL_H * 0.6, 0.3), outerMat);
    slab.position.set((p.x + q.x) / 2, WALL_H * 0.3, (p.y + q.y) / 2);
    slab.rotation.y = -Math.atan2(q.y - p.y, q.x - p.x);
    // push outward so the inner face sits on the boundary
    const nx = q.y - p.y, nz = -(q.x - p.x);
    slab.position.x += (nx / len) * 0.15;
    slab.position.z += (nz / len) * 0.15;
    group.add(slab);
  }
  const outline = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(b.map(p => toW(p, 0.62))),
    new THREE.LineBasicMaterial({ color: 0x9aa6ff }),
  );
  group.add(outline);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x6b5b95, roughness: 0.7 });
  const wallTopMat = new THREE.MeshStandardMaterial({ color: 0x8c7bbd, roughness: 0.6 });
  for (const w of room.walls) {
    const m = prism(w, WALL_H, wallMat);
    group.add(m);
    const top = new THREE.Mesh(new THREE.ShapeGeometry(polyShape(w)).rotateX(Math.PI / 2), wallTopMat);
    top.position.y = WALL_H + 0.002;
    (top.material as THREE.Material).side = THREE.DoubleSide;
    group.add(top);
  }

  const metal = new THREE.MeshStandardMaterial({ color: 0xb8c2cc, metalness: 0.85, roughness: 0.25 });
  for (const p of room.pipes) {
    const a = toW(p.inlet), c = toW(p.outlet);
    const mid = a.clone().add(c).multiplyScalar(0.5);
    const h = 1.2 + a.distanceTo(c) * 0.12;
    const curve = new THREE.CatmullRomCurve3([
      a.clone().setY(0.3), a.clone().setY(h * 0.8), mid.clone().setY(h), c.clone().setY(h * 0.8), c.clone().setY(0.3),
    ]);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.16, 12, false), metal));
    for (const [pt, color] of [[a, 0x222222], [c, 0x222222]] as const) {
      const mouth = new THREE.Mesh(new THREE.CylinderGeometry(p.radius, p.radius, 0.3, 24, 1, true), metal);
      mouth.position.copy(pt).setY(0.15);
      group.add(mouth);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(p.radius * 0.9, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color }));
      hole.position.copy(pt).setY(0.29);
      group.add(hole);
    }
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.45, 12), new THREE.MeshStandardMaterial({ color: 0xff5a5f }));
    arrow.rotation.z = -Math.PI / 2;
    arrow.rotation.y = -Math.atan2(p.outDir.y, p.outDir.x);
    arrow.position.copy(c).add(new THREE.Vector3(p.outDir.x, 0, p.outDir.y).multiplyScalar(p.radius + 0.3)).setY(0.15);
    group.add(arrow);
  }

  for (const z of room.zones) {
    const color = ZONE_COLORS[z.kind];
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(z.radius, 40).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, transparent: true, opacity: 0.55 }),
    );
    disc.position.copy(toW(z.center, 0.01));
    group.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(z.radius * 0.92, z.radius, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color }));
    ring.position.copy(toW(z.center, 0.015));
    group.add(ring);
    const icon = new THREE.Mesh(
      z.kind === 'redirect' ? new THREE.ConeGeometry(0.22, 0.5, 3) : new THREE.SphereGeometry(z.kind === 'grow' ? 0.28 : 0.14, 16, 12),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 }),
    );
    icon.position.copy(toW(z.center, 0.35));
    if (z.kind === 'redirect') { icon.rotation.z = -Math.PI / 2; icon.rotation.y = -(z.turn ?? 0); }
    icon.userData.spin = true;
    group.add(icon);
  }
  return group;
}

export function disposeGroup(g: THREE.Object3D) {
  g.traverse(o => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach(x => x.dispose());
  });
}
