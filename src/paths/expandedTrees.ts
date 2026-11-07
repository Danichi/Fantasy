import type { BranchDef } from './data';

// Trees for every discipline that had none: the classes taught later in the
// story (Dawnblade, Warbreaker, Cryomancer, Shadowcaller, Voidwalker,
// Beastbinding) and the fifteen hidden classes behind the gateways.
// Same shape as data.ts: three branches of five tiers and a capstone;
// '*' marks a skill for the bar, '!' a keystone, '?' a choice "A|B".
// Every '*' skill and every capstone here is built in classes/forge.ts.

type T = [string, string, string[][], string];
const br = (rows: T[]): BranchDef[] => rows.map(([name, sub, tiers, cap]) => ({ name, sub, tiers, cap }));

export const EXPANDED_TREES: Record<string, BranchDef[]> = {
  // ---- combat classes ---------------------------------------------------------------------
  dawnblade: br([
    ['Sunrise', 'Holy strikes', [['Morning Edge', 'Bright Steel'], ['*Dawn Strike', 'Gilded Blade', 'Warm Grip'], ['*Solar Arc', '?Blinding|Searing', 'Lit Path'], ['*Sunburst', '!Noon Zealot', 'Halo Steel'], ['First Light', 'Endless Day']], 'Wrath of Morning'],
    ['Vigil', 'Light that guards', [['Lantern Heart', 'Steady Vigil'], ['*Sanctified Ground', 'Hallowed', 'Patient Light'], ['*Aegis of Dawn', '?Mirror|Beacon', 'Candle Ward'], ['*Rising Light', '!Vigilant', 'Dawn Plate'], ['Unbroken Vigil', 'Morning Prayer']], 'Daybreak'],
    ['Pilgrim', 'Light on the move', [['Road Prayer', 'Light Feet'], ['*Sunstep', 'Pilgrim Pace', 'Glint'], ['*Judgment Leap', '?Comet|Lantern', 'Sure Stride'], ['*Radiant Charge', '!Sun Runner', 'Flare'], ['Zenith', 'Long Road']], 'Hour of the Sun'],
  ]),
  warbreaker: br([
    ['Ruin', 'Huge blows with both weapons', [['Heavy Hands', 'Iron Grip'], ['*Skullsplitter', 'Bone Breaker', 'Brute'], ['*Earthbreaker', '?Fault Line|Aftershock', 'Iron Back'], ['*Ruinous Blow', '!Reckless', 'Hammerfall'], ['Mountain Breaker', 'Bone Crusher']], 'The Last Swing'],
    ['Fury', 'Rage and the beat', [['Hot Blood', 'War Drum'], ['*Blood Howl', 'Fury Well', 'Snarl'], ['*Frenzy', '?Berserk|Cold Rage', 'Bloodlust'], ['*Rampage', '!Red Mist', 'Pain Eater'], ['Unstoppable', 'Warpath']], 'Avatar of War'],
    ['Ironhide', 'Take it and keep coming', [['Scarred', 'Thick Skin'], ['*Shrug Off', 'Hard to Kill', 'Stubborn'], ['*Iron Roar', '?Defiant|Taunting', 'Bulwark Body'], ['*Last Stand', '!Unbreakable', 'Oxhide'], ['Old Wounds', 'Orc Blood']], 'Mountain That Walks'],
  ]),

  // ---- magic classes ----------------------------------------------------------------------
  cryomancer: br([
    ['Rime', 'Shards and lances', [['Cold Hands', 'Clear Ice'], ['*Frost Shard', 'Brittle', 'Sharp Cold'], ['*Ice Lance', '?Splinter|Pierce Through', 'Hoarfrost'], ['*Glacial Spike', '!Absolute Zero', 'Shatter Point'], ['Diamond Dust', 'Frozen Heart']], 'Comet of Ice'],
    ['Winter', 'Storms and fields', [['Snowfall', 'Long Winter'], ['*Frost Nova', 'Numbing', 'Chill Wind'], ['*Blizzard', '?Whiteout|Hail', 'Deep Snow'], ['*Frozen Ground', '!Eternal Winter', 'Biting Cold'], ['Polar Night', 'Snowblind']], 'Endless Winter'],
    ['Glacier', 'Ice armour', [['Frostskin', 'Calm Blood'], ['*Ice Barrier', 'Glacial Mind', 'Rime Coat'], ['*Frost Step', '?Ice Mirror|Cold Snap', 'Icebound'], ['*Cryostasis', '!Heart of Ice', 'Permafrost'], ['Glacier Shell', 'Winter Crown']], 'Avalanche'],
  ]),
  shadowcaller: br([
    ['Curse', 'Hexes', [['Whisper', 'Ill Omen'], ['*Hex Bolt', 'Malice', 'Dread'], ['*Wither', '?Rot|Decay', 'Spite'], ['*Doom', '!Cursed Blood', 'Grim'], ['Black Sun', 'Unlucky Stars']], 'Night Eternal'],
    ['Harvest', 'Souls', [['Soul Sense', 'Cold Touch'], ['*Soul Drain', 'Hunger', 'Grave Dust'], ['*Reap', '?Gluttony|Sharing', 'Bone Chill'], ['*Soul Storm', '!Soulbound', 'Ferryman'], ['Many Mouths', 'Last Breath']], 'The Reaper Walks'],
    ['Shade', 'A body of shadow', [['Dim', 'Quiet Step'], ['*Shadow Step', 'Veil', 'Shade Skin'], ['*Umbral Ward', '?Fade|Dark Mirror', 'Night Eyes'], ['*Shade Form', '!Become Shadow', 'Penumbra'], ['Unseen', 'Hollow Light']], 'Eclipse'],
  ]),
  voidwalker: br([
    ['Rift', 'Tear the world open', [['Thin Walls', 'Far Sight'], ['*Void Bolt', 'Hollow', 'Null Edge'], ['*Rift', '?Wide Rift|Deep Rift', 'Crackle'], ['*Singularity', '!Event Horizon', 'Gravity Well'], ['Star Eater', 'Unmade']], 'Collapse of Stars'],
    ['Gravity', 'Pull and crush', [['Heavy Air', 'Weight'], ['*Crush', 'Mass', 'Pressure'], ['*Gravity Lance', '?Drag|Slam', 'Orbit'], ['*Black Hole', '!Infinite Mass', 'Tidal Force'], ['Neutron Heart', 'Dense']], 'The Great Attractor'],
    ['Between', 'Walking the dark', [['Starless', 'Drift'], ['*Phase Shift', 'Unanchored', 'Echo Step'], ['*Void Shell', '?Null Shell|Mirror Shell', 'Weightless'], ['*Riftwalk', '!Lost Between', 'Far Step'], ['Nowhere', 'Everywhere']], 'Step Beyond'],
  ]),

  // ---- callings ---------------------------------------------------------------------------
  beastbinding: br([
    ['Essence', 'Bottled monsters', [['Steady Jar', 'Essence Lore'], ['*Slime Burst', 'Sticky', 'Bottle Craft'], ['*Wolf Spirit', '?Pack Bond|Lone Hunter', 'Scent'], ['*Bat Swarm', '!Menagerie', 'Night Wings'], ['Wyrm Essence', 'Rare Jars']], 'Chimera'],
    ['Bond', 'Spirit companions', [['Calm Voice', 'Gentle Hand'], ['*Spirit Hawk', 'Keen Eyes', 'Feather'], ['*Bear Spirit', '?Guardian|Brawler', 'Thick Fur'], ['*Stag Spirit', '!Pack Leader', 'Antler'], ['Old Friends', 'Wild Heart']], 'King of Beasts'],
    ['Wild', 'Thorn and root', [['Green Thumb', 'Mossy'], ['*Thorn Lash', 'Bramble', 'Sap'], ['*Entangle', '?Strangle|Bind', 'Root'], ['*Wild Growth', '!One with the Wild', 'Bloom'], ['Ancient Grove', 'Spring']], 'Heart of the Forest'],
  ]),

  // ---- hidden classes: Gale gateways ------------------------------------------------------
  stormdancer: br([
    ['Squall', 'Never still', [['Storm Feet', 'Wild Air'], ['*Squall Step', 'Gusting', 'Light Body'], ['*Thunderclap', '?Rolling|Crackling', 'Static'], ['*Storm Waltz', '!Eye of the Storm', 'Overcharge'], ['Ball Lightning', 'Stormborn']], 'Heart of the Tempest'],
    ['Lightning', 'Strike from the sky', [['Spark', 'Conductor'], ['*Arc Slash', 'Forked', 'Live Wire'], ['*Chain Lightning', '?Long Chain|Heavy Bolt', 'Grounded'], ['*Skyfall', '!Lightning Rod', 'Thunderhead'], ['Supercell', 'Afterflash']], 'Wrath of the Sky'],
    ['Cloud', 'Untouchable', [['Mist', 'Featherfall'], ['*Cloudstep', 'Drift Away', 'Haze'], ['*Storm Shroud', '?Rain Veil|Fog Veil', 'Soft Landing'], ['*Gale Mantle', '!Untouched', 'Slipstream Body'], ['High Winds', 'Cloud Walker']], 'Lord of Storms'],
  ]),
  moonblade: br([
    ['Crescent', 'The drawn cut', [['Silver Edge', 'Night Grip'], ['*Moon Draw', 'Clean Cut', 'Steady Sheath'], ['*Crescent Wave', '?Wide Moon|Thin Moon', 'Pale Edge'], ['*Lunar Cleave', '!One Cut', 'Silvered'], ['Full Moon', 'Moonrise']], 'Moonfall'],
    ['Eclipse', 'Cuts in darkness', [['Dark Side', 'Shadowed Steel'], ['*Eclipse Cut', 'Umbra', 'Night Hunter'], ['*New Moon', '?Waning|Waxing', 'Moonless'], ['*Blood Moon', '!Black Moon', 'Tides'], ['Lunatic', 'Moonshadow']], 'Total Eclipse'],
    ['Tide', 'Ebb and flow', [['Ebb', 'Flow'], ['*Tidal Slash', 'Undertow', 'Spring Tide'], ['*Riptide', '?High Tide|Low Tide', 'Current'], ['*Moon Mirror', '!Turn of the Tide', 'Silver Water'], ['Neap', 'Moonwater']], 'Night of a Thousand Moons'],
  ]),
  swordsaint: br([
    ['Mirror', 'The perfect parry', [['Clear Eye', 'Soft Wrist'], ['*Mirror Cut', 'Read Them', 'Light Touch'], ['*Turning Blade', '?Reflect|Redirect', 'Poise of Water'], ['*Heaven Splitter', '!Saint Hand', 'Still Edge'], ['Master Eye', 'No Wasted Motion']], 'Sword of Heaven'],
    ['Discipline', 'Forty years of practice', [['Morning Drills', 'Patience'], ['*Iai', 'Sheath Speed', 'Breath Count'], ['*Hundred Cuts', '?Precise|Relentless', 'Tireless Arm'], ['*Void Cut', '!Empty Mind', 'Old Calluses'], ['Living Legend', 'Wisdom']], 'The Last Lesson'],
    ['Serenity', 'Calm that cannot break', [['Still Water', 'Quiet Heart'], ['*Meditation', 'Inner Peace', 'Slow Breath'], ['*Serene Ward', '?Lotus|Willow', 'Unshaken'], ['*Enlightenment', '!Nirvana', 'Clarity'], ['Peaceful Blade', 'Harmony']], 'Perfect Stillness'],
  ]),

  // ---- hidden classes: Cross gateways -----------------------------------------------------
  reaver: br([
    ['Carnage', 'Two blades, no mercy', [['Butcher', 'Cruel Edges'], ['*Rend', 'Serrated', 'Hungry Steel'], ['*Carve', '?Flay|Gut', 'Red Hands'], ['*Massacre', '!Bloodbath', 'Gore'], ['Slaughter', 'No Quarter']], 'Red Harvest'],
    ['Hunger', 'Feed on the fight', [['Thirst', 'Taste of Iron'], ['*Bloodletting', 'Leech Blades', 'Feast'], ['*Gorge', '?Glutton|Savour', 'Crimson'], ['*Blood Tide', '!Insatiable', 'Vein Reader'], ['Sanguine', 'Endless Hunger']], 'Crimson Feast'],
    ['Terror', 'Make them run', [['Snarl', 'Grim Look'], ['*Dread Charge', 'Fearsome', 'Hunter'], ['*Howl of Ruin', '?Panic|Cower', 'Shadow Teeth'], ['*Executioner', '!Merciless', 'Doombringer'], ['Nightmare', 'Terror Incarnate']], 'Death Dance'],
  ]),
  nightblade: br([
    ['Shadow', 'Strike unseen', [['Darkness', 'Soft Steps'], ['*Shadow Strike', 'Backstabber', 'Dim Light'], ['*Smoke Bomb', '?Choking|Blinding', 'Shade'], ['*Assassinate', '!Kill Unseen', 'Cold Blood'], ['Night Born', 'Death Mark']], 'Thousand Shadows'],
    ['Venom', 'Poisoned edges', [['Toxin', 'Coat Blades'], ['*Venom Blade', 'Lingering', 'Virulent'], ['*Poison Fan', '?Paralysing|Wasting', 'Rot Edge'], ['*Death Bloom', '!Plague Hands', 'Toxic'], ['Black Venom', 'Antidote']], 'Kiss of the Widow'],
    ['Trick', 'Where did you go?', [['Feint Hand', 'Quick Feet'], ['*Shadow Clone', 'Mirror Feint', 'Slip'], ['*Vanish', '?Long Vanish|Quick Vanish', 'Sleight'], ['*Puppet Strings', '!Trickster King', 'Decoy'], ['Misdirection', 'Ghost']], 'Masquerade'],
  ]),
  bladedancer: br([
    ['Waltz', 'Steps of steel', [['Graceful', 'Tempo Feet'], ['*Twirl', 'Spin Cut', 'Light Feet'], ['*Blade Waltz', '?Fast Waltz|Slow Waltz', 'Partner'], ['*Grand Finale', '!Encore', 'Rhythm'], ['Prima', 'Ballroom']], 'Dance of a Thousand Blades'],
    ['Ribbon', 'Steel that flows', [['Ribbon Hand', 'Flowing'], ['*Ribbon Cut', 'Silk Steel', 'Long Reach'], ['*Silk Storm', '?Wide Silk|Tight Silk', 'Weave'], ['*Steel Ribbon', '!Unbroken Line', 'Flourish'], ['Silken Edge', 'Endless Thread']], 'Storm of Ribbons'],
    ['Flourish', 'Show off', [['Showman', 'Bright Steel'], ['*Flash Step', 'Applause', 'Stage Presence'], ['*Spotlight', '?Dazzle|Charm', 'Bow'], ['*Curtain Call', '!Showstopper', 'Crowd Favourite'], ['Standing Ovation', 'Star']], 'Opening Night'],
  ]),

  // ---- hidden classes: Boundary gateways --------------------------------------------------
  stillmind: br([
    ['Calm', 'The unmoving ring', [['Rooted Mind', 'Centred'], ['*Still Pulse', 'Ripple', 'Calm Focus'], ['*Mind Ward', '?Thick Ward|Wide Ward', 'Settled'], ['*Stillfield', '!Mountain Mind', 'Unmoved'], ['Zen', 'Eye of Calm']], 'Absolute Stillness'],
    ['Echo', 'What comes in goes out', [['Resonance', 'Hum'], ['*Echo Strike', 'Reverb', 'Feedback'], ['*Resound', '?Long Echo|Loud Echo', 'Chime'], ['*Sonic Ring', '!Perfect Echo', 'Tuning'], ['Harmonic', 'Overtone']], 'Thunder of Silence'],
    ['Focus', 'A sharpened mind', [['Attention', 'Quiet Eyes'], ['*Focus Beam', 'Lens', 'Concentration'], ['*Insight', '?Foresight|Hindsight', 'Awareness'], ['*Mind Blade', '!Single Thought', 'Clear Sight'], ['Third Eye', 'Omniscient']], 'Mind over Matter'],
  ]),
  ironwall: br([
    ['Bastion', 'An iron ring', [['Iron Feet', 'Plate Lore'], ['*Iron Ring', 'Bolted', 'Heavy Plate'], ['*Bastion', '?Spiked|Smooth', 'Riveted'], ['*Fortress', '!Immovable', 'Iron Will'], ['Citadel', 'Rampart']], 'The Wall Stands'],
    ['Spikes', 'Hurt what hits you', [['Barbed', 'Sharp Plate'], ['*Spike Burst', 'Thorns', 'Prickly'], ['*Retribution', '?Barbs|Blades', 'Jagged'], ['*Iron Maiden', '!Spite of Iron', 'Razor Plate'], ['Porcupine', 'Spikewall']], 'Field of Spikes'],
    ['Crush', 'The wall moves', [['Weight', 'Momentum'], ['*Wall Slam', 'Heavy Step', 'Shove'], ['*Siege Ram', '?Battering|Breaching', 'Rolling'], ['*Avalanche of Iron', '!Juggernaut', 'Crusher'], ['Siege Breaker', 'Unstoppable Wall']], 'Landslide'],
  ]),
  shieldwarden: br([
    ['Aegis', 'Shield the others', [['Guardian', 'Warden Eye'], ['*Guardian Ward', 'Protector', 'Shield Arm'], ['*Bulwark Line', '?Wide Line|Firm Line', 'Steady'], ['*Aegis Dome', '!Shield of All', 'Ward Lore'], ['Paragon', 'Bastion of Hope']], 'Unbreakable Aegis'],
    ['Oath', 'Words that hold', [['Promise', 'Sworn'], ['*Vow of Iron', 'Honour', 'Faithful'], ['*Oathstrike', '?Vengeful|Just', 'Sincere'], ['*Sacred Oath', '!Oath Eternal', 'True Word'], ['Pledge', 'Covenant']], 'The Final Oath'],
    ['Rally', 'Lift them up', [['Banner', 'Loud Voice'], ['*Rally', 'Encourage', 'Warm Heart'], ['*Shield Throw', '?Ricochet|Heavy Throw', 'Strong Arm'], ['*Hold the Line', '!Last Warden', 'Inspire'], ['Hero of the Day', 'Legend']], 'For the Fallen'],
  ]),

  // ---- hidden classes: Lightbinder gateways -----------------------------------------------
  lifewarden: br([
    ['Bloom', 'Healing past reason', [['Kind Hands', 'Soft Words'], ['*Bloom of Life', 'Petal', 'Gentle'], ['*Lifespring', '?Wellspring|Fountain', 'Renewal'], ['*Revival', '!Endless Mercy', 'Grace Note'], ['Evergreen', 'Second Life']], 'Garden of Life'],
    ['Ward', 'Mercy as armour', [['Shelter', 'Embrace'], ['*Mercy Ward', 'Thick Grace', 'Cradle'], ['*Lifebond', '?Shared|Selfless', 'Kinship'], ['*Sanctuary', '!Untouchable Mercy', 'Haven'], ['Guardian Angel', 'Halo']], 'Wings of Mercy'],
    ['Radiance', 'Life burns bright', [['Lifelight', 'Glow'], ['*Life Lance', 'Living Light', 'Shine'], ['*Verdant Nova', '?Bright|Warm', 'Sunshine'], ['*Lifestorm', '!Overflowing', 'Green Fire'], ['Blossom', 'Spring Eternal']], 'Dawn of Life'],
  ]),
  inquisitor: br([
    ['Verdict', 'Judgment without evidence', [['Suspicion', 'Cold Eye'], ['*Accuse', 'Charge Sheet', 'Hard Look'], ['*Condemn', '?Swift|Harsh', 'Witness'], ['*Execution', '!No Appeal', 'Guilty'], ['High Court', 'Final Ruling']], 'Last Judgment'],
    ['Purge', 'Burn the heresy', [['Zeal', 'Torch'], ['*Purging Fire', 'Pyre', 'Brand Iron'], ['*Holy Pyre', '?Cleansing|Searing', 'Kindling Faith'], ['*Auto-da-fe', '!Fanatic', 'Ash'], ['Inferno of Faith', 'Purity']], 'Crusade'],
    ['Chains', 'Bind the guilty', [['Shackles', 'Iron Faith'], ['*Holy Chains', 'Heavy Links', 'Lock'], ['*Interrogate', '?Break|Bend', 'Rack'], ['*Prison of Light', '!Warden of Souls', 'Bars'], ['Dungeon', 'Cell']], 'Eternal Prison'],
  ]),
  lightweaver: br([
    ['Thread', 'Weave the light', [['Spindle', 'Fine Thread'], ['*Light Thread', 'Tight Weave', 'Glimmer'], ['*Prism', '?Rainbow|White', 'Refract'], ['*Weave of Stars', '!Master Weaver', 'Loom'], ['Tapestry', 'Golden Thread']], 'The Great Tapestry'],
    ['Loom', 'Light made solid', [['Warp', 'Weft'], ['*Light Shield', 'Woven Plate', 'Shine'], ['*Lattice', '?Dense|Wide', 'Grid'], ['*Cathedral of Light', '!Woven Body', 'Stained Glass'], ['Starlight Cloth', 'Halo Loom']], 'Cloak of Dawn'],
    ['Needle', 'Light made sharp', [['Point', 'Sharp Light'], ['*Light Needle', 'Fine Point', 'Stitch'], ['*Needle Storm', '?Many Needles|Great Needle', 'Hem'], ['*Seam Ripper', '!Unravel', 'Embroider'], ['Silver Needle', 'Weaver Eye']], 'Unravelling'],
  ]),

  // ---- hidden classes: Pyromancer gateways ------------------------------------------------
  sunbreaker: br([
    ['Corona', 'Break the sun', [['Solar Wind', 'Flare'], ['*Solar Flare', 'Corona', 'Prominence'], ['*Sunspot', '?Dark Spot|Bright Spot', 'Photon'], ['*Supernova', '!Dying Star', 'Solar Mass'], ['Red Giant Heart', 'White Dwarf']], 'Sunbreak'],
    ['Plasma', 'Fire past fire', [['Ionised', 'Charged'], ['*Plasma Lance', 'Arc Fire', 'Superheat'], ['*Plasma Chain', '?Arcing|Fusing', 'Hot Core'], ['*Fusion', '!Critical Mass', 'Reactor'], ['Star Core', 'Starforge']], 'Birth of a Star'],
    ['Eclipse', 'The sun swallowed', [['Shade of the Sun', 'Black Fire'], ['*Black Sun', 'Umbral Flame', 'Cold Fire'], ['*Solar Wind', '?Gale|Breeze', 'Drift'], ['*Corona Shield', '!Eclipsed', 'Halo of Fire'], ['Night Sun', 'Two Suns']], 'Sun Swallower'],
  ]),
  ashwalker: br([
    ['Cinder', 'Leave only ash', [['Ash Feet', 'Smoke Lungs'], ['*Ash Step', 'Ember Trail', 'Sooty'], ['*Scorched Path', '?Wide Path|Long Path', 'Char Ground'], ['*Ashstorm', '!Barren', 'Smother'], ['Grey World', 'Dead Earth']], 'Year of Ash'],
    ['Smoke', 'Choke and blind', [['Haze', 'Smoulder'], ['*Smoke Cloud', 'Choking', 'Dim'], ['*Ember Rain', '?Heavy Rain|Light Rain', 'Drizzle'], ['*Pyroclasm', '!Volcanic', 'Pumice'], ['Caldera', 'Magma Heart']], 'Eruption'],
    ['Pyre', 'Burn what is dead', [['Mourner', 'Kindling'], ['*Funeral Flame', 'Last Rites', 'Remembrance'], ['*Cremate', '?Swift|Slow', 'Grief Fire'], ['*Pyre of Kings', '!Burnt Offering', 'Ember Crown'], ['Ashen Saint', 'Undying Ember']], 'The Great Burning'],
  ]),
  phoenix: br([
    ['Rebirth', 'Every ending is kindling', [['Warm Ash', 'Spark of Life'], ['*Phoenix Feather', 'Rekindle', 'Hope'], ['*Rising Flame', '?Bright Rise|Slow Rise', 'Rebirth Ember'], ['*Resurrection Fire', '!Undying', 'Eternal'], ['Immortal', 'Ever Rising']], 'Rise Again'],
    ['Wings', 'Fly on fire', [['Light Bones', 'Hot Air'], ['*Flame Wings', 'Gliding', 'Updraft'], ['*Wing Sweep', '?Wide Wings|Sharp Wings', 'Feathers'], ['*Firebird Dive', '!Sky Burner', 'Talons'], ['Wingspan', 'Sky Fire']], 'Firebird'],
    ['Song', 'The burning song', [['Hum', 'Warm Voice'], ['*Phoenix Cry', 'Echoing', 'Hearth Song'], ['*Song of Embers', '?Lament|Anthem', 'Chorus'], ['*Blazing Aria', '!Swan Song', 'Crescendo'], ['Encore Flame', 'Opera']], 'Song of the Phoenix'],
  ]),
};
