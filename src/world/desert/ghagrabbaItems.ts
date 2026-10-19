import * as THREE from 'three';
import type { ItemDef } from '../../items/itemDefs';
import { buildSword, buildRoundShield } from '../../items/weaponModels';

// Goods and keepsakes of Ghagrabba's stories: what the Sunborn plot hands
// you (a digger's tag, a gold tablet, the three pieces of the Sunken Key, the
// crown itself), what the side errands are made of (jelly cores, crab shells,
// ray ink, shark fins, dates), and what the city pays you back with.

const std = (color: number, roughness = 0.8, metalness = 0, emissive = 0x000000, ei = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: ei });
const mat = (id: string, name: string, desc: string, build: () => THREE.Object3D, rarity: ItemDef['rarity'] = 'common'): ItemDef =>
  ({ id, name, kind: 'material', rarity, stack: true, desc, stats: {}, build });
const key = (id: string, name: string, desc: string, build: () => THREE.Object3D, rarity: ItemDef['rarity'] = 'rare', stack = false): ItemDef =>
  ({ id, name, kind: 'key', rarity, desc, stats: {}, build, stack });
const food = (id: string, name: string, desc: string, stats: ItemDef['stats'], build: () => THREE.Object3D, rarity: ItemDef['rarity'] = 'common'): ItemDef =>
  ({ id, name, kind: 'consumable', rarity, stack: true, desc, stats, build });

const group = (...m: THREE.Object3D[]) => {
  const g = new THREE.Group();
  g.add(...m);
  return g;
};
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  return o;
};

const GOLD = 0xd4a640, TEAL = 0x1f7a7a, PURPLE = 0x5a2a7a;

function tag() {
  const plate = at(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.015, 6), std(0xb8863a, 0.4, 0.8)), 0, 0, 0, Math.PI / 2);
  const eye = at(new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 14), std(PURPLE, 0.5, 0.2)), 0, 0, 0.01);
  const cord = at(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.006, 4, 12), std(0x5a3418)), 0, 0.1, 0);
  return group(plate, eye, cord);
}

function tablet() {
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.03), std(0xd8a838, 0.35, 0.85));
  const g = group(slab);
  for (let r = 0; r < 5; r++) g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.012, 0.005), std(0x6a4a14, 0.6, 0.4)), 0, 0.12 - r * 0.06, 0.017));
  return g;
}

function eyeStone() {
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), std(0xfff0c0, 0.15, 0.2, 0xffb030, 0.7));
  const iris = at(new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), std(0x7a3a10, 0.3, 0.2, 0xff6010, 0.5)), 0, 0, 0.101);
  return group(ball, iris);
}

function heartStone() {
  const core = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13, 0), std(0xc8a06a, 1, 0, 0xff6020, 0.6));
  core.material.flatShading = true;
  const crack = at(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.24, 0.27), std(0xffa040, 0.5, 0, 0xffa040, 1.2)), 0, 0, 0, 0, 0.6);
  return group(core, crack);
}

function tear() {
  const m = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.8, emissive: 0x6ab0ff, emissiveIntensity: 0.6 });
  const drop = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), m);
  const tip = at(new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.14, 14), m), 0, 0.1, 0);
  return group(drop, tip);
}

function sunkenKey() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffd47a, roughness: 0.15, metalness: 0.6, transparent: true, opacity: 0.88, emissive: 0xffa030, emissiveIntensity: 0.5 });
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 8, 18), m);
  const shaft = at(new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.3, 8), m), 0, -0.21, 0);
  const bit = at(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.02), m), 0.035, -0.33, 0);
  return group(bow, shaft, bit);
}

function letter(seal = PURPLE) {
  const paper = at(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.01, 0.17), std(0xe8dcc0, 1)), 0, 0, 0, 0.1);
  const wax = at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 12), std(seal, 0.5)), 0.02, 0.012, 0.02, 0.1);
  return group(paper, wax);
}

function crown() {
  const g = new THREE.Group();
  const gold = std(0xe8b850, 0.25, 0.9);
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.08, 20, 1, true), gold));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 4), gold), Math.cos(a) * 0.125, 0.09, Math.sin(a) * 0.125));
  }
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), std(0x1fb0a0, 0.1, 0.3, 0x1f8a8a, 0.6)), 0, 0.02, 0.13));
  return g;
}

function blob(color: number, glow = 0, r = 0.09) {
  return () => group(new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), std(color, 0.3, 0.1, color, glow)));
}

function shell() {
  const s = at(new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), std(0xb86a3a, 0.6, 0.1)), 0, 0, 0);
  s.scale.set(1.2, 0.5, 1);
  return group(s);
}

function vial(color: number) {
  return () => {
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.16, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.1, transparent: true, opacity: 0.8 }));
    const cork = at(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.04, 8), std(0x8a6a3a)), 0, 0.1, 0);
    return group(glass, cork);
  };
}

