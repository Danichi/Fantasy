# Field bosses (world life, phase 3)

Named beasts that keep a territory somewhere in Cresha. Code: `src/bosses/`.

## What every field boss shares (`fieldBosses.ts`)

- **Territory and hours.** Each boss has a home (centre and radius) and only
  appears there at its own times (Greyjaw at night). It spawns when you come
  within about 160 m of its ground and leaves when you go, unless it is
  fighting you.
- **Lair.** A clearing in the trees and a few telling props (`lairs.ts`),
  built once when you first come near.
- **Being found.** Townsfolk tell its rumour ("Heard any news?"); hearing it,
  or taking its bounty, marks it on the world map with a question mark. Seeing
  it (within 45 m) names it on screen and marks it properly.
- **The fight.** A boss bar while it is engaged, two or three phases at set
  health, signature attacks with clear tells, and a line of text at each phase.
- **Leash.** Run far enough (past its radius + 60 m) and it gives up, goes
  home and heals to full.
- **Rewards.** First kill: a unique item, Renown (a deed) and a line. Later
  kills: gold and a trophy. It is replaced 7 game days after it dies.
- **Bounties.** The Adventurer's Guild board has a Bounties section (wanted
  posters). A bounty counts as one of your four contracts and pays out when
  the boss dies.
- **Lore hook.** The bosses are bigger and meaner than nature because the Dark
  is leaking through as its ruler dies (`lore-dark-dimension.md`). Some show
  it when hard pressed (a violet eye, a smouldering coat).

## The roster

| Boss | Where | Status |
|---|---|---|
| Old Greyjaw | North-west pines above Elder Glen (-370, -210), at night | built |
| The White Stag | Deep woods west of the Glen (-300, -20), dawn and dusk, about one day in two; a hunt | built |
| Brine-Maw | Gull Ridge coast, at low tide; a giant shore crab | planned |
| Mother Ooze | River marsh below the mill; splits, swallows | planned |
| The Hollow Thane | Barrow downs on the Crown Road, at night; raises skeletons | planned |
| The Rust Knight | Old battlefield on the Crown fields; the armour of a lost champion | planned |
| Snaggletooth | Goblin warren in the hills, on a war-boar | planned |
| Varga One-Eye | Orc marches, with her warband | planned |

## Old Greyjaw

A dire wolf about 1.9x a grey wolf, old, scarred, one eye milky. Hunts at
night with three grey wolves (they bite one at a time). Model:
`creatures/wolf/greyjaw.ts` (the grey wolf's rig, re-sculpted). Fight:
`bosses/greyjaw.ts`.

- Notices you, stops, howls; the pack fans out.
- **Bite:** a snarl (the tell), then a lunge. Parry it and he reels.
- **Pounce:** he sinks onto his haunches growling (a longer tell), then leaps
  at where you stand. Not parryable; get out from under it. A miss leaves him
  stumbling.
- **Phase 2 (55%):** howls, two more wolves come; his eye turns violet; he
  bites twice.
- **Phase 3 (25%):** howls again; his coat smoulders (the Dark); faster.
- Dies: the pack scatters. Drops Greyjaw's Fang (trinket: +8% damage, +20%
  stamina regen, +15 health).

## The White Stag

A great white red-deer stag with a crown of antlers (`creatures/stag/`), not
a fight but a hunt (`bosses/whiteStag.ts`). It can't be hurt.

- It grazes and wanders; it hears a horse or a sprinting step from far off
  (45 to 55 m), a walker from 26 m, and someone creeping behind a raised guard
  only at 12 m. Heard, it lifts its head, then bolts.
- It leaves shining hoofprints that fade over a couple of minutes: follow them.
- Each chase spends its strength (the bar shows it); left alone it slowly
  recovers. Run it out and it turns at bay, crown lowered.
- At bay it paws the ground (the tell) and charges. Block it, parry it or step
  aside, twice, and it yields: head bowed. Lay your hand on it.
- It leaves its shed antler (White Stag Antler, a tier 5 material), Stag's
  Grace (20 minutes: +10% move speed, +30% stamina regeneration) and 3 Renown,
  then fades into the trees. It comes back a week later, on its own days.
