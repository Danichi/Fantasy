import * as THREE from 'three';
import type { CombatMods } from '../../combat/mods';
import type { Target } from '../../combat/targets';
import type { HitOpts, SkillRuntime, Status } from '../skills';

// The four later classes' own mechanics (docs/design/classes.md). Their
// techniques are built by the skill forge (classes/forge.ts); what makes each
// one play differently lives here, read through `x` keys their passives set
// (classes/kits.passives.ts):
//
//   Dawnblade    Sunfire. While it is your style, blade hits carry a little
//                holy fire and build Radiance. At full Radiance your next
//                blade hit releases Sunfire: a blast that brands everything.
//   Cryomancer   Chill. Frost hits chill (up to 5 stacks); at 5 the enemy
//                freezes solid. The next hit on frozen ice shatters it for
//                much more damage and splinters onto whatever stands near.
//   Shadowcaller Curses and souls. Shadow hits curse; the cursed take more
//                damage from you. A cursed enemy that dies gives up its soul:
//                each soul you carry is more spell damage, and Soul Storm and
//                The Reaper Walks spend them.
//   Voidwalker   Entropy. Void hits build it (0-100), each point a little
//                more spell damage. At 100 the next void hit collapses: an
//                implosion that drags everything in and crushes it.

const SOUL_BASE = 10;

export class ClassKits {
  /** Shadowcaller's souls */
  souls = 0;
  /** Voidwalker's Entropy (0-100) */
  entropy = 0;
  private soulIdle = 0;
  private entropyIdle = 0;
  private sunfireReady = false;

  constructor(private rt: SkillRuntime) {}

  private get p() {
    return this.rt['player'];
  }
  private x(k: string) {
    return this.rt.x(k);
  }
  private learned(id: string) {
    return this.rt.paths.learned(id);
  }
  /** Dawnblade counts while it is your style or your second class. */
  private get dawn() {
    const P = this.rt.paths;
    return P.active === 'dawnblade' || P.secondary === 'dawnblade';
  }
  get soulMax() {
    return SOUL_BASE + this.x('soulMax');
  }
  private spellDmg(base: number) {
    return base * this.rt.paths.spellPower * this.p.mods.spell;
  }

  reset() {
    this.souls = this.entropy = 0;
    this.sunfireReady = false;
  }

  /** The school a hit belongs to: the forge tags its own; plain hits go by damage type. */
  private school(o: HitOpts) {
    return o.school ?? (o.type === 'frost' ? 'frost' : o.type === 'holy' ? 'light' : undefined);
  }

  /** Extra multiplier on a hit before it lands. */
  mult(t: Target, o: HitOpts) {
    const s = this.rt.statusOf(t);
    let k = 1;
    if (!s) return k;
    const school = this.school(o);
    if (s.curse && s.curse > 0) k *= 1 + 0.1 + this.x('curseDmg');
    if (s.chill && school === 'frost') k *= 1 + s.chill * (0.04 + this.x('chillDmg'));
    if (s.frozen && s.frozen > 0 && !o.kit) k *= 1.6 + this.x('shatterDmg');
    if (s.brand && s.brand > 0 && this.dawn && o.source === 'melee') k *= 1 + this.x('dawnBrand');
    return k;
  }

  /** After a hit lands. */
  onHit(t: Target, dmg: number, o: HitOpts) {
    if (o.kit || dmg <= 0) return;
    const school = this.school(o);
    const s = this.rt.st(t);
    // ---- Cryomancer ----
    if (s.frozen && s.frozen > 0) this.shatter(t, s, dmg);
    else if (school === 'frost' && this.learned('cryomancer') && t.alive) this.chill(t, s, 1);
    // ---- Shadowcaller ----
    if ((school === 'shadow' || (school === 'void' && this.x('voidCurse'))) && this.learned('shadowcaller') && t.alive) {
      s.curse = (6 + this.x('curseTime')) * this.p.mods.duration;
    }
    // ---- Voidwalker ----
    if (school === 'void' && this.learned('voidwalker')) {
      this.entropyIdle = 0;
      if (this.entropy >= 100) this.collapse(t.position.clone());
      else this.entropy = Math.min(100, this.entropy + 8 * (1 + this.x('entropyGain')));
    }
  }

  /** A blade hit (Dawnblade's Sunfire and its holy edge). */
  onMeleeHit(t: Target, amount: number) {
    // A blade breaks frozen ice too.
    const st = this.rt.statusOf(t);
    if (st?.frozen && st.frozen > 0) {
      this.rt.hit(t, amount * (0.6 + this.x('shatterDmg')), { poise: 60, type: 'frost', school: 'frost', kit: true, noVerdict: true, source: 'melee' });
      this.shatter(t, st, amount);
    }
    if (!this.dawn || !t.alive) return;
    const rt = this.rt;
    const branded = rt.branded(t);
    const edge = amount * (0.1 + this.x('dawnEdge')) * (rt.env().daylight ? 1.2 : 1);
    rt.hit(t, edge, { poise: 0, type: 'holy', school: 'light', kit: true, noVerdict: true, source: 'melee' });
    this.radiance((branded ? 10 : 5) * (1 + this.x('dawnRad')));
    if (this.sunfireReady) this.sunfire(t);
    else if (rt.radiance >= 100) this.sunfireReady = true;
  }

