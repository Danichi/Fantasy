import * as THREE from 'three';
import { heightAt } from '../terrainHeight';
import { physics } from '../../physics/physics';
import { StaticBatch } from '../cityKit';
import { buildHouse, worldUV, type WorldMats } from '../buildings';
import { mulberry32 } from '../../core/math';
import { MOUNTAIN_ROAD, GLACIER_TRAIL, MTN_PLACES, CAIRNS, SHELTERS, PADS } from './mountainData';
import { named, folk, settlement, LOOKS, v3 } from './mountainFolk';
import { MountainFoe, type FoeKind } from '../../enemies/mountain/mountainFoe';
import type { NpcRecord, Settlement, Place } from '../../npc/npcManager';
import type { FX } from '../../fx/particles';
import type { Player } from '../../player/player';
import type { Interactable } from '../../dungeon/instance';

// The surface of the White Mountains (docs/design/mountains.md §4): the dwarf
// road from the cove to the citadel, laid as a gravel ribbon on its graded
// bed; Copperbrook, the half-dwarf, half-human mining village in the
// foothills; Bruni's claim above it with its headframe over the shaft;
// Stonegate's fort on the pass; the lantern cairns and the cairn huts on the
// high road; and the creatures of each zone, which wake as you come near and
// sleep when you've gone (a pack of snow wolves in the foothills, trolls at
// Stonegate, a yeti above the high road, wyverns over the glacier).

export interface WhiteBuilt {
  interactables: Interactable[];
  records: NpcRecord[];
  settlements: Settlement[];
  /** fires and hearths you can warm yourself at (the cold meter) */
  fires: THREE.Vector3[];
  /** shelter: out of the wind (cairn huts, the inn, the fort) */
  shelters: { pos: THREE.Vector3; r: number }[];
  clearings: [number, number, number][];
  /** the cairns' lamps (lit by the player; saved) */
  cairnLamps: THREE.MeshStandardMaterial[];
  cairnGlows: THREE.Sprite[];
  group: THREE.Group;
}

const P = MTN_PLACES;

