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
| The White Stag | Deep woods, rare, dawn and dusk; a tracking hunt, not a fight | planned |
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
