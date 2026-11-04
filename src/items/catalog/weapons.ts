import type { ItemDef, ItemStats, Rarity } from '../itemDefs';
import { buildSword, type SwordSpec } from '../weaponModels';
import { buildSpear, buildGreatsword, buildAxe, buildMace, buildDagger, buildStaff, buildPlayerBow, buildCrossbow, buildArrowBundle, buildBoltBundle, METAL, METAL_GLOW, type ArrowHead } from '../weapons/models';
import { TIERS, type Tier } from './tiers';
import { add, recipe, rd, source, type Build } from './kit';

// The standard weapon line (the item plan, §2a): fourteen kinds in eight
// tiers, each keeping its family's moveset, the tier's name in front.
// Where an older item already is that weapon ("Iron Spear"), it stands in.

const RAR: Rarity[] = ['common', 'common', 'fine', 'fine', 'rare', 'rare', 'rare', 'epic', 'epic'];

const arming: SwordSpec = { bladeLen: 0.72, bladeWidth: 0.024, thickness: 0.004, fullerLen: 0.72, gripLen: 0.1, guardSpan: 0.095, guardStyle: 'straight', pommel: 'wheel' };
const longsword: SwordSpec = { bladeLen: 0.86, bladeWidth: 0.025, thickness: 0.0042, fullerLen: 0.66, gripLen: 0.15, guardSpan: 0.115, guardStyle: 'curved', pommel: 'pear' };

/** Sword colours for a tier: the metal, a glow along the fuller where the metal has one. */
function swordTier(t: Tier, s: SwordSpec): SwordSpec {
  const g = METAL_GLOW[t.metalKey];
  return {
    ...s,
    tint: METAL[t.metalKey],
    guardMat: t.n >= 3 && t.n !== 8 ? 'brass' : 'darkSteel',
    ...(g && t.n >= 6 ? { glow: g[0], glowStrength: t.n === 7 ? 1.4 : 1.1 } : t.n === 3 ? { glow: 0x9fc4ff, glowStrength: 0.5 } : {}),
    // The desert's blades curve; the dwarves' are broad; the sea's are glassy and keen.
    curve: (s.curve ?? 0) + (t.n === 5 ? 0.07 : 0),
    bladeWidth: s.bladeWidth * (t.n === 4 ? 1.18 : t.n === 6 ? 0.9 : t.n === 8 ? 1.08 : 1),
    pommel: t.n === 4 || t.n === 8 ? 'wheel' : s.pommel,
    guardSpan: s.guardSpan * (t.n === 5 ? 1.25 : t.n === 7 ? 0.85 : 1),
  };
}

interface Kind {
  key: string;
  /** "Iron {name}" */
  name: string;
  kind: ItemDef['kind'];
  hands?: 1 | 2;
  ammo?: 'arrow' | 'bolt';
  base: ItemStats;
  /** the model for a tier */
  build: (t: Tier) => Build;
  /** an older item that is this weapon at tier n */
  fold?: Partial<Record<number, string>>;
  /** what the tier adds: a line of design for the description */
  look: (t: Tier) => string;
  /** forge or workbench, and what goes in */
  bench: 'forge' | 'workbench';
  inputs: (t: Tier) => [string, number][];
  /** which shop sells it */
  shop: 'smith' | 'bowyer';
  /** level offset inside the tier */
  lv: number;
}

const ing = (t: Tier, n: number): [string, number] => [t.ingot, n];
const wd = (t: Tier, n: number): [string, number] => [t.timber, n];
const hd = (t: Tier, n: number): [string, number] => [t.hide, n];
const fb = (t: Tier, n: number): [string, number] => [t.fabric, n];

