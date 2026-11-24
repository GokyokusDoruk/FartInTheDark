import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { faceColor } from './colors';

/** Quaternius "Male Character" (CC0), 4.84 units tall → about 2.2 m on screen like the old figure. */
const MODEL_URL = `${import.meta.env.BASE_URL}models/character.glb`;
const MODEL_SCALE = 0.45;

export type Pose = 'idle' | 'walk' | 'bend' | 'grin' | 'dead';

export interface CharacterView {
  group: THREE.Group;
  /** t = seconds since pose started (for animation) */
  setPose(p: Pose, t: number): void;
  /** sim angle the character's face looks towards */
  setFacing(rad: number): void;
  setHealth(hp: number): void;
  setGlow(on: boolean): void;
}

let asset: { scene: THREE.Group; clips: THREE.AnimationClip[] } | null = null;

/** Load the character once before the first game. */
export async function loadCharacterAsset(): Promise<void> {
  if (asset) return;
  const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
  asset = { scene: gltf.scene, clips: gltf.animations };
}

const clip = (name: string) => asset!.clips.find(c => c.name.endsWith(`Man_${name}`))!;

export function createCharacter(color: number): CharacterView {
  if (!asset) throw new Error('loadCharacterAsset() first');
  const group = new THREE.Group(); // position only (hp bar etc. attach here)
  const facing = new THREE.Group(); // yaw
  group.add(facing);
  const model = cloneSkinned(asset.scene) as THREE.Group;
  model.scale.setScalar(MODEL_SCALE);
  facing.add(model);

  // per-player materials: shirt in the player colour, darker trousers, skin that turns sick
  const mats: THREE.MeshStandardMaterial[] = [];
  let skin: THREE.MeshStandardMaterial | null = null;
  model.traverse(o => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh) return;
    m.castShadow = false;
    m.frustumCulled = false;
    const list = (Array.isArray(m.material) ? m.material : [m.material]).map(src => {
      const mat = (src as THREE.MeshStandardMaterial).clone();
      if (mat.name === 'Shirt') mat.color.set(color);
      if (mat.name === 'Pants') mat.color.set(color).multiplyScalar(0.35);
      if (mat.name === 'Skin') skin = mat;
      mats.push(mat);
      return mat;
    });
    m.material = Array.isArray(m.material) ? list : list[0];
  });

  const bone = (n: string) => model.getObjectByName(n) as THREE.Bone;
  const abdomen = bone('Abdomen'), torso = bone('Torso'), neck = bone('Neck'), head = bone('Head');
  const hips = bone('Hips');
  // bones we bend by hand: restore their rest pose each frame so the extra bend never accumulates
  const bent = [abdomen, torso, neck, head, hips];
  const rest = bent.map(b => ({ q: b.quaternion.clone(), p: b.position.clone() }));

  const mixer = new THREE.AnimationMixer(model);
  const actions = {
    idle: mixer.clipAction(clip('Idle')),
    walk: mixer.clipAction(clip('Walk')),
    clap: mixer.clipAction(clip('Clapping')),
    stand: mixer.clipAction(clip('Standing')),
    death: mixer.clipAction(clip('Death')),
  };
  actions.death.setLoop(THREE.LoopOnce, 1);
  actions.death.clampWhenFinished = true;
  let current: THREE.AnimationAction | null = null;
  const play = (a: THREE.AnimationAction, fade = 0.2) => {
    if (current === a) return;
    a.reset().play();
    if (current) a.crossFadeFrom(current, fade, false);
    current = a;
  };

  let pose: Pose | null = null;
  let lastT = 0;

  return {
    group,
    setPose(p, t) {
      if (p !== pose) {
        pose = p;
        lastT = t;
        play(p === 'walk' ? actions.walk : p === 'grin' ? actions.clap : p === 'dead' ? actions.death : p === 'bend' ? actions.stand : actions.idle, p === 'dead' ? 0.1 : 0.2);
      }
      bent.forEach((b, i) => { b.quaternion.copy(rest[i].q); b.position.copy(rest[i].p); });
      mixer.update(Math.max(0, t - lastT));
      lastT = t;
      // procedural bend on top of the clip: bow forward so the butt points back (towards the aim)
      if (p === 'bend') {
        const k = Math.min(1, t / 0.3);
        abdomen.rotation.x += 0.75 * k;
        torso.rotation.x += 0.55 * k;
        neck.rotation.x -= 0.5 * k;
        head.rotation.x -= 0.45 * k;
        hips.rotation.z += Math.sin(t * 30) * 0.06 * k; // butt wiggle
      }
    },
    setFacing(rad) {
      facing.rotation.y = Math.atan2(Math.cos(rad), Math.sin(rad));
    },
    setHealth(h) {
      skin?.color.set(faceColor(h)); // poisoned: skin goes green, then purple
    },
    setGlow(on) {
      for (const m of mats) m.emissive.set(on ? 0x2a2a2a : 0x000000);
    },
  };
}
