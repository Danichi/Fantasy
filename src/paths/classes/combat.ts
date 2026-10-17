import * as THREE from 'three';
import { events } from '../../core/events';
import type { IncomingAttack, DefenceResult, Target } from '../../combat/targets';
import type { CombatMods } from '../../combat/mods';
import type { SkillRuntime } from '../skills';
import { heightAt } from '../../world/terrainHeight';

// The three sword styles each reshape one basic action, and build their
// resource by doing it well:
//   Gale Style      the dodge.   Flow (0-5) builds when an attack passes through
//                   your dodge, and from hits right after; each pip is speed.
//   Cross Style     two blades.  Tempo (0-8) builds by alternating left and
//                   right strikes in rhythm; each point is attack speed.
//   Boundary Style  the ring.    Hold F while standing still to raise a small
//                   blue Boundary around you: anything that reaches into it is
//                   turned aside. Holding it spends Focus (0-100).

/** the Boundary ring's look: a pale blue disc, a bright rim and a faint wall */
function ringMesh() {
  const g = new THREE.Group();
  // Normal blending (not additive) so the ring still reads against bright daylight grass.
  const add = (geo: THREE.BufferGeometry, color: number, opacity: number, additive = false) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false }));
    m.renderOrder = 4;
    g.add(m);
    return m;
  };
  const disc = add(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), 0x3d8bff, 0.22);
  const rim = add(new THREE.RingGeometry(0.93, 1.0, 96).rotateX(-Math.PI / 2), 0x8cc6ff, 0.95);
  const inner = add(new THREE.RingGeometry(0.6, 0.625, 96, 1, 0, Math.PI * 1.6).rotateX(-Math.PI / 2), 0x5aa2ff, 0.6);
  const wall = add(new THREE.CylinderGeometry(1, 1, 0.7, 64, 1, true).translate(0, 0.35, 0), 0x4d9dff, 0.16);
  add(new THREE.RingGeometry(0.93, 1.0, 96).rotateX(-Math.PI / 2), 0x9fd0ff, 0.5, true).position.y = 0.17;
  disc.position.y = 0.14;
  rim.position.y = 0.16;
  inner.position.y = 0.15;
  g.visible = false;
  return { g, disc, rim, inner, wall };
}

export class CombatClasses {
  // ---- Gale ----
  private flowIdle = 0;
  private lastDodge = -99;
  private lastDodgeProc = -99;
  /** Stillwind: parries in a row without being hit */
  calm = 0;
  // ---- Cross ----
  tempo = 0;
  private lastHand: 'main' | 'off' | '' = '';
  private lastBeat = -99;
  private beatHits = 0;
  private stillT = 0;
  private movedAt = -99;
  /** enemies left open by a feint (id -> seconds) */
  private opened = new Map<number, number>();
  // ---- Boundary ----
  focus = 100;
  domainOn = false;
  domainR = 0;
  private domainT = 0;
  private focusIdle = 0;
  private lockout = 0;
  private flash = 0;
  private wasEmpty = false;
  stone: { pos: THREE.Vector3; r: number; left: number } | null = null;
  private ring: ReturnType<typeof ringMesh>;
  private stoneRing: ReturnType<typeof ringMesh>;
  /** called on each beat of two-blade rhythm (Ilse's trial counts them) */
  onBeat?: () => void;

  constructor(private rt: SkillRuntime, scene: THREE.Scene) {
    this.ring = ringMesh();
    this.stoneRing = ringMesh();
    scene.add(this.ring.g, this.stoneRing.g);
  }

  private get p() {
    return this.rt['player'];
  }
  private get now() {
    return this.rt['time'] as number;
  }
  private get active() {
    return this.rt.paths.active;
  }
  get flowMax() {
    return 5 + this.rt.x('flowMax');
  }
  get tempoMax() {
    return 8 + this.rt.x('tempoMax');
  }
  get focusMax() {
    return 100 + this.rt.x('focusMax');
  }
  private addFlow(n: number) {
    this.rt.flow = Math.max(0, Math.min(this.flowMax, this.rt.flow + n * (n > 0 ? 1 + this.rt.x('resGain') : 1)));
    if (n > 0) this.flowIdle = 0;
  }
  addTempo(n: number) {
    this.tempo = Math.max(0, Math.min(this.tempoMax, this.tempo + n));
  }
  /** Leave an enemy open: the next hit on it is a critical. */
  open(t: Target, sec = 2.5) {
    this.opened.set(t.id, sec);
    this.rt.vfx.burst(t.center, 'steel', 0.3, 2);
  }
  isOpen(t: Target) {
    return (this.opened.get(t.id) ?? 0) > 0;
  }

