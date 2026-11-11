# The Adventurer's Guild

The guild is the game's main source of side work, and a ladder to climb.
Code: `src/guild/` (rules), `src/world/guildHall.ts` (the building),
`src/world/interior.ts` (`guildHall()`, the inside), `src/quests/guildContracts.ts`
(contracts in the quest log).

## The Guild Hall

A two-storey hall on the east side of the Elder Glen plaza (the old notice
board and small guild house are gone). Stone ground floor, a jettied timber
upper floor, a slate roof with dormers, a bell tower with the guild banner,
a porch with benches and lanterns, and a trophy rack outside that fills up
with the heads of named beasts you have brought in. Windows and lanterns
glow at night.

Inside:

- **Ground floor.** The Quest Wall (under the gallery), the Registrar's
  counter (Registrar Odette Marsh, 7:00 to 22:00), a hearth and the common
  room, where the guild regulars drink.
- **Upstairs (the gallery).** The Hunt Map table, the Rank Ladder board and
  the Quartermaster's counter.

Port Aurelle's guildmaster and the Grand Hall in the Capital (the
grandmaster) open the same screens for their own halls.

## Halls and contracts (`contracts.ts`)

Each hall posts its own work, drawn fresh every dawn from its region:

| Hall | Region | Opens at |
| --- | --- | --- |
| Elder Glen Chapter | Elder Glen, Cresha | D |
| Port Aurelle Hall | Port Aurelle, Cresha | C |
| The Grand Hall | Royal Capital | B |

A notice has a named client, a kind, a place, a count, a difficulty in stars
(1 to 5) and a purse. Kinds: **hunt** (N of a family of creature), **clear**
(N of anything at a place), **gather** (bring N of an item), **explore** (reach
a place), **survey** (map N new parts of the land) and **deliver** (carry a
sealed parcel to someone in another town).

About one notice in four is **urgent** (red wax): it pays half again and comes
down after a day or two. Failing an urgent contract costs half its reputation.
Abandoning any contract costs a quarter.

## Ranks (`ranks.ts`)

D, C, B, A, S, SS, SSS. Reputation alone no longer promotes you: once you have
enough for the next rank, the Registrar sets you an **exam**.

| Rank | Rep | Exam | Contracts at once | Partner discount | Extra Marks |
| --- | --- | --- | --- | --- | --- |
| D | 0 | - | 2 | - | - |
| C | 150 | The Cull: 10 beasts in 2 days | 3 | 5% | - |
| B | 400 | One named beast or dungeon master | 4 | 8% | +1 |
| A | 900 | Two named kills | 4 | 10% | +2 |
| S | 1800 | Three named kills | 5 | 12% | +3 |
| SS | 3600 | Five named kills | 5 | 15% | +4 |
| SSS | 7500 | Eight named kills | 6 | 20% | +5 |

Promotion pays gold, records a deed, shows a ceremony card and resets the
board for the new rank. Your rank shows as a badge next to your level on the
HUD.

## Bounties and the Hunt Map

Field bosses and dungeon masters are posted as **Wanted** notices. Killing a
bounty's target no longer pays out on the spot: you take the **trophy** back
to a hall, which pays the bounty and adds the trophy to the rack outside.

The **Hunt Map** upstairs is the region map with a pin for every rare monster
and boss the guild knows about (from rumours, sightings and bounties), with a
list beside it.

## Marks and the Quartermaster

Every contract pays **Guild Marks** (2 per star, 3 more if urgent, plus your
rank's bonus). The Quartermaster upstairs sells kit for Marks, more of it as
your rank rises: potions, lockpicks, arrows and lanterns at D, greater potions
at C, knightly arms at B, a claymore, tower shield, ring and banner charm at
A, and masterwork blades (Moonlit Estoc, Frostbite Sabre, Emberbrand) at SS.

## The Rank Ladder

A board of the known adventurers and their ranks: Grandmaster Brannoc Steel
(SS), Wendeline Ashcombe (S), Ingrid Vale (B), Lyssa, Sif and Dagna (C) and
the rest at D. You appear among them at your own rank.

## Saves

Guild save version 2: Marks, trophies and each hall's board.
