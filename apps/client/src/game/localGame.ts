import * as THREE from 'three';
import {
  startMatch, allocateSkills, endSkills, submitPlan, beginResolve, stepResolution, finishResolve, nextRound, winners,
  botAllocate, botPlan, stepMove, DT, TICK_HZ, DARK_SECONDS, SKILL_SECONDS, SUDDEN_DEATH_MOVE, SUDDEN_DEATH_STEP,
  type MatchState, type Vec2,
} from '@fitd/sim';
import type { GameScene } from '../render/scene';
import { toW } from '../render/scene';
import { buildRoom, disposeGroup, setRoomDark } from '../render/roomView';
import { createCharacter, type CharacterView, type Pose } from '../render/character';
import { createHpBar, type HpBar } from '../render/hpBar';
import { createGasView } from '../render/gasView';
import { PLAYER_COLORS } from '../render/colors';
import { createControls } from '../input/controls';
import { showSkills } from '../ui/skills';
import { createHud, showRoundEnd, showMatchEnd } from '../ui/hud';
import { T } from '../ui/strings';
import type { StartOptions } from '../ui/menu';

const ME = 'me';
const SLOWMO = 0.35;
const LIGHT_UP = 0.4;
const BEND_LEAD = 0.5;
const AFTER_RESOLVE = 1.5;
const SPECTATOR_DARK = 1.5;

type ClientPhase = 'skills' | 'dark' | 'reveal' | 'idle';

interface Actor { view: CharacterView; bar: HpBar; pose: Pose; poseT: number }

