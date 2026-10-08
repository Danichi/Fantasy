# Dungeons Reborn (update 3 plan)

Status: plan, 2026-10-08. Nothing here is built yet beyond what "What exists"
lists. It follows phase 7 of the World Expansion plan. Numbers are starting
points to tune.

---

## 0. The idea in one paragraph

The crypt under Elder Glen is a generated maze: honest, but every corridor
looks like the last. The Old King's Road Mine showed what an authored dungeon
feels like. This update builds a **dungeon kit** that gives every dungeon the
mine's sense of place with the generator's variety: dungeons are graphs of
**rooms with identities** (an ossuary, a flooded hall, a collapsed chapel, a
vault), laid out from a grammar (an entry, a hub, wings, a key, a gate, an
antechamber, a boss), lit so you can always read the way, and full of
**traps, secrets and puzzles**. The **Dungeoneering** Calling becomes real
(automap, trap sense, finding hidden walls). Three dungeons are rebuilt or
added with it, and every region after this one uses the same kit.

## 1. Pillars

1. **Every room is somewhere.** A room has a purpose and a look; you
   remember "the flooded hall" and "the chapel with the broken bell".
2. **You can always read the way.** Landmarks at junctions, breadcrumb
   lighting toward the boss, shortcuts that open back to the hub.
3. **Secrets reward attention.** Cracked walls, levers, odd carvings; the
   Dungeoneer and the elf's Keen Sight find more.
4. **Bosses are fights to learn.** Two or three phases, a tell for every
   big attack, an arena that matters.

## 2. What exists today (build on it)

| Piece | Where | State |
|---|---|---|
| The crypt | `dungeon/generator.ts`, `dungeon/instance.ts` | A seeded maze, two floors, a key and gate on the only route, Grukk the Orc Warlord at the bottom |
| The Old King's Road Mine | `dungeon/mine.ts` (at x = 5000) | Authored rooms (rectangles with openings), a gate, the Living Armour guardian |
| Realms | `dungeon/realm.ts` | Switching to and from a dungeon: the fade, lighting and fog, the ground override, floors, the respawn point |
| Hand-drawn maps | `ui/dungeonMap.ts` | Etrian Odyssey style: the game never draws the map, you do |
| Enemies | `enemies/*` | Slimes (four kinds), rats, the Living Armour, orcs, skeletons and zombies, bandits, the abomination |
| Interiors | `world/interior.ts`, `world/doors.ts` | Houses, taverns, the palace, the undercity |
| Dungeoneering | `paths/data.ts` | A Calling with a tree whose nodes do nothing yet |

## 3. The dungeon kit

### The grammar (how a dungeon is laid out)

```
entry ─► hub ─┬─► wing A ─► (key) ───────────┐
              ├─► wing B ─► (lever / puzzle) ─┤
              └─► wing C (optional, secrets) ─┘
                                              ▼
                       gate ─► antechamber (a rest shrine) ─► boss ─► reward room
                         ▲                                        │
                         └──────────── shortcut to the hub ◄──────┘
```

- **Wings** are chains of 3 to 6 rooms; one holds the key, one a mechanism
  (a lever, a puzzle) the gate also needs, one is optional and secret-heavy.
- **Shortcuts:** each wing's far end unlocks a one-way door back to the hub,
  so dying near the boss is a short walk.
- **Floors:** a dungeon is one to three floors; each floor is its own graph
  with stairs as the entry and the gate.
- **Authored and generated mix:** a dungeon is a list of rooms with
  connections; it can be fully authored (a hand-placed list), or generated
  from the grammar with a seed and a room pool, or authored around fixed
  rooms (the boss room) with generated wings.

### Room templates

Each template is a size, an exit layout, a look (a material set and props),
a lighting plan and spawn slots:

| Template | Look | What happens there |
|---|---|---|
| Corridor, bend, stair | the dungeon's base set | Traps, wandering enemies |
| Ossuary | bone niches, candles | Skeletons rise from the walls |
| Flooded hall | knee-deep water, pillars | Slow movement; things under the water |
| Collapsed chapel | a fallen roof, a broken bell, light from above | A mini-boss; the bell can be rung (it calls the dead) |
| Vault | a locked door, a chest on a dais | The key, or treasure behind a puzzle |
| Library and scriptorium | shelves, scrolls | Lore, recipe books, a secret behind a bookcase |
| Armoury | racks and old armour | Living Armour that stands up as you pass |
| Cistern and bridge | a chasm with a narrow bridge | A fight on a narrow footing; a fall is a shortcut down |
| Shrine (antechamber) | the Sunwheel, a fire | Rest (heal, save), the last stop before the boss |
| Puzzle chamber | depends on the puzzle | Below |
| Boss arena | built for its boss | Below |

