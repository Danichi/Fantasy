import * as THREE from 'three';
import type { ItemDef } from './itemDefs';

// Farm produce, seeds and raw materials (World Expansion phase 3): what the
// fields, orchards, livestock and the old quarry yield. Each has a small
// painted model so the inventory icon reads at a glance.

const std = (color: number, rough = 0.8, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
};
const group = (...o: THREE.Object3D[]) => {
  const g = new THREE.Group();
  g.add(...o);
  return g;
};

function apple(color = 0xc9302a, pear = false) {
  const body = new THREE.SphereGeometry(0.1, 16, 12);
  if (pear) {
    const p = body.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const s = y > 0 ? 1 - y * 3.2 : 1;
      p.setXYZ(i, p.getX(i) * s, y * 1.35, p.getZ(i) * s);
    }
    body.computeVertexNormals();
  }
  const leaf = new THREE.SphereGeometry(0.04, 8, 4).scale(1.6, 0.25, 0.8);
  return group(
    mesh(body, std(color, 0.45)),
    mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.06), std(0x5a3a22), 0, pear ? 0.15 : 0.11, 0),
    mesh(leaf, std(0x4f8f36), 0.035, pear ? 0.15 : 0.115, 0),
  );
}

function sheaf() {
  const g = new THREE.Group();
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2, r = 0.02 + (k % 3) * 0.012;
    const stalk = mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.42), std(0xd9b660), Math.cos(a) * r, 0, Math.sin(a) * r);
    stalk.rotation.z = Math.cos(a) * 0.18;
    stalk.rotation.x = Math.sin(a) * 0.18;
    const ear = mesh(new THREE.CylinderGeometry(0.012, 0.006, 0.09, 5), std(0xe6c56a), Math.cos(a) * r * 2.4, 0.24, Math.sin(a) * r * 2.4);
    g.add(stalk, ear);
  }
  g.add(mesh(new THREE.TorusGeometry(0.035, 0.008, 5, 12).rotateX(Math.PI / 2), std(0x8a5a2a), 0, -0.02, 0));
  return g;
}

function carrot() {
  const root = mesh(new THREE.ConeGeometry(0.04, 0.26, 10).rotateX(Math.PI), std(0xe8792a, 0.6));
  const g = group(root);
  for (let k = 0; k < 4; k++) {
    const leaf = mesh(new THREE.ConeGeometry(0.012, 0.14, 4), std(0x5a9a3a), (k - 1.5) * 0.01, 0.19, 0);
    leaf.rotation.z = (k - 1.5) * 0.3;
    g.add(leaf);
  }
  g.rotation.z = -0.6;
  return g;
}

function cabbage() {
  const g = group(mesh(new THREE.SphereGeometry(0.1, 14, 10), std(0x8fbf5a, 0.7)));
  for (let k = 0; k < 6; k++) {
    const leaf = mesh(new THREE.SphereGeometry(0.11, 10, 6, 0, Math.PI), std(0x6fa848, 0.7, { side: THREE.DoubleSide }), 0, 0, 0);
    leaf.rotation.set(0.5, (k / 6) * Math.PI * 2, 0);
    g.add(leaf);
  }
  return g;
}

function pumpkin() {
  const geo = new THREE.SphereGeometry(0.14, 20, 12);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const rib = 1 - 0.08 * Math.abs(Math.sin(Math.atan2(z, x) * 5));
    p.setXYZ(i, x * rib, y * 0.72, z * rib);
  }
  geo.computeVertexNormals();
  return group(mesh(geo, std(0xe0802a, 0.6)), mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.06), std(0x5d6b2a), 0, 0.11, 0));
}

function egg() {
  const g = new THREE.SphereGeometry(0.06, 14, 10).scale(1, 1.3, 1);
  return group(mesh(g, std(0xf0e2c8, 0.5)), mesh(new THREE.SphereGeometry(0.06, 14, 10).scale(1, 1.3, 1), std(0xe8cfa6, 0.5), 0.1, -0.02, -0.03));
}

