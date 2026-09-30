import * as THREE from 'three';
import { heightAt } from './terrainHeight';
import { SEA_LEVEL } from './worldMap';
import { waterSurfaceAt } from './waterLevel';
import { dampAngle } from '../core/math';
import type { Player } from '../player/player';
import type { Interactable } from '../dungeon/instance';
import type { FishingSpot } from './fishing';

// Boat hire (World Expansion phase 5): Dockmaster Mira rents out a rowing
// boat at Fisherman's Wharf. Row it around the harbour and along the coast
// (WASD, Shift to pull harder), fish from it anywhere the water is deep, and
// step ashore wherever land is close. Real sailing ships come with the ocean.

function rowboat() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x9a6a3e, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.85 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x2f7f86, roughness: 0.7 });
  const shape = new THREE.Shape();
  shape.moveTo(-0.7, 0.45);
  shape.quadraticCurveTo(-0.72, -0.15, 0, -0.3);
  shape.quadraticCurveTo(0.72, -0.15, 0.7, 0.45);
  shape.lineTo(0.58, 0.45);
  shape.quadraticCurveTo(0.58, -0.05, 0, -0.18);
  shape.quadraticCurveTo(-0.58, -0.05, -0.58, 0.45);
  const hull = new THREE.ExtrudeGeometry(shape, { depth: 3.4, bevelEnabled: false, steps: 8 });
  const p = hull.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = p.getZ(i) / 3.4;
    const pinch = t > 0.75 ? 1 - Math.pow((t - 0.75) / 0.25, 1.5) * 0.9 : t < 0.1 ? 0.75 + t * 2.5 : 1;
    p.setX(i, p.getX(i) * pinch);
  }
  hull.translate(0, 0, -1.7);
  hull.computeVertexNormals();
  const h = new THREE.Mesh(hull, wood);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 2.8), dark);
  floor.position.y = -0.1;
  // Painted gunwale strips down each side.
  for (const sd of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 2.9), trim);
    strip.position.set(sd * 0.66, 0.42, 0);
    g.add(strip);
  }
  for (const z of [-0.6, 0.5]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.06, 0.32), dark);
    bench.position.set(0, 0.2, z);
    g.add(bench);
  }
  g.add(h, floor);
  const oars: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.68, 0.45, 0.05);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.3, 6), dark);
    shaft.rotation.z = Math.PI / 2;
    shaft.position.x = s * 0.9;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.16), wood);
    blade.position.x = s * 1.95;
    pivot.add(shaft, blade);
    g.add(pivot);
    oars.push(pivot);
  }
  g.traverse((o) => (o as THREE.Mesh).isMesh && (((o as THREE.Mesh).castShadow = true), ((o as THREE.Mesh).receiveShadow = true)));
  return { group: g, oars };
}

export class Boats {
  private boat = rowboat();
  readonly state = { pos: new THREE.Vector3(), yaw: 0, speed: 0 };
  private t = 0;
  private landing: THREE.Vector3 | null = null;
  /** interactables: step ashore, fish from the boat */
  readonly interactables: Interactable[];
  /** a fishing spot under the boat (for Fishing.start) */
  readonly spot: FishingSpot = { pos: new THREE.Vector3(), water: new THREE.Vector3(), kind: 'sea', name: 'From the boat' };
  onFish?: (spot: FishingSpot) => void;

