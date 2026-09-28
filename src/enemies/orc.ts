import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { Character } from '../player/character';
import { Animator } from '../player/animator';
import { RigLayer, type ProcPose } from '../player/rigLayer';
import { physics, groups, G_ENEMY, STATIC_ONLY } from '../physics/physics';
import { heightAt } from '../world/terrain';
import { clamp, damp, segmentSegmentDistance, segmentPointDistance, smoothstep, wrapAngle } from '../core/math';
import { events } from '../core/events';
import { newTargetId, targets, type HitInfo, type Target } from '../combat/targets';
import { armorPieces } from '../items/armorModels';
import { buildOdachi, buildBow, buildArrow } from '../items/weaponModels';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';

// ---------------------------------------------------------------------------
// Grukk, the Orc Warlord. The player's motion-capture rig scaled up to about
// 2.8 m, green-skinned and tusked, in a horned helm and heavy plate. He fights
// with a giant odachi and, when you keep your distance, a war bow.
//
// Moves (all driven by real mocap clips except the procedural bow draw):
//   cleave   overhead chop                  parryable
//   sweep    spinning two-hit sweep          not parryable: roll or block
//   combo    three quick cuts                parryable
//   slam     leap onto you + shockwave      not parryable: roll
//   kick     shoves you back when you turtle
//   bow      draws and looses an arrow (a three-arrow volley when enraged)
// Below half health he's enraged: faster, and volleys.
// ---------------------------------------------------------------------------

export const ORC_SCALE = 1.42;
/** Bone scales that turn the slim rig into a hulking orc (upper body inherits down the arms). */
const BULK: Record<string, number> = { Spine1: 1.24, Head: 0.8, RightUpLeg: 1.12, LeftUpLeg: 1.12 };
const UPPER = 1.24;
const HP = 900;
const WALK = 2.2;
const RUN = 4.6;

interface Move {
  clip: string;
  speed: number;
  hits: { from: number; to: number; dmg: number; parryable: boolean; poise: number }[];
  track: number; // turns to face you until this time
  travel?: number; // metres of forward lunge over the clip (root motion)
  leap?: boolean;
  bow?: boolean;
}

const MOVES: Record<string, Move> = {
  cleave: { clip: 'attack_heavy', speed: 0.85, hits: [{ from: 0.58, to: 0.9, dmg: 42, parryable: true, poise: 90 }], track: 0.5, travel: 1.2 },
  sweep: { clip: 'skill_spin', speed: 0.95, hits: [{ from: 0.5, to: 0.72, dmg: 30, parryable: false, poise: 70 }, { from: 1.2, to: 1.45, dmg: 34, parryable: false, poise: 80 }], track: 1.0, travel: 1.5 },
  combo: { clip: 'skill_combo', speed: 1.05, hits: [{ from: 0.55, to: 0.85, dmg: 22, parryable: true, poise: 45 }, { from: 1.12, to: 1.4, dmg: 22, parryable: true, poise: 45 }, { from: 2.3, to: 2.6, dmg: 30, parryable: true, poise: 70 }], track: 2.2, travel: 2.5 },
  slam: { clip: 'attack_leap', speed: 0.9, hits: [], track: 0.4, leap: true },
  kick: { clip: 'kick', speed: 1.0, hits: [{ from: 0.28, to: 0.5, dmg: 14, parryable: false, poise: 120 }], track: 0.25 },
  bow: { clip: '', speed: 1, hits: [], track: 1.3, bow: true },
};

type State = 'dormant' | 'roar' | 'chase' | 'attack' | 'recover' | 'stagger' | 'dying';

interface Arrow {
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
}

function tintBody(char: Character) {
  for (const m of char.meshes) {
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats as THREE.MeshStandardMaterial[]) {
      const joint = /joint/i.test(mat.name);
      mat.map = null;
      // Mottled green hide (the mannequin's "joint" parts become dark leather).
      mat.color.set(joint ? 0x2a1d14 : 0x4d5838);
      mat.roughness = joint ? 0.85 : 0.72;
      mat.metalness = 0;
      mat.needsUpdate = true;
    }
  }
}