function milk() {
  const jug = new THREE.LatheGeometry([0, 0.07, 0.085, 0.08, 0.05, 0.045, 0.055].map((r, k) => new THREE.Vector2(r, k * 0.04)), 16);
  return group(
    mesh(jug, std(0xc9a070, 0.6)),
    mesh(new THREE.CircleGeometry(0.044, 16).rotateX(-Math.PI / 2), std(0xfaf6ee, 0.3), 0, 0.235, 0),
    mesh(new THREE.TorusGeometry(0.04, 0.009, 6, 12, Math.PI), std(0xc9a070, 0.6), 0.07, 0.14, 0),
  );
}

function wool() {
  const g = new THREE.Group();
  for (let k = 0; k < 7; k++) g.add(mesh(new THREE.IcosahedronGeometry(0.06, 1), std(0xf2ede0, 1), Math.cos(k) * 0.06, Math.sin(k * 2.1) * 0.04, Math.sin(k) * 0.05));
  return g;
}

function ore() {
  const rock = new THREE.IcosahedronGeometry(0.12, 0);
  const p = rock.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.85 + (i % 5) * 0.06), p.getY(i) * 0.8, p.getZ(i));
  rock.computeVertexNormals();
  const g = group(mesh(rock, std(0x6d6660, 0.9, { flatShading: true })));
  for (let k = 0; k < 5; k++) g.add(mesh(new THREE.IcosahedronGeometry(0.03, 0), std(0xb4683e, 0.4, { metalness: 0.6 }), Math.cos(k * 1.3) * 0.08, Math.sin(k * 2.2) * 0.06, 0.07));
  return g;
}

function seeds(color: number) {
  const pouch = new THREE.SphereGeometry(0.1, 12, 10).scale(1, 1.1, 1);
  const g = group(mesh(pouch, std(0xb89a6a, 0.95)), mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.05, 10), std(0xb89a6a, 0.95), 0, 0.11, 0));
  g.add(mesh(new THREE.TorusGeometry(0.035, 0.008, 5, 12).rotateX(Math.PI / 2), std(0x7a4a2a), 0, 0.1, 0));
  for (let k = 0; k < 5; k++) g.add(mesh(new THREE.SphereGeometry(0.014, 6, 4).scale(1, 0.6, 1.4), std(color, 0.6), (k - 2) * 0.03, -0.1, 0.09));
  return g;
}

function bunting() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.5).rotateZ(Math.PI / 2), std(0x8a6a4a)));
  const cols = [0xb8402e, 0xf1e6cc, 0x2f5f9a, 0xe0b040, 0x3d7a45];
  for (let k = 0; k < 5; k++) g.add(mesh(new THREE.ConeGeometry(0.045, 0.1, 3).rotateX(Math.PI), std(cols[k], 0.9), -0.2 + k * 0.1, -0.055, 0));
  return g;
}

function rubbing() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e9dcbc'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#4a3a2a'; g.lineWidth = 4;
  g.beginPath(); g.arc(64, 64, 26, 0, Math.PI * 2); g.stroke();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    g.beginPath(); g.moveTo(64 + Math.cos(a) * 32, 64 + Math.sin(a) * 32); g.lineTo(64 + Math.cos(a + 0.3) * 50, 64 + Math.sin(a + 0.3) * 50); g.stroke();
  }
  g.beginPath(); g.arc(64, 64, 8, 0, Math.PI * 2); g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sheet = mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, side: THREE.DoubleSide }));
  const roll = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32).rotateZ(Math.PI / 2), std(0xd8c8a0), 0, -0.16, 0.01);
  return group(sheet, roll);
}

function plank() {
  return group(mesh(new THREE.BoxGeometry(0.5, 0.05, 0.12), std(0xa77a4a, 0.85), 0, 0, 0), mesh(new THREE.BoxGeometry(0.5, 0.05, 0.12), std(0x9a6d40, 0.85), 0.03, 0.055, 0.02));
}

