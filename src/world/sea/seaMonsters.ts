import * as THREE from 'three';
import { SEA_LEVEL } from '../worldMap';
import { heightAt } from '../terrainHeight';
import { waveAt } from './seaState';
import type { Ship } from './ship';
import type { SeaTarget, ShotKind } from './gunnery';
import { newTargetId, targets, type HitInfo, type Target } from '../../combat/targets';
import { events } from '../../core/events';
import type { Player } from '../../player/player';
import type { FX } from '../../fx/particles';

// The great monsters of the sea (docs/design/boating.md §9.3). Each is a set
// piece with a tell you can read before it strikes, a weak point, and its own
// way of fighting the ship: the Kraken's tentacles grab the rigging, sweep the
// deck and crush the hull until its eye surfaces; the Crab Colossus clamps the
// hull and drags you onto the reef until its claws are broken; the Siren Choir
// sings the helm toward the rocks and charms the crew over the rail; the Storm
// Wyrm dives out of a storm and breathes lightning at the masts until a harpoon
// drags it into the sea; Old Teeth, the great white, rams from below and tows
// the ship on the line; and the Leviathan, whose breaches throw the ship like
// a storm, lets you pass only when the barbs on its back are torn out.

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const surface = (x: number, z: number) => SEA_LEVEL + waveAt(x, z).y;

export type BeastId = 'kraken' | 'crab' | 'sirens' | 'wyrm' | 'oldTeeth' | 'leviathan';
export const BEAST_NAMES: Record<BeastId, string> = { kraken: 'The Kraken', crab: 'The Crab Colossus', sirens: 'The Siren Choir', wyrm: 'The Storm Wyrm', oldTeeth: 'Old Teeth', leviathan: 'The Leviathan' };

/** What a monster can do to the ship's people (Sailing supplies it). */
export interface BeastCtx {
  toast(m: string): void;
  shake(n: number): void;
  crewOverboard(chance: number): void;
  /** a crewman taken (charmed over the rail, snatched): their name, or null */
  crewLost(): string | null;
  /** Monster Lore: weak-point multiplier, and tells come earlier */
  weak: number;
  lore: boolean;
  /** wax in the ears: the sirens can't charm */
  earplugs: boolean;
  /** the ship's monster-damage multiplier (figurehead, plating) */
  monster: number;
}

/**
 * A hittable piece of a monster (a tentacle, a claw, the eye, a siren, a barb):
 * a Target for blades, bows and spells, and a SeaTarget for the guns.
 */
export class Part implements Target, SeaTarget {
  id = newTargetId();
  alive = true;
  center = new THREE.Vector3();
  position = new THREE.Vector3();
  stunned = false;
  lockable = true;
  hp: number;
  maxHp: number;
  vel = new THREE.Vector3();
  tetherable = false;
  held = false;
  /** shots other than this kind do a fifth (the Leviathan's barbs want the harpoon) */
  only: ShotKind | null = null;
  /** hits here count this much more (eyes, the head) */
  weak = 1;
  /** a body hit tests along these points (radius each) */
  segs: { p: THREE.Vector3; r: number }[] = [];
  onHit?: (dmg: number, kind: ShotKind | 'melee') => void;
  onBreak?: () => void;

  constructor(readonly kind: string, hp: number, public radius: number, public halfHeight = 1, melee = true) {
    this.hp = this.maxHp = hp;
    if (melee) targets.add(this);
  }
  get pos() {
    return this.center;
  }
  takeHit(h: HitInfo) {
    this.hit(h.damage, 'melee');
  }
  hitBy(dmg: number, _from: THREE.Vector3, kind: ShotKind) {
    this.hit(dmg, kind);
  }
  hitTest(p: THREE.Vector3, pad: number) {
    if (this.center.distanceTo(p) < this.radius + pad) return true;
    return this.segs.some((s) => s.p.distanceTo(p) < s.r + pad);
  }
  hit(dmg: number, kind: ShotKind | 'melee') {
    if (!this.alive) return;
    const d = dmg * this.weak * (this.only && kind !== this.only ? 0.2 : 1);
    this.hp -= d;
    events.emit('enemyHit', { at: this.center.clone(), amount: Math.round(d), crit: this.weak > 1, enemyId: this.id });
    this.onHit?.(d, kind);
    if (this.hp <= 0) this.break();
  }
  break() {
    if (!this.alive) return;
    this.alive = false;
    this.hp = 0;
    targets.delete(this);
    this.onBreak?.();
  }
  dispose() {
    targets.delete(this);
  }
}

/** A monster encounter: parts to shoot at, a health pool for the boss bar, its own fight. */
export abstract class SeaBeast {
  abstract readonly id: BeastId;
  readonly group = new THREE.Group();
  hp: number;
  maxHp: number;
  alive = true;
  /** gone: slain and sunk, fled, or let you pass */
  finished = false;
  /** beaten (slain, or the Leviathan's barbs torn out) */
  beaten = false;
  pos = new THREE.Vector3();
  t = 0;
  protected parts_: Part[] = [];

  constructor(protected scene: THREE.Scene, protected fx: FX, at: THREE.Vector3, hp: number, readonly danger: number) {
    this.hp = this.maxHp = hp;
    this.pos.copy(at);
    scene.add(this.group);
  }
  get name() {
    return BEAST_NAMES[this.id];
  }
  /** Everything the guns can hit. */
  parts(): SeaTarget[] {
    return this.parts_.filter((p) => p.alive);
  }
  protected hurt(d: number) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - d);
    if (this.hp <= 0) this.die();
  }
  protected die() {
    this.alive = false;
    this.beaten = true;
    for (const p of this.parts_) p.break();
    events.emit('enemyDied', { at: this.pos.clone(), enemyId: -1, kind: this.id });
  }
  abstract update(dt: number, ship: Ship | null, player: Player, ctx: BeastCtx): void;
  dispose() {
    for (const p of this.parts_) p.dispose();
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
  }
  /** Bubbles and dark water: a tell. */
  protected boil(at: THREE.Vector3, r: number, n = 3) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * r;
      this.fx.alpha.spawn({ pos: new THREE.Vector3(at.x + Math.cos(a) * d, SEA_LEVEL + 0.2, at.z + Math.sin(a) * d), vel: new THREE.Vector3(0, 2, 0), spread: 0.6, count: 2, life: [0.6, 1.2], size: [0.4, 0.9], color: 0xeef8fa, alpha: 0.7, gravity: 2 });
    }
  }
  protected splash(at: THREE.Vector3, size = 1) {
    this.fx.alpha.spawn({ pos: at.clone().setY(SEA_LEVEL + 0.4), vel: new THREE.Vector3(0, 8 * size, 0), spread: 3 * size, count: Math.round(24 * size), life: [0.7, 1.4], size: [0.6 * size, 0.2], color: 0xeaf6fa, alpha: 0.85, gravity: 10 });
  }
}

const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });

// ---- the Kraken ------------------------------------------------------------------------------