  private radiance(n: number) {
    this.rt.radiance = Math.min(100, this.rt.radiance + n * (1 + this.x('radGain')));
  }

  /** Dawnblade: spend all Radiance in one blast of light around the struck enemy. */
  private sunfire(t: Target) {
    const rt = this.rt, p = this.p;
    this.sunfireReady = false;
    rt.radiance = 0;
    const at = t.position.clone();
    const r = 3.5 + this.x('sunfireR');
    const dmg = rt.weapon() * (1.5 + this.x('sunfire'));
    const hit = rt.area(at, r, dmg, { poise: 160, type: 'holy', school: 'light', kit: true, source: 'melee', stun: !!this.x('sunStun') });
    for (const h of hit) rt.brand(h);
    if (this.x('sunHeal')) p.heal(p.maxHp * this.x('sunHeal'));
    if (this.x('sunWard')) rt.shield(p.maxHp * this.x('sunWard'), 6, 'ward', 'light');
    if (this.x('sunHaste')) rt.addBuff('dawnHaste', 5);
    rt.vfx.pillar(at, 'light', 1.2, 7);
    rt.vfx.nova(at, 'light', r);
    rt.vfx.burst(at.clone().setY(at.y + 1), 'light', 1.4, 6);
    p.onShake?.(0.3);
    p.onHitStop?.(0.08);
  }

  /** Cryomancer: add Chill; at the cap the enemy freezes. */
  chill(t: Target, s: Status, n: number) {
    if ((s.freezeCd ?? 0) > 0) return;
    const cap = Math.max(3, 5 - this.x('chillCap'));
    s.chill = Math.min(cap, (s.chill ?? 0) + n);
    s.chillLeft = 6 * this.p.mods.duration;
    if (s.chill >= cap) {
      s.chill = 0;
      s.frozen = (2 + this.x('freezeTime')) * (t.boss ? 0.5 : 1) * this.p.mods.duration;
      s.freezeCd = 6;
      t.stunned = true;
      this.rt.vfx.burst(t.center, 'frost', 1, 5);
      this.rt.vfx.groundCircle(t.position, 'frost', t.radius * 3 + 0.8, s.frozen);
    }
  }

  /** Cryomancer: the frozen enemy breaks; the ice flies. */
  private shatter(t: Target, s: Status, dmg: number) {
    const rt = this.rt, p = this.p;
    s.frozen = 0;
    t.stunned = false;
    const at = t.position.clone();
    const r = 2.5 + this.x('shatterR');
    rt.area(at, r, dmg * (0.4 + this.x('shatterSplash')), { poise: 90, type: 'frost', school: 'frost', kit: true, skip: new Set([t.id]) })
      .forEach((o) => { if (this.x('shatterChill')) this.chill(o, rt.st(o), this.x('shatterChill')); });
    if (this.x('shatterMana')) p.mana = Math.min(p.maxMana, p.mana + this.x('shatterMana'));
    if (this.x('shatterWard')) rt.shield(p.maxHp * this.x('shatterWard'), 6, 'barrier', 'frost');
    rt.vfx.burst(t.center, 'frost', 1.6, 8);
    rt.vfx.ring(at, 'frost', r * 2);
    rt.vfx.fx.add.spawn({ pos: t.center.clone(), spread: 1.6, count: 26, life: [0.4, 0.9], size: [0.2, 0.04], color: 0xe8f8ff, color2: 0x5ab0ff, upBias: 1.2, gravity: 7 });
    p.onHitStop?.(0.06);
  }

  /** Voidwalker: everything near is dragged in and crushed; Entropy spent. */
  private collapse(at: THREE.Vector3) {
    const rt = this.rt, p = this.p;
    this.entropy = 0;
    const r = 5 + this.x('collapseR');
    rt.vfx.gather(at, 'void', 1.4);
    rt.later(0.35, () => {
      rt.area(at, r, this.spellDmg(55) * (1 + this.x('collapseDmg')), { poise: 200, type: 'arcane', school: 'void', kit: true, pull: true, stun: true });
      rt.vfx.nova(at, 'void', r);
      rt.vfx.burst(at.clone().setY(at.y + 1), 'void', 1.6, 7);
      if (this.x('collapseWard')) rt.shield(p.maxHp * this.x('collapseWard'), 6, 'barrier', 'void');
      if (this.x('collapseMana')) p.mana = Math.min(p.maxMana, p.mana + this.x('collapseMana'));
      p.onShake?.(0.35);
    });
  }

