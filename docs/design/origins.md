# Origins and the Legendary Hero (update 1 plan)

Status: plan, 2026-10-08. Nothing here is built yet beyond what "What exists"
lists. It follows §5.1 of the World Expansion plan and the progression model
in `combat-paths.md` (XP invested in disciplines; Callings are real power).
Numbers are starting points to tune; names can be vetoed.

---

## 0. The idea in one paragraph

You were summoned into this world, but you were not summoned as nobody: you
came as one of six peoples, and that origin is the oldest power you have. A
new **character creator** lets you choose your origin, face, build and colours.
Each origin gives a few always-on passives and a **legendary ability tree**
that grows through a new discipline, the **Legendary Hero**, which levels only
from great deeds (bosses, the main story, first landfalls, monsters of the
deep). At its top each origin becomes something the world talks about: the
dragonkin fly and breathe fire, the demon takes its true form, the dwarf turns
to living stone.

## 1. Pillars

1. **Your origin is visible.** Elf ears, dwarf beards and builds, beastfolk
   ears and tails, demon horns and glowing eyes, dragonkin scales and wings.
   Other people notice and react.
2. **Your origin is a playstyle, not a stat bump.** Each tree changes how you
   fight or move: blink chains, stone skin, a pounce, a demon form, flight.
3. **Legendary power is earned by the story.** The Legendary Hero discipline
   can't be bought with ordinary XP; it grows from deeds, so the strongest
   abilities arrive at the big moments.
4. **Every origin has a homeland and a way home.** Its people live somewhere
   on the map, with a homeland quest when that region opens.

## 2. What exists today (build on it)

| Piece | Where | State |
|---|---|---|
| Origin | `progression/progression.ts` (`Origin = 'human' \| 'dragon' \| 'demon'`), saved | Picked on the title screen; one V ability each: Heroic Adaptation (mana and stamina), Dragon Breath (a 6.5 m cone), Blood Awakening (heal over time and stamina) |
| Title-screen picker | `ui/inventory.ts` (`.origin-picker`, three buttons) | No customisation |
| Characters | `npc/charBuilder.ts` | Quaternius CC0 kit: two bodies, two outfits, six hair styles, a beard, skin and hair tint, height scaling; merged meshes for townsfolk |
| Character preview | `ui/charPreview.ts` | A live 3D preview of the player in the inventory |
| Disciplines | `paths/*` and the Skills screen (K) | Combat classes, magic classes, callings; XP invested; tree points; mastery |
| Moves bar | keys 1 to 6 plus an ultimate slot | Class skills that work in combat |

## 3. The six origins

