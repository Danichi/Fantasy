# The Next Five Updates (roadmap)

Written 2026-10-08, after the boating update. It follows the World Expansion
plan (`~/.claude/plans/we-are-going-to-vivid-galaxy.md`): the world first, then
classes, magic, combat and origins, then the rest of the world. Phases 1 to 5,
8 (the Royal Capital) and 11 (the Grand Ocean) are built. Daniel is building
the Golden Expanse (phase 13, the desert), so these plans leave it to him and
only touch it where the story meets it.

Each update has its own full plan. Each plan ends with the decisions that are
Malachi's to make, and every decision has a default, so work can start without
waiting.

| # | Update | Plan | Master plan | Depends on |
|---|---|---|---|---|
| 1 | **Origins and the Legendary Hero**: six races with a character creator, legendary origin abilities, dragonkin flight | [origins.md](origins.md) | §5.1, phase 6 | nothing (the Skills screen exists) |
| 2 | **Arms and Crafting**: eight new weapon families, bows, material tiers, a real crafting system, and Callings that do something | [arms-and-crafting.md](arms-and-crafting.md) | §5.2 to §5.4, phase 6 | 1 for origin crafting perks (soft) |
| 3 | **Dungeons Reborn**: an authored room-graph dungeon kit, traps, secrets and puzzles, boss templates, the Dungeoneering calling, three dungeons | [dungeons.md](dungeons.md) | phase 7 | 2 for loot and weapon drops (soft) |
| 4 | **The Verdant Elves**: the great forest north of Cresha, the Elven Sanctum, Moonlight Glade, the Lost Woods, Act IV begins | [verdant-elves.md](verdant-elves.md) | phase 9 | 1 (elf homeland), 2 (bows, heartwood), 3 (the temple dungeon) |
| 5 | **The White and Deep Mountains**: the Iron Kettle voyage, the dwarf holds, Frostpeak Citadel, the Deep Hold, legendary materials and the Deep Forge | [mountains.md](mountains.md) | phase 10 | 2 (legendary smithing), 3 (the deep delves), the boating update (the voyage) |

## Why this order

- **Origins first** because every later region has a homeland in it (the elves
  in update 4, the dwarves in update 5), and the character creator touches every
  new save. It's also the most-asked-for missing piece of phase 6.
- **Arms and Crafting second** because the elven and dwarven regions are built
  around their materials (heartwood, mithril, star-iron) and teachers (elven
  bows, dwarven smithing). Without crafting those regions have nothing to give.
- **Dungeons third** because both regions after it need dungeons (the elven
  temple, the dwarven delves), and the kit should exist before them.
- **Then the two regions**, in map order: the forest borders Cresha; the
  mountains lie beyond it and across the sea.

## After these five

- **The Islands (phase 12)**: the five harbours exist from the boating update;
  next comes their inland content (the Azure Isles' lagoons and treasure, the
  Emerald Isles' forests, the Shattered Isles' pirate haven as a quest hub for
  the Black Tide, the Sunken Isles' drowned ruins and underwater lighting).
- **The South and West (phase 13)**: the Wildlands, Southern Marches, Frosted
  Peaks, the Deep Wilderness and Valoria, coordinated with Daniel's Golden
  Expanse.
- **The Demon Continent (phase 14)**: Ashen Port is already there; the
  continent, its cities and the end of the story come last.

## Rules every update keeps

- Push after every change, to `integration/all-features` and `main`.
- Only CC0 assets. Itch-only packs are a short download list for Malachi.
- Every system loads, activates, deactivates, unloads and disposes; pools what
  repeats; stays inside the Iris Xe budgets (about 45 fps open world, 30 in a city).
- Each phase ends with typecheck, build, its own Playwright tests, screenshots
  read at several viewports, and the desktop app rebuilt.