interface Tentacle {
  part: Part;
  segs: THREE.Mesh[];
  base: THREE.Vector3; // in the ship's frame (x, z), at the waterline
  act: 'rise' | 'idle' | 'grab' | 'sweep' | 'crush' | 'cut';
  at: number; // time in this act
  tip: THREE.Vector3; // world
  mast: number; // local z of the mast it grabs
  section: number;
}

export class Kraken extends SeaBeast {
  readonly id = 'kraken' as const;
  state: 'tell' | 'tentacles' | 'eye' | 'dying' = 'tell';
  private st = 0;
  private tentacles: Tentacle[] = [];
  private head = new THREE.Group();
  private eye: Part;
  private cut = 0;
  private wave = 0;
  private skin = mat(0x6a2a4a, { roughness: 0.4 });
  private belly = mat(0xd8a0a8);

  constructor(scene: THREE.Scene, fx: FX, at: THREE.Vector3, danger: number) {
    super(scene, fx, at, Math.round(2400 + danger * 300), danger);
    // The head: a great mantle with one gold eye (the weak point).
    const mantle = new THREE.Mesh(new THREE.SphereGeometry(4.2, 18, 12), this.skin);
    mantle.scale.set(1, 1.5, 1.1);
    mantle.position.y = 2.5;
    const eyeM = new THREE.Mesh(new THREE.SphereGeometry(1.1, 14, 10), mat(0xffd040, { emissive: 0xffa010, emissiveIntensity: 1.6 }));
    eyeM.position.set(0, 1.4, 3.9);
    const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.4, 0.2), mat(0x101010));
    pupil.position.set(0, 1.4, 4.9);
    this.head.add(mantle, eyeM, pupil);
    this.head.visible = false;
    this.group.add(this.head);
    this.eye = new Part('krakenEye', 99999, 2.4, 2);
    this.eye.lockable = false;
    this.eye.onHit = (d) => this.hurt(d);
    this.parts_.push(this.eye);
  }

  private grow(ship: Ship, i: number, n: number) {
    // Tentacles rise in a ring round the hull.
    const side = i % 2 ? 1 : -1;
    const z = -ship.length * 0.38 + (Math.floor(i / 2) / Math.max(1, Math.ceil(n / 2) - 1)) * ship.length * 0.76;
    const base = new THREE.Vector3(side * (ship.beam / 2 + 3.5), 0, z);
    const segs: THREE.Mesh[] = [];
    for (let k = 0; k < 20; k++) {
      const r = 1.35 * Math.pow(1 - k / 21, 0.85) + 0.12;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r, 1.25, 10), this.skin);
      // Pale suckers in a row down one side.
      if (k > 2 && k % 2 === 0) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(r * 0.38, 8, 6), this.belly);
        s.scale.set(1, 0.6, 1);
        s.position.set(0, 0, r * 0.85);
        m.add(s);
      }
      m.castShadow = true;
      this.group.add(m);
      segs.push(m);
    }
    const part = new Part('tentacle', Math.round(260 + this.danger * 30), 1.3, 2.2);
    const tent: Tentacle = { part, segs, base, act: 'rise', at: 0, tip: new THREE.Vector3(), mast: 0, section: 1 };
    part.onHit = (d, kind) => this.hurt(d * (kind === 'chain' ? 0.35 : 0.2));
    part.onBreak = () => {
      tent.act = 'cut';
      tent.at = 0;
      this.cut++;
    };
    this.parts_.push(part);
    this.tentacles.push(tent);
  }

  update(dt: number, ship: Ship | null, player: Player, ctx: BeastCtx) {
    this.t += dt;
    this.st += dt;
    if (!ship || ship.sunk) {
      this.finished = this.st > 4;
      return;
    }
    if (this.state === 'dying') {
      for (const t of this.tentacles) for (const s of t.segs) s.position.y -= dt * 3;
      this.head.position.y -= dt * 1.5;
      if (this.st > 6) this.finished = true;
      return;
    }
    if (this.state === 'tell') {
      // The sea goes black around the hull and boils.
      this.pos.copy(ship.pos);
      this.boil(ship.pos, ship.length * 0.8, 4);
      if (this.st > (ctx.lore ? 9 : 6)) {
        this.state = 'tentacles';
        this.st = 0;
        const n = Math.min(8, 4 + Math.round(this.danger * 0.7));
        for (let i = 0; i < n; i++) this.grow(ship, i, n);
        ctx.shake(0.9);
        ctx.toast('Tentacles as thick as masts burst from the sea all round the ship! Cut them free!');
      }
      return;
    }
    // The head surfaces beside the ship when enough tentacles are cut (or after a while).
    if (this.state === 'tentacles' && (this.cut >= Math.ceil(this.tentacles.length * 0.6) || this.st > 50)) {
      this.state = 'eye';
      this.st = 0;
      const port = new THREE.Vector3(Math.cos(ship.yaw), 0, -Math.sin(ship.yaw)).multiplyScalar(Math.random() < 0.5 ? 1 : -1);
      this.pos.copy(ship.pos).addScaledVector(port, ship.beam / 2 + 14).setY(SEA_LEVEL - 1);
      this.head.visible = true;
      this.head.position.copy(this.pos);
      this.head.lookAt(ship.pos.x, this.pos.y, ship.pos.z);
      this.eye.lockable = true;
      targets.add(this.eye);
      this.splash(this.pos, 2.5);
      ctx.toast('The Kraken\'s head breaks the surface: its great gold eye is on you. Everything into the eye!');
    }
    if (this.state === 'eye') {
      this.head.position.y = this.pos.y + Math.min(1, this.st / 2) * 2 + Math.sin(this.t * 1.3) * 0.3;
      this.eye.center.copy(this.head.localToWorld(new THREE.Vector3(0, 1.4, 4.2)));
      this.eye.position.copy(this.eye.center).setY(this.eye.center.y - 1);
      this.eye.weak = 2 * ctx.weak;
      if (this.st > 15) {
        // It sinks, and new tentacles come.
        this.state = 'tentacles';
        this.st = 0;
        this.head.visible = false;
        this.eye.lockable = false;
        targets.delete(this.eye);
        this.eye.center.set(0, -999, 0);
        for (const t of this.tentacles) this.removeTentacle(t);
        this.tentacles = [];
        this.cut = 0;
        const n = Math.min(8, 4 + Math.round(this.danger * 0.5));
        for (let i = 0; i < n; i++) this.grow(ship, i, n);
        ctx.toast('The Kraken sinks, and the tentacles rise again!');
      }
    }
    // Tentacles: each picks an attack, and the ship suffers for every one still holding.
    let grabbing = 0;
    for (const t of this.tentacles) {
      t.at += dt;
      const base = ship.toWorld(new THREE.Vector3(t.base.x, -ship.def.deckY, t.base.z)).setY(SEA_LEVEL - 1);
      const side = Math.sign(t.base.x);
      const over = ship.toWorld(new THREE.Vector3(t.base.x * 0.2, ship.def.deckY + 1.4, t.base.z));
      let tip: THREE.Vector3;
      if (t.act === 'cut') {
        tip = base.clone().setY(SEA_LEVEL - 4 - t.at * 3);
      } else if (t.act === 'rise') {
        tip = base.clone().setY(SEA_LEVEL + Math.min(1, t.at / 1.5) * 9);
        if (t.at > 1.5) { t.act = 'idle'; t.at = 0; }
      } else if (t.act === 'idle') {
        // Reared above the rail, swaying, the tip curled over the deck.
        const inward = over.clone().sub(base).setY(0).normalize();
        tip = base.clone().addScaledVector(inward, 3 + Math.sin(this.t * 1.1 + t.base.z) * 1.5).add(new THREE.Vector3(Math.sin(this.t * 1.4 + t.base.z) * 1.5, 10 + Math.sin(this.t + t.base.z) * 1.5, 0));
        if (t.at > 2.5 + Math.random() * 3) {
          const r = Math.random();
          t.act = r < 0.35 ? 'grab' : r < 0.7 ? 'sweep' : 'crush';
          t.at = 0;
          t.mast = ship.length * (Math.random() < 0.5 ? -0.12 : 0.15);
          t.section = ship.sectionOf(t.base);
        }
      } else if (t.act === 'grab') {
        // Coiled round a mast: the sails can't draw while it holds.
        const mast = ship.toWorld(new THREE.Vector3(0, ship.def.deckY + 6, t.mast));
        tip = base.clone().lerp(mast, Math.min(1, t.at / 1.2));
        if (t.at > 1.2) grabbing++;
        if (t.at > 1.2 && t.at - dt <= 1.2) ctx.toast('A tentacle wraps the mast! The sails are dead until it\'s cut!');
        if (t.at > 9) { t.act = 'idle'; t.at = 0; }
      } else if (t.act === 'sweep') {
        // A swipe across the deck: anyone in its path goes flying.
        const k = Math.min(1, t.at / 1.6);
        const from = ship.toWorld(new THREE.Vector3(side * ship.beam, ship.def.deckY + 1.2, t.base.z - 4));
        const to = ship.toWorld(new THREE.Vector3(-side * ship.beam * 0.6, ship.def.deckY + 1.2, t.base.z + 4));
        tip = t.at < 0.5 ? base.clone().lerp(from, t.at / 0.5) : from.clone().lerp(to, k);
        if (t.at > 0.5 && t.at < 1.6 && player.pos.distanceTo(tip) < 3) {
          player.receiveAttack({ damage: Math.round((32 + this.danger * 6) * ctx.monster), from: base.clone(), parryable: false, poise: 70 });
          t.at = 1.6;
        }
        if (t.at > 1.6 && t.at - dt <= 1.6) ctx.crewOverboard(0.45);
        if (t.at > 2.6) { t.act = 'idle'; t.at = 0; }
      } else {
        // Crush: it rears and slams the rail.
        const rail = ship.toWorld(new THREE.Vector3(side * ship.beam * 0.45, ship.def.deckY + 0.6, t.base.z));
        tip = t.at < 1.2 ? base.clone().add(new THREE.Vector3(0, 12 * Math.min(1, t.at / 0.8), 0)) : rail;
        if (t.at > 1.2 && t.at - dt <= 1.2) {
          ship.damage(t.section, ship.stats.hull * 0.07 * ctx.monster);
          ship.water = Math.min(1, ship.water + 0.02);
          ctx.shake(0.7);
          if (player.pos.distanceTo(rail) < 3) player.receiveAttack({ damage: Math.round(40 * ctx.monster), from: rail, parryable: true, poise: 60 });
        }
        if (t.at > 2.2) { t.act = 'idle'; t.at = 0; }
      }
      t.tip.copy(tip);
      this.poseTentacle(t, base, tip, over);
    }
    if (grabbing) {
      ship.speed *= Math.exp(-grabbing * 0.5 * dt);
      ship.sailHp = Math.max(0, ship.sailHp - ship.stats.sails * 0.01 * grabbing * dt);
    }
    // Drop tentacles that sank away.
    for (const t of this.tentacles) if (t.act === 'cut' && t.at > 3) this.removeTentacle(t);
    this.tentacles = this.tentacles.filter((t) => !(t.act === 'cut' && t.at > 3));
    this.wave += dt;
    if (this.state !== 'eye') this.pos.copy(ship.pos);
  }

  private poseTentacle(t: Tentacle, base: THREE.Vector3, tip: THREE.Vector3, over: THREE.Vector3) {
    // A quadratic curve: up out of the sea, leaning out, then arching over toward the tip.
    const out = base.clone().sub(over).setY(0).normalize();
    const ctrl = base.clone().lerp(tip, 0.45).addScaledVector(out, 3).setY(Math.max(base.y, tip.y) + 4);
    const n = t.segs.length;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      const a = base.clone().lerp(ctrl, u), b = ctrl.clone().lerp(tip, u);
      const p = a.lerp(b, u);
      p.x += Math.sin(this.t * 3 + k * 0.6) * 0.25 * u;
      // The last third curls back on itself.
      if (u > 0.68) {
        const c = (u - 0.68) / 0.32;
        p.addScaledVector(out, -Math.sin(c * Math.PI) * 1.6 * c);
        p.y -= c * c * 1.8;
      }
      pts.push(p);
    }
    t.part.segs = [];
    for (let k = 0; k < n; k++) {
      const m = t.segs[k];
      const a = pts[k], b = pts[k + 1];
      m.position.copy(a).lerp(b, 0.5);
      m.scale.y = Math.max(0.2, (a.distanceTo(b) * 1.25) / 1.25);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      if (k % 3 === 1) t.part.segs.push({ p: m.position, r: 1.1 });
    }
    // Its reachable middle (blades from the deck; guns along its length).
    t.part.center.copy(pts[Math.round(n * 0.7)]);
    t.part.position.copy(t.part.center).setY(t.part.center.y - 1);
  }

  private removeTentacle(t: Tentacle) {
    for (const s of t.segs) {
      this.group.remove(s);
      s.geometry.dispose();
    }
    t.part.dispose();
    this.parts_ = this.parts_.filter((p) => p !== t.part);
  }

  protected die() {
    super.die();
    this.state = 'dying';
    this.st = 0;
    this.splash(this.pos, 3);
  }
}

