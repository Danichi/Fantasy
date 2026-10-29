import { combat, type AttackKind } from '../combat/core';
import * as THREE from 'three';
import { Creature, levelScale, type CreatureBase } from '../creatures/creature';
import { BoarVisual } from '../creatures/boar/visual';
import { BOAR_RIG } from '../creatures/boar/model';
import { creatureView } from '../creatures/view';
import { GoblinVisual, type GoblinPose } from '../creatures/goblin/visual';
import { dampAngle } from '../core/math';
import { events } from '../core/events';
import { ignoresPlayer } from '../origins/stealth';
import { sfx } from '../audio/sfx';
import { heightAt } from '../world/terrainHeight';
import { Beast } from '../enemies/beast';
import type { HitInfo } from '../combat/targets';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';
import type { BossBody, BossDef } from './fieldBosses';
import { warren } from './lairs';

// Snaggletooth: the goblin chief of the hill warren, riding a war-boar the
// size of a pony. The boar wears barding the goblins hammered out of stolen
// pots and cart-iron: a face plate, a chest plate, studded leather skirts, and
// iron caps on its tusks. Snaggletooth sits on a saddle of hides with a
// trophy pole behind him, waving a cleaver.
//
// The fight, mounted:
//   - The boar paws (the tell) and charges. Its tusks can be parried: it
//     tumbles, dazed and open. Sidestep and it overruns; run it into a tree
//     and it stuns itself.
//   - The barding takes half of what hits it from the front. Its flanks and
//     rump are only leather.
//   - Close in it hooks with its tusks, and Snaggletooth cuts down at you from
//     the saddle as it passes or circles.
// Kill the boar and Snaggletooth is thrown. He gets up, blows his horn, and
// goblins come running out of the warren. Then he fights on foot: a quick
// three-cut combo (parry a cut and he reels), a leaping chop, hops back out
// of reach. At half his strength he cracks a little vial of something violet
// on his tooth and drinks it (the Dark, sold to a goblin), blows the horn
// again, and fights faster.

const BOAR_SIZE = 1.65;
const BOAR_BASE: CreatureBase = { name: 'War-Boar', hp: 360, damage: 20, radius: 0.36 * BOAR_SIZE, halfHeight: 0.3 };
const CHIEF_BASE: CreatureBase = { name: 'Snaggletooth', hp: 300, damage: 17, radius: 0.34, halfHeight: 0.32 };
/** the chief's size (the sculpt is about 1.1 m) */
const CHIEF_SCALE = 1.35;

// ---------------------------------------------------------------------------
// Materials for the barding.
// ---------------------------------------------------------------------------

const iron = new THREE.MeshStandardMaterial({ color: 0x5a5650, roughness: 0.6, metalness: 0.55 });
const rustIron = new THREE.MeshStandardMaterial({ color: 0x6a4a36, roughness: 0.8, metalness: 0.35 });
const leather = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.85 });
const darkLeather = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.9 });
const hide = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.95 });
const bone = new THREE.MeshStandardMaterial({ color: 0xe0d4b0, roughness: 0.6 });
const rag = new THREE.MeshStandardMaterial({ color: 0x8a2a1e, roughness: 0.95, side: THREE.DoubleSide });
const wood = new THREE.MeshStandardMaterial({ color: 0x5a4430, roughness: 0.9 });

// ---------------------------------------------------------------------------
// The war-boar's barding.
// ---------------------------------------------------------------------------

const rest = (n: string) => new THREE.Vector3(...BOAR_RIG.bones[BOAR_RIG.bone(n)].at);
function onBone(look: BoarVisual, n: string, obj: THREE.Object3D, at: THREE.Vector3) {
  obj.position.copy(at).sub(rest(n));
  look.bones[n].add(obj);
  obj.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true)));
}

/** A curved plate (a slice of a cylinder) facing +z. */
function plate(w: number, h: number, curve: number, mat: THREE.Material) {
  const g = new THREE.CylinderGeometry(curve, curve, h, 10, 1, true, -w / curve / 2, w / curve);
  g.translate(0, 0, -curve);
  return new THREE.Mesh(g, mat);
}
function studs(parent: THREE.Object3D, pts: [number, number, number][], r = 0.012) {
  const geo = new THREE.SphereGeometry(r, 6, 4);
  for (const p of pts) {
    const s = new THREE.Mesh(geo, iron);
    s.position.set(...p);
    parent.add(s);
  }
}