  reset() {
    this.rt.flow = 0;
    this.calm = 0;
    this.tempo = 0;
    this.lastHand = '';
    this.opened.clear();
    this.focus = this.focusMax;
    this.domainOn = false;
    this.domainR = 0;
    this.stone = null;
    this.lockout = 0;
  }

  // ---- hooks (called by the skill runtime) ----------------------------------------------------------
  onMeleeHit(t: Target, action: string) {
    const rt = this.rt;
    if (this.active === 'gale') {
      this.addFlow(this.now - this.lastDodge < 2 ? 1 : 0.25);
      if (action === 'slash3' && rt.has('updraft')) rt.hit(t, 1, { poise: 160, source: 'melee', noVerdict: true });
    }
    if (this.active === 'cross' && this.p.equip.dualWield) {
      const hand = action.startsWith('offslash') ? 'off' : action.startsWith('slash') ? 'main' : '';
      if (hand) {
        if (this.lastHand && hand !== this.lastHand && this.now - this.lastBeat <= 1.2) {
          this.addTempo(1);
          this.onBeat?.();
          this.rt.vfx.fx.add.spawn({ pos: this.p.center.setY(this.p.pos.y + 2.1), spread: 0.4, count: 4, life: [0.25, 0.4], size: [0.1, 0.01], color: 0xffffff, color2: 0x8a9ab8 });
        } else if (hand === this.lastHand) this.addTempo(-1);
        this.lastHand = hand;
        this.lastBeat = this.now;
      }
      if (++this.beatHits % 4 === 0) {
        if (rt.has('crimsonMark')) rt.bleed(t, rt.weapon() * 0.15);
        if (rt.has('hamstring')) rt.hit(t, 1, { poise: 140, source: 'melee', noVerdict: true });
      }
      if (this.isOpen(t) && rt.x('sleight')) this.p.prog.addGold(rt.x('sleight'));
    } else if (this.p.equip.dualWield) {
      // Before Cross Style is learned, Ilse's trial still counts the beat.
      const hand = action.startsWith('offslash') ? 'off' : action.startsWith('slash') ? 'main' : '';
      if (hand && this.lastHand && hand !== this.lastHand && this.now - this.lastBeat <= 1.2) this.onBeat?.();
      if (hand) (this.lastHand = hand), (this.lastBeat = this.now);
    }
    if (this.opened.has(t.id)) this.opened.delete(t.id);
  }

  /** Extra multiplier (and forced crit) on the player's own blade hits. */
  meleeBonus(t: Target) {
    const rt = this.rt, act = this.p.act?.def.id ?? '';
    let mult = 1, crit = false;
    if (this.active === 'gale') {
      if (rt.buff('slip')) {
        mult *= 1.3;
        rt.buffs.delete('slip');
      }
      if (!this.p.equip.offItem) mult *= 1 + rt.x('lightGrip');
      if (act === 'slash3') mult *= 1 + rt.x('followThrough');
      if (act === 'sk_riposte') mult *= 1 + 0.06 * this.calm;
    }
    if (this.active === 'cross') {
      if (act.startsWith('offslash')) mult *= 1 + rt.x('ambidextrous');
      if (this.isOpen(t)) {
        crit = true;
        mult *= 1 + rt.x('cheapShot');
      }
      if (rt.buff('cartwheel')) {
        crit = true;
        rt.buffs.delete('cartwheel');
      }
    }
    if (this.active === 'boundary') {
      if (rt.buff('guardCounter')) {
        mult *= 1.35;
        rt.buffs.delete('guardCounter');
        rt.hit(t, 1, { poise: 160, source: 'melee', noVerdict: true });
      }
      if (rt.has('overflow') && this.focus >= this.focusMax - 0.5) mult *= 1.15;
    }
    return { mult, crit };
  }

