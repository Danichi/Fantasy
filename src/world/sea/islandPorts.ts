import * as THREE from 'three';
import { buildHouse, worldUV, type WorldMats } from '../buildings';
import { heightAt } from '../terrainHeight';
import { physics } from '../../physics/physics';
import { mulberry32 } from '../../core/math';
import { StaticBatch } from '../cityKit';
import { SEA_LEVEL } from '../worldMap';
import { ISLAND_PORTS, padCentre, PAD_R, type IslandPortDef, type PortStyle } from './islandPortsData';
import type { NpcRecord, Place, Settlement, ScheduleEntry } from '../../npc/npcManager';
import type { Look } from '../../npc/charBuilder';

// The island harbours (docs/design/boating.md §11): a level pad by the shore
// with a handful of houses in the island's own style, a harbourmaster's hall,
// market stalls, a pier on posts running out to deep water where ships berth,
// and a lighthouse to relight. Each has a harbourmaster (berths, contracts)
// and a trader (the island's goods), and a few townsfolk going about the day.

export interface IslandPort {
  def: IslandPortDef;
  /** docking zone (the pier head) and berths [x, z, yaw] */
  zone: THREE.Vector3;
  berths: [number, number, number][];
  /** where you step ashore */
  landing: THREE.Vector3;
  /** the lighthouse lamp (lit by the player) */
  lighthouse: { pos: THREE.Vector3; lamp: THREE.MeshStandardMaterial; glow: THREE.Sprite };
  /** the harbourmaster's and trader's NPC ids */
  harbourmaster: string;
  trader: string;
}

const STYLE: Record<PortStyle, { roof: 'slate' | 'thatch' | 'tile'; wood: number; flag: number; floors: (1 | 2)[] }> = {
  azure: { roof: 'tile', wood: 0xd8c8a8, flag: 0x2aa0c8, floors: [1, 2, 1, 1] },
  emerald: { roof: 'thatch', wood: 0x6a4a2a, flag: 0x3a8a4a, floors: [1, 1, 2, 1] },
  pirate: { roof: 'slate', wood: 0x3a2e26, flag: 0x141416, floors: [1, 2, 1, 1] },
  sunken: { roof: 'slate', wood: 0x5a5a5a, flag: 0x2a7a8a, floors: [1, 1, 1, 2] },
  demon: { roof: 'slate', wood: 0x2a1a1a, flag: 0xa02020, floors: [2, 1, 2, 1] },
};

