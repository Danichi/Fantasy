import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { registerDoor, type Door } from '../doors';
import { buildHouse, worldUV, type WorldMats, type HouseSpec } from '../buildings';
import { heightAt } from '../terrainHeight';
import { physics } from '../../physics/physics';
import { mulberry32 } from '../../core/math';
import { StaticBatch } from '../cityKit';
import { road, pointAlong, distanceAlong, roadLength, carvedText } from '../roadNetwork';
import { GRASS_MASKS } from '../groundWindow';
import { REGIONS } from '../regionDefinitions';
import { ROAD_HALF } from '../roadData';
import { SITES, GATE_AT, GATE_S, OLDEST_WAY, megaTrees, forestLayer, LAYER_NAMES, type Layer, type P2 } from './elvenForestData';
import { MegaForest, buildGiant, barkMaterial, leafMaterial, trunkRadius } from './megaTree';
import { thornwickFolk, markerFolk, silverboughFolk, gladeFolk, hermitFolk, hunterFolk, type FolkSettlement } from './elfFolk';
import { ForestThreats } from '../../enemies/forest/forestThreats';
import type { FX } from '../../fx/particles';
import type { Player } from '../../player/player';
import type { Interactable } from '../../dungeon/instance';

// The Verdant Elves' content module (docs/design/verdant-elves.md): the great
// forest north of Cresha, layer by layer.
//   The Outer Forest   Thornwick (the woodcutters' village on the Greenwood
//                      Road), the loggers' camp, the Hollow Grove they
//                      quarrel over, the charcoal burners' pits, and the
//                      elves' marker stone across the road.
//   The Inner Forest   Silverbough, hidden among three great trees; the
//                      ironbark trees (some of them sleeping treants).
//   The Ancient Forest the giants (megaTree.ts), the Sentinel Walk, the
//                      fallen giants that give heartwood, the Blighted
//                      Elder's grove and the Temple of Starfall's door, the
//                      Hermit's hollow.
//   Moonlight Glade    the ring of standing stones on the eastern lakeshore.
// Each place is laid out up front (so its people have their posts) and built
// only when you come within sight of it; the Sanctum is in sanctum.ts.

// Discovery: the forest's own places, besides the region's two landmarks.
{
  const L = REGIONS.verdantElves.landmarks;
  const add = (id: string, name: string, kind: 'town' | 'landmark' | 'ruin' | 'dungeon', [x, z]: P2) => L.some((l) => l.id === id) || L.push({ id, name, kind, x, z });
  add('thornwick', 'Thornwick', 'town', SITES.thornwick);
  add('silverbough', 'Silverbough', 'town', SITES.silverbough);
  add('templeOfStarfall', 'The Temple of Starfall', 'dungeon', SITES.temple);
  add('elderGrove', 'The Oldest Grove', 'ruin', SITES.elderGrove);
}

export interface ElfHooks {
  toast(msg: string): void;
  card(title: string, sub: string, first: boolean): void;
  bossBar(t: { hp: number; maxHp: number; alive: boolean } | null, name?: string): void;
  flags: Record<string, boolean | number | string>;
  give(id: string, n: number): void;
  count(id: string): number;
  take(id: string, n: number): void;
  addGold(n: number): void;
  hour(): number;
  /** game hours since the start (day * 24 + hour) */
  hours(): number;
  save(): void;
  signal(id: string): boolean;
  wants(id: string): boolean;
  isDone(quest: string): boolean;
  isActive(quest: string): boolean;
  talk(who: string, title: string, text: string, opts: { label: string; run: () => void }[]): void;
  close(): void;
  /** the player's origin (feat/origins); 'elf' walks the Lost Woods freely */
  origin(): string;
  /** doors of a place that has just been built */
  addDoors(doors: Door[]): void;
}

const FR = road('forest');
/** A place `s` metres along the Greenwood Road, `lat` metres to its left (+) or right (-). */
export function greenAt(s: number, lat = 0) {
  const p = pointAlong(FR, s);
  const sx = -p.dir.y, sz = p.dir.x;
  const x = p.x + sx * lat, z = p.z + sz * lat;
  return { x, z, y: heightAt(x, z), yaw: Math.atan2(p.dir.x, p.dir.y), side: new THREE.Vector2(sx, sz), dir: p.dir.clone() };
}
export const THORN_S = distanceAlong(FR, SITES.thornwick[0], SITES.thornwick[1]);
const v3 = (x: number, z: number, dy = 0) => new THREE.Vector3(x, heightAt(x, z) + dy, z);

/** A place built on approach. */
interface Area { id: string; at: P2; radius: number; group: THREE.Group; built: boolean; build: () => void; extra?: THREE.Object3D[] }

/** Gathering spots: ironbark trees, fallen giants (heartwood), moonblossom, spirit amber. */
export interface Gather { id: string; kind: 'ironbark' | 'heartwood' | 'moonblossom' | 'amber'; pos: THREE.Vector3; sleeper?: boolean }

export class ElvenForest {
  readonly clearings: [number, number, number][] = [];
  readonly interactables: Interactable[] = [];
  readonly settlements: FolkSettlement[] = [];
  readonly areas: Area[] = [];
  readonly gathers: Gather[] = [];
  readonly mega: MegaForest;
  readonly threats: ForestThreats;
  /** where things stand (quests, tests, folk) */
  readonly spots: Record<string, THREE.Vector3> = {};
  /** the forest layer the player is in (cards on entry) */
  layer: Layer | null = null;
  private fires: { pos: THREE.Vector3; mat: THREE.MeshStandardMaterial; size: number }[] = [];
  private glows: { mat: THREE.MeshStandardMaterial; day: number; night: number }[] = [];
  private nightBlooms: THREE.Object3D[] = [];
  private smokes: THREE.Vector3[] = [];
  private wheels: THREE.Object3D[] = [];
  private gatherMeshes = new Map<string, THREE.Object3D>();
  private ribbons = new THREE.Group();
  private t = 0;
  private rnd = mulberry32(5150);
  private mats: ReturnType<typeof elfMats>;
  private visible = true;

  constructor(private scene: THREE.Scene, renderer: THREE.WebGLRenderer, private m: WorldMats, private fx: FX, private hooks: ElfHooks) {
    this.mats = elfMats();
    this.mega = new MegaForest(scene, renderer, m.planks, this.mats.rope);
    this.threats = new ForestThreats(scene, fx, {
      toast: (s) => hooks.toast(s), bossBar: (t, n) => hooks.bossBar(t, n), get flags() { return hooks.flags; }, hour: () => hooks.hour(),
      wants: (id) => hooks.wants(id), isActive: (q) => hooks.isActive(q), addGold: (n) => hooks.addGold(n), save: () => hooks.save(),
    });
    scene.add(this.ribbons);
    this.layoutThornwick();
    this.layoutMarker();
    this.layoutOuterCamps();
    this.layoutSilverbough();
    this.layoutAncient();
    this.layoutGlade();
    this.layoutGathering();
    this.buildRibbons();
  }

