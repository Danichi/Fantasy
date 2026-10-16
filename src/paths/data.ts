// Every discipline in the game: combat classes, magic classes and callings.
// Pure data. Each tree is three branches of five tiers plus a capstone; node
// names use a one-character prefix for their type:
//   '*' skill (goes on the bar, ranks I-V)   '!' keystone   '?' choice "A|B"
//   no prefix: tier 1 and last-in-row are minor, the rest notable.

export type Family = 'combat' | 'magic' | 'calling';

export interface BranchDef {
  name: string;
  sub: string;
  tiers: string[][];
  cap: string;
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
  /** discipline id and level required before the mentor will teach it */
  requires?: [string, number];
  branches?: BranchDef[];
}

export const FAMILIES: Record<Family, { name: string; note: string; flavour: string; look: string }> = {
  combat: { name: 'Combat Classes', note: 'One active at a time', flavour: 'Your stance, your moveset, your breath between blows.', look: 'Sigil wheel' },
  magic: { name: 'Magic Classes', note: 'Learn any', flavour: 'Each school is a sky of its own. Learn the stars you need.', look: 'Constellation' },
  calling: { name: 'Callings', note: 'Crafts and trades', flavour: 'Patient work that makes the brave stronger than their steel.', look: 'Living tree' },
};

