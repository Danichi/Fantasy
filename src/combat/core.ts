import * as THREE from 'three';
import { events } from '../core/events';
import { targets, type HitInfo, type Target } from './targets';

// The combat core (combat rework, phase 1): what every blow the player lands
// goes through, and the shared state every enemy carries.
//
//  - Posture: blows (and parried attacks) fill an enemy's posture; full, it
//    BREAKS and reels, open to a finisher. Posture drains back when left alone,
//    slower the more the enemy is hurt (deliberate, Sekiro-paced fights).
//  - Poise: a small pool per enemy. Hits wear it down; empty, the enemy is
//    staggered (or knocked down by a big blow) and briefly can't be staggered
//    again, so a light combo can't stunlock anything.
//  - Super armour: big enemy swings shrug off reactions (they still take damage
//    and posture).
//  - Crits come from play, never dice: ripostes, broken posture, counter-hits
//    (striking an enemy mid wind-up), backstabs and weak points.
//  - Damage types against armour: slash, pierce and blunt (plus the elements)
//    each do more or less against flesh, bone, plate, stone, chitin...

export type DmgType = 'slash' | 'pierce' | 'blunt' | 'fire' | 'frost' | 'holy' | 'arcane';
export type Armour = 'flesh' | 'hide' | 'leather' | 'bone' | 'plate' | 'chitin' | 'shell' | 'slime' | 'stone' | 'spirit' | 'wood';
export type Reaction = 'none' | 'stagger' | 'knockdown';
export type CritReason = 'riposte' | 'broken' | 'backstab' | 'counter' | 'weakpoint' | 'skill' | 'finisher';
/** How an enemy attack can be answered (and the colour of its tell). */
export type AttackKind = 'normal' | 'heavy' | 'unblockable' | 'grab';

/** Damage multiplier per type against each armour (1 = normal). */
export const RESIST: Record<Armour, Partial<Record<DmgType, number>>> = {
  flesh: { pierce: 1.05 },
  hide: { slash: 0.9, pierce: 1.1, blunt: 1.05, fire: 1.15 },
  leather: { slash: 0.9, pierce: 1.1 },
  bone: { slash: 0.65, pierce: 0.55, blunt: 1.55, holy: 1.6, fire: 0.9 },
  plate: { slash: 0.55, pierce: 1.1, blunt: 1.3, fire: 0.8, frost: 1.1 },
  chitin: { slash: 0.75, pierce: 1.3, blunt: 1.25, fire: 1.2 },
  shell: { slash: 0.6, pierce: 0.8, blunt: 1.45, frost: 1.2 },
  slime: { slash: 1.15, pierce: 0.85, blunt: 0.6, fire: 1.4, frost: 1.3 },
  stone: { slash: 0.45, pierce: 0.6, blunt: 1.6, frost: 0.8, fire: 0.6 },
  spirit: { slash: 0.7, pierce: 0.7, blunt: 0.7, holy: 1.8, fire: 1.2, arcane: 1.3 },
  wood: { slash: 1.25, pierce: 0.8, blunt: 0.9, fire: 1.6 },
};

/** The damage each weapon family deals by default (a move can say otherwise: thrusts pierce). */
export const FAMILY_DMG: Record<string, DmgType> = {
  sword: 'slash', greatsword: 'slash', axe: 'slash', spear: 'pierce', dagger: 'pierce', bow: 'pierce', crossbow: 'pierce', mace: 'blunt', staff: 'blunt',
};

/** Plain words for the inventory and the training yard. */
export const DMG_WORD: Record<DmgType, string> = {
  slash: 'Slash', pierce: 'Pierce', blunt: 'Blunt', fire: 'Fire', frost: 'Frost', holy: 'Holy', arcane: 'Arcane',
};

// What each kind of enemy is made of (a Target can also say so itself).
const KIND_ARMOUR: [RegExp, Armour][] = [
  [/skeleton|wight|thane|hollowKnight|drowned|revenant|boneLord/i, 'bone'],
  [/wraith|spirit|ghost|shade/i, 'spirit'],
  [/armour|armor|rustKnight|knight|warden/i, 'plate'],
  [/golem|stone|scrapshell/i, 'stone'],
  [/slime|ooze|jelly/i, 'slime'],
  [/spider|urchin|scorpion|delver/i, 'chitin'],
  [/crab|brineMaw|shell/i, 'shell'],
  [/rootwarden|gnarlbark|treant|wood/i, 'wood'],
  [/wolf|greyjaw|boar|stag|bear|rat|bat|beast|shark|serpent|eel|ray|angler/i, 'hide'],
  [/bandit|pirate|scavenger|edric|morwen|orc|gorrak|goblin|snaggletooth|varga|exile|zombie/i, 'leather'],
];

