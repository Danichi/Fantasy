# Merge notes: Update 1, Origins and the Legendary Hero (feat/origins)

Plan: [../origins.md](../origins.md). Every phase (O1 to O5) is built.

## What was built

- **Six origins** (`src/origins/data.ts`): human, elf, dwarf, beastfolk, demon,
  dragonkin, each with passives, an innate V ability (the old three V abilities
  live on as the human, demon and dragonkin birthrights), a five-tier legendary
  tree, a homeland line, a creator palette (heights, skins, hair, eyes, ears,
  horns, tail, markings, wings, builds, bone proportions), NPC first lines by
  faction and price nudges.
- **Passives** (`src/origins/origins.ts`, every step after the skill runtime):
  Heroic Adaptation (+15% of kill, discovery and quest XP; +1 tree point in each
  combat class per 5 character levels), Second Wind, Arcane Affinity, Sylvan
  Step, Keen Sight and Deep Sense glints, Stoneblood poise, Feral Senses markers
  and night sight, Swift Paws, Pounce (sprint attack -> a leap), Demonic
  Regeneration, Darkvision, Infernal Affinity and dragonkin fire resistance,
  Draconic Physique, Dragon Senses (lock-on range).
- **The character creator** (`src/ui/creator.ts`, `creator.css`): replaces the three
  origin buttons. A new game's "click to begin" opens it: origin, frame, height,
  build, hair, beard, hair/skin/eye colours, ears, horns, tail, markings, wings
  folded/spread preview, name (typed or random). The hero turns on a turntable in
  its own small WebGL renderer (closed and disposed on Begin). Begin rebuilds the
  player from the look.
- **Procedural parts and builds** (`src/npc/charParts.ts`): elf ears, wolf/cat ears,
  four demon and three dragonkin horn styles, tails (demon spade, wolf brush, cat,
  dragon with a plate ridge), two-bone dragon wings with a membrane rebuilt as they
  spread and flap, dragon scale patches and beast fur tufts; glowing/tinted eyes.
  Parts sit on sockets parented to Head, pelvis and spine_03, so they follow every
  clip (screenshots read in idle, run and attack). Builds and peoples are bone
  scales (uniform chest with inverse on neck and collarbones; legs/arms along the
  bone), then the body is fitted back to the chosen height.
- **The look is saved and rebuilt**: `prepareHero` builds the saved hero at boot;
  `Player.rebuildBody()` swaps the body at runtime (gear moves over through
  `Equipment.rebind`).
- **Renown and the Legendary Hero** (`src/origins/legacy.ts`): deeds counted once by
  id from the `deed` event, named bosses' `enemyDied`, first `regionEntered`, and
  finished main-story quests. Levels at 5/15/30/50/80 Renown; the discipline level
  is written by Renown only (`Paths.setLevelFromRenown`, `canInvest` refuses).
- **The Legacy family in the Skills screen** (`src/origins/legacyUI.ts`, `legacy.css`):
  the Legendary Hero card (Renown, never an XP button) and its page: Renown meter,
  deeds, passives, birthright, the five tiers (open/locked, cost, cooldown), and
  buttons to put an active on V or on the moves bar ("origin:<id>" refs).
- **Every tier 1 to 5** (`src/origins/abilities.ts`, `forms.ts`, `flight.ts`):
  Rally, Hero's Resolve, Banner of Cresha, Unbroken, Legend Awakened; Moonveil,
  Starlight Volley (homing motes), Treeshape, Wind-Walker (air dash), Grace of the
  Ancients (dodge blinks with a damaging afterimage); Earthen Bulwark (a dome that
  stops shots from outside), Mountain's Wrath, Runeheart, Delver's Endurance, Heart
  of the Mountain (stone skin); Hunter's Mark, Savage Howl (enemies flee), Pack Call
  (two spirit wolves), Bloodscent, Primal Rage (claws, speed, lifesteal); Hellstep,
  Blood Awakening, Demonic Hide, Brimstone Aura, Demon Form (2.4 m, fire aura, a
  heavy moveset); Glide, Wing Burst, True Flight, Dragon's Descent, Fire Breath.
- **Flight** (`src/origins/flight.ts`): glide, flap (3 in a row), true flight
  (WASD + camera pitch), dive attack, Draconic Energy (gold bar under stamina),
  ceiling 120 m (40 in a storm), landing fast rolls, the camera pulls back, the body
  leans, wind streaks. No flight in dungeons/interiors, in the Gravewood's curse or
  over the capital's walls.

## Shared files touched (all small, marked)

- `src/main.ts`: imports; `prepareHero` before `player.init`; one `wireOrigins(...)`
  block after `quests.fromJSON`; the creator after `buildOverlays`; `origins.update`
  after `skillRt.update`; `origins.frame` before `r.followShadow`; `origins, creator`
  on `__game`; `resetForTest` wrapped to also reset the origins and the body.
