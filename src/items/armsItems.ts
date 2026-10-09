import * as THREE from 'three';
import type { ItemDef, Rarity } from './itemDefs';
import {
  buildSpear, buildGreatsword, buildAxe, buildMace, buildDagger, buildStaff, buildPlayerBow, buildCrossbow,
  buildArrowBundle, buildBoltBundle, buildPick, buildHatchet, type ArrowHead,
} from './weapons/models';

// Arms and Crafting (docs/design/arms-and-crafting.md): the eight new weapon
// families in three material tiers, arrows and bolts, the tier 1-3 materials
// (ingots, timber, hides, cloth), gathering tools, and everything the
// Callings make: tonics and elixirs, meals, runes and tailored gear.
// Ids follow the cross-update contract (docs/design/roadmap.md).

const std = (color: number, roughness = 0.8, metalness = 0, emissive = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: emissive ? 0.6 : 0 });

// ---- material models ------------------------------------------------------------------
function ingot(color: number, metal = 0.85) {
  return () => {
    const g = new THREE.Group();
    const geo = new THREE.CylinderGeometry(0.07, 0.1, 0.06, 4, 1);
    geo.rotateY(Math.PI / 4);
    geo.scale(1.8, 1, 0.8);
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(geo, std(color, 0.4, metal));
      m.position.set(i * 0.03, i * 0.065, i * 0.02);
      m.rotation.y = i * 0.3;
      g.add(m);
    }
    return g;
  };
}
function ore(rock: number, fleck: number, glow = 0) {
  return () => {
    const g = new THREE.Group();
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.11, 0), std(rock, 0.95));
    r.scale.set(1.2, 0.8, 1);
    g.add(r);
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(new THREE.OctahedronGeometry(0.025, 0), std(fleck, 0.3, 0.8, glow));
      const a = i * 1.3;
      f.position.set(Math.cos(a) * 0.1, Math.sin(i * 2.1) * 0.06, Math.sin(a) * 0.09);
      g.add(f);
    }
    return g;
  };
}
function lumps(color: number) {
  return () => {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.05 + (i % 2) * 0.02, 0), std(color, 0.9));
      m.position.set((i % 2) * 0.08 - 0.04, Math.floor(i / 2) * 0.06, (i % 3) * 0.03);
      g.add(m);
    }
    return g;
  };
}
function logs(bark: number, heart: number) {
  return () => {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.36, 8), [std(bark, 0.95), std(heart, 0.8), std(heart, 0.8)]);
      l.rotation.z = Math.PI / 2;
      l.position.set(0, i < 2 ? 0 : 0.08, i < 2 ? (i - 0.5) * 0.1 : 0);
      g.add(l);
    }
    return g;
  };
}
function sheet(color: number, rough = 0.85) {
  return () => {
    const g = new THREE.Group();
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 0.22), std(color, rough));
    const fold = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 0.12), std(color, rough));
    fold.position.set(0, 0.03, -0.05);
    fold.rotation.x = -0.2;
    g.add(s, fold);
    return g;
  };
}
function roll(color: number, band: number) {
  return () => {
    const g = new THREE.Group();
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.34, 12), std(color, 0.6));
    r.rotation.z = Math.PI / 2;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.074, 0.074, 0.04, 12), std(band, 0.5));
    b.rotation.z = Math.PI / 2;
    g.add(r, b);
    return g;
  };
}
function bundle(color: number) {
  return () => {
    const g = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.006, 0.34, 4), std(color, 0.9));
      s.position.set((i % 3 - 1) * 0.02, 0, (Math.floor(i / 3) - 1) * 0.02);
      s.rotation.z = (i - 3) * 0.04;
      g.add(s);
    }
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 4, 10), std(0x8a6a44));
    tie.rotation.x = Math.PI / 2;
    g.add(tie);
    return g;
  };
}
function runeStone(glow: number) {
  return () => {
    const g = new THREE.Group();
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.035, 7), std(0x6a6a72, 0.9));
    const mark = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 4, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(glow).multiplyScalar(1.6) }));
    mark.rotation.x = -Math.PI / 2;
    mark.position.y = 0.02;
    g.add(s, mark);
    return g;
  };
}
function flask(color: number, shape: 'round' | 'tall' | 'vial' = 'round') {
  return () => {
    const g = new THREE.Group();
    const glass = new THREE.MeshStandardMaterial({ color: 0xdfeff0, roughness: 0.1, transparent: true, opacity: 0.45 });
    const body = shape === 'round' ? new THREE.SphereGeometry(0.09, 12, 10) : new THREE.CylinderGeometry(shape === 'vial' ? 0.035 : 0.06, shape === 'vial' ? 0.035 : 0.07, shape === 'vial' ? 0.2 : 0.2, 10);
    const liquid = new THREE.Mesh(body.clone().scale(0.85, 0.85, 0.85), std(color, 0.3, 0, color));
    const b = new THREE.Mesh(body, glass);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.08, 8), glass);
    neck.position.y = shape === 'round' ? 0.11 : 0.13;
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.04, 8), std(0x9a7a4a));
    cork.position.y = neck.position.y + 0.05;
    g.add(liquid, b, neck, cork);
    return g;
  };
}
function bowl(stew: number, garnish = 0x6a9a3a) {
  return () => {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std(0x8a5a32, 0.8));
    const s = new THREE.Mesh(new THREE.CircleGeometry(0.11, 14), std(stew, 0.6));
    s.rotation.x = -Math.PI / 2;
    s.position.y = -0.02;
    g.add(b, s);
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.02, 0.025), std(i % 2 ? garnish : 0xd08a3a));
      c.position.set(Math.cos(i * 1.7) * 0.05, -0.01, Math.sin(i * 1.7) * 0.05);
      g.add(c);
    }
    return g;
  };
}
function loaf(color: number) {
  return () => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), std(color, 0.85));
    m.scale.set(1.5, 0.7, 1);
    return m;
  };
}
function garment(color: number, kind: 'jerkin' | 'cloak' | 'boots' | 'bracers' | 'satchel') {
  return () => {
    const g = new THREE.Group();
    const m = std(color, 0.85);
    if (kind === 'jerkin') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.36, 10, 1, true), m);
      m.side = THREE.DoubleSide;
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 5, 10), std(0x5a3a22));
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 0.18;
      g.add(body, collar);
      for (const s of [-1, 1]) {
        const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.2, 8), m);
        sl.position.set(s * 0.19, 0.08, 0);
        sl.rotation.z = s * 0.5;
        g.add(sl);
      }
    } else if (kind === 'cloak') {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 12, 1, true, 0, Math.PI * 1.4), m);
      m.side = THREE.DoubleSide;
      g.add(c);
    } else if (kind === 'boots') {
      for (const s of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.18, 8), m);
        leg.position.set(s * 0.07, 0.09, 0);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.17), m);
        foot.position.set(s * 0.07, 0.0, 0.04);
        g.add(leg, foot);
      }
    } else if (kind === 'bracers') {
      for (const s of [-1, 1]) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.16, 8), m);
        b.position.x = s * 0.07;
        g.add(b);
      }
    } else {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.17, 0.08), m);
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.085), std(0x5a3a22));
      flap.position.y = 0.05;
      g.add(bag, flap);
    }
    return g;
  };
}
function book(color: number) {
  return () => {
    const g = new THREE.Group();
    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.27), std(color, 0.9));
    const pages = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.04, 0.25), std(0xe8dcc0));
    pages.position.set(0.006, 0.004, 0);
    const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.055, 0.04), std(0xc9a25a, 0.4, 0.8));
    clasp.position.x = 0.1;
    g.add(cover, pages, clasp);
    return g;
  };
}

