import * as THREE from 'three';
import type { Poly, Room } from '@fitd/sim';
import { toW } from './scene';

const WALL_H = 1;

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

  return group;
}

/** In the dark nothing in the room may glow; only lights (flashlight) reveal it. */
export function setRoomDark(group: THREE.Object3D, dark: boolean) {
  group.traverse(o => {
    const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (!mat || !('emissiveIntensity' in mat)) return;
    if (o.userData.glow === undefined) o.userData.glow = mat.emissiveIntensity;
    mat.emissiveIntensity = dark ? 0 : o.userData.glow;
  });
}

export function disposeGroup(g: THREE.Object3D) {
  g.traverse(o => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach(x => x.dispose());
  });
}
