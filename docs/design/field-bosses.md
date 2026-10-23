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
| Brine-Maw | The cove north of Gull Ridge (2182, -156), at low tide (3:00 to 6:30 and 15:00 to 18:30) | built |
| Mother Ooze | The mire below the mill (215, 140), always | built |
| The Hollow Thane | The Barrow of the Old Kings on the Crown Road, at night | built |
| The Rust Knight | Old battlefield off the Crown Road past Kingsmile (about -2383, -854), always; the armour of a lost champion | built |
| Snaggletooth | The goblin warren in the south hills (70, -410), from sundown (17:00 to 3:00), on a war-boar | built |
| Varga One-Eye | A raid camp off the Crown Road between the cottage and Gorrak's warcamp, at night (19:00 to 5:00), with her warband | built |

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

## Brine-Maw

A shore crab as big as a cart (`creatures/crab/`, drawn at 3x), barnacled
and weed-hung, with a massive crusher claw on the right held up like a shield
and a long cutter on the left. Fight: `bosses/brineMaw.ts`. Lair: a beached
wreck in its cove.

- **Guard:** blows to its front glance off the crusher (15% damage, 35% in
  the last phase). It turns to face you, but slowly: get round its side.
- **Snap:** the cutter opens wide (the tell), then thrusts and shuts.
  Parryable: a parry leaves it reeling with its guard down.
- **Sweep:** the crusher draws back (the tell), then sweeps its whole front.
  Not parryable: block it or move.
- **Rear and slam:** it rears up, both claws high, the pale underside showing.
  Hits there do double, and 60 poise of blows tips it onto its back (2.5x
  damage while it flails). Then it slams both claws down around its front.
- **Phase 2 (55%):** it froths a cone of clinging foam (slows you, like web).
- **Phase 3 (25%):** its shell cracks and something violet shows underneath
  (the Dark); faster, and its guard weakens.
- Drops the Brine-Maw Shell (a shield: block 120, stability 0.7, poise 8).

## Mother Ooze

A heap of translucent green jelly as big as a haycart (`creatures/ooze/`: a
wobbling shader blob, not a sculpt), with what she has eaten turning slowly
inside her: a ribcage, a skull, a knight's helm and his sword. Fight:
`bosses/motherOoze.ts`. Lair: a mire of black pools, reeds and drowned stumps.

- **Leap:** she squashes down, quivering (the tell), then jumps at you and
  splats. Not parryable. She lies flattened for a moment after.
- **Surge:** her front bulges (the tell), then she lurches forward over you.
  Caught, you're stuck (web) and burning (poison): roll to tear free.
- **Split:** a heavy blow knocks a lump loose (up to six). The lumps hop at
  you, but if she's hurt they crawl back into her and she heals 3% each.
- **Spit (phase 2+):** lobbed globs of acid that leave burning puddles.
- She shrinks as she's worn down. **Phase 3:** a violet heart shows in her.
- Drops The Drowned Knight's Sword (damage 30, bleed 6, pierce 15%).

## The Hollow Thane

A barrow wight (`creatures/wight/`): tall, starved and floating, in a rotted
robe and a faded red mantle, ribs showing, a skull of a face with cold light
in the sockets, long white hair, a crown of green bronze and a bronze
leaf-blade. Fight: `bosses/hollowThane.ts`. It comes out of the barrow door
at night (21:00 to 5:00).

- **The ward:** a pale shimmer round it; blows do 10% while it's up.
- **Raising:** arms high, a long channel, then skeletons claw out of the earth
  round you. The ward is down while it calls (hits do 150%), and enough damage
  breaks the calling off.
- **Cold breath:** leans in, jaw wide (the tell), then a cone of grave-cold
  that chills and slows. After it, it's spent and open.
- **The sword:** drawn back high (the tell), a long cut. Parry it: it reels, open.
- **Fade:** into mist, and out of it behind you.
- **Phase 3:** its eyes go violet, and it speaks: "Another one. The fifth.
  They always send another." (A lore hint: the player is the fifth summon.)
- Drops the Hollow Thane's Crown (trinket: +30 mana, +25% mana regen, +5%
  damage, +6 poise).

## The Rust Knight

The rusty gothic suit the Living Armour uses (`enemies/armourKit.ts`), half
again as big (about 2.75 m), rusted red-brown, moss on the shoulders and
shield, a greatsword and a kite shield whose painted star has nearly gone.
Fight: `bosses/rustKnight.ts`. It stands bowed over its sword, point planted
in the earth, in the middle of a battlefield (lair `battlefield`: cairns,
blades and spears still in the ground, faded banners, helms, bones, a broken
cart wheel). Come within 20 m and it lifts its head and draws the sword.

