import type { ItemStats, Rarity } from '../itemDefs';
import type { TrinketSpec } from '../../ui/art/trinkets';
import { add, recipe, rd, source } from './kit';

// Rings, amulets and trinkets (the item plan, §6). The metal sets a jewel's
// strength and the gem its stat; trinkets are wards, Sunwheel tokens, lucky
// charms, keepsakes from the people you help, and trophies of the hunt.

interface Metal { key: string; name: string; k: number; bar: string; lvl: number; art: string; glow?: string; tier: number; learn?: string }
const METALS: Metal[] = [
  { key: 'copper', name: 'Copper', k: 1, bar: 'copperIngot', lvl: 1, art: 'copper', tier: 1 },
  { key: 'silver', name: 'Silver', k: 2, bar: 'silverIngot', lvl: 5, art: 'silver', tier: 2 },
  { key: 'gold', name: 'Gold', k: 3, bar: 'goldIngot', lvl: 10, art: 'gold', tier: 3 },
  { key: 'deepsteel', name: 'Deepsteel', k: 4, bar: 'deepsteelIngot', lvl: 15, art: '#5a6a88', tier: 4 },
  { key: 'sunbrass', name: 'Sunbrass', k: 5, bar: 'sunbrassIngot', lvl: 20, art: 'brass', tier: 5 },
  { key: 'starmetal', name: 'Starmetal', k: 6, bar: 'starmetalIngot', lvl: 30, art: '#4a4a5a', glow: '#9ab8ff', tier: 7, learn: 'book:bookStarfall' },
];
interface Gem { key: string; name: string; cut: string; color: string; stat: (k: number) => { s: ItemStats; fx?: Record<string, number> } }
const GEMS: Gem[] = [
  { key: 'garnet', name: 'Garnet', cut: 'cutGarnet', color: '#b01a2a', stat: (k) => ({ s: { maxHp: 8 * k } }) },
  { key: 'amethyst', name: 'Amethyst', cut: 'cutAmethyst', color: '#9a4ae0', stat: (k) => ({ s: { maxMana: 8 * k } }) },
  { key: 'sapphire', name: 'Sapphire', cut: 'cutSapphire', color: '#2a4ae8', stat: (k) => ({ s: { maxStamina: 8 * k } }) },
  { key: 'topaz', name: 'Topaz', cut: 'cutTopaz', color: '#f0a830', stat: (k) => ({ s: {}, fx: { attackSpeed: rd(0.015 * k, 0.005) } }) },
  { key: 'pearl', name: 'Pearl', cut: 'pearl', color: '#f4f0e8', stat: (k) => ({ s: {}, fx: { heal: rd(0.03 * k, 0.01) } }) },
  { key: 'emerald', name: 'Emerald', cut: 'cutEmerald', color: '#2ac06a', stat: (k) => ({ s: { staminaRegen: rd(0.05 * k, 0.01), manaRegen: rd(0.05 * k, 0.01) } }) },
  { key: 'ruby', name: 'Ruby', cut: 'cutRuby', color: '#e0102a', stat: (k) => ({ s: {}, fx: { melee: rd(0.02 * k, 0.01) } }) },
  { key: 'starstone', name: 'Starstone', cut: 'cutStarstone', color: '#9ab8ff', stat: (k) => ({ s: {}, fx: { spell: rd(0.02 * k, 0.01) } }) },
];
const ringRar = (k: number): Rarity => (k <= 1 ? 'common' : k <= 2 ? 'fine' : k <= 4 ? 'rare' : 'epic');
const ringSpec = (m: Metal, g: Gem, kind: 'ring' | 'amulet'): TrinketSpec => ({ kind, metal: m.art, color: g.color, ...(m.glow ? { glow: m.glow } : {}), ...(kind === 'amulet' ? { shape: g.key === 'pearl' ? 'drop' : 'oval' } : {}) });

