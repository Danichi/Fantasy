import { sampleF, sampleV3, type HandPose, type ProcPose, type V3 } from '../player/rigLayer';

// ---------------------------------------------------------------------------
// Player actions. Times are in seconds at 1x speed. `clip` names a Mixamo clip
// from the manifest; when that clip exists it drives the body and `proc` is
// ignored. Otherwise `proc` poses the arms/spine with IK so every action is
// playable on the placeholder rig. Timing windows (hit, parry, i-frames,
// combo, cancel) always come from here: tune them once real clips arrive.
// ---------------------------------------------------------------------------

export interface ActionDef {
  id: string;
  dur: number;
  stamina: number;
  clip?: string;
  proc?: (t: number) => ProcPose; // t normalised 0..1
  hit?: { from: number; to: number; dmg: number; poise: number; hand: 'main' | 'off' };
  combo?: { next: string; from: number };
  heavyFrom?: string; // light attack that turns into this heavy if held
  cancel: number; // dodge may interrupt after this time
  move?: { dist: number; from: number; to: number };
  track: number; // may turn toward target/input until this time
  iframes?: [number, number];
  parry?: [number, number];
  roll?: { dist: number; back?: boolean };
  event?: { at: number; name: 'fireball' | 'heal' };
  weaponSpeed?: boolean;
  /** charge: hold the pose at this normalised time while the button is held */
  chargeAt?: number;
  /** start the action at this time (seconds) */
  startAt?: number;
  /** airborne action: gravity keeps acting; lands with a shockwave */
  air?: boolean;
  /** timing for the real Mixamo clip (measured from the clip), replacing the procedural timing */
  clipTiming?: Partial<Omit<ActionDef, 'id' | 'clip' | 'proc' | 'clipTiming'>> & { speed?: number };
}

/** The effective definition: real-clip timing when that clip is loaded. */
export function resolveAction(def: ActionDef, hasClip: boolean): ActionDef {
  return hasClip && def.clipTiming ? { ...def, ...def.clipTiming } : def;
}

// ---- pose building blocks (character space: +Z forward, +X left) ----------
const n = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

export const GUARD_R: HandPose = {
  grip: [-0.2, 1.02, 0.3],
  dir: n([0.12, 0.8, 0.6]),
  normal: [1, 0, -0.15],
  w: 1,
};
export const SHIELD_CARRY_L: HandPose = {
  grip: [0.24, 1.0, 0.24],
  dir: n([0, 1, 0.15]),
  normal: n([-0.6, 0, -0.8]),
  w: 1,
  pole: [0.7, 0.6, -0.2],
};
export const SHIELD_BLOCK_L: HandPose = {
  grip: [0.1, 1.24, 0.36],
  dir: n([0, 1, 0.12]),
  normal: n([0.2, -0.05, -1]),
  w: 1,
  pole: [0.8, 0.9, 0.0],
};
export const OFFHAND_GUARD_L: HandPose = {
  grip: [0.22, 1.0, 0.3],
  dir: n([-0.12, 0.8, 0.6]),
  normal: [-1, 0, -0.15],
  w: 1,
};

type Key<T> = [number, T];
interface HandTrack {
  grip: Key<V3>[];
  dir: Key<V3>[];
  normal: Key<V3>[];
  pole?: V3;
}

function hand(track: HandTrack, t: number): HandPose {
  return { grip: sampleV3(track.grip, t), dir: n(sampleV3(track.dir, t)), normal: n(sampleV3(track.normal, t)), w: 1, pole: track.pole };
}

function mirrorV(v: V3): V3 {
  return [-v[0], v[1], v[2]];
}
function mirrorHand(h: HandPose): HandPose {
  return { ...h, grip: mirrorV(h.grip), dir: mirrorV(h.dir), normal: mirrorV(h.normal), pole: h.pole && mirrorV(h.pole) };
}
/** Mirror a right-handed pose onto the left hand (for off-hand attacks). */
export function mirrorPose(p: ProcPose): ProcPose {
  return {
    ...p,
    spineYaw: p.spineYaw && -p.spineYaw,
    spineRoll: p.spineRoll && -p.spineRoll,
    left: p.right && mirrorHand(p.right),
    right: p.left && mirrorHand(p.left),
  };
}

