# The White and Deep Mountains (update 5 plan)

Status: plan, 2026-10-08. Nothing here is built yet beyond what "What exists"
lists. It follows phase 10 of the World Expansion plan and the region data in
`world/regionDefinitions.ts` (`whiteMountains`, `deepMountains`). Numbers are
starting points to tune.

---

## 0. The idea in one paragraph

Bruni Stonevein's expedition finally sails. The **Iron Kettle**, the dwarves'
sail-and-boiler ship, carries you north up the coast, through a storm and past
the serpent's water, to a cove cut into the cliffs of the **White Mountains**.
From there a dwarf road climbs through mining villages and pine forest to the
passes, where blizzards and avalanches wait, to **Frostpeak Citadel**, the
dwarf king's fortress on its peak. Beneath it a great lift goes down into the
**Deep Mountains**: colossal caverns, black stone and blue crystal, the
underground capital of the **Deep Hold**, the **Deep Forge** where legendary
metals are worked, and, at the bottom, a machine the wheel-cutters left that
is still counting. Act IV continues: what the Sunwheel counts is under the
mountains, and it is waking.

## 1. Pillars

1. **The climb.** You feel the height: forest gives way to rock, rock to
   snow, snow to ice; the wind and the cold rise with you.
2. **The mountain fights back.** Blizzards you must shelter from, avalanches
   you must outrun, narrow passes, the cold itself.
3. **Dwarven craft.** The dwarves are the world's smiths and engineers;
   their forges, roads, bridges, lifts and machines are the region's wonder.
4. **What lies beneath.** The deeper you go, the older and stranger:
   dwarven halls, then caverns older than the dwarves, then the machine.

## 2. What exists today (build on it)

| Piece | Where | State |
|---|---|---|
| Regions | `world/regionDefinitions.ts`, `regions.json` | White Mountains (x −0.9 to +5.8 km, z −6.6 to −4.0 km; levels 18 to 50) and Deep Mountains (x −4.9 to −0.1 km, z −6.6 to −4.5 km; levels 35 to 70); snow and blizzard weather profiles |
| Places | `regions.json` | Frostpeak Citadel (+2486, −5609); the Deep Hold (−1924, −5668) |
| Terrain | the macro map | Peaks to about 825 m; the White Mountains meet the sea in cliffs along x ≈ 5.0 to 5.9 km (no natural beach) |
| The expedition | `quests/portQuests.ts` (`dwarf-expedition`) | Bruni's preparations, sailing day at 8:00, then "the mountains open in a later chapter" |
| Dwarves in Port Aurelle | the Dwarven Quarter, Bruni, the forge | Exist; the capital has a dwarf envoy, Thrain Ironbrow |
| Boating | `world/sea/*` | Ships, storms, the serpent, currents (the North Reach runs this way), docking at island harbours |
| Weather | `world/weather.ts` | Snow and blizzard states exist |
| From updates 1 to 3 | | The dwarf origin's homeland; mithril, star-iron and the Deep Forge for crafting; the dungeon kit for the delves |

## 3. The voyage of the Iron Kettle

- On sailing day the **Iron Kettle** (a new hull: a broad brigantine with a
  smokestack and a paddle boiler for calm water) leaves Port Aurelle with you
  aboard. Bruni's captain, **Hamm Copperbeard**, has the helm; you can take
  it, man the guns, or walk the deck.