export const DISCIPLINES: DisciplineDef[] = [
  // ---- combat classes ---------------------------------------------------------
  {
    id: 'gale', fam: 'combat', name: 'Gale Style', color: '--c-gale', mentor: 'Kaela Voss, the drill yard', mentorNpc: 'kaela', res: 'Flow', starter: true,
    flavour: 'Move like weather. Strike before they see the blade.', how: 'Land hits, dodge and parry while Gale Style is active.',
    branches: [
      { name: 'Tailwind', sub: 'Speed and movement', tiers: [['Swift Feet', 'Light Grip'], ['*Gale Step', 'Tailwind', 'Slipstream'], ['*Crescent Wind', '?Squall|Updraft', 'Flow Well'], ['*Cyclone', '!Storm Unbound', 'Wind Shear'], ['Hurricane Heart', 'Lingering Vortex']], cap: 'Eye of the Storm' },
      { name: 'Cutting Wind', sub: 'Ranged cuts and crits', tiers: [['Keen Edge', 'Whetted'], ['*Severing Arc', 'Pressure', 'Far Reach'], ['*Moonlit Draw', '?Quickdraw|Heavy Draw', 'Bleeding Wind'], ['!One Breath', '*Razor Gale', 'Twin Arcs'], ['Blood on the Snow', 'Horizon Cut']], cap: 'Thousand Cuts' },
      { name: 'Stillwind', sub: 'Parry and counter', tiers: [['Read the Blade', 'Calm Breath'], ['*Counterstance', 'Deflect', 'Wide Guard'], ['*Riposte', '?Disarm|Guard Crush', 'Composure'], ['!Mirror Guard', '*Lightning Parry', 'Rebuke'], ["Duelist's Pride", 'Quiet Mind']], cap: 'Perfect Calm' },
    ],
  },
  {
    id: 'cross', fam: 'combat', name: 'Cross Style', color: '--c-steel', mentor: 'Ilse, the travelling fencer', res: 'Tempo',
    flavour: 'Two blades, one rhythm. Keep the beat and they never find the gap.', how: 'Alternate main and off-hand hits while Cross Style is active.',
    branches: [
      { name: 'Twin Fang', sub: 'Dual-blade offence', tiers: [['Balanced Grip', 'Quick Hands'], ['*Cross Cut', 'Ambidextrous', 'Tempo Well'], ['*Blade Dance', '?Crimson Mark|Hamstring', 'Rhythm'], ['*Viper Lunge', '!Glass Dancer', 'Twin Echo'], ['Endless Waltz', 'Double Time']], cap: 'Crimson Waltz' },
      { name: 'Feint', sub: 'Misdirection', tiers: [['Light Feet', 'Poker Face'], ['*Feint', 'False Opening', 'Sidestep'], ['*Flourish', '?Mirror Step|Shadow Feint', 'Cruel Timing'], ['!Grand Deception', '*Mirror Image', 'Cheap Shot'], ["Trickster's Luck", 'Sleight']], cap: 'Hall of Mirrors' },
      { name: 'Dancer', sub: 'Flowing movement', tiers: [['Spin Step', 'Light Frame'], ['*Whirling Step', 'Momentum', 'Slip'], ['*Lunge', '?Pirouette|Cartwheel', 'Balance'], ['*Tempest Waltz', '!Perpetual Motion', 'Swallow Cut'], ["Dancer's Grace", 'Last Step']], cap: 'Final Flourish' },
    ],
  },
  {
    id: 'boundary', fam: 'combat', name: 'Boundary Style', color: '--c-steel', mentor: 'Ser Corvin, the north road', mentorNpc: 'corvin', res: 'Resolve',
    flavour: 'A shield is a promise that you will still be standing.', how: 'Block, parry and take hits while Boundary Style is active.',
    branches: [
      { name: 'Aegis', sub: 'Blocking', tiers: [['Steady Arm', 'Braced'], ['*Shield Wall', 'Iron Stance', 'Absorb'], ['*Deflect', '?Unyielding|Spiked Rim', 'Hold the Line'], ['!Unbreakable', '*Reflecting Wall', 'Bastion'], ['Immovable', 'Aftershock']], cap: 'Living Fortress' },
      { name: 'Vanguard', sub: 'Charge and bash', tiers: [['Heavy Rim', 'Shoulder In'], ['*Shield Bash', 'Staggering Blow', 'Bruiser'], ['*Bull Rush', '?Trample|Pin', 'Iron Hide'], ['*Earthshaker', '!Juggernaut', 'Plow Through'], ['Avalanche', 'Battering Ram']], cap: 'Unstoppable Charge' },
      { name: 'Warden', sub: 'Protect and taunt', tiers: [['Watchful', 'Stout Heart'], ['*Challenge', 'Rallying Presence', 'Tough'], ['*Oath Ward', '?Martyr|Guardian', 'Last to Fall'], ['*Rallying Cry', '!Oathbound', 'Retaliate'], ['Undying Vow', 'Beacon']], cap: 'The Oath Kept' },
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
    id: 'pyromancer', fam: 'magic', name: 'Pyromancer', color: '--c-fire', mentor: 'Magus Orren, the tower', mentorNpc: 'magus', res: 'Mana', starter: true,
    flavour: 'Fire does not care about armour.', how: 'Deal fire damage and keep enemies burning.',
    branches: [
      { name: 'Flame', sub: 'Projectiles', tiers: [['Kindling', 'Hot Hands'], ['*Fireball', 'Focused Heat', 'Wide Burst'], ['*Flame Wave', '?Cinder Volley|Meteor Form', 'Accelerant'], ['*Meteor', '!Pure Flame', 'Searing Speed'], ['Starfall', 'Scorch Trail']], cap: 'Heart of the Sun' },
      { name: 'Ember', sub: 'Burning', tiers: [['Smoulder', 'Lingering Heat'], ['*Ignite', 'Stacking Heat', 'Char'], ['*Pyre', '?Wildfire|Controlled Burn', 'Fuel'], ['*Cinderstorm', '!Scorched Earth', 'Smoke Veil'], ['Ashfall', 'Everburn']], cap: 'Inferno' },
      { name: 'Hearth', sub: 'Self and weapon', tiers: [['Warm Blood', 'Ash Skin'], ['*Firebrand', 'Ember Shield', 'Heat Haze'], ['*Immolation', '?Phoenix Down|Ash Cloak', 'Burning Will'], ['*Flame Step', '!Blood of Fire', 'Cauterize'], ['Rekindle', 'Hearthfire']], cap: 'Phoenix Crest' },
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
    id: 'lightbinder', fam: 'magic', name: 'Lightbinder', color: '--c-light', mentor: 'Sister Maren, the chapel', res: 'Mana', starter: true,
    flavour: 'Mercy for friends. Judgment for the rest.', how: 'Heal, ward and deal holy damage.',
    branches: [
      { name: 'Mercy', sub: 'Healing', tiers: [['Gentle Hands', 'Warm Glow'], ['*Healing Light', 'Lasting Light', 'Soothing'], ['*Renew', '?Mending|Surge', 'Grace'], ['*Sanctuary', "!Martyr's Gift", 'Devotion'], ['Second Wind', 'Dawnbreak']], cap: 'Resurrection Ward' },
      { name: 'Judgment', sub: 'Holy damage', tiers: [['Zeal', 'Bright Eyes'], ['*Smite', 'Brand', 'Glare'], ['*Radiant Spear', '?Condemn|Purge', 'Righteous'], ['*Holy Brand', '!Wrathful', 'Blinding'], ['Verdict', 'Lightfall']], cap: 'Final Judgment' },
      { name: 'Sanctum', sub: 'Wards', tiers: [['Faithful', 'Warded'], ['*Blessed Weapon', 'Aegis', 'Hallowed'], ['*Consecrate', '?Bulwark of Faith|Sacred Ground', 'Purity'], ['*Divine Barrier', '!Vow of Peace', 'Aura'], ['Cathedral Step', 'Halo']], cap: 'Cathedral' },
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
    id: 'herbalism', fam: 'calling', name: 'Herbalism', color: '--c-herb', mentor: 'Old Wenna, the meadow', res: 'Herbs',
    flavour: 'Every root in these hills is a sword, if you know how to boil it.', how: 'Gather herbs and brew potions, tonics and oils.',
    branches: [
      { name: 'Tonics', sub: 'Healing brews', tiers: [['Clean Cuts', 'Steady Hands'], ['*Hearthroot Draught', 'Double Batch', 'Potent'], ['*Renewal Tea', '?Quick Sip|Slow Brew', 'Bitter Gold'], ['*Lifebloom Tonic', '!Apothecary', 'Distiller'], ['Panacea', 'Rare Roots']], cap: 'Elixir of Life' },
      { name: 'Venoms', sub: 'Blade oils', tiers: [['Careful Gloves', 'Toxin Lore'], ['*Nightshade Oil', 'Lasting Coat', 'Numbroot'], ['*Wither Oil', '?Paralytic|Corrosive', 'Virulence'], ['*Plague Flask', '!Venomblood', 'Contagion'], ['Black Lotus', 'Deathcap']], cap: "Widow's Kiss" },
      { name: 'Elixirs', sub: 'Combat power', tiers: [["Brewer's Eye", 'Steady Heat'], ['*Ironbark Tonic', 'Tempered', 'Longer Brews'], ['*Swiftroot Elixir', '?Berserker Brew|Sage Brew', 'Mixologist'], ['*Stormleaf Elixir', '!Master Brewer', 'Twin Elixir'], ['Moonpetal', 'Dragonbloom']], cap: "Philosopher's Draught" },
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
    id: 'cooking', fam: 'calling', name: 'Cooking', color: '--c-fire', mentor: 'Hilde, the tavern', res: 'Pantry',
    flavour: 'Nobody storms a crypt on an empty stomach.', how: 'Cook meals at campfires and inns.',
    branches: [
      { name: 'Feasts', sub: 'Big buffs', tiers: [['Seasoning', 'Good Knife'], ['*Hearty Stew', 'Big Pot', 'Savoury'], ["*Hunter's Feast", '?Rich|Light', 'Spice Trade'], ['*Banquet', '!Head Chef', 'Share Plate'], ['Royal Table', 'Legendary Dish']], cap: 'Feast of Heroes' },
      { name: 'Rations', sub: 'On the road', tiers: [['Preserve', 'Salt'], ['*Trail Ration', 'Light Pack', 'Jerky'], ['*Battle Bread', '?Quick Bite|Slow Burn', 'Canteen'], ['*Iron Ration', '!Frugal', "Forager's Snack"], ['Elven Bread', 'Endless Rations']], cap: "Soldier's Stomach" },
      { name: 'Campfire', sub: 'Resting', tiers: [['Kindler', 'Warm Hands'], ['*Camp Cook', 'Cosy Fire', 'Watch Fire'], ['*Campfire Tales', '?Rested|Wary', 'Songs'], ['*Safe Haven', '!Hearthkeeper', 'Night Watch'], ['Warm Dreams', 'Home Fire']], cap: 'Hearth of the Wilds' },
    ],
  },
  {
    id: 'runecraft', fam: 'calling', name: 'Runecraft', color: '--c-shadow', mentor: 'Master Fröst, once you can smith', mentorNpc: 'froest', requires: ['smithing', 5],
    flavour: 'Words cut into steel.', how: 'Inscribe runes on weapons and armour.',
  },
  {
    id: 'beastbinding', fam: 'calling', name: 'Beastbinding', color: '--c-herb', mentor: 'Unknown', secret: true,
    flavour: 'Every slime remembers what it ate.', how: 'Capture monster essences.',
  },
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