### Traps
Pressure plates (darts, a falling portcullis), swinging blades, collapsing
floors (a drop to a lower room), gas vents, a rolling stone. Every trap has a
tell (a plate's edge, a slot in the wall, scratches on the floor) for a
careful eye; Dungeoneering's Trap Sense outlines them.

### Secrets
Cracked walls (break with a heavy hit), hidden levers (behind a tapestry, on
a statue), false walls (Dungeoneering's Delver's Sense, the elf's Keen Sight
make them shimmer), a missing tile in a pattern. Secret rooms hold the best
loot, recipe books, Sunwheel lore, and sometimes a shortcut.

### Puzzles
- **The Sunwheel dial**: rotate three rings to match a carving seen elsewhere
  in the dungeon (the main mystery's mark).
- **Light and mirrors**: turn mirrors so a beam of daylight reaches a crystal.
- **Weights**: stand, or push a block, onto plates in the right order.
- **Bells**: ring them in the order of the hymn heard in the chapel.
Each puzzle has a fallback: a harder fight opens the same door, so nobody is
stuck forever.

### Bosses
A template every boss follows: an intro (the arena seals; a name card), two
or three phases with new attacks, a tell (wind-up pose, sound, glow) before
every big attack, the arena used (pillars to break, water rising, adds from
the walls), and a death that opens the reward room and the shortcut.

### Lighting and atmosphere
- **Breadcrumbs:** braziers and lit sconces lead toward unexplored rooms and
  the boss; explored rooms dim a little.
- **Landmarks** at the hub and every junction (a statue, a waterfall, a
  great chain) so the map in your head works.
- Fog and light per dungeon theme (the mine's tuning is the model).

## 4. Dungeoneering made real

| Tier | Node | What it does |
|---|---|---|
| 1 | Torchbearer | Your light reaches further; you see room shapes as you enter |
| 5 | Cartographer's Eye | **Automap** (optional): rooms you've seen draw themselves on the map. The hand-drawn map stays for anyone who likes it (decision 1) |
| 5 | Trap Sense | Traps within 8 m are outlined |
| 10 | Delver's Sense | False walls and hidden levers shimmer within 10 m |
| 10 | Light Feet | Pressure plates don't fire under you at a walk |
| 15 | Treasure Nose | Chests show on the map; +20% dungeon loot |
| 20 | Deep Breath | Gas traps and bad air don't hurt you |
| 25 | **Master Delver** | Once per dungeon, open any locked door or gate without its key |

## 5. The dungeons in this update

| Dungeon | Where | Theme | Floors | Boss |
|---|---|---|---|---|
| **The Crypt of Elder Glen** (rebuilt) | under the hill north of Elder Glen | ossuaries, a flooded crypt, the chapel of the old kings | 2 | Grukk the Orc Warlord (as now, with phases) |
| **Hollow Ridge Caves** (new) | the bandit camp on the King's Road spur | a smugglers' cave, rope bridges, a waterfall | 1 | Captain Vess and her crossbows |
| **The Drowned Shrine** (new) | under Sunken Spire's island (the boating update's harbour) | a flooded temple of the wheel-cutters, rising water | 2 | The Tide-Warden (an ancient construct) |

The Old King's Road Mine stays as it is (authored); it gets the new traps,
secrets and Dungeoneering hooks where they fit. Updates 4 and 5 use the kit
for the elven Temple of Starfall and the dwarven delves.

## 6. Loot

- Chests by tier (wooden, iron, gilded, the vault) with tables per dungeon
  and depth; recipe books and materials from update 2; Sunwheel rubbings
  (lore that the Royal Library pays for).
- The boss's reward room: a guaranteed piece of named gear and a Renown deed
  (update 1).

## 7. Architecture

| Module | Job |
|---|---|
| `src/dungeon/kit/grammar.ts` | Builds a room graph from the grammar and a seed (and checks it: every room reachable, the key before the gate, the shortcut after the boss) |
| `src/dungeon/kit/rooms.ts` | Room templates: size, exits, look, lights, spawn slots |
| `src/dungeon/kit/build.ts` | Turns a graph into meshes, colliders, lights and props (merged per room; rooms stream in and out as you move) |
| `src/dungeon/kit/traps.ts`, `secrets.ts`, `puzzles.ts` | Each kind, with its tell and its state |
| `src/dungeon/kit/boss.ts` | The boss template: intro, phases, tells, arena hooks, death |
| `src/dungeon/dungeons/*.ts` | One file per dungeon: authored rooms, generated wings, its boss, its loot |
| `realm.ts` | Gains one entry point for any kit dungeon (it already switches realms) |
| `ui/dungeonMap.ts` | The automap layer (seen rooms) over the hand-drawn one |
| Save | per dungeon: the seed, rooms seen, doors and shortcuts opened, secrets found, puzzles solved, the boss beaten |

## 8. Roadmap (each phase is playable on its own)

| Phase | What's in it | Done when (tests) |
|---|---|---|
| D1 | The grammar, room templates and the builder; a test dungeon | A graph of 40 seeds: every room reachable, the key always before the gate, the shortcut opens back to the hub |
| D2 | Traps, secrets and puzzles (all four kinds), each with its fallback | Each trap fires and its tell is visible; a cracked wall breaks to a heavy hit; each puzzle opens its door when solved and through its fallback |
| D3 | The Crypt rebuilt with the kit; Grukk with phases; the boss template | The crypt can be finished end to end in a scripted run; Grukk changes phase at 60% and 25%; the shortcut opens after him |
| D4 | Dungeoneering made real; the automap layer | Each node changes what it says (light radius, trap outlines, hidden walls); the automap shows seen rooms only |
| D5 | Hollow Ridge Caves and the Drowned Shrine | Each can be finished end to end; the Drowned Shrine's water rises in the boss fight; progress survives a reload mid-dungeon |

## 9. Decisions for Malachi (with defaults)

1. **Automap or hand-drawn?** Default: hand-drawn stays the default (it's a
   signature feature); the automap is a Dungeoneering perk and a setting.
2. **Rebuild the crypt or keep it?** Default: rebuild it with the kit, same
   place, same Grukk, same key and gate, so the main quest doesn't change.
3. **Generated or authored?** Default: authored boss rooms and hubs,
   generated wings, so replays differ but the set pieces stay.
4. **Dying in a dungeon:** default: back at the last shrine you rested at
   (or the entry), with shortcuts kept.
