import * as THREE from 'three';
import { heightAt } from '../terrainHeight';
import { mulberry32 } from '../../core/math';
import {
  AURELLE,
  CITY_CENTER,
  MARKET,
  QUAY_X,
  CITY_STREETS,
} from '../portCity';
import type {
  NpcRecord,
  Place,
  Settlement,
  ScheduleEntry,
} from '../../npc/npcManager';
import type { Look } from '../../npc/charBuilder';
const v = (x: number, z: number, dy = 0) =>
  new THREE.Vector3(x, heightAt(x, z) + dy, z);
interface Named {
  id: string;
  name: string;
  title: string;
  look: Look;
  post: [number, number];
  yaw?: number;
  activity: ScheduleEntry['activity'];
  hours: [number, number];
  lines: NpcRecord['lines'];
}

const NAMED: Named[] = [
  {
    id: 'marrow',
    name: 'Ser Elian Marrow',
    title: 'Knight-Captain · Academy Registrar',
    post: [2800, 104],
    yaw: Math.PI,
    activity: 'idle',
    hours: [6, 21],
    lines: {
      any: [
        'The Academy gate is open to anyone with the nerve to walk through it.',
      ],
    },
    look: {
      body: 'male',
      outfit: 'ranger',
      hair: 'simpleparted',
      beard: true,
      hairColor: 0xb8b4ae,
      skin: 0xe0b894,
      cloth: 0x2f5f9a,
      pauldron: true,
      height: 1.88,
    },
  },
  {
    id: 'lyra',
    name: 'Instructor Lyra Quen',
    title: 'Gale School Instructor',
    post: [2830, 64],
    activity: 'patrol',
    hours: [7, 19],
    lines: { any: ['Faster. No — lighter. Speed starts in the feet.'] },
    look: {
      body: 'female',
      outfit: 'ranger',
      hair: 'buzzedfemale',
      hairColor: 0xd2b26a,
      skin: 0xfff0e6,
      cloth: 0x3a8ab0,
      height: 1.72,
    },
  },
  {
    id: 'hadrik',
    name: 'Ser Hadrik Vane',
    title: 'Boundary School Instructor',
    post: [2812, 78],
    activity: 'idle',
    hours: [7, 19],
    lines: { any: ['Stand. Breathe. Nothing crosses the line.'] },
    look: {
      body: 'male',
      outfit: 'ranger',
      hair: 'buzzed',
      beard: true,
      hairColor: 0x3a2618,
      skin: 0xa8744e,
      cloth: 0xc9d6e6,
      pauldron: true,
      height: 1.95,
    },
  },
  {
    id: 'sable',
    name: 'Master Sable Ro',
    title: 'Cross School Instructor',
    post: [2836, 76],
    activity: 'idle',
    hours: [8, 20],
    lines: { any: ['Two blades, one heartbeat.'] },
    look: {
      body: 'female',
      outfit: 'ranger',
      hair: 'long',
      hairColor: 0x1f1a17,
      skin: 0x7a4e32,
      cloth: 0x8a2a3a,
      height: 1.74,
    },
  },
  {
    id: 'mell',
    name: 'Archivist Mell',
    title: 'Keeper of the Academy Library',
    post: [2790.5, 77.5],
    activity: 'sit',
    hours: [8, 22],
    lines: { any: ['Shh. The books are sleeping. Well — I am.'] },
    look: {
      body: 'male',
      outfit: 'peasant',
      hair: 'simpleparted',
      beard: true,
      hairColor: 0xe6e2da,
      skin: 0xfff0e6,
      linen: 0xd9cfe8,
      cloth: 0x4a3a6a,
      height: 1.68,
    },
  },
  {
    id: 'dorian',
    name: 'Cadet Dorian Vale',
    title: 'Cadet · Best Blade of the Year',
    post: [2824, 96],
    activity: 'patrol',
    hours: [7, 21],
    lines: {
      any: [
        'Out of the way, summoned hero.',
        "Marrow says I'm too proud. Marrow is right, and I'm still the best.",
      ],
    },
    look: {
      body: 'male',
      outfit: 'ranger',
      hair: 'simpleparted',
      hairColor: 0xd2b26a,
      skin: 0xfff0e6,
      cloth: 0x2f5f9a,
      height: 1.82,
    },
  },
  {
    id: 'garrot',
    name: 'Weaponsmaster Garrot',
    title: 'Academy Armoury',
    post: [2842, 60],
    activity: 'work',
    hours: [7, 19],
    lines: {
      any: [
        'Spear, axe, greatsword, bow — every weapon is a language. I teach grammar.',
      ],
    },
    look: {
      body: 'male',
      outfit: 'ranger',
      hair: 'buzzed',
      beard: true,
      hairColor: 0x6a4428,
      skin: 0xe0b894,
      cloth: 0x5a5a5a,
      pauldron: true,
      height: 1.9,
    },
  },
  {
    id: 'bruni',
    name: 'Bruni Stonevein',
    title: 'Dwarven Expedition Leader',
    post: [2744, 310],
    activity: 'work',
    hours: [6, 22],
    lines: {
      any: [
        "The White Mountains don't care how brave you are. Bring a lantern.",
      ],
    },
    look: {
      body: 'female',
      outfit: 'ranger',
      hair: 'buns',
      hairColor: 0x8a3f22,
      skin: 0xe0b894,
      cloth: 0x7a5a3a,
      pauldron: true,
      height: 1.4,
    },
  },
  {
    id: 'mira',
    name: 'Mira Vane',
    title: 'Dockmaster',
    post: [2930, 286],
    activity: 'idle',
    hours: [5, 21],
    lines: {
      any: ['Tide turns at noon. Everything turns at noon, down here.'],
    },
    look: {
      body: 'female',
      outfit: 'ranger',
      hair: 'long',
      hairColor: 0x3a2618,
      skin: 0xa8744e,
      cloth: 0x2f7f86,
      hood: true,
      height: 1.72,
    },
  },
  {
    id: 'nell',
    name: 'Old Nell Crabbe',
    title: 'Fish Market · Buys Fish by Weight',
    post: [2912, 294],
    activity: 'talk',
    hours: [5, 18],
    lines: { any: ['Fresh fish! Fresh gossip! Both cheap!'] },
    look: {
      body: 'female',
      outfit: 'peasant',
      hair: 'buns',
      hairColor: 0xb8b4ae,
      skin: 0xe0b894,
      linen: 0xc9dbe8,
      height: 1.56,
    },
  },
  {
    id: 'tallow',
    name: 'Harbourmaster Osric Tallow',
    title: 'Harbourmaster',
    post: [QUAY_X - 7, 186],
    activity: 'idle',
    hours: [6, 20],
    lines: { any: ['Every ship in and out of this harbour passes my desk.'] },
    look: {
      body: 'male',
      outfit: 'peasant',
      hair: 'simpleparted',
      beard: true,
      hairColor: 0x6a6a6a,
      skin: 0xfff0e6,
      linen: 0xe8d8b8,
      cloth: 0x2f3f6a,
      height: 1.8,
    },
  },
  {
    id: 'guildmaster',
    name: 'Wendeline Ashcombe',
    title: 'Guildmaster of the Port Aurelle Hall',
    post: [2746, 254],
    activity: 'idle',
    hours: [7, 22],
    lines: { any: ['Rank is earned on the board, not in the tavern.'] },
    look: {
      body: 'female',
      outfit: 'ranger',
      hair: 'buns',
      hairColor: 0x1f1a17,
      skin: 0x7a4e32,
      cloth: 0x8a3a2a,
      pauldron: true,
      height: 1.76,
    },
  },
  {
    id: 'ragna',
    name: 'Ragna Ironsides',
    title: 'Weaponsmith · Steel Arms',
    post: [2808, 160],
    activity: 'talk',
    hours: [8, 19],
    lines: {
      any: ['Port steel, Aurelle-folded. Better than anything inland.'],
    },
    look: {
      body: 'female',
      outfit: 'ranger',
      hair: 'buzzedfemale',
      hairColor: 0x8a3f22,
      skin: 0xfff0e6,
      cloth: 0x5a5a5a,
      height: 1.78,
    },
  },
  {
    id: 'quill',
    name: 'Quill Mereweather',
    title: 'Alchemist · Fine Draughts',
    post: [2776, 158],
    activity: 'talk',
    hours: [8, 20],
    lines: {
      any: [
        'Stronger draughts than any village apothecary, guaranteed or your hit points back.',
      ],
    },
    look: {
      body: 'male',
      outfit: 'peasant',
      hair: 'long',
      hairColor: 0x3a2618,
      skin: 0xfff0e6,
      linen: 0xd9cfe8,
      cloth: 0x3d7a45,
      height: 1.74,
    },
  },
  {
    id: 'sabeth',
    name: 'Sabeth Lune',
    title: 'Jeweller · Rings and Charms',
    post: [2806, 186],
    activity: 'talk',
    hours: [9, 19],
    lines: { any: ['Every ring is a promise. Some of mine also stop arrows.'] },
    look: {
      body: 'female',
      outfit: 'peasant',
      hair: 'long',
      hairColor: 0xd2b26a,
      skin: 0xe0b894,
      linen: 0xf0e0a8,
      cloth: 0x7a3f8a,
      height: 1.7,
    },
  },
  {
    id: 'bess',
    name: 'Bess Harrow',
    title: 'Keeper of the Salty Anchor',
    post: [2784, 259],
    activity: 'idle',
    hours: [10, 26],
    lines: { any: ['Ale, rum or rumours? Rumours cost extra.'] },
    look: {
      body: 'female',
      outfit: 'peasant',
      hair: 'buns',
      hairColor: 0x6a4428,
      skin: 0xfff0e6,
      linen: 0xe8c8c0,
      height: 1.66,
    },
  },
  {
    id: 'corvina',
    name: 'Lady Corvina Aurelle',
    title: 'Noblewoman of the Upper City',
    post: [2736, 76],
    activity: 'idle',
    hours: [9, 18],
    lines: { any: ['Mind the roses, please. They are older than you.'] },
    look: {
      body: 'female',
      outfit: 'peasant',
      hair: 'long',
      hairColor: 0x1f1a17,
      skin: 0xfff0e6,
      linen: 0xd9cfe8,
      cloth: 0x2f3f7a,
      height: 1.74,
    },
  },
  {
    id: 'hobbs',
    name: 'Jory Hobbs',
    title: 'Ostler · West Gate Stables & Coaches',
    post: [2716, 164],
    activity: 'work',
    hours: [6, 21],
    lines: {
      any: [
        'Coach to the Wayfarer’s Rest and Elder Glen, leaving on the hour.',
      ],
    },
    look: {
      body: 'male',
      outfit: 'ranger',
      hair: 'simpleparted',
      beard: true,
      hairColor: 0x6a4428,
      skin: 0xe0b894,
      cloth: 0x7a5a3a,
      height: 1.8,
    },
  },
  {
    id: 'dice',
    name: 'Delphine “Dice” Coveley',
    title: 'Cardsharp of the Lower City',
    post: [2886, 292],
    activity: 'talk',
    hours: [17, 28],
    lines: {
      any: [
        'Cut the deck? No? Wise.',
        'Everyone in the Lower City owes someone. Mostly me.',
      ],
      evening: [
        'The Lantern’s filling up. Good. Full rooms have loose purses.',
      ],
    },
    look: {
      body: 'female',
      outfit: 'peasant',
      hair: 'long',
      hairColor: 0x8a3f22,
      skin: 0xe0b894,
      linen: 0xe8c8c0,
      cloth: 0x7a2a3a,
      height: 1.68,
    },
  },
  {
    id: 'pim',
    name: 'Little Pim',
    title: 'Runner for the Quiet Hands',
    post: [2866, 306],
    activity: 'idle',
    hours: [9, 23],
    lines: {
      any: [
        'I run messages. Fast ones. Don’t ask what’s in ’em.',
        'The Watch nearly had me in the cistern last week. Nearly.',
      ],
    },
    look: {
      body: 'male',
      outfit: 'peasant',
      hair: 'buzzed',
      hairColor: 0x3a2618,
      skin: 0xa8744e,
      linen: 0xd8c29a,
      height: 1.42,
    },
  },
  {
    id: 'marlo',
    name: 'Slick Marlo',
    title: 'Loiterer by the Drowned Lantern',
    post: [2880, 294],
    activity: 'idle',
    hours: [16, 27],
    lines: { any: ["Never seen you. Never seen anyone. That's my trade."] },
    look: {
      body: 'male',
      outfit: 'ranger',
      hair: 'buzzed',
      hairColor: 0x1f1a17,
      skin: 0xa8744e,
      cloth: 0x2a2a30,
      hood: true,
      height: 1.74,
    },
  },
];