  /** An attack passed through a dodge (i-frames). */
  onDodged(att: IncomingAttack) {
    const rt = this.rt, p = this.p;
    if (this.now - this.lastDodgeProc < 0.4) return;
    this.lastDodgeProc = this.now;
    const foe = rt.nearestEnemy(att.from, 4);
    if (this.active === 'gale') {
      this.lastDodge = this.now;
      this.addFlow(2);
      // Slipstream: the world catches its breath, and your next cut lands harder.
      rt.addBuff('slip', 1.5);
      p.onHitStop?.(0.14);
      rt.vfx.ring(p.pos, 'gale', 3.5);
      rt.vfx.fx.add.spawn({ pos: p.center, spread: 2, count: 20, life: [0.2, 0.4], size: [0.12, 0.01], color: 0xe8fffb, color2: 0x2fc8b0, drag: 3 });
      if (foe && rt.has('afterimage')) {
        rt.later(0.15, () => {
          if (!foe.alive) return;
          rt.hit(foe, rt.weapon() * 0.6, { poise: 30, source: 'melee' });
          rt.vfx.slash(foe.center, Math.random() * 6.28, 1.4, 'gale', 0.5, 0.3);
        });
      }
    }
    if (this.active === 'cross') {
      if (foe && (rt.has('mirrorStep') || rt.has('grandDeception'))) this.open(foe);
      if (rt.has('cartwheel')) rt.addBuff('cartwheel', 2);
      if (rt.has('pirouette')) {
        rt.area(p.pos, 2.2, rt.weapon() * 0.4, { poise: 30, source: 'melee' });
        rt.vfx.spinSlash(p.pos, 2, 'steel');
      }
    }
  }

  onParry() {
    const rt = this.rt, p = this.p;
    if (this.active !== 'gale') return;
    if (rt.has('calm')) this.calm = Math.min(5, this.calm + 1);
    if (rt.x('parryStamina')) p.stamina = Math.min(p.maxStamina, p.stamina + rt.x('parryStamina'));
    if (rt.has('composure')) rt.addBuff('composure', 4);
    if (rt.has('guardCrush')) rt['critNext'] = Math.max(rt['critNext'], 2);
    if (rt.has('mirrorGuard')) p.stamina = p.maxStamina;
    const t = rt.nearestEnemy(p.center, 4);
    if (t && rt.has('rebuke')) rt.hit(t, rt.weapon() * 0.4, { poise: 20, source: 'melee' });
    if (t && rt.has('disarm')) rt.hit(t, 1, { poise: 220, stun: true, source: 'melee', noVerdict: true });
    if (t && rt.buff('stillwater')) {
      rt.buffs.delete('stillwater');
      const k = rt.buffs.get('stillwaterK')?.v ?? 1;
      rt.later(0.08, () => {
        if (!t.alive) return;
        rt.hit(t, rt.weapon() * 1.6 * k, { poise: 120, crit: true, source: 'melee' });
        rt.vfx.slash(t.center, p.yaw, 2.2, 'gale', 0.6, 0.2);
        p.onHitStop?.(0.12);
      });
    }
  }

  /** when you were last hurt (Moonlit Draw's clean draw) */
  lastHurt = -99;

  onHurt() {
    const rt = this.rt;
    this.lastHurt = this.now;
    if (this.active === 'gale') {
      if (rt.has('mirrorGuard')) rt.flow = 0;
      else this.addFlow(-2);
      this.calm = 0;
    }
    if (this.active === 'boundary') {
      if (rt.has('martyr')) this.focus = Math.min(this.focusMax, this.focus + 10);
      // A blow the ring couldn't turn breaks it.
      if (this.domainOn && !rt.has('unmoved')) this.breakDomain();
    }
  }

  onKill() {
    const rt = this.rt, p = this.p;
    if (this.active === 'gale' && rt.has('hurricane')) {
      this.addFlow(1);
      p.stamina = Math.min(p.maxStamina, p.stamina + 15);
    }
    if (this.active === 'cross' && rt.has('endlessWaltz')) this.addTempo(2);
  }

  /** Before shields and wards: Trickster's Luck, and Unmoved halving what breaks through the ring. */
  absorb(d: number) {
    if (this.active === 'cross' && Math.random() < this.rt.x('trickster')) {
      this.rt.vfx.burst(this.p.center, 'steel', 0.3, 3);
      return 0;
    }
    if (this.active === 'boundary' && this.domainOn && this.rt.has('unmoved')) return d * 0.5;
    return d;
  }

  // ---- Boundary --------------------------------------------------------------------------------------
  private breakDomain() {
    this.domainOn = false;
    this.domainT = 0;
    this.lockout = 1;
    this.rt.vfx.ring(this.p.pos, 'frost', this.domainR * 2.4);
    this.domainR = 0;
  }

