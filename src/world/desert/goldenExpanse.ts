import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { compressedGltf } from '../../core/gltf';
import { mulberry32 } from '../../core/math';
import { physics } from '../../physics/physics';
import { heightAt, roadDist } from '../terrainHeight';
import { sandWeight } from '../worldMap';
import { WAYSTONES } from '../kingsRoad';
import { sfx } from '../../audio/sfx';
import { SUNSPIRE, SUNSPIRE_HALF, SUNSPIRE_GATE_Z, SCAV_CAMPS, CAMP_INFO, CARAVAN_ROAD, WEST_GATE, sunspirePad, sunspireY, campFloor, panAt } from './desertLayout';
import { MODEL, cellWorld, streetCells, worldCell, cellTop, cityDoors } from './cityGrid';
import { registerDoor, type Door } from '../doors';
import { SandGolem } from '../../enemies/sandGolem';
import { SandEel, SandCrab, DuneJelly, RaySkimmer, CaravanTurtle, type SandCreature } from '../../enemies/sandCreatures2';
import { SandShark, SandRay, DolphinPod, SandWhale } from '../../enemies/sandCreatures';
import { Bandit, Bolts } from '../../enemies/bandit';
import type { FX } from '../../fx/particles';
import type { Player } from '../../player/player';
import type { Interactable } from '../../dungeon/instance';
import type { Look } from '../../npc/charBuilder';

// The Golden Expanse (the map's desert, west-south-west of Elder Glen):
// Ghagrabba, the walled gold city of the Sunborn, streamed in as the player
// nears it; scavenger camps of scrap and tarp in the dunes around it, some
// friendly and some raiders; and the sand-sea's creatures — sharks, rays,
// dolphin pods, whales, and Old Sawtooth in his basin.

/** Ghagrabba's waystones: at the east gate and at the Waystop. */
const GATE_X = SUNSPIRE.x + SUNSPIRE_HALF.x + 30;
WAYSTONES.push(
  { id: 'sunspire', name: 'Ghagrabba (East Gate)', pos: new THREE.Vector3(GATE_X + 6, 0, SUNSPIRE_GATE_Z + 14) },
  { id: 'waystop', name: 'The Waystop (Caravan Way)', pos: new THREE.Vector3(SCAV_CAMPS[5][0] + 10, 0, SCAV_CAMPS[5][1] - 16) },
);

/** Where Old Sawtooth hunts: a dune basin south of the caravan way. */
export const SAWTOOTH_BASIN = new THREE.Vector3(-4740, 0, 1700);

const HOSTILE_CAMPS = CAMP_INFO.map((c, k) => (c.friendly ? -1 : k)).filter((k) => k >= 0);
/** Where the Warden sleeps under the southern sand (nothing marks the spot). */
export const WARDEN_AT = new THREE.Vector3(-6050, 0, 1850);

const RAIDER_LOOKS: Look[] = [
  { body: 'male', outfit: 'ranger', hood: true, hair: 'buzzed', beard: true, hairColor: 0x2a1a10, skin: 0x8a5a3a, cloth: 0x5a4030, linen: 0x7a6a50, bracers: true, height: 1.78 },
  { body: 'female', outfit: 'ranger', hood: true, hair: 'long', hairColor: 0x1a1410, skin: 0xa8744e, cloth: 0x6a3a2a, linen: 0x8a7a60, height: 1.68 },
  { body: 'male', outfit: 'ranger', hood: false, hair: 'buzzed', beard: true, hairColor: 0x6a5a48, skin: 0x7a4e32, cloth: 0x4a4a40, pauldron: true, height: 1.82 },
];

/** Homes for one kind of creature, spawned as the player comes near and packed away behind. */
class Stream {
  readonly live = new Map<number, SandCreature>();
  private respawnAt = new Map<number, number>();
  constructor(readonly homes: THREE.Vector3[], private max: number, private near: number, private far: number, private respawn: number, private make: (h: THREE.Vector3, i: number) => SandCreature) {}
  update(dt: number, player: Player, time: number, sheltered: (p: THREE.Vector3) => boolean) {
    const p = player.pos;
    this.homes.forEach((h, i) => {
      const d = Math.hypot(p.x - h.x, p.z - h.z);
      const c = this.live.get(i);
      if (!c && d < this.near && this.live.size < this.max && (this.respawnAt.get(i) ?? 0) < time) this.live.set(i, this.make(h, i));
      if (c && (d > this.far || c.dead)) {
        if (c.dead) this.respawnAt.set(i, time + this.respawn);
        c.dispose();
        this.live.delete(i);
      }
    });
    for (const c of this.live.values()) c.update(dt, player, sheltered);
  }
  clear() {
    for (const c of this.live.values()) c.dispose();
    this.live.clear();
  }
}

export interface DesertHooks {
  toast(msg: string): void;
  bossBar(t: { hp: number; maxHp: number; alive: boolean } | null, name?: string): void;
  card(title: string, subtitle: string): void;
  flags: Record<string, boolean | number | string>;
  give(item: string, n: number): void;
  save(): void;
  /** trade with a passing caravan (by its trader's name) */
  trade?(name: string): void;
}

