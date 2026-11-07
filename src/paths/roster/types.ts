import type { Style } from '../../magic/circles';
import type { NumMod } from '../effects';
import type { Kind, Rider, Spec } from '../classes/forge';

// The class roster (docs/design/classes.md): every class added in the
// classes update is one ClassSpec. The registry (index.ts) turns specs into
// disciplines, trees, forged techniques, passives, Ascensions and field
// abilities; the engine (engine.ts) runs their mechanics.

export type Mods = Partial<Record<NumMod, number>>;

/** What builds a class resource or lays its mark. */
export type Trigger =
  | 'hit' // a blow with the class's weapon (any blow if it names none)
  | 'heavy' // a heavy blow
  | 'crit' // a critical blow
  | 'air' // a blow struck in mid-air
  | 'back' // a blow from behind
  | 'shot' // an arrow or bolt that lands
  | 'spell' // one of the class's own techniques landing
  | 'cast' // using one of the class's techniques
  | 'kill' // an enemy dies
  | 'dodge' // a perfect dodge
  | 'parry' // a parry
  | 'hurt' // being hit
  | 'block'; // a blow blocked

export type FullKind = 'blast' | 'buff' | 'heal' | 'volley' | 'chain' | 'summon' | 'execute';

/** What a full resource releases. */
export interface FullSpec {
  kind: FullKind;
  name: string;
  /** 'next': the next blow, shot or spell of the class releases it; 'auto': at once */
  when: 'next' | 'auto';
  style: Style;
  /** damage: % of weapon damage for combat classes, spell base for magic */
  d?: number;
  r?: number;
  n?: number;
  t?: number;
  fx?: Rider;
  m?: Mods;
  /** summon: which allies */
  ally?: 'skeleton' | 'beast' | 'drowned' | 'wolf' | 'watchman';
}

/** A mark the class lays on enemies. */
export interface MarkSpec {
  name: string;
  on: Trigger;
  /** stacks for the mark to trigger */
  at: number;
  /** each stack: the enemy takes this much more damage from you */
  per: number;
  /** what happens at the last stack */
  burst: 'blast' | 'stun' | 'execute' | 'bleed' | 'root';
  style: Style;
  /** seconds a stack lasts */
  time?: number;
}

export interface MechSpec {
  /** the resource's name, as the HUD shows it */
  res: string;
  color: string;
  max?: number;
  pips?: boolean;
  /** how much each trigger gives */
  gain: Partial<Record<Trigger, number>>;
  /** weapon families whose blows count (none: any weapon, or bare hands) */
  weapon?: string[];
  /** per second lost after 4 s without gaining (default 6% of max); 0: never */
  decay?: number;
  /** per second gained all the time */
  regen?: number;
  /** what the resource gives at full (scaled by how full it is) */
  per?: Mods;
  full?: FullSpec;
  mark?: MarkSpec;
  /** below this share of health: these mods */
  low?: { below: number; m: Mods };
  /** using a technique costs this share of your health (and gives `gain.cast`) */
  castHp?: number;
  /** chance (0-1) a kill raises an ally for 12 s */
  raise?: { chance: number; ally: 'skeleton' | 'beast' | 'drowned' | 'wolf' | 'watchman'; d: number };
}

export type FieldKind = 'airJump' | 'glide' | 'light' | 'swim' | 'stride' | 'locks' | 'force';
export interface FieldSpec {
  name: string;
  kind: FieldKind;
  text: string;
}

/** One technique: a forge spec (the archetype and numbers). */
export type SkillSpec = Spec;

export type Tier = 'foundation' | 'advanced' | 'hybrid' | 'hidden' | 'origin';

/** [branch name, what it is about, tiers (5 rows of names), capstone]. '*' skill, '!' keystone, '?' choice "A|B". */
export type BranchSpec = [string, string, string[][], string];

export interface AscSpec {
  name: string;
  flavour: string;
  /** four node names */
  nodes: [string, string, string, string];
  /** 'edge' leans to damage and the release; 'guard' to staying alive and the mark */
  lean: 'edge' | 'guard';
}

export interface TrialSpec {
  /** what to do: a counted signal fed by the engine, or kills */
  count: number;
  /** an existing quest signal that counts instead (fish caught, herbs gathered...) */
  signal?: string;
  /** the quest log's region for it */
  region?: string;
  /** signal: the trigger that counts (with the class's weapon) */
  on?: Trigger;
  /** kills of this kind instead ('any' for any foe) */
  kill?: string;
  text: string;
  offer: string;
  accept: string;
  reply: string;
  say: string;
}

export interface ClassSpec {
  id: string;
  fam: 'combat' | 'magic';
  tier: Tier;
  name: string;
  color: string;
  icon?: string;
  mentor: string;
  mentorNpc?: string;
  requires?: [string, number];
  also?: [string, number];
  origin?: string;
  gateFrom?: string;
  flavour: string;
  how: string;
  core: string;
  /** one or two sentences: what the class is, before the mechanic's numbers */
  lead: string;
  mech: MechSpec;
  field?: FieldSpec;
  trial?: TrialSpec;
  tree: [BranchSpec, BranchSpec, BranchSpec];
  /** every '*' node and capstone in the tree */
  skills: Record<string, SkillSpec>;
  asc: [AscSpec, AscSpec];
  /** a class already in data.ts (a gateway class): only its mechanic, passives, Ascensions and teacher come from here */
  overlay?: boolean;
  /** a hidden teacher waiting somewhere in the world */
  teacher?: TeacherSpec;
}

export interface TeacherSpec {
  npc: string;
  name: string;
  title: string;
  /** world x, z */
  at: [number, number];
  /** where, in words (told when the gateway opens) */
  where: string;
  /** what they say before you are ready, and when you are */
  idle: string;
  look: 'robed' | 'armoured' | 'hooded' | 'wild';
  cloth: number;
}

/** A technique in one line: archetype, school, cooldown, the line it says, then numbers. */
export const k = (kind: Kind, s: Style, cd: number, say: string, o: Partial<Spec> = {}): Spec => ({ k: kind, s, cd, say, ...o });