function barding(look: BoarVisual) {
  // Chamfron: an iron plate down its face, with a spike.
  const face = plate(0.2, 0.26, 0.2, rustIron);
  face.rotation.x = -1.15;
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.14, 6), iron);
  spike.position.set(0, 0.05, 0.06);
  spike.rotation.x = 0.5;
  face.add(spike);
  studs(face, [[-0.07, -0.08, 0.005], [0.07, -0.08, 0.005], [-0.08, 0.06, 0.005], [0.08, 0.06, 0.005]]);
  onBone(look, 'head', face, new THREE.Vector3(0, 0.87, 0.64));
  // Tusk caps: iron points on the tusk tips.
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.07, 6), iron);
    cap.position.set(s * 0.118, 0.606, 0.85).sub(rest('jaw'));
    cap.rotation.set(-0.35, 0, -s * 0.5);
    look.bones.jaw.add(cap);
  }
  // Peytral: a chest plate of hammered pots.
  const chest = plate(0.42, 0.32, 0.3, rustIron);
  chest.rotation.x = 0.15;
  studs(chest, [[-0.15, 0.12, 0.01], [0, 0.13, 0.02], [0.15, 0.12, 0.01], [-0.17, -0.1, 0.01], [0.17, -0.1, 0.01]]);
  onBone(look, 'chest', chest, new THREE.Vector3(0, 0.64, 0.5));
  // Studded leather skirts wrapped over the flanks, following the barrel of its body.
  const RX = 0.2, RY = 0.31, CY = 0.66;
  for (const s of [-1, 1]) {
    const t0 = s > 0 ? 1.2 : Math.PI * 2 - 2.65, t1 = s > 0 ? 2.65 : Math.PI * 2 - 1.2;
    const g = new THREE.CylinderGeometry(1, 1, 0.66, 14, 1, true, t0, t1 - t0);
    g.rotateX(Math.PI / 2);
    g.scale(RX, RY, 1);
    const skirt = new THREE.Mesh(g, leather);
    const st: [number, number, number][] = [];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
      const th = t0 + ((j + 0.5) / 3) * (t1 - t0);
      st.push([Math.sin(th) * RX * 1.03, -Math.cos(th) * RY * 1.03, -0.27 + i * 0.11]);
    }
    studs(skirt, st, 0.011);
    // A row of iron scales along the lower edge.
    for (let i = 0; i < 7; i++) {
      const sc = new THREE.Mesh(new THREE.CircleGeometry(0.045, 6), rustIron);
      sc.material.side = THREE.DoubleSide;
      const th = s > 0 ? 1.28 : Math.PI * 2 - 1.28;
      sc.position.set(Math.sin(th) * RX * 1.04, -Math.cos(th) * RY * 1.04 + 0.01, -0.3 + i * 0.1);
      sc.rotation.y = s * Math.PI / 2;
      skirt.add(sc);
    }
    onBone(look, 'spine', skirt, new THREE.Vector3(0, CY, -0.06));
  }
  // The saddle: a pile of hides, a high cantle, a strap round the belly.
  const saddle = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.32, 12, 1, false, -1.2, 2.4).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), hide);
  seat.scale.set(1, 0.5, 1);
  const cantle = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.04), darkLeather);
  cantle.position.set(0, 0.06, -0.15);
  const pommel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.04), darkLeather);
  pommel.position.set(0, 0.04, 0.15);
  const girth = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 4, 20), darkLeather);
  girth.scale.set(0.95, 1.45, 1);
  girth.rotation.y = Math.PI / 2;
  girth.position.y = -0.24;
  saddle.add(seat, cantle, pommel, girth);
  onBone(look, 'spine', saddle, new THREE.Vector3(0, 0.89, -0.06));
  // The trophy pole behind the saddle: a rag banner and a skull.
  const pole = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 1.0, 5).translate(0, 0.5, 0), wood);
  const flagGeo = new THREE.PlaneGeometry(0.28, 0.4, 3, 4).translate(0.14, 0.75, 0);
  const fp = flagGeo.getAttribute('position');
  for (let i = 0; i < fp.count; i++) {
    const x = fp.getX(i), y = fp.getY(i);
    fp.setXYZ(i, x, y - (x > 0.2 && y < 0.6 ? 0.08 : 0), Math.sin(x * 20) * 0.02);
  }
  flagGeo.computeVertexNormals();
  const flag = new THREE.Mesh(flagGeo, rag);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), bone);
  skull.scale.set(1, 1.1, 1.2);
  skull.position.set(0, 0.98, 0);
  pole.add(shaft, flag, skull);
  pole.rotation.x = -0.25;
  onBone(look, 'pelvis', pole, new THREE.Vector3(0.1, 0.86, -0.3));
}

// ---------------------------------------------------------------------------
// The war-boar.
// ---------------------------------------------------------------------------

type BoarMode = 'idle' | 'alert' | 'paw' | 'charge' | 'skid' | 'circle' | 'gore' | 'daze' | 'home';

