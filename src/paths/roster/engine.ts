import * as THREE from 'three';
import { events } from '../../core/events';
import type { CombatMods } from '../../combat/mods';
import type { Target } from '../../combat/targets';
import type { HitOpts, SkillRuntime, Status } from '../skills';
import { DISC } from '../data';
import { FORGE_HOOKS } from '../classes/forge';
import type { NumMod } from '../effects';
import { ROSTER, ROSTER_BY_ID } from './index';
import type { ClassSpec, FieldKind, Trigger } from './types';

// The roster's engine: runs every roster class's mechanic (types.ts) while
// that class is in play. A combat class is in play while it is your active
// class (or, at half, your second); a magic class once you've learned it.
// Passive `x` keys are per class: "<id>.gain", "<id>.full" and so on.

interface ResState { v: number; idle: number; ready: boolean }

/** What the engine needs from the rest of the game (main.ts fills these in). */
export const ROSTER_HOOKS: {
  summon?: (kind: 'skeleton' | 'beast' | 'drowned' | 'wolf' | 'watchman', n: number, sec: number, dmg: number) => void;
  signal?: (id: string) => void;
  toast?: (msg: string) => void;
  /** the player's origin (human, elf, dwarf...) */
  origin?: () => string;
} = {};

export class RosterEngine {
  private res = new Map<string, ResState>();
  private originT = 0;
  private strideT = 0;
  private calm = false;

  constructor(private rt: SkillRuntime) {
    FORGE_HOOKS.gain = (disc, n) => this.add(disc, n, true);
    FORGE_HOOKS.spend = (disc, n) => this.spend(disc, n);
    FORGE_HOOKS.mark = (disc, t, n) => this.mark(disc, t, n);
    FORGE_HOOKS.res = (disc) => ROSTER_BY_ID[disc]?.mech.res;
    FORGE_HOOKS.markName = (disc) => ROSTER_BY_ID[disc]?.mech.mark?.name;
    events.on('perfectDodge', () => this.trigger('dodge'));
    events.on('parrySuccess', () => this.trigger('parry'));
    events.on('blockImpact', ({ guardBroken }) => !guardBroken && this.trigger('block'));
    events.on('playerDamaged', ({ blocked }) => !blocked && this.trigger('hurt'));
    events.on('shotHit', ({ target }) => this.onShot(target));
  }

  private get p() {
    return this.rt['player'];
  }
  private x(id: string, k: string) {
    return this.rt.x(`${id}.${k}`);
  }
  /** How much a class counts right now (0: not in play). */
  weight(id: string) {
    const P = this.rt.paths, s = ROSTER_BY_ID[id];
    if (!s || s.noEngine || !P.learned(id)) return 0;
    if (s.fam === 'magic') return 1;
    return P.active === id ? 1 : P.secondary === id ? 0.5 : 0;
  }
  private live() {
    return ROSTER.filter((s) => this.weight(s.id) > 0);
  }
  private st(id: string) {
    let r = this.res.get(id);
    if (!r) this.res.set(id, (r = { v: 0, idle: 0, ready: false }));
    return r;
  }
  max(id: string) {
    return (ROSTER_BY_ID[id]?.mech.max ?? 100) + this.x(id, 'max');
  }
  value(id: string) {
    return this.res.get(id)?.v ?? 0;
  }
  ready(id: string) {
    return !!this.res.get(id)?.ready;
  }
  set(id: string, v: number) {
    const r = this.st(id);
    r.v = Math.max(0, Math.min(this.max(id), v));
    r.ready = r.v >= this.max(id) && !!ROSTER_BY_ID[id]?.mech.full;
  }

  reset() {
    this.res.clear();
  }

  /** Add to a class's resource (passives speed it up; a second class gains at half). */
  add(id: string, n: number, raw = false) {
    const s = ROSTER_BY_ID[id], w = this.weight(id);
    if (!s || !w || n <= 0) return;
    const r = this.st(id);
    r.idle = 0;
    r.v = Math.min(this.max(id), r.v + (raw ? n : n * w * (1 + this.x(id, 'gain'))));
    if (r.v >= this.max(id) && s.mech.full) {
      if (s.mech.full.when === 'auto') this.release(s, null);
      else r.ready = true;
    }
  }