export function armourOf(t: Target): Armour {
  if (t.armour) return t.armour;
  for (const [re, a] of KIND_ARMOUR) if (re.test(t.kind)) return a;
  return 'flesh';
}

/** A boss (or a boss-sized brute) by its own word or its health. */
export const isBoss = (t: Target) => !!t.boss || t.maxHp >= 700;

// ---------------------------------------------------------------------------
// Per-enemy combat state
// ---------------------------------------------------------------------------

export class CombatState {
  posture = 0;
  readonly postureMax: number;
  /** seconds since posture was last raised */
  postureIdle = 99;
  /** seconds of break left (0: standing) */
  brokenT = 0;
  poise: number;
  readonly poiseMax: number;
  poiseIdle = 99;
  /** can't be staggered again for this long */
  immuneT = 0;
  /** in the wind-up of an attack (a blow now is a counter-hit) */
  windupT = 0;
  windupKind: AttackKind = 'normal';
  /** the kind of the attack its last tell announced, until the blow has had time to land */
  armedKind: AttackKind = 'normal';
  armedT = 0;
  /** shrugs off reactions */
  superArmourT = 0;
  /** last reaction this enemy took, and how long ago */
  lastReact: Reaction = 'none';
  reactAgo = 99;
  /** a hit landed on it recently (enemy brains retaliate) */
  hurtAgo = 99;

  constructor(readonly t: Target) {
    const boss = isBoss(t);
    this.postureMax = t.postureMax ?? Math.round(boss ? Math.max(240, t.maxHp * 0.42) : Math.min(420, Math.max(36, t.maxHp * 0.62)));
    this.poiseMax = t.poiseMax ?? (boss ? 150 : t.maxHp < 70 ? 14 : t.maxHp < 160 ? 38 : t.maxHp < 400 ? 70 : 110);
    this.poise = this.poiseMax;
  }

  get broken() {
    return this.brokenT > 0;
  }
  get frac() {
    return this.posture / this.postureMax;
  }
  get superArmour() {
    return this.superArmourT > 0;
  }

  update(dt: number) {
    this.windupT = Math.max(0, this.windupT - dt);
    this.armedT = Math.max(0, this.armedT - dt);
    this.superArmourT = Math.max(0, this.superArmourT - dt);
    this.immuneT = Math.max(0, this.immuneT - dt);
    this.reactAgo += dt;
    this.hurtAgo += dt;
    this.postureIdle += dt;
    this.poiseIdle += dt;
    if (this.brokenT > 0) {
      this.brokenT -= dt;
      if (this.brokenT <= 0) {
        this.brokenT = 0;
        this.posture = this.postureMax * 0.25;
        events.emit('postureRecover', { target: this.t });
      }
      return;
    }
    // Posture drains back after a moment; a badly hurt enemy recovers slower.
    if (this.postureIdle > 1.6 && this.posture > 0) {
      const hpFrac = this.t.maxHp > 0 ? Math.max(0, this.t.hp / this.t.maxHp) : 1;
      this.posture = Math.max(0, this.posture - this.postureMax * (0.05 + 0.15 * hpFrac) * dt);
    }
    if (this.poiseIdle > 2.2) this.poise = this.poiseMax;
  }
}

const states = new WeakMap<Target, CombatState>();
/** The state if this target has fought at all (no allocation: the HUD reads it every frame). */
export function peekCombat(t: object): CombatState | undefined {
  return states.get(t as Target);
}
export function combatOf(t: Target): CombatState {
  let s = states.get(t);
  if (!s) states.set(t, (s = new CombatState(t)));
  return s;
}

/** Seconds a posture break lasts. */
const breakTime = (t: Target) => (isBoss(t) ? 3.6 : 2.8);