// ---- builders ------------------------------------------------------------------------------
const mat = (id: string, name: string, desc: string, tier: number, build: () => THREE.Object3D, rarity: Rarity = 'common'): ItemDef =>
  ({ id, name, kind: 'material', rarity, stack: true, desc, stats: {}, tier, build });
const weapon = (id: string, name: string, kind: ItemDef['kind'], rarity: Rarity, desc: string, stats: ItemDef['stats'], build: () => THREE.Object3D, extra: Partial<ItemDef> = {}): ItemDef =>
  ({ id, name, kind, slot: 'main', rarity, desc, stats, build, ...extra });
const ammo = (id: string, name: string, head: ArrowHead | 'bolt', rarity: Rarity, desc: string, stats: ItemDef['stats']): ItemDef =>
  ({ id, name, kind: 'ammo', slot: 'quiver', rarity, stack: true, desc, stats, ammo: head === 'bolt' ? 'bolt' : 'arrow', build: head === 'bolt' ? buildBoltBundle : () => buildArrowBundle(head) });
const potion = (id: string, name: string, rarity: Rarity, desc: string, stats: ItemDef['stats'], color: number, shape: 'round' | 'tall' | 'vial' = 'round', buff?: ItemDef['buff']): ItemDef =>
  ({ id, name, kind: 'consumable', rarity, stack: true, desc, stats, build: flask(color, shape), buff });