  /** Spend for a technique: returns the damage multiplier bought. */
  spend(id: string, n: number | 'all') {
    const r = this.res.get(id);
    if (!r || r.v <= 0) return 1;
    if (n === 'all') {
      const k = 1 + r.v / this.max(id);
      r.v = 0;
      r.ready = false;
      return k;
    }
    if (r.v < n) return 1;
    r.v -= n;
    r.ready = false;
    return 1.5;
  }

  // ---- triggers ------------------------------------------------------------------------
  private wielding(s: ClassSpec) {
    const want = s.mech.weapon;
    if (!want?.length) return true;
    const k = this.p.equip.mainWeapon?.def.kind ?? '';
    return want.includes(k);
  }

  /** Something happened: feed every class in play that wants it, and count trials. */
  private trigger(t: Trigger, target?: Target) {
    for (const s of this.live()) {
      const g = s.mech.gain[t];
      if (g && (t === 'kill' || t === 'hurt' || t === 'dodge' || t === 'parry' || t === 'block' || t === 'cast' || this.wielding(s))) this.add(s.id, g);
      if (target && s.mech.mark?.on === t && this.wielding(s)) this.mark(s.id, target, 1);
    }
    // Trials count the thing done with the right weapon, before the class is learned.
    for (const s of ROSTER) {
      if (s.trial?.on === t && !this.rt.paths.learned(s.id) && this.wielding(s)) ROSTER_HOOKS.signal?.(`trial-${s.id}`);
    }
  }

  /** A blow with a weapon (the player's own swing). */
  onMeleeHit(t: Target, crit: boolean, action: string) {
    const p = this.p;
    this.trigger('hit', t);
    if (/heavy|charge/i.test(action)) this.trigger('heavy', t);
    if (crit) this.trigger('crit', t);
    if (!p.grounded) this.trigger('air', t);
    if (t.yaw !== undefined) {
      const face = new THREE.Vector3(Math.sin(t.yaw), 0, Math.cos(t.yaw));
      const toMe = p.pos.clone().sub(t.position).setY(0).normalize();
      if (face.dot(toMe) < -0.3) this.trigger('back', t);
    }
    this.releaseOn(t, (s) => s.fam === 'combat' && !s.mech.gain.shot && this.wielding(s));
  }

  private onShot(t: Target) {
    this.trigger('shot', t);
    this.releaseOn(t, (s) => !!s.mech.gain.shot);
  }

  /** A technique's hit (the forge tags its discipline). */
  onHit(t: Target, _dmg: number, o: HitOpts) {
    if (o.kit || !o.disc) return;
    const s = ROSTER_BY_ID[o.disc];
    if (!s || !this.weight(s.id)) return;
    const g = s.mech.gain.spell;
    if (g) this.add(s.id, g);
    if (s.mech.mark?.on === 'spell') this.mark(s.id, t, 1);
    if (s.fam === 'magic') this.releaseOn(t, (x) => x.id === s.id);
  }

  onUse(key: string) {
    const id = key.split(':')[0], s = ROSTER_BY_ID[id];
    if (!s || !this.weight(id)) return;
    if (s.mech.gain.cast) this.add(id, s.mech.gain.cast);
    if (s.mech.castHp) {
      const p = this.p;
      p.hp = Math.max(1, p.hp - p.maxHp * s.mech.castHp);
      this.rt.vfx.burst(p.center, 'blood', 0.5, 2);
    }
  }

  onKill(at: THREE.Vector3, st: Status | undefined) {
    this.trigger('kill');
    for (const s of this.live()) {
      const k = this.x(s.id, 'kill');
      if (k) this.add(s.id, k, true);
      const rz = s.mech.raise;
      if (rz && Math.random() < rz.chance * (1 + this.x(s.id, 'raise'))) {
        ROSTER_HOOKS.summon?.(rz.ally, 1, 12, this.dmg(s, rz.d));
        this.rt.vfx.pillar(at, rz.ally === 'skeleton' ? 'shadow' : rz.ally === 'drowned' ? 'frost' : 'nature', 0.6, 3);
      }
    }
    void st;
  }