for (const m of METALS) {
  for (const g of GEMS) {
    const id = `${m.key}${g.name}Ring`;
    const { s, fx } = g.stat(m.k);
    add({ id, name: `${m.name} ${g.name} Ring`, kind: 'accessory', slot: 'ring1', rarity: ringRar(m.k), lvl: m.lvl, desc: `A ${g.name.toLowerCase()} set in ${m.name.toLowerCase()}. The metal sets the strength, the stone the gift.`, stats: s, ...(fx ? { fx } : {}) },
      m.tier <= 6 ? [`shop:jeweller:${m.tier}`, `chest:${m.tier + 1}`] : [], { k: 'trinket', s: ringSpec(m, g, 'ring') });
    recipe(id, 'workbench', 'jewelcrafting', m.lvl + Math.floor(GEMS.indexOf(g) / 2), [[m.bar, 1], [g.cut, 1]], (m.learn ?? 'basic') as never, { step: 'hammer' });
  }
}
for (const m of METALS.filter((x) => x.key !== 'copper' && x.key !== 'deepsteel')) {
  for (const g of GEMS) {
    const id = `${m.key}${g.name}Amulet`;
    const { s, fx } = g.stat(m.k * 2);
    add({ id, name: `${m.name} ${g.name} Amulet`, kind: 'accessory', slot: 'amulet', rarity: ringRar(m.k + 1), lvl: m.lvl + 2, desc: `Two ${g.name.toLowerCase()}s on a ${m.name.toLowerCase()} chain: twice a ring's gift, and a little protection.`, stats: s, fx: { ...(fx ?? {}), dmgTaken: -rd(0.01 * m.k, 0.01) }, armor: 'amulet', look: { weight: 'plate', base: parseInt(g.color.slice(1), 16), trim: 0xc8a040, cloth: 0 } },
      m.tier <= 6 ? [`shop:jeweller:${m.tier}`, `chest:${m.tier + 1}`] : [], { k: 'trinket', s: ringSpec(m, g, 'amulet') });
    recipe(id, 'workbench', 'jewelcrafting', m.lvl + 3, [[m.bar, 2], [g.cut, 2]], (m.learn ?? 'basic') as never, { step: 'hammer' });
  }
}

// ---- trinkets ----------------------------------------------------------------------------------
const trinket = (id: string, name: string, rarity: Rarity, desc: string, stats: ItemStats, fx: Record<string, number> | undefined, src: string[], art: TrinketSpec, lvl = 1) =>
  add({ id, name, kind: 'accessory', slot: 'trinket', rarity, lvl, desc, stats, ...(fx ? { fx } : {}) }, src, { k: 'trinket', s: art });

// Ward charms: five threats in three grades.
const WARDS: [string, string, string, string, TrinketSpec['hang']][] = [
  ['wolf', 'Wolf', 'wolves', '#8a8a90', 'fang'],
  ['undead', 'Grave', 'the dead', '#e8dcc0', 'bone'],
  ['gloam', 'Dusk', 'the Dark', '#7a3aff', 'stone'],
  ['venom', 'Venom', 'venom', '#8ad04a', 'heart'],
  ['fire', 'Fire', 'fire', '#ff6a2a', 'disc'],
];
const GRADES: [string, Rarity, number, number, string][] = [['Charm', 'fine', 0.08, 3, 'trader'], ['Talisman', 'rare', 0.14, 12, 'temple'], ['Relic', 'epic', 0.2, 24, 'temple']];
for (const [key, word, what, col, hang] of WARDS) {
  GRADES.forEach(([grade, rarity, v, lvl, shop], gi) => {
    const id = `${key}Ward${grade}`;
    const fx: Record<string, number> = { [`ward_${key}`]: v, ...(gi === 2 && key !== 'venom' && key !== 'fire' ? { [`bane_${key}`]: 0.08 } : {}) };
    trinket(id, `${word} Ward ${grade}`, rarity, `A ward against ${what}, knotted and blessed. Hedge-witches sell the charms; the Temple keeps the stronger ones.`, {}, fx,
      [`shop:${shop}:${gi + 1}`, ...(gi > 0 ? [`fshop:temple`, `chest:${gi * 2 + 2}`] : ['shop:alchemist:1'])], { kind: 'charm', metal: gi === 0 ? 'bronze' : gi === 1 ? 'silver' : 'gold', color: col, hang, ...(gi === 2 ? { glow: col } : {}) }, lvl);
    recipe(id, 'runestone', 'runecraft', lvl, [[gi === 0 ? 'copperIngot' : gi === 1 ? 'silverIngot' : 'goldIngot', 1], [key === 'wolf' ? 'wolfFang' : key === 'undead' ? 'boneDust' : key === 'gloam' ? 'shadeSmoke' : key === 'venom' ? 'venomSac' : 'emberroot', gi + 1]], 'basic');
  });
}

