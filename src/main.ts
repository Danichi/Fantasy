import * as THREE from 'three';
import { Renderer } from './render/renderer';
import { physics, PhysicsDebug } from './physics/physics';
import { Terrain, initTerrainData, heightAt } from './world/terrain';
import { Input } from './core/input';
import { Player } from './player/player';
import { ThirdPersonCamera } from './player/camera';
import { DEBUG, TEST_MODE } from './core/settings';
import { setupLoadout } from './items/loadout';
import { FX } from './fx/particles';
import { SlimeSpawner } from './enemies/spawner';
import { Spells } from './magic/spells';
import { buildIcons } from './ui/icons';
import { HUD } from './ui/hud';
import { InventoryUI, buildOverlays } from './ui/inventory';
import { CharPreview } from './ui/charPreview';
import { events } from './core/events';
import { buildWorld } from './world/props';
import { Grass } from './world/grass';
import { River } from './world/water';
import { Foliage } from './world/foliage';
import { Flowers } from './world/flowers';

const STEP = 1 / 60;

async function boot() {
  const container = document.getElementById('game')!;
  const r = new Renderer(container);
  const input = new Input(r.renderer.domElement);
  await physics.init();
  await r.loadSky('/assets/hdri/sky_1k.hdr');
  initTerrainData();
  const terrain = new Terrain(r.scene, r.renderer);

  const player = new Player();
  const spawn = new THREE.Vector3(0, heightAt(0, 10), 10);
  terrain.warm(spawn);
  await player.init(r.scene, spawn);
  setupLoadout(player.equip);
  buildIcons(r.renderer, r.scene.environment);

  const fx = new FX(r.scene, heightAt);
  const slimes = new SlimeSpawner(r.scene, fx);
  if (TEST_MODE) slimes.enabled = false;
  const spells = new Spells(r.scene, fx, player);
  const world = await buildWorld(r.scene, r.renderer, fx);
  const grass = new Grass(r.scene, terrain.splat);
  const river = new River(r.scene);
  const foliage = new Foliage(r.scene, r.renderer);
  const flowers = new Flowers(r.scene, terrain.splat);
  const physDebug = new URLSearchParams(location.search).get('debug') === 'physics' ? new PhysicsDebug(r.scene) : null;

  const cam = new ThirdPersonCamera(r.camera, input);
  cam.snapTo(player.pos);
  player.onShake = (a) => cam.shake(a);
  player.onPlungeLand = (at) => {
    fx.dust(at, 3);
    fx.add.spawn({ pos: at.clone().setY(at.y + 0.2), spread: 7, count: 30, life: [0.2, 0.5], size: [0.12, 0.02], color: 0xfff1c8, color2: 0xff9a3a, gravity: 6, upBias: 0.3 });
  };

  // ---- UI ------------------------------------------------------------------
  const hud = new HUD(player, r.camera);
  const preview = new CharPreview(r.renderer, r.scene, player, [r.sun, r.hemi]);
  const inv = new InventoryUI(player, preview);
  inv.onQuickDrop = (slot, uid) => hud.onSlotDrop?.('items', slot, uid);
  let started = TEST_MODE;
  // Paused only when the player releases the mouse with Esc; the pause
  // overlay is always visible while paused, so the game never freezes silently.
  let pausedByUser = false;
  let hadLock = false;
  const overlays = buildOverlays(() => {
    started = true;
    pausedByUser = false;
    input.fallbackLook = true;
    input.requestLock();
  });
  input.onLockFailed = () => hud.toast('Mouse not captured: click the game to capture it');
  if (TEST_MODE) overlays.start.classList.add('hidden');
  hud.onSlotDrop = (mode, slot, uid) => {
    const eq = player.equip;
    const it = eq.get(uid);
    if (!it) return;
    // Quick items take consumables; the moveset takes spells (and skills later).
    if (mode === 'items' && it.def.kind === 'consumable' && slot < eq.quick.length) {
      eq.quick = eq.quick.map((u) => (u === uid ? null : u));
      eq.quick[slot] = uid;
    } else if (mode === 'moves' && it.def.kind === 'spell') {
      eq.moves = eq.moves.map((u) => (u === uid ? null : u));
      eq.moves[slot] = uid;
    } else hud.toast(mode === 'items' ? 'Quick slots take potions and other usables' : 'The moveset takes spells and skills');
    hud.markHotbarDirty();
  };
  inv.onToggle = (open) => {
    document.body.classList.toggle('inv-open', open);
    input.uiMode = open;
    if (open) input.exitLock();
    else input.requestLock();
  };
  const pause = () => {
    if (!started || TEST_MODE || inv.open) return;
    pausedByUser = true;
    overlays.showPaused(true);
  };
  document.addEventListener('pointerlockchange', () => {
    if (input.locked) hadLock = true;
    // Losing a lock we had (Esc, alt-tab) pauses; a lock that never took doesn't.
    else if (hadLock) {
      hadLock = false;
      pause();
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && !input.locked && !inv.open && !pausedByUser) pause();
  });

  const useHotbar = (i: number) => {
    const eq = player.equip;
    if (player.dead) return;
    if (hud.mode === 'items') {
      const it = eq.get(eq.quick[i]);
      if (!it) return;
      hud.pulseSlot(i);
      if (it.def.kind === 'consumable') player.useConsumable(it.uid);
      hud.markHotbarDirty();
    } else {
      const it = eq.get(eq.moves[i]);
      if (!it) return;
      hud.pulseSlot(i);
      player.castMove(it.uid);
      hud.markHotbarDirty();
    }
  };

  events.on('playerDied', () => {
    setTimeout(() => {
      player.respawn(spawn);
      cam.snapTo(spawn);
    }, 4200);
  });

  // ---- loop -----------------------------------------------------------------
  let hitStop = 0;
  let paused = false;
  let simSteps = 0;
  player.onHitStop = (s) => (hitStop = Math.max(hitStop, s));

  let acc = 0;
  let last = performance.now();
  let fpsAcc = 0, fpsFrames = 0;
  const renderPos = new THREE.Vector3();
  const slotActions = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6', 'slot7', 'slot8'] as const;

  const perf = { sim: 0, render: 0, frame: 0 };
  const frame = (now: number) => {
    const t0 = performance.now();
    // rAF timestamps can precede `last` after a long stall (shader compiles), so
    // clamp at 0 as well as capping big gaps.
    const dtMs = Math.max(0, Math.min(100, now - last));
    last = now;
    const dt = dtMs / 1000;
    // Pause the world while the title/pause overlay is up (never in tests).
    const overlayUp = !TEST_MODE && (!started || pausedByUser);
    // Hit-stop is a brief slow-motion rather than a hard freeze.
    const timeScale = hitStop > 0 ? 0.1 : 1;
    hitStop = Math.max(0, hitStop - dt);
    const simDt = dt * timeScale;
    acc += simDt;
    let steps = 0;
    if (paused || overlayUp) acc = 0;
    while (acc >= STEP && steps < 5) {
      acc -= STEP;
      steps++;
      simSteps++;
      if (input.wasPressed('inventory')) inv.toggle();
      if (input.wasPressed('help')) overlays.toggleHelp();
      if (input.wasPressed('toggleBar')) hud.setMode(hud.mode === 'items' ? 'moves' : 'items');
      slotActions.forEach((a, i) => input.wasPressed(a) && useHotbar(i));
      player.update(STEP, input, cam);
      slimes.update(STEP, player);
      spells.update(STEP);
      world.update(STEP);
      river.update(STEP);
      fx.update(STEP, r.renderer.domElement.height, r.camera.fov);
      physics.step(STEP);
      input.endStep();
    }
    if (steps >= 5) acc = 0;
    const t1 = performance.now();

    const alpha = acc / STEP;
    if (!paused) player.present(alpha, overlayUp ? 0 : simDt);
    renderPos.copy(player.char.root.position);
    cam.update(dt, renderPos, player.sprinting);
    r.camera.getWorldDirection(player.aimDir);
    grass.update(dt, r.camera.position, renderPos);
    flowers.update(dt, r.camera.position);
    terrain.update(r.camera.position, player.pos);
    foliage.update(dt, r.camera.position);
    input.endFrame();
    hud.update(dt, player.lock?.id ?? null);
    physDebug?.update();
    r.followShadow(renderPos);
    r.render(dt);
    if (inv.open) preview.render();
    const t2 = performance.now();
    perf.sim = perf.sim * 0.9 + (t1 - t0) * 0.1;
    perf.render = perf.render * 0.9 + (t2 - t1) * 0.1;
    perf.frame = perf.frame * 0.9 + dtMs * 0.1;
    r.trackFrame(dtMs, now);

    fpsAcc += dtMs;
    fpsFrames++;
    if (fpsAcc > 1000) {
      (window as any).__fps = Math.round((fpsFrames * 1000) / fpsAcc);
      fpsAcc = 0;
      fpsFrames = 0;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  if (DEBUG || TEST_MODE) {
    (window as any).__game = {
      THREE, r, input, player, cam, physics, fx, slimes, spells, hud, inv,
      perf,
      pause: (p: boolean) => (paused = p),
      get steps() {
        return simSteps;
      },
      useHotbar,
      /** freeze the player in an action at time t (seconds) for inspection */
      pose: (id: string, t: number) => {
        paused = true;
        player.debugPose(id, t);
      },
    };
  }
  (window as any).__ready = true;
}

boot();
