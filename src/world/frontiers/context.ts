/** Public wars and mortal governments; the Accord and the Champions' Game remain secret. */
export type Front = 'heartland' | 'crownRoad' | 'forest' | 'holds' | 'desert' | 'azure' | 'emerald' | 'shattered' | 'sunken' | 'eastern';
export interface FrontContext {
  name: string;
  sovereign: string;
  pressure: string;
  news: string;
  raiders: string;
  color: number;
}
export const FRONTS: Record<Front, FrontContext> = {
  heartland: {
    name: 'Cresha’s supply roads',
    sovereign: 'The independent Crown of Cresha',
    pressure: 'Border levies and displaced families are stretching the heartland’s supplies.',
    news: 'Cresha holds the crossroads. Every front wants its grain and bridges. The Dawn’s shrines are places of worship, not another government.',
    raiders: 'Deserter forager',
    color: 0x416c9a,
  },
  crownRoad: {
    name: 'The western road',
    sovereign: 'The Crown and its local wardens',
    pressure: 'Gorrak’s raiding bands strike the supply road while hired companies sell passage through it.',
    news: 'The capital needs the eastern grain wagons. Some checkpoints are Crown posts; others are mercenaries collecting a second toll. Their flags do not make them lawful.',
    raiders: 'Road-toll mercenary',
    color: 0x8f6847,
  },
  forest: {
    name: 'The forest frontier',
    sovereign: 'The elven councils and their settlements',
    pressure: 'Armed logging parties and border reprisals threaten a fragile local truce.',
    news: 'The councils guard their own woods. The Verdant Mother has a sanctuary here, but every village is not her regiment. Ask before taking timber.',
    raiders: 'Armed timber poacher',
    color: 0x477957,
  },
  holds: {
    name: 'The mountain supply line',
    sovereign: 'The independent dwarven holds',
    pressure: 'Ore embargoes and stolen provisions are isolating the high settlements.',
    news: 'The holds choose their own alliances. An anvil badge is not proof that a dwarf serves the Iron Below. Someone is stealing grain and blaming the neighboring hold.',
    raiders: 'Pass-road plunderer',
    color: 0x89877b,
  },
  desert: {
    name: 'The wells of the Golden Expanse',
    sovereign: 'The Sunspire Sultanate and local well councils',
    pressure: 'Well seizures and rival convoy escorts turn access to water into a weapon.',
    news: 'The Sultanate is a mortal state. Here the front follows the wells, not a neat line on a court map. A convoy can win a battle simply by bringing water through.',
    raiders: 'Well-road extortionist',
    color: 0xb69a57,
  },
  azure: {
    name: 'The northern sea lanes',
    sovereign: 'Independent island ports and their captains',
    pressure: 'Requisitioned ships and false convoy signals threaten civilian crossings.',
    news: 'The Queen holds the dangerous deep crossings against the Demon Lord. That does not make every island her possession, or every convoy safe from her patrols.',
    raiders: 'False-convoy corsair',
    color: 0x4d9aab,
  },
  emerald: {
    name: 'The timber crossings',
    sovereign: 'The island settlements',
    pressure: 'Wartime timber demand draws armed cutters and hired landing parties.',
    news: 'These islands govern themselves. Rival fleets need their timber, and both offer protection with a demand attached. The villagers would rather choose their own customers.',
    raiders: 'Landing-party cutter',
    color: 0x54845c,
  },
  shattered: {
    name: 'The wreck lanes',
    sovereign: 'Free crews and harbor councils',
    pressure: 'Privateers turn wreck salvage into a contest over war supplies.',
    news: 'Some wreckers carry letters from a king; others carry forged copies. Neither paper gives them the right to take the survivors as cargo.',
    raiders: 'Wreck-lane privateer',
    color: 0x827b95,
  },
  sunken: {
    name: 'The drowned approaches',
    sovereign: 'Independent divers and scholars',
    pressure: 'Competing salvage claims follow the fleets into the drowned ruins.',
    news: 'The trench throne is the Queen’s seat, not the government of every surface port. The rifts opening in these ruins are a different danger altogether.',
    raiders: 'Armed relic claimant',
    color: 0x548f9b,
  },
  eastern: {
    name: 'The eastern staging coast',
    sovereign: 'The Demon Lord’s garrison',
    pressure: 'The invasion army is stockpiling supplies behind the sea blockade.',
    news: 'The army is gathering here, but the Queen still holds the crossing. Forward stores and island footholds matter more than another march inland.',
    raiders: 'Ashen supply officer',
    color: 0x9e514d,
  },
};
export const pressureKey = (front: Front) => 'field:relief:' + front;
