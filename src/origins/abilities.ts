import * as THREE from 'three';
import { events } from '../core/events';
import { afflictions } from '../combat/afflictions';
import { targets, type Target, type DefenceResult } from '../combat/targets';
import { physics } from '../physics/physics';
import { heightAt } from '../world/terrain';
import type { CombatMods } from '../combat/mods';
import { ORIGINS, type TreeTier } from './data';
import type { Origins } from './origins';

// Every origin ability (docs/design/origins.md §3, §6): the innate V ability
// each people starts with, and tiers 1 to 5 of the legendary trees. Actives
// cost what their tier says and go on V or the moves bar ("origin:<id>");
// passives are simply on once their tier is open. Flight is in flight.ts and
// the transformations (Demon Form, Primal Rage, stone skin) in forms.ts.

/** Enemies that have lost track of you (Moonveil) or fled (Savage Howl): the AIs check this. */
const fearful = new Map<Target, number>();
let veiled = false;
/** Should this enemy ignore the player right now? (enemy AIs: one line each) */
export function ignoresPlayer(t: unknown) {
  return veiled || (fearful.get(t as Target) ?? 0) > 0;
}

interface Mote { mesh: THREE.Mesh; vel: THREE.Vector3; target: Target | null; life: number; dmg: number }
interface Wolf { g: THREE.Group; legs: THREE.Object3D[]; pos: THREE.Vector3; yaw: number; bite: number; phase: number }

export class OriginAbilities {
  private cds = new Map<string, number>();
  /** running effects, seconds left */
  readonly buffs = new Map<string, number>();
  private marked = new Map<Target, number>();
  private motes: Mote[] = [];
  private wolves: Wolf[] = [];
  private dome: { at: THREE.Vector3; mesh: THREE.Mesh } | null = null;
  private banner: { at: THREE.Vector3; obj: THREE.Group } | null = null;
  private resolveCd = 0;
  private lastRoll: unknown = null;
  private brimT = 0;
  private bannerT = 0;
  private breathing = false;
  private breathT = 0;
  private veilMats: THREE.Material[] = [];

  constructor(private o: Origins) {
    const p = o.player;
    // Hero's Resolve (human, tier 2): wrap whatever already cheats death (the skill runtime's wards).
    const cheat = p.cheatDeath;
    p.cheatDeath = () => {
      if (cheat?.()) return true;
      if (this.o.origin === 'human' && this.o.legacy.open(1) && this.resolveCd <= 0) {
        this.resolveCd = 180;
        p.hp = 1;
        events.emit('originAbility', { origin: 'human', ability: "Hero's Resolve" });
        return true;
      }
      return false;
    };
    // Earthen Bulwark: shots from outside the dome stop at the stone.
    const defend = p.defend;
    p.defend = (att, facing): DefenceResult | null => {
      const d = this.dome;
      if (d && att.at && p.pos.distanceTo(d.at) < 3.6 && att.from.distanceTo(d.at) > 3.6) {
        this.o.d.fx.dust(att.at.clone(), 1);
        return 'blocked';
      }
      return defend?.(att, facing) ?? null;
    };
    // Hunter's Mark: marked prey takes 20% more from your blade.
    const bonus = p.meleeBonus;
    p.meleeBonus = (t) => {
      const b = bonus?.(t) ?? { mult: 1, crit: false };
      return (this.marked.get(t) ?? 0) > 0 ? { ...b, mult: b.mult * 1.2 } : b;
    };
    // Moonveil breaks when you strike.
    events.on('swing', () => this.buffs.delete('veil'));
    events.on('meleeHit', ({ amount }) => {
      if (this.buffs.has('rage') && !p.dead) p.hp = Math.min(p.maxHp, p.hp + amount * 0.15);
    });
  }

  private get p() {
    return this.o.player;
  }
  private get rt() {
    return this.o.d.rt;
  }

