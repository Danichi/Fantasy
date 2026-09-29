import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { events } from '../core/events';
import { heightAt, PORT_AURELLE, PORT_HARBOR } from './terrain';
import { physics } from '../physics/physics';
import { targets, newTargetId, type HitInfo, type Target } from '../combat/targets';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';
import type { DialogueUI } from '../ui/dialogue';
import type { Interactable } from '../dungeon/instance';
import { buildHouse, worldUV, type WorldMats } from './buildings';
import { mulberry32 } from '../core/math';

// Painted materials shared with Elderglen (docs/ART-DIRECTION.md); set by FrontierRegion.
let M: WorldMats;

// Port Aurelle (formerly Tremison) on the eastern coast; phase 5 grows it into the full city.
export const PORT = PORT_AURELLE;
export const HARBOR = PORT_HARBOR;
export const FARM_BELT_CENTER = new THREE.Vector2(0, 188);

type HerbId = 'sungrass' | 'moongrass' | 'wildmint' | 'ironleaf';

interface HerbSpot {
  pos: THREE.Vector3;
  herb: HerbId;
  mesh: THREE.Group;
  available: boolean;
  timer: number;
}

const HERBS: Record<HerbId, { name: string; item: string; color: number; respawn: number }> = {
  sungrass: { name: 'Sungrass', item: 'sungrass', color: 0xd7ce4a, respawn: 35 },
  moongrass: { name: 'Moongrass', item: 'moongrass', color: 0xa9d8da, respawn: 42 },
  wildmint: { name: 'Wild Mint', item: 'wildmint', color: 0x63c47b, respawn: 28 },
  ironleaf: { name: 'Ironleaf', item: 'ironleaf', color: 0xa2a8ad, respawn: 52 },
};

function signTexture(text: string) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4e7c7';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#795a38';
  g.lineWidth = 10;
  g.strokeRect(5, 5, c.width - 10, c.height - 10);
  g.fillStyle = '#4c3827';
  g.font = '700 38px Cinzel, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function addSign(scene: THREE.Scene, text: string, x: number, z: number, width = 5.5, y = 3.2) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(width, 1),
    new THREE.MeshStandardMaterial({ map: signTexture(text), roughness: 0.8, side: THREE.DoubleSide }),
  );
  m.position.set(x, heightAt(x, z) + y, z);
  m.rotation.y = Math.PI;
  m.castShadow = true;
  scene.add(m);
  return m;
}

function addBuilding(scene: THREE.Scene, x: number, z: number, w: number, d: number, h: number, _roof = true, rot = 0) {
  // Painted timber-frame house, one or two floors by the requested height.
  void _roof;
  const seed = Math.abs(Math.round(x * 13 + z * 7));
  const pick = mulberry32(seed)();
  const { group, half } = buildHouse({ w, d, floors: h > 5 ? 2 : 1, roof: pick < 0.45 ? 'tile' : pick < 0.75 ? 'slate' : 'thatch', seed }, M);
  let gy = Infinity;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) gy = Math.min(gy, heightAt(x + sx * half.x, z + sz * half.z));
  group.position.set(x, gy, z);
  group.rotation.y = rot;
  scene.add(group);
  physics.addBox(new THREE.Vector3(x, gy + half.y, z), half, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot));
}

function addTower(scene: THREE.Scene, x: number, z: number, r: number, h: number) {
  const y = heightAt(x, z);
  const body = new THREE.CylinderGeometry(r, r * 1.06, h, 16);
  body.translate(x, y + h / 2, z);
  const tower = new THREE.Mesh(worldUV(body.toNonIndexed(), 2.5), M.stone);
  tower.castShadow = tower.receiveShadow = true;
  scene.add(tower);
  const cone = new THREE.ConeGeometry(r * 1.3, h * 0.45, 16);
  cone.translate(x, y + h + h * 0.22, z);
  const roof = new THREE.Mesh(worldUV(cone.toNonIndexed(), 2.2), M.slate);
  roof.castShadow = true;
  scene.add(roof);
  physics.addCylinder(new THREE.Vector3(x, y + h / 2, z), h / 2, r);
}

