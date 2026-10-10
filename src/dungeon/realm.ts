import * as THREE from 'three';
import { type DungeonProgress, type Interactable } from './instance';
// ---- Dungeons Reborn (feat/dungeons): the kit's dungeons ----
import { KitInstance, type KitDungeonDef, type KitHooks } from './kit/build';
import { freshProgress, type KitProgress } from './kit/types';
import { theme as kitTheme, type Theme } from './kit/theme';
import { perksOf, addMastery } from './kit/delving';
import { cryptDef } from './dungeons/crypt';
import { events } from '../core/events';
import { MineInstance, type MineProgress } from './mine';
import { setGroundOverride, heightAt } from '../world/terrain';
import { Q } from '../core/settings';
import { emptyMap, type DungeonMapUI, type MapData } from '../ui/dungeonMap';
import { ITEMS } from '../items/itemDefs';
import type { Renderer } from '../render/renderer';
import type { Player } from '../player/player';
import type { ThirdPersonCamera } from '../player/camera';
import type { FX } from '../fx/particles';
import type { HUD } from '../ui/hud';
import type { Rewards } from '../progression/progression';
import { Interior, type LightLender } from '../world/interior';
import type { Door, InteriorKind } from '../world/doors';
import type { WorldMats } from '../world/buildings';

// ---------------------------------------------------------------------------
// Switches between the overworld and the dungeon instance: the fade, the
// lighting and atmosphere, which overworld visuals are hidden, the ground
// height override, floor changes, respawn point and hand-drawn maps.
// ---------------------------------------------------------------------------

export interface OverworldVisuals {
  hide: (hidden: boolean) => void;
  clearEnemies: () => void;
  enemiesEnabled: (on: boolean) => void;
}

interface Saved {
  background: THREE.Scene['background'];
  envIntensity: number;
  exposure: number;
  glExposure: number;
  sun: number;
  hemi: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  far: number;
  fog: THREE.Scene['fog'];
  haze: number;
  hazeColor: THREE.Color;
  sunColor: THREE.Color;
  clouds: number;
}

export class Realm {
  mode: 'overworld' | 'dungeon' | 'interior' = 'overworld';
  /** the building you're inside (mode 'interior') */
  interior: Interior | null = null;
  /** people and things the game adds inside a building (keepers, patrons) */
  onInterior?: (it: Interior) => Interactable[];
  onInteriorLeave?: (it: Interior) => void;
  private interiorExtras: Interactable[] = [];
  floor = 1;
  /** the kit dungeon you're in (the crypt, the caves, the shrine) */
  instance: KitInstance | null = null;
  mineInstance: MineInstance | null = null;
  /** which dungeon: 'mine', or a kit dungeon's id ('crypt', 'hollowRidge', 'drownedShrine') */
  active: string | null = null;
  /** the kit dungeon being run, and where each one lets you out */
  kit: KitDungeonDef | null = null;
  readonly crypt = cryptDef();
  private kitExits: Record<string, { pos: THREE.Vector3; yaw: number }> = {};
  private autoT = 0;
  progress: DungeonProgress = { gateOpen: false, bossDead: false, chests: [] };
  mineProgress: MineProgress = { gateOpen: false, guardianDead: false };
  maps: Record<string, MapData> = {};
  readonly seed = 1337;
  private saved: Saved | null = null;
  /** true while a fade/floor change is in progress */
  busy = false;
  readonly overworldInteractables: Interactable[] = [];
  onSave?: () => void;

  constructor(
    private r: Renderer,
    private player: Player,
    private cam: ThirdPersonCamera,
    private fx: FX,
    private hud: HUD,
    private mapUI: DungeonMapUI,
    private overworld: OverworldVisuals,
    private rewards: Rewards,
    readonly cryptDoor: THREE.Vector3,
    readonly mineDoor: THREE.Vector3,
  ) {
    this.overworldInteractables.push({
      pos: cryptDoor,
      radius: 3.2,
      label: () => 'Enter the crypt',
      enabled: () => true,
      action: () => void this.enter(1, 'entrance'),
    });
    this.overworldInteractables.push({
      pos: mineDoor,
      radius: 3.4,
      label: () => "Enter the Old King's Road Mine",
      enabled: () => true,
      action: () => void this.enterMine(),
    });
  }

