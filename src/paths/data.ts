// Every discipline in the game: combat classes, magic classes and callings.
// Pure data. Each tree is three branches of five tiers plus a capstone; node
// names use a one-character prefix for their type:
//   '*' skill (goes on the bar, ranks I-V)   '!' keystone   '?' choice "A|B"
//   no prefix: tier 1 and last-in-row are minor, the rest notable.

export type Family = 'combat' | 'magic' | 'calling' | 'legacy';

export interface BranchDef {
  name: string;
  sub: string;
  tiers: string[][];
  cap: string;
  /** the capstone is a gateway to this hidden class (shown as ??? until learned) */
  gate?: string;
}

export interface DisciplineDef {
  id: string;
  fam: Family;
  name: string;
  /** css colour token (see skills.css) */
  color: string;
  mentor: string;
  /** npc id of the mentor in the world, when they exist yet */
  mentorNpc?: string;
  /** class resource shown in the tree header */
  res?: string;
  flavour: string;
  /** how mastery is earned */
  how: string;
  /** never listed until learned */
  secret?: boolean;
  /** learned at the start of a new game */
  starter?: boolean;
  /** trial quest that teaches this discipline when it is completed */
  trial?: string;
  /** a skill granted by the foundation itself (the class's first spell) */
  core?: string;
  /** hidden class opened by a gateway in this discipline's tree */
  gateFrom?: string;
  /** discipline id and level required before the mentor will teach it */
  requires?: [string, number];
  branches?: BranchDef[];
}

export const FAMILIES: Record<Family, { name: string; note: string; flavour: string; look: string }> = {
  combat: { name: 'Combat Classes', note: 'One active at a time', flavour: 'Your stance, your moveset, your breath between blows.', look: 'Sigil wheel' },
  magic: { name: 'Magic Classes', note: 'Learn any', flavour: 'Each school is a sky of its own. Learn the stars you need.', look: 'Constellation' },
  calling: { name: 'Callings', note: 'Crafts and trades', flavour: 'Patient work that makes the brave stronger than their steel.', look: 'Living tree' },
  legacy: { name: 'Legacy', note: 'Earned by deeds', flavour: 'What the world will say of you. No XP can buy it.', look: 'Your origin' },
};

