import * as THREE from 'three';
import { heightAt } from '../terrainHeight';
import { physics } from '../../physics/physics';
import { StaticBatch } from '../cityKit';
import { worldUV, type WorldMats } from '../buildings';
import { named, LOOKS } from './mountainFolk';
import type { IslandPort } from '../sea/islandPorts';
import type { NpcRecord, Settlement } from '../../npc/npcManager';
import type { Interactable } from '../../dungeon/instance';
import type { Player } from '../../player/player';

// Kettle Cove (docs/design/mountains.md §3): the island-harbour kit gives it
// its pad, houses, pier, lighthouse, harbourmaster and ore-factor; this adds
// what makes it dwarven. A stone gate and braziers at the head of the quay,
// ore carts and the expedition's landing camp under the cliff, and the
// winch-lift: a counterweighted cage on an iron-braced timber tower that
// carries you three hundred metres up the cliff face to the lookout.

export interface KettleCoveBuilt {
  interactables: Interactable[];
  records: NpcRecord[];
  /** a fire you can warm yourself at (the cold meter) */
  fires: THREE.Vector3[];
  /** the Iron Kettle's berth at the quay */
  berth: [number, number, number];
  update(dt: number): void;
  setVisible(v: boolean): void;
  /** the lift is moving (tests) */
  readonly lifting: boolean;
}

