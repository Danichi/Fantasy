# The item catalog

About 1,230 new items in eight material tiers. The catalog lives in `src/items/catalog/`; `items/itemDefs.ts` merges it into `ITEMS`, and `crafting/recipes.ts` merges its recipes into `RECIPES`. If an older item already has an id, the older item keeps its definition. Some older items also stand in for a catalog slot: the Iron Spear is the tier 1 spear, and the six first plate pieces are tier 1 plate.

## Tiers (`tiers.ts`)

| Tier | Metal | Level | Where | Notes |
|---|---|---|---|---|
| 1 | Iron | 1-5 | Elder Glen | |
| 2 | Steel | 5-10 | King's Road, Port Aurelle | |
| 3 | Silversteel | 10-15 | the Capital | |
| 4 | Deepsteel | 15-20 | the mountains | Dwarven Forge-Book |
| 5 | Sunbrass | 20-25 | the Golden Expanse | Sunspire Pattern-Book |
| 6 | Tideglass | 25-30 | the isles | Shipwright's Glassbook |
| 7 | Starmetal | 30-35 | crafted only | Starfall Script, from fallen-star sites |
| 8 | Duskiron | 35+ | crafted only | Codex of the Iron Below, from Dark scars |

Gathering has new veins and timber in their home regions: deepsteel, gold, tin, ironwood, sunpalm and driftwood (`world/gatheringNodes.ts`).

## Modules

- `weapons.ts`: 14 kinds × 8 tiers, plus ammunition.
- `armour.ts`: robes, leather, mail and plate (6 slots × 8 tiers), 6 kinds of shield, cloaks and belts.
- `sets.ts`: 20 faction sets with bonuses at 2, 4 and 6 pieces, and pattern books for the friendly factions.
- `factionWeapons.ts`: named faction weapons and shields.
- `jewels.ts`: 48 rings, 32 amulets, ward charms, the 12 Sunwheel tokens, lucky charms, keepsakes and trophies.
- `consumables.ts`: draughts, elixirs, oils, bombs, regional meals, drinks, scrolls, wards and tools.
- `materials.ts`: ores, ingots, timber, hides, cloth, gems, monster parts, essences and rare finds.
- `uniques.ts`: boss, lair, sea-beast, desert, story and site uniques, the 12 Grandmaster pieces (the new `legendary` rarity) and the recipe books.

## Looks

- **Armour:** `ArmorLook` on the item (`items/armorModels.ts`) sets the weight, colours, glow, helm shape (hood, cap, coif, kettle, great helm, visor, turban, sou'wester, circlet, mask, horns, crest) and spikes. Robes get a long robe body, mail gets a tabard and skirt, and leather gets a belt.
- **Shields:** `shieldModel.ts` builds ten shapes with painted devices.
- **Painted icons:** potions, parts, trinkets, papers and food get painted icons (`ui/art/registry.ts` reads `CATALOG_ART`).

## Effects (`gearFx.ts`, `gearRuntime.ts`)

An item's `fx` lists what it does while worn. A buff's keys can name the same effects. `gearRuntime.ts` adds them up together with set bonuses (and the Sunwheel tokens, which count double when all twelve are carried) and applies each one:

- **Combat modifiers:** applied through `GEAR.mods`, which the arms runtime adds.
- **Banes and conditions:** banes, backstab, sprint and crowd bonuses, rain, night, the Dark, low health, the sea, curses and rage. Melee hits and arrows both use them.
- **Wards:** reduce damage from the nearest attacker's family; thorns hit back.
- **Event effects:** parries, critical hits, kills, Sunwheel travel, mastery and resting out of combat.
- **Gathering and fishing:** gathering yield and fishing luck.
- **Other:** light, water breathing, and the phoenix.

`consume()` does what one-use items do: scrolls, bombs, wards and kits.

## Sources (`sources.ts`)

Every item carries source tags in `SOURCES`:

- **Shops:** each shop kind (smith, tailor, alchemist, inn, arcane, jeweller, bowyer, temple, trader) is guessed from the keeper's name and title. It sells its region's tier, rotating daily. Faction quartermasters and home-region shops sell faction gear.
- **Foe drops:** foes drop their family's parts and sometimes gear, draughts or trophies. Luck raises the gear chances.
- **One-time rewards:** these are given once each (saved in world flags as `cat:<id>`):
  - bosses (`bossSlain`), lairs and sea beasts (`deed`);
  - quests (`questChanged`), faction quests and deeds;
  - wild sites (`siteDone`), the twelve stones, and mastery rank 10.
- **Chests:** dungeon chests draw on `chest:<tier>` (`dungeon/kit/loot.ts`).

`tests/catalog.spec.ts` checks the catalog end to end.

## Systems behind the special items

### Locks (`locks.ts`)

- **Which containers are locked:** dungeon chests (by chest tier) and wild-site chests, cellar hatches and smugglers' trapdoors (by the area's level). Each one has a fixed lock: Simple, Sturdy, Fine or Masterwork.
- **Picking:** with Lockpicks or Master Lockpicks, a minigame opens. Lift each pin (Space) while the sweeping pick is in the bright notch.
  - A miss drops a pin back and may snap a pick: 40% for Lockpicks, 12% for master picks. Dungeoneering lowers the chance.
  - Master picks and Dungeoneering also widen the notch.
