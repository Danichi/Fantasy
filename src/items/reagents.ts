import * as THREE from 'three';
import type { ItemDef } from './itemDefs';

// Herbalism reagents (the ingredient contract shared with the brewing system):
// every plant, fungus and beast part a herbalist can work with, its tier and
// its properties. The new ingredients' items and painted models live here too;
// the older herbs keep theirs in herbs.ts / itemDefs.ts.

export type Prop = 'heal' | 'mana' | 'stamina' | 'strength' | 'ward' | 'speed' | 'fire' | 'frost' | 'poison'
  | 'cure' | 'stealth' | 'vision' | 'lifesteal' | 'arcane' | 'binder' | 'potency';
export interface ReagentInfo { tier: 1 | 2 | 3 | 4 | 5; props: Prop[]; where: string; }

export const REAGENTS: Record<string, ReagentInfo> = {
  // The herbs and produce already in the game.
  sungrass: { tier: 1, props: ['heal'], where: 'meadows and roadsides' },
  moongrass: { tier: 2, props: ['mana', 'arcane'], where: 'river banks and marshes' },
  wildmint: { tier: 1, props: ['stamina'], where: 'meadows' },
  ironleaf: { tier: 2, props: ['ward', 'strength'], where: 'hillsides and woods' },
  redcap: { tier: 1, props: ['poison'], where: 'shady woods' },
  brambleBerries: { tier: 1, props: ['heal', 'stamina'], where: 'hedgerows and wood edges' },
  silverthistle: { tier: 2, props: ['cure', 'ward'], where: 'hills and dry meadows' },
  duskbloom: { tier: 3, props: ['stealth', 'arcane'], where: 'meadows and woods (night only)' },
  riverReed: { tier: 1, props: ['binder'], where: 'river banks and marshes' },
  honeycomb: { tier: 1, props: ['heal', 'potency'], where: 'hollow trees in the woods' },
  wildGarlic: { tier: 1, props: ['cure'], where: 'damp woods and meadows' },
  emberroot: { tier: 2, props: ['fire', 'strength'], where: 'sunny hillsides and volcanic slopes' },
  // New ingredients.
  marigold: { tier: 1, props: ['heal'], where: 'meadows, farm verges (day)' },
  yarrow: { tier: 1, props: ['heal', 'cure'], where: 'roadsides' },
  chamomile: { tier: 1, props: ['stamina', 'cure'], where: 'meadows' },
  nettle: { tier: 1, props: ['strength'], where: 'wood edges' },
  oakmoss: { tier: 1, props: ['ward'], where: 'forest' },
  marshmallow: { tier: 1, props: ['stamina', 'binder'], where: 'river banks' },
  sailorsKelp: { tier: 1, props: ['stamina', 'binder'], where: 'coast' },
  foxglove: { tier: 2, props: ['poison', 'heal'], where: 'forest' },
  bloodcap: { tier: 2, props: ['lifesteal'], where: 'deep forest' },
  ghostcap: { tier: 2, props: ['stealth', 'vision'], where: 'forest (night only)' },
  bogbean: { tier: 2, props: ['cure', 'potency'], where: 'marsh' },
  glowmoss: { tier: 2, props: ['mana', 'vision'], where: 'river banks / caves (glows at night)' },
  stoneroot: { tier: 2, props: ['ward', 'strength'], where: 'hills, quarries' },
  saltwort: { tier: 2, props: ['potency', 'binder'], where: 'coast' },
  sandSage: { tier: 2, props: ['mana', 'frost'], where: 'desert' },
  wolfsbane: { tier: 3, props: ['poison', 'strength'], where: 'hills, forest edges' },
  frostbloom: { tier: 3, props: ['frost', 'ward'], where: 'mountains, snow' },
  eaglefern: { tier: 3, props: ['speed'], where: 'high hills' },
  desertRose: { tier: 3, props: ['fire', 'potency'], where: 'desert' },
  ghostCactus: { tier: 4, props: ['speed', 'vision'], where: 'desert (night only)' },
  moonpetal: { tier: 4, props: ['arcane', 'mana'], where: 'moonlit glades (night only)' },
  dragonbloom: { tier: 5, props: ['fire', 'strength', 'potency'], where: 'volcanic slopes / high mountains' },
  blackLotus: { tier: 5, props: ['poison', 'arcane'], where: 'deep marsh, very rare' },
  starmoss: { tier: 5, props: ['heal', 'cure', 'ward'], where: 'high peaks (night only)' },
  wolfFang: { tier: 1, props: ['strength'], where: 'dropped by wolves' },
  slimeGel: { tier: 1, props: ['binder'], where: 'dropped by slimes' },
  venomSac: { tier: 2, props: ['poison'], where: 'dropped by eels, jellies, rays and other venomous beasts' },
  boneDust: { tier: 2, props: ['ward', 'arcane'], where: 'dropped by skeletons and zombies' },
  emberAsh: { tier: 3, props: ['fire', 'potency'], where: 'dropped by magma beasts and fire creatures' },
};

/** Property names as a herbalist would write them (gather prompts, tooltips). */
export const PROP_LABEL: Record<Prop, string> = {
  heal: 'heal', mana: 'mana', stamina: 'stamina', strength: 'strength', ward: 'ward', speed: 'speed', fire: 'fire',
  frost: 'frost', poison: 'poison', cure: 'cure', stealth: 'stealth', vision: 'vision', lifesteal: 'lifesteal',
  arcane: 'arcane', binder: 'binder', potency: 'potency',
};

/** "poison, heal" — a reagent's properties in plain words (empty for unknown ids). */
export const propLine = (id: string) => (REAGENTS[id]?.props ?? []).map((p) => PROP_LABEL[p]).join(', ');

