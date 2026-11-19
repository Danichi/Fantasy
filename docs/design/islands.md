# The island expeditions

This first island expansion gives all 43 mapped landmasses in the four
archipelagos a landing and explorable content. Single-cell offshore rocks remain
scenery. Ashen Port gains its immediate bridgehead, exchange, checkpoint and
exile cache; the Demon Continent beyond the first gate remains a later region.

## Getting there

Ask Tallow in Port Aurelle about **The Four Winds**. The ship sells charted
passages to Azure Haven, Emerald Cove, Wrecker's Rest, Sunken Spire and Ashen
Port. Harbourmasters offer onward and return passages, their original ship
services, island quests, and a field journal. The journal copies local site
bearings onto the world map; it does not reveal all terrain or complete finds.

The voyage uses the sailing system's real charter ship and depth-checked route.
Walk its deck or rest below to skip to the final approach. Fares are quoted
before departure; a failed route costs nothing. If a save reloads during a
passage, resume safely at the paid destination. The Iron Kettle and its northern
expedition retain their own passage and cabin-rest behavior.

Each island has a landing boardwalk and connected walking trails. The original
island harbours have inland connectors where their pads were separated from
natural land. Sail your own boat between outlying islands; anchor offshore and
swim to the landing. Each boardwalk has a visible ladder and an interaction
that pulls swimmers or wading characters onto its deck. Blue underwater lanterns mark submerged finds: swimming
over them does not recover them. Dive down and use the normal interaction key (default **C** to dive, **Space**
to rise, **E** to interact).

## Four regions

| Archipelago | Islands | Intended level | Expedition | Boss |
|---|---:|---:|---|---|
| Azure | 5 | 24 | Lagoons, pearls, spice outpost and three reef bells | Pearlback, the Reef Tyrant |
| Emerald | 11 | 29 | Heartwood, fern trails, grovekeepers and root/rain/sun sanctuaries | Old Mossroot, the Hollow Grove |
| Shattered | 16 | 35 | Raider camps, salvage, free-harbour outpost and pirate watchcode | Commodore Vane, the Shorebreaker |
| Sunken | 11 | 41 | Drowned watch, relic dives and Dawn/tide/night sanctuaries | The Drowned Archivist |

There are 122 sites in total: settlements, caches, daily resource patches,
lookouts, camps, twelve sequence sanctuaries, four regional bosses and fourteen
dive finds. Fifteen named guides, merchants and trailkeepers join the existing
harbour population. Outposts provide rest, rations, kitchens and workbenches.
Their merchants buy three local materials at a time. Grove outposts sit in
regional broadleaf woodland; the wreckers build with dark timber, and divers
shelter among roofless keeper courts. Outposts and boss courts exclude random
wildlife spawns. Only the nearest dive lantern enables a dynamic light.

Each harbour offers a three-island landfall quest, a sanctuary quest, a boss
quest and a treasure quest. The eighteen quests also include **Across the Four
Seas** and **Under the Ash Harbour Truce**. Discoveries made before accepting a
quest still count. Quest markers identify the relevant shores and sanctuaries.

Read each sanctuary's inscription and answer its three-part sequence. A wrong
answer resets that sanctuary's sequence. All three sanctuaries must be awake
before challenging the region's boss. Bosses use the existing combat AI and
telegraphs: the crab's protected front, the Rootwarden's roots and thorn volleys,
the chief's melee moves, and the wraith's native phases. These are authored
regional encounters using established enemy models, not four new combat engines.
Island camps have substantially more health and damage than introductory foes;
region difficulty is fixed and does not scale with the player's equipment.

Caches and boss rewards can be claimed once. Gathering patches renew on the
next game day. Local materials craft four regional trinkets; quest rewards
include those keepsakes, the four-seas compass, and the archive's lore rubbing.
The Ash Harbour writ grants the harbour's truce, not access to an unfinished
Demon Continent.

## Implementation

- `src/world/islands/atlas.json`: stable island identities, cells, shore landings,
  connected trails and exploration anchors, derived from the existing macro map.
- `tools/build-island-atlas.py`: optional regeneration from the macro PNG. Run
  from the repository root with Python, Pillow, NumPy and SciPy installed. The
  committed JSON means runtime and normal builds need none of those packages.
  Regeneration can change site identities if the source map changes; review save
  compatibility before replacing it.
- `layout.ts`: regional themes, sites, harbour links and local terrain shaping.
  The terrain worker imports the same pure data/function as the CPU sampler.
- `archipelagos.ts`: nearby geometry/collider streaming, native encounters,
  interactions, NPC metadata, field journal, merchants and charter passages.
- `src/quests/islandQuests.ts`: the eighteen native QuestLog definitions.
- `src/items/catalog/islands.ts`: materials, trinkets, ration and lore keys.

Progress uses namespaced `isle:*` flags and the existing quest and inventory save
formats. Unique facts replay into active quest objectives, so visits and solves
are not lost when done out of order. Unfinished encounters reset when leaving
an island or dying; cleared encounters and claimed rewards persist.

Only nearby island interiors are instantiated. Static scenery batches by
material and spatial chunk; label sprites hide beyond reading distance. Leaving
removes scene objects, enemy targets, tell cards, projectiles, collider bodies
and per-instance textures. Dungeon/interior transitions suspend island content.
NPC records use the existing manager's actor LOD. Sea route surveys interpolate
the same four float32 samples as a full terrain tile without generating all
16,641 samples in each distant tile along a proposed voyage. Walking corridors are also
registered as vegetation clearings to keep generated trees off trails.

## Validation

Run `npm run typecheck`, `npm run build`, and the focused Playwright tests:

```
npm test -- tests/islandTerrain.spec.ts tests/islandInteraction.spec.ts tests/islands.spec.ts tests/islandVisual.spec.ts
```

The terrain audit checks atlas coverage, sanctuary counts, landings and trail
grades. The expedition test boots the game, streams every island, solves the
sanctuaries, defeats native bosses, checks reward duplication, harvesting,
material sales, dive restrictions, charter landfall and save reload. Screenshots
are supplementary visual checks; software-rendered browser tests do not establish
an Iris Xe frame-rate guarantee.