function fin() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(0.08, 0.12, 0.02, 0.26);
  shape.lineTo(0.22, 0);
  shape.lineTo(0, 0);
  return group(at(new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false }), std(0x8a8070, 0.7)), -0.1, -0.1, 0));
}

function dates() {
  const g = new THREE.Group();
  for (let k = 0; k < 6; k++) g.add(at(new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.04, 4, 8), std(0x6a2a10, 0.5)), (k % 3) * 0.05 - 0.05, Math.floor(k / 3) * 0.04, (k % 2) * 0.03, 0, 0, Math.PI / 2));
  return g;
}

function cake() {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.06, 16), std(0xc8904a, 0.8));
  const top = at(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.012, 16), std(0x6a2a10, 0.5)), 0, 0.035, 0);
  return group(c, top);
}

function cup() {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.08, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0xc0d8c8, roughness: 0.15, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
  const tea = at(new THREE.Mesh(new THREE.CircleGeometry(0.055, 14), std(0x8a3a10, 0.2)), 0, 0.03, 0, -Math.PI / 2);
  return group(c, tea);
}

function skin() {
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), std(0x7a5030, 0.9));
  s.scale.set(1, 1.3, 0.7);
  const neck = at(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.08, 8), std(0x5a3418)), 0, 0.17, 0);
  return group(s, neck);
}

function badge() {
  const disc = at(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.015, 18), std(GOLD, 0.35, 0.8)), 0, 0, 0, Math.PI / 2);
  const tealDisc = at(new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), std(TEAL, 0.5)), 0, 0, 0.009);
  return group(disc, tealDisc);
}

function ring(stone: number) {
  return () => {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 20), std(GOLD, 0.3, 0.85));
    const gem = at(new THREE.Mesh(new THREE.OctahedronGeometry(0.025), std(stone, 0.1, 0.2, stone, 0.4)), 0, 0.07, 0);
    return group(band, gem);
  };
}

function scarab() {
  const shellM = std(0x1f9a7a, 0.15, 0.6, 0x0f4a3a, 0.4);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), shellM);
  body.scale.set(0.8, 0.45, 1);
  const head = at(new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), std(GOLD, 0.3, 0.85)), 0, 0, 0.08);
  const chain = at(new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.006, 4, 24), std(GOLD, 0.3, 0.85)), 0, 0.02, -0.05, Math.PI / 2);
  return group(body, head, chain);
}

function heart() {
  const m = std(0xffc24a, 0.2, 0.3, 0xff9020, 1.1);
  const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), m);
  c.material.flatShading = true;
  const cage = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.008, 4, 18), std(0x6a4a2a, 0.6, 0.6));
  return group(c, cage);
}

function coin() {
  const c = at(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 18), std(GOLD, 0.3, 0.9)), 0, 0, 0, Math.PI / 2);
  const hole = at(new THREE.Mesh(new THREE.TorusGeometry(0.015, 0.005, 4, 10), std(0x5a3418)), 0, 0, 0.006);
  return group(c, hole);
}

function feather() {
  const vane = at(new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.26), new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.9, side: THREE.DoubleSide })), 0, 0, 0, 0, 0, 0.3);
  const tip = at(new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.06), new THREE.MeshStandardMaterial({ color: 0xe8dcc0, side: THREE.DoubleSide })), 0.035, 0.12, 0.001, 0, 0, 0.3);
  return group(vane, tip);
}

