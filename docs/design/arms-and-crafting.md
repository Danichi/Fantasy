# Arms and Crafting (update 2 plan)

Status: plan, 2026-10-08. Nothing here is built yet beyond what "What exists"
lists. It follows §5.2 to §5.4 of the World Expansion plan and the discipline
model in `combat-paths.md`. Numbers are starting points to tune.

---

## 0. The idea in one paragraph

Today every weapon in the world is a sword, and the crafting Callings
(Herbalism, Smithing, Cooking, Runecraft) have trees whose crafting nodes say
"no effect yet". This update fills the armoury with **eight new weapon
families**, each with its own moveset and its own way of working with the
three combat schools; gives every material a **tier** and every crafted thing
a **quality**; and builds a **crafting system** with stations in the towns, so
the Callings become real builds: a master smith forges better blades than any
shop sells, a herbalist's tonics win fights, a cook's meals carry you through
the Wildlands, and a runesmith makes your armour sing.

## 1. Pillars

1. **Every weapon feels different in the hand.** Reach, speed, weight and
   rhythm change how you play, and each family uses the schools differently.
2. **Crafting is a build, not a chore.** A level-18 smith's work matches a
   level-18 combat node, as the Callings promise. The best gear in the game is
   made, not found.
3. **Materials tell you where you've been.** Iron from the quarry, mithril
   from the Deep Hold, heartwood from the elves, serpent scale from the sea.
4. **Short loops.** Gather, craft, use, in minutes. No hundred-click grinds.

## 2. What exists today (build on it)

| Piece | Where | State |
|---|---|---|
| Weapons | `items/itemDefs.ts`, `items/weaponModels.ts` | 17 swords and 5 shields; dual wield; weapon traits (burn, frost, lifesteal, crit, stagger) |
| Armour | `items/armorModels.ts`, `items/equipment.ts` | Head, shoulders, chest, hands, legs, feet, cloak; armour value; poise |
| Combat | `combat/actions.ts`, `player/player.ts` | Sword moveset (slash combo, heavy, sprint, air, plunge), parry, block, dodge; the Gale, Cross and Boundary schools; class skills |
| Callings | `paths/data.ts` | Herbalism, Dungeoneering, Smithing, Cooking, Runecraft (and the secret Beastbinding); trees exist, crafting nodes do nothing |
| Gathering | `world/foraging.ts`, `items/produce.ts` | Herbs (Sungrass, Moongrass, Wild Mint, Ironleaf...), farm produce, iron ore, planks, wool, eggs; fishing; trade goods from the boating update |
| Shops | `ui/shopUI.ts` | Master Fröst's forge and the Port Aurelle market sell finished gear |
| Animations | Mixamo sword-and-shield set, retargeted (`anim/retarget.ts`) | Sword only |

## 3. Weapon families

| Family | Hands | Feel | Gale (momentum) | Boundary (focus zone) | Cross (openings) | Favoured by |
|---|---|---|---|---|---|---|
| **Sword** (exists) | 1 | balanced | as now | as now | as now | Gale, Cross, Dawnblade |
| **Spear and polearm** | 2 | reach 3.2 m, thrusts | tip hits give more momentum; a hop back | zone radius +40%; entering enemies are pushed out | a feinted thrust opens a parry | Lancer (secret, later) |
| **Greatsword** | 2 | slow, huge arcs, hyper-armour on heavies | fewer hits, double momentum each | 180° frontal intercepts | guard-break counters instead of dual wield | Warbreaker |
| **Axe** | 1 or 2 | chops, bleeds | each hit in a chain adds bleed | hook-parry zone (pulls enemies in) | hook and chop | Warbreaker |
| **Mace and hammer** | 1 or 2 | slow, stuns, breaks armour | slower momentum, big stagger | intercepts stun the attacker | parry-smash | Dawnblade, Boundary |
| **Dagger** | 1 (pairs) | fastest, tiny reach, backstabs | momentum ×1.4 | a tight 1.2 to 3 m zone | backstab openings | Cross, Shadow (later) |
| **Bow** | 2 | aimed shots, draw time | rhythm fire: momentum shortens the draw | enemies entering the zone draw an automatic shot | a counter-shot after a dodge or parry | Ranger (update 4) |
| **Crossbow** | 2 | slow bolts, armour-piercing, a reload | reload cancels feed momentum | a trap zone | a point-blank counter-bolt | dwarves (update 5) |
| **Staff** | 2 | a quarterstaff and a spell focus | momentum shortens cast times | the zone intercepts spells | a parry opens an instant spell | the magic classes |