const std = (color: number, roughness = 0.85, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

export class GoldenExpanse {
  readonly interactables: Interactable[] = [];
  readonly group = new THREE.Group();
  private city: THREE.Group | null = null;
  private cityLoading = false;
  private cityCollider: unknown = null;
  private cityDressing = new THREE.Group();
  private camps: THREE.Group[] = [];
  private bolts: Bolts;
  private raiders: { camp: number; list: Bandit[]; clearedAt: number }[] = HOSTILE_CAMPS.map((camp) => ({ camp, list: [], clearedAt: -1e9 }));
  private sharks = new Map<number, SandShark>();
  private rays = new Map<number, SandRay>();
  private pods = new Map<number, DolphinPod>();
  private whales: SandWhale[] = [];
  private sharkHomes: THREE.Vector3[] = [];
  private rayHomes: THREE.Vector3[] = [];
  private podHomes: THREE.Vector3[] = [];
  private respawn = new Map<string, number>();
  private boss: SandShark | null = null;
  private bossShown = false;
  private time = 0;
  private t = 0;
  private fires: { at: THREE.Vector3; flame: THREE.Mesh }[] = [];
  private visible = true;
  private doorsPlaced = false;
  private digCount = 0;
  private cityLoadedAt = 0;
  /** the city's doors, once placed (main.ts makes them enterable) */
  onDoors?: (doors: Door[]) => void;
  private warden: SandGolem | null = null;
  private wardenShown = false;
  private creatures: Stream[] = [];
  private riders: Stream;
  private loose: Bandit[] = [];
  private caravans: CaravanTurtle[] = [];
  private nearCaravan: CaravanTurtle | null = null;
  // The sandstorm: 0 calm .. 1 blind.
  storm = 0;
  private stormLeft = 0;
  private stormNext = 200 + Math.random() * 300;
  private stormOverlay: HTMLDivElement;

  constructor(private scene: THREE.Scene, private fx: FX, private hooks: DesertHooks, private hour: () => number) {
    scene.add(this.group);
    this.group.add(this.cityDressing);
    this.bolts = new Bolts(scene);
    const rnd = mulberry32(4120);
    const sheltered = (x: number, z: number) => sunspirePad(x, z) > 0 || SCAV_CAMPS.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r + 60) || roadDist(x, z) < 24 || SAWTOOTH_BASIN.distanceTo(new THREE.Vector3(x, 0, z)) < 140;
    // Shark and ray homes: deep sand round the city and along the caravan way.
    for (let tries = 0; tries < 4000 && (this.sharkHomes.length < 46 || this.rayHomes.length < 60); tries++) {
      const a = rnd() * Math.PI * 2, r = 260 + rnd() * 2600;
      const x = SUNSPIRE.x + 900 + Math.cos(a) * r, z = SUNSPIRE.z + Math.sin(a) * r * 0.75;
      if (sandWeight(x, z) < 0.55 || sheltered(x, z)) continue;
      if (this.sharkHomes.length < 46 && rnd() < 0.5) this.sharkHomes.push(new THREE.Vector3(x, 0, z));
      else if (this.rayHomes.length < 60) this.rayHomes.push(new THREE.Vector3(x, 0, z));
    }
    // Dolphin pods play beside the road; whales cruise the open sand.
    // (Only on deep sand: the desert's edges are grassland on the map.)
    for (const [x, z] of [[-3600, 760], [-4100, 540], [-4500, 820], [-5050, 560], [-4800, 1000], [-6300, 600]]) if (sandWeight(x, z) > 0.6) this.podHomes.push(new THREE.Vector3(x, 0, z));
    for (const [x, z, r] of [[-4300, 1350, 320], [-6900, 400, 260], [-6400, 1300, 300], [-5200, 1900, 280]]) {
      if (sandWeight(x, z) < 0.6 || sandWeight(x + r, z) < 0.5 || sandWeight(x - r, z) < 0.5 || sandWeight(x, z + r) < 0.5 || sandWeight(x, z - r) < 0.5) continue;
      const w = new SandWhale(new THREE.Vector3(x, 0, z), r, scene, fx);
      w.onBreach = (at) => this.breachShake(at);
      w.setVisible(false);
      this.whales.push(w);
    }
    // Eels in burrows, crabs under the crests, jellyfish drifting over the flat pans.
    const homes = (n: number, ok: (x: number, z: number) => boolean, seed: number) => {
      const r2 = mulberry32(seed), out: THREE.Vector3[] = [];
      for (let tries = 0; tries < n * 60 && out.length < n; tries++) {
        const a = r2() * Math.PI * 2, r = 120 + r2() * 3000;
        const x = SUNSPIRE.x + 800 + Math.cos(a) * r, z = SUNSPIRE.z + 300 + Math.sin(a) * r * 0.75;
        if (sandWeight(x, z) < 0.5 || sheltered(x, z) || !ok(x, z)) continue;
        out.push(new THREE.Vector3(x, 0, z));
      }
      return out;
    };
    this.creatures.push(
      new Stream(homes(70, () => true, 11), 6, 90, 160, 200, (h) => new SandEel(h, scene, fx)),
      new Stream(homes(70, (x, z) => panAt(x, z) < 0.5, 12), 6, 110, 190, 240, (h) => new SandCrab(h, scene, fx)),
      new Stream(homes(50, (x, z) => panAt(x, z) > 0.4, 13), 8, 140, 220, 200, (h) => new DuneJelly(h, scene, fx)),
    );
    // Raiders on harnessed rays roam the open sand.
    this.riders = new Stream(homes(14, () => true, 14), 3, 240, 380, 420, (h, i) => {
      const r = new RaySkimmer(h, scene, fx, this.bolts, RAIDER_LOOKS[i % RAIDER_LOOKS.length]);
      r.onDismount = (at) => this.dismount(at, i);
      return r;
    });
    // Trader caravans on great sand turtles plod the Caravan Way.
    const road = CARAVAN_ROAD.filter(([x]) => x <= -2600);
    this.caravans.push(
      new CaravanTurtle(road, 0, scene, fx, { body: 'male', outfit: 'peasant', hood: true, hair: 'buzzed', beard: true, hairColor: 0x2a1a10, skin: 0x8a5a3a, cloth: 0x1f7a7a, linen: 0xe8dcc0, height: 1.74 }, 'Caravan Master Amenhir'),
      new CaravanTurtle([...road].reverse(), 2, scene, fx, { body: 'female', outfit: 'peasant', hood: true, hair: 'long', hairColor: 0x120c08, skin: 0xa8744e, cloth: 0xb8402e, linen: 0xf0e4c8, height: 1.66 }, 'Trader Satiah'),
    );
    for (const c of this.caravans) c.setVisible(false);
    this.interactables.push({
      pos: new THREE.Vector3(0, -999, 0), radius: 6,
      label: () => `Trade with ${this.nearCaravan?.name ?? 'the caravan'}`,
      enabled: () => !!this.nearCaravan,
      action: () => this.nearCaravan && this.hooks.trade?.(this.nearCaravan.name),
    });
    // The storm overlay: blowing sand across the whole screen.
    this.stormOverlay = document.createElement('div');
    this.stormOverlay.className = 'sandstorm';
    document.getElementById('ui')?.appendChild(this.stormOverlay);
    this.buildCamps();
    this.buildInteractables();
  }

  /** A ray dies: its rider is thrown clear and fights on foot. */
  private dismount(at: THREE.Vector3, i: number) {
    const b = new Bandit('sword', at.clone().setY(heightAt(at.x, at.z)), this.scene, this.bolts, undefined, RAIDER_LOOKS[i % RAIDER_LOOKS.length]);
    b.kind = 'scavenger';
    b.name = 'Unhorsed Ray-Rider';
    b.alerted = true;
    this.loose.push(b);
  }

  /** Near enough to the Expanse that its world needs to exist? */
  private near(p: THREE.Vector3, d: number) {
    return p.x < -1800 && Math.hypot(p.x - SUNSPIRE.x, p.z - SUNSPIRE.z) < d;
  }

  private breachShake(at: THREE.Vector3) {
    sfx.rumble(4, 0.6);
    void at;
  }

  // ---- Ghagrabba --------------------------------------------------------------------------------------

  private async loadCity() {
    this.cityLoading = true;
    const g = await compressedGltf.loadAsync('/assets/desert/sunspire.glb');
    const S = MODEL.scale, [mcx, mcy, mcz] = MODEL.center;
    const place = new THREE.Matrix4().makeTranslation(SUNSPIRE.x, sunspireY(), SUNSPIRE.z)
      .multiply(new THREE.Matrix4().makeScale(S, S, S))
      .multiply(new THREE.Matrix4().makeTranslation(-mcx, -mcy, -mcz));
    g.scene.updateMatrixWorld(true);
    // Bake every mesh into world space, cut the west gate through the walls,
    // then split the city into chunks so only the streets in view are drawn.
    const CH = 6;
    const x0 = SUNSPIRE.x - SUNSPIRE_HALF.x, z0 = SUNSPIRE.z - SUNSPIRE_HALF.z;
    const cw = (SUNSPIRE_HALF.x * 2) / CH, cd = (SUNSPIRE_HALF.z * 2) / CH;
    const chunks = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
    const collPos: number[] = [], collIdx: number[] = [];
    const meshes: THREE.Mesh[] = [];
    g.scene.traverse((o) => (o as THREE.Mesh).isMesh && meshes.push(o as THREE.Mesh));
    for (const mesh of meshes) {
      const src = mesh.geometry;
      const m = new THREE.Matrix4().multiplyMatrices(place, mesh.matrixWorld);
      const posA = src.getAttribute('position'), nrmA = src.getAttribute('normal'), uvA = src.getAttribute('uv');
      const n0 = posA.count;
      const P0 = new Float32Array(n0 * 3), N0 = nrmA ? new Float32Array(n0 * 3) : null, U0 = uvA ? new Float32Array(n0 * 2) : null;
      const v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(m);
      for (let i = 0; i < n0; i++) {
        v.fromBufferAttribute(posA, i).applyMatrix4(m);
        P0[i * 3] = v.x; P0[i * 3 + 1] = v.y; P0[i * 3 + 2] = v.z;
        if (N0) {
          v.fromBufferAttribute(nrmA, i).applyMatrix3(nm).normalize();
          N0[i * 3] = v.x; N0[i * 3 + 1] = v.y; N0[i * 3 + 2] = v.z;
        }
        if (U0) {
          U0[i * 2] = uvA.getX(i);
          U0[i * 2 + 1] = uvA.getY(i);
        }
      }
      const idx0: ArrayLike<number> = src.index ? src.index.array : Uint32Array.from({ length: n0 }, (_, i) => i);
      const { P, N, U, idx } = cutWestGate(P0, N0, U0, idx0, sunspireY());
      const n = P.length / 3;
      // Collision: everything, in world space.
      const base = collPos.length / 3;
      for (let i = 0; i < P.length; i++) collPos.push(P[i]);
      for (let i = 0; i < idx.length; i++) collIdx.push(idx[i] + base);
      // Bucket triangles by centroid.
      const buckets = new Map<number, number[]>();
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t], b = idx[t + 1], c = idx[t + 2];
        const cx = (P[a * 3] + P[b * 3] + P[c * 3]) / 3, cz = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3;
        const k = Math.min(CH - 1, Math.max(0, Math.floor((cx - x0) / cw))) + Math.min(CH - 1, Math.max(0, Math.floor((cz - z0) / cd))) * CH;
        let list = buckets.get(k);
        if (!list) buckets.set(k, (list = []));
        list.push(a, b, c);
      }
      const remap = new Int32Array(n).fill(-1);
      for (const [k, list] of buckets) {
        const used: number[] = [];
        const out = new Uint32Array(list.length);
        for (let i = 0; i < list.length; i++) {
          let r = remap[list[i]];
          if (r < 0) (r = remap[list[i]] = used.length), used.push(list[i]);
          out[i] = r;
        }
        for (const u of used) remap[u] = -1;
        const geo = new THREE.BufferGeometry();
        const pp = new Float32Array(used.length * 3), nn = N ? new Float32Array(used.length * 3) : null, uu = U ? new Float32Array(used.length * 2) : null;
        used.forEach((u, i) => {
          pp.set(P.subarray(u * 3, u * 3 + 3), i * 3);
          if (nn) nn.set(N!.subarray(u * 3, u * 3 + 3), i * 3);
          if (uu) uu.set(U!.subarray(u * 2, u * 2 + 2), i * 2);
        });
        geo.setAttribute('position', new THREE.BufferAttribute(pp, 3));
        if (nn) geo.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
        if (uu) geo.setAttribute('uv', new THREE.BufferAttribute(uu, 2));
        geo.setIndex(new THREE.BufferAttribute(out, 1));
        const mat = mesh.material as THREE.Material;
        const key = k + ':' + mat.uuid;
        let ch = chunks.get(key);
        if (!ch) chunks.set(key, (ch = { mat, geos: [] }));
        ch.geos.push(geo);
      }
    }
    const city = new THREE.Group();
    city.name = 'sunspire';
    let wallMat: THREE.Material | null = null;
    for (const { mat, geos } of chunks.values()) {
      const geo = geos.length > 1 ? mergeGeometries(geos)! : geos[0];
      if (!geo.getAttribute('normal')) geo.computeVertexNormals();
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      const m = mat as THREE.MeshStandardMaterial;
      if (m.map) m.map.anisotropy = 4;
      if (/Brick/.test(m.name) && m.map) wallMat ??= m;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      city.add(mesh);
    }
    this.cityCollider = physics.addTrimesh(new Float32Array(collPos), new Uint32Array(collIdx));
    this.city = city;
    this.group.add(city);
    this.buildWestGate(wallMat);
    this.dressCity();
    this.cityLoadedAt = this.time;
    this.cityLoading = false;
  }

  /** The west gatehouse: lined passage walls through the cut, a lintel, towers and the Queen's banners. */
  private buildWestGate(wallMat: THREE.Material | null) {
    const G = WEST_GATE, y = sunspireY();
    const mat = wallMat ?? std(0xc8a070, 0.95);
    const box = (w: number, h: number, d: number, x: number, yy: number, z: number, collide = true) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(w, d) / 4, uv.getY(i) * h / 4);
      mesh.position.set(x, yy, z);
      mesh.castShadow = mesh.receiveShadow = true;
      this.cityDressing.add(mesh);
      if (collide) physics.addBox(mesh.position.clone(), new THREE.Vector3(w / 2, h / 2, d / 2));
    };
    const len = G.x1 - G.x0, mx = (G.x0 + G.x1) / 2;
    // Passage sides (hide the hollow inside the thick walls) and a roof over the passage.
    for (const s of [-1, 1]) box(len, G.top + 0.4, 0.8, mx, y + (G.top + 0.4) / 2, G.z + s * (G.halfW + 0.4));
    box(len, 1.2, G.halfW * 2 + 1.6, mx, y + G.top + 0.6, G.z, false);
    // Two squat towers flanking the outer mouth, with gilded caps.
    const gold = std(0xd4a640, 0.35, 0.8);
    for (const s of [-1, 1]) {
      box(5, 13, 5, G.x0 - 1, y + 6.5, G.z + s * (G.halfW + 3.3));
      const cap = new THREE.Mesh(new THREE.ConeGeometry(3.2, 2.4, 4), gold);
      cap.position.set(G.x0 - 1, y + 14.2, G.z + s * (G.halfW + 3.3));
      cap.rotation.y = Math.PI / 4;
      this.cityDressing.add(cap);
      const ban = buildBanner();
      ban.position.set(G.x0 - 4, y, G.z + s * (G.halfW + 1.2));
      ban.rotation.y = Math.PI;
      this.cityDressing.add(ban);
    }
    box(4, 2.4, G.halfW * 2 + 0.2, G.x0 - 1, y + G.top + 1.2, G.z);
  }

  /** Doors on Ghagrabba's houses, shops, taverns and the palace: found on the street map, set against the real walls by raycast. */
  private placeDoors() {
    this.doorsPlaced = true;
    const y0 = sunspireY();
    const made: Door[] = [];
    const slabGeo = new THREE.BoxGeometry(1.5, 2.6, 0.14);
    slabGeo.translate(0, 1.3, 0);
    const frameGeo = new THREE.BoxGeometry(2.1, 0.35, 0.3);
    frameGeo.translate(0, 2.75, 0);
    const list = cityDoors();
    const slabs = new THREE.InstancedMesh(slabGeo, std(0x5a3a22, 0.85), list.length);
    const frames = new THREE.InstancedMesh(frameGeo, std(0xd4a640, 0.4, 0.6), list.length);
    let n = 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (const d of list) {
      const dir = new THREE.Vector3(d.di, 0, d.dj);
      const start = new THREE.Vector3(d.x, y0 + 1.2, d.z);
      // The palace front is a pylon with an open gateway: its door sits in the gateway itself.
      const hit = d.kind === 'palace' ? 1.5 : physics.castRay(start, dir, 8);
      if (hit === null) continue;
      const wall = start.clone().addScaledVector(dir, hit).setY(y0);
      const step = wall.clone().addScaledVector(dir, -0.8);
      const big = d.kind === 'palace';
      q.setFromAxisAngle(up, d.yaw);
      m4.compose(wall.clone().addScaledVector(dir, -0.06), q, new THREE.Vector3(big ? 2.2 : 1, big ? 1.8 : 1, 1));
      slabs.setMatrixAt(n, m4);
      frames.setMatrixAt(n, m4);
      n++;
      const obj = new THREE.Object3D();
      obj.position.copy(step);
      obj.rotation.y = d.yaw;
      const door = registerDoor(obj, new THREE.Vector3(), { w: big ? 30 : 6.5 + (d.seed % 3), d: big ? 40 : 6 + (d.seed % 2), floors: 1, roof: 'tile', seed: d.seed }, {
        kind: d.kind, name: d.name, keeper: d.keeper, style: d.kind === 'palace' ? undefined : 'desert',
      });
      made.push(door);
    }
    slabs.count = frames.count = n;
    slabs.castShadow = frames.castShadow = true;
    this.cityDressing.add(slabs, frames);
    this.onDoors?.(made);
  }

  /** Palms, the bazaar's stalls, the throne under its canopy, braziers, banners and the gate golems. */
  private dressCity() {
    const rnd = mulberry32(99);
    const cells = streetCells();
    const y0 = sunspireY();
    const at = (i: number, j: number) => {
      const [x, z] = cellWorld(i, j);
      return new THREE.Vector3(x, y0 + Math.max(0, cellTop(i, j)), z);
    };
    // Palms on the wider streets and squares.
    const palm = palmGeometry();
    const palmMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    const spots = cells.filter((c) => c.open > 30 && rnd() < 0.05).slice(0, 90);
    const palms = new THREE.InstancedMesh(palm, palmMat, spots.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    spots.forEach((c, k) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28);
      s.setScalar(0.85 + rnd() * 0.5);
      m4.compose(at(c.i, c.j), q, s);
      palms.setMatrixAt(k, m4);
    });
    palms.castShadow = true;
    this.cityDressing.add(palms);
    // The bazaar's stalls ring its most open square.
    const best = cells.filter((c) => c.i < 184 || c.i > 213 || c.j < 97 || c.j > 123).reduce((a, b) => (b.open > a.open ? b : a));
    const cols = [0x1f7a7a, 0xb8402e, 0xd4a640, 0x5a2a7a, 0xe8dcc0, 0x2a5a8a];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const i = Math.round(best.i + Math.cos(a) * 6), j = Math.round(best.j + Math.sin(a) * 6);
      if (cellTop(i, j) > 1.5 || cellTop(i, j) < 0) continue;
      const stall = buildStall(cols[k % cols.length], rnd);
      stall.position.copy(at(i, j));
      stall.rotation.y = -a + Math.PI / 2;
      this.cityDressing.add(stall);
    }
    // The Court of the Sun: a throne dais before the palace, braziers, banners.
    const courtW = at(186, 110);
    const dais = buildDais();
    dais.position.copy(courtW);
    dais.rotation.y = Math.PI / 2;
    this.cityDressing.add(dais);
    physics.addBox(courtW.clone().setY(courtW.y + 0.3), new THREE.Vector3(3.2, 0.3, 4.2));
    for (const [i, j] of [[190, 100], [190, 120], [200, 100], [200, 120], [210, 100], [210, 120], [244, 108], [244, 122]]) {
      const p = at(i, j);
      const b = buildBrazier();
      b.group.position.copy(p);
      this.cityDressing.add(b.group);
      this.fires.push({ at: p.clone().setY(p.y + 1.25), flame: b.flame });
    }
    for (let k = 0; k < 6; k++) {
      const p = at(222 + k * 4, k % 2 ? 106 : 124);
      const ban = buildBanner();
      ban.position.copy(p);
      this.cityDressing.add(ban);
    }
  }

  // ---- the scavenger camps ---------------------------------------------------------------------------

  private buildCamps() {
    SCAV_CAMPS.forEach(([cx, cz, r], k) => {
      const g = new THREE.Group();
      g.name = 'camp:' + CAMP_INFO[k].name;
      const rnd = mulberry32(300 + k);
      const y = campFloor(cx, cz);
      const huts = k === 5 ? 4 : 6;
      for (let h = 0; h < huts; h++) {
        const a = (h / huts) * Math.PI * 2 + rnd() * 0.4;
        const hx = cx + Math.cos(a) * r * 0.7, hz = cz + Math.sin(a) * r * 0.7;
        const hut = rnd() < 0.5 ? buildShack(rnd) : buildLeanTo(rnd);
        hut.position.set(hx, y, hz);
        hut.rotation.y = -a - Math.PI / 2;
        g.add(hut);
        physics.addBox(new THREE.Vector3(hx, y + 1.2, hz), new THREE.Vector3(1.6, 1.2, 1.4), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), hut.rotation.y));
      }
      // Junk: barrels, crates, a scrap heap or two.
      for (let j = 0; j < 14; j++) {
        const a = rnd() * 6.28, d = 4 + rnd() * r * 0.6;
        const o = rnd() < 0.5 ? barrel(rnd) : crate(rnd);
        o.position.set(cx + Math.cos(a) * d, y, cz + Math.sin(a) * d);
        o.rotation.y = rnd() * 6;
        g.add(o);
      }
      // A fire at the middle.
      const fire = buildCampfire();
      fire.group.position.set(cx, y, cz);
      g.add(fire.group);
      this.fires.push({ at: new THREE.Vector3(cx, y + 0.5, cz), flame: fire.flame });
      if (k === 4) {
        // The Hulks: wrecked sand-skiffs, half buried.
        for (let w = 0; w < 3; w++) {
          const a = (w / 3) * 6.28 + 0.6;
          const skiff = buildSkiff();
          skiff.position.set(cx + Math.cos(a) * r * 0.55, y - 0.5, cz + Math.sin(a) * r * 0.55);
          skiff.rotation.set(0.12 * (w - 1), a, 0.3 * (w % 2 ? 1 : -1));
          g.add(skiff);
        }
      }
      if (!CAMP_INFO[k].friendly) {
        // Raider camps: bone pikes and a red rag on a pole at the entrance.
        for (let b = 0; b < 5; b++) {
          const a = (b / 5) * 6.28 + 0.3;
          const pike = buildPike(rnd);
          pike.position.set(cx + Math.cos(a) * (r + 2), y, cz + Math.sin(a) * (r + 2));
          g.add(pike);
        }
        const ban = buildBanner();
        ban.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
          if (m && m.color && m.color.getHex() === 0x1f7a7a) (o as THREE.Mesh).material = std(0x7a1a10, 0.95);
        });
        ban.position.set(cx + r * 0.3, y, cz - r * 0.3);
        g.add(ban);
      } else {
        // Friendly villages: awnings over the trading spot, water jars.
        const awn = buildStall(0xb8a07a, rnd);
        awn.position.set(cx - 4, y, cz - 3);
        awn.rotation.y = 0.4;
        g.add(awn);
      }
      if (k === 5 || k === 2 || CAMP_INFO[k].friendly) {
        const well = buildWell();
        well.position.set(cx + 6, y, cz - 4);
        g.add(well);
        physics.addCylinder(new THREE.Vector3(cx + 6, y + 0.5, cz - 4), 0.5, 1.3);
      }
      g.visible = false;
      this.group.add(g);
      this.camps.push(g);
    });
  }

  private buildInteractables() {
    // Scrap heaps at the Hulks and the Bone Wells: dig for scrap (and sometimes better).
    const heaps: THREE.Vector3[] = [];
    for (const k of [4, 2]) {
      const [cx, cz, r] = SCAV_CAMPS[k];
      for (let h = 0; h < 4; h++) {
        const a = (h / 4) * 6.28 + 0.3;
        const x = cx + Math.cos(a) * r * 0.35, z = cz + Math.sin(a) * r * 0.35;
        const p = new THREE.Vector3(x, campFloor(cx, cz), z);
        heaps.push(p);
        const heap = buildScrapHeap(mulberry32(k * 10 + h));
        heap.position.copy(p);
        this.camps[k].add(heap);
      }
    }
    this.digCount = heaps.length;
    heaps.forEach((p, i) => {
      this.interactables.push({
        pos: p, radius: 2.2,
        label: () => (this.dug(i) ? 'Picked clean (for today)' : 'Dig through the scrap'),
        enabled: () => !this.dug(i) && !this.campHostile(p),
        action: () => {
          this.hooks.flags['dug:' + i] = Math.floor(this.time / 600);
          const roll = Math.random();
          this.hooks.give('scrapMetal', 1 + Math.floor(Math.random() * 2));
          if (roll < 0.25) this.hooks.give('duneGlass', 1);
          else if (roll < 0.33) this.hooks.give('sharkTooth', 1);
          this.fx.add.spawn({ pos: p.clone().setY(p.y + 0.5), spread: 1, count: 14, life: [0.4, 0.9], size: [0.15, 0.04], color: 0xd9b77a, color2: 0x8a6a3a, gravity: 8, upBias: 0.6 });
          this.hooks.toast('You pull scrap from the heap.');
        },
      });
    });
  }

  private dug(i: number) {
    return this.hooks.flags['dug:' + i] === Math.floor(this.time / 600);
  }

  private campHostile(p: THREE.Vector3) {
    return this.raiders.some((r) => r.list.some((b) => b.alive) && Math.hypot(p.x - SCAV_CAMPS[r.camp][0], p.z - SCAV_CAMPS[r.camp][1]) < SCAV_CAMPS[r.camp][2] + 10);
  }

  /** Raiders hold the hostile camps; they come back a while after being driven off. */
  private updateRaiders(dt: number, player: Player) {
    for (const r of this.raiders) {
      const [cx, cz, cr] = SCAV_CAMPS[r.camp];
      const d = Math.hypot(player.pos.x - cx, player.pos.z - cz);
      if (!r.list.length && d < 160 && d > cr + 25 && this.time - r.clearedAt > 480) {
        const y = campFloor(cx, cz);
        const n = r.camp === 1 ? 6 : 4 + (r.camp % 3);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * 6.28;
          const role = (r.camp === 1 || r.camp === 12) && i === 0 ? 'chief' : i % 3 === 2 ? 'crossbow' : 'sword';
          const b = new Bandit(role, new THREE.Vector3(cx + Math.cos(a) * cr * 0.4, y, cz + Math.sin(a) * cr * 0.4), this.scene, this.bolts, undefined, RAIDER_LOOKS[i % RAIDER_LOOKS.length]);
          b.kind = role === 'chief' ? 'scavengerChief' : 'scavenger';
          b.name = role === 'chief' ? (r.camp === 1 ? 'Vash, Queen of Glasswind' : 'Gnasher, the Scrap King') : role === 'crossbow' ? 'Scavenger Bolt-thrower' : 'Scavenger Raider';
          r.list.push(b);
        }
      }
      for (const b of r.list) b.update(dt, player);
      const gone = r.list.filter((b) => b.dead);
      for (const b of gone) b.dispose();
      const before = r.list.length;
      r.list = r.list.filter((b) => !b.dead);
      if (before && !r.list.length) r.clearedAt = this.time;
      // Far away: pack them up.
      if (d > 320 && r.list.length) {
        for (const b of r.list) b.dispose();
        r.list = [];
      }
    }
    this.bolts.update(dt, player);
  }

  // ---- creatures -------------------------------------------------------------------------------------

  private sheltered = (p: THREE.Vector3) => sunspirePad(p.x, p.z) > 0.3 || SCAV_CAMPS.some(([cx, cz, r]) => Math.hypot(p.x - cx, p.z - cz) < r + 12);

  private updateCreatures(dt: number, player: Player) {
    const p = player.pos;
    // Sharks: up to five near the player, each from its own home.
    this.sharkHomes.forEach((h, i) => {
      const d = Math.hypot(p.x - h.x, p.z - h.z);
      const s = this.sharks.get(i);
      if (!s && d < 260 && this.sharks.size < 5 && (this.respawn.get('s' + i) ?? 0) < this.time) this.sharks.set(i, new SandShark(h.clone().setY(heightAt(h.x, h.z)), this.scene, this.fx));
      if (s && (d > 420 || s.dead)) {
        if (s.dead) this.respawn.set('s' + i, this.time + 300);
        s.dispose();
        this.sharks.delete(i);
      }
    });
    for (const s of this.sharks.values()) s.update(dt, player, this.sheltered);
    this.rayHomes.forEach((h, i) => {
      const d = Math.hypot(p.x - h.x, p.z - h.z);
      const r = this.rays.get(i);
      if (!r && d < 120 && this.rays.size < 6 && (this.respawn.get('r' + i) ?? 0) < this.time) this.rays.set(i, new SandRay(h.clone().setY(heightAt(h.x, h.z)), this.scene, this.fx));
      if (r && (d > 200 || r.dead)) {
        if (r.dead) this.respawn.set('r' + i, this.time + 240);
        r.dispose();
        this.rays.delete(i);
      }
    });
    for (const r of this.rays.values()) r.update(dt, player, this.sheltered);
    this.podHomes.forEach((h, i) => {
      const d = Math.hypot(p.x - h.x, p.z - h.z);
      let pod = this.pods.get(i);
      if (!pod && d < 420) this.pods.set(i, (pod = new DolphinPod(h.clone(), 34 + i * 4, 4 + (i % 3), this.scene, this.fx)));
      if (pod && d > 560) {
        pod.dispose();
        this.pods.delete(i);
      }
    });
    for (const pod of this.pods.values()) pod.update(dt);
    for (const c of this.creatures) c.update(dt, player, this.time, this.sheltered);
    this.riders.update(dt, player, this.time, this.sheltered);
    for (const b of this.loose) b.update(dt, player);
    for (const b of this.loose.filter((b) => b.dead)) b.dispose();
    this.loose = this.loose.filter((b) => !b.dead && b.position.distanceTo(p) < 300);
    // Trader caravans.
    this.nearCaravan = null;
    for (const c of this.caravans) {
      const d = c.pos.distanceTo(p);
      c.setVisible(d < 900);
      if (d < 900) c.update(dt, p);
      if (d < 9) this.nearCaravan = c;
    }
    if (this.nearCaravan) this.interactables[this.interactables.length - 1 - this.digCount].pos.copy(this.nearCaravan.pos);
    // The Warden: asleep under the southern sand until you walk over it.
    if (!this.hooks.flags.wardenDead) {
      const d = Math.hypot(p.x - WARDEN_AT.x, p.z - WARDEN_AT.z);
      if (!this.warden && d < 200) {
        this.warden = new SandGolem(WARDEN_AT, this.scene, this.fx);
        this.warden.onWake = () => this.hooks.card('The Warden of the Sands', 'It was never a rock');
        this.warden.onDeath = () => {
          this.hooks.flags.wardenDead = true;
          this.hooks.bossBar(null);
          this.hooks.card('The Warden Falls', 'The sand takes it back');
          this.hooks.give('duneGlass', 4);
          this.hooks.give('sunSilk', 1);
          this.hooks.save();
        };
      }
      const w = this.warden;
      if (w) {
        w.update(dt, player);
        const engaged = w.alive && w.awake && d < 80;
        if (engaged) this.hooks.bossBar(w, w.name);
        else if (this.wardenShown) this.hooks.bossBar(null);
        this.wardenShown = engaged;
        if (w.alive && w.awake && (player.dead || d > 120)) w.reset();
        if (d > 320) {
          w.dispose();
          this.warden = null;
        }
      }
    } else if (this.warden) {
      this.warden.update(dt, player);
      if (this.warden.dead) {
        this.warden.dispose();
        this.warden = null;
      }
    }
    for (const w of this.whales) {
      const d = Math.hypot(p.x - w.center.x, p.z - w.center.z);
      w.setVisible(d < 1800);
      if (d < 1800) w.update(dt);
    }
    // Old Sawtooth.
    if (!this.hooks.flags.sawtoothDead) {
      const d = Math.hypot(p.x - SAWTOOTH_BASIN.x, p.z - SAWTOOTH_BASIN.z);
      if (!this.boss && d < 260) {
        this.boss = new SandShark(SAWTOOTH_BASIN.clone().setY(heightAt(SAWTOOTH_BASIN.x, SAWTOOTH_BASIN.z)), this.scene, this.fx, { boss: true, scale: 2.4, hp: 1400, damage: 34, name: 'Old Sawtooth', kind: 'sawtooth' });
        this.boss.onAggro = () => {
          sfx.roar(0.9);
          this.hooks.card('Old Sawtooth', 'The oldest hunter in the sand');
        };
      }
      const b = this.boss;
      if (b) {
        b.update(dt, player, () => false);
        const engaged = b.alive && d < 90;
        if (engaged) this.hooks.bossBar(b, b.name);
        else if (this.bossShown) this.hooks.bossBar(null);
        this.bossShown = engaged;
        if (player.dead) b.reset();
        if (!b.alive && !this.hooks.flags.sawtoothDead) {
          this.hooks.flags.sawtoothDead = true;
          this.hooks.bossBar(null);
          this.hooks.card('Old Sawtooth Is Dead', 'The basin falls still');
          this.hooks.give('sharkTooth', 3);
          this.hooks.save();
        }
        if (d > 420 && b.alive) {
          b.dispose();
          this.boss = null;
        }
      }
    }
  }

  // ---- per frame ---------------------------------------------------------------------------------------

  update(dt: number, player: Player) {
    this.time += dt;
    this.t += dt;
    const p = player.pos;
    if (!this.visible) return;
    if (!this.city && !this.cityLoading && this.near(p, 2600)) void this.loadCity();
    if (this.city) this.city.visible = this.near(p, 3200);
    this.cityDressing.visible = this.near(p, 900);
    this.camps.forEach((c, k) => (c.visible = Math.hypot(p.x - SCAV_CAMPS[k][0], p.z - SCAV_CAMPS[k][1]) < 700));
    if (this.city && !this.doorsPlaced && this.time - this.cityLoadedAt > 1) this.placeDoors();
    this.updateStorm(dt, player);
    if (p.x > -1600) return; // nothing out here is awake
    this.updateCreatures(dt, player);
    this.updateRaiders(dt, player);
    // Fires: lit from dusk, and the braziers in the court all night.
    const h = this.hour();
    const lit = h >= 18 || h < 6.5;
    for (const f of this.fires) {
      f.flame.visible = lit;
      if (lit && f.at.distanceToSquared(p) < 160 * 160 && Math.random() < dt * 14) this.fx.add.spawn({ pos: f.at, vel: new THREE.Vector3(0, 1.8, 0), spread: 0.3, count: 1, life: [0.3, 0.6], size: [0.35, 0.06], color: 0xffc060, color2: 0xff3a00, upBias: 1.5 });
      if (lit) f.flame.scale.y = 0.85 + Math.sin(this.time * 13 + f.at.x) * 0.15;
    }
  }

  // ---- the sandstorm ---------------------------------------------------------------------------------

  /** In the Expanse proper (where storms blow)? */
  private inDesert(p: THREE.Vector3) {
    return p.x < -2300 && (sandWeight(p.x, p.z) > 0.25 || sunspirePad(p.x, p.z) > 0);
  }

  private updateStorm(dt: number, player: Player) {
    const p = player.pos;
    const here = this.inDesert(p);
    if (this.stormLeft > 0) this.stormLeft -= dt;
    else if (here) {
      this.stormNext -= dt;
      if (this.stormNext <= 0) this.startStorm();
    }
    const want = this.stormLeft > 0 && here ? 1 : 0;
    this.storm += Math.sign(want - this.storm) * Math.min(Math.abs(want - this.storm), dt / 7);
    this.stormOverlay.style.opacity = (this.storm * 0.62).toFixed(3);
    this.stormOverlay.style.display = this.storm > 0.005 ? 'block' : 'none';
    // Sand streaming past the camera.
    if (this.storm > 0.05) {
      const n = Math.random() < dt * 60 * this.storm ? 6 : 0;
      for (let k = 0; k < n; k++) {
        const at = p.clone().add(new THREE.Vector3(-14 + Math.random() * 6, 0.3 + Math.random() * 4, (Math.random() - 0.5) * 24));
        this.fx.add.spawn({ pos: at, vel: new THREE.Vector3(26, -0.5, 4), spread: 1, count: 1, life: [0.8, 1.4], size: [0.9, 0.3], color: 0xc8a26a, color2: 0x9a7a4a, alpha: 0.5, drag: 0.1 });
      }
    }
  }

  /** Start a storm now (also used by tests and the console). */
  startStorm(seconds = 70 + Math.random() * 60) {
    this.stormLeft = seconds;
    this.stormNext = 260 + Math.random() * 420;
    this.hooks.toast('The horizon turns brown. A sandstorm is coming — find shelter or keep your head down.');
    sfx.rumble(3, 0.5);
  }

  /** After the sky is applied: the storm swallows the view. */
  atmosphere(r: { post?: { finalMat: THREE.ShaderMaterial } | null; scene: THREE.Scene }) {
    const k = this.storm;
    if (k <= 0.001) return;
    const sand = new THREE.Color(0.74, 0.56, 0.34);
    const u = r.post?.finalMat.uniforms;
    if (u) {
      u.uHaze.value += k * 0.07;
      (u.uHazeColor.value as THREE.Color).lerp(sand, k);
      (u.uSunColor.value as THREE.Color).lerp(sand, k * 0.8);
      u.uMist.value = Math.max(u.uMist.value, k * 0.9);
      u.uClouds.value *= 1 - k;
    } else if (r.scene.fog instanceof THREE.Fog) {
      r.scene.fog.color.lerp(sand, k);
      r.scene.fog.far = THREE.MathUtils.lerp(r.scene.fog.far, 24, k);
    }
  }

  setVisible(v: boolean) {
    this.visible = v;
    for (const c of this.caravans) c.setVisible(v && false);
    this.group.visible = v;
    for (const w of this.whales) w.setVisible(v && false);
    if (!v) {
      for (const s of this.sharks.values()) s.dispose();
      this.sharks.clear();
      for (const r of this.rays.values()) r.dispose();
      this.rays.clear();
      for (const pod of this.pods.values()) pod.dispose();
      this.pods.clear();
      this.boss?.dispose();
      this.boss = null;
      this.hooks.bossBar(null);
      for (const r of this.raiders) {
        for (const b of r.list) b.dispose();
        r.list = [];
      }
      this.bolts.clear();
      for (const c of this.creatures) c.clear();
      this.riders.clear();
      for (const b of this.loose) b.dispose();
      this.loose = [];
      this.warden?.dispose();
      this.warden = null;
      this.storm = 0;
      this.stormOverlay.style.display = 'none';
    }
  }

  /** Debug and tests: is the city in? */
  get cityLoaded() {
    return !!this.city;
  }
  get creatureCounts() {
    return {
      sharks: this.sharks.size, rays: this.rays.size, pods: this.pods.size, boss: !!this.boss, raiders: this.raiders.reduce((n, r) => n + r.list.length, 0),
      eels: this.creatures[0].live.size, crabs: this.creatures[1].live.size, jellies: this.creatures[2].live.size, riders: this.riders.live.size, warden: this.warden ? (this.warden.awake ? 'awake' : 'asleep') : 'none', doors: this.doorsPlaced,
    };
  }
  /** Is a world point inside the walled city? (for the region card and the map) */
  inCity(x: number, z: number) {
    const [i, j] = worldCell(x, z);
    return cellTop(i, j) >= 0;
  }
  get collider() {
    return this.cityCollider;
  }
}

