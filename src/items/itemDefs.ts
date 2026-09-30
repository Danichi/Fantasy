import * as THREE from 'three';
import { buildSword, buildRoundShield, buildKiteShield, buildOdachi } from './weaponModels';
import { buildArmorPiece, type ArmorPieceId } from './armorModels';
import { PRODUCE_ITEMS } from './produce';
import { HERB_ITEMS, HERB_MODELS } from './herbs';
import { FISH_ITEMS } from '../world/fishing';

export type Slot =
  | 'main' | 'off'
  | 'head' | 'shoulders' | 'chest' | 'cloak' | 'hands' | 'legs' | 'feet'
  | 'amulet' | 'ring1' | 'ring2' | 'belt' | 'trinket';
export const ARMOR_SLOTS: Slot[] = ['head', 'shoulders', 'chest', 'cloak', 'hands', 'legs', 'feet'];
export const ACCESSORY_SLOTS: Slot[] = ['amulet', 'ring1', 'ring2', 'belt', 'trinket'];
export type ItemKind = 'sword' | 'shield' | 'armor' | 'accessory' | 'spell' | 'consumable' | 'key' | 'material';
export type Rarity = 'common' | 'fine' | 'rare' | 'epic';

export interface ItemStats {
  damage?: number;
  speed?: number; // attack speed multiplier
  block?: number; // % physical damage absorbed while blocking
  stability?: number; // lower stamina cost when blocking (0..1)
  armor?: number; // flat damage reduction before %
  poise?: number;
  manaCost?: number;
  heal?: number;
  restoreMana?: number;
  restoreStamina?: number;
  // bonuses (armour and accessories)
  maxHp?: number;
  maxStamina?: number;
  maxMana?: number;
  staminaRegen?: number; // fraction, 0.25 = +25%
  manaRegen?: number;
  damagePct?: number; // fraction
}

export const STAT_LABEL: Partial<Record<keyof ItemStats, string>> = {
  maxHp: 'Max health', maxStamina: 'Max stamina', maxMana: 'Max mana',
  staminaRegen: 'Stamina regen', manaRegen: 'Mana regen', damagePct: 'Damage',
};

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  slot?: Slot; // natural slot; swords may also go to 'off'
  rarity: Rarity;
  desc: string;
  stats: ItemStats;
  /** builds the 3D model (weapons/shields: grip space; armour: limb space) */
  build?: () => THREE.Object3D;
  /** armour pieces: which bones get which parts */
  armor?: ArmorPieceId;
  stack?: boolean;
}

const longsword = { bladeLen: 0.86, bladeWidth: 0.025, thickness: 0.0042, fullerLen: 0.66, gripLen: 0.15, guardSpan: 0.115, guardStyle: 'curved' as const, pommel: 'pear' as const };
const arming = { bladeLen: 0.72, bladeWidth: 0.024, thickness: 0.004, fullerLen: 0.72, gripLen: 0.1, guardSpan: 0.095, guardStyle: 'straight' as const, pommel: 'wheel' as const };
const knight = { bladeLen: 0.8, bladeWidth: 0.028, thickness: 0.0045, fullerLen: 0.55, gripLen: 0.12, guardSpan: 0.12, guardStyle: 'curved' as const, pommel: 'wheel' as const, guardMat: 'brass' as const };