const FOLK: Record<string, { hm: [string, string, Look]; tr: [string, string, Look]; folk: Look[]; lines: { hm: string[]; tr: string[]; folk: string[] } }> = {
  azureHaven: {
    hm: ['Harbourmistress Sela Marin', 'Harbourmistress of Azure Haven · Berths and Contracts', { body: 'female', outfit: 'peasant', hair: 'long', hairColor: 0x1f1a17, skin: 0x8a5a3a, linen: 0xe8e0c8, cloth: 0x2aa0c8, height: 1.7 }],
    tr: ['Tamsin Reyhal', 'Spice Merchant · Spices, Sugar, Mother-of-pearl', { body: 'male', outfit: 'peasant', hair: 'buzzed', beard: true, hairColor: 0x2a1a12, skin: 0x7a4a2a, linen: 0xf0e8d8, cloth: 0xc87a2a, height: 1.8 }],
    folk: [{ body: 'female', outfit: 'peasant', hair: 'buns', skin: 0xa8744e, linen: 0xf0e0c0, cloth: 0x2aa0c8 }, { body: 'male', outfit: 'peasant', hair: 'simpleparted', skin: 0x8a5a3a, linen: 0xe8e0d0, cloth: 0xd8a03a }],
    lines: { hm: ['Turquoise water, white sand, and a harbour fee. Welcome to Azure Haven.', 'The reef is lovely from above and murder from below. Keep to the channel.'], tr: ['Pepper, clove and cinnamon from the high isles. Port Aurelle pays three times what I ask.', 'Pearls? The divers bring me mother-of-pearl by the sack.'], folk: ['The sea\'s kind here. Mostly.', 'The spice ships went out yesterday.'] },
  },
  emeraldCove: {
    hm: ['Harbourmaster Oren Ashgrove', 'Harbourmaster of Emerald Cove · Berths and Contracts', { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x8a6a3a, skin: 0xe0b894, cloth: 0x3a8a4a, height: 1.86 }],
    tr: ['Willa Fernback', 'Timber and Dyes · The Cove Exchange', { body: 'female', outfit: 'ranger', hood: false, hair: 'buns', hairColor: 0x8a3f22, skin: 0xfff0e6, cloth: 0x4a6a2a, height: 1.68 }],
    folk: [{ body: 'male', outfit: 'ranger', hair: 'simpleparted', skin: 0xe0b894, cloth: 0x4a6a2a }, { body: 'female', outfit: 'peasant', hair: 'long', skin: 0xf0d0b0, linen: 0xe8e0c8, cloth: 0x3a8a4a }],
    lines: { hm: ['Mind the timber rafts in the bay. They don\'t steer.', 'Emerald Cove: the best oak in the world, and the worst weather in the evenings.'], tr: ['Island oak, indigo and madder, healing herbs from the hills. All cheap, here.', 'Bring me ironware and I\'ll make you rich.'], folk: ['Rain by dusk, mark me.', 'The hills are full of herbs, if you know where to look.'] },
  },
  wreckersRest: {
    hm: ['Old Mother Gullet', 'Boss of Wrecker\'s Rest · Berths, and No Questions', { body: 'female', outfit: 'ranger', hood: true, hair: 'long', hairColor: 0xb8b4ae, skin: 0xe0b894, cloth: 0x2a2a30, height: 1.62 }],
    tr: ['Silk Jory', 'Fence · Plunder Bought and Sold', { body: 'male', outfit: 'ranger', hood: true, hair: 'buzzed', beard: true, hairColor: 0x1f1a17, skin: 0xa8744e, cloth: 0x6a1a1a, height: 1.78 }],
    folk: [{ body: 'male', outfit: 'peasant', hair: 'buzzed', beard: true, skin: 0xa8744e, linen: 0x5a2a2a, cloth: 0x2a2a30 }, { body: 'female', outfit: 'ranger', hood: true, hair: 'long', skin: 0xfff0e6, cloth: 0x6a1a1a }],
    lines: { hm: ['You\'re no Crown man, are you? No. You haven\'t the stink of it.', 'Berth\'s yours. Trouble isn\'t. Keep your blades sheathed in my harbour.'], tr: ['Plunder, rum, the odd bolt of silk off a "wreck". All honest. Ish.', 'The customs cutter can\'t touch what it can\'t find. Ask Barrow about a smuggler\'s hold.'], folk: ['Who\'re you looking at?', 'The Black Tide drinks here. Mind yourself.'] },
  },
  sunkenSpire: {
    hm: ['Warden Ysmay Coral', 'Warden of Sunken Spire · Berths and Contracts', { body: 'female', outfit: 'ranger', hood: false, hair: 'buns', hairColor: 0x2a1a12, skin: 0x8a5a3a, cloth: 0x2a7a8a, height: 1.72 }],
    tr: ['Scholar Aldous Penhallow', 'Antiquarian · Drowned Relics', { body: 'male', outfit: 'peasant', hair: 'simpleparted', beard: true, hairColor: 0xb8b4ae, skin: 0xe0b894, linen: 0xd8d0c0, cloth: 0x2a5a7a, height: 1.76 }],
    folk: [{ body: 'male', outfit: 'ranger', hair: 'buzzed', skin: 0x8a5a3a, cloth: 0x2a7a8a }, { body: 'female', outfit: 'ranger', hair: 'long', skin: 0xe0b894, cloth: 0x2a5a7a }],
    lines: { hm: ['The ruins go down further than any diver has. The carvings are the same as the ones in Elder Glen\'s crypt.', 'Dive the shallows, but mind the deep water. Something lives there.'], tr: ['Every relic the divers bring up is older than Cresha. Older than the elves, maybe.', 'The Sunwheel again. It\'s everywhere down there.'], folk: ['I held my breath for three minutes yesterday. A record!', 'There are lights in the water at night. Nobody knows why.'] },
  },
  ashenPort: {
    hm: ['Portwarden Vashka Emberhorn', 'Portwarden of Ashen Port · Berths and Contracts', { body: 'female', outfit: 'ranger', hood: false, hair: 'long', hairColor: 0x1a0a0a, skin: 0xb05040, cloth: 0xa02020, height: 1.9 }],
    tr: ['Merchant Ozrel', 'The Ash Market · Demon-glass and Ash Silk', { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x1a0a0a, skin: 0x9a3a32, cloth: 0x5a1a1a, height: 1.95 }],
    folk: [{ body: 'male', outfit: 'ranger', hair: 'buzzed', skin: 0xa04038, cloth: 0x5a1a1a }, { body: 'female', outfit: 'ranger', hair: 'buns', skin: 0xb05040, cloth: 0xa02020 }],
    lines: { hm: ['A human ship. You crossed the Abyss Run in that? Then you\'ve earned your berth.', 'Ashen Port trades with anyone who can reach it. Few can.'], tr: ['Demon-glass: harder than steel, and your Crown hangs men for carrying it. The price reflects that.', 'Ash silk. Woven from the cocoons of the fire moths. Feel it.'], folk: ['You\'re a long way from home, little human.', 'The mountain grumbles today.'] },
  },
};

