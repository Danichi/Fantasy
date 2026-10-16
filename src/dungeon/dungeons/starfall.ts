import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { physics } from '../../physics/physics';
import { setGroundOverride, heightAt } from '../../world/terrainHeight';
import { emptyMap, type MapData, type DungeonMapUI } from '../../ui/dungeonMap';
import { events } from '../../core/events';
import { newTargetId, targets, type HitInfo, type Target } from '../../combat/targets';
import { ForestCreature } from '../../enemies/forest/forestCreature';
import { scriptTexture } from '../../world/elves/elvenForest';
import type { Realm } from '../realm';
import type { Player } from '../../player/player';
import type { FX } from '../../fx/particles';
import type { Interactable } from '../instance';

// The Temple of Starfall (docs/design/verdant-elves.md §8, quest 5): the
// wheel-cutters' temple under the oldest grove. Two floors of grown stone and
// roots with the Starfall Script glowing on every wall.
//   The Hall of Roots   an entrance hall, a passage of wisps and spiders, and
//                       the Mirror Chamber: a shaft of starlight and three
//                       mirrors that must be turned to lead it to the crystal
//                       in the sealed door.
//   The Star Vault      down the stair: the Guardian of the Count in its ring,
//                       and beyond it the star-chart on its altar.
//
// Built self-contained on the realm pattern (dungeon/mine.ts, dungeon/realm.ts):
// it borrows the realm's fade, lighting and overworld switches without
// changing realm.ts. TODO(merge): port to the dungeon kit (feat/dungeons,
// src/dungeon/kit/) as an authored room graph once the kit lands.

export const TEMPLE_ORIGIN = new THREE.Vector3(61000, 0, 0);
/** the Star Vault lies beside the hall in this world (the stair is a fade, not a fall) */
export const VAULT_ORIGIN = new THREE.Vector3(61200, 0, 0);
const CELL = 4;
const MAP_W = 30, MAP_H = 30;

/** The Mirror Chamber's grid: 6 x 6 cells of 4 m, its south-west corner here (relative to the temple). */
const CH = { x: -12, z: -64, n: 6 };
type Turn = '/' | '\\' | 'off';
const MIRRORS: { i: number; j: number; start: Turn }[] = [{ i: 2, j: 4, start: 'off' }, { i: 2, j: 1, start: '\\' }, { i: 5, j: 1, start: '\\' }];
const SOURCE = { i: -1, j: 4, di: 1, dj: 0 };
const TARGET = { i: 5, j: -1 };

export interface TempleProgress { doorOpen: boolean; guardianDead: boolean; chartTaken: boolean }

// ---- the Guardian of the Count ---------------------------------------------------------------------
/** A sentinel of pale temple stone bound with roots, the Script glowing in its seams. */
export class TempleGuardian implements Target {
  id = newTargetId();
  kind = 'templeGuardian';
  name = 'The Guardian of the Count';
  alive = true;
  lockable = true;
  stunned = false;
  hp = 1800;
  maxHp = 1800;
  radius = 1.3;
  halfHeight = 1.8;
  position = new THREE.Vector3();
  center = new THREE.Vector3();
  readonly group = new THREE.Group();
  private arms: THREE.Group[] = [];
  private glow: THREE.MeshStandardMaterial;
  private yaw = Math.PI;
  private t = 0;
  private act: 'idle' | 'walk' | 'raise' | 'slam' | 'beam' | 'stagger' | 'dying' = 'idle';
  private at = 0;
  private cd = 2;
  private poise = 0;
  private beamMesh: THREE.Mesh | null = null;
  private beamHit = false;
  private summoned = false;
  deathT = 0;
  /** wisps it calls at half health (the temple updates them) */
  calls: ForestCreature[] = [];
  private rb: RAPIER.RigidBody;
  private col: RAPIER.Collider;