// ---- builders -------------------------------------------------------------------------------------------

function colored(g: THREE.BufferGeometry, color: number) {
  const n = g.index ? g.toNonIndexed() : g;
  n.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const arr = new Float32Array(n.getAttribute('position').count * 3);
  for (let i = 0; i < arr.length; i += 3) (arr[i] = c.r), (arr[i + 1] = c.g), (arr[i + 2] = c.b);
  n.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return n;
}

/** A date palm: a leaning ringed trunk and a crown of drooping fronds (one geometry). */
function palmGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const H = 7.5;
  let x = 0, y = 0;
  for (let k = 0; k < 8; k++) {
    const seg = new THREE.CylinderGeometry(0.2 - k * 0.012, 0.24 - k * 0.012, H / 8, 7);
    const lean = 0.035 * k;
    seg.rotateZ(-lean);
    seg.translate(x, y + H / 16, 0);
    parts.push(colored(seg, k % 2 ? 0x8a6a46 : 0x7a5a3a));
    x += Math.sin(lean) * (H / 8);
    y += Math.cos(lean) * (H / 8);
  }
  for (let f = 0; f < 9; f++) {
    const a = (f / 9) * Math.PI * 2;
    const frond = new THREE.PlaneGeometry(0.7, 3.4, 1, 4);
    const pos = frond.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) + 1.7) / 3.4;
      pos.setZ(i, -t * t * 1.6);
      pos.setX(i, pos.getX(i) * (1 - t * 0.7));
    }
    frond.translate(0, 1.7, 0);
    frond.rotateX(-Math.PI / 2 + 0.5);
    frond.rotateY(a);
    frond.translate(x, y, 0);
    parts.push(colored(frond, f % 2 ? 0x4a7a2a : 0x5a8a34));
  }
  for (let d = 0; d < 5; d++) {
    const dates = new THREE.SphereGeometry(0.18, 6, 4);
    dates.translate(x + Math.cos(d) * 0.3, y - 0.3, Math.sin(d) * 0.3);
    parts.push(colored(dates, 0x8a3a1a));
  }
  return mergeGeometries(parts)!;
}