// Sunwheel Tokens: one for each stone you read in the wilds (sources.ts gives them).
export const TOKENS: { id: string; name: string; fx?: Record<string, number>; s?: ItemStats; line: string }[] = [
  { id: 'sunwheelToken1', name: 'Token of the First Stone', fx: { shopDiscount: 0.03 }, line: 'Traders are kinder to those who carry it.' },
  { id: 'sunwheelToken2', name: 'Token of the Second Stone', fx: { moveSpeed: 0.03 }, line: 'The road seems shorter.' },
  { id: 'sunwheelToken3', name: 'Token of the Third Stone', s: { maxStamina: 15 }, line: 'You tire later.' },
  { id: 'sunwheelToken4', name: 'Token of the Fourth Stone', fx: { lightRoom: 1 }, line: 'It glows a little in the dark.' },
  { id: 'sunwheelToken5', name: 'Token of the Fifth Stone', fx: { heal: 0.05 }, line: 'Wounds close a little faster.' },
  { id: 'sunwheelToken6', name: 'Token of the Sixth Stone', s: { manaRegen: 0.15 }, line: 'Your thoughts come back sooner.' },
  { id: 'sunwheelToken7', name: 'Token of the Seventh Stone', fx: { oocRegen: 2 }, line: 'At rest, you mend.' },
  { id: 'sunwheelToken8', name: 'Token of the Eighth Stone', fx: { holyDmg: 0.06 }, line: 'The Dawn\'s light is a little brighter.' },
  { id: 'sunwheelToken9', name: 'Token of the Ninth Stone', fx: { dmgTaken: -0.03 }, line: 'Blows land a little softer.' },
  { id: 'sunwheelToken10', name: 'Token of the Tenth Stone', fx: { xpGain: 0.06 }, line: 'You learn from every fight.' },
  { id: 'sunwheelToken11', name: 'Token of the Eleventh Stone', fx: { potionPower: 0.1 }, line: 'Draughts taste stronger.' },
  { id: 'sunwheelToken12', name: 'Token of the Twelfth Stone', fx: { wheelHeal: 1 }, line: 'The wheel mends you when it carries you.' },
];
for (const [i, t] of TOKENS.entries()) {
  trinket(t.id, t.name, 'rare', `A gold disc with the Sunwheel on it, found at the foot of a standing stone. ${t.line} Carry all twelve and the one you wear counts twice.`, t.s ?? {}, t.fx, [`stone:${i + 1}`], { kind: 'badge', metal: 'gold', color: '#ffd88a', glyph: 'wheel', glow: '#ffd88a' });
}