export class WarBoar extends Creature {
  readonly look: BoarVisual;
  mode: BoarMode = 'idle';
  private modeT = 0;
  private modeLen = 1;
  foeOn = false;
  private chargeHit = false;
  private committed = false;
  private passedT = -1;
  private goreHit = false;
  private goreCd = 0;
  private cutCd = 1;
  private dustT = 0;
  private flash = 0;
  /** the rider cuts at whoever is in reach (set by the boss) */
  riderCut: ((player: Player, dist: number) => void) | null = null;
  readonly den: THREE.Vector3;
  stats = { charges: 0, chargeHits: 0, tumbles: 0, gores: 0, frontHits: 0, flankHits: 0 };

  constructor(at: THREE.Vector3, level: number, scene: THREE.Scene, fx: FX, den: THREE.Vector3) {
    super('warBoar', BOAR_BASE, level, at, scene, fx);
    this.den = den.clone();
    this.corpseTime = 40;
    this.look = new BoarVisual({ scale: BOAR_SIZE });
    barding(this.look);
    this.look.root.position.copy(at);
    scene.add(this.look.root);
    this.look.gait.reset(this.look.root, this.groundAt);
  }

  get engaged() {
    return this.alive && this.foeOn;
  }
  leash() {
    this.foeOn = false;
    this.setMode('home', 99);
  }
  private setMode(m: BoarMode, len = 1) {
    const tell = ({ paw: ['heavy', 0.35, 0], gore: ['normal', 0.1, 0] } as Partial<Record<BoarMode, [AttackKind, number, number]>>)[m];
    if (tell) combat.windup(this, len + tell[1], tell[0], tell[2] ? len + tell[2] : 0);
    this.mode = m;
    this.modeT = 0;
    this.modeLen = len;
  }
  get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
  private volume() {
    const c = creatureView.camera;
    return c ? Math.max(0.05, 0.6 * (1 - c.distanceTo(this.position) / 50)) : 0.3;
  }
  snout() {
    return this.position.clone().addScaledVector(this.forward, 1.0 * BOAR_SIZE).setY(this.position.y + 0.5 * BOAR_SIZE);
  }

  takeHit(h: HitInfo) {
    if (!this.alive) return;
    // The barding turns half of what comes at its face and chest.
    const front = this.forward.dot(h.dir.clone().negate().setY(0).normalize()) > 0.4;
    let dmg = h.damage * (this.mode === 'daze' ? 1.5 : front ? 0.5 : 1);
    if (front) {
      this.stats.frontHits++;
      this.fx.sparks(h.at.clone(), h.dir.clone().negate());
    } else this.stats.flankHits++;
    this.flash = 1;
    this.hp -= dmg;
    dmg = 0;
    if (!this.foeOn) this.wake();
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
  }

  private wake() {
    this.foeOn = true;
    if (this.mode === 'idle' || this.mode === 'home') {
      this.setMode('alert', 0.9);
      sfx.squeal(this.volume());
    }
  }

  tumble(sec: number) {
    this.stats.tumbles++;
    this.vel.copy(this.forward).multiplyScalar(-3);
    this.setMode('daze', sec);
    sfx.squeal(this.volume() * 0.7);
  }