const JOBS: [string, number, ScheduleEntry['activity'], string][] = [
  ['dockworker', 12, 'work', 'harbour'],
  ['sailor', 10, 'talk', 'harbour'],
  ['merchant', 12, 'shop', 'market'],
  ['citizen', 30, 'shop', 'market'],
  ['guard', 8, 'patrol', 'gate'],
  ['cadet', 6, 'patrol', 'academy'],
  ['fisher', 6, 'work', 'wharf'],
  ['smith', 3, 'work', 'forge'],
  ['child', 5, 'play', 'market'],
  ['noble', 4, 'talk', 'gardens'],
  // The Lower City: idlers and dockhands out of work, washerwomen at the canal.
  ['idler', 8, 'talk', 'lowercity'],
  ['washer', 4, 'work', 'lowercity'],
];

export function portResidents(): {
  settlement: Settlement;
  records: NpcRecord[];
} {
  const places = new Map<string, Place>();
  const ring = (cx: number, cz: number, r: number, n: number) =>
    Array.from({ length: n }, (_, i) =>
      v(
        cx + Math.cos((i / n) * Math.PI * 2) * r,
        cz + Math.sin((i / n) * Math.PI * 2) * r,
      ),
    );
  places.set('market', {
    id: 'market',
    spots: ring(MARKET[0], MARKET[1], 11, 16),
  });
  places.set('harbour', {
    id: 'harbour',
    spots: Array.from({ length: 14 }, (_, i) =>
      v(QUAY_X - 3 - (i % 3), 60 + i * 18),
    ),
  });
  places.set('gate', {
    id: 'gate',
    spots: [
      v(2708, 144),
      v(2708, 157),
      v(2792, 150),
      v(2860, 180),
      v(2940, 70),
    ],
  });
  places.set('academy', { id: 'academy', spots: ring(2822, 84, 10.5, 8) });
  places.set('wharf', {
    id: 'wharf',
    spots: [v(2918, 304), v(2924, 306), v(2912, 302), v(QUAY_X + 6, 314)],
  });
  places.set('forge', {
    id: 'forge',
    spots: [v(2884, 36), v(2888, 36), v(2910, 54)],
  });
  places.set('gardens', {
    id: 'gardens',
    spots: [v(2740, 84), v(2760, 70), v(2728, 80)],
  });
  places.set('tavern', { id: 'tavern', spots: ring(2784, 264, 3.5, 6) });
  places.set('homes', {
    id: 'homes',
    spots: ring(2830, 250, 30, 12),
    indoors: true,
  });
  places.set('lowercity', {
    id: 'lowercity',
    spots: [
      v(2868, 296),
      v(2872, 292),
      v(2878, 292),
      v(2884, 296),
      v(2890, 294),
      v(2862, 300),
      v(2866, 311),
      v(2892, 309),
    ],
  });

  const records: NpcRecord[] = [];
  for (const n of NAMED) {
    const relocation: Record<string, [number, number]> = {
      bruni: AURELLE.forgeOffice,
      guildmaster: AURELLE.guildHall,
      mira: [2934, 306],
      tallow: [2922, 184],
      ragna: [2886, 35],
      mell: [2790.5, 77.5],
    };
    const post = relocation[n.id] ?? n.post;
    const id = 'post:' + n.id;
    places.set(id, { id, spots: [v(post[0], post[1])], yaw: n.yaw });
    const [a, b] = n.hours;
    const schedule: ScheduleEntry[] =
      b > 24
        ? [
            { from: 0, activity: n.activity, place: id },
            { from: b - 24, activity: 'sleep', place: 'homes' },
            { from: a, activity: n.activity, place: id },
          ]
        : [
            { from: 0, activity: 'sleep', place: 'homes' },
            { from: a, activity: n.activity, place: id },
            { from: b, activity: 'drink', place: 'tavern' },
            {
              from: Math.min(23.8, b + 2.5),
              activity: 'sleep',
              place: 'homes',
            },
          ];
    records.push({
      id: n.id,
      name: n.name,
      title: n.title,
      job: n.id,
      settlement: 'portAurelle',
      look: n.look,
      schedule,
      lines: n.lines,
      named: true,
    });
  }
  for (const n of EXTRA_RESIDENTS) {
    const id = 'post:' + n.id;
    places.set(id, { id, spots: [v(...n.post)] });
    records.push({
      id: n.id,
      name: n.name,
      title: n.title,
      job: n.id,
      settlement: 'portAurelle',
      named: true,
      look: n.look,
      lines: n.lines,
      schedule: [
        { from: 0, activity: 'sleep', place: 'homes' },
        { from: 6, activity: n.activity, place: id },
        { from: 20, activity: 'drink', place: 'tavern' },
        { from: 23, activity: 'sleep', place: 'homes' },
      ],
    });
  }
  places.set('kitchen', {
    id: 'kitchen',
    spots: [v(2888, 326), v(2896, 326), v(2892, 322)],
  });
  places.set('drydock', {
    id: 'drydock',
    spots: [v(2912, 54), v(2916, 42), v(2912, 32)],
  });
  places.set('arrival', {
    id: 'arrival',
    spots: [v(2722, 172), v(2726, 178), v(2718, 182)],
  });
  places.set('lanternTavern', {
    id: 'lanternTavern',
    spots: ring(2880, 291, 4, 8),
  });
  const rnd = mulberry32(2761);
  const FIRST = [
    'Alden',
    'Brenna',
    'Cyril',
    'Delphine',
    'Emeric',
    'Fiora',
    'Gideon',
    'Helsa',
    'Ivor',
    'Jessamy',
    'Kellan',
    'Linnet',
    'Mathis',
    'Nerys',
    'Oren',
    'Perrin',
    'Rowena',
    'Soren',
    'Tamsin',
    'Ulric',
    'Vesna',
    'Wystan',
  ];
  const FAM = [
    'Tidewell',
    'Saltmarsh',
    'Harbourne',
    'Quayle',
    'Brightwater',
    'Gullstone',
    'Netherby',
    'Coveley',
    'Shorefield',
    'Marlowe',
  ];
  let k = 0;
  for (const [job, count, activity, place] of JOBS) {
    for (let i = 0; i < count; i++, k++) {
      const female = rnd() < 0.5;
      const look: Look = {
        body: job === 'washer' || female ? 'female' : 'male',
        outfit:
          job === 'guard' || job === 'cadet' || job === 'sailor'
            ? 'ranger'
            : 'peasant',
        hair: female
          ? (['long', 'buns', 'buzzedfemale'] as const)[Math.floor(rnd() * 3)]
          : (['simpleparted', 'buzzed'] as const)[Math.floor(rnd() * 2)],
        beard: !female && rnd() < 0.35,
        hairColor: [0x1f1a17, 0x3a2618, 0x6a4428, 0x8a3f22, 0xd2b26a, 0xb8b4ae][
          Math.floor(rnd() * 6)
        ],
        skin: [0xfff0e6, 0xffffff, 0xe0b894, 0xa8744e, 0x7a4e32][
          Math.floor(rnd() * 5)
        ],
        linen: [0xe8d8b8, 0xc9dbe8, 0xd8c29a, 0xe8c8c0, 0xd9cfe8][
          Math.floor(rnd() * 5)
        ],
        cloth:
          job === 'guard' || job === 'cadet'
            ? 0x2f5f9a
            : job === 'sailor'
              ? 0x2f4a6a
              : job === 'noble'
                ? [0x7a3f8a, 0x2f3f7a, 0x8a2a3a][Math.floor(rnd() * 3)]
                : undefined,
        pauldron: job === 'guard',
        height:
          job === 'child'
            ? 1.28
            : female
              ? 1.62 + rnd() * 0.1
              : 1.72 + rnd() * 0.12,
      };
      const j = (h: number) => h + (rnd() - 0.5);
      const schedule: ScheduleEntry[] =
        job === 'guard'
          ? [
              { from: 0, activity: 'patrol', place: 'gate' },
              {
                from: j(6),
                activity: 'patrol',
                place: i % 2 ? 'harbour' : 'market',
              },
              { from: j(18), activity: 'patrol', place: 'gate' },
            ]
          : [
              { from: 0, activity: 'sleep', place: 'homes' },
              {
                from: j(job === 'fisher' || job === 'dockworker' ? 5.5 : 8),
                activity,
                place,
              },
              { from: j(12.5), activity: 'talk', place: 'market' },
              { from: j(13.5), activity, place },
              { from: j(18.5), activity: 'drink', place: 'tavern' },
              { from: j(22), activity: 'sleep', place: 'homes' },
            ];
      if (job === 'citizen' || job === 'child') {
        schedule[1].place =
          i % 3 === 0 ? 'wharf' : i % 3 === 1 ? 'lowercity' : 'market';
        schedule[3].place = schedule[1].place;
      }
      if (job === 'dockworker') {
        schedule[1].place = i % 3 === 0 ? 'drydock' : 'harbour';
        schedule[3].place = schedule[1].place;
      }
      if (job === 'fisher') {
        schedule[4].place = 'kitchen';
      }
      if (job === 'idler' || job === 'washer') {
        schedule[4].place = 'lanternTavern';
      }
      records.push({
        id: 'pa-' + k,
        name: `${FIRST[k % FIRST.length]} ${FAM[(k * 3) % FAM.length]}`,
        title: job.charAt(0).toUpperCase() + job.slice(1) + ' of Port Aurelle',
        job,
        settlement: 'portAurelle',
        look,
        schedule,
        lines: PORT_LINES[job],
      });
    }
  }
  const graph = cityGraph(places);
  return {
    settlement: {
      id: 'portAurelle',
      name: 'Port Aurelle',
      center: v(CITY_CENTERX, CITY_CENTERZ),
      radius: 240,
      places,
      nodes: graph.nodes,
      edges: graph.edges,
    },
    records,
  };
}

