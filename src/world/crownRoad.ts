import * as THREE from 'three';
import { registerDoor, type Door } from './doors';
import { buildHouse, worldUV, type WorldMats, type HouseSpec } from './buildings';
import { heightAt } from './terrainHeight';
import { physics } from '../physics/physics';
import { mulberry32 } from '../core/math';
import { StaticBatch } from './cityKit';
import { road, pointAlong, roadLength, carvedText } from './roadNetwork';
import { sunwheelTexture } from './glenLandmarks';
import { WAYSTONES } from './kingsRoad';
import { GRASS_MASKS } from './groundWindow';
import { CROWN_SITES } from './roadData';
import { Bandit, Bolts } from '../enemies/bandit';
import { OrcMob } from '../enemies/orcMob';
import { Undead } from '../enemies/undead';
import type { Beast } from '../enemies/beast';
import type { BeastSpawner } from '../enemies/beastSpawner';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';
import type { Interactable } from '../dungeon/instance';
import type { NpcRecord, Place, Settlement, ScheduleEntry } from '../npc/npcManager';
import type { Look } from '../npc/charBuilder';
import type { Range, Species } from './fauna';

// The Crown Road (Elder Glen to the Royal Capital, ~3 km): what lies along it.
// Past the Crown checkpoint and its outpost, the road runs by a wayside shrine
// of the Dawn, through the farming hamlet of Thornfield, past a caravan wagon
// ambushed and left in the ditch, under the Old Watchtower (a bandit nest), by
// a wolf den in the woods, to the Kingsmile waystation inn half-way; then into
// the orc marches (a burnt-out cottage, Gorrak's warcamp), past the Barrow of
// the Old Kings where the dead walk at night, and through the capital's fields
// to the Gate Market outside the East Gate. The camps hold their ground and
// fill up again a while after they're cleared.

const CR = road('capital');
const LEN = roadLength(CR);

/** A place `s` metres along the Crown Road, `lat` metres to its left (+) or right (-). */
export function crownAt(s: number, lat = 0) {
  const p = pointAlong(CR, s);
  const sx = -p.dir.y, sz = p.dir.x;
  const x = p.x + sx * lat, z = p.z + sz * lat;
  return { x, z, y: heightAt(x, z), yaw: Math.atan2(p.dir.x, p.dir.y), side: new THREE.Vector2(sx, sz), dir: p.dir.clone() };
}

/** Where things are along the Crown Road (quests, tests, the map): data in roadData.ts. */
export { CROWN_SITES };
export type CrownSite = keyof typeof CROWN_SITES;
export const crownSite = (k: CrownSite) => crownAt(CROWN_SITES[k].s, CROWN_SITES[k].lat);

/** The Kingsmile waystone (fast travel): half-way to the capital. */
{
  const k = crownSite('kingsmile');
  WAYSTONES.push({ id: 'kingsmile', name: 'The Kingsmile (Crown Road)', pos: new THREE.Vector3(k.x - k.side.x * 30, 0, k.z - k.side.y * 30) });
}

export interface CrownRoadHooks {
  toast(msg: string): void;
  bossBar(t: { hp: number; maxHp: number; alive: boolean } | null, name?: string): void;
  flags: Record<string, boolean | number | string>;
  give(item: string, n: number): void;
  gold(n: number): void;
  heal(): void;
  hour(): number;
  save(): void;
}

export interface CrownRoad {
  settlements: { settlement: Settlement; records: NpcRecord[] }[];
  clearings: [number, number, number][];
  interactables: Interactable[];
  herds: { species: Species; count: number; range: Range }[];
  /** the inn's stable yard (horses, coaches) */
  stableYard: THREE.Vector3;
  threats: CrownThreats;
  update(dt: number, player: Player, night: number): void;
}

type Fire = { pos: THREE.Vector3; mat: THREE.MeshStandardMaterial; size: number };