let glowTex: THREE.Texture | null = null;
/** A soft round glow (shared). */
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,240,200,0.6)');
  grad.addColorStop(1, 'rgba(255,220,150,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

/** Build every island harbour. */
export function buildIslandPorts(scene: THREE.Scene, m: WorldMats) {
  const ports: IslandPort[] = [];
  const clearings: [number, number, number][] = [];
  const records: NpcRecord[] = [];
  const settlements: Settlement[] = [];
  for (const def of ISLAND_PORTS) {
    const built = buildOne(scene, m, def);
    ports.push(built.port);
    clearings.push(...built.clearings);
    records.push(...built.records);
    settlements.push(built.settlement);
  }
  return { ports, clearings, records, settlements };
}

function buildOne(scene: THREE.Scene, m: WorldMats, def: IslandPortDef) {
  const rnd = mulberry32(def.land[0] * 7 + def.land[1]);
  const batch = new StaticBatch();
  const st = STYLE[def.style];
  const f = new THREE.Vector2(Math.cos(def.dir), Math.sin(def.dir)); // out to sea
  const s = new THREE.Vector2(-f.y, f.x); // along the shore
  const [lx, lz] = def.land;
  /** A point in the port's frame: `a` metres seaward of the shore point, `b` along the shore. */
  const at = (a: number, b: number) => new THREE.Vector2(lx + f.x * a + s.x * b, lz + f.y * a + s.y * b);
  const yawOut = Math.atan2(f.x, f.y);
  const wood = new THREE.MeshStandardMaterial({ color: st.wood, roughness: 0.85 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.9 });
  const add = (g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0, rx = 0) => {
    const mesh = new THREE.Mesh(worldUV(g, 1.5), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, 0, 'YXZ');
    batch.addObject(mesh);
    return mesh;
  };
  const [cx, cz] = padCentre(def);
  const clearings: [number, number, number][] = [[cx, cz, PAD_R + 10]];

  // ---- houses round a little square, the harbourmaster's hall at the back ----
  const plaza = at(-10, 0);
  const homeSpots: THREE.Vector3[] = [];
  const houseAt = (a: number, b: number, spec: { w: number; d: number; floors: 1 | 2 }, face: THREE.Vector2) => {
    const p = at(a, b);
    const rot = Math.atan2(face.x - p.x, face.y - p.y);
    const { group, half } = buildHouse({ ...spec, roof: st.roof, seed: Math.floor(rnd() * 1e5) }, m);
    const gy = heightAt(p.x, p.y);
    group.position.set(p.x, gy, p.y);
    group.rotation.y = rot;
    batch.addObject(group);
    physics.addBox(new THREE.Vector3(p.x, gy + half.y, p.y), half, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)));
    const door = new THREE.Vector3(p.x + Math.sin(rot) * (half.z + 1.5), gy, p.y + Math.cos(rot) * (half.z + 1.5));
    homeSpots.push(door);
    return { p, rot, gy, half };
  };
  const hall = houseAt(-30, 0, { w: 11, d: 8, floors: 2 }, plaza);
  houseAt(-22, -18, { w: 7, d: 6, floors: st.floors[0] }, plaza);
  houseAt(-22, 18, { w: 7, d: 6, floors: st.floors[1] }, plaza);
  houseAt(-4, -24, { w: 6, d: 6, floors: st.floors[2] }, plaza);
  houseAt(-4, 24, { w: 6, d: 6, floors: st.floors[3] }, plaza);

  // Market stalls with awnings, crates and barrels.
  const awning = new THREE.MeshStandardMaterial({ color: st.flag, roughness: 0.8, side: THREE.DoubleSide });
  for (const b of [-7, 7]) {
    const p = at(-8, b);
    const y = heightAt(p.x, p.y);
    add(new THREE.BoxGeometry(3, 1, 1.4), wood, p.x, y + 0.5, p.y, yawOut);
    for (const k of [-1, 1]) add(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5), darkWood, p.x + s.x * k * 1.4, y + 1.3, p.y + s.y * k * 1.4);
    add(new THREE.BoxGeometry(3.4, 0.08, 2), awning, p.x, y + 2.6, p.y, yawOut, -0.15);
    physics.addBox(new THREE.Vector3(p.x, y + 0.5, p.y), new THREE.Vector3(1.5, 0.5, 0.7), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yawOut, 0)));
  }
  for (let k = 0; k < 7; k++) {
    const p = at(-2 - rnd() * 18, (rnd() - 0.5) * 30);
    const y = heightAt(p.x, p.y);
    if (rnd() < 0.5) add(new THREE.BoxGeometry(0.9, 0.9, 0.9), wood, p.x, y + 0.45, p.y, rnd() * 3);
    else add(new THREE.CylinderGeometry(0.4, 0.45, 1, 10), darkWood, p.x, y + 0.5, p.y);
  }

  // ---- the pier: a ramp down from the square, then out on posts to deep water ----
  const deckY = SEA_LEVEL + 1.7;
  const f0 = 16, f1 = def.shore + 44, ramp = 12;
  const padY = heightAt(at(f0, 0).x, at(f0, 0).y);
  const plank = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.9 });
  // Ramp.
  {
    const a = at(f0 + ramp / 2, 0);
    const y = (padY + deckY) / 2;
    const slope = Math.atan2(padY - deckY, ramp);
    const len = Math.hypot(ramp, padY - deckY);
    add(new THREE.BoxGeometry(4.2, 0.3, len), plank, a.x, y, a.y, yawOut, slope);
    physics.addBox(new THREE.Vector3(a.x, y - 0.1, a.y), new THREE.Vector3(2.1, 0.2, len / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(slope, yawOut, 0, 'YXZ')));
  }
  // Deck, posts, rails, bollards.
  const deckLen = f1 - (f0 + ramp);
  const mid = at(f0 + ramp + deckLen / 2, 0);
  add(new THREE.BoxGeometry(4.2, 0.3, deckLen), plank, mid.x, deckY, mid.y, yawOut);
  physics.addBox(new THREE.Vector3(mid.x, deckY - 0.1, mid.y), new THREE.Vector3(2.1, 0.2, deckLen / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yawOut, 0)));
  // A T-head for the berths.
  const head = at(f1 - 2, 0);
  add(new THREE.BoxGeometry(20, 0.3, 4), plank, head.x, deckY, head.y, yawOut);
  physics.addBox(new THREE.Vector3(head.x, deckY - 0.1, head.y), new THREE.Vector3(10, 0.2, 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yawOut, 0)));
  for (let a = f0 + ramp; a <= f1; a += 4) {
    for (const b of [-1.9, 1.9]) {
      const p = at(a, b);
      const ground = heightAt(p.x, p.y);
      const h = deckY - Math.min(ground, deckY - 0.5) + 0.5;
      add(new THREE.CylinderGeometry(0.16, 0.2, h, 6), darkWood, p.x, deckY - h / 2, p.y);
    }
  }
  for (const b of [-9, -5, 5, 9]) {
    const p = at(f1 - 2, b);
    add(new THREE.CylinderGeometry(0.22, 0.26, 0.7, 8), darkWood, p.x, deckY + 0.4, p.y);
  }

  // ---- the lighthouse on the shoulder of the bay (dark until relit) ----
  const lh = at(def.shore - 4, -26);
  const lhY = heightAt(lh.x, lh.y) - 0.4;
  const stoneM = (m.bridgeStone ?? m.stone) as THREE.Material;
  add(new THREE.CylinderGeometry(2.2, 2.8, 14, 14), def.style === 'demon' ? darkWood : stoneM, lh.x, lhY + 7, lh.y);
  for (let k = 0; k < 3; k++) add(new THREE.TorusGeometry(2.35 - k * 0.15, 0.12, 6, 16), awning, lh.x, lhY + 3.5 + k * 4, lh.y, 0, Math.PI / 2);
  const lamp = new THREE.MeshStandardMaterial({ color: 0x3a3a30, emissive: 0xffd080, emissiveIntensity: 0, roughness: 0.3 });
  const lampMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2, 12), lamp);
  lampMesh.position.set(lh.x, lhY + 15, lh.y);
  scene.add(lampMesh);
  add(new THREE.ConeGeometry(2, 2.2, 12), darkWood, lh.x, lhY + 17.1, lh.y);
  physics.addCylinder(new THREE.Vector3(lh.x, lhY + 7, lh.y), 7, 2.6);
  // (a glow sprite, not a light: a light per lighthouse would cost every material in the world)
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd080, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
  glow.position.set(lh.x, lhY + 15, lh.y);
  glow.scale.setScalar(26);
  scene.add(glow);
  clearings.push([lh.x, lh.y, 8]);

  // ---- the island's own touches ----
  const flagMat = new THREE.MeshStandardMaterial({ color: st.flag, roughness: 0.8, side: THREE.DoubleSide });
  const pole = (a: number, b: number, h = 7) => {
    const p = at(a, b);
    const y = heightAt(p.x, p.y);
    add(new THREE.CylinderGeometry(0.07, 0.09, h, 6), darkWood, p.x, y + h / 2, p.y);
    add(new THREE.BoxGeometry(0.04, 1.1, 1.8), flagMat, p.x + s.x * 0.9, y + h - 0.7, p.y + s.y * 0.9, Math.atan2(s.x, s.y));
  };
  pole(6, -4);
  pole(6, 4);
  if (def.style === 'azure') {
    // Palms leaning over the sand.
    const trunk = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.9 });
    const frond = new THREE.MeshStandardMaterial({ color: 0x3a8a3a, roughness: 0.8, side: THREE.DoubleSide });
    for (let k = 0; k < 8; k++) {
      const p = at(-36 + rnd() * 50, (rnd() < 0.5 ? -1 : 1) * (30 + rnd() * 10));
      const y = heightAt(p.x, p.y);
      const lean = (rnd() - 0.5) * 0.5;
      add(new THREE.CylinderGeometry(0.18, 0.28, 7, 7), trunk, p.x, y + 3.4, p.y, rnd() * 6, lean);
      for (let j = 0; j < 6; j++) add(new THREE.ConeGeometry(0.5, 3.6, 3), frond, p.x + Math.cos(j) * 1.2, y + 6.8, p.y + Math.sin(j) * 1.2, j * 1.05, 1.3);
      clearings.push([p.x, p.y, 3]);
    }
  } else if (def.style === 'pirate') {
    // A gallows on the quay and a beached wreck.
    const g = at(4, 14);
    const y = heightAt(g.x, g.y);
    add(new THREE.BoxGeometry(0.3, 5, 0.3), darkWood, g.x, y + 2.5, g.y);
    add(new THREE.BoxGeometry(2.4, 0.3, 0.3), darkWood, g.x + s.x * 1.1, y + 4.9, g.y + s.y * 1.1, Math.atan2(s.x, s.y) + Math.PI / 2);
    const w = at(def.shore - 6, 30);
    const hull = add(new THREE.BoxGeometry(4, 2.4, 14), darkWood, w.x, heightAt(w.x, w.y) + 0.6, w.y, yawOut + 0.6, 0.25);
    hull.rotation.z = 0.5;
  } else if (def.style === 'sunken') {
    // Broken columns of the drowned city, marching out into the water.
    for (let k = 0; k < 9; k++) {
      const p = at(def.shore - 10 + k * 7, -16 - (k % 3) * 6);
      const ground = heightAt(p.x, p.y);
      const h = 3 + rnd() * 5;
      add(new THREE.CylinderGeometry(0.8, 0.95, h, 10), stoneM, p.x, ground + h / 2 - 0.5, p.y, 0, (rnd() - 0.5) * 0.2);
    }
  } else if (def.style === 'demon') {
    // Braziers of red fire and obsidian spikes.
    const fire = new THREE.MeshStandardMaterial({ color: 0xff5a1a, emissive: 0xff3a0a, emissiveIntensity: 2.2 });
    const obsidian = new THREE.MeshStandardMaterial({ color: 0x141018, metalness: 0.4, roughness: 0.2 });
    for (const [a, b] of [[2, -6], [2, 6], [-16, -10], [-16, 10]]) {
      const p = at(a, b);
      const y = heightAt(p.x, p.y);
      add(new THREE.CylinderGeometry(0.5, 0.3, 1.2, 8), obsidian, p.x, y + 0.6, p.y);
      add(new THREE.SphereGeometry(0.45, 8, 6), fire, p.x, y + 1.35, p.y);
    }
    for (let k = 0; k < 6; k++) {
      const p = at(-40 + rnd() * 20, (rnd() - 0.5) * 70);
      const y = heightAt(p.x, p.y);
      add(new THREE.ConeGeometry(0.8 + rnd(), 4 + rnd() * 4, 5), obsidian, p.x, y + 2, p.y, rnd() * 6);
    }
  }

  batch.build(scene);

  // ---- docking: berths along the pier head, and the landing on the square ----
  const berthYaw = yawOut;
  const bA = at(f1 + 8, -12), bB = at(f1 + 8, 12), bC = at(f1 + 26, 0);
  const port: IslandPort = {
    def,
    zone: new THREE.Vector3(at(f1, 0).x, 0, at(f1, 0).y),
    berths: [[bA.x, bA.y, berthYaw], [bB.x, bB.y, berthYaw], [bC.x, bC.y, berthYaw]],
    landing: new THREE.Vector3(at(8, 0).x, 0, at(8, 0).y),
    lighthouse: { pos: new THREE.Vector3(lh.x, lhY, lh.y), lamp, glow },
    harbourmaster: 'hm-' + def.id,
    trader: 'tr-' + def.id,
  };

  // ---- the people ----
  const folk = FOLK[def.id];
  const v3 = (p: THREE.Vector2, dy = 0) => new THREE.Vector3(p.x, heightAt(p.x, p.y) + dy, p.y);
  const places = new Map<string, Place>();
  places.set('homes', { id: 'homes', spots: homeSpots, indoors: true });
  places.set('tavern', { id: 'tavern', spots: [v3(at(-24, -4)), v3(at(-24, 4))], indoors: true });
  places.set('square', { id: 'square', spots: [v3(at(-12, -5)), v3(at(-12, 5)), v3(at(-6, -2)), v3(at(-15, 0))] });
  places.set('pier', { id: 'pier', spots: [new THREE.Vector3(at(f1 - 6, -1).x, deckY + 0.15, at(f1 - 6, -1).y), new THREE.Vector3(at(f1 - 14, 1).x, deckY + 0.15, at(f1 - 14, 1).y)] });
  const hmPost = v3(at(-21, 3));
  const trPost = v3(at(-9, -7 + 1.2));
  places.set('post:' + port.harbourmaster, { id: 'post:' + port.harbourmaster, spots: [hmPost], yaw: yawOut });
  places.set('post:' + port.trader, { id: 'post:' + port.trader, spots: [trPost], yaw: yawOut });
  const records: NpcRecord[] = [];
  const day = (post: string, from: number, to: number, activity: ScheduleEntry['activity']): ScheduleEntry[] => [{ from: 0, activity: 'sleep', place: 'homes' }, { from, activity, place: post }, { from: to, activity: 'drink', place: 'tavern' }, { from: Math.min(23.8, to + 2), activity: 'sleep', place: 'homes' }];
  records.push({ id: port.harbourmaster, name: folk.hm[0], title: folk.hm[1], job: 'harbourmaster', settlement: def.id, look: folk.hm[2], named: true, schedule: day('post:' + port.harbourmaster, 5, 22, 'idle'), lines: { any: folk.lines.hm } });
  records.push({ id: port.trader, name: folk.tr[0], title: folk.tr[1], job: 'merchant', settlement: def.id, look: folk.tr[2], named: true, schedule: day('post:' + port.trader, 6, 21, 'talk'), lines: { any: folk.lines.tr } });
  folk.folk.forEach((look, i) => {
    for (let k = 0; k < 2; k++) {
      records.push({
        id: `${def.id}-folk-${i}-${k}`, name: ['Ama', 'Bren', 'Cass', 'Doran', 'Eda', 'Fenn', 'Gale', 'Hob'][(i * 2 + k + def.id.length) % 8] + ' of ' + def.name, job: 'townsfolk', settlement: def.id, look,
        schedule: [{ from: 0, activity: 'sleep', place: 'homes' }, { from: 7 + k, activity: k ? 'idle' : 'talk', place: k ? 'pier' : 'square' }, { from: 18 + i, activity: 'drink', place: 'tavern' }, { from: 22.5, activity: 'sleep', place: 'homes' }],
        lines: { any: folk.lines.folk },
      });
    }
  });
  // A small walking graph: the square, the hall door, the houses, the pier root and head.
  const nodes = [v3(plaza), v3(at(-22, 0)), ...homeSpots.map((h) => h.clone()), v3(at(f0, 0)), new THREE.Vector3(at(f0 + ramp, 0).x, deckY + 0.15, at(f0 + ramp, 0).y), new THREE.Vector3(at(f1 - 4, 0).x, deckY + 0.15, at(f1 - 4, 0).y)];
  const edges: number[][] = nodes.map(() => []);
  const link = (a: number, b: number) => { edges[a].push(b); edges[b].push(a); };
  for (let i = 1; i < nodes.length - 3; i++) link(0, i);
  link(0, nodes.length - 3);
  link(nodes.length - 3, nodes.length - 2);
  link(nodes.length - 2, nodes.length - 1);
  void hall;
  const settlement: Settlement = { id: def.id, center: new THREE.Vector3(cx, heightAt(cx, cz), cz), radius: 320, places, nodes, edges };
  return { port, clearings, records, settlement };
}
