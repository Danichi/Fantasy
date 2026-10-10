import * as THREE from 'three';
import type { Player } from '../player/player';
import type { SkillRuntime } from '../paths/skills';
import type { ActionDef } from './actions';
import type { ProcPose } from '../player/rigLayer';
import type { ItemDef } from '../items/itemDefs';
import { targets, type Target, type IncomingAttack, type DefenceResult } from './targets';
import { events } from '../core/events';
import { clamp } from '../core/math';
import { familyOf, FAMILIES, type FamilyDef } from '../items/weapons';
import { twoHanded } from '../items/weapons/kinds';
import { crossGuard } from '../items/weapons/spear';
import type { MoveId } from '../items/weapons/kit';
import type { Ranged } from './ranged';

// The weapon families at work (docs/design/arms-and-crafting.md §3). This is
// what the player's small hooks call into:
//  - actionFor: the equipped family's moveset under the sword's action ids;
//  - poseHook: two-handed holds (the left hand takes the grip), weapon guards
//    and parries, and the bow and crossbow poses (combat/ranged.ts);
//  - hyper-armour (a greatsword's heavy and sweep), weapon guards for
//    two-handers (decision 1: no shield, the weapon blocks);
//  - the school adapters: how Gale Flow, the Boundary focus zone and Cross
//    openings each work with the family in hand;
//  - weapon traits that need the skill runtime (bleeds, armour breaks,
//    backstabs) and timed buffs from meals and elixirs.

export interface Buff {
  id: string;
  label: string;
  left: number;
  m: Record<string, number>;
}

interface Opening {
  left: number;
  kind: string;
  mult: number;
}

const OPENING_TIME = 2.2;
const ZONE_COOLDOWN = 1.6;
const CRACK_TIME = 6;

export class ArmsRuntime {
  ranged!: Ranged;
  /** timed buffs from meals and elixirs (id -> buff); one meal at a time */
  buffs = new Map<string, Buff>();
  private opening: Opening | null = null;
  private zoneSeen = new Map<number, number>();
  /** maces crack armour: target id -> seconds left */
  private cracked = new Map<number, number>();
  private chain = 0;
  private chainT = 0;
  private holdW = 0;
  private time = 0;
  private lastDodge: object | null = null;
  /** numbers for tests and the HUD */
  readonly stats = { zoneIntercepts: 0, openingsTaken: 0, backstabs: 0 };

  constructor(private player: Player, private rt: SkillRuntime, private toast: (m: string) => void) {
    const p = player;
    p.actionFor = (id) => this.actionFor(id);
    p.poseHook = (pose, act, at) => this.pose(pose, act, at);
    p.hyperArmour = () => this.hyperArmour();
    p.weaponGuard = () => this.weaponGuard();
    // Blade-hit bonuses stack with the skill runtime's (brands, forced crits).
    const prev = p.meleeBonus;
    p.meleeBonus = (t) => {
      const a = prev?.(t) ?? { mult: 1, crit: false };
      const b = this.meleeBonus(t);
      return { mult: a.mult * b.mult, crit: a.crit || b.crit };
    };
    // A dodge that slips a blow (Cross openings) is only visible here.
    const recv = p.receiveAttack.bind(p);
    p.receiveAttack = (att: IncomingAttack): DefenceResult => {
      const r = recv(att);
      if (r === 'dodged' && !p.dead && p.act?.def.roll) this.open('dodge');
      return r;
    };
    events.on('meleeHit', (e) => this.onMeleeHit(e.target, e.amount, e.action));
    events.on('parrySuccess', () => this.open('parry'));
    events.on('equipmentChanged', () => this.onEquip());
    events.on('enemyDied', ({ enemyId }) => {
      this.cracked.delete(enemyId);
      this.zoneSeen.delete(enemyId);
    });
  }

  // ---- what's in hand ---------------------------------------------------------------------
  get family(): FamilyDef | null {
    return familyOf(this.player.equip.mainWeapon?.def);
  }
  get main(): ItemDef | undefined {
    return this.player.equip.mainWeapon?.def;
  }
  private get school() {
    return this.player.paths.active;
  }

  /** The family's version of an action, or undefined to keep the sword's. */
  actionFor(id: string): ActionDef | undefined {
    const eq = this.player.equip;
    if (id === 'offslash1' || id === 'offslash2') return familyOf(eq.offItem?.def)?.moves[id as MoveId];
    const f = this.family;
    if (!f || f.id === 'sword') return undefined;
    if (f.id === 'crossbow') {
      if (id === 'slash1' || id === 'sprintAttack' || id === 'airAttack' || id === 'heavy') return this.ranged.loaded ? f.moves.slash1 : f.moves.reload;
      if (id === 'reload') return f.moves.reload;
    }
    if (f.id === 'bow' && (id === 'sprintAttack' || id === 'airAttack')) return f.moves.slash1;
    return f.moves[id as MoveId];
  }