  // ---- what you have -------------------------------------------------------------------------
  tier(id: string): { t: TreeTier; i: number } | null {
    const def = ORIGINS[this.o.origin];
    if (def.innate.id === id) return { t: def.innate, i: -1 };
    const i = def.tree.findIndex((t) => t.id === id);
    return i >= 0 ? { t: def.tree[i], i } : null;
  }
  /** Is this ability yours right now (innate, or its tier open)? */
  owned(id: string) {
    const x = this.tier(id);
    return !!x && (x.i < 0 || this.o.legacy.open(x.i));
  }
  /** What V fires: the chosen tier, else the highest open active, else the innate. */
  slotted(): TreeTier {
    const def = ORIGINS[this.o.origin];
    const pick = this.o.legacy.save.slot;
    if (pick && this.owned(pick) && this.tier(pick)?.t.kind === 'active') return this.tier(pick)!.t;
    for (let i = def.tree.length - 1; i >= 0; i--) if (def.tree[i].kind === 'active' && this.o.legacy.open(i)) return def.tree[i];
    return def.innate;
  }
  cooldown(id: string) {
    return this.cds.get(id) ?? 0;
  }
  buff(k: string) {
    return (this.buffs.get(k) ?? 0) > 0;
  }

  /** Why this can't be used now, or null. */
  blocked(id: string): string | null {
    const x = this.tier(id), p = this.p;
    if (!x) return 'Not your people\'s gift';
    if (x.i >= 0 && !this.o.legacy.open(x.i)) return `Needs Legendary Hero ${x.i + 1}`;
    if (x.t.kind !== 'active') return 'Always on';
    if (p.dead) return 'busy';
    if (this.cooldown(id) > 0) return `${x.t.name}: ${Math.ceil(this.cooldown(id))} s`;
    const c = x.t.cost ?? {};
    if (c.stamina && p.stamina < c.stamina) return 'Not enough stamina';
    if (c.mana && p.mana < c.mana) return 'Not enough mana';
    if (c.hpPct && p.hp <= p.maxHp * (c.hpPct / 100) + 1) return 'Too wounded';
    if (c.energy && this.o.flight.energy < c.energy) return 'Not enough draconic energy';
    if (id === 'huntersMark' && !(p.lock?.alive ? p.lock : p.aimTarget(20))) return 'Look at your prey first';
    return null;
  }

  /** V. */
  pressV() {
    const t = this.slotted();
    const why = this.use(t.id);
    if (why && why !== 'busy') this.o.d.toast(why);
    return why;
  }

  /** Use an ability by id: pays its cost, starts its cooldown and does it. */
  use(id: string): string | null {
    const why = this.blocked(id);
    if (why) return why;
    const x = this.tier(id)!, p = this.p, c = x.t.cost ?? {};
    if (c.stamina) p.spendStamina(c.stamina);
    if (c.mana) p.mana -= c.mana;
    if (c.hpPct) p.hp -= p.maxHp * (c.hpPct / 100);
    if (c.energy) this.o.flight.energy -= c.energy;
    if (x.t.cd) this.cds.set(id, x.t.cd);
    this.fire(id);
    events.emit('originAbility', { origin: this.o.origin, ability: x.t.name });
    return null;
  }

