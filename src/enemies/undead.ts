import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { physics, groups, G_ENEMY, STATIC_ONLY } from '../physics/physics';
import { clamp, dampAngle, segmentPointDistance, smoothstep } from '../core/math';
import { events } from '../core/events';
import { newTargetId, targets, type HitInfo, type Target } from '../combat/targets';
import { Character } from '../player/character';
import { Animator } from '../player/animator';
import { RigLayer } from '../player/rigLayer';
import { armorPieces } from '../items/armorModels';
import { buildSword, buildRoundShield } from '../items/weaponModels';
import { sfx } from '../audio/sfx';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';

// ---------------------------------------------------------------------------
// The Gravewood's dead: zombies (the Sketchfab zombie, rebound onto the hero's
// skeleton by tools/rig-orcs.mjs) and skeleton warriors (bones built here and
// skinned rigidly to the hero's own rig, with a rusted sword, shield and helm).
// Both play the hero's mocap clips. They claw their way up out of the ground,
// then shamble (zombies) or stride (skeletons) in and swing.
// ---------------------------------------------------------------------------

export type UndeadKind = 'zombie' | 'skeleton';

interface Stats {
  hp: number;
  damage: number;
  poise: number;
  speed: number;
  /** stagger threshold per hit */
  staggerPoise: number;
  rise: number; // seconds to climb out
  swings: { clip: string; speed: number; hitFrom: number; hitTo: number; lunge: number }[];
}

const STATS: Record<UndeadKind, Stats> = {
  zombie: {
    hp: 78, damage: 14, poise: 24, speed: 1.45, staggerPoise: 18, rise: 2.6,
    swings: [
      { clip: 'attack_light_2', speed: 0.85, hitFrom: 0.34, hitTo: 0.56, lunge: 1.4 },
      { clip: 'attack_light_1', speed: 0.9, hitFrom: 0.5, hitTo: 0.74, lunge: 1.6 },
    ],
  },
  skeleton: {
    hp: 66, damage: 16, poise: 30, speed: 2.35, staggerPoise: 24, rise: 1.9,
    swings: [
      { clip: 'attack_light_1', speed: 1.1, hitFrom: 0.5, hitTo: 0.72, lunge: 2.2 },
      { clip: 'attack_heavy', speed: 1.0, hitFrom: 0.55, hitTo: 0.95, lunge: 2.6 },
    ],
  },
};

const ZOMBIE_URL = '/assets/gravewood/gwZombie.glb';
const CLIPS = ['idle', 'walk', 'run', 'walk_back', 'strafe_l', 'strafe_r', 'attack_light_1', 'attack_light_2', 'attack_heavy', 'hit_react', 'death', 'cast_big', 'block_idle'];
const DEPTH = 1.9; // how deep they start
const GRAV = 20;

// ---- skeleton body --------------------------------------------------------------------------

const boneMat = new THREE.MeshStandardMaterial({ color: 0xd9cdb1, roughness: 0.72, metalness: 0 });
const socketMat = new THREE.MeshStandardMaterial({ color: 0x0b0806, roughness: 1 });
const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 1.9, 2.6) });

/**
 * Bones for a skeleton warrior, modelled in the hero's bind pose (metres, +Z
 * forward) and weighted rigidly, one bone per part: one skinned draw call per
 * warrior, sharing this geometry. Groups: 0 bone, 1 eye sockets, 2 eye glow.
 */
