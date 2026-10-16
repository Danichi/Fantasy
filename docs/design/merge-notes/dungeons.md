# Merge notes: Update 3, Dungeons Reborn (feat/dungeons)

Plan: [../dungeons.md](../dungeons.md). Every phase (D1 to D5) is built.

## What was built

- **The dungeon kit** (`src/dungeon/kit/`): a grammar that lays out a floor from an
  authored plan (entry, hub, gate, antechamber, boss, reward, return) with wings
  generated from a seed (BSP into 3 to 6 rooms, a chain with the odd loop; wing A
  holds the key, wing B the mechanism, wing C hides behind a secret; a wing whose
  far end touches the hub gets a one-way shortcut). Rooms tile a grid of 4 m cells,
  so the hand-drawn map, the old crypt tests (`grid.bfs`) and the automap all work
  in cells. `validateFloor()` checks every promise.
- **Room templates** (`rooms.ts`): corridor, hall, ossuary (skeletons climb out as
  you enter), flooded hall (you wade), collapsed chapel (light shaft, broken bell),
  vault, scriptorium, armoury (Living Armour), cistern, puzzle chamber, shrine
  (rest), and cave and drowned-shrine sets (grotto, den, rope bridge, waterfall hub,
  tide pool, hall of carvings, nave, sluice hall...). Themes (`theme.ts`): crypt,
  cave, drowned.
- **The builder/runtime** (`build.ts`, `KitInstance`): walls, doorways with frames,
  floors with pits, props merged per room and streamed by distance, a lantern plus
  four pooled lights handed to the nearest flames, breadcrumb braziers on the way
  to the gate and the boss, explored rooms dimming, wandering enemies, chests by
  tier, the key on its dais, the stairs, the exit, the shrine rest, death back at
  the last shrine.
- **Traps** (`traps.ts`): darts, a portcullis ambush, swinging blades, collapsing
  floors into a pit, gas vents, a rolling boulder; each with a tell, a Trap Sense
  outline and disarming.
- **Secrets** (`secrets.ts`): cracked walls (break to a heavy blow: poise 55+ or a
  30+ spell), false walls (shimmer, or sound hollow if you lean on them), a lever on
  a statue, a loose tile over a cache.
- **Puzzles** (`puzzles.ts`): the Sunwheel dial (clue carved in another room), light
  and mirrors, weighted plates (clue symbols), bells (the hymn plays in the chapel),
  and a lever; every one but the lever has a fallback fight.
- **The boss template** (`boss.ts`): intro (the arena's portcullis drops, name card,
  boss bar), phases by health share, arena hooks, death (reward room, arena opens,
  the shortcut home, the hoard once, a deed), reset when you die.
- **Dungeoneering made real** (`delving.ts`): the plan's eight nodes plus the small
  ones around them, read from the player's tree; mastery for rooms, secrets, traps
  and puzzles.