const meal = (id: string, name: string, rarity: Rarity, desc: string, stats: ItemDef['stats'], build: () => THREE.Object3D, buff?: ItemDef['buff']): ItemDef =>
  ({ id, name, kind: 'consumable', rarity, stack: true, desc, stats, build, buff });
const armour = (id: string, name: string, slot: ItemDef['slot'], rarity: Rarity, desc: string, stats: ItemDef['stats'], build: () => THREE.Object3D, piece?: ItemDef['armor']): ItemDef =>
  ({ id, name, kind: slot === 'belt' ? 'accessory' : 'armor', slot, rarity, desc, stats, build, armor: piece });

export const ARMS_ITEMS: Record<string, ItemDef> = {
  // ---- spears and polearms ----
  ironSpear: weapon('ironSpear', 'Iron Spear', 'spear', 'common', 'A leaf-bladed iron head on an oak shaft. Keeps wolves, and worse, at the end of it.',
    { damage: 22, speed: 1.0 }, () => buildSpear({ metal: 'iron', wood: 'oak', back: 0.55, front: 1.55, head: 'leaf' })),
  steelPartisan: weapon('steelPartisan', 'Steel Partisan', 'spear', 'fine', 'A broad steel spearhead with two side flukes, on a straight ash pole. The Port watch carries them.',
    { damage: 28, speed: 0.98, poise: 3 }, () => buildSpear({ metal: 'steel', wood: 'ash', back: 0.55, front: 1.6, head: 'partisan' })),
  silversteelGlaive: weapon('silversteelGlaive', 'Silversteel Glaive', 'spear', 'rare', 'A curved silversteel blade on a yew pole: half spear, half sword, all reach.',
    { damage: 34, speed: 0.96, crit: 0.06 }, () => buildSpear({ metal: 'silversteel', wood: 'yew', back: 0.55, front: 1.55, head: 'glaive' })),
  // ---- greatswords ----
  ironGreatsword: weapon('ironGreatsword', 'Iron Greatsword', 'greatsword', 'common', 'Five feet of plain iron with a long grip. Swung with both hands, it ends arguments.',
    { damage: 34, speed: 0.8, stagger: 1.3, poise: 6 }, () => buildGreatsword('iron')),
  steelZweihander: weapon('steelZweihander', 'Steel Zweihänder', 'greatsword', 'fine', 'A two-hander of folded steel with a long straight guard. Every swing clears a circle.',
    { damage: 40, speed: 0.78, stagger: 1.4, poise: 8 }, () => buildGreatsword('steel', { len: 1.36 })),
  silversteelFlamberge: weapon('silversteelFlamberge', 'Silversteel Flamberge', 'greatsword', 'rare', 'A wave-edged silversteel greatsword. The wound it leaves will not close cleanly.',
    { damage: 47, speed: 0.77, stagger: 1.45, poise: 10, crit: 0.06 }, () => buildGreatsword('silversteel', { len: 1.32, flamberge: true })),
  // ---- axes ----
  handAxe: weapon('handAxe', 'Hand Axe', 'axe', 'common', 'An iron hatchet balanced for throwing your weight behind it. Light enough to carry a pair.',
    { damage: 19, speed: 1.08, bleed: 3 }, () => buildAxe({ metal: 'iron', wood: 'oak', two: false })),
  beardedAxe: weapon('beardedAxe', 'Bearded Axe', 'axe', 'fine', 'A steel axe whose bit hooks down into a beard: it catches shields and pulls them away.',
    { damage: 24, speed: 1.04, bleed: 4 }, () => buildAxe({ metal: 'steel', wood: 'ash', two: false, bearded: true })),
  steelGreataxe: weapon('steelGreataxe', 'Steel Greataxe', 'axe', 'fine', 'A long-hafted steel axe for both hands. It bites deep and the wound bleeds.',
    { damage: 36, speed: 0.82, bleed: 6, stagger: 1.2 }, () => buildAxe({ metal: 'steel', wood: 'ash', two: true, bearded: true }), { hands: 2 }),
  silversteelBattleaxe: weapon('silversteelBattleaxe', 'Silversteel Battleaxe', 'axe', 'rare', 'A double-bitted silversteel axe on a yew haft. Built for a smith with something to prove.',
    { damage: 42, speed: 0.8, bleed: 8, stagger: 1.25 }, () => buildAxe({ metal: 'silversteel', wood: 'yew', two: true, double: true }), { hands: 2 }),
  // ---- maces and hammers ----
  flangedMace: weapon('flangedMace', 'Flanged Mace', 'mace', 'common', 'Six iron flanges on an oak handle. Armour does not stop it; it only changes the sound.',
    { damage: 20, speed: 0.95, stagger: 1.5 }, () => buildMace({ metal: 'iron', wood: 'oak', two: false, head: 'flanged' })),
  morningStar: weapon('morningStar', 'Morning Star', 'mace', 'fine', 'A spiked steel ball on a short haft. Brutal, simple, and very hard to parry.',
    { damage: 25, speed: 0.92, stagger: 1.6, crit: 0.04 }, () => buildMace({ metal: 'steel', wood: 'ash', two: false, head: 'star' })),
  warhammer: weapon('warhammer', 'Warhammer', 'mace', 'fine', 'A steel hammer with a back-spike on a two-handed haft. It dents plate like tin.',
    { damage: 34, speed: 0.78, stagger: 2.0, poise: 6 }, () => buildMace({ metal: 'steel', wood: 'ash', two: true, head: 'hammer' }), { hands: 2 }),
  silversteelMaul: weapon('silversteelMaul', 'Silversteel Maul', 'mace', 'rare', 'A great silversteel block on a yew haft. Each blow lands like a falling wall.',
    { damage: 42, speed: 0.72, stagger: 2.2, poise: 10 }, () => buildMace({ metal: 'silversteel', wood: 'yew', two: true, head: 'maul' }), { hands: 2 }),
  // ---- daggers ----
  ironDagger: weapon('ironDagger', 'Iron Dagger', 'dagger', 'common', 'A plain iron knife with a cross-guard. Fast in either hand; deadly from behind.',
    { damage: 12, speed: 1.45, crit: 0.1 }, () => buildDagger({ metal: 'iron', len: 0.26, style: 'plain' })),
  rondelDagger: weapon('rondelDagger', 'Rondel Dagger', 'dagger', 'fine', 'A steel spike between two disc guards, made to find the gaps in mail.',
    { damage: 16, speed: 1.42, crit: 0.14, pierce: 0.2 }, () => buildDagger({ metal: 'steel', len: 0.3, style: 'rondel' })),
  silversteelStiletto: weapon('silversteelStiletto', 'Silversteel Stiletto', 'dagger', 'rare', 'A needle of silversteel with a brass guard. It goes where it is sent.',
    { damage: 20, speed: 1.46, crit: 0.2, pierce: 0.35 }, () => buildDagger({ metal: 'silversteel', len: 0.32, style: 'stiletto' })),
  // ---- bows ----
  huntingBow: weapon('huntingBow', 'Hunting Bow', 'bow', 'common', 'A short oak bow strung with gut. Enough to drop a deer at forty paces.',
    { damage: 16, speed: 1 }, () => buildPlayerBow({ wood: 'oak', len: 1.25 }), { ammo: 'arrow' }),
  ashLongbow: weapon('ashLongbow', 'Ash Longbow', 'bow', 'fine', 'A tall ash bow with horn nocks. It draws heavy and sends an arrow flat and far.',
    { damage: 22, speed: 1 }, () => buildPlayerBow({ wood: 'ash', len: 1.55, tips: 'steel' }), { ammo: 'arrow' }),
  yewWarbow: weapon('yewWarbow', 'Yew Warbow', 'bow', 'rare', 'A recurved warbow of heart-and-sap yew. A good archer can put an arrow through a door with it.',
    { damage: 28, speed: 1, crit: 0.06 }, () => buildPlayerBow({ wood: 'yew', len: 1.45, recurve: true, tips: 'silversteel' }), { ammo: 'arrow' }),
  // ---- crossbows ----
  lightCrossbow: weapon('lightCrossbow', 'Light Crossbow', 'crossbow', 'common', 'An oak stock and an iron prod, spanned by hand. Slow to load; it punches through mail.',
    { damage: 30, speed: 1, pierce: 0.3 }, () => buildCrossbow({ metal: 'iron', wood: 'oak' }), { ammo: 'bolt' }),
  steelArbalest: weapon('steelArbalest', 'Steel Arbalest', 'crossbow', 'fine', 'A steel-prodded arbalest with a stirrup. It takes your whole back to span, and it shows.',
    { damage: 42, speed: 1, pierce: 0.45 }, () => buildCrossbow({ metal: 'steel', wood: 'ash', heavy: true }), { ammo: 'bolt' }),
  // ---- staffs ----
  oakQuarterstaff: weapon('oakQuarterstaff', 'Oak Quarterstaff', 'staff', 'common', 'Six feet of seasoned oak. A traveller\'s friend, and a bully\'s surprise.',
    { damage: 17, speed: 1.1 }, () => buildStaff({ wood: 'oak' })),
  ashStaff: weapon('ashStaff', 'Ashwood Focus Staff', 'staff', 'fine', 'An ash staff caged around a blue focus stone. Spells leave the hand a little quicker.',
    { damage: 20, speed: 1.08, focus: 0.12 }, () => buildStaff({ wood: 'ash', focus: 0x5ab4ff })),
  yewStaff: weapon('yewStaff', 'Silver-shod Yew Staff', 'staff', 'rare', 'A yew staff shod with silversteel, a violet focus burning at its head.',
    { damage: 25, speed: 1.06, focus: 0.22 }, () => buildStaff({ wood: 'yew', shod: 'silversteel', focus: 0xb06aff })),

  // ---- arrows and bolts ----
  arrowIron: ammo('arrowIron', 'Iron Arrows', 'iron', 'common', 'Iron-tipped arrows with goose fletching. Arrows that hit the world can be picked up again.', { damage: 6 }),
  arrowBroadhead: ammo('arrowBroadhead', 'Broadhead Arrows', 'broadhead', 'fine', 'Wide steel heads that open wounds. Hits bleed.', { damage: 8, bleed: 3 }),
  arrowFire: ammo('arrowFire', 'Fire Arrows', 'fire', 'fine', 'Pitch-soaked heads lit as they leave the string. Hits burn.', { damage: 7, burn: 6 }),
  arrowFrost: ammo('arrowFrost', 'Frost Arrows', 'frost', 'fine', 'Heads of silverthistle glass, cold enough to sting. Hits may freeze.', { damage: 7, frost: 0.3 }),
  arrowBone: ammo('arrowBone', 'Bone Arrows', 'bone', 'fine', 'Arrows tipped with ground shark tooth. They slip through armour.', { damage: 8, pierce: 0.25, crit: 0.08 }),
  boltIron: ammo('boltIron', 'Iron Bolts', 'bolt', 'common', 'Short, heavy crossbow bolts with iron heads.', { damage: 10 }),

  // ---- tools ----
  miningPick: { id: 'miningPick', name: "Miner's Pick", kind: 'tool', tool: 'pick', rarity: 'common', desc: 'An iron pick. With it in your pack you can work ore veins (E at a vein).', stats: {}, build: buildPick },
  hatchet: { id: 'hatchet', name: "Woodcutter's Hatchet", kind: 'tool', tool: 'hatchet', rarity: 'common', desc: 'A felling hatchet. With it (or any axe) in your pack you can cut marked trees (E at the tree).', stats: {}, build: buildHatchet },

  // ---- tier 1-3 materials (contract ids) ----
  coal: mat('coal', 'Coal', 'Black, dusty and hot-burning. Smiths need it to make steel.', 1, lumps(0x202024)),
  copperOre: mat('copperOre', 'Copper Ore', 'Green-streaked rock from the hills. Runesmiths draw it into wire.', 1, ore(0x7a6a5a, 0x3aa080)),
  silverOre: mat('silverOre', 'Silver Ore', 'Pale, heavy ore from deep veins. With steel it makes silversteel.', 3, ore(0x6a6a72, 0xe8eef8, 0x5a6a80), 'fine'),
  ironIngot: mat('ironIngot', 'Iron Ingot', 'A bar of smelted iron (tier 1): the start of every blade.', 1, ingot(0x8a8580)),
  steelIngot: mat('steelIngot', 'Steel Ingot', 'Iron folded with coal into steel (tier 2): harder, lighter, keener.', 2, ingot(0xd0d2d6), 'fine'),
  silversteelIngot: mat('silversteelIngot', 'Silversteel Ingot', 'Steel alloyed with silver (tier 3). It never quite stops shining.', 3, ingot(0xdfe8ff), 'rare'),
  copperIngot: mat('copperIngot', 'Copper Wire', 'Copper drawn thin for inlay. Runes are cut into steel and filled with it.', 1, ingot(0xc87a4a)),
  ashWood: mat('ashWood', 'Ash Timber', 'Pale, springy ash (tier 2): shafts, hafts and longbows.', 2, logs(0x9a9488, 0xe0cfa8)),
  yewWood: mat('yewWood', 'Yew Timber', 'Red-hearted yew (tier 3): the best bow wood there is.', 3, logs(0x6a4a3a, 0xb0502a), 'fine'),
  rawHide: mat('rawHide', 'Raw Hide', 'A skinned hide from a hunt. A tanning rack makes leather of it.', 1, sheet(0x9a7a5a, 0.95)),
  drakeHide: mat('drakeHide', 'Drake Hide', 'Scaled hide from a wild drake, tough as boot-soles.', 3, sheet(0x5a6a3a, 0.7), 'fine'),
  leather: mat('leather', 'Leather', 'Tanned leather (tier 1): grips, straps, jerkins.', 1, sheet(0x8a5a32)),
  hardenedLeather: mat('hardenedLeather', 'Hardened Leather', 'Leather boiled in wax and pressed (tier 2). Stiff as wood, light as cloth.', 2, sheet(0x5a3a22, 0.6)),
  drakeLeather: mat('drakeLeather', 'Drake Leather', 'Tanned drake hide (tier 3). Arrows glance off it.', 3, sheet(0x4a5a32, 0.55), 'rare'),
  woolCloth: mat('woolCloth', 'Woollen Cloth', 'Spun and woven Elder Glen wool (tier 1).', 1, roll(0xb8ae9a, 0x8a2a22)),
  flax: mat('flax', 'Flax', 'Blue-flowered flax from the farms, ready to ret and spin.', 2, bundle(0xc8b878)),
  linen: mat('linen', 'Linen', 'Woven flax (tier 2): light, strong, cool to wear.', 2, roll(0xe8e0c8, 0x5a7a9a)),
  silk: mat('silk', 'Silk', 'A bolt of silk from the capital\'s merchants (tier 3).', 3, roll(0xc84a6a, 0xe8c060), 'fine'),

  // ---- runes (Runecraft) ----
  runeEmber: mat('runeEmber', 'Rune of Embers', 'Inscribed on a weapon at a runestone, its edge burns.', 2, runeStone(0xff6a2a), 'fine'),
  runeRime: mat('runeRime', 'Rune of Rime', 'Inscribed on a weapon at a runestone, its hits may freeze.', 2, runeStone(0x7fd4ff), 'fine'),
  runeAnvil: mat('runeAnvil', 'Rune of the Anvil', 'Inscribed on a weapon, its blows stagger harder.', 2, runeStone(0xe8c060), 'fine'),
  runeSwift: mat('runeSwift', 'Rune of the Swift', 'Inscribed on a weapon, it swings 8% faster.', 2, runeStone(0x9aff9a), 'fine'),
  runeWarding: mat('runeWarding', 'Rune of Warding', 'Inscribed on armour: +2 armour, +10 health.', 2, runeStone(0xc0c8ff), 'fine'),
  runeReturning: mat('runeReturning', 'Rune of Returning', 'Inscribed on a bow or crossbow, its arrows find their way back to your quiver.', 3, runeStone(0xd080ff), 'rare'),

  // ---- Herbalism: tonics, elixirs, oils and bombs ----
  herbalTonic: potion('herbalTonic', 'Herbal Tonic', 'common', 'Sungrass and mint steeped together. Restores 45 health and 30 stamina.', { heal: 45, restoreStamina: 30 }, 0x8ac04a, 'vial'),
  manaTonic: potion('manaTonic', 'Moongrass Tonic', 'common', 'A pale blue steep of moongrass. Restores 60 mana.', { restoreMana: 60 }, 0x6ab4ff, 'vial'),
  hearthrootDraught: potion('hearthrootDraught', 'Hearthroot Draught', 'fine', 'A herbalist\'s healing draught, twice a shop draught\'s strength. Restores 120 health.', { heal: 120 }, 0xe0503a),
  renewalTea: potion('renewalTea', 'Renewal Tea', 'fine', 'Restores 80 health and 60 stamina.', { heal: 80, restoreStamina: 60 }, 0xd0b04a, 'tall'),
  lifebloomTonic: potion('lifebloomTonic', 'Lifebloom Tonic', 'rare', 'Restores 220 health.', { heal: 220 }, 0xff7aa0),
  ironbarkTonic: potion('ironbarkTonic', 'Ironbark Tonic', 'fine', 'For 60 seconds: blocking costs 35% less stamina and you take 10% less damage.', {}, 0x8a6a3a, 'tall', { id: 'ironbark', sec: 60, label: 'Ironbark', m: { blockCost: -0.35, dmgTaken: -0.1 } }),
  swiftrootElixir: potion('swiftrootElixir', 'Swiftroot Elixir', 'fine', 'For 60 seconds: +12% attack speed and +10% movement speed.', {}, 0x4ad08a, 'tall', { id: 'swiftroot', sec: 60, label: 'Swiftroot', m: { attackSpeed: 0.12, moveSpeed: 0.1 } }),
  stormleafElixir: potion('stormleafElixir', 'Stormleaf Elixir', 'rare', 'For 90 seconds: +15% damage and +5% critical chance.', {}, 0x7a8aff, 'tall', { id: 'stormleaf', sec: 90, label: 'Stormleaf', m: { melee: 0.15, crit: 0.05 } }),
  nightshadeOil: potion('nightshadeOil', 'Nightshade Oil', 'fine', 'Coat your weapon: for 60 seconds every hit makes the target bleed.', {}, 0x4a2a5a, 'vial', { id: 'oil', sec: 60, label: 'Nightshade Oil', m: {} }),
  emberBomb: potion('emberBomb', 'Ember Bomb', 'fine', 'A clay pot of emberroot paste. Thrown, it bursts in flame 4 m ahead of you: 60 fire damage around it.', {}, 0xff7a2a, 'round'),

  // ---- Cooking ----
  grilledFish: meal('grilledFish', 'Grilled Fish', 'common', 'Fresh fish over a fire. Restores 40 health; for 5 minutes +10% stamina regen.', { heal: 40 }, () => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.2, 4, 8), std(0xc08a4a)); m.rotation.z = Math.PI / 2; return m; }, { id: 'meal', sec: 300, label: 'Well fed', m: { staminaRegen: 0.1 } }),
  heartyStew: meal('heartyStew', 'Hearty Stew', 'fine', 'For 5 minutes: +25 max stamina and +15% stamina regen.', { heal: 30 }, bowl(0x8a4a22), { id: 'meal', sec: 300, label: 'Hearty Stew', m: { stamina: 25, staminaRegen: 0.15 } }),
  trailRation: meal('trailRation', 'Trail Ration', 'common', 'Hard bread, dried fruit and cheese. For 10 minutes: +10% stamina regen and +10 max health.', { heal: 20 }, loaf(0xb08a4a), { id: 'meal', sec: 600, label: 'Trail Ration', m: { staminaRegen: 0.1, hp: 10 } }),
  battleBread: meal('battleBread', 'Battle Bread', 'fine', 'Dense garlic bread. For 5 minutes: +8% damage and +10% poise damage.', { heal: 25 }, loaf(0xc8a058), { id: 'meal', sec: 300, label: 'Battle Bread', m: { melee: 0.08, poise: 0.1 } }),
  huntersFeast: meal('huntersFeast', "Hunter's Feast", 'rare', 'A platter fit for a lodge. For 8 minutes: +30 max health, +20 max stamina, +10% damage.', { heal: 60 }, bowl(0x6a3a1a, 0xa04a2a), { id: 'meal', sec: 480, label: "Hunter's Feast", m: { hp: 30, stamina: 20, melee: 0.1 } }),
  warmStew: meal('warmStew', 'Warming Stew', 'fine', 'Peppered and thick, for the mountains. For 10 minutes: take 6% less damage and +15 max health.', { heal: 30 }, bowl(0xa05a2a, 0xd04a2a), { id: 'meal', sec: 600, label: 'Warm inside', m: { dmgTaken: -0.06, hp: 15 } }),
  sailorsRation: meal('sailorsRation', "Sailor's Ration", 'common', 'Salt fish and ship\'s biscuit, the galley\'s standby. For 10 minutes: +20% stamina regen (swimming too).', { heal: 15 }, loaf(0xd8c8a0), { id: 'meal', sec: 600, label: "Sailor's Ration", m: { staminaRegen: 0.2 } }),
  ironRation: meal('ironRation', 'Iron Ration', 'rare', 'A soldier\'s brick of meat and fat. For 15 minutes: +40 max stamina and +12% stamina regen.', { heal: 20 }, loaf(0x7a4a2a), { id: 'meal', sec: 900, label: 'Iron Ration', m: { stamina: 40, staminaRegen: 0.12 } }),

  // ---- Tailoring ----
  leatherJerkin: armour('leatherJerkin', 'Leather Jerkin', 'chest', 'common', 'Stitched leather over a wool lining. Light, quiet, and better than a shirt.', { armor: 4, poise: 3, maxStamina: 8 }, garment(0x7a4a2a, 'jerkin')),
  leatherBracers: armour('leatherBracers', 'Leather Bracers', 'hands', 'common', 'Laced leather bracers. An archer\'s friend.', { armor: 1, staminaRegen: 0.05 }, garment(0x6a4022, 'bracers')),
  leatherBoots: armour('leatherBoots', 'Leather Boots', 'feet', 'common', 'Soft-soled boots for long roads.', { armor: 1, maxStamina: 6 }, garment(0x5a3a22, 'boots')),
  travellersCloak: armour('travellersCloak', "Traveller's Cloak", 'cloak', 'fine', 'A hooded wool cloak. Tailored: +15 max stamina and +10% stamina regen.', { armor: 2, maxStamina: 15, staminaRegen: 0.1 }, garment(0x5a6a4a, 'cloak'), 'cloak'),
  linenGambeson: armour('linenGambeson', 'Linen Gambeson', 'chest', 'fine', 'Quilted linen, twenty layers thick. Soaks up blows that would cut leather.', { armor: 5, poise: 6, maxHp: 10 }, garment(0xd8d0b8, 'jerkin')),
  brigandine: armour('brigandine', 'Brigandine', 'chest', 'fine', 'Steel plates riveted inside hardened leather.', { armor: 7, poise: 10 }, garment(0x3a2a22, 'jerkin')),
  silkMantle: armour('silkMantle', 'Silk Mantle', 'cloak', 'rare', 'A capital-cut mantle of silk. Tailored: +20 max mana and +30% mana regen.', { armor: 2, maxMana: 20, manaRegen: 0.3 }, garment(0x8a2a5a, 'cloak'), 'cloak'),
  drakeleatherJerkin: armour('drakeleatherJerkin', 'Drake-leather Jerkin', 'chest', 'rare', 'Scaled drake leather over linen. Arrows glance; claws slide.', { armor: 8, poise: 9, maxHp: 15 }, garment(0x4a5a32, 'jerkin')),
  foragersSatchel: armour('foragersSatchel', "Forager's Satchel", 'belt', 'fine', 'A belt satchel with a pocket for everything. +25% yield from herbs, veins and trees.', { maxStamina: 5 }, garment(0x8a6a3a, 'satchel')),

  // ---- recipe books ----
  bookSmithing: { id: 'bookSmithing', name: 'The Smith\'s Daybook', kind: 'consumable', rarity: 'fine', desc: 'Read it to learn the silversteel recipes (Smithing 10).', stats: {}, build: book(0x5a3a2a) },
  bookAlchemy: { id: 'bookAlchemy', name: 'Herbal of the Collegium', kind: 'consumable', rarity: 'fine', desc: 'Read it to learn the elixir recipes (Herbalism 10).', stats: {}, build: book(0x2a5a3a) },
  bookCooking: { id: 'bookCooking', name: 'The Gilded Stag\'s Receipts', kind: 'consumable', rarity: 'fine', desc: 'Read it to learn the inn\'s best dishes.', stats: {}, build: book(0x8a4a2a) },
  bookRunes: { id: 'bookRunes', name: 'A Grammar of Runes', kind: 'consumable', rarity: 'rare', desc: 'Read it to learn the Rune of Returning.', stats: {}, build: book(0x3a2a5a) },
};