function buildStall(color: number, rnd: () => number) {
  const g = new THREE.Group();
  const wood = std(0x6a4a2a);
  for (const [x, z] of [[-1.3, -0.9], [1.3, -0.9], [-1.3, 0.9], [1.3, 0.9]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.4, 6), wood);
    post.position.set(x, 1.2, z);
    g.add(post);
  }
  const awning = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.2, 6, 1), new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide }));
  awning.rotation.x = -Math.PI / 2 + 0.25;
  awning.position.y = 2.4;
  g.add(awning);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 0.8), wood);
  counter.position.set(0, 0.45, 0.4);
  g.add(counter);
  const goods = [0xd4a640, 0xb8402e, 0x1f9a9a, 0xe8dcc0, 0x8a5a2a];
  for (let k = 0; k < 6; k++) {
    const item = rnd() < 0.5 ? new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), std(goods[k % goods.length], 0.5)) : new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.3, 8), std(goods[(k + 2) % goods.length], 0.4, 0.3));
    item.position.set(-1 + k * 0.4, 1.0, 0.4 + (rnd() - 0.5) * 0.3);
    g.add(item);
  }
  g.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true)));
  return g;
}

function buildDais() {
  const g = new THREE.Group();
  const stone = std(0xe8d2a0, 0.8), gold = std(0xd4a640, 0.35, 0.8), teal = new THREE.MeshStandardMaterial({ color: 0x1f7a7a, roughness: 0.9, side: THREE.DoubleSide });
  for (let k = 0; k < 3; k++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(8.4 - k * 1.4, 0.25, 6.4 - k * 1.2), stone);
    step.position.y = 0.125 + k * 0.25;
    g.add(step);
  }
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 1.1), gold);
  seat.position.set(0, 1.05, -0.8);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 0.2), gold);
  back.position.set(0, 1.85, -1.3);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.08, 24), gold);
  disc.rotation.x = Math.PI / 2;
  disc.position.set(0, 3.2, -1.38);
  g.add(seat, back, disc);
  for (const [x, z] of [[-3, -2.4], [3, -2.4], [-3, 2.4], [3, 2.4]]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 4.4, 10), stone);
    col.position.set(x, 2.2 + 0.75, z);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.22, 0.3, 10), gold);
    cap.position.set(x, 5.3, z);
    g.add(col, cap);
  }
  const canopy = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 5.4, 4, 4), teal);
  canopy.rotation.x = -Math.PI / 2;
  canopy.position.y = 5.5;
  g.add(canopy);
  g.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true)));
  return g;
}