  protected think(dt: number, player: Player) {
    this.modeT += dt;
    this.goreCd -= dt;
    this.cutCd -= dt;
    this.wish.set(0, 0, 0);
    this.accel = 8;
    this.stunned = this.mode === 'daze';
    const canSee = !player.dead && !ignoresPlayer(this);
    const to = player.pos.clone().sub(this.position).setY(0);
    const dist = to.length();
    const face = Math.atan2(to.x, to.z);
    if (!this.foeOn && canSee && dist < 26 && this.mode !== 'home') this.wake();
    if (this.foeOn && (!canSee || dist > 45)) {
      this.foeOn = false;
      this.setMode('home', 99);
    }
    // Snaggletooth cuts at anyone in reach of the saddle.
    if (this.foeOn && this.riderCut && this.cutCd <= 0 && dist < 2.8 && this.mode !== 'daze') {
      this.cutCd = 1.6 + Math.random() * 0.8;
      this.riderCut(player, dist);
    }
    switch (this.mode) {
      case 'idle': {
        // Snuffling about its ground, never far from the warren.
        const d = this.den.clone().sub(this.position).setY(0);
        if (d.length() > 8) {
          this.yaw = dampAngle(this.yaw, Math.atan2(d.x, d.z), 2, dt);
          this.wish.copy(this.forward).multiplyScalar(1.4);
        }
        break;
      }
      case 'alert':
        this.yaw = dampAngle(this.yaw, face, 5, dt);
        if (this.modeT > this.modeLen) this.setMode(dist < 3 ? 'gore' : 'paw', dist < 3 ? 0.95 : 0.75);
        break;
      case 'paw':
        // Head down, scraping a forefoot: the tell.
        this.yaw = dampAngle(this.yaw, face, 7, dt);
        this.dustT -= dt;
        if (this.dustT <= 0) {
          this.dustT = 0.15;
          this.fx.dust(this.position.clone().addScaledVector(this.forward, 0.6), 0.6);
        }
        if (this.modeT > this.modeLen) {
          if (dist < 3) this.setMode('gore', 0.95);
          else {
            this.setMode('charge', 2.6);
            this.chargeHit = this.committed = false;
            this.passedT = -1;
            this.stats.charges++;
            sfx.squeal(this.volume());
          }
        }
        break;
      case 'charge': {
        if (dist < 4) this.committed = true;
        const turn = this.modeT < 0.5 ? 2.4 : 0.5;
        if (this.passedT < 0 && !this.committed) this.yaw = dampAngle(this.yaw, face, turn, dt);
        this.wish.copy(this.forward).multiplyScalar(9.5 * Math.min(1, 0.45 + this.modeT * 2));
        this.accel = 7;
        this.dustT -= dt;
        if (this.dustT <= 0) {
          this.dustT = 0.07;
          this.fx.dust(this.position.clone().addScaledVector(this.forward, -0.5), 0.5);
        }
        const sn = this.snout();
        if (!this.chargeHit && canSee && player.pos.distanceTo(new THREE.Vector3(sn.x, player.pos.y, sn.z)) < 1.0 + this.radius && Math.abs(player.pos.y - this.position.y) < 2) {
          this.chargeHit = true;
          this.stats.chargeHits++;
          player.receiveAttack({ damage: this.damage * 1.7, from: this.position.clone(), parryable: true, poise: 110, knock: 8, onParried: () => this.tumble(2.8) });
        }
        if (this.mode !== 'charge') break;
        if (this.passedT < 0 && (this.chargeHit || (this.committed && this.forward.dot(to.clone().normalize()) < 0.2)) && dist > 1.4) this.passedT = this.modeT;
        if (this.bumped && this.modeT > 0.3) {
          this.fx.dust(this.snout(), 1.5);
          sfx.grunt(this.volume() + 0.2);
          this.tumble(2.2);
        } else if ((this.passedT >= 0 && this.modeT - this.passedT > 0.4) || this.modeT > this.modeLen) this.setMode('skid', 0.7);
        break;
      }
      case 'skid':
        this.accel = 3;
        if (this.modeT > this.modeLen) this.setMode('circle', 0.8 + Math.random() * 0.8);
        break;
      case 'circle': {
        // Wheel round to face you, edging in so the rider can reach.
        this.yaw = dampAngle(this.yaw, face, 4.5, dt);
        if (dist > 3) this.wish.copy(to).normalize().multiplyScalar(3.4);
        if (dist < 2.8 && this.goreCd <= 0) this.setMode('gore', 0.95);
        else if (this.modeT > this.modeLen) {
          if (dist > 5.5) this.setMode('paw', 0.6 + Math.random() * 0.3);
          else this.setMode('circle', 0.6);
        }
        break;
      }
      case 'gore': {
        const t = this.modeT;
        if (t < 0.28) this.yaw = dampAngle(this.yaw, face, 8, dt);
        if (t > 0.24 && t < 0.42) this.wish.copy(this.forward).multiplyScalar(3.5);
        if (t > 0.34 && !this.goreHit) {
          this.goreHit = true;
          this.stats.gores++;
          if (dist < 2.6 * (BOAR_SIZE / 1.2) && to.clone().normalize().dot(this.forward) > 0.25 && canSee)
            player.receiveAttack({ damage: this.damage, from: this.position.clone(), parryable: true, poise: 55, knock: 3.5, onParried: () => this.tumble(2.2) });
        }
        if (t > this.modeLen) {
          this.goreHit = false;
          this.goreCd = 1.5 + Math.random() * 0.8;
          this.setMode('circle', 0.6 + Math.random() * 0.6);
        }
        break;
      }
      case 'daze':
        if (this.modeT > this.modeLen) this.setMode('circle', 0.6);
        break;
      case 'home': {
        const d = this.den.clone().sub(this.position).setY(0);
        if (d.length() > 3) {
          this.yaw = dampAngle(this.yaw, Math.atan2(d.x, d.z), 3, dt);
          this.wish.copy(this.forward).multiplyScalar(3);
        } else {
          this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.12 * dt);
          if (this.hp >= this.maxHp) this.setMode('idle', 1);
        }
        break;
      }
    }
  }

  protected onDeath() {
    sfx.squeal(this.volume() + 0.15);
  }

  protected animate(dt: number, player: Player) {
    const L = this.look;
    this.flash = Math.max(0, this.flash - dt * 5);
    L.root.position.copy(this.position);
    L.root.rotation.y = this.yaw;
    const m = this.mode;
    L.setPose(!this.alive ? 'dead' : m === 'alert' ? 'alert' : m === 'paw' || m === 'charge' || m === 'skid' ? 'charge' : m === 'gore' ? 'gore' : m === 'daze' ? 'hurt' : 'idle');
    L.lookAt = this.alive && (m === 'alert' || m === 'circle' || m === 'paw') ? player.center : null;
    const cam = creatureView.camera;
    L.lod(cam ? cam.distanceTo(this.position) : 10, creatureView.fur);
    L.update(dt, this.vel, this.groundAt);
    if (!this.alive && this.deadT > this.corpseTime - 2) L.root.position.y -= (this.deadT - (this.corpseTime - 2)) * 0.4;
  }

  protected disposeLook() {
    this.look.dispose();
  }
}

