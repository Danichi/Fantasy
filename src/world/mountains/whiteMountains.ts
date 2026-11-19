import * as THREE from 'three';
import { buildHouse, worldUV, type WorldMats } from '../buildings';
import { heightAt } from '../terrainHeight';
import { physics } from '../../physics/physics';
import { StaticBatch } from '../cityKit';
import { WAYSTONES } from '../kingsRoad';
import { mulberry32 } from '../../core/math';
import { events } from '../../core/events';
import { addProp } from '../../combat/props';
import { afflictions } from '../../combat/afflictions';
import { OrcWarlord, ORC_SCALE, type BossSpec } from '../../enemies/orc';
import type { FX } from '../../fx/particles';
import type { Player } from '../../player/player';
import type { Interactable } from '../../dungeon/instance';
import type { NpcRecord, Place, ScheduleEntry, Settlement } from '../../npc/npcManager';
import type { Look } from '../../npc/charBuilder';
import { COPPERBROOK, STONEGATE, FROSTPEAK, KETTLEHOLD, LIFT, CAIRNS, CHASM, COLD_VEIN, type Pad } from './mountainLayout';

// The White Mountains' lower holds (docs/design/mountains.md, the open-world
// plan's phase 3): what stands on the ground the terrain was shaped for.
//
//   Kettle Cove's landing camp and the Great Winch, a cage on rails up the cliff
//   Copperbrook: the mining village (half dwarf, half human), the Tin Lantern,
//     Sigrun's forge, the furrier, Bruni's expedition camp, the Cold Vein's mouth
//   Kettlehold: the lower hold's carved gate in the cliff (shut, for now)
//   the Dwarf Road's cairns: lanterns to light, huts to warm up in
//   Stonegate: the fort across the valley, held by rock trolls (fire stops
//     them healing: the braziers are there for a reason)
//   Frostpeak Citadel: the curtain wall, the King's Hall, the Great Lift
//     (sealed), and the Sunwheel the dwarves keep hooded in iron

/** The mountains' waystones: the cove's, and Frostpeak's (hooded until you lift the hood). */
const FP_STONE = new THREE.Vector3(FROSTPEAK.x - 8, 0, FROSTPEAK.z + 10);
WAYSTONES.push({ id: 'kettleCove', name: 'Kettle Cove (the quay)', pos: new THREE.Vector3(4440, 0, -3968) });
let hoodedNow = () => true;
WAYSTONES.push({ id: 'frostpeak', name: 'Frostpeak Citadel', pos: FP_STONE.clone(), hooded: () => hoodedNow() });

export interface MountainHooks {
  toast(m: string): void;
  card(title: string, sub: string): void;
  flags: Record<string, boolean | number | string>;
  save(): void;
  /** quest signals (cairns lit, Stonegate cleared, the lift ridden) */
  signal(id: string): void;
  /** a conversation with choices */
  talk(title: string, sub: string, text: string, opts: { label: string; run: () => void }[]): void;
  close(): void;
  bossBar(t: { hp: number; maxHp: number; alive: boolean } | null, name?: string): void;
  shake(n: number): void;
  /** wake a waystone into the Sunwheel network (story.wheel.attune) */
  attune(id: string): void;
  give(id: string, n: number): void;
}