function buildBones(skel: THREE.Skeleton): THREE.BufferGeometry {
  const idx = new Map(skel.bones.map((b, i) => [b.name.replace(/^mixamorig\d*[:_]?/, ''), i]));
  const rest = skel.boneInverses.map((m) => new THREE.Matrix4().copy(m).invert());
  const at = (n: string) => new THREE.Vector3().setFromMatrixPosition(rest[idx.get(n)!]);
  const parts: [THREE.BufferGeometry, string, number][] = []; // geometry (bind space), bone, material group
  const Y = new THREE.Vector3(0, 1, 0);
  /** A bone shaft between two points, knobbed at both ends. */
  const shaft = (a: THREE.Vector3, b: THREE.Vector3, r: number, bone: string, knob = 1.5) => {
    const len = a.distanceTo(b);
    const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - r * 2), 3, 7);
    g.translate(0, len / 2, 0);
    for (const end of [0, len]) {
      const k = new THREE.SphereGeometry(r * knob, 7, 5);
      k.scale(1.15, 0.8, 1);
      k.translate(0, end, 0);
      parts.push([orient(k, a, b), bone, 0]);
    }
    parts.push([orient(g, a, b), bone, 0]);
  };
  const orient = (g: THREE.BufferGeometry, a: THREE.Vector3, b: THREE.Vector3) => {
    const q = new THREE.Quaternion().setFromUnitVectors(Y, b.clone().sub(a).normalize());
    g.applyQuaternion(q);
    g.translate(a.x, a.y, a.z);
    return g;
  };
  const side = (s: 'Left' | 'Right') => {
    const sx = s === 'Left' ? 1 : -1;
    // Arm: humerus, radius and ulna side by side, clavicle.
    shaft(at(s + 'Shoulder'), at(s + 'Arm'), 0.011, s + 'Shoulder', 1.3);
    shaft(at(s + 'Arm'), at(s + 'ForeArm'), 0.02, s + 'Arm');
    for (const off of [-0.011, 0.011]) {
      const o = new THREE.Vector3(0, 0, off);
      shaft(at(s + 'ForeArm').add(o), at(s + 'Hand').add(o), 0.0095, s + 'ForeArm', 1.35);
    }
    // Hand: metacarpals then three segments per finger.
    for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) {
      if (!idx.has(`${s}Hand${f}1`)) continue;
      if (f !== 'Thumb') shaft(at(s + 'Hand'), at(`${s}Hand${f}1`), 0.0055, s + 'Hand', 1.4);
      for (let i = 1; i <= 3; i++) {
        const a = `${s}Hand${f}${i}`, b = `${s}Hand${f}${i + 1}`;
        if (idx.has(a) && idx.has(b)) shaft(at(a), at(b), 0.0048, a, 1.3);
      }
    }
    // Leg: femur, tibia and fibula, foot and toes.
    shaft(at(s + 'UpLeg'), at(s + 'Leg'), 0.024, s + 'UpLeg');
    shaft(at(s + 'Leg'), at(s + 'Foot'), 0.019, s + 'Leg');
    shaft(at(s + 'Leg').add(new THREE.Vector3(sx * 0.018, -0.03, -0.01)), at(s + 'Foot').add(new THREE.Vector3(sx * 0.015, 0.04, -0.01)), 0.008, s + 'Leg', 1.2);
    const kneecap = new THREE.SphereGeometry(0.03, 8, 6);
    kneecap.scale(1, 1, 0.55);
    const k = at(s + 'Leg');
    kneecap.translate(k.x, k.y, k.z + 0.04);
    parts.push([kneecap, s + 'Leg', 0]);
    for (const off of [-0.018, 0, 0.018]) {
      const o = new THREE.Vector3(off, 0, 0);
      shaft(at(s + 'Foot').add(o), at(s + 'ToeBase').add(o), 0.008, s + 'Foot', 1.3);
      shaft(at(s + 'ToeBase').add(o), at(s + 'Toe_End').add(o), 0.006, s + 'ToeBase', 1.2);
    }
  };
  side('Left');
  side('Right');
  // Spine: stacked vertebrae from pelvis to skull.
  const chain = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'];
  for (let i = 0; i < chain.length - 1; i++) {
    const a = at(chain[i]), b = at(chain[i + 1]);
    for (let k = 0; k < 3; k++) {
      const p = a.clone().lerp(b, (k + 0.5) / 3).add(new THREE.Vector3(0, 0, -0.035));
      const v = new THREE.CylinderGeometry(0.022, 0.024, 0.024, 8);
      v.translate(p.x, p.y, p.z);
      parts.push([v, chain[i], 0]);
      const spur = new THREE.BoxGeometry(0.012, 0.012, 0.04);
      spur.translate(p.x, p.y - 0.004, p.z - 0.03);
      parts.push([spur, chain[i], 0]);
    }
  }
  // Ribcage: open hoops around the chest, widest in the middle, and a sternum.
  const s1 = at('Spine1'), s2 = at('Spine2'), neck = at('Neck');
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const y = THREE.MathUtils.lerp(s1.y - 0.02, neck.y - 0.05, t);
    const w = 0.13 * (0.8 + 0.3 * Math.sin(Math.PI * (0.35 + t * 0.6)));
    const rib = new THREE.TorusGeometry(1, 0.012 / w, 5, 18, Math.PI * 1.62);
    rib.rotateZ(Math.PI / 2 + Math.PI * 0.19); // open at the front
    rib.rotateX(Math.PI / 2 + 0.25); // ribs slope down toward the front
    rib.scale(w, w, w * 0.8);
    rib.translate(0, y, s2.z + 0.045);
    parts.push([rib, t < 0.4 ? 'Spine1' : 'Spine2', 0]);
  }
  const sternum = new THREE.BoxGeometry(0.03, 0.17, 0.014);
  sternum.rotateX(0.2);
  sternum.translate(0, (s1.y + neck.y) / 2 + 0.02, s2.z + 0.15);
  parts.push([sternum, 'Spine2', 0]);
  // Pelvis: a bowl of two flared blades and a ring.
  const hips = at('Hips');
  const ring = new THREE.TorusGeometry(0.085, 0.017, 6, 14);
  ring.rotateX(Math.PI / 2 - 0.4);
  ring.translate(hips.x, hips.y - 0.02, hips.z + 0.01);
  parts.push([ring, 'Hips', 0]);
  for (const sx of [-1, 1]) {
    const wing = new THREE.SphereGeometry(0.07, 9, 7, 0, Math.PI);
    wing.scale(0.9, 0.85, 0.35);
    wing.rotateY(sx * 1.2);
    wing.translate(hips.x + sx * 0.08, hips.y + 0.04, hips.z - 0.01);
    parts.push([wing, 'Hips', 0]);
  }
  // Skull: cranium, cheekbones, jaw, dark sockets with a cold light in each.
  const head = at('Head');
  const cranium = new THREE.SphereGeometry(0.098, 14, 11);
  cranium.scale(0.88, 1, 1.08);
  cranium.translate(head.x, head.y + 0.095, head.z - 0.005);
  parts.push([cranium, 'Head', 0]);
  const face = new THREE.BoxGeometry(0.12, 0.07, 0.07);
  face.translate(head.x, head.y + 0.045, head.z + 0.05);
  parts.push([face, 'Head', 0]);
  const jaw = new THREE.BoxGeometry(0.095, 0.03, 0.08);
  jaw.translate(head.x, head.y + 0.005, head.z + 0.045);
  parts.push([jaw, 'Head', 0]);
  for (const sx of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.024, 8, 6);
    eye.translate(head.x + sx * 0.036, head.y + 0.085, head.z + 0.078);
    parts.push([eye, 'Head', 1]);
    const glow = new THREE.SphereGeometry(0.009, 6, 5);
    glow.translate(head.x + sx * 0.036, head.y + 0.085, head.z + 0.09);
    parts.push([glow, 'Head', 2]);
  }
  const nose = new THREE.ConeGeometry(0.014, 0.03, 3);
  nose.rotateX(Math.PI);
  nose.translate(head.x, head.y + 0.055, head.z + 0.088);
  parts.push([nose, 'Head', 1]);

  // Merge per material group, rigidly skinned.
  const byGroup: THREE.BufferGeometry[][] = [[], [], []];
  for (const [g, bone, grp] of parts) {
    const geo = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal'].includes(k)) geo.deleteAttribute(k);
    const n = geo.attributes.position.count;
    const si = new Uint16Array(n * 4).fill(0), sw = new Float32Array(n * 4);
    const b = idx.get(bone) ?? idx.get('Hips')!;
    for (let i = 0; i < n; i++) {
      si[i * 4] = b;
      sw[i * 4] = 1;
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    byGroup[grp].push(geo);
  }
  return mergeGeometries(byGroup.map((l) => mergeGeometries(l)!), true)!;
}

