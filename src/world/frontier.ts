import * as THREE from 'three';
import { events } from '../core/events';
import { heightAt } from './terrain';
import { physics } from '../physics/physics';
import { targets, newTargetId, type HitInfo, type Target } from '../combat/targets';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';
import type { DialogueUI } from '../ui/dialogue';
import type { Interactable } from '../dungeon/instance';

export const TREMISON = new THREE.Vector2(360, 76);
export const TREMISON_HARBOR = new THREE.Vector2(423, 74);
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

function addBuilding(scene: THREE.Scene, x: number, z: number, w: number, d: number, h: number, roof = true) {
  const y = heightAt(x, z);
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: 0xd4c2a0, roughness: 0.95 }),
  );
  body.position.y = h / 2;
  g.add(body);
  if (roof) {
    const r = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(w, d) * 0.72, Math.min(w, d) * 0.48, 4),
      new THREE.MeshStandardMaterial({ color: 0x6b6260, roughness: 1 }),
    );
    r.rotation.y = Math.PI / 4;
    r.position.y = h + Math.min(w, d) * 0.2;
    g.add(r);
  }
  g.position.set(x, y, z);
  g.traverse((o) => ((o as THREE.Mesh).isMesh && ((o.castShadow = true), (o.receiveShadow = true))));
  scene.add(g);
  physics.addBox(new THREE.Vector3(x, y + h / 2, z), new THREE.Vector3(w / 2, h / 2, d / 2));
}

function addTower(scene: THREE.Scene, x: number, z: number, r: number, h: number) {
  const y = heightAt(x, z);
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r * 1.06, h, 12),
    new THREE.MeshStandardMaterial({ color: 0x9b958e, roughness: 0.95 }),
  );
  tower.position.set(x, y + h / 2, z);
  tower.castShadow = tower.receiveShadow = true;
  scene.add(tower);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(r * 1.25, h * 0.32, 8),
    new THREE.MeshStandardMaterial({ color: 0x515866, roughness: 0.95 }),
  );
  roof.position.set(x, y + h + h * 0.16, z);
  roof.castShadow = true;
  scene.add(roof);
  physics.addCylinder(new THREE.Vector3(x, y + h / 2, z), h / 2, r);
}

function addCropField(scene: THREE.Scene, x: number, z: number, w: number, d: number, seed: number) {
  const y = heightAt(x, z) + 0.02;
  const soil = new THREE.MeshStandardMaterial({ color: 0x705131, roughness: 1 });
  const crop = new THREE.MeshStandardMaterial({ color: seed % 2 ? 0x9da64a : 0x81983d, roughness: 0.95 });
  const bed = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), soil);
  bed.position.set(x, y, z);
  bed.receiveShadow = true;
  scene.add(bed);
  const rows = Math.max(3, Math.floor(d / 1.6));
  const cols = Math.max(5, Math.floor(w / 1.35));
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const xx = x - w / 2 + 0.65 + i * (w - 1.3) / Math.max(1, cols - 1);
      const zz = z - d / 2 + 0.55 + j * (d - 1.1) / Math.max(1, rows - 1);
      const stem = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45 + ((i * 17 + j * 11 + seed) % 4) * 0.05, 5), crop);
      stem.position.set(xx, y + 0.24, zz);
      stem.rotation.z = ((i + j) % 2 ? 1 : -1) * 0.08;
      scene.add(stem);
    }
  }
}

function buildFarmingVillage(scene: THREE.Scene) {
  addCropField(scene, -72, 142, 58, 32, 1);
  addCropField(scene, 4, 150, 72, 38, 2);
  addCropField(scene, 91, 146, 58, 34, 3);
  addCropField(scene, -48, 211, 72, 46, 4);
  addCropField(scene, 46, 218, 88, 48, 5);
  addCropField(scene, 145, 208, 76, 44, 6);

  for (const [x, z, w, d] of [
    [-122, 150, 12, 9], [-22, 232, 14, 10], [118, 185, 14, 10],
  ] as [number, number, number, number][]) {
    addBuilding(scene, x, z, w, d, 4.4, true);
  }
  addSign(scene, 'ELDERGLEN FARM BELT', 0, 260, 8.5, 2.6);

  const granaryX = 105, granaryZ = 250;
  addBuilding(scene, granaryX, granaryZ, 16, 12, 6.2, true);
  addSign(scene, 'CRESHA GRAIN STORE', granaryX, granaryZ - 6.2, 6.3, 3.1);

  const wagonMat = new THREE.MeshStandardMaterial({ color: 0x755337, roughness: 0.95 });
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

function buildTremison(scene: THREE.Scene) {
  const cx = TREMISON.x, cz = TREMISON.y;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x8e9796, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4b5660, roughness: 0.95 });
  const wall = (x: number, z: number, w: number, d: number, h: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    const y = heightAt(x, z);
    m.position.set(x, y + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    physics.addBox(new THREE.Vector3(x, y + h / 2, z), new THREE.Vector3(w / 2, h / 2, d / 2));
  };
  wall(cx - 72, cz, 2, 150, 7);
  wall(cx + 72, cz - 10, 2, 130, 7);
  wall(cx, cz + 73, 145, 2, 7);
  const gate = new THREE.Mesh(new THREE.BoxGeometry(14, 10, 2.2), wallMat);
  gate.position.set(cx - 4, heightAt(cx - 4, cz - 73) + 5, cz - 73);
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

  // A dense visual population keeps the port from feeling like an empty prop set.
  const colors = [0xc66e54, 0x4c708a, 0x8d6e47, 0x5c826b, 0x8a527e, 0x9a844e];
  for (let i = 0; i < 42; i++) {
    const a = i * 2.39996;
    const radius = 18 + (i % 8) * 7;
    const x = cx + Math.sin(a) * radius;
    const z = cz + Math.cos(a) * radius * 0.85;
    if (Math.abs(x - cx) > 66 || Math.abs(z - cz) > 61) continue;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.62, 4, 7), new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.95 }));
    body.position.y = 0.66;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd2a080, roughness: 1 }));
    head.position.y = 1.34;
    g.add(body, head);
    g.position.set(x, heightAt(x, z), z);
    g.rotation.y = a;
    scene.add(g);
  }

  // Port district.
  const dockY = heightAt(TREMISON_HARBOR.x - 24, TREMISON_HARBOR.y);
  const dockMat = new THREE.MeshStandardMaterial({ color: 0x755337, roughness: 0.95 });
  for (let i = 0; i < 4; i++) {
    const x = TREMISON_HARBOR.x - 32 + i * 20;
    const z = TREMISON_HARBOR.y + 14 + (i % 2) * 7;
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
  addSign(scene, "TREMISON ADVENTURERS' GUILD", cx - 8, cz + 10, 7.7, 3.5);
  addSign(scene, "KNIGHT'S ACADEMY", cx + 16, cz + 45, 6.3, 3.7);
  addSign(scene, 'FISHERMEN\'S WHARF', TREMISON_HARBOR.x - 28, TREMISON_HARBOR.y + 12, 5.5, 2.8);
  addSign(scene, 'WHITE MOUNTAIN MINING OFFICE', cx - 37, cz - 28, 8.2, 3.2);
  addSign(scene, 'GRAND MARKET', cx + 38, cz - 30, 5.4, 3.1);
}

