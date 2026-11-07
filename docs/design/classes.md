# The classes update

Bigger classes that do more. Code: `src/paths/` (rules), `src/ui/skills.ts`
(the Skills screen). Builds on `combat-paths.md`.

## Level 50

Combat and magic classes now go to **level 50** (`CLASS_MAX_LEVEL`, `capOf()`
in `paths.ts`). Callings and legacy disciplines stay at 30.

## A second class

Beside your active combat class you can set one **second class** (Skills
screen, a learned combat class's panel: "Make it my second class"). Its tree
nodes count at **half strength** and its techniques work from the bar, but
recharge **25% slower**. Making a class active clears it as your second. The
second class shows a "Second" badge in the class list and the Class Atlas.

## Ascensions (`ascensions.ts`)

At **level 30** each built class (Gale, Cross, Boundary, Warbreaker,
Dawnblade, Oathbreaker, Pyromancer, Windcaller, Lightbinder, Cryomancer,
Shadowcaller, Voidwalker) chooses one of **two Ascensions**. Each has four
nodes past the tree:

| Node | Opens at | Cost (tree points) |
| --- | --- | --- |
| 1 | 30 | 3 |
| 2 | 35 | 3 |
| 3 | 40 | 4 |
| 4 | 45 | 5 |

Nodes are real effects: combat modifiers, plus runtime keys (heal on kill,
stamina on crit, damage at low health, faster recharge, faster resource gain,
school damage). A respec clears the Ascension.

Examples: Gale's **Tempest** (speed, Flow, cheap dodges) or **Still Blade**
(crits, parries, finishing blows); Warbreaker's **Juggernaut** or
**Berserker**; Cryomancer's **Glacial** or **Frostward**.

## Field abilities (`fieldAbilities.ts`)

Things a class lets you do outside a fight, shown in its panel:

- **Gale: Wind Step.** Jump again in mid-air.
- **Windcaller: Glide.** Hold Jump while falling to drift down slowly.
- **Lightbinder: Lantern Soul.** A soft light follows you at night,
  underground and in the Dark.

## The later classes' mechanics (`classes/kits.ts`)

Their techniques are built by the skill forge (`classes/forge.ts`); what
makes each play differently is its own mechanic, with every passive in their
trees written to feed it (`classes/kits.passives.ts`).

- **Dawnblade: Sunfire.** While Dawnblade is your style (or second), every
  blade hit carries holy fire (10% of the blow, 20% more by day) and builds
  Radiance: 5, or 10 on a branded enemy. At full Radiance the next blade hit
  releases **Sunfire**: a 3.5 m blast for 150% weapon damage that brands
  everything it hits. Its trees add range, a stun, a heal, a ward, a burst of
  speed and day-time power.
- **Cryomancer: Chill.** Frost hits chill (up to 5 stacks, 6 s); each stack
  makes frost hit 4% harder. At 5 the enemy **freezes** for 2 s (1 s for
  bosses). The next hit **shatters** it: 60% more damage and 40% of it onto
  everything within 2.5 m. A blade breaks the ice too. An enemy can freeze
  again 6 s later.
- **Shadowcaller: Curses and souls.** Shadow hits **curse** for 6 s: the
  cursed take 10% more damage from you. A cursed enemy that dies gives you its
  **soul** (up to 10, shown as pips). Each soul is 2% spell damage; they slip
  away one at a time out of a fight. **Soul Storm** spends them all (8% spell
  damage each while it flies); while **The Reaper Walks** each soul counts
  twice.
- **Voidwalker: Entropy.** Void hits build Entropy (8 a hit, up to 100), each
  point 0.1% spell damage. At 100 the next void hit **collapses**: everything
  within 5 m is dragged in and crushed, and Entropy empties.

## The Class Atlas

A tab on the Skills screen listing every class by tier: **Foundation**
(taught by mentors in the towns), **Advanced** (a foundation class at the
right level, then a master) and **Hidden** (behind a capstone gateway, a
secret or the story). Classes you haven't found show as "???" with their
flavour line and a hint of where they come from. Click a known class to open
its tree.

## Saves

Paths save version 4: the second class and each class's Ascension (choice
and nodes learned).

## Still to come

The wider plan (more classes and many more callings) is in the chat plan this
update started from: new foundation classes, more hidden classes, and the
37 callings. This update builds the framework they will use.