// Lucky charms.
trinket('rabbitsFoot', 'Rabbit\'s Foot', 'fine', 'A rabbit\'s foot on a thong. It did not work for the rabbit.', {}, { luck: 0.1 }, ['shop:trader:1', 'drop:beast:0'], { kind: 'charm', metal: 'bronze', color: '#c8b8a0', hang: 'bone' });
trinket('cloverGlass', 'Four-Leaf Clover in Glass', 'rare', 'A four-leaf clover pressed in a glass bead.', {}, { luck: 0.08, crit: 0.02 }, ['site:orchard', 'site:farmstead', 'shop:trader:2'], { kind: 'charm', metal: 'silver', color: '#4ac04a', hang: 'stone' });
trinket('feyLuckRing', 'Fey-Luck Ring of Mushrooms', 'rare', 'A ring of tiny dried mushrooms on a cord, from a fairy ring. Things go your way, oddly.', {}, { luck: 0.12, dodgeCost: -0.05 }, ['site:fairyRing'], { kind: 'ring', metal: 'bronze', color: '#e8c0ff', glow: '#e8a0ff' });
trinket('horseshoeNail', 'Horseshoe Nail', 'fine', 'A nail from a lucky shoe. Stablehands swear by them.', {}, { moveSpeed: 0.03, luck: 0.05 }, ['shop:trader:2', 'site:farmstead'], { kind: 'charm', metal: 'iron', color: '#8a8a90', hang: 'disc' });
trinket('gamblersDie', 'Gambler\'s Bone Die', 'rare', 'A bone die from the Gilded Stag\'s back room. It rolls sixes when it matters.', {}, { critGold: 1, luck: 0.05 }, ['shop:inn:3'], { kind: 'charm', metal: 'bone', color: '#e8dcc0', hang: 'bone' });
trinket('fortuneCard', 'Fortune-Teller\'s Card', 'rare', 'The Tower, upside down. The fortune-teller said that was a good sign.', {}, { crit: 0.04 }, ['site:players', 'site:hermit'], { kind: 'flag', color: '#6a2a8a', accent: '#e8c060', glyph: 'star' });
trinket('wishingCoin', 'Wishing-Well Coin', 'fine', 'A coin someone threw in a well, wished on, and you fished out. The wish is still in it.', {}, { goldFind: 0.1 }, ['site:well'], { kind: 'badge', metal: 'silver', color: '#c4ccd6', glyph: 'star' });
trinket('hobsButton', 'Old Hob\'s Button', 'fine', 'A horn button from Old Hob\'s coat. People trust you a little more.', {}, { shopDiscount: 0.05 }, ['done:hob'], { kind: 'badge', metal: 'bone', color: '#c8a870' });
trinket('pipsConker', 'Pip\'s Lucky Conker', 'fine', 'Pip\'s champion conker, on its string. Undefeated.', {}, { luck: 0.12 }, ['done:pips-cat'], { kind: 'charm', metal: 'bronze', color: '#8a4a2a', hang: 'stone' });

// Keepsakes from the people you help (side quests give them).
const KEEP: [string, string, string, string, ItemStats, Record<string, number> | undefined, TrinketSpec][] = [
  ['wrensWheatEar', 'Wren\'s Wheat Ear', 'wren', 'An ear of wheat from Wren\'s field, plaited into a knot. "So you remember the harvest."', { maxHp: 15 }, undefined, { kind: 'knot', color: '#d8b860' }],
  ['tomHalesCowbell', 'Tom Hale\'s Cowbell', 'missing-heifer', 'The heifer\'s old bell. Tom said she won\'t need it now she knows the way home.', { maxStamina: 12 }, undefined, { kind: 'lantern', metal: 'brass' }],
  ['maudsThimble', 'Maud\'s Thimble', 'wool-for-vela', 'A silver thimble, worn thin at the top.', {}, { blockCost: -0.06 }, { kind: 'ring', metal: 'silver', color: '#c4ccd6' }],
  ['marasCorkscrew', 'Mara\'s Corkscrew', 'fish-supper', 'A brass corkscrew from the Wayfarer Inn. Meals taste better with it in your pocket.', {}, { potionPower: 0.08 }, { kind: 'key', metal: 'brass' }],
  ['tessasBreadStamp', 'Tessa\'s Bread Stamp', 'milk-for-the-bakery', 'The wooden stamp Tessa marks her loaves with.', { maxHp: 10 }, { heal: 0.04 }, { kind: 'badge', metal: '#8a6a44', glyph: 'wheel' }],
  ['oswinsMillPin', 'Oswin\'s Mill Pin', 'mill-wheel-jam', 'The iron pin that jammed the mill wheel, kept as a lesson.', {}, { poiseDmg: 0.06 }, { kind: 'key', metal: 'iron' }],
  ['dorasGranaryKey', 'Dora\'s Granary Key', 'granary-rats', 'A spare key to the Glen granary. Dora trusts you with it.', {}, { bane_insect: 0.1 }, { kind: 'key', metal: 'iron', shape: 'round' }],
  ['ilyrasMortarCharm', 'Ilyra\'s Mortar Charm', 'herb-quill-rival', 'A tiny stone mortar on a cord.', {}, { potionPower: 0.1 }, { kind: 'charm', metal: 'pewter', color: '#9aa0a4', hang: 'stone' }],
  ['kaelasWristWrap', 'Kaela\'s Wrist Wrap', 'trial-gale', 'A worn linen wrap Kaela gave you after your trial.', {}, { attackSpeed: 0.03 }, { kind: 'ribbon', color: '#e8e0c8', accent: '#5ab4ff' }],
  ['brannocsBadge', 'Brannoc\'s Badge', 'night-watch', 'An old Watch badge, rubbed smooth.', {}, { parryStamina: 5 }, { kind: 'badge', metal: 'iron', color: '#2a4a8a', glyph: 'shield' }],
  ['rooksArrowhead', 'Rook\'s Arrowhead', 'wilds-champions', 'A broadhead Rook carried for twenty years.', {}, { crit: 0.03 }, { kind: 'charm', metal: 'iron', color: '#8a8a90', hang: 'fang' }],
  ['eddasLocket', 'Edda Ashby\'s Burnt Locket', 'rl-ashby-letter', 'A locket, scorched, with a lock of hair inside.', { maxHp: 20 }, { fireResist: 0.05 }, { kind: 'amulet', metal: 'silver', color: '#3a2a2a', shape: 'heart' }],
  ['liosLuteString', 'Lio\'s Lute String', 'rl-road-ballad', 'A gut string from Lio\'s lute, tied in a bow.', {}, { castSpeed: 0.04 }, { kind: 'ribbon', color: '#c8a87a', accent: '#8a2a2a' }],
];
for (const [id, name, quest, desc, s, fx, art] of KEEP) trinket(id, name, 'rare', desc, s, fx, [`done:${quest}`], art);