// ---- the Crab Colossus ---------------------------------------------------------------------

export class CrabColossus extends SeaBeast {
  readonly id = 'crab' as const;
  state: 'tell' | 'grip' | 'free' | 'dying' = 'tell';
  private st = 0;
  private body = new THREE.Group();
  private claws: { part: Part; arm: THREE.Group; local: THREE.Vector3 }[] = [];
  private side = 1;
  private grind = 3;
  private bodyPart: Part;

  constructor(scene: THREE.Scene, fx: FX, at: THREE.Vector3, danger: number) {
    super(scene, fx, at, Math.round(1400 + danger * 200), danger);
    const shell = mat(0xc8502a, { roughness: 0.45 });
    const dark = mat(0x5a2a1a);
    const carapace = new THREE.Mesh(new THREE.SphereGeometry(5.5, 20, 12), shell);
    carapace.scale.set(1.35, 0.5, 1);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(6.4, 0.5, 6, 24), dark);
    rim.rotation.x = Math.PI / 2;
    rim.scale.set(1.15, 0.85, 1);
    const eyes = [-1, 1].flatMap((s) => {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.6, 6), shell);
      stalk.position.set(s * 1.4, 3, 4);
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), mat(0x101010, { metalness: 0.5, roughness: 0.2 }));
      e.position.set(s * 1.4, 3.9, 4);
      return [stalk, e];
    });
    const spikes: THREE.Mesh[] = [];
    for (let i = 0; i < 9; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.3, 5), dark);
      const a = (i / 9) * Math.PI * 2;
      sp.position.set(Math.cos(a) * 3.8, 2.1, Math.sin(a) * 2.8);
      spikes.push(sp);
    }
    this.body.add(carapace, rim, ...eyes, ...spikes);
    for (let i = 0; i < 6; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.2, 5, 6), dark);
      const s = i < 3 ? 1 : -1;
      leg.position.set(s * 6, -1.2, -3 + (i % 3) * 3);
      leg.rotation.z = s * 1.0;
      this.body.add(leg);
    }
    this.body.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
    this.group.add(this.body);
    this.body.visible = false;
    this.bodyPart = new Part('crabBody', 99999, 5.5, 2, false);
    this.bodyPart.onHit = (d, kind) => this.hurt(d * (kind === 'ball' || kind === 'fire' ? 1 : 0.6));
    this.parts_.push(this.bodyPart);
  }

  private makeClaw(ship: Ship, k: number) {
    const shell = mat(0xd8602a, { roughness: 0.45 });
    const arm = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 6, 8), shell);
    upper.position.y = 3;
    const pincer = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.6, 6), shell);
    pincer.position.y = 7;
    const pincer2 = pincer.clone();
    pincer2.position.set(0.8, 6.6, 0);
    pincer2.rotation.z = -0.5;
    arm.add(upper, pincer, pincer2);
    arm.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
    this.group.add(arm);
    // It grips the rail fore and aft on the side it came up.
    const local = new THREE.Vector3(this.side * ship.beam * 0.5, ship.def.deckY + 0.6, (k ? 1 : -1) * ship.length * 0.22);
    const part = new Part('crabClaw', Math.round(380 + this.danger * 40), 1.2, 1.2);
    part.onHit = (d) => this.hurt(d * 0.3);
    part.onBreak = () => {
      this.splash(part.center, 1);
      arm.visible = false;
    };
    this.parts_.push(part);
    this.claws.push({ part, arm, local });
  }

  update(dt: number, ship: Ship | null, player: Player, ctx: BeastCtx) {
    this.t += dt;
    this.st += dt;
    void player;
    if (!ship || ship.sunk) {
      this.finished = this.st > 3;
      return;
    }
    if (this.state === 'dying') {
      this.body.position.y -= dt * 1.5;
      for (const c of this.claws) c.arm.position.y -= dt * 2;
      if (this.st > 5) this.finished = true;
      return;
    }
    if (this.state === 'tell') {
      // Sand clouds the water and the bottom heaves.
      this.boil(ship.pos, ship.length * 0.6, 3);
      if (this.st > (ctx.lore ? 7 : 4.5)) {
        this.state = 'grip';
        this.st = 0;
        this.side = Math.random() < 0.5 ? 1 : -1;
        this.body.visible = true;
        this.makeClaw(ship, 0);
        this.makeClaw(ship, 1);
        ctx.shake(1);
        ctx.toast('A crab the size of a house heaves up from the reef and clamps its claws on the rail! Break its claws before it drags you aground!');
      }
      return;
    }
    // The body sits in the water beside the hull, on the side it holds.
    const port = new THREE.Vector3(Math.cos(ship.yaw), 0, -Math.sin(ship.yaw));
    this.pos.copy(ship.pos).addScaledVector(port, this.side * (ship.beam / 2 + 6.5)).setY(surface(ship.pos.x, ship.pos.z) - 0.4);
    this.body.position.copy(this.pos);
    this.body.rotation.y = ship.yaw + (this.side > 0 ? -Math.PI / 2 : Math.PI / 2);
    this.bodyPart.center.copy(this.pos).setY(this.pos.y + 1);
    for (const c of this.claws) {
      const rail = ship.toWorld(c.local);
      c.arm.position.copy(this.pos).setY(this.pos.y - 1);
      c.arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), rail.clone().sub(c.arm.position).normalize());
      c.arm.scale.setScalar(Math.min(1.4, c.arm.position.distanceTo(rail) / 7));
      c.part.center.copy(rail);
      c.part.position.copy(rail).setY(rail.y - 1);
    }
    const holding = this.claws.filter((c) => c.part.alive).length;
    if (this.state === 'grip') {
      if (holding === 0) {
        this.state = 'free';
        this.st = 0;
        ctx.toast('Both claws broken! The Colossus lets go: finish it while it\'s exposed!');
      } else {
        // Dragging the ship toward the shallows, grinding the hull.
        let best = new THREE.Vector3(), bh = -Infinity;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const h = heightAt(ship.pos.x + Math.cos(a) * 60, ship.pos.z + Math.sin(a) * 60);
          if (h > bh) { bh = h; best.set(Math.cos(a), 0, Math.sin(a)); }
        }
        ship.pos.addScaledVector(best, dt * 1.4 * holding * 0.5 * ctx.monster);
        ship.speed *= Math.exp(-0.8 * dt);
        this.grind -= dt;
        if (this.grind <= 0) {
          this.grind = 5;
          ship.damage(1, ship.stats.hull * 0.035 * ctx.monster);
          ctx.shake(0.4);
        }
      }
    } else if (this.state === 'free' && this.st > 18) {
      // It sinks back into the sand, wounded.
      this.finished = true;
      ctx.toast('The Colossus sinks back into the sand, broken-clawed.');
    }
  }

  protected die() {
    super.die();
    this.state = 'dying';
    this.st = 0;
    this.splash(this.pos, 2);
  }
}