  // ---- marks -------------------------------------------------------------------------
  mark(id: string, t: Target, n: number) {
    const s = ROSTER_BY_ID[id], m = s?.mech.mark;
    if (!m || !t.alive) return;
    const st = this.rt.st(t);
    st.marks ??= {};
    const cur = st.marks[id] ?? { n: 0, left: 0 };
    cur.n += n;
    cur.left = (m.time ?? 8) + this.x(id, 'markTime');
    st.marks[id] = cur;
    const at = Math.max(2, m.at - Math.round(this.x(id, 'markAt')));
    this.rt.vfx.fx.add.spawn({ pos: t.center.clone().setY(t.center.y + (t.halfHeight ?? 0.5) + 0.4), spread: 0.5, count: 3 + cur.n * 2, life: [0.3, 0.6], size: [0.16, 0.02], color: 0xffffff, color2: this.rt.vfx.color(m.style), jitter: 0.2 });
    if (cur.n < at) return;
    delete st.marks[id];
    const p = this.p, k = 1 + this.x(id, 'markBurst');
    switch (m.burst) {
      case 'blast':
        this.rt.area(t.position, 3, this.dmg(s, s.fam === 'combat' ? 120 : 30) * k, { poise: 120, kit: true, school: m.style, disc: id, source: s.fam === 'combat' ? 'melee' : 'spell' });
        this.rt.vfx.nova(t.position, m.style, 3);
        break;
      case 'stun':
        this.rt.hit(t, 1, { poise: 200, stun: true, kit: true, noVerdict: true });
        this.rt.vfx.ring(t.position, m.style, 3);
        break;
      case 'root':
        this.rt.hit(t, 1, { poise: 120, stun: true, kit: true, noVerdict: true });
        this.rt.vfx.groundCircle(t.position, m.style, t.radius * 3 + 0.6, 2);
        break;
      case 'bleed':
        this.rt.bleed(t, this.dmg(s, 40) * k);
        this.rt.vfx.burst(t.center, 'blood', 0.8, 3);
        break;
      case 'execute': {
        const kill = !t.boss && t.hp < t.maxHp * 0.25;
        this.rt.hit(t, kill ? t.hp + 9999 : this.dmg(s, 150) * k, { poise: 200, kit: true, crit: true, school: m.style, disc: id, source: s.fam === 'combat' ? 'melee' : 'spell' });
        this.rt.vfx.slash(t.center, p.yaw, 1.8, m.style, 1, 1.2);
        break;
      }
    }
  }

  /** Damage at a share: % of weapon damage for combat classes, spell base for magic. */
  private dmg(s: ClassSpec, d: number) {
    return s.fam === 'combat' ? this.rt.weapon() * (d / 100) : d * this.rt.paths.spellPower * this.p.mods.spell;
  }

  // ---- the release ---------------------------------------------------------------------
  private releaseOn(t: Target, which: (s: ClassSpec) => boolean) {
    for (const s of this.live()) {
      const r = this.res.get(s.id);
      if (r?.ready && s.mech.full?.when === 'next' && which(s)) this.release(s, t);
    }
  }