  private hyperArmour() {
    const a = this.player.act, f = this.family;
    if (!a || !f?.hyperArmour?.includes(a.def.id)) return false;
    return !a.def.hit || a.t < a.def.hit.to;
  }

  private weaponGuard() {
    const d = this.main, f = this.family;
    if (!d || !f?.guard || !twoHanded(d)) return null;
    const k = this.player.equip.mainWeapon?.q !== undefined ? 1 + 0.05 * ((this.player.equip.mainWeapon.q ?? 1) - 1) : 1;
    return { block: Math.min(92, Math.round(f.guard.block * k)), stability: f.guard.stability };
  }

  /** Bows sit in the left hand: move the model over when one is equipped. */
  private onEquip() {
    const eq = this.player.equip, rig = this.player.rig;
    const d = eq.mainWeapon?.def;
    const m = eq.model('main');
    if (d?.kind === 'bow' && m && m.parent !== rig.hands.Left.socket) {
      rig.hands.Left.socket.add(m);
      rig.setCurl('Left', 1);
      rig.setCurl('Right', 0.55);
    } else if (d && twoHanded(d)) rig.setCurl('Left', 0.9);
  }

  // ---- poses -----------------------------------------------------------------------------------
  private pose(pose: ProcPose, act: { def: ActionDef; t: number } | null, at: number): ProcPose {
    const p = this.player, f = this.family, d = this.main;
    void at;
    if (!f || !d || p.mounted || p.vehicle) return pose;
    if (f.id === 'bow' || f.id === 'crossbow') {
      const out = this.ranged.pose(pose, act);
      if (f.id === 'crossbow' && !this.ranged.aiming && !act) return this.hold(out, f, d);
      return out;
    }
    if (f.id === 'sword') return pose;
    if (!act) return this.hold(pose, f, d);
    let out = pose;
    if (act.def.id === 'parryWeapon') out = { ...pose, right: pose.right ?? crossGuard(1).right };
    if (twoHanded(d) && f.hold?.off !== undefined) out = { ...out, leftFollows: { off: f.hold.off, w: 1, slide: f.hold.slide } };
    return out;
  }

  /** Not attacking: the family's guard (or block) pose, and the second hand on the grip. */
  private hold(pose: ProcPose, f: FamilyDef, d: ItemDef): ProcPose {
    const p = this.player;
    const speed = Math.hypot(p.vel.x, p.vel.z);
    const want = p.sprinting || p.swimming || !p.grounded ? 0 : speed > 3.5 ? 0.55 : 1;
    this.holdW += (want - this.holdW) * 0.12;
    const two = twoHanded(d) && f.hold?.off !== undefined;
    if (p.blocking && f.guard && two) {
      const g = crossGuard(1);
      return { ...pose, ...g, leftFollows: { off: f.hold!.off!, w: 1 } };
    }
    if (!f.hold) return pose;
    const out: ProcPose = { ...pose, right: { ...f.hold.right, w: this.holdW } };
    if (two) out.leftFollows = { off: f.hold.off!, w: Math.max(0.35, this.holdW), slide: f.hold.slide };
    return out;
  }

  // ---- traits and school adapters on a hit ------------------------------------------------------
  private meleeBonus(t: Target) {
    const a = this.player.act;
    const off = a?.def.hit?.hand === 'off';
    const f = familyOf(off ? this.player.equip.offItem?.def : this.main);
    let mult = 1, crit = false;
    if ((this.cracked.get(t.id) ?? 0) > 0) mult *= 1.2;
    if (f?.backstab && this.behind(t)) {
      mult *= f.backstab;
      this.stats.backstabs++;
    }
    const o = this.takeOpening();
    if (o) {
      mult *= o.mult;
      if (o.kind === 'backstab' || o.kind === 'smash') crit = true;
      if (o.kind === 'smash') t.stunned = true;
    }
    return { mult, crit };
  }

  /** Is the player behind `t` (in its back half-circle)? */
  behind(t: Target) {
    const any = t as unknown as { yaw?: number; group?: THREE.Object3D; root?: THREE.Object3D };
    const yaw = typeof any.yaw === 'number' ? any.yaw : any.group?.rotation.y ?? any.root?.rotation.y;
    if (yaw === undefined) return false;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const toMe = this.player.pos.clone().sub(t.position).setY(0).normalize();
    return fwd.dot(toMe) < -0.35;
  }