// ---------------------------------------------------------------------------
// Snaggletooth on foot.
// ---------------------------------------------------------------------------

type ChiefMode = 'thrown' | 'groggy' | 'horn' | 'stalk' | 'combo' | 'reel' | 'crouch' | 'leap' | 'hop' | 'quaff' | 'home';

export class GoblinChief extends Creature {
  mode: ChiefMode = 'thrown';
  private modeT = 0;
  private modeLen = 1;
  private cuts = 0;
  private struck = false;
  private atkCd = 0.5;
  private leapCd = 4;
  foeOn = true;
  frenzy = false;
  private hornDone = false;
  private flash = 0;
  /** a horn call: bring the band */
  onHorn: ((n: number) => void) | null = null;
  readonly den: THREE.Vector3;
  stats = { cuts: 0, leaps: 0, parried: 0, hops: 0, horns: 0 };

  constructor(at: THREE.Vector3, level: number, scene: THREE.Scene, fx: FX, readonly look: GoblinVisual, fling: THREE.Vector3, den: THREE.Vector3) {
    super('snaggletooth', CHIEF_BASE, level, at, scene, fx);
    this.corpseTime = 40;
    this.den = den.clone();
    this.vel.copy(fling);
    this.grounded = false;
    scene.add(look.root);
    look.root.scale.setScalar(CHIEF_SCALE);
    look.root.position.copy(at);
    look.root.rotation.set(0, 0, 0);
  }

  get engaged() {
    return this.alive && this.foeOn;
  }
  leash() {
    this.foeOn = false;
    this.setMode('home', 99);
  }
  private setMode(m: ChiefMode, len = 1) {
    const tell = ({ crouch: ['unblockable', 0.25, 0.9], combo: ['normal', 0.1, 0] } as Partial<Record<ChiefMode, [AttackKind, number, number]>>)[m];
    if (tell) combat.windup(this, len + tell[1], tell[0], tell[2] ? len + tell[2] : 0);
    this.mode = m;
    this.modeT = 0;
    this.modeLen = len;
    this.struck = false;
  }
  private get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
  private volume() {
    const c = creatureView.camera;
    return c ? Math.max(0.05, 0.6 * (1 - c.distanceTo(this.position) / 50)) : 0.3;
  }