export function buildCrownRoad(scene: THREE.Scene, m: WorldMats, fx: FX, beasts: BeastSpawner, hooks: CrownRoadHooks): CrownRoad {
  const rnd = mulberry32(9601);
  const batch = new StaticBatch();
  const clearings: [number, number, number][] = [];
  const interactables: Interactable[] = [];
  const fires: Fire[] = [];
  const glows: THREE.MeshStandardMaterial[] = [];
  const cols = new Map<number, THREE.MeshStandardMaterial>();
  const col = (c: number, rough = 0.9) => {
    let mm = cols.get(c);
    if (!mm) cols.set(c, (mm = new THREE.MeshStandardMaterial({ color: c, roughness: rough })));
    return mm;
  };
  const canvas = (c: number) => {
    const k = 0x100000000 + c;
    let mm = cols.get(k);
    if (!mm) cols.set(k, (mm = new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, side: THREE.DoubleSide })));
    return mm;
  };
  const charred = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 1 });
  const hide = canvas(0x6a4e34);

  const add = (g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0, uv = 1.5) => {
    const mesh = new THREE.Mesh(worldUV(g, uv), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    batch.addObject(mesh);
  };
  const solid = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) =>
    physics.addBox(new THREE.Vector3(x, y, z), new THREE.Vector3(w / 2, h / 2, d / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)));
  const house = (x: number, z: number, rot: number, spec: HouseSpec, info: Partial<Door> = {}, mats = m) => {
    const { group, half, door } = buildHouse(spec, mats);
    let gy = Infinity;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) gy = Math.min(gy, heightAt(x + Math.cos(rot) * sx * half.x + Math.sin(rot) * sz * half.z, z - Math.sin(rot) * sx * half.x + Math.cos(rot) * sz * half.z));
    group.position.set(x, gy, z);
    group.rotation.y = rot;
    if (info.name !== '__ruin') registerDoor(group, door, spec, info);
    batch.addObject(group);
    physics.addBox(new THREE.Vector3(x, gy + half.y, z), half, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)));
    clearings.push([x, z, Math.max(half.x, half.z) + 5]);
    return { gy, half, door };
  };
  const campfire = (x: number, z: number, size = 1) => {
    const y = heightAt(x, z);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      add(new THREE.IcosahedronGeometry(0.22 * size, 0), m.stone, x + Math.cos(a) * 0.75 * size, y + 0.1, z + Math.sin(a) * 0.75 * size);
    }
    for (let k = 0; k < 4; k++) {
      const log = new THREE.CylinderGeometry(0.08 * size, 0.1 * size, 1.1 * size, 6);
      log.rotateX(Math.PI / 2 - 0.35).rotateY((k / 4) * Math.PI * 2);
      add(log, m.bark, x, y + 0.22, z);
    }
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a1206, emissive: 0xff7a2a, emissiveIntensity: 1.6 });
    const coals = new THREE.Mesh(new THREE.CylinderGeometry(0.4 * size, 0.45 * size, 0.12, 10), mat);
    coals.position.set(x, y + 0.1, z);
    scene.add(coals);
    fires.push({ pos: new THREE.Vector3(x, y + 0.35, z), mat, size });
    GRASS_MASKS.push({ x, z, r: 2.4 * size, amount: 0.9 });
  };
  const tent = (x: number, z: number, yaw: number, mat: THREE.Material, s = 1) => {
    const y = heightAt(x, z);
    const g = new THREE.ConeGeometry(1.9 * s, 2.3 * s, 4, 1, true);
    g.rotateY(Math.PI / 4);
    g.scale(1, 1, 1.4);
    add(g, mat, x, y + 1.1 * s, z, yaw);
    add(new THREE.PlaneGeometry(0.9 * s, 1.4 * s), col(0x1a120c), x + Math.sin(yaw) * 1.36 * s, y + 0.7 * s, z + Math.cos(yaw) * 1.36 * s, yaw);
    solid(2.6 * s, 1.6 * s, 3.6 * s, x, y + 0.8 * s, z, yaw);
  };
  const crate = (x: number, z: number, ry = rnd() * 3, s = 1) => {
    const y = heightAt(x, z);
    add(rnd() < 0.55 ? new THREE.BoxGeometry(0.9 * s, 0.8 * s, 0.9 * s) : new THREE.CylinderGeometry(0.38 * s, 0.42 * s, 0.95 * s, 10), m.planks, x, y + 0.42 * s, z, ry);
  };
  const lantern = (x: number, z: number) => {
    const y = heightAt(x, z);
    add(new THREE.CylinderGeometry(0.07, 0.1, 3.2, 6), m.timber, x, y + 1.6, z);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffb050, emissiveIntensity: 0.3 });
    glows.push(mat);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.4, 0.28), mat);
    l.position.set(x, y + 3.3, z);
    scene.add(l);
  };
  const fence = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 2.6));
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
      add(new THREE.BoxGeometry(0.14, 1.1, 0.14), m.timber, x, heightAt(x, z) + 0.55, z);
      if (k < n) {
        const mx = x + (bx - ax) / n / 2, mz = z + (bz - az) / n / 2, my = heightAt(mx, mz);
        for (const yy of [0.45, 0.85]) add(new THREE.BoxGeometry(0.08, 0.1, len / n + 0.1), m.planks, mx, my + yy, mz, yaw);
      }
    }
  };
  const rock = (x: number, z: number, s: number) => {
    const g = new THREE.DodecahedronGeometry(s, 0);
    g.scale(1, 0.7 + rnd() * 0.4, 1);
    add(g, m.stone, x, heightAt(x, z) + s * 0.3, z, rnd() * 3);
    physics.addCylinder(new THREE.Vector3(x, heightAt(x, z) + s * 0.4, z), s * 0.5, s * 0.8);
  };
  const tree = (x: number, z: number, s = 1) => {
    const y = heightAt(x, z);
    add(new THREE.CylinderGeometry(0.18 * s, 0.3 * s, 3 * s, 7), m.bark, x, y + 1.5 * s, z);
    add(new THREE.IcosahedronGeometry(1.9 * s, 1), col(rnd() < 0.5 ? 0x3d6a2e : 0x4a7a34, 1), x, y + 4.2 * s, z, rnd() * 3);
    physics.addCylinder(new THREE.Vector3(x, y + 1.5 * s, z), 1.5 * s, 0.3 * s);
  };
  const sign = (lines: string[], x: number, z: number, yaw: number, w = 1.6) => {
    const y = heightAt(x, z);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.12, 2.2, 0.12), m.timber, x + Math.cos(yaw) * s * (w / 2), y + 1.1, z - Math.sin(yaw) * s * (w / 2));
    const board = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.45), new THREE.MeshStandardMaterial({ map: carvedText(lines, 512, 230, '#efe3c2', '#3a2a1a'), roughness: 1, side: THREE.DoubleSide }));
    board.position.set(x, y + 1.75, z);
    board.rotation.y = yaw;
    scene.add(board);
  };
  const v = (x: number, z: number) => new THREE.Vector3(x, heightAt(x, z), z);

  // ---- Milestones: every half-mile, the distance to the capital ---------------------------
  for (let s = 400; s < LEN - 150; s += 805) {
    const p = crownAt(s, 5.4);
    add(new THREE.BoxGeometry(0.5, 1.1, 0.32), m.stone, p.x, p.y + 0.5, p.z, p.yaw + Math.PI / 2);
    add(new THREE.BoxGeometry(0.56, 0.14, 0.38), m.stone, p.x, p.y + 1.1, p.z, p.yaw + Math.PI / 2);
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.5), new THREE.MeshStandardMaterial({ map: carvedText(['CAPITAL', `${((LEN - s) / 1609).toFixed(1)} mi`], 128, 160, '#d8d2c4', '#2a2a2a'), roughness: 1 }));
    plaque.position.set(p.x + p.side.x * -0.17, p.y + 0.62, p.z + p.side.y * -0.17);
    plaque.rotation.y = Math.atan2(-p.side.x, -p.side.y);
    scene.add(plaque);
    solid(0.5, 1.2, 0.34, p.x, p.y + 0.6, p.z, p.yaw + Math.PI / 2);
  }

  // ---- The Crown checkpoint outpost --------------------------------------------------------
  {
    const o = crownSite('outpost');
    const at = (a: number, l: number) => { const p = crownAt(CROWN_SITES.outpost.s + a, CROWN_SITES.outpost.lat + l); return p; };
    // A timber watchtower.
    const t = at(-6, 4);
    for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) add(new THREE.BoxGeometry(0.28, 7, 0.28), m.timber, t.x + dx, t.y + 3.5, t.z + dz);
    add(new THREE.BoxGeometry(3.6, 0.25, 3.6), m.planks, t.x, t.y + 6, t.z);
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(3.6, 0.9, 0.12), m.planks, t.x, t.y + 6.6, t.z + s * 1.75);
      add(new THREE.BoxGeometry(0.12, 0.9, 3.6), m.planks, t.x + s * 1.75, t.y + 6.6, t.z);
    }
    add(new THREE.ConeGeometry(2.9, 1.8, 4).rotateY(Math.PI / 4), m.thatch, t.x, t.y + 8.6, t.z);
    solid(3.2, 7, 3.2, t.x, t.y + 3.5, t.z);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), canvas(0x2f5f9a));
    flag.position.set(t.x + 0.6, t.y + 10.2, t.z);
    scene.add(flag);
    add(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 5), m.timber, t.x, t.y + 9.8, t.z);
    // Tents of the Crown Guard, a campfire, a rack of spears.
    const t1 = at(8, 6), t2 = at(14, 2);
    tent(t1.x, t1.z, t1.yaw, canvas(0x3a5f9e));
    tent(t2.x, t2.z, t2.yaw + 0.4, canvas(0xe8dcc0));
    const f = at(2, -1);
    campfire(f.x, f.z);
    const r = at(-2, 9);
    for (let k = 0; k < 4; k++) add(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 5).rotateZ(0.12), m.timber, r.x + Math.cos(r.yaw) * (k - 1.5) * 0.4, r.y + 1.2, r.z - Math.sin(r.yaw) * (k - 1.5) * 0.4);
    // The toll hut.
    const h = at(-14, 5);
    house(h.x, h.z, h.yaw - Math.PI / 2, { w: 5, d: 4.5, floors: 1, roof: 'thatch', seed: 96001 }, { kind: 'hall', name: 'the toll hut', keeper: 'brask' });
    lantern(o.x - o.side.x * 9, o.z - o.side.y * 9);
    clearings.push([o.x, o.z, 26]);
  }

  // ---- The wayside shrine of the Dawn ------------------------------------------------------
  let shrineAt: THREE.Vector3;
  {
    const p = crownSite('shrine');
    shrineAt = new THREE.Vector3(p.x, p.y, p.z);
    add(new THREE.BoxGeometry(3.2, 0.4, 2.4), m.stone, p.x, p.y + 0.2, p.z, p.yaw);
    add(new THREE.BoxGeometry(0.9, 2.6, 0.5), m.bridgeStone ?? m.stone, p.x, p.y + 1.7, p.z, p.yaw);
    const wheel = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), new THREE.MeshStandardMaterial({ map: sunwheelTexture(), emissive: 0xffc060, emissiveMap: sunwheelTexture(), emissiveIntensity: 0.5, transparent: true }));
    glows.push(wheel.material as THREE.MeshStandardMaterial);
    const face = Math.atan2(-p.side.x, -p.side.y); // toward the road
    wheel.position.set(p.x + Math.sin(face) * 0.26, p.y + 2.3, p.z + Math.cos(face) * 0.26);
    wheel.rotation.y = face;
    scene.add(wheel);
    solid(1, 2.8, 0.6, p.x, p.y + 1.4, p.z, p.yaw);
    for (let k = 0; k < 5; k++) {
      const a = face + (k - 2) * 0.35;
      const fl = new THREE.SphereGeometry(0.22, 6, 5);
      add(fl, col([0xf2f0ea, 0xe8c040, 0xd84a5a, 0x8a6ad8, 0xf2a7c0][k]), p.x + Math.sin(a) * 1.4, p.y + 0.35, p.z + Math.cos(a) * 1.4);
    }
    add(new THREE.BoxGeometry(1.8, 0.12, 0.5), m.planks, p.x + Math.sin(face) * 2.6, p.y + 0.48, p.z + Math.cos(face) * 2.6, face);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.16, 0.45, 0.4), m.stone, p.x + Math.sin(face) * 2.6 + Math.cos(face) * s * 0.7, p.y + 0.22, p.z + Math.cos(face) * 2.6 - Math.sin(face) * s * 0.7, face);
    interactables.push({
      pos: shrineAt.clone().add(new THREE.Vector3(Math.sin(face) * 1.4, 0, Math.cos(face) * 1.4)), radius: 2.6,
      label: () => 'Pray at the shrine of the Dawn',
      enabled: () => true,
      action: () => {
        hooks.heal();
        hooks.toast('You kneel at the shrine. The Dawn’s light warms you, and your wounds close.');
      },
    });
    clearings.push([p.x, p.z, 8]);
  }

  // ---- Thornfield: a farming hamlet astride the road -------------------------------------------
  const thorn = crownSite('thornfield');
  const thornPlaces: Record<string, THREE.Vector3> = {};
  const herds: CrownRoad['herds'] = [];
  {
    const S = CROWN_SITES.thornfield.s;
    const lots: [number, number, HouseSpec, Partial<Door>][] = [
      [-34, 16, { w: 8, d: 6.5, floors: 1, roof: 'thatch', seed: 96101 }, {}],
      [-12, 17, { w: 12, d: 9, floors: 2, roof: 'tile', seed: 96102 }, { kind: 'tavern', name: 'The Thornfield Arms', keeper: 'tamsin' }],
      [12, 15, { w: 7.5, d: 6, floors: 1, roof: 'thatch', seed: 96103 }, {}],
      [30, 16, { w: 8.5, d: 7, floors: 2, roof: 'thatch', seed: 96104 }, { kind: 'home', name: 'Hedda’s farmhouse' }],
      [-24, -16, { w: 7, d: 6, floors: 1, roof: 'thatch', seed: 96105 }, {}],
      [2, -15, { w: 9, d: 7, floors: 1, roof: 'tile', seed: 96106 }, { kind: 'smithy', name: 'Thornfield smithy' }],
      [24, -17, { w: 7.5, d: 6.5, floors: 1, roof: 'thatch', seed: 96107 }, {}],
    ];
    for (const [a, l, spec, info] of lots) {
      const p = crownAt(S + a, l);
      // Face the road.
      const rot = Math.atan2(-Math.sign(l) * p.side.x, -Math.sign(l) * p.side.y);
      house(p.x, p.z, rot, spec, info);
    }
    // The well in the middle, a sign at each end.
    const w = crownAt(S, -7);
    add(new THREE.CylinderGeometry(1, 1.1, 0.9, 14, 1, true), m.stone, w.x, w.y + 0.45, w.z);
    add(new THREE.ConeGeometry(1.4, 0.9, 4).rotateY(Math.PI / 4), m.thatch, w.x, w.y + 2.9, w.z);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.12, 2.4, 0.12), m.timber, w.x + s * 0.9, w.y + 1.3, w.z);
    physics.addCylinder(new THREE.Vector3(w.x, w.y + 0.5, w.z), 0.5, 1.1);
    for (const [a, flip] of [[-52, 0], [52, Math.PI]] as [number, number][]) {
      const p = crownAt(S + a, -6);
      sign(['THORNFIELD', 'Wool · Grain · Honey'], p.x, p.z, p.yaw + flip + Math.PI);
    }
    // A windmill on the rise behind the hamlet, sails turning.
    const mp = crownAt(S + 46, -44);
    add(new THREE.CylinderGeometry(2.6, 3.4, 9, 10), m.plaster, mp.x, mp.y + 4.5, mp.z);
    add(new THREE.ConeGeometry(3.2, 3.2, 10), m.thatch, mp.x, mp.y + 10.6, mp.z);
    physics.addCylinder(new THREE.Vector3(mp.x, mp.y + 4.5, mp.z), 4.5, 3.2);
    const sails = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6.5, 0.12), m.timber);
      arm.position.y = 3.3;
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 5.2), canvas(0xe8dcc0));
      cloth.position.set(0.8, 3.6, 0.05);
      const g = new THREE.Group();
      g.add(arm, cloth);
      g.rotation.z = (k / 4) * Math.PI * 2;
      sails.add(g);
    }
    const face = Math.atan2(mp.side.x, mp.side.y); // toward the road
    sails.position.set(mp.x + Math.sin(face) * 3.3, mp.y + 8.4, mp.z + Math.cos(face) * 3.3);
    sails.rotation.y = face;
    sails.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
    scene.add(sails);
    windmills.push(sails);
    // Fields of grain and a fenced sheep pasture.
    for (const [a, l] of [[-70, -40], [-30, -46], [70, 44], [96, -40]] as [number, number][]) {
      const p = crownAt(S + a, l);
      field(p.x, p.z, p.yaw, 26, 18);
    }
    const pas = crownAt(S - 6, 44);
    const half = 14;
    const c = Math.cos(pas.yaw), s = Math.sin(pas.yaw);
    const corner = (u: number, v2: number): [number, number] => [pas.x + v2 * c + u * s, pas.z - v2 * s + u * c];
    const cs = [corner(-half, -half), corner(-half, half), corner(half, half), corner(half, -half)];
    for (let k = 0; k < 4; k++) fence(...cs[k], ...cs[(k + 1) % 4]);
    herds.push({ species: 'sheep', count: 7, range: { center: new THREE.Vector3(pas.x, 0, pas.z), radius: half - 2, half: new THREE.Vector2(half - 1.5, half - 1.5), yaw: pas.yaw } });
    const cowAt = crownAt(S + 70, 44);
    herds.push({ species: 'cow', count: 3, range: { center: new THREE.Vector3(cowAt.x, 0, cowAt.z), radius: 12 } });
    for (let k = 0; k < 6; k++) {
      const p = crownAt(S - 60 + rnd() * 120, (rnd() < 0.5 ? -1 : 1) * (28 + rnd() * 12));
      add(new THREE.CylinderGeometry(0.75, 0.8, 1.2, 12).rotateZ(Math.PI / 2), col(0xd8b860), p.x, p.y + 0.7, p.z, rnd() * 3);
    }
    { const q = crownAt(S - 12, 10); thornPlaces.inn = v(q.x, q.z); }
    thornPlaces.well = v(w.x, w.z);
    thornPlaces.pasture = v(pas.x, pas.z);
    thornPlaces.field = v(crownAt(S - 30, -40).x, crownAt(S - 30, -40).z);
    thornPlaces.smithy = v(crownAt(S + 2, -9).x, crownAt(S + 2, -9).z);
    clearings.push([thorn.x, thorn.z, 70]);
  }

  // ---- The wrecked caravan wagon ------------------------------------------------------------
  {
    const p = crownSite('wreck');
    const tilt = new THREE.Group();
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 3.2), m.planks);
    bed.position.y = 0.6;
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 3, 14, 1, true, -Math.PI / 2, Math.PI * 0.7), canvas(0xc8b896));
    hood.rotation.x = Math.PI / 2;
    hood.position.y = 0.9;
    tilt.add(bed, hood);
    for (const [x, z] of [[-0.95, 1.1], [0.95, -1.1]]) {
      const wl = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.14, 14), m.planks);
      wl.rotation.z = Math.PI / 2;
      wl.position.set(x, 0.3, z);
      tilt.add(wl);
    }
    tilt.position.set(p.x, p.y, p.z);
    tilt.rotation.set(0, p.yaw + 0.5, 1.15);
    batch.addObject(tilt);
    const wheel = new THREE.CylinderGeometry(0.62, 0.62, 0.14, 14).rotateX(Math.PI / 2);
    add(wheel, m.planks, p.x + 2.4, p.y + 0.08, p.z - 1.2, 0.3);
    for (let k = 0; k < 7; k++) crate(p.x + (rnd() - 0.5) * 7, p.z + (rnd() - 0.5) * 7);
    for (let k = 0; k < 6; k++) add(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 4).rotateX(0.5 + rnd()).rotateY(rnd() * 6), m.timber, p.x + (rnd() - 0.5) * 5, p.y + 0.4, p.z + (rnd() - 0.5) * 5);
    solid(3.2, 1.6, 3.4, p.x, p.y + 0.8, p.z, p.yaw + 0.5);
    interactables.push({
      pos: new THREE.Vector3(p.x - p.side.x * 2.4, p.y, p.z - p.side.y * 2.4), radius: 3,
      label: () => (hooks.flags.wreckSearched ? '' : 'Search the wrecked wagon'),
      enabled: () => !hooks.flags.wreckSearched,
      action: () => {
        hooks.flags.wreckSearched = true;
        hooks.give('healthPotion', 2);
        hooks.give('wreckLedger', 1);
        hooks.gold(35);
        hooks.toast('Among the smashed crates: two healing draughts, 35 gold, and a waterlogged ledger stamped with a merchant’s seal.');
        hooks.save();
      },
    });
  }

  // ---- The Old Watchtower: a bandit nest on the knoll -----------------------------------------
  const tower = crownSite('watchtower');
  {
    const { x, z, y } = tower;
    // The ruined tower: a broken drum of stone, its top crumbled into teeth.
    add(new THREE.CylinderGeometry(4.2, 4.8, 11, 16, 1, true), m.stone, x, y + 5.3, z, 0, 1.2);
    add(new THREE.CylinderGeometry(4.0, 4.0, 0.3, 16), m.planks, x, y + 4.2, z);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const h = 0.8 + rnd() * 2.6;
      add(new THREE.BoxGeometry(1.4, h, 0.9), m.stone, x + Math.cos(a) * 4.4, y + 10.8 + h / 2, z + Math.sin(a) * 4.4, -a);
    }
    for (let k = 0; k < 7; k++) rock(x + (rnd() - 0.5) * 16, z + (rnd() - 0.5) * 16, 0.5 + rnd() * 0.6);
    // Collide with the tower's wall but leave the doorway (facing the road) open.
    const face = Math.atan2(-tower.side.x, -tower.side.y);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const rel = Math.atan2(Math.sin(a - (Math.PI / 2 - face)), Math.cos(a - (Math.PI / 2 - face)));
      if (Math.abs(rel) < 0.3) continue;
      solid(2.1, 11, 0.8, x + Math.cos(a) * 4.5, y + 5.5, z + Math.sin(a) * 4.5, Math.PI / 2 - a);
    }
    // A palisade of stakes round the camp, open toward the road.
    for (let k = 0; k < 96; k++) {
      const a = (k / 96) * Math.PI * 2;
      const rel = Math.atan2(Math.sin(a - (Math.PI / 2 - face)), Math.cos(a - (Math.PI / 2 - face)));
      if (Math.abs(rel) < 0.3) continue;
      const px = x + Math.cos(a) * 20, pz = z + Math.sin(a) * 20;
      const h = 2.8 + ((k * 7) % 5) * 0.18;
      add(new THREE.CylinderGeometry(0.24, 0.28, h, 6), m.bark, px, heightAt(px, pz) + h / 2 - 0.2, pz);
      add(new THREE.ConeGeometry(0.25, 0.6, 6), m.bark, px, heightAt(px, pz) + h - 0.2 + 0.3, pz);
      if (k % 2 === 0) solid(0.5, 3, 2.7, px, heightAt(px, pz) + 1.5, pz, Math.PI / 2 - a);
    }
    // A cross-rail holding the stakes together.
    for (let k = 0; k < 24; k++) {
      const a0 = (k / 24) * Math.PI * 2, a1 = ((k + 1) / 24) * Math.PI * 2, am = (a0 + a1) / 2;
      const rel = Math.atan2(Math.sin(am - (Math.PI / 2 - face)), Math.cos(am - (Math.PI / 2 - face)));
      if (Math.abs(rel) < 0.42) continue;
      const mx = x + Math.cos(am) * 19.7, mz = z + Math.sin(am) * 19.7;
      add(new THREE.BoxGeometry(5.3, 0.16, 0.16), m.timber, mx, heightAt(mx, mz) + 1.6, mz, Math.PI / 2 - am + Math.PI / 2);
    }
    for (const [dx, dz, c] of [[-9, 6, 0x6a4a3a], [8, 9, 0x7a5a3a], [-6, -10, 0x5a4a3a]] as [number, number, number][]) tent(x + dx, z + dz, Math.atan2(-dx, -dz), canvas(c));
    campfire(x + 3, z - 3, 1.2);
    for (let k = 0; k < 8; k++) crate(x + (rnd() - 0.5) * 22, z + (rnd() - 0.5) * 22);
    // A gibbet by the gap: a warning to travellers.
    const g = crownAt(CROWN_SITES.watchtower.s + 10, CROWN_SITES.watchtower.lat - 24);
    add(new THREE.BoxGeometry(0.25, 4.5, 0.25), m.timber, g.x, g.y + 2.25, g.z);
    add(new THREE.BoxGeometry(1.8, 0.2, 0.2), m.timber, g.x + 0.8, g.y + 4.4, g.z);
    add(new THREE.CylinderGeometry(0.4, 0.4, 1.4, 8, 1, true), col(0x3a3632), g.x + 1.5, g.y + 3.2, g.z);
    sign(['TURN BACK', 'Toll of the Red Hand'], g.x - g.side.x * 3, g.z - g.side.y * 3, g.yaw + Math.PI / 2, 1.4);
    clearings.push([x, z, 26]);
  }

  // ---- The wolf den -------------------------------------------------------------------------------
  const den = crownSite('wolfDen');
  {
    const { x, z } = den;
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + rnd() * 0.3;
      rock(x + Math.cos(a) * (5 + rnd() * 3), z + Math.sin(a) * (5 + rnd() * 3), 1.2 + rnd() * 1.4);
    }
    for (let k = 0; k < 10; k++) add(new THREE.CylinderGeometry(0.05, 0.06, 0.6 + rnd() * 0.5, 5).rotateZ(Math.PI / 2).rotateY(rnd() * 6), col(0xe8e0c8), x + (rnd() - 0.5) * 6, heightAt(x, z) + 0.06, z + (rnd() - 0.5) * 6);
    for (let k = 0; k < 24; k++) {
      const a = rnd() * Math.PI * 2, r = 12 + rnd() * 34;
      tree(x + Math.cos(a) * r, z + Math.sin(a) * r, 0.8 + rnd() * 0.6);
    }
  }

  // ---- The Kingsmile: a waystation inn half-way to the capital -------------------------------------
  const kingsmile = crownSite('kingsmile');
  const kPlaces: Record<string, THREE.Vector3> = {};
  let stableYard = new THREE.Vector3();
  {
    const S = CROWN_SITES.kingsmile.s, L = CROWN_SITES.kingsmile.lat;
    const p = crownAt(S, L);
    const face = Math.atan2(-p.side.x, -p.side.y);
    house(p.x, p.z, face, { w: 15, d: 11, floors: 2, roof: 'tile', seed: 96301 }, { kind: 'tavern', name: 'The Kingsmile', keeper: 'oswin' });
    // The stable lodge and a farrier's forge beside the inn.
    { const q = crownAt(S + 14, L + 18); house(q.x, q.z, face, { w: 8, d: 7, floors: 2, roof: 'thatch', seed: 96302 }, { kind: 'home', name: 'the stable lodge' }); }
    { const q = crownAt(S - 24, L + 12); house(q.x, q.z, face, { w: 8, d: 6.5, floors: 1, roof: 'tile', seed: 96303 }, { kind: 'smithy', name: 'the farrier’s forge' }); }
    sign(['THE KINGSMILE', 'Ale · Beds · Stabling'], crownAt(S - 9, 8).x, crownAt(S - 9, 8).z, p.yaw + Math.PI / 2, 1.8);
    // The stable and its paddock.
    const st = crownAt(S + 22, L + 4);
    const F = (u: number, vv: number): [number, number] => [st.x + vv * Math.cos(face) + u * Math.sin(face), st.z - vv * Math.sin(face) + u * Math.cos(face)];
    for (let k = -2; k <= 2; k++) { const [x, z] = F(2.5, k * 3); add(new THREE.BoxGeometry(0.25, 3, 0.25), m.timber, x, heightAt(x, z) + 1.5, z); }
    {
      const [x, z] = F(0, 0);
      add(new THREE.BoxGeometry(6, 0.3, 15), m.planks, x, heightAt(x, z) + 3.1, z, face + Math.PI / 2);
      add(new THREE.BoxGeometry(0.4, 3.2, 15), m.planks, ...([F(-2.8, 0)[0], heightAt(x, z) + 1.6, F(-2.8, 0)[1]] as [number, number, number]), face + Math.PI / 2);
      solid(0.5, 3.2, 15, F(-2.8, 0)[0], heightAt(x, z) + 1.6, F(-2.8, 0)[1], face + Math.PI / 2);
    }
    const pd = crownAt(S + 40, L + 6);
    const c = Math.cos(pd.yaw), sn = Math.sin(pd.yaw);
    const corner = (u: number, v2: number): [number, number] => [pd.x + v2 * c + u * sn, pd.z - v2 * sn + u * c];
    const cs = [corner(-9, -8), corner(-9, 8), corner(9, 8), corner(9, -8)];
    for (let k = 0; k < 4; k++) fence(...cs[k], ...cs[(k + 1) % 4]);
    herds.push({ species: 'horse', count: 3, range: { center: new THREE.Vector3(pd.x, 0, pd.z), radius: 7, half: new THREE.Vector2(7.5, 6.5), yaw: pd.yaw } });
    stableYard = new THREE.Vector3(st.x - p.side.x * 6, 0, st.z - p.side.y * 6);
    // A well, a caravan yard with a resting wagon's goods, a bonfire for travellers.
    const w = crownAt(S - 20, L - 6);
    add(new THREE.CylinderGeometry(0.9, 1, 0.9, 12, 1, true), m.stone, w.x, w.y + 0.45, w.z);
    physics.addCylinder(new THREE.Vector3(w.x, w.y + 0.5, w.z), 0.5, 1);
    for (let k = 0; k < 9; k++) crate(crownAt(S + 8 + rnd() * 10, L - 10 + rnd() * 6).x, crownAt(S + 8 + rnd() * 10, L - 10 + rnd() * 6).z);
    const bf = crownAt(S - 6, L - 12);
    campfire(bf.x, bf.z, 1.1);
    for (const a of [0, 2.1, 4.2]) add(new THREE.CylinderGeometry(0.25, 0.25, 1.8, 8).rotateZ(Math.PI / 2), m.bark, bf.x + Math.cos(a) * 2.4, bf.y + 0.25, bf.z + Math.sin(a) * 2.4, -a);
    for (const a of [-14, 14]) lantern(crownAt(S + a, 5).x, crownAt(S + a, 5).z);
    // The Crown's wanted board.
    const wb = crownAt(S - 2, 7);
    add(new THREE.BoxGeometry(2.2, 1.4, 0.12), m.planks, wb.x, wb.y + 1.8, wb.z, wb.yaw + Math.PI / 2);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.14, 2.4, 0.14), m.timber, wb.x + wb.dir.x * s * 1.05, wb.y + 1.2, wb.z + wb.dir.y * s * 1.05);
    const posters = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.2), new THREE.MeshStandardMaterial({ map: carvedText(['WANTED', 'Red Morwen · Gorrak', 'The Barrow Dead'], 512, 300, '#e8dcb8', '#5a1a14'), roughness: 1, side: THREE.DoubleSide }));
    posters.position.set(wb.x - wb.side.x * 0.08, wb.y + 1.8, wb.z - wb.side.y * 0.08);
    posters.rotation.y = wb.yaw + Math.PI / 2;
    scene.add(posters);
    solid(2.2, 2.4, 0.2, wb.x, wb.y + 1.2, wb.z, wb.yaw + Math.PI / 2);
    kPlaces.fire = v(bf.x, bf.z);
    kPlaces.board = v(wb.x - wb.side.x * 1.6, wb.z - wb.side.y * 1.6);
    kPlaces.door = v(crownAt(S, L - 7).x, crownAt(S, L - 7).z);
    kPlaces.stable = stableYard.clone().setY(heightAt(stableYard.x, stableYard.z));
    kPlaces.yard = v(crownAt(S + 12, L - 8).x, crownAt(S + 12, L - 8).z);
    clearings.push([p.x, p.z, 44]);
  }

  // ---- A cottage the orcs burnt ---------------------------------------------------------------
  const smokeAt: THREE.Vector3[] = [];
  {
    const p = crownSite('cottage');
    const burnt = { ...m, plaster: charred, timber: charred, thatch: charred, planks: charred, slate: charred, tile: charred };
    house(p.x, p.z, Math.atan2(-p.side.x * Math.sign(CROWN_SITES.cottage.lat), -p.side.y * Math.sign(CROWN_SITES.cottage.lat)), { w: 8, d: 6.5, floors: 1, roof: 'thatch', seed: 96401 }, { name: '__ruin' }, burnt);
    smokeAt.push(new THREE.Vector3(p.x, p.y + 4, p.z));
    for (let k = 0; k < 4; k++) add(new THREE.BoxGeometry(0.2, 0.2, 1.6 + rnd()).rotateY(rnd() * 3), charred, p.x + (rnd() - 0.5) * 9, p.y + 0.1, p.z + (rnd() - 0.5) * 9);
    const q = crownAt(CROWN_SITES.cottage.s + 6, CROWN_SITES.cottage.lat + 8);
    add(new THREE.BoxGeometry(0.6, 0.9, 0.18), m.stone, q.x, q.y + 0.45, q.z, q.yaw);
  }

  // ---- Gorrak's warcamp -------------------------------------------------------------------------
  const orcAt = crownSite('orcCamp');
  {
    const { x, z, y } = orcAt;
    const face = Math.atan2(-orcAt.side.x, -orcAt.side.y);
    // A ring of sharpened stakes, angled out, with a gap toward the road.
    for (let k = 0; k < 56; k++) {
      const a = (k / 56) * Math.PI * 2;
      const rel = Math.atan2(Math.sin(a - (Math.PI / 2 - face)), Math.cos(a - (Math.PI / 2 - face)));
      if (Math.abs(rel) < 0.28) continue;
      const px = x + Math.cos(a) * 24, pz = z + Math.sin(a) * 24, py = heightAt(px, pz);
      const stake = new THREE.CylinderGeometry(0.1, 0.24, 3.4, 6);
      stake.rotateZ(-0.35);
      stake.rotateY(-a);
      add(stake, m.bark, px, py + 1.4, pz);
      add(new THREE.ConeGeometry(0.12, 0.6, 5).rotateZ(-0.35).rotateY(-a), m.bark, px + Math.cos(a) * 0.6, py + 3.2, pz + Math.sin(a) * 0.6);
      solid(0.5, 3, 2.8, px, py + 1.5, pz, Math.PI / 2 - a);
    }
    // Hide tents, a war totem with skulls, a big bonfire, a cage, weapon racks.
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.6;
      tent(x + Math.cos(a) * 14, z + Math.sin(a) * 14, -a - Math.PI / 2, hide, 1.25);
    }
    add(new THREE.CylinderGeometry(0.35, 0.45, 7, 8), m.bark, x - 4, y + 3.5, z + 2);
    for (let k = 0; k < 3; k++) add(new THREE.SphereGeometry(0.32, 8, 6).scale(1, 1.15, 1.1), col(0xe8e0c8), x - 4 + Math.cos(k * 2.1) * 0.4, y + 5.2 + k * 0.6, z + 2 + Math.sin(k * 2.1) * 0.4);
    add(new THREE.BoxGeometry(2.6, 0.3, 0.3), m.bark, x - 4, y + 6.4, z + 2);
    for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.18, 1.2, 5).rotateZ(s * Math.PI / 2), col(0xe8e0c8), x - 4 + s * 1.6, y + 6.4, z + 2);
    physics.addCylinder(new THREE.Vector3(x - 4, y + 3.5, z + 2), 3.5, 0.5);
    campfire(x + 3, z - 2, 1.8);
    const cage = new THREE.Group();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), col(0x3a3632));
      bar.position.set(Math.cos(a) * 1.2, 1.2, Math.sin(a) * 1.2);
      cage.add(bar);
    }
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.12, 12), m.planks);
    lid.position.y = 2.4;
    cage.add(lid);
    cage.position.set(x + 9, heightAt(x + 9, z + 7), z + 7);
    batch.addObject(cage);
    physics.addCylinder(new THREE.Vector3(x + 9, heightAt(x + 9, z + 7) + 1.2, z + 7), 1.2, 1.3);
    for (let k = 0; k < 6; k++) crate(x + (rnd() - 0.5) * 30, z + (rnd() - 0.5) * 30, rnd() * 3, 1.2);
    clearings.push([x, z, 30]);
    // A warning on the road: skulls on stakes.
    for (const a of [-8, 8]) {
      const q = crownAt(CROWN_SITES.orcCamp.s + a, -9);
      add(new THREE.CylinderGeometry(0.08, 0.1, 2.4, 5), m.bark, q.x, q.y + 1.2, q.z);
      add(new THREE.SphereGeometry(0.22, 8, 6), col(0xe8e0c8), q.x, q.y + 2.5, q.z);
    }
  }

  // ---- The Barrow of the Old Kings ------------------------------------------------------------
  const barrow = crownSite('barrow');
  {
    const { x, z } = barrow;
    const grassy = col(0x5a7a3a, 1);
    for (const [dx, dz, r] of [[0, 0, 9], [-20, 10, 6], [16, 14, 5.5]] as [number, number, number][]) {
      add(new THREE.SphereGeometry(r, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1), grassy, x + dx, heightAt(x + dx, z + dz) - 0.3, z + dz);
      physics.addCylinder(new THREE.Vector3(x + dx, heightAt(x + dx, z + dz) + r * 0.15, z + dz), r * 0.2, r * 0.85);
    }
    // The barrow door: two uprights and a lintel, darkness behind.
    const face = Math.atan2(-barrow.side.x, -barrow.side.y);
    const dx = x + Math.sin(face) * 7.6, dz = z + Math.cos(face) * 7.6, dy = heightAt(dx, dz);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.8, 2.8, 0.8), m.stone, dx + Math.cos(face) * s * 1.3, dy + 1.4, dz - Math.sin(face) * s * 1.3, face);
    add(new THREE.BoxGeometry(3.6, 0.7, 1.0), m.stone, dx, dy + 3.1, dz, face);
    add(new THREE.PlaneGeometry(1.8, 2.6), col(0x050505), dx - Math.sin(face) * 0.2, dy + 1.3, dz - Math.cos(face) * 0.2, face);
    // A ring of standing stones; one bears the Sunwheel.
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const sx = x + Math.cos(a) * 26, sz = z + Math.sin(a) * 26, sy = heightAt(sx, sz);
      const h = 3 + rnd() * 1.6;
      add(new THREE.BoxGeometry(1.1, h, 0.7), m.stone, sx, sy + h / 2 - 0.2, sz, -a + rnd() * 0.3);
      solid(1.1, h, 0.7, sx, sy + h / 2, sz, -a);
    }
    const ws = crownAt(CROWN_SITES.barrow.s, CROWN_SITES.barrow.lat - 26);
    const wheel = new THREE.Mesh(new THREE.CircleGeometry(0.4, 24), new THREE.MeshStandardMaterial({ map: sunwheelTexture('rgba(150, 230, 255, 1)'), emissive: 0x80e0ff, emissiveMap: sunwheelTexture('rgba(150, 230, 255, 1)'), emissiveIntensity: 0.4, transparent: true }));
    glows.push(wheel.material as THREE.MeshStandardMaterial);
    wheel.position.set(ws.x + Math.sin(face) * 0.4, ws.y + 2.2, ws.z + Math.cos(face) * 0.4);
    wheel.rotation.y = face;
    scene.add(wheel);
    interactables.push({
      pos: new THREE.Vector3(ws.x + Math.sin(face) * 1.6, ws.y, ws.z + Math.cos(face) * 1.6), radius: 2.4,
      label: () => 'Read the old stone',
      enabled: () => true,
      action: () => hooks.toast('Under the Sunwheel: “Here sleep the first kings, who held the wheel. Wake them not before it turns.” The carving is far older than the Crown.'),
    });
    for (let k = 0; k < 14; k++) {
      const a = rnd() * Math.PI * 2, r = 30 + rnd() * 16;
      const tx = x + Math.cos(a) * r, tz = z + Math.sin(a) * r;
      const ty = heightAt(tx, tz);
      add(new THREE.CylinderGeometry(0.12, 0.28, 4, 6), col(0x3a3028), tx, ty + 2, tz);
      for (let b = 0; b < 3; b++) add(new THREE.CylinderGeometry(0.03, 0.06, 1.6, 4).rotateZ(0.9 + b * 0.4).rotateY(rnd() * 6), col(0x3a3028), tx, ty + 3 + b * 0.3, tz);
    }
    clearings.push([x, z, 32]);
  }

  // ---- The capital's fields, and the Gate Market before the East Gate --------------------------
  const gate = crownSite('gateMarket');
  const marketSpots: THREE.Vector3[] = [];
  {
    for (let s = CROWN_SITES.barrow.s + 80; s < LEN - 120; s += 40) {
      for (const side of [-1, 1]) {
        if (rnd() < 0.25) continue;
        const p = crownAt(s, side * (22 + rnd() * 6));
        field(p.x, p.z, p.yaw, 30, 16);
      }
    }
    const S = CROWN_SITES.gateMarket.s;
    const colours = [0xb8402e, 0x2f5f9a, 0x3d7a45, 0xc9922a, 0x7a3f8a, 0x2f7f86];
    for (let k = 0; k < 6; k++) {
      const side = k % 2 ? 1 : -1;
      const p = crownAt(S - 36 + Math.floor(k / 2) * 14, side * 10);
      const face = Math.atan2(-p.side.x * side, -p.side.y * side);
      const c = Math.cos(face), sn = Math.sin(face);
      for (const [u, vv] of [[-0.9, -1.4], [-0.9, 1.4], [0.9, -1.4], [0.9, 1.4]]) add(new THREE.BoxGeometry(0.12, 2.6, 0.12), m.timber, p.x + vv * c + u * sn, p.y + 1.3, p.z - vv * sn + u * c);
      add(new THREE.BoxGeometry(3, 0.9, 0.9), m.planks, p.x + sn * 0.5, p.y + 0.45, p.z + c * 0.5, face);
      add(new THREE.BoxGeometry(3.4, 0.06, 2.3), col(colours[k]), p.x, p.y + 2.7, p.z, face);
      solid(3, 1, 0.9, p.x + sn * 0.5, p.y + 0.5, p.z + c * 0.5, face);
      marketSpots.push(v(p.x + sn * 1.6, p.z + c * 1.6));
    }
  }

  batch.build(scene);

  // ---- People --------------------------------------------------------------------------------------
  const settlements: CrownRoad['settlements'] = [];
  const mk = (id: string, center: THREE.Vector3, radius: number, people: { id: string; name: string; title: string; look: Look; post: THREE.Vector3; yaw?: number; activity: ScheduleEntry['activity']; hours: [number, number]; lines: NpcRecord['lines'] }[], crowd: { job: string; n: number; activity: ScheduleEntry['activity']; spots: THREE.Vector3[]; looks: Look[]; lines: NpcRecord['lines']; title: string }[] = []) => {
    const places = new Map<string, Place>();
    const records: NpcRecord[] = [];
    places.set('home', { id: 'home', spots: [center.clone()], indoors: true });
    for (const p of people) {
      places.set('post:' + p.id, { id: 'post:' + p.id, spots: [p.post], yaw: p.yaw });
      const [a, b] = p.hours;
      const schedule: ScheduleEntry[] = b > 24
        ? [{ from: 0, activity: p.activity, place: 'post:' + p.id }, { from: b - 24, activity: 'sleep', place: 'home' }, { from: a, activity: p.activity, place: 'post:' + p.id }]
        : [{ from: 0, activity: 'sleep', place: 'home' }, { from: a, activity: p.activity, place: 'post:' + p.id }, { from: b, activity: 'sleep', place: 'home' }];
      records.push({ id: p.id, name: p.name, title: p.title, job: p.id, settlement: id, look: p.look, schedule, lines: p.lines, named: true });
    }
    let n = 0;
    for (const c of crowd) {
      const pid = 'work:' + c.job;
      places.set(pid, { id: pid, spots: c.spots });
      for (let i = 0; i < c.n; i++, n++) {
        const j = (h: number) => h + (rnd() - 0.5);
        records.push({
          id: `${id}-${n}`, name: c.title, title: c.title, job: c.job, settlement: id, look: c.looks[i % c.looks.length], lines: c.lines,
          schedule: [{ from: 0, activity: 'sleep', place: 'home' }, { from: j(7), activity: c.activity, place: pid }, { from: j(20), activity: 'sleep', place: 'home' }],
        });
      }
    }
    settlements.push({ settlement: { id, center, radius, places, nodes: [], edges: [] }, records });
  };
  const peasant = (female: boolean, hair: number, skin: number, linen: number, cloth?: number): Look => ({ body: female ? 'female' : 'male', outfit: 'peasant', hair: female ? 'buns' : 'simpleparted', beard: !female && rnd() < 0.4, hairColor: hair, skin, linen, cloth, height: female ? 1.64 : 1.76 });
  const guard = (female: boolean): Look => ({ body: female ? 'female' : 'male', outfit: 'ranger', hair: female ? 'buns' : 'buzzed', hairColor: 0x3a2618, skin: female ? 0xfff0e6 : 0xe0b894, cloth: 0x24467e, pauldron: true, height: female ? 1.74 : 1.84 });
  {
    const o = crownSite('outpost');
    mk('crownOutpost', v(o.x, o.z), 40, [
      { id: 'brask', name: 'Sergeant Brask', title: 'Crown Checkpoint · Bounties', post: v(o.x - o.side.x * 8, o.z - o.side.y * 8), yaw: o.yaw, activity: 'idle', hours: [6, 22],
        lines: { any: ['Past this barrier the Crown’s writ runs thin. Bandits at the Old Watchtower, orcs in the marches beyond the Kingsmile.', 'Registered at the Academy? Then the road’s yours. Watch it bite back.'] },
        look: { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x6a4428, skin: 0xe0b894, cloth: 0x24467e, pauldron: true, bracers: true, height: 1.88 } },
    ], [{ job: 'checkpointGuard', n: 3, activity: 'patrol', spots: [v(o.x - o.side.x * 10, o.z - o.side.y * 10), v(crownAt(CROWN_SITES.outpost.s + 8, 2).x, crownAt(CROWN_SITES.outpost.s + 8, 2).z), v(crownAt(CROWN_SITES.outpost.s - 8, -2).x, crownAt(CROWN_SITES.outpost.s - 8, -2).z)], looks: [guard(false), guard(true)], lines: { any: ['Papers? No? Academy tabard will do.', 'Quiet today. Too quiet. I hate quiet.'] }, title: 'Crown Guard' }]);
  }
  mk('thornfield', v(thorn.x, thorn.z), 90, [
    { id: 'hedda', name: 'Hedda Thorne', title: 'Shepherd of Thornfield', post: thornPlaces.pasture.clone().add(new THREE.Vector3(3, 0, 3)), activity: 'work', hours: [6, 20],
      lines: { any: ['The wolves from the den in the north wood took three ewes this week. Three!', 'Thornfield wool goes all the way to the capital looms.'] },
      look: { body: 'female', outfit: 'peasant', hair: 'buns', hairColor: 0x8a3f22, skin: 0xe0b894, linen: 0xd8c29a, cloth: 0x6a7f3a, height: 1.68 } },
    { id: 'tamsin', name: 'Tamsin Mead', title: 'Keeper of the Thornfield Arms', post: thornPlaces.inn, activity: 'idle', hours: [8, 25],
      lines: { any: ['Honey ale, brewed with our own bees. Strongest thing between the Glen and the capital.', 'Orcs burnt the Ashby place last month. Nobody sleeps sound east of the Kingsmile.'] },
      look: { body: 'female', outfit: 'peasant', hair: 'long', hairColor: 0xd2b26a, skin: 0xfff0e6, linen: 0xe8c8c0, height: 1.66 } },
    { id: 'brennick', name: 'Brennick', title: 'Smith of Thornfield', post: thornPlaces.smithy, activity: 'work', hours: [7, 19],
      lines: { any: ['Horseshoes, ploughshares, the odd sword. Mostly horseshoes.'] },
      look: { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x1f1a17, skin: 0xa8744e, cloth: 0x5a5a5a, height: 1.86 } },
  ], [
    { job: 'farmer', n: 5, activity: 'farm', spots: [thornPlaces.field, thornPlaces.field.clone().add(new THREE.Vector3(6, 0, 4)), thornPlaces.field.clone().add(new THREE.Vector3(-5, 0, 3))], looks: [peasant(false, 0x6a4428, 0xe0b894, 0xd8c29a), peasant(true, 0x3a2618, 0xfff0e6, 0xe8d8b8)], lines: { any: ['Good harvest if the orcs keep east.', 'Mind the furrows, friend.'] }, title: 'Farmer of Thornfield' },
    { job: 'villager', n: 4, activity: 'talk', spots: [thornPlaces.well, thornPlaces.well.clone().add(new THREE.Vector3(3, 0, 2))], looks: [peasant(true, 0xb8b4ae, 0xe0b894, 0xc9dbe8), peasant(false, 0x8a3f22, 0xfff0e6, 0xe8c8c0)], lines: { any: ['A traveller! Any news from the capital?', 'The shrine of the Dawn down the road heals the weary. My gran swears by it.'] }, title: 'Villager of Thornfield' },
  ]);
  mk('kingsmile', v(kingsmile.x, kingsmile.z), 70, [
    { id: 'oswin', name: 'Oswin Hale', title: 'Keeper of the Kingsmile', post: kPlaces.door, activity: 'idle', hours: [6, 26],
      lines: { any: ['Half-way between the Glen and the King. Every traveller stops at the Kingsmile.', 'A caravan of mine never arrived. Found smashed by the road near Thornfield, they say.'] },
      look: { body: 'male', outfit: 'peasant', hair: 'simpleparted', beard: true, hairColor: 0xb8b4ae, skin: 0xfff0e6, linen: 0xf0e0a8, height: 1.78 } },
    { id: 'aldo', name: 'Brother Aldo', title: 'Wandering Priest of the Dawn', post: kPlaces.fire.clone().add(new THREE.Vector3(2, 0, 2)), activity: 'sit', hours: [8, 23],
      lines: { any: ['The Barrow of the Old Kings stirs after dark. The dead there remember a wheel.', 'Rest by the fire. The Dawn keeps the night short.'] },
      look: { body: 'male', outfit: 'peasant', hair: 'buzzed', hairColor: 0xe6e2da, skin: 0xe0b894, linen: 0xfff4dc, cloth: 0xe8c060, height: 1.72 } },
    { id: 'rook', name: 'Rook Fenwick', title: 'Stablemaster of the Kingsmile', post: kPlaces.stable, activity: 'work', hours: [6, 21],
      lines: { any: ['A fresh horse gets you to the capital before the orcs smell you.', 'Coach to the capital and back to the Glen, on the hour.'] },
      look: { body: 'female', outfit: 'ranger', hair: 'buzzedfemale', hairColor: 0x3a2618, skin: 0xa8744e, cloth: 0x7a5a3a, height: 1.72 } },
  ], [
    { job: 'traveller', n: 4, activity: 'sit', spots: [kPlaces.fire.clone().add(new THREE.Vector3(-2.2, 0, 0.5)), kPlaces.fire.clone().add(new THREE.Vector3(0.6, 0, -2.3)), kPlaces.fire.clone().add(new THREE.Vector3(2.2, 0, -0.6))], looks: [peasant(false, 0x3a2618, 0xe0b894, 0xd8c29a, 0x2f7f86), peasant(true, 0x1f1a17, 0x7a4e32, 0xe8c8c0, 0x7a3f8a)], lines: { any: ['Orcs east of here. We wait for the Crown patrol and go together.', 'The Kingsmile’s ale is fine. The company could be better. Present company excepted.'] }, title: 'Traveller' },
    { job: 'teamster', n: 3, activity: 'work', spots: [kPlaces.yard, kPlaces.yard.clone().add(new THREE.Vector3(3, 0, -2))], looks: [peasant(false, 0x6a4428, 0xa8744e, 0xd8c29a, 0x7a5a3a)], lines: { any: ['Royal supply wagon. Grain up, steel down.', 'Gorrak’s lot hit a wagon last week. We ride with guards now.'] }, title: 'Teamster' },
    { job: 'adventurer', n: 3, activity: 'talk', spots: [kPlaces.board, kPlaces.board.clone().add(new THREE.Vector3(1.5, 0, 1))], looks: [{ body: 'female', outfit: 'ranger', hair: 'long', hairColor: 0xb0562a, skin: 0xfff0e6, cloth: 0x3d7a45, hood: true, height: 1.72 }, { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x3a2618, skin: 0x7a4e32, cloth: 0x8a3a2a, pauldron: true, height: 1.84 }], lines: { any: ['That bounty on Gorrak would set me up for a year. If I lived.', 'Red Morwen? I’d rather fight the orcs. Orcs don’t hold grudges.'] }, title: 'Adventurer' },
  ]);
  mk('gateMarket', v(gate.x, gate.z), 60, [], [
    { job: 'hawker', n: 6, activity: 'shop', spots: marketSpots, looks: [peasant(false, 0x1f1a17, 0xa8744e, 0xe8c8c0, 0xb8402e), peasant(true, 0x6a4428, 0xfff0e6, 0xd9cfe8, 0x2f5f9a), peasant(false, 0xd2b26a, 0xe0b894, 0xd8c29a, 0x3d7a45)], lines: { any: ['Last stall before the gate! Cheaper than inside, I promise.', 'Pies! Ribbons! Lucky charms against orcs!'] }, title: 'Gate Market Hawker' },
    { job: 'pilgrim', n: 3, activity: 'idle', spots: marketSpots.slice(0, 3).map((s) => s.clone().add(new THREE.Vector3(2, 0, -3))), looks: [peasant(true, 0xe6e2da, 0xe0b894, 0xfff4dc, 0xe0c060)], lines: { any: ['We’ve walked from Elder Glen to see the Temple of the Dawn.', 'The orcs let us pass. I think the Dawn was watching.'] }, title: 'Pilgrim' },
  ]);

  const threats = new CrownThreats(scene, fx, beasts, new Bolts(scene), hooks, tower, orcAt, barrow, den);
  let t = 0;
  return {
    settlements, clearings, interactables, herds, stableYard, threats,
    update(dt: number, player: Player, night: number) {
      t += dt;
      const p = player.pos;
      const near = (q: THREE.Vector3, r: number) => Math.hypot(p.x - q.x, p.z - q.z) < r;
      for (const f of fires) {
        if (!near(f.pos, 220)) continue;
        f.mat.emissiveIntensity = 1.3 + Math.sin(t * 13 + f.pos.x) * 0.25 + night;
        if (Math.random() < dt * 18 * f.size) fx.add.spawn({ pos: f.pos, vel: new THREE.Vector3(0, 1.6, 0), spread: 0.4 * f.size, count: 1, life: [0.4, 0.8], size: [0.45 * f.size, 0.06], color: 0xffc060, color2: 0xff3a00, jitter: 0.3 });
      }
      for (const s of smokeAt) if (near(s, 260) && Math.random() < dt * 4) fx.add.spawn({ pos: s, vel: new THREE.Vector3(0.3, 1.2, 0), spread: 1.2, count: 1, life: [2, 3.5], size: [1.2, 3], color: 0x3a3632, color2: 0x8a8682, gravity: -0.3, upBias: 0.6 });
      for (const g of glows) g.emissiveIntensity = 0.3 + night * 2.4;
      for (const w of windmills) w.rotation.z -= dt * 0.6;
      threats.update(dt, player);
    },
  };

  /** A field of grain: rows of golden tufts on tilled earth (one batched mesh per field). */
  function field(x: number, z: number, yaw: number, len: number, wid: number) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (let r = -wid / 2; r <= wid / 2; r += 1.6) {
      const cx = x + r * c, cz = z - r * s;
      add(new THREE.BoxGeometry(0.9, 0.12, len), col(0x5a4630, 1), cx, heightAt(cx, cz) + 0.02, cz, yaw);
      for (let u = -len / 2 + 0.8; u < len / 2; u += 1.8) {
        const px = cx + u * s, pz = cz + u * c;
        add(new THREE.ConeGeometry(0.42, 1.1, 5), col(0xd8b040, 1), px, heightAt(px, pz) + 0.55, pz, rnd() * 3);
      }
    }
    GRASS_MASKS.push({ x, z, r: Math.max(len, wid) / 2, amount: 0.85 });
  }
}
const windmills: THREE.Object3D[] = [];