function buildBrazier() {
  const group = new THREE.Group();
  const bronze = std(0x8a5a2a, 0.5, 0.7);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, 1.0, 8), bronze);
  stand.position.y = 0.5;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.25, 0.3, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.5, metalness: 0.7, side: THREE.DoubleSide }));
  bowl.position.y = 1.1;
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 8), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85 }));
  flame.position.y = 1.55;
  group.add(stand, bowl, flame);
  return { group, flame };
}

function buildBanner() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 7, 6), std(0xd4a640, 0.4, 0.7));
  pole.position.y = 3.5;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 3.6), new THREE.MeshStandardMaterial({ color: 0x1f7a7a, roughness: 0.9, side: THREE.DoubleSide }));
  cloth.position.set(0.7, 4.8, 0);
  const sun = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), new THREE.MeshStandardMaterial({ color: 0xd4a640, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }));
  sun.position.set(0.7, 5.4, 0.01);
  g.add(pole, cloth, sun);
  return g;
}

/** A scrap shack: crooked walls of mismatched plate under a sagging roof sheet. */
function buildShack(rnd: () => number) {
  const g = new THREE.Group();
  const plates = [0x8a5a3a, 0x6a6a6a, 0x7a4a2a, 0x5a5a50, 0x9a7a5a];
  const W = 3 + rnd(), D = 2.6 + rnd() * 0.6, H = 2.2 + rnd() * 0.4;
  for (const [x, z, w, d] of [[0, -D / 2, W, 0.08], [0, D / 2, W, 0.08], [-W / 2, 0, 0.08, D], [W / 2, 0, 0.08, D]] as [number, number, number, number][]) {
    const n = Math.max(1, Math.round(Math.max(w, d) / 0.9));
    for (let k = 0; k < n; k++) {
      // The front wall keeps a doorway gap.
      if (z > 0 && w > 1 && k === Math.floor(n / 2)) continue;
      const pw = Math.max(w, d) / n;
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w > d ? pw : 0.08, H * (0.9 + rnd() * 0.15), w > d ? 0.08 : pw), std(plates[Math.floor(rnd() * plates.length)], 0.8, 0.4));
      const off = -Math.max(w, d) / 2 + pw * (k + 0.5);
      panel.position.set(w > d ? off : x, (H * 0.95) / 2, w > d ? z : off);
      panel.rotation.z = (rnd() - 0.5) * 0.05;
      g.add(panel);
    }
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.06, D + 0.6), std(0x7a6a5a, 0.7, 0.5));
  roof.position.y = H + 0.1;
  roof.rotation.x = 0.12;
  g.add(roof);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1, H * 0.85), new THREE.MeshStandardMaterial({ color: [0x8a3a2a, 0x2a6a6a, 0xa88a50][Math.floor(rnd() * 3)], roughness: 0.95, side: THREE.DoubleSide }));
  cloth.position.set(0, (H * 0.85) / 2, D / 2 + 0.02);
  g.add(cloth);
  g.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true)));
  return g;
}