export const ITEMS: Record<string, ItemDef> = {
  longsword: {
    id: 'longsword', name: 'Longsword', kind: 'sword', slot: 'main', rarity: 'common',
    desc: 'A hand-and-a-half blade with a long reach. Balanced and dependable.',
    stats: { damage: 24, speed: 1 }, build: () => buildSword(longsword),
  },
  armingSword: {
    id: 'armingSword', name: 'Arming Sword', kind: 'sword', slot: 'main', rarity: 'common',
    desc: 'A light one-handed sword. Quick in either hand, ideal for dual wielding.',
    stats: { damage: 18, speed: 1.2 }, build: () => buildSword(arming),
  },
  knightSword: {
    id: 'knightSword', name: "Knight's Broadsword", kind: 'sword', slot: 'main', rarity: 'fine',
    desc: 'A broad blade with a brass-fitted hilt. Heavier strikes, slower recovery.',
    stats: { damage: 30, speed: 0.88, poise: 5 }, build: () => buildSword(knight),
  },
  roundShield: {
    id: 'roundShield', name: 'Round Shield', kind: 'shield', slot: 'off', rarity: 'common',
    desc: 'Linden planks with an iron rim and boss. Light, and quick to parry with.',
    stats: { block: 80, stability: 0.45 }, build: () => buildRoundShield('quartered'),
  },
  kiteShield: {
    id: 'kiteShield', name: 'Heater Shield', kind: 'shield', slot: 'off', rarity: 'fine',
    desc: 'A curved heater shield bearing a gold chevron. Absorbs every blow.',
    stats: { block: 100, stability: 0.62 }, build: () => buildKiteShield(),
  },
  ironHelm: {
    id: 'ironHelm', name: 'Nasal Helm', kind: 'armor', slot: 'head', rarity: 'common',
    desc: 'A riveted conical helm with a nasal guard.', stats: { armor: 3, poise: 4 }, armor: 'helm',
  },
  pauldrons: {
    id: 'pauldrons', name: 'Steel Pauldrons', kind: 'armor', slot: 'shoulders', rarity: 'common',
    desc: 'Layered shoulder lames on leather.', stats: { armor: 3, poise: 5 }, armor: 'pauldrons',
  },
  breastplate: {
    id: 'breastplate', name: 'Breastplate', kind: 'armor', slot: 'chest', rarity: 'fine',
    desc: 'A ridged steel breastplate and backplate.', stats: { armor: 7, poise: 12 }, armor: 'breastplate',
  },
  gauntlets: {
    id: 'gauntlets', name: 'Gauntlets', kind: 'armor', slot: 'hands', rarity: 'common',
    desc: 'Steel vambraces and hand plates.', stats: { armor: 2, poise: 2 }, armor: 'gauntlets',
  },
  greaves: {
    id: 'greaves', name: 'Greaves', kind: 'armor', slot: 'legs', rarity: 'common',
    desc: 'Shin plates, knee cops and cuisses.', stats: { armor: 4, poise: 6 }, armor: 'greaves',
  },
  sabatons: {
    id: 'sabatons', name: 'Sabatons', kind: 'armor', slot: 'feet', rarity: 'common',
    desc: 'Articulated steel foot plates.', stats: { armor: 2, poise: 3 }, armor: 'sabatons',
  },
  wayfarerCloak: {
    id: 'wayfarerCloak', name: "Wayfarer's Cloak", kind: 'armor', slot: 'cloak', rarity: 'fine',
    desc: 'A heavy wool cloak, crimson and travel-worn.', stats: { armor: 2, maxStamina: 10 }, armor: 'cloak',
  },
  // ---- accessories -------------------------------------------------------------
  garnetAmulet: {
    id: 'garnetAmulet', name: 'Garnet Amulet', kind: 'accessory', slot: 'amulet', rarity: 'rare',
    desc: 'A deep red garnet on a silver chain. Warm to the touch.', stats: { maxHp: 25 }, armor: 'amulet',
  },
  ringVigor: {
    id: 'ringVigor', name: 'Ring of Vigour', kind: 'accessory', slot: 'ring1', rarity: 'fine',
    desc: 'A plain iron band. Your breath comes easier.', stats: { staminaRegen: 0.25 },
  },
  ringSage: {
    id: 'ringSage', name: "Sage's Ring", kind: 'accessory', slot: 'ring1', rarity: 'rare',
    desc: 'A silver ring set with a moonstone that hums faintly.', stats: { manaRegen: 0.5, maxMana: 15 },
  },
  warriorBelt: {
    id: 'warriorBelt', name: "Warrior's Belt", kind: 'accessory', slot: 'belt', rarity: 'common',
    desc: 'Thick leather with a brass buckle and a pouch.', stats: { poise: 8, maxStamina: 10 }, armor: 'belt',
  },
  warlordTusk: {
    id: 'warlordTusk', name: "Warlord's Tusk", kind: 'accessory', slot: 'trinket', rarity: 'epic',
    desc: "Grukk's broken tusk on a cord of braided sinew. Wearing it makes your blows land heavier.", stats: { damagePct: 0.12, maxHp: 20 },
  },
  orcOdachi: {
    id: 'orcOdachi', name: "Grukk's Odachi", kind: 'sword', slot: 'main', rarity: 'epic',
    desc: 'The Warlord\'s great curved blade, cut down to a length a human can swing. Slow, long and brutal.',
    stats: { damage: 38, speed: 0.8, poise: 8 }, build: () => buildOdachi(0.72),
  },
  cryptKey: {
    id: 'cryptKey', name: 'Crypt Key', kind: 'key', rarity: 'rare',
    desc: 'A heavy iron key, green with age. It fits the portcullis in the upper crypt.', stats: {},
  },
    luckyCharm: {
    id: 'luckyCharm', name: 'Lucky Charm', kind: 'accessory', slot: 'trinket', rarity: 'fine',
    desc: 'A knotted cord and a boar tusk. Strikes seem to land a little harder.', stats: { damagePct: 0.08 },
  },
  fireball: {
    id: 'fireball', name: 'Fireball', kind: 'spell', rarity: 'rare',
    desc: 'Hurl a sphere of flame that bursts on impact. Homes gently toward a locked target.',
    stats: { damage: 42, manaCost: 18 },
  },
  healingLight: {
    id: 'healingLight', name: 'Healing Light', kind: 'spell', rarity: 'rare',
    desc: 'A prayer of warm light that restores health over a few seconds.',
    stats: { heal: 55, manaCost: 28 },
  },
  healthPotion: {
    id: 'healthPotion', name: 'Health Draught', kind: 'consumable', rarity: 'common', stack: true,
    desc: 'Restores 60 health.', stats: { heal: 60 },
  },
  manaPotion: {
    id: 'manaPotion', name: 'Mana Draught', kind: 'consumable', rarity: 'common', stack: true,
    desc: 'Restores 50 mana.', stats: { restoreMana: 50 },
  },
  sungrass: {
    id: 'sungrass', name: 'Sungrass', kind: 'consumable', rarity: 'common', stack: true,
    desc: 'A warm prairie herb. Eating it restores a little health.', stats: { heal: 18 },
  },
  moongrass: {
    id: 'moongrass', name: 'Moongrass', kind: 'consumable', rarity: 'fine', stack: true,
    desc: 'A pale river herb that leaves a cool taste in the mouth. Restores mana.', stats: { restoreMana: 18 },
  },
  wildmint: {
    id: 'wildmint', name: 'Wild Mint', kind: 'consumable', rarity: 'common', stack: true,
    desc: 'Sharp and refreshing. Restores stamina immediately.', stats: { restoreStamina: 28 },
  },
  ironleaf: {
    id: 'ironleaf', name: 'Ironleaf', kind: 'consumable', rarity: 'fine', stack: true,
    desc: 'A tough mineral-rich leaf. Restores a modest amount of health and stamina.', stats: { heal: 12, restoreStamina: 20 },
  },
  greaterHealthPotion: {
    id: 'greaterHealthPotion', name: 'Greater Health Draught', kind: 'consumable', rarity: 'fine', stack: true,
    desc: 'A Port Aurelle distillation. Restores 130 health.', stats: { heal: 130 },
  },
  greaterManaPotion: {
    id: 'greaterManaPotion', name: 'Greater Mana Draught', kind: 'consumable', rarity: 'fine', stack: true,
    desc: 'Blue as the harbour at noon. Restores 110 mana.', stats: { restoreMana: 110 },
  },
  minersLantern: {
    id: 'minersLantern', name: "Miner's Lantern", kind: 'key', rarity: 'common',
    desc: 'A dwarven brass lantern with a shuttered flame. Required for the White Mountain expedition.', stats: {},
    build: () => {
      const g = new THREE.Group();
      const brass = new THREE.MeshStandardMaterial({ color: 0xc9a25a, metalness: 0.8, roughness: 0.35 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.18, 8), new THREE.MeshStandardMaterial({ color: 0xffd080, emissive: 0xffa040, emissiveIntensity: 0.8 }));
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.08, 8), brass);
      cap.position.y = 0.13;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 5, 12), brass);
      ring.position.y = 0.2;
      g.add(body, cap, ring);
      return g;
    },
  },
  ...PRODUCE_ITEMS,
  ...HERB_ITEMS,
  ...FISH_ITEMS,
};

// The four original herbs use the foraging models for their icons too.
for (const id of ['sungrass', 'moongrass', 'wildmint', 'ironleaf']) ITEMS[id].build = HERB_MODELS[id];

export function buildItemModel(def: ItemDef): THREE.Object3D | null {
  if (def.build) return def.build();
  if (def.armor) return buildArmorPiece(def.armor, null);
  return null;
}