  private fire(id: string) {
    const p = this.p, rt = this.rt, fx = this.o.d.fx;
    const at = p.pos.clone();
    switch (id) {
      // ---- innate --------------------------------------------------------------------
      case 'heroicAdaptation':
        p.mana = Math.min(p.maxMana, p.mana + 22);
        p.stamina = Math.min(p.maxStamina, p.stamina + 22);
        break;
      case 'elvenGrace':
        p.mana = Math.min(p.maxMana, p.mana + 30);
        rt.vfx.burst(p.center, 'gale', 0.6, 3);
        break;
      case 'stubborn':
        p.stamina = Math.min(p.maxStamina, p.stamina + 35);
        this.buffs.set('stubborn', 3);
        fx.dust(at, 1);
        break;
      case 'wildSprint':
        p.stamina = Math.min(p.maxStamina, p.stamina + 30);
        this.buffs.set('wildSprint', 5);
        break;
      case 'bloodRush':
        p.healOverTime(Math.max(10, p.maxHp * 0.08), 2.5);
        p.stamina = Math.min(p.maxStamina, p.stamina + 30);
        rt.vfx.burst(p.center, 'blood', 0.6, 3);
        break;
      case 'dragonBreath':
        this.breathe(6.5, 26 + p.prog.level * 2.5, 0.62, false);
        break;
      // ---- human ---------------------------------------------------------------------
      case 'rally':
        this.buffs.set('rally', 20);
        rt.vfx.ring(at, 'light', 9);
        rt.vfx.burst(p.center, 'light', 1, 6);
        break;
      case 'banner':
        this.plantBanner(at);
        break;
      case 'unbroken':
        this.buffs.set('unbroken', 12);
        rt.vfx.ring(at, 'steel', 5);
        break;
      case 'legendAwakened':
        this.buffs.set('legend', 20);
        rt.flow = rt.flowMax;
        rt.resolve = 100;
        p.stamina = p.maxStamina;
        p.mana = p.maxMana;
        rt.vfx.pillar(at, 'light', 1.6, 12);
        break;
      // ---- elf -----------------------------------------------------------------------
      case 'moonveil':
        this.buffs.set('veil', 4);
        rt.vfx.burst(p.center, 'frost', 0.8, 4);
        break;
      case 'starlightVolley':
        this.volley(5);
        break;
      case 'treeshape':
        this.buffs.set('treeshape', 6);
        p.healOverTime(p.maxHp * 0.3, 6);
        rt.vfx.groundCircle(at, 'wind', 3, 6);
        break;
      case 'grace':
        this.buffs.set('grace', 10);
        rt.vfx.burst(p.center, 'gale', 1, 6);
        break;
      // ---- dwarf ---------------------------------------------------------------------
      case 'bulwark':
        this.raiseDome(at);
        break;
      case 'mountainsWrath': {
        const dmg = rt.weapon() * 2.2 + 18;
        rt.area(at, 5, dmg, { poise: 170, source: 'melee' });
        rt.vfx.ring(at, 'steel', 10);
        fx.dust(at, 4);
        this.o.d.cam.shake(0.45);
        break;
      }
      case 'heartOfMountain':
        this.o.forms.stone(6);
        break;
      // ---- beastfolk -----------------------------------------------------------------
      case 'huntersMark': {
        const t = p.lock?.alive ? p.lock : p.aimTarget(20);
        if (t) {
          this.marked.set(t, 20);
          rt.vfx.groundCircle(t.position, 'blood', t.radius * 3 + 0.8, 1.5);
        }
        break;
      }
      case 'savageHowl':
        for (const t of rt.vfx.near(at, 9)) {
          fearful.set(t, 4);
          rt.hit(t, 2, { poise: 130, dir: t.position.clone().sub(at).setY(0).normalize() });
        }
        rt.vfx.ring(at, 'blood', 14);
        this.o.d.cam.shake(0.25);
        break;
      case 'packCall':
        this.callWolves();
        break;
      case 'primalRage':
        this.o.forms.rage(20);
        break;
      // ---- demon ---------------------------------------------------------------------
      case 'hellstep':
        this.hellstep();
        break;
      case 'bloodAwakening':
        this.buffs.set('bloodAwakening', 10);
        rt.vfx.burst(p.center, 'blood', 1, 5);
        break;
      case 'demonForm':
        this.o.forms.demon(25);
        break;
      // ---- dragonkin -----------------------------------------------------------------
      case 'fireBreath':
        this.breathing = true;
        this.breathT = 0;
        break;
    }
  }

  // ---- the effects ---------------------------------------------------------------------------

