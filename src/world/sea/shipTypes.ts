// Hulls and upgrades (docs/design/boating.md §4 and §12): one ladder from a
// skiff to a galleon, each with its own feel, and upgrades in eight slots
// bought at the Aurelle Shipwrights. Pure data.

export type HullId = 'skiff' | 'sloop' | 'cutter' | 'brigantine' | 'galleon';
export type ModelKind = 'skiff' | 'fishing' | 'sloop' | 'merchant' | 'naval' | 'galleon';

export interface HullDef {
  id: HullId;
  name: string;
  model: ModelKind;
  desc: string;
  /** Seamanship level needed to own and command it */
  level: number;
  price: number;
  /** a day's hire (Mira, the harbour) and the deposit you lose if it sinks */
  rent: number;
  deposit: number;
  /** best speed on a beam reach in a fresh breeze (m/s) */
  speed: number;
  accel: number;
  /** turn rate at speed (rad/s) */
  turn: number;
  /** hit points of each hull section (bow, midships, stern) and the sails */
  hull: number;
  sails: number;
  /** wave height (m) it shrugs off; above it, it ships water and gets thrown about */
  seaworthy: number;
  /** crew to sail it well (fewer = slower, sails set slowly), and room aboard */
  crewMin: number;
  crewMax: number;
  cargo: number;
  draft: number;
  /** cannons each side at most, harpoon mounts */
  guns: number;
  harpoons: number;
  /** model scale: length and beam (m), deck height above the water, where the helm stands (local z) */
  length: number;
  beam: number;
  deckY: number;
  helmZ: number;
  /** capsizes when heeled past this (small boats only) */
  capsize: number | null;
}

export const HULLS: Record<HullId, HullDef> = {
  skiff: {
    id: 'skiff', name: 'Skiff', model: 'skiff', desc: 'A one-sail dinghy: quick, twitchy, and honest. Tips if you’re careless.',
    level: 1, price: 180, rent: 25, deposit: 60, speed: 6, accel: 1.4, turn: 0.75, hull: 60, sails: 40, seaworthy: 1.1,
    crewMin: 0, crewMax: 1, cargo: 4, draft: 0.5, guns: 0, harpoons: 0, length: 4.2, beam: 1.6, deckY: 0.35, helmZ: -1.3, capsize: 0.95,
  },
  sloop: {
    id: 'sloop', name: 'Fishing Sloop', model: 'fishing', desc: 'Broad, stable and forgiving, with a net winch and a live-well. A first real boat.',
    level: 5, price: 650, rent: 60, deposit: 200, speed: 7, accel: 1.1, turn: 0.55, hull: 130, sails: 80, seaworthy: 2.1,
    crewMin: 1, crewMax: 3, cargo: 12, draft: 1.0, guns: 0, harpoons: 1, length: 7, beam: 2.4, deckY: 1.05, helmZ: -2.6, capsize: 1.15,
  },
  cutter: {
    id: 'cutter', name: 'Cutter', model: 'sloop', desc: 'Fast and lively: the racer’s and the courier’s choice. Two swivel guns.',
    level: 10, price: 1700, rent: 140, deposit: 500, speed: 10, accel: 1.0, turn: 0.5, hull: 220, sails: 130, seaworthy: 3.2,
    crewMin: 2, crewMax: 5, cargo: 10, draft: 1.4, guns: 1, harpoons: 1, length: 12, beam: 3.6, deckY: 1.85, helmZ: -4.6, capsize: null,
  },
  brigantine: {
    id: 'brigantine', name: 'Brigantine', model: 'merchant', desc: 'Two masts and a deep hold: a trader by day, a privateer by need.',
    level: 15, price: 4400, rent: 0, deposit: 0, speed: 9, accel: 0.75, turn: 0.36, hull: 420, sails: 240, seaworthy: 5,
    crewMin: 4, crewMax: 9, cargo: 40, draft: 2.4, guns: 4, harpoons: 2, length: 18, beam: 5.4, deckY: 2.8, helmZ: -6.8, capsize: null,
  },
  galleon: {
    id: 'galleon', name: 'Galleon', model: 'galleon', desc: 'A floating fortress: three masts, two gun decks, and the hull to cross the Grand Ocean.',
    level: 20, price: 13000, rent: 0, deposit: 0, speed: 8, accel: 0.55, turn: 0.26, hull: 800, sails: 420, seaworthy: 9,
    crewMin: 8, crewMax: 16, cargo: 120, draft: 4, guns: 8, harpoons: 4, length: 26, beam: 7.8, deckY: 4.1, helmZ: -9.6, capsize: null,
  },
};
export const HULL_ORDER: HullId[] = ['skiff', 'sloop', 'cutter', 'brigantine', 'galleon'];