  takeHit(h: HitInfo) {
    if (!this.alive) return;
    if (this.mode === 'thrown') return;
    this.hp -= h.damage * (this.mode === 'reel' ? 1.5 : 1);
    this.flash = 1;
    this.vel.addScaledVector(h.dir, Math.min(3, 1 + h.poise * 0.02));
    if (!this.foeOn) this.foeOn = true;
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
      return;
    }
    // A heavy blow staggers him out of anything but the leap.
    if ((h.crit || h.poise > 60) && this.mode !== 'leap' && this.mode !== 'reel' && this.mode !== 'horn' && this.mode !== 'quaff') this.setMode('hop', 0.45);
  }

  private horn(n: number) {
    this.stats.horns++;
    sfx.horn(this.volume() + 0.25);
    this.onHorn?.(n);
  }

  protected think(dt: number, player: Player) {
    this.modeT += dt;
    this.atkCd -= dt;
    this.leapCd -= dt;
    this.wish.set(0, 0, 0);
    this.accel = 10;
    this.stunned = this.mode === 'reel';
    const quick = this.frenzy ? 1.35 : 1;
    const canSee = !player.dead && !ignoresPlayer(this);
    const to = player.pos.clone().sub(this.position).setY(0);
    const dist = to.length();
    const face = Math.atan2(to.x, to.z);
    if (this.foeOn && (!canSee || dist > 45) && this.mode !== 'thrown' && this.mode !== 'groggy') {
      this.foeOn = false;
      this.setMode('home', 99);
    }
    if (!this.foeOn && this.mode === 'home' && canSee && dist < 18) {
      this.foeOn = true;
      this.setMode('stalk', 0.4);
    }
    // At half his strength: the vial, and the horn again.
    if (!this.frenzy && this.hp < this.maxHp * 0.5 && (this.mode === 'stalk' || this.mode === 'hop')) this.setMode('quaff', 1.8);

    switch (this.mode) {
      case 'thrown':
        this.accel = 0.5;
        if (this.modeT > 0.3 && this.grounded) {
          this.fx.dust(this.position.clone(), 1.2);
          this.setMode('groggy', 1.3);
        }
        if (this.modeT > 2.5) this.setMode('groggy', 1.3);
        break;
      case 'groggy':
        this.yaw = dampAngle(this.yaw, face, 2, dt);
        if (this.modeT > this.modeLen) this.setMode('horn', 2.2);
        break;
      case 'horn':
        this.yaw = dampAngle(this.yaw, face, 3, dt);
        if (!this.hornDone && this.modeT > 0.7) {
          this.hornDone = true;
          this.horn(4);
        }
        if (this.modeT > this.modeLen) this.setMode('stalk', 0.5);
        break;
      case 'quaff':
        // He cracks the vial on his tooth and drinks: the Dark, bought off someone.
        if (!this.struck && this.modeT > 0.9) {
          this.struck = true;
          this.frenzy = true;
          events.emit('bossSpeaks', { id: 'snaggletooth', line: 'Snaggletooth cracks a little vial of something violet against his tooth and drinks it. His eyes go purple, and he laughs, high and wrong.' });
          this.fx.add.spawn({ pos: this.center.clone(), spread: 0.6, count: 24, life: [0.4, 1], size: [0.1, 0.02], color: 0x9a5aff, color2: 0x2a0a4a, upBias: 0.8, drag: 1 });
        }
        if (this.modeT > this.modeLen) {
          this.horn(3);
          this.setMode('stalk', 0.3);
        }
        break;
      case 'stalk': {
        // Weaving in, quick and low.
        this.yaw = dampAngle(this.yaw, face, 8, dt);
        const side = new THREE.Vector3(-to.z, 0, to.x).normalize().multiplyScalar(Math.sin(this.modeT * 2.5 + this.id) * 1.8);
        if (dist > 1.8) this.wish.copy(to).normalize().multiplyScalar(4.2 * quick).add(side);
        else this.wish.copy(side);
        if (this.modeT < this.modeLen || this.atkCd > 0) break;
        if (this.leapCd <= 0 && dist > 3.5 && dist < 9) {
          this.setMode('crouch', 0.55 / quick);
        } else if (dist < 2.4) {
          this.cuts = this.frenzy ? 4 : 3;
          this.setMode('combo', 0.48 / quick);
        }
        break;
      }
      case 'combo':
        // Quick cuts; each one can be parried.
        this.yaw = dampAngle(this.yaw, face, 10, dt);
        if (this.modeT < 0.2) this.wish.copy(this.forward).multiplyScalar(3);
        if (!this.struck && this.modeT > 0.22 / quick) {
          this.struck = true;
          this.stats.cuts++;
          if (dist < 2.3 && canSee && to.clone().normalize().dot(this.forward) > 0.3)
            player.receiveAttack({
              damage: this.damage, from: this.position.clone(), parryable: true, poise: 35, knock: 1.5,
              onParried: () => {
                this.stats.parried++;
                this.setMode('reel', 1.8);
              },
            });
        }
        if (this.mode === 'combo' && this.modeT > this.modeLen) {
          this.cuts--;
          if (this.cuts > 0) {
            this.setMode('combo', 0.48 / quick);
            this.look.restart();
          }
          else {
            this.atkCd = 0.9 / quick;
            this.setMode('hop', 0.45);
          }
        }
        break;
      case 'hop':
        // Skips back out of reach.
        if (this.modeT < 0.25) this.wish.copy(this.forward).multiplyScalar(-6);
        if (this.modeT === dt) this.stats.hops++;
        if (this.modeT > this.modeLen) this.setMode('stalk', 0.6);
        break;
      case 'reel':
        if (this.modeT > this.modeLen) this.setMode('stalk', 0.3);
        break;
      case 'crouch':
        // Crouched low, cleaver back: the leap is coming.
        this.yaw = dampAngle(this.yaw, face, 8, dt);
        if (this.modeT > this.modeLen) {
          this.setMode('leap', 0.7);
          this.stats.leaps++;
          this.vel.copy(to).normalize().multiplyScalar(Math.min(12, dist * 1.45));
          this.vel.y = 6.5;
        }
        break;
      case 'leap':
        this.accel = 0.3;
        if (!this.struck && this.modeT > 0.2 && this.grounded) {
          this.struck = true;
          this.fx.dust(this.position.clone().addScaledVector(this.forward, 0.6), 1);
          sfx.grunt(this.volume() + 0.1);
          const at = this.position.clone().addScaledVector(this.forward, 0.6);
          if (player.pos.distanceTo(at) < 2.4 && canSee) player.receiveAttack({ damage: this.damage * 1.6, from: at, parryable: false, poise: 90, knock: 5 });
        }
        if (this.modeT > this.modeLen) {
          this.leapCd = (this.frenzy ? 4 : 6) + Math.random() * 3;
          this.atkCd = 0.6;
          this.setMode('stalk', 0.4);
        }
        break;
      case 'home': {
        const d = this.den.clone().sub(this.position).setY(0);
        if (d.length() > 2) {
          this.yaw = dampAngle(this.yaw, Math.atan2(d.x, d.z), 4, dt);
          this.wish.copy(this.forward).multiplyScalar(3.5);
        } else this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.1 * dt);
        break;
      }
    }
  }

  protected onDeath() {
    sfx.yelp(this.volume() + 0.1);
  }

  protected animate(dt: number) {
    const L = this.look;
    this.flash = Math.max(0, this.flash - dt * 5);
    L.root.position.copy(this.position);
    L.root.rotation.set(0, this.yaw, 0);
    const m = this.mode;
    const pose: GoblinPose = !this.alive ? 'dead'
      : m === 'thrown' ? 'thrown'
      : m === 'groggy' ? 'groggy'
      : m === 'combo' ? 'cut'
      : m === 'crouch' ? 'crouch'
      : m === 'leap' ? 'leap'
      : m === 'horn' ? 'horn'
      : m === 'quaff' ? 'quaff'
      : m === 'reel' ? 'reel'
      : 'idle';
    L.setPose(pose);
    // Head over heels while he flies.
    if (m === 'thrown') L.root.rotation.x = this.modeT * 9;
    const cam = creatureView.camera;
    L.lod(cam ? cam.distanceTo(this.position) : 10);
    L.dark(this.frenzy ? 1 : 0);
    L.update(dt, Math.hypot(this.vel.x, this.vel.z) / CHIEF_SCALE);
    // The Dark in him: violet motes coming off him.
    if (this.frenzy && this.alive && Math.random() < dt * 7) {
      this.fx.add.spawn({ pos: this.center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, Math.random() * 0.5, (Math.random() - 0.5) * 0.5)), spread: 0.15, count: 1, life: [0.5, 1], size: [0.1, 0.02], color: 0x6a3aa8, color2: 0x10061a, upBias: 0.7, drag: 1 });
    }
    if (!this.alive && this.deadT > this.corpseTime - 2) L.root.position.y -= (this.deadT - (this.corpseTime - 2)) * 0.3;
  }

  protected disposeLook() {
    this.look.dispose();
  }
}

