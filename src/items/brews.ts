import * as THREE from 'three';
import type { ItemDef } from './itemDefs';
import { RECIPES, BOOKS, QUALITY_NAMES, QRARITY, CAT_NAME, brewId, describeFx, type RecipeDef, type Shape } from '../herbalism/recipes';

// Everything the herbalist makes or needs that isn't a plant: the brews
// themselves (one item per recipe and quality, Crude to Masterwork), the three
// bases, the recipe books and the herbalist's satchel (the field kit).
// Spread BREW_ITEMS into ITEMS (items/itemDefs.ts).

const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
const glass = () => new THREE.MeshStandardMaterial({ color: 0xd8ece8, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.38, depthWrite: false });
const liquidMat = (color: number, q: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.25, emissive: color, emissiveIntensity: 0.18 + q * 0.07 });
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z = 0) => (o.position.set(x, y, z), o);

/** A glass vessel of a brew: the shape says what it is (tonic, vial, flask, oil jar, bomb). */
export function buildFlask(shape: Shape, color: number, q = 3): THREE.Object3D {
  const g = new THREE.Group();
  const liq = liquidMat(color, q), gl = glass(), cork = std(0x8a5a34, { roughness: 0.9 });
  const wax = std(q >= 5 ? 0xe2b85a : q >= 4 ? 0x9a2a2a : 0x6a4a2a, { metalness: q >= 5 ? 0.7 : 0, roughness: 0.4 });
  if (shape === 'round') {
    g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), gl), 0, 0.1));
    g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.088, 16, 12, 0, Math.PI * 2, Math.PI * 0.32, Math.PI * 0.68), liq), 0, 0.1));
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.09, 10), gl), 0, 0.22));
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.04, 10), cork), 0, 0.28));
  } else if (shape === 'vial') {
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.24, 12), gl), 0, 0.12));
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.17, 12), liq), 0, 0.09));
    g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), gl), 0, 0));
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.03, 0.05, 10), cork), 0, 0.26));
  } else if (shape === 'tall') {
    g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 14, 1, true), gl), 0, 0.11));
    g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.15, 14), liq), 0, 0.075));
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.12, 10), gl), 0, 0.27));
    g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), wax), 0, 0.34));
  } else if (shape === 'flask') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.2, 6), gl);
    g.add(at(body, 0, 0.1));
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.08, 0.15, 6), liq), 0, 0.08));
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.06, 0.07, 6), gl), 0, 0.235));
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.027, 0.05, 8), cork), 0, 0.29));
    g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 5, 12), wax), 0, 0.27).rotateX(Math.PI / 2));
  } else if (shape === 'jar') {
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.15, 14), gl), 0, 0.075));
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.072, 0.1, 14), liq), 0, 0.055));
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.03, 14), std(0x5a3a22)), 0, 0.165));
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 14), wax), 0, 0.182));
  } else {
    // bomb: a stout glass ball with a rag wick
    g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), gl), 0, 0.11));
    g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.095, 14, 10), liq), 0, 0.11));
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.05, 10), std(0x3a3a3a, { metalness: 0.6 })), 0, 0.225));
    const wick = at(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.09, 5), std(0xd8c8a0)), 0.02, 0.28);
    wick.rotation.z = -0.5;
    g.add(wick);
  }
  return g;
}

function buildBook(color: number) {
  const g = new THREE.Group();
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.34), std(color, { roughness: 0.9 })), 0, 0.03));
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.045, 0.32), std(0xe8dcb8, { roughness: 1 })), 0.012, 0.03));
  // brass corners and a pressed leaf on the cover
  const brass = std(0xc9a25a, { metalness: 0.8, roughness: 0.35 });
  for (const [x, z] of [[-0.12, -0.16], [0.12, -0.16], [-0.12, 0.16], [0.12, 0.16]]) g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.065, 0.03), brass), x, 0.03, z));
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 4).scale(0.6, 0.12, 1.4), std(0x5f8a3a));
  g.add(at(leaf, 0, 0.065));
  return g;
}

function buildSatchel() {
  const g = new THREE.Group();
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.12), std(0x7a5232, { roughness: 0.95 })), 0, 0.12));
  const flap = at(new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.03, 0.14), std(0x5a3a22, { roughness: 0.95 })), 0, 0.25);
  g.add(flap);
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 10), std(0xc9a25a, { metalness: 0.8 })), 0, 0.2, 0.065).rotateX(Math.PI / 2));
  // a mortar and pestle strapped to the side, and herbs poking out
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.07, 12), std(0x8a8a82)), 0.22, 0.04));
  const pestle = at(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.13, 8), std(0x9a9a90)), 0.23, 0.1);
  pestle.rotation.z = -0.4;
  g.add(pestle);
  for (let k = 0; k < 4; k++) {
    const s = at(new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.14, 4), std(k % 2 ? 0x6faa4a : 0x8fbf5a)), -0.1 + k * 0.05, 0.3, -0.02);
    s.rotation.z = (k - 1.5) * 0.25;
    g.add(s);
  }
  return g;
}

