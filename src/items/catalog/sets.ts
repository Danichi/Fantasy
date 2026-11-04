import type { ItemStats } from '../itemDefs';
import type { ArmorLook, ArmorWeight, HelmShape } from '../armorModels';
import { TIERS } from './tiers';
import { add, recipe } from './kit';
import { SLOTS, PIECE, PIECE_NAMES, pieceStats, type ArmourSlot } from './armour';
import { FACTIONS } from './factions';
import { fxText } from './gearFx';

// Faction armour sets (the item plan, §4b): twenty sets of six pieces. Two
// pieces worn give a small edge, four a second, all six the set's signature
// (gearRuntime.ts adds whichever are earned).

export interface ArmourSet {
  id: string;
  name: string;
  faction: string;
  weight: ArmorWeight;
  tier: number;
  look: Omit<ArmorLook, 'weight'>;
  /** what each piece says about the look */
  design: string;
  /** bonuses at 2, 4 and 6 pieces */
  bonus: { 2: Record<string, number>; 4: Record<string, number>; 6: Record<string, number> };
  /** extra stats on one piece (the Tidewarden's helm breathes water) */
  extra?: Partial<Record<ArmourSlot, ItemStats>>;
  /** ids of the six pieces, by slot */
  pieces: Record<ArmourSlot, string>;
  /** sold, rewarded and dropped: the extra tags */
  src: string[];
}

const S = (id: string, name: string, faction: string, weight: ArmorWeight, tier: number, look: Omit<ArmorLook, 'weight'>, design: string, b2: Record<string, number>, b4: Record<string, number>, b6: Record<string, number>, src: string[] = [], extra?: ArmourSet['extra']): ArmourSet =>
  ({ id, name, faction, weight, tier, look, design, bonus: { 2: b2, 4: b4, 6: b6 }, pieces: {} as Record<ArmourSlot, string>, src, extra });
const L = (base: number, trim: number, cloth: number, helm: HelmShape, x: Partial<ArmorLook> = {}): Omit<ArmorLook, 'weight'> => ({ base, trim, cloth, helm, strap: 0x4a3020, shine: 0.6, ...x });