// ---- the Siren Choir -----------------------------------------------------------------------

export class SirenChoir extends SeaBeast {
  readonly id = 'sirens' as const;
  private sirens: { part: Part; fig: THREE.Group; rock: THREE.Mesh }[] = [];
  private charmT = 12;
  private rocks = new THREE.Vector3();
  private sung = false;

  constructor(scene: THREE.Scene, fx: FX, at: THREE.Vector3, danger: number) {
    super(scene, fx, at, 1, danger);
    this.rocks.copy(at);
    const stone = mat(0x2a2a30, { roughness: 0.9 });
    const skin = mat(0xd0ecf0, { emissive: 0x5ab0c8, emissiveIntensity: 0.7 });
    const hair = mat(0x2a8a7a);
    const n = 3 + Math.min(2, Math.round(danger / 2.5));
    let total = 0;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const p = at.clone().add(new THREE.Vector3(Math.cos(a) * 9, 0, Math.sin(a) * 9));
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(3.2, 0), stone);
      rock.scale.set(1, 1.5, 0.9);
      rock.rotation.set(0.2 * i, i * 1.3, 0.15);
      rock.position.copy(p).setY(SEA_LEVEL + 1.3);
      const crag = new THREE.Mesh(new THREE.DodecahedronGeometry(1.8, 0), stone);
      crag.position.set(1.6, 2.2, -0.8);
      crag.scale.set(0.8, 1.4, 0.8);
      const guano = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2, 0), mat(0xe8e4d8, { roughness: 1 }));
      guano.position.set(0, 4.4, 0);
      guano.scale.set(1.2, 0.35, 1);
      rock.add(crag, guano);
      const fig = new THREE.Group();
      fig.scale.setScalar(1.7);
      const train = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.8, 8), hair);
      train.position.set(0, 1.0, -0.25);
      train.rotation.x = 0.25;
      fig.add(train);
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 4, 8), skin);
      body.position.y = 0.8;
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.3, 8), mat(0x2a7a8a, { metalness: 0.3 }));
      tail.rotation.z = Math.PI / 2;
      tail.position.set(0.6, 0.2, 0);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), skin);
      head.position.y = 1.6;
      const locks = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), hair);
      locks.position.y = 1.65;
      fig.add(body, tail, head, locks);
      fig.position.copy(p).setY(SEA_LEVEL + 7);
      this.group.add(rock, fig);
      const part = new Part('siren', Math.round(110 + danger * 15), 0.7, 0.9);
      part.center.copy(fig.position).setY(fig.position.y + 1);
      part.position.copy(fig.position);
      part.onBreak = () => {
        this.splash(fig.position, 0.6);
        fig.visible = false;
      };
      this.parts_.push(part);
      this.sirens.push({ part, fig, rock });
      total += part.maxHp;
    }
    this.hp = this.maxHp = total;
  }

  update(dt: number, ship: Ship | null, player: Player, ctx: BeastCtx) {
    this.t += dt;
    void player;
    const alive = this.sirens.filter((s) => s.part.alive);
    this.hp = alive.reduce((a, s) => a + s.part.hp, 0);
    if (!alive.length) {
      if (!this.beaten) {
        this.beaten = true;
        this.alive = false;
        ctx.toast('The last siren falls silent. The fog lifts from the rocks.');
      }
      this.finished = true;
      return;
    }
    for (const s of alive) {
      s.fig.rotation.y = this.t * 0.4;
      s.fig.position.y = SEA_LEVEL + 7 + Math.sin(this.t * 1.5 + s.rock.position.x) * 0.1;
      s.part.center.copy(s.fig.position).setY(s.fig.position.y + 1.6);
    }
    // Fog drifts about the rocks.
    if (Math.random() < dt * 8) {
      const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 80;
      this.fx.alpha.spawn({ pos: this.rocks.clone().add(new THREE.Vector3(Math.cos(a) * r, 2, Math.sin(a) * r)), spread: 6, count: 2, life: [3, 6], size: [6, 12], color: 0xdde6ea, alpha: 0.25, drag: 0.5 });
    }
    if (!ship || ship.sunk) return;
    const d = Math.hypot(ship.pos.x - this.rocks.x, ship.pos.z - this.rocks.z);
    if (d > 520) {
      this.finished = true;
      return;
    }
    if (!this.sung && d < 400) {
      this.sung = true;
      ctx.toast(ctx.earplugs ? 'A song drifts over the water. Thank the wax in your ears.' : 'A song drifts over the water, so sweet it hurts. The helm pulls toward the rocks: hold her off and silence the sirens!');
    }
    if (ctx.earplugs || d > 400) return;
    // The song pulls the helm toward the rocks.
    const want = Math.atan2(this.rocks.x - ship.pos.x, this.rocks.z - ship.pos.z);
    ship.yaw += wrap(want - ship.yaw) * dt * 0.12 * (alive.length / this.sirens.length);
    // And the crew walk to the rail as if dreaming.
    this.charmT -= dt;
    if (this.charmT <= 0) {
      this.charmT = 14 + Math.random() * 8;
      const who = ctx.crewLost();
      if (who) ctx.toast(`${who} walks to the rail, smiling, and steps into the sea.`);
    }
    // Too close: the rocks.
    if (d < 16 + ship.length * 0.4 && Math.abs(ship.speed) > 0.5) {
      ship.damage(0, ship.stats.hull * 0.06 * dt * Math.abs(ship.speed));
      ship.speed *= Math.exp(-1.5 * dt);
      if (Math.random() < dt) ctx.shake(0.5);
    }
  }
}

