import { events } from '../core/events';
import { DISC, DISCIPLINES, type DisciplineDef, type Family } from './data';
import { MASTERY_NAMES, masteryRank, type Paths } from './paths';
import type { NumMod } from './effects';

// Mastery (skill trees and mastery revamp). Level is bought; mastery is
// earned, only by doing the thing: landing blows with a fighting style while
// it is your active one, casting a school's spells, working at a Calling's
// station, gathering and brewing, exploring the deep places. Every rank still
// makes that discipline's levels cheaper, and now ranks also unlock perks:
// a family's common ones (Novice, Apprentice, Adept, Expert, Master) and two
// of the discipline's own, at Adept and at Grandmaster.

export interface Perk {
  rank: number;
  text: string;
  /** combat modifiers (combat styles only while active; magic always) */
  m?: Partial<Record<NumMod, number>>;
  /** named effects: the skill runtime's keys, or a Calling's crafting keys */
  x?: Record<string, number>;
}

const FAMILY_PERKS: Record<Exclude<Family, 'legacy'>, Perk[]> = {
  combat: [
    { rank: 1, text: '+3% damage while this is your style', m: { melee: 0.03 } },
    { rank: 3, text: 'Dodging costs 8% less stamina', m: { dodgeCost: -0.08 } },
    { rank: 5, text: '+4% critical chance', m: { crit: 0.04 } },
    { rank: 7, text: '+5% attack speed', m: { attackSpeed: 0.05 } },
    { rank: 9, text: '+7% damage and +10% poise damage', m: { melee: 0.07, poise: 0.1 } },
  ],
  magic: [
    { rank: 1, text: '+3% spell damage', m: { spell: 0.03 } },
    { rank: 3, text: 'Spells cost 6% less mana', m: { manaCost: -0.06 } },
    { rank: 5, text: '+8% cast speed', m: { castSpeed: 0.08 } },
    { rank: 7, text: 'Your spells’ effects last 10% longer', m: { duration: 0.1 } },
    { rank: 9, text: '+8% spell damage and +15 max mana', m: { spell: 0.08, mana: 15 } },
  ],
  calling: [
    { rank: 1, text: 'Practice comes 10% faster', x: { practice: 0.1 } },
    { rank: 3, text: 'A 5% chance per material that it isn’t used up', x: { save: 0.05 } },
    { rank: 5, text: '+0.25 quality step on everything you make', x: { qAll: 0.25 } },
    { rank: 7, text: 'An 8% chance to make two', x: { twice: 0.08 } },
    { rank: 9, text: '+0.35 quality step on everything you make', x: { qAll: 0.35 } },
  ],
};