export const SETS: ArmourSet[] = [
  S('glenWatch', 'Glen Watch', 'glenWatch', 'mail', 2, L(0x8a8682, 0x4a4744, 0x2a4a8a, 'coif', { crest: undefined }), 'A blue gambeson over iron rings, a kettle hat, a lantern hook on the belt.', { blockCost: -0.1 }, { dmgTaken: -0.05 }, { parryStamina: 15 }),
  S('glenWarden', 'Glen Warden', 'glenWarden', 'leather', 2, L(0x4a6a2a, 0x8a7a5a, 0x6a5a3a, 'cap'), 'Moss-green leather, a fur collar, a pouch on every strap.', { moveSpeed: 0.04 }, { bane_beast: 0.1 }, { beastLoot: 0.2 }),
  S('academyCadet', 'Academy Cadet', 'academy', 'mail', 2, L(0x9a9a9e, 0x5a5a6a, 0x5a5a6a, 'coif'), 'Grey practice mail, the Academy crest, a padded collar.', { parryWindow: 0.05 }, { staminaCost: -0.05 }, { masteryGain: 0.1 }),
  S('academyBlademaster', 'Academy Blademaster', 'academy', 'plate', 3, L(0xf0f0ee, 0xc8a040, 0x2a3a6a, 'crested', { crest: 0x2a3a6a, shine: 0.9 }), 'White-enamelled plate with the three school sigils.', { crit: 0.03 }, { parryWindow: 0.1 }, { styleSurge: 1 }, ['site:duel']),
  S('crownGuard', 'Crown Guard', 'crown', 'plate', 3, L(0xdfe6f4, 0x2a4a8a, 0x2a4a8a, 'crested', { crest: 0xffffff }), 'Blue-and-white plate, a crown-crested helm with a white plume.', { dmgTaken: -0.04 }, { blockCost: -0.15 }, { crowdDmg: 0.15 }),
  S('silverLance', 'Silver Lance', 'crown', 'plate', 3, L(0xe8eef8, 0xdfe6f4, 0xf0f0f0, 'great', { shine: 0.95, glow: 0x6f8fc8, glowStrength: 0.1 }), 'Silversteel with lance-shaped pauldrons and a white tabard.', { poiseDmg: 0.1 }, { moveSpeed: 0.05 }, { sprintHit: 0.35 }),
  S('pilgrim', 'Pilgrim of the Dawn', 'temple', 'robe', 2, L(0xd8ccb0, 0xc8a040, 0xe8c060, 'hood', { long: true }), 'Undyed wool with sunwheel embroidery and a walking-cord belt.', { heal: 0.1 }, { holyDmg: 0.1 }, { wheelHeal: 1 }),
  S('inquisitor', 'Temple Inquisitor', 'temple', 'mail', 3, L(0x2a2a30, 0xc8a040, 0x1a1a1e, 'mask'), 'Gold-trimmed black mail and a hooded mask.', { crit: 0.03 }, { bane_undead: 0.15 }, { holyDmg: 0.2 }),
  S('dwarvenExpedition', 'Dwarven Expedition', 'dwarven', 'plate', 4, L(0x4a5a6a, 0xd0a040, 0x3a4a5a, 'visor'), 'Slate-blue slab plate, a braided-beard face-guard, a lantern on the shoulder.', { dmgTaken: -0.04 }, { bane_construct: 0.15 }, { oreYield: 0.5 }),
  S('sunGuard', 'Sun Guard of the Throne', 'desert', 'plate', 5, L(0xd8b050, 0xe8e0c8, 0xf0ece0, 'crested', { crest: 0xd8a84a, shine: 0.85 }), 'Gold scale over white linen, a falcon-crest helm.', { fireResist: 0.1 }, { desertWard: 0.1 }, { desertWard: 0.15, fireResist: 0.25 }),
  S('duneStrider', 'Dune Strider', 'desert', 'leather', 5, L(0xc8b080, 0x6a5a40, 0xe8d8b0, 'turban'), 'Wrapped sand-linen over sandwyrm scale, and goggles.', { moveSpeed: 0.03 }, { dodgeCost: -0.1 }, { sandSpeed: 0.15 }),
  S('scavengerRig', 'Scavenger Rig', 'scrap', 'leather', 5, L(0x6a5a48, 0xa0a0a8, 0x5a4a3a, 'mask'), 'Patchwork leather riveted with tin plates, a gas-mask helm.', { dmgTaken: -0.03 }, { goldFind: 0.2 }, { scrapFind: 0.5 }),
  S('wrecker', 'Wrecker\'s', 'wrecker', 'leather', 6, L(0x2a2a28, 0x8a7a5a, 0x5a4a3a, 'sou'), 'Tarred leather, rope belts, a lantern helm.', { crit: 0.03 }, { seaDmg: 0.1 }, { backstab: 0.25 }),
  S('corsairCaptain', 'Corsair Captain', 'wrecker', 'mail', 6, L(0x8a8682, 0xd8b04a, 0x9a1a1a, 'cap', { strap: 0x9a1a1a }), 'A red coat over mail, a tricorn, gold buttons.', { attackSpeed: 0.04 }, { critGold: 2 }, { seaDmg: 0.2 }),
  S('tidewarden', 'Tidewarden', 'wrecker', 'plate', 6, L(0x5ab0a0, 0xf0eee0, 0x1a7a8a, 'visor', { glow: 0x2aa8a0, glowStrength: 0.2, shine: 0.95 }), 'Coral-crusted plate, shell pauldrons, a sea-glass visor.', { heal: 0.08 }, { seaDmg: 0.1 }, { rainDmg: 0.2, dmgTaken: -0.05 }, ['kill:tideWarden'], { head: { waterBreathing: 600 } }),
  S('twoCoins', 'Two Coins', 'twoCoins', 'leather', 3, L(0x1a1a1e, 0xd8b04a, 0x2a2a30, 'mask'), 'Black leather, a coin-studded collar, a half mask.', { crit: 0.04 }, { backstab: 0.15 }, { critGold: 5 }),
  S('orcWarlord', 'Orc Warlord', 'orc', 'plate', 4, L(0x2a2a2a, 0xe8dcc0, 0x4a2a1a, 'horned', { spikes: true, shine: 0.3 }), 'Bone and black iron, tusk pauldrons, a boar-skull helm.', { poiseDmg: 0.1 }, { lowHp: 0.15 }, { rage: 0.3 }, ['kill:ulgra', 'kill:grukk']),
  S('valorianLegion', 'Valorian Legion', 'valorian', 'mail', 4, L(0xa83a2a, 0xd8b04a, 0x9a1a1a, 'crested', { crest: 0xd04a1a }), 'Segmented red lacquer, a crested helm, an ember-red cloak.', { fireDmg: 0.1 }, { dmgTaken: -0.05 }, { fireResist: 0.3 }),
  S('verdantElf', 'Verdant Elf', 'elven', 'leather', 4, L(0x4a8a3a, 0xc8a87a, 0x6aa04a, 'circlet'), 'Living-leaf leather that grows, and an antler circlet.', { moveSpeed: 0.03 }, { heal: 0.1 }, { oocRegen: 6 }),
  S('gloamTouched', 'Gloam-Touched', 'gloam', 'plate', 7, L(0x15121a, 0x7a3aff, 0x2a1a3a, 'mask', { glow: 0x7a3aff, glowStrength: 0.14, spikes: true, shine: 0.2 }), 'Black plate cracked with violet light; smoke trails from it.', { darkDmg: 0.1 }, { killHeal: 15 }, { killVeil: 3 }, ['site:darkScar']),
];
export const SET: Record<string, ArmourSet> = Object.fromEntries(SETS.map((s) => [s.id, s]));