  private onMeleeHit(t: Target, amount: number, action: string) {
    const p = this.player, rt = this.rt;
    const off = p.act?.def.hit?.hand === 'off';
    const w = off ? p.equip.offItem?.def : this.main;
    const f = familyOf(w);
    if (!f || !w) return;
    // A chain is consecutive hits less than 1.5 s apart.
    this.chain = this.chainT < 1.5 ? this.chain + 1 : 1;
    this.chainT = 0;
    const gale = this.school === 'gale' ? f.schools.gale : null;
    const bleed = (w.stats.bleed ?? 0) * (gale?.chainBleed ? 1 + gale.chainBleed * (this.chain - 1) : 1) + (this.buffs.has('oil') ? 4 : 0);
    if (bleed > 0 && t.alive) rt.bleed(t, bleed);
    if (f.id === 'mace') this.cracked.set(t.id, CRACK_TIME);
    if (gale) {
      // The skill runtime already gave 1 Flow; adjust to the family's rate.
      let extra = gale.flow - 1;
      if (gale.tipFlow && t.center.distanceTo(p.center) > 2.1) extra += gale.tipFlow;
      if (gale.stagger && t.alive) t.takeHit({ damage: 0, poise: (p.act?.def.hit?.poise ?? 20) * (gale.stagger - 1), dir: t.position.clone().sub(p.pos).setY(0).normalize(), at: t.center.clone(), crit: false, source: 'melee' });
      rt.flow = clamp(rt.flow + extra, 0, rt.flowMax);
    }
    void amount;
    void action;
  }

  // ---- Cross Style openings ----------------------------------------------------------------------
  private open(why: 'parry' | 'dodge') {
    if (this.school !== 'cross') return;
    const f = this.family ?? FAMILIES.sword;
    // One opening per dodge.
    if (why === 'dodge') {
      if (this.lastDodge === this.player.act) return;
      this.lastDodge = this.player.act;
    }
    this.opening = { left: OPENING_TIME, kind: f.schools.cross.opening, mult: f.schools.cross.mult };
  }
  /** Spend the opening, if one is ready (melee hits and shots call this). */
  takeOpening(): Opening | null {
    const o = this.opening;
    if (!o || o.left <= 0) return null;
    this.opening = null;
    this.stats.openingsTaken++;
    return o;
  }
  get openingReady() {
    return !!this.opening && this.opening.left > 0;
  }

  // ---- Boundary Style focus zone -------------------------------------------------------------------
  /** The zone radius for the family in hand (Boundary Style). */
  zoneRadius(f = this.family ?? FAMILIES.sword) {
    return f.schools.boundary.zone;
  }

  private updateZone(dt: number) {
    const p = this.player;
    const f = this.family ?? FAMILIES.sword;
    const b = f.schools.boundary;
    p.blockFacing = this.school === 'boundary' ? b.arc : 0.3;
    for (const [id, v] of this.zoneSeen) this.zoneSeen.set(id, v - dt);
    const guarding = this.school === 'boundary' && !p.dead && (p.blocking || (b.intercept === 'shot' && this.ranged.aiming) || (b.intercept === 'trap' && this.ranged.aiming));
    if (!guarding) return;
    const fwd = p.forward;
    for (const t of targets) {
      if (!t.alive || !t.lockable) continue;
      const to = t.position.clone().sub(p.pos).setY(0);
      const d = to.length();
      if (d > b.zone + t.radius || d < (b.inner ?? 0)) continue;
      if (d > 0.01 && to.normalize().dot(fwd) < b.arc) continue;
      if ((this.zoneSeen.get(t.id) ?? 0) > 0) continue;
      this.zoneSeen.set(t.id, ZONE_COOLDOWN);
      this.intercept(t, b.intercept, to);
    }
  }

  private intercept(t: Target, kind: FamilyDef['schools']['boundary']['intercept'], dir: THREE.Vector3) {
    const rt = this.rt, w = rt.weapon();
    this.stats.zoneIntercepts++;
    switch (kind) {
      case 'push':
      case 'ward':
        rt.hit(t, w * 0.25, { poise: 90, dir, source: 'melee' });
        if (kind === 'ward') rt.resolve = Math.min(100, rt.resolve + 6);
        break;
      case 'pull':
        rt.hit(t, w * 0.2, { poise: 70, dir: dir.clone().negate(), source: 'melee' });
        break;
      case 'stun':
        rt.hit(t, w * 0.2, { poise: 120, dir, source: 'melee', stun: true });
        break;
      case 'counter':
        rt.hit(t, w * 0.6, { poise: 30, dir, source: 'melee' });
        break;
      case 'trap':
        t.stunned = true;
        rt.hit(t, 1, { poise: 200, dir, source: 'melee', stun: true });
        break;
      case 'shot':
        this.ranged.loose(Math.max(0.6, this.ranged.draw));
        break;
      case 'block':
        rt.resolve = Math.min(100, rt.resolve + 3);
        break;
    }
    rt.vfx.ring(this.player.pos, 'steel', this.zoneRadius());
  }