- `src/player/player.ts`: `char` no longer readonly; hooks `look`, `lookHeight`,
  `shapeBody`, `flight`, `flying`, `originAbility`, `remapAction`, `poiseMul`,
  `poiseFlat`, `staggerImmune`, `fireResist`, `lockRange`, `veiled`;
  `rebuildBody()`; init loads `this.look`; the dragon glide block became
  `this.flight?.(...)`; `startAction` remaps ids; lock-on uses `lockRange`; `move()`
  skips walking damping and gravity while `flying`; fire damage and burning scale
  by `fireResist`; staggers check `staggerImmune` and poise mul/flat; the demon
  regen line and the old `useOriginAbility` body (now `originAbility?.()`) removed.
- `src/items/equipment.ts`: `rebind(char, rig)`.
- `src/progression/progression.ts`: `Origin` widened, `normalizeOrigin`, `look` and
  `legacy` on `Progression`.
- `src/save.ts`: optional `look` and `legacy`; `applySave` normalises the origin
  ('dragon' -> 'dragonkin') and defaults the look. No version bump needed.
- `src/paths/data.ts`: `Family` + 'legacy', the Legacy family, the `legendaryHero`
  discipline. `src/paths/paths.ts`: `canInvest`/`canTeach` refuse legacy,
  `setLevelFromRenown`, `bonusPoints` hook in `earned`. `src/paths/effects.ts`:
  a `legacy` entry in `MINORS` (the type requires it).
- `src/ui/skills.ts`: the Legacy card info and page hooks (4 small edits).
- `src/ui/inventory.ts`: the origin picker became a creator line; `api.creator` hook.
- One-line `deed` emits: `world/sea/sailing.ts` (first landfall, serpent, great
  beasts, Calloway, relit lighthouses), `world/sea/regatta.ts` (first win of each
  race), `dungeon/instance.ts` (Grukk), `guild/adventurerGuild.ts` (promotion).
  sailing.ts and regatta.ts gained an `events` import line.
- One-line awareness checks (`!ignoresPlayer(this)`, `src/origins/stealth.ts`):
  `enemies/beast.ts`, `bandit.ts`, `slime.ts`, `orcMob.ts`.

## Keys

None new. V (origin ability, Fire Breath held), C (jump: hold to glide/fly, press
again to flap), attack in the air to dive. Origin actives can go on the moves bar.

## Save fields

`look?: Partial<OriginLook>`, `legacy?: { renown, deeds, slot }` (top level), and
`prog.origin` now holds the six ids.

## Ids

Defined: origins `human | elf | dwarf | beastfolk | demon | dragonkin`; discipline
`legendaryHero` (family `legacy`); deed ids `boss:grukk`, `boss:gorrak`,
`boss:morwen`, `boss:calloway`, `beast:<seaBeast>`, `landfall:<port>`,
`lighthouse:<port>`, `regatta:<course>`, `guild:<rank>`, `region:<id>`,
`chapter:<questId>`; action ids `demonSlash1/2`, `demonSlam`, `demonHeavy`,
`clawSwipe1/2/3`, `pounce` (registered into `ACTIONS` from `origins/forms.ts`).
Referenced: boss kinds `grukk`, `captainVess`, `tideWarden`, `blightedElder`,
`templeGuardian`, `vathrax`, `forgeWyrm`, `engineWarden` (and `deed` events from
the other updates, deduplicated by id).

## Seams to finish after the merge

- Forgemaster (`origins.perks.forgemaster` = 0.15 for dwarves) and Runeheart
  (`perks.runeheart`) wait for crafting and runes (feat/arms). Runeheart gives 10%
  less damage until then. `perks.poisonImmune` waits for a poison affliction.
- Moonveil/Savage Howl are checked by the beast, bandit, slime and orc-mob AIs;
  undead, the warlord, sand creatures and later bosses don't check `ignoresPlayer`
  yet (one line each).
- Rally buffs you; crew and allies have no hook yet. Pack Call wolves are their own
  light ally AI, not the wolf AI.
- Homeland quests (elves, dwarves) belong to updates 4 and 5; the NPC lines and
  prices are faction-keyed so they work there once those factions' regions exist.
- Primal Rage needs a main weapon equipped (claws reuse the main-hand attack path).
- The creator's preview uses a second WebGL context while open (disposed on Begin).
- Infernal Affinity reduces fire (attacks with `burn`); there is no shadow damage
  type to reduce yet.

## Known issues

- Equipment's `limb('Head')` finds no head-top bone on the built hero (helmets never
  fit through it); the origin parts use their own sockets. Not changed here.
- In TEST_MODE the HUD shows behind the creator (the title overlay is skipped).