// ---- painted models --------------------------------------------------------------------

const std = (color: number, rough = 0.8, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
const glow = (color: number, emissive: number, intensity: number, rough = 0.5) => std(color, rough, { emissive, emissiveIntensity: intensity });
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => (o.position.set(x, y, z), o);
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => at(new THREE.Mesh(g, m), x, y, z);
/** A thin stem from the ground to height h, leaning a little. */
const stem = (h: number, color: number, x = 0, z = 0, lean = 0, r = 0.01) => {
  const s = mesh(new THREE.CylinderGeometry(r * 0.7, r, h, 5), std(color), x, h / 2, z);
  s.rotation.z = lean;
  return s;
};
/** A leaf: a flattened, stretched sphere pointing out along +Z, rotated about Y by `yaw`. */
const leaf = (len: number, wid: number, color: number, y: number, yaw: number, droop = -0.4, rough = 0.75) => {
  const l = mesh(new THREE.SphereGeometry(0.05, 7, 4).scale(wid / 0.1, 0.2, len / 0.1), std(color, rough), 0, y, 0);
  l.rotation.set(droop, yaw, 0);
  l.translateZ(len * 0.45);
  return l;
};
/** A petal ring: n flattened petals around a centre at height y. */
const petals = (n: number, len: number, wid: number, mat: THREE.Material, y: number, tilt = -0.25, x = 0, z = 0, phase = 0) => {
  const g = new THREE.Group();
  for (let k = 0; k < n; k++) {
    const p = mesh(new THREE.SphereGeometry(0.05, 7, 4).scale(wid / 0.1, 0.18, len / 0.1), mat, x, y, z);
    p.rotation.set(tilt, phase + (k / n) * Math.PI * 2, 0);
    p.translateZ(len * 0.42);
    g.add(p);
  }
  return g;
};
const lumpy = (r: number, seed: number, detail = 1, squash = 1) => {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const n = 0.82 + 0.3 * Math.abs(Math.sin(i * 12.9898 + seed * 78.233));
    p.setXYZ(i, p.getX(i) * n, p.getY(i) * n * squash, p.getZ(i) * n);
  }
  g.computeVertexNormals();
  return g;
};

