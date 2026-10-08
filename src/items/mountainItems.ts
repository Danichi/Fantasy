import * as THREE from 'three';
import type { ItemDef } from './itemDefs';
import { buildSword } from './weaponModels';

// Goods of the White and Deep Mountains (docs/design/mountains.md §10): the
// legendary metals and the stones the dwarves dig for, what Vathrax leaves
// behind, the dwarven crossbows, warm clothes and hot food for the passes,
// and the blades the Deep Forge makes.

const std = (color: number, roughness = 0.8, metalness = 0, emissive = 0, ei = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: ei });
const mat = (id: string, name: string, desc: string, build: () => THREE.Object3D, rarity: ItemDef['rarity'] = 'common'): ItemDef =>
  ({ id, name, kind: 'material', rarity, stack: true, desc, stats: {}, build });

/** A lump of ore: rough grey rock flecked with the metal's colour. */
function ore(fleck: number, glow = 0) {
  return () => {
    const g = new THREE.Group();
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13, 0), std(0x5a5650, 0.95));
    rock.scale.set(1.2, 0.85, 1);
    g.add(rock);
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(new THREE.OctahedronGeometry(0.03 + (i % 2) * 0.012, 0), std(fleck, 0.25, 0.8, glow, glow ? 0.9 : 0));
      const a = i * 1.3;
      f.position.set(Math.cos(a) * 0.11, (i % 3) * 0.04 - 0.03, Math.sin(a) * 0.09);
      g.add(f);
    }
    return g;
  };
}

/** An ingot: a trapezoid bar with a bright top face. */
function ingot(color: number, glow = 0) {
  return () => {
    const geo = new THREE.CylinderGeometry(0.07, 0.1, 0.07, 4, 1);
    geo.rotateY(Math.PI / 4);
    geo.scale(2.4, 1, 1);
    const m = new THREE.Mesh(geo, std(color, 0.3, 0.9, glow, glow ? 0.5 : 0));
    const g = new THREE.Group();
    g.add(m);
    return g;
  };
}

function gem(color: number) {
  return () => {
    const g = new THREE.Group();
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), new THREE.MeshStandardMaterial({ color, roughness: 0.08, metalness: 0.1, emissive: color, emissiveIntensity: 0.25, transparent: true, opacity: 0.9 }));
    s.scale.set(1, 1.3, 1);
    g.add(s);
    return g;
  };
}

function crystal() {
  const g = new THREE.Group();
  const m = std(0x7fc8ff, 0.1, 0.2, 0x2a7acc, 1.2);
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.035 + i * 0.006, 0.22 + i * 0.03, 6), m);
    c.position.set((i - 1.5) * 0.04, 0.1, (i % 2) * 0.03);
    c.rotation.z = (i - 1.5) * 0.25;
    g.add(c);
  }
  return g;
}

function scale(color: number) {
  return () => {
    const g = new THREE.Group();
    const s = new THREE.Mesh(new THREE.CircleGeometry(0.12, 5), new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.5, side: THREE.DoubleSide }));
    s.scale.set(1, 1.35, 1);
    s.rotation.x = -0.5;
    g.add(s);
    return g;
  };
}

function bone() {
  const g = new THREE.Group();
  const m = std(0xe8e0cc, 0.7);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.42, 8), m);
  shaft.rotation.z = Math.PI / 2;
  g.add(shaft);
  for (const x of [-0.22, 0.22]) for (const z of [-0.03, 0.03]) {
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), m);
    k.position.set(x, 0, z);
    g.add(k);
  }
  return g;
}

function hide() {
  const g = new THREE.Group();
  const s = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.3, 4, 3), new THREE.MeshStandardMaterial({ color: 0xd8dce4, roughness: 0.9, side: THREE.DoubleSide }));
  const p = s.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 12) * 0.02);
  s.rotation.x = -1.2;
  g.add(s);
  return g;
}

/** A dwarven crossbow: a stock, a steel prod and a cranequin at the butt. */
function crossbow(wood: number, prod: number) {
  return () => {
    const g = new THREE.Group();
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.62), std(wood, 0.7));
    stock.position.z = 0.12;
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.016, 6, 16, Math.PI * 0.8), std(prod, 0.35, 0.85));
    bow.rotation.set(Math.PI / 2, 0, Math.PI * 0.1);
    bow.position.set(0, 0.03, 0.36);
    const crank = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 10), std(0x9b7130, 0.35, 0.7));
    crank.rotation.z = Math.PI / 2;
    crank.position.z = -0.17;
    g.add(stock, bow, crank);
    g.rotation.x = -Math.PI / 2;
    const out = new THREE.Group();
    out.add(g);
    return out;
  };
}

