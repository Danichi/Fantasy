# Merge notes: Arms and Crafting (update 2, feat/arms)

All five phases of [arms-and-crafting.md](../arms-and-crafting.md) are built.

## What was built

| Phase | What | Where |
|---|---|---|
| A1 | Spear, greatsword, axe, mace and dagger: models, stats, movesets, school adapters; in the shops | `src/items/weapons/*`, `src/combat/armsRuntime.ts`, `src/items/armsShops.ts` |
| A2 | Bow, crossbow and staff; aim mode; arrows and bolts with pickups | `src/combat/ranged.ts`, `src/items/weapons/{bow,crossbow,staff}.ts` |
| A3 | Materials and quality; the craft page and its timing step; the forge and the alchemy table; Smithing and Herbalism make things | `src/crafting/{recipes,crafter,quality}.ts`, `src/ui/craftUI.ts`, `src/ui/craft.css` |
| A4 | Cooking, Runecraft (now with a tree) and Tailoring (a sixth Calling); the workbench, runestone, loom and tanning rack; salvage; recipe books; discovery | the same, plus `src/paths/data.ts` |
| A5 | Ore veins (iron, coal, copper, silver) and windfall timber (oak, ash, yew) across the regions, tiers 1 to 3; hides and meat from hunting | `src/world/gatheringNodes.ts`, `src/crafting/arms.ts` |

About 90 recipes. Quality (Crude to Legendary) comes from the Calling's level,
the materials, the station and the timing step (three hammer blows; a stir; taking
it off the heat). Pressing Skip, or switching the step off (a button on the page),
counts as good timing one notch lower.

## Where the stations are

Stations are interaction points at furniture that was already in the rooms:

- **Forge and runestone:** Fröst's smithy (the runestone is new, by the right-hand wall).
- **Alchemy table:** the apothecary's.
- **Loom and tanning rack:** the tailor's.
- **Workbench:** the carpenter's.
- **Cooking fire:** every tavern hearth and the Crown Road's campfires.
- **Master's forge:** Port Aurelle's open forge in the Dwarven Quarter (+0.5 quality).

## Seams touched outside the update's own files

- `world/interior.ts`
  - `stationHook`, `station()` and `runestone()`.
  - One line in each room that has a station.
- `world/crownRoad.ts`: campfires push a cooking interactable.
- `world/portAurelle.ts`: `forgeAt` is exported.
- `paths/effects.ts`
  - The generic Calling nodes carry `x` keys: `yield`, `potency`, `gather`, `twice`, `rare`. `crafter.x(calling, key)` reads them per Calling.
  - `merge()` now sums `x` keys that both effects share. Before, the second one won; the node text already said both.
- `paths/data.ts`
  - The mentors are now Elder Glen people who exist:
    - Herbalism: Ilyra Moss, the apothecary.
    - Cooking: Mara Bell, the innkeeper.
    - Tailoring: Vela Thread, the tailor.
  - Runecraft has a tree.
  - Tailoring is new. Vela teaches it with no Smithing requirement, which departs from plan decision 4.
- `paths/classes/combat.ts`: `lastHitFlow` records what the last Gale hit gave. Weapon families scale their Flow from it (a greatsword gives twice the base, a dagger 1.4 times).
- `player/player.ts`
  - Blocking keeps main's faster raise and its costs, plus the weapon guards.
  - `remapAction` runs before the family's `actionFor`.
  - Hit detection runs on drawn frames. A frame that jumps right over an attack's hit window now still checks it (`hitCheckedAt`). Before, a slow frame could swallow a fast dagger's strike entirely.
  - `hitAssist`: the dagger also lands on a foe right in front, within its 1 m reach, when the short blade's sweep slips past.
- `origins/wiring.ts`: the dwarf's Deep Sense glints at ore veins (`ORE_SENSE`).
- `npc/town.ts`: the tailor sells hides, leather, flax and cloth.
- `main.ts`
  - The craft page's input lock.
  - Hiding gathering nodes off the overworld.
  - The world interactables.

## Save

`world.arms` saves these:

- Recipes learned from books and by discovery.
- The timing-step setting.
- Gathering nodes not yet regrown (by game hour).
- Buffs and the crossbow's loaded state.

Recipes from levels and tree nodes are worked out live, so they are not saved.

## Tests

- `tests/crafting.spec.ts` covers A3–A5 in 8 tests, including the smithy's forge used through the door and a reload.
- `tests/arms.spec.ts` covers A1–A2.

## Left for later

- Moonweave, mithril and the tier 4+ materials wait for updates 4 and 5. The Deep Forge does too.
- Shipwright repairs and a ship's galley wait.
- The capital's armourers and the Collegium have no stations yet.
- Herbalism's yield nodes don't change foraging yet; they only affect crafting quality.
- There is no gathering swing animation: the hero stands at the node while sparks or chips fly.
- The first swing with a weapon family's library clip, right after equipping it, can come out short while the clip blends in. The tests warm up with one swing.