  get interactables() {
    if (this.mode === 'interior' && this.interior) return [...this.interior.interactables, ...this.interiorExtras];
    if (this.mode === 'dungeon' && this.active === 'mine' && this.mineInstance) return this.mineInstance.interactables;
    if (this.mode === 'dungeon' && this.instance) return this.instance.interactables;
    return this.overworldInteractables;
  }

  /** Where to respawn after dying. */
  get respawnPoint() {
    if (this.mode === 'dungeon' && this.active === 'mine' && this.mineInstance) return this.mineInstance.spawnPoint;
    if (this.mode === 'dungeon' && this.instance) return this.instance.respawnPoint;
    if (this.interior) return this.interior.spawn.clone();
    return new THREE.Vector3(0, heightAt(0, 10), 10);
  }

  mapKey(floor: number) {
    // (the rebuilt crypt's maps: the old maze's keys were `${seed}:${floor}`)
    return `crypt:${this.seed}:${floor}`;
  }

  // ---- Dungeons Reborn (feat/dungeons) ----
  /** Dungeoneering (and the origin's eyes) as they stand now. */
  get perks() {
    return perksOf(this.player.paths, this.player.prog.origin as string);
  }

  /** A kit dungeon's saved progress (made on the first visit). */
  kitProgress(def: KitDungeonDef): KitProgress {
    const all = (this.progress.kit ??= {});
    let kp = all[def.id];
    if (!kp) {
      kp = freshProgress(def.seed ?? Math.floor(Math.random() * 1e6) + 1);
      if (def.id === 'crypt') {
        // A crypt opened or cleared in the old maze stays opened and cleared.
        if (this.progress.gateOpen) kp.doors.push('f1-portcullis', 'f1-seal'), kp.mech.push('crypt-dial');
        if (this.progress.bossDead) kp.boss = true;
      }
      all[def.id] = kp;
    }
    return kp;
  }

  /** A kit dungeon's door in the overworld: where you come back out, facing which way. */
  registerKit(def: KitDungeonDef, door: THREE.Vector3, out: THREE.Vector3, yaw: number, label: string) {
    this.kitExits[def.id] = { pos: out.clone(), yaw };
    this.overworldInteractables.push({
      pos: door, radius: 3.2, label: () => label, enabled: () => true,
      action: () => void this.enterKit(def, 1, 'entrance'),
    });
  }

  /** The secrets near a point in the dungeon you're in (seam: Keen Sight, Deep Sense). */
  secretsNear(pos: THREE.Vector3, r: number) {
    return this.instance?.secrets.near(pos, r) ?? [];
  }

  private kitHooks(def: KitDungeonDef, floor: number): KitHooks {
    const p = this.player;
    const base = this.hooks();
    return {
      ...base,
      descend: () => void this.enterKit(def, floor + 1, 'entrance'),
      ascend: () => void this.enterKit(def, floor - 1, 'stairs'),
      card: (name, sub) => this.hud.regionCard(name, sub, true),
      banner: (t) => this.hud.showBanner(t),
      rest: () => {
        p.hp = p.maxHp;
        p.stamina = p.maxStamina;
        p.mana = p.maxMana;
        this.hud.toast('You rest by the fire. If you fall, you will wake here.');
        this.onSave?.();
      },
      mastery: (n) => addMastery(p.paths, n),
      deed: (id, renown, label) => events.emit('deed', { id, renown, label }),
      onDoor: (id) => {
        if (def.id === 'crypt' && id === 'f1-portcullis') this.progress.gateOpen = true;
      },
      onBoss: () => {
        if (def.id === 'crypt') this.progress.bossDead = true;
      },
      perks: () => this.perks,
    };
  }

