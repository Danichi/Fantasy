// The Seamanship calling (docs/design/boating.md §10): Seamanship levels come
// from sailing well, fighting at sea, weathering storms and diving; each level
// past the first is a point to spend in seven branches. Nodes open in tiers by
// level (1, 5, 10, 15, 20) and each branch ends in a capstone at 25. Pure data
// plus `seaPerks()`, the numbers the rest of the sea reads.

export type Branch = 'helmsman' | 'navigator' | 'rigger' | 'gunnery' | 'captain' | 'diver' | 'angler';

export interface SeaNode {
  id: string;
  branch: Branch;
  name: string;
  desc: string;
  /** Seamanship level needed */
  level: number;
  /** ranks you can buy (each costs `cost`) */
  ranks: number;
  cost: number;
  capstone?: boolean;
}

export const BRANCHES: { id: Branch; name: string; blurb: string }[] = [
  { id: 'helmsman', name: 'Helmsman', blurb: 'Handling: clean tacks, reading the waves, keeping her head in a storm.' },
  { id: 'navigator', name: 'Navigator', blurb: 'Where to go: charts, stars, weather and currents.' },
  { id: 'rigger', name: 'Rigger', blurb: 'The sails: trim, reefing, repairs at sea.' },
  { id: 'gunnery', name: 'Gunnery', blurb: 'Naval combat: faster guns, special shot, the harpoon, monster lore.' },
  { id: 'captain', name: 'Captain', blurb: 'Crew and command: bigger crews, boarding, prizes, a consort ship.' },
  { id: 'diver', name: 'Diver', blurb: 'In the water: breath, swimming, armour, pearls.' },
  { id: 'angler', name: 'Deep Angler', blurb: 'Trawl nets, shoals, big game and the fish of legend.' },
];

const N = (branch: Branch, id: string, name: string, level: number, desc: string, ranks = 1, cost = 1, capstone = false): SeaNode => ({ id, branch, name, desc, level, ranks, cost, capstone });