// ---- upgrades -----------------------------------------------------------------------------

export type Slot = 'sails' | 'hull' | 'keel' | 'guns' | 'harpoon' | 'pumps' | 'figurehead' | 'hold';

export interface UpgradeTier {
  name: string;
  price: number;
  desc: string;
  /** smallest hull it fits (by HULL_ORDER index) */
  minHull?: number;
  /** a material it needs as well as gold */
  needs?: [string, number];
  fx: Partial<{
    speed: number; // multiplier
    turn: number;
    hull: number; // multiplier on section hit points
    sails: number;
    seaworthy: number; // multiplier
    leeway: number; // multiplier (lower is better)
    guns: number; // cannons a side (capped by the hull)
    calibre: number; // damage multiplier
    harpoon: number; // 1 harpoon, 2 heavy harpoon
    pump: number; // multiplier on bailing
    cargo: number; // multiplier
    morale: number; // crew morale bonus
    monster: number; // monster damage taken (multiplier)
    fame: number;
  }>;
}

/** Tier 0 of every slot is what a new hull comes with. */
export const UPGRADES: Record<Slot, { label: string; tiers: UpgradeTier[] }> = {
  sails: { label: 'Sails', tiers: [
    { name: 'Canvas', price: 0, desc: 'Plain cotton canvas.', fx: {} },
    { name: 'Tarred Canvas', price: 120, desc: 'Holds its shape in a blow. +8% speed, sails take 25% more punishment.', fx: { speed: 1.08, sails: 1.25 } },
    { name: 'Silk-weave', price: 650, desc: 'Light and strong. +16% speed, +10% handling.', minHull: 1, fx: { speed: 1.16, turn: 1.1, sails: 1.4 } },
    { name: 'Elven Sailcloth', price: 2400, desc: 'Woven in the Verdant Woods; it drinks the wind. +26% speed, +20% handling.', minHull: 2, needs: ['moongrass', 6], fx: { speed: 1.26, turn: 1.2, sails: 1.7 } },
    { name: 'Stormwyrm Silk', price: 5200, desc: 'Sailcloth shot with Storm Wyrm scale. +34% speed, sails nearly untearable, storms throw her less.', minHull: 2, needs: ['wyrmScale', 3], fx: { speed: 1.34, turn: 1.22, sails: 2.4, seaworthy: 1.1 } },
  ] },
  hull: { label: 'Hull', tiers: [
    { name: 'Oak Planking', price: 0, desc: 'Good Cresha oak.', fx: {} },
    { name: 'Copper Sheathing', price: 260, desc: 'No barnacles, no worm. +25% hull, +4% speed.', fx: { hull: 1.25, speed: 1.04 } },
    { name: 'Iron-banded Hull', price: 1100, desc: 'Iron straps from keel to rail. +60% hull, a little slower.', minHull: 1, fx: { hull: 1.6, speed: 0.97, seaworthy: 1.08 } },
    { name: 'Serpent-scale Plating', price: 3600, desc: 'Plates from a sea serpent’s back. +110% hull, monsters do a third less.', minHull: 2, needs: ['serpentScale', 4], fx: { hull: 2.1, monster: 0.66, seaworthy: 1.12 } },
    { name: 'Colossus-shell Armour', price: 6400, desc: 'Serpent plating, with a Crab Colossus\'s shell over the bow and waterline. +160% hull, monsters do half.', minHull: 3, needs: ['colossusShell', 4], fx: { hull: 2.6, monster: 0.5, seaworthy: 1.15, speed: 0.98 } },
  ] },
  keel: { label: 'Keel', tiers: [
    { name: 'Standard Keel', price: 0, desc: 'It keeps the boat upright, mostly.', fx: {} },
    { name: 'Deep Keel', price: 220, desc: 'Less sideways slip, steadier in a seaway. Waves throw you 20% less.', fx: { leeway: 0.6, seaworthy: 1.2 } },
    { name: 'Ballasted Keel', price: 900, desc: 'Lead in the keel. Waves throw you 45% less; slower to turn.', minHull: 1, fx: { leeway: 0.45, seaworthy: 1.45, turn: 0.93 } },
    { name: 'Leviathan-bone Keel', price: 7000, desc: 'A keel of the Leviathan\'s barbs: she rides out seas twice what any hull should, and hardly slips at all.', minHull: 3, needs: ['leviathanBone', 2], fx: { leeway: 0.3, seaworthy: 2, turn: 0.97 } },
  ] },
  guns: { label: 'Guns', tiers: [
    { name: 'No guns', price: 0, desc: 'Peaceful, and helpless.', fx: { guns: 0 } },
    { name: 'Swivel guns', price: 300, desc: 'One light gun a side.', minHull: 2, fx: { guns: 1, calibre: 0.7 } },
    { name: 'Six-pounders', price: 1200, desc: 'Up to four guns a side.', minHull: 3, fx: { guns: 4, calibre: 1 } },
    { name: 'Twelve-pounders', price: 3400, desc: 'Up to eight heavy guns a side.', minHull: 3, fx: { guns: 8, calibre: 1.45 } },
  ] },
  harpoon: { label: 'Harpoon', tiers: [
    { name: 'No harpoon', price: 0, desc: '', fx: { harpoon: 0 } },
    { name: 'Harpoon gun', price: 240, desc: 'A barbed line for big fish and sea monsters.', minHull: 1, fx: { harpoon: 1 } },
    { name: 'Heavy harpoon', price: 950, desc: 'Twice the bite, a line that won’t snap.', minHull: 2, fx: { harpoon: 2 } },
  ] },
  pumps: { label: 'Pumps', tiers: [
    { name: 'Hand pump', price: 0, desc: 'A bucket and a prayer.', fx: {} },
    { name: 'Chain pump', price: 180, desc: 'Bails 60% faster.', fx: { pump: 1.6 } },
    { name: 'Dwarven pump', price: 1300, desc: 'Brass and steam: bails two and a half times faster.', minHull: 1, fx: { pump: 2.5 } },
  ] },
  figurehead: { label: 'Figurehead', tiers: [
    { name: 'Bare stem', price: 0, desc: '', fx: {} },
    { name: 'Mermaid', price: 200, desc: 'Sailors love her. Crew morale up.', fx: { morale: 0.15 } },
    { name: 'Kraken', price: 700, desc: 'The sea’s monsters think twice. 15% less monster damage.', minHull: 1, fx: { monster: 0.85 } },
    { name: 'Golden Lion', price: 1800, desc: 'Pirates think twice too; ports cheer. Morale and fame.', minHull: 2, fx: { morale: 0.25, fame: 1 } },
    { name: 'The Kraken\'s Eye', price: 3000, desc: 'A great eye painted in kraken ink. Monsters do 40% less and pirates lose their nerve.', minHull: 2, needs: ['krakenInk', 3], fx: { monster: 0.6, morale: 0.2, fame: 1 } },
  ] },
  hold: { label: 'Hold', tiers: [
    { name: 'Standard hold', price: 0, desc: '', fx: {} },
    { name: 'Extended hold', price: 250, desc: '+40% cargo.', fx: { cargo: 1.4 } },
    { name: 'Smuggler’s hold', price: 900, desc: '+80% cargo, and the customs cutter looks the other way.', minHull: 1, fx: { cargo: 1.8 } },
  ] },
};
export const SLOTS = Object.keys(UPGRADES) as Slot[];