- **The automap layer** (`ui/dungeonMap.ts`): a faint blue layer of the rooms you've
  seen under your own ink (Cartographer's Eye), chest icons (Treasure Nose), the
  boss room (Sense the Boss), and an "Auto-ink" switch on the map.
- **The Crypt of Elder Glen, rebuilt** (`dungeons/crypt.ts`): same door, same key
  and portcullis, then a Sunwheel dial seal; B2F the drowned crypt, the bells, the
  Chapel of the Old Kings. Grukk (kind now `'grukk'`) roars at 60% and his warband
  breaks in through the chapel's niches; at 25% the roof comes in and he's faster.
  The old kings' tomb holds the Signet of the Old Kings; the kings' stair is the
  shortcut back to the hub.
- **Hollow Ridge Caves** (`dungeons/hollowRidge.ts`): the cave behind Varn's camp.
  Captain Vess and her crossbows (ledges; smoke and reinforcements at 60%; burning
  lamp oil at 25%).
- **The Drowned Shrine** (`dungeons/drownedShrine.ts`): a ruined portico up from
  Sunken Spire's quay; two floors; the Tide-Warden (`enemies/tideWarden.ts`), a
  procedural construct with slam, sweep, wave and jet, each with a tell. The basin
  floods at 60% and again at 25%; the daises stay dry.
- **The kit's test dungeon** (`dungeons/kitTest.ts`, console/tests only).

## Shared files touched

| File | Change |
|---|---|
| `src/main.ts` | one import line; one block after the realm is made (`setupDungeonEntrances`); one `dungeons,` line in `window.__game` |
| `src/dungeon/realm.ts` | the crypt's `enter()` now runs the kit; new `enterKit()`, `registerKit()`, `kitProgress()`, `secretsNear()`, `perks`; `active` is now `string \| null`, `floor` a number, `instance` a `KitInstance`; `atmosphere()` takes an optional kit theme; `leave()` returns you to the kit dungeon's own door; `mapKey()` is now `crypt:<seed>:<floor>` (the old maze's maps are left in saves, unused) |
| `src/dungeon/instance.ts` | `DungeonProgress` gains optional `kit` (each kit dungeon's progress). The old maze `DungeonInstance` and `generator.ts` stay (the kit reuses `Grid`); nothing else uses `DungeonInstance` now |
| `src/ui/dungeonMap.ts` | the `AutoLayer` type, painting it under the ink, `setAuto()`, the Auto-ink button (remembered in localStorage `dmap-auto`) |
| `src/paths/data.ts` | Dungeoneering node renames only: Dark Eyes -> Torchbearer, Echo Sense -> Cartographer's Eye, `?Map Sense\|Wall Tap` -> Delver's Sense, Deep Roads -> Deep Breath, Master of the Deep -> Master Delver, Tripwire -> Light Feet, Vault Breaker -> Treasure Nose (node ids unchanged, so saves keep their nodes) |
| `src/paths/effects.ts` | one import, one `...DUNGEONEERING_PASSIVES` spread at the top of `PASSIVES` |
| `src/enemies/orc.ts` | `phaseSpeed` (multiplies his speed) and `phaseRoar()` for the boss template |
| `src/progression/progression.ts` | XP entries for `grukk`, `captainVess`, `tideWarden` |
| `src/guild/adventurerGuild.ts` | the Warlord Contract (`orc-2`) now targets `'grukk'` (it used to complete on any orc) |
| `src/items/itemDefs.ts` | import + `...DUNGEON_ITEMS` |

## New keys

None. Everything is E (interact) and M (map). The automap switch is a button on the map.

## New save fields

- `dungeon.kit` (inside the existing `dungeon` save, so `save.ts` is untouched):
  `Record<dungeonId, KitProgress>` with the seed, rooms seen per floor, doors opened,
  mechanisms solved, secrets found, chests, disarmed traps, boss beaten, last shrine,
  Master Delver used, visited. Old saves: a crypt with `gateOpen`/`bossDead` is
  migrated (portcullis and seal open; boss beaten) the first time it's entered.
- localStorage `dmap-auto` ('on'/'off') for the automap switch.

## Ids

Defined here:
- Boss kinds (enemyDied): `'grukk'`, `'captainVess'`, `'tideWarden'`.
- Deeds: `boss:grukk`, `boss:captainVess`, `boss:tideWarden` (renown 2, first kill
  only); `place:crypt`, `place:hollowRidge`, `place:drownedShrine` (renown 1, first
  entry). (No chapter quests in this update, so no `chapter:` deeds.)
- Items: `smugglersKey`, `tideKey`, `dungeonRubbing`, `oldKingsSignet`,
  `vessBandolier`, `smugglersCutlass`, `tidewardenHeart`, `tideglassBlade`.
- Dungeon ids: `crypt`, `hollowRidge`, `drownedShrine`, `kitTest`.

Referenced from other updates (all optional; loot rolls skip ids that aren't in ITEMS):
- Materials in loot tables: `ironIngot`, `steelIngot`, `silversteelIngot`, `coal`,
  `leather`, `hardenedLeather`, `silverOre`, `silk`, `arrowIron` (feat/arms).
- Origins: `'elf'` and `'dwarf'` on `player.prog.origin` make secrets shimmer as
  Delver's Sense does (feat/origins' Keen Sight / Deep Sense).

## The kit's API (for the Temple of Starfall, the Collapsed Shaft, the Engine Below)

1. **Plan the floors** as `FloorPlan`s (`kit/types.ts`): zones that tile a `w` x `h`
   grid of 4 m cells. Fixed zones (`role` entry/hub/alcove/passage/ante/stairs/boss/
   reward/return with a `template`) and wing zones (`role: 'wing'`, `wing: 'A'|'B'|'C'`,
   `attach: [zone ids]`, `entryKind: 'secret'` for C). `links` join fixed zones:
   `open`, `locked` (with `key`), `sealed` (with `mech: [id]`), `arena`, `reward`,
   `shortcut` (with `from`). Set `key`, `mechanism: { id, kind }`, `stairsDown` or
   `boss`, `pool` (templates for the wings), `lootTier`, `entrance` and `exitWall`.
   The two shapes in `dungeons/plans.ts` (`gatedFloor`, `bossFloor`) are a start;
   check new plans with `buildFloor()` + `validateFloor()` over many seeds.
2. **Define the dungeon** as a `KitDungeonDef` (`kit/build.ts`): `id`, `name`,
   `theme` (`'crypt' | 'cave' | 'drowned'`; add a theme in `kit/theme.ts`), a unique
   `origin` far off the map (used: 40000, 43000, 46000, 49000 on x), `plans`,
   `traps`, `mobs(floor)` (MobKind list), `loot` (`baseTable([...extras per tier])`),
   optional `boss: { floor, def }`, `reward` (named gear id), `exitLabel`, `arrive`.
3. **A boss** is a `BossDef` (`kit/boss.ts`): `name`, `subtitle`, `kind`, `phases`
   (health shares), `create(at, yaw, fight)` returning a `BossActor` (any Target
   with `update`, `reset`, `dispose`, `dead`, `awake`), and optional `arena`,
   `onIntro`, `onPhase`, `update`, `groundAt`, `onReset`, `loot`.
4. **New room looks**: add a dresser to `DRESS` in `kit/rooms.ts` and its footprint
   to `TEMPLATE_INFO` in `kit/grammar.ts`. Dressers get `DressCtx` (cells, wall
   faces, merged meshes, colliders, flames, water, light shafts, spawns, interactables).
5. **Open it onto the world**: `realm.registerKit(def, doorPos, outPos, outYaw, label)`
   (see `dungeons/entrances.ts`). Or call `realm.enterKit(def, floor, 'entrance')`
   from your own door.

## Seams to finish after the merge

- **Keen Sight / Deep Sense** (feat/origins): `realm.secretsNear(pos, r)` lists unfound
  secrets near a point; `perksOf()` already lets `'elf'`/`'dwarf'` see shimmers.
- **Renown**: the `deed` events above; feat/origins listens.
- **Port the elves' Temple of Starfall and the mountains' Collapsed Shaft and Engine
  Below onto the kit** (they were built on the old realm pattern meanwhile).
- **Recipe books** (feat/arms): add their ids to the dungeon loot tables (`baseTable`
  extras per dungeon); they roll only when the id exists.
- **The Old King's Road Mine** is untouched (another author's authored dungeon); its
  traps/secrets/Dungeoneering hooks are left for a later pass so it can't break.
- The Royal Library buying Sunwheel rubbings: today `dungeonRubbing` sells to any
  merchant (rare, ~90 gold); a librarian offer could pay more.

## Known issues

- `OrcMob`s are XP 420 each (they share Grukk's old `'orc'` entry); not changed here.
- Wandering enemies only think within 30 m of you (so they don't pile against walls);
  bandits still aggro through walls inside that range.
- The automap is redrawn twice a second while in a dungeon (cheap, but not free).
- Reloading mid-dungeon puts you back outside its door (progress inside is kept),
  as reloads always have.
