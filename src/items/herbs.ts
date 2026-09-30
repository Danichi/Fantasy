import * as THREE from 'three';
import type { ItemDef } from './itemDefs';

// Foraged plants of the Cresha heartland (World Expansion phase 4): the
// roadside and woodland finds that feed the Herbalist, Alchemist and Cook.
// (Sungrass, Moongrass, Wild Mint and Ironleaf are in itemDefs.)

const std = (color: number, rough = 0.8, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
const at = (o: THREE.Object3D, x: number, y: number, z: number) => (o.position.set(x, y, z), o);

/** Small painted models, used for inventory icons and the gather nodes in the world. */
export const HERB_MODELS: Record<string, () => THREE.Object3D> = {
  sungrass: () => {
    const g = new THREE.Group();
    for (let k = 0; k < 7; k++) {
      const b = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.36, 3), std(0xd7ce4a, 0.7, { emissive: 0x3a3000, emissiveIntensity: 0.2 }));
      b.position.set(Math.cos(k) * 0.05, 0.18, Math.sin(k) * 0.05);
      b.rotation.z = Math.cos(k * 3) * 0.3;
      g.add(b);
    }
    return g;
  },
  moongrass: () => {
    const g = new THREE.Group();
    for (let k = 0; k < 6; k++) {
      const b = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.32, 3), std(0xb8d8f0, 0.5, { emissive: 0x4a7aa0, emissiveIntensity: 0.4 }));
      b.position.set(Math.cos(k) * 0.05, 0.16, Math.sin(k) * 0.05);
      b.rotation.x = Math.sin(k * 2) * 0.3;
      g.add(b);
    }
    return g;
  },
  wildmint: () => {
    const g = new THREE.Group();
    for (let k = 0; k < 8; k++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4).scale(1, 0.25, 1.5), std(0x5fbf6a));
      l.position.set(0, 0.06 + (k % 3) * 0.05, 0);
      l.rotation.y = k * 0.9;
      l.translateZ(0.05);
      g.add(l);
    }
    return g;
  },
  ironleaf: () => {
    const g = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4).scale(0.7, 0.2, 1.7), std(0x6f8a78, 0.4, { metalness: 0.35 }));
      l.position.set(0, 0.08, 0);
      l.rotation.set(-0.4, (k / 5) * Math.PI * 2, 0);
      l.translateZ(0.08);
      g.add(l);
    }
    return g;
  },
  redcap: () => {
    const g = new THREE.Group();
    for (const [x, z, s] of [[0, 0, 1], [0.12, 0.06, 0.7], [-0.1, 0.08, 0.6]] as const) {
      g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.025 * s, 0.035 * s, 0.14 * s, 8), std(0xf0e6d0)), x, 0.07 * s, z));
      g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.08 * s, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0xc8322a, 0.5)), x, 0.13 * s, z));
      for (let k = 0; k < 4; k++) g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.012 * s, 5, 4), std(0xfff4e0)), x + Math.cos(k * 1.7) * 0.05 * s, 0.18 * s, z + Math.sin(k * 1.7) * 0.05 * s));
    }
    return g;
  },
  brambleBerries: () => {
    const g = new THREE.Group();
    g.add(at(new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), std(0x3f6a2e)), 0, 0.18, 0));
    for (let k = 0; k < 14; k++) {
      const a = k * 2.4, y = 0.1 + (k % 4) * 0.07;
      g.add(at(new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 0), std(k % 3 ? 0x3a1a4a : 0x8a1a2a, 0.35)), Math.cos(a) * 0.2, y, Math.sin(a) * 0.2));
    }
    return g;
  },
  silverthistle: () => {
    const g = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const x = (k - 1) * 0.08;
      g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.014, 0.4, 5), std(0x9ab0a0)), x, 0.2, 0));
      g.add(at(new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 1), std(0xc9d6e6, 0.3, { metalness: 0.4 })), x, 0.42, 0));
      g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.06, 8), std(0xa58ad6)), x, 0.48, 0));
    }
    return g;
  },
  duskbloom: () => {
    const g = new THREE.Group();
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.014, 0.3, 5), std(0x3f6a4a)), 0, 0.15, 0));
    for (let k = 0; k < 6; k++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 5).scale(1, 0.3, 1.8), std(0x6a4ad8, 0.4, { emissive: 0x7a5aff, emissiveIntensity: 0.8 }));
      p.position.set(0, 0.32, 0);
      p.rotation.y = (k / 6) * Math.PI * 2;
      p.translateZ(0.07);
      g.add(p);
    }
    g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), std(0xfff0a0, 0.3, { emissive: 0xffe080, emissiveIntensity: 1.2 })), 0, 0.33, 0));
    return g;
  },
  riverReed: () => {
    const g = new THREE.Group();
    for (let k = 0; k < 6; k++) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.7, 4), std(0x7fa058));
      r.position.set(Math.cos(k) * 0.05, 0.35, Math.sin(k) * 0.05);
      r.rotation.z = Math.cos(k * 2) * 0.12;
      g.add(r);
    }
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 6), std(0x6a4528)), 0.02, 0.68, 0));
    return g;
  },
  honeycomb: () => {
    const g = new THREE.Group();
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.26, 6), std(0xe0a830, 0.35, { emissive: 0x5a3a00, emissiveIntensity: 0.3 })), 0, 0.13, 0));
    for (let k = 0; k < 6; k++) g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 6), std(0xb07818)), Math.cos(k) * 0.07, 0.27, Math.sin(k) * 0.07));
    return g;
  },
  wildGarlic: () => {
    const g = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4).scale(0.5, 0.15, 2.2), std(0x4f9a3a));
      leaf.position.set(0, 0.06, 0);
      leaf.rotation.set(-0.5, (k / 5) * Math.PI * 2, 0);
      leaf.translateZ(0.09);
      g.add(leaf);
    }
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.25, 4), std(0x6a9a4a)), 0, 0.13, 0));
    for (let k = 0; k < 7; k++) g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.015, 5, 4), std(0xffffff)), Math.cos(k) * 0.035, 0.27, Math.sin(k) * 0.035));
    return g;
  },
  emberroot: () => {
    const g = new THREE.Group();
    g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 7).rotateZ(Math.PI / 2 + 0.3), std(0xc8502a, 0.5, { emissive: 0x8a2000, emissiveIntensity: 0.5 })), 0, 0.06, 0));
    for (let k = 0; k < 3; k++) g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.18, 4), std(0x8a6a3a)), -0.1 + k * 0.03, 0.14, (k - 1) * 0.03));
    return g;
  },
};

