import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { compressedGltf } from '../../core/gltf';
import { mulberry32 } from '../../core/math';
import { physics } from '../../physics/physics';
import { heightAt, roadDist } from '../terrainHeight';
import { sandWeight } from '../worldMap';
import { WAYSTONES } from '../kingsRoad';
import { sfx } from '../../audio/sfx';
import { SUNSPIRE, SUNSPIRE_HALF, SUNSPIRE_GATE_Z, SCAV_CAMPS, sunspirePad, sunspireY, campFloor } from './desertLayout';
import { MODEL, cellWorld, streetCells, worldCell, cellTop } from './cityGrid';
import { SandShark, SandRay, DolphinPod, SandWhale } from '../../enemies/sandCreatures';
import { Bandit, Bolts } from '../../enemies/bandit';
import type { FX } from '../../fx/particles';
import type { Player } from '../../player/player';
import type { Interactable } from '../../dungeon/instance';
import type { Look } from '../../npc/charBuilder';

// The Golden Expanse (the map's desert, west-south-west of Elder Glen):
// Sunspire, the walled gold city of the Sunborn, streamed in as the player
// nears it; scavenger camps of scrap and tarp in the dunes around it, some
// friendly and some raiders; and the sand-sea's creatures — sharks, rays,
// dolphin pods, whales, and Old Sawtooth in his basin.

/** Sunspire's waystones: at the east gate and at the Waystop. */
const GATE_X = SUNSPIRE.x + SUNSPIRE_HALF.x + 30;
WAYSTONES.push(
  { id: 'sunspire', name: 'Sunspire (East Gate)', pos: new THREE.Vector3(GATE_X + 6, 0, SUNSPIRE_GATE_Z + 14) },
  { id: 'waystop', name: 'The Waystop (Caravan Way)', pos: new THREE.Vector3(SCAV_CAMPS[5][0] + 10, 0, SCAV_CAMPS[5][1] - 16) },
);

/** Where Old Sawtooth hunts: a dune basin south of the caravan way. */
export const SAWTOOTH_BASIN = new THREE.Vector3(-4740, 0, 1700);

const CAMP_NAMES = ['The Rust Market', 'Glasswind', 'The Bone Wells', 'Saltreach', 'The Hulks', 'The Waystop'];
const HOSTILE_CAMPS = [1, 2, 3, 4];

const RAIDER_LOOKS: Look[] = [
  { body: 'male', outfit: 'ranger', hood: true, hair: 'buzzed', beard: true, hairColor: 0x2a1a10, skin: 0x8a5a3a, cloth: 0x5a4030, linen: 0x7a6a50, bracers: true, height: 1.78 },
  { body: 'female', outfit: 'ranger', hood: true, hair: 'long', hairColor: 0x1a1410, skin: 0xa8744e, cloth: 0x6a3a2a, linen: 0x8a7a60, height: 1.68 },
  { body: 'male', outfit: 'ranger', hood: false, hair: 'buzzed', beard: true, hairColor: 0x6a5a48, skin: 0x7a4e32, cloth: 0x4a4a40, pauldron: true, height: 1.82 },
];