- **Forcing:** with no picks, a heavy weapon (two-handed, mace, axe) forces the lock. Forcing a dungeon chest can smash one thing inside.
- **Saving:** opened locks are saved in world flags as `lock:<id>`.

### The grappling hook (`specials.ts`)

- **Use:** the hook is cast along the camera's view, up to 30 m. If it bites, it finds a standable top just past the hit with room to stand, then hauls you there in an arc.
- **Kept:** it is not used up.

### Summoned allies (`allies.ts`)

- **Who:** the Spectral Wolf and Watchman scrolls, and the Bell of the Glen (three watchmen, once a day).
- **What they do:** each spirit runs to the nearest foe and strikes it on its own cooldown, follows you when nothing is near, and fades when its time ends. Foes can't hurt them.
- **Crown Guard:** the 6-piece bonus counts these spirits plus guards, the Watch and crew within 10 m.

### The Golden Expanse (`exposure.ts`)

- **Heat:** builds in the open sand from 10:00 to 17:00. It drains stamina and slows you; at its peak (sunstroke) it hurts.
- **Thirst:** grows anywhere in the Expanse. It slows regeneration and hurts at its worst.
- **Sandstorm:** slows you.
- **Remedies:** a Waterskin (or any drink) quenches thirst. A Heatward elixir or the Sun Guard set blocks heat, and the Sun Guard set also ignores the sandstorm. The Dune Strider set never goes thirsty. All three show as debuffs on the buff bar.

### Other mechanics

- **Water-walking:** `player.waterWalk` holds you on the water surface. Hold jump to sink through.
- **Draught of Remembering:** unlearns a tree node with nothing learned after it, and its point can be spent again.
- **Sunwheel tokens:** they work while carried. All twelve together are the Full Wheel.
- **Wenna's flask:** holds three draughts and refills one every 4 minutes.
- **Mara's pot:** gives a meal once a day.
- **Fröst's hammer:** with it in your pack, smithing quality goes up one full step (up to Legendary) and the tempering cap rises by one.
- **Corsair Captain set:** ship guns reload 20% faster (`GEAR.cannonReload`).
- **Wrong-Turning Ring:** sends Sunwheel travel to a random wheel and heals you and buffs your damage on arrival.
- **Siren Bell:** holds a sea beast still for 20 s (`SeaBeast.calmT`).
- **Deep-Eye Lantern and Scroll of Detect Secrets:** turn on the dungeon's secret shimmer (`GEAR.secretSense`).
- **Traps:**
  - Tripwire runes wait to be stepped on.
  - Caltrops make bleeding ground.
  - A decoy doll hides you while foes puzzle over it.
- **Shields:**
  - Tower shields stop arrows outright.
  - The Watch Pavise plants when held still.
  - Spiked targes make shield bashes bleed.
- **Weapons and armour:**
  - Kraken-Ink Blade blinds (half the blinded foe's blows miss).
  - Oxidised Greatsword throws off a flurry on crits.
  - Siren necklace charms attackers.
  - Stormscale Mail shocks attackers on a block.
  - Silver Lance set: sprint attacks knock foes down.
  - Inquisitor set: bonus damage to branded foes.
- **Gathering and crafting sets:** the Dwarven set doubles mountain ore, and the Scavenger set gives more from salvage.
- **Stealth and ammo:**
  - Hush makes far foes miss you.
  - Bandoliers and Vela's bag can spare ammunition.
  - The Junk Crossbow fires scrap metal when out of bolts.
  - The Bolt-Thrower fires three shots per winding.