/** A lean-to: a patched tarp over two poles, guy-roped to the sand. */
function buildLeanTo(rnd: () => number) {
  const g = new THREE.Group();
  const wood = std(0x6a4a2a);
  for (const x of [-1.6, 1.6]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.2, 6), wood);
    pole.position.set(x, 1.1, 1);
    g.add(pole);
  }
  const tarp = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.8, 6, 4), new THREE.MeshStandardMaterial({ color: [0xb8a07a, 0x8a6a4a, 0x7a8a7a, 0xa85a3a][Math.floor(rnd() * 4)], roughness: 0.95, side: THREE.DoubleSide }));
  const pos = tarp.geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / 3.6) * Math.PI * 2) * 0.06 - Math.abs(pos.getY(i)) * 0.03);
  tarp.geometry.computeVertexNormals();
  tarp.rotation.x = -0.95;
  tarp.position.set(0, 1.15, -0.05);
  g.add(tarp);
  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, 0.8), std(0x8a7a5a, 0.95));
  bed.position.set(0, 0.08, -0.3);
  g.add(bed);
  g.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true)));
  return g;
}

function barrel(rnd: () => number) {
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.35, 0.9, 10), std(rnd() < 0.5 ? 0x6a4a2a : 0x5a5a5a, 0.8, rnd() < 0.5 ? 0 : 0.5));
  b.position.y = 0.45;
  const g = new THREE.Group();
  g.add(b);
  return g;
}