const std = (color: number, roughness = 0.85, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const DWARF = (look: Partial<Look> & { body: Look['body'] }): Look => ({ outfit: 'ranger', height: 1.34, ...look });

/** A rock troll's body (the orc rig, stone-grey and bigger). */
const TROLL: BossSpec = { name: 'Rock Troll', model: '/assets/npc/orcWarchief.glb', hp: 560, scale: ORC_SCALE * 1.12, kind: 'rockTroll', bow: false, damage: 0.8, wake: 22, tint: 0x6e6e66 };
const TROLLS: { name: string; at: [number, number]; hp: number; scale: number; damage: number }[] = [
  { name: 'Gristle', at: [STONEGATE.x - 10, STONEGATE.z - 4], hp: 520, scale: 1.08, damage: 0.75 },
  { name: 'Mossback', at: [STONEGATE.x + 11, STONEGATE.z + 2], hp: 560, scale: 1.12, damage: 0.8 },
  { name: 'Grandmother Scree', at: [STONEGATE.x, STONEGATE.z - 24], hp: 880, scale: 1.3, damage: 1 },
];

export class WhiteMountains {
  readonly interactables: Interactable[] = [];
  readonly clearings: [number, number, number][] = [];
  readonly settlements: Settlement[] = [];
  readonly records: NpcRecord[] = [];
  /** fires, forges, cairn huts: the cold lets go of you here */
  readonly warmSpots: { x: number; z: number; r: number }[] = [];
  private batch = new StaticBatch();
  private m: WorldMats;
  private stone: THREE.Material;
  private wood = std(0x4a3a2c, 0.9);
  private iron = std(0x2e2e32, 0.45, 0.7);
  private fire = new THREE.MeshStandardMaterial({ color: 0xffa040, emissive: 0xff5a10, emissiveIntensity: 2.4, roughness: 1 });
  private blueCloth = new THREE.MeshStandardMaterial({ color: 0x2e5ea8, roughness: 0.8, side: THREE.DoubleSide });
  private redCloth = new THREE.MeshStandardMaterial({ color: 0x8a2a1e, roughness: 0.8, side: THREE.DoubleSide });
  private snowCap = std(0xeef2f6, 0.95);
  private rnd = mulberry32(5300);
  private flames: THREE.Mesh[] = [];
  private t = 0;
  private barShown = false;
  // the Great Winch
  private cage = new THREE.Group();
  private ride: { t: number; up: boolean } | null = null;
  // the cairns
  private cairnLamps: { mat: THREE.MeshStandardMaterial; glow: THREE.Sprite; at: THREE.Vector3; i: number }[] = [];
  // Stonegate's trolls
  private trolls: (OrcWarlord | null)[] = [null, null, null];
  private trollsLoading = false;
  private burnedAt = new Map<number, number>();
  private regenHint = false;
  private hood: THREE.Group | null = null;

  constructor(private scene: THREE.Scene, mats: WorldMats, private fx: FX, private player: Player, private h: MountainHooks) {
    this.m = mats;
    this.stone = (mats.bridgeStone ?? mats.stone) as THREE.Material;
    hoodedNow = () => !h.flags.frostpeakUnhooded;
    this.buildCampAndWinch();
    this.buildCopperbrook();
    this.buildKettlehold();
    this.buildCairns();
    this.buildStonegate();
    this.buildFrostpeak();
    this.batch.build(scene);
    scene.add(this.cage);
    this.placeCage(0);
    events.on('enemyDied', ({ kind }) => {
      if (kind !== 'rockTroll') return;
      h.give('trollHide', 1);
      const n = Number(h.flags.stonegateTrolls ?? 0) + 1;
      h.flags.stonegateTrolls = n;
      if (n >= TROLLS.length) {
        h.flags.stonegateClear = true;
        h.card('Stonegate', 'The road north is open');
        h.signal('stonegate-clear');
      }
      h.save();
    });
  }

  // ---- building blocks ---------------------------------------------------------------------------
  private add(g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) {
    const mesh = new THREE.Mesh(worldUV(g, 1.5), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz, 'YXZ');
    mesh.castShadow = mesh.receiveShadow = true;
    this.batch.addObject(mesh);
    return mesh;
  }
  private solid(x: number, y: number, z: number, hx: number, hy: number, hz: number, ry = 0) {
    physics.addBox(new THREE.Vector3(x, y, z), new THREE.Vector3(hx, hy, hz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)));
  }
  /** A box of stone (or anything) sitting on the ground at (x, z), turned `ry`, solid if asked. */
  private block(w: number, h: number, d: number, x: number, z: number, ry = 0, mat: THREE.Material = this.stone, solid = true, sink = 1.5, y0?: number) {
    const y = (y0 ?? heightAt(x, z)) - sink;
    this.add(new THREE.BoxGeometry(w, h + sink, d), mat, x, y + (h + sink) / 2, z, ry);
    if (solid) this.solid(x, y + (h + sink) / 2, z, w / 2, (h + sink) / 2, d / 2, ry);
  }
  /** A dwarf house: stone walls under a slate roof, turned to face (fx, fz). Returns its door. */
  private house(x: number, z: number, w: number, d: number, floors: 1 | 2, fx: number, fz: number, y?: number) {
    const rot = Math.atan2(fx - x, fz - z);
    const { group, half } = buildHouse({ w, d, floors, roof: 'slate', seed: Math.floor(this.rnd() * 1e5) }, { ...this.m, plaster: this.stone, timber: this.wood });
    const gy = y ?? heightAt(x, z);
    group.position.set(x, gy, z);
    group.rotation.y = rot;
    this.batch.addObject(group);
    physics.addBox(new THREE.Vector3(x, gy + half.y, z), half, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)));
    this.clearings.push([x, z, Math.max(w, d) * 0.8]);
    return new THREE.Vector3(x + Math.sin(rot) * (half.z + 1.4), gy, z + Math.cos(rot) * (half.z + 1.4));
  }
  /** A fire in an iron bowl: warm to stand by, and (as a combat prop) something to knock a troll into. */
  private brazier(x: number, z: number, prop = false, y?: number) {
    const gy = y ?? heightAt(x, z);
    this.add(new THREE.CylinderGeometry(0.1, 0.24, 1, 7), this.iron, x, gy + 0.5, z);
    this.add(new THREE.CylinderGeometry(0.55, 0.3, 0.34, 10, 1, true), this.iron, x, gy + 1.08, z);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 7), this.fire);
    flame.position.set(x, gy + 1.5, z);
    this.scene.add(flame);
    this.flames.push(flame);
    this.solid(x, gy + 0.6, z, 0.32, 0.6, 0.32);
    this.warmSpots.push({ x, z, r: 4 });
    if (prop) addProp({ kind: 'brazier', pos: new THREE.Vector3(x, gy, z), radius: 0.5 });
  }
  private firepit(x: number, z: number, y?: number) {
    const gy = y ?? heightAt(x, z);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      this.add(new THREE.DodecahedronGeometry(0.35, 0), this.stone, x + Math.cos(a) * 1.1, gy + 0.15, z + Math.sin(a) * 1.1, a);
    }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.4, 8), this.fire);
    flame.position.set(x, gy + 0.6, z);
    this.scene.add(flame);
    this.flames.push(flame);
    this.warmSpots.push({ x, z, r: 6 });
  }
  private banner(x: number, y: number, z: number, ry: number, mat: THREE.Material, h = 3.2) {
    this.add(new THREE.BoxGeometry(1.4, h, 0.05), mat, x, y - h / 2, z, ry);
  }
  private tent(x: number, z: number, ry: number, color: number) {
    const gy = heightAt(x, z);
    const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide });
    const g = new THREE.ConeGeometry(2.2, 2.6, 4, 1, true);
    this.add(g, cloth, x, gy + 1.3, z, ry + Math.PI / 4);
    this.solid(x, gy + 1, z, 1.3, 1, 1.3, ry);
    this.clearings.push([x, z, 3]);
  }
  private crates(x: number, z: number, n: number) {
    for (let k = 0; k < n; k++) {
      const px = x + (this.rnd() - 0.5) * 3, pz = z + (this.rnd() - 0.5) * 3;
      const gy = heightAt(px, pz);
      if (this.rnd() < 0.5) this.add(new THREE.BoxGeometry(0.9, 0.9, 0.9), this.wood, px, gy + 0.45, pz, this.rnd() * 3);
      else this.add(new THREE.CylinderGeometry(0.4, 0.44, 0.95, 10), this.wood, px, gy + 0.48, pz);
    }
  }
  private glow(at: THREE.Vector3, size: number, color: number) {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,240,200,1)');
    grad.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
    s.position.copy(at);
    s.scale.setScalar(size);
    this.scene.add(s);
    return s;
  }

  // ---- people ----------------------------------------------------------------------------------
  private town(id: string, name: string, center: THREE.Vector3, radius: number, homes: THREE.Vector3[], extra: Record<string, THREE.Vector3[]> = {}) {
    const places = new Map<string, Place>();
    places.set('homes', { id: 'homes', spots: homes.length ? homes : [center.clone()], indoors: true });
    for (const [k, spots] of Object.entries(extra)) places.set(k, { id: k, spots });
    const settlement: Settlement = { id, name, center, radius, places, nodes: [], edges: [] };
    this.settlements.push(settlement);
    return settlement;
  }
  private person(s: Settlement, id: string, name: string, title: string, look: Look, post: THREE.Vector3, yaw: number, hours: [number, number], activity: ScheduleEntry['activity'], lines: string[], evening?: string) {
    s.places.set('post:' + id, { id: 'post:' + id, spots: [post], yaw });
    const schedule: ScheduleEntry[] = hours[1] > 24
      ? [{ from: 0, activity, place: 'post:' + id }, { from: hours[1] - 24, activity: 'sleep', place: 'homes' }, { from: hours[0], activity, place: 'post:' + id }]
      : [{ from: 0, activity: 'sleep', place: 'homes' }, { from: hours[0], activity, place: 'post:' + id }, { from: hours[1], activity: evening ? 'drink' : 'sleep', place: evening ?? 'homes' }, { from: Math.min(23.8, hours[1] + 2.5), activity: 'sleep', place: 'homes' }];
    this.records.push({ id, name, title, job: id, settlement: s.id, look, schedule, lines: { any: lines }, named: true });
  }
  private folk(s: Settlement, id: string, name: string, look: Look, places: [string, string], lines: string[]) {
    this.records.push({
      id, name, job: 'townsfolk', settlement: s.id, look, lines: { any: lines },
      schedule: [{ from: 0, activity: 'sleep', place: 'homes' }, { from: 7, activity: 'work', place: places[0] }, { from: 18, activity: 'drink', place: places[1] }, { from: 22.5, activity: 'sleep', place: 'homes' }],
    });
  }
  private v(x: number, z: number, dy = 0) {
    return new THREE.Vector3(x, heightAt(x, z) + dy, z);
  }

  // ---- Kettle Cove's camp and the Great Winch ------------------------------------------------------
  private buildCampAndWinch() {
    const [bx, bz] = LIFT.bottom, [tx, tz] = LIFT.top;
    const bottom = new THREE.Vector3(bx, LIFT.bottomH, bz), top = new THREE.Vector3(tx, LIFT.topH, tz);
    const dir = top.clone().sub(bottom);
    const len = dir.length();
    const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    // Rails and sleepers up the incline.
    const rail = (off: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, len), this.iron);
      mesh.position.copy(bottom.clone().add(top).multiplyScalar(0.5).addScaledVector(side, off)).setY((bottom.y + top.y) / 2 + 0.35);
      mesh.lookAt(top.clone().addScaledVector(side, off).setY(top.y + 0.35));
      this.batch.addObject(mesh);
    };
    rail(-1.1);
    rail(1.1);
    // Nothing grows on the incline.
    for (let s = 0; s <= len; s += 12) {
      const p = bottom.clone().addScaledVector(dir, s / len);
      this.clearings.push([p.x, p.z, 10]);
    }
    for (let s = 2; s < len - 2; s += 5) {
      const p = bottom.clone().addScaledVector(dir, s / len);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 0.4), this.wood);
      mesh.position.copy(p).setY(p.y + 0.22);
      mesh.lookAt(p.clone().add(dir).setY(p.y + 0.22 + dir.y / len));
      this.batch.addObject(mesh);
    }
    // The bottom shed and the winch-house at the top.
    const yaw = Math.atan2(dir.x, dir.z);
    this.block(6, 0.4, 6, bx, bz + 4, yaw, this.wood, false);
    for (const [a, b] of [[-2.6, 6], [2.6, 6], [-2.6, 1], [2.6, 1]]) this.add(new THREE.CylinderGeometry(0.15, 0.15, 4, 6), this.wood, bx + side.x * a, heightAt(bx, bz + b) + 2, bz + b);
    this.add(new THREE.BoxGeometry(6.6, 0.25, 6.4), this.m.slate, bx, heightAt(bx, bz + 3.5) + 4.1, bz + 3.5, yaw, 0.12);
    this.house(tx + side.x * 8, tz - 4, 7, 6, 1, tx, tz - 30);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.22, 6, 18), this.iron);
    wheel.position.set(tx - side.x * 5, LIFT.topH + 2.6, tz - 2);
    wheel.rotation.y = yaw + Math.PI / 2;
    this.batch.addObject(wheel);
    this.add(new THREE.CylinderGeometry(0.25, 0.25, 5, 6), this.wood, tx - side.x * 5, LIFT.topH + 2.2, tz - 2);
    this.clearings.push([bx, bz, 8], [tx, tz, 10]);
    // The cage: a planked floor, four posts and a little roof.
    const floor = new THREE.Mesh(new THREE.BoxGeometry(3, 0.22, 3), this.wood);
    this.cage.add(floor);
    for (const [a, b] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 0.12), this.iron);
      post.position.set(a, 1.2, b);
      this.cage.add(post);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 3.2), this.iron);
    roof.position.y = 2.4;
    this.cage.add(roof);
    this.cage.rotation.y = yaw;
    // Interactables at each end.
    const ends = [{ at: new THREE.Vector3(bx - dir.x / len * 3, 0, bz - dir.z / len * 3), up: true }, { at: new THREE.Vector3(tx + dir.x / len * 3, 0, tz + dir.z / len * 3), up: false }];
    for (const e of ends) {
      e.at.y = heightAt(e.at.x, e.at.z);
      this.interactables.push({
        pos: e.at, radius: 4,
        label: () => (this.ride ? '' : e.up ? 'Ride the Great Winch up to Copperbrook' : 'Ride the Great Winch down to Kettle Cove'),
        enabled: () => !this.ride,
        action: () => this.startRide(e.up),
      });
    }
    // The landing camp between the quay and the winch.
    const cx = 4392, cz = -3990;
    this.tent(cx, cz - 6, 0.3, 0x8a2a1e);
    this.tent(cx + 9, cz - 3, -0.2, 0x6a5a40);
    this.tent(cx - 8, cz + 2, 0.6, 0x6a5a40);
    this.firepit(cx + 2, cz + 4);
    this.crates(cx - 4, cz - 10, 6);
    const camp = this.town('kettleCamp', 'Kettle Cove', this.v(cx, cz), 200, [this.v(cx, cz - 6), this.v(cx + 9, cz - 3)], { fire: [this.v(cx + 3, cz + 6), this.v(cx, cz + 6)] });
    this.person(camp, 'hamm', 'Captain Hamm Copperbeard', 'Master of the Iron Kettle', DWARF({ body: 'male', hair: 'buzzed', beard: true, hairColor: 0xb8642a, skin: 0xe0b08a, cloth: 0x2a3a5a, pauldron: true, height: 1.38 }), this.v(4466, -3986), Math.PI, [6, 21], 'idle',
      ['She burns coal and she burns patience. Mostly patience.', 'Every third morning she goes home to the Port, and comes back with flour and fools.'], 'fire');
    this.person(camp, 'tova', 'Tova Gearhand', 'Warden of the Great Winch', DWARF({ body: 'female', hair: 'buns', hairColor: 0x3a2a1a, skin: 0xd8a880, cloth: 0x5a4a3a, bracers: true }), this.v(bx + 3, bz + 8), yaw, [6, 22], 'work',
      ['Four hundred and seventy steps of rail, and every one of them oiled by me.', 'Ride up, don\'t walk. You can walk. The cliff will tell you why you shouldn\'t.'], 'fire');
    this.folk(camp, 'kettle-porter-1', 'Bram Saltfoot', DWARF({ body: 'male', hair: 'buzzed', beard: true, hairColor: 0x2a1a10, skin: 0xd8a880, cloth: 0x4a3a2a }), ['fire', 'fire'], ['Mind the crates. Mind the ice. Mind your head.', 'The Kettle\'s late. The Kettle\'s always late.']);
  }
  private placeCage(t: number) {
    const [bx, bz] = LIFT.bottom, [tx, tz] = LIFT.top;
    this.cage.position.set(bx + (tx - bx) * t, LIFT.bottomH + (LIFT.topH - LIFT.bottomH) * t + 0.45, bz + (tz - bz) * t);
  }
  private startRide(up: boolean) {
    this.placeCage(up ? 0 : 1);
    this.ride = { t: 0, up };
    this.h.toast(up ? 'Tova throws the lever. The cage jerks, and the cove drops away beneath you.' : 'The brake comes off, and the cage starts down toward the sea.');
  }
  private stepRide(dt: number) {
    const r = this.ride!;
    r.t += dt / 16;
    const k = Math.min(1, r.t), e = k * k * (3 - 2 * k);
    this.placeCage(r.up ? e : 1 - e);
    this.player.teleport(this.cage.position.clone().setY(this.cage.position.y + 0.15));
    this.player.vel.set(0, 0, 0);
    if (k >= 1) {
      this.ride = null;
      const [bx, bz] = LIFT.bottom, [tx, tz] = LIFT.top;
      const dx = tx - bx, dz = tz - bz, L = Math.hypot(dx, dz);
      const off = r.up ? new THREE.Vector3(tx + (dx / L) * 6, 0, tz + (dz / L) * 6) : new THREE.Vector3(bx - (dx / L) * 6, 0, bz - (dz / L) * 6);
      off.y = heightAt(off.x, off.z) + 0.3;
      this.player.teleport(off);
      if (r.up) {
        this.h.signal('winch-up');
        if (!this.h.flags.copperbrookSeen) {
          this.h.flags.copperbrookSeen = true;
          this.h.card('Copperbrook', 'The mining village above the cove');
        }
      }
    }
  }

  // ---- Copperbrook ---------------------------------------------------------------------------------
  private buildCopperbrook() {
    const C = COPPERBROOK, y = C.h;
    const at = (dx: number, dz: number) => [C.x + dx, C.z + dz] as const;
    const homes: THREE.Vector3[] = [];
    const H = (dx: number, dz: number, w: number, d: number, f: 1 | 2) => homes.push(this.house(C.x + dx, C.z + dz, w, d, f, C.x, C.z, y));
    // Homes round the square (the north road, the winch path and the mine track left open).
    H(-36, -4, 7, 6, 1);
    H(-31, 18, 7, 6, 2);
    H(34, 12, 7, 6, 1);
    H(29, 31, 6, 6, 1);
    H(10, 38, 7, 6, 2);
    H(-6, -38, 6, 6, 1);
    // The Tin Lantern (the inn) and Sigrun's forge.
    const inn = this.house(C.x - 24, C.z - 26, 12, 9, 2, C.x, C.z, y);
    const [fx, fz] = at(24, -22);
    this.block(9, 0.3, 7, fx, fz, 0, this.stone, false, 0.3, y);
    for (const [a, b] of [[-4, -3], [4, -3], [-4, 3], [4, 3]]) this.add(new THREE.CylinderGeometry(0.2, 0.22, 3.4, 6), this.wood, fx + a, y + 1.7, fz + b);
    this.add(new THREE.BoxGeometry(9.6, 0.3, 7.6), this.m.slate, fx, y + 3.55, fz, 0, 0.08);
    this.block(2.4, 1.1, 1.8, fx + 2, fz + 1, 0, this.stone, true, 0.2, y);
    this.add(new THREE.BoxGeometry(1.2, 6, 1.2), this.stone, fx + 2.6, y + 3, fz + 2.6);
    const forgeFire = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 1.1), this.fire);
    forgeFire.position.set(fx + 2, y + 1.22, fz + 1);
    this.scene.add(forgeFire);
    this.flames.push(forgeFire);
    this.add(new THREE.BoxGeometry(0.9, 0.7, 0.5), this.iron, fx - 1.6, y + 0.7, fz + 0.5);
    this.warmSpots.push({ x: fx + 2, z: fz + 1, r: 5 });
    // The square: a firepit, a well, a lantern post, the notice of the claim.
    this.firepit(C.x, C.z, y);
    this.add(new THREE.CylinderGeometry(1.1, 1.2, 0.9, 12), this.stone, C.x + 8, y + 0.45, C.z - 6);
    this.solid(C.x + 8, y + 0.45, C.z - 6, 1.1, 0.45, 1.1);
    // Bruni's expedition camp on the square's east side.
    this.tent(C.x + 15, C.z + 2, 0.4, 0x8a2a1e);
    this.tent(C.x + 18, C.z - 6, -0.3, 0x6a5a40);
    this.crates(C.x + 12, C.z - 10, 5);
    this.add(new THREE.BoxGeometry(2.2, 0.12, 1.2), this.wood, C.x + 11, y + 0.9, C.z + 4);
    // The mine track: rails out to the Cold Vein's mouth.
    const [mx, mz] = COLD_VEIN.at;
    const mineY = heightAt(mx, mz);
    const len = Math.hypot(mx - (C.x + 26), mz - (C.z - 8));
    const ry = Math.atan2(mx - (C.x + 26), mz - (C.z - 8));
    for (const s of [-0.6, 0.6]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, len), this.iron);
      mesh.position.set((mx + C.x + 26) / 2 + Math.cos(ry) * s, (mineY + y) / 2 + 0.05, (mz + C.z - 8) / 2 - Math.sin(ry) * s);
      mesh.lookAt(mx + Math.cos(ry) * s, mineY + 0.05, mz - Math.sin(ry) * s);
      this.batch.addObject(mesh);
    }
    for (const k of [0.3, 0.6]) {
      const px = C.x + 26 + (mx - C.x - 26) * k, pz = C.z - 8 + (mz - C.z + 8) * k;
      const gy = heightAt(px, pz);
      this.add(new THREE.BoxGeometry(1.2, 0.8, 1.6), this.wood, px, gy + 0.6, pz, ry);
      this.add(new THREE.SphereGeometry(0.6, 6, 4), std(0x1a1a20, 0.3, 0.8), px, gy + 1.05, pz);
    }
    // The Cold Vein's mouth: a timbered portal in the bank, dark inside, frost on the beams.
    const yaw = COLD_VEIN.yaw;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), sd = new THREE.Vector3(fwd.z, 0, -fwd.x);
    for (const s of [-1.8, 1.8]) this.add(new THREE.BoxGeometry(0.4, 3.6, 0.4), this.wood, mx + sd.x * s, mineY + 1.6, mz + sd.z * s);
    this.add(new THREE.BoxGeometry(0.5, 0.5, 4.6), this.wood, mx, mineY + 3.4, mz, yaw + Math.PI / 2);
    this.add(new THREE.BoxGeometry(5.5, 6, 3), this.stone, mx - fwd.x * 2.2, mineY + 2, mz - fwd.z * 2.2, yaw);
    const dark = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial({ color: 0x050608 }));
    dark.position.set(mx + fwd.x * 0.75, mineY + 1.6, mz + fwd.z * 0.75);
    dark.rotation.y = yaw;
    this.scene.add(dark);
    this.clearings.push([mx, mz, 8], [C.x, C.z, C.r + 6]);
    // The people.
    const square = [this.v(C.x - 4, C.z + 3), this.v(C.x + 4, C.z + 3), this.v(C.x - 3, C.z - 4), this.v(C.x + 5, C.z - 2)];
    const s = this.town('copperbrook', 'Copperbrook', new THREE.Vector3(C.x, y, C.z), 260, homes, { tavern: [inn.clone()], square, mine: [this.v(mx - 8, mz + 2), this.v(mx - 10, mz - 3)], forge: [this.v(fx - 1, fz + 3)] });
    s.places.set('tavern', { id: 'tavern', spots: [inn.clone()], indoors: true });
    this.person(s, 'bruni-wm', 'Bruni Stonevein', 'Dwarven Expedition Leader', { body: 'female', outfit: 'ranger', hair: 'buns', hairColor: 0x8a3f22, skin: 0xe0b894, cloth: 0x7a5a3a, pauldron: true, height: 1.36 }, this.v(C.x + 11, C.z + 6), Math.PI, [6, 22], 'talk',
      ['First claim\'s a mess. Second claim will be worse. Third claim, we\'ll be rich.', 'The holds smell of coal and old stone. Home.'], 'tavern');
    this.person(s, 'marta', 'Marta Hollins', 'Mine-Boss of the Hollins Crew', { body: 'female', outfit: 'peasant', hair: 'long', hairColor: 0x6a4a2a, skin: 0xf0d0b0, linen: 0xc8b898, cloth: 0x4a5a3a, height: 1.72 }, this.v(mx - 12, mz + 5), -Math.PI / 2, [6, 20], 'work',
      ['Twelve years I\'ve worked this hill. Dwarves turn up with a paper and call it theirs.', 'The ore\'s coming up black in the low drift. My lads won\'t go down there after dark.'], 'tavern');
    this.person(s, 'sigrun', 'Sigrun Emberhand', 'Smith of Copperbrook · Weapons, Armour and the Forge', DWARF({ body: 'female', hair: 'buns', hairColor: 0x2a1a10, skin: 0xd8a880, cloth: 0x3a2a1a, bracers: true, height: 1.36 }), this.v(fx - 1.5, fz + 3), Math.PI, [7, 19], 'work',
      ['Black iron? Don\'t bring it near my forge. It eats the heat.', 'Furs from Annick, steel from me. That\'s how you live up here.'], 'tavern');
    this.person(s, 'olga', 'Olga Brewstone', 'Keeper of the Tin Lantern · Rooms and Hot Food', DWARF({ body: 'female', hair: 'long', hairColor: 0xb87a3a, skin: 0xf0c8a0, cloth: 0x8a3a2a }), this.v(C.x - 20, C.z - 20), Math.PI / 4, [6, 25], 'idle',
      ['Stew\'s on. Stew\'s always on.', 'A bed by the chimney is worth any three blankets.']);
    this.person(s, 'annick', 'Annick Ravelle', 'Furrier of the Holds · Furs and Warm Things', { body: 'female', outfit: 'ranger', hood: true, hair: 'long', hairColor: 0x2a1a12, skin: 0xe0b894, cloth: 0x6a4a2a, height: 1.66 }, this.v(C.x - 10, C.z + 14), Math.PI, [7, 19], 'talk',
      ['Wolf fur, sheepskin, troll hide if you can bring me some. Nothing else keeps the snow out.', 'The cold here takes the careless first.'], 'tavern');
    const miners: [string, string, Look][] = [
      ['cb-miner-1', 'Gorm Pickfist', DWARF({ body: 'male', hair: 'buzzed', beard: true, hairColor: 0x3a2a1a, skin: 0xd8a880, cloth: 0x4a4a4a })],
      ['cb-miner-2', 'Hettie Hollins', { body: 'female', outfit: 'peasant', hair: 'buns', hairColor: 0x8a5a2a, skin: 0xf0d0b0, linen: 0xc8b898, cloth: 0x4a5a3a }],
      ['cb-miner-3', 'Tam Hollins', { body: 'male', outfit: 'peasant', hair: 'simpleparted', hairColor: 0x6a4a2a, skin: 0xe0b894, linen: 0xc8b898, cloth: 0x5a4a3a }],
      ['cb-miner-4', 'Dvalin Coalbeard', DWARF({ body: 'male', hair: 'buzzed', beard: true, hairColor: 0x1a1410, skin: 0xc89a74, cloth: 0x3a3a3a })],
    ];
    for (const [id, name, look] of miners) this.folk(s, id, name, look, ['mine', 'tavern'], ['Black ore again. Don\'t touch it bare-handed.', 'Twelve hours down, and the stew\'s cold. Typical.', 'Ever seen a troll? I have. Once was plenty.']);
  }

  // ---- Kettlehold's gate -----------------------------------------------------------------------------
  private buildKettlehold() {
    const K = KETTLEHOLD, y = K.h;
    const fx = K.x - 15; // the cliff face
    // The carved face: a great slab with a doorway, two stone kings either side, braziers.
    this.block(4, 18, 24, fx - 2, K.z, 0, this.stone, true, 2, y);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.3, 9, 6), std(0x1e1e22, 0.4, 0.8));
    door.position.set(fx + 0.1, y + 4.5, K.z);
    this.batch.addObject(door);
    this.add(new THREE.BoxGeometry(0.6, 1.2, 8), this.stone, fx + 0.3, y + 9.6, K.z);
    for (const s of [-1, 1]) {
      const sz = K.z + s * 7.5;
      this.block(2.4, 1, 2.4, fx + 1.4, sz, 0, this.stone, true, 0.4, y);
      this.add(new THREE.CylinderGeometry(1, 1.2, 4.2, 8), this.stone, fx + 1.4, y + 3.1, sz);
      this.add(new THREE.SphereGeometry(0.9, 8, 6), this.stone, fx + 1.4, y + 5.8, sz);
      this.add(new THREE.ConeGeometry(0.9, 2.4, 8), this.stone, fx + 2.1, y + 4.4, sz, 0, 0, Math.PI);
      this.add(new THREE.BoxGeometry(0.3, 4.6, 0.3), this.stone, fx + 2.6, y + 3, sz + s * 0.9);
      this.brazier(fx + 4, K.z + s * 4, false, y);
      this.banner(fx + 0.4, y + 14, K.z + s * 3.6, Math.PI / 2, this.redCloth, 5);
    }
    this.clearings.push([K.x, K.z, 18]);
    this.interactables.push({
      pos: new THREE.Vector3(fx + 2.5, y, K.z), radius: 4,
      label: () => 'The doors of Kettlehold',
      enabled: () => true,
      action: () => this.h.talk('Kettlehold', 'The lower hold', this.h.flags.kingsAudienceDone
        ? 'The doors are barred from within. A guard\'s voice through the grille: "The deep halls are shut until the Under-King answers the King\'s letter. Frostpeak\'s Great Lift will be the way down, when it opens."'
        : 'Iron doors twice your height, barred from within. Through the grille, a dwarf\'s voice: "The hold\'s shut to outsiders while the black iron is found. Speak to the Thane, out here in the forecourt."', [{ label: 'Leave it.', run: () => this.h.close() }]),
    });
    const s = this.town('kettlehold', 'Kettlehold', new THREE.Vector3(K.x, y, K.z), 160, [new THREE.Vector3(fx + 1, y, K.z)]);
    this.person(s, 'brynja', 'Hold-Thane Brynja Stonevein', 'Thane of Kettlehold', DWARF({ body: 'female', hair: 'long', hairColor: 0xb8b4ae, skin: 0xe0b894, cloth: 0x8a2a1e, pauldron: true, bracers: true, height: 1.38 }), new THREE.Vector3(K.x - 4, y, K.z + 1), -Math.PI / 2, [6, 23], 'idle',
      ['My daughter went to sea and came back with a sky-born. Bruni never did anything small.', 'The hold remembers what the surface forgets. That is what holds are for.']);
    for (const k of [0, 1]) this.folk(s, `kh-guard-${k}`, k ? 'Hold-Guard Orvar' : 'Hold-Guard Kelda', DWARF({ body: k ? 'male' : 'female', hair: 'buzzed', beard: !!k, hairColor: 0x3a2a1a, skin: 0xd8a880, cloth: 0x8a2a1e, pauldron: true }), ['homes', 'homes'], ['Move along, sky-born.', 'The Thane\'s word is the hold\'s word.']);
    for (const r of this.records) if (r.settlement === 'kettlehold' && r.id.startsWith('kh-guard')) r.schedule = [{ from: 0, activity: 'patrol', place: 'post:brynja' }];
  }

  // ---- the cairns on the Dwarf Road --------------------------------------------------------------------
  private buildCairns() {
    CAIRNS.forEach((c, i) => {
      const [x, z] = c.at;
      const cx = x + 4.5, cz = z;
      const gy = heightAt(cx, cz);
      for (let k = 0; k < 3; k++) this.add(new THREE.DodecahedronGeometry(0.9 - k * 0.22, 0), this.stone, cx + (this.rnd() - 0.5) * 0.3, gy + 0.5 + k * 0.8, cz + (this.rnd() - 0.5) * 0.3, this.rnd() * 3);
      this.add(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 5), this.iron, cx, gy + 1.6, cz);
      const mat = new THREE.MeshStandardMaterial({ color: 0x3a3830, emissive: 0xffc070, emissiveIntensity: 0, roughness: 0.4 });
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), mat);
      lamp.position.set(cx, gy + 3.4, cz);
      this.scene.add(lamp);
      const at = new THREE.Vector3(cx, gy + 3.4, cz);
      this.cairnLamps.push({ mat, glow: this.glow(at, 5, 0xffc878), at, i });
      this.solid(cx, gy + 1.2, cz, 0.8, 1.2, 0.8);
      this.clearings.push([cx, cz, 4]);
      this.interactables.push({
        pos: new THREE.Vector3(cx, gy, cz), radius: 3,
        label: () => (this.h.flags[`cairn:${i}`] ? '' : 'Light the cairn lantern'),
        enabled: () => !this.h.flags[`cairn:${i}`],
        action: () => {
          this.h.flags[`cairn:${i}`] = true;
          this.h.signal('cairn-lit');
          const lit = CAIRNS.filter((_, k) => this.h.flags[`cairn:${k}`]).length;
          this.h.toast(`The wick takes. A dwarf lantern burns on the road again (${lit} of ${CAIRNS.length}).`);
          this.fx.add.spawn({ pos: at.clone(), spread: 1.2, count: 14, life: [0.3, 0.8], size: [0.18, 0.03], color: 0xffd080, color2: 0xff7a20, drag: 3 });
          this.h.save();
        },
      });
      // A hut beside some cairns: four stone walls, a slate roof, a hearth (warm, always).
      if (c.hut) {
        const hx = x - 7, hz = z;
        const hy = heightAt(hx, hz);
        for (const [dx, dz, w, d] of [[0, -2.2, 4.8, 0.4], [-2.2, 0, 0.4, 4.8], [2.2, -1.4, 0.4, 2]] as const) this.block(w, 2.4, d, hx + dx, hz + dz, 0, this.stone, true, 1, hy);
        this.add(new THREE.BoxGeometry(5.4, 0.25, 5.4), this.m.slate, hx, hy + 2.6, hz, 0, 0.1);
        this.add(new THREE.BoxGeometry(5.6, 0.15, 5.6), this.snowCap, hx, hy + 2.82, hz, 0, 0.1);
        this.firepit(hx, hz - 0.8, hy);
        this.clearings.push([hx, hz, 5]);
      }
    });
  }

  // ---- Stonegate --------------------------------------------------------------------------------------
  private buildStonegate() {
    const S = STONEGATE, y = S.h;
    const x0 = S.x - 26, x1 = S.x + 26, zs = S.z + 18, zn = S.z - 18;
    // The walls: south and north across the valley with a gate in each, sides between.
    const wall = (ax: number, az: number, bx: number, bz: number) => {
      const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
      this.block(2.4, 7, len, (ax + bx) / 2, (az + bz) / 2, ry, this.stone, true, 4, y);
      this.add(new THREE.BoxGeometry(2.8, 0.6, len), this.stone, (ax + bx) / 2, y + 7.3, (az + bz) / 2, ry);
    };
    for (const z of [zs, zn]) {
      wall(x0, z, S.x - 5, z);
      wall(S.x + 5, z, x1, z);
      this.add(new THREE.BoxGeometry(10.4, 2, 2.6), this.stone, S.x, y + 6.6, z);
      this.banner(S.x, y + 5.6, z + (z === zs ? 1.35 : -1.35), 0, this.redCloth, 3.4);
    }
    wall(x0, zn, x0, zs);
    wall(x1, zn, x1, zs);
    for (const [tx, tz] of [[x0, zs], [x1, zs], [x0, zn], [x1, zn]]) {
      this.add(new THREE.CylinderGeometry(3.4, 3.8, 15, 10), this.stone, tx, y + 4.5, tz);
      this.solid(tx, y + 4.5, tz, 3.4, 7.5, 3.4);
      this.add(new THREE.ConeGeometry(4.2, 3.6, 10), this.m.slate, tx, y + 13.8, tz);
    }
    // Inside: the trolls' mess. Braziers they never let go out, barrels, bones.
    this.brazier(S.x - 8, S.z + 6, true, y);
    this.brazier(S.x + 9, S.z - 7, true, y);
    this.brazier(S.x - 4, S.z - 12, true, y);
    const barrel = (x: number, z: number) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.95, 12), this.wood);
      body.rotation.z = Math.PI / 2;
      const roll = new THREE.Group();
      roll.add(body);
      g.add(roll);
      g.position.set(x, y + 0.4, z);
      g.rotation.y = this.rnd() * Math.PI;
      this.scene.add(g);
      const collider = physics.addBox(new THREE.Vector3(x, y + 0.4, z), new THREE.Vector3(0.36, 0.36, 0.36), new THREE.Quaternion());
      addProp({ kind: 'barrel', pos: new THREE.Vector3(x, y, z), radius: 0.42, mesh: g, collider, onBreak: () => this.scene.remove(g) });
    };
    barrel(S.x + 14, S.z + 9);
    barrel(S.x + 15, S.z + 7.8);
    barrel(S.x - 15, S.z - 5);
    for (let k = 0; k < 8; k++) this.add(new THREE.CylinderGeometry(0.08, 0.1, 0.8 + this.rnd(), 5), std(0xe8dcc0, 0.9), S.x + (this.rnd() - 0.5) * 30, y + 0.2, S.z + (this.rnd() - 0.5) * 20, this.rnd() * 3, Math.PI / 2);
    this.clearings.push([S.x, S.z, 36]);
    // The garrison camp south of the walls: Captain Dagny and what's left of her company.
    const gx = S.x + 4, gz = zs + 16;
    this.tent(gx + 6, gz + 4, 0.2, 0x8a2a1e);
    this.firepit(gx - 3, gz + 3);
    const s = this.town('stonegate', 'Stonegate', this.v(gx, gz), 180, [this.v(gx + 6, gz + 4)], { fire: [this.v(gx - 2, gz + 6), this.v(gx - 5, gz + 4)] });
    this.person(s, 'dagny', 'Captain Dagny Ironvow', 'Captain of Stonegate', DWARF({ body: 'female', hair: 'buzzed', hairColor: 0x3a2a1a, skin: 0xd8a880, cloth: 0x8a2a1e, pauldron: true, bracers: true, height: 1.4 }), this.v(gx, gz - 2), Math.PI, [5, 23], 'idle',
      ['Three trolls in my fort. Three. I had forty soldiers once.', 'They heal. Cut them and they knit. Burn them and they don\'t.'], 'fire');
    for (const k of [0, 1]) this.folk(s, `sg-soldier-${k}`, k ? 'Soldier Brokk' : 'Soldier Ylva', DWARF({ body: k ? 'male' : 'female', hair: 'buzzed', beard: !!k, hairColor: 0x2a1a10, skin: 0xd8a880, cloth: 0x8a2a1e, pauldron: true }), ['fire', 'fire'], ['They took the walls in a night.', 'Grandmother Scree. That\'s what we call the big one. She\'s older than the fort.']);
    // The Chasm, off to the west: a rim of stones round a shaft that goes down forever.
    const [chx, chz] = CHASM;
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2, r = 22 + (this.rnd() - 0.5) * 4;
      const px = chx + Math.cos(a) * r, pz = chz + Math.sin(a) * r;
      this.add(new THREE.DodecahedronGeometry(1 + this.rnd(), 0), this.stone, px, heightAt(px, pz) + 0.3, pz, this.rnd() * 3);
    }
    const lookout = this.v(chx + 24, chz);
    this.interactables.push({
      pos: lookout, radius: 4, label: () => 'Look down into the Chasm', enabled: () => true,
      action: () => this.h.talk('The Chasm', 'Beside Stonegate', 'A shaft in the mountain, round as a well and wide as a square. You drop a stone and never hear it land. The soldiers say on still nights you can hear hammers down there, very far away, keeping time.', [{ label: 'Step back.', run: () => this.h.close() }]),
    });
  }

  // ---- Frostpeak Citadel ---------------------------------------------------------------------------------
  private buildFrostpeak() {
    const F = FROSTPEAK, y = F.h;
    // The curtain wall: sixteen segments round the pad, a gap for the gate on the south (the road comes up from there).
    const R = 50;
    for (let k = 0; k < 16; k++) {
      const a0 = (k / 16) * Math.PI * 2, a1 = ((k + 1) / 16) * Math.PI * 2;
      const mid = (a0 + a1) / 2;
      if (Math.abs(Math.atan2(Math.sin(mid), Math.cos(mid))) < 0.25) continue; // south (+z): the gate
      const ax = F.x + Math.sin(a0) * R, az = F.z + Math.cos(a0) * R, bx = F.x + Math.sin(a1) * R, bz = F.z + Math.cos(a1) * R;
      const len = Math.hypot(bx - ax, bz - az) + 0.6, ry = Math.atan2(bx - ax, bz - az);
      this.block(3, 9, len, (ax + bx) / 2, (az + bz) / 2, ry, this.stone, true, 5, y);
      this.add(new THREE.BoxGeometry(3.4, 0.7, len), this.stone, (ax + bx) / 2, y + 9.35, (az + bz) / 2, ry);
      if (k % 2 === 0) this.banner((ax + bx) / 2 - Math.sin(mid) * 1.6, y + 8.5, (az + bz) / 2 - Math.cos(mid) * 1.6, ry + Math.PI / 2, this.blueCloth, 4);
    }
    // The gatehouse: two towers either side of the gap.
    const gate = new THREE.Vector3(F.x, y, F.z + R);
    for (const s of [-1, 1]) {
      const tx = gate.x + s * 9, tz = gate.z - 1;
      this.add(new THREE.CylinderGeometry(4.2, 4.8, 18, 10), this.stone, tx, y + 6, tz);
      this.solid(tx, y + 6, tz, 4.2, 9, 4.2);
      this.add(new THREE.ConeGeometry(5, 5, 10), this.m.slate, tx, y + 17.4, tz);
      this.add(new THREE.ConeGeometry(5.1, 1.6, 10), this.snowCap, tx, y + 16.2, tz);
      this.brazier(gate.x + s * 4, gate.z + 4, false, y);
    }
    this.add(new THREE.BoxGeometry(12, 3, 3.2), this.stone, gate.x, y + 9, gate.z - 1);
    // The King's Hall against the mountain on the east: three walls, a slate roof, pillars along its open front.
    const hx = F.x + 24, hz = F.z - 6;
    this.block(16, 9, 1.4, hx, hz - 15, 0, this.stone, true, 2, y);
    this.block(16, 9, 1.4, hx, hz + 15, 0, this.stone, true, 2, y);
    this.block(1.6, 11, 31, hx + 8, hz, 0, this.stone, true, 2, y);
    for (const s of [-1, 1]) this.add(new THREE.BoxGeometry(9.6, 0.4, 32), this.m.slate, hx + s * 4.1, y + 10.7, hz, 0, 0, s * -0.45);
    for (let k = -3; k <= 3; k++) {
      this.add(new THREE.CylinderGeometry(0.6, 0.7, 9, 10), this.stone, hx - 7.6, y + 4.5, hz + k * 4.2);
      this.solid(hx - 7.6, y + 4.5, hz + k * 4.2, 0.6, 4.5, 0.6);
    }
    this.add(new THREE.BoxGeometry(14, 0.5, 30), std(0x5a5e66, 0.8), hx, y + 0.1, hz);
    this.block(5, 0.8, 8, hx + 4.6, hz, 0, this.stone, true, 0.2, y + 0.3);
    this.block(1.6, 2.4, 1.8, hx + 6, hz, 0, std(0x3a5a8a, 0.6, 0.3), true, 0, y + 1.1);
    for (const s of [-1, 1]) {
      this.brazier(hx - 3, hz + s * 10, false, y);
      this.banner(hx + 7.1, y + 9, hz + s * 6, -Math.PI / 2, this.blueCloth, 6);
    }
    this.warmSpots.push({ x: hx, z: hz, r: 14 });
    // The Great Lift on the north side: a tower over a shaft, the cage hanging on chains, sealed.
    const lx = F.x - 6, lz = F.z - 36;
    this.add(new THREE.CylinderGeometry(6, 6.6, 26, 12), this.stone, lx, y + 11, lz);
    this.solid(lx, y + 11, lz, 6, 13, 6);
    this.add(new THREE.ConeGeometry(7, 6, 12), this.m.slate, lx, y + 27, lz);
    this.add(new THREE.BoxGeometry(5, 7, 0.4), std(0x1e1e22, 0.4, 0.8), lx, y + 3.5, lz + 6.4);
    this.interactables.push({
      pos: this.v(lx, lz + 8), radius: 4, label: () => 'The Great Lift', enabled: () => true,
      action: () => this.h.talk('The Great Lift', 'Frostpeak Citadel', 'A cage the size of a house hangs in a shaft that goes down through the mountain, on chains as thick as your waist. The gate is chained shut. A guard: "Down there\'s the Deep Hold and the Under-King, and he hasn\'t answered our King\'s letters in a hundred years. The Lift moves when he does."', [{ label: 'Leave it.', run: () => this.h.close() }]),
    });
    // Homes and barracks along the west wall.
    const homes = [this.house(F.x - 36, F.z - 12, 8, 6, 2, F.x, F.z, y), this.house(F.x - 37, F.z + 10, 8, 6, 1, F.x, F.z, y), this.house(F.x - 26, F.z - 30, 7, 6, 1, F.x, F.z, y), this.house(F.x - 22, F.z + 30, 8, 6, 2, F.x, F.z, y)];
    this.brazier(F.x - 14, F.z - 2, false, y);
    this.brazier(F.x + 2, F.z + 22, false, y);
    // The Sunwheel waystone in the courtyard, hooded in iron (the dwarves won't have it looking at them).
    const ws = FP_STONE.clone().setY(y);
    const hood = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.2, 3.2, 6, 1), std(0x2a2a2e, 0.4, 0.75));
    cone.position.y = 1.5;
    hood.add(cone);
    for (const yy of [0.6, 2.4]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(1.1 - yy * 0.08, 0.08, 6, 16), std(0x6a5a3a, 0.5, 0.6));
      band.rotation.x = Math.PI / 2;
      band.position.y = yy;
      hood.add(band);
    }
    hood.position.copy(ws);
    this.scene.add(hood);
    this.hood = hood;
    this.interactables.push({
      pos: ws, radius: 3,
      label: () => (this.h.flags.frostpeakUnhooded ? '' : 'The hooded Sunwheel'),
      enabled: () => !this.h.flags.frostpeakUnhooded,
      action: () => this.h.talk('The hooded Sunwheel', 'Frostpeak Citadel', 'A waystone like the ones on the King\'s Road, but cased in an iron hood bolted to the flagstones. The dwarves walk round it the way you would walk round a sleeping dog. You could lift the hood: the bolts are only finger-tight. Then the stone would join the Sunwheel network, and you could travel here from any other.', [
        { label: 'Lift the hood and touch the Sunwheel.', run: () => this.unhood() },
        { label: 'Leave it hooded.', run: () => this.h.close() },
      ]),
    });
    this.clearings.push([F.x, F.z, F.r + 4]);
    // The people of the citadel.
    const court = [this.v(F.x - 4, F.z + 4), this.v(F.x + 6, F.z - 8), this.v(F.x - 10, F.z - 14)];
    const s = this.town('frostpeak', 'Frostpeak', new THREE.Vector3(F.x, y, F.z), 260, homes, { court, gate: [this.v(gate.x - 3, gate.z - 4), this.v(gate.x + 3, gate.z - 4)] });
    this.person(s, 'durin', 'King Durin Frostbeard', 'King of the Surface Holds', DWARF({ body: 'male', hair: 'long', beard: true, hairColor: 0xd8d4cc, skin: 0xe0b894, cloth: 0x2e5ea8, pauldron: true, bracers: true, height: 1.42 }), new THREE.Vector3(hx + 4.2, y + 1.1, hz), -Math.PI / 2, [7, 23], 'idle',
      ['The mountain was here before the King, and it will be here after.', 'Speak plainly, sky-born. Dwarves have no patience for courtiers.']);
    this.person(s, 'hrafna', 'Lorekeeper Hrafna Deepquill', 'Keeper of the Old Ledgers', DWARF({ body: 'female', hair: 'long', hairColor: 0x8a8a8a, skin: 0xe8c8a8, cloth: 0x3a3a5a, height: 1.3 }), new THREE.Vector3(hx - 2, y + 0.3, hz - 9), -Math.PI / 2, [7, 22], 'talk',
      ['Every hold keeps its accounts. Frostpeak keeps everyone\'s.', 'The oldest ledgers are written on iron. Paper forgets.']);
    this.person(s, 'ulla', 'Ulla the Runewright', 'Runewright of Frostpeak · Runes and Charms', DWARF({ body: 'female', hair: 'buns', hairColor: 0x2a2a4a, skin: 0xd8a880, cloth: 0x2e5ea8 }), this.v(F.x - 18, F.z + 12), Math.PI / 2, [8, 20], 'work',
      ['A rune is a promise the stone keeps.', 'Bring me deep crystal and I\'ll cut you a rune that remembers.']);
    for (const k of [0, 1, 2]) this.folk(s, `fp-guard-${k}`, ['Gate-Warden Sten', 'Gate-Warden Asa', 'Steward Kolbein'][k], DWARF({ body: k === 1 ? 'female' : 'male', hair: 'buzzed', beard: k !== 1, hairColor: 0x3a2a1a, skin: 0xd8a880, cloth: 0x2e5ea8, pauldron: k < 2 }), [k < 2 ? 'gate' : 'court', 'court'], ['The King sees petitioners in the Hall.', 'Mind the hooded stone. Don\'t touch it. Don\'t look at it too long, either.']);
  }

  /** Lift Frostpeak's hood: the stone joins the network (and the dwarves notice). */
  unhood() {
    this.h.flags.frostpeakUnhooded = true;
    if (this.hood) this.hood.visible = false;
    this.h.attune('frostpeak');
    this.h.signal('frostpeak-unhooded');
    this.h.close();
    this.h.toast('You lift the iron hood and set your palm on the wheel. It is warm, warmer than stone in this cold should be, and for a moment you feel watched. Somewhere behind you, a dwarf swears softly.');
    this.h.save();
  }

  // ---- Stonegate's trolls ----------------------------------------------------------------------------------
  private async spawnTrolls() {
    this.trollsLoading = true;
    const dead = Number(this.h.flags.stonegateTrolls ?? 0);
    for (let i = 0; i < TROLLS.length; i++) {
      if (this.trolls[i] || i < dead) continue;
      const t = TROLLS[i];
      const at = new THREE.Vector3(t.at[0], STONEGATE.h, t.at[1]);
      const troll = await OrcWarlord.create(at, 0, this.scene, this.fx, { ...TROLL, name: t.name, hp: t.hp, scale: ORC_SCALE * t.scale, damage: t.damage });
      troll.name = t.name;
      this.trolls[i] = troll;
    }
    this.trollsLoading = false;
  }
  private clearTrolls() {
    for (let i = 0; i < this.trolls.length; i++) {
      const t = this.trolls[i];
      if (t && t.alive) t.dispose();
      if (t && t.alive) this.trolls[i] = null;
    }
  }

  // ---- per step ---------------------------------------------------------------------------------------------
  update(dt: number) {
    this.t += dt;
    if (this.ride) this.stepRide(dt);
    // The cairn lanterns.
    for (const c of this.cairnLamps) {
      const lit = !!this.h.flags[`cairn:${c.i}`];
      c.mat.emissiveIntensity = lit ? 1.6 + Math.sin(this.t * 7 + c.i) * 0.2 : 0;
      (c.glow.material as THREE.SpriteMaterial).opacity = lit ? 0.75 : 0;
    }
    if (this.hood) this.hood.visible = !this.h.flags.frostpeakUnhooded;
    // Stonegate: trolls while you're near and they're alive; they heal unless they're burning.
    const p = this.player.pos;
    const near = Math.hypot(p.x - STONEGATE.x, p.z - STONEGATE.z);
    if (!this.h.flags.stonegateClear) {
      if (near < 170 && !this.trollsLoading && this.trolls.some((t, i) => !t && i >= Number(this.h.flags.stonegateTrolls ?? 0))) void this.spawnTrolls();
      if (near > 280) this.clearTrolls();
    }
    let boss: OrcWarlord | null = null;
    for (const t of this.trolls) {
      if (!t) continue;
      t.update(dt, this.player);
      if (!t.alive) continue;
      if (afflictions.burning(t)) this.burnedAt.set(t.id, this.t);
      const sinceBurn = this.t - (this.burnedAt.get(t.id) ?? -99);
      if (t.awake && t.hp < t.maxHp && sinceBurn > 5) {
        t.hp = Math.min(t.maxHp, t.hp + t.maxHp * 0.012 * dt);
        if (!this.regenHint && t.hp < t.maxHp * 0.7) {
          this.regenHint = true;
          this.h.toast('The troll\'s wounds close over as you watch, stone knitting to stone. Fire would stop that.');
        }
      }
      if (t.awake && t.position.distanceTo(p) < 40) boss = t;
    }
    // Own only the Stonegate bar; an idle mountain must not hide another
    // region's encounter or restart its entrance animation every step.
    if (boss) {
      this.h.bossBar(boss, boss.name);
      this.barShown = true;
    } else if (this.barShown) {
      this.h.bossBar(null);
      this.barShown = false;
    }
    if (this.h.flags.stonegateClear && this.h.flags.stonegateClear !== 'signalled') {
      this.h.flags.stonegateClear = 'signalled';
      this.h.signal('stonegate-clear');
    }
  }

  /** Per rendered frame: flames flicker, trolls are posed. */
  frame(alpha: number, dt: number) {
    for (let i = 0; i < this.flames.length; i++) {
      const f = this.flames[i];
      f.scale.y = 1 + Math.sin(this.t * 11 + i * 1.7) * 0.12;
    }
    for (const t of this.trolls) t?.present(alpha, dt, this.player);
  }

  /** Is the player warming up here (a fire, a forge, a hut's hearth)? */
  warmAt(x: number, z: number) {
    return this.warmSpots.some((w) => Math.hypot(w.x - x, w.z - z) < w.r);
  }

  /** The mountains' pads (for anything that needs to keep off them). */
  static readonly pads: Pad[] = [COPPERBROOK, STONEGATE, FROSTPEAK, KETTLEHOLD];
}
