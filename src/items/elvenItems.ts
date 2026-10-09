import * as THREE from 'three';
import type { ItemDef } from './itemDefs';

// Goods of the Verdant Elves (docs/design/verdant-elves.md §9): the forest's
// tier-4 materials (heartwood from fallen giants, ironbark, moonblossom,
// spirit amber, moonweave), the elves' bows, the woodcutters' axe, the
// waybread they bake, and the keepsakes of Act IV's quests.
//
// The bows are kind 'bow': they become real ranged weapons once the arms
// update (feat/arms) lands; until then they are carried, sold and admired.

const std = (color: number, roughness = 0.8, metalness = 0, emissive = 0, ei = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: ei });
const mat = (id: string, name: string, desc: string, build: () => THREE.Object3D, rarity: ItemDef['rarity'] = 'rare'): ItemDef =>
  ({ id, name, kind: 'material', rarity, stack: true, desc, stats: {}, build });
const key = (id: string, name: string, desc: string, build: () => THREE.Object3D): ItemDef =>
  ({ id, name, kind: 'key', rarity: 'rare', desc, stats: {}, build });

function log(bark: number, core: number) {
  const g = new THREE.Group();
  const l = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.42, 9), std(bark, 0.95));
  l.rotation.z = Math.PI / 2;
  const end = new THREE.Mesh(new THREE.CircleGeometry(0.085, 12), std(core, 0.6, 0, core, 0.15));
  end.position.x = 0.211;
  end.rotation.y = Math.PI / 2;
  g.add(l, end);
  return g;
}
function blossom(petal: number, glow: number) {
  const g = new THREE.Group();
  for (let k = 0; k < 6; k++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), std(petal, 0.5, 0, glow, 0.8));
    p.scale.set(1, 0.3, 0.5);
    const a = (k / 6) * Math.PI * 2;
    p.position.set(Math.cos(a) * 0.07, 0, Math.sin(a) * 0.07);
    p.rotation.y = -a;
    g.add(p);
  }
  const c = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), std(0xfff2b0, 0.4, 0, 0xffe080, 1.2));
  c.position.y = 0.02;
  g.add(c);
  g.rotation.x = 0.5;
  return g;
}
function amber() {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.09, 0), new THREE.MeshStandardMaterial({ color: 0xffa630, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.85, emissive: 0xff7a10, emissiveIntensity: 0.5 }));
  m.scale.set(1, 1.3, 0.9);
  return m;
}
function cloth(c: number) {
  const g = new THREE.Group();
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.34, 12), std(c, 0.45, 0.1, 0x6fa8ff, 0.25));
  roll.rotation.z = Math.PI / 2;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 12), std(0xd8e8f0, 0.3, 0.6));
  band.rotation.z = Math.PI / 2;
  g.add(roll, band);
  return g;
}
/** A longbow along +Y (grip at the origin), string and all. */
export function buildBow(wood: number, len = 1.5, glow = 0) {
  const g = new THREE.Group();
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -len / 2, 0), new THREE.Vector3(0, 0, 0.28 * len), new THREE.Vector3(0, len / 2, 0));
  const limb = new THREE.Mesh(new THREE.TubeGeometry(curve, 18, 0.018, 6), std(wood, 0.55, 0, glow, glow ? 0.6 : 0));
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.14, 8), std(0x3a2a1a, 0.9));
  grip.position.z = 0.14 * len;
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, len, 4), std(0xf2ecd8, 0.6));
  g.add(limb, grip, string);
  return g;
}

