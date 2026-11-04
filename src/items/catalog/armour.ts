import type { ItemDef, ItemStats, Rarity } from '../itemDefs';
import type { ArmorLook, ArmorPieceId, ArmorWeight } from '../armorModels';
import { TIERS, type Tier } from './tiers';
import { add, recipe, rd, source } from './kit';
import { buildShield, type ShieldShape, type ShieldLook } from './shieldModel';

// The standard armour line (the item plan, §4a): four weights, six slots,
// eight tiers. Plus the standard shields (§3) and the cloaks and belts (§5).

const RAR: Rarity[] = ['common', 'common', 'fine', 'fine', 'rare', 'rare', 'rare', 'epic', 'epic'];

export type ArmourSlot = 'head' | 'shoulders' | 'chest' | 'hands' | 'legs' | 'feet';
export const SLOTS: ArmourSlot[] = ['head', 'shoulders', 'chest', 'hands', 'legs', 'feet'];
export const PIECE: Record<ArmourSlot, ArmorPieceId> = { head: 'helm', shoulders: 'pauldrons', chest: 'breastplate', hands: 'gauntlets', legs: 'greaves', feet: 'sabatons' };
/** a piece's share of a whole set's armour */
export const SHARE: Record<ArmourSlot, number> = { head: 0.15, shoulders: 0.14, chest: 0.33, hands: 0.1, legs: 0.18, feet: 0.1 };
export const PIECE_NAMES: Record<ArmorWeight, Record<ArmourSlot, string>> = {
  robe: { head: 'Hood', shoulders: 'Shawl', chest: 'Robe', hands: 'Gloves', legs: 'Trousers', feet: 'Slippers' },
  leather: { head: 'Cap', shoulders: 'Spaulders', chest: 'Jerkin', hands: 'Bracers', legs: 'Leggings', feet: 'Boots' },
  mail: { head: 'Coif', shoulders: 'Mail Pauldrons', chest: 'Hauberk', hands: 'Mail Gauntlets', legs: 'Chausses', feet: 'Mail Boots' },
  plate: { head: 'Helm', shoulders: 'Pauldrons', chest: 'Breastplate', hands: 'Gauntlets', legs: 'Greaves', feet: 'Sabatons' },
};
/** a whole set's stats at tier 1 */
const SET_BASE: Record<ArmorWeight, ItemStats> = {
  robe: { armor: 6, maxMana: 48, manaRegen: 0.6 },
  leather: { armor: 11, maxStamina: 36, staminaRegen: 0.3 },
  mail: { armor: 16, maxHp: 40, poise: 12 },
  plate: { armor: 21, poise: 30, maxHp: 20 },
};
const tierK = (n: number) => 1 + 0.35 * (n - 1);

/** A piece's stats: the set's, shared out by slot and scaled by tier. */
export function pieceStats(w: ArmorWeight, slot: ArmourSlot, n: number, k = 1): ItemStats {
  const out: ItemStats = {};
  for (const [key, v] of Object.entries(SET_BASE[w])) {
    const val = (v as number) * SHARE[slot] * tierK(n) * k;
    (out as Record<string, number>)[key] = key.endsWith('Regen') ? rd(val, 0.01) : Math.max(1, rd(val));
  }
  return out;
}

/** The tabard under a mail set: the region's colours. */
const MAIL_CLOTH = [0, 0x2a4a8a, 0x2a4a8a, 0xe8e4d8, 0x4a5060, 0xd8c090, 0x1a8a8a, 0x15151c, 0x4a1a6a];

export function tierLook(t: Tier, w: ArmorWeight): ArmorLook {
  const c = t.col;
  return {
    weight: w,
    base: w === 'robe' ? c.robe : w === 'leather' ? c.leather : c.metal,
    trim: c.trim, cloth: w === 'mail' ? MAIL_CLOTH[t.n] : c.cloth, strap: c.leather,
    ...(c.glow && (w === 'plate' || w === 'mail' || t.n >= 7) ? { glow: c.glow, glowStrength: c.glowStrength } : {}),
    shine: c.shine, helm: t.helms[w], long: w === 'robe' && t.n >= 3,
    ...(t.n === 8 && w === 'plate' ? { spikes: true } : {}),
  };
}