  // ---- shared builders ---------------------------------------------------------------------
  private area(id: string, at: P2, radius: number, build: (b: Builder) => void) {
    const group = new THREE.Group();
    group.visible = false;
    this.scene.add(group);
    const a: Area = {
      id, at, radius, group, built: false,
      build: () => {
        if (a.built) return;
        a.built = true;
        const b = new Builder(group, this.m, this.mats, this.rnd, this.fires, this.glows);
        build(b);
        b.batch.build(group);
        group.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).receiveShadow = true)));
        if (b.doors.length) this.hooks.addDoors(b.doors);
      },
    };
    this.areas.push(a);
    return a;
  }

  /** Build every place now (tests, screenshots). */
  buildAll() {
    for (const a of this.areas) a.build();
  }

  // ---- Thornwick ---------------------------------------------------------------------------
  private layoutThornwick() {
    const S = THORN_S;
    const c = greenAt(S);
    const center = v3(c.x, c.z);
    const at = (a: number, l: number) => greenAt(S + a, l);
    const p = (a: number, l: number) => { const q = at(a, l); return v3(q.x, q.z); };
    // Houses: [along, left, spec, door]
    const lots: [number, number, HouseSpec, Partial<Door>][] = [
      [-30, 17, { w: 13, d: 10, floors: 2, roof: 'thatch', seed: 47101 }, { kind: 'tavern', name: 'The Woodsman’s Rest', keeper: 'bram' }],
      [-6, 16, { w: 8, d: 7, floors: 1, roof: 'thatch', seed: 47102 }, { kind: 'home', name: 'Corwen Ashford’s house' }],
      [17, 16, { w: 9, d: 7, floors: 1, roof: 'tile', seed: 47103 }, { kind: 'shop', name: 'Thornwick Stores', keeper: 'ashgrove' }],
      [37, 15, { w: 7, d: 6, floors: 1, roof: 'thatch', seed: 47104 }, {}],
      [-34, -16, { w: 8, d: 6.5, floors: 1, roof: 'thatch', seed: 47105 }, { kind: 'home', name: 'the hunters’ lodge' }],
      [-11, -16, { w: 7, d: 6, floors: 1, roof: 'thatch', seed: 47106 }, {}],
      [12, -17, { w: 9, d: 7, floors: 2, roof: 'thatch', seed: 47107 }, {}],
      [33, -16, { w: 7.5, d: 6, floors: 1, roof: 'tile', seed: 47108 }, {}],
      [-50, 32, { w: 7, d: 6, floors: 1, roof: 'thatch', seed: 47109 }, {}],
      [48, -34, { w: 7.5, d: 6.5, floors: 1, roof: 'thatch', seed: 47110 }, {}],
      [52, 36, { w: 6.5, d: 6, floors: 1, roof: 'thatch', seed: 47111 }, {}],
    ];
    const mill = at(-6, -46), yard = at(24, -48);
    this.spots.thornInn = p(-30, 9);
    this.spots.corwen = p(-4, 8);
    this.spots.nimri = p(-24, 8.5);
    this.spots.store = p(17, 8.5);
    this.spots.lodge = p(-34, -8.5);
    this.spots.well = p(4, -6);
    this.spots.mill = v3(mill.x - mill.side.x * -6, mill.z - mill.side.y * -6);
    this.spots.yard = v3(yard.x, yard.z);
    this.spots.thornwick = center;
    const loggingSpots = [0, 1, 2, 3, 4].map((k) => v3(SITES.logging[0] + Math.cos(k * 1.3) * 8, SITES.logging[1] + Math.sin(k * 1.3) * 8));
    this.settlements.push(thornwickFolk({ center, inn: this.spots.thornInn, corwen: this.spots.corwen, nimri: this.spots.nimri, mill: this.spots.mill, yard: this.spots.yard, store: this.spots.store, lodge: this.spots.lodge, well: this.spots.well, logging: loggingSpots }));
    this.clearings.push([c.x, c.z, 78], [SITES.logging[0], SITES.logging[1], 24]);
    GRASS_MASKS.push({ x: c.x, z: c.z, r: 20, amount: 0.5 });

    this.area('thornwick', [c.x, c.z], 900, (b) => {
      for (const [a, l, spec, info] of lots) {
        const q = at(a, l);
        b.house(q.x, q.z, Math.atan2(-Math.sign(l) * q.side.x, -Math.sign(l) * q.side.y), spec, info);
      }
      // The palisade: sharpened stakes in a ring, open where the road runs through.
      const R = 68;
      const roadA = Math.atan2(c.dir.y, c.dir.x);
      for (let k = 0; k < 420; k++) {
        const a = (k / 420) * Math.PI * 2;
        const gap = Math.min(Math.abs(Math.atan2(Math.sin(a - roadA), Math.cos(a - roadA))), Math.abs(Math.atan2(Math.sin(a - roadA - Math.PI), Math.cos(a - roadA - Math.PI))));
        if (gap < 0.075) continue;
        const x = c.x + Math.cos(a) * R, z = c.z + Math.sin(a) * R, h = 3.2 + ((k * 7) % 5) * 0.15;
        b.add(new THREE.CylinderGeometry(0.26, 0.3, h, 6), this.m.bark, x, heightAt(x, z) + h / 2 - 0.3, z);
        b.add(new THREE.ConeGeometry(0.27, 0.6, 6), this.m.bark, x, heightAt(x, z) + h, z);
        if (k % 3 === 0) b.solid(0.6, 3.4, 1.6, x, heightAt(x, z) + 1.7, z, Math.PI / 2 - a);
      }
      // Gate towers either side of each gap.
      for (const end of [0, Math.PI]) for (const s of [-1, 1]) {
        const a = roadA + end + s * 0.1;
        const x = c.x + Math.cos(a) * R, z = c.z + Math.sin(a) * R, y = heightAt(x, z);
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add(new THREE.BoxGeometry(0.3, 6, 0.3), this.m.timber, x + dx, y + 3, z + dz);
        b.add(new THREE.BoxGeometry(2.8, 0.3, 2.8), this.m.planks, x, y + 5, z);
        b.add(new THREE.ConeGeometry(2.3, 1.6, 4).rotateY(Math.PI / 4), this.m.thatch, x, y + 6.5, z);
        b.solid(2.4, 6, 2.4, x, y + 3, z);
      }
      // The well, woodpiles and chopping blocks, lanterns, a sign at each gate.
      const w = this.spots.well;
      b.add(new THREE.CylinderGeometry(1, 1.1, 0.9, 14, 1, true), this.m.stone, w.x, w.y + 0.45, w.z);
      b.add(new THREE.ConeGeometry(1.4, 0.9, 4).rotateY(Math.PI / 4), this.m.thatch, w.x, w.y + 2.9, w.z);
      for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(0.12, 2.4, 0.12), this.m.timber, w.x + s * 0.9, w.y + 1.3, w.z);
      physics.addCylinder(new THREE.Vector3(w.x, w.y + 0.5, w.z), 0.5, 1.1);
      for (const [a, l] of [[-22, 22], [6, 22], [28, 21], [-26, -22], [2, -23], [24, -22]] as P2[]) b.woodpile(at(a, l).x, at(a, l).z, at(a, l).yaw);
      for (const a of [-44, -16, 14, 44]) b.lantern(at(a, 6).x, at(a, 6).z);
      for (const [a, flip] of [[-62, 0], [62, Math.PI]] as P2[]) {
        const q = at(a, -6);
        b.sign(['THORNWICK', 'Timber · Rest · Stores'], q.x, q.z, q.yaw + flip + Math.PI);
      }
      // The sawmill: a long shed, a flume on trestles, a waterwheel, the saw-pit and the lumber yard.
      const mq = mill;
      b.house(mq.x, mq.z, Math.atan2(mq.side.x, mq.side.y), { w: 14, d: 8, floors: 1, roof: 'slate', seed: 47120 }, { kind: 'hall', name: 'Thornwick Mill', keeper: 'hesk' });
      const wheelAt = new THREE.Vector3(mq.x - mq.dir.x * 8.4, mq.y + 2.8, mq.z - mq.dir.y * 8.4);
      const wheel = new THREE.Group();
      for (let k = 0; k < 10; k++) {
        const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 1.6), this.m.planks);
        paddle.position.set(0, Math.cos((k / 10) * Math.PI * 2) * 2.2, Math.sin((k / 10) * Math.PI * 2) * 2.2);
        paddle.rotation.x = (k / 10) * Math.PI * 2;
        wheel.add(paddle);
      }
      const rim = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.1, 6, 24), this.m.timber);
      rim.rotation.y = Math.PI / 2;
      wheel.add(rim);
      wheel.position.copy(wheelAt);
      wheel.rotation.y = c.yaw;
      wheel.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true)));
      b.group.add(wheel);
      this.wheels.push(wheel);
      // The flume: a trough on trestles from the forest edge to the wheel, water running in it.
      const fl = 30;
      const fx0 = wheelAt.x - mq.side.x * 0, fz0 = wheelAt.z;
      const dir = new THREE.Vector2(-mq.side.x, -mq.side.y);
      for (let k = 0; k < fl; k += 3) {
        const x = fx0 + dir.x * k, z = fz0 + dir.y * k;
        b.add(new THREE.BoxGeometry(0.2, 5.2, 0.2), this.m.timber, x, heightAt(x, z) + 2.6, z);
      }
      const fmx = fx0 + dir.x * fl / 2, fmz = fz0 + dir.y * fl / 2, fyaw = Math.atan2(dir.x, dir.y);
      b.add(new THREE.BoxGeometry(1.2, 0.5, fl), this.m.planks, fmx, wheelAt.y + 2.6, fmz, fyaw);
      const water = new THREE.Mesh(new THREE.PlaneGeometry(0.9, fl).rotateX(-Math.PI / 2), this.mats.water);
      water.position.set(fmx, wheelAt.y + 2.88, fmz);
      water.rotation.y = fyaw;
      b.group.add(water);
      this.spots.flume = new THREE.Vector3(fx0, wheelAt.y + 2.4, fz0);
      // The lumber yard: stacked logs and boards.
      for (let k = 0; k < 6; k++) {
        const q = at(16 + (k % 3) * 7, -44 - Math.floor(k / 3) * 7);
        for (let r = 0; r < 3; r++) for (let n = 0; n < 4 - r; n++) b.add(new THREE.CylinderGeometry(0.32, 0.34, 5, 8).rotateZ(Math.PI / 2), this.m.bark, q.x + (n - (3 - r) / 2) * 0.66 * Math.cos(q.yaw), q.y + 0.34 + r * 0.56, q.z - (n - (3 - r) / 2) * 0.66 * Math.sin(q.yaw), q.yaw + Math.PI / 2);
        b.solid(5, 1.8, 2.8, q.x, q.y + 0.9, q.z, q.yaw);
      }
      for (let k = 0; k < 4; k++) {
        const q = at(40, -42 - k * 3);
        b.add(new THREE.BoxGeometry(4, 0.9, 1.2), this.m.planks, q.x, q.y + 0.45, q.z, q.yaw + Math.PI / 2);
      }
      // A fenced vegetable plot, a cart, hides drying by the hunters' lodge.
      const lodge = at(-34, -27);
      for (let k = 0; k < 3; k++) {
        b.add(new THREE.BoxGeometry(0.1, 2, 0.1), this.m.timber, lodge.x + k * 1.6 * Math.cos(lodge.yaw), lodge.y + 1, lodge.z - k * 1.6 * Math.sin(lodge.yaw));
        b.add(new THREE.PlaneGeometry(1.1, 1.3), this.mats.hide, lodge.x + (k + 0.5) * 1.6 * Math.cos(lodge.yaw), lodge.y + 1.2, lodge.z - (k + 0.5) * 1.6 * Math.sin(lodge.yaw), lodge.yaw + Math.PI / 2);
      }
      b.campfire(at(-14, 2).x + 0, at(-14, 2).z, 0.8);
      this.smokes.push(new THREE.Vector3(at(-30, 17).x, at(-30, 17).y + 9, at(-30, 17).z));
    });
    // Nimri's guiding and the Rest's beds are services (folk.ts wiring); the mill's planks are trade.
  }

  // ---- the marker stone ---------------------------------------------------------------------
  private layoutMarker() {
    const g = greenAt(GATE_S, 0);
    const post = greenAt(GATE_S + 3, ROAD_HALF.lane + 3.4);
    this.spots.gate = v3(GATE_AT[0], GATE_AT[1]);
    this.spots.aelrin = v3(post.x, post.z);
    this.settlements.push(markerFolk(this.spots.aelrin, g.yaw + Math.PI));
    this.clearings.push([g.x, g.z, 14]);
    this.area('marker', [g.x, g.z], 700, (b) => {
      // More stones along the forest's edge, each a little nearer Thornwick than the map says.
      for (let k = -3; k <= 3; k++) {
        if (k === 0) continue;
        const q = greenAt(GATE_S - 12 + Math.abs(k) * 4, k * 34);
        b.markerStone(q.x, q.z, q.yaw + k * 0.2);
      }
      // A little elven shelter for the sentinel: four slim posts and a leaf roof.
      const s = greenAt(GATE_S + 8, ROAD_HALF.lane + 7);
      for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) b.add(new THREE.CylinderGeometry(0.08, 0.1, 3, 6), this.mats.silverwood, s.x + dx, s.y + 1.5, s.z + dz);
      b.add(new THREE.SphereGeometry(2.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1), this.mats.leafRoof, s.x, s.y + 2.9, s.z);
      b.blossomLamp(s.x + 1.6, s.y + 2.6, s.z + 1.6);
    });
  }

  // ---- the Outer Forest's camps --------------------------------------------------------------
  private layoutOuterCamps() {
    this.clearings.push([SITES.pits[0], SITES.pits[1], 30], [SITES.hollowGrove[0], SITES.hollowGrove[1], 34]);
    this.area('pits', SITES.pits, 600, (b) => {
      const [x, z] = SITES.pits;
      // Charcoal clamps: low domes of turf, smoking; stacked billets; a burners' hut.
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + 0.4, r = 12;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        b.add(new THREE.SphereGeometry(3.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1), this.mats.charcoal, px, heightAt(px, pz) - 0.2, pz);
        b.solid(4, 1.6, 4, px, heightAt(px, pz) + 0.6, pz);
        this.smokes.push(new THREE.Vector3(px, heightAt(px, pz) + 1.8, pz));
      }
      for (let k = 0; k < 4; k++) b.woodpile(x - 8 + k * 4, z + 16, 0.3);
      b.house(x + 14, z - 12, 2.4, { w: 6, d: 5, floors: 1, roof: 'thatch', seed: 47130 }, { name: '__ruin' });
      b.campfire(x, z, 1.1);
      // Elven ribbons on the stumps they felled: they were marked.
      for (let k = 0; k < 8; k++) {
        const a = this.rnd() * Math.PI * 2, r = 20 + this.rnd() * 12;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        b.add(new THREE.CylinderGeometry(0.5, 0.65, 0.8, 9), this.m.bark, px, heightAt(px, pz) + 0.3, pz);
        b.add(new THREE.TorusGeometry(0.56, 0.05, 4, 12).rotateX(Math.PI / 2), this.mats.ribbon, px, heightAt(px, pz) + 0.55, pz);
      }
    });
    this.area('logging', SITES.logging, 600, (b) => {
      const [x, z] = SITES.logging;
      for (let k = 0; k < 14; k++) {
        const a = this.rnd() * Math.PI * 2, r = 6 + this.rnd() * 16;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        b.add(new THREE.CylinderGeometry(0.45, 0.55, 0.7, 9), this.m.bark, px, heightAt(px, pz) + 0.25, pz);
      }
      for (let k = 0; k < 3; k++) b.add(new THREE.CylinderGeometry(0.5, 0.55, 9, 9).rotateZ(Math.PI / 2), this.m.bark, x + 5, heightAt(x + 5, z - 6 + k * 1.1) + 0.5, z - 6 + k * 1.1, 0.3);
      b.tent(x - 10, z + 8, 0.5, this.mats.canvas);
      b.tent(x - 14, z + 2, 1.2, this.mats.canvas);
      b.campfire(x - 6, z + 3, 0.9);
    });
    // The Hollow Grove: old oaks with elven ribbons, or stumps, depending on how the quarrel ended.
    this.area('hollowGrove', SITES.hollowGrove, 650, (b) => {
      const [x, z] = SITES.hollowGrove;
      const felled = new THREE.Group(), standing = new THREE.Group();
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2 + this.rnd() * 0.3, r = 12 + this.rnd() * 12;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r, py = heightAt(px, pz);
        const oak = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 9, 9), this.m.bark);
        trunk.position.y = 4.5;
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(4.6, 1), this.mats.oakLeaf);
        crown.position.y = 10.5;
        crown.scale.set(1, 0.75, 1);
        const rib = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.06, 4, 14).rotateX(Math.PI / 2), this.mats.ribbon);
        rib.position.y = 1.6;
        oak.add(trunk, crown, rib);
        oak.position.set(px, py, pz);
        standing.add(oak);
        const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.9, 9), this.m.bark);
        stump.position.set(px, py + 0.3, pz);
        felled.add(stump);
      }
      for (let k = 0; k < 3; k++) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 8, 9).rotateZ(Math.PI / 2), this.m.bark);
        log.position.set(x - 4 + k * 1.5, heightAt(x, z) + 0.7 + (k % 2) * 1.2, z + k * 1.4);
        felled.add(log);
      }
      b.group.add(standing, felled);
      standing.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true)));
      this.groveVariants = { standing, felled };
      this.applyQuarrel();
    });
  }
  private groveVariants: { standing: THREE.Object3D; felled: THREE.Object3D } | null = null;
  /** How the loggers' quarrel ended shows in the Hollow Grove: felled for the loggers, standing for the elves. */
  applyQuarrel() {
    const q = this.hooks.flags['elves:quarrel'];
    if (!this.groveVariants) return;
    this.groveVariants.felled.visible = q === 'loggers';
    this.groveVariants.standing.visible = q !== 'loggers';
  }

  // ---- Silverbough -------------------------------------------------------------------------------
  private layoutSilverbough() {
    const [cx, cz] = SITES.silverbough;
    const trees: P2[] = [0, 1, 2].map((k) => [cx + Math.cos(k * 2.094 + 0.4) * 22, cz + Math.sin(k * 2.094 + 0.4) * 22]);
    const plat = 8.5;
    this.spots.silverbough = v3(cx, cz);
    this.spots.caelith = v3(cx + 3, cz + 4);
    this.spots.thessaly = v3(trees[1][0] + 7, trees[1][1] + 3);
    this.spots.spring = v3(SITES.spring[0] - 3, SITES.spring[1] - 3);
    this.spots.hearth = v3(cx - 6, cz - 2);
    this.spots.tamwyn = v3(cx + 8, cz - 8);
    const bridgeSpots = trees.map(([x, z]) => v3(x + 6, z + 6));
    this.settlements.push(silverboughFolk({ center: v3(cx, cz), elder: this.spots.caelith, thessaly: this.spots.thessaly, spring: this.spots.spring, bridges: bridgeSpots, hearth: this.spots.hearth, child: this.spots.tamwyn }));
    this.clearings.push([cx, cz, 50], [SITES.spring[0], SITES.spring[1], 14]);
    this.area('silverbough', [cx, cz], 650, (b) => {
      const bark = barkMaterial(), leaf = leafMaterial();
      trees.forEach(([x, z], k) => {
        const parts = buildGiant(77300 + k, 40, 0, { roots: 6, crownScale: 1.1 });
        const y = heightAt(x, z) - 0.4;
        const t = new THREE.Mesh(parts.trunk, bark), c = new THREE.Mesh(parts.crown, leaf);
        for (const mm of [t, c]) {
          mm.position.set(x, y, z);
          mm.castShadow = mm.receiveShadow = true;
          b.group.add(mm);
        }
        physics.addCylinder(new THREE.Vector3(x, y + 10, z), 10, trunkRadius(3, 40));
        // A platform ring with a home on it, lanterns of glowing blossom hanging under it.
        const R = trunkRadius(plat, 40) + 3.4;
        b.add(new THREE.CylinderGeometry(R, R - 0.6, 0.4, 22), this.mats.silverwood, x, y + plat, z);
        for (let n = 0; n < 2; n++) {
          const a = k * 1.7 + n * Math.PI;
          b.pod(x + Math.cos(a) * (R - 1.6), y + plat + 0.2, z + Math.sin(a) * (R - 1.6), a, 1.2);
        }
        for (let n = 0; n < 5; n++) {
          const a = (n / 5) * Math.PI * 2;
          b.blossomLamp(x + Math.cos(a) * (R - 0.4), y + plat - 0.8, z + Math.sin(a) * (R - 0.4));
        }
        // Homes grown into the roots at ground level.
        for (let n = 0; n < 2; n++) {
          const a = k * 2.3 + n * 2.6 + 1;
          const r = trunkRadius(0, 40) + 2.6;
          b.pod(x + Math.cos(a) * r, heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r), z + Math.sin(a) * r, a, 1.6);
        }
      });
      // Rope bridges between the platforms.
      for (let k = 0; k < 3; k++) {
        const A = trees[k], B = trees[(k + 1) % 3];
        const ya = heightAt(A[0], A[1]) - 0.4 + plat, yb = heightAt(B[0], B[1]) - 0.4 + plat;
        const dx = B[0] - A[0], dz = B[1] - A[1], d = Math.hypot(dx, dz);
        const R = trunkRadius(plat, 40) + 3.2;
        const len = d - 2 * R, mx = A[0] + (dx / d) * (R + len / 2), mz = A[1] + (dz / d) * (R + len / 2);
        const yaw = Math.atan2(dx, dz);
        const sag = 0.6;
        for (let n = 0; n < Math.floor(len / 0.6); n++) {
          const tt = (n + 0.5) / Math.floor(len / 0.6);
          const yy = ya + (yb - ya) * tt - Math.sin(tt * Math.PI) * sag;
          b.add(new THREE.BoxGeometry(1.6, 0.06, 0.3), this.m.planks, A[0] + (dx / d) * (R + tt * len), yy, A[1] + (dz / d) * (R + tt * len), yaw);
        }
        for (const s of [-1, 1]) {
          const r = new THREE.CylinderGeometry(0.03, 0.03, len, 4).rotateX(Math.PI / 2);
          b.add(r, this.mats.rope, mx + Math.cos(yaw) * s * 0.8, (ya + yb) / 2 + 0.7, mz - Math.sin(yaw) * s * 0.8, yaw);
        }
      }
      // The spring: a ring of mossy stones round a clear pool, a little shrine with a bell-post.
      const [sx, sz] = SITES.spring;
      const sy = heightAt(sx, sz);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(4.2, 24).rotateX(-Math.PI / 2), this.mats.water);
      pool.position.set(sx, sy + 0.12, sz);
      b.group.add(pool);
      for (let n = 0; n < 12; n++) {
        const a = (n / 12) * Math.PI * 2;
        b.add(new THREE.DodecahedronGeometry(0.55, 0).scale(1, 0.6, 1), this.mats.mossStone, sx + Math.cos(a) * 4.6, sy + 0.2, sz + Math.sin(a) * 4.6, a);
      }
      b.add(new THREE.BoxGeometry(0.16, 2.4, 0.16), this.mats.silverwood, sx + 5.5, sy + 1.2, sz);
      b.add(new THREE.BoxGeometry(1.2, 0.12, 0.12), this.mats.silverwood, sx + 5.2, sy + 2.3, sz);
      // Webs over the pool while the spiders hold it.
      const webs = new THREE.Group();
      for (let n = 0; n < 5; n++) {
        const web = new THREE.Mesh(new THREE.CircleGeometry(2.2, 8), this.mats.web);
        web.position.set(sx + Math.cos(n * 1.3) * 3, sy + 1.5 + n * 0.3, sz + Math.sin(n * 1.3) * 3);
        web.rotation.set(0.3 * n, n, 0);
        webs.add(web);
      }
      b.group.add(webs);
      this.springWebs = webs;
      // The hearth where they sing at night, looms under awnings.
      b.campfire(cx - 6, cz - 2, 0.9);
      for (let n = 0; n < 3; n++) {
        const q = bridgeSpots[n];
        b.loom(q.x + 1.2, q.z + 1.2, n * 2);
      }
      b.blossomLamp(cx, heightAt(cx, cz) + 3, cz);
    });
  }
  private springWebs: THREE.Object3D | null = null;

  // ---- the Ancient Forest: the oldest grove, the Temple's door, the Hermit, the lost hunter ----------------
  private layoutAncient() {
    const [ex, ez] = SITES.elderGrove;
    const [tx, tz] = SITES.temple;
    this.spots.elderGrove = v3(ex, ez);
    this.spots.templeDoor = v3(tx, tz + 6);
    this.spots.hermit = v3(SITES.hermit[0] + 4, SITES.hermit[1] + 6);
    this.spots.tobin = v3(SITES.lostHunter[0], SITES.lostHunter[1]);
    this.spots.foxGlade = v3(SITES.foxGlade[0], SITES.foxGlade[1]);
    this.settlements.push(hermitFolk(this.spots.hermit), hunterFolk(this.spots.tobin));
    this.clearings.push([ex, ez, 40], [tx, tz + 30, 40], [SITES.hermit[0], SITES.hermit[1], 24], [SITES.lostHunter[0], SITES.lostHunter[1], 12], [SITES.foxGlade[0], SITES.foxGlade[1], 18], [SITES.spiderHollow[0], SITES.spiderHollow[1], 20]);
    this.area('oldestGrove', [ex, ez - 80], 700, (b) => {
      // The grove's rot: dead trees, black pools of old blight (they fade when the Elder falls), grey ground.
      const dead = new THREE.Group();
      for (let k = 0; k < 14; k++) {
        const a = this.rnd() * Math.PI * 2, r = 22 + this.rnd() * 26;
        const px = ex + Math.cos(a) * r, pz = ez + Math.sin(a) * r, py = heightAt(px, pz);
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, 8 + this.rnd() * 5, 7), this.mats.deadBark);
        t.position.set(px, py + 4, pz);
        t.rotation.z = (this.rnd() - 0.5) * 0.3;
        dead.add(t);
        for (let n = 0; n < 3; n++) {
          const br = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 2.6, 5), this.mats.deadBark);
          br.position.set(px, py + 5 + n, pz);
          br.rotation.set(0.9 + n * 0.3, this.rnd() * 6, 0.4);
          dead.add(br);
        }
      }
      b.group.add(dead);
      // The Temple of Starfall's door: a stone arch cut into the hillside, grown over with roots, the Script on its lintel.
      const ty = heightAt(tx, tz + 6);
      for (const s of [-1, 1]) {
        b.add(new THREE.BoxGeometry(1.4, 6, 1.6), this.mats.templeStone, tx + s * 2.8, ty + 3, tz);
        b.solid(1.4, 6, 1.6, tx + s * 2.8, ty + 3, tz);
      }
      b.add(new THREE.BoxGeometry(7.2, 1.2, 1.8), this.mats.templeStone, tx, ty + 6.4, tz);
      const dark = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 5.8), new THREE.MeshBasicMaterial({ color: 0x04060a }));
      dark.position.set(tx, ty + 2.9, tz - 0.6);
      b.group.add(dark);
      const lintel = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.9), this.mats.script);
      lintel.position.set(tx, ty + 6.4, tz + 0.92);
      b.group.add(lintel);
      this.glows.push({ mat: this.mats.script, day: 0.5, night: 2.2 });
      // The hill behind the door, and roots over the arch.
      b.add(new THREE.SphereGeometry(22, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.3, 0.55, 1), this.mats.mossStone, tx, ty - 2, tz - 20);
      physics.addCylinder(new THREE.Vector3(tx, ty + 3, tz - 20), 5, 20);
      for (let k = 0; k < 7; k++) {
        const r = new THREE.TorusGeometry(3.8 + k * 0.3, 0.18 + (k % 3) * 0.06, 5, 12, Math.PI * (0.6 + this.rnd() * 0.3));
        b.add(r, this.m.bark, tx + (this.rnd() - 0.5) * 2, ty + 3.4, tz + 0.4, (this.rnd() - 0.5) * 0.4);
      }
      // A court of broken pillars before the door.
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI - Math.PI, r = 16;
        const px = tx + Math.cos(a) * r, pz = tz + 30 + Math.sin(a) * r * -1;
        const h = 2 + this.rnd() * 4;
        b.add(new THREE.CylinderGeometry(0.6, 0.7, h, 10), this.mats.templeStone, px, heightAt(px, pz) + h / 2, pz);
        b.solid(1.2, h, 1.2, px, heightAt(px, pz) + h / 2, pz);
      }
      this.blightDecor = dead;
    });
    this.area('hermit', SITES.hermit, 550, (b) => {
      const [hx, hz] = SITES.hermit;
      const hy = heightAt(hx, hz);
      b.add(new THREE.SphereGeometry(14, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.2, 0.7, 1), this.mats.mossStone, hx, hy - 1, hz - 8);
      physics.addCylinder(new THREE.Vector3(hx, hy + 3, hz - 8), 4, 13);
      const mouth = new THREE.Mesh(new THREE.CircleGeometry(2.6, 16, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x050403 }));
      mouth.position.set(hx, hy, hz + 5.2);
      mouth.rotation.x = -0.25;
      b.group.add(mouth);
      b.campfire(hx + 3, hz + 9, 0.7);
      for (let k = 0; k < 3; k++) b.add(new THREE.SphereGeometry(0.25, 6, 5), this.mats.skull, hx - 3 + k * 0.6, hy + 0.2, hz + 7);
      // Antlers and a bear skull over the cave: the shapes he has worn.
      b.add(new THREE.BoxGeometry(2.4, 0.2, 0.2), this.m.bark, hx, hy + 3.1, hz + 5.6);
    });
    this.area('lostHunter', SITES.lostHunter, 400, (b) => {
      const [x, z] = SITES.lostHunter;
      b.add(new THREE.CylinderGeometry(0.6, 0.7, 7, 9).rotateZ(Math.PI / 2), this.m.bark, x + 2.5, heightAt(x + 2.5, z) + 0.5, z - 1.5, 0.7);
      b.campfire(x - 1.5, z + 1.5, 0.5);
      b.tent(x - 4, z - 3, 0.5, this.mats.canvas, 0.7);
    });
  }
  private blightDecor: THREE.Object3D | null = null;

  // ---- Moonlight Glade ----------------------------------------------------------------------------
  private layoutGlade() {
    const [gx, gz] = SITES.glade;
    this.spots.glade = v3(gx, gz);
    this.spots.sylwen = v3(gx + 2, gz + 3);
    this.settlements.push(gladeFolk(this.spots.sylwen));
    this.clearings.push([gx, gz, 46]);
    this.area('glade', [gx, gz], 800, (b) => {
      const gy = heightAt(gx, gz);
      // Twelve standing stones (one for each spoke), a flat altar stone, moonblossoms in the grass.
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const px = gx + Math.cos(a) * 15, pz = gz + Math.sin(a) * 15;
        const h = 4 + (k % 3) * 0.8;
        b.add(new THREE.BoxGeometry(1.3, h, 0.8), this.mats.gladeStone, px, heightAt(px, pz) + h / 2 - 0.3, pz, -a + Math.PI / 2);
        b.solid(1.3, h, 0.8, px, heightAt(px, pz) + h / 2, pz, -a + Math.PI / 2);
        const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), this.mats.starRune);
        rune.position.set(gx + Math.cos(a) * 14.55, heightAt(px, pz) + h * 0.6, gz + Math.sin(a) * 14.55);
        rune.rotation.y = -a - Math.PI / 2;
        b.group.add(rune);
      }
      this.glows.push({ mat: this.mats.starRune, day: 0.2, night: 2.6 });
      b.add(new THREE.CylinderGeometry(2.4, 2.6, 0.7, 16), this.mats.gladeStone, gx, gy + 0.35, gz);
      b.solid(4.8, 0.7, 4.8, gx, gy + 0.35, gz);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.8, 32), this.mats.starRune);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(gx, gy + 0.72, gz);
      b.group.add(disc);
      // Moonblossoms open on clear nights.
      for (let k = 0; k < 60; k++) {
        const a = this.rnd() * Math.PI * 2, r = 4 + this.rnd() * 26;
        const px = gx + Math.cos(a) * r, pz = gz + Math.sin(a) * r;
        const f = b.moonblossom(px, heightAt(px, pz), pz);
        this.nightBlooms.push(f);
      }
      // The ruin of the wheel-cutters beneath: a stair going down into the earth, sealed.
      const [sx, sz] = [gx - 22, gz - 10];
      b.add(new THREE.BoxGeometry(5, 0.5, 5), this.mats.gladeStone, sx, heightAt(sx, sz) + 0.1, sz);
      b.add(new THREE.BoxGeometry(3, 0.2, 3), new THREE.MeshBasicMaterial({ color: 0x050608 }), sx, heightAt(sx, sz) + 0.38, sz);
    });
  }

  // ---- gathering ---------------------------------------------------------------------------------
  private layoutGathering() {
    const r = mulberry32(2626);
    // Ironbark trees in the Inner Forest; every third is a sleeping treant.
    for (let k = 0, made = 0; k < 200 && made < 12; k++) {
      const x = -2600 + r() * 900, z = -2280 - r() * 680;
      if (forestLayer(x, z) !== 'inner' || heightAt(x, z) < 0.5) continue;
      if (Math.hypot(x - SITES.silverbough[0], z - SITES.silverbough[1]) < 70) continue;
      if (pointDist(FR.pts, x, z) < 14) continue;
      this.gathers.push({ id: 'ib' + made, kind: 'ironbark', pos: v3(x, z), sleeper: made % 3 === 2 });
      made++;
    }
    // Fallen giants in the Ancient Forest and around the Sanctum.
    const fallen: P2[] = [[-2700, -3290], [-2580, -3060], [-3080, -3260], [-2380, -3200], [-3250, -2900]];
    fallen.forEach(([x, z], k) => this.gathers.push({ id: 'fg' + k, kind: 'heartwood', pos: v3(x, z) }));
    // Moonblossom patches (they open at night) and spirit amber knots on the giants.
    const blooms: P2[] = [[SITES.glade[0] + 9, SITES.glade[1] - 6], [SITES.glade[0] - 8, SITES.glade[1] + 9], [-1900, -2660], [-2240, -2840], [-2780, -3150], [-2950, -2920]];
    blooms.forEach(([x, z], k) => this.gathers.push({ id: 'mb' + k, kind: 'moonblossom', pos: v3(x, z) }));
    megaTrees().slice(4, 10).forEach(([x, z, H], k) => {
      const a = k * 1.9;
      const rr = trunkRadius(1, H) + 0.4;
      this.gathers.push({ id: 'am' + k, kind: 'amber', pos: v3(x + Math.cos(a) * rr, z + Math.sin(a) * rr) });
    });
    for (const g of this.gathers) {
      this.area('gather:' + g.id, [g.pos.x, g.pos.z], g.kind === 'heartwood' ? 600 : 300, (b) => this.buildGather(b, g));
    }
  }

  private buildGather(b: Builder, g: Gather) {
    const { x, y, z } = g.pos;
    const obj = new THREE.Group();
    if (g.kind === 'ironbark') {
      if (g.sleeper) return; // a sleeping treant stands here instead (forestThreats)
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, 12, 9), this.mats.ironbark);
      t.position.y = 6;
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(3.6, 1), this.mats.ironLeaf);
      c.position.y = 13;
      c.scale.set(1, 0.8, 1);
      obj.add(t, c);
      physics.addCylinder(new THREE.Vector3(x, y + 4, z), 4, 0.7);
    } else if (g.kind === 'heartwood') {
      const yaw = this.rnd() * Math.PI;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.7, 34, 14).rotateZ(Math.PI / 2), barkMaterial());
      paintColor(log.geometry, 0x5a4432);
      log.position.y = 2.2;
      const root = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 3, 2, 12).rotateZ(Math.PI / 2), barkMaterial());
      paintColor(root.geometry, 0x4a3a2a);
      root.position.set(-17.5, 2.6, 0);
      const core = new THREE.Mesh(new THREE.CircleGeometry(2.1, 16).rotateY(Math.PI / 2), this.mats.heartGlow);
      core.position.set(17.02, 2.2, 0);
      const moss = new THREE.Mesh(new THREE.BoxGeometry(30, 0.4, 2.4), this.mats.moss);
      moss.position.y = 4.6;
      obj.add(log, root, core, moss);
      obj.rotation.y = yaw;
      physics.addBox(new THREE.Vector3(x, y + 2.2, z), new THREE.Vector3(17, 2.2, 2.4), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)));
      // The cut end faces this way: the interactable stands by it.
      g.pos = v3(x + Math.cos(-yaw) * 19.5, z + Math.sin(-yaw) * 19.5);
    } else if (g.kind === 'moonblossom') {
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2, r = 0.6 + (k % 3) * 0.7;
        this.nightBlooms.push(b.moonblossom(x + Math.cos(a) * r, heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r), z + Math.sin(a) * r));
      }
    } else {
      const knot = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4, 0), this.mats.amber);
      knot.position.y = 1.4;
      knot.scale.set(1, 1.4, 0.7);
      obj.add(knot);
    }
    obj.position.set(x, y, z);
    obj.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true)));
    b.group.add(obj);
    this.gatherMeshes.set(g.id, obj);
  }

  /** Has a gathering spot grown back? (heartwood a day, ironbark two, amber three, blossom half a day) */
  ready(g: Gather) {
    const cut = Number(this.hooks.flags['elves:cut:' + g.id] ?? -1e9);
    const wait = g.kind === 'heartwood' ? 24 : g.kind === 'ironbark' ? 48 : g.kind === 'amber' ? 72 : 12;
    return this.hooks.hours() - cut >= wait;
  }
  /** Mark a spot as harvested now. */
  harvested(g: Gather) {
    this.hooks.flags['elves:cut:' + g.id] = this.hooks.hours();
  }

  // ---- the Greenwood Road and the Oldest Way, painted beyond the road texture --------------------------------
  private buildRibbons() {
    const lines: { pts: P2[]; half: number; from: number }[] = [
      { pts: FR.pts, half: ROAD_HALF.lane + 0.6, from: 1900 },
      { pts: OLDEST_WAY, half: ROAD_HALF.trail + 0.5, from: 0 },
    ];
    const tex = dirtTexture();
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    for (const L of lines) {
      const spec = { id: '', name: '', kind: 'lane' as const, pts: L.pts };
      const len = roadLength(spec);
      const pos: number[] = [], uv: number[] = [], idx: number[] = [];
      let n = 0;
      for (let s = L.from; s <= len; s += 3) {
        const p = pointAlong(spec, s);
        const sx = -p.dir.y, sz = p.dir.x;
        for (const k of [-1, -0.6, 0, 0.6, 1]) {
          const x = p.x + sx * k * L.half, z = p.z + sz * k * L.half;
          pos.push(x, heightAt(x, z) + 0.08, z);
          uv.push((k + 1) / 2, s / 6);
        }
        if (n > 0) for (let j = 0; j < 4; j++) {
          const a = (n - 1) * 5 + j, c = n * 5 + j;
          idx.push(a, c, a + 1, a + 1, c, c + 1);
        }
        n++;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, mat);
      mesh.receiveShadow = true;
      mesh.renderOrder = 1;
      this.ribbons.add(mesh);
    }
  }

  // ---- per step and per frame ------------------------------------------------------------------------
  /** Simulation step: the forest's threats. */
  step(dt: number, player: Player) {
    this.threats.update(dt, player);
    // Sleeping treants stand at their marked trees while you're near.
    for (const g of this.gathers) {
      if (!g.sleeper || !this.ready(g)) continue;
      const d = Math.hypot(player.pos.x - g.pos.x, player.pos.z - g.pos.z);
      if (d < 150 && !this.threats.treants.has(g.id)) this.threats.sleeper(g.id, g.pos);
    }
  }

  /** Per frame: building places on approach, lights, fires, smoke, blooms, giants' LOD and layer cards. */
  frame(dt: number, camera: THREE.Vector3, player: THREE.Vector3, night: number) {
    this.t += dt;
    for (const a of this.areas) {
      const d = Math.hypot(camera.x - a.at[0], camera.z - a.at[1]);
      if (!a.built && d < a.radius) a.build();
      a.group.visible = this.visible && a.built && d < a.radius + 150;
    }
    this.ribbons.visible = this.visible && Math.hypot(camera.x + 2200, camera.z + 2700) < 2600;
    this.mega.update(dt, camera);
    const near = (q: THREE.Vector3, r: number) => Math.hypot(player.x - q.x, player.z - q.z) < r;
    for (const f of this.fires) {
      if (!near(f.pos, 200)) continue;
      f.mat.emissiveIntensity = 1.3 + Math.sin(this.t * 13 + f.pos.x) * 0.25 + night;
      if (Math.random() < dt * 16 * f.size) this.fx.add.spawn({ pos: f.pos, vel: new THREE.Vector3(0, 1.6, 0), spread: 0.4 * f.size, count: 1, life: [0.4, 0.8], size: [0.45 * f.size, 0.06], color: 0xffc060, color2: 0xff3a00, jitter: 0.3 });
    }
    for (const s of this.smokes) if (near(s, 260) && Math.random() < dt * 3) this.fx.add.spawn({ pos: s, vel: new THREE.Vector3(0.3, 1.2, 0), spread: 1, count: 1, life: [2, 3.5], size: [1, 2.6], color: 0x5a5652, color2: 0x9a9692, gravity: -0.3, upBias: 0.6 });
    for (const g of this.glows) g.mat.emissiveIntensity = g.day + (g.night - g.day) * night;
    for (const w of this.wheels) w.rotation.x -= dt * 0.9;
    // Moonblossoms open after dark and close at dawn.
    const open = Math.min(1, Math.max(0.15, night * 1.4));
    for (const f of this.nightBlooms) f.scale.setScalar(open);
    // The spring's webs go when its spiders do; the grove's rot when the Elder falls.
    if (this.springWebs) this.springWebs.visible = !this.hooks.isDone('the-guides-token');
    if (this.blightDecor) this.blightDecor.visible = !this.hooks.flags['elves:elderDead'];
    for (const g of this.gathers) {
      const m = this.gatherMeshes.get(g.id);
      if (m && g.kind !== 'heartwood') m.visible = this.ready(g);
    }
    // Entering a layer of the forest announces it (a quieter card than a region's).
    const layer = forestLayer(player.x, player.z);
    if (layer !== this.layer) {
      if (layer && this.layer !== null) {
        const key = 'elves:layer:' + layer;
        const first = !this.hooks.flags[key];
        this.hooks.flags[key] = true;
        this.hooks.card(LAYER_NAMES[layer], layer === 'outer' ? 'Woodcutters and the forest’s edge' : layer === 'inner' ? 'Moss, mist and the first blossoms' : layer === 'ancient' ? 'Trees as tall as towers' : 'Where the World Tree stands', first);
      }
      this.layer = layer;
    }
  }

  setVisible(v: boolean) {
    this.visible = v;
    for (const a of this.areas) a.group.visible = v && a.built;
    this.ribbons.visible = v;
    this.mega.setVisible(v);
  }

  /** Back to a fresh world (tests). */
  reset() {
    this.threats.clear();
    this.applyQuarrel();
  }
}