export const ELVEN_ITEMS: Record<string, ItemDef> = {
  // ---- the forest's materials (tier 4: see docs/design/arms-and-crafting.md) ----
  heartwood: mat('heartwood', 'Heartwood', 'The golden core of a fallen giant of the Ancient Forest, hard as horn and faintly warm. The elves let it be cut only from trees that have already fallen. The finest bow-wood in the world.', () => log(0x4a3220, 0xe0a840), 'epic'),
  ironbark: mat('ironbark', 'Ironbark', 'Grey-black bark from the ironbark trees of the Inner Forest, tough enough to turn a knife. Shield-makers and shipwrights pay well for it.', () => log(0x3a3a38, 0x8a7a5a)),
  moonblossom: mat('moonblossom', 'Moonblossom', 'A pale flower that opens only under the moon, and glows while it does. Alchemists distil mana draughts from it; the elves weave its fibres into moonweave.', () => blossom(0xe8f0ff, 0x9ad8ff)),
  spiritAmber: mat('spiritAmber', 'Spirit Amber', 'Resin from the oldest trees, set hard over centuries. Something small and bright still moves inside it when you are not looking.', amber, 'epic'),
  moonweave: mat('moonweave', 'Moonweave', 'Cloth the elves weave from moonblossom fibre on looms in the Sanctum’s canopy. Light as breath, and it holds a ward the way silk holds dye.', () => cloth(0x9ab8e8), 'epic'),

  // ---- the elves' bows (kind 'bow': ranged weapons once feat/arms lands) ----
  elvenShortbow: {
    id: 'elvenShortbow', name: 'Elven Hunting Bow', kind: 'bow', slot: 'main', rarity: 'fine',
    desc: 'A short recurve of ironbark and horn, made in Silverbough for hunting in close woods. (Bows are drawn and loosed once the arms of update 2 arrive.)',
    stats: { damage: 22, speed: 1.15 }, build: () => buildBow(0x5a4a3a, 1.15),
  },
  heartwoodLongbow: {
    id: 'heartwoodLongbow', name: 'Heartwood Longbow', kind: 'bow', slot: 'main', rarity: 'rare',
    desc: 'Faelan’s pattern: a longbow of heartwood with a moonweave grip, taller than its archer. It hums when drawn.',
    stats: { damage: 34, speed: 0.95, crit: 0.08 }, build: () => buildBow(0xb8862e, 1.6),
  },
  starfallBow: {
    id: 'starfallBow', name: 'Starfall', kind: 'bow', slot: 'main', rarity: 'epic',
    desc: 'Carved from the heartwood of a tree that grew over the Temple of Starfall, its limbs inlaid with spirit amber and the wheel-cutters’ script. Its arrows leave a trail of pale light.',
    stats: { damage: 42, speed: 1, crit: 0.12 }, build: () => buildBow(0xd8c070, 1.55, 0x80c8ff),
  },

  // ---- carvers' work you can use today ----
  heartwoodBuckler: {
    id: 'heartwoodBuckler', name: 'Heartwood Buckler', kind: 'shield', slot: 'off', rarity: 'rare',
    desc: 'A round shield of laminated heartwood and ironbark, rimmed in silver. Lighter than steel and nearly as hard.',
    stats: { block: 72, stability: 0.62, poise: 4 },
    build: () => {
      const g = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.04, 20), std(0xa8782e, 0.6));
      disc.rotation.x = Math.PI / 2;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.016, 6, 24), std(0xd8dce0, 0.3, 0.8));
      const boss = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), std(0x6a7a5a, 0.4, 0.4));
      boss.rotation.x = Math.PI / 2;
      boss.position.z = 0.02;
      g.add(disc, rim, boss);
      return g;
    },
  },
  heartwoodTalisman: {
    id: 'heartwoodTalisman', name: 'Heartwood Talisman', kind: 'accessory', slot: 'trinket', rarity: 'rare',
    desc: 'A disc of heartwood carved with a leaf and set with a bead of spirit amber. The elves give them to friends.',
    stats: { maxHp: 25, staminaRegen: 0.12 },
    build: () => {
      const g = new THREE.Group();
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 16), std(0xb8862e, 0.5));
      d.rotation.x = Math.PI / 2;
      const b = amber();
      b.scale.multiplyScalar(0.3);
      b.position.z = 0.012;
      g.add(d, b);
      return g;
    },
  },
  moonweaveCloak: {
    id: 'moonweaveCloak', name: 'Moonweave Cloak', kind: 'armor', slot: 'cloak', rarity: 'epic',
    desc: 'A cloak of moonweave the colour of dusk, cut by the Sanctum’s weavers. It is warm in the cold and cool in the sun, and turns a blade better than it should.',
    stats: { armor: 3, maxMana: 30, manaRegen: 0.15 }, armor: 'cloak',
  },

  // ---- food and draughts ----
  elvenWaybread: {
    id: 'elvenWaybread', name: 'Elven Waybread', kind: 'consumable', rarity: 'fine', stack: true,
    desc: 'A thin cake of nut flour and honey wrapped in a leaf. One mouthful and the road is shorter.',
    stats: { heal: 70, restoreStamina: 60 },
    build: () => {
      const g = new THREE.Group();
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.01, 0.14), std(0x4a7a34, 0.8));
      const cake = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.03, 0.1), std(0xe0c890, 0.9));
      cake.position.y = 0.02;
      g.add(leaf, cake);
      return g;
    },
  },
  moonblossomTonic: {
    id: 'moonblossomTonic', name: 'Moonblossom Tonic', kind: 'consumable', rarity: 'fine', stack: true,
    desc: 'A pale-blue draught that glows faintly in the bottle. Restores a great deal of mana.',
    stats: { restoreMana: 90 },
    build: () => {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), new THREE.MeshStandardMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0.8, emissive: 0x5ab0ff, emissiveIntensity: 0.6, roughness: 0.1 }));
      const n = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.06, 8), std(0xd8e0e8, 0.2));
      n.position.y = 0.08;
      g.add(b, n);
      return g;
    },
  },

  // ---- tools and keepsakes ----
  woodsmansAxe: key('woodsmansAxe', 'Woodsman’s Axe', 'A felling axe from Thornwick, its haft worn dark by many hands. Needed to cut heartwood from the fallen giants and ironbark from the old trees. (Any axe will do once the arms of update 2 arrive.)', () => {
    const g = new THREE.Group();
    const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.7, 8), std(0x6a4a2a, 0.8));
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.025), std(0x8a8e94, 0.35, 0.8));
    head.position.set(0.06, 0.3, 0);
    g.add(haft, head);
    return g;
  }),
  guidesToken: key('guidesToken', 'Guide’s Token', 'A silver leaf on a green cord, given by the elves of Silverbough to those they trust. With it the Lost Woods let you walk where you will.', () => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 6), std(0xd8e0e8, 0.25, 0.85, 0x80ffc0, 0.15));
    m.scale.set(0.6, 0.12, 1.2);
    return m;
  }),
  silverBell: key('silverBell', 'Silver Bell', 'A little silver bell from Silverbough’s spring-shrine. A spirit fox thought it sounded nice.', () => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.09, 12, 1, true), std(0xd8dce0, 0.25, 0.9));
    return m;
  }),
  starChart: key('starChart', 'Star-Chart of the Wheel-Cutters', 'A disc of pale stone the size of a shield, cut with stars and the twelve spokes of the Sunwheel. The wheel-cutters counted the turning by the stars.', () => {
    const g = new THREE.Group();
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.025, 24), std(0xc8ccd0, 0.7, 0, 0x6aa8ff, 0.25));
    d.rotation.x = Math.PI / 2;
    g.add(d);
    for (let k = 0; k < 12; k++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.15, 0.004), std(0x80c8ff, 0.4, 0, 0x80c8ff, 1));
      s.rotation.z = (k / 12) * Math.PI * 2;
      s.position.z = 0.014;
      g.add(s);
    }
    return g;
  }),
  blightHeart: key('blightHeart', 'Heart of the Blight', 'A knot of black wood from the Blighted Elder’s core, still sticky with sap that smells of rot. Elder Lirael will want to see it.', () => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), std(0x2a1a2a, 0.7, 0, 0x6a2a8a, 0.5));
    return m;
  }),
};