/** Furrowed soil: dark and light rows. */
function furrowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#6e5238';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) {
    const grd = g.createLinearGradient(0, i * 32, 0, i * 32 + 32);
    grd.addColorStop(0, '#5a412c');
    grd.addColorStop(0.5, '#7d5f42');
    grd.addColorStop(1, '#5a412c');
    g.fillStyle = grd;
    g.fillRect(0, i * 32, 256, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

type CropList = { pos: THREE.Matrix4[]; col: THREE.Color[] };
let cropState: { soil: THREE.MeshStandardMaterial; leafy: CropList; wheat: CropList } | null = null;

function addCropField(scene: THREE.Scene, x: number, z: number, w: number, d: number, seed: number) {
  if (!cropState) {
    const soil = new THREE.MeshStandardMaterial({ map: furrowTexture(), roughness: 1 });
    soil.userData.styleSoftness = 0;
    cropState = { soil, leafy: { pos: [], col: [] }, wheat: { pos: [], col: [] } };
  }
  const y = heightAt(x, z) + 0.03;
  const bedGeo = new THREE.BoxGeometry(w, 0.08, d);
  // One furrow per 1.6 m, running along x (the texture holds 8 furrows).
  const uv = bedGeo.attributes.uv as THREE.BufferAttribute;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (w / 8), (uv.getY(k) * d) / 1.6 / 8);
  const bed = new THREE.Mesh(bedGeo, cropState.soil);
  bed.position.set(x, y, z);
  bed.receiveShadow = true;
  scene.add(bed);
  const rnd = mulberry32(seed * 101);
  const wheat = seed % 2 === 0;
  const list = wheat ? cropState.wheat : cropState.leafy;
  const rows = Math.floor(d / 1.6);
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (let j = 0; j < rows; j++) {
    const zz = z - d / 2 + (j + 0.5) * (d / rows);
    for (let xx = x - w / 2 + 0.5; xx < x + w / 2 - 0.4; xx += wheat ? 0.55 : 0.8) {
      const s = wheat ? 0.8 + rnd() * 0.35 : 0.28 + rnd() * 0.14;
      q.setFromAxisAngle(up, rnd() * 6.28);
      const px = xx + (rnd() - 0.5) * 0.2, pz = zz + (rnd() - 0.5) * 0.25;
      list.pos.push(new THREE.Matrix4().compose(new THREE.Vector3(px, heightAt(px, pz) + 0.05, pz), q, new THREE.Vector3(s, s * (wheat ? 1 : 0.8), s)));
      const base = wheat ? new THREE.Color(0xd8b65a) : new THREE.Color([0x5f8f3a, 0x78a843, 0x8fb54e][seed % 3]);
      list.col.push(base.multiplyScalar(0.85 + rnd() * 0.3));
    }
  }
}

/** Build the instanced crops once every field has been laid out (one draw call per crop type). */
function finishCrops(scene: THREE.Scene) {
  if (!cropState) return;
  const make = (geo: THREE.BufferGeometry, mat: THREE.Material, data: CropList) => {
    if (!data.pos.length) return;
    const mesh = new THREE.InstancedMesh(geo, mat, data.pos.length);
    data.pos.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, data.col[i]);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  // Leafy crops: chunky low-poly heads.
  const head = new THREE.IcosahedronGeometry(1, 0);
  head.translate(0, 0.6, 0);
  make(head, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), cropState.leafy);
  // Wheat: a tuft of thin stalks with heavier ears.
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 6; k++) {
    const stalk = new THREE.CylinderGeometry(0.012, 0.02, 0.9, 3);
    stalk.translate(0, 0.45, 0);
    const ear = new THREE.CylinderGeometry(0.035, 0.02, 0.2, 4);
    ear.translate(0, 0.98, 0);
    const a = (k / 6) * Math.PI * 2;
    for (const g of [stalk, ear]) {
      g.rotateZ(0.12 * Math.sin(a * 3));
      g.rotateX(0.1 * Math.cos(a * 2));
      g.translate(Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08);
      parts.push(g.toNonIndexed());
    }
  }
  make(mergeGeometries(parts)!, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), cropState.wheat);
  cropState = null;
}