// ---- materials and the little builder kit --------------------------------------------------------------
function elfMats() {
  const std = (c: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, ...o });
  return {
    silverwood: std(0xd8ccb0, { roughness: 0.7 }),
    leafRoof: std(0x3d7a45),
    gold: std(0xc8a040, { roughness: 0.35, metalness: 0.7 }),
    rope: std(0xb8a070),
    water: new THREE.MeshStandardMaterial({ color: 0x2a6a7a, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.82 }),
    hide: std(0x8a6a4a, { side: THREE.DoubleSide }),
    canvas: std(0xd8ccb0, { side: THREE.DoubleSide }),
    charcoal: std(0x2a2622, { roughness: 1 }),
    ribbon: std(0x2fbf9a, { emissive: 0x1a8a6a, emissiveIntensity: 0.4 }),
    oakLeaf: std(0x3f7a34, { roughness: 1 }),
    mossStone: std(0x6a7a5a, { roughness: 1 }),
    web: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
    deadBark: std(0x3a2e30, { roughness: 1 }),
    templeStone: std(0xb8b4c0, { roughness: 0.85 }),
    script: new THREE.MeshStandardMaterial({ map: scriptTexture(), transparent: true, emissive: 0x8ad0ff, emissiveMap: scriptTexture(), emissiveIntensity: 0.6, depthWrite: false }),
    gladeStone: std(0xc8c8d0, { roughness: 0.8 }),
    starRune: new THREE.MeshStandardMaterial({ map: starTexture(), transparent: true, emissive: 0x9ad8ff, emissiveMap: starTexture(), emissiveIntensity: 0.4, depthWrite: false, side: THREE.DoubleSide }),
    skull: std(0xe8e0c8),
    ironbark: std(0x3a3a38, { roughness: 1 }),
    ironLeaf: std(0x3a5a4a, { roughness: 1 }),
    heartGlow: std(0xe0a840, { emissive: 0xc07a20, emissiveIntensity: 0.6 }),
    moss: std(0x4a6a2a, { roughness: 1 }),
    amber: new THREE.MeshStandardMaterial({ color: 0xffa630, roughness: 0.2, transparent: true, opacity: 0.88, emissive: 0xff7a10, emissiveIntensity: 0.8 }),
    blossom: new THREE.MeshStandardMaterial({ color: 0xe8f4ff, emissive: 0x9ad8ff, emissiveIntensity: 1.6, roughness: 0.5 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xe8fff4, emissive: 0x8affd0, emissiveIntensity: 1.2, roughness: 0.4 }),
  };
}
type ElfMats = ReturnType<typeof elfMats>;