  release(s: ClassSpec, t: Target | null) {
    const f = s.mech.full!, r = this.st(s.id), p = this.p, V = this.rt.vfx;
    r.v = 0;
    r.ready = false;
    const k = 1 + this.x(s.id, 'full');
    const at = t ? t.position.clone() : p.pos.clone();
    const src = s.fam === 'combat' ? 'melee' : 'spell';
    const hitO = { poise: 150, kit: true, school: f.style, disc: s.id, source: src } as HitOpts;
    const rider = (list: Target[]) => {
      for (const h of list) {
        if (!h.alive) continue;
        if (f.fx === 'burn') this.rt.burn(h, 2);
        else if (f.fx === 'bleed' || f.fx === 'venom') this.rt.bleed(h, this.dmg(s, 20));
        else if (f.fx === 'brand') this.rt.brand(h);
        else if (f.fx === 'chill') this.rt.kits.chill(h, this.rt.st(h), 2);
        else if (f.fx === 'curse') this.rt.st(h).curse = 6;
        else if (f.fx === 'mark') this.mark(s.id, h, 1);
        else if (f.fx === 'stun' || f.fx === 'root') h.stunned = true;
      }
    };
    switch (f.kind) {
      case 'blast': {
        const rad = (f.r ?? 3.5) + this.x(s.id, 'fullR');
        rider(this.rt.area(at, rad, this.dmg(s, f.d ?? 120) * k, { ...hitO, pull: f.fx === 'pull' }));
        V.nova(at, f.style, rad);
        V.pillar(at, f.style, 0.9, 6);
        p.onShake?.(0.35);
        break;
      }
      case 'buff':
        this.rt.addBuff(`${s.id}:full`, (f.t ?? 8) * p.mods.duration);
        V.aura(() => p.pos, f.style, 1.2, f.t ?? 8);
        V.nova(p.pos, f.style, 4);
        break;
      case 'heal':
        p.heal(p.maxHp * ((f.d ?? 20) / 100) * k);
        V.pillar(p.pos, f.style, 0.9, 6);
        break;
      case 'volley': {
        const from = p.center.clone().setY(p.center.y + 0.4);
        const foes = V.near(p.pos, 22).slice(0, f.n ?? 5);
        foes.forEach((h, i) => this.rt.later(i * 0.06, () => V.projectile({
          from: from.clone(), dir: h.center.clone().sub(from).normalize(), speed: 34, range: 26, style: f.style, shape: 'spear', size: 0.8, radius: 0.5,
          onHit: (x) => {
            this.rt.hit(x, this.dmg(s, f.d ?? 60) * k, hitO);
            rider([x]);
          },
        })));
        break;
      }
      case 'chain': {
        let cur: Target | null = t ?? this.rt.nearestEnemy(p.center, 16), from = p.center.clone();
        const seen = new Set<number>();
        for (let i = 0; i < (f.n ?? 5) && cur; i++) {
          const h: Target = cur, a = from.clone(), b = h.center.clone();
          seen.add(h.id);
          this.rt.later(i * 0.08, () => {
            V.lightning(a, b, f.style, 1.3);
            if (!h.alive) return;
            this.rt.hit(h, this.dmg(s, f.d ?? 80) * k, hitO);
            rider([h]);
          });
          from = b;
          cur = this.rt.nearestEnemy(b, 9, seen);
        }
        break;
      }
      case 'summon':
        ROSTER_HOOKS.summon?.(f.ally ?? 'beast', f.n ?? 2, (f.t ?? 15) * p.mods.duration, this.dmg(s, f.d ?? 40) * k);
        V.nova(p.pos, f.style, 4);
        break;
      case 'execute': {
        if (!t) break;
        const kill = !t.boss && t.hp < t.maxHp * 0.25;
        this.rt.hit(t, kill ? t.hp + 9999 : this.dmg(s, f.d ?? 200) * k, { ...hitO, crit: true });
        V.slash(t.center, p.yaw, 2.2, f.style, 1.2, 1.4);
        V.burst(t.center, f.style, 1.2, 5);
        p.onHitStop?.(0.12);
        break;
      }
    }
    const heal = this.x(s.id, 'fullHeal');
    if (heal) p.heal(p.maxHp * heal);
  }

  // ---- every step ----------------------------------------------------------------------
  update(dt: number) {
    const P = this.rt.paths;
    for (const s of ROSTER) {
      const r = this.res.get(s.id);
      if (!this.weight(s.id)) {
        if (r) (r.v = 0), (r.ready = false);
        continue;
      }
      const m = s.mech;
      if (m.regen) this.add(s.id, m.regen * dt);
      if (!r) continue;
      r.idle += dt;
      if (m.decay !== 0 && !m.regen && r.idle > 4 && r.v > 0) {
        r.v = Math.max(0, r.v - (m.decay ?? this.max(s.id) * 0.06) * dt * (1 - Math.min(0.9, this.x(s.id, 'decay'))));
        if (r.v < this.max(s.id)) r.ready = false;
      }
    }
    this.look(dt);
    // Field: a long stride when nothing hostile is near.
    if ((this.strideT -= dt) <= 0) {
      this.strideT = 0.5;
      this.calm = this.rt.vfx.near(this.p.pos, 25).length === 0;
    }
    // Origin classes wake in the blood of their people (Legendary Hero level 2).
    if ((this.originT -= dt) <= 0) {
      this.originT = 2;
      for (const s of ROSTER) {
        if (s.tier !== 'origin' || P.learned(s.id) || !P.canTeach(s.id)) continue;
        if (P.teach(s.id)) ROSTER_HOOKS.toast?.(`The blood of your people wakes: you have learned ${s.name}. Open Skills (K).`);
      }
    }
  }

