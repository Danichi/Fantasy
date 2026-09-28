import * as THREE from 'three';
import { Renderer } from './render/renderer';
import { physics } from './physics/physics';
import { buildTerrain, heightAt } from './world/terrain';
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
import { events } from './core/events';
import { buildWorld } from './world/props';
import { Grass } from './world/grass';

const STEP = 1 / 60;

async function boot() {
  const container = document.getElementById('game')!;
  const r = new Renderer(container);
  const input = new Input(r.renderer.domElement);
  await physics.init();
  await r.loadSky('/assets/hdri/sky_1k.hdr');
  buildTerrain(r.scene, r.renderer);

  const player = new Player();
  const spawn = new THREE.Vector3(0, heightAt(0, 10), 10);
  await player.init(r.scene, spawn);
  setupLoadout(player.equip);
  buildIcons(r.renderer, r.scene.environment);

  const fx = new FX(r.scene, heightAt);
  const slimes = new SlimeSpawner(r.scene, fx);
  if (TEST_MODE) slimes.enabled = false;
  const spells = new Spells(r.scene, fx, player);
  const world = await buildWorld(r.scene, r.renderer, fx);
  const grass = new Grass(r.scene);

  const cam = new ThirdPersonCamera(r.camera, input);
  cam.snapTo(player.pos);
  player.onShake = (a) => cam.shake(a);

  // ---- UI ------------------------------------------------------------------
  const hud = new HUD(player, r.camera);
  const inv = new InventoryUI(player);
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
  hud.onHotbarDrop = (slot, uid) => {
    const eq = player.equip;
    eq.hotbar = eq.hotbar.map((u) => (u === uid ? null : u));
    eq.hotbar[slot] = uid;
    hud.markHotbarDirty();
  };
  inv.onToggle = (open) => {
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
    const it = eq.get(eq.hotbar[i]);
    if (!it || player.dead) return;
    hud.pulseSlot(i);
    const k = it.def.kind;
    if (k === 'consumable') return player.useConsumable(it.uid);
    if (k === 'spell') return eq.equip(it.uid);
    if (player.act) return hud.toast('Finish your action first');
    if (k === 'sword') eq.equip(it.uid, input.shift ? 'off' : 'main');
    else eq.equip(it.uid);
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
    acc += dt;
    let steps = 0;
    if (paused || overlayUp) acc = 0;
    while (acc >= STEP && steps < 5) {
      acc -= STEP;
      steps++;
      if (hitStop > 0) {
        hitStop -= STEP;
        input.endStep();
        continue;
      }
      simSteps++;
      if (input.wasPressed('inventory')) inv.toggle();
      if (input.wasPressed('help')) overlays.toggleHelp();
      slotActions.forEach((a, i) => input.wasPressed(a) && useHotbar(i));
      player.update(STEP, input, cam);
      slimes.update(STEP, player);
      spells.update(STEP);
      world.update(STEP);
      fx.update(STEP, r.renderer.domElement.height, r.camera.fov);
      physics.step(STEP);
      input.endStep();
    }
    if (steps >= 5) acc = 0;
    const t1 = performance.now();

    const alpha = acc / STEP;
    player.renderPosition(alpha, renderPos);
    player.char.root.position.copy(renderPos);
    cam.update(dt, renderPos, player.sprinting);
    r.camera.getWorldDirection(player.aimDir);
    grass.update(dt, r.camera.position, renderPos);
    input.endFrame();
    hud.update(dt, player.lock?.id ?? null);
    r.followShadow(renderPos);
    r.render();
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