// ---- The camps: bandits at the watchtower, orcs in the warcamp, the dead in the barrow, wolves in the den ----

const MORWEN_LOOK: Look = { body: 'female', outfit: 'ranger', hood: false, hair: 'long', hairColor: 0xb8402e, skin: 0xfff0e6, cloth: 0x7a1a1a, pauldron: true, bracers: true, height: 1.78 };
const RAIDER_LOOKS: Look[] = [
  { body: 'male', outfit: 'ranger', hood: true, hair: 'buzzed', beard: true, hairColor: 0x2a1a10, skin: 0xe0b894, cloth: 0x7a2a22, height: 1.8 },
  { body: 'female', outfit: 'ranger', hood: true, hair: 'long', hairColor: 0x3a2618, skin: 0xa8744e, cloth: 0x6a2a2a, height: 1.7 },
  { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x6a5a48, skin: 0xfff0e6, cloth: 0x5a3a2a, pauldron: true, height: 1.84 },
];

/** How long a cleared camp stays empty (seconds of play). */
export const CAMP_RESPAWN = 420;

export class CrownThreats {
  bandits: Bandit[] = [];
  orcs: OrcMob[] = [];
  dead: Undead[] = [];
  wolves: Beast[] = [];
  private cleared = { bandits: -1e9, orcs: -1e9, wolves: -1e9 };
  private t = 0;
  private bossShown: string | null = null;

