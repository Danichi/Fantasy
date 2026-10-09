import type { NodeEffect } from '../../paths/effects';
import { DISC } from '../../paths/data';
import { treeOf, type Paths } from '../../paths/paths';

// ---------------------------------------------------------------------------
// The Dungeoneering calling made real (docs/design/dungeons.md §4). What each
// node does in a dungeon, read straight from the player's learned nodes:
//
//   L1  Torchbearer         your light reaches further; a new room flares into view
//   L5  Cartographer's Eye  the automap: rooms you've seen ink themselves on the map
//   L5  Trap Sense          traps within 8 m are outlined
//   L10 Delver's Sense      false walls and hidden levers shimmer within 10 m
//   L10 Light Feet          pressure plates don't fire under you at a walk
//   L15 Treasure Nose       chests show on the map; +20% dungeon loot
//   L20 Deep Breath         gas traps and bad air don't hurt you
//   L25 Master Delver       once per dungeon, open any locked door without its key
//
// Plus the smaller nodes around them (Sure Step, Wary, Deep Lungs, Keen Nose,
// Lucky Find, Night Sight, Sense the Boss). The Skills screen shows the text
// from DUNGEONEERING_PASSIVES, spread into paths/effects.ts's PASSIVES.
// ---------------------------------------------------------------------------

export const DUNGEONEERING_PASSIVES: Record<string, NodeEffect> = {
  'dungeoneering:Torchbearer': { text: 'Your light reaches 50% further underground, and each new room flares into view as you enter it', x: { torchbearer: 1 } },
  'dungeoneering:Sure Step': { text: 'Traps deal 25% less damage to you', x: { trapDmg: -0.25 } },
  "dungeoneering:Cartographer's Eye": { text: 'Automap: rooms you have seen ink themselves onto your dungeon map (switch it off on the map)', x: { automap: 1 } },
  'dungeoneering:Deep Lungs': { text: 'Gas and bad air hurt you half as much', x: { gasDmg: -0.5 } },
  "dungeoneering:Delver's Sense": { text: 'False walls and hidden levers shimmer within 10 m', x: { delverSense: 1 } },
  'dungeoneering:Crawlspace': { text: 'Secrets you find count double towards Dungeoneering mastery', x: { secretMastery: 1 } },
  'dungeoneering:Night Sight': { text: 'The dark is kinder: dungeons are a little brighter around you', x: { nightSight: 1 } },
  'dungeoneering:Deep Breath': { text: 'Gas traps and bad air do not hurt you at all', x: { deepBreath: 1 } },
  'dungeoneering:Sense the Boss': { text: 'The boss\'s chamber is marked on your map from the moment you enter its floor', x: { senseBoss: 1 } },
  'dungeoneering:Master Delver': { text: 'Once in each dungeon, open any locked door or gate without its key', x: { masterDelver: 1 } },
  'dungeoneering:Wary': { text: 'Traps deal 15% less damage to you', x: { trapDmg: -0.15 } },
  'dungeoneering:Trap Sense': { text: 'Traps within 8 m are outlined, and you can disarm the ones you see', x: { trapSense: 1 } },
  'dungeoneering:Light Feet': { text: 'Pressure plates do not fire under you while you walk (sprinting still sets them off)', x: { lightFeet: 1 } },
  'dungeoneering:Keen Nose': { text: 'Unopened chests glint within 12 m', x: { keenNose: 1 } },
  'dungeoneering:Lucky Find': { text: '+10% gold from dungeon chests', x: { lootMul: 0.1 } },
  'dungeoneering:Treasure Nose': { text: 'Chests show on your dungeon map, and dungeon chests hold 20% more', x: { treasureNose: 1, lootMul: 0.2 } },
};

export interface DelverPerks {
  learned: boolean;
  torchbearer: boolean;
  automap: boolean;
  trapSense: boolean;
  delverSense: boolean;
  lightFeet: boolean;
  treasureNose: boolean;
  keenNose: boolean;
  deepBreath: boolean;
  masterDelver: boolean;
  nightSight: boolean;
  senseBoss: boolean;
  secretMastery: boolean;
  /** multipliers: trap damage, gas damage, chest gold */
  trapDmg: number;
  gasDmg: number;
  lootMul: number;
}

/** What the player's Dungeoneering nodes add up to. `origin` lets the elf's Keen Sight and the dwarf's Deep Sense see secrets too. */
export function perksOf(paths: Paths, origin?: string): DelverPerks {
  const x: Record<string, number> = {};
  const d = DISC['dungeoneering'];
  const t = d ? treeOf(d) : null;
  if (t && paths.learned('dungeoneering')) {
    for (const [nid, v] of Object.entries(paths.nodes['dungeoneering'] ?? {})) {
      const n = t.map[nid];
      if (!n) continue;
      const name = n.type === 'choice' ? n.name.split('|')[v.pick ?? 0] : n.name;
      const e = DUNGEONEERING_PASSIVES[`dungeoneering:${name}`];
      for (const [k, val] of Object.entries(e?.x ?? {})) x[k] = (x[k] ?? 0) + val;
    }
  }
  const on = (k: string) => (x[k] ?? 0) > 0;
  const keenEyes = origin === 'elf' || origin === 'dwarf';
  return {
    learned: paths.learned('dungeoneering'),
    torchbearer: on('torchbearer'),
    automap: on('automap'),
    trapSense: on('trapSense'),
    delverSense: on('delverSense') || keenEyes,
    lightFeet: on('lightFeet'),
    treasureNose: on('treasureNose'),
    keenNose: on('keenNose') || on('treasureNose'),
    deepBreath: on('deepBreath'),
    masterDelver: on('masterDelver'),
    nightSight: on('nightSight'),
    senseBoss: on('senseBoss'),
    secretMastery: on('secretMastery'),
    trapDmg: Math.max(0.2, 1 + (x.trapDmg ?? 0)),
    gasDmg: on('deepBreath') ? 0 : Math.max(0, 1 + (x.gasDmg ?? 0)),
    lootMul: 1 + (x.lootMul ?? 0),
  };
}

/** Dungeoneering mastery (the calling's "how": explore, map, find secrets, disarm traps). */
export function addMastery(paths: Paths, n: number) {
  if (!paths.learned('dungeoneering') || n <= 0) return;
  paths.mx['dungeoneering'] = (paths.mx['dungeoneering'] ?? 0) + n;
}