const KINDS: Kind[] = [
  {
    key: 'shortsword', name: 'Shortsword', kind: 'sword', base: { damage: 16, speed: 1.3 }, fold: { 1: 'shortsword' }, bench: 'forge', shop: 'smith', lv: 0,
    build: (t) => () => buildSword(swordTier(t, { ...arming, bladeLen: 0.56, bladeWidth: 0.027, fullerLen: 0.5 })),
    look: (t) => (t.n === 5 ? 'A short blade with a desert curve.' : t.n === 6 ? 'The edge is sea-glass, ground thin as paper.' : 'A stubby soldier\'s blade that never stops moving.'),
    inputs: (t) => [ing(t, 2), hd(t, 1)],
  },
  {
    key: 'armingSword', name: 'Arming Sword', kind: 'sword', base: { damage: 18, speed: 1.2 }, bench: 'forge', shop: 'smith', lv: 1,
    build: (t) => () => buildSword(swordTier(t, arming)),
    look: (t) => ['', 'A plain cross guard and a wheel pommel.', 'A blued cross guard, polished bright.', 'A silver-faced guard with the Cresha crest.', 'A dwarven knot pommel and a broad, stepped blade.', 'A scarab guard of sunbrass and turquoise.', 'A blade like a wave caught in glass.', 'A fuller pierced with tiny stars.', 'Black steel with a violet seam where the fuller should be.'][t.n],
    inputs: (t) => [ing(t, 2), hd(t, 1)],
  },
  {
    key: 'longsword', name: 'Longsword', kind: 'sword', base: { damage: 24, speed: 1 }, bench: 'forge', shop: 'smith', lv: 2,
    build: (t) => () => buildSword(swordTier(t, longsword)),
    look: (t) => (t.n === 7 ? 'A hand-and-a-half grip; the fuller glows faintly, like the night sky.' : 'A hand-and-a-half blade with a long reach.'),
    inputs: (t) => [ing(t, 3), hd(t, 1)],
  },
  {
    key: 'greatsword', name: 'Greatsword', kind: 'greatsword', base: { damage: 34, speed: 0.8, stagger: 1.3, poise: 6 }, fold: { 1: 'ironGreatsword' }, bench: 'forge', shop: 'smith', lv: 4,
    build: (t) => () => buildGreatsword(t.metalKey, { len: 1.24 + t.n * 0.02, flamberge: t.n === 8 || t.n === 6 }),
    look: (t) => (t.n === 4 ? 'A stepped dwarven profile, as tall as a dwarf.' : t.n === 8 ? 'A jagged black edge, a violet seam down the middle.' : t.n === 1 ? 'A slab of iron with an edge on it.' : 'A two-handed blade that lands like a falling door.'),
    inputs: (t) => [ing(t, 4), hd(t, 1)],
  },
  {
    key: 'dagger', name: 'Dagger', kind: 'dagger', base: { damage: 12, speed: 1.45, crit: 0.1 }, fold: { 1: 'ironDagger' }, bench: 'forge', shop: 'smith', lv: 0,
    build: (t) => (t.n === 5
      ? () => buildSword(swordTier(t, { ...arming, bladeLen: 0.3, bladeWidth: 0.026, fullerLen: 0, gripLen: 0.09, guardSpan: 0.04, curve: 0.05 }))
      : () => buildDagger({ metal: t.metalKey, len: 0.26 + t.n * 0.008, style: t.n === 2 || t.n === 8 ? 'rondel' : t.n === 3 || t.n >= 6 ? 'stiletto' : 'plain' })),
    look: (t) => ['', 'A plain iron knife.', 'A rondel dagger, made for gaps in armour.', 'A needle of a stiletto.', 'A dwarven tunnel-knife, broad and short.', 'A curved jambiya with a turquoise pommel.', 'A shiv of green sea-glass.', 'A sliver of star-metal, cold to hold.', 'A black needle; the wound it makes is darker than it should be.'][t.n],
    inputs: (t) => [ing(t, 1), hd(t, 1)],
  },
  {
    key: 'handAxe', name: 'Hand Axe', kind: 'axe', base: { damage: 19, speed: 1.08, bleed: 3 }, fold: { 1: 'handAxe' }, bench: 'forge', shop: 'smith', lv: 1,
    build: (t) => () => buildAxe({ metal: t.metalKey, wood: t.woodKey, two: false, bearded: t.n === 4 || t.n === 5 || t.n === 8 }),
    look: (t) => (t.n === 4 ? 'A bearded dwarven axe.' : t.n === 5 ? 'A crescent blade on a sunpalm haft.' : 'A one-handed axe. Hits bleed.'),
    inputs: (t) => [ing(t, 2), wd(t, 1)],
  },
  {
    key: 'greataxe', name: 'Greataxe', kind: 'axe', hands: 2, base: { damage: 34, speed: 0.82, bleed: 5, stagger: 1.2 }, fold: { 2: 'steelGreataxe' }, bench: 'forge', shop: 'smith', lv: 3,
    build: (t) => () => buildAxe({ metal: t.metalKey, wood: t.woodKey, two: true, double: t.n === 4 || t.n >= 6, bearded: t.n === 5 || t.n === 8 || t.n <= 2 }),
    look: (t) => (t.n === 4 ? 'A double-bit dwarven greataxe.' : t.n === 5 ? 'A half-moon blade.' : t.n === 6 ? 'Coral has grown along the haft.' : 'A two-handed axe. Hits bleed.'),
    inputs: (t) => [ing(t, 3), wd(t, 2)],
  },
  {
    key: 'mace', name: 'Mace', kind: 'mace', base: { damage: 20, speed: 0.95, stagger: 1.5 }, bench: 'forge', shop: 'smith', lv: 1,
    build: (t) => () => buildMace({ metal: t.metalKey, wood: t.woodKey, two: false, head: t.n === 2 || t.n === 6 || t.n === 7 ? 'star' : t.n === 4 ? 'hammer' : 'flanged' }),
    look: (t) => ['', 'A flanged iron mace.', 'A morning star.', 'A flanged mace, silver-faced.', 'A dwarven anvil-head.', 'A sun-disc head of brass.', 'A spiked head like a sea urchin.', 'A star-headed mace, flecked with silver.', 'A black flanged head that cracks armour like ice.'][t.n],
    inputs: (t) => [ing(t, 3), wd(t, 1)],
  },
  {
    key: 'warhammer', name: 'Warhammer', kind: 'mace', hands: 2, base: { damage: 32, speed: 0.78, stagger: 2, poise: 6 }, bench: 'forge', shop: 'smith', lv: 4,
    build: (t) => () => buildMace({ metal: t.metalKey, wood: t.woodKey, two: true, head: t.n === 4 || t.n === 8 ? 'maul' : 'hammer' }),
    look: (t) => (t.n === 4 ? 'A rune maul.' : t.n === 8 ? 'The head is a black meteorite.' : 'Spike and hammer on a long haft.'),
    inputs: (t) => [ing(t, 4), wd(t, 2)],
  },
  {
    key: 'spear', name: 'Spear', kind: 'spear', base: { damage: 22, speed: 1 }, fold: { 1: 'ironSpear' }, bench: 'forge', shop: 'smith', lv: 1,
    build: (t) => () => buildSpear({ metal: t.metalKey, wood: t.woodKey, back: 0.55, front: 1.55, head: t.n === 6 ? 'partisan' : 'leaf' }),
    look: (t) => (t.n === 6 ? 'A barbed fishing-spear head.' : 'A leaf blade on a long shaft.'),
    inputs: (t) => [ing(t, 1), wd(t, 2)],
  },
  {
    key: 'glaive', name: 'Glaive', kind: 'spear', base: { damage: 26, speed: 0.94, crit: 0.04 }, fold: { 2: 'steelPartisan', 3: 'silversteelGlaive' }, bench: 'forge', shop: 'smith', lv: 3,
    build: (t) => () => buildSpear({ metal: t.metalKey, wood: t.woodKey, back: 0.55, front: 1.55, head: 'glaive' }),
    look: (t) => (t.n === 5 ? 'A khopesh on a pole.' : 'A long single-edged blade on a polearm.'),
    inputs: (t) => [ing(t, 2), wd(t, 2)],
  },
  {
    key: 'staff', name: 'Staff', kind: 'staff', base: { damage: 17, speed: 1.1, focus: 0.08 }, fold: { 1: 'oakQuarterstaff', 2: 'ashStaff', 3: 'yewStaff' }, bench: 'workbench', shop: 'bowyer', lv: 0,
    build: (t) => () => buildStaff({ wood: t.woodKey, shod: t.metalKey, focus: [0, 0, 0, 0, 0xe8f0ff, 0xffc040, 0xf0f4ff, 0x9ab8ff, 0x8a4aff][t.n] }),
    look: (t) => ['', '', '', '', 'Bound with a quartz crystal.', 'Bound with a topaz.', 'Crowned with a sea pearl.', 'A star-shard burns in its head.', 'A void crystal hums in its head.'][t.n],
    inputs: (t) => [wd(t, 2), ing(t, 1)],
  },
  {
    key: 'bow', name: 'Bow', kind: 'bow', ammo: 'arrow', base: { damage: 16, speed: 1 }, fold: { 1: 'huntingBow', 2: 'ashLongbow', 3: 'yewWarbow' }, bench: 'workbench', shop: 'bowyer', lv: 1,
    build: (t) => () => buildPlayerBow({ wood: t.woodKey, len: t.n === 5 ? 1.2 : t.n === 6 ? 1.52 : 1.38, recurve: t.n >= 4 && t.n !== 6, tips: t.metalKey }),
    look: (t) => ['', '', '', '', 'An ironwood recurve.', 'A horn-laminate desert bow.', 'A long bow of sea-bleached driftwood.', 'A starwood recurve; the string glints.', 'A gloamwood bow whose string you can barely see.'][t.n],
    inputs: (t) => [wd(t, 3), fb(t, 1), hd(t, 1)],
  },
  {
    key: 'crossbow', name: 'Crossbow', kind: 'crossbow', ammo: 'bolt', base: { damage: 30, speed: 1, pierce: 0.3 }, fold: { 1: 'lightCrossbow' }, bench: 'workbench', shop: 'bowyer', lv: 3,
    build: (t) => () => buildCrossbow({ metal: t.metalKey, wood: t.woodKey, heavy: t.n === 3 || t.n === 4 || t.n === 6 || t.n === 8 }),
    look: (t) => (t.n === 4 ? 'A deepsteel windlass crossbow: slow to wind, terrible to meet.' : t.n === 6 ? 'A harpoon crossbow from the isles.' : t.n === 3 ? 'A silversteel arbalest.' : 'A stocked crossbow.'),
    inputs: (t) => [wd(t, 2), ing(t, 2), fb(t, 1)],
  },
];