const [CITY_CENTERX, CITY_CENTERZ] = CITY_CENTER;

const PORT_LINES: Record<string, NpcRecord['lines']> = {
  dockworker: {
    any: [
      'Lift with the legs. Always the legs.',
      'Three ships in from the Azure Isles today. My back knows it.',
    ],
  },
  sailor: {
    any: [
      'Been round the Shattered Isles twice. Never again.',
      "The sea's kind in summer. Liar, the sea.",
    ],
  },
  merchant: {
    any: [
      'Silks! Spices! Salt from the flats!',
      'Everything in Port Aurelle is for sale, and half of it is fairly priced.',
    ],
  },
  citizen: {
    any: [
      'Lovely day for the market.',
      'Have you seen the new ship in the harbour? Big as a church.',
    ],
  },
  guard: {
    any: ['Keep the peace, keep moving.', 'The Watch sees everything. Mostly.'],
  },
  cadet: {
    any: [
      "Squire's Oath in the spring, if Marrow lets me.",
      'Have you fought Dorian yet? Nobody beats Dorian.',
    ],
  },
  fisher: {
    any: [
      "Mackerel's running. Bream if you're patient.",
      'Strike when the float dips, not when it wobbles.',
    ],
  },
  smith: { any: ['Hot iron waits for no one.'] },
  child: { any: ['Race you to the lighthouse!'] },
  noble: {
    any: [
      'Do mind the hem.',
      "The Governor's ball is next week. One simply must.",
    ],
  },
  idler: {
    any: [
      'Ships don’t need hands like they used to.',
      'Watch your purse round here. Not from me. Probably.',
    ],
    evening: ['The Lantern’s pouring cheap tonight.'],
    night: ['Nothing to see. Move along.'],
  },
  washer: {
    any: [
      'Canal water’s no good for whites. Try telling the Upper City that.',
      'Mind the lines, love, those are the Governor’s shirts.',
    ],
  },
};

