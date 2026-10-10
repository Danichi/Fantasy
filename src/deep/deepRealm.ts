import * as THREE from 'three';
import { setGroundOverride, heightAt } from '../world/terrain';
import { Q } from '../core/settings';
import type { Realm } from '../dungeon/realm';
import type { Renderer } from '../render/renderer';
import type { Player } from '../player/player';
import type { ThirdPersonCamera } from '../player/camera';
import type { HUD } from '../ui/hud';
import type { DungeonMapUI, MapData } from '../ui/dungeonMap';
import type { Interactable } from '../dungeon/instance';
import type { DeepSpace } from './deepKit';

// The underground as its own realm (docs/design/mountains.md §6, decision 2):
// the Great Lift, the claim's shaft and the counting door each take you out
// of the overworld into a space under the mountains, built far from the
// surface so the caverns can be as big as they like. It switches like
// dungeon/realm.ts does for the crypt and the mine: a fade, the surface
// hidden, its own lighting and ground, a respawn point, a hand-drawn map, and
// back. While you're below, the realm reports 'dungeon' (so the surface's
// systems sleep) and hands interactions and respawns to the space.

interface Saved {
  background: THREE.Scene['background'];
  env: number;
  sun: number;
  hemi: number;
  sky: THREE.Color;
  ground: THREE.Color;
  far: number;
  fog: THREE.Scene['fog'];
  haze: number;
  hazeColor: THREE.Color;
  sunColor: THREE.Color;
  clouds: number;
  exposure: number;
  gl: number;
}

export class DeepRealm {
  space: DeepSpace | null = null;
  busy = false;
  /** where you come back up to (the lift's top, the shaft's mouth) */
  private returnTo: { pos: THREE.Vector3; yaw: number } | null = null;
  private saved: Saved | null = null;
  private lamp = new THREE.PointLight(0xffc890, 0, 16, 1.4);
  /** people and things the mountains add to a space (NPCs below, quest triggers) */
  extras: Interactable[] = [];
  onEnter?: (s: DeepSpace) => void;
  onLeave?: (s: DeepSpace) => void;
  onSave?: () => void;
  private overworld: { hide: (h: boolean) => void; clearEnemies: () => void; enemiesEnabled: (on: boolean) => void };

  constructor(private realm: Realm, private r: Renderer, private player: Player, private cam: ThirdPersonCamera, private hud: HUD, private mapUI: DungeonMapUI, private hasLantern: () => boolean) {
    this.overworld = (realm as unknown as { overworld: DeepRealm['overworld'] }).overworld;
    r.scene.add(this.lamp);
    // While below, the realm's interactions and respawns are the space's.
    const proto = Object.getPrototypeOf(realm);
    const inter = Object.getOwnPropertyDescriptor(proto, 'interactables')!.get!;
    const resp = Object.getOwnPropertyDescriptor(proto, 'respawnPoint')!.get!;
    const self = this;
    Object.defineProperty(realm, 'interactables', { configurable: true, get() { return self.space ? [...self.space.interactables, ...self.extras] : inter.call(realm); } });
    Object.defineProperty(realm, 'respawnPoint', { configurable: true, get() { return self.space ? self.space.respawnPoint.clone() : resp.call(realm); } });
  }

  get active() {
    return !!this.space;
  }

  private atmosphere(on: boolean) {
    const r = this.r, s = r.scene;
    const u = r.post?.finalMat.uniforms;
    if (on && this.space) {
      if (!this.saved) {
        this.saved = {
          background: s.background, env: s.environmentIntensity, sun: r.sun.intensity, hemi: r.hemi.intensity, sky: r.hemi.color.clone(), ground: r.hemi.groundColor.clone(),
          far: r.camera.far, fog: s.fog, haze: u?.uHaze.value ?? 0, hazeColor: (u?.uHazeColor.value as THREE.Color)?.clone() ?? new THREE.Color(),
          sunColor: (u?.uSunColor.value as THREE.Color)?.clone() ?? new THREE.Color(), clouds: u?.uClouds.value ?? 0, exposure: u?.uExposure.value ?? 1, gl: r.renderer.toneMappingExposure,
        };
      }
      const L = this.space.light;
      s.background = new THREE.Color(L.fog);
      if (r.sky) r.sky.mesh.visible = false;
      s.environmentIntensity = 0.1;
      r.sun.intensity = 0;
      r.hemi.intensity = L.hemi;
      r.hemi.color.set(L.sky);
      r.hemi.groundColor.set(L.ground);
      r.camera.far = L.far;
      r.renderer.toneMappingExposure = 1;
      if (!Q.post) s.fog = new THREE.Fog(L.fog, L.far * 0.25, L.far * 0.9);
      if (u) {
        u.uHaze.value = L.haze;
        (u.uHazeColor.value as THREE.Color).set(L.fog);
        (u.uSunColor.value as THREE.Color).set(L.fog);
        u.uClouds.value = 0;
        u.uExposure.value = 1;
      }
    } else if (!on && this.saved) {
      const v = this.saved;
      if (r.sky) r.sky.mesh.visible = true;
      s.background = v.background;
      s.environmentIntensity = v.env;
      r.sun.intensity = v.sun;
      r.hemi.intensity = v.hemi;
      r.hemi.color.copy(v.sky);
      r.hemi.groundColor.copy(v.ground);
      r.camera.far = v.far;
      r.renderer.toneMappingExposure = v.gl;
      s.fog = v.fog;
      if (u) {
        u.uHaze.value = v.haze;
        (u.uHazeColor.value as THREE.Color).copy(v.hazeColor);
        (u.uSunColor.value as THREE.Color).copy(v.sunColor);
        u.uClouds.value = v.clouds;
        u.uExposure.value = v.exposure;
      }
      this.saved = null;
    }
    r.camera.updateProjectionMatrix();
  }