export const SEA_NODES: SeaNode[] = [
  // Helmsman
  N('helmsman', 'steadyHand', 'Steady Hand', 1, 'Tack window +25% and turning +5% per rank.', 3),
  N('helmsman', 'waveReader', 'Wave Reader', 5, 'The helm shows the safe angle to meet the seas; surfing a wave gives a bigger surge.'),
  N('helmsman', 'stormHand', 'Storm Hand', 10, 'Waves throw you 20% less and kick your bow 20% less, per rank.', 2),
  N('helmsman', 'rockSense', 'Rock Sense', 15, 'Shallows are called out before you hit them; groundings do 60% less damage.'),
  N('helmsman', 'surfRider', 'Surf Rider', 20, 'Running before a sea, every wave you catch carries you further.'),
  N('helmsman', 'wavebreaker', 'Wavebreaker', 25, 'Once a voyage, a broach or capsize is shrugged off as if it never happened.', 1, 2, true),
  // Navigator
  N('navigator', 'compass', 'Compass and Log', 1, 'The helm shows your heading in degrees and the bearing to your map pin.'),
  N('navigator', 'charts', 'Charts', 5, 'Sailing reveals three times as much of the map; sea routes between ports you know are drawn on it.'),
  N('navigator', 'starReckoning', 'Star Reckoning', 10, 'The map shows wrecks, treasure marks and your wake. At night a star sight earns Seamanship.'),
  N('navigator', 'weatherEye', 'Weather Eye', 15, 'Storm cells show on the map with their drift, and you feel one coming well before it arrives.'),
  N('navigator', 'currentLore', 'Current Lore', 20, 'Ocean currents show on the water, and riding one carries you half again as fast.'),
  N('navigator', 'windcaller', 'Windcaller', 25, 'Y at the helm: a fair wind blows from astern for a minute (once every ten).', 1, 2, true),
  // Rigger
  N('rigger', 'trimHand', 'Trim Hand', 1, 'Full sailing: the trim sweet spot is wider. Sails drive 3% harder per rank.', 3),
  N('rigger', 'quickReef', 'Quick Reef', 5, 'Sails set and furl twice as fast, and reefing costs less speed.'),
  N('rigger', 'stormJib', 'Storm Jib', 10, 'Reefed in a storm, she still answers the helm: a quarter less course kick and harder to knock down.'),
  N('rigger', 'patchSplice', 'Patch and Splice', 15, 'The sails and hull mend slowly at sea.'),
  N('rigger', 'closeWinded', 'Close-winded', 20, 'Point five degrees closer to the wind before the sails luff.'),
  N('rigger', 'fullPress', 'Full Press', 25, 'U at the helm: thirty seconds of every stitch of canvas: faster, closer to the wind (once every five minutes).', 1, 2, true),
  // Gunnery
  N('gunnery', 'quickLoad', 'Quick Load', 1, 'Broadsides reload 8% faster per rank.', 3),
  N('gunnery', 'harpooner', 'Harpooner', 5, 'Harpoons hit 30% harder; a tethered monster tows you 40% less.'),
  N('gunnery', 'chainShot', 'Chain and Grape', 10, 'T at the helm switches shot: chain (sails, tentacles) and grape (crews, boarders).'),
  N('gunnery', 'firePots', 'Fire Pots', 15, 'A fourth shot: fire pots that set a ship burning (your own rigging is safe).'),
  N('gunnery', 'monsterLore', 'Monster Lore', 15, 'Monsters give their tell earlier and their weak points take 50% more.'),
  N('gunnery', 'tightSpread', 'Tight Spread', 20, 'Half the spread and 15% more damage per ball.'),
  N('gunnery', 'thunderBroadside', 'Thunder Broadside', 25, 'Every ninety seconds your next broadside fires as one: double damage.', 1, 2, true),
  // Captain
  N('captain', 'quartermaster', 'Quartermaster', 1, 'Wages 15% lower per rank, and morale holds better.', 2),
  N('captain', 'bigCrew', 'Room for More', 5, 'Two more crew berths on any ship.'),
  N('captain', 'boardingParty', 'Boarding Party', 10, 'Grapple and board any pirate below half her hull, not only a beaten one; your crew fight twice as hard.'),
  N('captain', 'steadyCrew', 'Steady Crew', 15, 'Crew go overboard 60% less, and storms cost less morale.'),
  N('captain', 'prizeCrew', 'Prize Crew', 20, 'A captured ship can be sailed home as yours.'),
  N('captain', 'fleetSignal', 'Fleet Signal', 25, 'Hire a consort ship from the harbourmaster: it sails with you and fights beside you.', 1, 2, true),
  // Diver
  N('diver', 'lungs', 'Deep Lungs', 1, 'Breath lasts 30% longer per rank.', 3),
  N('diver', 'strongSwimmer', 'Strong Swimmer', 5, 'Swim 25% faster; swimming tires you 40% less.'),
  N('diver', 'weighted', 'Weighted', 10, 'Armour no longer drags you under.'),
  N('diver', 'deepSight', 'Deep Sight', 15, 'Underwater the water is clearer, and wrecks and pearl beds glint from afar.'),
  N('diver', 'pearlDiver', 'Pearl Diver', 20, 'Oyster beds give up pearls; wrecks give up more of their cargo.'),
  N('diver', 'childOfTide', 'Child of the Tide', 25, 'You cannot drown while you have stamina left.', 1, 2, true),
  // Deep Angler
  N('angler', 'trawl', 'Trawl Nets', 1, 'From a fishing sloop or bigger, sailing slow with the sails set hauls in fish.'),
  N('angler', 'baitLore', 'Bait Lore', 5, 'Fish bite 30% sooner at sea; trawls fill faster.'),
  N('angler', 'shoalSight', 'Shoal Sight', 10, 'Fish shoals show as boiling water; trawl through one for a heavy haul.'),
  N('angler', 'bigGame', 'Big Game', 15, 'Harpoon the great fish (marlin, bluefin) that follow the shoals.'),
  N('angler', 'deepTables', 'Deep Tables', 20, 'The trawl brings up rare deep-water fish.'),
  N('angler', 'oneThatGotAway', 'The One That Got Away', 25, 'Old Teeth, the great white of the coastal shelf, can be hunted.', 1, 2, true),
];

export const NODE = Object.fromEntries(SEA_NODES.map((n) => [n.id, n])) as Record<string, SeaNode>;

