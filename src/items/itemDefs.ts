import * as THREE from 'three';
import { buildSword, buildRoundShield, buildKiteShield, buildOdachi } from './weaponModels';
import { buildArmorPiece, type ArmorPieceId } from './armorModels';
import { PRODUCE_ITEMS } from './produce';
import { HERB_ITEMS, HERB_MODELS } from './herbs';
import { FISH_ITEMS } from '../world/fishing';
import { DESERT_ITEMS } from './desertItems';

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
  /** seconds you can breathe underwater */
  waterBreathing?: number;
  // bonuses (armour and accessories)
  maxHp?: number;
  maxStamina?: number;
  maxMana?: number;
  staminaRegen?: number; // fraction, 0.25 = +25%
  manaRegen?: number;
  damagePct?: number; // fraction
  // weapon traits (swords)
  burn?: number; // fire damage per second for 3 s after a hit
  frost?: number; // chance a hit freezes the target solid for a moment
  lifesteal?: number; // fraction of damage dealt returned as health
  crit?: number; // extra critical-hit chance
  stagger?: number; // multiplier on the poise damage of every blow
}

export const STAT_LABEL: Partial<Record<keyof ItemStats, string>> = {
  maxHp: 'Max health', maxStamina: 'Max stamina', maxMana: 'Max mana',
  staminaRegen: 'Stamina regen', manaRegen: 'Mana regen', damagePct: 'Damage',
};

/** Weapon traits in plain words, for shop cards and the inventory. */
export function traitLines(s: ItemStats): string[] {
  const out: string[] = [];
  if (s.burn) out.push(`Burns: ${s.burn} fire damage a second for 3 s`);
  if (s.frost) out.push(`Frost: ${Math.round(s.frost * 100)}% chance to freeze a foe in place`);
  if (s.lifesteal) out.push(`Bloodthirst: heals ${Math.round(s.lifesteal * 100)}% of damage dealt`);
  if (s.crit) out.push(`Keen: +${Math.round(s.crit * 100)}% critical chance`);
  if (s.stagger && s.stagger > 1) out.push(`Crushing: +${Math.round((s.stagger - 1) * 100)}% stagger`);
  return out;
}

