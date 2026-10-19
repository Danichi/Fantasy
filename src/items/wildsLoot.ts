import * as THREE from 'three';
import { buildSword, buildRoundShield } from './weaponModels';
import type { ItemDef } from './itemDefs';

// Spoils of the wilds: what the roaming beasts drop (pelts, tusks, horns,
// fetishes, trophies for the merchants), and the unique gear of the five
// hidden woods bosses.

const std = (color: number, roughness = 0.8, metalness = 0, emissive = 0, ei = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive: new THREE.Color(emissive), emissiveIntensity: ei });
const mat = (id: string, name: string, desc: string, build: () => THREE.Object3D, rarity: ItemDef['rarity'] = 'common'): ItemDef =>
  ({ id, name, kind: 'material', rarity, stack: true, desc, stats: {}, build });

function pelt(color: number, light: number) {
  return () => {
    const g = new THREE.Group();
    const hide = new THREE.Mesh(new THREE.CircleGeometry(0.22, 7), std(color, 1));
    hide.scale.set(1, 1.4, 1);
    hide.rotation.x = -Math.PI / 2 + 0.3;
    const belly = new THREE.Mesh(new THREE.CircleGeometry(0.11, 6), std(light, 1));
    belly.rotation.x = -Math.PI / 2 + 0.3;
    belly.position.set(0, 0.01, 0.02);
    g.add(hide, belly);
    for (const s of [-1, 1]) for (const z of [-0.22, 0.22]) {
      const leg = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 4), std(color, 1));
      leg.rotation.z = s * Math.PI / 2;
      leg.position.set(s * 0.2, 0, z);
      g.add(leg);
    }
    return g;
  };
}
function tusk(color = 0xefe6d0, size = 1) {
  return () => {
    const g = new THREE.Group();
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.16 * size, 0.035 * size, 6, 12, Math.PI * 0.7), std(color, 0.5));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035 * size, 0.1 * size, 6), std(color, 0.5));
    tip.position.set(0.16 * size, 0, 0);
    tip.rotation.z = Math.PI;
    g.add(t, tip);
    return g;
  };
}
function horn(color: number) {
  return () => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.42, 8), std(color, 0.55));
    m.rotation.z = 0.6;
    return m;
  };
}
function antler(color: number, glow = 0) {
  return () => {
    const g = new THREE.Group();
    const m = std(color, 0.6, 0, glow, glow ? 0.8 : 0);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.5, 5), m);
    beam.rotation.z = 0.3;
    g.add(beam);
    for (let k = 0; k < 3; k++) {
      const tine = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.18, 4), m);
      tine.position.set(0.04 + k * 0.03, -0.05 + k * 0.12, 0);
      tine.rotation.z = -0.6;
      g.add(tine);
    }
    return g;
  };
}
function fetish() {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.36, 5), std(0x5a3a22, 1));
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.06, 7, 5), std(0xe8e0c8, 0.7));
  skull.position.y = 0.2;
  const feather = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.16), new THREE.MeshStandardMaterial({ color: 0x9a2a1a, side: THREE.DoubleSide }));
  feather.position.set(0.05, 0.08, 0);
  feather.rotation.z = -0.5;
  g.add(stick, skull, feather);
  return g;
}
function essence() {
  return new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), new THREE.MeshStandardMaterial({ color: 0xdff4ff, emissive: new THREE.Color(0x6ab8ff), emissiveIntensity: 1.2, transparent: true, opacity: 0.85 }));
}
function trophy() {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 8), std(0x6a4426, 0.8));
  plate.rotation.x = Math.PI / 2;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), std(0xe8e0c8, 0.6));
  skull.position.z = 0.05;
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.03, 0), std(0xff4020, 0.2, 0.2, 0xff2010, 1));
  gem.position.set(0, 0.03, 0.12);
  g.add(plate, skull, gem);
  return g;
}
function splinter() {
  const g = new THREE.Group();
  const wood = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.4, 5), std(0x6a4a2a, 0.9, 0, 0x3a8a1a, 0.35));
  wood.rotation.z = 0.4;
  g.add(wood);
  return g;
}
function hornTrinket() {
  const g = new THREE.Group();
  const h = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 10, 1, true), std(0xd8c8a0, 0.5));
  h.rotation.z = Math.PI / 2 - 0.3;
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 5, 12), std(0x7a1a12, 0.8));
  band.rotation.y = Math.PI / 2;
  band.position.x = 0.08;
  g.add(h, band);
  return g;
}
function heart() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), std(0x6a4a2a, 0.8, 0, 0x6aff4a, 0.9));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 5, 14), std(0xc9a25a, 0.35, 0.8));
  g.add(core, ring);
  return g;
}