/** The builder kit for one place: batched static meshes, colliders, houses and dressing. */
class Builder {
  readonly batch = new StaticBatch();
  readonly doors: Door[] = [];
  constructor(
    readonly group: THREE.Group, private m: WorldMats, private e: ElfMats, private rnd: () => number,
    private fires: { pos: THREE.Vector3; mat: THREE.MeshStandardMaterial; size: number }[],
    private glows: { mat: THREE.MeshStandardMaterial; day: number; night: number }[],
  ) {}
  add(g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0, uv = 1.5) {
    const mesh = new THREE.Mesh(worldUV(g, uv), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    this.batch.addObject(mesh);
  }
  solid(w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) {
    return physics.addBox(new THREE.Vector3(x, y, z), new THREE.Vector3(w / 2, h / 2, d / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)));
  }
  house(x: number, z: number, rot: number, spec: HouseSpec, info: Partial<Door> = {}) {
    const { group, half, door } = buildHouse(spec, this.m);
    let gy = Infinity;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) gy = Math.min(gy, heightAt(x + Math.cos(rot) * sx * half.x + Math.sin(rot) * sz * half.z, z - Math.sin(rot) * sx * half.x + Math.cos(rot) * sz * half.z));
    group.position.set(x, gy, z);
    group.rotation.y = rot;
    if (info.name !== '__ruin') {
      // (Registered so the house can be walked into; the game adds it once it is built.)
      const before = (registerDoor(group, door, spec, info));
      this.doors.push(before);
    }
    this.batch.addObject(group);
    physics.addBox(new THREE.Vector3(x, gy + half.y, z), half, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)));
  }
  campfire(x: number, z: number, size = 1) {
    const y = heightAt(x, z);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      this.add(new THREE.IcosahedronGeometry(0.22 * size, 0), this.m.stone, x + Math.cos(a) * 0.75 * size, y + 0.1, z + Math.sin(a) * 0.75 * size);
    }
    for (let k = 0; k < 4; k++) this.add(new THREE.CylinderGeometry(0.08 * size, 0.1 * size, 1.1 * size, 6).rotateX(Math.PI / 2 - 0.35).rotateY((k / 4) * Math.PI * 2), this.m.bark, x, y + 0.22, z);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a1206, emissive: 0xff7a2a, emissiveIntensity: 1.6 });
    const coals = new THREE.Mesh(new THREE.CylinderGeometry(0.4 * size, 0.45 * size, 0.12, 10), mat);
    coals.position.set(x, y + 0.1, z);
    this.group.add(coals);
    this.fires.push({ pos: new THREE.Vector3(x, y + 0.35, z), mat, size });
    GRASS_MASKS.push({ x, z, r: 2.4 * size, amount: 0.9 });
  }
  tent(x: number, z: number, yaw: number, mat: THREE.Material, s = 1) {
    const y = heightAt(x, z);
    const g = new THREE.ConeGeometry(1.9 * s, 2.3 * s, 4, 1, true).rotateY(Math.PI / 4).scale(1, 1, 1.4);
    this.add(g, mat, x, y + 1.1 * s, z, yaw);
    this.solid(2.6 * s, 1.6 * s, 3.6 * s, x, y + 0.8 * s, z, yaw);
  }
  woodpile(x: number, z: number, yaw: number) {
    const y = heightAt(x, z);
    for (let r = 0; r < 3; r++) for (let n = 0; n < 4 - r; n++) this.add(new THREE.CylinderGeometry(0.16, 0.16, 1.4, 6).rotateZ(Math.PI / 2), this.m.bark, x + (n - (3 - r) / 2) * 0.33 * Math.cos(yaw), y + 0.16 + r * 0.28, z - (n - (3 - r) / 2) * 0.33 * Math.sin(yaw), yaw + Math.PI / 2);
  }
  lantern(x: number, z: number) {
    const y = heightAt(x, z);
    this.add(new THREE.CylinderGeometry(0.07, 0.1, 3.2, 6), this.m.timber, x, y + 1.6, z);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffb050, emissiveIntensity: 0.3 });
    this.glows.push({ mat, day: 0.3, night: 2.7 });
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.4, 0.28), mat);
    l.position.set(x, y + 3.3, z);
    this.group.add(l);
  }
  sign(lines: string[], x: number, z: number, yaw: number, w = 1.6) {
    const y = heightAt(x, z);
    for (const s of [-1, 1]) this.add(new THREE.BoxGeometry(0.12, 2.2, 0.12), this.m.timber, x + Math.cos(yaw) * s * (w / 2), y + 1.1, z - Math.sin(yaw) * s * (w / 2));
    const board = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.45), new THREE.MeshStandardMaterial({ map: carvedText(lines, 512, 230, '#efe3c2', '#3a2a1a'), roughness: 1, side: THREE.DoubleSide }));
    board.position.set(x, y + 1.75, z);
    board.rotation.y = yaw;
    this.group.add(board);
  }
  /** A pale marker stone with a glowing rune, like the one across the road. */
  markerStone(x: number, z: number, yaw: number) {
    const y = heightAt(x, z);
    this.add(new THREE.BoxGeometry(0.7, 2.2, 0.4), this.m.bridgeStone ?? this.m.stone, x, y + 1.0, z, yaw);
    this.solid(0.7, 2.2, 0.4, x, y + 1.1, z, yaw);
    const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.2), this.e.starRune);
    rune.position.set(x + Math.sin(yaw) * 0.21, y + 1.2, z + Math.cos(yaw) * 0.21);
    rune.rotation.y = yaw;
    this.group.add(rune);
    // Flowers laid at its foot.
    for (let k = 0; k < 3; k++) this.add(new THREE.SphereGeometry(0.12, 6, 4), this.e.blossom, x + Math.sin(yaw) * 0.5 + (k - 1) * 0.2, y + 0.1, z + Math.cos(yaw) * 0.5);
  }
  /** A glowing-blossom lantern hanging on a cord. */
  blossomLamp(x: number, y: number, z: number) {
    const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), this.e.lamp);
    l.position.set(x, y, z);
    this.group.add(l);
    this.add(new THREE.CylinderGeometry(0.01, 0.01, 0.9, 3), this.e.rope, x, y + 0.6, z);
    if (!this.glows.some((g) => g.mat === this.e.lamp)) this.glows.push({ mat: this.e.lamp, day: 0.8, night: 2.8 });
  }
  /** An elven home: a rounded pod of silverwood with a leaf roof and a glowing round door. */
  pod(x: number, y: number, z: number, face: number, s = 1) {
    this.add(new THREE.SphereGeometry(2.2 * s, 12, 8).scale(1, 0.85, 1), this.e.silverwood, x, y + 1.6 * s, z);
    this.add(new THREE.ConeGeometry(2.6 * s, 2.2 * s, 10), this.e.leafRoof, x, y + 3.5 * s, z);
    const door = new THREE.Mesh(new THREE.CircleGeometry(0.7 * s, 14), this.e.lamp);
    door.position.set(x + Math.cos(face) * 2.15 * s, y + 0.95 * s, z + Math.sin(face) * 2.15 * s);
    door.rotation.y = Math.PI / 2 - face;
    this.group.add(door);
    this.solid(3.4 * s, 3 * s, 3.4 * s, x, y + 1.5 * s, z);
  }
  /** A moonweave loom under an awning. */
  loom(x: number, z: number, yaw: number) {
    const y = heightAt(x, z);
    for (const s of [-1, 1]) this.add(new THREE.BoxGeometry(0.1, 1.8, 0.1), this.e.silverwood, x + Math.cos(yaw) * s * 0.8, y + 0.9, z - Math.sin(yaw) * s * 0.8);
    this.add(new THREE.BoxGeometry(1.6, 1.2, 0.02), new THREE.MeshStandardMaterial({ color: 0x9ab8e8, emissive: 0x6a8ad8, emissiveIntensity: 0.3, side: THREE.DoubleSide }), x, y + 1.0, z, yaw);
  }
  /** One moonblossom (scaled by the frame loop: closed by day, open at night). */
  moonblossom(x: number, y: number, z: number) {
    const f = new THREE.Mesh(this.blossomGeo, this.e.blossom);
    f.position.set(x, y + 0.25, z);
    f.rotation.y = this.rnd() * 6;
    this.group.add(f);
    return f;
  }
  private blossomGeo = (() => {
    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 5; k++) {
      const p = new THREE.SphereGeometry(0.12, 6, 4).scale(1, 0.25, 0.5);
      p.translate(0.12, 0, 0).rotateY((k / 5) * Math.PI * 2);
      parts.push(p.toNonIndexed());
    }
    const stem = new THREE.CylinderGeometry(0.01, 0.015, 0.25, 4).translate(0, -0.12, 0).toNonIndexed();
    for (const p of [...parts, stem]) for (const k of Object.keys(p.attributes)) if (k !== 'position' && k !== 'normal') p.deleteAttribute(k);
    return mergeGeometries([...parts, stem], false)!;
  })();
}