  constructor(at: THREE.Vector3, private scene: THREE.Scene, private fx: FX) {
    this.position.copy(at);
    const stone = new THREE.MeshStandardMaterial({ color: 0xc8c4d0, roughness: 0.8 });
    const root = new THREE.MeshStandardMaterial({ color: 0x5a4432, roughness: 1 });
    this.glow = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, emissive: 0x8ad0ff, emissiveIntensity: 1.6 });
    const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, p: THREE.Object3D = this.group) => {
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      p.add(mesh);
      return mesh;
    };
    add(new THREE.BoxGeometry(1.8, 2.2, 1.2), stone, 0, 2.6, 0);
    add(new THREE.BoxGeometry(1.2, 1, 1), stone, 0, 4.2, 0.1);
    add(new THREE.BoxGeometry(0.8, 0.12, 0.05), this.glow, 0, 4.3, 0.62);
    add(new THREE.CylinderGeometry(0.5, 0.6, 0.06, 16).rotateX(Math.PI / 2), this.glow, 0, 2.8, 0.62);
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.7, 1.5, 0.8), stone, s * 0.55, 0.75, 0);
      const arm = new THREE.Group();
      arm.position.set(s * 1.25, 3.4, 0);
      add(new THREE.BoxGeometry(0.6, 2, 0.6).translate(0, -1, 0), stone, 0, 0, 0, arm);
      add(new THREE.BoxGeometry(0.9, 0.9, 0.9), stone, 0, -2.3, 0, arm);
      add(new THREE.TorusGeometry(0.45, 0.08, 5, 10), root, 0, -0.8, 0, arm);
      this.group.add(arm);
      this.arms.push(arm);
    }
    for (let k = 0; k < 6; k++) add(new THREE.TorusGeometry(1 + k * 0.08, 0.07, 5, 12, Math.PI * 1.3), root, 0, 1.5 + k * 0.5, 0).rotation.set(k, k * 2, 0);
    scene.add(this.group);
    this.rb = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(at.x, at.y + 2, at.z));
    this.col = physics.world.createCollider(RAPIER.ColliderDesc.cylinder(2, 1.1), this.rb);
    targets.add(this);
    this.sync();
  }

  get dead() {
    return !this.alive && this.deathT > 3;
  }

  takeHit(h: HitInfo) {
    if (!this.alive) return;
    this.hp -= h.damage;
    this.fx.sparks(h.at, h.dir);
    if (this.hp <= 0) {
      this.alive = false;
      this.act = 'dying';
      targets.delete(this);
      this.fx.add.spawn({ pos: this.center, spread: 5, count: 90, life: [0.6, 1.6], size: [0.16, 0.02], color: 0xe8f8ff, color2: 0x5aa8ff, upBias: 1, drag: 1.2 });
      events.emit('enemyDied', { at: this.center.clone(), enemyId: this.id, kind: this.kind });
      return;
    }
    this.poise += h.poise;
    if ((this.poise > 320 || this.stunned) && this.act !== 'beam') {
      this.poise = 0;
      this.stunned = false;
      this.act = 'stagger';
      this.at = 0;
    }
  }

  update(dt: number, player: Player) {
    this.t += dt;
    this.at += dt;
    this.glow.emissiveIntensity = 1.4 + Math.sin(this.t * 3) * 0.3 + (this.act === 'raise' || this.act === 'beam' ? 1.5 : 0);
    if (this.act === 'dying') {
      this.deathT += dt;
      this.group.position.y = this.position.y - Math.min(1.2, this.deathT * 0.6);
      this.group.rotation.z = Math.min(0.5, this.deathT * 0.25);
      if (this.beamMesh) (this.scene.remove(this.beamMesh), (this.beamMesh = null));
      return;
    }
    const to = player.pos.clone().sub(this.position).setY(0);
    const d = to.length();
    const want = Math.atan2(to.x, to.z);
    const turn = (rate: number) => {
      let dy = want - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += Math.max(-rate * dt, Math.min(rate * dt, dy));
    };
    this.cd -= dt;
    // At half strength it calls the temple's wisps to it, once.
    if (!this.summoned && this.hp < this.maxHp / 2) {
      this.summoned = true;
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        this.calls.push(new ForestCreature('wisp', this.position.clone().add(new THREE.Vector3(Math.cos(a) * 6, 0, Math.sin(a) * 6)), this.scene, this.fx));
      }
    }
    switch (this.act) {
      case 'idle':
        if (d < 26 && !player.dead) this.act = 'walk';
        break;
      case 'walk':
        turn(1.6);
        if (d > 3.4) this.position.addScaledVector(to.normalize(), Math.min(d - 3.4, 2.2 * dt));
        if (this.cd <= 0) {
          this.act = d < 5 ? 'raise' : 'beam';
          this.at = 0;
          this.beamHit = false;
        }
        break;
      case 'raise':
        turn(2);
        if (this.at > 1.0) (this.act = 'slam'), (this.at = 0);
        break;
      case 'slam':
        if (this.at > 0.12 && this.at - dt <= 0.12) {
          events.emit('bossSlam', { at: this.position.clone() });
          this.fx.dust(this.position.clone().addScaledVector(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), 2.5), 3);
          if (d < 6) player.receiveAttack({ damage: 42, from: this.position.clone(), parryable: false, poise: 140 });
        }
        if (this.at > 1) (this.act = 'walk'), (this.cd = 2.2);
        break;
      case 'beam': {
        // A line of starlight from its chest: telegraphed for a second, then it burns along the line.
        if (!this.beamMesh) {
          this.beamMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 30).translate(0, 0, 15), new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
          this.scene.add(this.beamMesh);
        }
        if (this.at < 1.1) turn(1.2);
        const fire = this.at > 1.1;
        this.beamMesh.position.copy(this.center).setY(this.position.y + 2.8);
        this.beamMesh.rotation.y = this.yaw;
        (this.beamMesh.material as THREE.MeshBasicMaterial).opacity = fire ? 0.85 : 0.2 + this.at * 0.1;
        this.beamMesh.scale.set(fire ? 2 : 0.4, fire ? 2 : 0.4, 1);
        if (fire && !this.beamHit) {
          const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          const rel = player.pos.clone().sub(this.position).setY(0);
          const along = rel.dot(fwd), off = rel.clone().addScaledVector(fwd, -along).length();
          if (along > 0 && along < 30 && off < 1.3) {
            this.beamHit = true;
            player.receiveAttack({ damage: 36, from: this.position.clone(), parryable: false, poise: 60 });
          }
        }
        if (this.at > 1.8) {
          this.scene.remove(this.beamMesh);
          this.beamMesh = null;
          this.act = 'walk';
          this.cd = 2.5;
        }
        break;
      }
      case 'stagger':
        if (this.at > 1.6) this.act = 'walk';
        break;
    }
    this.sync();
  }

  private sync() {
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
    const raise = this.act === 'raise' ? -2.6 * Math.min(1, this.at) : this.act === 'slam' ? -2.6 + Math.min(1, this.at / 0.12) * 2.8 : this.act === 'stagger' ? 0.6 : Math.sin(this.t * 1.5) * 0.08;
    for (const a of this.arms) a.rotation.x = raise;
    this.center.set(this.position.x, this.position.y + 2.5, this.position.z);
    const t = { x: this.position.x, y: this.position.y + 2, z: this.position.z };
    this.rb.setNextKinematicTranslation(t);
    this.col.setTranslation(t);
  }

  dispose() {
    this.scene.remove(this.group);
    if (this.beamMesh) this.scene.remove(this.beamMesh);
    for (const c of this.calls) c.dispose();
    this.calls = [];
    physics.world.removeCollider(this.col, false);
    physics.world.removeRigidBody(this.rb);
    targets.delete(this);
  }
}