export interface DesertHooks {
  toast(msg: string): void;
  bossBar(t: { hp: number; maxHp: number; alive: boolean } | null, name?: string): void;
  card(title: string, subtitle: string): void;
  flags: Record<string, boolean | number | string>;
  give(item: string, n: number): void;
  save(): void;
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
    this.buildCamps();
    this.buildInteractables();
  }

  /** Near enough to the Expanse that its world needs to exist? */
  private near(p: THREE.Vector3, d: number) {
    return p.x < -1800 && Math.hypot(p.x - SUNSPIRE.x, p.z - SUNSPIRE.z) < d;
  }

  private breachShake(at: THREE.Vector3) {
    sfx.rumble(4, 0.6);
    void at;
  }

  // ---- Sunspire --------------------------------------------------------------------------------------

  private async loadCity() {
    this.cityLoading = true;
    const g = await compressedGltf.loadAsync('/assets/desert/sunspire.glb');
    const S = MODEL.scale, [mcx, mcy, mcz] = MODEL.center;
    const place = new THREE.Matrix4().makeTranslation(SUNSPIRE.x, sunspireY(), SUNSPIRE.z)
      .multiply(new THREE.Matrix4().makeScale(S, S, S))
      .multiply(new THREE.Matrix4().makeTranslation(-mcx, -mcy, -mcz));
    g.scene.updateMatrixWorld(true);
    // Bake every mesh into world space, then cut the city into chunks so
    // only the streets in view are drawn.
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
      const n = posA.count;
      const P = new Float32Array(n * 3), N = nrmA ? new Float32Array(n * 3) : null, U = uvA ? new Float32Array(n * 2) : null;
      const v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(m);
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(posA, i).applyMatrix4(m);
        P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
        if (N) {
          v.fromBufferAttribute(nrmA, i).applyMatrix3(nm).normalize();
          N[i * 3] = v.x; N[i * 3 + 1] = v.y; N[i * 3 + 2] = v.z;
        }
        if (U) {
          U[i * 2] = uvA.getX(i);
          U[i * 2 + 1] = uvA.getY(i);
        }
      }
      const idx = src.index ? src.index.array : Uint32Array.from({ length: n }, (_, i) => i);
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
    for (const { mat, geos } of chunks.values()) {
      const geo = geos.length > 1 ? mergeGeometries(geos)! : geos[0];
      if (!geo.getAttribute('normal')) geo.computeVertexNormals();
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      const m = mat as THREE.MeshStandardMaterial;
      if (m.map) m.map.anisotropy = 4;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      city.add(mesh);
    }
    this.cityCollider = physics.addTrimesh(new Float32Array(collPos), new Uint32Array(collIdx));
    this.city = city;
    this.group.add(city);
    this.dressCity();
    this.cityLoading = false;
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
    // Two sand golems stand guard either side of the east gate.
    void compressedGltf.loadAsync('/assets/desert/sandGolem.glb').then((gl) => {
      for (const side of [-1, 1]) {
        const golem = gl.scene.clone(true);
        golem.scale.setScalar(0.72);
        const gx = GATE_X - 4, gz = SUNSPIRE_GATE_Z + side * 9;
        golem.position.set(gx, heightAt(gx, gz), gz);
        golem.rotation.y = Math.PI / 2;
        golem.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true)));
        this.cityDressing.add(golem);
        physics.addBox(new THREE.Vector3(gx, heightAt(gx, gz) + 2.5, gz), new THREE.Vector3(1.6, 2.5, 1.2));
      }
    });
  }

  // ---- the scavenger camps ---------------------------------------------------------------------------

  private buildCamps() {
    SCAV_CAMPS.forEach(([cx, cz, r], k) => {
      const g = new THREE.Group();
      g.name = 'camp:' + CAMP_NAMES[k];
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
      if (k === 5 || k === 2) {
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
        const n = r.camp === 1 ? 5 : 4;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * 6.28;
          const role = r.camp === 1 && i === 0 ? 'chief' : i % 3 === 2 ? 'crossbow' : 'sword';
          const b = new Bandit(role, new THREE.Vector3(cx + Math.cos(a) * cr * 0.4, y, cz + Math.sin(a) * cr * 0.4), this.scene, this.bolts, undefined, RAIDER_LOOKS[i % RAIDER_LOOKS.length]);
          b.kind = role === 'chief' ? 'scavengerChief' : 'scavenger';
          b.name = role === 'chief' ? 'Vash, Queen of Glasswind' : role === 'crossbow' ? 'Scavenger Bolt-thrower' : 'Scavenger Raider';
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

  setVisible(v: boolean) {
    this.visible = v;
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
    }
  }

  /** Debug and tests: is the city in? */
  get cityLoaded() {
    return !!this.city;
  }
  get creatureCounts() {
    return { sharks: this.sharks.size, rays: this.rays.size, pods: this.pods.size, boss: !!this.boss, raiders: this.raiders.reduce((n, r) => n + r.list.length, 0) };
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