let skeletonGeo: THREE.BufferGeometry | null = null;
/** Last time one of the dead staggered the player: a pack can't chain-stun you. */
let lastStagger = -1e9;
let preloading: Promise<void> | null = null;

/**
 * Parse every file a wave needs (the zombie and hero bodies, the clips, the
 * skeleton's bones) before the first grave opens, so the rising doesn't hitch.
 */
export function preloadUndead(extra: string[] = [], gpu?: { renderer: THREE.WebGLRenderer; camera: THREE.Camera; scene: THREE.Scene }) {
  return (preloading ??= (async () => {
    const z = new Character();
    const s = new Character();
    const bosses = extra.map(() => new Character());
    await Promise.all([
      z.load('/assets/character/', { model: ZOMBIE_URL, height: 0, clips: CLIPS }),
      s.load('/assets/character/', { clips: CLIPS }),
      // Bosses play every clip, so parse them all now too.
      ...extra.map((m, i) => bosses[i].load('/assets/character/', { model: m })),
    ]);
    skeletonGeo ??= buildBones(s.meshes[0].skeleton);
    if (!gpu) return;
    // Upload their textures and compile their shaders too: the first body
    // out of the ground otherwise stalls a frame.
    const holder = new THREE.Group();
    const bones = new THREE.SkinnedMesh(skeletonGeo, [boneMat, socketMat, eyeMat]);
    bones.bind(s.meshes[0].skeleton, s.meshes[0].bindMatrix);
    s.meshes[0].parent!.add(bones);
    for (const c of [z, s, ...bosses]) holder.add(c.root);
    holder.traverse((o) => {
      const mats = (o as THREE.Mesh).material;
      for (const m of (Array.isArray(mats) ? mats : mats ? [mats] : []) as THREE.MeshStandardMaterial[]) {
        for (const t of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.emissiveMap]) if (t) gpu.renderer.initTexture(t);
      }
    });
    await gpu.renderer.compileAsync(holder, gpu.camera, gpu.scene);
  })());
}

