import * as THREE from 'three';
import type { ItemDef } from './itemDefs';
import { buildSword } from './weaponModels';

// Finds of Dungeons Reborn (feat/dungeons): the keys of the new dungeons,
// the named gear in each reward room, and Sunwheel rubbings (lore the Royal
// Library's scholars pay for).

const std = (color: number, roughness = 0.6, metalness = 0, emissive = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive });

function key(color: number) {
  return () => {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 6, 14), std(color, 0.4, 0.8));
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.02), std(color, 0.4, 0.8));
    shaft.position.y = -0.16;
    const bit = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.035, 0.02), std(color, 0.4, 0.8));
    bit.position.set(0.035, -0.25, 0);
    g.add(ring, shaft, bit);
    return g;
  };
}

function rubbing() {
  const g = new THREE.Group();
  const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.004, 0.22), std(0xe8dcc0, 0.95));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.006, 4, 20), std(0x2a2420, 0.9));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.004;
  g.add(sheet, ring);
  return g;
}

function signet() {
  const g = new THREE.Group();
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 20), std(0xd4a640, 0.3, 0.9));
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10), std(0x8a2a2a, 0.4, 0.2));
  seal.position.y = 0.055;
  g.add(band, seal);
  return g;
}

function heart() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), std(0x5ae0d8, 0.2, 0.3, 0x2a8a88));
  const cage = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.008, 4, 16), std(0x6a8a7a, 0.4, 0.8));
  g.add(core, cage);
  return g;
}

function bandolier() {
  const g = new THREE.Group();
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 4, 18), std(0x4a3020, 0.9));
  strap.scale.y = 1.4;
  g.add(strap);
  for (let k = 0; k < 5; k++) {
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 4), std(0x5a4028, 0.7));
    bolt.position.set(-0.1 + k * 0.05, 0.12, 0);
    g.add(bolt);
  }
  return g;
}

export const DUNGEON_ITEMS: Record<string, ItemDef> = {
  smugglersKey: { id: 'smugglersKey', name: "Smuggler's Key", kind: 'key', rarity: 'rare', desc: 'A greasy iron key on a cord. It opens the gate in Hollow Ridge Caves.', stats: {}, build: key(0x6a5a4a) },
  tideKey: { id: 'tideKey', name: 'Tide Key', kind: 'key', rarity: 'rare', desc: 'A key of green bronze, crusted with barnacles. It opens the tide gate in the Drowned Shrine.', stats: {}, build: key(0x5a8a7a) },
  dungeonRubbing: {
    id: 'dungeonRubbing', name: 'Sunwheel Rubbing (Fragment)', kind: 'material', rarity: 'rare', stack: true,
    desc: 'Charcoal on paper: part of a wheel of eight rays, taken from a dungeon wall. The Royal Library\'s scholars pay well for these.', stats: {}, build: rubbing,
  },
  oldKingsSignet: {
    id: 'oldKingsSignet', name: "Signet of the Old Kings", kind: 'accessory', slot: 'ring1', rarity: 'epic',
    desc: 'Taken from the hand of a king who was buried before Cresha had a name. The Sunwheel is cut into its seal.', stats: { maxHp: 25, damagePct: 0.06, staminaRegen: 0.1 }, build: signet,
  },
  vessBandolier: {
    id: 'vessBandolier', name: "Vess's Bandolier", kind: 'accessory', slot: 'belt', rarity: 'epic',
    desc: 'Captain Vess\'s bolt belt, worn smooth. Whoever wears it seems to find the gaps in armour.', stats: { maxStamina: 20, damagePct: 0.08 }, build: bandolier,
  },
  smugglersCutlass: {
    id: 'smugglersCutlass', name: "Smuggler's Cutlass", kind: 'sword', slot: 'main', rarity: 'rare',
    desc: 'A short curved blade, quick in a narrow tunnel. Hollow Ridge steel.', stats: { damage: 27, speed: 1.15, crit: 0.1 },
    build: () => buildSword({ bladeLen: 0.64, bladeWidth: 0.034, thickness: 0.004, fullerLen: 0, gripLen: 0.11, guardSpan: 0.11, guardStyle: 'curved', pommel: 'pear', curve: 0.14, guardMat: 'brass', tint: 0xc0b8a8 }),
  },
  tidewardenHeart: {
    id: 'tidewardenHeart', name: "Tide-Warden's Heart", kind: 'accessory', slot: 'amulet', rarity: 'epic',
    desc: 'The sea-glass core of the ancient construct, still cold and still turning. Breathe a while longer underwater.', stats: { maxMana: 25, manaRegen: 0.3, waterBreathing: 40 }, build: heart,
  },
  tideglassBlade: {
    id: 'tideglassBlade', name: 'Tideglass Blade', kind: 'sword', slot: 'main', rarity: 'epic',
    desc: 'Cut by the wheel-cutters from the same glass as the Warden\'s heart. Cold as deep water.', stats: { damage: 31, speed: 1.05, frost: 0.18 },
    build: () => buildSword({ bladeLen: 0.84, bladeWidth: 0.026, thickness: 0.0045, fullerLen: 0.5, gripLen: 0.13, guardSpan: 0.12, guardStyle: 'curved', pommel: 'wheel', tint: 0xa8f0e8, glow: 0x40e0d8, glowStrength: 1.6 }),
  },
};