function buildFarmingVillage(scene: THREE.Scene) {
  addCropField(scene, -72, 142, 58, 32, 1);
  addCropField(scene, 4, 150, 72, 38, 2);
  addCropField(scene, 91, 146, 58, 34, 3);
  addCropField(scene, -48, 211, 72, 46, 4);
  addCropField(scene, 46, 218, 88, 48, 5);
  addCropField(scene, 145, 208, 76, 44, 6);
  finishCrops(scene);

  for (const [x, z, w, d] of [
    [-122, 150, 12, 9], [-22, 232, 14, 10], [118, 185, 14, 10],
  ] as [number, number, number, number][]) {
    addBuilding(scene, x, z, w, d, 4.4, true);
  }
  addSign(scene, 'ELDERGLEN FARM BELT', 0, 260, 8.5, 2.6);

  const granaryX = 105, granaryZ = 250;
  addBuilding(scene, granaryX, granaryZ, 16, 12, 6.2, true);
  addSign(scene, 'CRESHA GRAIN STORE', granaryX, granaryZ - 6.2, 6.3, 3.1);

  const wagonMat = M.planks;
  for (const [x, z] of [[-108, 179], [72, 263], [151, 170]]) {
    const wagon = new THREE.Group();
    const bed = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.35, 1.4), wagonMat);
    bed.position.y = 0.75;
    wagon.add(bed);
    for (const sx of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.16, 12), wagonMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * 1.1, 0.52, 0.7);
      wagon.add(wheel);
    }
    wagon.position.set(x, heightAt(x, z), z);
    wagon.rotation.y = 0.2;
    scene.add(wagon);
  }
}

function buildPortAurelle(scene: THREE.Scene) {
  const cx = PORT.x, cz = PORT.y;
  const wallMat = M.stone;
  const wall = (x: number, z: number, w: number, d: number, h: number) => {
    const y = heightAt(x, z);
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.translate(x, y + h / 2, z);
    const m = new THREE.Mesh(worldUV(geo, 3), wallMat);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    physics.addBox(new THREE.Vector3(x, y + h / 2, z), new THREE.Vector3(w / 2, h / 2, d / 2));
  };
  // Main King's Road enters from the west; leave a generous city gate there.
  wall(cx - 72, cz - 50, 2, 46, 7);
  wall(cx - 72, cz + 50, 2, 46, 7);
  wall(cx + 72, cz - 10, 2, 130, 7);
  wall(cx + 4, cz + 73, 137, 2, 7);
  wall(cx - 63, cz + 73, 17, 2, 7);
  const gate = new THREE.Mesh(worldUV(new THREE.BoxGeometry(18, 10, 2.2), 3), wallMat);
  gate.position.set(cx - 72, heightAt(cx - 72, cz) + 5, cz);
  gate.rotation.y = Math.PI / 2;
  scene.add(gate);

  const buildings: [number, number, number, number, number][] = [
    [-38, 40, 20, 16, 9], [-8, 34, 14, 12, 7], [20, 42, 24, 15, 10], [52, 35, 16, 13, 8],
    [-52, 10, 18, 14, 8], [-24, 5, 15, 12, 7], [7, 7, 22, 16, 10], [39, 4, 16, 13, 8],
    [62, 7, 18, 14, 8], [-45, -24, 20, 15, 9], [-14, -26, 16, 12, 8], [15, -24, 18, 14, 9],
    [44, -22, 22, 16, 10], [-57, 53, 12, 10, 6], [65, 51, 13, 10, 7],
  ];
  for (const [dx, dz, w, d, h] of buildings) {
    const x = cx + dx, z = cz + dz;
    addBuilding(scene, x, z, w, d, h, true);
  }
  for (const [x, z] of [[cx - 63, cz + 59], [cx + 63, cz + 58], [cx - 63, cz - 59], [cx + 63, cz - 54]]) addTower(scene, x, z, 5, 11);
  // Deep water begins at the eastern edge of the coastal plain. The city sits
  // just above sea level while the harbor opens directly into this water.
  // (The Grand Ocean now surrounds the harbour: src/world/sea/ocean.ts.)

  // (The capsule placeholder crowd is gone; real villagers will populate the port.)

  // Port district.
  const dockY = heightAt(HARBOR.x - 24, HARBOR.y);
  const dockMat = M.planks;
  for (let i = 0; i < 4; i++) {
    const x = HARBOR.x - 32 + i * 20;
    const z = HARBOR.y + 14 + (i % 2) * 7;
    const pier = new THREE.Mesh(new THREE.BoxGeometry(15, 0.35, 3.2), dockMat);
    pier.position.set(x, dockY + 0.2, z);
    pier.castShadow = pier.receiveShadow = true;
    scene.add(pier);
    for (const p of [-6, 6]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.8, 8), dockMat);
      post.position.set(x + p, dockY - 1.1, z);
      scene.add(post);
    }
  }
  addSign(scene, "PORT AURELLE ADVENTURERS' GUILD", cx - 8, cz + 10, 7.7, 3.5);
  addSign(scene, "KNIGHT'S ACADEMY", cx + 16, cz + 45, 6.3, 3.7);
  addSign(scene, 'FISHERMEN\'S WHARF', HARBOR.x - 28, HARBOR.y + 12, 5.5, 2.8);
  addSign(scene, 'WHITE MOUNTAIN MINING OFFICE', cx - 37, cz - 28, 8.2, 3.2);
  addSign(scene, 'GRAND MARKET', cx + 38, cz - 30, 5.4, 3.1);
}