/** What an item is worth to a merchant buying it from you (gold). */
export function itemValue(def: ItemDef) {
  const base = { common: 8, fine: 30, rare: 90, epic: 220 }[def.rarity];
  const s = def.stats;
  let v = base;
  if (def.kind === 'sword') v += (s.damage ?? 0) * 3 + ((s.burn ?? 0) + (s.frost ?? 0) * 100 + (s.lifesteal ?? 0) * 300 + (s.crit ?? 0) * 200) * 2;
  if (def.kind === 'shield') v += (s.block ?? 0) * 0.8;
  if (def.kind === 'armor') v += (s.armor ?? 0) * 8;
  if (def.kind === 'accessory') v += 40;
  if (def.kind === 'spell') v += 60;
  if (def.kind === 'consumable') v = Math.max(3, Math.round(((s.heal ?? 0) + (s.restoreMana ?? 0) + (s.restoreStamina ?? 0)) / 5));
  if (def.kind === 'key') return 0;
  return Math.round(v);
}

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
  shortsword: {
    id: 'shortsword', name: 'Iron Shortsword', kind: 'sword', slot: 'main', rarity: 'common',
    desc: 'A stubby soldier\'s blade. No reach to speak of, but it never stops moving.',
    stats: { damage: 16, speed: 1.3 }, build: () => buildSword({ ...arming, bladeLen: 0.56, bladeWidth: 0.027, fullerLen: 0.5, tint: 0xb9b3aa }),
  },
  bastardSword: {
    id: 'bastardSword', name: 'Bastard Sword', kind: 'sword', slot: 'main', rarity: 'fine',
    desc: 'Longer than an arming sword, lighter than a greatsword. A veteran\'s favourite.',
    stats: { damage: 27, speed: 0.96, poise: 3 }, build: () => buildSword({ ...longsword, bladeLen: 0.94, bladeWidth: 0.027, guardSpan: 0.13, guardStyle: 'straight', pommel: 'wheel' }),
  },
  falchion: {
    id: 'falchion', name: 'Falchion', kind: 'sword', slot: 'main', rarity: 'fine',
    desc: 'A single-edged chopping blade that widens toward the point. Finds the gaps.',
    stats: { damage: 29, speed: 0.95, crit: 0.08 }, build: () => buildSword({ ...arming, bladeLen: 0.74, bladeWidth: 0.036, curve: 0.05, guardStyle: 'straight', pommel: 'pear', tint: 0xc9c2b4 }),
  },
  claymore: {
    id: 'claymore', name: "Warden's Claymore", kind: 'sword', slot: 'main', rarity: 'rare',
    desc: 'A Highland greatsword with drooping quillons. Every swing lands like a falling door.',
    stats: { damage: 36, speed: 0.78, poise: 10, stagger: 1.6 }, build: () => buildSword({ ...longsword, bladeLen: 1.12, bladeWidth: 0.031, thickness: 0.005, gripLen: 0.24, guardSpan: 0.17, guardStyle: 'curved', pommel: 'wheel', guardMat: 'brass' }),
  },
  estoc: {
    id: 'estoc', name: 'Moonlit Estoc', kind: 'sword', slot: 'main', rarity: 'rare',
    desc: 'A needle-thin thrusting blade, silvered so it catches the moon. Made to slip between plates.',
    stats: { damage: 25, speed: 1.15, crit: 0.22 }, build: () => buildSword({ ...arming, bladeLen: 0.98, bladeWidth: 0.012, thickness: 0.0055, fullerLen: 0, guardSpan: 0.11, guardStyle: 'curved', pommel: 'pear', tint: 0xdfe8ff, glow: 0x9fc4ff, glowStrength: 0.9 }),
  },
  emberbrand: {
    id: 'emberbrand', name: 'Emberbrand', kind: 'sword', slot: 'main', rarity: 'rare',
    desc: 'Forged in a Cinder Guild furnace; the fuller still glows like a coal. What it cuts, burns.',
    stats: { damage: 27, speed: 1, burn: 9 }, build: () => buildSword({ ...longsword, tint: 0x5a4a44, glow: 0xff5a18, glowStrength: 2.6, guardMat: 'brass' }),
  },
  frostbite: {
    id: 'frostbite', name: 'Frostbite Sabre', kind: 'sword', slot: 'main', rarity: 'rare',
    desc: 'A curved sabre of pale northern steel, cold enough to frost your breath. Now and then a foe simply stops.',
    stats: { damage: 25, speed: 1.12, frost: 0.2 }, build: () => buildSword({ ...arming, bladeLen: 0.82, bladeWidth: 0.022, curve: 0.08, tint: 0xcfe4ff, glow: 0x7fd4ff, glowStrength: 1.8, pommel: 'pear' }),
  },
  bloodthirst: {
    id: 'bloodthirst', name: 'Bloodthirst', kind: 'sword', slot: 'main', rarity: 'epic',
    desc: 'A black blade with a groove that runs red when it drinks. It gives a little of what it takes back to its bearer.',
    stats: { damage: 31, speed: 1, lifesteal: 0.14 }, build: () => buildSword({ ...knight, tint: 0x2a2226, glow: 0xc01020, glowStrength: 2.2 }),
  },
  // ---- the Golden Expanse ----
  khopesh: {
    id: 'khopesh', name: 'Sunborn Khopesh', kind: 'sword', slot: 'main', rarity: 'fine',
    desc: 'The sickle-sword of the Sun Guard: a bronze-hued blade hooked like a crescent moon. It catches shields and opens guards.',
    stats: { damage: 28, speed: 1.05, crit: 0.1 }, build: () => buildSword({ ...arming, bladeLen: 0.66, bladeWidth: 0.034, curve: 0.16, fullerLen: 0, guardStyle: 'straight', pommel: 'pear', guardMat: 'brass', tint: 0xd09a50 }),
  },
  sunsteelScimitar: {
    id: 'sunsteelScimitar', name: 'Sunsteel Scimitar', kind: 'sword', slot: 'main', rarity: 'rare',
    desc: 'Folded in the furnaces under Ghagrabba\'s palace and quenched in oil of emberroot. The edge holds the desert\'s heat.',
    stats: { damage: 30, speed: 1.1, burn: 5 }, build: () => buildSword({ ...arming, bladeLen: 0.8, bladeWidth: 0.028, curve: 0.11, guardStyle: 'curved', pommel: 'pear', guardMat: 'brass', tint: 0xf2e2b4, glow: 0xffb040, glowStrength: 1.2 }),
  },
  scrapCleaver: {
    id: 'scrapCleaver', name: 'Scrap Cleaver', kind: 'sword', slot: 'main', rarity: 'common',
    desc: 'A slab of salvaged skiff-plate ground to an edge. Ugly, heavy, and it knocks people over.',
    stats: { damage: 22, speed: 0.92, stagger: 1.3 }, build: () => buildSword({ ...arming, bladeLen: 0.62, bladeWidth: 0.045, thickness: 0.006, fullerLen: 0, guardStyle: 'straight', pommel: 'wheel', tint: 0x7a6a5a }),
  },
  sawtoothFang: {
    id: 'sawtoothFang', name: 'Sawtooth Fang', kind: 'sword', slot: 'main', rarity: 'epic',
    desc: 'A blade of bone-white tooth set in a sunsteel spine, cut from the jaw of the oldest shark in the Expanse. It bites, and it drinks.',
    stats: { damage: 36, speed: 1.02, lifesteal: 0.1, crit: 0.12 }, build: () => buildSword({ ...longsword, bladeLen: 0.92, bladeWidth: 0.03, curve: 0.06, guardMat: 'brass', tint: 0xece2c8, glow: 0xff9a3a, glowStrength: 1.1 }),
  },
  sunGuardShield: {
    id: 'sunGuardShield', name: 'Sun Guard Shield', kind: 'shield', slot: 'off', rarity: 'fine',
    desc: 'A round shield in the Queen\'s teal and gold, worn by the gate guard of Ghagrabba.',
    stats: { block: 95, stability: 0.58 }, build: () => buildRoundShield('plain', ['#1f7a7a', '#d4a640']),
  },
  dawnbreaker: {
    id: 'dawnbreaker', name: 'Dawnbreaker', kind: 'sword', slot: 'main', rarity: 'epic',
    desc: 'A greatsword with the Sunwheel worked into its crossguard, pulled from the Gravewood\'s pedestal. It burns with a clean, gold light.',
    stats: { damage: 35, speed: 0.95, burn: 6, stagger: 1.3, poise: 6 }, build: () => buildSword({ ...longsword, bladeLen: 1.02, bladeWidth: 0.029, guardSpan: 0.15, guardMat: 'brass', tint: 0xf4ead0, glow: 0xffc85a, glowStrength: 2.4 }),
  },
  towerShield: {
    id: 'towerShield', name: 'Tower Shield', kind: 'shield', slot: 'off', rarity: 'fine',
    desc: 'A tall heater of oak and iron. Nothing gets past it; you won\'t be dancing, either.',
    stats: { block: 115, stability: 0.72 }, build: () => { const s = buildKiteShield(); s.scale.set(1.12, 1.4, 1.1); return s; },
  },
  buckler: {
    id: 'buckler', name: 'Spiked Buckler', kind: 'shield', slot: 'off', rarity: 'fine',
    desc: 'A fist-sized steel buckler with a spike in the boss. Catches blades, and parries like lightning.',
    stats: { block: 60, stability: 0.35, poise: 3 }, build: () => { const s = buildRoundShield('plain', ['#5a5f66', '#8a8f96']); s.scale.setScalar(0.6); return s; },
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
  blackTideColours: {
    id: 'blackTideColours', name: 'The Black Tide\'s Colours', kind: 'key', rarity: 'rare',
    desc: 'A black flag with a white wave across it, torn from Rook Calloway\'s mast. Harbourmaster Tallow will want to see it.', stats: {},
    build: () => {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 6), new THREE.MeshStandardMaterial({ color: 0x5a3a22 }));
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.26), new THREE.MeshStandardMaterial({ color: 0x141416, side: THREE.DoubleSide }));
      flag.position.set(0.2, 0.17, 0);
      const wave = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.05), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, side: THREE.DoubleSide }));
      wave.position.set(0.2, 0.17, 0.002);
      g.add(pole, flag, wave);
      return g;
    },
  },
  regattaPennant: {
    id: 'regattaPennant', name: 'Quint\'s Pennant', kind: 'key', rarity: 'epic',
    desc: 'The champion\'s pennant of the Port Aurelle Regatta, red and gold, given up by Captain Marisol Quint with good grace. Fly it from your masthead.', stats: {},
    build: () => { const m = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 3), new THREE.MeshStandardMaterial({ color: 0xc82a2a, side: THREE.DoubleSide })); m.rotation.z = Math.PI / 2; return m; },
  },
  krakenInk: {
    id: 'krakenInk', name: 'Kraken Ink', kind: 'material', rarity: 'epic', stack: true,
    desc: 'A sealed gourd of ink as black as the deep sea. The Aurelle Shipwrights paint a Kraken\'s Eye on a bow with it; monsters will not look at it.', stats: {},
    build: () => new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshStandardMaterial({ color: 0x0a0a14, metalness: 0.6, roughness: 0.15 })),
  },
  colossusShell: {
    id: 'colossusShell', name: 'Colossus Shell', kind: 'material', rarity: 'rare', stack: true,
    desc: 'A plate of red crab-shell as thick as a door. Fitted to a bow, it shrugs off rams and reefs.', stats: {},
    build: () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc8502a, roughness: 0.45 })); m.scale.set(1.3, 0.4, 1); return m; },
  },
  wyrmScale: {
    id: 'wyrmScale', name: 'Storm Wyrm Scale', kind: 'material', rarity: 'epic', stack: true,
    desc: 'A blue-grey scale that crackles when you touch it. Woven into sailcloth, it drinks the storm wind.', stats: {},
    build: () => { const m = new THREE.Mesh(new THREE.CircleGeometry(0.14, 6), new THREE.MeshStandardMaterial({ color: 0x8aa8d0, emissive: 0x3a6aa0, emissiveIntensity: 0.6, side: THREE.DoubleSide })); return m; },
  },
  leviathanBone: {
    id: 'leviathanBone', name: 'Leviathan Bone', kind: 'material', rarity: 'epic', stack: true,
    desc: 'A barb torn from the Leviathan\'s back, pale and heavier than iron. A keel of it would ride out any sea in the world.', stats: {},
    build: () => new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.5 })),
  },
  sirenPearl: {
    id: 'sirenPearl', name: 'Siren\'s Pearl', kind: 'material', rarity: 'rare', stack: true,
    desc: 'A pearl that hums when you hold it to your ear. Jewellers in the capital pay a fortune for them.', stats: {},
    build: () => new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), new THREE.MeshStandardMaterial({ color: 0xe8f0f8, emissive: 0x4a8aa0, emissiveIntensity: 0.4, metalness: 0.3, roughness: 0.1 })),
  },
  pearl: {
    id: 'pearl', name: 'Pearl', kind: 'material', rarity: 'fine', stack: true,
    desc: 'A sea pearl from an oyster bed. The merchants of Port Aurelle buy them gladly.', stats: {},
    build: () => new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), new THREE.MeshStandardMaterial({ color: 0xf4f0e8, metalness: 0.3, roughness: 0.1 })),
  },
  oldTeethJaw: {
    id: 'oldTeethJaw', name: 'Old Teeth\'s Jaw', kind: 'key', rarity: 'epic',
    desc: 'The jaw of the great white of the coastal shelf, every tooth as long as your finger. Hang it in your cabin and every sailor who sees it will buy you a drink.', stats: {},
    build: () => { const m = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 6, 14, Math.PI * 1.4), new THREE.MeshStandardMaterial({ color: 0xe8e0d0 })); return m; },
  },
  waxEarplugs: {
    id: 'waxEarplugs', name: 'Wax Earplugs', kind: 'key', rarity: 'common',
    desc: 'Beeswax for the whole crew\'s ears. While you carry them, the sirens\' song can\'t pull your helm or charm your crew.', stats: {},
    build: () => new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: 0xe8c860, roughness: 0.6 })),
  },
  waterBreathingDraught: {
    id: 'waterBreathingDraught', name: 'Draught of Gills', kind: 'consumable', rarity: 'fine', stack: true,
    desc: 'Tastes of salt and kelp. For a minute and a half you can breathe underwater.', stats: { waterBreathing: 90 },
  },
  serpentScale: {
    id: 'serpentScale', name: 'Sea Serpent Scale', kind: 'material', rarity: 'rare',
    desc: 'A plate of scale the size of a shield, green-black and hard as bronze. The Aurelle Shipwrights make hull plating of it.', stats: {},
    build: () => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1e5a52, metalness: 0.4, roughness: 0.35 }));
      m.scale.set(1, 0.3, 1.3);
      return m;
    },
  },
  wreckLedger: {
    id: 'wreckLedger', name: 'Waterlogged Ledger', kind: 'key', rarity: 'common',
    desc: "A merchant's ledger from a wagon wrecked on the Crown Road, stamped with the seal of the Kingsmile.", stats: {},
    build: () => {
      const g = new THREE.Group();
      const cover = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.3), new THREE.MeshStandardMaterial({ color: 0x5a2a1a, roughness: 0.9 }));
      const pages = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.28), new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 1 }));
      pages.position.set(0.01, 0.005, 0);
      const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 10), new THREE.MeshStandardMaterial({ color: 0x9a1a14 }));
      seal.position.set(0, 0.03, 0.06);
      g.add(cover, pages, seal);
      return g;
    },
  },
  ...PRODUCE_ITEMS,
  ...HERB_ITEMS,
  ...FISH_ITEMS,
  ...DESERT_ITEMS,
};

// The four original herbs use the foraging models for their icons too.
for (const id of ['sungrass', 'moongrass', 'wildmint', 'ironleaf']) ITEMS[id].build = HERB_MODELS[id];

export function buildItemModel(def: ItemDef): THREE.Object3D | null {
  if (def.build) return def.build();
  if (def.armor) return buildArmorPiece(def.armor, null);
  return null;
}