const mat = (id: string, name: string, desc: string, rarity: ItemDef['rarity'] = 'common'): ItemDef =>
  ({ id, name, kind: 'material', rarity, stack: true, desc, stats: {}, build: HERB_MODELS[id] });
const food = (id: string, name: string, desc: string, stats: ItemDef['stats']): ItemDef =>
  ({ id, name, kind: 'consumable', rarity: 'common', stack: true, desc, stats, build: HERB_MODELS[id] });

export const HERB_ITEMS: Record<string, ItemDef> = {
  redcap: mat('redcap', 'Redcap Mushroom', 'A white-spotted red cap from shady woods. Alchemists want it; eating it raw is a mistake.'),
  brambleBerries: food('brambleBerries', 'Bramble Berries', 'Dark, sweet berries from hedgerow brambles. Restores a little health.', { heal: 10 }),
  silverthistle: mat('silverthistle', 'Silverthistle', 'A thistle with metallic, silvery heads. Used in tonics that toughen the skin.', 'fine'),
  duskbloom: mat('duskbloom', 'Duskbloom', 'A violet flower that opens only after sunset and glows faintly. Prized by mages.', 'rare'),
  riverReed: mat('riverReed', 'River Reed', 'Tough reed stalks from the riverbanks. Weavers and fletchers use them.'),
  honeycomb: food('honeycomb', 'Wild Honeycomb', 'Dripping comb from a hollow tree. Restores health and stamina.', { heal: 20, restoreStamina: 20 }),
  wildGarlic: mat('wildGarlic', 'Wild Garlic', 'Broad leaves and white star flowers, pungent in the best way. A cook\'s favourite.'),
  emberroot: mat('emberroot', 'Emberroot', 'A warm orange root from sunny hillsides. Faintly hot to the touch; used in fire tonics.', 'fine'),
};