class RoadBeast implements Target {
  readonly id = newTargetId();
  readonly kind: 'boar' | 'wolf';
  alive = true;
  lockable = true;
  stunned = false;
  hp: number;
  maxHp: number;
  radius: number;
  halfHeight = 0.42;
  position: THREE.Vector3;
  center: THREE.Vector3;
  private root: THREE.Group;
  private cooldown = 0;
  private deathT = 0;

  constructor(kind: 'boar' | 'wolf', at: THREE.Vector3, private player: Player, scene: THREE.Scene) {
    this.kind = kind;
    this.hp = this.maxHp = kind === 'boar' ? 85 : 62;
    this.radius = kind === 'boar' ? 0.58 : 0.48;
    this.position = at.clone();
    this.center = at.clone().add(new THREE.Vector3(0, kind === 'boar' ? 0.62 : 0.7, 0));
    this.root = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(kind === 'boar' ? 0.44 : 0.32, kind === 'boar' ? 0.75 : 0.92, 5, 8),
      new THREE.MeshStandardMaterial({ color: kind === 'boar' ? 0x6c4939 : 0x4b5960, roughness: 1 }),
    );
    body.rotation.z = Math.PI / 2;
    body.position.y = kind === 'boar' ? 0.58 : 0.67;
    this.root.add(body);
    const head = new THREE.Mesh(new THREE.ConeGeometry(kind === 'boar' ? 0.32 : 0.27, 0.56, 6), new THREE.MeshStandardMaterial({ color: kind === 'boar' ? 0x7b5b46 : 0x55646c, roughness: 1 }));
    head.rotation.z = -Math.PI / 2;
    head.position.set(0.62, kind === 'boar' ? 0.62 : 0.78, 0);
    this.root.add(head);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.45, 6), new THREE.MeshStandardMaterial({ color: 0x3f3029, roughness: 1 }));
      leg.position.set(sx * 0.28, 0.28, sz * 0.16);
      this.root.add(leg);
    }
    this.root.position.copy(this.position);
    this.root.castShadow = true;
    scene.add(this.root);
    targets.add(this);
  }

  takeHit(h: HitInfo) {
    if (!this.alive) return;
    this.hp -= h.damage;
    this.stunned = true;
    setTimeout(() => (this.stunned = false), 140);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.deathT = 0.65;
      events.emit('enemyDied', { at: this.center.clone(), enemyId: this.id, kind: this.kind });
    }
  }

  update(dt: number) {
    if (!this.alive) {
      this.deathT -= dt;
      this.root.rotation.z = Math.min(Math.PI / 2, (0.65 - Math.max(0, this.deathT)) * 3);
      this.root.position.y -= dt * 0.8;
      if (this.deathT <= 0) {
        targets.delete(this);
        this.root.removeFromParent();
      }
      return;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    const to = this.player.pos.clone().sub(this.position).setY(0);
    const d = to.length();
    if (d < 19 && d > 2.4) {
      const speed = this.kind === 'boar' ? 3.0 : 3.7;
      to.normalize();
      this.position.addScaledVector(to, speed * dt);
      this.root.rotation.y = Math.atan2(to.x, to.z);
      this.position.y = heightAt(this.position.x, this.position.z);
      this.center.set(this.position.x, this.position.y + (this.kind === 'boar' ? 0.62 : 0.7), this.position.z);
      this.root.position.copy(this.position);
    } else if (d <= 2.4 && this.cooldown <= 0) {
      this.cooldown = this.kind === 'boar' ? 1.6 : 1.15;
      this.player.receiveAttack({
        damage: this.kind === 'boar' ? 14 : 10,
        from: this.position.clone(),
        parryable: true,
        poise: this.kind === 'boar' ? 28 : 18,
        onParried: () => (this.stunned = true),
      });
    }
    this.root.scale.y = 1 + Math.sin(performance.now() * 0.009 + this.id) * 0.025;
  }

  dispose() {
    targets.delete(this);
    this.root.removeFromParent();
  }
}

