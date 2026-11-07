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

## The roster (`paths/roster/`)

Every class the classes update adds is one spec (`roster/types.ts`): its
resource and what builds it, what a full resource releases, the mark it lays
on enemies, its field ability, its trial, its tree, techniques and
Ascensions. `roster/gen.ts` writes every passive from the class's own
mechanic, so a node always names what it changes ("Tension builds 20%
faster", "Each Quarry stack makes enemies take 3% more damage from you").
`roster/engine.ts` runs every roster class that is in play (a combat class
while it is your active or second class; a magic class once learned).

What a mechanic can be made of:

- **Builds from:** blows with the class's weapon, heavy blows, critical
  blows, blows in mid-air or from behind, arrows and bolts, the class's own
  techniques landing or being used, kills, perfect dodges, parries, blocks,
  blows you take, or on its own over time.
- **Gives:** a bonus that grows with how full it is.
- **Releases at full:** a blast, a buff, a heal, a volley of shots, chain
  lightning, summoned allies or an execution (on the next blow, shot or
  technique, or at once).
- **Marks:** stacks on enemies that make them take more damage from you, and
  at the last stack burst, stun, root, bleed or execute.
- **Also:** bonuses at low health, techniques paid for in health
  (Bloodmage, Hellborn), and kills that raise allies (Necromancer, Seawitch,
  Beastmaster).

Techniques are built by the skill forge, which gained traps, leaps and
grabs; marks, roots, chill, curses and venom; and techniques that feed or
spend the class resource.

### Foundation classes (taught in towns, after a trial)

| Class | Weapon or element | Resource and release | Mentor |
| --- | --- | --- | --- |
| Ranger | Bow | Tension, Hail of Arrows; Quarry roots | Lyssa Fen, Elder Glen |
| Lancer | Spear | Momentum, Skewer; Pinned stuns | Ser Gawen Ashby, the capital |
| Brawler | Bare fists | Combo (pips), Haymaker | Bess Harrow, Port Aurelle |
| Rogue | Dagger | Edge, Coup de Grace; Poison bleeds | Dice Coveley, Port Aurelle |
| Woodsman | Axe | Swing, Timber; Notch bleeds | Old Garth, Millbrook |
| Earthshaper | Stone | Stone, Upheaval; Tremor stuns | Bruni Stonevein, Port Aurelle |
| Tidecaller | Water | Tide (rises on its own), High Tide; Soaked roots | Mira Vane, Port Aurelle |
| Druid | Nature | Bloom, Spirit Beasts; Thorns bleed | Envoy Lirael, the capital |

Trials: land arrows with a bow, blows with a spear, bare-handed blows, blows
from behind with a dagger, heavy axe blows, defeat enemies, catch fish, and
gather herbs. A Brawler (or anyone on the Brawler's trial) can fight with
bare fists, which hit harder as the class levels.

### Advanced classes (a foundation class at level 10, and a master)

Arbalest (Ranger; Garrot), Dragoon (Lancer; Captain Mara Thorne), Monk
(Brawler; Brother Aldo), Assassin (Rogue; Slick Marlo), Berserker (Woodsman;
Ragna Ironsides), Templar (Boundary; High Priestess Seraphine), Stormcaller
(Windcaller; Archmage Venn), Ironshaper (Earthshaper; Thrain Ironbrow),
Necromancer (Shadowcaller; Archivist Mell), Shapeshifter (Druid; Old
Wendel), Bloodmage (Shadowcaller; Lady Corvina), Seawitch (Tidecaller; Old
Nell).

### Hybrid classes (two classes at level 15)

Spellblade (Gale + Pyromancer), Paladin (Boundary + Lightbinder), Battlemage
(Boundary + Earthshaper), Arcane Archer (Ranger + Windcaller), Beastmaster
(Ranger + Druid), Hexblade (Rogue + Shadowcaller), Runeknight (Warbreaker +
Runecraft), Grenadier (Rogue + Herbalism), Stormlancer (Lancer +
Stormcaller), Tidewarden (Lancer + Tidecaller).

### Hidden classes (hidden teachers)

The fifteen gateway classes (Stormdancer, Moonblade, Sword Saint, Reaver,
Nightblade, Bladedancer, Stillmind, Ironwall, Shieldwarden, Lifewarden,
Inquisitor, Lightweaver, Sunbreaker, Ashwalker, Phoenix) now each have a
mechanic and a teacher waiting at a shrine in the world
(`world/hiddenTeachers.ts`). Opening a gateway capstone no longer teaches the
class: it shows where the teacher is and marks them on the world map.
Oathbreaker (Boundary at 15; the Fallen Knight in the Gravewood) and
Voidwalker (Shadowcaller at 15; the Starless Man by the Sunwheel Stones) can
now be learned too.

### Origin classes (your people's blood)

Dragonheart (dragonkin), Hellborn (demons), Wildheart (beastfolk), Runebound
(dwarves) and Elderwood (elves). Only someone born to that people can learn
one, and it wakes on its own at Legendary Hero level 2.

### Field abilities added

Pathfinder, Woodland Stride, Forest Walk and others (faster when nothing
hostile is near), Pole Vault, Sky Vault, Cloud Step and Cloud Dancer (air
jump), Featherfall and Phoenix Wings (glide), Holy Lantern and
Lantern of Faith (a light in the dark), Tideborn, Sea-Born and Trident
Swimmer (swim 60% faster), Light Fingers and Ghost Hands (easier
lockpicking), Iron Knuckles, Stone Fist, Lockbreaker, Stone Shoulder and Rune
Fist (break locks without a heavy weapon).

## Still to come

The callings plan (37 callings) is not built yet. Techniques are still made
by the skill forge from archetypes rather than each animated by hand.