  /** Turn aside anything that reaches into a Boundary (yours, or a Ward Stone). */
  defend(att: IncomingAttack): DefenceResult | null {
    if (this.active !== 'boundary' || (!att.parryable && !att.projectile)) return null;
    const rt = this.rt, p = this.p;
    const at = att.at ?? att.from;
    const reach = (c: THREE.Vector3, r: number) => Math.hypot(at.x - c.x, at.z - c.z) <= r + 0.35 + (att.projectile ? rt.x('watchful') : 0);
    const mine = this.domainOn && reach(p.pos, this.domainR);
    const stone = this.stone && reach(this.stone.pos, this.stone.r);
    if (!mine && !stone) return null;
    if (mine) this.focus = Math.max(0, this.focus - Math.max(1, 6 - rt.x('patience')));
    this.flash = 1;
    const foe = rt.nearestEnemy(att.from, 4);
    if (att.projectile) {
      if (rt.x('shelter')) this.focus = Math.min(this.focusMax, this.focus + rt.x('shelter'));
      rt.vfx.burst(at.clone(), 'frost', 0.5, 3);
      return 'blocked';
    }
    att.onParried?.();
    events.emit('parrySuccess', { at: p.center.clone().lerp(at, 0.5) });
    rt.vfx.burst(p.center.clone().lerp(at, 0.6), 'frost', 0.6, 4);
    p.onHitStop?.(0.08);
    if (rt.has('stillWater')) p.stamina = Math.min(p.maxStamina, p.stamina + 6);
    if (rt.has('counterweight')) rt.addBuff('guardCounter', 3);
    if (foe) {
      if (rt.has('thorns')) rt.hit(foe, rt.weapon() * 0.3, { poise: 20, source: 'melee' });
      if (rt.has('retaliation')) rt.hit(foe, rt.weapon() * 0.4, { poise: 30, source: 'melee' });
      if (rt.has('shatter')) rt.hit(foe, 1, { poise: 260, stun: true, noVerdict: true });
    }
    if (rt.has('echo')) {
      rt.area(p.pos, this.domainR || 2.5, 1, { poise: 110, noVerdict: true });
      rt.vfx.ring(p.pos, 'frost', (this.domainR || 2.5) * 2.5);
    }
    return 'parried';
  }