export class FrontierRegion {
  readonly interactables: Interactable[] = [];
  private herbs: HerbSpot[] = [];
  private beasts: RoadBeast[] = [];
  private beastTimer = 0;
  private time = 0;

  constructor(
    private scene: THREE.Scene,
    private player: Player,
    private fx: FX,
    private dialogue: DialogueUI,
    mats: WorldMats,
    private toast: (msg: string) => void,
    private openGuild: () => void,
  ) {
    M = mats;
    buildFarmingVillage(scene);
    buildPortAurelle(scene);
    // (Roadside herbs moved to the foraging system, world/foraging.ts.)
    this.interactables.push(...this.buildTownHooks());
    for (const h of this.herbs) {
      this.interactables.push({
        pos: h.pos,
        radius: 1.5,
        label: () => h.available ? 'Gather ' + HERBS[h.herb].name : 'Nothing to gather here',
        enabled: () => h.available,
        action: () => this.gather(h),
      });
    }
    this.interactables.push({
      pos: new THREE.Vector3(48, heightAt(48, -39), -39),
      radius: 3,
      label: () => this.player.mounted ? 'Dismount horse' : 'Mount a horse',
      enabled: () => true,
      action: () => {
        this.player.toggleMount();
        this.toast(this.player.mounted ? 'Horseback travel' : 'On foot');
      },
    });
  }

  private buildTownHooks(): Interactable[] {
    const academy = new THREE.Vector3(PORT.x + 16, heightAt(PORT.x + 16, PORT.y + 45), PORT.y + 45);
    const dwarves = new THREE.Vector3(PORT.x - 37, heightAt(PORT.x - 37, PORT.y - 28), PORT.y - 28);
    const fish = new THREE.Vector3(HARBOR.x - 28, heightAt(HARBOR.x - 28, HARBOR.y + 12), HARBOR.y + 12);
    return [
      {
        pos: academy, radius: 4.5, label: () => "Speak to the Knight's Academy registrar", enabled: () => true,
        action: () => this.dialogue.show(
          'Ser Elian Marrow', 'Knight-Captain & Academy Registrar',
          'You survived the frontier. Good. The Knight\'s Academy in Port Aurelle can turn raw strength into discipline. The road home begins with becoming strong enough to survive it.',
          [
            { label: 'Enroll in the Academy', run: () => { this.toast('MAIN QUEST: Enter the Knight\'s Academy and begin your combat training.'); this.dialogue.close(); } },
            { label: 'Tell me about Port Aurelle.', run: () => this.dialogue.show('Ser Elian Marrow', 'Knight-Captain & Academy Registrar', 'This city is Cresha\'s great western port. Ships leave daily for distant shores, and fighters from every corner of the nation pass through these gates.', [{ label: 'Understood.', run: () => this.dialogue.close() }]) },
            { label: 'Leave.', run: () => this.dialogue.close() },
          ],
        ),
      },
      {
        pos: new THREE.Vector3(PORT.x - 8, heightAt(PORT.x - 8, PORT.y + 10), PORT.y + 10),
        radius: 4.2, label: () => "Enter Port Aurelle's Adventurer's Guild", enabled: () => true,
        action: () => this.openGuild(),
      },
      {
        pos: fish, radius: 3.5, label: () => 'Talk to the dockmaster', enabled: () => true,
        action: () => this.dialogue.show(
          'Mira Vane', 'Dockmaster',
          'Fishing licenses are cheap. The open sea is not. Start with the sheltered reefs, learn the tides, then take a proper boat beyond the harbor.',
          [
            { label: 'I want to learn fishing.', run: () => { this.toast('FISHING UNLOCKED: Reefs, rivers and offshore catches will become available.'); this.dialogue.close(); } },
            { label: 'What else sails from here?', run: () => this.dialogue.show('Mira Vane', 'Dockmaster', 'Freighters head north, island traders head south, and every few days a deep-water crew gathers for a longer voyage.', [{ label: 'Thanks.', run: () => this.dialogue.close() }]) },
            { label: 'Leave.', run: () => this.dialogue.close() },
          ],
        ),
      },
      {
        pos: dwarves, radius: 4.0, label: () => 'Speak with the dwarves', enabled: () => true,
        action: () => this.dialogue.show(
          'Bruni Stonevein', 'Dwarven Expedition Leader',
          'We leave Port Aurelle harbor in three days for the White Mountains. There is ore there that never reaches Cresha\'s markets. Come back before departure if you want a place on the mining crew.',
          [
            { label: 'I want a place on the expedition.', run: () => { this.toast('DWARVEN EXPEDITION: Return before the White Mountain voyage departs.'); this.dialogue.close(); } },
            { label: 'Why the White Mountains?', run: () => this.dialogue.show('Bruni Stonevein', 'Dwarven Expedition Leader', 'The old mines are deeper than any pit on the mainland. We need blades, scouts and someone who can handle monsters underground.', [{ label: 'I understand.', run: () => this.dialogue.close() }]) },
            { label: 'Leave.', run: () => this.dialogue.close() },
          ],
        ),
      },
    ];
  }