  constructor(scene: THREE.Scene, private player: Player) {
    this.boat.group.visible = false;
    scene.add(this.boat.group);
    const self = this;
    this.interactables = [
      {
        pos: this.state.pos, radius: 3,
        label: () => (self.player.vehicle && self.landing ? 'Step ashore' : ''),
        enabled: () => !!self.player.vehicle && !!self.landing,
        action: () => self.ashore(),
      },
      {
        pos: this.state.pos, radius: 3,
        label: () => (self.player.vehicle && !self.landing && self.deep() ? 'Fish from the boat' : ''),
        enabled: () => !!self.player.vehicle && !self.landing && self.deep() && self.player.equip.items.some((i) => i.def.id === 'fishingRod'),
        action: () => {
          const s = self.state;
          self.spot.pos.copy(s.pos);
          self.spot.water.set(s.pos.x + Math.sin(s.yaw + 1.2) * 6, SEA_LEVEL, s.pos.z + Math.cos(s.yaw + 1.2) * 6);
          const surf = waterSurfaceAt(s.pos.x, s.pos.z);
          self.spot.water.y = surf ?? SEA_LEVEL;
          self.spot.kind = surf !== null && surf > SEA_LEVEL + 0.1 ? 'river' : Math.hypot(s.pos.x - 2926, s.pos.z - 300) < 120 ? 'harbour' : 'sea';
          self.onFish?.(self.spot);
        },
      },
    ];
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyX' && this.player.vehicle && this.landing) this.ashore();
    });
  }

  get active() {
    return !!this.player.vehicle;
  }

  private deep() {
    const s = this.state;
    const surf = waterSurfaceAt(s.pos.x, s.pos.z);
    return surf !== null && surf - heightAt(s.pos.x, s.pos.z) > 1.4;
  }

  /** Launch the boat at a spot on the water and sit the player in it. */
  launch(at: THREE.Vector3, yaw: number) {
    const s = this.state;
    s.pos.set(at.x, (waterSurfaceAt(at.x, at.z) ?? SEA_LEVEL) + 0.1, at.z);
    s.yaw = yaw;
    s.speed = 0;
    this.boat.group.visible = true;
    this.player.vehicle = s;
  }

  /** Step onto the nearest dry land. */
  ashore() {
    if (!this.landing) return;
    const p = this.landing.clone();
    this.player.vehicle = null;
    this.player.teleport(p.setY(heightAt(p.x, p.z) + 0.4));
  }

  /** Nearest dry ground within a few metres of the boat (piers count). */
  private findLanding() {
    const s = this.state;
    for (const r of [2, 3, 4, 5]) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const x = s.pos.x + Math.cos(a) * r, z = s.pos.z + Math.sin(a) * r;
        const surf = waterSurfaceAt(x, z);
        if (surf === null || heightAt(x, z) > surf + 0.15) return new THREE.Vector3(x, 0, z);
      }
    }
    return null;
  }

  update(dt: number) {
    const s = this.state;
    const g = this.boat.group;
    this.t += dt;
    if (!this.player.vehicle) {
      // An empty boat bobs where it was left.
      if (g.visible) g.position.y = s.pos.y + Math.sin(this.t * 1.3) * 0.05;
      return;
    }
    // Steer toward the stick, pull on the oars.
    const intent = this.player.moveIntent;
    const want = intent.lengthSq() > 0.01;
    if (want) s.yaw = dampAngle(s.yaw, Math.atan2(intent.x, intent.z), 1.6, dt);
    const target = want ? (this.player.sprinting ? 5.2 : 3.4) : 0;
    s.speed += (target - s.speed) * Math.min(1, dt * (want ? 0.9 : 0.5));
    const next = s.pos.clone().add(new THREE.Vector3(Math.sin(s.yaw), 0, Math.cos(s.yaw)).multiplyScalar(s.speed * dt));
    const surf = waterSurfaceAt(next.x, next.z);
    if (surf !== null && surf - heightAt(next.x, next.z) > 0.45) {
      s.pos.x = next.x;
      s.pos.z = next.z;
      s.pos.y = surf + 0.08 + Math.sin(this.t * 1.4) * 0.05;
    } else s.speed *= 0.3; // bumped the shore
    this.landing = this.findLanding();
    g.position.copy(s.pos);
    g.rotation.set(Math.sin(this.t * 1.1) * 0.02, s.yaw, Math.sin(this.t * 0.9) * 0.035);
    // Oars sweep while rowing.
    const stroke = s.speed > 0.2 ? this.t * (2.2 + s.speed * 0.4) : 0;
    this.boat.oars.forEach((o, i) => {
      o.rotation.y = Math.sin(stroke) * 0.5 * (i ? -1 : 1);
      o.rotation.z = (Math.cos(stroke) * 0.25 - 0.15) * (i ? -1 : 1);
    });
  }
}
