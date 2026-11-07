import { k, type ClassSpec } from './types';

// Origin classes (wave C8): one for each non-human people. Only someone born
// to that people can learn it, and it wakes on its own when their legend
// grows (Legendary Hero level 2): no mentor, the blood remembers.

const BLOOD = (people: string) => `Your own blood, when your legend grows (born ${people}, Legendary Hero level 2)`;

export const ORIGIN: ClassSpec[] = [
  // ==== Dragonheart: dragonkin =================================================================
  {
    id: 'dragonheart', fam: 'combat', tier: 'origin', name: 'Dragonheart', color: '--c-fire', origin: 'dragonkin', requires: ['legendaryHero', 2],
    icon: 'M12 3c-4 3-6 7-6 11a6 6 0 0 0 12 0c0-4-2-8-6-11zM4 10l-2-3M20 10l2-3',
    mentor: BLOOD('dragonkin'),
    flavour: 'Somewhere in you, a dragon is waking up.', how: 'Fight as the dragon wakes: blows given and taken build Dragonfire, released as Dragon Breath.',
    core: 'Wyrmblood', lead: 'Dragonheart lets the dragon out: breath that burns, wings that carry you, a hide that turns blades.',
    mech: {
      res: 'Dragonfire', color: '#ff8246',
      gain: { hit: 6, hurt: 6, kill: 10 },
      per: { melee: 0.15, dmgTaken: -0.1 },
      full: { kind: 'blast', name: 'Dragon Breath', when: 'next', style: 'fire', r: 5, d: 180, fx: 'burn' },
    },
    field: { name: 'Dragon Wings', kind: 'glide', text: 'Hold Jump while falling to glide on half-unfurled wings.' },
    tree: [
      ['Breath', 'Fire from within', [['Hot Blood', 'Smoke Breath'], ['*Fire Breath', 'Deep Lungs', 'Cinder Tongue'], ['*Flame Gout', '?Blue Flame|Black Flame', 'Hot Throat'], ['*Inferno Breath', '!Firestorm Lungs', 'Scorch'], ['Ember Heart', 'Ancestral Fire']], 'Breath of the First Dragon'],
      ['Wing', 'Wings and the sky', [['Wing Stubs', 'Light Bones'], ['*Wing Buffet', 'Strong Wings', 'Wind Under'], ['*Dragon Leap', '?Swoop|Soar', 'Sky Sense'], ['*Wing Storm', '!Skybound', 'High Air'], ['Eyrie Born', 'Old Sky']], 'Flight of the Wyrm'],
      ['Scale', 'The hide', [['Scale Skin', 'Old Blood'], ['*Scale Shield', 'Hard Scales', 'Dragon Pride'], ['*Roar of the Brood', '?Bronze Hide|Black Hide', 'Unbowed'], ['*Dragon Form', '!Wyrm Heart', 'Ancient Scale'], ['Hoard Sense', 'Long Memory']], 'The Dragon Wakes'],
    ],
    skills: {
      'Fire Breath': k('cone', 'fire', 6, 'Breathe out, and keep breathing.', { d: 32, c: 16, r: 6, fx: 'burn', gain: 12 }),
      'Flame Gout': k('bolt', 'fire', 8, 'A ball of fire, coughed up hot.', { d: 36, c: 18, r: 3, fx: 'burn' }),
      'Inferno Breath': k('cone', 'fire', 14, 'Everything in front of you burns.', { d: 50, c: 26, r: 8, fx: 'burn' }),
      'Breath of the First Dragon': k('cone', 'fire', 50, 'The breath of the first dragon, who lit the world.', { d: 120, c: 40, r: 12, big: true, spend: 'all', fx: 'burn' }),
      'Wing Buffet': k('nova', 'gale', 8, 'Spread your wings and knock them flat.', { d: 22, c: 14, r: 5, fx: 'stun' }),
      'Dragon Leap': k('leap', 'fire', 10, 'One beat of the wings, and down on them.', { d: 40, c: 20, r: 3.5, fx: 'burn' }),
      'Wing Storm': k('whirl', 'gale', 12, 'A storm of beating wings.', { d: 40, c: 22, r: 4.5, fx: 'stun' }),
      'Flight of the Wyrm': k('meteor', 'fire', 50, 'Rise, and fall on them like a dragon.', { d: 115, c: 40, r: 6, big: true, fx: 'burn' }),
      'Scale Shield': k('ward', 'fire', 16, 'Your scales harden.', { d: 60, c: 14, t: 10 }),
      'Roar of the Brood': k('nova', 'fire', 14, 'A roar every dragon would know.', { d: 16, c: 14, r: 7, fx: 'stun' }),
      'Dragon Form': k('buff', 'fire', 30, 'More dragon than you were.', { c: 20, t: 10, m: { melee: 0.25, dmgTaken: -0.25, poise: 0.4 } }),
      'The Dragon Wakes': k('buff', 'fire', 70, 'The dragon is awake.', { c: 35, t: 15, m: { melee: 0.4, dmgTaken: -0.4, moveSpeed: 0.2 }, big: true }),
    },
    asc: [
      { name: 'Wyrmfire', flavour: 'Burn it all.', nodes: ['White Fire', 'Breath Fury', 'Quick Breath', 'The Burning Sky'], lean: 'edge' },
      { name: 'Elder Scale', flavour: 'The oldest dragons cannot be hurt.', nodes: ['Thick Scales', 'Brood Ward', 'Unbowed Heart', 'The Elder Hide'], lean: 'guard' },
    ],
  },

  // ==== Hellborn: demonkind ===================================================================
  {
    id: 'hellborn', fam: 'magic', tier: 'origin', name: 'Hellborn', color: '--c-blood', origin: 'demon', requires: ['legendaryHero', 2],
    icon: 'M6 4c0 4 2 6 6 6s6-2 6-6M12 10v4M8 21l4-7 4 7',
    mentor: BLOOD('demon'),
    flavour: 'Hellfire, and the old pacts your blood remembers.', how: 'Cast with hellfire: spells cost a little of your health and build Pact, which breaks as Hellfire.',
    core: 'Infernal Blood', lead: 'Hellborn burns with hellfire and keeps the old pacts: power bought with your own blood, paid back in theirs.',
    mech: {
      res: 'Pact', color: '#d8574a', castHp: 0.03,
      gain: { cast: 10, kill: 12, hurt: 6 },
      per: { spell: 0.25 },
      full: { kind: 'blast', name: 'Hellfire', when: 'next', style: 'fire', r: 5, d: 75, fx: 'burn' },
      low: { below: 0.4, m: { spell: 0.2 } },
    },
    tree: [
      ['Hellfire', 'Fire from below', [['Brimstone', 'Sulphur'], ['*Hellbolt', 'Black Fire', 'Hot Coals'], ['*Fire Pit', '?Pit|Pyre', 'Smoulder'], ['*Hellstorm', '!Infernal', 'Brimstone Rain'], ['Lake of Fire', 'Ninth Circle']], 'Gate of Hell'],
      ['Pact', 'Bargains', [['Contract', 'Fine Print'], ['*Blood Pact', 'Signed in Blood', 'Collateral'], ['*Soul Bargain', '?Fair Price|Steep Price', 'Interest'], ['*Infernal Contract', '!Debt Collector', 'Binding Clause'], ['Old Debts', 'Paid in Full']], 'The Final Bargain'],
      ['Horn', 'Demon blood', [['Horned', 'Thick Hide'], ['*Demon Skin', 'Ashen Blood', 'Glowing Eyes'], ['*Terror', '?Dread|Panic', 'Fear Itself'], ['*Demon Form', '!True Form', 'Unholy Vigour'], ['Ancient Blood', 'Throne Born']], 'Archdemon'],
    ],
    skills: {
      Hellbolt: k('bolt', 'fire', 2, 'A bolt of black fire.', { d: 26, c: 10, fx: 'burn' }),
      'Fire Pit': k('zone', 'fire', 12, 'The ground opens into fire.', { d: 38, c: 22, r: 4, t: 6, fx: 'burn' }),
      Hellstorm: k('meteor', 'fire', 16, 'Fire rains from below, somehow.', { d: 56, c: 30, r: 5, fx: 'burn' }),
      'Gate of Hell': k('zone', 'fire', 60, 'Open the gate. Briefly.', { d: 100, c: 50, r: 8, t: 8, big: true, fx: 'burn' }),
      'Blood Pact': k('buff', 'blood', 24, 'Sign it.', { c: 12, t: 10, m: { spell: 0.35, dmgTaken: 0.1 } }),
      'Soul Bargain': k('drain', 'shadow', 7, 'Take their soul, as agreed.', { d: 32, c: 14 }),
      'Infernal Contract': k('smite', 'shadow', 14, 'The contract comes due.', { d: 60, c: 26, r: 3, fx: 'curse' }),
      'The Final Bargain': k('nova', 'blood', 60, 'Everything, for everything.', { d: 115, c: 50, r: 8, big: true, spend: 'all', fx: 'leech' }),
      'Demon Skin': k('ward', 'fire', 16, 'Your skin turns black and hard.', { d: 55, c: 16, t: 10 }),
      Terror: k('nova', 'shadow', 14, 'Show them what you are.', { d: 14, c: 16, r: 7, fx: 'stun' }),
      'Demon Form': k('buff', 'fire', 30, 'Let them see the horns.', { c: 24, t: 10, m: { spell: 0.3, dmgTaken: -0.25 } }),
      Archdemon: k('buff', 'fire', 70, 'The blood of kings of hell.', { c: 45, t: 15, m: { spell: 0.45, dmgTaken: -0.35, castSpeed: 0.2 }, big: true }),
    },
    asc: [
      { name: 'Hellfire Lord', flavour: 'The fire answers to you.', nodes: ['Black Flame', 'Infernal Fury', 'Quick Pact', 'The Burning Throne'], lean: 'edge' },
      { name: 'Pactkeeper', flavour: 'Every bargain, honoured.', nodes: ['Hard Hide', 'Pact Ward', 'Iron Contract', 'The Eternal Clause'], lean: 'guard' },
    ],
  },

  // ==== Wildheart: beastfolk ===================================================================
  {
    id: 'wildheart', fam: 'combat', tier: 'origin', name: 'Wildheart', color: '--c-herb', origin: 'beastfolk', requires: ['legendaryHero', 2],
    icon: 'M6 14c0-4 3-7 6-7s6 3 6 7M5 8l2-4 3 3M19 8l-2-4-3 3M9 14h.01M15 14h.01M10 18h4',
    mentor: BLOOD('beastfolk'),
    flavour: 'The pack is in your blood, and so is the hunt.', how: 'Fight on instinct: blows, dodges and kills build Instinct until Pack Instinct takes over.',
    core: 'The Hunt', lead: 'Wildheart fights on instinct: senses that never miss, a pack that is always with you, and a hunt that never ends.',
    mech: {
      res: 'Instinct', color: '#8fcf6a',
      gain: { hit: 6, dodge: 12, kill: 12 },
      per: { attackSpeed: 0.15, moveSpeed: 0.15 },
      full: { kind: 'buff', name: 'Pack Instinct', when: 'auto', style: 'nature', t: 10, m: { attackSpeed: 0.25, crit: 0.15, moveSpeed: 0.15 } },
      mark: { name: 'Prey', on: 'hit', at: 4, per: 0.03, burst: 'bleed', style: 'blood' },
    },
    field: { name: 'Wild Senses', kind: 'stride', text: 'When nothing hostile is within 25 m, you move 12% faster.' },
    tree: [
      ['Claw', 'Tooth and claw', [['Sharp Claws', 'Feral'], ['*Rake', 'Long Claws', 'Rip'], ['*Pounce Strike', '?Big Cat|Wolf', 'Savage'], ['*Frenzied Claws', '!Feral Heart', 'Tear'], ['Apex', 'Old Hunter']], 'Apex Predator'],
      ['Pack', 'Never alone', [['Pack Sense', 'Howl'], ['*Pack Call', 'Packmates', 'Loyal Blood'], ['*Flank', '?Encircle|Harry', 'Pack Tactics'], ['*Spirit Pack', '!Pack Heart', 'Kin'], ['Den', 'Blood Kin']], 'The Whole Pack'],
      ['Senses', 'Nothing escapes you', [['Keen Nose', 'Sharp Ears'], ['*Hunter\'s Sense', 'Night Eyes', 'Still Hunter'], ['*Evade', '?Quick Reflex|Wary', 'Light Paws'], ['*Primal Roar', '!Wild Heart', 'Alert'], ['Wilderness', 'Old Ways']], 'One with the Wild'],
    ],
    skills: {
      Rake: k('cone', 'blood', 5, 'Claws, across.', { d: 30, c: 12, r: 3, fx: 'bleed', gain: 10 }),
      'Pounce Strike': k('leap', 'nature', 8, 'Spring.', { d: 36, c: 16, r: 2.5, fx: 'mark' }),
      'Frenzied Claws': k('cone', 'blood', 12, 'Claws, claws, claws.', { d: 46, c: 24, r: 3.5, fx: 'bleed' }),
      'Apex Predator': k('dash', 'blood', 45, 'You are what they are afraid of.', { d: 100, c: 35, big: true, spend: 'all', fx: 'bleed' }),
      'Pack Call': k('spirit', 'nature', 18, 'Your kin answer.', { d: 26, c: 16, t: 15 }),
      Flank: k('blink', 'nature', 6, 'Round the side, and in.', { d: 28, c: 12, r: 6 }),
      'Spirit Pack': k('volley', 'nature', 14, 'A pack of spirit wolves.', { d: 22, c: 20, n: 6, fx: 'bleed' }),
      'The Whole Pack': k('spirit', 'nature', 60, 'Everyone you ever ran with.', { d: 46, c: 40, t: 20, big: true, fx: 'bleed' }),
      "Hunter's Sense": k('buff', 'nature', 20, 'You hear their heartbeats.', { c: 12, t: 10, m: { crit: 0.2, attackSpeed: 0.1 } }),
      Evade: k('buff', 'gale', 16, 'Nothing touches you.', { c: 12, t: 6, m: { dodgeCost: -0.6, moveSpeed: 0.25 } }),
      'Primal Roar': k('nova', 'nature', 14, 'The roar of the oldest beast.', { d: 18, c: 16, r: 7, fx: 'stun' }),
      'One with the Wild': k('buff', 'nature', 60, 'The wild runs in you.', { c: 30, t: 15, m: { attackSpeed: 0.3, moveSpeed: 0.3, crit: 0.2, melee: 0.2 }, big: true }),
    },
    asc: [
      { name: 'Alpha', flavour: 'The pack follows you.', nodes: ['Sharp Fang', 'Hunt Fury', 'Quick Hunt', 'The Endless Hunt'], lean: 'edge' },
      { name: 'Elder of the Pack', flavour: 'The old ones know how to survive.', nodes: ['Thick Pelt', 'Den Ward', 'Wary Heart', 'The Old Survivor'], lean: 'guard' },
    ],
  },

  // ==== Runebound: dwarves =====================================================================
  {
    id: 'runebound', fam: 'combat', tier: 'origin', name: 'Runebound', color: '--c-earth', origin: 'dwarf', requires: ['legendaryHero', 2],
    icon: 'M12 3l7 4v10l-7 4-7-4V7zM12 8v8M9 10l6 4',
    mentor: BLOOD('a dwarf'),
    flavour: 'The runes in your skin were carved before you were born.', how: 'Fight as the runes wake: heavy blows, blocks and blows you take light Runes, and five flare as a Rune Flare.',
    core: 'Living Runes', lead: 'Runebound carries living runes in the skin: each blow lights one, and five lit at once flare like a forge.',
    mech: {
      res: 'Runes', color: '#d09a5a', max: 5, pips: true, decay: 0.3,
      gain: { heavy: 1, block: 1, hurt: 1 },
      per: { dmgTaken: -0.15, poise: 0.3 },
      full: { kind: 'blast', name: 'Rune Flare', when: 'next', style: 'earth', r: 3.5, d: 180, fx: 'stun' },
    },
    field: { name: 'Rune Fist', kind: 'force', text: 'Break a lock open with a rune-lit fist, no heavy weapon needed.' },
    tree: [
      ['Forge', 'Runes of making', [['Hot Rune', 'Anvil Skin'], ['*Forge Strike', 'Hammer Rune', 'Smith Blood'], ['*Molten Rune', '?Iron Rune|Gold Rune', 'Bellows'], ['*Forgefire', '!Rune Smith', 'Slag'], ['Deep Forge', 'First Anvil']], 'The Great Forge'],
      ['Stone', 'Runes of the deep', [['Deep Rune', 'Stone Blood'], ['*Stone Rune', 'Granite Rune', 'Deep Breath'], ['*Earthen Rune', '?Mountain Rune|Cave Rune', 'Old Stone'], ['*Rune of the Hold', '!Stone Bound', 'Hold Blood'], ['Mountain Born', 'Deep Hold']], 'Heart of the Mountain'],
      ['Ward', 'Runes of guarding', [['Ward Rune', 'Shield Blood'], ['*Rune Shield', 'Iron Ward', 'Thick Skin'], ['*Ancestor Rune', '?Grandfather|Grandmother', 'Clan Ward'], ['*Rune Armour', '!Ancestral', 'Old Clan'], ['Long Beard', 'Clan Honour']], 'The Ancestors Answer'],
    ],
    skills: {
      'Forge Strike': k('strike', 'fire', 5, 'A blow like a hammer on an anvil.', { d: 34, c: 16, fx: 'burn', gain: 1 }),
      'Molten Rune': k('trap', 'fire', 10, 'A rune of molten iron in the ground.', { d: 40, c: 18, r: 3.5, t: 30, fx: 'burn' }),
      Forgefire: k('nova', 'fire', 14, 'The forge-heat bursts out of you.', { d: 44, c: 24, r: 5, fx: 'burn' }),
      'The Great Forge': k('nova', 'fire', 50, 'The first forge, lit again.', { d: 115, c: 40, r: 7, big: true, spend: 'all', fx: 'burn' }),
      'Stone Rune': k('smite', 'earth', 8, 'A rune of stone beneath them.', { d: 34, c: 16, r: 2.5, fx: 'stun' }),
      'Earthen Rune': k('nova', 'earth', 12, 'The ground answers the rune.', { d: 38, c: 20, r: 5, fx: 'stun' }),
      'Rune of the Hold': k('zone', 'earth', 18, 'The rune of your hold, carved in the ground.', { d: 40, c: 24, r: 5, t: 8, fx: 'root' }),
      'Heart of the Mountain': k('buff', 'earth', 60, 'The mountain\'s heart beats in you.', { c: 30, t: 15, m: { dmgTaken: -0.45, poise: 0.5, melee: 0.2 }, big: true }),
      'Rune Shield': k('ward', 'earth', 16, 'A rune of warding flares on your skin.', { d: 60, c: 14, t: 10 }),
      'Ancestor Rune': k('spirit', 'earth', 24, 'An ancestor steps out of the rune to fight beside you.', { d: 30, c: 20, t: 15 }),
      'Rune Armour': k('buff', 'earth', 28, 'Runes cover you head to foot.', { c: 18, t: 10, m: { dmgTaken: -0.3, poise: 0.4 } }),
      'The Ancestors Answer': k('spirit', 'light', 60, 'Every ancestor of your clan, at once.', { d: 50, c: 40, t: 20, big: true, fx: 'stun' }),
    },
    asc: [
      { name: 'Runesmith', flavour: 'The forge is never cold.', nodes: ['Hot Runes', 'Forge Fury', 'Quick Carve', 'The Endless Forge'], lean: 'edge' },
      { name: 'Ancestor\'s Shield', flavour: 'The clan stands behind you.', nodes: ['Clan Mail', 'Ancestor Ward', 'Stone Will', 'The Clan Endures'], lean: 'guard' },
    ],
  },

  // ==== Elderwood: elves =======================================================================
  {
    id: 'elderwood', fam: 'magic', tier: 'origin', name: 'Elderwood', color: '--c-herb', origin: 'elf', requires: ['legendaryHero', 2],
    icon: 'M12 21V8M12 8l-5-5M12 8l5-5M12 13l-4-2M12 13l4-2M8 21h8',
    mentor: BLOOD('an elf'),
    flavour: 'The old forest magic, older than the elves who keep it.', how: 'Call the old wood: Sap rises on its own and with each spell, and a full Sap wakes the Wardens of the Wood.',
    core: 'The Old Green', lead: 'Elderwood is the old forest magic: sap that rises in you, roots that hold, and wardens of the wood who answer.',
    mech: {
      res: 'Sap', color: '#8fcf6a', regen: 2, decay: 0,
      gain: { spell: 6 },
      per: { spell: 0.15, heal: 0.2 },
      full: { kind: 'summon', name: 'Wardens of the Wood', when: 'next', style: 'nature', ally: 'beast', n: 2, t: 15, d: 38 },
      mark: { name: 'Old Growth', on: 'spell', at: 4, per: 0.03, burst: 'root', style: 'nature' },
    },
    field: { name: 'Elder Path', kind: 'stride', text: 'When nothing hostile is within 25 m, you move 12% faster.' },
    tree: [
      ['Root', 'The old roots', [['Deep Root', 'Old Soil'], ['*Root Snare', 'Strangling Root', 'Tap Root'], ['*Thorn Wall', '?Hawthorn Wall|Holly Wall', 'Briar Heart'], ['*Ancient Roots', '!Root Bound', 'World Root'], ['Heartwood', 'Old Forest']], 'The World Tree'],
      ['Leaf', 'Light through the canopy', [['Green Light', 'Canopy'], ['*Leaf Storm', 'Sharp Leaves', 'Autumn'], ['*Moonbeam', '?Silver Leaf|Gold Leaf', 'Dappled Light'], ['*Starleaf', '!Canopy Born', 'Evening Star'], ['Elven Light', 'High Boughs']], 'The Falling Stars'],
      ['Sap', 'Healing green', [['Sweet Sap', 'Old Bark'], ['*Sap Mend', 'Rising Sap', 'Green Blood'], ['*Bark Ward', '?Oak Bark|Birch Bark', 'Ringed'], ['*Elder Blessing', '!Elder Born', 'Long Life'], ['Ageless', 'Thousand Years']], 'The Eternal Spring'],
    ],
    skills: {
      'Root Snare': k('smite', 'nature', 6, 'Roots burst up around them.', { d: 26, c: 14, r: 2.5, fx: 'root' }),
      'Thorn Wall': k('zone', 'nature', 14, 'A wall of thorns grows where you point.', { d: 30, c: 20, r: 4, t: 8, fx: 'bleed' }),
      'Ancient Roots': k('zone', 'earth', 18, 'Roots older than kingdoms.', { d: 44, c: 26, r: 5, t: 6, fx: 'root' }),
      'The World Tree': k('zone', 'nature', 60, 'The world tree, rising.', { d: 95, c: 50, r: 9, t: 8, big: true, fx: 'root' }),
      'Leaf Storm': k('volley', 'nature', 6, 'A storm of razor leaves.', { d: 16, c: 16, n: 7, fx: 'mark' }),
      Moonbeam: k('smite', 'light', 9, 'A beam of moonlight through the leaves.', { d: 40, c: 18, r: 2.5, fx: 'stun' }),
      Starleaf: k('chain', 'light', 12, 'A leaf of starlight that leaps between them.', { d: 34, c: 22, n: 5, fx: 'mark' }),
      'The Falling Stars': k('meteor', 'light', 55, 'The stars fall through the canopy.', { d: 110, c: 50, r: 7, big: true, fx: 'stun' }),
      'Sap Mend': k('heal', 'nature', 16, 'Sap closes your wounds.', { d: 28, c: 16, t: 4 }),
      'Bark Ward': k('ward', 'nature', 16, 'Bark grows over you.', { d: 55, c: 16, t: 10 }),
      'Elder Blessing': k('buff', 'nature', 30, 'The blessing of the eldest trees.', { c: 22, t: 12, m: { heal: 0.5, spell: 0.2, dmgTaken: -0.2 } }),
      'The Eternal Spring': k('heal', 'nature', 70, 'Spring that never ends.', { d: 85, c: 45, t: 5, big: true }),
    },
    asc: [
      { name: 'Grovelord', flavour: 'The forest marches.', nodes: ['Thorn Fury', 'Root Wrath', 'Quick Growth', 'The Walking Wood'], lean: 'edge' },
      { name: 'Ageless', flavour: 'Trees outlive kingdoms.', nodes: ['Heartwood Skin', 'Sap Ward', 'Patient Root', 'The Thousand Years'], lean: 'guard' },
    ],
  },
];
