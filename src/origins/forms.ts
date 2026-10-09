import * as THREE from 'three';
import { ACTIONS, type ActionDef, type Flair } from '../combat/actions';
import type { CombatMods } from '../combat/mods';
import type { Zone } from '../paths/skillFx';
import { afflictions } from '../combat/afflictions';
import type { Origins } from './origins';

// Transformations (docs/design/origins.md §6): Demon Form (you grow to 2.4 m,
// wreathed in fire, with a heavy moveset), Primal Rage (claws instead of a
// weapon, speed, every strike feeds you) and Heart of the Mountain (living
// stone: no damage, no stagger). Each scales or recolours the body, swaps the
// action set through the player's remapAction hook, and puts everything back
// when its timer runs out. Also the beastfolk Pounce, a sprint attack become
// a leap.

const F = (kind: Flair['kind'], from: number, to: number, amt: number): Flair => ({ kind, from, to, amt });

/** A stronger copy of an action (both its procedural and its clip timing). */
function variant(base: ActionDef, id: string, o: { dmg: number; poise: number; next?: string; speed?: number; stamina?: number; flair?: Flair[]; boost?: ActionDef['boost'] }): ActionDef {
  const hit = (h?: ActionDef['hit']) => (h ? { ...h, dmg: h.dmg * o.dmg, poise: h.poise + o.poise } : h);
  const ct = base.clipTiming ? { ...base.clipTiming, hit: hit(base.clipTiming.hit), combo: o.next && base.clipTiming.combo ? { ...base.clipTiming.combo, next: o.next } : base.clipTiming.combo, speed: (base.clipTiming.speed ?? 1) * (o.speed ?? 1) } : undefined;
  return {
    ...base, id, hit: hit(base.hit), stamina: o.stamina ?? base.stamina,
    combo: o.next && base.combo ? { ...base.combo, next: o.next } : base.combo,
    flair: o.flair ?? base.flair, boost: o.boost ?? base.boost, clipTiming: ct,
  };
}

Object.assign(ACTIONS, {
  // Demon Form: slower, heavier, everything staggers.
  demonSlash1: variant(ACTIONS.slash1, 'demonSlash1', { dmg: 1.7, poise: 60, next: 'demonSlash2', speed: 0.9, stamina: 12, flair: [F('lean', 0.2, 0.7, 0.2)] }),
  demonSlash2: variant(ACTIONS.slash2, 'demonSlash2', { dmg: 1.7, poise: 60, next: 'demonSlam', speed: 0.9, stamina: 12, flair: [F('lean', 0.2, 0.7, 0.2)] }),
  demonSlam: variant(ACTIONS.slash3, 'demonSlam', { dmg: 2.2, poise: 120, next: 'demonSlash1', speed: 0.85, stamina: 16, flair: [F('hop', 0.2, 0.55, 0.35), F('crouch', 0.5, 0.9, 0.15)] }),
  demonHeavy: variant(ACTIONS.heavy, 'demonHeavy', { dmg: 1.8, poise: 120, stamina: 22 }),
  // Primal Rage: quick claw swipes.
  clawSwipe1: variant(ACTIONS.slash1, 'clawSwipe1', { dmg: 0.85, poise: 5, next: 'clawSwipe2', speed: 1.35, stamina: 8 }),
  clawSwipe2: variant(ACTIONS.slash2, 'clawSwipe2', { dmg: 0.85, poise: 5, next: 'clawSwipe3', speed: 1.35, stamina: 8 }),
  clawSwipe3: variant(ACTIONS.slash3, 'clawSwipe3', { dmg: 1.1, poise: 15, next: 'clawSwipe1', speed: 1.3, stamina: 10, flair: [F('spin', 0.2, 0.7, 1)] }),
  // Pounce (beastfolk): the sprint attack as a long leap.
  pounce: variant(ACTIONS.sprintAttack, 'pounce', { dmg: 1.15, poise: 20, boost: { dist: 3.4, from: 0.05, to: 0.55 }, flair: [F('hop', 0.05, 0.6, 0.65), F('lean', 0.05, 0.6, 0.3)] }),
});

const DEMON_MOVES: Record<string, string> = { slash1: 'demonSlash1', slash2: 'demonSlash2', slash3: 'demonSlam', heavy: 'demonHeavy' };
const CLAW_MOVES: Record<string, string> = { slash1: 'clawSwipe1', slash2: 'clawSwipe2', slash3: 'clawSwipe3', heavy: 'clawSwipe3', sprintAttack: 'pounce' };

type FormId = 'demon' | 'rage' | 'stone';

export class Forms {
  /** seconds left in each running form */
  readonly left = new Map<FormId, number>();
  private aura: Zone | null = null;
  private tinted: { m: THREE.MeshStandardMaterial; c: THREE.Color; e: THREE.Color; ei: number }[] = [];
  private claws: THREE.Object3D[] = [];
  private scale = 1;

  constructor(private o: Origins) {
    o.player.remapAction = (id) => this.remap(id);
  }