// ---- the Storm Wyrm ------------------------------------------------------------------------

export class StormWyrm extends SeaBeast {
  readonly id = 'wyrm' as const;
  state: 'circle' | 'dive' | 'breath' | 'downed' | 'dying' = 'circle';
  private st = 0;
  private segs: THREE.Mesh[] = [];
  private wings: THREE.Mesh[] = [];
  private trail: THREE.Vector3[] = [];
  private body: Part;
  private ang = 0;
  private yaw = 0;
  private flash: THREE.Line | null = null;
  private hitDeck = false;

  constructor(scene: THREE.Scene, fx: FX, at: THREE.Vector3, danger: number) {
    super(scene, fx, at, Math.round(1600 + danger * 220), danger);
    this.pos.copy(at).setY(SEA_LEVEL + 25);
    const hide = mat(0x3a4a6a, { metalness: 0.35, roughness: 0.4 });
    const glow = mat(0xbfe8ff, { emissive: 0x8fd8ff, emissiveIntensity: 1.8 });
    const ridge = mat(0x2a3448, { roughness: 0.5 });
    for (let i = 0; i < 22; i++) {
      const r = 1.7 * Math.pow(1 - i / 23, 0.7) + 0.2;
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), hide);
      m.scale.set(1, 0.85, 1.35);
      if (i === 0) {
        // The head: a long snout, a jaw that glows with the storm, swept horns, lamp eyes.
        const snout = new THREE.Mesh(new THREE.ConeGeometry(r * 0.75, r * 2.6, 8), hide);
        snout.rotation.x = Math.PI / 2;
        snout.position.set(0, 0, r * 1.5);
        const jaw = new THREE.Mesh(new THREE.ConeGeometry(r * 0.5, r * 2.2, 8), glow);
        jaw.rotation.x = Math.PI / 2;
        jaw.position.set(0, -r * 0.45, r * 1.3);
        m.add(snout, jaw);
        for (const s of [-1, 1]) {
          const e = new THREE.Mesh(new THREE.SphereGeometry(r * 0.2, 8, 6), glow);
          e.position.set(s * r * 0.55, r * 0.35, r * 0.7);
          const horn = new THREE.Mesh(new THREE.ConeGeometry(r * 0.18, r * 2.2, 6), ridge);
          horn.position.set(s * r * 0.5, r * 0.8, -r * 0.6);
          horn.rotation.x = -1.1;
          m.add(e, horn);
        }
      } else if (i % 2 === 0) {
        const fin = new THREE.Mesh(new THREE.ConeGeometry(r * 0.3, r * 1.2, 4), ridge);
        fin.position.y = r * 0.9;
        fin.rotation.x = -0.6;
        m.add(fin);
      }
      m.castShadow = true;
      this.group.add(m);
      this.segs.push(m);
    }
    const wingM = mat(0x4a5a7a, { side: THREE.DoubleSide, transparent: true, opacity: 0.92, emissive: 0x1a2a4a, emissiveIntensity: 0.4 });
    for (const s of [-1, 1]) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 1.5), new THREE.Vector3(s * 14, 1.5, -2), new THREE.Vector3(s * 9, 0, -4),
        new THREE.Vector3(0, 0, 1.5), new THREE.Vector3(s * 9, 0, -4), new THREE.Vector3(s * 4, 0, -6),
        new THREE.Vector3(0, 0, 1.5), new THREE.Vector3(s * 4, 0, -6), new THREE.Vector3(0, 0, -5),
      ]);
      g.computeVertexNormals();
      const w = new THREE.Mesh(g, wingM);
      w.castShadow = true;
      this.group.add(w);
      this.wings.push(w);
    }
    for (let i = 0; i < 120; i++) this.trail.push(this.pos.clone());
    this.body = new Part('wyrm', 99999, 1.4, 1.2);
    this.body.tetherable = true;
    this.body.onHit = (d, kind) => this.hurt(d * (this.state === 'downed' ? 1.6 * this.weak : 1) * (kind === 'chain' ? 1.2 : 1));
    this.parts_.push(this.body);
  }
  private weak = 1;

  update(dt: number, ship: Ship | null, player: Player, ctx: BeastCtx) {
    this.t += dt;
    this.st += dt;
    this.weak = ctx.weak;
    if (this.flash) {
      this.scene.remove(this.flash);
      this.flash.geometry.dispose();
      this.flash = null;
    }
    if (this.state === 'dying') {
      this.pos.y -= dt * 4;
      this.place();
      if (this.st > 5) this.finished = true;
      return;
    }
    if (!ship || ship.sunk) {
      this.pos.y += dt * 8;
      this.place();
      if (this.st > 6) this.finished = true;
      return;
    }
    let goal: THREE.Vector3;
    let speed = 22;
    // A harpoon line drags it down into the sea.
    if (this.body.held && this.state !== 'downed') {
      this.state = 'downed';
      this.st = 0;
      ctx.toast('The harpoon drags the Storm Wyrm down into the sea! Hit it while it thrashes!');
    }
    if (this.state === 'downed') {
      goal = this.pos.clone().setY(surface(this.pos.x, this.pos.z) - 0.3);
      speed = 6;
      if (Math.random() < dt * 6) this.splash(this.pos, 0.7);
      if (this.st > 12 || !this.body.held) {
        this.state = 'circle';
        this.st = 0;
      }
    } else if (this.state === 'circle') {
      this.ang += dt * 0.45;
      const r = 55;
      goal = ship.pos.clone().add(new THREE.Vector3(Math.cos(this.ang) * r, 0, Math.sin(this.ang) * r)).setY(SEA_LEVEL + 24 + Math.sin(this.t * 0.7) * 4);
      if (this.st > (ctx.lore ? 9 : 7) + Math.random() * 3) {
        this.state = Math.random() < 0.55 ? 'dive' : 'breath';
        this.st = 0;
        this.hitDeck = false;
        ctx.toast(this.state === 'dive' ? 'The Wyrm folds its wings and dives at the deck!' : 'Lightning crackles in the Wyrm\'s jaws!');
      }
    } else if (this.state === 'dive') {
      goal = ship.toWorld(new THREE.Vector3(0, ship.def.deckY + 2, 0));
      speed = 30;
      if (!this.hitDeck && this.pos.distanceTo(goal) < 5) {
        this.hitDeck = true;
        if (player.pos.distanceTo(goal) < 7) player.receiveAttack({ damage: Math.round((38 + this.danger * 6) * ctx.monster), from: this.pos.clone(), parryable: true, poise: 60 });
        ctx.crewOverboard(0.35);
        ctx.shake(0.8);
        this.state = 'circle';
        this.st = 0;
      }
      if (this.st > 5) { this.state = 'circle'; this.st = 0; }
    } else {
      // Lightning at the masts.
      goal = this.pos.clone();
      speed = 4;
      if (this.st > 1.5) {
        const mast = ship.toWorld(new THREE.Vector3(0, ship.def.deckY + 8, 0));
        this.flash = new THREE.Line(new THREE.BufferGeometry().setFromPoints([this.pos.clone(), mast.clone().lerp(this.pos, 0.5).add(new THREE.Vector3(2, 0, -2)), mast]), new THREE.LineBasicMaterial({ color: 0xe8f8ff }));
        this.scene.add(this.flash);
        ship.sailHp = Math.max(0, ship.sailHp - ship.stats.sails * 0.14 * ctx.monster);
        ship.fire = Math.min(1, ship.fire + 0.3);
        ship.damage(1, ship.stats.hull * 0.03 * ctx.monster);
        ctx.shake(0.6);
        ctx.toast('Lightning strikes the mast! Fire in the rigging!');
        this.state = 'circle';
        this.st = 0;
      }
    }
    const to = goal.clone().sub(this.pos);
    const d = to.length();
    if (d > 0.01) this.pos.addScaledVector(to, Math.min(1, (speed * dt) / d));
    if (to.lengthSq() > 1) this.yaw = Math.atan2(to.x, to.z);
    this.body.vel.copy(to).normalize().multiplyScalar(speed);
    this.place();
  }

  private place() {
    this.trail.unshift(this.pos.clone());
    this.trail.length = 120;
    this.segs.forEach((s, i) => {
      const p = this.trail[Math.min(this.trail.length - 1, 1 + i * 2)];
      s.position.copy(p);
      s.position.y += Math.sin(this.t * 4 - i * 0.6) * 0.5;
      // (face along the body: toward the segment ahead)
      const ahead = this.trail[Math.max(0, i * 2 - 1)];
      s.lookAt(ahead.x === p.x && ahead.z === p.z ? p.clone().add(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw))) : ahead);
    });
    const flap = Math.sin(this.t * (this.state === 'downed' ? 9 : 5)) * 0.6;
    this.wings.forEach((w, k) => {
      w.position.copy(this.segs[3].position);
      w.rotation.set(0, this.yaw, (k ? -1 : 1) * flap);
    });
    this.body.center.copy(this.segs[0].position);
    this.body.position.copy(this.body.center).setY(this.body.center.y - 1);
    this.body.segs = this.segs.filter((_, i) => i % 3 === 0).map((s) => ({ p: s.position, r: 1.6 }));
  }

  dispose() {
    if (this.flash) this.scene.remove(this.flash);
    super.dispose();
  }

  protected die() {
    super.die();
    this.state = 'dying';
    this.st = 0;
  }
}