// Trophies of the hunt: a small chance from a kill (Prospecting raises it).
const TROPHIES: [string, string, string, string, Record<string, number>, TrinketSpec][] = [
  ['wolfFangNecklace', 'Wolf Fang Necklace', 'beast', 'Wolf fangs on a thong.', { ward_wolf: 0.06, bane_beast: 0.05 }, { kind: 'charm', metal: 'bone', color: '#efe6cc', hang: 'fang' }],
  ['boarTuskCharm', 'Boar Tusk Charm', 'beast', 'A curved tusk, bound in copper wire.', { bane_beast: 0.06, poiseDmg: 0.04 }, { kind: 'charm', metal: 'copper', color: '#e8d8a8', hang: 'tusk' }],
  ['bearClawCharm', 'Bear Claw', 'beast', 'A claw as long as a finger, on a cord.', { bane_beast: 0.08 }, { kind: 'charm', metal: 'bronze', color: '#3a3028', hang: 'fang' }],
  ['stagTine', 'Stag Antler Tine', 'beast', 'A tine from a great stag.', { bane_beast: 0.05, moveSpeed: 0.02 }, { kind: 'charm', metal: 'bone', color: '#c8a87a', hang: 'tusk' }],
  ['crabClawBracelet', 'Crab Claw Bracelet', 'sea', 'Crab-claw tips threaded on a band.', { bane_sea: 0.08 }, { kind: 'ring', metal: 'bronze', color: '#c8643a' }],
  ['batWingCharm', 'Bat-Wing Charm', 'insect', 'A dried bat wing in a little frame.', { bane_insect: 0.08 }, { kind: 'charm', metal: 'pewter', color: '#3a2a2a', hang: 'feather' }],
  ['spiderSilkKnot', 'Spider-Silk Knot', 'insect', 'A knot of spider silk that never comes undone.', { ward_venom: 0.1 }, { kind: 'knot', color: '#e8e8f0' }],
  ['oozePearl', 'Ooze Pearl', 'slime', 'A pearl of hardened jelly from an ooze\'s heart.', { bane_slime: 0.12 }, { kind: 'orb', color: '#8ae05a', glow: '#8ae05a' }],
  ['scarabShellCharm', 'Scarab Shell', 'insect', 'An iridescent scarab on a gold pin.', { bane_insect: 0.06, desertWard: 0.04 }, { kind: 'charm', metal: 'gold', color: '#2a6a5a', hang: 'scarab' }],
  ['sharkToothCharm', 'Shark Tooth Charm', 'sea', 'A shark tooth in a silver cap.', { bane_sea: 0.06, crit: 0.02 }, { kind: 'charm', metal: 'silver', color: '#f4f0e4', hang: 'fang' }],
];
for (const [id, name, fam, desc, fx, art] of TROPHIES) trinket(id, name, 'fine', desc + ' A trophy of the hunt.', {}, fx, [`trophy:${fam}`], art);
source('dicersCharm', 'shop:trader:2');
