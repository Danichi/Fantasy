# The Verdant Elves (update 4 plan)

Status: plan, 2026-10-08. Nothing here is built yet beyond what "What exists"
lists. It follows phase 9 of the World Expansion plan and the region data in
`world/regionDefinitions.ts` (`verdantElves`). Numbers are starting points.

---

## 0. The idea in one paragraph

North of Cresha the woods begin, and the further in you go the older they
get: woodcutters' clearings at the edge, then the hidden villages of the
elves, then trees as tall as towers, then the Deep Elven Lands where the
**Elven Sanctum** lives in the canopy of a tree older than the Crown. The
**Greenwood Road** already runs there from Elder Glen, stopped by an elven
marker stone; this update opens it. The forest **gets you lost** unless an
elf guides you, its people teach magic and the bow, its wood is the finest in
the world, and in its oldest grove the **Starfall Script**, the wheel-cutters'
writing, begins to speak: Act IV of the main story starts here.

## 1. Pillars

1. **The forest deepens.** Four layers, each older, taller and stranger than
   the last; you feel the change as you walk.
2. **Getting lost is part of it.** The Lost Woods turn you round until you
   earn a guide, a map or the elves' trust.
3. **The elves are a people, not a vendor list.** Councils, families, old
   grudges with Cresha's loggers, songs at night.
4. **Light through leaves.** God rays, glowing blossoms, waterfalls in mist:
   the region the design board shows in jade and teal.

## 2. What exists today (build on it)

| Piece | Where | State |
|---|---|---|
| Region | `world/regionDefinitions.ts`, `world/data/regions.json` | `verdantElves`: a band across the north from x −4.7 to +6.4 km, z −4.9 to −1.7 km; levels 12 to 40; forest ambience; the elves' faction |
| Places | `regions.json` | The Elven Sanctum (−2842, −2931), Moonlight Glade (+3256, −2856) |
| Trees | `world/stylizedNature.ts` | Forest relief already grows taller toward the north (×1.2 to ×2.1) |
| Road | `world/roadData.ts` | The Greenwood Road, Elder Glen to (−2800, −3000), gated at (−160, −700) by an elven marker stone |
| Story | `quests/capitalQuests.ts` | The King sends you to "ruins older than the Crown, in the elven woods, under the mountains, beneath the sand" |
| Magic | `paths/data.ts` | Windcaller, Lightbinder and the others; the secret Druid line isn't in yet |
| Origins (update 1) | | The elf origin's homeland is here |
| Bows, heartwood (update 2) | | The elves teach the bow; heartwood is a tier-4 wood |
| The dungeon kit (update 3) | | The Temple of Starfall is built with it |

## 3. The four layers

| Layer | Where | Look | Who and what |
|---|---|---|---|
| **The Outer Forest** | the forest's southern edge, along the Greenwood Road out to about z −2.2 km | oak and beech, clearings, logging camps, bracken | **Thornwick**, a human woodcutters' village at the road's end; hunters; deer, boar, wolves; bandits in the old charcoal pits |
| **The Inner Forest** | z −2.2 to −3.0 km | taller trees, moss, streams, mist in the hollows, the first glowing blossoms | **Silverbough**, a hidden elven village (only found with a guide); spirit foxes, forest spiders, wisps; the first ruins |
| **The Ancient Forest** | z −3.0 to −3.8 km | mega-trees with buttress roots and walkways between them, waterfalls, god rays | Elven sentinels on the walkways; treants; the **Temple of Starfall** (a dungeon) in the oldest grove |
| **The Deep Elven Lands** | the far north-west, around the Sanctum | the canopy city, still pools, white deer, blossoms that open at dusk | **The Elven Sanctum**; the Council of Leaves; the World Tree at its heart |

**Moonlight Glade**, far to the east (+3.3, −2.9 km), is a landmark on its
own: a ring of standing stones in a clearing where moonblossoms open only on
clear nights, with a ruin of the wheel-cutters under it.

## 4. Places

### Thornwick (the woodcutters)
A palisaded human village of a dozen houses, a sawmill on a stream, a
lumber yard and the Woodsman's Rest inn. The loggers and the elves don't get
on: the elves' marker stones keep moving closer to the village. Quests start
the region here.