  /** Enter (or change floors in) a dungeon built with the kit. */
  async enterKit(def: KitDungeonDef, floor: number, at: 'entrance' | 'stairs') {
    if (this.busy) return;
    this.busy = true;
    await this.hud.fade(true);
    this.instance?.dispose();
    this.instance = null;
    this.mineInstance?.dispose();
    this.mineInstance = null;
    const th = kitTheme(def.theme);
    if (this.mode === 'overworld') {
      this.overworld.clearEnemies();
      this.overworld.enemiesEnabled(false);
      this.overworld.hide(true);
      this.atmosphere(true, false, false, th);
    }
    this.mode = 'dungeon';
    this.active = def.id;
    this.kit = def;
    this.floor = floor;
    const kp = this.kitProgress(def);
    const first = !kp.visited.includes('entry');
    this.instance = new KitInstance(def, floor, kp.seed, this.r.scene, this.fx, kp, this.kitHooks(def, floor));
    setGroundOverride(this.instance.groundAt);
    await this.instance.ready;
    const fg = this.instance.fg;
    const key = def.id === 'crypt' ? this.mapKey(floor) : `${def.id}:${kp.seed}:${floor}`;
    this.maps[key] ??= emptyMap(fg.w, fg.h);
    this.mapUI.setFloor(this.maps[key], fg.plan.name);
    this.mapUI.setAuto(null);
    this.autoT = 0;
    const p = at === 'stairs' ? this.instance.stairsPoint : this.instance.spawnPoint;
    this.player.teleport(p.clone().setY(p.y + 0.3));
    const face = at === 'stairs' ? 0 : this.instance.entranceYaw;
    this.player.yaw = face;
    this.player.lock = null;
    this.cam.yaw = face;
    this.cam.distance = 3.2; // tighter camera for corridors
    this.cam.snapTo(this.player.pos);
    if (first) {
      kp.visited.push('entry');
      events.emit('deed', { id: `place:${def.id}`, renown: 1, label: `Found ${def.name}` });
    }
    this.onSave?.();
    await new Promise((r) => setTimeout(r, 120));
    this.hud.toast(def.arrive(floor));
    await this.hud.fade(false);
    this.busy = false;
  }

  private hooks() {
    const p = this.player;
    return {
      toast: (m: string) => this.hud.toast(m),
      giveItem: (id: string) => {
        p.equip.add(id);
        this.hud.markHotbarDirty();
        return ITEMS[id]?.name ?? id;
      },
      giveGold: (at: THREE.Vector3, n: number) => this.rewards.spawn(at, 0, n),
      hasItem: (id: string) => p.equip.items.some((i) => i.def.id === id),
      descend: () => void this.enter(2, 'entrance'),
      ascend: () => void this.enter(1, 'stairs'),
      leave: () => void this.leave(),
      bossBar: (t: { hp: number; maxHp: number; alive: boolean } | null, name?: string) => this.hud.bossBar(t, name),
      save: () => this.onSave?.(),
    };
  }

  private atmosphere(dungeon: boolean, indoors = false, mine = false, kit?: Theme) {
    const r = this.r, s = r.scene;
    const u = r.post?.finalMat.uniforms;
    if (dungeon && !this.saved) {
      this.saved = {
        background: s.background, envIntensity: s.environmentIntensity, sun: r.sun.intensity, hemi: r.hemi.intensity,
        hemiSky: r.hemi.color.clone(), hemiGround: r.hemi.groundColor.clone(), far: r.camera.far, fog: s.fog,
        haze: u?.uHaze.value ?? 0, hazeColor: (u?.uHazeColor.value as THREE.Color)?.clone() ?? new THREE.Color(),
        sunColor: (u?.uSunColor.value as THREE.Color)?.clone() ?? new THREE.Color(), clouds: u?.uClouds.value ?? 0,
        exposure: u?.uExposure.value ?? 1, glExposure: r.renderer.toneMappingExposure,
      };
      s.background = new THREE.Color(0x000000);
      // Underground and indoors there is no sky: gaps in a wall showed the
      // sky dome's clouds as flat pink cards hanging in the dark.
      if (r.sky) r.sky.mesh.visible = false;
      s.environmentIntensity = mine ? 0.08 : 0.12;
      r.sun.intensity = 0;
      r.hemi.intensity = mine ? 0.34 : 0.22;
      r.hemi.color.set(mine ? 0x7186a5 : 0x7d8aa6);
      r.hemi.groundColor.set(mine ? 0x18130f : 0x2a2018);
      r.camera.far = mine ? 175 : 140;
      if (!Q.post) s.fog = new THREE.Fog(mine ? 0x06080c : 0x050608, mine ? 12 : 8, mine ? 48 : 30);
      if (u) {
        // The mine is long: thinner haze so lamps further down still read.
        u.uHaze.value = mine ? 0.016 : 0.03;
        (u.uHazeColor.value as THREE.Color).setRGB(0.015, 0.016, 0.022);
        (u.uSunColor.value as THREE.Color).setRGB(0.015, 0.016, 0.022);
        u.uClouds.value = 0;
      }
      if (kit) {
        // A kit dungeon's own air (feat/dungeons): the caves warmer, the shrine sea-green.
        r.hemi.intensity = kit.hemi.intensity;
        r.hemi.color.set(kit.hemi.sky);
        r.hemi.groundColor.set(kit.hemi.ground);
        if (!Q.post) s.fog = new THREE.Fog(kit.fog[0], kit.fog[1], kit.fog[2]);
      }
      if (indoors) {
        // Warm and lamplit rather than crypt-dark.
        s.background = new THREE.Color(0x140e09);
        s.environmentIntensity = 0.28;
        r.hemi.intensity = 0.55;
        r.hemi.color.set(0xffe2bc);
        r.hemi.groundColor.set(0x3a2818);
        r.camera.far = 80;
        // A fixed exposure: the night grade (brightened for moonlight) blew rooms out.
        r.renderer.toneMappingExposure = 1.0;
        if (u) {
          u.uExposure.value = 0.92;
          u.uHaze.value = 0.004;
          (u.uHazeColor.value as THREE.Color).setRGB(0.08, 0.06, 0.04);
        }
      }
    } else if (!dungeon && this.saved) {
      const v = this.saved;
      if (r.sky) r.sky.mesh.visible = true;
      s.background = v.background;
      s.environmentIntensity = v.envIntensity;
      r.sun.intensity = v.sun;
      r.hemi.intensity = v.hemi;
      r.hemi.color.copy(v.hemiSky);
      r.hemi.groundColor.copy(v.hemiGround);
      r.camera.far = v.far;
      r.renderer.toneMappingExposure = v.glExposure;
      if (u) u.uExposure.value = v.exposure;
      s.fog = v.fog;
      if (u) {
        u.uHaze.value = v.haze;
        (u.uHazeColor.value as THREE.Color).copy(v.hazeColor);
        (u.uSunColor.value as THREE.Color).copy(v.sunColor);
        u.uClouds.value = v.clouds;
      }
      this.saved = null;
    }
    r.camera.updateProjectionMatrix();
  }

