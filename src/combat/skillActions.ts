import { ACTIONS, type ActionDef } from './actions';

// Actions for class skills. Each plays a motion-captured clip (times are in
// clip seconds; clipTiming.speed plays it faster or slower) and names the
// moments the skill runtime (paths/skills.ts) reacts to: a blade of wind
// leaving the sword, a shield slamming the ground, a spell leaving the hand.
// `hit` uses the normal blade sweep; `events` drive everything else.

type Def = Omit<ActionDef, 'id'>;
const ev = (name: string, ...at: number[]) => at.map((t) => ({ at: t, name }));

const DEFS: Record<string, Def> = {
  // ---- Gale Style ---------------------------------------------------------------
  sk_galeStep: {
    dur: 1.29, stamina: 0, clip: 'attack_sprint', weaponSpeed: true,
    hit: { from: 0.4, to: 0.78, dmg: 1.5, poise: 50, hand: 'main' },
    iframes: [0.02, 0.72], boost: { dist: 3.2, from: 0.04, to: 0.55 }, events: ev('galeStep', 0.02),
    cancel: 0.9, track: 0.28, clipTiming: { speed: 1.2 },
  },
  sk_crescent: {
    dur: 2.29, stamina: 0, clip: 'skill_spin', events: [...ev('crescent', 0.62, 1.32)],
    cancel: 1.75, track: 0.5, clipTiming: { speed: 1.35 },
  },
  sk_cyclone: {
    dur: 2.29, stamina: 0, clip: 'skill_spin', events: ev('cyclone', 0.35, 0.6, 0.85, 1.1, 1.35, 1.6, 1.85, 2.05),
    boost: { dist: 2.4, from: 0.1, to: 2.1 }, cancel: 2.1, track: 2.0, clipTiming: { speed: 1.7 },
  },
  sk_severingArc: {
    dur: 1.0, stamina: 0, clip: 'attack_light_2', weaponSpeed: true,
    hit: { from: 0.34, to: 0.54, dmg: 0.8, poise: 20, hand: 'main' }, events: ev('arc', 0.42),
    cancel: 0.6, track: 0.4, clipTiming: { speed: 1.1 },
  },
  sk_moonlit: {
    dur: 1.71, stamina: 0, clip: 'attack_heavy', events: [...ev('moonlitCharge', 0.05), ...ev('moonlit', 0.66)],
    cancel: 1.25, track: 0.5, clipTiming: { speed: 0.85 },
  },
  sk_razorGale: {
    dur: 3.5, stamina: 0, clip: 'skill_combo', events: ev('razor', 0.7, 1.26, 2.45),
    cancel: 2.9, track: 2.3, clipTiming: { speed: 1.15 },
  },
  sk_counter: {
    dur: 0.62, stamina: 0, clip: 'parry_shield', events: ev('counter', 0.05), cancel: 0.3, track: 0.1,
  },
  sk_riposte: {
    dur: 1.54, stamina: 0, clip: 'attack_light_3', weaponSpeed: true,
    hit: { from: 0.72, to: 0.95, dmg: 1.7, poise: 80, hand: 'main' }, boost: { dist: 1.2, from: 0.45, to: 0.75 }, events: ev('riposte', 0.7),
    cancel: 1.05, track: 0.6, clipTiming: { speed: 1.25 },
  },
  sk_lparry: {
    dur: 0.62, stamina: 0, clip: 'parry_shield', parry: [0.02, 0.42], events: ev('lparry', 0.02), cancel: 0.42, track: 0.1,
  },
  sk_thousandCuts: {
    dur: 3.5, stamina: 0, clip: 'skill_combo', iframes: [0, 3.3], events: ev('cuts', 0.45, 0.7, 0.95, 1.26, 1.6, 1.95, 2.3, 2.6),
    cancel: 3.2, track: 3.2, clipTiming: { speed: 1.5 },
  },
  // ---- Boundary Style --------------------------------------------------------------
  sk_guardUp: { dur: 0.62, stamina: 0, clip: 'parry_shield', events: ev('guard', 0.12), cancel: 0.36, track: 0.1 },
  sk_deflect: { dur: 0.62, stamina: 0, clip: 'parry_shield', parry: [0.02, 0.5], events: ev('deflect', 0.02), cancel: 0.45, track: 0.1 },
  sk_bash: {
    dur: 1.17, stamina: 0, clip: 'kick', boost: { dist: 0.9, from: 0.15, to: 0.38 }, events: ev('bash', 0.34), cancel: 0.72, track: 0.3,
  },
  sk_bullRush: {
    dur: 1.29, stamina: 0, clip: 'attack_sprint', boost: { dist: 5.5, from: 0.04, to: 0.8 },
    events: ev('rush', 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8), cancel: 1.0, track: 0.12,
  },
  sk_quake: { dur: 1.71, stamina: 0, clip: 'attack_heavy', events: ev('quake', 0.8), cancel: 1.25, track: 0.5 },
  sk_warcry: { dur: 2.96, stamina: 0, clip: 'cast_big', events: ev('warcry', 1.0), cancel: 2.0, track: 0.3, clipTiming: { speed: 2.0 } },
  sk_vow: { dur: 2.33, stamina: 0, clip: 'cast_heal', events: ev('vow', 0.6), cancel: 1.3, track: 0, clipTiming: { speed: 1.7 } },
  // ---- magic ---------------------------------------------------------------------------
  /** quick one-handed cast: bolts, marks, blinks */
  sk_cast: { dur: 1.0, stamina: 0, clip: 'cast_fireball', events: ev('cast', 0.42), cancel: 0.62, track: 0.42 },
  /** two-handed channel: meteors, storms, domes */
  sk_castBig: { dur: 2.96, stamina: 0, clip: 'cast_big', events: ev('cast', 1.35), cancel: 2.2, track: 1.2, clipTiming: { speed: 1.5 } },
  /** prayer: heals, wards, blessings */
  sk_castSelf: { dur: 2.33, stamina: 0, clip: 'cast_heal', events: ev('cast', 0.55), cancel: 1.3, track: 0, clipTiming: { speed: 1.7 } },
  /** a dodge that is also a spell (Flame Step) */
  sk_dash: {
    ...ACTIONS.roll, stamina: 0, dur: 1.95, clip: 'roll', startAt: 0.22, iframes: [0.25, 1.2], roll: { dist: 4.6 },
    boost: { dist: 2.2, from: 0.3, to: 0.9 }, events: ev('cast', 0.3, 0.55, 0.8, 1.05), cancel: 1.5, track: 0.3, clipTiming: { speed: 1.8 },
  },
};

for (const [id, d] of Object.entries(DEFS)) ACTIONS[id] = { id, ...d };

export const SKILL_ACTION_IDS = Object.keys(DEFS);