### Bows and ranged combat
- **Aim mode**: hold right mouse to draw (an over-the-shoulder aim, a reticle
  that tightens as you draw); left click to loose. Lock-on still works: a
  locked shot aims for the target with a little lead.
- **Arrows** are items (iron, broadhead, fire, frost, bone) that stack and run
  out; a quiver slot. Arrows that hit the world can be picked up again.
- Enemies get a reaction to being shot at range (bandits take cover,
  beasts charge).

### Animations
- Mixamo packs to download (Malachi, free with an Adobe login): Great Sword
  Pack, Longbow Pack, Pro Magic Pack, Dual Weapon Combat.
- The Universal Animation Library (CC0, on the Drawcall Market, already used
  for townsfolk) has spear, axe, staff and bow clips.
- All retargeted through `anim/retarget.ts`, as the sword set is.

## 4. Materials and quality

**Material tiers** (each a family of ingots, planks, hides and cloth):

| Tier | Metal | Wood | Hide and cloth | Where it comes from |
|---|---|---|---|---|
| 1 | Iron | Oak | Leather, wool | The quarry, the mine, Elder Glen's farms |
| 2 | Steel | Ash | Hardened leather, linen | Port Aurelle (iron + coal at a forge) |
| 3 | Silversteel | Yew | Drake leather, silk | The Royal Capital, the islands, the Wildlands |
| 4 | Mithril | Heartwood | Moonweave | The Deep Hold; the elves (update 4 and 5) |
| 5 | Star-iron | Ironbark | Ash silk | The Deep Forge; Ashen Port |
| 6 | Dragonbone | | Wyrmhide | Dragons; the Storm Wyrm |

Monster materials from the sea (serpent scale, kraken ink, colossus shell,
wyrm scale, leviathan bone) slot in as special reagents.

**Quality** of anything crafted: Crude, Common, Fine, Superior, Masterwork,
Legendary. It comes from the Calling's level, the materials' quality, the
station, and how well you do the short craft step (below). Shop gear is
Common or Fine; the best found gear is Superior; Masterwork and Legendary are
only made.

## 5. Crafting

### Stations (placed in the towns)

| Station | Calling | Where |
|---|---|---|
| Forge and anvil | Smithing | Fröst's forge (Elder Glen), the Dwarven Quarter forge (Port Aurelle), the capital's armourers, the Deep Forge (update 5) |
| Alchemy table | Herbalism (Alchemy branch) | the apothecaries in Elder Glen and Port Aurelle, the Collegium |
| Cooking fire and kitchen | Cooking | the inns, any campfire, a ship's galley |
| Workbench | Smithing (bows, staves, shields) and Runecraft (frames) | the carpenter in Elder Glen, the shipyard |
| Runestone | Runecraft | Fröst's forge, the Collegium, elven shrines |
| Tanning rack and loom | Smithing (leather) and Tailoring (below) | Elder Glen's farms, the capital's weavers |

### The craft screen
A book page like the others: the recipe list (by station; greyed when you
lack a material), the material slots (pick which quality of each), a quality
preview, and **Craft**.

### The craft step (short, skippable)
- **Smithing**: three hammer strikes on a beat (the Gale rhythm, in spirit);
  each well-timed strike raises quality one notch; a miss doesn't ruin it.
- **Alchemy**: stir until the colour turns, then pour.
- **Cooking**: take it off the heat in the window.
- A setting turns these off (always "good" timing, one quality notch lower).