const LOOKS: Record<ArmorWeight, (t: Tier) => string> = {
  robe: (t) => ['', 'Undyed wool, a hood for the Glen rain.', 'Cream linen trimmed in Cresha blue.', 'Crimson-and-gold silk, long in the hem.', 'Felted deepwool in slate and gold.', 'Sun-silk with a turban wrap against the glare.', 'Wave-patterned sea-silk and a sou\'wester.', 'Moonweave, dark as a clear night and as quiet.', 'Gloamweave: the hem fades into a cold mist.'][t.n],
  leather: (t) => ['', 'Brown leather, stitched where you can see it.', 'Waxed and boiled leather tooled with Crown chevrons.', 'Green drake scale, overlapping like a fish\'s.', 'Dark deephide tooled with dwarven runes.', 'Sandwyrm scale under wrapped linen, scarabs on the buckles.', 'Grey sharkskin tooled with waves.', 'Starhide mapped with silver stars.', 'Gloamhide that drinks the light, violet sigils at the seams.'][t.n],
  mail: (t) => ['', 'Iron rings under a Cresha-blue tabard.', 'Bright steel links and a blue tabard.', 'Silversteel links under the Crown\'s white and gold.', 'Heavy deepsteel rings and a slate tabard.', 'Brass-washed links under desert sand.', 'Tideglass rings that clink like a bell-buoy, a sea-teal tabard.', 'Starmetal links under a star-black tabard.', 'Duskiron links under dusk violet.'][t.n],
  plate: (t) => ['', 'A plain kettle-helm and breastplate.', 'Bright, blued steel plate.', 'Silver-faced plate with a red crest.', 'Dwarven slab plate with face-guards and rune channels.', 'Sunbrass plate with sun-ray crests.', 'Tideglass plate, blue-green at the edges, pearl at the rivets.', 'Black plate with flowing star filigree.', 'Spiked black plate with a closed, eyeless visor.'][t.n],
};

/** Older items that already are a tier's piece. */
const FOLD: Partial<Record<string, string>> = {
  'plate:1:head': 'ironHelm', 'plate:2:shoulders': 'pauldrons', 'plate:1:chest': 'breastplate', 'plate:1:hands': 'gauntlets', 'plate:1:legs': 'greaves', 'plate:1:feet': 'sabatons',
  'leather:1:chest': 'leatherJerkin', 'leather:1:hands': 'leatherBracers', 'leather:1:feet': 'leatherBoots',
};

const CRAFT: Record<ArmorWeight, { station: 'loom' | 'forge'; calling: 'tailoring' | 'smithing'; main: (t: Tier) => string; side: (t: Tier) => string }> = {
  robe: { station: 'loom', calling: 'tailoring', main: (t) => t.fabric, side: (t) => (t.n <= 2 ? 'flax' : t.fabric) },
  leather: { station: 'loom', calling: 'tailoring', main: (t) => t.hide, side: (t) => t.fabric },
  mail: { station: 'forge', calling: 'smithing', main: (t) => t.ingot, side: (t) => t.hide },
  plate: { station: 'forge', calling: 'smithing', main: (t) => t.ingot, side: (t) => t.hide },
};
const QTY: Record<ArmourSlot, number> = { head: 2, shoulders: 2, chest: 4, hands: 1, legs: 3, feet: 2 };
const SLOT_LV: Record<ArmourSlot, number> = { head: 1, shoulders: 2, chest: 3, hands: 0, legs: 2, feet: 0 };

