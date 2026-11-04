// The factions of the world and where their gear comes from (the item plan,
// §2b, §4b). sources.ts reads these: a faction's quartermasters (shops whose
// keeper or title matches), the shops of its home regions, the quests that
// reward it, and the foes that carry it.

export interface Faction {
  name: string;
  /** region ids whose shops stock the faction's gear */
  home: string[];
  /** shopkeepers and shop titles that are the faction's quartermasters */
  shop?: RegExp;
  /** quests (ids) whose completion gives a piece */
  quest?: RegExp;
  /** deeds (ids) whose completion gives a piece */
  deed?: RegExp;
  /** foe families that carry it (drop:<family>) */
  drop?: string[];
}

export const FACTIONS: Record<string, Faction> = {
  glenWatch: { name: 'the Elder Glen Watch', home: ['elderGlen'], shop: /Brannoc|the Watch|Fröst|Smith & Merchant/i, quest: /^(mq-bells|mq-stranger|night-watch|lost-patrol|friend-of-the-glen|wolves-at-the-fold|crows-in-wheat|granary-rats|mill-wheel-jam)$/ },
  glenWarden: { name: 'the Glen Wardens', home: ['elderGlen', 'cresha'], shop: /Rook|Warden|Lyssa|Garrick|Guild/i, quest: /^(wilds-.*|thornfield-wolves|wolf-among-sheep|greymane|thornhorn|bristleback|gnarlbark|old-sawtooth)$/, deed: /^(guild:|wilds:)/ },
  academy: { name: 'the Knight\'s Academy', home: ['portAurelle'], shop: /Academy|Kaela|Ilse|Corvin|Armoury|Quartermaster/i, quest: /^(academy-.*|trial-(gale|cross|boundary)|crown-tourney|corvins-rounds)$/ },
  crown: { name: 'the Crown and the Silver Lance', home: ['royalCapital'], shop: /Crown|Brask|Silver Lance|Hart|Brightforge|Royal|Outpost/i, quest: /^(crown-summons|kings|capital|rl-crownriders|rl-queensriders|rl-lance|rl-hedge-knight|rl-silk-steel|rl-dispatch|mq-feast|kingsbridge|overlook)$/ },
  temple: { name: 'the Temple of the Dawn', home: ['royalCapital', 'cresha'], shop: /Temple|Dawn|Pilgrim|Seraphine|Aldous|Chapel|Maren/i, quest: /^(rl-pilgrims-a|rl-pilgrims-b|rl-avepilgrims|lost-pilgrim|the-sunwheel|chapel|oldest-prayer|dawn|dawn-vigil|barrow-dead|echoes-in-the-crypt|mq-gravewood|mq-dawnbreaker)$/ },
  dwarven: { name: 'the dwarven holds', home: ['whiteMountains', 'deepMountains', 'frostedPeaks'], shop: /Bruni|Dwar|Stonevein|Thrain|Hold/i, quest: /^(dwarf-expedition|hollow-ridge|mine|smiths-ore-run|the-warden-below|humming-crystal|tempered-steel)$/ },
  desert: { name: 'Ghagrabba and the Golden Expanse', home: ['goldenExpanse'], shop: /Hassun|Sun Guard|Bazaar|Sunspire|Ghagrabba|Neferah|Ptahmose|Zarek/i, quest: /^(sunspire|queens|amira|hassun|wennefer|amenemope|mereth|ptah|tjeti|baket-feast|cistern-rats|djau-shells|hekat-flux|ipuwer-stelae|meritites-fever|nakht-thief|nefret-stars|paneb-ring|sethi-falcon|sitre-ink|oasis-eels|teeth-of-the-dunes|raider-season|glasswind-raiders|mirage-lights|lost-caravan|the-lost-caravan|ysra|os-.*)$/, drop: ['desert'] },
  scrap: { name: 'the scrap towns', home: ['goldenExpanse'], shop: /Rusk|Solder|Rivet|Tinroof|Gearwater|Scrap|Village Trader/i, quest: /^(scrap-for-rusk|furnace-scrap)$/, drop: ['scrap'] },
  wrecker: { name: 'the wreckers and pirates', home: ['azureIsles', 'emeraldIsles', 'shatteredIsles', 'sunkenIsles'], shop: /Gullet|Wreck|Fence|Corsair|Pirate|Harbour|Isle|Cove/i, quest: /^(black-tide|black-tide-calloway|drowned|galleon|brigantine|sloop|serpent-hunt|serpent-rumour|skiff|sea-legs)$/, deed: /^(beast:|landfall:|regatta:)/, drop: ['sea'] },
  orc: { name: 'Grukk\'s band', home: [], shop: /Orc House|exile/i, quest: /^(ulgra|crypt|wilds-ulgra|bonebreaker|mq-crypt)$/, drop: ['orc'] },
  goblin: { name: 'the goblins', home: [], drop: ['goblin'] },
  twoCoins: { name: 'the Two Coins crew', home: [], shop: /Fence|Two Coins|Smuggler/i, quest: /^(red-hand|quiet-hands|missing-gold|caravan-ledger|mq-ledger|hesk)$/, drop: ['bandit'] },
  gloam: { name: 'the Dark and the Gloam', home: [], quest: /^(mq-fall|mq-turning|mq-four|gravewood|mq-archive)$/, drop: ['gloam', 'undead'] },
  elven: { name: 'the elven envoy', home: ['verdantElves', 'royalCapital'], shop: /Lirael|Elf|Elven|Envoy|Verdant/i, quest: /^(verdant|ysmay|moon|veyr|veyrs-lesson)$/ },
  valorian: { name: 'the Valorian Legion', home: ['valoria', 'royalCapital'], shop: /Legation|Varro|Valoria|Legion/i, quest: /^(valoria|varro)$/ },
  hunter: { name: 'the hedge and hunting folk', home: ['elderGlen', 'cresha', 'wildlands', 'southernMarches'], shop: /Wenna|Hunter|Charcoal|Bram|Trapper|Carpenter|Herbal/i, quest: /^(rl-hunters|rl-charcoal|wenna|herb-.*|herbalist-list)$/, drop: ['beast'] },
};