export const GHAGRABBA_ITEMS: Record<string, ItemDef> = {
  // ---- the Sunborn plot ----
  diggersTag: key('diggersTag', 'Digger\'s Tag', 'A brass crew tag on a cord, stamped with a purple eye. Found at the bottom of the Queen\'s dying well.', tag, 'fine'),
  amaunetTablet: key('amaunetTablet', 'Tablet of Amaunet', 'A gold tablet cut with a script older than the Sunborn: "Here sleeps Amaunet beneath the sand."', tablet),
  sunEye: key('sunEye', 'The Sun-Eye', 'A priest\'s eye-stone, swallowed long ago by Old Sawtooth. It is warm, and it seems to look back.', eyeStone, 'epic'),
  wardenHeart: key('wardenHeart', 'Heart of the Warden', 'The cracked sandstone core of the Warden of the Sands. Something inside it still glows.', heartStone, 'epic'),
  stormTear: key('stormTear', 'The Storm\'s Tear', 'Lightning glass caught at the Glass Spire while the storm raged: a drop of blue fire that never cools.', tear, 'epic'),
  sunkenKey: key('sunkenKey', 'The Sunken Key', 'The Eye, the Heart and the Tear, sung together by Wise Ta-Nedjem into one key of gold glass. Warm as skin.', sunkenKey, 'epic'),
  vizierOrders: key('vizierOrders', 'The Vizier\'s Orders', 'A note under Vizier Ankhet\'s purple seal: "The outlander and the boy, both, before the new moon."', () => letter(PURPLE)),
  waterWrit: key('waterWrit', 'Water-Writ', 'The Queen\'s promise of a share in the Great Well, sealed in gold wax. For the village elders.', () => letter(GOLD), 'fine', true),
  sunkenCrown: key('sunkenCrown', 'The Sunken Crown', 'The crown of the last king of Amaunet: gold, eight points, and a teal stone that hums near the sand.', crown, 'epic'),
  bazaarLedger: key('bazaarLedger', 'Hassun\'s Sealed Ledger', 'The Grand Bazaar\'s accounts with the caravan masters, sealed with Hassun\'s scarab.', () => letter(0x8a2a2a), 'fine'),
  sunGuardBadge: key('sunGuardBadge', 'Sun Guard Badge', 'A teal-and-gold badge of the Sun Guard, taken from a fallen patrol.', badge, 'fine', true),
  feverBalm: key('feverBalm', 'Fever Balm', 'Healer Meritites\' balm of eel gland and honey, wrapped in a palm leaf, for the lower streets.', vial(0xd8c060), 'common', true),
  oasisWater: key('oasisWater', 'Oasis Water', 'A waterskin filled at the Old Oasis well: sweet, cold, and greener-smelling than city water.', skin, 'common', true),
  // ---- side-errand materials ----
  jellyCore: mat('jellyCore', 'Jelly Core', 'The glowing heart of a dune jelly. Smiths use it as flux: it burns hotter than charcoal.', blob(0x9fe0ff, 0.9), 'fine'),
  crabShell: mat('crabShell', 'Dune Crab Shell', 'A sun-baked plate of crab carapace, hard as bronze and half the weight.', shell),
  eelGland: mat('eelGland', 'Burrow Eel Gland', 'A bitter gland from a burrow eel\'s jaw. Healers boil it down for fevers.', vial(0x9ab060)),
  rayInk: mat('rayInk', 'Ray Ink', 'Deep teal ink from a dune ray. The royal looms dye their silk with nothing else.', vial(0x1f7a8a), 'fine'),
  sharkFin: mat('sharkFin', 'Sand Shark Fin', 'A grey dorsal fin, tough as boot leather. Ghagrabba\'s cooks stew it for feast days.', fin),
  // ---- food ----
  dates: food('dates', 'Palm Dates', 'Sticky dates shaken from a city palm. Sweet enough to make your teeth ache.', { heal: 12, restoreStamina: 10 }, dates),
  dateCake: food('dateCake', 'Date Cake', 'Cook Baket\'s honeyed date cake, studded with pistachio. Heals and steadies you.', { heal: 50, restoreStamina: 30 }, cake, 'fine'),
  spicedTea: food('spicedTea', 'Spiced Mint Tea', 'Sweet mint tea with a pinch of desert spice. Clears the head and wakes the legs.', { restoreMana: 35, restoreStamina: 40 }, cup),
  // ---- rewards ----
  furnaceKhopesh: {
    id: 'furnaceKhopesh', name: 'Furnace Khopesh', kind: 'sword', slot: 'main', rarity: 'rare',
    desc: 'Sunsmith Hekat\'s masterwork, forged in a fire fed with dune-jelly cores. The hooked edge still glows at the tip.',
    stats: { damage: 31, speed: 1.06, burn: 7, crit: 0.06 },
    build: () => buildSword({ bladeLen: 0.68, bladeWidth: 0.034, thickness: 0.004, fullerLen: 0, gripLen: 0.1, guardSpan: 0.095, guardStyle: 'straight', pommel: 'pear', guardMat: 'brass', curve: 0.17, tint: 0xd8a060, glow: 0xff7a20, glowStrength: 1.4 }),
  },
  twoSandsBlade: {
    id: 'twoSandsBlade', name: 'Blade of the Two Sands', kind: 'sword', slot: 'main', rarity: 'epic',
    desc: 'Forged for you from the Sunken Crown\'s gold and the Queen\'s own sunsteel, on the day she was crowned over both sands. It is never quite cool.',
    stats: { damage: 38, speed: 1.02, burn: 9, crit: 0.1 },
    build: () => buildSword({ bladeLen: 0.9, bladeWidth: 0.029, thickness: 0.0045, fullerLen: 0.6, gripLen: 0.15, guardSpan: 0.14, guardStyle: 'curved', pommel: 'pear', guardMat: 'brass', curve: 0.08, tint: 0xf6e2a8, glow: 0xffc24a, glowStrength: 2.2 }),
  },
  carapaceShield: {
    id: 'carapaceShield', name: 'Carapace Shield', kind: 'shield', slot: 'off', rarity: 'rare',
    desc: 'Armourer Djau laid dune-crab shell over a sunsteel boss. Light on the arm and hard as the dunes are wide.',
    stats: { block: 98, stability: 0.66 }, build: () => buildRoundShield('quartered', ['#b86a3a', '#d4a640']),
  },
  sunSilkMantle: {
    id: 'sunSilkMantle', name: 'Sun-Silk Mantle', kind: 'armor', slot: 'cloak', rarity: 'rare',
    desc: 'Weaver Sitre\'s mantle of royal teal, dyed with the ray ink you brought her. It turns the noon sun aside.',
    stats: { armor: 3, maxStamina: 18, staminaRegen: 0.1 }, armor: 'cloak',
  },
  sunGuardSash: {
    id: 'sunGuardSash', name: 'Sash of the Sun Guard', kind: 'accessory', slot: 'belt', rarity: 'rare',
    desc: 'Teal silk and a gold buckle: an honorary officer\'s sash, given by the Queen for her son\'s life.',
    stats: { poise: 10, maxHp: 20 }, armor: 'belt',
  },
  scarabAmulet: {
    id: 'scarabAmulet', name: 'Scarab of Amaunet', kind: 'accessory', slot: 'amulet', rarity: 'epic',
    desc: 'The sand-folk\'s thanks for giving their kings\' crown back to them: a living-green scarab on a gold chain. The desert feels like home.',
    stats: { maxHp: 40, staminaRegen: 0.3, maxStamina: 15 }, armor: 'amulet',
  },
  sunEaterHeart: {
    id: 'sunEaterHeart', name: 'Ember of the Sun-Eater', kind: 'accessory', slot: 'trinket', rarity: 'epic',
    desc: 'All that was left in your hand when the Sunken Crown broke on the throne: a coal of the old sun, caged in bronze.',
    stats: { damagePct: 0.15, maxMana: 25 },
    build: heart,
  },
  oldKingsRing: {
    id: 'oldKingsRing', name: 'The Old King\'s Ring', kind: 'accessory', slot: 'ring1', rarity: 'rare',
    desc: 'Queen Mother Tiyet\'s late husband\'s signet. He wanted the walls opened. He liked anyone who asked questions.',
    stats: { maxHp: 15, manaRegen: 0.25 }, build: ring(0x1fb0a0),
  },
  panebSignet: {
    id: 'panebSignet', name: 'Paneb\'s Signet', kind: 'accessory', slot: 'ring2', rarity: 'rare',
    desc: 'The jeweller\'s own ring, won back from a cheat. A carnelian sun that steadies the hand.',
    stats: { maxHp: 20, damagePct: 0.05 }, build: ring(0xc84a2a),
  },
  oasisRing: {
    id: 'oasisRing', name: 'Ring of the Oasis', kind: 'accessory', slot: 'ring2', rarity: 'fine',
    desc: 'A plain copper band set with a drop of green glass. The heat seems to weigh a little less.',
    stats: { staminaRegen: 0.3, maxStamina: 15 }, build: ring(0x4ac87a),
  },
  starReaderRing: {
    id: 'starReaderRing', name: 'Star-Reader\'s Ring', kind: 'accessory', slot: 'ring1', rarity: 'rare',
    desc: 'Princess Nefret\'s gift: lapis set in silver, cut with the three stars that point to Amaunet.',
    stats: { manaRegen: 0.4, maxMana: 25 }, build: ring(0x2a4ac8),
  },
  dicersCharm: {
    id: 'dicersCharm', name: 'Lucky Knucklebone', kind: 'accessory', slot: 'trinket', rarity: 'fine',
    desc: 'A sheep\'s knucklebone drilled through and strung on red thread. It rolled three sixes once; it remembers.',
    stats: { damagePct: 0.05, maxStamina: 10 }, build: coin,
  },
  falconFeather: {
    id: 'falconFeather', name: 'Khepri\'s Feather', kind: 'accessory', slot: 'trinket', rarity: 'fine',
    desc: 'A flight feather from Prince Sethi\'s falcon, bound in gold wire. Your feet feel lighter on the sand.',
    stats: { staminaRegen: 0.2, maxStamina: 10 }, build: feather,
  },
  scarabCharm: {
    id: 'scarabCharm', name: 'Scavenger\'s Scarab', kind: 'accessory', slot: 'amulet', rarity: 'fine',
    desc: 'A scarab ground from blue glass, the kind the sand-folk tie on their children. It keeps them coming home.',
    stats: { maxHp: 20, poise: 4 }, build: scarab,
  },
};

/** Sweets and tea the Date Palm Kitchen adds to its counter once Baket has her feast (for DESERT_STOCK). */
export const GHAGRABBA_FOOD_STOCK: [string, number][] = [['dates', 5], ['dateCake', 26], ['spicedTea', 20]];