/** Each discipline's own perks: at Adept (5) and Grandmaster (10). */
const SIGNATURE: Record<string, [Perk, Perk]> = {
  gale: [
    { rank: 5, text: 'Wind at your back: dodging costs 15% less stamina and you move 4% faster', m: { dodgeCost: -0.15, moveSpeed: 0.04 } },
    { rank: 10, text: 'The parry window is a quarter wider, and Flow builds 15% faster', m: { parryWindow: 0.25 }, x: { resGain: 0.15 } },
  ],
  cross: [
    { rank: 5, text: 'Two blades, one beat: +6% attack speed', m: { attackSpeed: 0.06 } },
    { rank: 10, text: '+6% critical chance and Tempo builds 15% faster', m: { crit: 0.06 }, x: { resGain: 0.15 } },
  ],
  boundary: [
    { rank: 5, text: 'Blocking costs 15% less stamina', m: { blockCost: -0.15 } },
    { rank: 10, text: 'You take 6% less damage, and Focus builds 15% faster', m: { dmgTaken: -0.06 }, x: { resGain: 0.15 } },
  ],
  dawnblade: [
    { rank: 5, text: 'Holy strikes: +6% damage', m: { melee: 0.06 } },
    { rank: 10, text: '+10% damage and 5% less damage taken', m: { melee: 0.1, dmgTaken: -0.05 } },
  ],
  warbreaker: [
    { rank: 5, text: 'Swing like a falling tree: +12% poise damage', m: { poise: 0.12 } },
    { rank: 10, text: '+10% damage and +25 max health', m: { melee: 0.1, hp: 25 } },
  ],
  oathbreaker: [
    { rank: 5, text: 'Bitter iron: 6% less damage taken', m: { dmgTaken: -0.06 } },
    { rank: 10, text: '+10% damage while your oath is broken', m: { melee: 0.1 } },
  ],
  pyromancer: [
    { rank: 5, text: 'Fire knows you: +10% fire damage', x: { fireDmg: 0.1 } },
    { rank: 10, text: '+20% fire damage and +5% spell damage', x: { fireDmg: 0.2 }, m: { spell: 0.05 } },
  ],
  windcaller: [
    { rank: 5, text: 'The air answers sooner: +10% wind damage', x: { windDmg: 0.1 } },
    { rank: 10, text: '+20% wind damage and 10% wider spells', x: { windDmg: 0.2 }, m: { area: 0.1 } },
  ],
  lightbinder: [
    { rank: 5, text: 'Gentle hands: healing is 12% stronger', m: { heal: 0.12 } },
    { rank: 10, text: 'Healing 20% stronger and +10% holy damage', m: { heal: 0.2 }, x: { holyDmg: 0.1 } },
  ],
  cryomancer: [
    { rank: 5, text: '+6% spell damage', m: { spell: 0.06 } },
    { rank: 10, text: '+12% spell damage', m: { spell: 0.12 } },
  ],
  herbalism: [
    { rank: 5, text: 'Healing tonics heal 15% more', x: { tonicHeal: 0.15 } },
    { rank: 10, text: 'Healing tonics heal 25% more, and elixirs last 25% longer', x: { tonicHeal: 0.25, buffTime: 0.25 } },
  ],
  dungeoneering: [
    { rank: 5, text: 'Practised nerve: +4% damage underground', m: { melee: 0.04 } },
    { rank: 10, text: '+8% damage and 6% less damage taken underground', m: { melee: 0.08, dmgTaken: -0.06 } },
  ],
  smithing: [
    { rank: 5, text: '+0.2 quality step on weapons and armour', x: { qWeapon: 0.2, qArmor: 0.2 } },
    { rank: 10, text: 'Tempering reaches one step higher, and +0.4 quality step on everything you forge', x: { temperCap: 1, qAll: 0.4 } },
  ],
  cooking: [
    { rank: 5, text: 'Meals you eat are 15% stronger', x: { mealPower: 0.15 } },
    { rank: 10, text: 'Meals you eat are 25% stronger and last 25% longer', x: { mealPower: 0.25, mealTime: 0.25 } },
  ],
  tailoring: [
    { rank: 5, text: '+0.2 quality step on leather and cloth', x: { qLeather: 0.2, qCloth: 0.2 } },
    { rank: 10, text: '+0.4 quality step on leather, cloth and satchels, and tempering reaches one step higher', x: { qLeather: 0.4, qCloth: 0.4, qPack: 0.4, temperCap: 1 } },
  ],
  runecraft: [
    { rank: 5, text: 'Runes you inscribe are 15% stronger', x: { runeEdge: 0.15, runeWard: 0.15 } },
    { rank: 10, text: 'Runes you inscribe are 35% stronger, and overwriting gives the old rune back', x: { runeEdge: 0.35, runeWard: 0.35, runeKeep: 1 } },
  ],
  jewelcrafting: [
    { rank: 5, text: '+0.25 quality step on rings and amulets', x: { qJewel: 0.25 } },
    { rank: 10, text: '+0.5 quality step on rings and amulets, and a 20% chance a cut gem comes out flawless', x: { qJewel: 0.5, flawless: 0.2 } },
  ],
  prospecting: [
    { rank: 5, text: '+15% from every vein and log', x: { yield: 0.15 } },
    { rank: 10, text: '+25% from every vein and log, and rare finds come twice as often', x: { yield: 0.25, rare: 0.06 } },
  ],
};

/** How each family earns it, in a line (the Skills page). */
export const EARN_TEXT: Record<Family, string> = {
  combat: 'Land blows, parry, dodge and finish foes with it as your active style.',
  magic: 'Cast its spells.',
  calling: 'Work at its stations: everything you make, temper, gather or brew.',
  legacy: 'Legacy is earned by deeds, not mastery.',
};

/** Every perk a discipline offers, in rank order. */
export function perksOf(d: DisciplineDef): Perk[] {
  if (d.fam === 'legacy') return [];
  return [...FAMILY_PERKS[d.fam], ...(SIGNATURE[d.id] ?? [])].sort((a, b) => a.rank - b.rank);
}

/** The perks unlocked at this mastery rank. */
export function perksAt(d: DisciplineDef, rank: number) {
  return perksOf(d).filter((p) => p.rank <= rank);
}

export class Mastery {
  private ranks = new Map<string, number>();
  /** told when a discipline reaches a new rank (toast and banner) */
  onRank?: (d: DisciplineDef, rank: number, perks: Perk[]) => void;

  constructor(private paths: Paths) {
    this.sync();
  }

  /** Remember every rank as it stands (after a load), so only new ones are announced. */
  sync() {
    for (const d of DISCIPLINES) this.ranks.set(d.id, this.paths.masteryRank(d.id));
  }