/** Points earned by a Seamanship level: one per level past the first. */
export const seaPoints = (level: number) => Math.max(0, level - 1);
export const spentPoints = (picks: Record<string, number>) => Object.entries(picks).reduce((a, [id, r]) => a + (NODE[id]?.cost ?? 0) * r, 0);

/** Can a node be bought (level, points, ranks, and the one before it in the branch)? */
export function canBuy(id: string, picks: Record<string, number>, level: number): string | null {
  const n = NODE[id];
  if (!n) return 'No such skill';
  if ((picks[id] ?? 0) >= n.ranks) return 'Mastered';
  if (level < n.level) return `Seamanship ${n.level}`;
  if (seaPoints(level) - spentPoints(picks) < n.cost) return 'No points';
  // The first node of a branch is open; later ones need something earlier in the branch.
  const branch = SEA_NODES.filter((x) => x.branch === n.branch);
  const i = branch.indexOf(n);
  if (i > 0 && !branch.slice(0, i).some((x) => (picks[x.id] ?? 0) > 0)) return 'Learn an earlier skill in the branch';
  return null;
}

/** The numbers the sea reads from what you've learned. */
export function seaPerks(picks: Record<string, number>) {
  const r = (id: string) => picks[id] ?? 0;
  return {
    tackWindow: 1 + r('steadyHand') * 0.25,
    turn: 1 + r('steadyHand') * 0.05,
    waveReader: r('waveReader') > 0,
    thrown: 1 - r('stormHand') * 0.2,
    kick: (1 - r('stormHand') * 0.2) * (r('stormJib') ? 0.75 : 1),
    rockSense: r('rockSense') > 0,
    groundDmg: r('rockSense') ? 0.4 : 1,
    surf: 1 + (r('waveReader') ? 0.5 : 0) + (r('surfRider') ? 1 : 0),
    wavebreaker: r('wavebreaker') > 0,
    compass: r('compass') > 0,
    charts: r('charts') > 0,
    starReckoning: r('starReckoning') > 0,
    weatherEye: r('weatherEye') > 0,
    currentLore: r('currentLore') > 0,
    current: r('currentLore') ? 1.5 : 1,
    windcaller: r('windcaller') > 0,
    trimWidth: 1 + r('trimHand') * 0.2,
    sailDrive: 1 + r('trimHand') * 0.03,
    setRate: r('quickReef') ? 2 : 1,
    reefSpeed: r('quickReef') ? 0.72 : 0.6,
    stormJib: r('stormJib') > 0,
    capsizeMargin: r('stormJib') ? 1.15 : 1,
    mend: r('patchSplice') > 0,
    irons: r('closeWinded') ? 27 : 32,
    fullPress: r('fullPress') > 0,
    reload: 1 - r('quickLoad') * 0.08,
    harpoonDmg: r('harpooner') ? 1.3 : 1,
    tow: r('harpooner') ? 0.6 : 1,
    chainShot: r('chainShot') > 0,
    firePots: r('firePots') > 0,
    monsterLore: r('monsterLore') > 0,
    weakPoint: r('monsterLore') ? 1.5 : 1,
    spread: r('tightSpread') ? 0.5 : 1,
    ballDmg: r('tightSpread') ? 1.15 : 1,
    thunder: r('thunderBroadside') > 0,
    wages: 1 - r('quartermaster') * 0.15,
    morale: r('quartermaster') * 0.05,
    berths: r('bigCrew') ? 2 : 0,
    boardingParty: r('boardingParty') > 0,
    overboard: r('steadyCrew') ? 0.4 : 1,
    prizeCrew: r('prizeCrew') > 0,
    fleetSignal: r('fleetSignal') > 0,
    breath: 1 + r('lungs') * 0.3,
    swimSpeed: r('strongSwimmer') ? 1.25 : 1,
    swimStamina: r('strongSwimmer') ? 0.6 : 1,
    weighted: r('weighted') > 0,
    deepSight: r('deepSight') > 0,
    pearls: r('pearlDiver') > 0,
    childOfTide: r('childOfTide') > 0,
    trawl: r('trawl') > 0,
    baitLore: r('baitLore') > 0,
    shoalSight: r('shoalSight') > 0,
    bigGame: r('bigGame') > 0,
    deepTables: r('deepTables') > 0,
    oldTeeth: r('oneThatGotAway') > 0,
  };
}
export type SeaPerks = ReturnType<typeof seaPerks>;