// ---- the temple ----------------------------------------------------------------------------------------
export interface TempleHooks {
  toast(msg: string): void;
  give(id: string, n: number): void;
  bossBar(t: { hp: number; maxHp: number; alive: boolean } | null, name?: string): void;
  signal(id: string): void;
  save(): void;
  fade(on: boolean): Promise<void>;
}

/** One visit to the temple: its rooms, colliders, foes, puzzle and treasure. */
export class StarfallTemple {
  readonly group = new THREE.Group();
  readonly interactables: Interactable[] = [];
  readonly map: MapData = emptyMap(MAP_W, MAP_H);
  readonly spawn = TEMPLE_ORIGIN.clone().add(new THREE.Vector3(0, 0.3, -4));
  readonly vaultSpawn = VAULT_ORIGIN.clone().add(new THREE.Vector3(0, 0.3, -4));
  /** each mirror's current turn */
  readonly turns: Turn[] = MIRRORS.map((m) => m.start);
  guardian: TempleGuardian | null = null;
  enemies: ForestCreature[] = [];
  private colliders: RAPIER.Collider[] = [];
  private mirrorMeshes: THREE.Object3D[] = [];
  private beam = new THREE.Group();
  private door: { mesh: THREE.Mesh; col: RAPIER.Collider | null; t: number } | null = null;
  private lights: THREE.PointLight[] = [];
  private mats = {
    wall: new THREE.MeshStandardMaterial({ color: 0x9a96a6, roughness: 0.9 }),
    floor: new THREE.MeshStandardMaterial({ color: 0x6a6878, roughness: 0.95 }),
    root: new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 }),
    script: new THREE.MeshStandardMaterial({ map: scriptTexture(), transparent: true, emissive: 0x8ad0ff, emissiveMap: scriptTexture(), emissiveIntensity: 1.2, depthWrite: false }),
    mirror: new THREE.MeshStandardMaterial({ color: 0xe8f0ff, roughness: 0.05, metalness: 0.9 }),
    beam: new THREE.MeshBasicMaterial({ color: 0xcfeeff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
    crystal: new THREE.MeshStandardMaterial({ color: 0x9ad8ff, emissive: 0x4a8aff, emissiveIntensity: 0.6, roughness: 0.2 }),
  };
  private t = 0;
  solved = false;

  readonly groundAt = (x: number, z: number): number | null => {
    for (const o of [TEMPLE_ORIGIN, VAULT_ORIGIN]) if (Math.abs(x - o.x) < 60 && z > o.z - 120 && z < o.z + 20) return 0;
    return null;
  };

  constructor(private scene: THREE.Scene, private fx: FX, readonly progress: TempleProgress, private hooks: TempleHooks, readonly onLeave: () => void) {
    scene.add(this.group, this.beam);
    this.buildHall();
    this.buildVault();
    this.traceBeam();
    if (progress.doorOpen) this.openDoor(true);
  }

  // ---- building ----
  private wall(x: number, z: number, w: number, d: number, h = 7, origin = TEMPLE_ORIGIN, scripted = true) {
    const p = new THREE.Vector3(origin.x + x, h / 2, origin.z + z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mats.wall);
    m.position.copy(p);
    m.castShadow = m.receiveShadow = true;
    this.group.add(m);
    this.colliders.push(physics.addBox(p, new THREE.Vector3(w / 2, h / 2, d / 2)));
    if (scripted && Math.max(w, d) > 6) {
      // The Script runs along every long wall at eye height, both faces.
      for (const s of [-1, 1]) {
        const band = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(w, d) - 1, 0.7), this.mats.script);
        if (w > d) band.position.set(p.x, 2.3, p.z + s * (d / 2 + 0.02));
        else (band.position.set(p.x + s * (w / 2 + 0.02), 2.3, p.z), (band.rotation.y = Math.PI / 2));
        if (s < 0) band.rotation.y += Math.PI;
        this.group.add(band);
      }
    }
  }
  private floor(x: number, z: number, w: number, d: number, origin = TEMPLE_ORIGIN) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, d), this.mats.floor);
    m.position.set(origin.x + x, -0.2, origin.z + z);
    m.receiveShadow = true;
    this.group.add(m);
    this.colliders.push(physics.addBox(m.position.clone(), new THREE.Vector3(w / 2, 0.2, d / 2)));
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, d), this.mats.wall);
    roof.position.set(origin.x + x, 7.3, origin.z + z);
    this.group.add(roof);
  }
  private light(x: number, y: number, z: number, origin = TEMPLE_ORIGIN, color = 0x9ad8ff, intensity = 26, dist = 22) {
    const l = new THREE.PointLight(color, intensity, dist, 1.6);
    l.position.set(origin.x + x, y, origin.z + z);
    this.group.add(l);
    this.lights.push(l);
  }
  private roots(x: number, z: number, n: number, origin = TEMPLE_ORIGIN) {
    for (let k = 0; k < n; k++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(2 + Math.random() * 2, 0.2 + Math.random() * 0.15, 5, 12, Math.PI * (0.5 + Math.random() * 0.5)), this.mats.root);
      r.position.set(origin.x + x + (Math.random() - 0.5) * 6, 5 + Math.random() * 2, origin.z + z + (Math.random() - 0.5) * 6);
      r.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      this.group.add(r);
    }
  }

  /** The Hall of Roots: entrance (z 0..-12), the passage (to -40), the Mirror Chamber (-40..-64), the sealed door and the stair. */
  private buildHall() {
    const O = TEMPLE_ORIGIN;
    // Entrance hall 14 x 12.
    this.floor(0, -6, 14, 12);
    this.wall(-7, -6, 1, 12); this.wall(7, -6, 1, 12); this.wall(0, 0.5, 14, 1);
    this.wall(-4.5, -12, 5, 1); this.wall(4.5, -12, 5, 1);
    // The passage north, 4 m wide.
    this.floor(0, -26, 4, 28);
    this.wall(-2.5, -26, 1, 28); this.wall(2.5, -26, 1, 28);
    // The Mirror Chamber: 24 x 24 (6 x 6 cells), the passage entering its south wall.
    this.floor(0, -52, 24, 24);
    this.wall(-12.5, -52, 1, 24); this.wall(12.5, -52, 1, 24);
    this.wall(-7.5, -40, 9, 1); this.wall(7.5, -40, 9, 1);
    this.wall(-6.5, -64.5, 13, 1); this.wall(10, -64.5, 6, 1);
    // The sealed door in the north wall, over cell column 5, and the crystal in it.
    const door = new THREE.Mesh(new THREE.BoxGeometry(4, 7, 1), this.mats.wall);
    door.position.set(O.x + CH.x + 5 * CELL + 2, 3.5, O.z + CH.z - 0.5);
    this.group.add(door);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), this.mats.crystal);
    crystal.position.set(door.position.x, 2.4, door.position.z + 0.7);
    this.group.add(crystal);
    this.door = { mesh: door, col: physics.addBox(door.position.clone(), new THREE.Vector3(2, 3.5, 0.5)), t: 0 };
    // Beyond the door, the landing with the stair down.
    this.floor(CH.x + 5 * CELL + 2, -70, 8, 10);
    this.wall(CH.x + 5 * CELL - 2.5, -70, 1, 10); this.wall(CH.x + 5 * CELL + 6.5, -70, 1, 10); this.wall(CH.x + 5 * CELL + 2, -75.5, 8, 1);
    const stair = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 3), new THREE.MeshBasicMaterial({ color: 0x020304 }));
    stair.position.set(O.x + CH.x + 5 * CELL + 2, 0.05, O.z - 72);
    this.group.add(stair);
    this.interactables.push({
      pos: stair.position.clone(), radius: 2.5, label: () => 'Descend to the Star Vault', enabled: () => this.progress.doorOpen,
      action: () => void this.go(this.vaultSpawn),
    });
    // The shaft of starlight in the west wall, and the three mirrors on their pedestals.
    const shaft = new THREE.Mesh(new THREE.CircleGeometry(0.8, 16), this.mats.beam);
    shaft.position.set(O.x + CH.x + 0.05 - 0.4, 1.6, O.z + CH.z + (SOURCE.j + 0.5) * CELL);
    shaft.rotation.y = Math.PI / 2;
    this.group.add(shaft);
    MIRRORS.forEach((mm, k) => {
      const c = this.cellCentre(mm.i, mm.j);
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 1, 10), this.mats.wall);
      ped.position.set(c.x, 0.5, c.z);
      this.group.add(ped);
      const frame = new THREE.Group();
      frame.add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 2, 0.08), this.mats.mirror));
      frame.position.set(c.x, 2, c.z);
      this.group.add(frame);
      this.mirrorMeshes.push(frame);
      this.colliders.push(physics.addCylinder(new THREE.Vector3(c.x, 1, c.z), 1, 0.7));
      this.interactables.push({
        pos: new THREE.Vector3(c.x, 0, c.z), radius: 2.2,
        label: () => `Turn the mirror (${this.turns[k] === 'off' ? 'turned aside' : this.turns[k] === '/' ? 'facing north-east' : 'facing south-east'})`,
        enabled: () => !this.solved,
        action: () => this.turn(k),
      });
    });
    this.roots(0, -6, 5); this.roots(0, -26, 6); this.roots(0, -52, 8);
    this.light(0, 5, -6, O, 0xffd8a0, 18, 18);
    this.light(0, 5, -26);
    this.light(-6, 6, -52); this.light(6, 6, -52);
    // The way out.
    this.interactables.push({ pos: O.clone().add(new THREE.Vector3(0, 0, -1)), radius: 2.2, label: () => 'Leave the Temple', enabled: () => true, action: () => this.onLeave() });
    // Its keepers: wisps in the passage, spiders in the chamber.
    if (!this.progress.guardianDead) {
      for (const [x, z, k] of [[0, -22, 'wisp'], [0, -32, 'wisp'], [-6, -48, 'forestSpider'], [7, -56, 'forestSpider']] as [number, number, 'wisp' | 'forestSpider'][]) {
        this.enemies.push(new ForestCreature(k, O.clone().add(new THREE.Vector3(x, 0, z)), this.scene, this.fx));
      }
    }
  }

  /** The Star Vault: a hall, the Guardian's ring, and the altar with the star-chart. */
  private buildVault() {
    const O = VAULT_ORIGIN;
    this.floor(0, -8, 10, 16, O);
    this.wall(-5.5, -8, 1, 16, 7, O); this.wall(5.5, -8, 1, 16, 7, O); this.wall(0, 0.5, 10, 1, 7, O);
    // The ring: a round chamber of 18 m radius (built of wall segments).
    this.floor(0, -36, 40, 40, O);
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.18) continue; // the way in (south)
      if (Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2))) < 0.18) continue; // the way on (north)
      const x = Math.cos(a) * 19, z = -36 + Math.sin(a) * 19;
      const p = new THREE.Vector3(O.x + x, 3.5, O.z + z);
      const m = new THREE.Mesh(new THREE.BoxGeometry(4.4, 7, 1), this.mats.wall);
      m.position.copy(p);
      m.rotation.y = Math.PI / 2 - a;
      this.group.add(m);
      const band = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.7), this.mats.script);
      band.position.set(O.x + Math.cos(a) * 18.45, 2.5, O.z - 36 + Math.sin(a) * 18.45);
      band.rotation.y = -a - Math.PI / 2;
      this.group.add(band);
      this.colliders.push(physics.addBox(p, new THREE.Vector3(2.2, 3.5, 0.5), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2 - a, 0))));
    }
    // The starfield on the floor of the ring.
    const disc = new THREE.Mesh(new THREE.CircleGeometry(8, 48).rotateX(-Math.PI / 2), this.mats.script);
    disc.position.set(O.x, 0.03, O.z - 36);
    this.group.add(disc);
    // The altar room beyond.
    this.floor(0, -62, 10, 10, O);
    this.wall(-5.5, -62, 1, 10, 7, O); this.wall(5.5, -62, 1, 10, 7, O); this.wall(0, -67.5, 10, 1, 7, O);
    const altar = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 1.1, 16), this.mats.wall);
    altar.position.set(O.x, 0.55, O.z - 63);
    this.group.add(altar);
    this.colliders.push(physics.addCylinder(altar.position.clone(), 0.55, 1.5));
    const chart = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.08, 32), this.mats.crystal);
    chart.position.set(O.x, 1.15, O.z - 63);
    chart.visible = !this.progress.chartTaken;
    this.group.add(chart);
    this.interactables.push({
      pos: new THREE.Vector3(O.x, 0, O.z - 61), radius: 2.6,
      label: () => (this.progress.chartTaken ? 'An empty altar' : this.guardian?.alive ? 'The altar (the Guardian stands watch)' : 'Take the star-chart'),
      enabled: () => !this.progress.chartTaken && !this.guardian?.alive,
      action: () => {
        this.progress.chartTaken = true;
        chart.visible = false;
        this.hooks.give('starChart', 1);
        this.hooks.toast('A disc of pale stone, cut with stars and twelve spokes. The wheel-cutters counted the Turning by the stars.');
        this.hooks.save();
      },
    });
    this.interactables.push({ pos: O.clone().add(new THREE.Vector3(0, 0, -1)), radius: 2.2, label: () => 'Climb back to the Hall of Roots', enabled: () => true, action: () => void this.go(this.spawn.clone().setZ(TEMPLE_ORIGIN.z - 70).setX(TEMPLE_ORIGIN.x + CH.x + 5 * CELL + 2)) });
    this.light(0, 6, -8, O); this.light(0, 7, -36, O, 0xbfe8ff, 40, 34); this.light(0, 5, -62, O, 0xffe8c0, 20, 16);
    this.roots(0, -36, 10, O);
    if (!this.progress.guardianDead) this.guardian = new TempleGuardian(O.clone().add(new THREE.Vector3(0, 0, -40)), this.scene, this.fx);
  }

  // ---- the mirror puzzle ----
  cellCentre(i: number, j: number) {
    return new THREE.Vector3(TEMPLE_ORIGIN.x + CH.x + (i + 0.5) * CELL, 0, TEMPLE_ORIGIN.z + CH.z + (j + 0.5) * CELL);
  }
  /** Turn a mirror to its next position (aside, north-east, south-east). */
  turn(k: number) {
    if (this.solved) return;
    const order: Turn[] = ['off', '/', '\\'];
    this.turns[k] = order[(order.indexOf(this.turns[k]) + 1) % 3];
    this.traceBeam();
  }
  /** Follow the starlight across the chamber; open the door if it reaches the crystal. */
  traceBeam() {
    for (const c of [...this.beam.children]) this.beam.remove(c);
    MIRRORS.forEach((mm, k) => {
      const f = this.mirrorMeshes[k];
      f.rotation.y = this.turns[k] === 'off' ? 0 : this.turns[k] === '/' ? Math.PI / 4 : -Math.PI / 4;
      f.position.y = this.turns[k] === 'off' ? 1.2 : 2;
      void mm;
    });
    let i = SOURCE.i, j = SOURCE.j, di = SOURCE.di, dj = SOURCE.dj;
    let from = this.cellCentre(i, j);
    let hit = false;
    for (let step = 0; step < 40; step++) {
      i += di; j += dj;
      if (i === TARGET.i && j === TARGET.j) {
        hit = true;
        this.segment(from, this.cellCentre(i, j).setZ(this.cellCentre(i, j).z + 1.5));
        break;
      }
      if (i < 0 || j < 0 || i >= CH.n || j >= CH.n) {
        this.segment(from, this.cellCentre(i, j).sub(new THREE.Vector3(di * 1.8, 0, dj * 1.8)));
        break;
      }
      const m = MIRRORS.findIndex((x) => x.i === i && x.j === j);
      if (m >= 0 && this.turns[m] !== 'off') {
        const to = this.cellCentre(i, j);
        this.segment(from, to);
        from = to;
        if (this.turns[m] === '/') [di, dj] = [dj, di].map((v) => -v) as [number, number];
        else [di, dj] = [dj, di];
      }
    }
    if (hit && !this.solved) {
      this.solved = true;
      this.mats.crystal.emissiveIntensity = 3;
      if (!this.progress.doorOpen) {
        this.hooks.toast('The starlight strikes the crystal. With a sound like a bell under water, the sealed door sinks into the floor.');
        this.openDoor(false);
      }
    }
  }
  private segment(a: THREE.Vector3, b: THREE.Vector3) {
    const len = a.distanceTo(b);
    if (len < 0.01) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, len), this.mats.beam);
    m.position.copy(a).lerp(b, 0.5).setY(1.6);
    m.lookAt(b.clone().setY(1.6));
    this.beam.add(m);
  }
  private openDoor(now: boolean) {
    this.progress.doorOpen = true;
    if (this.door?.col) {
      physics.removeStatic(this.door.col);
      this.door.col = null;
    }
    if (now && this.door) this.door.mesh.position.y = -3.6;
    this.hooks.save();
  }

  private async go(to: THREE.Vector3) {
    await this.hooks.fade(true);
    this.player?.teleport(to.clone().setY(0.4));
    await this.hooks.fade(false);
  }
  player: Player | null = null;

  /** Map cell of a world point (both floors share one sheet: the vault is drawn to the right). */
  cellOf(x: number, z: number): [number, number] {
    const vault = x > (TEMPLE_ORIGIN.x + VAULT_ORIGIN.x) / 2;
    const o = vault ? VAULT_ORIGIN : TEMPLE_ORIGIN;
    return [Math.floor((x - o.x) / CELL + MAP_W / 4 + (vault ? MAP_W / 2 : 0)), Math.floor((z - o.z) / CELL + MAP_H - 2)];
  }

  update(dt: number, player: Player) {
    this.player = player;
    this.t += dt;
    this.mats.script.emissiveIntensity = 1.1 + Math.sin(this.t * 1.3) * 0.25;
    if (this.door && this.progress.doorOpen && this.door.mesh.position.y > -3.6) this.door.mesh.position.y = Math.max(-3.6, this.door.mesh.position.y - dt * 2.5);
    for (const e of this.enemies) e.update(dt, player);
    for (const e of this.enemies.filter((x) => x.dead)) e.dispose();
    this.enemies = this.enemies.filter((x) => !x.dead);
    const g = this.guardian;
    if (g) {
      g.update(dt, player);
      for (const w of g.calls) w.update(dt, player);
      this.hooks.bossBar(g.alive && g.position.distanceTo(player.pos) < 30 ? g : null, 'The Guardian of the Count');
      if (!g.alive && !this.progress.guardianDead) {
        this.progress.guardianDead = true;
        this.hooks.bossBar(null);
        events.emit('deed', { id: 'boss:templeGuardian', renown: 2, label: 'Silenced the Guardian of the Count in the Temple of Starfall' });
        this.hooks.toast('The Guardian kneels, and the Script in its seams goes dark. Beyond the ring, an altar glows.');
        this.hooks.save();
      }
      if (g.dead) {
        g.dispose();
        this.guardian = null;
      }
    }
    // Starlight motes drifting down from the ceiling.
    if (Math.random() < dt * 6) this.fx.add.spawn({ pos: player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 10, 5, (Math.random() - 0.5) * 10)), spread: 0.1, count: 1, life: [2, 3.5], size: [0.05, 0.02], color: 0xdff4ff, color2: 0x7ab8ff, gravity: 0.3 });
  }

  dispose() {
    this.hooks.bossBar(null);
    this.scene.remove(this.group, this.beam);
    for (const c of this.colliders) physics.removeStatic(c);
    if (this.door?.col) physics.removeStatic(this.door.col);
    this.colliders = [];
    for (const e of this.enemies) e.dispose();
    this.enemies = [];
    this.guardian?.dispose();
    this.guardian = null;
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}