/** The tier names for kinds that go by their wood ("Ironwood Bow"). */
const named = (k: Kind, t: Tier) =>
  k.key === 'staff' ? `${t.wood} Staff` : k.key === 'bow' ? `${t.wood} ${t.n === 4 ? 'Recurve' : t.n === 5 ? 'Horn Bow' : 'Bow'}` : k.key === 'crossbow' && t.n === 3 ? 'Silversteel Arbalest' : k.key === 'crossbow' && t.n === 4 ? 'Deepsteel Windlass' : k.key === 'crossbow' && t.n === 6 ? 'Tideglass Harpoon-Bow' : `${t.metal} ${k.name}`;

/** What each tier adds on top of the bigger numbers. */
function tierTraits(t: Tier, k: Kind): ItemStats {
  const s: ItemStats = {};
  if (t.n === 4) s.stagger = (k.base.stagger ?? 1) + 0.2;
  if (t.n === 5) s.burn = rd(3 + (k.base.damage ?? 20) * 0.12);
  if (t.n === 6) { s.crit = rd((k.base.crit ?? 0) + 0.08, 0.01); s.pierce = rd((k.base.pierce ?? 0) + 0.15, 0.01); }
  if (t.n === 7) { s.crit = rd((k.base.crit ?? 0) + 0.06, 0.01); if (k.key === 'staff') s.focus = rd((k.base.focus ?? 0) + 0.12, 0.01); s.frost = 0.08; }
  if (t.n === 8) { s.lifesteal = 0.06; s.bleed = rd((k.base.bleed ?? 0) + 4); }
  return s;
}