/** Walking graph from the city streets (subdivided, junctions merged, spots hooked on). */
function cityGraph(places: Map<string, Place>) {
  const nodes: THREE.Vector3[] = [];
  const edges: number[][] = [];
  const nodeAt = (x: number, z: number) => {
    for (let i = 0; i < nodes.length; i++)
      if (Math.hypot(nodes[i].x - x, nodes[i].z - z) < 3.5) return i;
    nodes.push(v(x, z));
    edges.push([]);
    return nodes.length - 1;
  };
  const link = (a: number, b: number) => {
    if (a === b) return;
    if (!edges[a].includes(b)) edges[a].push(b);
    if (!edges[b].includes(a)) edges[b].push(a);
  };
  for (const line of CITY_STREETS) {
    for (let k = 1; k < line.length; k++) {
      const [ax, az] = line[k - 1],
        [bx, bz] = line[k];
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 12));
      let prev = nodeAt(ax, az);
      for (let s = 1; s <= n; s++) {
        const cur = nodeAt(ax + ((bx - ax) * s) / n, az + ((bz - az) * s) / n);
        link(prev, cur);
        prev = cur;
      }
    }
  }
  for (const p of places.values())
    for (const s of p.spots) {
      let best = 0,
        bd = Infinity;
      nodes.forEach((n, i) => {
        const d = n.distanceToSquared(s);
        if (d < bd) ((bd = d), (best = i));
      });
      link(nodeAt(s.x, s.z), best);
    }
  return { nodes, edges };
}