/** The standard armour ids: [weight][tier][slot]. */
export const STANDARD_ARMOUR: Record<string, Record<number, Record<string, string>>> = {};

const WHERE: Record<ArmorWeight, (n: number) => string[]> = {
  robe: (n) => [`shop:tailor:${n}`, `shop:arcane:${n}`, `drop:caster:${n}`],
  leather: (n) => [`shop:tailor:${n}`, `drop:bandit:${n}`],
  mail: (n) => [`shop:smith:${n}`, `drop:armed:${n}`],
  plate: (n) => [`shop:smith:${n}`, `drop:undead:${n}`, `drop:construct:${n}`],
};

for (const w of ['robe', 'leather', 'mail', 'plate'] as ArmorWeight[]) {
  STANDARD_ARMOUR[w] = {};
  for (const t of TIERS) {
    STANDARD_ARMOUR[w][t.n] = {};
    const material = w === 'robe' ? t.cloth : w === 'leather' ? (t.n === 1 ? 'Leather' : t.leather) : t.metal;
    for (const slot of SLOTS) {
      const fold = FOLD[`${w}:${t.n}:${slot}`];
      const id = fold ?? `${t.metalKey}_${w}_${slot}`;
      STANDARD_ARMOUR[w][t.n][slot] = id;
      const where = t.n <= 6 ? [...WHERE[w](t.n), `chest:${t.n}`] : [];
      if (fold) {
        source(fold, ...where);
        continue;
      }
      const pn = PIECE_NAMES[w][slot];
      const name = w === 'mail' && pn.startsWith('Mail ') ? `${material} ${pn}` : `${material} ${pn}`;
      add({
        id, name, kind: 'armor', slot, rarity: RAR[t.n], lvl: t.lvl[0],
        desc: `${LOOKS[w](t)} ${w === 'robe' ? 'Robes: mana and spellwork.' : w === 'leather' ? 'Leather: light, quick, good for stamina.' : w === 'mail' ? 'Mail: between leather and plate.' : 'Plate: poise and armour.'} Tier ${t.n}: ${t.where}.`,
        stats: pieceStats(w, slot, t.n), armor: PIECE[slot], look: tierLook(t, w),
      }, where);
      const c = CRAFT[w];
      recipe(id, c.station, c.calling, t.craft + SLOT_LV[slot], [[c.main(t), QTY[slot]], [c.side(t), 1]], t.book ? `book:${t.book}` : 'basic', { step: c.station === 'forge' ? 'hammer' : 'none' });
    }
  }
}

