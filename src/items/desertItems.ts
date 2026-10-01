import * as THREE from 'three';
import type { ItemDef } from './itemDefs';

// Goods of the Golden Expanse: what the scavengers dig out of the sand and
// what the Sunspire bazaar sells back to them at ten times the price.

const std = (color: number, roughness = 0.8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const mat = (id: string, name: string, desc: string, build: () => THREE.Object3D, rarity: ItemDef['rarity'] = 'common'): ItemDef =>
  ({ id, name, kind: 'material', rarity, stack: true, desc, stats: {}, build });

function scrap() {
  const g = new THREE.Group();
  const a = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.22), std(0x8a5a3a, 0.9, 0.4));
  a.rotation.set(0.2, 0.4, 0.1);
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.18), std(0x6a6a6a, 0.6, 0.7));
  b.position.set(0.06, 0.05, 0.03);
  b.rotation.set(-0.3, 1.1, 0.2);
  const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6), std(0x5a4a3a, 0.7, 0.6));
  bolt.position.set(-0.08, 0.06, -0.04);
  bolt.rotation.z = 1.2;
  g.add(a, b, bolt);
  return g;
}

function tooth() {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.28, 3), std(0xf2e8d0, 0.5));
  t.rotation.z = 0.3;
  const root = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), std(0xc89a6a, 0.7));
  root.position.y = -0.13;
  g.add(t, root);
  return g;
}

function silk() {
  const g = new THREE.Group();
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.36, 12), std(0x1f9a9a, 0.4, 0.1));
  roll.rotation.z = Math.PI / 2;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 12), std(0xd4a640, 0.3, 0.6));
  band.rotation.z = Math.PI / 2;
  g.add(roll, band);
  return g;
}

function glass() {
  const m = new THREE.MeshStandardMaterial({ color: 0x9fe8d8, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.75, emissive: 0x2a6a5a, emissiveIntensity: 0.3 });
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.TetrahedronGeometry(0.08 + i * 0.02), m);
    s.position.set((i - 1) * 0.08, i * 0.02, (i % 2) * 0.05);
    s.rotation.set(i, i * 2, i * 0.5);
    g.add(s);
  }
  return g;
}

function seal() {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 20), std(0xd4a640, 0.3, 0.8));
  disc.rotation.x = Math.PI / 2;
  const sun = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 16), std(0x7a1f12, 0.4, 0.3));
  sun.position.z = 0.02;
  g.add(disc, sun);
  return g;
}

export const DESERT_ITEMS: Record<string, ItemDef> = {
  scrapMetal: mat('scrapMetal', 'Scrap Metal', 'Rusted plate and bolts dug out of the dunes. The scavengers trade it by the sackful.', scrap),
  sharkTooth: mat('sharkTooth', 'Sand Shark Tooth', 'Long as a finger and sharp as a knife. Scavengers wear them for luck; smiths set them in blades.', tooth, 'fine'),
  sunSilk: mat('sunSilk', 'Sun-Silk', 'Teal silk woven in Sunspire\'s palace looms. Worth its weight in Cresha silver.', silk, 'fine'),
  duneGlass: mat('duneGlass', 'Dune Glass', 'Sand fused to green glass where lightning struck the dunes. The glassmakers pay well for it.', glass, 'fine'),
  sunSeal: { id: 'sunSeal', name: 'The Caravan Seal', kind: 'key', rarity: 'rare', desc: 'A gold seal stamped with the Sunwheel of the Sunborn: the lost caravan\'s writ of passage.', stats: {}, build: seal },
};