export function buildKettleCove(scene: THREE.Scene, m: WorldMats, port: IslandPort, home: Settlement, player: Player, onLift: (up: boolean) => void): KettleCoveBuilt {
  const def = port.def;
  const f = new THREE.Vector2(Math.cos(def.dir), Math.sin(def.dir));
  const s = new THREE.Vector2(-f.y, f.x);
  const [lx, lz] = def.land;
  const at = (a: number, b: number) => new THREE.Vector2(lx + f.x * a + s.x * b, lz + f.y * a + s.y * b);
  const group = new THREE.Group();
  scene.add(group);
  const batch = new StaticBatch();
  const stone = (m.bridgeStone ?? m.stone) as THREE.Material;
  const iron = new THREE.MeshStandardMaterial({ color: 0x2e2e32, roughness: 0.55, metalness: 0.7 });
  const brass = new THREE.MeshStandardMaterial({ color: 0x9b7130, roughness: 0.35, metalness: 0.75 });
  const canvas = new THREE.MeshStandardMaterial({ color: 0xc8b88a, roughness: 0.95, side: THREE.DoubleSide });
  const banner = new THREE.MeshStandardMaterial({ color: 0x8a3f22, roughness: 0.85, side: THREE.DoubleSide });
  const fireMat = new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xff5a10, emissiveIntensity: 2.4 });
  const yawOut = Math.atan2(f.x, f.y);
  const add = (g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0, rx = 0) => {
    const mesh = new THREE.Mesh(worldUV(g, 1.5), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, 0, 'YXZ');
    batch.addObject(mesh);
    return mesh;
  };
  const fires: THREE.Vector3[] = [];

  // ---- the stone gate at the head of the quay, braziers either side ----
  {
    const g = at(12, 0);
    const y = heightAt(g.x, g.y);
    for (const b of [-4.2, 4.2]) {
      const p = at(12, b);
      add(new THREE.BoxGeometry(1.6, 6.5, 1.6), stone, p.x, y + 3.25, p.y, yawOut);
      physics.addBox(new THREE.Vector3(p.x, y + 3.25, p.y), new THREE.Vector3(0.8, 3.25, 0.8));
      const br = at(14, b * 1.5);
      add(new THREE.CylinderGeometry(0.55, 0.3, 1.1, 8), iron, br.x, y + 0.55, br.y);
      add(new THREE.SphereGeometry(0.42, 8, 6), fireMat, br.x, y + 1.25, br.y);
      fires.push(new THREE.Vector3(br.x, y + 1, br.y));
    }
    add(new THREE.BoxGeometry(10, 1.4, 1.8), stone, g.x, y + 7.1, g.y, yawOut);
    // A carved hammer over the arch.
    add(new THREE.BoxGeometry(2.4, 0.7, 0.5), brass, g.x, y + 8.3, g.y, yawOut);
    add(new THREE.BoxGeometry(0.3, 1.6, 0.3), brass, g.x, y + 8.6, g.y, yawOut);
  }
  // ---- ore carts, crates and a crane on the quay ----
  for (let k = 0; k < 4; k++) {
    const p = at(2 + k * 3.2, 9);
    const y = heightAt(p.x, p.y);
    add(new THREE.BoxGeometry(1.2, 0.8, 1.8), m.planks, p.x, y + 0.75, p.y, yawOut);
    add(new THREE.DodecahedronGeometry(0.55, 0), m.stone, p.x, y + 1.25, p.y);
    for (const w of [-0.6, 0.6]) add(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 10), iron, p.x + s.x * w, y + 0.3, p.y + s.y * w, yawOut, 0);
  }
  {
    const c = at(6, -10);
    const y = heightAt(c.x, c.y);
    add(new THREE.BoxGeometry(0.6, 9, 0.6), m.timber, c.x, y + 4.5, c.y);
    add(new THREE.BoxGeometry(0.4, 0.4, 9), m.timber, c.x, y + 8.6, c.y + 3.6, 0);
    add(new THREE.CylinderGeometry(0.03, 0.03, 4), iron, c.x, y + 6.6, c.y + 7.6);
    add(new THREE.BoxGeometry(1.2, 1, 1.2), m.planks, c.x, y + 4.2, c.y + 7.6);
  }

  // ---- the landing camp under the cliff ----
  const camp = at(-26, 22);
  {
    const y = heightAt(camp.x, camp.y);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      const x = camp.x + Math.cos(a) * 7, z = camp.y + Math.sin(a) * 6;
      const ty = heightAt(x, z);
      add(new THREE.ConeGeometry(2.2, 2.6, 4), canvas, x, ty + 1.3, z, a);
    }
    add(new THREE.CylinderGeometry(0.9, 1.1, 0.35, 10), stone, camp.x, y + 0.18, camp.y);
    add(new THREE.ConeGeometry(0.6, 1.1, 6), fireMat, camp.x, y + 0.75, camp.y);
    fires.push(new THREE.Vector3(camp.x, y + 0.6, camp.y));
    for (const [a, b] of [[-3, 2], [3, -2], [-2, -3]]) add(new THREE.BoxGeometry(0.9, 0.9, 0.9), m.planks, camp.x + a, y + 0.45, camp.y + b, a);
    const pole = at(-26, 31);
    const py = heightAt(pole.x, pole.y);
    add(new THREE.CylinderGeometry(0.08, 0.1, 8, 6), m.timber, pole.x, py + 4, pole.y);
    add(new THREE.BoxGeometry(0.05, 1.6, 2.4), banner, pole.x - 1.2, py + 7, pole.y, 0);
  }

  // ---- the winch-lift up the cliff ----
  const base = at(-44, -12);
  const baseY = heightAt(base.x, base.y);
  // The lookout at the top: the first ground behind the cliff edge.
  let top = at(-70, -12), topY = heightAt(top.x, top.y);
  for (let a = -56; a > -110; a -= 2) {
    const p = at(a, -12);
    const h = heightAt(p.x, p.y), h2 = heightAt(at(a - 4, -12).x, at(a - 4, -12).y);
    if (h > baseY + 60 && h2 - h < 3) {
      top = at(a - 3, -12);
      topY = heightAt(top.x, top.y);
      break;
    }
  }
  const towerAt = at(-47, -12);
  const H = topY - baseY + 6;
  for (const b of [-1.8, 1.8]) {
    for (const a of [-1.4, 1.4]) {
      const p = new THREE.Vector2(towerAt.x + s.x * b + f.x * a, towerAt.y + s.y * b + f.y * a);
      add(new THREE.BoxGeometry(0.36, H, 0.36), m.timber, p.x, baseY + H / 2, p.y);
    }
  }
  for (let y = 6; y < H; y += 8) add(new THREE.BoxGeometry(4, 0.25, 3.2), iron, towerAt.x, baseY + y, towerAt.y, yawOut);
  // The wheelhouse on top, and the lookout's flag.
  add(new THREE.BoxGeometry(5, 3, 4.2), m.planks, towerAt.x, baseY + H + 1.2, towerAt.y, yawOut);
  add(new THREE.CylinderGeometry(1.2, 1.2, 0.5, 14), brass, towerAt.x, baseY + H + 3, towerAt.y, yawOut, Math.PI / 2);
  add(new THREE.BoxGeometry(5.5, 0.4, 4), m.planks, top.x, topY + 0.2, top.y, yawOut);
  add(new THREE.CylinderGeometry(0.08, 0.1, 7, 6), m.timber, top.x + 2, topY + 3.5, top.y);
  add(new THREE.BoxGeometry(0.05, 1.4, 2.2), banner, top.x + 3.1, topY + 6.2, top.y, 0);
  // A catwalk from the tower to the clifftop.
  {
    const mid = new THREE.Vector2((towerAt.x + top.x) / 2, (towerAt.y + top.y) / 2);
    const len = towerAt.distanceTo(top) + 2;
    add(new THREE.BoxGeometry(2.2, 0.25, len), m.planks, mid.x, topY + 0.1, mid.y, yawOut);
    physics.addBox(new THREE.Vector3(mid.x, topY - 0.05, mid.y), new THREE.Vector3(1.1, 0.15, len / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yawOut, 0)));
  }
  batch.build(group);
  // The cage rides the tower (its own mesh: it moves).
  const cage = new THREE.Group();
  const cageFloor = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.2, 2.6), m.planks as THREE.Material);
  const cageTop = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.15, 2.6), iron);
  cageTop.position.y = 2.6;
  cage.add(cageFloor, cageTop);
  for (const [x, z] of [[-1.5, -1.2], [1.5, -1.2], [-1.5, 1.2], [1.5, 1.2]]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.1), iron);
    bar.position.set(x, 1.3, z);
    cage.add(bar);
  }
  cage.rotation.y = yawOut;
  cage.position.set(towerAt.x, baseY + 0.1, towerAt.y);
  group.add(cage);

  // ---- the lift ride ----
  const lift = { t: 0, dir: 0 as -1 | 0 | 1, from: 0, to: 0 };
  const ride = (up: boolean) => {
    lift.dir = up ? 1 : -1;
    lift.t = 0;
    lift.from = up ? baseY : topY;
    lift.to = up ? topY : baseY;
    player.teleport(new THREE.Vector3(towerAt.x, lift.from + 0.4, towerAt.y));
  };
  const baseV = new THREE.Vector3(base.x, baseY, base.y);
  const topV = new THREE.Vector3(top.x, topY, top.y);
  const interactables: Interactable[] = [
    { pos: baseV, radius: 4, label: () => (lift.dir ? '' : 'Ride the winch-lift up the cliff'), enabled: () => !lift.dir, action: () => ride(true) },
    { pos: topV, radius: 4, label: () => (lift.dir ? '' : 'Ride the winch-lift down to the cove'), enabled: () => !lift.dir, action: () => ride(false) },
  ];

  // ---- the people: Hamm at the camp, porters on the quay ----
  const hamm = named('hamm', 'Hamm Copperbeard', 'Captain of the Iron Kettle', LOOKS.hamm, home.id, [camp.x + 2.5, camp.y - 2], yawOut, 'idle', ['She\'s a good ship. Ugly, loud, and she\'ll swim through anything.', 'Passage to Port Aurelle whenever you like. The boiler\'s always warm.']);
  home.places.set(hamm.place.id, hamm.place);
  const records: NpcRecord[] = [hamm.rec];

  const berthP = at(def.shore + 58, 28);
  return {
    interactables, records, fires,
    berth: [berthP.x, berthP.y, yawOut],
    get lifting() {
      return lift.dir !== 0;
    },
    update(dt: number) {
      if (!lift.dir) return;
      lift.t = Math.min(1, lift.t + dt / 9);
      const k = lift.t * lift.t * (3 - 2 * lift.t);
      const y = lift.from + (lift.to - lift.from) * k;
      cage.position.y = y + 0.1;
      player.teleport(new THREE.Vector3(towerAt.x, y + 0.5, towerAt.y));
      if (lift.t >= 1) {
        const up = lift.dir > 0;
        lift.dir = 0;
        player.teleport((up ? topV : baseV).clone().setY((up ? topY : baseY) + 0.4));
        onLift(up);
      }
    },
    setVisible(v: boolean) {
      group.visible = v;
    },
  };
}