  constructor(
    private scene: THREE.Scene, private fx: FX, private beasts: BeastSpawner, private bolts: Bolts, private hooks: CrownRoadHooks,
    readonly tower: { x: number; z: number; y: number }, readonly orcCamp: { x: number; z: number; y: number },
    readonly barrow: { x: number; z: number; y: number }, readonly den: { x: number; z: number; y: number },
  ) {}

  /** Is the player in a camp that still holds enemies (no resting, no fast travel)? */
  hostileAt(p: THREE.Vector3) {
    const inside = (c: { x: number; z: number }, r: number) => Math.hypot(p.x - c.x, p.z - c.z) < r;
    return (this.bandits.some((b) => !b.dead) && inside(this.tower, 34)) || (this.orcs.some((o) => o.alive) && inside(this.orcCamp, 36)) || (this.dead.some((u) => u.alive) && inside(this.barrow, 40));
  }

  /** Counts (tests, the map). */
  stats() {
    return { bandits: this.bandits.filter((b) => !b.dead).length, orcs: this.orcs.filter((o) => o.alive).length, dead: this.dead.filter((u) => u.alive).length, wolves: this.wolves.filter((w) => w.alive).length };
  }

  /** Fill every camp now, as if the player had come near (tests). */
  fillAll() {
    this.spawnBandits();
    this.spawnOrcs();
    this.spawnWolves();
  }