### Silverbough (a hidden village)
Elven homes grown into the trunks and roots of three great trees, rope
bridges, lanterns of glowing blossom. Found only with a guide or after the
"Guide's Token" quest; the first elves to trust you.

### The Elven Sanctum (the capital)
Built in and around the World Tree: platforms, spiral stairs inside the
trunk, bridges between neighbouring giants, the Council of Leaves in a hall
of living wood, a moon-pool at the foot. Teachers, the bowyer, the
heartwood-carvers, the archive of songs. The elf origin's home.

### The World Tree
A landmark visible from far across the north (a scaled impostor beyond
2 km): a tree hundreds of metres tall. Its roots hide the deepest secret of
the region (a late quest).

## 5. The Lost Woods

- In the Inner and Ancient Forest, paths **loop**: walk off the elven path
  without a guide and the forest turns you back to where you entered the
  loop (a quiet fade, a sound, the same fallen tree again).
- **Ways through:** an elven guide (hired in Thornwick, or a companion from
  a quest); the **Elf origin** (the forest knows its own); a **Guide's
  Token** (earned in Silverbough); or reading the trail marks (a hidden
  Dungeoneering node).
- Guided paths show as faint lights between the trees.

## 6. People and teachers

| Who | Where | Teaches or offers |
|---|---|---|
| Elder Lirael Moonwhisper | the Sanctum | Leader of the Council of Leaves; the Act IV story |
| Faelan the Bowyer | the Sanctum | The **Ranger** combat class (bows, from update 2); elven bows of heartwood |
| Sylwen Starwatcher | Moonlight Glade | Advanced Lightbinder; the Starfall Script |
| Thessaly of the Wind | Silverbough | Advanced Windcaller |
| The Hermit of the Hollow | a cave in the Ancient Forest | The secret **Wildwarden** (druid, shapeshifting) class |
| Corwen Ashford | Thornwick | The loggers' foreman; the elves' rival |
| Nimri | Thornwick | An elven guide for hire (a day's guiding) |
| Heartwood carvers | the Sanctum | Heartwood (tier 4 wood) and elven staves |

## 7. Wildlife and enemies

| Creature | Layer | Notes |
|---|---|---|
| Deer, boar, wolves, owls | Outer | Existing fauna and wolves |
| Spirit foxes | Inner | Blink about, steal from your pack; follow one to a hidden glade |
| Forest spiders | Inner, Ancient | Webs that slow you; nests in the hollows |
| Wisps | Inner, Ancient | Lead you astray in the Lost Woods, or to treasure |
| Treants | Ancient | Slow, huge, fire-weak; wake if you cut the wrong tree |
| Giant moths | Ancient, night | Dust that confuses |
| **The Blighted Elder** (boss) | a rotting grove in the Ancient Forest | A great tree gone wrong: roots from the ground, a blight that spreads; the region's main fight before the Temple |

## 8. Story and quests

**Act IV, part one: the Starfall Script.**
1. **The Marker Stone** (Thornwick): the elves have closed the Greenwood
   Road. Talk your way past the marker stone (Corwen and Nimri), or prove
   yourself to the elven sentinel.
2. **The Guide's Token** (Silverbough): earn the elves' trust: drive the
   spiders from the village's spring, and settle a quarrel with the loggers
   (two endings: the loggers pull back, or the elves give up a grove).
3. **The Council of Leaves** (the Sanctum): the Council knows of the
   Sunwheel; they call it the "Turning". They want to know what you are.
4. **The Blight** (the Ancient Forest): the Blighted Elder is killing the
   oldest grove, where the Temple of Starfall stands. Kill it.
5. **The Temple of Starfall** (a dungeon, update 3's kit): two floors of
   grown stone and roots, a light-and-mirrors puzzle, the Script on every
   wall; at the bottom, a **star-chart** that matches the Sunwheel. The
   wheel-cutters counted the turning by the stars.
6. **What the Stars Say** (Moonlight Glade, at night): Sylwen reads the chart
   under the moonblossoms. The next mark points under the mountains
   (update 5) and beneath the sand (Daniel's Golden Expanse).

**Side quests:** the Loggers' Grievance (Thornwick); the Fox Who Stole
(Silverbough); Webs in the Spring; the Lost Hunter (the Lost Woods); a Song
for the World Tree (the Sanctum); the Night Bloom (Moonlight Glade);
the elf origin's homeland chain (update 1): "A Name Among the Leaves".

## 9. Resources and economy

- **Heartwood** (tier-4 wood) from fallen giants (gathered with an axe,
  only where the elves allow); **ironbark**; **moonblossom** and
  **spirit amber** (alchemy); new herbs per layer.
- The elves buy metals and grain; they sell herbs, heartwood and magical
  materials (the region's `exports` and `imports`).
- Thornwick's sawmill sells timber (a trade good in the boating update).

## 10. Looks and performance

- **Mega-trees:** a procedural model (a buttressed trunk, root flares,
  branching crowns) in three levels of detail, with an impostor beyond
  600 m; walkways and platforms between them in the Ancient Forest and the
  Sanctum.
- **Light:** god rays where the canopy opens (a screen-space shaft or cards),
  glowing blossoms (emissive instanced quads), mist in the hollows, fireflies
  at night.
- **Palette:** jade, teal and gold (the art bible's Verdant Elves entry).
- **Budget:** the region streams by tile like the rest; the Sanctum stays
  under the city budget (30 fps); the mega-trees are instanced.

## 11. Architecture

| Module | Job |
|---|---|
| `src/world/elves/elvenForest.ts` | The region's content module: layers, settlements, landmarks, streaming |
| `src/world/elves/megaTree.ts` | Mega-tree models, levels of detail, impostors, walkways |
| `src/world/elves/sanctum.ts` | The Elven Sanctum, built in and around the World Tree |
| `src/world/elves/lostWoods.ts` | The looping paths, guides and tokens |
| `src/world/elves/elfFolk.ts` | The people of Thornwick, Silverbough and the Sanctum |
| `src/enemies/forest/*.ts` | Spirit foxes, spiders, wisps, treants, moths, the Blighted Elder |
| `src/quests/elfQuests.ts` | Act IV part one and the side quests |
| `src/dungeon/dungeons/starfall.ts` | The Temple of Starfall (the kit) |
| Terrain | `terrainHeight.ts` gains pads for Thornwick and the Sanctum's floor, and the Greenwood Road's gate opens on a quest flag |

## 12. Roadmap (each phase is playable on its own)

| Phase | What's in it | Done when (tests) |
|---|---|---|
| E1 | The Outer Forest and Thornwick; the Greenwood Road's gate and "The Marker Stone" | The road opens on the quest flag; Thornwick's people keep their schedules; the region banner shows on entry |
| E2 | The Inner Forest, Silverbough, the Lost Woods and guides; "The Guide's Token" | Walking off-path without a guide loops you back; with a guide you get through; the token persists |
| E3 | The Ancient Forest: mega-trees, walkways, the forest creatures and the Blighted Elder | The Elder's phases; treants wake when their tree is cut; the walkways carry the player |
| E4 | The Elven Sanctum and the World Tree; teachers (Ranger, the secret Wildwarden); heartwood | The Ranger class can be learned from Faelan; heartwood can be gathered and crafted (update 2) |
| E5 | The Temple of Starfall and Moonlight Glade; Act IV part one end to end | The temple can be finished in a scripted run; the star-chart quest finishes at the Glade at night |

## 13. Decisions for Malachi (with defaults)

1. **The Lost Woods: how strict?** Default: strict in the Inner and Ancient
   Forest until you have a guide or the token; never in the Outer Forest.
2. **The loggers' quarrel:** default: two endings that change Thornwick and
   Silverbough a little (prices, a few lines, one grove open or closed).
3. **The Wildwarden (druid) class:** default: the secret class taught here,
   with three forms (wolf, bear, owl) in its tree.
4. **The World Tree's height:** default: about 300 m, visible from Elder Glen
   on a clear day.