export const WILDS_ITEMS: Record<string, ItemDef> = {
  // ---- what the roaming beasts drop ----
  wolfPelt: mat('wolfPelt', 'Wolf Pelt', 'A grey pelt, thick in the winter coat. Tanners and furriers on both roads pay for them.', pelt(0x5a5652, 0xb8b4ac)),
  direFang: mat('direFang', 'Dire Wolf Fang', 'A fang as long as a dagger. Hunters string them; smiths set them in pommels for luck.', tusk(0xf0e8d4, 0.7), 'fine'),
  boarTusk: mat('boarTusk', 'Boar Tusk', 'A curved, yellowed tusk. Alchemists grind them; the Kingsmile hangs them over the bar.', tusk()),
  boarHide: mat('boarHide', 'Bristled Hide', 'Tough, bristled hide. Makes good jerkins and better bootsoles.', pelt(0x4a3424, 0x6a5040)),
  aurochsHorn: mat('aurochsHorn', 'Aurochs Horn', 'A great black-tipped horn from a Thornback aurochs. Drinking-horn makers in the capital pay well.', horn(0xd8ccb0), 'fine'),
  stagAntler: mat('stagAntler', 'Stag Antler', 'A branching antler. Carvers want it for knife handles; hedge-witches want it for other things.', antler(0xe0d0b0), 'fine'),
  goblinFetish: mat('goblinFetish', 'Goblin Fetish', 'A stick, a bird skull and a red feather, tied with hair. It smells. Collectors buy them anyway.', fetish),
  orcTusk: mat('orcTusk', 'Orc Tusk', 'A tusk knocked from an orc marauder’s jaw. The Crown pays a bounty on each one.', tusk(0xd8d0b4, 0.8), 'fine'),
  wispEssence: mat('wispEssence', 'Wisp Essence', 'A shard of cold blue light that was once a hound. It never stops glowing. Mages pay handsomely.', essence, 'rare'),
  championTrophy: mat('championTrophy', 'Champion’s Trophy', 'Proof that you killed one of the wilds’ champions: an elite beast of its kind. Collectors and guild halls pay a fortune.', trophy, 'rare'),
  heartwoodSplinter: mat('heartwoodSplinter', 'Heartwood Splinter', 'A splinter of living wood, green-veined and faintly warm. It sprouts if you plant it.', splinter, 'fine'),

  // ---- Old Bristleback ----
  bristlebackTusk: {
    id: 'bristlebackTusk', name: 'Bristleback’s Tusk', kind: 'accessory', slot: 'trinket', rarity: 'epic',
    desc: 'The great curved tusk of Old Bristleback, on a thong of hide. You plant your feet like a boar that has never been knocked over.',
    stats: { poise: 18, maxHp: 30, maxStamina: 10 }, build: tusk(0xe8dcc0, 1.4),
  },
  tuskCleaver: {
    id: 'tuskCleaver', name: 'Tusk Cleaver', kind: 'sword', slot: 'main', rarity: 'rare',
    desc: 'A broad chopping blade with a hilt of boar tusk. Heavy at the tip; whatever it hits goes over.',
    stats: { damage: 30, speed: 0.92, stagger: 1.45, poise: 5 }, build: () => buildSword({ bladeLen: 0.7, bladeWidth: 0.042, thickness: 0.0055, fullerLen: 0, gripLen: 0.14, guardSpan: 0.09, guardStyle: 'curved', pommel: 'wheel', tint: 0xa8a092 }),
  },
  // ---- Old Gnarlbark ----
  heartwoodShield: {
    id: 'heartwoodShield', name: 'Heartwood Shield', kind: 'shield', slot: 'off', rarity: 'epic',
    desc: 'A round shield cut from the Rootwarden’s own heartwood. It is still alive: it closes its own cuts, and steadies whoever bears it.',
    stats: { block: 105, stability: 0.68, maxHp: 25 }, build: () => buildRoundShield('plain', ['#4a3a1e', '#5a7a2a']),
  },
  rootwardenHeart: {
    id: 'rootwardenHeart', name: 'Rootwarden’s Heart', kind: 'accessory', slot: 'amulet', rarity: 'epic',
    desc: 'A knot of green-veined heartwood in a brass ring. It beats, very slowly. Mana wells up in you like sap.',
    stats: { manaRegen: 0.45, maxMana: 25, maxHp: 15 }, build: heart,
  },
  // ---- Greymane, the Wolf-Mother ----
  greymanePelt: {
    id: 'greymanePelt', name: 'Greymane’s Pelt', kind: 'armor', slot: 'cloak', rarity: 'epic',
    desc: 'The silver pelt of the Wolf-Mother, worn as a cloak. Wolves give you a wide berth; you never seem to tire.',
    stats: { armor: 4, maxStamina: 25, staminaRegen: 0.2 }, armor: 'cloak',
  },
  wolfMotherFang: {
    id: 'wolfMotherFang', name: 'Wolf-Mother’s Fang', kind: 'sword', slot: 'main', rarity: 'epic',
    desc: 'A curved blade of bone-white tooth on a black hilt. Quick as a wolf, and it finds the throat.',
    stats: { damage: 30, speed: 1.18, crit: 0.16, lifesteal: 0.06 }, build: () => buildSword({ bladeLen: 0.78, bladeWidth: 0.026, thickness: 0.0045, fullerLen: 0, gripLen: 0.13, guardSpan: 0.08, guardStyle: 'curved', pommel: 'pear', curve: 0.1, tint: 0xf2ead8, glow: 0xbfe8ff, glowStrength: 0.7 }),
  },
  // ---- Thornhorn, the Antlered King ----
  antlerCrown: {
    id: 'antlerCrown', name: 'Crown of the Antlered King', kind: 'armor', slot: 'head', rarity: 'epic',
    desc: 'Thornhorn’s crown, a helm of pale antler and old silver. The deep wood’s cold light runs through it.',
    stats: { armor: 5, poise: 10, maxMana: 25, manaRegen: 0.25 }, armor: 'helm', build: antler(0xe8dcc0, 0x9fe0ff),
  },
  moonantlerBlade: {
    id: 'moonantlerBlade', name: 'Moonantler Blade', kind: 'sword', slot: 'main', rarity: 'epic',
    desc: 'A long blade grown, not forged, from the Antlered King’s great tine. Cold to the touch; what it cuts goes still.',
    stats: { damage: 34, speed: 1.02, frost: 0.18, crit: 0.08 }, build: () => buildSword({ bladeLen: 0.96, bladeWidth: 0.024, thickness: 0.005, fullerLen: 0.5, gripLen: 0.17, guardSpan: 0.14, guardStyle: 'curved', pommel: 'pear', tint: 0xe8f0f4, glow: 0x9fe0ff, glowStrength: 1.6 }),
  },
  // ---- Ulgra Skullsplitter ----
  skullsplitter: {
    id: 'skullsplitter', name: 'Skullsplitter', kind: 'sword', slot: 'main', rarity: 'epic',
    desc: 'Ulgra’s cleaver, notched by a hundred skulls and cut down to human length. Slow; and nothing gets up after it.',
    stats: { damage: 39, speed: 0.84, stagger: 1.6, poise: 8, crit: 0.06 }, build: () => buildSword({ bladeLen: 0.86, bladeWidth: 0.05, thickness: 0.006, fullerLen: 0, gripLen: 0.22, guardSpan: 0.1, guardStyle: 'straight', pommel: 'wheel', tint: 0x6a645c, glow: 0xff3a1a, glowStrength: 0.6 }),
  },
  ulgraWarHorn: {
    id: 'ulgraWarHorn', name: 'Ulgra’s War-Horn', kind: 'accessory', slot: 'trinket', rarity: 'epic',
    desc: 'A horn bound in red leather that once called the blood-sworn. Carrying it, your blood runs hot: your blows land harder and your breath comes back fast.',
    stats: { damagePct: 0.1, staminaRegen: 0.2 }, build: hornTrinket,
  },
};