| Origin | Look | Passives (always on) | Legendary tree (tiers 1 to 5) | Homeland |
|---|---|---|---|---|
| **Human** | the base bodies | **Heroic Adaptation**: +15% XP from every source; +1 tree point every 5 character levels. **Second Wind**: once per fight, at 20% health, recover 25% | Rally (allies and crew fight harder for 20 s) → Hero's Resolve (survive a lethal blow at 1 HP; 3-minute cooldown) → Banner of Cresha (a planted standard: allies heal and enemies falter) → Unbroken (stagger immunity for 12 s) → **Legend Awakened** (20 s: every stat up, every class meter full) | Cresha (you're in it) |
| **Elf** | tapered ears, a slimmer build and longer limbs, height 1.75 to 1.95 m, cool skin tones | **Keen Sight**: herbs, hidden paths and secret doors glint within 20 m. **Sylvan Step**: +20% speed in forest regions. **Arcane Affinity**: +30% mana regeneration | Moonveil (4 s invisible; enemies lose you) → Starlight Volley (five homing motes) → Treeshape (root yourself: armour up, heal over time) → Wind-Walker (no fall damage; a midair dash) → **Grace of the Ancients** (10 s: every dodge becomes a blink that leaves a damaging afterimage) | The Verdant Elves (update 4): the Elven Sanctum |
| **Dwarf** | shorter legs and wider shoulders, height 1.35 to 1.55 m, beards (both sexes may braid), ruddy skin tones | **Stoneblood**: +25% poise, immune to poison. **Deep Sense**: ore veins and gems glint through rock within 30 m. **Forgemaster**: crafted gear has a 15% chance of one quality tier higher | Earthen Bulwark (a stone dome that blocks projectiles) → Mountain's Wrath (a ground slam that throws enemies) → Runeheart (one rune on your armour works twice as hard) → Delver's Endurance (no stamina cost to sprint underground) → **Heart of the Mountain** (6 s of stone skin: no damage taken, can't be staggered) | The White and Deep Mountains (update 5): the Deep Hold |
| **Beastfolk** | wolf or cat ears, a tail, fur markings, a digitigrade boot shape, amber or green eyes | **Feral Senses**: tracks of nearby beasts show; night vision (the dark is lighter). **Pounce**: sprint attack becomes a long leap. **Swift Paws**: +12% sprint speed | Hunter's Mark (a marked enemy takes 20% more) → Savage Howl (nearby enemies flee for 4 s) → Pack Call (two spirit wolves fight for you for 30 s) → Bloodscent (the wounded show through walls) → **Primal Rage** (20 s: claws replace your weapon, +30% speed, lifesteal) | The Deep Wilderness (later, phase 13); a beastfolk camp in the Wildlands as a stand-in until then |
| **Demon** | horns (four styles), a tail, crimson, ash or slate skin, glowing eyes | **Demonic Regeneration**: 1% health a second in and out of combat. **Darkvision**. **Infernal Affinity**: 40% less fire and shadow damage | Hellstep (a short teleport dash through enemies, damaging them) → Blood Awakening (pay 15% health for +40% damage, 10 s) → Demonic Hide (armour scales with missing health) → Brimstone Aura (enemies near you burn) → **Demon Form** (25 s: you grow to 2.4 m, a fire aura, a new heavy moveset) | The Demon Continent (Ashen Port exists; the continent is phase 14) |
| **Dragonkin** | horns swept back, scale patches on the face and arms, a tail, folded wings, slit-pupil eyes | **Innate Fire Resistance** (50%). **Draconic Physique**: +10% health and poise. **Dragon Senses**: the lock-on range is 30% longer | **Flight**, in five tiers: Glide (hold jump falling) → Wing Burst (a short flight upward) → True Flight (sustained) → Dragon's Descent (a dive attack from the air) → **Fire Breath** (a channelled cone with burning, on the ground and in the air) | The upper White Mountains (update 5) hold the dragons' old eyries |

Notes:
- The **existing three** map across: `human` stays, `dragon` becomes Dragonkin,
  `demon` stays. Old saves keep their origin; the V ability becomes tier 1 of
  the new tree.
- The **V key** fires the highest-tier active ability you've chosen to slot;
  the tree's active abilities also go on the moves bar like class skills.
- **Origin and NPCs:** a few lines per origin in each region (the elves greet
  an elf in their tongue; dwarves haggle less with a dwarf; Crown guards eye a
  demon; sailors ask a dragonkin to keep the fire off the canvas). Prices move
  a few percent where your people are liked or feared.

## 4. The Legendary Hero discipline

- A new family in the Skills screen, **Legacy**, with one discipline: the
  **Legendary Hero**, levels 1 to 5, one tier of your origin tree per level.
- It **can't be bought with XP**. It grows from **Renown**, earned from deeds:

| Deed | Renown |
|---|---|
| A main-story chapter finished | 3 |
| A named boss (Grukk, Gorrak, Rook Calloway, the Warden...) | 2 |
| A great sea monster, a dragon, a legendary beast | 2 |
| A region discovered for the first time | 1 |
| A first landfall, a relit lighthouse, a regatta won | 1 |
| A guild rank-up | 1 |

- Levels at 5, 15, 30, 50 and 80 Renown. With today's content a player
  reaches about level 3; each new region adds the deeds that lead to 4 and 5.
- The Skills screen shows Renown, what earned it, and what the next tier does.

## 5. Flight (dragonkin)

| Tier | What you can do | Energy |
|---|---|---|
| Glide | Hold jump while falling: you glide, steering with the camera, losing height slowly | Drains while gliding |
| Wing Burst | Press jump in a glide: a flap that climbs 6 m (three in a row at most) | 20 per flap |
| True Flight | Hold jump to keep flapping: climb, hover, fly | Drains steadily; regenerates on the ground |
| Dragon's Descent | Attack while flying: a dive onto the target, an area hit on landing | 30 |
| Fire Breath | A channelled cone, 9 m, burning; works on the ground and in the air | Drains while held |

- **Draconic Energy** is a new meter (gold, beside stamina) for dragonkin only.
- **Rules:** no flight in dungeons, interiors or the Gravewood's curse; a
  ceiling of 120 m above the ground (storms force you lower); landing fast
  rolls you; flying into a wall stops you.
- **Physics:** the player's kinematic controller moves in 3D while flying; a
  forward speed builds lift in a glide; the camera pulls back and follows the
  pitch.
- **Look:** wings unfold from the back bones (a procedural mesh, two bones
  per wing), flapping with the beat; wind streaks at speed.
- **Exploits to close:** flying over a city wall into a locked area (gate
  cities have a ceiling volume); flying to the far islands (the sea's storm
  cells and a long-range energy limit make it a gamble, not a shortcut);
  skipping a dungeon by flying to its exit (dungeons are separate realms).

## 6. Other big abilities (how they work)

- **Transformations** (Demon Form, Primal Rage): the player model scales up
  (or grows claws), gets a tint or an emissive aura, and its action set swaps
  to a form moveset for the duration (new `combat/actions.ts` entries).
- **Invisibility** (Moonveil): enemies' perception (`Bandit.alerted` and the
  other AIs) ignores the player and forgets the last-seen position.