function crate(rnd: () => number) {
  const s = 0.5 + rnd() * 0.4;
  const c = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), std(0x8a6a3a, 0.9));
  c.position.y = s / 2;
  const g = new THREE.Group();
  g.add(c);
  return g;
}

function buildCampfire() {
  const group = new THREE.Group();
  const wood = std(0x4a3020);
  for (let k = 0; k < 5; k++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 6), wood);
    const a = (k / 5) * 6.28;
    log.position.set(Math.cos(a) * 0.25, 0.25, Math.sin(a) * 0.25);
    log.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
    group.add(log);
  }
  for (let k = 0; k < 9; k++) {
    const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18, 0), std(0x6a6058));
    const a = (k / 9) * 6.28;
    st.position.set(Math.cos(a) * 0.85, 0.06, Math.sin(a) * 0.85);
    group.add(st);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1, 8), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85 }));
  flame.position.y = 0.6;
  group.add(flame);
  return { group, flame };
}

/** A wrecked sand-skiff: a half hull on its side with a broken mast and a rag of sail. */
function buildSkiff() {
  const g = new THREE.Group();
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(new THREE.Vector2(Math.sin(t * Math.PI) * 1.6 + 0.05, (t - 0.5) * 9));
  }
  const hull = new THREE.Mesh(new THREE.LatheGeometry(pts, 12, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9, side: THREE.DoubleSide }));
  hull.rotation.set(Math.PI / 2, 0, Math.PI);
  hull.position.y = 1.1;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5, 6), std(0x5a4028));
  mast.position.set(0.3, 3, 0.5);
  mast.rotation.z = 0.5;
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.6, 3, 3), new THREE.MeshStandardMaterial({ color: 0xc8b088, roughness: 0.95, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }));
  sail.position.set(1.2, 3.6, 0.6);
  sail.rotation.set(0.1, 0.4, 0.5);
  g.add(hull, mast, sail);
  g.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true)));
  return g;
}

