import * as THREE from 'three';
import { faceColor } from './colors';

export const CHARACTER_SCALE = 1.8;
export type Pose = 'idle' | 'bend' | 'grin' | 'dead';
type Face = 'smile' | 'strain' | 'grin' | 'dead' | 'sick';

export interface CharacterView {
  group: THREE.Group;
  /** t = seconds since pose started (for animation) */
  setPose(p: Pose, t: number): void;
  /** sim angle the character's face looks towards */
  setFacing(rad: number): void;
  setHealth(hp: number): void;
  setGlow(on: boolean): void;
}

const faceCache = new Map<Face, THREE.CanvasTexture>();
function faceTexture(face: Face): THREE.CanvasTexture {
  const hit = faceCache.get(face);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.lineCap = 'round';
  g.strokeStyle = g.fillStyle = '#1a1a1a';
  g.lineWidth = 7;
  const eye = (x: number) => {
    if (face === 'dead') { g.beginPath(); g.moveTo(x - 10, 38); g.lineTo(x + 10, 58); g.moveTo(x + 10, 38); g.lineTo(x - 10, 58); g.stroke(); }
    else if (face === 'strain') { g.beginPath(); g.moveTo(x - 11, 44); g.lineTo(x + 11, 52); g.stroke(); }
    else if (face === 'sick') { g.beginPath(); g.arc(x, 48, 9, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(x + 2, 50, 3, 0, Math.PI * 2); g.fill(); }
    else { g.beginPath(); g.arc(x, 48, face === 'grin' ? 9 : 7, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x - 3, 45, 3, 0, Math.PI * 2); g.fill(); g.fillStyle = '#1a1a1a'; }
  };
  eye(42); eye(86);
  g.beginPath();
  if (face === 'grin') {
    g.fillStyle = '#5a1010'; g.moveTo(30, 74); g.quadraticCurveTo(64, 120, 98, 74); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.fillRect(40, 76, 48, 9);
  } else if (face === 'strain') { g.moveTo(40, 88); g.lineTo(52, 82); g.lineTo(64, 90); g.lineTo(76, 82); g.lineTo(88, 88); g.stroke(); }
  else if (face === 'dead') { g.moveTo(44, 92); g.quadraticCurveTo(64, 80, 84, 92); g.stroke(); g.fillStyle = '#e66'; g.beginPath(); g.ellipse(70, 98, 8, 11, 0, 0, Math.PI * 2); g.fill(); }
  else if (face === 'sick') { g.moveTo(42, 90); g.quadraticCurveTo(53, 80, 64, 90); g.quadraticCurveTo(75, 100, 86, 90); g.stroke(); }
  else { g.moveTo(40, 80); g.quadraticCurveTo(64, 104, 88, 80); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  faceCache.set(face, t);
  return t;
}

export function createCharacter(color: number): CharacterView {
  const group = new THREE.Group(); // position only (hp bar etc. attach here)
  const facing = new THREE.Group(); // yaw
  const model = new THREE.Group(); // pose
  model.scale.setScalar(CHARACTER_SCALE);
  group.add(facing);
  facing.add(model);
  const shirt = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const pants = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.55), roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: faceColor(100), roughness: 0.5 });

  // legs (fixed), hips pivot carries torso + butt + head
  const legGeo = new THREE.CapsuleGeometry(0.07, 0.3, 4, 8);
  const legL = new THREE.Mesh(legGeo, pants), legR = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.1, 0.22, 0); legR.position.set(0.1, 0.22, 0);
  model.add(legL, legR);

  const hips = new THREE.Group();
  hips.position.y = 0.42;
  model.add(hips);

  const butt = new THREE.Group();
  const cheekGeo = new THREE.SphereGeometry(0.15, 16, 12);
  const cheekL = new THREE.Mesh(cheekGeo, pants), cheekR = new THREE.Mesh(cheekGeo, pants);
  cheekL.position.set(-0.09, 0, -0.08); cheekR.position.set(0.09, 0, -0.08);
  butt.add(cheekL, cheekR);
  hips.add(butt);

  const torso = new THREE.Group();
  hips.add(torso);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.3, 6, 12), shirt);
  body.position.y = 0.28;
  torso.add(body);
  const armGeo = new THREE.CapsuleGeometry(0.05, 0.28, 4, 8);
  const armL = new THREE.Mesh(armGeo, shirt), armR = new THREE.Mesh(armGeo, shirt);
  armL.position.set(-0.23, 0.32, 0); armR.position.set(0.23, 0.32, 0);
  armL.rotation.z = 0.35; armR.rotation.z = -0.35;
  torso.add(armL, armR);

  const head = new THREE.Group();
  head.position.y = 0.68;
  torso.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), skin);
  head.add(skull);
  const faceMat = new THREE.MeshBasicMaterial({ map: faceTexture('smile'), transparent: true, depthWrite: false });
  const facePlane = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), faceMat);
  facePlane.position.set(0, 0, 0.215);
  head.add(facePlane);

  let hp = 100;
  let pose: Pose = 'idle';
  const setFace = (f: Face) => { if (faceMat.map !== faceTexture(f)) { faceMat.map = faceTexture(f); faceMat.needsUpdate = true; } };
  const restFace = (): Face => (hp < 50 ? 'sick' : 'smile');

  return {
    group,
    setPose(p, t) {
      pose = p;
      model.rotation.x = model.rotation.z = 0;
      model.position.y = 0;
      hips.rotation.set(0, 0, 0);
      armL.rotation.x = armR.rotation.x = 0;
      head.rotation.set(0, 0, 0);
      if (p === 'bend') {
        const k = Math.min(1, t / 0.35);
        hips.rotation.x = 1.15 * k; // lean forward, butt points back
        head.rotation.x = -0.9 * k; // keep looking ahead
        armL.rotation.x = armR.rotation.x = -0.6 * k;
        butt.scale.setScalar(1 + 0.12 * Math.sin(t * 30) * k);
        setFace('strain');
      } else if (p === 'grin') {
        butt.scale.setScalar(1);
        model.position.y = Math.abs(Math.sin(t * 6)) * 0.06;
        head.rotation.z = Math.sin(t * 4) * 0.15;
        setFace(hp < 50 ? 'sick' : 'grin');
      } else if (p === 'dead') {
        butt.scale.setScalar(1);
        const k = Math.min(1, t / 0.5);
        model.rotation.x = -(Math.PI / 2) * k;
        model.position.y = 0.2 * k;
        armL.rotation.x = armR.rotation.x = -1.4 * k;
        setFace('dead');
      } else {
        butt.scale.setScalar(1);
        model.position.y = Math.sin(t * 2) * 0.01;
        setFace(restFace());
      }
    },
    setFacing(rad) {
      facing.rotation.y = Math.atan2(Math.cos(rad), Math.sin(rad));
    },
    setHealth(h) {
      hp = h;
      skin.color.set(faceColor(h));
      if (pose === 'idle') setFace(restFace());
    },
    setGlow(on) {
      for (const m of [shirt, skin]) { m.emissive.set(on ? 0x333333 : 0x000000); }
    },
  };
}
