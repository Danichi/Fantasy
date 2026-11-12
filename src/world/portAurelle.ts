import { PORT_LOTS } from './port/lots';
import * as THREE from 'three';
import { physics } from '../physics/physics';
import type { WorldMats } from './buildings';
import { buildShip } from './cityKit';
import { heightAt } from './terrainHeight';
import {
  AURELLE,
  CANAL,
  CITY_STREETS,
  LIGHTHOUSE,
  MARKET,
  PORT_DISTRICTS,
  quayAt,
} from './portCity';
import type { FX } from '../fx/particles';
import type { FishingSpot } from './fishing';
import type { NpcRecord, Settlement } from '../npc/npcManager';
import { registerDoor } from './doors';
import { PortKit } from './port/kit';
import { portResidents } from './port/residents';

export const forgeAt = new THREE.Vector3(AURELLE.forge[0], 0, AURELLE.forge[1]);
export const PORT_SPOTS = Object.fromEntries(
  Object.entries(AURELLE).map(([key, [x, z]]) => [
    key,
    new THREE.Vector3(x, 0, z),
  ]),
) as Record<keyof typeof AURELLE, THREE.Vector3>;
export interface PortAurelle {
  settlement: Settlement;
  records: NpcRecord[];
  fishingSpots: FishingSpot[];
  clearings: [number, number, number][];
  kit: PortKit;
  landmarks: Map<string, THREE.Object3D>;
  stateGroups: Map<string, THREE.Group>;
  update(dt: number, night: number): void;
  dispose(): void;
}