function stew() {
  const g = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std(0x6a4a2a, 0.8));
  bowl.rotation.x = Math.PI;
  const soup = new THREE.Mesh(new THREE.CircleGeometry(0.11, 14), std(0x8a5a2a, 0.6));
  soup.rotation.x = -Math.PI / 2;
  soup.position.y = -0.01;
  g.add(bowl, soup);
  return g;
}

function letters() {
  const g = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.15), std(0xe8dcc0, 0.9));
    l.position.y = i * 0.014;
    l.rotation.y = i * 0.3;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.01, 10), std(i ? 0x2a4a8a : 0x8a2a1a, 0.5));
    s.position.set(0, i * 0.014 + 0.01, 0);
    g.add(l, s);
  }
  return g;
}

function chart() {
  const g = new THREE.Group();
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.32, 10), std(0xc8b88a, 0.9));
  roll.rotation.z = Math.PI / 2;
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.03, 0), std(0xbfe8ff, 0.2, 0.3, 0x5a9cff, 1.5));
  star.position.y = 0.05;
  g.add(roll, star);
  return g;
}

const cloakArmor = { armor: 'cloak' as const };

export const MOUNTAIN_ITEMS: Record<string, ItemDef> = {
  // ---- metals, stones and crystal ----
  mithrilOre: mat('mithrilOre', 'Mithril Ore', 'Pale ore from the Deep Hold\'s mines, light as pumice and bright where it breaks. Only the Deep Forge can smelt it.', ore(0xdfe8f4), 'rare'),
  mithrilIngot: mat('mithrilIngot', 'Mithril Ingot', 'A bar of mithril from the Deep Forge: half the weight of steel and twice the temper.', ingot(0xdfe8f4), 'rare'),
  starIronOre: mat('starIronOre', 'Star-iron Ore', 'Black iron from a fallen star, pitted and faintly warm. The glacier pits and the Old Roads give it up, rarely.', ore(0x6a7aa8, 0x2a3a8a), 'epic'),
  starIronIngot: mat('starIronIngot', 'Star-iron Ingot', 'Forged under the Deep Forge\'s hammer, star-iron glows blue in the dark and never dulls.', ingot(0x3a4a7a, 0x3a5aff), 'epic'),
  deepCrystal: mat('deepCrystal', 'Deep Crystal', 'Blue crystal from the Colossal Caverns. It holds light for hours, and runes for ever.', crystal, 'rare'),
  gemRuby: mat('gemRuby', 'Rough Ruby', 'A blood-red stone out of the passes\' seams. Runewrights and jewellers both pay well.', gem(0xc8182a), 'fine'),
  gemSapphire: mat('gemSapphire', 'Rough Sapphire', 'A cold blue stone from the caverns. The dwarves say it remembers the dark.', gem(0x2a4ad8), 'fine'),
  dragonScale: mat('dragonScale', 'Dragon Scale', 'A white scale off Vathrax the Pale, broad as a shield and colder than the glacier.', scale(0xe8f0f8), 'epic'),
  dragonBone: mat('dragonBone', 'Dragon Bone', 'Bone from the eyries. Light, hard, and older than any kingdom: tier-six work for a master smith.', bone, 'epic'),
  wyrmhide: mat('wyrmhide', 'Wyrmhide', 'Pale hide off a mountain wyvern or the Forge-Wyrm\'s flank. It turns frost and fire alike.', hide, 'rare'),
  // ---- the dwarven crossbows (kind 'crossbow': feat/arms's ranged combat shoots them) ----
  dwarvenCrossbow: {
    id: 'dwarvenCrossbow', name: 'Dwarven Crossbow', kind: 'crossbow', slot: 'main', rarity: 'fine',
    desc: 'A steel-prodded crossbow with a crank at the butt, built in Frostpeak\'s engineers\' guild. Slow to load; it punches through plate.',
    stats: { damage: 34, speed: 0.7, poise: 12 }, build: crossbow(0x5a3a22, 0x8a8a92),
  },
  runewrightCrossbow: {
    id: 'runewrightCrossbow', name: 'Ulla\'s Runed Arbalest', kind: 'crossbow', slot: 'main', rarity: 'epic',
    desc: 'Ulla the Runewright\'s own design: a mithril prod scribed with frost runes. Its bolts leave rime where they land.',
    stats: { damage: 46, speed: 0.75, poise: 16, frost: 0.18 }, build: crossbow(0x2a2a30, 0xdfe8f4),
  },
  // ---- warm clothes and hot food for the passes (the cold meter, world/mountains/cold.ts) ----
  furCloak: {
    id: 'furCloak', name: 'Snow-bear Fur Cloak', kind: 'armor', slot: 'cloak', rarity: 'fine',
    desc: 'A heavy cloak lined with white fur, sewn in Copperbrook. In the passes it is worth more than a sword.',
    stats: { armor: 3, maxStamina: 5 }, ...cloakArmor,
  },
  dwarfStew: {
    id: 'dwarfStew', name: 'Miner\'s Stew', kind: 'consumable', rarity: 'common', stack: true,
    desc: 'Mutton, barley and a great deal of pepper. Warms you through for a long while.',
    stats: { heal: 35, restoreStamina: 40 }, build: stew,
  },
  // ---- quest things ----
  kingsLetters: { id: 'kingsLetters', name: 'The Kings\' Letters', kind: 'key', rarity: 'rare', desc: 'Two letters under two seals: King Durin\'s blue and the Under-King\'s red. Neither king has written to the other in a hundred years.', stats: {}, build: letters },
  starChart: { id: 'starChart', name: 'The Star-chart of the Wheel', kind: 'key', rarity: 'epic', desc: 'The chart from the Sunwheel\'s vault, its next mark glowing beneath the mountains. Followed, it leads down the Old Roads.', stats: {}, build: chart },
  // ---- the Deep Forge's blades ----
  mithrilBlade: {
    id: 'mithrilBlade', name: 'Mithril Blade', kind: 'sword', slot: 'main', rarity: 'epic',
    desc: 'Forged at the Deep Forge from mithril ingots: a long blade light as a reed, with an edge that never chips.',
    stats: { damage: 40, speed: 1.12, crit: 0.1 }, build: () => buildSword({ bladeLen: 0.92, bladeWidth: 0.026, thickness: 0.0042, fullerLen: 0.7, gripLen: 0.16, guardSpan: 0.13, guardStyle: 'straight', pommel: 'wheel', tint: 0xe8f0ff, guardMat: 'brass' }),
  },
  starIronBlade: {
    id: 'starIronBlade', name: 'Star-iron Greatblade', kind: 'sword', slot: 'main', rarity: 'epic',
    desc: 'Black star-iron with a blue fire in the fuller. The Deep Forge rang for a day and a night to make it.',
    stats: { damage: 52, speed: 0.86, poise: 12, stagger: 1.4 }, build: () => buildSword({ bladeLen: 1.08, bladeWidth: 0.032, thickness: 0.005, fullerLen: 0.8, gripLen: 0.22, guardSpan: 0.17, guardStyle: 'curved', pommel: 'wheel', tint: 0x2a3050, glow: 0x3a6aff, glowStrength: 2 }),
  },
  dragonboneBlade: {
    id: 'dragonboneBlade', name: 'Paleworm Fang', kind: 'sword', slot: 'main', rarity: 'epic',
    desc: 'A blade of dragon bone edged with star-iron, made from what Vathrax left. Its touch is winter.',
    stats: { damage: 56, speed: 0.95, frost: 0.22, crit: 0.08 }, build: () => buildSword({ bladeLen: 1.0, bladeWidth: 0.03, thickness: 0.006, fullerLen: 0, gripLen: 0.18, guardSpan: 0.16, guardStyle: 'curved', pommel: 'pear', tint: 0xeee6d4, glow: 0xbfe8ff, glowStrength: 1.2 }),
  },
};

/** Warmth each worn item gives against the mountain cold (0..1, summed; ids from other updates welcome). */
export const WARMTH: Record<string, number> = {
  furCloak: 0.45, wayfarerCloak: 0.2, drakeLeather: 0.15,
  // feat/arms's tailoring (warm clothes) and armours, when they exist
  woolCloak: 0.3, furHood: 0.2, fleeceGloves: 0.1, quiltedGambeson: 0.15,
};