  private get p() {
    return this.o.player;
  }
  on(f: FormId) {
    return (this.left.get(f) ?? 0) > 0;
  }

  /** Which action really plays for `id` right now. */
  remap(id: string) {
    if (this.on('demon')) return DEMON_MOVES[id] ?? id;
    if (this.on('rage')) return CLAW_MOVES[id] ?? id;
    if (id === 'sprintAttack' && this.o.origin === 'beastfolk') return 'pounce';
    return id;
  }

  demon(sec: number) {
    this.end('rage');
    this.left.set('demon', sec);
    this.scale = Math.max(1.15, 2.4 / (this.o.look.height || 1.8));
    this.tint(new THREE.Color(1, 0.75, 0.7), new THREE.Color(0xff3a10), 0.35);
    const p = this.p, rt = this.o.d.rt;
    this.aura = rt.vfx.zone({
      pos: p.pos.clone(), follow: () => p.pos, radius: 3, life: sec, style: 'fire', every: 0.8, motes: 50, circle: false,
      onTick: () => {
        for (const t of rt.vfx.near(p.pos, 3)) afflictions.burn(t, 10 + p.prog.level, 2);
      },
    });
    rt.vfx.pillar(p.pos, 'fire', 1.4, 8);
    this.o.d.cam.shake(0.4);
  }

  rage(sec: number) {
    this.end('demon');
    this.left.set('rage', sec);
    const rig = this.p.rig;
    const mat = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.5 });
    for (const side of ['Right', 'Left'] as const) {
      const g = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.2, 5), mat);
        c.position.set((i - 1) * 0.03, 0.1, 0.02);
        c.rotation.x = 0.25;
        c.castShadow = true;
        g.add(c);
      }
      rig.hands[side].socket.add(g);
      this.claws.push(g);
    }
    this.weaponsVisible(false);
    this.o.d.rt.vfx.burst(this.p.center, 'blood', 1, 5);
  }

  stone(sec: number) {
    this.left.set('stone', sec);
    this.tint(new THREE.Color(0.62, 0.6, 0.58), new THREE.Color(0x000000), 0, true);
    this.o.d.fx.dust(this.p.pos, 3);
    this.o.d.rt.vfx.ring(this.p.pos, 'steel', 6);
  }

  private weaponsVisible(v: boolean) {
    for (const s of ['main', 'off'] as const) {
      const m = this.p.equip.model(s);
      if (m) m.visible = v;
    }
  }

  /** Recolour the body's skin (and with `all`, everything it wears). */
  private tint(color: THREE.Color, emissive: THREE.Color, ei: number, all = false) {
    this.untint();
    this.p.char.model.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]) {
        if (!m?.color || (!all && !/regular|superhero|skin/i.test(m.name))) continue;
        this.tinted.push({ m, c: m.color.clone(), e: m.emissive?.clone() ?? new THREE.Color(), ei: m.emissiveIntensity ?? 1 });
        if (all) m.color.setRGB(color.r, color.g, color.b);
        else m.color.multiply(color);
        if (m.emissive) (m.emissive.copy(emissive), (m.emissiveIntensity = ei));
      }
    });
  }
  private untint() {
    for (const t of this.tinted) {
      t.m.color.copy(t.c);
      if (t.m.emissive) (t.m.emissive.copy(t.e), (t.m.emissiveIntensity = t.ei));
    }
    this.tinted = [];
  }

  end(f: FormId) {
    if (!this.left.has(f)) return;
    this.left.delete(f);
    if (f === 'demon') {
      this.scale = 1;
      this.untint();
      if (this.aura) this.aura.done = true;
      this.aura = null;
    } else if (f === 'rage') {
      for (const c of this.claws) c.removeFromParent();
      this.claws = [];
      this.weaponsVisible(true);
    } else if (f === 'stone') this.untint();
    // An action of the old moveset in progress finishes as it is.
  }

  endAll() {
    for (const f of [...this.left.keys()]) this.end(f);
    this.p.char.root.scale.setScalar(1);
  }

  update(dt: number, m: CombatMods) {
    for (const [f, v] of this.left) {
      if (v - dt <= 0) this.end(f);
      else this.left.set(f, v - dt);
    }
    if (this.on('demon')) {
      m.melee += 0.5;
      m.poise += 0.6;
      m.dmgTaken -= 0.2;
      m.hp += 40;
      this.p.poiseMul *= 2;
    }
    if (this.on('rage')) {
      m.moveSpeed += 0.3;
      m.attackSpeed += 0.3;
    }
    if (this.on('stone')) {
      m.dmgTaken = 0;
      this.p.staggerImmune = true;
    }
  }

  frame(dt: number) {
    const root = this.p.char.root;
    const s = root.scale.x + (this.scale - root.scale.x) * Math.min(1, dt * 5);
    root.scale.setScalar(Math.abs(s - this.scale) < 0.002 ? this.scale : s);
    if (this.on('rage')) this.weaponsVisible(false);
  }

  state() {
    return { forms: Object.fromEntries(this.left), scale: this.p.char.root.scale.x, claws: this.claws.length, tinted: this.tinted.length };
  }
}