/** The standard line's ids, [kind][tier] (folded ones are the old item's id). */
export const STANDARD_WEAPONS: Record<string, string[]> = {};

for (const k of KINDS) {
  STANDARD_WEAPONS[k.key] = [];
  for (const t of TIERS) {
    const fold = k.fold?.[t.n];
    const id = fold ?? `${t.metalKey}_${k.key}`;
    STANDARD_WEAPONS[k.key][t.n] = id;
    const where = t.n <= 6 ? [`shop:${k.shop}:${t.n}`, `drop:armed:${t.n}`, `chest:${t.n}`] : [`chest:${t.n}`];
    if (k.key === 'staff' && t.n <= 6) where.push(`shop:arcane:${t.n}`);
    if (fold) {
      source(fold, ...where);
      continue;
    }
    const stats: ItemStats = { ...k.base, ...tierTraits(t, k) };
    stats.damage = rd((k.base.damage ?? 10) * t.mult * (k.key === 'crossbow' && (t.n === 4 || t.n === 6) ? 1.12 : 1));
    if (k.key === 'crossbow' && (t.n === 4 || t.n === 6)) stats.speed = 0.85;
    if (stats.poise) stats.poise = rd(stats.poise * (1 + (t.n - 1) * 0.2));
    const def: ItemDef = {
      id, name: named(k, t), kind: k.kind, slot: 'main', rarity: RAR[t.n], lvl: t.lvl[0],
      desc: `${k.look(t) || 'A ' + k.name.toLowerCase() + ' of the ' + t.metal.toLowerCase() + ' tier.'} Tier ${t.n} (${t.metal}): ${t.where}.`,
      stats, build: k.build(t), ...(k.hands ? { hands: k.hands } : {}), ...(k.ammo ? { ammo: k.ammo } : {}),
    };
    add(def, where);
    recipe(id, k.bench, 'smithing', t.craft + k.lv, k.inputs(t), t.book ? `book:${t.book}` : 'basic', { step: 'hammer' });
  }
}

