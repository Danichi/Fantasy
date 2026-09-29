// Fonts are bundled so the game works offline (desktop build).
import './render/stylize';
import { initCompressedGltf } from './core/gltf';
import '@fontsource/cinzel/500.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import * as THREE from 'three';
import { Renderer, SUN_DIR } from './render/renderer';
import { physics, PhysicsDebug } from './physics/physics';
import { Terrain, initTerrainData, heightAt } from './world/terrain';
import { Input } from './core/input';
import { Player } from './player/player';
import { ThirdPersonCamera } from './player/camera';
import { DEBUG, TEST_MODE } from './core/settings';
import { setupLoadout } from './items/loadout';
import { FX } from './fx/particles';
import { BeastSpawner } from './enemies/beastSpawner';
import { Spells } from './magic/spells';
import { buildIcons } from './ui/icons';
import { HUD } from './ui/hud';
import { InventoryUI, buildOverlays } from './ui/inventory';
import { Music } from './audio/music';
import { Ambient } from './world/ambient';
import { CharPreview } from './ui/charPreview';
import { events } from './core/events';
import { buildWorld } from './world/props';
import { FrontierRegion } from './world/frontier';
import { Grass } from './world/grass';
import { River } from './world/water';
import { Foliage } from './world/foliage';
import { StylizedNature } from './world/stylizedNature';
import { Flowers } from './world/flowers';
import { Rewards, XP_FOR_KIND } from './progression/progression';
import { DungeonMapUI } from './ui/dungeonMap';
import { Realm } from './dungeon/realm';
import { Town, NPCS } from './npc/town';
import { DialogueUI } from './ui/dialogue';
import { loadArmourKit } from './enemies/armourKit';
import { loadSave, writeSave, applySave, hasSave, clearSave } from './save';

const STEP = 1 / 60;

const bootTimes: Record<string, number> = {};
let bootLast = performance.now();
const mark = (k: string) => {
  const n = performance.now();
  bootTimes[k] = Math.round(n - bootLast);
  bootLast = n;
};
(window as any).__boot = bootTimes;

