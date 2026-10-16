import * as THREE from 'three';
import { heightAt } from '../../world/terrainHeight';
import { physics } from '../../physics/physics';
import { HOLLOW_RIDGE } from '../../world/kingsRoad';
import { ISLAND_PORTS } from '../../world/sea/islandPortsData';
import type { WorldMats } from '../../world/buildings';
import type { Realm } from '../realm';
import { hollowRidgeDef } from './hollowRidge';
import { drownedShrineDef } from './drownedShrine';
import type { KitDungeonDef } from '../kit/build';
import { kitTestDef } from './kitTest';

// ---------------------------------------------------------------------------
// Where this update's new dungeons open onto the world (Dungeons Reborn):
//   Hollow Ridge Caves  the cave mouth in the ridge behind Varn's bandit camp
//                       (world/kingsRoad.ts already carved it; the camp and
//                       its quest are left as they are)
//   The Drowned Shrine  a sunken stair under a ruined portico on Sunken
//                       Spire's island, a short walk up from the quay
// The crypt keeps its own door on the hill (world/crypt.ts).
// ---------------------------------------------------------------------------

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** The Drowned Shrine's door, in Sunken Spire's harbour frame (a seaward, b along the shore). */
export function shrineSpot() {
  const def = ISLAND_PORTS.find((p) => p.id === 'sunkenSpire')!;
  const f = new THREE.Vector2(Math.cos(def.dir), Math.sin(def.dir));
  const s = new THREE.Vector2(-f.y, f.x);
  const at = (a: number, b: number) => new THREE.Vector2(def.land[0] + f.x * a + s.x * b, def.land[1] + f.y * a + s.y * b);
  // Up from the quay, past the houses on the shore side away from the drowned columns.
  const p = at(-12, 33);
  const toQuay = at(8, 0).sub(p).normalize();
  return { x: p.x, z: p.y, face: Math.atan2(toQuay.x, toQuay.y) };
}

/** A ruined portico over a stair going down into the dark. */
function buildShrinePortico(scene: THREE.Scene, m: WorldMats) {
  const sp = shrineSpot();
  const y = heightAt(sp.x, sp.z);
  const g = new THREE.Group();
  const stone = (m.bridgeStone ?? m.stone) as THREE.Material;
  const sea = new THREE.MeshStandardMaterial({ color: 0xa4b4ac, roughness: 0.9 });
  const dark = new THREE.MeshBasicMaterial({ color: 0x020606 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x2a6a70, emissive: 0x40e0d8, emissiveIntensity: 1.4 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, yy: number, z: number, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, yy, z);
    mesh.rotation.set(0, ry, rz);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };
  // A plinth, four columns (one broken), a lintel with the wheel on it, and the dark stair mouth.
  add(new THREE.BoxGeometry(7, 0.6, 6), stone, 0, 0.1, 0);
  for (const [x, z, h] of [[-2.6, -2, 4.4], [2.6, -2, 4.4], [-2.6, 2, 4.4], [2.6, 2, 1.8]] as const) {
    add(new THREE.CylinderGeometry(0.42, 0.5, h, 12), sea, x, 0.4 + h / 2, z);
  }
  add(new THREE.BoxGeometry(6.4, 0.6, 1.0), sea, 0, 4.9, -2);
  const wheel = add(new THREE.TorusGeometry(0.7, 0.08, 6, 24), glow, 0, 4.9, -1.46);
  void wheel;
  for (let a = 0; a < 8; a++) {
    const ray = add(new THREE.BoxGeometry(0.06, 0.5, 0.06), glow, Math.sin((a * Math.PI) / 4) * 0.42, 4.9 + Math.cos((a * Math.PI) / 4) * 0.42, -1.46, 0, -(a * Math.PI) / 4);
    void ray;
  }
  // Steps down (they end in the dark; the door is the way in).
  // The stair mouth: a black well in the plinth with its top steps showing.
  add(new THREE.PlaneGeometry(2.6, 3.4), dark, 0, 0.415, 0.9).rotation.x = -Math.PI / 2;
  for (let k = 0; k < 2; k++) add(new THREE.BoxGeometry(2.6, 0.12, 0.5), stone, 0, 0.38 - k * 0.22, -0.55 + k * 0.5);
  for (const sx of [-1.6, 1.6]) add(new THREE.BoxGeometry(0.3, 0.8, 3.6), stone, sx, 0.4, 0.8);
  g.position.set(sp.x, y, sp.z);
  g.rotation.y = sp.face + Math.PI;
  scene.add(g);
  // Collision: the plinth, the columns, and the stairwell walled off (you go in through the door).
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, g.rotation.y, 0));
  const w = (lx: number, ly: number, lz: number, hx: number, hy: number, hz: number) => {
    const p = V(lx, ly, lz).applyQuaternion(q).add(g.position);
    physics.addBox(p, V(hx, hy, hz), q);
  };
  w(0, 0.6, 0.8, 1.6, 0.6, 1.8);
  for (const [x, z] of [[-2.6, -2], [2.6, -2], [-2.6, 2], [2.6, 2]]) w(x, 2.4, z, 0.45, 2.2, 0.45);
  // The door: in front of the stair head, on the quay side.
  const door = V(0, 0, -2.6).applyQuaternion(q).add(g.position);
  const out = V(0, 0, -4.8).applyQuaternion(q).add(g.position);
  return { door: door.setY(y), out, yaw: sp.face };
}

export interface DungeonEntrances {
  hollowRidge: KitDungeonDef;
  drownedShrine: KitDungeonDef;
  /** the kit's test dungeon (console and tests only) */
  kitTest: KitDungeonDef;
  /** where each door is in the world (tests, the world map) */
  doors: Record<string, THREE.Vector3>;
}

/** Build the new dungeons' doors in the world and hand them to the realm. */
export function setupDungeonEntrances(scene: THREE.Scene, m: WorldMats, realm: Realm): DungeonEntrances {
  const hollowRidge = hollowRidgeDef();
  const drownedShrine = drownedShrineDef();
  // Hollow Ridge: the cave behind the camp (kingsRoad.ts: h.x + 2, h.z - 13).
  const h = HOLLOW_RIDGE;
  const cave = V(h.x + 2, 0, h.z - 13 + 1.6);
  cave.y = heightAt(cave.x, cave.z);
  const caveOut = V(h.x + 2, 0, h.z - 13 + 5);
  realm.registerKit(hollowRidge, cave, caveOut, 0, 'Enter Hollow Ridge Caves');
  const sh = buildShrinePortico(scene, m);
  realm.registerKit(drownedShrine, sh.door, sh.out, sh.yaw, 'Go down into the Drowned Shrine');
  return { hollowRidge, drownedShrine, kitTest: kitTestDef(), doors: { hollowRidge: cave, drownedShrine: sh.door, crypt: realm.cryptDoor.clone() } };
}