const G = GUARD_R;

// Horizontal forehand: right shoulder -> across the body to the left.
const SLASH1: HandTrack = {
  grip: [[0, G.grip], [0.26, [-0.42, 1.36, -0.02]], [0.36, [-0.44, 1.26, 0.28]], [0.44, [-0.08, 1.2, 0.56]], [0.54, [0.32, 1.1, 0.34]], [0.72, [0.24, 1.0, 0.24]], [1, G.grip]],
  dir: [[0, G.dir], [0.26, [-0.55, 0.35, -0.75]], [0.36, [-0.95, 0.12, 0.1]], [0.44, [0, 0.05, 1]], [0.54, [0.9, -0.05, 0.25]], [0.72, [0.7, 0.3, 0.3]], [1, G.dir]],
  normal: [[0, G.normal], [0.26, [0, 1, 0]], [0.54, [0, 1, 0.1]], [0.72, [0.4, 0.6, -0.2]], [1, G.normal]],
};
// Rising backhand diagonal: low left -> high right.
const SLASH2: HandTrack = {
  grip: [[0, G.grip], [0.24, [0.26, 0.92, 0.18]], [0.38, [0.1, 1.05, 0.52]], [0.48, [-0.28, 1.35, 0.46]], [0.58, [-0.42, 1.52, 0.18]], [0.78, [-0.3, 1.2, 0.2]], [1, G.grip]],
  dir: [[0, G.dir], [0.24, [0.75, -0.45, -0.3]], [0.38, [0.45, -0.3, 0.85]], [0.48, [-0.45, 0.35, 0.8]], [0.58, [-0.7, 0.65, -0.2]], [0.78, [-0.3, 0.9, 0.2]], [1, G.dir]],
  normal: [[0, G.normal], [0.24, n([0.5, 0.6, 0.6])], [0.48, n([0.55, 0.75, -0.1])], [0.78, [0.6, 0.2, -0.5]], [1, G.normal]],
};
// Overhead vertical chop.
const SLASH3: HandTrack = {
  grip: [[0, G.grip], [0.3, [-0.14, 1.72, -0.06]], [0.4, [-0.1, 1.68, 0.28]], [0.5, [-0.06, 1.36, 0.58]], [0.58, [-0.06, 0.96, 0.52]], [0.76, [-0.1, 0.92, 0.44]], [1, G.grip]],
  dir: [[0, G.dir], [0.3, [0, 0.4, -0.9]], [0.4, [0, 1, 0.15]], [0.5, [0, 0.2, 1]], [0.58, [0, -0.7, 0.7]], [0.76, [0, -0.6, 0.8]], [1, G.dir]],
  normal: [[0, G.normal], [0.3, [1, 0, 0]], [0.76, [1, 0, 0]], [1, G.normal]],
};
// Charged overhead (heavy): bigger windup, deeper follow-through.
const HEAVY: HandTrack = {
  grip: [[0, G.grip], [0.3, [-0.2, 1.8, -0.14]], [0.52, [-0.12, 1.78, -0.1]], [0.62, [-0.06, 1.5, 0.52]], [0.7, [-0.04, 0.9, 0.6]], [0.86, [-0.1, 0.86, 0.46]], [1, G.grip]],
  dir: [[0, G.dir], [0.3, [0, 0.2, -1]], [0.52, [0, 0.15, -1]], [0.62, [0, 0.6, 0.8]], [0.7, [0, -0.75, 0.66]], [0.86, [0, -0.7, 0.7]], [1, G.dir]],
  normal: [[0, G.normal], [0.3, [1, 0, 0]], [0.86, [1, 0, 0]], [1, G.normal]],
};
// Spell thrust: draw back, then drive the blade forward as a focus.
const CAST: HandTrack = {
  grip: [[0, G.grip], [0.32, [-0.34, 1.32, 0.02]], [0.48, [-0.14, 1.42, 0.6]], [0.75, [-0.14, 1.4, 0.58]], [1, G.grip]],
  dir: [[0, G.dir], [0.32, [0, 1, -0.1]], [0.48, [0, 0.35, 1]], [0.75, [0, 0.35, 1]], [1, G.dir]],
  normal: [[0, G.normal], [1, G.normal]],
};
// Salute for the healing prayer: blade upright before the face.
const HEAL: HandTrack = {
  grip: [[0, G.grip], [0.3, [-0.06, 1.3, 0.3]], [0.8, [-0.06, 1.32, 0.3]], [1, G.grip]],
  dir: [[0, G.dir], [0.3, [0, 1, 0.02]], [0.8, [0, 1, 0.02]], [1, G.dir]],
  normal: [[0, G.normal], [0.3, [0, 0, 1]], [0.8, [0, 0, 1]], [1, G.normal]],
};
const SHIELD_PARRY: HandTrack = {
  grip: [[0, SHIELD_CARRY_L.grip], [0.14, [0.34, 1.12, 0.3]], [0.3, [-0.06, 1.32, 0.5]], [0.55, [0.0, 1.28, 0.46]], [1, SHIELD_CARRY_L.grip]],
  dir: [[0, SHIELD_CARRY_L.dir], [0.14, [0.3, 1, 0.1]], [0.3, [-0.35, 1, 0.2]], [0.55, [-0.2, 1, 0.2]], [1, SHIELD_CARRY_L.dir]],
  normal: [[0, SHIELD_CARRY_L.normal], [0.14, n([-0.7, 0, -0.6])], [0.3, n([0.45, 0, -0.9])], [0.55, n([0.3, 0, -1])], [1, SHIELD_CARRY_L.normal]],
  pole: [0.8, 0.8, -0.1],
};

