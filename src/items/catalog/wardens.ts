import { add } from './kit';
import { FAMILY_NAMES } from './gearFx';

// The Glen Wardens' gifts for the bestiary's hunt marks (progression/bestiary.ts):
// a charm for every family of foe you have come to know, and three keepsakes
// from Rook as your Warden's Rank climbs.

const FAMS: [string, string, string, 'tusk' | 'fang' | 'stone' | 'feather' | 'bone' | 'disc' | 'scarab' | 'heart' | 'wheel'][] = [
  ['beast', 'Beasts', '#8a6a3a', 'fang'],
  ['insect', 'Crawlers', '#5a6a3a', 'scarab'],
  ['slime', 'Oozes', '#5ab04a', 'stone'],
  ['goblin', 'Goblins', '#7a9a3a', 'tusk'],
  ['orc', 'Orcs', '#6a7a3a', 'tusk'],
  ['bandit', 'Outlaws', '#7a4a3a', 'disc'],
  ['undead', 'the Dead', '#a8b0b8', 'bone'],
  ['gloam', 'the Dark', '#7a5ab0', 'heart'],
  ['construct', 'Constructs', '#8a8a90', 'wheel'],
  ['sea', 'Sea and Sand', '#3a8ab0', 'disc'],
  ['wyrm', 'Wyrms', '#b04a3a', 'fang'],
];

for (const [fam, label, color, hang] of FAMS) {
  add({
    id: `wardenCharm_${fam}`, name: `Wardens' Charm of ${label}`, kind: 'accessory', slot: 'trinket', rarity: 'rare', lvl: 10,
    desc: `Rook sent this when your bestiary knew every one of ${FAMILY_NAMES[fam] ?? label}: a token the Wardens give their best hunters of them.`,
    stats: { maxHp: 10 }, fx: { [`bane_${fam}`]: 0.06, [`ward_${fam}`]: 0.06 },
  }, ['gift:bestiary family page'], { k: 'trinket', s: { kind: 'charm', metal: 'bronze', color, accent: '#d8c8a0', hang } });
}

add({
  id: 'rooksWhistle', name: "Rook's Bone Whistle", kind: 'accessory', slot: 'trinket', rarity: 'rare', lvl: 8,
  desc: 'Rook\'s own hunting whistle, carved from a boar\'s tusk. "Blow it and I\'ll come. Probably. Unless it\'s raining."',
  stats: { maxHp: 15, maxStamina: 10 }, fx: { killHeal: 4 },
}, ['gift:Warden\'s Rank (Stalker)'], { k: 'trinket', s: { kind: 'horn', metal: 'bronze', color: '#e8dcc0', accent: '#6a8a4a' } });

add({
  id: 'wardensTorc', name: "The Wardens' Torc", kind: 'accessory', slot: 'trinket', rarity: 'epic', lvl: 20,
  desc: 'A twisted bronze torc. Every Warden captain since the Fall has worn it for a season; this one is yours to keep.',
  stats: { maxHp: 30 }, fx: { crowdDmg: 0.06, luck: 0.05 },
}, ['gift:Warden\'s Rank (Bane-Taker)'], { k: 'trinket', s: { kind: 'amulet', metal: 'bronze', color: '#6a8a4a', accent: '#c8a040', glow: '#8ac060' } });

add({
  id: 'greenmantleRing', name: 'The Greenmantle Ring', kind: 'accessory', slot: 'trinket', rarity: 'legendary', lvl: 35,
  desc: 'The ring of the Warden of the Wild. Only five have held it. The leaf on the band is said to be the first leaf of the Glen.',
  stats: { maxHp: 40, maxStamina: 20 }, fx: { bane_beast: 0.08, bane_undead: 0.08, bane_gloam: 0.08, killHeal: 6 },
}, ['gift:Warden\'s Rank (Warden of the Wild)'], { k: 'trinket', s: { kind: 'ring', metal: 'gold', color: '#4aa04a', accent: '#e8dcc0', glow: '#8ae060' } });