export class OrcWarlord implements Target {
  id = newTargetId();
  kind = 'orc';
  name = 'Grukk, the Orc Warlord';
  alive = true;
  lockable = true;
  stunned = false;
  hp = HP;
  maxHp = HP;
  radius = 0.75;
  halfHeight = 0.85;
  position = new THREE.Vector3();
  center = new THREE.Vector3();
  onDeath?: (o: OrcWarlord) => void;

  private char = new Character();
  private model: THREE.Group | null = null;
  private anim!: Animator;
  private rig!: RigLayer;
  private odachiHand!: THREE.Object3D;
  private odachiBack!: THREE.Object3D;
  private bowHand!: THREE.Object3D;
  private bowBack!: THREE.Object3D;
  private arrowNocked!: THREE.Object3D;
  arrows: Arrow[] = [];
  private eyes: THREE.Mesh[] = [];

  private state: State = 'dormant';
  private st = 0;
  private move: Move | null = null;
  private moveName = '';
  private mt = 0; // time inside the current move (clip seconds)
  private hitDone = new Set<number>();
  private bladePrev: [THREE.Vector3, THREE.Vector3] | null = null;
  private yaw = 0;
  private yawVel = 0;
  private vel = new THREE.Vector3();
  private leapFrom = new THREE.Vector3();
  private leapTo = new THREE.Vector3();
  private landed = false;
  private arrowsLeft = 0;
  private cooldown = 0;
  private lastMove = '';
  private poiseAcc = 0;
  private deathT = 0;
  private flash = 0;
  private bodyMats: THREE.MeshStandardMaterial[] = [];
  private rb!: RAPIER.RigidBody;
  private col!: RAPIER.Collider;
  private kcc!: RAPIER.KinematicCharacterController;
  private prevPos = new THREE.Vector3();
  private prevYaw = 0;

  private constructor(private scene: THREE.Scene, private fx: FX) {}

  static async create(at: THREE.Vector3, yaw: number, scene: THREE.Scene, fx: FX) {
    const o = new OrcWarlord(scene, fx);
    await o.init(at, yaw);
    return o;
  }