async function boot() {
  const container = document.getElementById('game')!;
  const r = new Renderer(container);
  initCompressedGltf(r.renderer);
  const input = new Input(r.renderer.domElement);
  await physics.init();
  r.useStylizedSky();
  mark('sky');
  initTerrainData();
  mark('heights');
  const terrain = new Terrain(r.scene, r.renderer);
  mark('terrain');

  const player = new Player();
  const spawn = new THREE.Vector3(0, heightAt(0, 10), 10);
  terrain.warm(spawn);
  await player.init(r.scene, spawn);
  mark('player');
  const saveData = TEST_MODE && !location.search.includes('save') ? null : loadSave();
  if (saveData) applySave(player, saveData);
  else setupLoadout(player.equip);

  const fx = new FX(r.scene, heightAt);
  const slimes = new BeastSpawner(r.scene, fx);
  if (TEST_MODE) slimes.enabled = false;
  const spells = new Spells(r.scene, fx, player);
  // The village leaves NPC spots, the guild and the stables open.
  const keepClear = [...NPCS.map((n) => new THREE.Vector2(n.pos[0], n.pos[1])), new THREE.Vector2(22, -12), new THREE.Vector2(48, -39)];
  const world = await buildWorld(r.scene, r.renderer, fx, keepClear);
  mark('world');
  const grass = new Grass(r.scene, terrain.splat);
  grass.setSunDir(SUN_DIR);
  mark('grass');
  const river = new River(r.scene);
  mark('river');
  const stylizedNature = new StylizedNature(r.scene, world.village);
  await stylizedNature.ready;
  const foliage = stylizedNature.loaded ? null : new Foliage(r.scene, r.renderer);
  mark('foliage');
  mark('stylizedNature');
  const flowers = new Flowers(r.scene, terrain.splat);
  const ambient = new Ambient(r.scene, world.village.flowerSpots);
  mark('flowers');
  const rewards = new Rewards(r.scene, player.prog);
  events.on('enemyDied', ({ at, kind }) => {
    const [xp, gold] = XP_FOR_KIND[kind] ?? [10, 2];
    rewards.spawn(at, xp, gold);
    // Combat Legacy learns from the whole fight, not only the pickup meter.
    player.prog.combat.addHeroicXp(Math.max(1, xp * 0.08));
  });
  events.on('bossSlam', ({ at }) => cam.shake(Math.max(0.15, 0.6 - at.distanceTo(player.pos) * 0.04)));
  events.on('levelUp', () => {
    player.hp = player.maxHp;
    player.mana = player.maxMana;
    player.stamina = player.maxStamina;
    fx.add.spawn({ pos: player.center, spread: 3, count: 60, life: [0.6, 1.3], size: [0.1, 0.01], color: 0xcfe8ff, color2: 0x5a9cff, upBias: 1.5, drag: 1.5, jitter: 0.6 });
    save();
  });
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
  const mapUI = new DungeonMapUI();
  let frontier!: FrontierRegion;
  const realm = new Realm(r, player, cam, fx, hud, mapUI, {
    hide: (h) => {
      terrain.group.visible = !h;
      grass.mesh.visible = !h;
      ambient.setVisible(!h);
      flowers.mesh.visible = !h;
      river.mesh.visible = !h;
      foliage?.setVisible(!h);
      stylizedNature.setVisible(!h && stylizedNature.loaded);
      town.setVisible(!h);
    },
    clearEnemies: () => { slimes.clear(); frontier?.dispose(); },
    enemiesEnabled: (on) => (slimes.enabled = on && !TEST_MODE),
  }, rewards, world.crypt.door);
  const dialogue = new DialogueUI();
  const town = new Town(r.scene, r.camera, dialogue, player);
  frontier = new FrontierRegion(
    r.scene, player, fx, dialogue, world.mats,
    (msg) => hud.toast(msg),
    () => town.guild.open('board'),
  );
  realm.overworldInteractables.push(...town.interactables(), ...frontier.interactables);
  dialogue.onToggle = (open) => {
    input.uiMode = open || inv.open || mapUI.open;
    if (open) input.exitLock();
    else input.requestLock();
  };
  if (saveData) {
    realm.progress = saveData.dungeon;
    realm.maps = saveData.maps;
  }
  const save = () => {
    if (TEST_MODE && !location.search.includes('save')) return;
    writeSave(player, realm.seed, realm.maps, realm.progress, town.guild.toJSON());
  };
  if (saveData) town.guild.fromJSON(saveData.guild);
  realm.onSave = save;
  town.guild.onSave = save;
  town.guild.onToggle = (open) => {
    input.uiMode = open || inv.open || mapUI.open || dialogue.open;
    if (open) input.exitLock();
    else if (!inv.open && !mapUI.open && !dialogue.open) input.requestLock();
  };
  mapUI.onChange = save;
  events.on('progressChanged', save);
  window.addEventListener('beforeunload', save);
  setInterval(save, 30000);
  mapUI.onToggle = (open) => {
    input.uiMode = open || inv.open;
    if (open) input.exitLock();
    else input.requestLock();
  };
  inv.onQuickDrop = (slot, uid) => hud.onSlotDrop?.('items', slot, uid);
  let started = TEST_MODE;
  // Paused only when the player releases the mouse with Esc; the pause
  // overlay is always visible while paused, so the game never freezes silently.
  let pausedByUser = false;
  let hadLock = false;
  const music = new Music();
  const overlays = buildOverlays((origin) => {
    player.prog.combat.origin = origin;
    started = true;
    music.start();
    pausedByUser = false;
    input.fallbackLook = true;
    input.requestLock();
  }, player.prog.combat.origin, music);
  input.onLockFailed = () => hud.toast('Mouse not captured: click the game to capture it');
  if (TEST_MODE) overlays.start.classList.add('hidden');
  hud.onSlotDrop = (mode, slot, ref) => {
    const eq = player.equip;
    const uid = typeof ref === 'number' ? ref : 0;
    const it = typeof ref === 'number' ? eq.get(ref) : undefined;
    if (typeof ref === 'number' && !it) return;
    // Quick items take consumables; the moveset takes spells and learned martial moves.
    if (mode === 'items' && typeof ref === 'number' && it?.def.kind === 'consumable' && slot < eq.quick.length) {
      eq.quick = eq.quick.map((u) => (u === uid ? null : u));
      eq.quick[slot] = uid;
    } else if (mode === 'moves' && typeof ref === 'number' && it?.def.kind === 'spell') {
      eq.moves = eq.moves.map((u) => (u === ref ? null : u));
      eq.moves[slot] = ref;
    } else if (mode === 'moves' && typeof ref === 'string' && ref.startsWith('skill:')) {
      eq.moves = eq.moves.map((u) => (u === ref ? null : u));
      eq.moves[slot] = ref;
    } else hud.toast(mode === 'items' ? 'Quick slots take potions and other usables' : 'The moveset takes spells and learned martial moves');
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
  if (!TEST_MODE && hasSave()) {
    const cta = overlays.start.querySelector('.cta')!;
    cta.textContent = 'CLICK TO CONTINUE';
    const nw = document.createElement('button');
    nw.className = 'newgame';
    nw.textContent = 'Start a new game';
    nw.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm('Start over? Your progress and drawn maps will be erased.')) return;
      window.removeEventListener('beforeunload', save);
      clearSave();
      location.reload();
    });
    cta.after(nw);
  }
  document.addEventListener('pointerlockchange', () => {
    if (input.locked) hadLock = true;
    // Losing a lock we had (Esc, alt-tab) pauses; a lock that never took doesn't.
    else if (hadLock && !input.uiMode && !inv.open && !mapUI.open && !dialogue.open) {
      hadLock = false;
      pause();
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && (dialogue.open || mapUI.open || inv.open)) return;
    if (e.code === 'Escape' && !input.locked && !inv.open && !mapUI.open && !dialogue.open && !pausedByUser) pause();
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
      const ref = eq.moves[i];
      if (ref == null) return;
      hud.pulseSlot(i);
      player.useMove(ref);
      hud.markHotbarDirty();
    }
  };

  events.on('playerDied', () => {
    setTimeout(() => {
      const at = realm.respawnPoint;
      player.respawn(at);
      cam.snapTo(at);
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
    music.setZone(realm.mode === 'dungeon' ? 'crypt' : 'village');
    music.update(dt);
    // Pause the world while the title/pause overlay is up (never in tests).
    const overlayUp = !TEST_MODE && (!started || pausedByUser);
    // Hit-stop is a brief slow-motion rather than a hard freeze.
    const timeScale = hitStop > 0 ? 0.1 : 1;
    hitStop = Math.max(0, hitStop - dt);
    const simDt = dt * timeScale;
    acc += simDt;
    let steps = 0;
    if (paused || overlayUp || mapUI.open) acc = 0;
    while (acc >= STEP && steps < 5) {
      acc -= STEP;
      steps++;
      simSteps++;
      if (input.wasPressed('inventory')) inv.toggle();
      if (input.wasPressed('help')) overlays.toggleHelp();
      if (input.wasPressed('toggleBar')) hud.setMode(hud.mode === 'items' ? 'moves' : 'items');
      if (input.wasPressed('map')) {
        if (realm.mode === 'dungeon') mapUI.toggle();
        else town.guild.open('map');
      }
      slotActions.forEach((a, i) => input.wasPressed(a) && useHotbar(i));
      player.update(STEP, input, cam);
      if (realm.mode === 'overworld') { slimes.update(STEP, player); frontier.update(STEP); }
      realm.update(STEP);
      rewards.update(STEP, player.center);
      // Interaction: nearest enabled thing in reach.
      let best: (typeof realm.interactables)[number] | null = null;
      let bestD = Infinity;
      if (!player.dead && !player.act) {
        for (const it of realm.interactables) {
          if (!it.enabled()) continue;
          const d = it.pos.distanceTo(player.pos.clone().setY(it.pos.y));
          if (d < it.radius && d < bestD) {
            bestD = d;
            best = it;
          }
        }
      }
      hud.prompt(best ? best.label() : null);
      if (dialogue.open) hud.prompt(null);
      else if (best && input.wasPressed('interact')) best.action();
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
    if (!paused) realm.present(alpha, overlayUp || mapUI.open ? 0 : simDt);
    cam.update(dt, renderPos, player.sprinting);
    r.camera.getWorldDirection(player.aimDir);
    grass.update(dt, r.camera.position, renderPos);
    ambient.update(dt, r.camera.position, now / 1000);
    flowers.update(dt, r.camera.position);
    terrain.update(r.camera.position, player.pos);
    foliage?.update(dt, r.camera.position);
    stylizedNature.update(dt, r.camera.position);
    input.endFrame();
    hud.update(dt, player.lock?.id ?? null);
    mapUI.update();
    dialogue.update(dt);
    if (realm.mode === 'overworld') town.update(dt, player.pos);
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
  await Promise.all([town.ready, loadArmourKit()]);
  mark('npcs');
  // Compile every material's shaders up front, in parallel where the
  // browser supports it, instead of stalling the first frames one by one.
  r.followShadow(player.pos);
  cam.update(0, player.pos, false);
  await r.renderer.compileAsync(r.scene, r.camera);
  mark('shaders');
  last = performance.now();
  requestAnimationFrame(frame);
  // Item icons render off-screen; do it once the world is up (it's behind
  // the title screen in normal play) so boot isn't held up by it.
  setTimeout(() => {
    buildIcons(r.renderer, r.scene.environment);
    mark('icons');
    hud.markHotbarDirty();
    if (inv.open) inv.render();
  }, 50);

  if (DEBUG || TEST_MODE) {
    (window as any).__game = {
      THREE, r, input, player, cam, physics, fx, slimes, spells, hud, inv, realm, rewards, mapUI, save, town, dialogue, stylizedNature, grass, world,
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