const spine = (keys: Key<number>[], t: number) => sampleF(keys, t);

function slashPose(track: HandTrack, yaw: Key<number>[], pitch: Key<number>[], drop: Key<number>[]) {
  return (t: number): ProcPose => ({
    right: hand(track, t),
    spineYaw: spine(yaw, t),
    spinePitch: spine(pitch, t),
    hipsDrop: spine(drop, t),
  });
}

const slash1 = slashPose(SLASH1, [[0, 0], [0.26, -0.6], [0.44, 0.1], [0.56, 0.5], [0.8, 0.15], [1, 0]], [[0, 0], [0.44, 0.15], [1, 0]], [[0, 0], [0.44, 0.06], [1, 0]]);
const slash2 = slashPose(SLASH2, [[0, 0], [0.24, 0.5], [0.46, 0], [0.6, -0.5], [0.85, -0.1], [1, 0]], [[0, 0], [0.24, 0.2], [0.5, 0.05], [1, 0]], [[0, 0], [0.24, 0.07], [0.6, 0.02], [1, 0]]);
const slash3 = slashPose(SLASH3, [[0, 0], [0.3, -0.2], [0.55, 0.05], [1, 0]], [[0, 0], [0.3, -0.22], [0.58, 0.4], [0.8, 0.25], [1, 0]], [[0, 0], [0.3, 0], [0.58, 0.1], [1, 0]]);
const heavy = slashPose(HEAVY, [[0, 0], [0.3, -0.3], [0.62, 0.05], [1, 0]], [[0, 0], [0.3, -0.35], [0.52, -0.35], [0.7, 0.55], [0.86, 0.4], [1, 0]], [[0, 0], [0.52, 0.02], [0.7, 0.16], [0.86, 0.12], [1, 0]]);