// ---- ammunition (§2c) --------------------------------------------------------------------------
const arrow = (id: string, name: string, head: ArrowHead | 'bolt', rarity: Rarity, desc: string, stats: ItemStats, src: string[], make: [string, number][], level: number) => {
  add({ id, name, kind: 'ammo', slot: 'quiver', rarity, stack: true, desc, stats, ammo: head === 'bolt' ? 'bolt' : 'arrow', build: head === 'bolt' ? buildBoltBundle : () => buildArrowBundle(head) }, src);
  recipe(id, 'workbench', 'smithing', level, make, 'basic', { n: head === 'bolt' ? 8 : 10, quality: false });
};
arrow('arrowBodkin', 'Bodkin Arrows', 'iron', 'fine', 'Square needle heads made to punch mail. They slip through armour.', { damage: 7, pierce: 0.45 }, ['shop:bowyer:2', 'shop:smith:3', 'chest:2'], [['planks', 1], ['steelIngot', 1]], 6);
arrow('arrowBarbed', 'Barbed Arrows', 'broadhead', 'fine', 'Hooked heads that will not come out clean. Hits bleed.', { damage: 7, bleed: 5 }, ['shop:bowyer:2', 'drop:bandit:2', 'chest:2'], [['planks', 1], ['ironIngot', 1], ['leather', 1]], 4);
arrow('arrowThunder', 'Thunder Arrows', 'fire', 'rare', 'A pinch of blackpowder in a paper collar behind the head. They knock a foe off its feet.', { damage: 9, stagger: 2.2 }, ['shop:bowyer:3', 'chest:3'], [['arrowIron', 10], ['sulphur', 1]], 10);
arrow('arrowBlunt', 'Blunt Arrows', 'bone', 'common', 'Wooden knobs instead of heads. Hunters use them for birds; soldiers for stopping a charge. They stagger.', { damage: 4, stagger: 2.6 }, ['shop:bowyer:1', 'shop:trader:1'], [['planks', 1]], 1);
arrow('arrowWhistling', 'Whistling Arrows', 'iron', 'fine', 'Holed heads that shriek in flight. A foe that hears one flinches at the wrong moment: more critical hits.', { damage: 5, crit: 0.15 }, ['shop:bowyer:2', 'chest:2'], [['arrowIron', 10], ['flax', 1]], 5);
arrow('arrowVenom', 'Hollowpoint Venom Arrows', 'bone', 'rare', 'Hollow heads packed with spider venom. The poison eats at what they hit: 4 damage a second.', { damage: 7, bleed: 4 }, ['shop:alchemist:3', 'drop:insect:3', 'chest:3'], [['arrowIron', 10], ['venomSac', 1]], 9);
arrow('arrowDawnlight', 'Dawnlight Arrows', 'fire', 'rare', 'Blessed at the Temple of the Dawn. They burn with a white flame and find the heart.', { damage: 8, burn: 4, crit: 0.1 }, ['shop:temple:3', 'chest:4'], [['arrowIron', 10], ['essenceLight', 1]], 14);
arrow('arrowGloam', 'Gloam Arrows', 'bone', 'epic', 'Black shafts fletched with shade-smoke. Wards and armour mean very little to them.', { damage: 9, pierce: 0.6 }, ['drop:gloam:6', 'chest:7'], [['arrowIron', 10], ['gloamIchor', 1]], 30);
arrow('boltSteel', 'Steel Bolts', 'bolt', 'common', 'Steel-headed quarrels: the Crown armoury\'s standard.', { damage: 13 }, ['shop:bowyer:2', 'shop:smith:2'], [['planks', 1], ['steelIngot', 1]], 5);
arrow('boltHeavy', 'Heavy Bolts', 'bolt', 'fine', 'Fat iron quarrels for a windlass. They knock a man flat.', { damage: 16, stagger: 1.8 }, ['shop:bowyer:3', 'chest:3'], [['planks', 1], ['ironIngot', 2]], 8);
arrow('boltExplosive', 'Explosive Bolts', 'bolt', 'rare', 'A clay pot of pitch and blackpowder behind the head. Hits burn.', { damage: 12, burn: 10 }, ['shop:bowyer:4', 'drop:bandit:5', 'chest:4'], [['boltIron', 8], ['sulphur', 1], ['coal', 1]], 15);
arrow('boltHarpoon', 'Harpoon Bolts', 'bolt', 'fine', 'Barbed whaler\'s bolts on a short line. They tear and stagger.', { damage: 14, stagger: 2, bleed: 3 }, ['shop:bowyer:6', 'drop:sea:5', 'chest:6'], [['driftwood', 1], ['ironIngot', 1]], 12);
arrow('boltFrost', 'Frost Bolts', 'bolt', 'fine', 'Heads of silverthistle glass. Hits may freeze.', { damage: 12, frost: 0.35 }, ['shop:bowyer:3', 'chest:3'], [['boltIron', 8], ['silverthistle', 1]], 9);
arrow('boltSilver', 'Silver Bolts', 'bolt', 'rare', 'Silver-capped bolts. The dead feel them; so does everything else.', { damage: 13, crit: 0.15, pierce: 0.2 }, ['shop:temple:3', 'shop:bowyer:3', 'chest:4'], [['boltIron', 8], ['silverIngot', 1]], 12);
arrow('boltDuskiron', 'Duskiron Bolts', 'bolt', 'epic', 'Black bolts from the Iron Below. Nothing stops them.', { damage: 18, pierce: 0.5, bleed: 3 }, ['chest:8'], [['planks', 1], ['duskironIngot', 1]], 35);
for (const id of ['arrowIron', 'boltIron']) source(id, 'shop:bowyer:1', 'shop:trader:1', 'shop:smith:1');
for (const id of ['arrowBroadhead', 'arrowFire', 'arrowFrost', 'arrowBone']) source(id, 'shop:bowyer:2', 'chest:2');