  // ---- buffs from meals and elixirs -----------------------------------------------------------------
  /** Something was eaten or drunk (player.onConsume). */
  consume(def: ItemDef) {
    const b = def.buff;
    if (b) {
      const k = this.potency(def);
      const m: Record<string, number> = {};
      for (const [key, v] of Object.entries(b.m ?? {})) m[key] = v * k;
      this.buffs.set(b.id, { id: b.id, label: b.label, left: b.sec * (this.player.mods.duration ?? 1), m });
      this.toast(`${b.label} for ${Math.round(b.sec / 60) >= 1 ? Math.round(b.sec / 60) + ' min' : b.sec + ' s'}`);
    }
    if (def.id === 'emberBomb') {
      const p = this.player;
      const at = p.pos.clone().addScaledVector(p.forward, 4);
      this.rt.vfx.burst(at.clone().setY(at.y + 0.6), 'fire', 1.6, 6);
      this.rt.area(at, 3, 60 * this.potency(def), { poise: 90, fire: true });
    }
  }
  /** Crafted quality makes a buff stronger (the item's name carries it; stats already scale). */
  private potency(def: ItemDef) {
    const m = /^(Crude|Fine|Superior|Masterwork|Legendary) /.exec(def.name);
    const q = m ? ['Crude', 'Common', 'Fine', 'Superior', 'Masterwork', 'Legendary'].indexOf(m[1]) : 1;
    return 1 + 0.1 * (q - 1);
  }

  /** After the skill runtime wrote this step's modifiers: add buffs, the staff's focus, Gale casting. */
  private applyMods() {
    const p = this.player, m = p.mods as unknown as Record<string, number>;
    for (const b of this.buffs.values()) for (const [k, v] of Object.entries(b.m)) if (typeof m[k] === 'number') m[k] += v;
    const d = this.main, f = this.family;
    let cast = 1 + (d?.stats.focus ?? 0);
    if (f && this.school === 'gale' && f.schools.gale.castPerFlow) cast *= 1 + f.schools.gale.castPerFlow * this.rt.flow;
    if (this.opening && this.opening.kind === 'instantSpell') cast *= 3;
    p.mods.castSpeed *= cast;
    p.mods.dmgTaken = Math.max(0.05, p.mods.dmgTaken);
  }

  /** Bow draw time under Gale momentum. */
  drawTime(base: number) {
    const f = this.family;
    const per = this.school === 'gale' ? f?.schools.gale.drawPerFlow ?? 0 : 0;
    return base * Math.max(0.35, 1 - per * this.rt.flow);
  }

  // ---- per step ----------------------------------------------------------------------------------------
  update(dt: number) {
    this.time += dt;
    this.chainT += dt;
    if (this.opening) {
      this.opening.left -= dt;
      if (this.opening.left <= 0) this.opening = null;
    }
    for (const [id, v] of this.cracked) v - dt <= 0 ? this.cracked.delete(id) : this.cracked.set(id, v - dt);
    for (const [id, b] of this.buffs) {
      b.left -= dt;
      if (b.left <= 0) this.buffs.delete(id);
    }
    // Crossbow (Gale): dodging out of a reload after the string is back still loads it, and feeds Flow.
    const a = this.player.act;
    if (a?.def.roll && this.lastReload && this.lastReload.t > 0.9) {
      this.ranged.loaded = true;
      if (this.school === 'gale') this.rt.flow = Math.min(this.rt.flowMax, this.rt.flow + (this.family?.schools.gale.reloadFlow ?? 0));
      this.lastReload = null;
    }
    this.lastReload = a?.def.id === 'reload' ? a : a?.def.roll ? this.lastReload : null;
    this.updateZone(dt);
    this.applyMods();
  }
  private lastReload: { t: number } | null = null;

  /** Buffs for the HUD and the save. */
  list() {
    return [...this.buffs.values()].map((b) => ({ id: b.id, label: b.label, left: Math.round(b.left) }));
  }
  toJSON() {
    return [...this.buffs.values()].map((b) => ({ ...b }));
  }
  fromJSON(list?: Buff[]) {
    this.buffs.clear();
    for (const b of list ?? []) if (b.left > 0) this.buffs.set(b.id, { ...b });
  }
  reset() {
    this.buffs.clear();
    this.opening = null;
    this.cracked.clear();
    this.zoneSeen.clear();
  }
}