/**
 * Going in and out of the temple through the realm's own switches (fade,
 * lighting, hiding the overworld) without changing realm.ts.
 */
export class StarfallGate {
  temple: StarfallTemple | null = null;
  private busy = false;

  constructor(readonly progress: TempleProgress, private realm: Realm, private scene: THREE.Scene, private fx: FX, private player: Player, private mapUI: DungeonMapUI, private hooks: TempleHooks, private outside: () => THREE.Vector3) {}

  get inside() {
    return !!this.temple;
  }

  async enter() {
    const R = this.realm as unknown as { busy: boolean; mode: string; overworld: { clearEnemies(): void; enemiesEnabled(on: boolean): void; hide(h: boolean): void }; atmosphere(d: boolean, i?: boolean, m?: boolean): void; active: unknown };
    if (this.busy || R.busy || R.mode !== 'overworld') return;
    this.busy = true;
    await this.hooks.fade(true);
    R.overworld.clearEnemies();
    R.overworld.enemiesEnabled(false);
    R.overworld.hide(true);
    R.atmosphere(true, false, true);
    R.mode = 'dungeon';
    R.active = null;
    this.temple = new StarfallTemple(this.scene, this.fx, this.progress, this.hooks, () => void this.leave());
    this.temple.player = this.player;
    setGroundOverride(this.temple.groundAt);
    this.mapUI.setFloor(this.temple.map, 'TEMPLE OF STARFALL');
    this.player.teleport(this.temple.spawn.clone());
    this.player.yaw = Math.PI;
    this.player.lock = null;
    this.hooks.signal('temple-entered');
    this.hooks.toast('The Temple of Starfall. The Script on the walls glows as you pass, as if it is reading you.');
    await this.hooks.fade(false);
    this.busy = false;
  }