let glowTex: THREE.Texture | null = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,240,200,1)');
  grad.addColorStop(0.3, 'rgba(255,200,120,0.5)');
  grad.addColorStop(1, 'rgba(255,180,90,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

/** Build the region's static scenery and its people. */
export function buildWhiteMountains(scene: THREE.Scene, m: WorldMats): WhiteBuilt {
  const group = new THREE.Group();
  scene.add(group);
  const batch = new StaticBatch();
  const rnd = mulberry32(4505);
  const stone = (m.bridgeStone ?? m.stone) as THREE.Material;
  const iron = new THREE.MeshStandardMaterial({ color: 0x2e2e32, roughness: 0.55, metalness: 0.7 });
  const gravel = new THREE.MeshStandardMaterial({ color: 0x8a8274, roughness: 1 });
  const banner = new THREE.MeshStandardMaterial({ color: 0x2a5a9a, roughness: 0.85, side: THREE.DoubleSide });
  const fireMat = new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xff5a10, emissiveIntensity: 2.4 });
  const add = (g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0, rx = 0) => {
    const mesh = new THREE.Mesh(worldUV(g, 1.5), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, 0, 'YXZ');
    batch.addObject(mesh);
    return mesh;
  };
  const fires: THREE.Vector3[] = [];
  const shelters: WhiteBuilt['shelters'] = [];
  const clearings: [number, number, number][] = PADS.map((p) => [p.x, p.z, p.r + 8] as [number, number, number]);

  // ---- the road: a gravel ribbon on its bed, 4.5 m wide ----
  for (const line of [MOUNTAIN_ROAD, GLACIER_TRAIL]) {
    const pos: number[] = [], idx: number[] = [];
    let n = 0;
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, az] = line[i], [bx, bz] = line[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      const steps = Math.ceil(len / 3);
      for (let k = i === 0 ? 0 : 1; k <= steps; k++) {
        const t = k / steps, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const w = line === GLACIER_TRAIL ? 1.6 : 2.3;
        pos.push(x + nx * w, heightAt(x + nx * w, z + nz * w) + 0.08, z + nz * w, x - nx * w, heightAt(x - nx * w, z - nz * w) + 0.08, z - nz * w);
        if (n > 0) idx.push(n * 2 - 2, n * 2 - 1, n * 2, n * 2 - 1, n * 2 + 1, n * 2);
        n++;
      }
      clearings.push([(ax + bx) / 2, (az + bz) / 2, len / 2 + 6]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const ribbon = new THREE.Mesh(g, gravel);
    ribbon.receiveShadow = true;
    group.add(ribbon);
  }

  // ---- Copperbrook ----
  const [cbx, cbz] = P.copperbrook;
  const cby = heightAt(cbx, cbz);
  const homeSpots: THREE.Vector3[] = [];
  const houseAt = (x: number, z: number, w: number, d: number, floors: 1 | 2, roof: 'slate' | 'thatch' | 'tile' = 'slate') => {
    const rot = Math.atan2(cbx - x, cbz - z);
    const { group: hg, half } = buildHouse({ w, d, floors, roof, seed: Math.floor(rnd() * 1e5) }, m);
    const gy = heightAt(x, z);
    hg.position.set(x, gy, z);
    hg.rotation.y = rot;
    batch.addObject(hg);
    physics.addBox(new THREE.Vector3(x, gy + half.y, z), half, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)));
    homeSpots.push(new THREE.Vector3(x + Math.sin(rot) * (half.z + 1.4), gy, z + Math.cos(rot) * (half.z + 1.4)));
    return { rot, gy, half };
  };
  // Round the square, leaving the road open east and west.
  const ring: [number, number, number, number, 1 | 2][] = [[0.5, 30, 8, 6, 2], [1.1, 32, 7, 6, 1], [1.7, 30, 9, 7, 2], [2.4, 31, 7, 6, 1], [3.9, 31, 8, 6, 1], [4.6, 30, 10, 7, 2], [5.3, 32, 7, 6, 1]];
  for (const [a, r, w, d, f] of ring) houseAt(cbx + Math.cos(a) * r, cbz + Math.sin(a) * r, w, d, f, rnd() < 0.3 ? 'thatch' : 'slate');
  // The smithy: an open forge under a lean-to, glowing.
  const smithy = new THREE.Vector2(cbx - 14, cbz + 16);
  {
    const y = heightAt(smithy.x, smithy.y);
    add(new THREE.BoxGeometry(2.4, 1.2, 2.4), stone, smithy.x, y + 0.6, smithy.y);
    add(new THREE.BoxGeometry(1.6, 0.2, 1.6), fireMat, smithy.x, y + 1.25, smithy.y);
    add(new THREE.BoxGeometry(0.9, 3.2, 0.9), stone, smithy.x, y + 2.8, smithy.y - 0.6);
    add(new THREE.BoxGeometry(0.9, 0.6, 0.4), iron, smithy.x + 2, y + 0.9, smithy.y);
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) add(new THREE.BoxGeometry(0.25, 3.4, 0.25), m.timber, smithy.x + dx, y + 1.7, smithy.y + dz);
    add(new THREE.BoxGeometry(7, 0.25, 7), m.slate, smithy.x, y + 3.5, smithy.y, 0, 0.12);
    physics.addBox(new THREE.Vector3(smithy.x, y + 0.6, smithy.y), new THREE.Vector3(1.2, 0.6, 1.2));
    fires.push(new THREE.Vector3(smithy.x, y + 1, smithy.y));
  }
  // The well and the market cross; the village fire.
  add(new THREE.CylinderGeometry(1.1, 1.2, 0.9, 12), stone, cbx + 4, cby + 0.45, cbz - 5);
  add(new THREE.CylinderGeometry(0.9, 1.1, 0.35, 10), stone, cbx - 4, cby + 0.18, cbz + 4);
  add(new THREE.ConeGeometry(0.6, 1.1, 6), fireMat, cbx - 4, cby + 0.8, cbz + 4);
  fires.push(new THREE.Vector3(cbx - 4, cby + 0.6, cbz + 4));
  // The Rusty Pick: the inn (out of the wind).
  const inn = houseAt(cbx + Math.cos(3.15) * 30, cbz + Math.sin(3.15) * 30, 11, 8, 2, 'slate');
  const innDoor = new THREE.Vector3(cbx + Math.cos(3.15) * 30, inn.gy, cbz + Math.sin(3.15) * 30);
  shelters.push({ pos: innDoor, r: 9 });
  fires.push(innDoor.clone());
  // A sign at the road into the village.
  for (const [sx, sz] of [[cbx + 46, cbz - 12], [cbx - 44, cbz - 20]]) {
    const y = heightAt(sx, sz);
    add(new THREE.BoxGeometry(0.2, 2.6, 0.2), m.timber, sx, y + 1.3, sz);
    add(new THREE.BoxGeometry(1.8, 0.6, 0.1), m.planks, sx, y + 2.3, sz, 0.3);
  }

  // ---- Bruni's claim: the headframe over the shaft, carts, Marta's camp ----
  const [clx, clz] = P.claim;
  const cly = heightAt(clx, clz);
  const [shx, shz] = P.shaftMouth;
  {
    const y = heightAt(shx, shz);
    add(new THREE.BoxGeometry(3.4, 0.5, 3.4), m.planks, shx, y + 0.25, shz);
    for (const [dx, dz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) add(new THREE.BoxGeometry(0.3, 8, 0.3), m.timber, shx + dx * 0.7, y + 4, shz + dz * 0.7, 0, dz * 0.04);
    add(new THREE.BoxGeometry(3.2, 0.3, 0.3), m.timber, shx, y + 7.8, shz);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.1, 6, 16), iron);
    wheel.position.set(shx, y + 8.6, shz);
    group.add(wheel);
    add(new THREE.CylinderGeometry(0.03, 0.03, 8), iron, shx, y + 4.2, shz);
    for (let k = 0; k < 3; k++) {
      const x = clx + 6 + k * 2.6, z = clz + 8;
      const cy = heightAt(x, z);
      add(new THREE.BoxGeometry(1.1, 0.8, 1.6), m.planks, x, cy + 0.7, z);
      add(new THREE.DodecahedronGeometry(0.5, 0), m.stone, x, cy + 1.2, z);
    }
    for (let k = 0; k < 3; k++) {
      const a = 2 + k * 0.7;
      const x = clx + Math.cos(a) * 12, z = clz + Math.sin(a) * 10;
      add(new THREE.ConeGeometry(2, 2.4, 4), new THREE.MeshStandardMaterial({ color: 0xa89a7a, roughness: 0.95, side: THREE.DoubleSide }), x, heightAt(x, z) + 1.2, z, a);
    }
    add(new THREE.CylinderGeometry(0.8, 1, 0.3, 10), stone, clx - 6, cly + 0.15, clz - 2);
    add(new THREE.ConeGeometry(0.5, 0.9, 6), fireMat, clx - 6, cly + 0.6, clz - 2);
    fires.push(new THREE.Vector3(clx - 6, cly + 0.5, clz - 2));
    const pole = new THREE.Vector2(clx + 10, clz - 8);
    const py = heightAt(pole.x, pole.y);
    add(new THREE.BoxGeometry(0.2, 2.4, 0.2), m.timber, pole.x, py + 1.2, pole.y);
    add(new THREE.BoxGeometry(1.6, 0.7, 0.1), m.planks, pole.x, py + 2.1, pole.y, -0.6);
  }

  // ---- Stonegate: the fort on the pass ----
  const [sgx, sgz] = P.stonegate;
  const sgy = heightAt(sgx, sgz);
  {
    // Two towers astride the road and a wall between them with the gate open.
    const roadYaw = Math.atan2(4190 - 4236, -4870 + 4752);
    const across = new THREE.Vector2(Math.cos(roadYaw), -Math.sin(roadYaw));
    for (const s of [-1, 1]) {
      const x = sgx + across.x * s * 9, z = sgz + across.y * s * 9;
      const y = heightAt(x, z) - 1;
      add(new THREE.CylinderGeometry(3.2, 3.6, 13, 10), stone, x, y + 6.5, z);
      add(new THREE.CylinderGeometry(3.6, 3.6, 1, 10), stone, x, y + 13.4, z);
      for (let k = 0; k < 8; k++) add(new THREE.BoxGeometry(0.9, 1.2, 0.9), stone, x + Math.cos(k * 0.785) * 3.2, y + 14.4, z + Math.sin(k * 0.785) * 3.2);
      physics.addCylinder(new THREE.Vector3(x, y + 6.5, z), 6.5, 3.4);
      const wx = sgx + across.x * s * 4.2, wz = sgz + across.y * s * 4.2;
      add(new THREE.BoxGeometry(4.4, 8, 2), stone, wx, heightAt(wx, wz) + 4 - 1, wz, roadYaw + Math.PI / 2);
      physics.addBox(new THREE.Vector3(wx, heightAt(wx, wz) + 3, wz), new THREE.Vector3(2.2, 4, 1), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, roadYaw + Math.PI / 2, 0)));
      add(new THREE.BoxGeometry(0.05, 3, 1.8), banner, x + across.x * s * 3.7, y + 10, z + across.y * s * 3.7, roadYaw);
    }
    add(new THREE.BoxGeometry(5, 1.4, 2.2), stone, sgx, sgy + 7.4, sgz, roadYaw + Math.PI / 2);
    // The guard hut behind the wall, with a brazier.
    const hx = sgx + 14 * Math.sin(roadYaw + 0.9), hz = sgz + 14 * Math.cos(roadYaw + 0.9);
    const hy = heightAt(hx, hz);
    add(new THREE.BoxGeometry(6, 3.4, 5), stone, hx, hy + 1.7, hz, roadYaw);
    add(new THREE.BoxGeometry(6.6, 0.4, 5.6), m.slate, hx, hy + 3.6, hz, roadYaw);
    physics.addBox(new THREE.Vector3(hx, hy + 1.7, hz), new THREE.Vector3(3, 1.7, 2.5), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, roadYaw, 0)));
    add(new THREE.CylinderGeometry(0.55, 0.3, 1.1, 8), iron, sgx + across.x * 3, sgy + 0.55, sgz + across.y * 3);
    add(new THREE.SphereGeometry(0.42, 8, 6), fireMat, sgx + across.x * 3, sgy + 1.25, sgz + across.y * 3);
    fires.push(new THREE.Vector3(sgx + across.x * 3, sgy + 1, sgz + across.y * 3));
    shelters.push({ pos: new THREE.Vector3(hx, hy, hz), r: 7 });
  }

  // ---- the lantern cairns and the cairn huts on the high road ----
  const cairnLamps: THREE.MeshStandardMaterial[] = [];
  const cairnGlows: THREE.Sprite[] = [];
  for (const [x, z] of CAIRNS) {
    const y = heightAt(x, z);
    for (let k = 0; k < 4; k++) add(new THREE.DodecahedronGeometry(0.75 - k * 0.14, 0), stone, x, y + 0.5 + k * 0.62, z, k);
    add(new THREE.BoxGeometry(0.12, 1.4, 0.12), iron, x, y + 3.3, z);
    const lamp = new THREE.MeshStandardMaterial({ color: 0x3a3830, emissive: 0xffb050, emissiveIntensity: 0, roughness: 0.4 });
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), lamp);
    l.position.set(x, y + 4.1, z);
    group.add(l);
    cairnLamps.push(lamp);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc070, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
    glow.position.set(x, y + 4.1, z);
    glow.scale.setScalar(5);
    group.add(glow);
    cairnGlows.push(glow);
    physics.addCylinder(new THREE.Vector3(x, y + 1.2, z), 1.2, 0.7);
  }
  for (const [x, z] of SHELTERS) {
    // A round stone hut with a low door and a fire inside.
    const y = heightAt(x, z);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      if (k === 0) continue; // the doorway
      const wx = x + Math.cos(a) * 3.2, wz = z + Math.sin(a) * 3.2;
      add(new THREE.BoxGeometry(2.1, 2.6, 0.7), stone, wx, y + 1.3, wz, -a + Math.PI / 2);
      physics.addBox(new THREE.Vector3(wx, y + 1.3, wz), new THREE.Vector3(1.05, 1.3, 0.35), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a + Math.PI / 2, 0)));
    }
    add(new THREE.ConeGeometry(4, 2.4, 10), m.slate, x, y + 3.8, z);
    add(new THREE.ConeGeometry(0.45, 0.8, 6), fireMat, x, y + 0.45, z);
    fires.push(new THREE.Vector3(x, y + 0.4, z));
    shelters.push({ pos: new THREE.Vector3(x, y, z), r: 3 });
  }
  batch.build(group);

  // ---- the people ----
  const places: Place[] = [
    { id: 'homes', spots: homeSpots, indoors: true },
    { id: 'inn', spots: [innDoor], indoors: true },
    { id: 'square', spots: [v3(cbx + 6, cbz + 2), v3(cbx - 2, cbz - 6), v3(cbx + 2, cbz + 8), v3(cbx - 8, cbz - 1)] },
    { id: 'claim', spots: [v3(clx + 5, clz + 4), v3(clx - 3, clz + 6), v3(clx + 8, clz - 3)] },
    { id: 'smithy', spots: [v3(smithy.x + 2, smithy.y + 2)] },
  ];
  const records: NpcRecord[] = [];
  const posts = [
    named('bruniMtn', 'Bruni Stonevein', 'Dwarven Expedition Leader', LOOKS.bruni, 'copperbrook', [cbx + 3, cbz - 2], 0, 'idle', ['A claim, a road, and a king up the mountain. One thing at a time.', 'Copperbrook. Smells of sheep and sulphur. I love it already.']),
    named('marta', 'Marta Hollins', 'Mine-boss of the Copperbrook Seam', LOOKS.marta, 'copperbrook', [clx - 2, clz + 2], 0.5, 'idle', ['Mind the shaft. It\'s deeper than it looks, and it looks deep.', 'Twenty years I\'ve worked this valley.']),
    named('gorm', 'Gorm Hammerhand', 'Smith of Copperbrook · Cloaks, Crossbows and Stew', LOOKS.dwarfM, 'copperbrook', [smithy.x + 2.4, smithy.y - 1.5], 0, 'work', ['Fur cloaks, steel prods, hot stew. The three things that keep you alive up here.', 'The passes kill more fools with cold than trolls ever did.']),
    named('tobin', 'Tobin the Goatherd', 'Goatherd of the High Road', LOOKS.tobin, 'copperbrook', [cbx - 30, cbz - 22], 0, 'idle', ['My goats go missing on the high road. Big tracks in the snow.']),
  ];
  for (const p of posts) {
    places.push(p.place);
    records.push(p.rec);
  }
  records.push(...folk('cb-folk', 'copperbrook', [LOOKS.dwarfM, LOOKS.minerF, LOOKS.minerM, LOOKS.dwarfF, LOOKS.minerM, LOOKS.dwarfM], ['Arn', 'Bertha', 'Coll', 'Disa', 'Egil', 'Frida'], 'homes', 'square', 'inn', ['Ore\'s good this year.', 'Mind the wolves past the bridge.', 'The dwarves pay in silver. I like the dwarves.']));
  records.push(...folk('cb-miner', 'copperbrook', [LOOKS.minerM, LOOKS.minerF, LOOKS.dwarfM], ['Hale', 'Ida', 'Joss'], 'homes', 'claim', 'inn', ['Pick, shovel, pray.', 'The seam runs blue at the bottom. Never seen that before.']));
  const cb = settlement('copperbrook', cbx, cbz, 520, places);

  // Stonegate's garrison.
  const sgPlaces: Place[] = [{ id: 'wall', spots: [v3(sgx + 3, sgz + 4), v3(sgx - 4, sgz + 2)] }, { id: 'hut', spots: [v3(sgx + 10, sgz + 6)], indoors: true }];
  const brenna = named('brenna', 'Captain Brenna Hask', 'Captain of Stonegate · The Pass and its Cairns', LOOKS.brenna, 'stonegate', [sgx + 2, sgz + 6], 0, 'idle', ['Stonegate holds the pass. Trolls, snow and fools: we\'ve seen them all.', 'Follow the lanterns in a blizzard. If they\'re lit.']);
  sgPlaces.push(brenna.place);
  records.push(brenna.rec);
  records.push(...folk('sg-guard', 'stonegate', [LOOKS.guard, LOOKS.guard, LOOKS.guard], ['Guard Ivo', 'Guard Petra', 'Guard Hask'], 'hut', 'wall', 'hut', ['Cold watch.', 'Keep moving, traveller.']));
  const sg = settlement('stonegate', sgx, sgz, 420, sgPlaces);

  return { interactables: [], records, settlements: [cb, sg], fires, shelters, clearings, cairnLamps, cairnGlows, group };
}