export const DISCIPLINES: DisciplineDef[] = [
  // ---- combat classes ---------------------------------------------------------
  {
    id: 'gale', fam: 'combat', name: 'Gale Style', color: '--c-gale', mentor: 'Kaela Voss, the drill yard', mentorNpc: 'kaela', res: 'Flow', trial: 'trial-gale', core: 'Slipstream',
    flavour: 'Move like weather. Be somewhere else when the blow lands.', how: 'Dodge through attacks at the last moment, and strike right after.',
    branches: [
      { name: 'Tailwind', sub: 'Speed and momentum', tiers: [['Swift Feet', 'Light Grip'], ['*Gale Step', 'Afterimage', 'Flow Well'], ['*Crescent Sweep', '?Follow Through|Updraft', 'Fleet'], ['*Cyclone', '!Storm Unbound', 'Quick Hands'], ['Hurricane Heart', 'Ceaseless']], cap: 'Gate of the Stormdancer', gate: 'stormdancer' },
      { name: 'Drawn Steel', sub: 'One perfect cut', tiers: [['Keen Edge', 'Whetted'], ['*Moonlit Draw', 'Pressure', 'Edge Work'], ['*Flash Cut', '?Quickdraw|Heavy Draw', 'Sure Hands'], ['*Razor Gale', '!One Breath', 'Honed'], ['Blood on the Snow', '*Thousand Cuts']], cap: 'Gate of the Moonblade', gate: 'moonblade' },
      { name: 'Stillwind', sub: 'Parry and counter', tiers: [['Read the Blade', 'Calm Breath'], ['*Riposte', 'Calm', 'Wide Guard'], ['*Counterstance', '?Disarm|Guard Crush', 'Rebuke'], ['*Stillwater', '!Mirror Guard', 'Composure'], ["Duelist's Pride", 'Quiet Mind']], cap: 'Gate of the Sword Saint', gate: 'swordsaint' },
    ],
  },
  {
    id: 'cross', fam: 'combat', name: 'Cross Style', color: '--c-steel', mentor: 'Ilse, the Wayfarer\'s Rest', mentorNpc: 'ilse', res: 'Tempo', trial: 'trial-cross', core: 'Cross Cut',
    flavour: 'Two blades, one rhythm. Keep the beat and they never find the gap.', how: 'Carry a sword in each hand and alternate left and right strikes in rhythm.',
    branches: [
      { name: 'Twin Fang', sub: 'Dual-blade offence', tiers: [['Balanced Grip', 'Quick Wrists'], ['*Blade Dance', 'Ambidextrous', 'Tempo Well'], ['*Viper Lunge', '?Crimson Mark|Hamstring', 'Twin Edge'], ['*Twin Fangs', '!Glass Dancer', 'Twin Echo'], ['Endless Waltz', 'Double Time']], cap: 'Gate of the Reaver', gate: 'reaver' },
      { name: 'Feint', sub: 'Misdirection', tiers: [['Light Feet', 'Poker Face'], ['*Feint', 'False Opening', 'Cheap Shot'], ['*Flourish', '?Mirror Step|Shadow Feint', 'Cruel Timing'], ['*Mirror Image', '!Grand Deception', 'Sleight of Hand'], ["Trickster's Luck", 'Pickpocket']], cap: 'Gate of the Nightblade', gate: 'nightblade' },
      { name: 'Dancer', sub: 'Flowing movement', tiers: [['Spin Step', 'Light Frame'], ['*Whirling Step', 'Momentum', 'Slip'], ['*Lunge', '?Pirouette|Cartwheel', 'Balance'], ['*Tempest Waltz', '!Perpetual Motion', 'Swallow Cut'], ["Dancer's Grace", 'Last Step']], cap: 'Gate of the Bladedancer', gate: 'bladedancer' },
    ],
  },
  {
    id: 'boundary', fam: 'combat', name: 'Boundary Style', color: '--c-ward', mentor: 'Ser Corvin, the north road', mentorNpc: 'corvin', res: 'Focus', trial: 'trial-boundary', core: 'Boundary',
    flavour: 'Draw a line around yourself, and let nothing cross it.', how: 'Hold F while standing still to raise your Boundary: attacks that reach into it are turned aside.',
    branches: [
      { name: 'Stillpoint', sub: 'The ring itself', tiers: [['Wide Stance', 'Deep Breath'], ['*Hold Fast', 'Anchor', 'Clear Mind'], ['*Ward Stone', '?Thorns|Still Water', 'Patience'], ['*Sanctum', '!Rooted', 'Steady'], ['Unmoved', 'Second Breath']], cap: 'Gate of the Stillmind', gate: 'stillmind' },
      { name: 'Recoil', sub: 'Punish what you stop', tiers: [['Hard Edge', 'Ready Hands'], ['*Return Strike', 'Counterweight', 'Heavy Hand'], ['*Repel', '?Shatter|Echo', 'Grip'], ['*Collapse', '!Retaliation', 'True Edge'], ['Closing Ring', 'Overflow']], cap: 'Gate of the Ironwall', gate: 'ironwall' },
      { name: 'Warden', sub: 'Protect and endure', tiers: [['Watchful', 'Stout Heart'], ['*Challenge', 'Shelter', 'Tough'], ['*Oath Ward', '?Martyr|Bulwark', 'Endurance'], ['*Rallying Cry', '!Oathbound', 'Iron Skin'], ['Last to Fall', 'Undying Vow']], cap: 'Gate of the Shieldwarden', gate: 'shieldwarden' },
    ],
  },
  {
    id: 'dawnblade', fam: 'combat', name: 'Dawnblade', color: '--c-light', mentor: 'Sister Maren, the chapel', res: 'Radiance',
    flavour: 'Steel that burns the dark.', how: 'Land holy strikes while Dawnblade is active.',
  },
  {
    id: 'warbreaker', fam: 'combat', name: 'Warbreaker', color: '--c-blood', mentor: 'The orc exile, Orc House', res: 'Rage',
    flavour: 'Swing like a falling tree. Grukk\'s people remember how.', how: 'Deal and take damage with greatswords while Warbreaker is active.',
  },
  {
    id: 'oathbreaker', fam: 'combat', name: 'Oathbreaker', color: '--c-gold', mentor: 'Ser Corvin, if you break your word', res: 'Guilt', secret: true,
    flavour: 'The armour remembers, even when the town forgets.', how: 'Fight while your oath is broken.',
    branches: [
      { name: 'Black Shield', sub: 'Cursed defence', tiers: [['Heavy Heart', 'Cold Plate'], ['*Black Shield', 'Spite', 'Grim Guard'], ['*Penance Strike', '?Shame|Fury', 'Bitter Iron'], ['!Broken Vow', '*Forsworn Wall', 'Rust'], ['Unforgiven', 'Hollow']], cap: 'The Knight Who Fell' },
      { name: 'Guilt', sub: 'Pain into power', tiers: [['Bleed Out', 'Remember'], ['*Self Flagellation', 'Guilt Well', 'Scar Tissue'], ['*Reckoning', '?Atone|Embrace', 'Grief'], ['!Martyrdom', '*Last Confession', 'Numb'], ['Weight of Years', 'Old Wounds']], cap: 'Absolution' },
      { name: 'Road', sub: 'The failed watch', tiers: [['Road Dust', 'Night Watch'], ['*Sentinel', 'Unseen', 'Tireless'], ['*Ambush', '?Lantern|Darkness', 'Patrol'], ['!Lone Guard', '*Hold the Road', 'Old Oath'], ['Watchman', 'Grave Vigil']], cap: 'None Shall Pass' },
    ],
  },

  // ---- magic classes ------------------------------------------------------------
  {
    id: 'pyromancer', fam: 'magic', name: 'Pyromancer', color: '--c-fire', mentor: 'Magus Orren, the tower', mentorNpc: 'magus', res: 'Heat', trial: 'trial-pyro', core: 'Kindle',
    flavour: 'Fire is a risk you manage. Run hot, then spend it before it spends you.', how: 'Deal fire damage and keep enemies burning.',
    branches: [
      { name: 'Flame', sub: 'Ranged fire that grows with Heat', tiers: [['Kindling', 'Hot Hands'], ['*Fireball', 'Flashpoint', 'Searing'], ['*Cinder Volley', '?Seeking Embers|Scatter', 'Accelerant'], ['*Falling Star', '!Pure Flame', 'Wide Burst'], ['Starfire', 'Red Giant']], cap: 'Gate of the Sunbreaker', gate: 'sunbreaker' },
      { name: 'Ember', sub: 'Burns that spread', tiers: [['Smoulder', 'Lingering Heat'], ['*Ignite', 'Char', 'Fuel'], ['*Wildfire', '?Controlled Burn|Hungry Flame', 'Stacking Heat'], ['*Funeral Pyre', '!Scorched Earth', 'Smoke Veil'], ['Inferno', 'Everburn']], cap: 'Gate of the Ashwalker', gate: 'ashwalker' },
      { name: 'Hearth', sub: 'Steel and safe venting', tiers: [['Warm Blood', 'Ash Skin'], ['*Firebrand', 'Ember Shield', 'Burning Will'], ['*Vent', '?Cauterize|Backdraft', 'Heat Haze'], ['*Flame Step', '!Blood of Fire', 'Hearthfire'], ['Phoenix Down', 'Kindred Flame']], cap: 'Gate of the Phoenix', gate: 'phoenix' },
    ],
  },
  {
    id: 'windcaller', fam: 'magic', name: 'Windcaller', color: '--c-wind', mentor: 'Magus Orren, the tower', mentorNpc: 'magus', res: 'Mana',
    flavour: 'The air is never empty. It is waiting.', how: 'Knock enemies around and move with wind magic.',
    branches: [
      { name: 'Gust', sub: 'Force', tiers: [['Breeze', 'Pressure'], ['*Gust', 'Push Back', 'Whistle'], ['*Updraft', '?Downburst|Lift', 'Buffet'], ['*Cyclone Bolt', '!Eye of Calm', 'Shear'], ['Gale Force', 'Squallborn']], cap: 'Tempest Crown' },
      { name: 'Current', sub: 'Movement', tiers: [['Light Step', 'Drift'], ['*Haste', 'Slipstream', 'Tailwind Aura'], ['*Blink', '?Double Blink|Long Blink', 'Airwalk'], ['*Wind Walk', '!Featherweight', 'Momentum'], ['Jetstream', 'Sky Dash']], cap: 'Riding the Storm' },
      { name: 'Sky', sub: 'Control', tiers: [['Clear Air', 'Open Lungs'], ['*Wind Wall', 'Deflecting Air', 'Calm'], ['*Vacuum', '?Suffocate|Crush', 'Thin Air'], ['*Pressure Dome', '!Silent Sky', 'Still Point'], ["Heaven's Breath", 'Stormglass']], cap: 'Eye of Heaven' },
    ],
  },
  {
    id: 'lightbinder', fam: 'magic', name: 'Lightbinder', color: '--c-light', mentor: 'Brother Aldous, the Chapel of the Dawn', mentorNpc: 'aldous', res: 'Radiance', trial: 'trial-light', core: 'Mote of Light',
    flavour: 'You do not throw light. You bind it: to the ground, to your foes, to yourself.', how: 'Heal, mark and bind with light; stand in daylight.',
    branches: [
      { name: 'Mercy', sub: 'Healing that rewards timing', tiers: [['Gentle Hands', 'Steady Prayer'], ['*Healing Light', 'Afterglow', 'Soft Light'], ['*Lightwell', '?Spring|Beacon', 'Warm Glow'], ['*Second Dawn', '!Vow of Mercy', 'Grace'], ['Unfading', 'Grace Under Fire']], cap: 'Gate of the Lifewarden', gate: 'lifewarden' },
      { name: 'Judgment', sub: 'Mark, build, cash in', tiers: [['Zeal', 'Long Memory'], ['*Brand', 'Witness', 'Righteous'], ['*Sentence', '?Swift Justice|Final Word', 'Glare'], ['*Radiant Lance', '!Zealot', 'Bright Eyes'], ['Judgment Day', 'Unblinking']], cap: 'Gate of the Inquisitor', gate: 'inquisitor' },
      { name: 'Binding', sub: 'Threads, wards and control', tiers: [['Warded', 'Firm Grip'], ['*Light Tether', 'Taut', 'Faithful'], ['*Halo Ward', '?Mirror Halo|Wide Halo', 'Steadfast'], ['*Chains of Dawn', "!Binder's Oath", 'Purity'], ['Sanctuary Line', 'Lantern Cage']], cap: 'Gate of the Lightweaver', gate: 'lightweaver' },
    ],
  },
  {
    id: 'cryomancer', fam: 'magic', name: 'Cryomancer', color: '--c-frost', mentor: 'Magus Orren, once you know the wind', mentorNpc: 'magus', requires: ['windcaller', 5],
    flavour: 'Stillness, made into a weapon.', how: 'Chill, freeze and shatter.',
  },
  {
    id: 'shadowcaller', fam: 'magic', name: 'Shadowcaller', color: '--c-shadow', mentor: 'A voice in the lower crypt',
    flavour: 'Something beneath the crypt is teaching.', how: 'Curse and harvest souls.',
  },
  {
    id: 'voidwalker', fam: 'magic', name: 'Voidwalker', color: '--c-shadow', mentor: 'Unknown', secret: true,
    flavour: 'Between the stars there is a hunger.', how: 'Pull and crush.',
  },

  // ---- callings -----------------------------------------------------------------
  {
    // The recipe nodes (Hearthroot Draught, Nightshade Oil...) are passives that
    // teach recipes, not bar skills: the herbalism system (src/herbalism) reads them.
    id: 'herbalism', fam: 'calling', name: 'Herbalism', color: '--c-herb', mentor: 'Wenna Thistledown, the Crown Road', mentorNpc: 'wenna', res: 'Herbs',
    flavour: 'Every root in these hills is a sword, if you know how to boil it.', how: 'Gather herbs and brew tonics, elixirs, oils and flasks. Gathering and brewing raise Herbalism by themselves.',
    branches: [
      { name: 'Tonics', sub: 'Healing brews', tiers: [['Clean Cuts', 'Steady Hands'], ['Hearthroot Draught', 'Double Batch', 'Potent'], ['Renewal Tea', '?Quick Sip|Slow Brew', 'Bitter Gold'], ['Lifebloom Tonic', '!Apothecary', 'Distiller'], ['Panacea', 'Rare Roots']], cap: 'Elixir of Life' },
      { name: 'Venoms', sub: 'Oils and flasks', tiers: [['Careful Gloves', 'Toxin Lore'], ['Nightshade Oil', 'Lasting Coat', 'Numbroot'], ['Wither Oil', '?Paralytic|Corrosive', 'Virulence'], ['Plague Flask', '!Venomblood', 'Contagion'], ['Black Lotus', 'Deathcap']], cap: "Widow's Kiss" },
      { name: 'Elixirs', sub: 'Combat power', tiers: [["Brewer's Eye", 'Steady Heat'], ['Ironbark Tonic', 'Tempered', 'Longer Brews'], ['Swiftroot Elixir', '?Berserker Brew|Sage Brew', 'Mixologist'], ['Stormleaf Elixir', '!Master Brewer', 'Twin Elixir'], ['Moonpetal', 'Dragonbloom']], cap: "Philosopher's Draught" },
    ],
  },
  {
    id: 'dungeoneering', fam: 'calling', name: 'Dungeoneering', color: '--c-gold', mentor: 'Ser Corvin, the north road', mentorNpc: 'corvin', res: 'Nerve',
    flavour: 'The dark is a map nobody has finished drawing.', how: 'Explore new rooms, draw maps, find secrets and disarm traps.',
    branches: [
      { name: 'Delver', sub: 'Exploring', tiers: [['Torchbearer', 'Sure Step'], ['*Torchlight', "Cartographer's Eye", 'Deep Lungs'], ['*Seek Passage', "Delver's Sense", 'Crawlspace'], ["*Delver's Instinct", '!Lone Delver', 'Night Sight'], ['Deep Breath', 'Sense the Boss']], cap: 'Master Delver' },
      { name: 'Trapper', sub: 'Traps', tiers: [['Wary', 'Quick Fingers'], ['*Disarm', 'Trap Sense', 'Salvage'], ['*Rig Trap', '?Rearm|Explosive Rig', 'Light Feet'], ['*Snare Field', '!Trapmaster', 'Pressure Plate'], ['Clockwork', 'Killing Floor']], cap: 'The Labyrinth' },
      { name: 'Treasure', sub: 'Loot', tiers: [['Keen Nose', 'Lockpick'], ['*Appraise', 'Hidden Cache', 'Lucky Find'], ['*Loot Sense', '?Gold Nose|Relic Hunter', 'Picky'], ['*Mimic Sense', '!Greed', 'Treasure Nose'], ["Dragon's Hoard", 'Fortune']], cap: "King's Ransom" },
    ],
  },
  {
    id: 'smithing', fam: 'calling', name: 'Smithing', color: '--c-steel', mentor: 'Master Fröst, the market', mentorNpc: 'froest', res: 'Ore',
    flavour: 'Good steel remembers the hammer.', how: 'Forge, temper and repair gear.',
    branches: [
      { name: 'Weapons', sub: 'Blades', tiers: [['Hammer Arm', 'Clean Edge'], ['*Sharpen', 'Balanced', 'Fuller'], ['*Forge Blade', '?Heavy|Light', 'Quench'], ['*Masterwork', '!Bladesmith', 'Pattern Steel'], ['Star Metal', 'Named Blade']], cap: 'Legendary Forge' },
      { name: 'Armour', sub: 'Plate and mail', tiers: [['Rivets', 'Leatherwork'], ['*Patch Armour', 'Padded', 'Fitted'], ['*Forge Plate', '?Mobile|Heavy Plate', 'Lamellar'], ['*Masterwork Plate', '!Armoursmith', 'Gilded'], ['Mythril', 'Heraldry']], cap: 'Aegis Forge' },
      { name: 'Temper', sub: 'Upgrades', tiers: [['Bellows', 'Coal Lore'], ['*Temper', 'Oil Quench', 'Whetstone'], ['*Hone', '?Keen|Durable', 'Field Repair'], ['*Runed Temper', '!Soul Steel', 'Heat Sense'], ['Dragonfire Coal', 'Perfect Temper']], cap: 'Living Steel' },
    ],
  },
  {
    id: 'cooking', fam: 'calling', name: 'Cooking', color: '--c-fire', mentor: 'Mara Bell, the Wayfarer Inn', mentorNpc: 'innkeeper', res: 'Pantry',
    flavour: 'Nobody storms a crypt on an empty stomach.', how: 'Cook meals at campfires and inns.',
    branches: [
      { name: 'Feasts', sub: 'Big buffs', tiers: [['Seasoning', 'Good Knife'], ['*Hearty Stew', 'Big Pot', 'Savoury'], ["*Hunter's Feast", '?Rich|Light', 'Spice Trade'], ['*Banquet', '!Head Chef', 'Share Plate'], ['Royal Table', 'Legendary Dish']], cap: 'Feast of Heroes' },
      { name: 'Rations', sub: 'On the road', tiers: [['Preserve', 'Salt'], ['*Trail Ration', 'Light Pack', 'Jerky'], ['*Battle Bread', '?Quick Bite|Slow Burn', 'Canteen'], ['*Iron Ration', '!Frugal', "Forager's Snack"], ['Elven Bread', 'Endless Rations']], cap: "Soldier's Stomach" },
      { name: 'Campfire', sub: 'Resting', tiers: [['Kindler', 'Warm Hands'], ['*Camp Cook', 'Cosy Fire', 'Watch Fire'], ['*Campfire Tales', '?Rested|Wary', 'Songs'], ['*Safe Haven', '!Hearthkeeper', 'Night Watch'], ['Warm Dreams', 'Home Fire']], cap: 'Hearth of the Wilds' },
    ],
  },
  {
    id: 'runecraft', fam: 'calling', name: 'Runecraft', color: '--c-shadow', mentor: 'Master Fröst, once you can smith', mentorNpc: 'froest', requires: ['smithing', 5],
    flavour: 'Words cut into steel.', how: 'Cut runes at a runestone and inscribe them on weapons and armour.',
    branches: [
      { name: 'Edges', sub: 'Weapon runes', tiers: [['Steady Chisel', 'Copper Lore'], ['*Rune of the Anvil', 'Deep Cuts', 'Clean Lines'], ['*Rune of the Swift', '?Bold Strokes|Fine Strokes', 'Bright Wire'], ['Twin Runes', '!Runeblade', 'Glyph Lore'], ['Star Script', 'Living Edge']], cap: 'The First Word' },
      { name: 'Wards', sub: 'Armour runes', tiers: [['Patient Hand', 'Ward Lore'], ['*Rune of Warding', 'Layered Ward', 'Silver Inlay'], ['Ward of Thorns', '?Bulwark|Mirror Ward', 'Steady Lines'], ['Aegis Glyph', '!Wardsmith', 'Old Tongue'], ['Sunwheel Script', 'Unbroken Ward']], cap: 'Name of Shelter' },
      { name: 'Script', sub: 'Lore and craft', tiers: [['Rubbings', 'Ink Lore'], ['Read the Stones', 'Quick Chisel', 'Copper Saver'], ['Runed Temper', '?Scholar|Artisan', 'Steady Light'], ['Glyph Memory', '!Lorekeeper', 'Elder Words'], ['Starfall Script', 'Speaking Stone']], cap: 'Speaker of Stone' },
    ],
  },
  {
    id: 'tailoring', fam: 'calling', name: 'Tailoring', color: '--c-light', mentor: 'Vela Thread, the tailor’s', mentorNpc: 'tailor', res: 'Cloth',
    flavour: 'A good cloak has saved more lives than a good sword.', how: 'Tan hides, weave cloth and sew armour, cloaks and bags at a loom.',
    branches: [
      { name: 'Leather', sub: 'Jerkins and boots', tiers: [['Awl and Thread', 'Supple Hide'], ['Double Stitch', 'Waxed Thread', 'Hide Lore'], ['Tooled Leather', '?Light Leather|Sturdy Leather', "Tanner's Eye"], ['Boiled Leather', '!Leatherworker', 'Quick Hands'], ['Drakeskin', 'Second Skin']], cap: 'Wyrmhide' },
      { name: 'Cloth', sub: 'Cloaks and gambesons', tiers: [['Spindle', 'Warp and Weft'], ['Quilting', 'Dyer', 'Fine Weave'], ['Layered Cloth', '?Warm Cloth|Light Cloth', 'Loom Sense'], ['Court Cut', '!Clothier', 'Silk Road'], ['Moonweave', 'Royal Mantle']], cap: 'Ash Silk' },
      { name: 'Packs', sub: 'Bags and belts', tiers: [['Pockets', 'Straps'], ['Saddlebags', 'Deep Pockets', 'Buckles'], ['Quiver Maker', '?Forager|Traveller', 'Waterproof'], ['Bottomless Bag', '!Packmaster', 'Light Load'], ['Pack Mule', 'Everything Has a Place']], cap: 'Bag of Holding' },
    ],
  },
  {
    id: 'beastbinding', fam: 'calling', name: 'Beastbinding', color: '--c-herb', mentor: 'Unknown', secret: true,
    flavour: 'Every slime remembers what it ate.', how: 'Capture monster essences.',
  },

  // ---- legacy (origins/legacy.ts: levels come from Renown, never from XP) --------
  {
    id: 'legendaryHero', fam: 'legacy', name: 'Legendary Hero', color: '--c-gold', mentor: 'No one: great deeds raise it', res: 'Renown',
    flavour: 'You were summoned as one of six peoples. The world will remember which.', how: 'Slay named bosses and great beasts, finish chapters of the story, make first landfalls.',
  },
  // ---- hidden classes behind tree gateways (no tree or teacher in the world yet) ----
  { id: 'stormdancer', fam: 'combat', name: 'Stormdancer', color: '--c-gale', mentor: 'Unknown', secret: true, gateFrom: 'gale', flavour: 'Never where the blow falls. Never.', how: '' },
  { id: 'moonblade', fam: 'combat', name: 'Moonblade', color: '--c-gale', mentor: 'Unknown', secret: true, gateFrom: 'gale', flavour: 'One draw. One cut. Nothing after.', how: '' },
  { id: 'swordsaint', fam: 'combat', name: 'Sword Saint', color: '--c-gale', mentor: 'Unknown', secret: true, gateFrom: 'gale', flavour: 'They say no blade has touched her in forty years.', how: '' },
  { id: 'reaver', fam: 'combat', name: 'Reaver', color: '--c-steel', mentor: 'Unknown', secret: true, gateFrom: 'cross', flavour: 'Two blades, and no mercy between them.', how: '' },
  { id: 'nightblade', fam: 'combat', name: 'Nightblade', color: '--c-steel', mentor: 'Unknown', secret: true, gateFrom: 'cross', flavour: 'You are watching the wrong hand.', how: '' },
  { id: 'bladedancer', fam: 'combat', name: 'Bladedancer', color: '--c-steel', mentor: 'Unknown', secret: true, gateFrom: 'cross', flavour: 'The fight is a dance, and they never learned the steps.', how: '' },
  { id: 'stillmind', fam: 'combat', name: 'Stillmind', color: '--c-ward', mentor: 'Unknown', secret: true, gateFrom: 'boundary', flavour: 'The ring does not move. Neither do you.', how: '' },
  { id: 'ironwall', fam: 'combat', name: 'Ironwall', color: '--c-ward', mentor: 'Unknown', secret: true, gateFrom: 'boundary', flavour: 'Whatever reaches in comes back broken.', how: '' },
  { id: 'shieldwarden', fam: 'combat', name: 'Shieldwarden', color: '--c-ward', mentor: 'Unknown', secret: true, gateFrom: 'boundary', flavour: 'Those behind the line sleep soundly.', how: '' },
  { id: 'lifewarden', fam: 'magic', name: 'Lifewarden', color: '--c-light', mentor: 'Unknown', secret: true, gateFrom: 'lightbinder', flavour: 'Mercy, carried past the point of reason.', how: '' },
  { id: 'inquisitor', fam: 'magic', name: 'Inquisitor', color: '--c-light', mentor: 'Unknown', secret: true, gateFrom: 'lightbinder', flavour: 'Judgment that does not wait for evidence.', how: '' },
  { id: 'lightweaver', fam: 'magic', name: 'Lightweaver', color: '--c-light', mentor: 'Unknown', secret: true, gateFrom: 'lightbinder', flavour: 'Every thread of light, woven into one cloth.', how: '' },
  { id: 'sunbreaker', fam: 'magic', name: 'Sunbreaker', color: '--c-fire', mentor: 'Unknown', secret: true, gateFrom: 'pyromancer', flavour: 'Some suns are meant to be broken.', how: '' },
  { id: 'ashwalker', fam: 'magic', name: 'Ashwalker', color: '--c-fire', mentor: 'Unknown', secret: true, gateFrom: 'pyromancer', flavour: 'Where they walk, nothing grows for a year.', how: '' },
  { id: 'phoenix', fam: 'magic', name: 'Phoenix', color: '--c-fire', mentor: 'Unknown', secret: true, gateFrom: 'pyromancer', flavour: 'Every ending is kindling.', how: '' },
];