  /** Earn mastery in a discipline (callers: the event hooks below, crafting practice, herbalism). */
  gain(id: string, n: number) {
    const d = DISC[id];
    if (!d || d.fam === 'legacy' || !this.paths.learned(id) || n <= 0) return;
    this.paths.mx[id] = (this.paths.mx[id] ?? 0) + n;
    this.check(id);
  }

  /** Mastery may have been added elsewhere (herbalism, delving, practice): announce any new rank. */
  check(id: string) {
    const d = DISC[id];
    if (!d) return;
    const was = this.ranks.get(id) ?? 0, now = masteryRank(this.paths.mx[id] ?? 0);
    if (now <= was) return;
    this.ranks.set(id, now);
    const fresh = perksOf(d).filter((p) => p.rank > was && p.rank <= now);
    this.onRank?.(d, now, fresh);
    events.emit('pathsChanged', {});
  }

  /** Combat modifiers and runtime effects from mastery perks (combat styles only while active). */
  effects(): { m: Partial<Record<NumMod, number>>; x: Record<string, number> } {
    const m: Partial<Record<NumMod, number>> = {};
    const x: Record<string, number> = {};
    for (const d of DISCIPLINES) {
      if (!this.paths.learned(d.id) || d.fam === 'calling' || d.fam === 'legacy') continue;
      if (d.fam === 'combat' && this.paths.active !== d.id) continue;
      for (const p of perksAt(d, this.paths.masteryRank(d.id))) {
        for (const [k, v] of Object.entries(p.m ?? {})) m[k as NumMod] = (m[k as NumMod] ?? 0) + v;
        for (const [k, v] of Object.entries(p.x ?? {})) x[k] = (x[k] ?? 0) + v;
      }
    }
    // A Calling's perks with a combat side (herbalism's tonics are read by the skill runtime too).
    for (const id of ['herbalism', 'dungeoneering']) {
      const d = DISC[id];
      if (!d || !this.paths.learned(id)) continue;
      for (const p of perksAt(d, this.paths.masteryRank(id))) {
        for (const [k, v] of Object.entries(p.m ?? {})) m[k as NumMod] = (m[k as NumMod] ?? 0) + v;
        for (const [k, v] of Object.entries(p.x ?? {})) x[k] = (x[k] ?? 0) + v;
      }
    }
    return { m, x };
  }

  /** A Calling's crafting bonus from its mastery perks (crafter.ts's `extra`). */
  craftX(calling: string, key: string) {
    const d = DISC[calling];
    if (!d || d.fam !== 'calling' || !this.paths.learned(calling)) return 0;
    let v = 0;
    for (const p of perksAt(d, this.paths.masteryRank(calling))) v += p.x?.[key] ?? 0;
    return v;
  }

  /** "Adept", "Grandmaster"... */
  static title(rank: number) {
    return MASTERY_NAMES[rank] ?? '';
  }
}

/**
 * Hook mastery to what the player does: blows, parries, dodges and finishers
 * with the active style; spells by school. (Callings earn it through their own
 * practice: crafting/practice.ts, herbalism.ts, dungeon/kit/delving.ts.)
 */
export function wireMastery(mastery: Mastery, paths: Paths) {
  const style = () => (DISC[paths.active]?.fam === 'combat' ? paths.active : '');
  const school = (spell: string) => {
    const head = spell.split(':')[0];
    if (DISC[head]) return head;
    if (/fire|ember|flame|kindle|meteor/i.test(spell)) return 'pyromancer';
    if (/wind|gust|gale|blink|haste/i.test(spell)) return 'windcaller';
    if (/heal|light|mote|ward|halo|brand/i.test(spell)) return 'lightbinder';
    if (/frost|ice|rime/i.test(spell)) return 'cryomancer';
    return '';
  };
  events.on('meleeHit', ({ crit, target }) => {
    const s = style();
    if (!s) return;
    // The straw dummy teaches the first steps and nothing past Novice.
    if (target.kind === 'dummy' && paths.masteryRank(s) >= 2) return;
    mastery.gain(s, crit ? 2 : 1);
  });
  events.on('perfectParry', () => style() && mastery.gain(style(), 6));
  events.on('perfectDodge', () => style() && mastery.gain(style(), 5));
  events.on('finisher', () => style() && mastery.gain(style(), 12));
  events.on('spellCast', ({ spell }) => {
    const s = school(spell);
    if (s) mastery.gain(s, 4);
  });
  // Mastery added by the Callings' own practice (crafting, brewing, delving): announce new ranks.
  events.on('masteryGained', ({ id }) => mastery.check(id));
  events.on('progressChanged', () => {
    for (const d of DISCIPLINES) if (d.fam === 'calling') mastery.check(d.id);
  });
}