/** One zone's creatures: woken as you come near, put away when you've gone. */
export interface FoeZone { id: string; at: [number, number]; spawn: [FoeKind, number, number][]; level: number; wake: number; foes: MountainFoe[]; cleared?: () => boolean }

export class ZoneSpawner {
  zones: FoeZone[] = [];
  blizzard = 0;
  constructor(private scene: THREE.Scene, private fx: FX) {}

  add(id: string, at: [number, number], spawn: [FoeKind, number, number][], level = 1, wake = 220, cleared?: () => boolean) {
    this.zones.push({ id, at, spawn, level, wake, foes: [], cleared });
  }

  update(dt: number, player: Player) {
    for (const z of this.zones) {
      const d = Math.hypot(player.pos.x - z.at[0], player.pos.z - z.at[1]);
      if (!z.foes.length && d < z.wake && !(z.cleared?.())) {
        for (const [kind, dx, dz] of z.spawn) z.foes.push(new MountainFoe(kind, new THREE.Vector3(z.at[0] + dx, 0, z.at[1] + dz), this.scene, this.fx, z.level));
        for (const f of z.foes) f.pack = z.foes;
      } else if (z.foes.length && d > z.wake + 180) {
        for (const f of z.foes) f.dispose();
        z.foes = [];
        continue;
      }
      for (const f of z.foes) f.update(dt, player, this.blizzard);
    }
  }

  /** Every live foe (tests, the avalanche, a loud fight). */
  all() {
    return this.zones.flatMap((z) => z.foes);
  }

  setVisible(v: boolean) {
    for (const f of this.all()) f.setVisible(v);
  }

  clear() {
    for (const z of this.zones) {
      for (const f of z.foes) f.dispose();
      z.foes = [];
    }
  }
}