- The voyage is **sailed, not skipped** (the boating decision): north-east up
  the coast, riding the **North Reach** current, about six minutes in good
  weather. On the way: a storm (scripted to arrive), the sea serpent (if
  you've not killed one, it comes; if you have, a pirate cutter does), and
  the first sight of the white peaks.
- **Kettle Cove**: a harbour cut into the cliffs at about (+5.25, −4.85) km,
  on a level pad like the island harbours (`islandPortsData.ts`'s pads), with
  a stone quay, a winch-lift up the cliff, and the expedition's landing camp.
- Afterwards Kettle Cove is a port like any other: sail there in your own
  ship, dock, trade (ore, metal, gems), take Guild contracts.

## 4. The White Mountains

| Zone | Height | Look | What's there |
|---|---|---|---|
| **The Foothills** | 0 to 150 m | pine forest, rivers, stone dwarf roads | **Copperbrook**, a mining village (half dwarf, half human); the expedition's first claim; wolves, boar, goats |
| **The Middle Mountains** | 150 to 450 m | cliffs, snowfields, abandoned forts, stone bridges over gorges | **Stonegate Pass** and its fort; abandoned mines; avalanche slopes; snow wolves, rock trolls |
| **Frostpeak** | 450 to 650 m | granite and ice-blue stone, banners, the great stair | **Frostpeak Citadel**, the fortress city of the dwarf king **Durin Frostbeard** |
| **The Glaciers** | above 650 m | ice, crevasses, wind | Old watchtowers of the wheel-cutters; wyverns; the **dragons' eyries** (the dragonkin homeland) and **Vathrax the Pale**, a white dragon |

### Frostpeak Citadel
Carved into the peak itself: the Great Stair up from the pass, the outer
ward (barracks, the guild of engineers, the forge-street), the King's Hall
under a stone dome with a window onto the glacier, and the **Great Lift**,
a counterweighted cage on chains that goes down through the mountain into
the Deep Mountains.

## 5. The mountain fights back

- **Cold:** a new meter above the stamina bar in snow zones. It falls in
  wind, snow and water, faster at height and at night; warm clothes (update 2's
  tailoring), hot meals (cooking), fires, shelters, inns and the dwarf origin
  slow it. At zero you take frost damage and move slowly. It's off below the
  snowline.
- **Blizzards:** visibility drops to 20 m, the cold falls fast, the road
  markers (dwarf cairns with lanterns) are how you find your way; shelters
  (cairn huts) along the passes.
- **Avalanches:** on marked slopes, a rumble and a cloud of snow above you,
  then a sliding mass: run sideways out of its path or be buried (heavy
  damage, then you dig out). Loud fights and fire set them off.
- **Narrow ways:** ledges where a heavy hit knocks you off; rope bridges a
  troll can cut.

## 6. The Deep Mountains

The Great Lift goes down into a different space: the underground is its own
realm (like the dungeons, far from the overworld), so the caverns can be
enormous without fighting the surface terrain.

| Zone | Look | What's there |
|---|---|---|
| **The Lift Hall** | dwarven stone, chains, lanterns | The arrival; guards; a market for ore and gems |
| **The Deep Hold** | a city carved round a chasm, bridges, forge-light, blue crystal | The dwarven capital under the mountains: the Under-King's court, the guilds, homes in the walls, the **Deep Forge** |
| **The Colossal Caverns** | caves kilometres wide, glowing fungus forests, crystal pillars | Cave crawlers, golems, bats; mining camps; an underground river with a barge |
| **The Old Roads** | arrow-straight tunnels older than the dwarves | The wheel-cutters' ruins; their machines, some still moving |
| **The Engine Below** | the deepest place | A machine of brass, stone and starlight that counts the turning: Act IV's climax |

### The Deep Forge
The endgame of Smithing (update 2): a forge fed by a river of molten rock,
where **mithril**, **star-iron** and **deep crystal** are worked. Only a
master smith (Smithing 20) or a dwarf can use it; the Forgemaster **Helga
Anvilborn** teaches the legendary recipes.

## 7. People

| Who | Where | Role |
|---|---|---|
| Bruni Stonevein | the expedition | The expedition's leader; the quest chain |
| Hamm Copperbeard | the Iron Kettle | Captain; teaches the paddle boiler |
| Marta Hollins | Copperbrook | The human mine-boss; the claim dispute |
| King Durin Frostbeard | Frostpeak Citadel | The dwarf king of the surface holds |
| The Under-King, Brokk Deepdelver | the Deep Hold | The king below; old rival of the surface king |
| Helga Anvilborn | the Deep Forge | Legendary smithing; the dwarf origin's mentor |
| Thrain Ironbrow | (from the capital) | The envoy, home again; the politics between the two kings |
| Ulla the Runewright | Frostpeak | Advanced Runecraft; the dwarven crossbow (update 2) |

## 8. Enemies

| Creature | Where | Notes |
|---|---|---|
| Snow wolves | foothills, passes | Packs; howl to call more |
| Rock trolls | passes, bridges | Huge, slow; regenerate unless burned; cut rope bridges |
| Yetis | the high snow | Throw ice; hide in the blizzard |
| Wyverns | cliffs, glaciers | Dive from above; poison tail |
| Golems | the Deep Mountains | Stone and crystal; weak at the glowing core |
| Cave crawlers | caverns | Fast, in swarms, from the walls |
| The wheel-cutters' sentinels | the Old Roads | Constructs that guard the ruins; pattern fights |
| **Vathrax the Pale** (boss) | the glacier eyrie | A white dragon: frost breath, a flight phase (the dragonkin can follow), a fight on the ice |
| **The Forge-Wyrm** (boss) | the Deep Forge's magma river | What lives in the forge's heat; the Forge is closed until it's dealt with |
| **The Engine's Warden** (boss) | the Engine Below | The machine's guardian: the climax of Act IV part two |

## 9. Story and quests

**The expedition chain (Bruni):**
1. **The Iron Kettle** (the voyage, §3).
2. **The Landing**: make camp at Kettle Cove; the winch-lift; the road to
   Copperbrook.
3. **The First Claim**: Bruni's claim in the foothills has been taken over
   by Marta Hollins's miners; settle it (shared, bought out, or fought).
4. **The Collapsed Shaft**: a cave-in at the claim traps miners; a rescue
   dungeon (the kit) with the first golem.
5. **The King's Audience**: up the pass to Frostpeak; King Durin hears
   Bruni's case and asks a favour in return (the Stonegate trolls).

**Act IV, part two: under the mountains:**
6. **Two Kings**: the surface king and the Under-King haven't spoken in a
   century; Thrain carries letters and you carry Thrain.
7. **The Lift**: down the Great Lift into the Deep Hold.
8. **The Forge Is Cold**: the Forge-Wyrm has taken the Deep Forge; the Hold
   can't make anything; kill it, and the Forge (and its recipes) open.
9. **The Old Roads**: follow the star-chart's next mark along the
   wheel-cutters' tunnels.
10. **The Engine Below** (a dungeon): the machine that counts the turning.
    Its Warden falls; the engine shows a wheel with eleven spokes lit and
    one dark. One age is left. The next mark points beneath the sand.

**Side quests:** the Avalanche Watch; the Lost Lantern Cairns (relight the
road lanterns, like the island lighthouses); Troll Toll (Stonegate); the
Yeti's Cave; the Dragon's Hoard (Vathrax); the dwarf origin's homeland chain
(update 1): "Stone Remembers"; a dragonkin origin chain at the eyries:
"The Last Eyrie".

## 10. Resources

| Resource | Where | Use |
|---|---|---|
| Iron, copper, silver | foothills | Tiers 1 to 3 (update 2) |
| Gems | passes, caverns | Runecraft, jewellery, trade |
| Mithril | the Deep Hold's mines | Tier 4 metal |
| Star-iron | meteorite pits on the glaciers, the Old Roads | Tier 5 metal |
| Deep crystal | the Colossal Caverns | Runes, staves, the Deep Forge |
| Dragon scale and bone | Vathrax | Tier 6 (dragonbone) |

Kettle Cove and Copperbrook join the trade network (`world/sea/trade.ts`):
they make ore, ironware and gems, and want food, timber and cloth.

## 11. Looks and performance

- **Palette:** snow white, ice blue, grey granite; inside, near-black stone,
  glowing blue crystal and orange forge-light (the art bible).
- **Snow:** the existing weather's snow, deeper drifts (a splat layer), frost
  on the hero's cloak in the cold, breath fog.
- **The caverns** are their own realm with their own lighting (dark, with
  crystals and fungus as light sources), streamed in chunks; the Deep Hold
  stays under the city budget.
- **Far views:** Frostpeak is a landmark visible from Port Aurelle on a
  clear day (an impostor).

## 12. Architecture

| Module | Job |
|---|---|
| `src/world/mountains/whiteMountains.ts` | The surface region: zones, Copperbrook, Stonegate, Frostpeak, cairns and shelters |
| `src/world/mountains/kettleCove.ts` | The landing harbour (a port like the island harbours) |
| `src/world/mountains/frostpeak.ts` | Frostpeak Citadel |
| `src/world/mountains/cold.ts` | The cold meter, shelters, warmth sources |
| `src/world/mountains/avalanche.ts` | Avalanche slopes, triggers, the sliding mass |
| `src/deep/deepRealm.ts` | The underground realm (the Great Lift switches to it, like `dungeon/realm.ts`) |
| `src/deep/deepHold.ts`, `caverns.ts`, `oldRoads.ts` | The Deep Hold, the caverns, the wheel-cutters' tunnels |
| `src/world/sea/ironKettle.ts` | The Iron Kettle (a new hull with a boiler) and the scripted voyage |
| `src/enemies/mountain/*.ts` | Wolves, trolls, yetis, wyverns, golems, crawlers, sentinels, the three bosses |
| `src/quests/mountainQuests.ts` | The expedition chain and Act IV part two |
| Save | the cold, cairns lit, the kings' standing, the Forge open, the lift unlocked |

## 13. Roadmap (each phase is playable on its own)

| Phase | What's in it | Done when (tests) |
|---|---|---|
| M1 | The Iron Kettle voyage and Kettle Cove; the expedition's sailing day becomes a real voyage | Sailing day starts the voyage; the ship reaches the cove (scripted run); the cove is a port you can sail back to |
| M2 | The Foothills and Copperbrook; the first claim and the collapsed shaft | The claim quest's three endings work; the rescue dungeon can be finished |
| M3 | The passes: cold, blizzards, avalanches, cairns; Stonegate and the trolls | Cold falls in wind and rises by a fire; an avalanche hits a player standing in its path and misses one who ran; cairns stay lit after a reload |
| M4 | Frostpeak Citadel, King Durin, the glaciers, Vathrax | The audience and the troll favour; Vathrax's flight phase; dragon scale drops |
| M5 | The Great Lift and the Deep Hold; the Forge-Wyrm; the Deep Forge and legendary smithing | The lift switches realms and back; the Forge opens after the Wyrm; a mithril blade can be forged at Smithing 20 |
| M6 | The caverns, the Old Roads and the Engine Below; Act IV part two end to end | The Engine dungeon can be finished; the quest chain from the voyage to the Engine completes in a scripted run |

## 14. Decisions for Malachi (with defaults)

1. **The cold meter:** default: on in the snow zones only, gentle enough that
   a cloak and a meal make it a non-issue on the roads; it bites off-road and
   in blizzards.
2. **The underground as its own realm:** default: yes (the Deep Hold and the
   caverns are a separate space reached by the Great Lift and a few cave
   mouths), so the caverns can be huge.
3. **Vathrax and the dragonkin:** default: Vathrax is an old dragon gone
   feral; a dragonkin gets a choice to calm it instead of killing it.
4. **The two kings' feud:** default: the player can side with one, or bring
   them together (the best ending, harder).