// ---- Old Teeth, the great white ------------------------------------------------------------

export class OldTeeth extends SeaBeast {
  readonly id = 'oldTeeth' as const;
  state: 'circle' | 'ram' | 'run' | 'hauled' | 'dying' = 'circle';
  private st = 0;
  private body: Part;
  private fish = new THREE.Group();
  private yaw = 0;
  private ang = 0;
  private rammed = false;

  constructor(scene: THREE.Scene, fx: FX, at: THREE.Vector3, danger: number) {
    super(scene, fx, at, 1700, danger);
    const grey = mat(0x5a6a74, { roughness: 0.5 });
    const white = mat(0xd8dcd8, { roughness: 0.6 });
    const scar = mat(0x8a6a6a);
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), grey);
    body.scale.set(1.1, 1, 3.4);
    const under = new THREE.Mesh(new THREE.SphereGeometry(0.95, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), white);
    under.scale.set(1.1, 1, 3.3);
    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.2, 4), grey);
    dorsal.position.set(0, 1.6, 0.2);
    dorsal.rotation.x = -0.35;
    const tailUp = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.4, 4), grey);
    tailUp.position.set(0, 1.0, -3.9);
    tailUp.rotation.x = -0.7;
    const tailDown = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.6, 4), grey);
    tailDown.position.set(0, -0.6, -3.7);
    tailDown.rotation.x = -2.4;
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.25, 1.0), scar);
    jaw.position.set(0, -0.45, 2.9);
    const fins = [-1, 1].map((s) => {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.8, 4), grey);
      f.position.set(s * 1.1, -0.4, 1.2);
      f.rotation.set(0.3, 0, s * 1.9);
      return f;
    });
    const eyes = [-1, 1].map((s) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(0x050505, { metalness: 0.6, roughness: 0.1 }));
      e.position.set(s * 0.62, 0.25, 2.6);
      return e;
    });
    this.fish.add(body, under, dorsal, tailUp, tailDown, jaw, ...fins, ...eyes);
    this.fish.scale.setScalar(1.8);
    this.fish.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
    this.group.add(this.fish);
    this.body = new Part('oldTeeth', 99999, 2.5, 1.2);
    this.body.tetherable = true;
    this.body.onHit = (d) => this.hurt(d * (this.state === 'hauled' ? 1.5 * this.weak : 1));
    this.parts_.push(this.body);
    this.pos.setY(SEA_LEVEL - 0.6);
  }
  private weak = 1;

  update(dt: number, ship: Ship | null, player: Player, ctx: BeastCtx) {
    this.t += dt;
    this.st += dt;
    this.weak = ctx.weak;
    void player;
    if (this.state === 'dying') {
      this.pos.y -= dt;
      this.fish.rotation.z = Math.min(Math.PI, this.st);
      this.place();
      if (this.st > 6) this.finished = true;
      return;
    }
    if (!ship || ship.sunk) {
      this.finished = this.st > 5;
      return;
    }
    let goal = this.pos.clone();
    let speed = 8;
    const sea = surface(this.pos.x, this.pos.z);
    if (this.body.held) {
      // On the line: it runs and tows; hauled in close, it's alongside for a moment.
      const d = this.pos.distanceTo(ship.pos);
      if (d < ship.length * 0.5 + 9 && this.state !== 'hauled') {
        this.state = 'hauled';
        this.st = 0;
        ctx.toast('Old Teeth is hauled alongside, thrashing! Strike from the rail!');
      }
      if (this.state === 'hauled') {
        const port = new THREE.Vector3(Math.cos(ship.yaw), 0, -Math.sin(ship.yaw));
        goal = ship.pos.clone().addScaledVector(port, ship.beam / 2 + 2.5).setY(sea - 0.3);
        speed = 6;
        if (this.st > 7) { this.state = 'run'; this.st = 0; }
      } else {
        this.state = 'run';
        const away = this.pos.clone().sub(ship.pos).setY(0).normalize();
        goal = this.pos.clone().addScaledVector(away, 30).setY(sea - 0.5);
        speed = 11;
      }
    } else if (this.state === 'circle' || this.state === 'run') {
      this.ang += dt * 0.35;
      goal = ship.pos.clone().add(new THREE.Vector3(Math.cos(this.ang) * 32, 0, Math.sin(this.ang) * 32)).setY(sea - 0.6);
      if (this.st > (ctx.lore ? 11 : 9) + Math.random() * 5) {
        this.state = 'ram';
        this.st = 0;
        this.rammed = false;
        ctx.toast('A fin turns toward the hull and vanishes: Old Teeth is coming from below!');
      }
    } else if (this.state === 'ram') {
      goal = ship.pos.clone().setY(sea - 3);
      speed = 14;
      if (!this.rammed && ship.contains(this.pos, 2)) {
        this.rammed = true;
        const sec = ship.sectionOf(ship.toLocal(this.pos));
        ship.damage(sec, ship.stats.hull * 0.09 * ctx.monster);
        ship.water = Math.min(1, ship.water + 0.04);
        ctx.shake(1);
        ctx.toast('Old Teeth slams the hull from below!');
        if (Math.random() < 0.3) {
          const who = ctx.crewLost();
          if (who) ctx.toast(`Old Teeth snatches ${who} from the rail!`);
        }
        this.state = 'circle';
        this.st = 0;
      }
      if (this.st > 7) { this.state = 'circle'; this.st = 0; }
    }
    const to = goal.clone().sub(this.pos);
    const d = to.length();
    if (d > 0.01) this.pos.addScaledVector(to, Math.min(1, (speed * (this.body.held ? 0.7 : 1) * dt) / d));
    if (to.clone().setY(0).lengthSq() > 1) this.yaw += wrap(Math.atan2(to.x, to.z) - this.yaw) * Math.min(1, dt * 3);
    this.body.vel.set(Math.sin(this.yaw) * speed, 0, Math.cos(this.yaw) * speed);
    this.place();
  }

  private place() {
    this.fish.position.copy(this.pos);
    this.fish.rotation.y = this.yaw;
    if (this.state !== 'dying') this.fish.rotation.z = this.state === 'hauled' ? Math.sin(this.t * 10) * 0.4 : Math.sin(this.t * 2) * 0.06;
    this.body.center.copy(this.pos).setY(Math.max(this.pos.y, SEA_LEVEL - 0.2));
    this.body.position.copy(this.body.center).setY(this.body.center.y - 1);
    this.body.segs = [-2, 2].map((k) => ({ p: this.pos.clone().add(new THREE.Vector3(Math.sin(this.yaw) * k * 1.8, 0, Math.cos(this.yaw) * k * 1.8)), r: 1.6 }));
  }

  protected die() {
    super.die();
    this.state = 'dying';
    this.st = 0;
  }
}