  /** Go below into a space (from the surface, or from another space). */
  async enter(make: () => DeepSpace, opts: { from?: { pos: THREE.Vector3; yaw: number }; at?: THREE.Vector3; yaw?: number; fade?: boolean; toast?: string } = {}) {
    if (this.busy) return;
    if (this.realm.mode !== 'overworld' && !this.space) return;
    this.busy = true;
    const fade = opts.fade !== false;
    if (fade) await this.hud.fade(true);
    if (this.space) this.drop();
    else {
      this.returnTo = opts.from ?? { pos: this.player.pos.clone(), yaw: this.player.yaw };
      this.overworld.clearEnemies();
      this.overworld.enemiesEnabled(false);
      this.overworld.hide(true);
    }
    const space = make();
    this.space = space;
    this.realm.mode = 'dungeon';
    setGroundOverride(space.groundAt);
    await space.ready;
    this.atmosphere(true);
    this.mapUI.setFloor(space.map as MapData, space.title.toUpperCase());
    const p = opts.at ?? space.spawnPoint;
    const yaw = opts.yaw ?? space.spawnYaw;
    this.player.teleport(p.clone().setY(p.y + 0.3));
    this.player.yaw = yaw;
    this.player.lock = null;
    this.cam.yaw = yaw;
    this.cam.distance = 4.2;
    this.cam.snapTo(this.player.pos);
    this.onEnter?.(space);
    this.onSave?.();
    if (fade) {
      await new Promise((r) => setTimeout(r, 120));
      if (opts.toast) this.hud.toast(opts.toast);
      await this.hud.fade(false);
    }
    this.busy = false;
  }

  private drop() {
    const s = this.space;
    if (!s) return;
    this.onLeave?.(s);
    s.dispose();
    this.space = null;
    setGroundOverride(null);
  }

  /** Back up to the surface (where you came down, or `to`). */
  async leave(to?: { pos: THREE.Vector3; yaw: number }, fade = true) {
    if (this.busy || !this.space) return;
    this.busy = true;
    if (fade) await this.hud.fade(true);
    this.drop();
    this.realm.mode = 'overworld';
    this.mapUI.setFloor(null);
    this.overworld.hide(false);
    this.overworld.enemiesEnabled(true);
    this.atmosphere(false);
    this.lamp.intensity = 0;
    const back = to ?? this.returnTo ?? { pos: new THREE.Vector3(0, heightAt(0, 10), 10), yaw: 0 };
    const p = back.pos.clone();
    p.y = heightAt(p.x, p.z) + 0.4;
    this.player.teleport(p);
    this.player.yaw = back.yaw;
    this.cam.yaw = back.yaw;
    this.cam.distance = 3.9;
    this.cam.snapTo(this.player.pos);
    this.returnTo = null;
    this.onSave?.();
    if (fade) await this.hud.fade(false);
    this.busy = false;
  }

  /** Every step below: the space lives, the map follows you, a fall puts you back. */
  update(dt: number) {
    const s = this.space;
    if (!s) return;
    // Something else took the realm back (a test reset): let the space go quietly.
    if (this.realm.mode === 'overworld' && !this.busy) {
      this.drop();
      this.atmosphere(false);
      return;
    }
    s.update(dt, this.player);
    const [cx, cy] = s.cellAt(this.player.pos);
    this.mapUI.setPlayer(cx, cy, Math.PI - this.player.yaw);
    const g = s.groundAt(this.player.pos.x, this.player.pos.z);
    if (g !== null && this.player.pos.y < s.respawnPoint.y - 30) {
      this.player.takeDamage(this.player.maxHp * 0.25);
      this.player.teleport(s.respawnPoint.clone().setY(s.respawnPoint.y + 0.5));
      this.hud.toast('You fall into the dark, and wake bruised where you last stood on firm stone.');
    }
    // Your miner's lantern lights the dark around you.
    const lit = this.hasLantern();
    this.lamp.intensity = lit ? 14 : 4;
    this.lamp.position.copy(this.player.pos).add(new THREE.Vector3(0, 2.2, 0));
  }

  /** Out at once, without a fade (tests, resets). */
  forceLeave() {
    if (!this.space) return;
    this.busy = false;
    void this.leave(undefined, false);
  }
}