/** The set bonus text for a card. */
export function setText(s: ArmourSet) {
  return `Set (${s.name}): 2 pieces: ${fxText(s.bonus[2])} 4 pieces: ${fxText(s.bonus[4])} 6 pieces: ${fxText(s.bonus[6])}`;
}

for (const s of SETS) {
  const t = TIERS[s.tier - 1];
  const f = FACTIONS[s.faction];
  const src = [`fshop:${s.faction}`, ...(f.quest || f.deed ? [`quest:${s.faction}`] : []), ...(f.drop ?? []).map((d) => `drop:${d}:${s.tier}`), ...s.src];
  for (const slot of SLOTS) {
    const id = `${s.id}_${slot}`;
    s.pieces[slot] = id;
    add({
      id, name: `${s.name} ${PIECE_NAMES[s.weight][slot]}`, kind: 'armor', slot, rarity: s.tier >= 7 ? 'epic' : 'rare', lvl: t.lvl[0],
      desc: `${s.design} Worn by ${f.name}. ${setText(s)}`,
      stats: { ...pieceStats(s.weight, slot, s.tier, 1.12), ...(s.extra?.[slot] ?? {}) }, armor: PIECE[slot], set: s.id,
      look: { weight: s.weight, long: s.weight === 'robe', ...s.look },
    }, src);
  }
}

// The friendly factions' sets can also be made, once you have the pattern: a
// faction set's recipes are taught by the faction's own pattern-book.
export const SET_BOOKS: Record<string, string> = {};
for (const s of SETS) {
  if (['orc', 'gloam', 'twoCoins', 'wrecker'].includes(s.faction) && s.id !== 'wrecker') continue;
  const t = TIERS[s.tier - 1];
  const book = `bookPattern${s.id[0].toUpperCase()}${s.id.slice(1)}`;
  SET_BOOKS[s.id] = book;
  const tailor = s.weight === 'robe' || s.weight === 'leather';
  for (const slot of SLOTS) {
    recipe(s.pieces[slot], tailor ? 'loom' : 'forge', tailor ? 'tailoring' : 'smithing', t.craft + 3, [[tailor ? (s.weight === 'robe' ? t.fabric : t.hide) : t.ingot, slot === 'chest' ? 4 : 2], [s.weight === 'robe' ? 'silk' : t.fabric, 1], [t.hide, 1]], `book:${book}`, { step: tailor ? 'none' : 'hammer' });
  }
}
