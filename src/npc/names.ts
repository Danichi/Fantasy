// Every townsperson gets a name of their own (NPC revamp). Builders for the
// roads, hamlets and desert villages used to fill a crowd with job titles
// ("Traveller", "Gate Market Hawker" six times over) and the desert villages
// shared one list of scavengers between them. NpcManager.add runs each
// unnamed resident through here: a role for a name becomes their title and a
// real name takes its place; a name already used in that town is rerolled.

const CRESHA_FIRST = [
  'Ada', 'Bram', 'Cora', 'Dane', 'Edda', 'Finn', 'Greta', 'Hale', 'Ida', 'Jonas', 'Kerra', 'Lorne', 'Maren', 'Nils', 'Orla', 'Pim', 'Rosa', 'Sten',
  'Tilda', 'Ulla', 'Vance', 'Wynn', 'Ysolde', 'Aldo', 'Berit', 'Cass', 'Elin', 'Fenn', 'Gilda', 'Hob', 'Isla', 'Jory', 'Kit', 'Lena', 'Mott',
  'Nessa', 'Peggy', 'Rhys', 'Sabine', 'Tam', 'Una', 'Wim', 'Yara', 'Zed', 'Ansel', 'Brisa', 'Cole', 'Della', 'Evert', 'Fay', 'Gus', 'Hester',
  'Ivo', 'Juna', 'Lotte', 'Merrin', 'Agnes', 'Bastian', 'Clem', 'Dorrit', 'Ewan', 'Frida', 'Gideon', 'Hilde', 'Ingram', 'Jessa', 'Kell', 'Linnet',
  'Magda', 'Ned', 'Odo', 'Prue', 'Rafe', 'Sorrel', 'Tobias', 'Verity', 'Wat', 'Alys', 'Benedikt', 'Corin', 'Dilys', 'Emmet', 'Fennick', 'Gwen',
  'Harlan', 'Imke', 'Jasper', 'Kestrel', 'Lark', 'Mabyn', 'Noll', 'Osgar', 'Petra', 'Quenby', 'Roswitha', 'Silas', 'Thea', 'Ulric', 'Wren',
];
const CRESHA_LAST = [
  'Barley', 'Millward', 'Thatcher', 'Oakes', 'Brook', 'Fairfield', 'Harrow', 'Wheatley', 'Cobb', 'Fenwick', 'Hollis', 'Greaves', 'Sowerby', 'Pike',
  'Ashby', 'Brightwater', 'Carter', 'Dunmore', 'Ellery', 'Fletcher', 'Goss', 'Hatch', 'Ivers', 'Kettle', 'Lowe', 'Marsh', 'Nettleton', 'Orme',
  'Penny', 'Quarrie', 'Reeve', 'Salt', 'Tanner', 'Underhill', 'Vane', 'Wainwright', 'Yarrow', 'Coldwell', 'Hearne', 'Mossop', 'Rudd', 'Stoker',
];
const DESERT_FIRST = [
  'Amun', 'Bastet', 'Djedi', 'Hathor', 'Imhet', 'Khaf', 'Meri', 'Nebet', 'Senna', 'Tiye', 'Ahmose', 'Baki', 'Dagi', 'Henna', 'Ipi', 'Kawit',
  'Mutem', 'Nakht', 'Paneb', 'Rensi', 'Sitre', 'Tamit', 'Wenis', 'Yuya', 'Hapu', 'Ineni', 'Kemsit', 'Meket', 'Nofret', 'Pairy', 'Reshep', 'Sobekh',
  'Tjeti', 'Userhet', 'Weni', 'Ankhu', 'Bek', 'Hesy', 'Khnum', 'Merit', 'Grit', 'Ash', 'Tarn', 'Wick', 'Sable', 'Cinder', 'Rook', 'Flint', 'Dune',
];
const DESERT_LAST = [
  'of the Rust', 'No-Well', 'Glassback', 'the Digger', 'Sandborn', 'Duneglass', 'Palmreed', 'Sunward', 'Goldhand', 'Dry-Eye', 'of the Third Gate',
  'Saltlick', 'Tarpmender', 'of the Furnace', 'Scrapwise', 'Sun-Cracked', 'of the Long Road', 'Cistern-Born', 'Waterless', 'the Patient',
];
const SCRAP_FIRST = ['Bolt', 'Shim', 'Rivet', 'Slag', 'Tin', 'Hasp', 'Burr', 'Cog', 'Flange', 'Wick', 'Solder', 'Gasket', 'Ratchet', 'Pawl', 'Grommet', 'Shank', 'Washer', 'Brad', 'Clevis', 'Tang', 'Lug', 'Spline', 'Swarf', 'Nib'];

/** A job standing in for a name (a whole crowd of "Traveller"s). */
const ROLE = /^(the )?(gate market |crown |market |checkpoint )?(hawker|traveller|teamster|adventurer|pilgrim|refugee|child|market-goer|farmer|villager|guard|townsfolk|citizen|drover’s lad|drover's lad)( of .+)?$/i;

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

const DESERT = /^(sunspire|village\d+|scraptown\d+)$/;
const SCRAP = /^scraptown\d+$/;

/** A fresh name for someone in a settlement (`k` rerolls). */
export function personName(id: string, settlement: string, town: string, k = 0) {
  const h = hash(id + ':' + settlement + ':' + k), h2 = hash(id + '#' + k);
  if (SCRAP.test(settlement)) return `${SCRAP_FIRST[h % SCRAP_FIRST.length]} of ${town}`;
  if (DESERT.test(settlement)) return `${DESERT_FIRST[h % DESERT_FIRST.length]} ${DESERT_LAST[h2 % DESERT_LAST.length]}`;
  return `${CRESHA_FIRST[h % CRESHA_FIRST.length]} ${CRESHA_LAST[h2 % CRESHA_LAST.length]}`;
}

/** Is this "name" really a job? */
export const isRole = (name: string, title?: string) => name === title || ROLE.test(name.trim());

/** Settlements' names as people say them. */
const TOWN_NAMES: Record<string, string> = {
  elderGlen: 'Elder Glen', portAurelle: 'Port Aurelle', royalCapital: 'the Capital', wayfarersRest: 'the Wayfarer’s Rest', lanternCamp: 'the Lantern Camp', millbrookFold: 'Millbrook', chapelOfDawn: 'the Chapel of the Dawn',
  crownOutpost: 'the Crown Outpost', gateMarket: 'the Gate Market', wreckersRest: 'Wrecker’s Rest', herbCamp: 'the herb camp', kingsmile: 'the Kingsmile',
  sunspire: 'Sunspire', 'rl-wayfork': 'the Wayfork', 'rl-toll': 'Halfpenny Bridge', 'rl-hedge': 'Ser Tobin’s camp', 'rl-pilgrims': 'the Pilgrims’ Rest',
  'rl-hermit': 'the South Wood', 'rl-drovers': 'the Drover’s Well', 'rl-refugee': 'the Ashby camp', waystation: 'the Wayfarer’s Rest',
};
/** Settlements that know their own name (desert villages, scrap towns) register it here. */
export const knownNames = new Map<string, string>();
export function townName(id: string) {
  return knownNames.get(id) ?? TOWN_NAMES[id] ?? id.replace(/^rl-/, '').replace(/\d+$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

/** Sunspire's villages draw from the desert pool afresh: they shared one list of nine scavengers. */
export const rerollAlways = (settlement: string, job: string) => DESERT.test(settlement) && settlement !== 'sunspire' && (job === 'scavenger' || job === 'child');