export type Fit = Record<Slot, number>;
export const STOCK_FIT = (): Fit => ({ sails: 0, hull: 0, keel: 0, guns: 0, harpoon: 0, pumps: 0, figurehead: 0, hold: 0 });

/** A hull's numbers with its upgrades applied. */
export function shipStats(id: HullId, fit: Fit) {
  const h = HULLS[id];
  let speed = 1, turn = 1, hull = 1, sails = 1, seaworthy = 1, leeway = 1, calibre = 1, pump = 1, cargo = 1, morale = 0, monster = 1, fame = 0;
  let guns = 0, harpoon = 0;
  for (const slot of SLOTS) {
    const fx = UPGRADES[slot].tiers[fit[slot] ?? 0]?.fx ?? {};
    speed *= fx.speed ?? 1;
    turn *= fx.turn ?? 1;
    hull *= fx.hull ?? 1;
    sails *= fx.sails ?? 1;
    seaworthy *= fx.seaworthy ?? 1;
    leeway *= fx.leeway ?? 1;
    calibre *= fx.calibre ?? 1;
    pump *= fx.pump ?? 1;
    cargo *= fx.cargo ?? 1;
    morale += fx.morale ?? 0;
    monster *= fx.monster ?? 1;
    fame += fx.fame ?? 0;
    if (fx.guns !== undefined) guns = fx.guns;
    if (fx.harpoon !== undefined) harpoon = fx.harpoon;
  }
  return {
    speed: h.speed * speed, turn: h.turn * turn, hull: Math.round(h.hull * hull), sails: Math.round(h.sails * sails), seaworthy: h.seaworthy * seaworthy,
    leeway, guns: Math.min(guns, h.guns), calibre, harpoon: Math.min(harpoon, h.harpoons > 0 ? 2 : 0), pump, cargo: Math.round(h.cargo * cargo), morale, monster, fame,
  };
}
export type ShipStats = ReturnType<typeof shipStats>;