export const REAGENT_MODELS: Record<string, () => THREE.Object3D> = {
  marigold: () => {
    const g = new THREE.Group();
    for (const [x, z, h] of [[0, 0, 0.26], [0.07, 0.04, 0.2], [-0.06, 0.05, 0.17]] as const) {
      g.add(stem(h, 0x4f7f30, x, z));
      // A pom-pom of ruffled orange discs.
      for (let k = 0; k < 4; k++) g.add(mesh(new THREE.CylinderGeometry(0.05 - k * 0.01, 0.045 - k * 0.008, 0.016, 10), std(k % 2 ? 0xf5a020 : 0xe8781a, 0.6), x, h + k * 0.014, z));
    }
    for (let k = 0; k < 5; k++) g.add(leaf(0.09, 0.035, 0x467a2c, 0.04, k * 1.26));
    return g;
  },
  yarrow: () => {
    const g = new THREE.Group();
    for (const [x, z, h] of [[0, 0, 0.36], [0.06, -0.03, 0.3], [-0.05, 0.04, 0.27]] as const) {
      g.add(stem(h, 0x6a8a4a, x, z, x * 2));
      // A flat-topped umbel of tiny white flowers.
      for (let k = 0; k < 11; k++) {
        const a = k * 2.4, r = Math.sqrt(k / 11) * 0.045;
        g.add(mesh(new THREE.SphereGeometry(0.011, 5, 4), std(k % 4 ? 0xf6f2e6 : 0xf2d8e2, 0.6), x + x * 0.3 + Math.cos(a) * r, h + 0.005, z + Math.sin(a) * r));
      }
    }
    // Feathery leaves.
    for (let k = 0; k < 6; k++) g.add(leaf(0.12, 0.02, 0x5a8040, 0.05 + (k % 2) * 0.05, k * 1.05, -0.6));
    return g;
  },
  chamomile: () => {
    const g = new THREE.Group();
    const white = std(0xfbfaf4, 0.5);
    for (const [x, z, h] of [[0, 0, 0.24], [0.07, 0.03, 0.19], [-0.05, -0.05, 0.21], [0.02, 0.07, 0.15]] as const) {
      g.add(stem(h, 0x6a9a48, x, z, 0, 0.006));
      g.add(petals(10, 0.035, 0.012, white, h, -0.15, x, z));
      g.add(mesh(new THREE.SphereGeometry(0.016, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), std(0xf2c41a, 0.6), x, h, z));
    }
    return g;
  },
  nettle: () => {
    const g = new THREE.Group();
    g.add(stem(0.42, 0x3e5a2a, 0, 0, 0, 0.012));
    // Opposite pairs of saw-toothed leaves, shrinking up the stalk.
    for (let k = 0; k < 5; k++) {
      const y = 0.08 + k * 0.075, s = 1 - k * 0.15;
      for (const side of [0, Math.PI]) {
        const l = mesh(new THREE.ConeGeometry(0.035 * s, 0.11 * s, 6).scale(1, 1, 0.25), std(0x2f6a28, 0.85), 0, y, 0);
        l.rotation.set(0, side + k * (Math.PI / 2), -1.05);
        l.translateY(0.05 * s);
        g.add(l);
      }
    }
    g.add(mesh(new THREE.ConeGeometry(0.02, 0.06, 5), std(0x3a6a2a), 0, 0.45, 0));
    return g;
  },
  oakmoss: () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.3, 0.05, 0.16).translate(0, 0.025, 0), std(0x5a4632, 0.95)));
    for (let k = 0; k < 9; k++) g.add(mesh(lumpy(0.045 + (k % 3) * 0.01, k, 1, 0.55), std(k % 2 ? 0x8a9a6a : 0x9cab7a, 0.95), -0.12 + k * 0.03, 0.06, Math.sin(k * 1.7) * 0.05));
    // Grey-green lichen fronds.
    for (let k = 0; k < 6; k++) g.add(leaf(0.06, 0.025, 0xaab894, 0.08, k * 1.05, -0.1, 0.95));
    return g;
  },
  marshmallow: () => {
    const g = new THREE.Group();
    // The pale, fleshy root (what herbalists want), half out of the mud.
    const root = mesh(new THREE.ConeGeometry(0.045, 0.24, 9).rotateZ(Math.PI / 2 + 0.25), std(0xece0c8, 0.55), 0.02, 0.04, 0);
    g.add(root);
    for (let k = 0; k < 3; k++) g.add(mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.12, 4).rotateZ(1.2 + k * 0.2), std(0xd8c8a8), 0.15, 0.02 + k * 0.01, (k - 1) * 0.02));
    g.add(stem(0.3, 0x7a9a5a, -0.06, 0, 0.1));
    for (let k = 0; k < 4; k++) g.add(leaf(0.07, 0.06, 0x8aa878, 0.12 + k * 0.04, k * 1.7, -0.3, 0.9));
    const pink = std(0xf4c0d0, 0.5);
    for (const y of [0.24, 0.3]) {
      g.add(petals(5, 0.03, 0.022, pink, y, -0.3, -0.09, 0));
      g.add(mesh(new THREE.SphereGeometry(0.008, 5, 4), std(0xb04870), -0.09, y + 0.005, 0));
    }
    return g;
  },
  sailorsKelp: () => {
    const g = new THREE.Group();
    // Long olive ribbons with little gas bladders, flopped over a wet stone.
    g.add(mesh(lumpy(0.07, 3, 0, 0.5), std(0x5e5a54, 0.9), 0, 0.03, 0));
    for (let k = 0; k < 5; k++) {
      const a = k * 1.25;
      const blade = mesh(new THREE.BoxGeometry(0.035, 0.006, 0.3).translate(0, 0, 0.15), std(k % 2 ? 0x6a6a2a : 0x7a6a30, 0.45), 0, 0.06, 0);
      blade.rotation.set(0.25 + (k % 3) * 0.12, a, 0);
      g.add(blade);
      const b = mesh(new THREE.SphereGeometry(0.018, 7, 5), std(0x8a7a3a, 0.4), Math.sin(a) * 0.12, 0.035, Math.cos(a) * 0.12);
      g.add(b);
    }
    return g;
  },
  foxglove: () => {
    const g = new THREE.Group();
    g.add(stem(0.55, 0x4a6a3a, 0, 0, 0, 0.012));
    for (let k = 0; k < 6; k++) g.add(leaf(0.14, 0.06, 0x4a7a3a, 0.03, k * 1.05, -0.2));
    // Drooping purple bells, smaller toward the tip, freckled inside.
    for (let k = 0; k < 9; k++) {
      const y = 0.22 + k * 0.035, s = 1 - k * 0.07, a = k * 2.2;
      const bell = mesh(new THREE.CylinderGeometry(0.012 * s, 0.03 * s, 0.06 * s, 8, 1, true), std(k % 2 ? 0xb04aa8 : 0xc25ab8, 0.5, { side: THREE.DoubleSide }), Math.cos(a) * 0.03, y, Math.sin(a) * 0.03);
      bell.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      g.add(bell);
    }
    g.add(mesh(new THREE.ConeGeometry(0.012, 0.05, 6), std(0x8a5a8a), 0, 0.58, 0));
    return g;
  },
  bloodcap: () => {
    const g = new THREE.Group();
    const cap = std(0x7a0c14, 0.25, { emissive: 0x3a0006, emissiveIntensity: 0.25 });
    for (const [x, z, s] of [[0, 0, 1], [0.1, -0.04, 0.75], [-0.08, 0.07, 0.6], [0.04, 0.1, 0.5]] as const) {
      g.add(mesh(new THREE.CylinderGeometry(0.018 * s, 0.03 * s, 0.16 * s, 8), std(0x5a1a1a, 0.6), x, 0.08 * s, z));
      // A glossy conical cap that sags at the rim like a drop of blood.
      g.add(mesh(new THREE.ConeGeometry(0.07 * s, 0.09 * s, 12), cap, x, 0.19 * s, z));
      g.add(mesh(new THREE.SphereGeometry(0.012 * s, 6, 4).scale(1, 1.6, 1), cap, x + 0.05 * s, 0.13 * s, z));
    }
    return g;
  },
  ghostcap: () => {
    const g = new THREE.Group();
    const cap = glow(0xd8f0f4, 0x7ae0ff, 0.9, 0.3);
    for (const [x, z, s] of [[0, 0, 1], [0.07, 0.05, 0.8], [-0.06, -0.04, 0.7], [-0.02, 0.08, 0.55], [0.09, -0.06, 0.5]] as const) {
      g.add(mesh(new THREE.CylinderGeometry(0.006 * s, 0.01 * s, 0.26 * s, 6), glow(0xeef8f8, 0x60b0c0, 0.5), x, 0.13 * s, z));
      g.add(mesh(new THREE.SphereGeometry(0.04 * s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.2).scale(1, 1.3, 1), cap, x, 0.25 * s, z));
    }
    return g;
  },
  bogbean: () => {
    const g = new THREE.Group();
    // Three-lobed leaves on long stalks out of the water.
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1, x = Math.cos(a) * 0.05, z = Math.sin(a) * 0.05;
      g.add(stem(0.16, 0x5a7a40, x, z, Math.cos(a) * 0.3));
      for (let j = 0; j < 3; j++) {
        const l = mesh(new THREE.SphereGeometry(0.05, 7, 4).scale(0.45, 0.15, 0.9), std(0x3e7a3a, 0.6), x * 1.8, 0.17, z * 1.8);
        l.rotation.set(-0.2, a + (j - 1) * 0.8, 0);
        l.translateZ(0.035);
        g.add(l);
      }
    }
    // A spike of fringed white-pink flowers.
    g.add(stem(0.32, 0x6a7a50, 0, 0, 0, 0.008));
    for (let k = 0; k < 7; k++) {
      const a = k * 2.3;
      g.add(mesh(new THREE.IcosahedronGeometry(0.018, 0), std(k % 3 ? 0xfbf2f0 : 0xf0b8c4, 0.7), Math.cos(a) * 0.02, 0.22 + k * 0.015, Math.sin(a) * 0.02));
    }
    return g;
  },
  glowmoss: () => {
    const g = new THREE.Group();
    for (let k = 0; k < 7; k++) g.add(mesh(lumpy(0.05 + (k % 3) * 0.012, k + 7, 1, 0.6), std(k % 2 ? 0x2f6a4a : 0x3a7a58, 0.9), Math.cos(k * 2.4) * 0.07, 0.03, Math.sin(k * 2.4) * 0.07));
    // Tiny luminous spore heads.
    const spore = glow(0x9af0d8, 0x40ffd0, 1.4);
    for (let k = 0; k < 16; k++) {
      const a = k * 2.399, r = 0.02 + (k % 5) * 0.022;
      g.add(mesh(new THREE.SphereGeometry(0.008, 5, 4), spore, Math.cos(a) * r, 0.075 + (k % 3) * 0.008, Math.sin(a) * r));
    }
    return g;
  },
  stoneroot: () => {
    const g = new THREE.Group();
    // A knuckled grey root that looks like a string of pebbles.
    for (let k = 0; k < 5; k++) g.add(mesh(lumpy(0.045 - k * 0.005, k + 3, 0, 0.8), std(0x8a8478, 0.9, { flatShading: true }), -0.1 + k * 0.05, 0.035 - k * 0.004, Math.sin(k * 1.3) * 0.02));
    g.add(stem(0.12, 0x6a7a5a, -0.12, 0, 0.1, 0.006));
    for (let k = 0; k < 4; k++) {
      const l = leaf(0.05, 0.03, 0x7a8a6a, 0.1, k * 1.57, -0.3, 0.9);
      l.position.x -= 0.12;
      g.add(l);
    }
    return g;
  },
  saltwort: () => {
    const g = new THREE.Group();
    // Jointed, succulent glasswort stems, green blushing red at the tips.
    for (let k = 0; k < 6; k++) {
      const a = k * 1.05, x = Math.cos(a) * 0.045, z = Math.sin(a) * 0.045;
      for (let j = 0; j < 4; j++) {
        const s = mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.05, 6), std(j < 2 ? 0x5a9a4a : j === 2 ? 0x8a8a48 : 0xb0503a, 0.4), x * (1 + j * 0.25), 0.03 + j * 0.05, z * (1 + j * 0.25));
        s.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
        g.add(s);
      }
    }
    return g;
  },
  sandSage: () => {
    const g = new THREE.Group();
    // A rosette of soft silver-blue leaves...
    for (let k = 0; k < 9; k++) g.add(leaf(0.1, 0.045, k % 2 ? 0xa8b8b8 : 0x9aaeb2, 0.03 + (k % 3) * 0.02, k * 0.7, -0.35, 0.95));
    // ...and pale lavender flower spikes.
    for (const [x, z] of [[0.02, 0], [-0.03, 0.03]] as const) {
      g.add(stem(0.26, 0x8a9a8a, x, z, 0, 0.006));
      for (let j = 0; j < 6; j++) g.add(mesh(new THREE.SphereGeometry(0.013, 6, 4), std(0xc8b0e0, 0.7), x, 0.17 + j * 0.017, z));
    }
    return g;
  },
  wolfsbane: () => {
    const g = new THREE.Group();
    g.add(stem(0.5, 0x2f4a2a, 0, 0, 0, 0.011));
    // Deeply cut palmate leaves low down.
    for (let k = 0; k < 4; k++) for (let j = 0; j < 3; j++) g.add(leaf(0.09, 0.025, 0x2a5a2e, 0.06 + k * 0.03, k * 1.57 + (j - 1) * 0.35, -0.3));
    // Hooded indigo flowers ("monkshood") up the spike.
    const hood = std(0x3a2a8a, 0.45, { emissive: 0x1a0a40, emissiveIntensity: 0.25 });
    for (let k = 0; k < 7; k++) {
      const a = k * 2.5, y = 0.28 + k * 0.03, s = 1 - k * 0.08;
      const h = mesh(new THREE.SphereGeometry(0.025 * s, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6).scale(0.9, 1.3, 1), hood, Math.cos(a) * 0.025, y, Math.sin(a) * 0.025);
      h.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      g.add(h);
    }
    return g;
  },
  frostbloom: () => {
    const g = new THREE.Group();
    g.add(stem(0.2, 0x6a8a9a, 0, 0, 0, 0.008));
    for (let k = 0; k < 4; k++) g.add(leaf(0.07, 0.03, 0x7a9aa8, 0.04, k * 1.57 + 0.4, -0.2, 0.4));
    // Crystalline petals like shards of ice.
    const ice = std(0xcfe8ff, 0.15, { emissive: 0x6ab0ff, emissiveIntensity: 0.45, metalness: 0.1, flatShading: true });
    for (let k = 0; k < 6; k++) {
      const p = mesh(new THREE.OctahedronGeometry(0.035, 0).scale(0.6, 0.35, 1.5), ice, 0, 0.21, 0);
      p.rotation.set(-0.5, (k / 6) * Math.PI * 2, 0);
      p.translateZ(0.045);
      g.add(p);
    }
    g.add(mesh(new THREE.OctahedronGeometry(0.025, 0), std(0xffffff, 0.1, { emissive: 0xbfe0ff, emissiveIntensity: 0.9 }), 0, 0.225, 0));
    return g;
  },
  eaglefern: () => {
    const g = new THREE.Group();
    // Arching fronds, each a rachis with paired leaflets.
    for (let k = 0; k < 5; k++) {
      const frond = new THREE.Group();
      frond.add(mesh(new THREE.CylinderGeometry(0.004, 0.007, 0.42, 4).translate(0, 0.21, 0), std(0x6a7a3a)));
      for (let j = 0; j < 8; j++) {
        const s = 1 - j * 0.1;
        for (const side of [-1, 1]) {
          const l = mesh(new THREE.SphereGeometry(0.05, 6, 3).scale(0.5 * s, 0.12, 1.1 * s), std(j % 2 ? 0x4f8a34 : 0x5a9a3a, 0.75), 0, 0.06 + j * 0.045, 0);
          l.rotation.y = (side * Math.PI) / 2;
          l.rotation.x = -0.4;
          l.translateZ(0.045 * s);
          frond.add(l);
        }
      }
      frond.rotation.set(0.55, (k / 5) * Math.PI * 2, 0, 'YXZ');
      g.add(frond);
    }
    return g;
  },
  desertRose: () => {
    const g = new THREE.Group();
    g.add(stem(0.14, 0x5a5a2a, 0, 0, 0, 0.01));
    for (let k = 0; k < 5; k++) g.add(mesh(new THREE.ConeGeometry(0.006, 0.02, 4).rotateZ(Math.PI / 2), std(0x8a6a3a), 0.012, 0.03 + k * 0.022, 0));
    for (let k = 0; k < 3; k++) g.add(leaf(0.06, 0.035, 0x5f7a3a, 0.08, k * 2.1, -0.2, 0.5));
    // Layered sun-red petals cupping a deep-orange heart.
    const outer = std(0xd8402a, 0.45, { emissive: 0x5a1000, emissiveIntensity: 0.25 });
    const inner = std(0xf07a2a, 0.45, { emissive: 0x6a2000, emissiveIntensity: 0.3 });
    for (let r = 0; r < 3; r++) g.add(petals(6 - r, 0.07 - r * 0.018, 0.05 - r * 0.012, r === 2 ? inner : outer, 0.16 + r * 0.012, -0.9 + r * 0.35, 0, 0, r * 0.5));
    g.add(mesh(new THREE.SphereGeometry(0.018, 8, 6), inner, 0, 0.18, 0));
    return g;
  },
  ghostCactus: () => {
    const g = new THREE.Group();
    // A ribbed barrel cactus...
    const body = new THREE.SphereGeometry(0.1, 16, 10);
    const p = body.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const rib = 1 - 0.1 * Math.abs(Math.sin(Math.atan2(z, x) * 6));
      p.setXYZ(i, x * rib, y * 1.15, z * rib);
    }
    body.computeVertexNormals();
    g.add(mesh(body, std(0x4a7a5a, 0.6), 0, 0.11, 0));
    for (let k = 0; k < 10; k++) {
      const a = k * 0.63;
      g.add(mesh(new THREE.ConeGeometry(0.004, 0.03, 3).rotateZ(-Math.PI / 2), std(0xe8e0c8), Math.cos(a) * 0.1, 0.1 + (k % 3) * 0.03, Math.sin(a) * 0.1));
    }
    // ...crowned with a luminous white night flower.
    const bloom = glow(0xf6f8ff, 0xc8e0ff, 1.1, 0.3);
    g.add(petals(8, 0.06, 0.03, bloom, 0.235, -0.55));
    g.add(petals(6, 0.04, 0.025, bloom, 0.245, -1.0, 0, 0, 0.4));
    g.add(mesh(new THREE.SphereGeometry(0.015, 6, 5), glow(0xfff4b0, 0xffe080, 1.4), 0, 0.25, 0));
    return g;
  },
  moonpetal: () => {
    const g = new THREE.Group();
    g.add(stem(0.3, 0x8aa0b0, 0, 0, 0, 0.007));
    for (let k = 0; k < 3; k++) g.add(leaf(0.09, 0.03, 0x7a9aa8, 0.06 + k * 0.05, k * 2.1, -0.3, 0.4));
    // Crescent-shaped silver petals, glowing like the moon.
    const silver = glow(0xe8f0ff, 0x9ab8ff, 1.2, 0.25);
    for (let k = 0; k < 5; k++) {
      const c = mesh(new THREE.TorusGeometry(0.035, 0.012, 5, 10, Math.PI * 1.1).scale(1, 0.4, 1), silver, 0, 0.31, 0);
      c.rotation.set(-Math.PI / 2 + 0.5, 0, (k / 5) * Math.PI * 2);
      c.rotateOnWorldAxis(THREE.Object3D.DEFAULT_UP, (k / 5) * Math.PI * 2);
      c.translateY(0.02);
      g.add(c);
    }
    g.add(mesh(new THREE.SphereGeometry(0.018, 8, 6), glow(0xffffff, 0xd8e8ff, 1.6), 0, 0.32, 0));
    return g;
  },
  dragonbloom: () => {
    const g = new THREE.Group();
    g.add(stem(0.3, 0x2a1a14, 0, 0, 0, 0.012));
    for (let k = 0; k < 3; k++) g.add(leaf(0.08, 0.03, 0x3a2a1a, 0.08 + k * 0.05, k * 2.1, -0.1, 0.6));
    // Flame-tongue petals licking upward around a white-hot heart.
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const f = mesh(new THREE.ConeGeometry(0.022, 0.13 - (k % 2) * 0.03, 6), glow(k % 2 ? 0xff6a1a : 0xd8301a, k % 2 ? 0xff7a10 : 0xff3000, 0.9, 0.4), Math.cos(a) * 0.03, 0.36, Math.sin(a) * 0.03);
      f.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
      g.add(f);
    }
    g.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), glow(0xfff0a0, 0xffd040, 2.0), 0, 0.33, 0));
    return g;
  },
  blackLotus: () => {
    const g = new THREE.Group();
    // A dark lily pad...
    g.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.01, 16, 1, false, 0.3, Math.PI * 2 - 0.6), std(0x1f3a2a, 0.4), 0, 0.005, 0));
    // ...cradling a black lotus with a violet sheen.
    const outer = std(0x1a1020, 0.2, { emissive: 0x3a1050, emissiveIntensity: 0.35, metalness: 0.2 });
    const inner = std(0x2a1838, 0.2, { emissive: 0x6a20a0, emissiveIntensity: 0.5, metalness: 0.2 });
    for (let r = 0; r < 3; r++) {
      for (let k = 0; k < 8 - r * 2; k++) {
        const p = mesh(new THREE.ConeGeometry(0.03 - r * 0.005, 0.11 - r * 0.02, 5).scale(1, 1, 0.35), r === 2 ? inner : outer, 0, 0.06, 0);
        p.rotation.set(0, (k / (8 - r * 2)) * Math.PI * 2 + r * 0.4, 0);
        p.rotateX(0.9 - r * 0.35);
        p.translateY(0.04);
        g.add(p);
      }
    }
    g.add(mesh(new THREE.SphereGeometry(0.018, 8, 6), std(0xc8a020, 0.3, { emissive: 0x8a5a00, emissiveIntensity: 0.8 }), 0, 0.075, 0));
    return g;
  },
  starmoss: () => {
    const g = new THREE.Group();
    for (let k = 0; k < 6; k++) g.add(mesh(lumpy(0.05 + (k % 2) * 0.015, k + 11, 1, 0.5), std(0x24303a, 0.9), Math.cos(k * 2.4) * 0.06, 0.025, Math.sin(k * 2.4) * 0.06));
    // Four-pointed stars that glint like the night sky.
    const star = glow(0xfff8d8, 0xffe8a0, 1.8, 0.2);
    for (let k = 0; k < 9; k++) {
      const a = k * 2.399, r = 0.015 + (k % 4) * 0.022;
      const s = mesh(new THREE.OctahedronGeometry(0.014, 0).scale(1, 0.4, 1), star, Math.cos(a) * r, 0.07, Math.sin(a) * r);
      s.rotation.y = a;
      g.add(s);
    }
    return g;
  },
  // ---- beast reagents ---------------------------------------------------------------------
  wolfFang: () => {
    const g = new THREE.Group();
    const bone = std(0xf2ead6, 0.4);
    for (const [x, s, a] of [[-0.035, 1, 0.25], [0.04, 0.8, -0.2]] as const) {
      // A curved fang: a cone bent along its length.
      const geo = new THREE.ConeGeometry(0.025 * s, 0.16 * s, 8, 6);
      const p = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i) / (0.16 * s) + 0.5;
        p.setX(i, p.getX(i) + y * y * 0.04 * s);
      }
      geo.computeVertexNormals();
      const f = mesh(geo, bone, x, 0.08 * s, 0);
      f.rotation.z = Math.PI + a;
      g.add(f);
      g.add(mesh(new THREE.CylinderGeometry(0.026 * s, 0.022 * s, 0.025, 8), std(0xd8c8a8, 0.6), x, 0.16 * s, 0));
    }
    g.add(mesh(new THREE.TorusGeometry(0.06, 0.005, 4, 16, Math.PI), std(0x5a3a22), 0, 0.17, 0));
    return g;
  },
  slimeGel: () => {
    const g = new THREE.Group();
    g.add(mesh(lumpy(0.09, 5, 2, 0.65), std(0x6ad84a, 0.15, { transparent: true, opacity: 0.8, emissive: 0x2a7a10, emissiveIntensity: 0.35 }), 0, 0.055, 0));
    g.add(mesh(new THREE.SphereGeometry(0.02, 8, 6), std(0xeaffe0, 0.05, { transparent: true, opacity: 0.7 }), -0.03, 0.09, 0.03));
    g.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), std(0x3a9a2a, 0.2, { transparent: true, opacity: 0.6 }), 0.02, 0.04, -0.01));
    return g;
  },
  venomSac: () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(0.08, 14, 10).scale(1, 0.8, 1.2), std(0x6a3a7a, 0.3, { emissive: 0x3a5a10, emissiveIntensity: 0.3 }), 0, 0.065, 0));
    // Veins and the stub of the duct.
    for (let k = 0; k < 4; k++) {
      const v = mesh(new THREE.TorusGeometry(0.081, 0.004, 4, 16, Math.PI * 0.8).scale(1, 0.8, 1.2), std(0x9adf3a, 0.5, { emissive: 0x5a9a10, emissiveIntensity: 0.6 }), 0, 0.065, 0);
      v.rotation.set(Math.PI / 2, 0, k * 0.8);
      g.add(v);
    }
    g.add(mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.07, 6).rotateX(Math.PI / 2), std(0x7a4a6a, 0.4), 0, 0.07, 0.11));
    return g;
  },
  boneDust: () => {
    const g = new THREE.Group();
    // A little twist of cloth spilling grey-white dust and a shard of bone.
    g.add(mesh(new THREE.SphereGeometry(0.08, 12, 8).scale(1, 0.9, 1), std(0x8a7a5a, 0.95), -0.04, 0.07, 0));
    g.add(mesh(new THREE.ConeGeometry(0.04, 0.05, 8), std(0x8a7a5a, 0.95), -0.04, 0.155, 0));
    g.add(mesh(new THREE.TorusGeometry(0.03, 0.006, 4, 10).rotateX(Math.PI / 2), std(0x4a3a22), -0.04, 0.13, 0));
    g.add(mesh(new THREE.ConeGeometry(0.07, 0.035, 10), std(0xd8d4c8, 1), 0.07, 0.0175, 0.02));
    g.add(mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.08, 5).rotateZ(1.3), std(0xe8e2d0, 0.6), 0.09, 0.03, -0.03));
    return g;
  },
  emberAsh: () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.ConeGeometry(0.11, 0.07, 10), std(0x5a5450, 1), 0, 0.035, 0));
    const ember = glow(0xff7a2a, 0xff4a00, 1.6);
    for (let k = 0; k < 9; k++) {
      const a = k * 2.399, r = 0.015 + (k % 4) * 0.02;
      g.add(mesh(new THREE.IcosahedronGeometry(0.012 + (k % 3) * 0.004, 0), ember, Math.cos(a) * r, 0.07 - r * 0.6, Math.sin(a) * r));
    }
    return g;
  },
  // ---- herbalist's tools ------------------------------------------------------------------
  herbSickle: () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.18, 8), std(0x7a5232, 0.7), 0, 0.09, 0));
    g.add(mesh(new THREE.TorusGeometry(0.02, 0.005, 4, 10).rotateX(Math.PI / 2), std(0xb08a3a, 0.4, { metalness: 0.6 }), 0, 0.18, 0));
    const blade = mesh(new THREE.TorusGeometry(0.09, 0.009, 4, 20, Math.PI * 1.15).scale(1, 1, 0.25), std(0xc8ccd0, 0.25, { metalness: 0.85 }), 0.09, 0.19, 0);
    blade.rotation.z = Math.PI * 0.05;
    g.add(blade);
    return g;
  },
  thornGloves: () => {
    const g = new THREE.Group();
    const leather = std(0x6a4a2a, 0.85);
    for (const [x, a] of [[-0.06, 0.15], [0.07, -0.25]] as const) {
      const glove = new THREE.Group();
      glove.add(mesh(new THREE.BoxGeometry(0.08, 0.025, 0.09), leather, 0, 0.0125, 0));
      glove.add(mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.06, 10).rotateX(Math.PI / 2).scale(1, 0.4, 1), std(0x5a3a1e, 0.9), 0, 0.012, -0.07));
      for (let f = 0; f < 4; f++) glove.add(mesh(new THREE.CapsuleGeometry(0.009, 0.045, 3, 6).rotateX(Math.PI / 2), leather, -0.03 + f * 0.02, 0.012, 0.07));
      glove.add(mesh(new THREE.CapsuleGeometry(0.009, 0.035, 3, 6).rotateX(Math.PI / 2).rotateY(0.8), leather, 0.05, 0.012, 0.03));
      glove.position.set(x, 0.01, 0);
      glove.rotation.y = a;
      g.add(glove);
    }
    return g;
  },
  herbAlmanac: () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.2, 0.05, 0.27), std(0x2f5a32, 0.8), 0, 0.025, 0));
    g.add(mesh(new THREE.BoxGeometry(0.19, 0.04, 0.26), std(0xe8dcbc, 1), 0.007, 0.025, 0));
    g.add(mesh(new THREE.BoxGeometry(0.02, 0.052, 0.27), std(0x24482a, 0.8), -0.095, 0.025, 0));
    // A pressed brass leaf on the cover.
    const l = mesh(new THREE.SphereGeometry(0.05, 8, 4).scale(0.5, 0.06, 1.1), std(0xc8a040, 0.35, { metalness: 0.7 }), 0.01, 0.052, 0);
    l.rotation.y = 0.6;
    g.add(l);
    return g;
  },
};