  /** A death: Shadowcaller harvests the cursed. */
  onKill(at: THREE.Vector3, s: Status | undefined) {
    if (!this.learned('shadowcaller')) return;
    const cursed = (s?.curse ?? 0) > 0;
    if (!cursed && !this.x('harvestAll')) return;
    const p = this.p;
    this.souls = Math.min(this.soulMax, this.souls + 1 + (this.rt.buff('reaper') ? 1 : 0));
    this.soulIdle = 0;
    if (this.x('soulHeal')) p.heal(p.maxHp * this.x('soulHeal'));
    if (this.x('soulMana')) p.mana = Math.min(p.maxMana, p.mana + this.x('soulMana'));
    // The soul flies to you.
    const from = at.clone().setY(at.y + 1);
    this.rt.vfx.lightning(from, p.center, 'shadow', 0.6);
    this.rt.vfx.burst(from, 'shadow', 0.6, 3);
    // Contagion: the curse finds the next one.
    if (cursed && this.x('curseSpread')) {
      const next = this.rt.nearestEnemy(at, 8);
      if (next) {
        this.rt.st(next).curse = (6 + this.x('curseTime')) * p.mods.duration;
        this.rt.vfx.lightning(from, next.center, 'shadow');
      }
    }
  }

  /** A technique was used: Soul Storm and The Reaper Walks spend souls. */
  onUse(key: string) {
    if (key === 'shadowcaller:Soul Storm' && this.souls > 0) {
      this.rt.addBuff('soulFuel', 2, this.souls);
      this.souls = 0;
    } else if (key === 'shadowcaller:The Reaper Walks') {
      this.rt.addBuff('reaper', 20 * this.p.mods.duration);
    }
  }

  update(dt: number) {
    const rt = this.rt;
    if (!this.learned('shadowcaller')) this.souls = 0;
    else if (this.souls > 0) {
      this.soulIdle += dt;
      if (this.soulIdle > 8) (this.souls--, (this.soulIdle = 6));
    }
    if (!this.learned('voidwalker')) this.entropy = 0;
    else if ((this.entropyIdle += dt) > 4) this.entropy = Math.max(0, this.entropy - 5 * dt);
    if (!this.dawn) this.sunfireReady = false;
    else if (rt.radiance >= 100) this.sunfireReady = true;
  }

  /** Per-enemy kit statuses, ticked with the others. */
  tickStatus(s: Status, dt: number) {
    if (s.chillLeft && s.chillLeft > 0 && (s.chillLeft -= dt) <= 0) s.chill = 0;
    if (s.freezeCd && s.freezeCd > 0) s.freezeCd -= dt;
    if (s.frozen && s.frozen > 0) {
      s.frozen -= dt;
      s.t.stunned = s.frozen > 0;
      if (Math.random() < dt * 12) this.rt.vfx.fx.add.spawn({ pos: s.t.center, spread: 1, count: 1, life: [0.5, 0.9], size: [0.22, 0.04], color: 0xe8f8ff, color2: 0x7ac8ff, jitter: s.t.radius * 0.9 });
    } else if (s.chill && Math.random() < dt * s.chill * 2) {
      this.rt.vfx.fx.add.spawn({ pos: s.t.center, spread: 0.6, count: 1, life: [0.4, 0.7], size: [0.12, 0.02], color: 0xcfeeff, color2: 0x5ab0ff, jitter: s.t.radius * 0.7 });
    }
    if (s.curse && s.curse > 0) {
      s.curse -= dt;
      if (Math.random() < dt * 8) this.rt.vfx.fx.add.spawn({ pos: s.t.center.clone().setY(s.t.center.y + (s.t.halfHeight ?? 0.5) + 0.3), spread: 0.4, count: 1, life: [0.5, 0.9], size: [0.18, 0.02], color: 0xb070ff, color2: 0x200040, upBias: 0.8, jitter: 0.25 });
    }
  }

  applyMods(m: CombatMods) {
    const rt = this.rt;
    if (this.souls > 0) m.spell += this.souls * (0.02 + this.x('soulPower'));
    const fuel = rt.buffs.get('soulFuel');
    if (fuel) m.spell += 0.08 * (fuel.v ?? 0);
    if (this.entropy > 0) m.spell += this.entropy * (0.001 + this.x('entropyPower'));
    if (this.dawn) {
      if (rt.env().daylight) m.melee += this.x('dayDmg');
      if (rt.radiance >= 50) m.moveSpeed += this.x('dawnSpeed');
      if (rt.buff('dawnHaste')) (m.attackSpeed += 0.2), (m.moveSpeed += 0.15);
    }
  }

  resources(out: { name: string; value: number; max: number; kind: 'pips' | 'bar'; color: string; hot?: boolean }[]) {
    if (this.learned('shadowcaller')) out.push({ name: 'SOULS', value: this.souls, max: this.soulMax, kind: 'pips', color: '#b070ff', hot: this.souls >= this.soulMax });
    if (this.learned('voidwalker')) out.push({ name: 'ENTROPY', value: this.entropy, max: 100, kind: 'bar', color: '#8a5aff', hot: this.entropy >= 100 });
    if (this.dawn && !this.learned('lightbinder')) out.push({ name: 'RADIANCE', value: this.rt.radiance, max: 100, kind: 'bar', color: '#ffd86a', hot: this.sunfireReady });
  }

  /** Sunfire is ready (the HUD's Radiance bar glows). */
  get sunfireLit() {
    return this.sunfireReady;
  }
}