// ---- the undead ------------------------------------------------------------------------------

type State = 'rising' | 'idle' | 'chase' | 'attack' | 'hurt' | 'dying';

export class Undead implements Target {
  id = newTargetId();
  alive = true;
  lockable = false; // not until it has climbed out
  stunned = false;
  hp: number;
  maxHp: number;
  radius = 0.34;
  halfHeight = 0.82;
  position = new THREE.Vector3();
  center = new THREE.Vector3();
  readonly group = new THREE.Group();
  /** resolves once the body is loaded */
  readonly ready: Promise<void>;

  private stats: Stats;
  private state: State = 'rising';
  private st = 0;
  private cooldown = 0.6 + Math.random() * 0.8;
  private deathT = 0;
  private hitDone = false;
  private swing = 0;
  private vel = new THREE.Vector3();
  private yaw: number;
  private grounded = true;
  private rb: RAPIER.RigidBody;
  private col: RAPIER.Collider;
  private kcc: RAPIER.KinematicCharacterController;
  private char = new Character();
  private anim: Animator | null = null;
  private rig: RigLayer | null = null;
  private rise = 0; // 0 buried .. 1 out
  private pace: number;
  private groanT = 2 + Math.random() * 6;
  private flash = 0;
  private mats: THREE.MeshStandardMaterial[] = [];

