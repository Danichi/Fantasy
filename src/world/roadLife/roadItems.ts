import * as THREE from 'three';
import type { ItemDef } from '../../items/itemDefs';

// Goods and keepsakes of the roads into the capital: road food sold at the
// Wayfork and by travellers, quest papers and parcels, and two trinkets the
// road's people give to those who help them.

const std = (color: number, roughness = 0.8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  return o;
};
const group = (...o: THREE.Object3D[]) => {
  const g = new THREE.Group();
  g.add(...o);
  return g;
};

function loaf() {
  const crust = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8).scale(1.5, 0.75, 1), std(0xb87a3a, 0.9));
  const score = box(0.3, 0.012, 0.03, std(0xe8c890, 0.9), 0, 0.1, 0);
  return group(crust, score);
}
function cheese() {
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 18, 1, false, 0, Math.PI * 1.6), std(0xe8c050, 0.7));
  const rind = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.125, 18, 1, true, 0, Math.PI * 1.6), std(0xa86a2a, 0.8));
  return group(wheel, rind);
}
function jug(color = 0x8a5a3a) {
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10).scale(1, 1.2, 1), std(color, 0.6));
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.1, 10), std(color, 0.6));
  neck.position.y = 0.16;
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 8), std(0xc8a070, 0.9));
  cork.position.y = 0.23;
  return group(body, neck, cork);
}
function strongbox() {
  const iron = std(0x4a4a4c, 0.5, 0.7);
  const b = box(0.36, 0.22, 0.24, std(0x5a3a22, 0.85));
  const lid = box(0.38, 0.06, 0.26, std(0x6a4428, 0.85), 0, 0.14, 0);
  const band1 = box(0.39, 0.25, 0.03, iron, 0, 0.02, 0.07);
  const band2 = box(0.39, 0.25, 0.03, iron, 0, 0.02, -0.07);
  const lock = box(0.07, 0.08, 0.02, std(0xc9a040, 0.4, 0.8), 0, 0.04, 0.13);
  return group(b, lid, band1, band2, lock);
}
function letter(seal = 0x9a1a14, paper = 0xeadfc4) {
  const sheet = box(0.24, 0.015, 0.16, std(paper, 1));
  const ribbon = box(0.025, 0.02, 0.17, std(0x2f5f9a, 0.8), 0.04, 0.003, 0);
  const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 12), std(seal, 0.5));
  wax.position.set(0.04, 0.014, 0);
  return group(sheet, ribbon, wax);
}
function locket() {
  const gold = std(0xd8b04a, 0.25, 0.9);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 20), gold);
  body.rotation.x = Math.PI / 2;
  const stone = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), std(0x2f5f9a, 0.2, 0.3));
  stone.position.z = 0.015;
  const chain = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.005, 4, 24), gold);
  chain.position.y = 0.1;
  return group(body, stone, chain);
}
function silk() {
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 14), std(0x7a2a6a, 0.35, 0.1));
  roll.rotation.z = Math.PI / 2;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.05, 14), std(0xd8b04a, 0.3, 0.7));
  band.rotation.z = Math.PI / 2;
  return group(roll, band);
}
function charm() {
  const cord = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.008, 5, 20), std(0x6a4a2a, 0.9));
  const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 0), std(0x9fd8c8, 0.3, 0.2));
  stone.position.y = -0.09;
  const feather = box(0.015, 0.12, 0.04, std(0xe8e0d0, 0.9), 0.03, -0.12, 0);
  feather.rotation.z = 0.4;
  return group(cord, stone, feather);
}
function badge() {
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.015, 8), std(0xc8c0b0, 0.4, 0.6));
  disc.rotation.x = Math.PI / 2;
  const sun = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 5, 16), std(0xd8a040, 0.3, 0.8));
  sun.position.z = 0.01;
  return group(disc, sun);
}

const food = (id: string, name: string, desc: string, stats: ItemDef['stats'], build: () => THREE.Object3D): ItemDef =>
  ({ id, name, kind: 'consumable', rarity: 'common', stack: true, desc, stats, build });
const key = (id: string, name: string, desc: string, build: () => THREE.Object3D): ItemDef =>
  ({ id, name, kind: 'key', rarity: 'common', desc, stats: {}, build });

export const ROAD_LIFE_ITEMS: Record<string, ItemDef> = {
  travellersBread: food('travellersBread', 'Traveller’s Loaf', 'A dense oat-and-barley loaf baked hard for the road. Restores health and stamina.', { heal: 18, restoreStamina: 30 }, loaf),
  roadCheese: food('roadCheese', 'Thornfield Cheese', 'A wedge of sheep’s cheese from the Thornfield folds. Restores health.', { heal: 28 }, cheese),
  spicedCider: food('spicedCider', 'Spiced Cider', 'Apple cider mulled with Expanse spice. Warms you to the toes; restores stamina.', { restoreStamina: 55, heal: 6 }, () => jug(0x9a5a2a)),
  tollStrongbox: key('tollStrongbox', 'Turnpenny’s Strongbox', 'An iron-banded box of toll pennies, green with river weed. It rattles promisingly.', strongbox),
  sealedDispatch: key('sealedDispatch', 'Sealed Crown Dispatch', 'Courier’s satchel paper under the Crown’s blue seal, addressed to the Grand Marshal of the Silver Lance.', () => letter(0x2f5f9a)),
  tobinsLetter: key('tobinsLetter', 'Ser Tobin’s Petition', 'A hedge knight’s careful letter asking leave to ride in the Crown’s Tourney. The ink is very neat.', () => letter(0x3d7a45)),
  ashbyLetter: key('ashbyLetter', 'Letter from the Ashby Camp', 'Edda Ashby’s letter to her husband’s cousin, Ser Gawen Ashby of the Silver Lance.', () => letter(0x6a4428, 0xe0d4b8)),
  ladysLocket: key('ladysLocket', 'Lady Ysmay’s Locket', 'A gold locket set with a blue stone. Inside, a tiny painted portrait of a young man in Silver Lance white.', locket),
  valorianSilk: key('valorianSilk', 'Garrick’s Valorian Silks', 'Bolts of plum and gold Valorian silk, stolen from Garrick Vell on the Queen’s Road.', silk),
  wayfarersCharm: {
    id: 'wayfarersCharm', name: 'Wayfarer’s Charm', kind: 'accessory', slot: 'trinket', rarity: 'fine',
    desc: 'Old Wendel’s road-charm: a river stone and a gull feather on a knotted cord. Your legs forget how far they’ve walked.',
    stats: { maxStamina: 15, staminaRegen: 0.15 }, build: charm,
  },
  pilgrimsBadge: {
    id: 'pilgrimsBadge', name: 'Pilgrim’s Badge of Saint Aveline', kind: 'accessory', slot: 'trinket', rarity: 'fine',
    desc: 'A pewter badge from Saint Aveline’s shrine on the Queen’s Road. Travellers swear the saint keeps them whole.',
    stats: { maxHp: 20 }, build: badge,
  },
};