function pointDist(pts: P2[], x: number, z: number) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const vx = bx - ax, vz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    d = Math.min(d, Math.hypot(x - ax - vx * t, z - az - vz * t));
  }
  return d;
}
export { pointDist as pathDist };

function paintColor(g: THREE.BufferGeometry, hex: number) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const k = 0.85 + 0.3 * Math.random();
    col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

function dirtTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d')!;
  const img = g.createImageData(64, 128);
  const r = mulberry32(99);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) {
    const u = x / 63;
    const edge = Math.min(1, Math.min(u, 1 - u) * 4.2 + (r() - 0.5) * 0.35);
    const n = 0.85 + r() * 0.3;
    const rut = Math.abs(u - 0.3) < 0.05 || Math.abs(u - 0.7) < 0.05 ? 0.86 : 1;
    const i = (y * 64 + x) * 4;
    img.data[i] = 150 * n * rut; img.data[i + 1] = 118 * n * rut; img.data[i + 2] = 80 * n * rut;
    img.data[i + 3] = Math.max(0, Math.min(255, edge * 255));
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let scriptTex: THREE.CanvasTexture | null = null;
/** The Starfall Script: the wheel-cutters' writing, angular marks around small circles. */
export function scriptTexture() {
  if (scriptTex) return scriptTex;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#cfefff';
  g.lineWidth = 3;
  const r = mulberry32(1212);
  for (let k = 0; k < 18; k++) {
    const x = 16 + k * 27, y = 32;
    g.beginPath();
    g.arc(x, y, 5, 0, Math.PI * 2);
    for (let n = 0; n < 3; n++) {
      const a = r() * Math.PI * 2;
      g.moveTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5);
      g.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14);
    }
    g.stroke();
  }
  scriptTex = new THREE.CanvasTexture(c);
  scriptTex.colorSpace = THREE.SRGBColorSpace;
  return scriptTex;
}
let starTex: THREE.CanvasTexture | null = null;
function starTexture() {
  if (starTex) return starTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#d8f0ff';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(64, 64, 40, 0, Math.PI * 2);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    g.moveTo(64 + Math.cos(a) * 14, 64 + Math.sin(a) * 14);
    g.lineTo(64 + Math.cos(a) * 40, 64 + Math.sin(a) * 40);
  }
  g.stroke();
  g.fillStyle = '#ffffff';
  for (let k = 0; k < 7; k++) {
    g.beginPath();
    g.arc(30 + ((k * 37) % 70), 24 + ((k * 53) % 80), 3, 0, Math.PI * 2);
    g.fill();
  }
  starTex = new THREE.CanvasTexture(c);
  starTex.colorSpace = THREE.SRGBColorSpace;
  return starTex;
}