export const combat = {
  /** Every simulation step. */
  tick(dt: number) {
    for (const t of targets) states.get(t)?.update(dt);
  },
  /**
   * An enemy starts the wind-up of an attack: shows its tell (white parryable,
   * gold heavy, red unblockable, yellow grab) and opens the counter-hit window.
   * `armour` gives it super armour through the swing.
   */
  windup(t: Target, sec: number, kind: AttackKind = 'normal', armour = 0) {
    const s = combatOf(t);
    s.windupT = sec;
    s.windupKind = kind;
    s.armedKind = kind;
    s.armedT = sec + 1.4;
    if (armour > 0) s.superArmourT = Math.max(s.superArmourT, armour);
    events.emit('telegraph', { target: t, kind, sec });
  },
  /** The swing is out: no longer a counter-hit window. */
  release(t: Target) {
    combatOf(t).windupT = 0;
  },
  superArmour(t: Target, sec: number) {
    const s = combatOf(t);
    s.superArmourT = Math.max(s.superArmourT, sec);
  },
  broken(t: Target) {
    return states.get(t)?.broken ?? false;
  },
  /** Free to attack: not broken (enemy brains check this before a swing). */
  canAct(t: Target) {
    return !(states.get(t)?.broken ?? false);
  },
  /** Raise posture; returns true when it breaks. */
  addPosture(t: Target, amount: number, at?: THREE.Vector3): boolean {
    if (!t.alive || amount <= 0) return false;
    const s = combatOf(t);
    if (s.broken) return false;
    s.posture += amount;
    s.postureIdle = 0;
    if (s.posture < s.postureMax) return false;
    s.posture = s.postureMax;
    s.brokenT = breakTime(t);
    s.windupT = 0;
    s.superArmourT = 0;
    t.onBreak?.(s.brokenT);
    events.emit('postureBreak', { target: t, at: (at ?? t.center).clone() });
    return true;
  },
  /** The player parried (or deflected) this attacker's blow. */
  parried(attacker: Target | undefined, perfect: boolean) {
    if (!attacker?.alive) return;
    const s = combatOf(attacker);
    const boss = isBoss(attacker);
    combat.addPosture(attacker, s.postureMax * (perfect ? (boss ? 0.2 : 0.42) : boss ? 0.08 : 0.18));
  },
};

// ---------------------------------------------------------------------------
// Striking: every blow the player lands
// ---------------------------------------------------------------------------

export interface StrikeSpec {
  /** damage before type, crit and the roll */
  base: number;
  type: DmgType;
  /** stagger power */
  poise: number;
  /** posture damage (default from poise and damage) */
  posture?: number;
  /** where the attacker stands */
  from: THREE.Vector3;
  /** impact point (default the target's middle) */
  at?: THREE.Vector3;
  source: 'melee' | 'spell';
  heavy?: boolean;
  /** crit power from gear and passives (0.25 = crits hit 37% harder) */
  keen?: number;
  /** a skill or brand that always crits */
  forceCrit?: boolean;
  /** never crits (damage over time, splash) */
  noCrit?: boolean;
  /** fraction of an armour's resistance ignored */
  pierce?: number;
  /** a finisher on a broken or downed enemy */
  finisher?: boolean;
  /** at least this reaction */
  react?: Reaction;
  /** extra crit chances the weapon allows (a dagger's backstab multiplier) */
  backstabMult?: number;
  /** no damage roll (tests and finishers) */
  steady?: boolean;
  /** batters a raised guard aside */
  guardBreak?: boolean;
}

export interface StrikeResult {
  damage: number;
  crit: boolean;
  reason?: CritReason;
  react: Reaction;
  broke: boolean;
  killed: boolean;
  armour: Armour;
  /** the type's multiplier against this armour (for the "resisted"/"weak" tells) */
  typeMult: number;
}

const CRIT_MULT: Record<CritReason, number> = {
  finisher: 1, riposte: 2.4, broken: 2.0, counter: 1.5, backstab: 1.8, weakpoint: 1.6, skill: 2.0,
};
const REACT_RANK: Record<Reaction, number> = { none: 0, stagger: 1, knockdown: 2 };
const maxReact = (a: Reaction, b: Reaction) => (REACT_RANK[a] >= REACT_RANK[b] ? a : b);

/** Facing of a target that has one (radians, 0 = +Z). */
function facingOf(t: Target): THREE.Vector3 | null {
  return typeof t.yaw === 'number' ? new THREE.Vector3(Math.sin(t.yaw), 0, Math.cos(t.yaw)) : null;
}