// ---------------------------------------------------------------------------
// The boss: the boar and its rider, then the chief alone with his band.
// ---------------------------------------------------------------------------

export class Snaggletooth implements BossBody {
  readonly label = 'Snaggletooth';
  readonly boar: WarBoar;
  chief: GoblinChief | null = null;
  readonly look = new GoblinVisual();
  band: { b: Beast; t: number }[] = [];
  private chiefMax: number;
  private peak = 1;
  private rideCutT = 0;
  stats = { riderCuts: 0, called: 0 };

  constructor(at: THREE.Vector3, private level: number, private scene: THREE.Scene, private fx: FX, private den: THREE.Vector3) {
    this.boar = new WarBoar(at, level, scene, fx, den);
    this.chiefMax = Math.round(CHIEF_BASE.hp * levelScale(level).hp);
    // In the saddle: his seat on the hides, at his own size.
    const k = CHIEF_SCALE / BOAR_SIZE;
    this.boar.look.bones.spine.add(this.look.root);
    this.look.root.position.copy(new THREE.Vector3(0, 0.95 - 0.45 * k, -0.04).sub(rest('spine')));
    this.look.root.scale.setScalar(k);
    this.look.setPose('ride');
    this.boar.riderCut = (player, dist) => {
      // A cut down from the saddle.
      this.look.setPose('rideCut');
      this.rideCutT = 0.6;
      this.stats.riderCuts++;
      if (dist < 2.8 && !player.dead) player.receiveAttack({ damage: CHIEF_BASE.damage * levelScale(level).dmg, from: this.boar.position.clone(), parryable: true, poise: 30, knock: 1.5 });
    };
  }

  get alive() {
    return this.boar.alive || !!this.chief?.alive;
  }
  get dead() {
    return this.boar.dead && (!this.chief || this.chief.dead);
  }
  get maxHp() {
    return this.boar.maxHp + this.chiefMax;
  }
  get hp() {
    return this.boar.alive ? this.boar.hp + this.chiefMax : this.chief?.hp ?? 0;
  }
  set hp(v: number) {
    if (this.boar.alive) this.boar.hp = Math.max(1, v - this.chiefMax);
    else if (this.chief) this.chief.hp = v;
  }
  get active(): Creature {
    return this.chief ?? this.boar;
  }
  get position() {
    return this.active.position;
  }
  get center() {
    return this.active.center;
  }
  get engaged() {
    return this.chief ? this.chief.engaged : this.boar.engaged;
  }
  get phase() {
    const p = !this.chief ? 1 : this.chief.frenzy ? 3 : 2;
    this.peak = Math.max(this.peak, p);
    return this.peak;
  }