- **Blink** (Grace of the Ancients): a short teleport along the dodge
  direction, checked against the physics world so you can't blink through walls.
- **Fear** (Savage Howl): nearby enemies switch to a flee state for 4 s.
- **Summons** (Pack Call): two spirit wolves (the existing wolf AI as allies).
- **Stone skin** (Heart of the Mountain): damage set to zero; a grey material
  over the player; a sound like grinding rock.

## 7. The character creator

Replaces the three buttons on the title screen.

1. **Origin**: the six, with a one-line summary and their passives.
2. **Body**: two bodies; height within the origin's range; build (slim,
   average, broad) by bone scaling.
3. **Face and hair**: the six hair styles (and beards); hair colour; skin
   tone from the origin's palette; eye colour (glowing for demon and dragonkin).
4. **Origin details**: ears (elf, beastfolk), horns (demon: four, dragonkin:
   three), tail, fur markings, scale patterns.
5. **Name**: typed, with a random button.

The preview uses `charPreview.ts` on a turntable. The look is saved and used
everywhere the player model is built.

## 8. Architecture

| Module | Job |
|---|---|
| `src/origins/data.ts` | The six origins: passives, the tree nodes, looks (palettes, height ranges, parts) |
| `src/origins/legacy.ts` | Renown, Legendary Hero levels, which tiers are open; hooks into quests, bosses and discoveries via `events` |
| `src/origins/abilities.ts` | Every origin ability (cooldowns, costs, effects); `useOriginAbility` moves here from `player.ts` |
| `src/origins/flight.ts` | Glide, flap, fly, dive; Draconic Energy; the flight camera mode |
| `src/origins/forms.ts` | Transformations: scale, materials, moveset swap, timers |
| `src/npc/charParts.ts` | Procedural parts bound to bones: ears, horns, tails, wings, fur and scale decals; bone-scale builds |
| `src/ui/creator.ts` | The character creator |
| Save | `origin` widened; `look` (the creator's choices); `renown` and `legacy`; a migration for old saves |

## 9. Assets

The Quaternius kit has no ears, horns, tails or wings, so they're
**procedural meshes** in the painted style (like the armour parts), bound to
head, hip and spine bones. Fur markings and scales are decals on the skin
texture. No new downloads are needed; if better CC0 parts turn up on the
Drawcall Market they can replace these later.

## 10. Roadmap (each phase is playable on its own)

| Phase | What's in it | Done when (tests) |
|---|---|---|
| O1 | Origin data for all six; passives working; old saves migrate; NPC lines and price nudges | A new save can be any origin; each passive changes its number (XP, poise, regen...); a v6 save with `dragon` loads as Dragonkin |
| O2 | The character creator and the procedural parts; the look saved and rebuilt on load | Every combination builds without errors; the look survives a reload; parts follow the head and hips in the idle and run clips |
| O3 | The Legacy family, Renown from deeds, tiers 1 to 3 of every tree | Killing a named boss grants Renown; level 2 opens tier 2; every tier-1 to tier-3 ability fires and costs what it says |
| O4 | Flight (all five dragonkin tiers) and the flight camera | Glide distance from a height; a flap climbs; energy drains and regenerates; no flight in dungeons; landing fast rolls |
| O5 | Tiers 4 and 5 of every tree (forms, stone skin, Grace, Legend Awakened, Fire Breath) | Each capstone fires, lasts its time and ends cleanly; Demon Form swaps the moveset and swaps it back |

## 11. Decisions for Malachi (with defaults)

1. **Can you change origin later?** Default: no; it's who you are. (A late
   secret could let a human "awaken" as something else.)
2. **Beastfolk: one people or several?** Default: one people with wolf or cat
   features as a creator choice.
3. **Dragonkin wings: always visible, or only when gliding?** Default: folded
   on the back, always visible.
4. **Homelands before their regions exist:** default: the elf and dwarf
   homeland quests start in updates 4 and 5; until then their NPC lines and
   the envoys in the Royal Capital react to you.
5. **Renown thresholds:** default 5 / 15 / 30 / 50 / 80, tuned once updates 4
   and 5 add their deeds.