  /** Enter (or change) a crypt floor, arriving at its entrance or its stairs. */
  async enter(floor: 1 | 2, at: 'entrance' | 'stairs') {
    return this.enterKit(this.crypt, floor, at);
  }

  async enterMine() {
    if (this.busy || this.mode !== 'overworld') return;
    this.busy = true;
    await this.hud.fade(true);
    this.instance?.dispose();
    this.instance = null;
    this.mineInstance?.dispose();
    this.kit = null;
    this.overworld.clearEnemies();
    this.overworld.enemiesEnabled(false);
    this.overworld.hide(true);
    this.atmosphere(true, false, true);
    this.mode = 'dungeon';
    this.active = 'mine';
    this.mineInstance = new MineInstance(this.r.scene, this.fx, this.mineProgress, {
      toast: (m) => this.hud.toast(m),
      giveGold: (at, n) => this.rewards.spawn(at, 0, n),
      giveItem: (id) => {
        const name = ITEMS[id]?.name ?? id;
        this.player.equip.add(id);
        this.hud.markHotbarDirty();
        return name;
      },
      leave: () => void this.leave(),
      bossBar: (t, name) => this.hud.bossBar(t, name),
      save: () => this.onSave?.(),
    });
    setGroundOverride(this.mineInstance.groundAt);
    await this.mineInstance.ready;
    this.maps['mine:1'] ??= this.mineInstance.map;
    this.mapUI.setFloor(this.maps['mine:1'], "KING'S ROAD MINE");
    this.player.teleport(this.mineInstance.spawnPoint.clone());
    this.player.yaw = this.mineInstance.entranceYaw;
    this.player.lock = null;
    this.cam.yaw = this.mineInstance.entranceYaw;
    this.cam.distance = 3.2;
    this.cam.snapTo(this.player.pos);
    this.onSave?.();
    await new Promise((r) => setTimeout(r, 120));
    this.hud.toast("The Old King's Road Mine. The deeper you go, the older it gets.");
    await this.hud.fade(false);
    this.busy = false;
  }