// ---- the Leviathan -------------------------------------------------------------------------

export class Leviathan extends SeaBeast {
  readonly id = 'leviathan' as const;
  state: 'rise' | 'swim' | 'breach' | 'sound' = 'rise';
  private st = 0;
  private body = new THREE.Group();
  private barbs: { part: Part; mesh: THREE.Mesh; local: THREE.Vector3 }[] = [];
  private ang = 0;
  private yaw = 0;
  private breachT = 14;
  /** a rogue wave from a breach (Sailing throws the ship with it) */
  onBreach?: (dir: THREE.Vector2, size: number) => void;

  constructor(scene: THREE.Scene, fx: FX, at: THREE.Vector3, danger: number) {
    super(scene, fx, at, 1, danger);
    const hide = mat(0x2a3a4a, { roughness: 0.7 });
    const pale = mat(0x8a9aa8, { roughness: 0.8 });
    const moss = mat(0x3a5a3a, { roughness: 0.95 });
    for (let i = 0; i < 7; i++) {
      const r = 9 - Math.abs(i - 2) * 1.2;
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 10), i % 2 ? hide : hide);
      m.scale.set(1.2, 0.55, 1.8);
      m.position.set(0, 0, 40 - i * 16);
      this.body.add(m);
      // Crags and growths along the back: it looks like an island.
      for (let k = 0; k < 5; k++) {
        const c = new THREE.Mesh(k % 2 ? new THREE.DodecahedronGeometry(1.4 + Math.random() * 1.2, 0) : new THREE.ConeGeometry(1.2 + Math.random(), 3 + Math.random() * 3, 5), k % 3 === 0 ? moss : pale);
        c.position.set((Math.random() - 0.5) * r * 1.2, r * 0.5, 40 - i * 16 + (Math.random() - 0.5) * 12);
        this.body.add(c);
      }
    }
    const glow = mat(0xff6a3a, { emissive: 0xff4a1a, emissiveIntensity: 2 });
    let total = 0;
    for (let k = 0; k < 4; k++) {
      const local = new THREE.Vector3((k % 2 ? 1 : -1) * 3, 7, 30 - k * 18);
      const barb = new THREE.Mesh(new THREE.ConeGeometry(0.7, 5, 6), glow);
      barb.position.copy(local);
      this.body.add(barb);
      const part = new Part('leviathanBarb', Math.round(320 + danger * 20), 1.8, 2.5, false);
      part.only = 'harpoon';
      part.onBreak = () => {
        barb.visible = false;
        this.splash(part.center, 1.4);
      };
      this.parts_.push(part);
      this.barbs.push({ part, mesh: barb, local });
      total += part.maxHp;
    }
    this.hp = this.maxHp = total;
    this.body.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
    this.group.add(this.body);
    this.pos.setY(SEA_LEVEL - 20);
  }

  update(dt: number, ship: Ship | null, player: Player, ctx: BeastCtx) {
    this.t += dt;
    this.st += dt;
    void player;
    this.hp = this.barbs.reduce((a, b) => a + Math.max(0, b.part.hp), 0);
    if (this.state !== 'sound' && this.barbs.every((b) => !b.part.alive)) {
      this.state = 'sound';
      this.st = 0;
      this.beaten = true;
      this.alive = false;
      ctx.toast('With its last barb torn out the Leviathan groans like a mountain and sounds into the abyss. It lets you pass.');
    }
    if (!ship || ship.sunk) {
      this.state = 'sound';
    }
    if (this.state === 'sound') {
      this.pos.y -= dt * 3;
      this.place();
      if (this.st > 10) this.finished = true;
      return;
    }
    const target = ship!;
    if (target.pos.distanceTo(this.pos) > 900) {
      this.state = 'sound';
      this.st = 0;
      return;
    }
    // It circles the ship at a distance, its back awash like a reef.
    this.ang += dt * 0.05;
    const r = 110;
    const goal = target.pos.clone().add(new THREE.Vector3(Math.cos(this.ang) * r, 0, Math.sin(this.ang) * r));
    const to = goal.clone().sub(this.pos).setY(0);
    if (to.lengthSq() > 4) this.yaw += wrap(Math.atan2(to.x, to.z) - this.yaw) * Math.min(1, dt * 0.4);
    this.pos.x += Math.sin(this.yaw) * 7 * dt;
    this.pos.z += Math.cos(this.yaw) * 7 * dt;
    let y = SEA_LEVEL - 2.6;
    if (this.state === 'rise') {
      y = SEA_LEVEL - 20 + Math.min(1, this.st / 6) * 15.5;
      if (this.st > 6) { this.state = 'swim'; this.st = 0; }
    } else {
      this.breachT -= dt;
      if (this.state === 'swim' && this.breachT < (ctx.lore ? 4 : 2.5) && this.breachT + dt >= (ctx.lore ? 4 : 2.5)) ctx.toast('The Leviathan\'s back heaves: it is going to breach! Turn your bow to it!');
      if (this.breachT <= 0) {
        this.state = 'breach';
        this.st = 0;
        this.breachT = 16 + Math.random() * 8;
      }
      if (this.state === 'breach') {
        y = SEA_LEVEL - 2.6 + Math.sin(Math.min(1, this.st / 3) * Math.PI) * 12;
        if (this.st > 1.5 && this.st - dt <= 1.5) {
          this.splash(this.pos, 4);
          ctx.shake(1);
          const dir = new THREE.Vector2(target.pos.x - this.pos.x, target.pos.z - this.pos.z).normalize();
          this.onBreach?.(dir, 9);
        }
        if (this.st > 3) { this.state = 'swim'; this.st = 0; }
      }
    }
    this.pos.y += (y - this.pos.y) * Math.min(1, dt * 1.5);
    this.place();
  }

  private place() {
    this.body.position.copy(this.pos);
    this.body.rotation.y = this.yaw;
    this.body.updateMatrixWorld();
    for (const b of this.barbs) {
      b.part.center.copy(b.local).applyMatrix4(this.body.matrixWorld);
      b.part.position.copy(b.part.center);
    }
  }
}

export function makeBeast(id: BeastId, scene: THREE.Scene, fx: FX, at: THREE.Vector3, danger: number): SeaBeast {
  switch (id) {
    case 'kraken': return new Kraken(scene, fx, at, danger);
    case 'crab': return new CrabColossus(scene, fx, at, danger);
    case 'sirens': return new SirenChoir(scene, fx, at, danger);
    case 'wyrm': return new StormWyrm(scene, fx, at, danger);
    case 'oldTeeth': return new OldTeeth(scene, fx, at, danger);
    case 'leviathan': return new Leviathan(scene, fx, at, danger);
  }
}