/** Buff families in plain words (one of each can be active). */
const FAMILY_NAME: Record<string, string> = {
  might: 'strength', ironbark: 'bark-skin', stone: 'stoneskin', swift: 'swiftness', keen: 'keen-eye', regen: 'regeneration', vamp: 'blood',
  arcane: 'arcane', storm: 'storm', dragon: 'dragon', grand: 'great', vigour: 'vigour', resFire: 'fireward', resFrost: 'frostward',
  resPoison: 'antivenom', vision: 'night-sight', shadow: 'shadow', feather: 'featherfall', forage: "forager's",
};

function brewItem(r: RecipeDef, q: number): ItemDef {
  const qn = QUALITY_NAMES[q];
  const lines = describeFx(r, q);
  const how = r.cat === 'oil' ? 'Use to coat your main-hand blade.' : r.cat === 'bomb' ? 'Use to throw it at your target (or where you look).' : 'Use to drink it.';
  const fam = r.family && r.cat !== 'tonic' && r.family !== 'gills' ? ` Only one ${FAMILY_NAME[r.family] ?? r.family} brew works at a time.` : '';
  const tox = r.tox ? ` Toxicity ${r.tox}.` : '';
  // Instant restoratives show their numbers in the usual stat rows too.
  const stats: ItemDef['stats'] = {};
  const f = r.fx;
  if (f.heal) stats.heal = Math.round(f.heal * [0, 0.6, 0.8, 1, 1.25, 1.55][q]);
  if (f.mana) stats.restoreMana = Math.round(f.mana * [0, 0.6, 0.8, 1, 1.25, 1.55][q]);
  if (f.stamina) stats.restoreStamina = Math.round(f.stamina * [0, 0.6, 0.8, 1, 1.25, 1.55][q]);
  return {
    id: brewId(r.id, q), name: `${qn} ${r.name}`, kind: 'consumable', rarity: QRARITY[q], stack: true, stats,
    desc: `${CAT_NAME[r.cat].replace(/s$/, '')} · ${qn}. ${lines.join('. ')}.${fam}${tox} ${how}`,
    build: () => buildFlask(r.shape, r.color, q),
  };
}

export const HERBALIST_KIT = 'herbalistSatchel';

const items: Record<string, ItemDef> = {
  springWater: {
    id: 'springWater', name: 'Spring Water', kind: 'material', rarity: 'common', stack: true, stats: {},
    desc: 'A stoppered flask of clean spring water. The base of every tonic and draught. (Alchemy tables have their own pump.)',
    build: () => buildFlask('round', 0x9ad0e8, 1),
  },
  grainSpirit: {
    id: 'grainSpirit', name: 'Grain Spirit', kind: 'material', rarity: 'common', stack: true, stats: {},
    desc: 'Clear, fierce spirit distilled from barley. The base of combat elixirs and thrown flasks.',
    build: () => buildFlask('flask', 0xf0ecd8, 1),
  },
  pressedOil: {
    id: 'pressedOil', name: 'Pressed Oil', kind: 'material', rarity: 'common', stack: true, stats: {},
    desc: 'Thick golden oil pressed from seeds. The base of blade oils.',
    build: () => buildFlask('jar', 0xd8b040, 1),
  },
  [HERBALIST_KIT]: {
    id: HERBALIST_KIT, name: "Herbalist's Satchel", kind: 'consumable', rarity: 'fine', stats: {},
    desc: 'A field kit: mortar and pestle, a spirit burner and a nest of vials. Use it to brew anywhere (no better than Fine, from carried bases, one flask at a time), and to read your herbal.',
    build: buildSatchel,
  },
  murkySludge: {
    id: 'murkySludge', name: 'Murky Sludge', kind: 'material', rarity: 'common', stack: true, stats: {},
    desc: 'A failed experiment. The properties fought each other and nobody won. Worthless, but you learned something.',
    build: () => buildFlask('round', 0x4a4a32, 1),
  },
};

const BOOK_COLOURS = [0x6a2a1a, 0x2a4a6a, 0x2a5a4a, 0x5a4a2a, 0x2a2a4a, 0x4a4a4a, 0x8a5a2a, 0x4a1a4a];
BOOKS.forEach((b, i) => {
  items[b.id] = {
    id: b.id, name: b.name, kind: 'consumable', rarity: b.price >= 200 ? 'rare' : 'fine', stats: {},
    desc: `${b.desc} Read it (Use) to learn its recipes.`,
    build: () => buildBook(BOOK_COLOURS[i % BOOK_COLOURS.length]),
  };
});
for (const r of RECIPES) for (let q = 1; q <= 5; q++) items[brewId(r.id, q)] = brewItem(r, q);

export const BREW_ITEMS: Record<string, ItemDef> = items;

/** What apothecaries pay for each brew (a `wants` list for their shops). */
export function brewPrices(): [string, number][] {
  const out: [string, number][] = [];
  for (const r of RECIPES) for (let q = 1; q <= 5; q++) out.push([brewId(r.id, q), Math.round((6 + r.tier * 9) * [0, 0.5, 0.8, 1, 1.5, 2.3][q] * (r.cat === 'bomb' ? 0.7 : 1))]);
  return out;
}