  leash() {
    if (this.chief) this.chief.leash();
    else this.boar.leash();
  }

  private callBand(n: number, player: Player) {
    // Goblins come running out of the warren.
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(player.pos.x - this.den.x, player.pos.z - this.den.z) + (Math.random() - 0.5) * 1.6;
      const r = 10 + Math.random() * 4;
      const x = player.pos.x - Math.sin(a) * r * 0.2 + (this.den.x - player.pos.x) * 0.5 + Math.cos(a) * 3 * (i - n / 2);
      const z = player.pos.z - Math.cos(a) * r * 0.2 + (this.den.z - player.pos.z) * 0.5 + Math.sin(a) * 3 * (i - n / 2);
      const p = new THREE.Vector3(x, heightAt(x, z), z);
      if (p.distanceTo(player.pos) < 8) p.add(p.clone().sub(player.pos).setY(0).normalize().multiplyScalar(8 - p.distanceTo(player.pos)));
      p.y = heightAt(p.x, p.z);
      this.band.push({ b: new Beast('cave', p, this.scene, this.fx), t: 0 });
      this.stats.called++;
    }
  }

  update(dt: number, player: Player) {
    this.boar.update(dt, player);
    if (!this.boar.alive && !this.chief) {
      // The boar goes down and Snaggletooth is thrown over its head.
      const at = this.boar.position.clone().addScaledVector(this.boar.forward, 1.2);
      at.y = heightAt(at.x, at.z) + 0.6;
      const fling = this.boar.forward.multiplyScalar(4).setY(4);
      this.look.root.removeFromParent();
      this.chief = new GoblinChief(at, this.level, this.scene, this.fx, this.look, fling, this.den);
      this.chief.onHorn = (n) => this.callBand(n, player);
      events.emit('bossSpeaks', { id: 'snaggletooth', line: 'The war-boar goes down in a heap and Snaggletooth flies over its head. He rolls up spitting, and puts a horn to his lips.' });
    }
    if (this.chief) this.chief.update(dt, player);
    else if (this.boar.alive) {
      this.rideCutT -= dt;
      if (this.rideCutT <= 0) this.look.setPose('ride');
      const cam = creatureView.camera;
      this.look.lod(cam ? cam.distanceTo(this.boar.position) : 10);
      this.look.update(dt, Math.hypot(this.boar.vel.x, this.boar.vel.z));
    }
    for (const m of this.band) {
      m.b.update(dt, player);
      if (!m.b.alive) m.t += dt;
    }
    this.band = this.band.filter((m) => {
      if (m.t > 6) m.b.dispose();
      return m.t <= 6;
    });
  }

  dispose() {
    this.boar.dispose();
    this.chief?.dispose();
    this.look.dispose();
    for (const m of this.band) m.b.dispose();
    this.band = [];
  }
}

const DEN = { x: 70, z: -410 };

export const SNAGGLETOOTH: BossDef = {
  id: 'snaggletooth',
  kind: 'snaggletooth',
  name: 'Snaggletooth',
  title: 'goblin chief of the hill warren, on his war-boar',
  home: { x: DEN.x, z: DEN.z, r: 55 },
  levelBonus: 4,
  lair: warren,
  clearing: 20,
  looks: ['boar', 'goblin'],
  // He rides out at sundown and is back in the warren before dawn.
  abroad: (h) => h >= 17 || h < 3,
  spawn: (at, level, scene, fx) => new Snaggletooth(at, level, scene, fx, new THREE.Vector3(DEN.x, heightAt(DEN.x, DEN.z), DEN.z)),
  rumour: 'The goblins in the south hills have a chief now. Snaggletooth, they call him, for the tooth. He rides a boar the size of a pony with pots hammered onto it for armour, and he comes down at sundown for sheep.',
  found: 'Snaggletooth. A goblin chief in a crown of teeth, on a war-boar as big as a pony, armoured in hammered iron. He sees you, and grins round his tooth.',
  phaseLines: ['Snaggletooth is on his feet, and the hills are full of goblins answering his horn.', 'The violet stuff is in him now: Snaggletooth is faster than any goblin should be.'],
  unique: 'snaggleHorn',
  renown: 2,
  deed: 'Brought down Snaggletooth and his war-boar',
  slain: 'Snaggletooth falls, still clutching his horn. You take it from him. Let the warren come and ask for it back.',
  again: { items: [['warBoarTusk', 2]], gold: [50, 90] },
  bounty: {
    title: 'Bounty: Snaggletooth',
    description: 'The goblin chief of the south hills raids the sheepfolds at sundown on a war-boar. Elder Glen will pay to see the end of him, and of his pig.',
    gold: 200, xp: 260, rep: 110, minRank: 1,
  },
};