- **The shield:** blows into its front do 10%. Three blows into the shield (a
  heavy blow counts as two) break its guard: it staggers for about 2 s and
  takes 150%.
- **Sweeps:** drawn far back to the side (the tell), then two wide sweeps
  (three later). They can't be parried: block or get clear.
- **Overhead:** raised high (the tell), a cut straight down. Parry it and its
  guard is broken.
- **Slam:** both hands high, down into the earth: a ring of force 4.5 m round
  the blade that knocks you flat.
- **Charge:** at range, behind the shield.
- **Phase 2** (55%): tears off the shield and throws it away; faster, no guard.
- **Phase 3** (25%): the light in it goes violet, and a few seconds later the
  man inside speaks: "Run. While you still can. It was in me before I knew."
- **Lore:** it was one of the champions summoned before the player. It drops
  the Dented Signet (trinket: +14 poise, +30 health, +5% damage), with a
  five-pointed star that matches its shield, and A Torn Journal Page (the
  second summon's notes: who called them, the armour that fits too well,
  something breathing in the iron, "Do not trust the voice that brought you").

## Snaggletooth

A hand-built goblin chief (`creatures/goblin/`): about 1.5 m, a big head on a
scrawny neck, long ears out sideways (the left one torn), a heavy brow over
yellow eyes, a long hooked nose, an underbite with one great yellow fang up
past his lip, a pot belly, long arms, short bowed legs on long flat feet,
olive mottled skin. A fur mantle, a belt and loincloth, leather bracers and
shin wraps, a crown of teeth, a notched cleaver, and a tusk horn at his belt.
He rides the hand-built boar (`creatures/boar/`) at 1.65x, in barding: an
iron face plate with a spike, iron tusk caps, a chest plate, studded leather
skirts curved over its flanks with a row of iron scales, a hide saddle and a
trophy pole with a rag banner and a skull. Fight: `bosses/snaggletooth.ts`.
His warren (lair `warren`): a burrow mound with a timbered mouth and a boar
skull over the door, sharpened stakes, a skull totem, a cookfire with a spit,
hide lean-tos, bones.

- **Mounted:** the boar paws (the tell) and charges. Parry the tusks and it
  tumbles, dazed (hits do 150%); sidestep and it overruns; into a tree and it
  stuns itself. Close in it hooks, and Snaggletooth cuts down from the saddle.
- **Barding:** half damage from the front; the flanks and rump are leather.
- **Thrown:** when the boar dies he flies over its head, gets up groggy, and
  blows his horn: four goblins come running from the warren.
- **On foot:** weaves in; three quick cuts (each can be parried: he reels,
  open); a crouch (the tell) then a leaping chop; skips back out of reach.
- **Phase 3** (half his own strength): cracks a vial of something violet on
  his tooth and drinks it (the Dark, sold to a goblin). Violet eyes, violet
  motes, faster cuts, four in a combo, and he horns up three more goblins.
- Drops Snaggletooth's Horn (trinket: +30 stamina, +25% stamina regen, +4%
  damage). Later kills: War-Boar Tusks (a tier 2 crafting material).

## Varga One-Eye

The orc warlord fighter (`enemies/orc.ts`, the mocap orc boss) on the Orc
Warrior model at 1.4x, dressed as a warband captain: a leather patch over her
left eye, a long black braid, and a red war-banner with one painted eye on
her back. Fight: `bosses/varga.ts`. Her raid camp (lair `raidCamp`) is off the
Crown Road: a looted wagon on its side, roped wool bales and grain sacks, a
fire with bedrolls and an ox's ribs, a weapon rack, her big one-eyed banner,
a trampled caravan pennant, and guards' helms on stakes.

- **The warband:** five orcs fight with her from the start.
- **Her moves:** cleaves, sweeps, combos, a kick, and a leaping slam when you
  keep your distance (no bow).
- **Blind side:** blows from her left, or from behind on that side, do 150%
  and stagger her sooner. The first one tells you so.
- **Phase 2** (60%): her war-horn; three more orcs come up the road.
- **Phase 3** (30%): she tears off the patch. Violet light burns where the
  eye was ("I gave the dark an eye for this. It gives back."). No blind side
  any more, and she's faster. Violet motes and a violet light on her.
- Drops Varga's Eye (trinket: +6% crit, +8% damage, +20 health), a violet
  glass eye. Later kills: steel ingots and gold.
- Run far enough and she lets you go; she is back in camp with a fresh band.

Also: Old Greyjaw now turns on whoever hurts him from up to 90 m (he used to
ignore a hit from beyond 45 m, so an arrow from range did nothing).