function buildHerbMesh(herb: HerbId) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: HERBS[herb].color, roughness: 0.9, emissive: HERBS[herb].color, emissiveIntensity: 0.08 });
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.22, 3, 5), mat);
    leaf.position.set((i - 2) * 0.055, 0.12 + (i % 2) * 0.05, ((i * 7) % 3 - 1) * 0.045);
    leaf.rotation.z = (i - 2) * 0.18;
    g.add(leaf);
  }
  return g;
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
      events.emit('enemyDied', { at: this.center.clone(), kind: this.kind });
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
      const dir = this.player.pos.clone().sub(this.position).setY(0).normalize();
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
    private toast: (msg: string) => void,
    private openGuild: () => void,
  ) {
    buildFarmingVillage(scene);
    buildTremison(scene);
    this.buildHerbs();
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

  private buildHerbs() {
    const points: [HerbId, number, number][] = [
      ['sungrass', 132, 18], ['wildmint', 151, 30], ['moongrass', 178, 8], ['sungrass', 204, 42],
      ['ironleaf', 228, 16], ['wildmint', 251, 53], ['moongrass', 273, 27], ['sungrass', 298, 65],
      ['ironleaf', 320, 42], ['wildmint', 340, 83], ['moongrass', 248, 8], ['sungrass', 187, 64],
      ['ironleaf', 309, 25], ['wildmint', 333, 54],
    ];
    for (const [herb, x, z] of points) {
      const pos = new THREE.Vector3(x, heightAt(x, z), z);
      const mesh = buildHerbMesh(herb);
      mesh.position.copy(pos);
      this.scene.add(mesh);
      this.herbs.push({ pos, herb, mesh, available: true, timer: 0 });
    }
  }

  private buildTownHooks(): Interactable[] {
    const academy = new THREE.Vector3(TREMISON.x + 16, heightAt(TREMISON.x + 16, TREMISON.y + 45), TREMISON.y + 45);
    const dwarves = new THREE.Vector3(TREMISON.x - 37, heightAt(TREMISON.x - 37, TREMISON.y - 28), TREMISON.y - 28);
    const fish = new THREE.Vector3(TREMISON_HARBOR.x - 28, heightAt(TREMISON_HARBOR.x - 28, TREMISON_HARBOR.y + 12), TREMISON_HARBOR.y + 12);
    return [
      {
        pos: academy, radius: 4.5, label: () => "Speak to the Knight's Academy registrar", enabled: () => true,
        action: () => this.dialogue.show(
          'Ser Elian Marrow', 'Knight-Captain & Academy Registrar',
          'You survived the frontier. Good. The Knight\'s Academy in Tremison can turn raw strength into discipline. The road home begins with becoming strong enough to survive it.',
          [
            { label: 'Enroll in the Academy', run: () => { this.toast('MAIN QUEST: Enter the Knight\'s Academy and begin your combat training.'); this.dialogue.close(); } },
            { label: 'Tell me about Tremison.', run: () => this.dialogue.show('Ser Elian Marrow', 'Knight-Captain & Academy Registrar', 'This city is Cresha\'s great western port. Ships leave daily for distant shores, and fighters from every corner of the nation pass through these gates.', [{ label: 'Understood.', run: () => this.dialogue.close() }]) },
            { label: 'Leave.', run: () => this.dialogue.close() },
          ],
        ),
      },
      {
        pos: new THREE.Vector3(TREMISON.x - 8, heightAt(TREMISON.x - 8, TREMISON.y + 10), TREMISON.y + 10),
        radius: 4.2, label: () => "Enter Tremison's Adventurer's Guild", enabled: () => true,
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
          'We leave Tremison harbor in three days for the White Mountains. There is ore there that never reaches Cresha\'s markets. Come back before departure if you want a place on the mining crew.',
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
      [175, 34], [203, 10], [231, 48], [265, 18], [294, 51], [323, 38], [342, 71],
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
    if (this.player.pos.distanceTo(new THREE.Vector3(TREMISON.x, this.player.pos.y, TREMISON.y)) < 65) {
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