  async leave() {
    if (this.busy || this.mode !== 'dungeon') return;
    this.busy = true;
    await this.hud.fade(true);
    const leavingMine = this.active === 'mine';
    const out = this.active ? this.kitExits[this.active] : undefined;
    this.instance?.dispose();
    this.instance = null;
    this.mineInstance?.dispose();
    this.mineInstance = null;
    setGroundOverride(null);
    this.mode = 'overworld';
    this.active = null;
    this.kit = null;
    this.mapUI.setAuto(null);
    this.mapUI.setFloor(null);
    this.overworld.hide(false);
    this.overworld.enemiesEnabled(true);
    this.atmosphere(false);
    // Back out in front of the dungeon door, facing down the valley.
    const p = out ? out.pos.clone() : (leavingMine ? this.mineDoor : this.cryptDoor).clone().add(new THREE.Vector3(0, 0, leavingMine ? 5 : 7));
    p.y = heightAt(p.x, p.z);
    this.player.teleport(p.setY(p.y + 0.3));
    this.player.yaw = out?.yaw ?? 0;
    this.cam.yaw = out?.yaw ?? 0;
    this.cam.distance = 3.9;
    this.cam.snapTo(this.player.pos);
    this.onSave?.();
    await this.hud.fade(false);
    this.busy = false;
  }

  /** Step through a door into the building behind it. */
  async enterInterior(door: Door, kind: InteriorKind, mats: WorldMats, lights?: LightLender, onInspect?: (label: string, text: string) => void) {
    if (this.busy || this.mode !== 'overworld') return;
    this.busy = true;
    await this.hud.fade(true);
    this.overworld.clearEnemies();
    this.overworld.enemiesEnabled(false);
    this.overworld.hide(true);
    this.atmosphere(true, true);
    this.mode = 'interior';
    const it = new Interior(door, kind, this.r.scene, mats, () => void this.leaveInterior(), lights, onInspect);
    this.interior = it;
    setGroundOverride(it.groundAt);
    this.interiorExtras = this.onInterior?.(it) ?? [];
    this.player.teleport(it.spawn.clone().setY(it.spawn.y + 0.3));
    this.player.yaw = it.spawnYaw;
    this.player.lock = null;
    this.cam.yaw = it.spawnYaw;
    this.cam.distance = 2.8; // close in under the beams
    this.cam.snapTo(this.player.pos);
    await new Promise((r) => setTimeout(r, 120));
    await this.hud.fade(false);
    this.busy = false;
  }

  /** Back out onto the doorstep. */
  async leaveInterior() {
    if (this.busy || this.mode !== 'interior' || !this.interior) return;
    this.busy = true;
    await this.hud.fade(true);
    const it = this.interior;
    this.onInteriorLeave?.(it);
    this.interiorExtras = [];
    it.dispose();
    this.interior = null;
    setGroundOverride(null);
    this.mode = 'overworld';
    this.overworld.hide(false);
    this.overworld.enemiesEnabled(true);
    this.atmosphere(false);
    const d = it.door;
    const p = d.pos.clone().add(new THREE.Vector3(Math.sin(d.yaw), 0, Math.cos(d.yaw)).multiplyScalar(0.6));
    this.player.teleport(p.setY(heightAt(p.x, p.z) + 0.3));
    this.player.yaw = d.yaw;
    this.cam.yaw = d.yaw;
    this.cam.distance = 3.9;
    this.cam.snapTo(this.player.pos);
    await new Promise((r) => setTimeout(r, 100));
    await this.hud.fade(false);
    this.busy = false;
  }

  present(alpha: number, dt: number) {
    this.instance?.present(alpha, dt, this.player);
    this.mineInstance?.present(alpha, dt, this.player);
  }

  update(dt: number) {
    this.interior?.update(dt);
    if (this.mode === 'dungeon' && this.active === 'mine' && this.mineInstance) {
      this.mineInstance.update(dt, this.player);
      const [cx, cy] = this.mineInstance.cellAt(this.player.pos);
      this.mapUI.setPlayer(cx, cy, Math.PI - this.player.yaw);
      return;
    }
    const inst = this.instance;
    if (!inst) return;
    inst.update(dt, this.player);
    // Map: player position in cells, facing (0 = north, clockwise).
    const [cx, cy] = inst.cellAtF(this.player.pos);
    this.mapUI.setPlayer(cx, cy, Math.PI - this.player.yaw);
    // The automap (Cartographer's Eye, Treasure Nose, Sense the Boss), redrawn twice a second.
    this.autoT -= dt;
    if (this.autoT <= 0) {
      this.autoT = 0.5;
      const pk = this.perks;
      this.mapUI.setAuto(pk.automap || pk.treasureNose || pk.senseBoss ? inst.autoLayer(pk) : null);
    }
  }
}