  private lookT = 0;
  /**
   * The class you can see: sparks gather at your weapon hand as your class's
   * resource fills, and an aura of its colour wraps you when it is full.
   */
  private look(dt: number) {
    if ((this.lookT -= dt) > 0) return;
    this.lookT = 0.06;
    const p = this.p;
    if (p.dead) return;
    for (const s of this.live()) {
      const r = this.res.get(s.id);
      if (!r) continue;
      const fill = r.v / this.max(s.id), color = parseInt(s.mech.color.slice(1), 16);
      if (r.ready || (fill >= 1 && !s.mech.full)) {
        this.rt.vfx.fx.add.spawn({ pos: p.pos.clone().setY(p.pos.y + 0.2), spread: 0.9, count: 3, life: [0.6, 1.1], size: [0.18, 0.03], color, color2: color, upBias: 2.2, jitter: 0.6 });
      } else if (fill > 0.3 && Math.random() < fill) {
        this.rt.vfx.fx.add.spawn({ pos: this.rt.hand(), spread: 0.2, count: 1, life: [0.25, 0.5], size: [0.09, 0.01], color: 0xffffff, color2: color, upBias: 0.6, jitter: 0.12 });
      }
      if (this.weight(s.id) === 1) break; // the primary's look only, when there is one
    }
  }

  /** Per-enemy marks tick with the other statuses. */
  tickStatus(s: Status, dt: number) {
    if (!s.marks) return;
    for (const [id, m] of Object.entries(s.marks)) {
      m.left -= dt;
      if (m.left <= 0) delete s.marks[id];
    }
  }

  /** Damage multiplier on a hit: your marks make enemies take more. */
  mult(t: Target) {
    const marks = this.rt.statusOf(t)?.marks;
    if (!marks) return 1;
    let k = 1;
    for (const [id, m] of Object.entries(marks)) {
      const s = ROSTER_BY_ID[id];
      if (s?.mech.mark && this.weight(id)) k *= 1 + m.n * (s.mech.mark.per + this.x(id, 'mark'));
    }
    return k;
  }

  applyMods(m: CombatMods) {
    const p = this.p, add = (mods: Partial<Record<NumMod, number>> | undefined, f: number) => {
      for (const [k, v] of Object.entries(mods ?? {})) (m as unknown as Record<string, number>)[k] += (v ?? 0) * f;
    };
    for (const s of this.live()) {
      const w = this.weight(s.id), mech = s.mech;
      if (mech.per) add(mech.per, w * (this.value(s.id) / this.max(s.id)) * (1 + this.x(s.id, 'per')));
      if (mech.low && p.hp < p.maxHp * mech.low.below) add(mech.low.m, w * (1 + this.x(s.id, 'low')));
      if (mech.full?.kind === 'buff' && this.rt.buff(`${s.id}:full`)) add(mech.full.m, 1 + this.x(s.id, 'full'));
    }
    if (this.calm && this.field('stride')) m.moveSpeed += 0.12;
  }

  /** Is a field ability of this kind yours (any learned class that has it)? */
  field(kind: FieldKind) {
    const P = this.rt.paths;
    return ROSTER.some((s) => s.field?.kind === kind && P.learned(s.id));
  }

  resources(out: { name: string; value: number; max: number; kind: 'pips' | 'bar'; color: string; hot?: boolean }[]) {
    for (const s of this.live()) {
      const r = this.res.get(s.id);
      out.push({ name: s.mech.res.toUpperCase(), value: r?.v ?? 0, max: this.max(s.id), kind: s.mech.pips ? 'pips' : 'bar', color: s.mech.color, hot: !!r?.ready });
    }
  }
}

/** The effect style that goes with a class's colour token. */
export function styleOfColor(color: string): import('../../magic/circles').Style {
  return ({ '--c-fire': 'fire', '--c-frost': 'frost', '--c-light': 'light', '--c-shadow': 'shadow', '--c-blood': 'blood', '--c-herb': 'nature', '--c-earth': 'earth', '--c-tide': 'water', '--c-storm': 'storm', '--c-gale': 'gale', '--c-wind': 'wind', '--c-gold': 'light', '--c-ward': 'frost' } as const)[color as '--c-fire'] ?? 'steel';
}

/** A class that sounds right: "a Ranger" / "an Earthshaper". */
export const article = (id: string) => (/^[aeiou]/i.test(DISC[id]?.name ?? '') ? 'an' : 'a');