export function buildPortAurelle(
  scene: THREE.Scene,
  m: WorldMats,
  _fx: FX,
): PortAurelle {
  const k = new PortKit(scene, m);
  forgeAt.copy(k.at(...AURELLE.forge, 1));
  const landmarks = new Map<string, THREE.Object3D>(),
    stateGroups = new Map<string, THREE.Group>();
  const v = (x: number, z: number, dy = 0) => k.at(x, z, dy),
    stone = k.stone;
  const ships: { g: THREE.Group; y: number; phase: number }[] = [];
  const dynamic: ((t: number) => void)[] = [];
  const clearings: [number, number, number][] = [
    [2828, 174, 240],
    [2960, -18, 20],
  ];
  const box = k.box.bind(k),
    mesh = k.mesh.bind(k);
  const wall = (a: [number, number], b: [number, number], h = 6) => {
    const x = (a[0] + b[0]) / 2,
      z = (a[1] + b[1]) / 2,
      y = heightAt(x, z),
      len = Math.hypot(a[0] - b[0], a[1] - b[1]),
      yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
    box(1.3, h, len, x, y + h / 2 - 0.3, z, stone, yaw, true);
    for (let i = 0; i < len; i += 2.2)
      box(
        1.5,
        0.7,
        1,
        a[0] + ((b[0] - a[0]) * i) / len,
        y + h,
        a[1] + ((b[1] - a[1]) * i) / len,
        stone,
        yaw,
      );
  };
  const tower = (x: number, z: number, r: number, h: number, roof = true) => {
    const y = heightAt(x, z);
    mesh(
      new THREE.CylinderGeometry(r, r * 1.08, h, 12),
      stone,
      x,
      y + h / 2,
      z,
    );
    k.solid(r * 1.5, h, r * 1.5, x, y + h / 2, z);
    if (roof)
      mesh(
        new THREE.ConeGeometry(r * 1.3, r * 1.6, 12),
        k.blue,
        x,
        y + h + r * 0.8,
        z,
      );
    for (let i = 0; i < 3; i++)
      box(0.65, 1.4, 0.18, x, y + 3 + i * 3, z + r, k.blue);
  };

  // Westgate frames a rising city and the first glimpse of masts through the Exchange.
  wall([2698, 28], [2698, 140], 7);
  wall([2698, 160], [2698, 334], 7);
  for (const z of [138, 162]) tower(2700, z, 4.1, 15);
  k.arch(2700, 150, heightAt(2700, 150) + 6, 12, 3, 3, Math.PI / 2);
  k.sign(
    'PORT AURELLE',
    'Jewel of the Grand Ocean',
    2697,
    150,
    -Math.PI / 2,
    7,
    12,
  );
  k.house(2722, 180, 17, 11, 2, Math.PI, {
    kind: 'hall',
    name: 'Westgate Coach House',
    keeper: 'hobbs',
  });
  for (const z of [174, 182, 190]) {
    box(9, 0.18, 3, 2710, heightAt(2710, z) + 2.8, z, m.planks);
    for (const x of [2706, 2714])
      box(0.15, 2.8, 0.15, x, heightAt(x, z) + 1.4, z, m.timber);
  }
  for (const z of [143, 157]) k.lamp(2710, z);
  for (let x = 2565; x < 2694; x += 6)
    for (const z of [143.5, 156.5])
      box(6.1, 0.85, 0.5, x, heightAt(x, z) + 0.45, z, stone);
  k.house(2738, 124, 10, 11, 3, 0.1, {
    kind: 'home',
    name: 'The Gatekeeper’s Lodging',
  });
  k.sign('WESTGATE', 'Coaches · King’s Road', 2720, 168, 0, 3.8, 3.3);

  // Grand Exchange: deliberately framed streets, arcades and a working ring of stalls.
  const [mx, mz] = MARKET,
    my = heightAt(mx, mz);
  mesh(
    new THREE.CylinderGeometry(3.2, 3.5, 0.75, 24),
    stone,
    mx,
    my + 0.37,
    mz,
  );
  mesh(
    new THREE.TorusGeometry(3.3, 0.22, 6, 24).rotateX(Math.PI / 2),
    stone,
    mx,
    my + 0.8,
    mz,
  );
  mesh(
    new THREE.CircleGeometry(3, 24).rotateX(-Math.PI / 2),
    k.colour('#5ba9b4', 0.2),
    mx,
    my + 0.7,
    mz,
  );
  mesh(new THREE.CylinderGeometry(0.35, 0.6, 2.6, 10), stone, mx, my + 1.5, mz);
  const fountainShip = buildShip('sloop', 0xc5a260, 0xd6c590).group;
  fountainShip.scale.setScalar(0.12);
  fountainShip.position.set(mx, my + 2.8, mz);
  k.root.add(fountainShip);
  for (const [x, z, yaw, col] of [
    [2774, 157, 0, '#a95747'],
    [2785, 148, 0, '#3b8883'],
    [2800, 149, 0, '#c1a15d'],
    [2815, 160, -0.5, '#627fab'],
    [2815, 186, -2.3, '#a77c9a'],
    [2780, 192, Math.PI, '#718b59'],
  ] as [number, number, number, string][])
    k.stall(x, z, yaw, col);
  k.house(2756, 174, 14, 13, 3, Math.PI / 2, {
    kind: 'shop',
    name: 'The Exchange Apothecary',
    keeper: 'quill',
  });
  k.house(2824, 155, 13, 14, 3, -Math.PI / 2, {
    kind: 'shop',
    name: 'Lune’s Rings & Charts',
    keeper: 'sabeth',
  });
  k.house(2820, 197, 16, 11, 2, Math.PI, {
    kind: 'hall',
    name: 'The Merchants’ Exchange',
  });
  for (const x of [2760, 2770, 2780]) {
    const y = heightAt(x, 203);
    k.arch(x, 203, y, 6, 3, 1);
    box(10, 0.35, 4, x, y + 6.7, 203, stone);
  }
  k.sign(
    'GRAND EXCHANGE',
    'Imports · Provisions · Guild',
    2792,
    143,
    0,
    5.5,
    4.2,
  );
  for (const [x, z] of [
    [2767, 183],
    [2807, 191],
    [2808, 147],
    [2771, 147],
  ]) {
    k.tree(x, z, 0.85);
    k.bench(x + 2, z + 2);
  }
  for (const z of [156, 188])
    k.beam(v(2764, z, 6.8), v(2813, z, 7.4), 0.035, k.brass);
  for (let i = 0; i < 8; i++)
    k.flag(
      2768 + i * 5.5,
      my + 6.8,
      156,
      0,
      i % 2 ? k.teal : k.cream,
      0.8,
      1.4,
    );

  // Academy Heights, with distinct training courts, a public ring and sea wall.
  k.house(2796, 54, 32, 13, 3, 0, {
    kind: 'hall',
    name: 'The Academy Mess & Assembly Hall',
    keeper: 'marrow',
  });
  k.house(2779, 76, 13, 18, 2, Math.PI / 2, {
    kind: 'library',
    name: 'The Academy Library',
    keeper: 'mell',
  });
  k.house(2840, 54, 15, 12, 2, 0, {
    kind: 'shop',
    name: 'The Academy Armoury',
    keeper: 'garrot',
  });
  k.house(2779, 96, 12, 11, 2, Math.PI / 2, {
    kind: 'home',
    name: 'The Cadets’ Dormitory',
  });
  const ay = heightAt(2822, 84);
  mesh(
    new THREE.RingGeometry(8.7, 9.2, 48).rotateX(-Math.PI / 2),
    k.brass,
    2822,
    ay + 0.05,
    84,
  );
  for (const [x, z] of [
    [2810, 68],
    [2833, 68],
    [2838, 91],
  ]) {
    for (const s of [-1, 1])
      box(0.15, 2, 0.15, x + s * 0.55, ay + 1, z, m.timber);
    box(1.5, 0.25, 0.25, x, ay + 1.5, z, m.planks);
  }
  for (const [x, z] of [
    [2770, 48],
    [2852, 48],
    [2770, 104],
    [2852, 104],
  ])
    tower(x, z, 2.1, 10);
  wall([2770, 47], [2852, 47], 3);
  wall([2852, 47], [2852, 103], 2.2);
  k.sign(
    'KNIGHT’S ACADEMY',
    'Gale · Boundary · Cross',
    2800,
    104,
    Math.PI,
    5.8,
    4.8,
  );
  for (const x of [2793, 2807])
    k.flag(x, heightAt(x, 104) + 4.5, 104, 0, k.blue, 1.5, 3.2);
  // Broad ramp to the oath platform. Sloped collider is independent of the terrain pad.
  const rampLen = 20,
    rise = 3.5,
    rampGeo = new THREE.BoxGeometry(4, 0.5, Math.hypot(rampLen, rise));
  rampGeo.rotateX(Math.atan2(rise, rampLen));
  mesh(rampGeo, stone, 2826, ay + rise / 2 - 0.25, 64);
  k.colliders.push(
    physics.addBox(
      new THREE.Vector3(2826, ay + rise / 2 - 0.25, 64),
      new THREE.Vector3(2, 0.25, Math.hypot(rampLen, rise) / 2),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(Math.atan2(rise, rampLen), 0, 0),
      ),
    ),
  );
  box(8, 0.4, 6, 2824, ay + 3.5, 51, stone, 0, true);
  for (const x of [2819.5, 2828.5]) box(0.3, 1, 7, x, ay + 4.2, 51, stone);

  // Crown Heights: terraced gardens and a sea-facing citadel rather than repeated cottages.
  const cy = heightAt(2884, 52);
  k.house(2884, 48, 22, 17, 3, 0.08, {
    kind: 'hall',
    name: 'Aurelle Citadel · Chart Room',
  });
  for (const [x, z] of [
    [2872, 40],
    [2896, 40],
  ])
    tower(x, z, 3, 18);
  k.house(
    2736,
    66,
    17,
    13,
    3,
    0,
    { kind: 'home', name: 'The Aurelle Family House', keeper: 'corvina' },
    '#e1dfd5',
  );
  k.house(2758, 44, 12, 12, 2, 0.12, {
    kind: 'home',
    name: 'The Rose Court House',
  });
  for (const [x, z] of [
    [2724, 78],
    [2746, 82],
    [2758, 62],
    [2874, 83],
    [2890, 86],
  ]) {
    k.tree(x, z, 1);
    k.bench(x + 3, z, Math.PI);
  }
  for (const x of [2864, 2870, 2876, 2882, 2888]) k.planter(x, 94, 2.4);
  k.sign('CROWN HEIGHTS', 'Citadel · Gardens', 2860, 98, Math.PI, 4, 3.2);
  k.flag(2884, cy + 16, 58, 0, k.blue, 2, 4);

  // Guild and travellers’ neighbourhood.
  k.house(
    2746,
    244,
    24,
    16,
    3,
    0,
    { kind: 'guild', name: 'The Adventurer’s Guild', keeper: 'guildmaster' },
    '#e2d3b4',
  );
  k.sign(
    'ADVENTURER’S GUILD',
    'Port Hall · Contracts & Expeditions',
    2746,
    253,
    0,
    6,
    5,
  );
  k.house(
    2784,
    252,
    15,
    12,
    3,
    0,
    { kind: 'tavern', name: 'The Salty Anchor', keeper: 'bess' },
    '#dfc8a8',
  );
  k.sign(
    'THE SALTY ANCHOR',
    'Beds · Supper · Sea shanties',
    2784,
    259,
    0,
    4.5,
    4.8,
  );
  k.bench(2775, 264);
  k.bench(2794, 264);
  k.tree(2765, 261, 0.9);

  // Great Quays: curved seawalls follow the same shore function as terrain and navigation.
  for (let z = 28; z < 340; z += 5) {
    const x = quayAt(z),
      nx = quayAt(z + 5),
      yaw = -Math.atan2(nx - x, 5);
    box(2, 5.5, 5.3, (x + nx) / 2, -1.5, z + 2.5, stone, yaw, true);
    box(5, 0.2, 5.3, (x + nx) / 2 - 2.2, 1.3, z + 2.5, m.planks, yaw, true);
  }
  const piers: [number, number][] = [
    [98, 48],
    [146, 52],
    [250, 46],
    [306, 42],
  ];
  for (const [z, len] of piers) {
    const x = quayAt(z);
    box(len, 0.35, 5, x + len / 2, 1.2, z, m.planks, 0, true);
    for (let t = 4; t < len; t += 5)
      for (const side of [-1, 1]) {
        mesh(
          new THREE.CylinderGeometry(0.22, 0.28, 6, 7),
          m.timber,
          x + t,
          -1.2,
          z + side * 2.1,
        );
        box(0.16, 0.6, 0.16, x + t, 1.7, z + side * 2.1, k.iron);
      }
  }
  for (const [z, kind, col] of [
    [98, 'merchant', 0x716048],
    [250, 'naval', 0x3d536e],
    [146, 'expedition', 0x786044],
  ] as const) {
    const g = buildShip(kind, col).group;
    g.position.set(quayAt(z) + 24, -0.5, z - 9);
    g.rotation.y = Math.PI / 2;
    k.root.add(g);
    ships.push({ g, y: -0.5, phase: z });
  }
  k.sign(
    'IRON KETTLE',
    'White Mountain Expedition',
    2938,
    150,
    Math.PI / 2,
    3.6,
    3.5,
  );
  k.house(
    2898,
    132,
    22,
    15,
    3,
    Math.PI / 2,
    {
      kind: 'hall',
      name: 'Renn Maritime Bonded Warehouse',
      keeper: 'aurelle-factor',
    },
    '#c8bca4',
  );
  k.house(2912, 184, 13, 11, 2, Math.PI / 2, {
    kind: 'hall',
    name: 'The Customs House',
    keeper: 'tallow',
  });
  k.house(2870, 150, 12, 14, 3, Math.PI / 2, {
    kind: 'shop',
    name: 'The Sail Loft',
  });
  // Customs arch with a genuinely large bronze bell.
  const by = heightAt(2904, 176);
  k.arch(2904, 176, by, 8, 6, 2, Math.PI / 2);
  mesh(
    new THREE.CylinderGeometry(1.1, 1.7, 1.65, 14, 1, true),
    k.brass,
    2904,
    by + 10.5,
    176,
  );
  k.beam(
    new THREE.Vector3(2904, by + 11.8, 176),
    new THREE.Vector3(2904, by + 9.6, 176),
    0.1,
    k.iron,
  );
  for (const z of [114, 240]) {
    const x = quayAt(z) - 4,
      y = heightAt(x, z);
    box(0.6, 8, 0.6, x, y + 4, z, m.timber);
    const g = new THREE.Group();
    g.position.set(x, y + 8, z);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 13), m.timber);
    arm.position.z = 4;
    g.add(arm);
    const rope = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 5),
      k.cream,
    );
    rope.position.set(0, -2.5, 10);
    g.add(rope);
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1.2, 1.5),
      m.planks,
    );
    crate.position.set(0, -5, 10);
    g.add(crate);
    k.root.add(g);
    dynamic.push((t) => (g.rotation.y = 0.8 + Math.sin(t * 0.09 + z) * 0.8));
  }
  for (let z = 66; z < 330; z += 22) {
    const x = quayAt(z) - 7;
    k.lamp(x, z);
    if (Math.abs(z - 176) > 14) {
      k.crate(x - 3, z);
      k.barrel(x - 5, z + 2);
    }
  }

  // Forgewater: dry dock, workshops, ropewalk and a recognisable hull skeleton.
  k.house(
    2886,
    24,
    17,
    13,
    2,
    0,
    { kind: 'smithy', name: 'Forgewater Foundry', keeper: 'ragna' },
    '#b9b7a5',
  );
  k.house(2864, 28, 13, 11, 2, 0, {
    kind: 'hall',
    name: 'White Mountain Expedition Office',
    keeper: 'bruni',
  });
  const sy = heightAt(2928, 46);
  box(21, 0.5, 35, 2928, sy + 0.25, 46, m.planks, 0, true);
  const hull = buildShip('merchant', 0x93764b).group;
  hull.position.set(2928, sy + 3, 46);
  hull.rotation.y = 0.03;
  hull.scale.set(0.75, 0.7, 0.85);
  k.root.add(hull);
  for (let z = 32; z <= 60; z += 4) {
    for (const x of [2917, 2939]) {
      box(0.25, 7, 0.25, x, sy + 3.5, z, m.timber);
      box(2, 0.2, 3, x, sy + 5, z, m.planks);
    }
  }
  for (let z = 36; z < 58; z += 3)
    k.beam(
      new THREE.Vector3(2921, sy + 2, z),
      new THREE.Vector3(2935, sy + 6, z),
      0.13,
      m.timber,
    );
  k.house(2900, 76, 14, 10, 2, 0, {
    kind: 'smithy',
    name: 'Aurelle Shipwrights',
    keeper: 'shipwright',
  });
  for (let x = 2858; x < 2900; x += 6) {
    box(0.15, 2.4, 0.15, x, heightAt(x, 13) + 1.2, 13, m.timber);
    if (x < 2894) k.beam(v(x, 13, 2), v(x + 6, 13, 2), 0.05, k.cream);
  }
  k.sign(
    'FORGEWATER',
    'Shipwrights · Foundry · Expedition Office',
    2886,
    40,
    0,
    6,
    4.3,
  );

  // Netters’ Reach clusters around the kitchen and small boat basin.
  k.house(
    2892,
    332,
    16,
    10,
    2,
    Math.PI,
    {
      kind: 'tavern',
      name: 'Netters’ Communal Kitchen',
      keeper: 'aurelle-cook',
    },
    '#d4d4bc',
  );
  for (const [x, z, yaw] of [
    [2892, 302, 0],
    [2910, 322, Math.PI],
    [2868, 332, Math.PI],
    [2930, 330, Math.PI],
  ] as [number, number, number][])
    k.house(
      x,
      z,
      9,
      8,
      2,
      yaw,
      { kind: 'home', name: 'A Netters’ Reach Home' },
      '#d9e1d2',
    );
  k.stall(2912, 296, 0, '#407d76', 'fish');
  k.stall(2924, 296, 0, '#657f9e', 'fish');
  for (let i = 0; i < 4; i++) {
    const g = buildShip('fishing', 0x3f6e7c + i * 0x130904).group;
    g.position.set(2950 + i * 7, -0.4, 326);
    g.rotation.y = Math.PI / 2;
    k.root.add(g);
    ships.push({ g, y: -0.4, phase: i });
  }
  for (let x = 2884; x < 2914; x += 6) {
    const y = heightAt(x, 314);
    k.beam(
      new THREE.Vector3(x, y + 2.7, 314),
      new THREE.Vector3(x + 4, y + 2.7, 314),
      0.08,
      m.timber,
    );
    for (const xx of [x, x + 4])
      box(0.1, 2.7, 0.1, xx, y + 1.35, 314, m.timber);
    for (let i = 0; i < 4; i++)
      mesh(
        new THREE.SphereGeometry(0.16, 6, 4).scale(0.5, 2, 1),
        k.colour('#99afb5'),
        x + 0.5 + i,
        y + 2.2,
        314,
      );
  }
  k.sign(
    'NETTERS’ REACH',
    'Fish auction · Boat hire · Supper',
    2912,
    285,
    0,
    5,
    3.5,
  );

  // Lantern Ward, bridge market and three entrances to the old foundations.
  k.house(
    2880,
    300,
    10,
    9,
    3,
    Math.PI,
    { kind: 'tavern', name: 'The Drowned Lantern', keeper: 'marlo' },
    '#b9c2bb',
  );
  k.sign(
    'THE DROWNED LANTERN',
    'Quiet rooms. Quieter company.',
    2880,
    294.8,
    Math.PI,
    4,
    4.5,
  );
  k.house(2842, 230, 14, 11, 2, Math.PI, {
    kind: 'undercity',
    name: 'The Old Customs Vaults',
  });
  k.house(2838, 278, 14, 12, 2, Math.PI, {
    kind: 'undercity',
    name: 'The Cistern Pump House',
  });
  const lowerLots: [number, number, number, number, number][] = [
    [2810, 246, 9, 10, 2],
    [2820, 268, 10, 9, 3],
    [2812, 297, 11, 10, 3],
    [2832, 304, 9, 9, 2],
    [2850, 304, 11, 10, 3],
    [2859, 270, 10, 10, 3],
    [2869, 249, 10, 9, 2],
    [2906, 258, 12, 10, 3],
    [2826, 322, 12, 9, 2],
    [2804, 335, 10, 8, 2],
    [2750, 300, 11, 10, 2],
    [2770, 319, 9, 9, 2],
    [2744, 210, 10, 10, 3],
    [2728, 268, 9, 10, 2],
    [2732, 304, 10, 11, 3],
    [2770, 280, 9, 10, 2],
    [2838, 144, 11, 10, 3],
    [2854, 124, 10, 11, 2],
    [2727, 102, 10, 10, 2],
    [2724, 212, 9, 9, 2],
  ];
  for (let i = 0; i < lowerLots.length; i++) {
    const [x, z, w, d, f] = lowerLots[i];
    k.house(
      x,
      z,
      w,
      d,
      f,
      i % 2 ? Math.PI : 0,
      {
        kind: 'home',
        name: i < 12 ? 'A Lantern Ward Lodging' : 'A Merchant’s Home',
      },
      i % 3 === 0 ? '#d4c4af' : i % 3 === 1 ? '#d9dfd4' : '#c5d3d2',
    );
  }
  const canalLen = quayAt(CANAL.z) - CANAL.x0;
  for (const side of [-1, 1])
    box(
      canalLen,
      4,
      1,
      CANAL.x0 + canalLen / 2,
      -1,
      CANAL.z + side * (CANAL.half + 0.5),
      stone,
      0,
      true,
    );
  mesh(
    new THREE.PlaneGeometry(canalLen, CANAL.half * 2).rotateX(-Math.PI / 2),
    k.colour('#387e8c', 0.2),
    CANAL.x0 + canalLen / 2,
    -0.35,
    CANAL.z,
  );
  for (const x of [2840, 2886]) {
    box(6, 0.5, 14, x, 1.6, CANAL.z, stone, 0, true);
    for (const side of [-1, 1])
      box(0.3, 1, 14, x + side * 2.8, 2.3, CANAL.z, stone);
  }
  // Shops on the main bridge form a market corridor with a clear walking lane.
  for (const z of [204, 216]) k.stall(2844, z, Math.PI / 2, '#ab7e58');
  box(1.6, 0.12, 1.2, 2873.4, heightAt(2873.4, 300) + 0.08, 300, m.planks);
  mesh(
    new THREE.CircleGeometry(0.22, 12).rotateX(-Math.PI / 2),
    k.colour('#8d3d37'),
    2873.4,
    heightAt(2873.4, 300) + 0.15,
    300,
  );
  for (const [x, z] of [
    [2848, 246],
    [2860, 288],
    [2888, 290],
    [2828, 294],
  ])
    k.lamp(x, z, 3.6);
  for (const [x, z] of [
    [2824, 258],
    [2850, 282],
    [2870, 324],
  ]) {
    k.tree(x, z, 0.8);
    k.bench(x + 3, z);
  }
  // Lines of washing and lanterns make the upper space inhabited too.
  for (let i = 0; i < 5; i++) {
    const x = 2816 + i * 12;
    k.beam(v(x, 290, 7), v(x + 8, 290, 7), 0.025, k.cream);
    k.flag(x + 4, heightAt(x, 290) + 6, 290, 0, k.cream, 1.8, 1.3);
  }

  // Breakwater and lighthouse. The keeper house anchors the walk onto the mole.
  k.house(2922, 14, 10, 9, 2, 0, {
    kind: 'hall',
    name: 'The Lighthouse Keeper’s House',
    keeper: 'aurelle-keeper',
  });
  for (let i = 0; i < 10; i++) {
    const t = i / 9,
      x = 2922 + 38 * t,
      z = 18 - 36 * t;
    box(10, 0.5, 6, x, 1.45, z, stone, 0.8, true);
    if (i % 3 === 0) k.lamp(x - 3, z, 2.7);
  }
  const [lx, lz] = LIGHTHOUSE,
    ly = heightAt(lx, lz);
  for (let i = 0; i < 6; i++)
    mesh(
      new THREE.CylinderGeometry(3.5 - i * 0.25, 3.75 - i * 0.25, 4.2, 16),
      i % 2 ? stone : k.blue,
      lx,
      ly + 2.1 + i * 4.2,
      lz,
    );
  k.solid(5.8, 24, 5.8, lx, ly + 12, lz);
  mesh(
    new THREE.CylinderGeometry(4.1, 4.1, 0.5, 16),
    k.brass,
    lx,
    ly + 25.5,
    lz,
  );
  mesh(
    new THREE.CylinderGeometry(2.3, 2.3, 3.4, 12, 1, true),
    k.iron,
    lx,
    ly + 27,
    lz,
  );
  mesh(new THREE.ConeGeometry(3.5, 3.5, 12), k.blue, lx, ly + 30.5, lz);
  const lens = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.35, 1),
    new THREE.MeshStandardMaterial({
      color: '#ffdf8d',
      emissive: '#ffce76',
      emissiveIntensity: 2,
    }),
  );
  lens.position.set(lx, ly + 27, lz);
  k.root.add(lens);
  k.owned.add(lens.material);
  landmarks.set('lens', lens);
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(9, 65, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: '#ffe3a1',
      transparent: true,
      opacity: 0.045,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  beam.geometry.rotateX(Math.PI / 2);
  beam.geometry.translate(0, 0, 32);
  beam.position.set(lx, ly + 27, lz);
  k.root.add(beam);
  dynamic.push((t) => (beam.rotation.y = t * 0.14));
  k.owned.add(beam.material);
  landmarks.set('beam', beam);
  const lightDoor = new THREE.Object3D();
  lightDoor.position.set(lx, ly, lz);
  registerDoor(
    lightDoor,
    new THREE.Vector3(0, 0, 4.2),
    { w: 10, d: 12, floors: 2, roof: 'slate', seed: 9312 },
    { kind: 'lighthouse', name: 'The Aurelle Light · Signal Chamber' },
  );
  k.sign(
    'THE AURELLE LIGHT',
    'A promise to every homeward ship',
    lx,
    lz + 4,
    0,
    4,
    3.5,
  );
  // A wreck reachable by swimming or by boat; evidence sits above the waterline.
  const wreck = buildShip('sloop', 0x5e5144).group;
  wreck.position.set(...([3006, -1.4, 352] as [number, number, number]));
  wreck.rotation.set(0, -0.6, 0.45);
  k.root.add(wreck);
  landmarks.set('wreck', wreck);
  box(8, 0.3, 5, 3006, 0.3, 352, m.planks, -0.6, true);

  // State-dependent scenery, owned separately so saving/reloading reproduces outcomes.
  for (const name of [
    'memorial',
    'room',
    'expedition',
    'festival',
    'returnedCrew',
  ]) {
    const g = new THREE.Group();
    g.name = name;
    g.visible = false;
    k.root.add(g);
    stateGroups.set(name, g);
  }
  const memorial = stateGroups.get('memorial')!;
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, 0.2), k.brass);
  plaque.position.copy(v(...AURELLE.memorial, 1.4));
  memorial.add(plaque);
  const room = stateGroups.get('room')!;
  const pennant = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.8), k.teal);
  pennant.position.copy(v(2784, 259, 8));
  room.add(pennant);
  const exp = stateGroups.get('expedition')!;
  for (let i = 0; i < 6; i++) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), m.planks);
    o.position.set(2944 + (i % 3), 1.8, 149 + Math.floor(i / 3));
    exp.add(o);
  }
  const festive = stateGroups.get('festival')!;
  for (let i = 0; i < 24; i++) {
    const z = 70 + i * 10,
      x = quayAt(z) - 3;
    const o = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 1.6),
      i % 2 ? k.teal : k.brass,
    );
    o.position.set(x, 6, z);
    festive.add(o);
  }

  // Individually fixed lots form irregular blocks around the landmark courts.
  for (const [x, z, w, d, f, yaw] of PORT_LOTS) {
    const name =
      z > 244
        ? 'A Lantern Ward Lodging'
        : z < 110
          ? 'A Crown Heights Residence'
          : 'An Exchange Merchant’s Home';
    const tint =
      z > 270
        ? '#c7d2c9'
        : z < 110
          ? '#e6dfcc'
          : x < 2770
            ? '#d6c7b1'
            : '#d6d9cd';
    k.house(x, z, w, d, f, yaw, { kind: 'home', name }, tint);
  }
  // Deliberate public courts are stone; garden courts retain their grass.
  const paving = (x: number, z: number, w: number, d: number) =>
    mesh(
      new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2),
      m.bridgeStone ?? m.stone,
      x,
      heightAt(x, z) + 0.035,
      z,
    );
  paving(2792, 172, 48, 44);
  paving(2820, 83, 37, 29);
  paving(2746, 264, 30, 12);
  paving(2784, 266, 24, 12);
  paving(2880, 289, 23, 10);
  paving(2914, 295, 29, 14);
  paving(2890, 324, 25, 10);
  paving(2886, 37, 26, 14);
  paving(2722, 171, 26, 12);
  // A scheduled arrival uses a clear water lane beyond the owned-ship berths.
  const traffic = buildShip('merchant', 0x78624f).group;
  traffic.position.set(3210, -0.5, 190);
  traffic.rotation.y = -Math.PI / 2;
  k.root.add(traffic);
  landmarks.set('traffic', traffic);

  // Paving edges and small planting repeat through shared batches, leaving public routes open.
  for (const line of CITY_STREETS)
    for (const [x, z] of line) {
      if (x < 2700) continue;
      for (const s of [-1, 1]) {
        if (z < 110 || x < 2780) k.planter(x + s * 4, z + 3, 1.2);
      }
    }
  const { settlement, records } = portResidents();
  for (const d of PORT_DISTRICTS)
    k.sign(d.name.toUpperCase(), '', d.at[0] + 6, d.at[1] + 7, 0, 3.4, 3.1);
  k.finish();
  const fishingSpots: FishingSpot[] = [
    ...[0, 1, 2, 3].map((i) => ({
      pos: new THREE.Vector3(2948 + i * 5, 1.45, 306),
      water: new THREE.Vector3(2948 + i * 5, -0.5, 316),
      kind: 'harbour' as const,
      name: 'Netters’ Reach',
    })),
    ...piers.map(([z, len]) => ({
      pos: new THREE.Vector3(quayAt(z) + len - 2, 1.45, z),
      water: new THREE.Vector3(quayAt(z) + len + 8, -0.5, z),
      kind: 'sea' as const,
      name: 'The Great Quays',
    })),
    {
      pos: v(2957, -10),
      water: new THREE.Vector3(2974, -0.5, -12),
      kind: 'sea',
      name: 'The Aurelle Light',
    },
    {
      pos: v(2640, 144),
      water: new THREE.Vector3(2640, -0.5, 132),
      kind: 'harbour',
      name: 'The causeway',
    },
  ];
  let t = 0;
  return {
    settlement,
    records,
    fishingSpots,
    clearings,
    kit: k,
    landmarks,
    stateGroups,
    update(dt, night) {
      t += dt;
      k.update(t, night);
      for (const s of ships) {
        s.g.position.y = s.y + Math.sin(t * 0.8 + s.phase) * 0.1;
        s.g.rotation.z = Math.sin(t * 0.6 + s.phase) * 0.018;
      }
      for (const f of dynamic) f(t);
    },
    dispose() {
      k.dispose();
    },
  };
}