export const ACTIONS: Record<string, ActionDef> = {
  // ---- main-hand light combo -------------------------------------------------
  slash1: {
    id: 'slash1', dur: 0.95, stamina: 14, clip: 'attack_light_1', proc: slash1,
    hit: { from: 0.36, to: 0.52, dmg: 1, poise: 20, hand: 'main' },
    combo: { next: 'slash2', from: 0.5 }, cancel: 0.62,
    move: { dist: 0.55, from: 0.28, to: 0.5 }, track: 0.32, weaponSpeed: true,
    clipTiming: { dur: 1.5, hit: { from: 0.5, to: 0.72, dmg: 1, poise: 20, hand: 'main' }, combo: { next: 'slash2', from: 0.7 }, cancel: 0.82, track: 0.45, speed: 1.15 },
  },
  slash2: {
    id: 'slash2', dur: 0.95, stamina: 14, clip: 'attack_light_2', proc: slash2,
    hit: { from: 0.36, to: 0.54, dmg: 1.05, poise: 20, hand: 'main' },
    combo: { next: 'slash3', from: 0.52 }, cancel: 0.64,
    move: { dist: 0.5, from: 0.26, to: 0.5 }, track: 0.32, weaponSpeed: true,
    clipTiming: { dur: 1.0, hit: { from: 0.34, to: 0.54, dmg: 1.05, poise: 20, hand: 'main' }, combo: { next: 'slash3', from: 0.55 }, cancel: 0.62, track: 0.3, speed: 1.1 },
  },
  slash3: {
    id: 'slash3', dur: 1.15, stamina: 18, clip: 'attack_light_3', proc: slash3,
    hit: { from: 0.5, to: 0.66, dmg: 1.35, poise: 35, hand: 'main' },
    combo: { next: 'slash1', from: 0.78 }, cancel: 0.8,
    move: { dist: 0.8, from: 0.4, to: 0.64 }, track: 0.42, weaponSpeed: true,
    clipTiming: { dur: 1.54, hit: { from: 0.72, to: 0.95, dmg: 1.35, poise: 35, hand: 'main' }, combo: { next: 'slash1', from: 1.02 }, cancel: 1.08, track: 0.6, speed: 1.1 },
  },
  heavy: {
    id: 'heavy', dur: 1.55, stamina: 28, clip: 'attack_heavy', proc: heavy,
    hit: { from: 0.94, to: 1.1, dmg: 2.3, poise: 70, hand: 'main' },
    cancel: 1.2, chargeAt: 0.5,
    move: { dist: 1.1, from: 0.82, to: 1.05 }, track: 0.9, weaponSpeed: true,
    clipTiming: { dur: 1.71, hit: { from: 0.55, to: 0.95, dmg: 2.3, poise: 70, hand: 'main' }, chargeAt: 0.26, cancel: 1.25, track: 0.5 },
  },
  sprintAttack: {
    id: 'sprintAttack', dur: 1.15, stamina: 20, clip: 'attack_sprint', proc: slash3,
    hit: { from: 0.5, to: 0.66, dmg: 1.5, poise: 45, hand: 'main' },
    cancel: 0.85, move: { dist: 2.4, from: 0.05, to: 0.6 }, track: 0.25, weaponSpeed: true,
    clipTiming: { dur: 1.29, hit: { from: 0.45, to: 0.75, dmg: 1.5, poise: 45, hand: 'main' }, cancel: 0.95, track: 0.25 },
  },
  airAttack: {
    id: 'airAttack', dur: 1.55, stamina: 16, clip: 'attack_plunge', proc: heavy, air: true, startAt: 0.75,
    hit: { from: 0.9, to: 1.15, dmg: 1.7, poise: 55, hand: 'main' },
    cancel: 1.3, track: 1.0, weaponSpeed: true,
    clipTiming: { dur: 2.33, startAt: 0.95, hit: { from: 1.0, to: 1.32, dmg: 1.7, poise: 55, hand: 'main' }, cancel: 1.75, track: 1.1 },
  },
  // ---- off-hand (dual wield) -------------------------------------------------
  offslash1: {
    id: 'offslash1', dur: 0.85, stamina: 12, clip: 'attack_off_1', proc: (t) => mirrorPose(slash1(t)),
    hit: { from: 0.32, to: 0.48, dmg: 0.85, poise: 14, hand: 'off' },
    combo: { next: 'offslash2', from: 0.46 }, cancel: 0.55,
    move: { dist: 0.45, from: 0.25, to: 0.46 }, track: 0.3, weaponSpeed: true,
  },
  offslash2: {
    id: 'offslash2', dur: 0.85, stamina: 12, clip: 'attack_off_2', proc: (t) => mirrorPose(slash2(t)),
    hit: { from: 0.32, to: 0.5, dmg: 0.9, poise: 14, hand: 'off' },
    combo: { next: 'offslash1', from: 0.48 }, cancel: 0.56,
    move: { dist: 0.45, from: 0.24, to: 0.46 }, track: 0.3, weaponSpeed: true,
  },
  // ---- defence ----------------------------------------------------------------
  parryShield: {
    id: 'parryShield', dur: 0.75, stamina: 12, clip: 'parry_shield',
    proc: (t) => ({ left: hand(SHIELD_PARRY, t), right: GUARD_R, spineYaw: sampleF([[0, 0], [0.14, -0.25], [0.3, 0.35], [1, 0]], t) }),
    parry: [0.05, 0.32], cancel: 0.5, track: 0.1,
    clipTiming: { dur: 0.62, parry: [0.03, 0.3], cancel: 0.42 },
  },
  parryDual: {
    id: 'parryDual', dur: 0.7, stamina: 12, clip: 'parry_dual',
    proc: (t) => {
      const w = sampleF([[0, 0], [0.18, 1], [0.6, 1], [1, 0]], t);
      return {
        right: { grip: [-0.08, 1.36, 0.42], dir: n([0.6, 0.72, 0.3]), normal: n([0, -0.3, 1]), w },
        left: { grip: [0.08, 1.34, 0.42], dir: n([-0.6, 0.72, 0.3]), normal: n([0, -0.3, 1]), w },
        spinePitch: 0.1 * w,
      };
    },
    parry: [0.07, 0.26], cancel: 0.46, track: 0.1,
  },
  // ---- movement ---------------------------------------------------------------
  roll: {
    id: 'roll', dur: 0.78, stamina: 18, clip: 'roll',
    iframes: [0.06, 0.46], roll: { dist: 4.6 }, cancel: 0.62, track: 0.02,
  },
  backstep: {
    id: 'backstep', dur: 0.5, stamina: 12, clip: 'backstep',
    iframes: [0.04, 0.24], roll: { dist: 1.9, back: true }, cancel: 0.36, track: 0,
    proc: (t) => ({ spinePitch: sampleF([[0, 0], [0.3, -0.2], [1, 0]], t), hipsDrop: sampleF([[0, 0], [0.3, 0.08], [1, 0]], t) }),
  },
  // ---- magic ------------------------------------------------------------------
  castFireball: {
    id: 'castFireball', dur: 1.0, stamina: 0, clip: 'cast_fireball',
    proc: (t) => ({ right: hand(CAST, t), spineYaw: sampleF([[0, 0], [0.32, -0.35], [0.48, 0.12], [1, 0]], t), spinePitch: sampleF([[0, 0], [0.48, 0.12], [1, 0]], t) }),
    event: { at: 0.48, name: 'fireball' }, cancel: 0.7, track: 0.46,
    clipTiming: { dur: 1.0, event: { at: 0.42, name: 'fireball' }, cancel: 0.7, track: 0.42 },
  },
  castHeal: {
    id: 'castHeal', dur: 1.3, stamina: 0, clip: 'cast_heal',
    proc: (t) => ({ right: hand(HEAL, t), headPitch: sampleF([[0, 0], [0.3, 0.25], [0.8, 0.25], [1, 0]], t) }),
    event: { at: 0.45, name: 'heal' }, cancel: 1.0, track: 0,
    clipTiming: { dur: 2.33, event: { at: 0.55, name: 'heal' }, cancel: 1.5, speed: 1.35 },
  },
  // ---- reactions --------------------------------------------------------------
  stagger: {
    id: 'stagger', dur: 0.55, stamina: 0, clip: 'hit_react', cancel: 0.55, track: 0,
    clipTiming: { dur: 0.67, cancel: 0.5 },
    proc: (t) => ({ spinePitch: sampleF([[0, 0], [0.12, -0.35], [0.5, -0.1], [1, 0]], t), spineRoll: sampleF([[0, 0], [0.12, 0.15], [1, 0]], t), hipsDrop: sampleF([[0, 0], [0.12, 0.08], [1, 0]], t) }),
  },
  guardBreak: {
    id: 'guardBreak', dur: 1.1, stamina: 0, clip: 'guard_break', cancel: 1.1, track: 0,
    clipTiming: { dur: 0.95, cancel: 0.95 },
    proc: (t) => ({ spinePitch: sampleF([[0, 0], [0.15, -0.45], [0.7, -0.3], [1, 0]], t), hipsDrop: sampleF([[0, 0], [0.15, 0.12], [1, 0]], t), left: { ...SHIELD_CARRY_L, grip: [0.4, 1.2, 0.0], w: sampleF([[0, 0], [0.15, 1], [0.8, 1], [1, 0]], t) } }),
  },
};

export const LIGHT_COMBO_START = 'slash1';
export const OFF_COMBO_START = 'offslash1';