### Recipes
Learned from mentors (each Calling's mentor teaches its tier 1 to 3 recipes),
from recipe books (bought, found in dungeons, rewards), and by **discovery**
(combining the right materials at a station unlocks a recipe with a flourish).

### Repair and salvage
Gear doesn't wear out in normal use (decision 2); **salvage** breaks an
unwanted item back into some of its materials at a station.

## 6. The Callings made real

| Calling | What it does now | Its crafting |
|---|---|---|
| **Smithing** | Weapons and armour of every family; ingots from ore; repairs to ships at a shipyard with the Shipwright branch (ties to boating) | Forge, anvil, workbench, tanning rack |
| **Herbalism** | Identify plants and their uses; more yield; rarer finds; tonics. The **Alchemy** branch (level 5) makes potions, elixirs and bombs | Alchemy table |
| **Cooking** | Meals with buffs (a stamina meal, a warm stew for the mountains, a sailor's ration that keeps crew morale up at sea) | Cooking fire, kitchen, galley |
| **Runecraft** | Inscribe runes on gear: elemental edges, poise, swift, warding, a rune of returning for arrows | Runestone, workbench |
| **Dungeoneering** | (update 3) automap, trap sense, secret walls, dungeon loot | none |
| **Tailoring** (new, from Smithing 5 or a mentor in the capital) | Cloth and leather armour, bags (more inventory), cloaks with passives | Loom, tanning rack |

## 7. Gathering

- **Ore veins** in the quarry, the mine, the mountains (tiers by region), as
  nodes you mine with a pick (an item), with a short swing.
- **Timber** from marked trees (an axe as a tool) in forests and the elven woods.
- **Hides** from hunting (beasts drop a hide; the skinning happens on loot).
- **Herbs** (exist) gain more species per region.
- **Fish** (exist) feed cooking.
- Nodes respawn by world time and are saved as depleted; Deep Sense (dwarf)
  and Keen Sight (elf) make them glint (update 1).

## 8. Architecture

| Module | Job |
|---|---|
| `src/items/weapons/*.ts` | One file per family: stats, models, the moveset table, school adapters |
| `src/combat/ranged.ts` | Aim mode, the reticle, arrows and bolts (pooled), pickups |
| `src/crafting/recipes.ts` | Every recipe: station, materials (with tier and quality slots), output, Calling level |
| `src/crafting/quality.ts` | Quality from level, materials, station, timing |
| `src/crafting/stations.ts` | Station interactables in each town; what each makes |
| `src/ui/craftUI.ts` | The craft page and the timing steps |
| `src/world/gatheringNodes.ts` | Ore veins and timber, streamed with the tiles, depletion saved |
| `paths/effects.ts` | The crafting nodes get real effects (yield, quality, recipes, speed) |
| Save | known recipes, material qualities on items, depleted nodes |

## 9. Roadmap (each phase is playable on its own)

| Phase | What's in it | Done when (tests) |
|---|---|---|
| A1 | Spear, greatsword, axe, mace and dagger: models, stats, movesets, school adapters; sold in the shops | Each family attacks with its own clip and reach; a greatsword's heavy has hyper-armour; daggers backstab for more; each school adapter changes its number |
| A2 | Bow, crossbow and staff; aim mode; arrows and bolts | A drawn shot hits a target 40 m away; arrows run out and can be picked up; a staff shortens a spell's cast under Gale momentum |
| A3 | Materials, quality, the craft page, forge and alchemy table; Smithing and Herbalism (with Alchemy) made real | Iron ore → ingot → a Fine sword at Smithing 5; quality rises with good timing; a tonic's strength follows Herbalism level |
| A4 | Cooking, Runecraft, Tailoring; the other stations; salvage; recipe discovery | A meal's buff lasts its time; a rune adds its element to a sword; salvaging returns materials; a discovered recipe stays learned after a reload |
| A5 | Gathering nodes (ore, timber, hides) across the existing regions; tiers 1 to 3 everywhere | A vein yields ore and is depleted, then respawns by world time; depletion survives a reload |

## 10. Decisions for Malachi (with defaults)

1. **Two-handed weapons and shields:** default: a two-handed weapon empties
   the offhand (no shield); the Boundary school's intercept works with the
   weapon instead.
2. **Durability:** default: no wear on gear (Souls-style), only salvage. A
   later option could add wear for hardcore play.
3. **The craft timing step:** default: on, with a setting to turn it off.
4. **Tailoring as a sixth Calling:** default: yes, unlocked from Smithing 5
   or from the capital's master weaver.
5. **Mixamo downloads:** default: Malachi grabs the four packs listed in §3;
   until then the UAL clips stand in.