/** Is `from` behind the target (within a 100 degree cone at its back)? */
export function behind(t: Target, from: THREE.Vector3) {
  const f = facingOf(t);
  if (!f) return false;
  const to = from.clone().sub(t.position).setY(0);
  if (to.lengthSq() < 1e-4) return false;
  return to.normalize().dot(f) < -0.64;
}

/** Land a blow on a target: crits, damage type, posture, reaction, then the target's own takeHit. */
export function strike(t: Target, s: StrikeSpec): StrikeResult {
  const st = combatOf(t);
  const armour = armourOf(t);
  const dir = t.position.clone().sub(s.from).setY(0);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  const at = s.at ?? t.center.clone().addScaledVector(dir, -t.radius * 0.8);

  // Crits: from play, never dice.
  let reason: CritReason | undefined;
  if (s.finisher) reason = 'finisher';
  else if (!s.noCrit) {
    if (st.broken) reason = 'broken';
    else if (t.stunned) reason = 'riposte';
    else if (st.windupT > 0 && s.source === 'melee') reason = 'counter';
    else if (s.source === 'melee' && behind(t, s.from)) reason = 'backstab';
    else if (t.weakPoint?.(at)) reason = 'weakpoint';
    else if (s.forceCrit) reason = 'skill';
  }
  let critMult = reason ? CRIT_MULT[reason] : 1;
  if (reason === 'backstab' && s.backstabMult) critMult *= s.backstabMult;
  if (reason && reason !== 'finisher') critMult *= 1 + (s.keen ?? 0) * 1.5;

  // Damage type against what it's made of.
  let typeMult = RESIST[armour][s.type] ?? 1;
  if (typeMult < 1 && s.pierce) typeMult += (1 - typeMult) * Math.min(1, s.pierce);
  const roll = s.steady ? 1 : 0.94 + Math.random() * 0.12;
  const damage = Math.max(1, Math.round(s.base * typeMult * critMult * roll));

  // Posture: blunt and counter-hits pile it on.
  let posture = s.posture ?? s.poise * 0.7 + s.base * 0.18;
  if (s.type === 'blunt') posture *= 1.35;
  if (reason === 'counter') posture *= 1.7;
  if (reason === 'backstab') posture *= 1.3;
  if (s.heavy) posture *= 1.2;
  st.hurtAgo = 0;
  const broke = s.finisher ? false : combat.addPosture(t, posture, at);

  // Reaction: the poise pool, super armour, a stagger cooldown.
  let react: Reaction = 'none';
  if (broke) react = 'knockdown';
  else if (!st.superArmour || s.finisher) {
    st.poiseIdle = 0;
    if (st.immuneT <= 0) {
      st.poise -= s.poise * (s.type === 'blunt' ? 1.25 : 1);
      if (st.poise <= 0) {
        react = s.poise >= 80 || (s.heavy && st.poiseMax < 60) ? 'knockdown' : 'stagger';
        st.poise = st.poiseMax;
      }
    }
    if (reason === 'counter') react = maxReact(react, 'stagger');
    if (s.react) react = maxReact(react, s.react);
  }
  if (react !== 'none') {
    st.immuneT = react === 'knockdown' ? 1.6 : 1.1;
    st.lastReact = react;
    st.reactAgo = 0;
    st.windupT = 0;
  }

  // The target's own response. Older enemies read poise thresholds: a blow that
  // didn't get through the pool reaches them as no stagger at all.
  const own = !!t.ownPoise;
  const poise = own ? s.poise * (reason === 'counter' ? 1.6 : 1) : react === 'none' ? 0 : Math.max(s.poise, 60) * (react === 'knockdown' ? 2 : 1);
  const hit: HitInfo = { damage, poise, dir, at, crit: !!reason, source: s.source, react, type: s.type, reason, broke, guardBreak: s.guardBreak };
  t.takeHit(hit);
  const killed = !t.alive;
  events.emit('strike', { target: t, at, damage, crit: !!reason, reason, react, broke, armour, type: s.type, heavy: !!s.heavy, typeMult, killed });
  return { damage, crit: !!reason, reason, react, broke, killed, armour, typeMult };
}

/** A broken (or downed, riposte-open) enemy in front of the player: a finisher is on. */
export function finisherOpen(t: Target) {
  return t.alive && (combat.broken(t) || t.stunned);
}