  /** A cone of fire from the mouth: once (Dragon Breath) or ticking while held (Fire Breath). */
  private breathe(range: number, dmg: number, cos: number, burn: boolean) {
    const p = this.p, rt = this.rt;
    const dir = this.o.flight.active ? this.o.d.cam.camera.getWorldDirection(new THREE.Vector3()) : p.forward;
    const flat = dir.clone().setY(0).normalize();
    const mouth = p.pos.clone().setY(p.pos.y + 1.55 * (p.char.root.scale.y || 1)).addScaledVector(flat, 0.3);
    // Fire Breath works from the air too: hit along the 3D cone.
    for (const t of targets) {
      if (!t.alive) continue;
      const to = t.center.clone().sub(mouth);
      const dd = to.length();
      if (dd > range + t.radius || dd < 0.01) continue;
      if (to.normalize().dot(dir) < cos) continue;
      if (!physics.lineOfSight(mouth, t.center, t.radius * 0.5)) continue;
      rt.hit(t, dmg, { poise: burn ? 12 : 35, fire: true, dir: flat });
      if (burn) afflictions.burn(t, 10 + p.prog.level, 3);
    }
    const n = burn ? 10 : 40;
    for (let i = 0; i < n; i++) {
      const v = dir.clone().multiplyScalar(range * (1.4 + Math.random())).add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.4) * 2, (Math.random() - 0.5) * 3));
      this.o.d.fx.add.spawn({ pos: mouth.clone(), vel: v, spread: 1, count: 1, life: [0.35, 0.55], size: [0.18, 0.7], color: 0xfff0b0, color2: 0xff3a00, drag: 1.2 });
    }
  }

  private plantBanner(at: THREE.Vector3) {
    this.clearBanner();
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a33, roughness: 0.9 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0x4f8fd0, roughness: 0.85, side: THREE.DoubleSide });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe0b040, roughness: 0.4, metalness: 0.6 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3, 8), wood);
    pole.position.y = 1.5;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.1, 6, 4), cloth);
    flag.position.set(0.42, 2.35, 0);
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 8), gold);
    finial.position.y = 3.1;
    const sun = new THREE.Mesh(new THREE.CircleGeometry(0.18, 16), gold);
    sun.position.set(0.42, 2.4, 0.01);
    g.add(pole, flag, finial, sun);
    g.traverse((c) => ((c as THREE.Mesh).isMesh && (c.castShadow = true)));
    g.position.copy(at);
    g.rotation.y = this.p.yaw;
    this.o.d.scene.add(g);
    this.banner = { at: at.clone(), obj: g };
    this.buffs.set('banner', 12);
    this.bannerT = 0;
    this.rt.vfx.groundCircle(at, 'light', 13, 12);
  }
  private clearBanner() {
    if (!this.banner) return;
    this.banner.obj.removeFromParent();
    this.banner.obj.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) (m.geometry.dispose(), (m.material as THREE.Material).dispose());
    });
    this.banner = null;
  }

  private raiseDome(at: THREE.Vector3) {
    this.clearDome();
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(3.5, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xa79a84, roughness: 1, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }),
    );
    m.position.copy(at);
    m.scale.y = 0.01;
    this.o.d.scene.add(m);
    this.dome = { at: at.clone(), mesh: m };
    this.buffs.set('bulwark', 8);
    this.o.d.fx.dust(at, 3);
  }
  private clearDome() {
    if (!this.dome) return;
    this.dome.mesh.removeFromParent();
    this.dome.mesh.geometry.dispose();
    (this.dome.mesh.material as THREE.Material).dispose();
    this.dome = null;
  }

  private volley(n: number) {
    const p = this.p, from = p.center.clone().setY(p.pos.y + 1.6);
    const foes = [...targets].filter((t) => t.alive && t.lockable && t.center.distanceTo(p.pos) < 22).sort((a, b) => a.center.distanceTo(p.pos) - b.center.distanceTo(p.pos));
    const geo = new THREE.SphereGeometry(0.11, 10, 8);
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.4, 3.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const mesh = new THREE.Mesh(i === 0 ? geo : geo, mat);
      mesh.position.copy(from);
      this.o.d.scene.add(mesh);
      const a = (i / n - 0.5) * 2.2;
      const out = p.forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), a).multiplyScalar(5).setY(3 + Math.random());
      this.motes.push({ mesh, vel: out, target: foes.length ? foes[i % foes.length] : null, life: 3, dmg: 12 + p.prog.level * 1.5 });
    }
  }

  private callWolves() {
    this.dismissWolves();
    const p = this.p;
    const glow = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x3a7ac0, emissiveIntensity: 0.9, transparent: true, opacity: 0.72, roughness: 0.6 });
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.6, 4, 8).rotateX(Math.PI / 2), glow);
      body.position.y = 0.55;
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 7).rotateX(Math.PI / 2), glow);
      head.position.set(0, 0.72, 0.55);
      const ears = [-1, 1].map((e) => {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 4), glow);
        ear.position.set(e * 0.08, 0.86, 0.45);
        return ear;
      });
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.45, 6).rotateX(-Math.PI / 2.6), glow);
      tail.position.set(0, 0.68, -0.52);
      const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([x, z]) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.45, 5).translate(0, -0.22, 0), glow);
        leg.position.set(x * 0.12, 0.47, z * 0.3);
        return leg;
      });
      g.add(body, head, ...ears, tail, ...legs);
      const pos = p.pos.clone().add(new THREE.Vector3(Math.cos(p.yaw) * s * 1.6, 0, -Math.sin(p.yaw) * s * 1.6));
      pos.y = heightAt(pos.x, pos.z);
      g.position.copy(pos);
      this.o.d.scene.add(g);
      this.wolves.push({ g, legs, pos, yaw: p.yaw, bite: 0.5, phase: Math.random() * 6 });
      this.rt.vfx.burst(pos.clone().setY(pos.y + 0.6), 'frost', 0.6, 2);
    }
    this.buffs.set('pack', 30);
  }
  private dismissWolves() {
    for (const w of this.wolves) {
      this.rt.vfx.burst(w.pos.clone().setY(w.pos.y + 0.6), 'frost', 0.4, 2);
      w.g.removeFromParent();
      w.g.traverse((c) => (c as THREE.Mesh).isMesh && (c as THREE.Mesh).geometry.dispose());
    }
    this.wolves = [];
  }

  private hellstep() {
    const p = this.p, rt = this.rt;
    const tgt = p.lock?.alive ? p.lock : null;
    const dir = tgt ? tgt.position.clone().sub(p.pos).setY(0).normalize() : p.forward;
    const from = p.center.clone();
    const hit = physics.castRay(from, dir, 7.4);
    const dist = Math.max(0, hit === null ? 7 : hit - 0.6);
    const to = p.pos.clone().addScaledVector(dir, dist);
    const g = heightAt(to.x, to.z);
    if (to.y < g) to.y = g;
    const a = p.pos.clone();
    for (const t of targets) {
      if (!t.alive) continue;
      const u = Math.max(0, Math.min(1, t.position.clone().sub(a).dot(dir) / Math.max(0.01, dist)));
      const closest = a.clone().addScaledVector(dir, dist * u);
      if (closest.distanceTo(t.position.clone().setY(a.y)) > 1.4 + t.radius) continue;
      rt.hit(t, rt.weapon() * 1.4 + 10, { fire: true, poise: 60, dir });
      afflictions.burn(t, 8, 3);
    }
    for (let i = 0; i <= 8; i++) this.o.d.fx.add.spawn({ pos: a.clone().addScaledVector(dir, (dist * i) / 8).setY(a.y + 1), spread: 1.5, count: 6, life: [0.3, 0.6], size: [0.3, 0.05], color: 0xffd0a0, color2: 0xff3000, upBias: 1 });
    const yaw = p.yaw;
    p.teleport(to);
    p.yaw = yaw;
  }

  private blink(dir: THREE.Vector3) {
    const p = this.p, rt = this.rt;
    const from = p.pos.clone();
    const hit = physics.castRay(p.center, dir, 5.6);
    const dist = Math.max(0, hit === null ? 5 : hit - 0.6);
    if (dist < 0.5) return;
    const to = from.clone().addScaledVector(dir, dist);
    to.y = Math.max(to.y, heightAt(to.x, to.z));
    const yaw = p.yaw;
    p.teleport(to);
    p.yaw = yaw;
    // The afterimage bursts where you stood.
    rt.vfx.burst(from.clone().setY(from.y + 1), 'gale', 0.8, 2);
    rt.later(0.3, () => {
      rt.area(from, 2.6, 14 + p.prog.level * 1.5, { poise: 40 });
      rt.vfx.ring(from, 'gale', 5);
    });
  }

  // ---- every step ------------------------------------------------------------------------
  update(dt: number, m: CombatMods) {
    const p = this.p, o = this.o.origin, legacy = this.o.legacy;
    for (const [k, v] of this.cds) v - dt <= 0 ? this.cds.delete(k) : this.cds.set(k, v - dt);
    for (const [k, v] of this.buffs) {
      if (v - dt > 0) this.buffs.set(k, v - dt);
      else this.buffs.delete(k);
    }
    for (const [t, v] of this.marked) (v - dt <= 0 || !t.alive ? this.marked.delete(t) : this.marked.set(t, v - dt));
    for (const [t, v] of fearful) (v - dt <= 0 || !t.alive ? fearful.delete(t) : fearful.set(t, v - dt));
    this.resolveCd = Math.max(0, this.resolveCd - dt);
    veiled = this.buff('veil');
    p.veiled = veiled;

    // Buffs into the combat modifiers.
    if (this.buff('stubborn') || this.buff('unbroken')) p.staggerImmune = true;
    if (this.buff('wildSprint')) m.moveSpeed += 0.25;
    if (this.buff('rally')) (m.melee += 0.15), (m.dmgTaken -= 0.1);
    if (this.buff('legend')) {
      m.melee += 0.25;
      m.spell += 0.25;
      m.moveSpeed += 0.25;
      m.attackSpeed += 0.25;
      m.dmgTaken -= 0.25;
    }
    if (this.buff('bloodAwakening')) m.melee += 0.4;
    if (this.buff('treeshape')) (m.moveSpeed = 0), (m.dmgTaken -= 0.4);
    // Passive tiers.
    if (o === 'dwarf' && legacy.open(2)) m.dmgTaken -= 0.1; // Runeheart, until runes exist
    if (o === 'dwarf' && legacy.open(3) && p.sprinting && this.o.d.mode() === 'dungeon') p.stamina = Math.min(p.maxStamina, p.stamina + 13 * dt);
    if (o === 'demon' && legacy.open(2)) m.dmgTaken -= 0.4 * (1 - p.hp / Math.max(1, p.maxHp));
    if (o === 'demon' && legacy.open(3)) {
      this.brimT += dt;
      if (this.brimT >= 1) {
        this.brimT = 0;
        for (const t of this.rt.vfx.near(p.pos, 3.5)) afflictions.burn(t, 6 + p.prog.level * 0.5, 1.6);
      }
    }
    // Wind-Walker (elf, tier 4): dodge in mid-air to dash.
    if (o === 'elf' && legacy.open(3) && !p.grounded && !p.swimming && !this.o.flight.active && this.o.d.input.wasPressed('dodge') && !this.buff('airDash')) {
      const dir = p.moveIntent.lengthSq() > 0 ? p.moveIntent.clone() : p.forward;
      p.vel.x = dir.x * 13;
      p.vel.z = dir.z * 13;
      p.vel.y = Math.max(p.vel.y, 2.5);
      this.buffs.set('airDash', 0.6);
      this.rt.vfx.burst(p.center, 'gale', 0.5, 3);
    }
    // Grace of the Ancients: every new dodge blinks.
    const a = p.act;
    if (a?.def.roll && a !== this.lastRoll && this.buff('grace')) this.blink(a.rollDir ?? p.forward);
    this.lastRoll = a?.def.roll ? a : null;
    // The banner: heal inside, enemies falter.
    if (this.banner) {
      if (!this.buff('banner')) this.clearBanner();
      else {
        this.bannerT += dt;
        if (p.pos.distanceTo(this.banner.at) < 6.5 && !p.dead) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.03 * dt);
        if (this.bannerT >= 2) {
          this.bannerT = 0;
          for (const t of this.rt.vfx.near(this.banner.at, 6.5)) this.rt.hit(t, 3, { poise: 60, dir: t.position.clone().sub(this.banner.at).setY(0).normalize() });
        }
      }
    }
    if (this.dome && !this.buff('bulwark')) this.clearDome();
    // Fire Breath: channelled while V is held.
    if (this.breathing) {
      const fl = this.o.flight;
      if (!this.o.d.input.held('originAbility') || fl.energy <= 0 || p.dead || o !== 'dragonkin') this.breathing = false;
      else {
        fl.energy = Math.max(0, fl.energy - 22 * dt);
        this.breathT -= dt;
        if (this.breathT <= 0) {
          this.breathT = 0.25;
          this.breathe(9, 9 + p.prog.level * 1.2, 0.8, true);
        }
      }
    }
    this.updateMotes(dt);
    this.updateWolves(dt);
  }

  private updateMotes(dt: number) {
    for (const m of this.motes) {
      m.life -= dt;
      const t = m.target?.alive ? m.target : null;
      if (t) {
        const want = t.center.clone().sub(m.mesh.position).normalize().multiplyScalar(16);
        m.vel.lerp(want, Math.min(1, dt * 5));
        if (m.mesh.position.distanceTo(t.center) < t.radius + 0.25) {
          this.rt.hit(t, m.dmg, { poise: 15 });
          this.rt.vfx.burst(m.mesh.position.clone(), 'frost', 0.3, 2);
          m.life = 0;
        }
      } else m.vel.y -= 2 * dt;
      m.mesh.position.addScaledVector(m.vel, dt);
      if (Math.random() < dt * 30) this.o.d.fx.add.spawn({ pos: m.mesh.position.clone(), spread: 0.2, count: 1, life: [0.2, 0.4], size: [0.1, 0.01], color: 0xffffff, color2: 0x8ab8ff });
    }
    for (const m of this.motes.filter((x) => x.life <= 0)) {
      m.mesh.removeFromParent();
      (m.mesh.material as THREE.Material).dispose();
    }
    this.motes = this.motes.filter((x) => x.life > 0);
  }

  private updateWolves(dt: number) {
    if (!this.wolves.length) return;
    if (!this.buff('pack')) return this.dismissWolves();
    const p = this.p;
    this.wolves.forEach((w, i) => {
      w.bite -= dt;
      let best: Target | null = null, bd = 22;
      for (const t of targets) {
        if (!t.alive || !t.lockable) continue;
        const d = t.position.distanceTo(w.pos);
        if (d < bd) (bd = d), (best = t);
      }
      const goal = best ? best.position : p.pos.clone().add(new THREE.Vector3(Math.cos(p.yaw) * (i ? 1.8 : -1.8), 0, -Math.sin(p.yaw) * (i ? 1.8 : -1.8)));
      const to = goal.clone().sub(w.pos).setY(0);
      const d = to.length();
      const reach = best ? best.radius + 0.9 : 0.6;
      let speed = 0;
      if (d > reach) {
        speed = Math.min(d * 3, best ? 7.5 : d > 6 ? 8 : 4.5);
        w.pos.addScaledVector(to.normalize(), speed * dt);
      }
      if (d > 0.05) w.yaw = Math.atan2(to.x, to.z);
      if (best && d <= reach + 0.2 && w.bite <= 0) {
        w.bite = 1.1;
        this.rt.hit(best, 10 + p.prog.level * 1.2, { poise: 25, source: 'melee' });
      }
      w.pos.y = heightAt(w.pos.x, w.pos.z);
      if (w.pos.distanceTo(p.pos) > 40) w.pos.copy(p.pos);
      w.phase += dt * (2 + speed * 1.6);
      w.g.position.copy(w.pos);
      w.g.position.y += Math.abs(Math.sin(w.phase)) * 0.05 * Math.min(1, speed);
      w.g.rotation.y = w.yaw;
      w.legs.forEach((l, k) => (l.rotation.x = Math.sin(w.phase + (k % 2 === (k < 2 ? 0 : 1) ? 0 : Math.PI)) * 0.6 * Math.min(1, speed / 3)));
    });
  }

  /** Per frame: the veil's fade, the dome rising. */
  frame(dt: number) {
    const veil = this.buff('veil');
    const mats = this.veilMats;
    if (veil && !mats.length) {
      this.p.char.root.traverse((c) => {
        const m = (c as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (!(c as THREE.Mesh).isMesh || !m) return;
        for (const x of Array.isArray(m) ? m : [m]) {
          x.userData.veil = { t: x.transparent, o: x.opacity };
          x.transparent = true;
          x.opacity = 0.28;
          mats.push(x);
        }
      });
    } else if (!veil && mats.length) {
      for (const x of mats) {
        x.transparent = x.userData.veil.t;
        x.opacity = x.userData.veil.o;
        delete x.userData.veil;
      }
      this.veilMats = [];
    }
    if (this.dome) this.dome.mesh.scale.y = Math.min(1, this.dome.mesh.scale.y + dt * 4);
    if (this.banner) {
      const flag = this.banner.obj.children[1] as THREE.Mesh;
      flag.rotation.y = Math.sin(performance.now() / 300) * 0.15;
    }
  }

  reset() {
    this.cds.clear();
    this.buffs.clear();
    this.marked.clear();
    fearful.clear();
    veiled = false;
    this.p.veiled = false;
    this.resolveCd = 0;
    this.breathing = false;
    this.clearBanner();
    this.clearDome();
    this.dismissWolves();
    for (const m of this.motes) m.mesh.removeFromParent();
    this.motes = [];
    this.frame(0);
  }

  /** For tests and the HUD. */
  state() {
    return { cds: Object.fromEntries(this.cds), buffs: Object.fromEntries(this.buffs), marked: this.marked.size, fearful: fearful.size, wolves: this.wolves.length, motes: this.motes.length, dome: !!this.dome, banner: !!this.banner, breathing: this.breathing, resolveCd: this.resolveCd };
  }
}
