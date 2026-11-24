import * as THREE from 'three';
import {
  createResolution, createRng, stepResolution, stepMove, DT, TICK_HZ, DARK_SECONDS, SKILL_SECONDS,
  SUDDEN_DEATH_MOVE, SUDDEN_DEATH_STEP, type Player, type Resolution, type Room, type Vec2,
} from '@fitd/sim';
import { NET_GRACE_MS, REVEAL, type PlayerView, type Replay } from '@fitd/net';
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
import type { Transport } from '../net/transport';
import { blocksGame, overlayKey } from './linkState';
import { flashlightAngle } from './flashlight';

const SPECTATOR_DARK = 1.5;
type ClientPhase = 'wait' | 'skills' | 'dark' | 'reveal' | 'idle';

interface Actor { view: CharacterView; bar: HpBar; pose: Pose; poseT: number }
interface Body { id: string; pos: Vec2; aim: number; hp: number; alive: boolean }

/**
 * The game screen. It only draws what the room host says (views) and sends back what the
 * local player does; bots mode and online play differ only in the transport.
 */
export function runGame(ui: HTMLElement, gs: GameScene, transport: Transport, cb: { onMenu(): void }): { destroy(): void } {
  const root = new THREE.Group();
  gs.scene.add(root);
  const hud = createHud(ui);
  const gas = createGasView(root);
  const actors = new Map<string, Actor>();
  let actorIds = '';
  let roomGroup: THREE.Group | null = null;
  let roomRef: Room | null = null;
  let raf = 0;
  let disposed = false;

  let me = '';
  let cur: PlayerView | null = null;
  let curKey = '';
  const queue: PlayerView[] = [];
  let busy = false;
  let closeOverlay: (() => void) | null = null;

  // aim arrow on the floor (only for the local player in the dark)
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0.45, -0.06); arrowShape.lineTo(1.25, -0.06); arrowShape.lineTo(1.25, -0.2); arrowShape.lineTo(1.6, 0);
  arrowShape.lineTo(1.25, 0.2); arrowShape.lineTo(1.25, 0.06); arrowShape.lineTo(0.45, 0.06); arrowShape.closePath();
  const arrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe066, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
  arrow.visible = false;
  root.add(arrow);

  let localPos: Vec2 = { x: 0, y: 0 };
  let localAim = 0;
  const controls = createControls(gs.renderer.domElement, ui, () => {
    const v = toW(localPos, 0.8).project(gs.camera);
    const c = gs.renderer.domElement;
    return { x: (v.x + 1) / 2 * c.clientWidth, y: (1 - v.y) / 2 * c.clientHeight };
  });

  const colorOf = (id: string) => PLAYER_COLORS[Math.max(0, cur?.players.findIndex(p => p.id === id) ?? 0)];
  const mine = () => cur?.players.find(p => p.id === me);
  const isHost = () => !!cur && cur.hostId === me;

  const ensureActors = (v: PlayerView) => {
    const ids = v.players.map(p => p.id).join(',');
    if (ids === actorIds) return;
    for (const a of actors.values()) { root.remove(a.view.group); disposeGroup(a.view.group); }
    actors.clear();
    actorIds = ids;
    v.players.forEach((p, i) => {
      const view = createCharacter(PLAYER_COLORS[i]);
      const bar = createHpBar(p.id === me ? `${p.name} ${T.you}` : p.name, PLAYER_COLORS[i]);
      bar.sprite.position.set(0, 2.6, 0);
      view.group.add(bar.sprite);
      root.add(view.group);
      actors.set(p.id, { view, bar, pose: 'idle', poseT: 0 });
    });
  };
  const setPose = (id: string, pose: Pose) => {
    const a = actors.get(id);
    if (a && a.pose !== pose) { a.pose = pose; a.poseT = 0; }
  };
  const place = (bodies: Body[]) => {
    for (const b of bodies) {
      const a = actors.get(b.id);
      if (!a) continue;
      a.view.group.position.copy(toW(b.pos));
      a.view.setFacing(b.aim + Math.PI);
      a.view.setHealth(b.hp);
      a.bar.set(b.hp);
    }
  };
  const setupRoom = (room: Room) => {
    if (roomGroup && roomRef && JSON.stringify(roomRef) === JSON.stringify(room)) return;
    if (roomGroup) { root.remove(roomGroup); disposeGroup(roomGroup); }
    roomRef = room;
    roomGroup = buildRoom(room);
    root.add(roomGroup);
    gs.fit(room);
  };
  const leavePhase = () => {
    closeOverlay?.();
    closeOverlay = null;
    hud.setTimer(null); hud.banner(null); hud.hint(null);
  };

  // ---- incoming -----------------------------------------------------------
  transport.onMessage(msg => {
    if (disposed) return;
    if (msg.t === 'welcome') { me = msg.you; hideBlock(); }
    else if (msg.t === 'error') {
      if (blocksGame({ error: msg.code })) showBlock(T.errors[msg.code] ?? msg.code, false);
      else hud.hint(T.errors[msg.code] ?? msg.code);
    } else { queue.push(msg.view); pump(); }
  });
  transport.onStatus?.(s => {
    hud.status(s === 'online' ? null : s === 'reconnecting' ? T.reconnecting : T.connectionLost);
    if (blocksGame({ status: s })) showBlock(T.connectionLost, !!transport.retry);
    else if (s === 'online') hideBlock();
  });

  // a lost link / closed room: never leave the player on a dead screen
  let block: HTMLElement | null = null;
  function showBlock(text: string, canRetry: boolean) {
    hideBlock();
    block = document.createElement('div');
    block.className = 'screen clear';
    block.style.zIndex = '20';
    block.innerHTML = `<div class="title" style="font-size:26px">${text}</div>
      ${canRetry ? `<button class="btn" data-a="retry">${T.retry}</button>` : ''}
      <button class="btn ghost" data-a="menu">${T.menu}</button>`;
    ui.appendChild(block);
    const r = block.querySelector<HTMLButtonElement>('[data-a=retry]');
    if (r) r.onclick = () => { hideBlock(); hud.status(T.reconnecting); transport.retry?.(); };
    block.querySelector<HTMLButtonElement>('[data-a=menu]')!.onclick = () => { transport.send({ t: 'leave' }); destroy(); cb.onMenu(); };
  }
  function hideBlock() { block?.remove(); block = null; }

  function pump() {
    while (!busy && queue.length && !disposed) {
      const v = queue.shift()!;
      if (v.phase === 'lobby') continue;
      const key = `${v.round}:${v.moveSeq}:${v.phase}`;
      const fresh = key !== curKey;
      // e.g. the host left at match end: the new host needs the buttons now
      const redraw = !fresh && !!cur && overlayKey(cur, me) !== overlayKey(v, me);
      cur = v;
      curKey = key;
      if (fresh || redraw) enter(v);
    }
  }

  function enter(v: PlayerView) {
    leavePhase();
    ensureActors(v);
    hud.setTop(v.round, v.move, !mine()?.alive);
    if (v.room) setupRoom(v.room);
    if (v.phase === 'skills') enterSkills(v);
    else if (v.phase === 'dark') enterDark(v);
    else if (v.phase === 'resolve') enterReveal(v);
    else if (v.phase === 'roundEnd') {
      phase = 'idle';
      gs.setLight(1);
      closeOverlay = showRoundEnd(ui, v, me, isHost(), () => transport.send({ t: 'next' }));
    } else if (v.phase === 'matchEnd') {
      phase = 'idle';
      gs.setLight(1);
      closeOverlay = showMatchEnd(ui, v, me, isHost(), () => transport.send({ t: 'start' }), () => {
        transport.send({ t: 'leave' });
        destroy();
        cb.onMenu();
      });
    }
  }

  // ---- phases -------------------------------------------------------------
  let phase: ClientPhase = 'wait';
  let t = 0;
  let acc = 0;
  let steps = 0;
  let darkLen = DARK_SECONDS;
  let planSent = false;

  function enterSkills(v: PlayerView) {
    phase = 'skills';
    gs.setLight(0.5);
    gs.setFlashlight(false);
    arrow.visible = false;
    for (const p of v.players) {
      const a = actors.get(p.id)!;
      a.view.group.visible = p.alive;
      a.view.setGlow(false);
      setPose(p.id, 'idle');
    }
    place(v.players);
    const m = v.me;
    if (m?.alive && m.unspent > 0) {
      const seconds = Math.max(1, Math.min(SKILL_SECONDS, Math.floor(((v.remainingMs ?? 0) - NET_GRACE_MS) / 1000)));
      closeOverlay = showSkills(ui, {
        stats: m.stats, unspent: m.unspent, seconds,
        onConfirm: alloc => { closeOverlay = null; transport.send({ t: 'skills', alloc }); hud.hint(T.waitingOthers); },
      }).close;
    } else {
      hud.hint(m?.alive ? T.waitingOthers : null);
    }
  }

  function enterDark(v: PlayerView) {
    phase = 'dark';
    t = 0; acc = 0; steps = 0; planSent = false;
    gs.setLight(0);
    setRoomDark(roomGroup!, true);
    const m = v.me;
    const alive = !!m?.alive;
    const left = Math.max(0, ((v.remainingMs ?? 0) - NET_GRACE_MS) / 1000);
    darkLen = alive ? Math.min(DARK_SECONDS, left) : Math.min(SPECTATOR_DARK, left);
    if (m) { localPos = m.start; localAim = m.aim; }
    for (const p of v.players) {
      const a = actors.get(p.id)!;
      a.view.group.visible = p.id === me && alive;
      setPose(p.id, 'idle');
    }
    if (alive) {
      actors.get(me)?.view.setGlow(true);
      place([{ id: me, pos: localPos, aim: localAim, hp: mine()?.hp ?? 100, alive: true }]);
    }
    const sudden = v.move >= SUDDEN_DEATH_MOVE ? T.suddenDeath(SUDDEN_DEATH_STEP * (v.move - SUDDEN_DEATH_MOVE + 1)) : null;
    hud.hint(sudden ?? (alive ? (controls.isTouch() ? T.darkHint : T.darkHintDesktop) : null));
  }

  function updateDark(dt: number) {
    if (!cur) return;
    const m = cur.me;
    t += dt;
    if (m?.alive && !planSent) {
      acc += dt;
      while (acc >= DT && steps < DARK_SECONDS * TICK_HZ) {
        localPos = stepMove(cur.room!, localPos, controls.move(), DT);
        steps++;
        acc -= DT;
      }
      localAim = controls.aim() ?? localAim;
      const mv = controls.move();
      setPose(me, Math.hypot(mv.x, mv.y) > 0.1 && steps < DARK_SECONDS * TICK_HZ ? 'walk' : 'idle');
      const a = actors.get(me)!;
      a.view.group.position.copy(toW(localPos));
      a.view.setFacing(localAim + Math.PI);
      gs.setFlashlight(true, localPos, flashlightAngle(localAim));
      arrow.visible = true;
      arrow.position.copy(toW(localPos, 0.03));
      arrow.rotation.y = -localAim;
    }
    hud.setTimer(Math.max(0, darkLen - t));
    if (t >= darkLen && m?.alive && !planSent) {
      planSent = true;
      transport.send({ t: 'plan', pos: localPos, aim: localAim });
      gs.setFlashlight(false);
      arrow.visible = false;
      hud.hint(T.waitingOthers);
    }
  }

  // reveal: replay the server's resolution with the shared engine, then settle on its results
  let replay: Replay | null = null;
  let rPlayers: Player[] = [];
  let rRes: Resolution | null = null;
  let rRng = createRng(1);
  let revealDone = -1;
  const diedAt = new Set<string>();

  function enterReveal(v: PlayerView) {
    phase = 'reveal';
    busy = true;
    replay = v.replay!;
    rPlayers = JSON.parse(JSON.stringify(replay.players));
    rRng = createRng(replay.rngState);
    rRes = createResolution(rPlayers, replay.moveSeq, replay.room);
    t = 0; acc = 0; revealDone = -1;
    diedAt.clear();
    for (const p of rPlayers) if (!p.alive) diedAt.add(p.id);
    arrow.visible = false;
    gs.setFlashlight(false);
    setRoomDark(roomGroup!, false);
    actors.get(me)?.view.setGlow(false);
    hud.banner(T.reveal);
    for (const p of rPlayers) {
      const a = actors.get(p.id);
      if (a) a.view.group.visible = p.alive;
    }
    place(rPlayers);
  }

  function updateReveal(dt: number) {
    if (!replay || !rRes) return;
    t += dt;
    gs.setLight(Math.min(1, t / REVEAL.lightUp));
    if (t > REVEAL.lightUp + 0.6) hud.banner(null);
    if (t >= REVEAL.lightUp) {
      for (const p of rPlayers) {
        if (diedAt.has(p.id)) continue;
        if (!p.alive) { setPose(p.id, 'dead'); continue; }
        const own = rRes.clouds.find(c => c.owner === p.id);
        setPose(p.id, t < REVEAL.lightUp + REVEAL.bendLead || own?.alive ? 'bend' : 'grin');
      }
    }
    if (t >= REVEAL.lightUp + REVEAL.bendLead && !rRes.done) {
      acc += dt * REVEAL.slowmo;
      while (acc >= DT && !rRes.done) {
        const alive = new Set(rPlayers.filter(p => p.alive).map(p => p.id));
        stepResolution(rRes, replay.room, rPlayers, rRng);
        for (const p of rPlayers) if (alive.has(p.id) && !p.alive) { diedAt.add(p.id); setPose(p.id, 'dead'); }
        acc -= DT;
      }
      gas.sync(rRes, colorOf);
    }
    for (const p of rPlayers) { const a = actors.get(p.id); if (a) { a.view.setHealth(p.hp); a.bar.set(p.hp); } }
    if (rRes.done) {
      if (revealDone < 0) revealDone = t;
      if (t - revealDone >= REVEAL.after) finishReveal();
    }
  }

  function finishReveal() {
    const r = replay!;
    // the server's numbers win over any engine drift in this browser
    for (const a of r.after) {
      const actor = actors.get(a.id);
      if (!actor) continue;
      actor.view.setHealth(a.hp);
      actor.bar.set(a.hp);
      if (!a.alive) setPose(a.id, 'dead');
    }
    gas.clear();
    transport.send({ t: 'replayDone', moveSeq: r.moveSeq });
    replay = null;
    rRes = null;
    phase = 'wait';
    busy = false;
    pump();
  }

  // ---- loop ---------------------------------------------------------------
  let last = performance.now();
  const advance = (dt: number) => {
    transport.advance?.(dt);
    if (phase === 'dark') updateDark(dt);
    else if (phase === 'reveal') updateReveal(dt);
    for (const a of actors.values()) { a.poseT += dt; a.view.setPose(a.pose, a.poseT); }
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
  if (import.meta.env.DEV) (window as any).__fitd = { advance, view: () => cur, phase: () => phase, me: () => me, gs, actors };

  function destroy() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    closeOverlay?.();
    hideBlock();
    controls.destroy();
    hud.destroy();
    transport.close();
    gs.setFlashlight(false);
    gs.setLight(1);
    gs.scene.remove(root);
    disposeGroup(root);
    ui.innerHTML = '';
  }

  raf = requestAnimationFrame(frame);
  return { destroy };
}