const portLook = (cloth: number, female = false): Look => ({
  body: female ? 'female' : 'male',
  outfit: 'peasant',
  hair: female ? 'buns' : 'simpleparted',
  cloth,
  linen: 0xe8d8b8,
  skin: 0xe0b894,
  height: 1.75,
});
const EXTRA_RESIDENTS: Named[] = [
  {
    id: 'aurelle-navigator',
    name: 'Orren Salt',
    title: 'Bess’s Old Navigator',
    post: [2792, 264],
    activity: 'sit',
    hours: [6, 20],
    look: portLook(0x405976),
    lines: { any: ['She kept my place. Twelve years, and she kept my place.'] },
  },
  {
    id: 'aurelle-returned-1',
    name: 'Hester Gullstone',
    title: 'Returned Crew · The Brightwater',
    post: [2935, 188],
    activity: 'talk',
    hours: [6, 20],
    look: portLook(0x3d7a79, true),
    lines: {
      any: [
        'I saw the right light come on. We all did. Nobody spoke until we were between the piers.',
      ],
    },
  },
  {
    id: 'aurelle-returned-2',
    name: 'Tomas Brightwater',
    title: 'Returned Crew · The Brightwater',
    post: [2934, 192],
    activity: 'talk',
    hours: [6, 20],
    look: portLook(0x6f7f9b),
    lines: {
      any: [
        'Maren said there was a bowl waiting. I thought about that bowl all the way in.',
      ],
    },
  },

  {
    id: 'aurelle-keeper',
    name: 'Edda Fen',
    title: 'Keeper of the Aurelle Light',
    post: [2922, 24],
    activity: 'work',
    hours: [6, 20],
    look: portLook(0x627b93, true),
    lines: {
      any: [
        'A light is a promise to someone you cannot see. Mine has been lying.',
      ],
    },
  },
  {
    id: 'aurelle-apprentice',
    name: 'Tessa Reed',
    title: 'Apprentice Shipwright',
    post: [2912, 52],
    activity: 'work',
    hours: [6, 20],
    look: portLook(0x447f79, true),
    lines: {
      any: [
        'That frame is wrong. Barrow says it will settle. Wood does not settle sideways.',
      ],
    },
  },
  {
    id: 'aurelle-cook',
    name: 'Maren Crabbe',
    title: 'Netters’ Communal Kitchen',
    post: [2892, 326],
    activity: 'work',
    hours: [6, 20],
    look: portLook(0xb17b4d, true),
    lines: {
      any: [
        'A pot for every boat, a bowl for every family. Even the empty berths.',
      ],
    },
  },
  {
    id: 'aurelle-factor',
    name: 'Factor Veyla Renn',
    title: 'Renn Maritime Company',
    post: [2890, 128],
    activity: 'talk',
    hours: [6, 20],
    look: portLook(0x713e64, true),
    lines: {
      any: ['We insure the cargo, traveller. The sea takes care of the rest.'],
    },
  },
  {
    id: 'aldric-aurelle',
    name: 'Aldric Aurelle',
    title: 'Corvina’s Son',
    post: [2738, 80],
    activity: 'sit',
    hours: [6, 20],
    look: portLook(0x526b97),
    lines: {
      any: [
        'I thought everyone down there was playing the same game. I was wrong.',
      ],
    },
  },
];