export function runLocalGame(ui: HTMLElement, gs: GameScene, opts: StartOptions, onMenu: () => void): { destroy(): void } {
  const root = new THREE.Group();
  gs.scene.add(root);
  const hud = createHud(ui);
  const gas = createGasView(root);
  const actors = new Map<string, Actor>();
  let roomGroup: THREE.Group | null = null;
  let raf = 0;
  let disposed = false;

  const s: MatchState = startMatch({
    seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0,
    players: [
      { id: ME, name: opts.name, isBot: false },
      ...Array.from({ length: opts.bots }, (_, i) => ({ id: `bot${i + 1}`, name: `Bot ${i + 1}`, isBot: true, difficulty: opts.difficulty })),
    ],
  });
  const me = () => s.players.find(p => p.id === ME)!;
  const colorOf = (id: string) => PLAYER_COLORS[s.players.findIndex(p => p.id === id)];

  s.players.forEach(p => {
    const view = createCharacter(colorOf(p.id));
    const bar = createHpBar(p.id === ME ? `${p.name} ${T.you}` : p.name, colorOf(p.id));
    bar.sprite.position.set(0, 2.6, 0);
    view.group.add(bar.sprite);
    root.add(view.group);
    actors.set(p.id, { view, bar, pose: 'idle', poseT: 0 });
  });

  // aim arrow on the floor (only for the local player in the dark)
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0.45, -0.06); arrowShape.lineTo(1.25, -0.06); arrowShape.lineTo(1.25, -0.2); arrowShape.lineTo(1.6, 0);
  arrowShape.lineTo(1.25, 0.2); arrowShape.lineTo(1.25, 0.06); arrowShape.lineTo(0.45, 0.06); arrowShape.closePath();
  const arrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe066, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
  arrow.visible = false;
  root.add(arrow);

  let localPos: Vec2 = me().pos;
  let localAim = me().aim;
  const controls = createControls(gs.renderer.domElement, ui, () => {
    const v = toW(localPos, 0.8).project(gs.camera);
    const c = gs.renderer.domElement;
    return { x: (v.x + 1) / 2 * c.clientWidth, y: (1 - v.y) / 2 * c.clientHeight };
  });

  const setPose = (id: string, pose: Pose) => {
    const a = actors.get(id)!;
    if (a.pose !== pose) { a.pose = pose; a.poseT = 0; }
  };
  const placeActors = () => {
    for (const p of s.players) {
      const a = actors.get(p.id)!;
      a.view.group.position.copy(toW(p.pos));
      a.view.setFacing(p.aim + Math.PI);
      a.view.setHealth(p.hp);
      a.bar.set(p.hp);
    }
  };
  const setupRoom = () => {
    if (roomGroup) { root.remove(roomGroup); disposeGroup(roomGroup); }
    roomGroup = buildRoom(s.room);
    root.add(roomGroup);
    gs.fit(s.room);
  };

  // ---- phases -------------------------------------------------------------
  let phase: ClientPhase = 'idle';
  let t = 0;
  let acc = 0;
  let steps = 0;
  let darkLen = DARK_SECONDS;
  let revealDone = -1;
  const diedAt = new Map<string, number>();
  let closeSkills: (() => void) | null = null;

  const route = () => {
    if (disposed) return;
    hud.setTop(s.round, s.move, !me().alive);
    if (s.phase === 'skills') enterSkills();
    else if (s.phase === 'dark') enterDark();
    else if (s.phase === 'resolve') enterReveal();
    else if (s.phase === 'roundEnd') {
      phase = 'idle';
      gs.setLight(1);
      showRoundEnd(ui, s, ME, () => { nextRound(s); diedAt.clear(); route(); });
    } else {
      phase = 'idle';
      gs.setLight(1);
      showMatchEnd(ui, s, ME, winners(s), () => { destroy(); runLocalGame(ui, gs, opts, onMenu); }, () => { destroy(); onMenu(); });
    }
  };

  function enterSkills() {
    phase = 'skills';
    setupRoom();
    gs.setLight(0.5);
    gs.setFlashlight(false);
    arrow.visible = false;
    hud.setTimer(null); hud.banner(null); hud.hint(null);
    for (const p of s.players) {
      const a = actors.get(p.id)!;
      a.view.group.visible = p.alive;
      a.view.setGlow(false);
      setPose(p.id, 'idle');
      if (p.isBot && p.alive && p.unspent > 0) allocateSkills(s, p.id, botAllocate(s, p.id));
    }
    placeActors();
    const m = me();
    const go = () => { closeSkills = null; endSkills(s); route(); };
    if (m.alive && m.unspent > 0) {
      closeSkills = showSkills(ui, {
        stats: m.stats, unspent: m.unspent, seconds: SKILL_SECONDS,
        onConfirm: alloc => { try { allocateSkills(s, ME, alloc); } catch { /* endSkills auto-fills */ } go(); },
      }).close;
    } else {
      setTimeout(() => { if (!disposed) go(); }, 700);
    }
  }

  function enterDark() {
    phase = 'dark';
    t = 0; acc = 0; steps = 0;
    setupRoom();
    gs.setLight(0);
    setRoomDark(roomGroup!, true);
    const m = me();
    darkLen = m.alive ? DARK_SECONDS : SPECTATOR_DARK;
    localPos = m.pos;
    localAim = m.aim;
    for (const p of s.players) {
      const a = actors.get(p.id)!;
      a.view.group.visible = p.id === ME && p.alive;
      setPose(p.id, 'idle');
    }
    actors.get(ME)!.view.setGlow(true);
    placeActors();
    hud.banner(null);
    const sudden = s.move >= SUDDEN_DEATH_MOVE ? T.suddenDeath(SUDDEN_DEATH_STEP * (s.move - SUDDEN_DEATH_MOVE + 1)) : null;
    hud.hint(sudden ?? (m.alive ? (controls.isTouch() ? T.darkHint : T.darkHintDesktop) : null));
  }

  function updateDark(dt: number) {
    const m = me();
    t += dt;
    if (m.alive) {
      acc += dt;
      while (acc >= DT && steps < DARK_SECONDS * TICK_HZ) {
        localPos = stepMove(s.room, localPos, controls.move(), DT);
        steps++;
        acc -= DT;
      }
      localAim = controls.aim() ?? localAim;
      const a = actors.get(ME)!;
      a.view.group.position.copy(toW(localPos));
      a.view.setFacing(localAim + Math.PI);
      gs.setFlashlight(true, localPos, localAim);
      arrow.visible = true;
      arrow.position.copy(toW(localPos, 0.03));
      arrow.rotation.y = -localAim;
    }
    hud.setTimer(Math.max(0, darkLen - t));
    if (t >= darkLen) {
      if (m.alive) submitPlan(s, ME, { pos: localPos, aim: localAim });
      for (const p of s.players) if (p.isBot && p.alive) submitPlan(s, p.id, botPlan(s, p.id));
      beginResolve(s);
      route();
    }
  }

  function enterReveal() {
    phase = 'reveal';
    t = 0; acc = 0; revealDone = -1;
    arrow.visible = false;
    gs.setFlashlight(false);
    setRoomDark(roomGroup!, false);
    actors.get(ME)!.view.setGlow(false);
    hud.setTimer(null); hud.hint(null);
    hud.banner(T.reveal);
    for (const p of s.players) actors.get(p.id)!.view.group.visible = p.alive;
    placeActors();
  }

  function updateReveal(dt: number) {
    t += dt;
    gs.setLight(Math.min(1, t / LIGHT_UP));
    const res = s.resolution!;
    if (t > LIGHT_UP + 0.6) hud.banner(null);
    if (t >= LIGHT_UP) {
      for (const p of s.players) {
        if (diedAt.has(p.id)) continue;
        if (!p.alive) { setPose(p.id, 'dead'); continue; }
        const own = res.clouds.find(c => c.owner === p.id);
        setPose(p.id, t < LIGHT_UP + BEND_LEAD || own?.alive ? 'bend' : 'grin');
      }
    }
    if (t >= LIGHT_UP + BEND_LEAD && !res.done) {
      acc += dt * SLOWMO;
      while (acc >= DT && !res.done) {
        const alive = new Set(s.players.filter(p => p.alive).map(p => p.id));
        stepResolution(res, s.room, s.players, s.rng);
        for (const p of s.players) if (alive.has(p.id) && !p.alive) { diedAt.set(p.id, t); setPose(p.id, 'dead'); }
        acc -= DT;
      }
      gas.sync(res, colorOf);
    }
    for (const p of s.players) { const a = actors.get(p.id)!; a.view.setHealth(p.hp); a.bar.set(p.hp); }
    if (res.done) {
      if (revealDone < 0) revealDone = t;
      if (t - revealDone >= AFTER_RESOLVE) {
        gas.clear();
        finishResolve(s);
        route();
      }
    }
  }

  // ---- loop ---------------------------------------------------------------
  let last = performance.now();
  const advance = (dt: number) => {
    if (phase === 'dark') updateDark(dt);
    else if (phase === 'reveal') updateReveal(dt);
    for (const a of actors.values()) { a.poseT += dt; a.view.setPose(a.pose, a.poseT); }
    roomGroup?.traverse(o => { if (o.userData.spin) o.rotation.y += dt * 1.5; });
  };
  const frame = (now: number) => {
    if (disposed) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    advance(dt);
    gs.render();
    raf = requestAnimationFrame(frame);
  };
  // dev-only hook so automated checks can drive the game while the tab is hidden
  if (import.meta.env.DEV) (window as any).__fitd = { advance, state: () => s, phase: () => phase };

  function destroy() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    closeSkills?.();
    controls.destroy();
    hud.destroy();
    gs.setFlashlight(false);
    gs.setLight(1);
    gs.scene.remove(root);
    disposeGroup(root);
    ui.innerHTML = '';
  }

  route();
  raf = requestAnimationFrame(frame);
  return { destroy };
}