  private updateDomain(dt: number) {
    const rt = this.rt, p = this.p;
    this.lockout = Math.max(0, this.lockout - dt);
    if (this.focus > this.focusMax) this.focus = this.focusMax;
    p.domainMoves = this.active === 'boundary' && rt.buff('holdFast');
    const want = this.active === 'boundary' && !p.dead && p.parryHeldT > 0.22 && p.stillForDomain && !p.act && this.focus > 2 && this.lockout <= 0;
    if (want) {
      if (!this.domainOn) {
        this.domainT = 0;
        if (rt.has('rooted')) this.focus = Math.max(0, this.focus - 15);
      }
      this.domainOn = true;
      this.domainT += dt;
      const grow = rt.has('rooted') ? 1 : Math.min(1, this.domainT / (rt.has('anchor') ? 0.75 : 1.5));
      const full = 2.8 * (1 + rt.x('wideStance')) * (rt.buff('sanctum') ? 1.3 : 1);
      this.domainR = 1.6 + (full - 1.6) * grow;
      if (!rt.buff('sanctum')) this.focus -= (5 + this.domainR * 1.5) * (rt.has('rooted') ? 0.6 : 1) * dt;
      if (this.focus <= 0) {
        this.focus = 0;
        this.wasEmpty = true;
        this.breakDomain();
      }
      this.focusIdle = 0;
    } else {
      if (this.domainOn) {
        this.domainOn = false;
        this.domainR = 0;
      }
      this.focusIdle += dt;
      if (this.focusIdle > 0.8 && this.focus < this.focusMax) {
        const k = (1 + rt.x('deepBreath')) * (rt.has('retaliation') ? 0.6 : 1) * (this.wasEmpty && rt.has('secondBreath') ? 2 : 1);
        this.focus = Math.min(this.focusMax, this.focus + 18 * k * dt);
        if (this.focus >= this.focusMax) this.wasEmpty = false;
      }
    }
    if (this.active !== 'boundary') this.focus = this.focusMax;
    if (this.stone) {
      this.stone.left -= dt;
      if (this.stone.left <= 0) this.stone = null;
    }
    // Draw the rings.
    this.flash = Math.max(0, this.flash - dt * 3);
    const draw = (r: ReturnType<typeof ringMesh>, on: boolean, pos: THREE.Vector3, rad: number, power: number) => {
      r.g.visible = on;
      if (!on) return;
      r.g.position.set(pos.x, heightAt(pos.x, pos.z) + 0.02, pos.z);
      if (Math.abs(r.g.position.y - pos.y) > 1.5) r.g.position.y = pos.y + 0.02; // indoors / on a deck
      r.g.scale.set(rad, 1, rad);
      const pulse = 0.5 + 0.5 * Math.sin(this.now * 5);
      (r.disc.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.06 * pulse + 0.25 * this.flash;
      (r.rim.material as THREE.MeshBasicMaterial).opacity = Math.min(1, 0.6 + 0.35 * power + 0.3 * this.flash);
      (r.wall.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.04 * pulse + 0.15 * this.flash;
      r.inner.rotation.y += 0.01;
    };
    draw(this.ring, this.domainOn, p.pos, this.domainR, this.focus / this.focusMax);
    draw(this.stoneRing, !!this.stone, this.stone?.pos ?? p.pos, this.stone?.r ?? 1, 0.6);
    if (this.domainOn && Math.random() < dt * 20) {
      const a = Math.random() * 6.28;
      this.rt.vfx.fx.add.spawn({ pos: p.pos.clone().add(new THREE.Vector3(Math.cos(a) * this.domainR, 0.1, Math.sin(a) * this.domainR)), vel: new THREE.Vector3(0, 1.2, 0), spread: 0.2, count: 1, life: [0.4, 0.7], size: [0.08, 0.01], color: 0xcfe6ff, color2: 0x4d9dff });
    }
  }

  // ---- per step ---------------------------------------------------------------------------------------
  update(dt: number) {
    const rt = this.rt, p = this.p;
    // Gale: Flow fades when you stop fighting.
    if (this.active !== 'gale') {
      rt.flow = 0;
      this.calm = 0;
    } else {
      this.flowIdle += dt;
      if (this.flowIdle > 4 && !rt.has('flowKeep')) rt.flow = Math.max(0, rt.flow - (dt / 1.5) * (rt.has('quietMind') ? 0.5 : 1));
    }
    // Cross: Tempo drains when the beat stops.
    if (this.active !== 'cross') this.tempo = 0;
    else {
      const moving = p.moveIntent.lengthSq() > 0.01;
      if (moving) this.movedAt = this.now;
      this.stillT = moving ? 0 : this.stillT + dt;
      if (rt.has('perpetualMotion') && this.stillT > 1) this.tempo = 0;
      const held = (rt.has('perpetualMotion') && moving) || (rt.has('momentum') && this.now - this.movedAt < 3 && moving);
      if (!held && this.now - this.lastBeat > 1.5) this.tempo = Math.max(0, this.tempo - 4 * dt * (rt.has('doubleTime') ? 0.5 : 1));
    }
    for (const [id, left] of this.opened) {
      if (left - dt <= 0) this.opened.delete(id);
      else this.opened.set(id, left - dt);
    }
    this.updateDomain(dt);
  }

  applyMods(m: CombatMods) {
    const rt = this.rt, flow = rt.flow;
    if (this.active === 'gale') {
      m.moveSpeed += 0.03 * flow;
      m.attackSpeed += 0.03 * flow;
      if (rt.has('stormUnbound')) {
        m.canBlock = false;
        m.dmgTaken += 0.2;
        if (flow >= 3) m.dodgeCost = 0;
      }
      if (rt.has('pride')) m.melee += 0.03 * this.calm;
      if (rt.buff('composure')) m.melee += 0.2;
    }
    if (this.active === 'cross') {
      m.attackSpeed += 0.04 * this.tempo;
      if (rt.has('grandDeception')) m.parryWindow = 0;
      if (rt.has('dancersGrace') && this.tempo >= this.tempoMax) m.dmgTaken -= 0.15;
      if (rt.has('swallowCut') && this.p.moveIntent.lengthSq() > 0.01) m.melee += 0.05;
    }
    if (this.active === 'boundary') {
      if (this.domainOn && rt.buff('holdFast')) m.moveSpeed -= 0.5;
      if (rt.buff('challenge')) m.dmgTaken -= 0.2;
    }
  }

  resources(out: { name: string; value: number; max: number; kind: 'pips' | 'bar'; color: string; hot?: boolean }[]) {
    const a = this.active;
    if (a === 'gale') out.push({ name: 'FLOW', value: this.rt.flow, max: this.flowMax, kind: 'pips', color: '#6fd6c6' });
    if (a === 'cross') out.push({ name: 'TEMPO', value: this.tempo, max: this.tempoMax, kind: 'pips', color: '#c8d2e6', hot: this.tempo >= this.tempoMax });
    if (a === 'boundary') out.push({ name: 'FOCUS', value: this.focus, max: this.focusMax, kind: 'bar', color: this.lockout > 0 ? '#7a8aa8' : '#5fa8ff' });
  }
}