  private spawnBandits() {
    const { x, z } = this.tower;
    const roles: ('chief' | 'sword' | 'crossbow')[] = ['chief', 'sword', 'sword', 'crossbow', 'sword', 'crossbow'];
    roles.forEach((role, i) => {
      const a = (i / roles.length) * Math.PI * 2;
      const r = i === 0 ? 2 : 9 + (i % 2) * 4;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const b = new Bandit(role, new THREE.Vector3(px, heightAt(px, pz) + 0.3, pz), this.scene, this.bolts, undefined, i === 0 ? MORWEN_LOOK : RAIDER_LOOKS[i % RAIDER_LOOKS.length]);
      if (role === 'chief') {
        b.kind = 'morwen';
        b.name = 'Red Morwen';
      } else b.name = role === 'crossbow' ? 'Red Hand Crossbowman' : 'Red Hand Cutthroat';
      this.bandits.push(b);
    });
  }

  private spawnOrcs() {
    const { x, z } = this.orcCamp;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      const r = i === 0 ? 3 : 8 + (i % 3) * 3;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const o = new OrcMob(new THREE.Vector3(px, heightAt(px, pz) + 0.3, pz), this.scene, this.fx);
      if (i === 0) {
        o.kind = 'gorrak';
        o.hp = o.maxHp = 420;
        o.group.scale.setScalar(1.3);
      }
      this.orcs.push(o);
    }
  }

  private spawnWolves() {
    const { x, z } = this.den;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      this.wolves.push(this.beasts.spawn('green', x + Math.cos(a) * 4, z + Math.sin(a) * 4));
    }
    if (Math.random() < 0.4) this.wolves.push(this.beasts.spawn('dire', x, z));
  }

  private spawnDead() {
    const { x, z } = this.barrow;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.random() * 0.4;
      const r = 12 + Math.random() * 8;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      this.dead.push(new Undead(i % 3 === 0 ? 'zombie' : 'skeleton', new THREE.Vector3(px, heightAt(px, pz), pz), Math.random() * 6, this.scene, this.fx));
    }
  }

  update(dt: number, player: Player) {
    this.t += dt;
    const p = player.pos;
    const dist = (c: { x: number; z: number }) => Math.hypot(p.x - c.x, p.z - c.z);
    const hour = this.hooks.hour();
    const night = hour >= 21 || hour < 5;
    // Camps fill when you come within sight (but not on top of them), and pack up when you're far.
    const tower = dist(this.tower), orc = dist(this.orcCamp), barrow = dist(this.barrow), den = dist(this.den);
    if (!this.bandits.length && tower < 170 && tower > 45 && this.t - this.cleared.bandits > CAMP_RESPAWN) this.spawnBandits();
    if (!this.orcs.length && orc < 170 && orc > 48 && this.t - this.cleared.orcs > CAMP_RESPAWN) this.spawnOrcs();
    if (!this.wolves.length && den < 150 && den > 30 && this.t - this.cleared.wolves > CAMP_RESPAWN * 0.6) this.spawnWolves();
    if (!this.dead.length && night && barrow < 140) this.spawnDead();

    for (const b of this.bandits) b.update(dt, player);
    for (const o of this.orcs) o.update(dt, player);
    for (const u of this.dead) u.update(dt, player, this.dead);
    this.bolts.update(dt, player);
    // (Wolves are the beast spawner's to update.)

    const sweep = <T>(list: T[], gone: (x: T) => boolean, dispose: (x: T) => void, key?: 'bandits' | 'orcs' | 'wolves') => {
      if (!list.length) return list;
      const keep = list.filter((x) => !gone(x));
      for (const x of list) if (gone(x)) dispose(x);
      if (!keep.length && key) this.cleared[key] = this.t;
      return keep;
    };
    this.bandits = sweep(this.bandits, (b) => b.dead, (b) => b.dispose(), 'bandits');
    this.orcs = sweep(this.orcs, (o) => o.dead, (o) => o.dispose(), 'orcs');
    this.dead = sweep(this.dead, (u) => u.dead, (u) => u.dispose());
    this.wolves = sweep(this.wolves, (w) => !w.alive, () => {}, 'wolves');
    // The dead sink back into their mounds at dawn.
    if (!night && this.dead.length && barrow > 60) {
      for (const u of this.dead) u.dispose();
      this.dead = [];
    }
    // Far away: pack the living up (they'll be there when you come back).
    if (tower > 360 && this.bandits.length) { for (const b of this.bandits) b.dispose(); this.bandits = []; }
    if (orc > 360 && this.orcs.length) { for (const o of this.orcs) o.dispose(); this.orcs = []; }
    if (den > 320 && this.wolves.length) { for (const w of this.wolves) if (w.alive) { w.alive = false; w.dispose(); } this.wolves = []; }
    if (barrow > 320 && this.dead.length) { for (const u of this.dead) u.dispose(); this.dead = []; }

    // The chiefs have their names on the boss bar while you fight them.
    const morwen = this.bandits.find((b) => b.kind === 'morwen' && !b.dead);
    const gorrak = this.orcs.find((o) => o.kind === 'gorrak' && o.alive);
    const show = morwen && morwen.position.distanceTo(p) < 26 ? 'morwen' : gorrak && gorrak.position.distanceTo(p) < 28 ? 'gorrak' : null;
    if (show === 'morwen') this.hooks.bossBar(morwen!, 'Red Morwen of the Red Hand');
    else if (show === 'gorrak') this.hooks.bossBar(gorrak!, 'Gorrak Bonebreaker');
    else if (this.bossShown) this.hooks.bossBar(null);
    this.bossShown = show;
  }

  clear() {
    for (const b of this.bandits) b.dispose();
    for (const o of this.orcs) o.dispose();
    for (const u of this.dead) u.dispose();
    for (const w of this.wolves) if (w.alive) { w.alive = false; w.dispose(); }
    this.bandits = [];
    this.orcs = [];
    this.dead = [];
    this.wolves = [];
    this.bolts.clear();
    this.cleared = { bandits: -1e9, orcs: -1e9, wolves: -1e9 };
    if (this.bossShown) this.hooks.bossBar(null);
    this.bossShown = null;
  }
}