  private gather(h: HerbSpot) {
    if (!h.available) return;
    h.available = false;
    h.timer = HERBS[h.herb].respawn;
    h.mesh.visible = false;
    this.player.equip.add(HERBS[h.herb].item);
    this.toast('Gathered ' + HERBS[h.herb].name);
    events.emit('progressChanged', {});
    this.fx.add.spawn({
      pos: h.pos.clone().add(new THREE.Vector3(0, 0.2, 0)),
      spread: 0.35, count: 10, life: [0.25, 0.55], size: [0.06, 0.01],
      color: HERBS[h.herb].color, color2: 0xffffff, upBias: 0.8, drag: 2.5, jitter: 0.2,
    });
  }

  private spawnBeast() {
    const spots = [
      // Beside the King's Road (never on it), from the river to the coastal meadows.
      [420, 120], [610, 60], [820, 160], [1010, 80], [1240, 180], [1460, 70], [1680, 190], [1900, 90], [2150, 200], [2380, 95],
    ] as [number, number][];
    const s = spots[Math.floor(Math.random() * spots.length)];
    const kind = Math.random() < 0.55 ? 'boar' : 'wolf';
    this.beasts.push(new RoadBeast(kind, new THREE.Vector3(s[0], heightAt(s[0], s[1]), s[1]), this.player, this.scene));
  }

  update(dt: number) {
    this.time += dt;
    for (const h of this.herbs) {
      if (h.available) continue;
      h.timer -= dt;
      if (h.timer <= 0) {
        h.available = true;
        h.mesh.visible = true;
      }
    }

    this.beastTimer -= dt;
    const onRoad = this.player.pos.x > 125 && this.player.pos.x < 350 && this.player.pos.z > -20 && this.player.pos.z < 95;
    if (onRoad && this.beasts.length < 4 && this.beastTimer <= 0) {
      this.beastTimer = 7 + Math.random() * 7;
      this.spawnBeast();
    }
    for (const b of this.beasts) b.update(dt);
    this.beasts = this.beasts.filter((b) => b.alive || targets.has(b));
    if (this.player.pos.distanceTo(new THREE.Vector3(PORT.x, this.player.pos.y, PORT.y)) < 65) {
      // Keep the city feeling alive without a permanent combat lock.
      for (const b of this.beasts) if (b.alive && b.position.x > 335) b.dispose();
      this.beasts = this.beasts.filter((b) => b.alive);
    }
  }

  dispose() {
    for (const b of this.beasts) b.dispose();
    this.beasts = [];
  }
}
