import * as THREE from 'three';
import { DungeonInstance, DUNGEON_ORIGIN, CELL, type DungeonProgress, type Interactable } from './instance';
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
  mode: 'overworld' | 'dungeon' = 'overworld';
  floor: 1 | 2 = 1;
  instance: DungeonInstance | null = null;
  progress: DungeonProgress = { gateOpen: false, bossDead: false, chests: [] };
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
  ) {
    this.overworldInteractables.push({
      pos: cryptDoor,
      radius: 3.2,
      label: () => 'Enter the crypt',
      enabled: () => true,
      action: () => void this.enter(1, 'entrance'),
    });
  }

  get interactables() {
    return this.mode === 'dungeon' && this.instance ? this.instance.interactables : this.overworldInteractables;
  }

  /** Where to respawn after dying. */
  get respawnPoint() {
    if (this.instance) return this.instance.spawnPoint;
    return new THREE.Vector3(0, heightAt(0, 10), 10);
  }

  mapKey(floor: number) {
    return `${this.seed}:${floor}`;
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

  private atmosphere(dungeon: boolean) {
    const r = this.r, s = r.scene;
    const u = r.post?.finalMat.uniforms;
    if (dungeon && !this.saved) {
      this.saved = {
        background: s.background, envIntensity: s.environmentIntensity, sun: r.sun.intensity, hemi: r.hemi.intensity,
        hemiSky: r.hemi.color.clone(), hemiGround: r.hemi.groundColor.clone(), far: r.camera.far, fog: s.fog,
        haze: u?.uHaze.value ?? 0, hazeColor: (u?.uHazeColor.value as THREE.Color)?.clone() ?? new THREE.Color(),
        sunColor: (u?.uSunColor.value as THREE.Color)?.clone() ?? new THREE.Color(), clouds: u?.uClouds.value ?? 0,
      };
      s.background = new THREE.Color(0x000000);
      s.environmentIntensity = 0.12;
      r.sun.intensity = 0;
      r.hemi.intensity = 0.22;
      r.hemi.color.set(0x7d8aa6);
      r.hemi.groundColor.set(0x2a2018);
      r.camera.far = 140;
      if (!Q.post) s.fog = new THREE.Fog(0x050608, 8, 30);
      if (u) {
        u.uHaze.value = 0.03;
        (u.uHazeColor.value as THREE.Color).setRGB(0.015, 0.016, 0.022);
        (u.uSunColor.value as THREE.Color).setRGB(0.015, 0.016, 0.022);
        u.uClouds.value = 0;
      }
    } else if (!dungeon && this.saved) {
      const v = this.saved;
      s.background = v.background;
      s.environmentIntensity = v.envIntensity;
      r.sun.intensity = v.sun;
      r.hemi.intensity = v.hemi;
      r.hemi.color.copy(v.hemiSky);
      r.hemi.groundColor.copy(v.hemiGround);
      r.camera.far = v.far;
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

  /** Enter (or change) a dungeon floor, arriving at its entrance or its stairs. */
  async enter(floor: 1 | 2, at: 'entrance' | 'stairs') {
    if (this.busy) return;
    this.busy = true;
    await this.hud.fade(true);
    this.instance?.dispose();
    if (this.mode === 'overworld') {
      this.overworld.clearEnemies();
      this.overworld.enemiesEnabled(false);
      this.overworld.hide(true);
      this.atmosphere(true);
    }
    this.mode = 'dungeon';
    this.floor = floor;
    this.instance = new DungeonInstance(this.seed, floor, this.r.scene, this.fx, this.progress, this.hooks());
    setGroundOverride(this.instance.groundAt);
    await this.instance.ready;
    const L = this.instance.layout;
    this.maps[this.mapKey(floor)] ??= emptyMap(L.w, L.h);
    this.mapUI.setFloor(this.maps[this.mapKey(floor)], floor === 1 ? 'B1F · UPPER CRYPT' : 'B2F · LOWER CRYPT');
    const p = at === 'stairs' ? this.instance.stairsPoint : this.instance.spawnPoint;
    this.player.teleport(p.clone().setY(p.y + 0.3));
    const face = at === 'stairs' ? 0 : this.instance.entranceYaw;
    this.player.yaw = face; // face down the open passage
    this.player.lock = null;
    this.cam.yaw = face;
    this.cam.distance = 3.2; // tighter camera for corridors
    this.cam.snapTo(this.player.pos);
    this.onSave?.();
    await new Promise((r) => setTimeout(r, 120));
    this.hud.toast(floor === 1 ? 'The Upper Crypt. Press M to draw your map.' : 'The Lower Crypt');
    await this.hud.fade(false);
    this.busy = false;
  }

  async leave() {
    if (this.busy || this.mode !== 'dungeon') return;
    this.busy = true;
    await this.hud.fade(true);
    this.instance?.dispose();
    this.instance = null;
    setGroundOverride(null);
    this.mode = 'overworld';
    this.mapUI.setFloor(null);
    this.overworld.hide(false);
    this.overworld.enemiesEnabled(true);
    this.atmosphere(false);
    // Back out in front of the crypt door, facing down the valley.
    const p = this.cryptDoor.clone().add(new THREE.Vector3(0, 0, 7));
    p.y = heightAt(p.x, p.z);
    this.player.teleport(p.setY(p.y + 0.3));
    this.player.yaw = 0;
    this.cam.yaw = 0;
    this.cam.distance = 3.9;
    this.cam.snapTo(this.player.pos);
    this.onSave?.();
    await this.hud.fade(false);
    this.busy = false;
  }

  present(alpha: number, dt: number) {
    this.instance?.present(alpha, dt, this.player);
  }

  update(dt: number) {
    const inst = this.instance;
    if (!inst) return;
    inst.update(dt, this.player);
    // Map: player position in cells, facing (0 = north, clockwise).
    const L = inst.layout;
    const pp = this.player.pos;
    const cx = (pp.x - DUNGEON_ORIGIN.x) / CELL + L.w / 2, cy = (pp.z - DUNGEON_ORIGIN.z) / CELL + L.h / 2;
    this.mapUI.setPlayer(cx, cy, Math.PI - this.player.yaw);
  }
}