// ---- shields (§3) ------------------------------------------------------------------------------
const SHIELD_KINDS: { key: string; name: string; shape: ShieldShape; base: ItemStats; fx?: Record<string, number>; line: string }[] = [
  { key: 'buckler', name: 'Buckler', shape: 'buckler', base: { block: 60, stability: 0.35, poise: 3 }, fx: { parryWindow: 0.1 }, line: 'Small and fast: a parrying shield.' },
  { key: 'roundShield', name: 'Round Shield', shape: 'round', base: { block: 85, stability: 0.5 }, line: 'Painted boards on a round frame.' },
  { key: 'heater', name: 'Heater', shape: 'heater', base: { block: 95, stability: 0.58 }, line: 'A heraldic heater.' },
  { key: 'kite', name: 'Kite Shield', shape: 'kite', base: { block: 105, stability: 0.65, poise: 4 }, line: 'Long enough to cover the legs.' },
  { key: 'tower', name: 'Tower Shield', shape: 'tower', base: { block: 125, stability: 0.8, poise: 8 }, line: 'Carried like a wall.' },
  { key: 'targe', name: 'Spiked Targe', shape: 'targe', base: { block: 80, stability: 0.5, poise: 2 }, fx: { thorns: 4 }, line: 'A spiked boss: whatever strikes you meets it.' },
];
const SHIELD_FACE: Record<number, Omit<ShieldLook, 'shape'>> = {
  1: { face: 0x8a6a44, accent: 0x7a1d1a, rim: 0x5a5650, device: 'quartered' },
  2: { face: 0x9a7a54, accent: 0x2a4a8a, rim: 0xd0d4da, device: 'chevron' },
  3: { face: 0xdfe6f4, accent: 0x2a4a8a, rim: 0xc8a040, device: 'cross', metalFace: true },
  4: { face: 0x46526a, accent: 0xd0a040, rim: 0xd0a040, device: 'pale', metalFace: true },
  5: { face: 0xd8a84a, accent: 0x2aa8a0, rim: 0xc89030, device: 'sun', metalFace: true },
  6: { face: 0x5ac8c0, accent: 0xf0eee0, rim: 0xf0eee0, device: 'wave', metalFace: true },
  7: { face: 0x22222c, accent: 0xdfe8ff, rim: 0x8aa0ff, device: 'stars', metalFace: true, glow: 0x9ab8ff },
  8: { face: 0x1e1b24, accent: 0x4a1a6a, rim: 0x2a2232, device: 'none', metalFace: true, glow: 0x7a3aff },
};
const SHIELD_LINE: Record<number, string> = {
  1: 'Painted wooden boards.', 2: 'A steel rim.', 3: 'Silver-faced, with the Cresha crest.', 4: 'A solid plate of dwarven runework.',
  5: 'A sun-disc boss.', 6: 'Shell and coral over a tideglass rim.', 7: 'Black, starry, glowing at the rim.', 8: 'Duskiron: it drinks the blows it stops.',
};
const SHIELD_FOLD: Partial<Record<string, string>> = { 'buckler:1': 'buckler', 'roundShield:1': 'roundShield', 'kite:2': 'kiteShield', 'tower:3': 'towerShield' };
export const STANDARD_SHIELDS: Record<string, string[]> = {};
for (const k of SHIELD_KINDS) {
  STANDARD_SHIELDS[k.key] = [];
  for (const t of TIERS) {
    const fold = SHIELD_FOLD[`${k.key}:${t.n}`];
    const id = fold ?? `${t.metalKey}_${k.key}`;
    STANDARD_SHIELDS[k.key][t.n] = id;
    const where = t.n <= 6 ? [`shop:smith:${t.n}`, `drop:armed:${t.n}`, `chest:${t.n}`] : [];
    if (fold) {
      source(fold, ...where);
      continue;
    }
    const st: ItemStats = { ...k.base, block: rd((k.base.block ?? 80) * (1 + 0.12 * (t.n - 1))), stability: Math.min(0.92, rd((k.base.stability ?? 0.5) + 0.025 * (t.n - 1), 0.01)) };
    if (st.poise) st.poise = rd(st.poise * tierK(t.n));
    const fx: Record<string, number> = { ...(k.fx ?? {}) };
    if (fx.thorns) fx.thorns = rd(fx.thorns * t.mult * 1.5);
    if (t.n === 8) fx.blockHeal = 6;
    const look: ShieldLook = { shape: k.shape, ...SHIELD_FACE[t.n], ...(k.shape === 'targe' ? { spikes: 7 } : {}) };
    add({
      id, name: `${t.metal} ${k.name}`, kind: 'shield', slot: 'off', rarity: RAR[t.n], lvl: t.lvl[0],
      desc: `${k.line} ${SHIELD_LINE[t.n]} Tier ${t.n}: ${t.where}.`, stats: st, build: () => buildShield(look), ...(Object.keys(fx).length ? { fx } : {}),
    }, where);
    recipe(id, 'workbench', 'smithing', t.craft + 2, [[t.timber, 2], [t.ingot, k.key === 'tower' ? 3 : 2], [t.hide, 1]], t.book ? `book:${t.book}` : 'basic', { step: 'hammer' });
  }
}