// ---- items -------------------------------------------------------------------------------

const RARITY: Record<ReagentInfo['tier'], ItemDef['rarity']> = { 1: 'common', 2: 'fine', 3: 'rare', 4: 'rare', 5: 'epic' };
const mat = (id: string, name: string, desc: string): ItemDef =>
  ({ id, name, kind: 'material', rarity: RARITY[REAGENTS[id].tier], stack: true, desc, stats: {}, build: REAGENT_MODELS[id] });

/** The new herbalism ingredients (spread into ITEMS). */
export const REAGENT_ITEMS: Record<string, ItemDef> = {
  marigold: mat('marigold', 'Marigold', 'Cheerful orange heads from the meadows and farm verges. Steeped, they close small wounds — a staple of simple healing tonics.'),
  yarrow: mat('yarrow', 'Yarrow', 'Flat white flower-clusters that line every road. Soldiers pack it into cuts; herbalists add it to draughts that heal and purge.'),
  chamomile: mat('chamomile', 'Chamomile', 'Little apple-scented daisies. A calming tea that puts the wind back in tired legs and settles a sour stomach.'),
  nettle: mat('nettle', 'Stinging Nettle', 'It bites bare hands, but boiled down it makes a broth that strengthens the arm. Grows thick along wood edges.'),
  oakmoss: mat('oakmoss', 'Oakmoss', 'Grey-green lichen scraped from old forest oaks. Its bitter essence hardens the skin against blows.'),
  marshmallow: mat('marshmallow', 'Marsh Mallow Root', 'A pale, gummy root from the river mud. Soothing and binding: it holds a brew together and steadies the breath.'),
  sailorsKelp: mat('sailorsKelp', "Sailor's Kelp", 'Olive ribbons of weed left by the tide. Salty, chewy, and full of stamina — and its slime binds a tincture well.'),
  foxglove: mat('foxglove', 'Foxglove', 'Purple bells on a tall woodland spike. A pinch steadies a failing heart; a spoonful stops it. Poison or physic, by the dose.'),
  bloodcap: mat('bloodcap', 'Bloodcap Mushroom', 'A glossy crimson cap that grows only in the deepest woods. Brewed, it lets the drinker drink back the life of what they strike.'),
  ghostcap: mat('ghostcap', 'Ghostcap', 'Pale, faintly glowing mushrooms that rise in the woods at night. They hide the eater in shadow and open the eyes to the dark.'),
  bogbean: mat('bogbean', 'Bogbean', 'A three-leaved marsh plant with fringed white flowers. A bitter purge that cleans the blood and sharpens other herbs.'),
  glowmoss: mat('glowmoss', 'Glowmoss', 'Soft moss of the river banks whose spores shine at night. Mages chew it for focus and to see by its light.'),
  stoneroot: mat('stoneroot', 'Stoneroot', 'A knuckled grey root that looks like a string of pebbles. Hill folk swear by it for hard skin and harder muscles.'),
  saltwort: mat('saltwort', 'Saltwort', 'Jointed, salty stems from the shoreline. Ashed, it intensifies any brew and fixes it so it keeps.'),
  sandSage: mat('sandSage', 'Sand Sage', 'Silver desert sage that stays cool in the noon sun. Its smoke clears the mind; its oil carries a breath of frost.'),
  wolfsbane: mat('wolfsbane', 'Wolfsbane', 'Hooded indigo flowers of the hills and wood edges. Deadly in a blade-oil, maddeningly strengthening in tiny doses. Wear gloves.'),
  frostbloom: mat('frostbloom', 'Frostbloom', 'A crystalline flower that only opens above the snowline. Cold to hold; brewed, it chills foes and wards the drinker.'),
  eaglefern: mat('eaglefern', 'Eagle Fern', 'A tall fern of the windy heights. Those who drink its tea are said to run like the wind over the hills.'),
  desertRose: mat('desertRose', 'Desert Rose', 'A sun-red rose of the open dunes, warm as a coal. Fire tonics made with it burn twice as bright.'),
  ghostCactus: mat('ghostCactus', 'Ghost Cactus Flower', 'A luminous white bloom that opens on desert cacti for a single night. Quickens the feet and sharpens the eyes.'),
  moonpetal: mat('moonpetal', 'Moonpetal', 'Crescent petals that glow silver in moonlit glades and wilt by dawn. Among the most potent sources of arcane power.'),
  dragonbloom: mat('dragonbloom', 'Dragonbloom', 'A flame-shaped flower from volcanic slopes and the highest crags. Holding it is like holding a coal; its brews are legendary.'),
  blackLotus: mat('blackLotus', 'Black Lotus', 'A black flower with a violet sheen, found deep in the marshes by the very lucky. Deadly and arcane in equal measure.'),
  starmoss: mat('starmoss', 'Starmoss', 'Dark moss pricked with points of light, found on the highest peaks at night. It heals, cleanses and wards like nothing else.'),
  wolfFang: mat('wolfFang', 'Wolf Fang', 'A curved fang pulled from a wolf. Ground into a tonic, it lends the drinker a predator\'s strength.'),
  slimeGel: mat('slimeGel', 'Slime Gel', 'A quivering lump of slime. Disgusting, but nothing binds a brew together quite as well.'),
  venomSac: mat('venomSac', 'Venom Sac', 'A swollen gland of venom from a stinging beast. The base of any serious poison. Handle with care.'),
  boneDust: mat('boneDust', 'Bone Dust', 'Grey dust from the bones of the restless dead. Still faintly cold with old magic: it wards, and it whispers.'),
  emberAsh: mat('emberAsh', 'Ember Ash', 'Ash from a creature of living fire, still glowing at the heart. A fierce fire reagent that strengthens whatever it touches.'),
};

/** Herbalist's tools: carried, they make gathering better (see world/foraging.ts). */
export const HERBALIST_TOOLS: Record<string, ItemDef> = {
  herbSickle: {
    id: 'herbSickle', name: "Herbalist's Sickle", kind: 'key', rarity: 'fine', stats: {}, build: REAGENT_MODELS.herbSickle,
    desc: 'A small, keen bronze-bound sickle. Cutting instead of tearing: plants often yield an extra stem, and grow back faster.',
  },
  thornGloves: {
    id: 'thornGloves', name: 'Thornproof Gloves', kind: 'key', rarity: 'fine', stats: {}, build: REAGENT_MODELS.thornGloves,
    desc: 'Thick waxed-leather gloves. Gather nettles, foxglove, wolfsbane, cactus and black lotus without being stung or poisoned.',
  },
  herbAlmanac: {
    id: 'herbAlmanac', name: "Wenna's Herbal Almanac", kind: 'key', rarity: 'rare', stats: {}, build: REAGENT_MODELS.herbAlmanac,
    desc: 'A field guide of pressed leaves and cramped notes. Names the properties of every plant you gather, and where rarer ones hide.',
  },
};