  async leave() {
    const R = this.realm as unknown as { mode: string; overworld: { enemiesEnabled(on: boolean): void; hide(h: boolean): void }; atmosphere(d: boolean): void };
    if (this.busy || !this.temple) return;
    this.busy = true;
    await this.hooks.fade(true);
    this.dispose();
    R.mode = 'overworld';
    this.mapUI.setFloor(null);
    R.overworld.hide(false);
    R.overworld.enemiesEnabled(true);
    R.atmosphere(false);
    const p = this.outside();
    this.player.teleport(p.setY(heightAt(p.x, p.z) + 0.4));
    this.hooks.save();
    await this.hooks.fade(false);
    this.busy = false;
  }

  /** Tear the temple down without the realm's switches (someone else already left the dungeon). */
  dispose() {
    this.temple?.dispose();
    this.temple = null;
    setGroundOverride(null);
  }

  step(dt: number) {
    const t = this.temple;
    if (!t) return;
    // Something else took us out of the dungeon (a test reset, a forced respawn): clean up.
    if ((this.realm as unknown as { mode: string }).mode !== 'dungeon') return this.dispose();
    t.update(dt, this.player);
    const [cx, cy] = t.cellOf(this.player.pos.x, this.player.pos.z);
    this.mapUI.setPlayer(cx, cy, Math.PI - this.player.yaw);
  }

  get respawn() {
    return this.temple ? this.temple.spawn.clone() : null;
  }
}