export const DISC: Record<string, DisciplineDef> = Object.fromEntries(DISCIPLINES.map((d) => [d.id, d]));

/** Written descriptions for named nodes; the rest fall back to their type. */
export const NODE_TEXT: Record<string, string> = {
  'Gale Step': 'Dash through your target with a cutting wind. You are invulnerable during the dash.',
  'Crescent Wind': 'A spinning slash that hits everything around you and knocks small foes back.',
  Cyclone: 'Channel a moving whirlwind. Drains Flow each second instead of stamina.',
  'Storm Unbound': 'Your combo never resets while you keep landing hits. You can no longer block.',
  'Severing Arc': 'Swing a blade of wind that flies 12 m. Costs 1 Flow.',
  'Moonlit Draw': 'Sheathe, hold, release: one huge cut that always staggers.',
  'One Breath': 'Sheathed draws always crit. Normal light attacks deal 30% less.',
  Counterstance: 'A stance that automatically parries the next hit that lands.',
  Riposte: 'After a parry, a guaranteed critical thrust.',
  'Mirror Guard': 'Your parry window is doubled. Getting hit costs 2 Flow.',
  'Eye of the Storm': 'At full Flow, every third hit releases a wind slash.',
  'Thousand Cuts': 'Time freezes while you carve one target with a flurry of cuts.',
  'Perfect Calm': 'A perfect parry slows time for 1.5 seconds.',
  Tailwind: 'Dodging forward right after a hit costs no stamina.',
  'Squall|Updraft': 'Squall turns your combo finisher into a 3-hit flurry. Updraft makes the finisher launch small foes.',
  Fireball: 'A homing sphere of flame that bursts on impact.',
  Ignite: 'Your fire stacks a burn, up to 5 times.',
  Meteor: 'Call down a meteor on your locked target after 2 seconds.',
  'Heart of the Sun': 'For 12 seconds every spell is free and every hit Ignites.',
  Firebrand: 'Your weapon catches fire for 20 seconds. Works with any combat class.',
  'Healing Light': 'A prayer of warm light that restores health over a few seconds.',
  'Hearthroot Draught': 'Heals 40% over 6 seconds. Twice the strength of a shop Health Draught.',
  'Nightshade Oil': 'Coat your blade. Hits stack Wither.',
  'Ironbark Tonic': '60 seconds: +35% block and you cannot be staggered.',
  'Stormleaf Elixir': '90 seconds: every third hit arcs lightning.',
  "Philosopher's Draught": 'Drink to gain one tier-5 passive from any discipline you have learned, for 5 minutes.',
  Torchlight: 'Your torch lights farther and reveals tripwires.',
  'Seek Passage': 'Pulse the room: secret doors glow for a moment.',
  Disarm: 'Disarm a trap and keep its parts.',
  Appraise: 'See loot quality before you open a chest.',
  'Shield Bash': 'Drive your shield into the enemy to stagger it.',
  'Shield Wall': 'Hold to raise a wall: frontal blocks drain no stamina for 3 seconds.',
  'Black Shield': 'Your shield turns black. Blocked damage is stored as Guilt and released on your next hit.',
};