function buildWell() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 0.9, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0xb89a6a, roughness: 0.95, side: THREE.DoubleSide }));
  ring.position.y = 0.45;
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.1, 14), new THREE.MeshStandardMaterial({ color: 0x2a6a7a, roughness: 0.15, metalness: 0.2 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.3;
  const wood = std(0x5a4028);
  for (const x of [-1.1, 1.1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2, 6), wood);
    post.position.set(x, 1, 0);
    g.add(post);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), wood);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 1.9;
  g.add(ring, water, bar);
  return g;
}

function buildScrapHeap(rnd: () => number) {
  const g = new THREE.Group();
  const cols = [0x8a5a3a, 0x6a6a6a, 0x7a4a2a, 0x5a5a50, 0xa08060];
  for (let k = 0; k < 10; k++) {
    const m = new THREE.Mesh(rnd() < 0.5 ? new THREE.BoxGeometry(0.4 + rnd() * 0.7, 0.06, 0.3 + rnd() * 0.6) : new THREE.CylinderGeometry(0.08, 0.08, 0.6 + rnd(), 6), std(cols[k % cols.length], 0.8, 0.5));
    m.position.set((rnd() - 0.5) * 1.4, 0.1 + rnd() * 0.5, (rnd() - 0.5) * 1.4);
    m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    g.add(m);
  }
  const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), std(0xc8a670, 1));
  mound.scale.set(1.1, 0.35, 1.1);
  g.add(mound);
  return g;
}

// ---- the west gate cut ------------------------------------------------------------------------------

type Vtx = number[]; // x y z nx ny nz u v

/**
 * Cut the west gate's passage out of the city model: triangles crossing the
 * passage box are split along its faces and the pieces inside it dropped
 * (the ground under it is left alone; the terrain pad is there).
 */
function cutWestGate(P: Float32Array, N: Float32Array | null, U: Float32Array | null, idx: ArrayLike<number>, base: number) {
  const G = WEST_GATE;
  const box = { x0: G.x0, x1: G.x1, z0: G.z - G.halfW, z1: G.z + G.halfW, y0: base + 0.35, y1: base + G.top };
  const vtx = (i: number): Vtx => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2], N ? N[i * 3] : 0, N ? N[i * 3 + 1] : 1, N ? N[i * 3 + 2] : 0, U ? U[i * 2] : 0, U ? U[i * 2 + 1] : 0];
  const outP: number[] = Array.from(P), outN: number[] = N ? Array.from(N) : [], outU: number[] = U ? Array.from(U) : [];
  const outI: number[] = [];
  let touched = false;
  const inBox = (poly: Vtx[]) => {
    let x = 0, y = 0, z = 0;
    for (const v of poly) (x += v[0]), (y += v[1]), (z += v[2]);
    x /= poly.length; y /= poly.length; z /= poly.length;
    return x > box.x0 && x < box.x1 && z > box.z0 && z < box.z1 && y > box.y0 && y < box.y1;
  };
  const split = (poly: Vtx[], axis: number, val: number): [Vtx[], Vtx[]] => {
    const a: Vtx[] = [], b: Vtx[] = [];
    for (let k = 0; k < poly.length; k++) {
      const p = poly[k], q = poly[(k + 1) % poly.length];
      const dp = p[axis] - val, dq = q[axis] - val;
      if (dp <= 0) a.push(p);
      if (dp >= 0) b.push(p);
      if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
        const t = dp / (dp - dq);
        const r = p.map((c, i) => c + (q[i] - c) * t);
        a.push(r);
        b.push(r);
      }
    }
    return [a, b];
  };
  for (let t = 0; t < idx.length; t += 3) {
    const ia = idx[t], ib = idx[t + 1], ic = idx[t + 2];
    const xs = [P[ia * 3], P[ib * 3], P[ic * 3]], ys = [P[ia * 3 + 1], P[ib * 3 + 1], P[ic * 3 + 1]], zs = [P[ia * 3 + 2], P[ib * 3 + 2], P[ic * 3 + 2]];
    const hit = Math.max(...xs) > box.x0 && Math.min(...xs) < box.x1 && Math.max(...zs) > box.z0 && Math.min(...zs) < box.z1 && Math.max(...ys) > box.y0 && Math.min(...ys) < box.y1;
    if (!hit) {
      outI.push(ia, ib, ic);
      continue;
    }
    touched = true;
    let pieces: Vtx[][] = [[vtx(ia), vtx(ib), vtx(ic)]];
    for (const [axis, val] of [[0, box.x0], [0, box.x1], [2, box.z0], [2, box.z1], [1, box.y0], [1, box.y1]] as [number, number][]) {
      const next: Vtx[][] = [];
      for (const poly of pieces) {
        const [a, b] = split(poly, axis, val);
        if (a.length >= 3) next.push(a);
        if (b.length >= 3) next.push(b);
      }
      pieces = next;
    }
    for (const poly of pieces) {
      if (inBox(poly)) continue;
      const start = outP.length / 3;
      for (const v of poly) {
        outP.push(v[0], v[1], v[2]);
        if (N) outN.push(v[3], v[4], v[5]);
        if (U) outU.push(v[6], v[7]);
      }
      for (let k = 1; k + 1 < poly.length; k++) outI.push(start, start + k, start + k + 1);
    }
  }
  if (!touched) return { P, N, U, idx: Uint32Array.from(idx) };
  return { P: new Float32Array(outP), N: N ? new Float32Array(outN) : null, U: U ? new Float32Array(outU) : null, idx: new Uint32Array(outI) };
}

/** A pike of bleached bones and a shark skull: raider camps mark their ground with these. */
function buildPike(rnd: () => number) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.6, 5), std(0x5a4028));
  pole.position.y = 1.3;
  pole.rotation.z = (rnd() - 0.5) * 0.15;
  const skull = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.8, 5), std(0xe8dcc0, 0.7));
  skull.rotation.x = Math.PI / 2;
  skull.position.y = 2.65;
  const rag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.7), new THREE.MeshStandardMaterial({ color: 0x7a1a10, side: THREE.DoubleSide, roughness: 1 }));
  rag.position.set(0.22, 2.1, 0);
  g.add(pole, skull, rag);
  return g;
}