  private async init(at: THREE.Vector3, yaw: number) {
    const c = this.char;
    await c.load();
    c.root.scale.setScalar(ORC_SCALE);

    // Use the supplied Orc Warrior model as the visible body. The model is
    // static (no embedded animation clips), so the existing combat rig remains
    // active underneath it for hit timing, movement, and boss behavior.
    try {
      const gltf = await new GLTFLoader().loadAsync('/assets/npc/orc_warrior.glb');
      const model = gltf.scene;
      model.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(model);
      const h = Math.max(0.01, bb.max.y - bb.min.y);
      const scale = 2.8 / h;
      model.scale.setScalar(scale);
      model.updateMatrixWorld(true);
      const bb2 = new THREE.Box3().setFromObject(model);
      const center = bb2.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -bb2.min.y, -center.z);
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
      c.root.add(model);
      this.model = model;
      c.root.visible = false;
      this.scene.add(model);
    } catch (e) {
      console.warn('orc warrior model failed to load; using the rigged fallback', e);
    }
    for (const [b, k] of Object.entries(BULK)) c.bone(b)?.scale.setScalar(k);
    c.root.updateMatrixWorld(true);
    this.scene.add(c.root);
    this.anim = new Animator(c);
    this.anim.update(0.3, { local: { x: 0, z: 0 }, grounded: true });
    c.root.updateMatrixWorld(true);
    this.rig = new RigLayer(c);
    this.rig.setup();
    tintBody(c);
    for (const m of c.meshes) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      this.bodyMats.push(...(mats as THREE.MeshStandardMaterial[]));
    }

    // Weapons: odachi in the right hand, bow and a sheath on the back.
    const k = 1 / ORC_SCALE; // sockets inherit the root's scale
    this.odachiHand = buildOdachi(k * UPPER);
    this.rig.hands.Right.socket.add(this.odachiHand);
    this.bowHand = buildBow(k * UPPER);
    this.bowHand.visible = false;
    this.rig.hands.Left.socket.add(this.bowHand);
    this.arrowNocked = buildArrow(k * UPPER);
    this.arrowNocked.visible = false;
    this.rig.hands.Right.socket.add(this.arrowNocked);
    this.rig.setCurl('Right', 1);
    this.rig.setCurl('Left', 0.8);
    const back = c.socket('Spine2', 'back');
    this.odachiBack = buildOdachi(k * UPPER);
    this.odachiBack.visible = false;
    this.odachiBack.position.set(0.05, -0.1, -0.2);
    this.odachiBack.rotation.set(0, 0, 2.5);
    this.bowBack = buildBow(k * UPPER);
    this.bowBack.position.set(-0.02, 0.05, -0.2);
    this.bowBack.rotation.set(0, Math.PI / 2, -0.5);
    back.add(this.odachiBack, this.bowBack);

    this.dressUp();
    c.root.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true)));

    this.position.copy(at);
    this.prevPos.copy(at);
    this.yaw = this.prevYaw = yaw;
    const R = physics.R;
    this.rb = physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(at.x, at.y + 1.45, at.z));
    this.col = physics.world.createCollider(R.ColliderDesc.capsule(0.75, 0.62).setCollisionGroups(groups(G_ENEMY, 0)), this.rb);
    this.kcc = physics.createCharacterController(0.03);
    targets.add(this);
    this.present(1, 0);
  }

  /** Horned helm, tusks, glowing eyes, heavy pauldrons and greaves. */
  private dressUp() {
    const c = this.char;
    // Armour follows the bulked body: sockets remove bone scale, so put it back.
    const bulkOf = (bone: string) => (/Spine2|Arm|ForeArm|Hand/.test(bone) ? UPPER : bone === 'Head' ? UPPER * 0.8 : /Leg/.test(bone) ? 1.12 : 1);
    const add = (bone: string, obj: THREE.Object3D, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0]) => {
      const s = c.socket(bone, 'dress-' + bone + Math.random());
      obj.scale.setScalar(bulkOf(bone));
      s.add(obj);
      obj.position.set(...pos);
      obj.rotation.set(...rot);
    };
    // Head bone frame: +Y up the neck, +Z forward.
    const helm = armorPieces.helm(0.2);
    const hornMat = new THREE.MeshStandardMaterial({ color: 0xd9ccb0, roughness: 0.6 });
    for (const sx of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        pts.push(new THREE.Vector3(sx * (0.1 + t * 0.2), 0.14 + t * 0.12 + Math.sin(t * Math.PI) * 0.05, -0.02 + t * 0.12 * t));
      }
      const horn = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.03, 8), hornMat);
      // Taper the horn toward its tip.
      const p = horn.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const seg = Math.floor(i / 9) / 16;
        const cx = pts[Math.min(10, Math.round(seg * 10))];
        const v = new THREE.Vector3().fromBufferAttribute(p, i);
        v.sub(cx).multiplyScalar(1 - seg * 0.85).add(cx);
        p.setXYZ(i, v.x, v.y, v.z);
      }
      helm.add(horn);
      // Tusks jutting up from the jaw.
      const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.07, 6), hornMat);
      tusk.position.set(sx * 0.035, -0.02, 0.095);
      tusk.rotation.x = -0.25;
      helm.add(tusk);
      // Glowing eyes under the brow.
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.0, 0.2) }));
      eye.position.set(sx * 0.035, 0.07 - 0.2 * 0.42 + 0.012, 0.105);
      this.eyes.push(eye);
      helm.add(eye);
    }
    add('Head', helm, [0, 0, 0]);
    add('RightArm', armorPieces.pauldron(0.28, 1), [0, 0, 0]);
    add('LeftArm', armorPieces.pauldron(0.28, -1), [0, 0, 0]);
    add('Spine2', armorPieces.breastplate(0.14), [0, 0, 0]);
    add('RightLeg', armorPieces.greave(0.44), [0, 0, 0]);
    add('LeftLeg', armorPieces.greave(0.44), [0, 0, 0]);
    add('RightForeArm', armorPieces.vambrace(0.28), [0, 0, 0]);
    add('LeftForeArm', armorPieces.vambrace(0.28), [0, 0, 0]);
    // Darken and roughen his plate: blackened iron.
    c.root.traverse((o) => {
      const m = o as THREE.Mesh;
      const mm = m.material as THREE.MeshStandardMaterial;
      if (m.isMesh && mm?.isMeshStandardMaterial && mm.metalness > 0.5 && !this.bodyMats.includes(mm)) {
        m.material = mm.clone();
        (m.material as THREE.MeshStandardMaterial).color.multiplyScalar(0.55);
      }
    });
  }

  get dead() {
    return this.state === 'dying' && this.deathT > 6;
  }
  get enraged() {
    return this.hp < HP * 0.5;
  }
  get awake() {
    return this.state !== 'dormant';
  }

  // ---- damage ------------------------------------------------------------------
  takeHit(h: HitInfo) {
    if (!this.alive) return;
    if (this.state === 'dormant') this.setState('roar');
    this.hp -= h.damage;
    this.flash = 1;
    this.fx.add.spawn({ pos: h.at, spread: 3, count: 10, life: [0.2, 0.5], size: [0.06, 0.01], color: 0x9a1a10, color2: 0x3a0804, gravity: 9 });
    if (this.hp <= 0) return this.die();
    // Big poise: only heavy punishment or a parry riposte staggers him.
    this.poiseAcc += h.poise * (this.state === 'attack' ? 0.5 : 1);
    if (this.stunned || this.poiseAcc > 220) {
      this.poiseAcc = 0;
      this.stunned = false;
      this.stagger(1.2);
    }
  }

  private stagger(dur: number) {
    this.move = null;
    this.arrowNocked.visible = false;
    this.sheathe(false);
    this.setState('stagger');
    this.st = -dur + 1.2; // stagger ends at st > 1.2
  }

  private die() {
    this.alive = false;
    this.stunned = false;
    this.move = null;
    this.setState('dying');
    targets.delete(this);
    this.fx.add.spawn({ pos: this.center, spread: 4, count: 40, life: [0.5, 1.3], size: [0.1, 0.01], color: 0xffc070, color2: 0xff3000, upBias: 0.6 });
    events.emit('enemyDied', { at: this.center.clone(), enemyId: this.id, kind: this.kind });
    this.onDeath?.(this);
  }

  private setState(s: State) {
    this.state = s;
    this.st = 0;
  }

  /** Swap odachi and bow between hands and back. */
  private sheathe(bow: boolean) {
    this.odachiHand.visible = !bow;
    this.odachiBack.visible = bow;
    this.bowHand.visible = bow;
    this.bowBack.visible = !bow;
  }

  dispose() {
    targets.delete(this);
    this.scene.remove(this.char.root);
    for (const a of this.arrows) this.scene.remove(a.mesh);
    physics.world.removeCollider(this.col, false);
    physics.world.removeRigidBody(this.rb);
    physics.world.removeCharacterController(this.kcc);
  }

  // ---- brain -------------------------------------------------------------------------
  private chooseMove(dist: number): string {
    const opts: [string, number][] = [];
    if (dist > 9) opts.push(['bow', 3], ['slam', 2]);
    else if (dist > 4.5) opts.push(['slam', 2], ['bow', 1], ['combo', 1]);
    else opts.push(['cleave', 3], ['sweep', 2], ['combo', 2], ['kick', dist < 2.6 ? 2 : 0]);
    const w = opts.map(([n, v]) => [n, n === this.lastMove ? v * 0.3 : v] as [string, number]);
    let r = Math.random() * w.reduce((a, [, v]) => a + v, 0);
    for (const [n, v] of w) if ((r -= v) <= 0) return n;
    return w[0][0];
  }

  private startMove(name: string, player: Player) {
    this.move = MOVES[name];
    this.moveName = name;
    this.lastMove = name;
    this.mt = 0;
    this.hitDone.clear();
    this.bladePrev = null;
    this.landed = false;
    if (this.move.leap) {
      this.leapFrom.copy(this.position);
      const to = player.pos.clone().sub(this.position).setY(0);
      const d = clamp(to.length() - 1.6, 0, 11);
      this.leapTo.copy(this.position).addScaledVector(to.normalize(), d);
    }
    if (this.move.bow) {
      this.sheathe(true);
      this.arrowsLeft = this.enraged ? 3 : 1;
    }
    this.setState('attack');
  }

  update(dt: number, player: Player) {
    this.prevPos.copy(this.position);
    this.prevYaw = this.yaw;
    this.st += dt;
    this.cooldown -= dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.updateArrows(dt, player);
    if (this.state === 'dying') {
      this.deathT += dt;
      return;
    }
    const toP = player.pos.clone().sub(this.position).setY(0);
    const dist = toP.length();
    const want = Math.atan2(toP.x, toP.z);
    const speedMul = this.enraged ? 1.15 : 1;
    let moveSpeed = 0;
    let turn = true;

    switch (this.state) {
      case 'dormant':
        turn = false;
        if (!player.dead && dist < 16) this.setState('roar');
        break;
      case 'roar':
        if (this.st > 2.1 / 1.1) {
          this.cooldown = 0.4;
          this.setState('chase');
        }
        break;
      case 'chase':
        if (player.dead) break;
        if (this.cooldown <= 0 && (dist < 3.6 || dist > 5.5 || this.st > 2.5)) this.startMove(this.chooseMove(dist), player);
        else moveSpeed = dist > 7 ? RUN : dist > 3 ? WALK : 0;
        break;
      case 'attack': {
        const m = this.move!;
        turn = this.mt < m.track;
        if (m.bow) this.updateBow(dt * speedMul, player, dist);
        else {
          this.mt += dt * m.speed * speedMul;
          const dur = this.anim.duration(m.clip);
          if (m.leap) this.updateLeap(player);
          else if (m.travel) moveSpeed = this.mt < dur * 0.6 && dist > 2.2 ? (m.travel / (dur * 0.6)) : 0;
          if (this.mt >= dur) this.endMove();
        }
        break;
      }
      case 'recover':
        turn = this.st > 0.3;
        if (this.st > (this.enraged ? 0.45 : 0.8)) this.setState('chase');
        break;
      case 'stagger':
        turn = false;
        if (this.st > 1.2) {
          this.stunned = false;
          this.setState('chase');
        }
        break;
    }

    // Turn with a damped spring.
    if (turn) {
      const k = 60, c = 2 * Math.sqrt(k);
      this.yawVel += (k * wrapAngle(want - this.yaw) - c * this.yawVel) * dt;
      this.yaw = wrapAngle(this.yaw + clamp(this.yawVel, -4, 4) * dt);
    } else this.yawVel *= Math.exp(-10 * dt);

    // Move (the leap moves him directly).
    if (!(this.move?.leap && this.state === 'attack')) {
      const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const target = fwd.multiplyScalar(moveSpeed * speedMul);
      this.vel.x = damp(this.vel.x, target.x, 6, dt);
      this.vel.z = damp(this.vel.z, target.z, 6, dt);
      const desired = { x: this.vel.x * dt, y: -4 * dt, z: this.vel.z * dt };
      this.kcc.computeColliderMovement(this.col, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, STATIC_ONLY);
      const mv = this.kcc.computedMovement();
      const cur = this.rb.translation();
      const next = { x: cur.x + mv.x, y: cur.y + mv.y, z: cur.z + mv.z };
      this.rb.setNextKinematicTranslation(next);
      this.col.setTranslation(next);
      this.position.set(next.x, next.y - 1.37 - 0.03, next.z);
    }
    this.center.set(this.position.x, this.position.y + 1.7, this.position.z);
  }

  private endMove() {
    this.move = null;
    this.sheathe(false);
    this.arrowNocked.visible = false;
    this.cooldown = this.enraged ? 0.3 : 0.7;
    this.setState('recover');
  }

  private updateLeap(player: Player) {
    const t = this.mt;
    // Airborne between 0.33 s and 1.12 s of the clip.
    const k = smoothstep(0.33, 1.12, t);
    const p = this.leapFrom.clone().lerp(this.leapTo, k);
    p.y = heightAt(p.x, p.z);
    const c = { x: p.x, y: p.y + 1.45, z: p.z };
    this.rb.setNextKinematicTranslation(c);
    this.col.setTranslation(c);
    this.position.copy(p);
    if (!this.landed && t >= 1.14) {
      this.landed = true;
      this.fx.dust(p.clone(), 4);
      this.fx.add.spawn({ pos: p.clone().setY(p.y + 0.2), spread: 9, count: 40, life: [0.2, 0.6], size: [0.14, 0.02], color: 0xfff1c8, color2: 0xff7a1a, gravity: 6, upBias: 0.3 });
      events.emit('bossSlam', { at: p.clone() });
      const d = player.pos.distanceTo(p);
      if (d < 4.6 && player.pos.y - p.y < 1.2) {
        player.receiveAttack({ damage: Math.round(40 * (1 - d / 9)), from: p.clone(), parryable: false, poise: 150 });
      }
    }
  }

  // ---- bow -------------------------------------------------------------------------------
  private drawT = 0;
  private updateBow(dt: number, player: Player, dist: number) {
    this.mt += dt;
    this.drawT = this.mt;
    const DRAW = this.enraged ? 0.75 : 1.0;
    this.arrowNocked.visible = this.drawT > 0.15 && this.drawT < DRAW;
    if (this.drawT >= DRAW) {
      this.loose(player, dist);
      this.arrowsLeft--;
      if (this.arrowsLeft > 0) this.mt = 0.3; // re-nock quickly for the volley
      else if (this.drawT > DRAW + 0.35) this.endMove();
      else this.mt = DRAW + 0.001 + (this.drawT - DRAW);
    }
  }

  private loose(player: Player, dist: number) {
    if (this.arrowNocked.visible === false && this.drawT < 0.2) return;
    this.arrowNocked.visible = false;
    const from = new THREE.Vector3();
    this.bowHand.getWorldPosition(from);
    // Lead the target a little.
    const lead = player.center.clone().addScaledVector(new THREE.Vector3(player.vel.x, 0, player.vel.z), dist / 32);
    const spread = this.arrowsLeft !== (this.enraged ? 3 : 1) ? (Math.random() - 0.5) * 0.25 : 0;
    const dir = lead.sub(from).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
    const mesh = buildArrow(1.25);
    mesh.position.copy(from);
    mesh.lookAt(from.clone().add(dir));
    this.scene.add(mesh);
    this.arrows.push({ mesh, pos: from.clone(), vel: dir.multiplyScalar(30), life: 2.5 });
    events.emit('swing', { heavy: false });
  }

  private updateArrows(dt: number, player: Player) {
    for (const a of this.arrows) {
      a.life -= dt;
      const prev = a.pos.clone();
      a.vel.y -= 2.5 * dt;
      a.pos.addScaledVector(a.vel, dt);
      a.mesh.position.copy(a.pos);
      a.mesh.lookAt(a.pos.clone().add(a.vel));
      const pa = player.pos.clone().setY(player.pos.y + 0.35), pb = player.pos.clone().setY(player.pos.y + 1.5);
      const close = Math.min(segmentPointDistance(pa, pb, a.pos), segmentPointDistance(pa, pb, prev.lerp(a.pos, 0.5)));
      if (close < 0.4 && !player.dead) {
        const res = player.receiveAttack({ damage: 20, from: a.pos.clone().sub(a.vel.clone().normalize()), parryable: false, poise: 30 });
        if (res === 'blocked' || res === 'guardBroken') this.fx.sparks(a.pos.clone());
        if (res !== 'dodged') a.life = 0;
      }
      if (physics.castRay(prev, a.vel.clone().normalize(), a.vel.length() * dt) !== null || a.pos.y < heightAt(a.pos.x, a.pos.z)) {
        a.vel.set(0, 0, 0);
        a.life = Math.min(a.life, 0.8); // stuck in the wall, then gone
      }
    }
    for (const a of this.arrows.filter((a) => a.life <= 0)) this.scene.remove(a.mesh);
    this.arrows = this.arrows.filter((a) => a.life > 0);
  }

  // ---- blade hits (checked against the pose drawn this frame) -----------------------------------
  private checkBlade(player: Player) {
    const m = this.move;
    if (!m || this.state !== 'attack' || !m.hits.length) {
      this.bladePrev = null;
      return;
    }
    const b = this.odachiHand;
    b.updateWorldMatrix(true, false);
    const seg: [THREE.Vector3, THREE.Vector3] = [b.localToWorld(new THREE.Vector3(0, b.userData.bladeBase, 0)), b.localToWorld(new THREE.Vector3(0, b.userData.bladeTip, 0))];
    const prev = this.bladePrev ?? seg;
    this.bladePrev = seg;
    m.hits.forEach((h, i) => {
      if (this.hitDone.has(i) || this.mt < h.from || this.mt > h.to) return;
      const pa = player.pos.clone().setY(player.pos.y + 0.35), pb = player.pos.clone().setY(player.pos.y + 1.5);
      let hit = false;
      for (let s = 0; s <= 4 && !hit; s++) {
        const u = s / 4;
        if (segmentSegmentDistance(prev[0].clone().lerp(seg[0], u), prev[1].clone().lerp(seg[1], u), pa, pb) < 0.45) hit = true;
      }
      // The widest swings also catch you if you're simply standing in front, close.
      if (!hit && this.moveName !== 'kick') {
        const to = player.pos.clone().sub(this.position).setY(0);
        const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        hit = to.length() < 2.4 && to.normalize().dot(fwd) > (this.moveName === 'sweep' ? -0.5 : 0.5);
      }
      if (!hit) return;
      this.hitDone.add(i);
      const res = player.receiveAttack({
        damage: h.dmg,
        from: this.position.clone(),
        parryable: h.parryable,
        poise: h.poise,
        onParried: () => {
          this.stunned = true;
          this.stagger(2.2);
          this.fx.sparks(seg[1].clone(), new THREE.Vector3(0, 1, 0));
        },
      });
      if (this.moveName === 'kick' && res === 'hit') player.vel.addScaledVector(player.pos.clone().sub(this.position).setY(0).normalize(), 9);
    });
  }

  // ---- presentation --------------------------------------------------------------------------------
  present(alpha: number, dt: number, player?: Player) {
    const root = this.char.root;
    root.position.lerpVectors(this.prevPos, this.position, alpha);
    root.rotation.y = this.prevYaw + wrapAngle(this.yaw - this.prevYaw) * alpha;
    const s = this.state;
    const anim = this.anim;
    const c = Math.cos(-this.yaw), sn = Math.sin(-this.yaw);
    let local = { x: this.vel.x * c + this.vel.z * sn, z: -this.vel.x * sn + this.vel.z * c };
    const sp = (this.enraged ? 1.15 : 1) * 0.6; // a big body moves in slower cycles
    local = { x: local.x * sp, z: local.z * sp };
    if (s === 'dying') anim.setFull('death', this.deathT * 0.8, 0.2);
    else if (s === 'roar') anim.setFull('cast_heal', this.st * 1.1, 0.2);
    else if (s === 'stagger') anim.setFull(this.stunned ? 'guard_break' : 'hit_react', clamp(this.st + 1.2, 0, 2) * 0.7, 0.1);
    else if (s === 'attack' && this.move && !this.move.bow) anim.setFull(this.move.clip, this.mt, 0.15, 0.25);
    else anim.setFull(null, 0);
    anim.update(dt, { local, grounded: true });

    // Procedural bow draw on top of the idle stance.
    let pose: ProcPose | null = null;
    if (s === 'attack' && this.move?.bow) {
      const DRAW = this.enraged ? 0.75 : 1.0;
      const t = this.drawT;
      const pull = smoothstep(0.15, DRAW, t % 10) * (t > DRAW ? 1 - smoothstep(DRAW, DRAW + 0.15, t) : 1);
      const raise = smoothstep(0, 0.3, t);
      pose = {
        spineYaw: -0.55 * raise,
        left: { grip: [0.02, 1.42, 0.66], dir: [0, 1, 0.05], normal: [0, 0, 1], w: raise, pole: [0.6, 1.2, -0.2] },
        right: { grip: [0.02 - 0.12 * pull, 1.5, 0.62 - 0.52 * pull], dir: [0, 0.2, 1], normal: [-1, 0, 0], w: raise, pole: [-0.6, 1.4, -0.5] },
      };
    }
    this.rig.apply(pose);
    // String follows the drawing hand.
    const str = this.bowHand.userData.string as THREE.Line;
    if (str && this.bowHand.visible) {
      const pts = str.geometry.attributes.position as THREE.BufferAttribute;
      const hand = new THREE.Vector3();
      this.rig.hands.Right.socket.getWorldPosition(hand);
      const local2 = this.bowHand.worldToLocal(hand);
      const nock = this.arrowNocked.visible ? local2 : (this.bowHand.userData.nock as THREE.Vector3);
      pts.setXYZ(1, nock.x, nock.y, nock.z);
      pts.needsUpdate = true;
    }
    if (this.arrowNocked.visible) {
      // Arrow lies along the bow toward the target, nocked at the right hand.
      this.arrowNocked.position.set(0, 0, 0);
      this.arrowNocked.lookAt(this.bowHand.getWorldPosition(new THREE.Vector3()));
    }
    // Hit flash and eye glow (brighter when enraged).
    for (const m of this.bodyMats) m.emissive.setRGB(0.5 * this.flash, 0.1 * this.flash, 0.05 * this.flash);
    for (const e of this.eyes) e.scale.setScalar(this.enraged ? 1.6 : 1);
    if (player) this.checkBlade(player);
    // Windup telegraph: a red glint runs down the blade before heavy swings.
    if (this.move && s === 'attack' && this.move.hits[0] && this.mt > this.move.hits[0].from - 0.35 && this.mt < this.move.hits[0].from && Math.random() < 0.5) {
      const b = this.odachiHand;
      const p = b.localToWorld(new THREE.Vector3(0, b.userData.bladeBase + Math.random() * (b.userData.bladeTip - b.userData.bladeBase), 0));
      this.fx.add.spawn({ pos: p, spread: 0.2, count: 1, life: [0.2, 0.35], size: [0.12, 0.02], color: 0xffd0a0, color2: 0xff3010 });
    }
  }
}