const mat = (id: string, name: string, desc: string, build: () => THREE.Object3D, rarity: ItemDef['rarity'] = 'common'): ItemDef =>
  ({ id, name, kind: 'material', rarity, stack: true, desc, stats: {}, build });
const food = (id: string, name: string, desc: string, stats: ItemDef['stats'], build: () => THREE.Object3D): ItemDef =>
  ({ id, name, kind: 'consumable', rarity: 'common', stack: true, desc, stats, build });

export const PRODUCE_ITEMS: Record<string, ItemDef> = {
  wheat: mat('wheat', 'Wheat Sheaf', 'Golden Elder Glen wheat. The millers and bakers always want more.', sheaf),
  carrot: food('carrot', 'Carrot', 'Sweet and crunchy. Restores a little health.', { heal: 8 }, carrot),
  cabbage: mat('cabbage', 'Cabbage', 'A dense green head. A cook can do a lot with it.', cabbage),
  pumpkin: mat('pumpkin', 'Pumpkin', 'A fat orange pumpkin. Festival pies need a lot of these.', pumpkin),
  apple: food('apple', 'Apple', 'A crisp orchard apple. Restores health.', { heal: 12 }, () => apple()),
  pear: food('pear', 'Pear', 'A ripe yellow pear. Restores health and stamina.', { heal: 12, restoreStamina: 12 }, () => apple(0xd8c64a, true)),
  milk: food('milk', 'Fresh Milk', 'Still warm from the pasture. Restores stamina and a little health.', { restoreStamina: 40, heal: 8 }, milk),
  egg: mat('egg', 'Egg', 'A brown hen\'s egg, collected from the coop.', egg),
  wool: mat('wool', 'Raw Wool', 'Shorn from Elder Glen sheep. Tailors spin it into cloth.', wool),
  ironOre: mat('ironOre', 'Iron Ore', 'Rust-streaked rock from the old quarry. A smith can smelt it.', ore),
  planks: mat('planks', 'Oak Planks', 'Sawn and seasoned oak from the carpenter.', plank),
  wheatSeed: mat('wheatSeed', 'Wheat Seed', 'Plant in a tilled bed. Grows in about half a day.', () => seeds(0xd9b660)),
  carrotSeed: mat('carrotSeed', 'Carrot Seed', 'Plant in a tilled bed. Grows in about a third of a day.', () => seeds(0xe8792a)),
  cabbageSeed: mat('cabbageSeed', 'Cabbage Seed', 'Plant in a tilled bed. Grows in about half a day.', () => seeds(0x8fbf5a)),
  pumpkinSeed: mat('pumpkinSeed', 'Pumpkin Seed', 'Plant in a tilled bed. Slow, but pumpkins sell well.', () => seeds(0xf2e2b0)),
  bunting: mat('bunting', 'Festival Bunting', 'Bright flags for the harvest festival.', bunting),
  glyphRubbing: { id: 'glyphRubbing', name: 'Sunwheel Rubbing', kind: 'key', rarity: 'rare', desc: 'Charcoal on paper: a wheel of eight rays, taken from the crypt door. Older than Cresha.', stats: {}, build: rubbing },
};

/** Growth time in game hours, and what a harvest yields. */
export const CROPS: Record<string, { seed: string; crop: string; hours: number; yield: [number, number]; color: number }> = {
  wheat: { seed: 'wheatSeed', crop: 'wheat', hours: 12, yield: [3, 5], color: 0xd9b660 },
  carrot: { seed: 'carrotSeed', crop: 'carrot', hours: 8, yield: [3, 6], color: 0xe8792a },
  cabbage: { seed: 'cabbageSeed', crop: 'cabbage', hours: 12, yield: [1, 2], color: 0x8fbf5a },
  pumpkin: { seed: 'pumpkinSeed', crop: 'pumpkin', hours: 20, yield: [1, 3], color: 0xe0802a },
};