// ---- cloaks and belts (§5) ------------------------------------------------------------------
const CLOAKS = [
  { key: 'travelCloak', name: 'Travel Cloak', stats: (k: number): ItemStats => ({ armor: rd(1 * k), maxStamina: rd(10 * k) }), line: 'A hooded cloak for long roads.' },
  { key: 'halfCape', name: 'Half-Cape', stats: (k: number): ItemStats => ({ armor: rd(1 * k), staminaRegen: rd(0.05 * k, 0.01), poise: rd(2 * k) }), line: 'A short cape over one shoulder, a duellist\'s fashion.' },
  { key: 'mantle', name: 'Mantle', stats: (k: number): ItemStats => ({ maxMana: rd(12 * k), manaRegen: rd(0.1 * k, 0.01) }), line: 'A scholar\'s mantle.' },
];
const CLOAK_FOLD: Partial<Record<string, string>> = { 'mantle:3': 'silkMantle', 'mantle:5': 'sunSilkMantle' };
for (const c of CLOAKS) {
  for (const t of TIERS) {
    const fold = CLOAK_FOLD[`${c.key}:${t.n}`];
    const where = t.n <= 6 ? [`shop:tailor:${t.n}`] : [];
    if (fold) {
      source(fold, ...where);
      continue;
    }
    const id = `${t.metalKey}_${c.key}`;
    add({
      id, name: `${t.cloth} ${c.name}`, kind: 'armor', slot: 'cloak', rarity: RAR[t.n], lvl: t.lvl[0],
      desc: `${c.line} ${t.cloth}${t.n >= 7 ? ', faintly shining' : ''}. Tier ${t.n}.`, stats: c.stats(tierK(t.n)), armor: 'cloak',
      look: { weight: 'robe', base: t.col.cloth, trim: t.col.trim, cloth: t.col.cloth, ...(t.n >= 7 ? { glow: t.col.glow, glowStrength: 0.15 } : {}) },
    }, where);
    recipe(id, 'loom', 'tailoring', t.craft + 1, [[t.fabric, 3], [t.hide, 1]], t.book ? `book:${t.book}` : 'basic');
  }
}
const BELTS = [
  { key: 'belt', name: 'Belt', stats: (k: number): ItemStats => ({ maxHp: rd(10 * k) }), fx: (n: number) => ({ potionPower: rd(0.05 + 0.02 * n, 0.01) }), line: 'Pouches all the way round.' },
  { key: 'girdle', name: 'Girdle', stats: (k: number): ItemStats => ({ armor: rd(1 * k), poise: rd(4 * k) }), fx: () => ({}), line: 'A broad girdle: it keeps you upright.' },
  { key: 'bandolier', name: 'Bandolier', stats: (k: number): ItemStats => ({ maxStamina: rd(10 * k) }), fx: (n: number) => ({ staminaCost: -rd(0.02 * n, 0.01) }), line: 'Crossed straps with loops for vials and bolts.' },
];
for (const b of BELTS) {
  for (const t of TIERS) {
    const id = `${t.metalKey}_${b.key}`;
    const fx = b.fx(t.n);
    add({
      id, name: `${t.n === 1 ? 'Leather' : t.leather} ${b.name}`, kind: 'accessory', slot: 'belt', rarity: RAR[t.n], lvl: t.lvl[0],
      desc: `${b.line} ${t.metal} buckle. Tier ${t.n}.`, stats: b.stats(tierK(t.n)), armor: 'belt', ...(Object.keys(fx).length ? { fx } : {}),
      look: { weight: 'leather', base: t.col.leather, trim: t.col.metal, cloth: t.col.cloth, strap: t.col.leather },
    }, t.n <= 6 ? [`shop:tailor:${t.n}`, `shop:trader:${t.n}`] : []);
    recipe(id, 'loom', 'tailoring', t.craft, [[t.hide, 2], [t.ingot, 1]], t.book ? `book:${t.book}` : 'basic');
  }
}

export type { ItemDef };