  constructor(readonly kind: UndeadKind, at: THREE.Vector3, yaw: number, private scene: THREE.Scene, private fx: FX) {
    this.stats = STATS[kind];
    this.hp = this.maxHp = this.stats.hp;
    this.position.copy(at);
    this.yaw = yaw;
    // Each one moves at its own pace, so a wave doesn't march in step.
    this.pace = 0.85 + Math.random() * 0.3;
    scene.add(this.group);
    this.group.visible = false;

    this.rb = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(at.x, at.y + 0.8, at.z));
    this.col = physics.world.createCollider(RAPIER.ColliderDesc.capsule(0.48, 0.3).setCollisionGroups(groups(G_ENEMY, 0)), this.rb);
    this.kcc = physics.createCharacterController(0.02);
    this.kcc.setMaxSlopeClimbAngle(Math.PI / 3);
    this.syncVisual();
    this.ready = this.load();
  }

  private async load() {
    const c = this.char;
    if (this.kind === 'zombie') await c.load('/assets/character/', { model: ZOMBIE_URL, height: 0, clips: CLIPS });
    else {
      await c.load('/assets/character/', { clips: CLIPS });
      // The hero's body is only a skeleton to hang bones on.
      const body = c.meshes[0];
      skeletonGeo ??= buildBones(body.skeleton);
      const bones = new THREE.SkinnedMesh(skeletonGeo, [boneMat, socketMat, eyeMat]);
      bones.bind(body.skeleton, body.bindMatrix);
      bones.frustumCulled = false;
      bones.castShadow = true;
      body.parent!.add(bones);
      for (const m of c.meshes) m.visible = false;
      c.model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m !== bones && !(m as THREE.SkinnedMesh).isSkinnedMesh) m.visible = false;
      });
    }
    c.root.updateMatrixWorld(true);
    this.anim = new Animator(c);
    if (this.kind === 'skeleton') {
      this.rig = new RigLayer(c);
      this.rig.setup();
      const rust = (o: THREE.Object3D, tint: number) => o.traverse((m) => {
        const mesh = m as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.color.multiply(new THREE.Color(tint));
        mat.roughness = Math.min(1, mat.roughness + 0.35);
        mat.metalness *= 0.5;
        mesh.material = mat;
        mesh.castShadow = true;
      });
      const sword = buildSword({ bladeLen: 0.78, bladeWidth: 0.032, thickness: 0.005, fullerLen: 0.45, gripLen: 0.13, guardSpan: 0.1, guardStyle: 'straight', pommel: 'wheel' });
      rust(sword, 0x9a7458);
      this.rig.hands.Right.socket.add(sword);
      const shield = buildRoundShield('plain', ['#3b2e24', '#5b4a38']);
      shield.rotation.y = Math.PI;
      shield.scale.setScalar(0.85);
      rust(shield, 0x8a7a68);
      this.rig.hands.Left.socket.add(shield);
      this.rig.setCurl('Right', 1);
      this.rig.setCurl('Left', 0.8);
      const helm = armorPieces.helm(0.2);
      rust(helm, 0x7a5a44);
      c.socket('Head', 'helm').add(helm);
    }
    c.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) {
        if (mat.isMeshStandardMaterial && !this.mats.includes(mat)) this.mats.push(mat);
      }
    });
    this.group.add(c.root);
    this.group.visible = true;
    // The grave splits open.
    sfx.graveBurst();
    this.fx.dust(this.position.clone(), 2);
    this.animate(0);
  }

  get dead() {
    return this.state === 'dying' && this.deathT > 3.4;
  }
  get risen() {
    return this.state !== 'rising';
  }

  takeHit(h: HitInfo) {
    if (!this.alive || this.state === 'dying' || this.state === 'rising') return;
    // Skeletons catch blows on the shield when facing them and not mid-swing.
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const blocked = this.kind === 'skeleton' && this.state !== 'attack' && h.source !== 'spell' && h.dir.clone().setY(0).normalize().dot(fwd) < -0.6 && Math.random() < 0.35;
    this.hp -= blocked ? h.damage * 0.25 : h.damage;
    this.flash = 1;
    if (blocked) this.fx.sparks(this.center.clone().addScaledVector(fwd, 0.4), fwd);
    else this.fx.add.spawn({ pos: h.at ?? this.center, spread: 2, count: 8, life: [0.3, 0.6], size: [0.06, 0.01], color: this.kind === 'zombie' ? 0x5a1a10 : 0xe8e0c8, color2: 0x201008, gravity: 8 });
    if (this.hp <= 0) return this.die();
    if (!blocked && (h.source === 'spell' || h.poise >= this.stats.staggerPoise)) {
      this.stunned = true;
      this.setState('hurt');
      const back = h.dir.clone().setY(0).normalize();
      this.vel.set(back.x * 3, 2.2, back.z * 3);
    }
  }

  private die() {
    this.alive = false;
    this.lockable = false;
    this.setState('dying');
    targets.delete(this);
    events.emit('enemyDied', { at: this.center.clone(), enemyId: this.id, kind: this.kind });
    this.fx.add.spawn({ pos: this.center, spread: 1.4, count: 14, life: [0.4, 1], size: [0.1, 0.02], color: this.kind === 'zombie' ? 0x4a3a2a : 0xd8d0bc, color2: 0x1a140e, gravity: 5, upBias: 0.4 });
  }

  private setState(s: State) {
    this.state = s;
    this.st = 0;
  }

  /** Remove at once (the player died, or the graveyard reset). */
  dispose() {
    targets.delete(this);
    this.alive = false;
    this.scene.remove(this.group);
    physics.world.removeCollider(this.col, false);
    physics.world.removeRigidBody(this.rb);
    physics.world.removeCharacterController(this.kcc);
  }

  update(dt: number, player: Player, crowd: Undead[]) {
    this.st += dt;
    this.cooldown -= dt;
    this.flash = Math.max(0, this.flash - dt * 5);

    if (this.state === 'dying') {
      this.deathT += dt;
      // The death clip plays out, then the body sinks back into the earth.
      this.group.position.y = this.position.y - clamp((this.deathT - 2.2) * 0.9, 0, 1.2);
      this.animate(dt);
      return;
    }
    if (this.state === 'rising') {
      if (!this.anim) return; // still loading, underground
      this.rise = smoothstep(0, this.stats.rise, this.st);
      if (Math.random() < dt * 10) {
        const p = this.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.05, (Math.random() - 0.5) * 1.2));
        this.fx.add.spawn({ pos: p, spread: 2.2, count: 3, life: [0.4, 0.9], size: [0.09, 0.03], color: 0x3a2c1e, color2: 0x17110b, gravity: 9, upBias: 1.2, alpha: 0.9 });
      }
      if (this.st >= this.stats.rise) {
        this.rise = 1;
        this.lockable = true;
        targets.add(this);
        this.setState('chase');
        if (this.kind === 'zombie') sfx.groan(0.4);
      }
      this.syncVisual();
      this.animate(dt);
      return;
    }

    const to = player.pos.clone().sub(this.position);
    const dist = Math.hypot(to.x, to.z);
    const wantYaw = Math.atan2(to.x, to.z);
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const speed = this.stats.speed * this.pace;

    if (this.kind === 'zombie' && (this.groanT -= dt) <= 0) {
      this.groanT = 4 + Math.random() * 7;
      if (dist < 25) sfx.groan(0.28 * (1 - dist / 30));
    }

    if (this.state === 'idle' || this.state === 'chase') {
      // The graveyard's dead always know where you are.
      if (player.dead) {
        this.vel.x *= Math.exp(-8 * dt);
        this.vel.z *= Math.exp(-8 * dt);
      } else {
        this.state = 'chase';
        this.yaw = dampAngle(this.yaw, wantYaw, this.kind === 'zombie' ? 4 : 8, dt);
        const reach = this.kind === 'zombie' ? 1.9 : 2.2;
        // Only two of the dead swing at a time; the rest hang back and circle.
        const swinging = crowd.filter((o) => o !== this && o.state === 'attack').length;
        if (this.grounded && dist < reach && this.cooldown <= 0 && swinging < 2) {
          this.hitDone = false;
          this.swing = Math.floor(Math.random() * this.stats.swings.length);
          this.setState('attack');
        } else if (this.grounded) {
          const dir = to.setY(0).normalize();
          const waiting = swinging >= 2 && dist < reach + 1.6;
          if (waiting) {
            // Sidestep around the player at arm's length.
            const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(this.pace > 1 ? 1 : -1);
            this.vel.x = side.x * speed * 0.5 - dir.x * 0.4;
            this.vel.z = side.z * speed * 0.5 - dir.z * 0.4;
          } else {
            const s = dist > reach * 0.85 ? speed : 0;
            this.vel.x = dir.x * s;
            this.vel.z = dir.z * s;
          }
        }
      }
    } else if (this.state === 'attack') {
      const w = this.stats.swings[this.swing];
      const t = this.st * w.speed; // clip seconds
      if (t < w.hitFrom * 0.8) this.yaw = dampAngle(this.yaw, wantYaw, 9, dt);
      const lunge = t > w.hitFrom - 0.2 && t < w.hitTo ? w.lunge : 0;
      const k = Math.exp(-14 * dt);
      this.vel.x = this.vel.x * k + fwd.x * lunge * (1 - k);
      this.vel.z = this.vel.z * k + fwd.z * lunge * (1 - k);
      if (!this.hitDone && t >= w.hitFrom && t <= w.hitTo) this.checkHit(player);
      const dur = this.anim?.duration(w.clip) || 1.4;
      if (t > dur - 0.2) {
        this.cooldown = (this.kind === 'zombie' ? 1.3 : 0.9) + Math.random() * 0.9;
        this.setState('chase');
      }
    } else if (this.state === 'hurt') {
      this.vel.x *= Math.exp(-8 * dt);
      this.vel.z *= Math.exp(-8 * dt);
      if (this.grounded && this.st > 0.55) {
        this.stunned = false;
        this.setState('chase');
      }
    }

    // Keep out of each other's way.
    for (const o of crowd) {
      if (o === this || !o.alive || !o.risen) continue;
      const dx = this.position.x - o.position.x, dz = this.position.z - o.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.81 && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (0.9 - d) * 4;
        this.vel.x += (dx / d) * push * dt * 10;
        this.vel.z += (dz / d) * push * dt * 10;
      }
    }

    if (!this.grounded) this.vel.y -= GRAV * dt;
    else this.vel.y = Math.min(this.vel.y, 0) - 2 * dt;
    const desired = { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt };
    this.kcc.computeColliderMovement(this.col, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, STATIC_ONLY);
    const m = this.kcc.computedMovement();
    const cur = this.rb.translation();
    const next = { x: cur.x + m.x, y: cur.y + m.y, z: cur.z + m.z };
    this.rb.setNextKinematicTranslation(next);
    this.col.setTranslation(next);
    this.position.set(next.x, next.y - 0.78, next.z);
    this.grounded = this.kcc.computedGrounded();
    this.syncVisual();
    this.animate(dt);
  }

  private animate(dt: number) {
    const anim = this.anim;
    if (!anim) return;
    const s = this.state;
    if (s === 'dying') anim.setFull('death', Math.min(this.deathT, 2.2), 0.15);
    else if (s === 'rising') anim.setFull('cast_big', 0.35 + this.st * 0.35, 0.05);
    else if (s === 'attack') {
      const w = this.stats.swings[this.swing];
      anim.setFull(w.clip, this.st * w.speed, 0.12, 0.25);
    } else if (s === 'hurt') anim.setFull('hit_react', this.st * 1.1, 0.08, 0.2);
    else anim.setFull(null, 0);
    const c = Math.cos(-this.yaw), sn = Math.sin(-this.yaw);
    // Zombies shamble: their walk plays slow and heavy.
    const slow = this.kind === 'zombie' ? 0.75 : 1;
    const local = s === 'chase' ? { x: (this.vel.x * c + this.vel.z * sn) * slow, z: (-this.vel.x * sn + this.vel.z * c) * slow } : { x: 0, z: 0 };
    if (this.kind === 'skeleton' && s === 'chase') anim.setUpper('block_idle', true, this.st);
    else if (this.kind === 'skeleton') anim.setUpper('block_idle', false, this.st);
    anim.update(dt, { local, grounded: true });
    // A zombie hunches, head lolling, as it shuffles.
    if (this.kind === 'zombie' && s !== 'dying') {
      this.char.bone('Spine1')?.rotateX(0.22);
      this.char.bone('Neck')?.rotateZ(0.18 * Math.sin(this.st * 1.3 + this.pace * 9));
    }
    this.rig?.apply(null);
    for (const m of this.mats) m.emissive?.setRGB(0.4 * this.flash, 0.08 * this.flash, 0.05 * this.flash);
  }

  private checkHit(player: Player) {
    const a = player.pos.clone().setY(player.pos.y + 0.35);
    const b = player.pos.clone().setY(player.pos.y + 1.45);
    const reach = this.center.clone().add(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(0.95));
    if (segmentPointDistance(a, b, reach) > 1.0) return;
    this.hitDone = true;
    const dir = this.position.clone().sub(player.pos).setY(0).normalize();
    const now = performance.now();
    const poise = now - lastStagger < 1200 ? 0 : this.stats.poise;
    if (poise) lastStagger = now;
    player.receiveAttack({
      damage: this.stats.damage,
      from: this.position.clone(),
      parryable: true,
      poise,
      onParried: () => {
        this.stunned = true;
        this.setState('hurt');
        this.vel.set(-dir.x * 3.5, 3, -dir.z * 3.5);
      },
    });
  }

  private syncVisual() {
    this.group.position.copy(this.position);
    this.group.position.y -= (1 - this.rise) * DEPTH;
    this.group.rotation.y = this.yaw;
    this.center.set(this.position.x, this.position.y + 0.85, this.position.z);
  }

  /** Called when the player is dead and gone: the dead return to the ground. */
  sink() {
    if (this.state !== 'dying') {
      this.alive = false;
      targets.delete(this);
      this.setState('dying');
      this.deathT = 2.2;
    }
  }
}
