# Boats, Sailing and Seamanship (design plan v0.3)

Status: a plan, with Malachi's decisions folded in (2026-10-03). The first
playable slice is built (see "Built so far" below). Numbers are starting points
to tune; names are placeholders. It follows the progression model in `combat-paths.md`
(XP invested in disciplines; Callings are real power) and the Grand Ocean phase
of the World Expansion plan (six ship types, sea encounters, ports, islands).

---

## Built so far (2026-10-03)

| Area | What works | Where |
|---|---|---|
| The sea | One Gerstner wave set shared by the shader and the physics (`waveAt`); ripples, subsurface glow on crests, fresnel sky, sun glitter, sunset path, whitecaps and wind streaks that grow with the wind, shore foam, storm tint | `src/world/sea/ocean.ts`, `seaState.ts` |
| Danger | Tiers 0 to 5 (Sheltered, Coastal, Open, Wild, Perilous, Abyssal) by distance from Port Aurelle and by region (Emerald Isles, Azure Isles, Shattered Isles, Sunken Isles, Demon Continent); waves, wind, storms, pirates and monsters scale with it | `seaState.ts` (`dangerAt`, `SEA_REGIONS`) |
| Storms | Drifting storm cells with storm swells (to about 11 m), veering gusts, rain and lightning; ships are kicked off course, drift downwind, broach, capsize, ship green water and lose crew overboard | `seaState.ts`, `ship.ts` |
| Ships | Skiff, Fishing Sloop, Cutter, Brigantine, Galleon: speed, hull, sails, how big a sea each can take, crew needed, cargo, guns; Seamanship level gates which you may command | `shipTypes.ts`, `ship.ts` |
| Sailing | Points of sail, trim (auto in assisted mode, Z/X by hand in full mode), reefing, anchor, rowing, heel, leeway, grounding; you walk the deck while she sails; the helm HUD | `ship.ts`, `sailing.ts`, `src/ui/sailingHud.ts` |
| Owning | Buy at the Aurelle Shipwrights (Master Hale Barrow), rent from Mira or Maud Reeve's river ferry, fetch home, sell; up to four ships; saved | `sailing.ts` |
| Upgrades | Sails, Hull, Keel, Guns, Harpoon, Pumps, Figurehead, Hold, each in tiers; top tiers need sea serpent scales; the hull caps what fits | `shipTypes.ts` (`UPGRADES`) |
| Crew | Sailors on the quay and a broker (Sal Rigby): roles (bosun, navigator, gunner, shipwright, lookout, harpooner, cook, deckhand), traits, wages, morale, XP; one-voyage hands for hire | `crew.ts`, `sailing.ts` |
| Damage and loss | Hull in three sections, canvas, water in the hold and pumps; a sunk ship is gone for good and leaves a wreck you can dive and search | `ship.ts`, `sailing.ts` |
| Combat | Broadsides on the side you face (with lead), harpoons that lay onto the nearest target near your aim; pirates hunt, trade broadsides, grapple and board, strike and can be plundered; sea serpents stalk, dive, ram and rear up to bite; sharks circle swimmers | `gunnery.ts`, `seaThreats.ts` |
| Swimming | Swim anywhere, dive (hold C), breath meter, drowning | `src/player/player.ts` |

Tests: `tests/sailing.spec.ts`.

---

## 0. Decided

| Question | Decision |
|---|---|
| Drowning | **Yes.** You can drown, and you can also **swim and dive** (a new system: §7). |
| Long voyages | **Every crossing is sailed.** No time-skip, no charted fast passage. Voyages are kept short enough and alive enough to be fun (§11). |
| A sunk ship | **Gone for good.** It cannot be raised. Its wreck stays on the seabed as a dive site where some cargo can be recovered (§8). |
| Default sailing mode | **Assisted** (*Steady Hands*) to start; the full model (*Seafarer*) is a toggle. |
| Naval combat | **Yes, against ships and sea monsters** (§9). |
| Storms | **Big waves throw boats about and push them off course** (§6). |
| Where sailing starts | Port Aurelle harbour with Dockmaster Mira (default; say if you'd rather start on the capital's river). |

---

## 1. What makes it fun (the pillars)

Every system below has to serve at least one of these. If a feature serves none,
it goes.

1. **The wind is a puzzle you can feel.** You never just press W. You read the
   wind, set the sail, pick an angle, and the boat answers: heeling, surging,
   hissing through the water. Good sailing is visibly faster than bad sailing.
2. **Skill shows.** A clean tack, a well-trimmed sail, a wave surfed down its
   face, a broadside timed on the roll: things the player does with their
   hands, not stats. Seamanship makes you better; it doesn't play for you.
3. **The sea is a place.** Every crossing is sailed, so the sea has to be worth
   being on: islands on the horizon, a lighthouse to steer by, dolphins at the
   bow, a storm wall building in the west, a fin cutting the water.
4. **Danger with consequences.** Storms, reefs, pirates and monsters can sink
   you, and a sunk ship is lost. So danger is always readable and avoidable: a
   smarter route, a reefed sail, a faster hull, a fight you chose not to take.
5. **A ship is a home you grow.** From a hired rowboat to your own named galleon
   with a crew who know your name, upgrades you chose, and a cabin with your
   trophies. Losing it should hurt, which is why it matters.

---

## 2. What exists today (build on it, don't duplicate it)

| Piece | Where | State |
|---|---|---|
| Ocean surface | `src/world/sea/ocean.ts` | Camera-following radial grid; Gerstner `WAVES` shared by the shader and the CPU (ready for buoyancy and storms) |
| Rowboat hire | `src/world/boats.ts` | Mira rents a rowboat at Fisherman's Wharf: WASD rowing, Shift pulls harder, fish from it, step ashore |
| Ship models | `src/world/cityKit.ts` `buildShip()` | Six types (fishing, sloop, merchant, galleon, naval, expedition), merged into a few draws each; static in Port Aurelle's harbour |
| Fishing | `src/world/fishing.ts` | Cast, bite, strike, reel with tension; fish by water type, hour and weather |
| Ports | Port Aurelle quays, piers, shipyard slipway, customs house; the Crown Quay on the capital's river | Static dressing, NPCs (Mira, Tallow, Nell, Old Maud Reeve) |
| Story hook | `dwarf-expedition` quest | Board the Iron Kettle on sailing day (currently ends at the signal) |
| Water level | `src/world/waterLevel.ts` | `waterSurfaceAt` / `waterDepth` for any point |
| Swimming | — | **None yet.** The player can't enter deep water. Built in phase S1. |

---

## 3. The core loop

```
 port ─► pick a boat, crew, cargo, a goal (fish, trade, explore, hunt, race)
   │
   ▼
 sail ─► read wind + waves ─► trim, steer, tack ─► XP for doing it well
   │            │
   │            ├─► events: dolphins, a wreck, a pirate sail, a storm front, a fin
   │            └─► discoveries: islands, coves, lighthouses, bottles with maps
   ▼
 arrive ─► sell, deliver, dive, fight, explore ashore ─► gold, items, reputation
   │
   ▼
 invest ─► Seamanship tree, ship upgrades, crew, a bigger hull ─► further, harder seas
```

---

## 4. The boats

One ladder from first oar to flagship. Each hull has its own feel, not just bigger numbers.

| Hull | Unlock | Crew | Feel | Speed (best reach) | Handling | Cargo | Draft | Seaworthy (waves) | Guns |
|---|---|---|---|---|---|---|---|---|---|
| Rowboat | hire (exists) | 0 | oars only, any direction | 2.5 m/s | very high | 2 | 0.3 m | calm only | 0 |
| Skiff (dinghy) | Seamanship 1 | 0 | one sail, tips if you're careless, pure skill | 6 m/s | very high | 4 | 0.5 m | under 1 m | 0 |
| Fishing sloop | Seamanship 5 | 1 | stable, a net winch, a live-well | 7 m/s | high | 12 | 1.0 m | under 2 m | 1 harpoon |
| Cutter | Seamanship 10 | 2 | fast and twitchy, a racer and a courier | 10 m/s | high | 10 | 1.4 m | under 3 m | 2 swivels, 1 harpoon |
| Brigantine | Seamanship 15 | 4 | two masts, the trader and privateer | 9 m/s | medium | 40 | 2.4 m | under 5 m | 8 cannons, 2 harpoons |
| Galleon (Large Ocean Vessel) | Seamanship 20 + story | 8 | a floating fortress; needed for the Demon Continent | 8 m/s | low | 120 | 4 m | under 9 m | 24 cannons, 4 harpoons |
| Specials | story | | the Iron Kettle (the dwarves' sail-and-boiler hybrid), Crown naval ships (lent for quests), a monster-hunter's whaler (harpoon-heavy), a pirate ghost ship (endgame) | | | | | | |

- **Draft matters.** Deep hulls can't enter reefs, coves, rivers and the
  shallows of the Azure Isles; a skiff can. Some treasure is only reachable small.
- **Seaworthiness matters.** Each hull shrugs off waves up to its rating. Above
  it, it ships water and gets thrown about far more (§6).
- **River and lake boats.** Punts and barges on the capital's river (the Crown
  Quay, the Kingsbridge) and Elder Glen's river: calm-water boating, a gentle
  first lesson.

---

## 5. The sailing model (what you actually do)

Simple enough to test, deep enough to master. Hulls are kinematic with our own
integration (not Rapier dynamics), so it's deterministic and testable.

### 5.1 Wind

- A **wind field**: base direction and strength per sea region (prevailing
  westerlies, trade winds round the Azure Isles, the wild Shattered Isles),
  bent by **weather** (calm, breeze, strong, gale, storm) and the **time of
  day** (sea breeze onshore by day, land breeze at night near coasts).
- **Gusts and lulls**: strength breathes over 5 to 20 seconds and shows as dark
  ripples on the water ahead, so you can see a gust coming.
- **Wind shadows**: islands and big ships block the wind behind them (useful in
  combat, §9).

### 5.2 Points of sail (the polar curve)

Boat speed = wind speed × hull polar(angle to the wind) × trim quality.

```
angle off the wind:  0°-35°   in irons: the sail luffs, you stop (oars or tack out)
                    35°-60°   close-hauled: slow, heavy heel
                    60°-110°  beam reach: fastest
                   110°-150°  broad reach: fast, comfortable
                   150°-180°  running: steady, risk of an accidental jibe
```

To go upwind you **tack** (zig-zag). That is the heart of the puzzle.

### 5.3 Trim

- **Sheet in / out** sets the sail angle. Each point of sail has a **sweet
  spot**, shown by telltales (ribbons) on the sail: both streaming is perfect,
  one fluttering means adjust.
- **Perfect trim**: a speed bonus and Seamanship XP over time. Over-sheeted you
  heel and drag; under-sheeted the sail luffs.
- **Reef** (shorten sail) in strong wind: less speed, far less heel, much less
  chance of being knocked down in a storm.

### 5.4 Tacking and jibing

- **Tack** (bow through the wind): a timing window, like a parry. Perfect keeps
  your speed and gives XP; late stalls you in irons.
- **Jibe** (stern through the wind): faster but dangerous. The boom swings
  hard; a careless jibe in strong wind can knock you overboard (small boats) or
  tear a sail (big ones).

### 5.5 Heel, waves and surfing

- **Heel** from wind pressure: lean out (small boats) to counter it. Too far and
  you **capsize** (skiff, sloop): right the boat with a short minigame, or swim.
- **Buoyancy** from the Gerstner `WAVES` in `ocean.ts`: the surface is sampled
  at 4 to 8 points on the hull each frame, so the boat pitches and rolls on real
  waves. The same samples drive the storm forces in §6.
- **Surfing**: on a following sea, catch a wave's face and the boat surges.

### 5.6 Leeway, currents and grounding

- Boats slip sideways (leeway), most when close-hauled; a keel upgrade cuts it.
- **Currents**: fast lanes between islands, tidal races in straits, the river's flow.
- **Grounding**: depth under the hull less than the draft (`waterDepth`) means
  you scrape, slow and take hull damage; on rocks you hole.

### 5.7 Assist modes

- **Steady Hands (the default):** auto-trim keeps the sail near its sweet spot,
  a wide tack window, capsizing only in storms, and an on-screen best-angle
  hint. Storms still throw you about (§6), and the sea can still sink you.
- **Seafarer (toggle):** the full model. Seamanship XP from sailing is 50%
  higher, and some races and challenges need it.

### 5.8 Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Rudder | A / D | left stick |
| Sheet in / out | W / S | triggers |
| Hoist / lower sail | Space | A |
| Reef / shake out | R | Y |
| Lean out (small boats) | Shift | B (hold) |
| Row (no wind, tight spaces) | hold C + WASD | X (hold) |
| **Lash the helm** (hold this heading while you leave the wheel) | L | dpad up |
| Anchor / weigh anchor | F | dpad down |
| Spyglass | right mouse | LB |
| Fire (when at a gun or harpoon) | left mouse | RT |
| Leave the helm / walk the deck | E | |

### 5.9 Feedback

- Camera: low chase cam that leans with the heel, a masthead lookout cam, a
  spyglass zoom, a wider storm cam that keeps the horizon in view.
- Wake and bow spray scaled by speed; sails that belly, luff and flog; rope
  creak, flapping canvas, hull slap, gulls near land; green water over the bow
  in storms.
- HUD (navy and gold): compass rose with the wind arrow and strength, speed in
  knots, heading, heel gauge, trim telltales, hull and water-in-the-hold meters,
  and in storms a **course-error marker** (where you're actually being pushed).

---

## 6. Storms: the sea throws you about

Storms are the sea at its most dangerous and most dramatic. In a storm you are
not fighting an enemy; you're surviving one.

### 6.1 How a storm works

- **Storm cells** form and drift across the sea map by region and season (the
  Shattered Isles almost always have one). You can see them coming: a dark wall
  on the horizon, lightning inside it, the barometer (an item) dropping, gulls
  vanishing, the swell lengthening before the wind arrives.
- Inside a storm the Gerstner waves change: **height 3 to 10 m**, longer
  wavelengths, much **steeper crests**, crossing swell trains from two
  directions, and now and then a **rogue wave** (twice the height, a crest you
  see coming a few seconds out).
- The wind gusts hard and **veers** (swings direction) every 20 to 60 seconds,
  so the sail plan that worked a minute ago is wrong now.
- Rain and spray cut visibility; lightning lights everything for a frame.

### 6.2 What the waves do to the boat

The hull's buoyancy points feel the wave slope under them every frame, and that
turns into forces:

- **Pitch and roll** that grow with wave height over the hull's seaworthiness:
  a skiff in 4 m seas is thrown like a cork; a galleon rolls heavily but holds.
- **Surge and slam**: climbing a crest slows you; falling off its back slams the
  bow (hull damage on small hulls, a camera jolt for everyone).
- **Yaw kick**: a crest hitting one end of the boat before the other swings the
  bow. This is what **throws you off course**: every big wave turns you a few
  degrees, and the error builds unless you steer against it.
- **Lateral shove and drift**: breaking crests push the hull sideways, and the
  storm itself has a surface drift (2 to 4 m/s, downwind). Leave the helm and
  you will be carried miles from your line.
- **Broaching**: caught beam-on (side-on) to a big breaking wave, the boat is
  knocked flat. Small hulls capsize; big ones lose crew overboard, ship water
  and can lose a mast.
- **Pitchpoling**: running too fast down a steep face buries the bow and
  somersaults small boats.
- **Green water**: waves breaking over the deck sweep loose cargo and people
  (the player grabs the rail with a button press, or goes overboard: §7).
- **Lightning** can strike the mast (fire, a broken spar).

### 6.3 Surviving it (the skill)

- **Meet the waves on the quarter** (about 30 to 45 degrees off): bows straight
  into them slam, beam-on broaches. The HUD's course-error marker and the
  visible crests let you pick the angle.
- **Reef or strike sail** to cut heel and speed; a **storm jib** keeps you
  steerable.
- **Run before it** with a **drogue / sea anchor** trailing behind to stop you
  surfing into a pitchpole.
- **Heave to** (sails balanced against the rudder) and ride it out, drifting.
- **Bail and plug** below decks while someone holds the helm (§8).
- **Pick your route**: go round a storm, wait in port, or shelter in the lee of
  an island. You will often arrive somewhere you didn't mean to be, which is
  half of the fun: an unknown island, a reef, a pirate cove.

### 6.4 Storm design rules

- A storm should be **survivable by a careful player in a seaworthy hull**, and
  deadly to a reckless one or a skiff far from shore.
- After a storm: calm water, a rainbow, floating wreckage from someone less
  lucky (salvage, a survivor to rescue), and a log line: "Blown 3 miles
  north-east."
- **Assisted mode** helps with trim and shows the safe wave angle, but the
  storm still throws you about.

---

## 7. Swimming, diving and drowning

The player can't enter deep water today. This system comes first (phase S1);
everything at sea leans on it.

- **Swimming:** in water deeper than about 1.2 m the player swims: slower than
  walking, steered with the camera, **stamina drains** while swimming (faster in
  waves and against currents, and much faster in heavy armour). At zero stamina
  you start to go under.
- **Diving:** a dive button takes you below the surface. Underwater: a
  **breath meter**, a blue-green underwater look (fog, caustics, god rays from
  the surface), slow movement, and things to find (shells, pearls, sunken
  chests, wrecks, ruins, the Sunken Isles).
- **Drowning:** when breath runs out you take damage quickly; at zero health you
  drown and die as usual. Ways to stay alive: surface, grab floating wreckage,
  a crewmate throws a line, a potion of water-breathing, gear (a diving bell, a
  brass helmet from the Sunken Isles, an elven sea-charm).
- **Overboard:** storms, broaches, careless jibes, monster swipes and sinking
  put you in the water. Your ship keeps sailing unless the helm is lashed or
  crew come about for you.
- **Swimming skill** sits in the Seamanship calling's Diver branch (§10):
  longer breath, faster swimming, less armour penalty, seeing further underwater.

---

## 8. Damage, sinking and loss

- **Hull sections** (bow, midships, stern; both sides on big ships) take holes.
  Water comes in faster than the pumps clear it.
- **Below decks:** a **bailing and plugging** minigame (patch the hole, work the
  pump); a shipwright crewmate patches faster. Water in the hold makes the boat
  slower, lower and easier for waves to swamp.
- **Torn sails, a broken mast, fire** each change how the boat sails until
  repaired.
- **Sinking:** when the hold floods the ship goes down over 20 to 40 seconds:
  time to grab what you can, get crew into the water, and swim.
- **A sunk ship is gone for good.** No raising, no refund. Its **wreck stays on
  the seabed** where it sank (marked on your map) as a dive site: dive back
  for some of the cargo and gold, one cannon or two, the figurehead. Deep wrecks
  need breath upgrades or gear to reach.
- **Crew** in the water must reach floating wreckage or shore; any not rescued
  are lost (and their quests end).
- Because loss is permanent, ships are never lost to something the player
  couldn't see coming: storms are visible, monsters signal before they strike,
  and the hull meter always shows how close you are.

---

## 9. Naval combat

Two kinds of enemy: **ships** (sail and gunnery) and **sea monsters** (each a
set-piece fight with its own rules).

### 9.1 Weapons

| Weapon | On | What it does |
|---|---|---|
| **Cannons** (broadside) | brigantine, galleon | Aimed along the beam; elevation sets range; reload is a timing press (perfect is faster). The roll of the ship matters: fire on the up-roll to hit the rigging, on the down-roll to hole the hull |
| Shot types | | **Round** (hull), **chain** (sails, rigging, tentacles), **grape** (crew, small monsters), **fire pots** (burns; dangerous in your own rigging) |
| **Swivel guns** | cutter and up | Rail-mounted, fast, aimed freely; good against boarders and small monsters |
| **Harpoon gun** | sloop and up | Fires a barbed line that **tethers** you to the target. A big monster then **tows your ship**: you steer to keep the line taut and the bow toward it, reel in, or **cut the line** before you're dragged onto rocks or under |
| **Ram** | reinforced bow | Damage scales with speed and angle; hurts you too |
| **The player's own arms** | on deck | Sword, bow and spells from the deck: cut tentacles, shoot boarders, cast lightning at a serpent's head |

### 9.2 Ship against ship

- **Position is the skill.** Hold the **weather gauge** (be upwind: you choose
  when to close), cross the enemy's bow or stern to **rake** it (they can't fire
  back), stay out of their broadside arc, use islands to steal their wind.
- **Boarding:** grapples pull the hulls together; then a deck fight using the
  normal combat system on a moving, rolling deck (the moving-platform tech in
  §13), crew fighting beside you. Win and you take the ship's cargo, or the ship
  itself (sail it home or scuttle it).
- **Enemies:** pirate sloops and brigantines, the **Black Tide** pirate fleet of
  the Shattered Isles and their captain (a rival across the S4 story), Crown
  naval patrols (if you smuggle), privateers, a pirate ghost ship (endgame).
- **Surrender:** beaten ships strike their colours; you can spare them (fame,
  a ransom) or sink them.

### 9.3 Sea monsters

Each monster has a **tell** you can read before it strikes, a **weak point**,
and a reason to fight it or flee.

| Monster | Where | How it fights | How you beat it |
|---|---|---|---|
| **Reef shark swarm** | warm shallows, near wrecks | Circles swimmers and small boats; attacks anyone in the water | Swivels and grape; stay out of the water |
| **Great white "Old Teeth"** | coastal shelf (a legendary fish) | Rams the hull from below, snatches crew who lean over the rail | Harpoon and play the line like a huge fish; it tows the boat |
| **Sea serpent** (Nell's rumour) | open sea off Port Aurelle | Circles, dives (a wake line shows where it'll breach), **breaches and rams**, coils round small hulls and squeezes | Harpoon it while it's surfaced; chain shot at the coils; strike the head when it rears to bite |
| **Giant crab colossus** | reefs and sandbars | Grips the hull with its claws, pulling the ship onto the reef | Cannon or blade at the joints; break free before the hull grounds |
| **Siren choir** | fog banks round the Shattered Isles | Song **charms crew**, who steer for the rocks; the helm drifts toward them | Plug ears (an item), kill the sirens on the rocks with bow or swivel, hold the helm against the pull |
| **Storm wyrm** | inside storms | Flies through the storm, lightning breath at masts, dives at the deck | Fight it while also surviving the storm (§6); harpoon it to drag it down into the sea |
| **Kraken** (boss) | the deep, the Sunken Isles | Tentacles rise round the ship: grab the rigging (sails stop), sweep the deck (crew overboard), crush a hull section; the beak surfaces last | Chain shot and blades on the tentacles (each cut frees a part of the ship); when the eye surfaces, everything into it |
| **Leviathan** (endgame) | the crossing to the Demon Continent | So big its back is an island; its breach makes waves that throw the ship like a storm | A voyage-long set piece: survive its waves, harpoon the barbs on its back, ride it |
| Neutral giants | everywhere | Whales and dolphin pods, which follow the bow and can guide you to calm water | Don't. (Hurting them angers the sea.) |

- **Monster fights use the storm physics too.** A breach makes a wave that
  throws the ship; a tow drags it; a coil heels it; a tentacle grab stops the sails.
- **Rewards:** trophies for the cabin wall, rare materials (serpent scale for
  hull plating, kraken ink, leviathan bone for a legendary keel), bounties from
  the harbourmaster, Seamanship XP, and a story beat for each named monster.

---

## 10. Seamanship: the calling (skill tree)

A **Calling** in the `combat-paths.md` model: XP invested buys levels 1 to 30,
tree tiers at 1/5/10/15/20, capstones at 25.

**XP sources:** distance sailed at good trim; perfect tacks and jibes; surfed
waves; docking cleanly; storms weathered; first landfalls; deliveries on time;
races; sea fights won; monsters slain; dives.

**Hull licences:** Skiff 1, Fishing sloop 5, Cutter 10, Brigantine 15, Galleon 20 (plus the story).

### Branches (pick freely; depth is expensive)

**Helmsman** (handling)
- Tack window +, perfect-tack speed carry-over +
- *Wave Reader*: shows surfable faces and the safe angle to meet breaking waves
- *Storm Hand*: waves throw you less; smaller course error in storms
- Capstone *Wavebreaker*: once per voyage, right a broach or capsize instantly

**Navigator** (where to go)
- Compass, then charts: reveal coastlines and currents as you sail
- *Star Reckoning*: at night, a star sight shows your true position and course error
- *Weather Eye*: storm cells show on the map earlier, with their drift
- *Current Lore*: currents show on the water; riding them is a big speed boost
- Capstone *Windcaller*: summon a fair wind for 60 seconds (long cooldown)

**Rigger** (the sails)
- Trim sweet spot wider; sail speed +
- Faster reefing and hoisting; storm jib
- *Patch and Splice*: repair sails and planks at sea
- Capstone *Full Press*: for 30 seconds, sail a little closer to the wind

**Gunnery** (naval combat)
- Reload faster, perfect-reload window wider, tighter spread
- *Harpooner*: harpoon range +, line strength + (monsters tow you less)
- *Chain and Fire*: special shot types, then fire pots without the risk to your own rigging
- *Monster Lore*: see a monster's tell earlier; weak points glow
- Capstone *Thunder Broadside*: one broadside that fires every gun at once with perfect timing

**Captain** (crew and command)
- Crew slots +, morale +, wages -
- *Boarding Party*: grapples; crew fight beside you on deck
- *Steady Crew*: fewer crew washed overboard; they hold the helm well in storms
- Capstone *Fleet Signal*: one hired consort ship sails with you

**Diver** (in the water)
- Breath +, swim speed +, stamina drain in water -
- *Weighted*: less armour penalty when swimming
- *Deep Sight*: see further underwater; wrecks and pearls glint
- Capstone *Child of the Tide*: you can't drown while you have stamina

**Deep Angler** (with the Fisher class)
- Trawl nets from the sloop; deep-sea fish tables; harpoon fishing for big game
- *Bait Lore*, *Shoal Sight*
- Capstone *The One That Got Away*: legendary fish quests open up

---

## 11. Why you go to sea, and why the voyage itself is fun

Because **every crossing is sailed**, the voyage has to be good in itself.

- **Short legs.** The sea is laid out as island-hops: most crossings take 3 to
  8 minutes of sailing in a good hull; the longest (the Demon Continent) about
  20, broken by a mid-ocean stop. Faster hulls, upgrades, currents and the
  Navigator branch make them shorter.
- **Always something happening:** an event roughly every 60 to 120 seconds
  while sailing (scaled by region and weather): dolphins at the bow, a floating
  crate, a gull that steals your fish, a message in a bottle, a distant sail, a
  fin, a waterspout, a bioluminescent bloom at night, a storm on the horizon.
- **Things to do while sailing:** lash the helm and **walk the deck** to fish
  off the stern, cook in the galley, repair, talk to crew, climb to the crow's
  nest with the spyglass. The wind still shifts, so you keep an eye on the sail.
- **Reasons to go:**
  - **Fishing:** rod from small boats, nets and trawl lines from the sloop, big
    game with the harpoon; deep-water tables and legendary fish.
  - **Trade runs:** buy where it's cheap, sell where it's dear; Maritime Guild
    contracts pay a bonus for speed.
  - **Couriers and passengers:** time-limited runs (the cutter's job).
  - **Races:** the Port Aurelle Regatta (buoys round the harbour and the
    lighthouse), island time trials, a rival captain with a three-race arc.
  - **Exploration:** uncharted islands, sea caves, lighthouses to relight
    (waypoints and map reveals), bottles with treasure maps, wrecks to dive, the
    Sunken Isles' drowned ruins with Sunwheel carvings (the main mystery).
  - **Hunting:** pirate bounties, the monster roster in §9.3.
  - **Smuggling:** the Quiet Hands' night runs past the customs cutter, no
    lanterns, through the reef gaps.
  - **Story voyages:** the Iron Kettle to the White Mountains (with a storm and a
    serpent), later the crossing to the Demon Continent in a galleon, past the
    Leviathan.

---

## 12. Crew and owning a ship

### Crew

- Hire at harbour taverns and the Maritime Guild: **Bosun** (sail handling),
  **Navigator** (charts, storm warnings), **Gunner** (reload, aim), **Harpooner**,
  **Shipwright** (repairs), **Cook** (morale, buffs), **Lookout** (spots sails,
  shoals, reefs and fins sooner).
- Each has a name, a trait or two (Superstitious, Old Salt, Seasick, Can't Swim),
  a level that rises with voyages, and a short personal quest.
- **Morale** from pay, food, victories and storms survived; low morale slows
  sail handling and can end in a mutiny on long voyages.
- Crew walk the deck and man stations (pooled NPC actors), go overboard in
  storms, and can drown.

### Your ship

- **Buy** used hulls at the harbours, or **commission** one at the Aurelle
  Shipwrights (watch it take shape on the slipway that's already there).
  Materials from the Carpenter and Shipwright path make it cheaper and better.
- **Upgrades:** sails (cotton, silk-weave, elven), keel (less leeway, steadier
  in storms), copper sheathing, reinforced bow, hull plating (serpent scale at
  the top end), guns, harpoons, pumps, figurehead (a small passive), lanterns,
  a bigger hold.
- **Look:** paint, sail colours, flags, a name on the stern.
- **Ship as home:** the captain's cabin (bed to rest and save, trophy wall,
  chart table), the hold (storage), later a galley and a forge.
- **Berths:** your ship docks at any discovered port. It stays where you left it:
  since every crossing is sailed, to use it somewhere else you sail it there.
- **Because a sunk ship is lost for good:** you can own several and keep a spare
  in port; the best upgrades are recoverable from the wreck by diving if you're
  brave enough.

---

## 13. How it's built (architecture)

New modules under `src/world/sea/` (`ocean.ts` stays the water):

| Module | Job |
|---|---|
| `wind.ts` | Wind field: region prevailing wind, weather, gusts and lulls, veering, wind shadows; `windAt(x, z, t)` |
| `storms.ts` | Storm cells (spawn, drift, intensity), the storm wave set (height, steepness, crossing swells, rogue waves), surface drift, lightning |
| `hull.ts` | Boat physics: heading, speed, leeway; buoyancy from the wave set at hull points; wave forces (pitch, roll, surge, yaw kick, lateral shove), broach and pitchpole checks; grounding via `waterDepth` |
| `sail.ts` | Polar curves per hull, sheet and trim, reef, tack and jibe state machine with timing windows, assist mode |
| `ship.ts` | A sailable ship: model (`buildShip`), hull + sails + damage sections + hold water + cargo + crew stations + guns; moving-platform frame |
| `shipTypes.ts` | Data for every hull (§4) |
| `helm.ts` | Player control, lash the helm, cameras, HUD binding |
| `swim.ts` | Swimming, diving, breath, drowning, underwater look; also used off-ship (rivers, lakes, the coast) |
| `gunnery.ts` | Broadsides, shot types, swivels, harpoon tethers (a spring line between ship and target that tows), ramming, hits on hull sections |
| `monsters/` | One module per monster (serpent, kraken, crab, sirens, wyrm, sharks, Leviathan) with its tell, weak point and wave effects |
| `seaEncounters.ts` | Event and encounter tables by region, weather and time; pooled AI ships and creatures |
| `ports.ts` | Ports, berths, docking zones, harbourmaster services |
| `wrecks.ts` | Sunk ships persist as dive sites with recoverable loot |
| `crew.ts` | Crew records, stations, morale, wages, overboard and rescue |
| progression | The Seamanship calling and its tree, in the Callings system |

- **Walking on deck:** player and crew attach to the ship's frame (a moving
  platform); the character controller moves in ship-local space and the ship's
  transform applies after. Boarding fights use the same thing.
- **Physics:** hulls are kinematic with our own integration (deterministic,
  testable); Rapier only for deck colliders in the ship frame, cannonballs,
  harpoon lines and terrain raycasts.
- **Waves on the CPU:** the storm wave set is the same function the ocean
  shader draws, so what you see is what throws the boat.
- **Performance (Iris Xe):** one detailed player ship, up to six AI ships at
  medium detail, impostors beyond 600 m, one big monster at a time.
- **Save:** owned ships (hull, upgrades, damage, berth, name, colours), wrecks
  and what's left in them, crew, cargo, charts and routes, lit lighthouses,
  Seamanship XP.

---

## 14. Roadmap (each phase is playable on its own)

| Phase | Name | Ships | What's in it | Done when (tests) |
|---|---|---|---|---|
| S1 | **Wind, Sail and Swim** | rowboat, skiff | **Swimming, diving, breath and drowning** everywhere; the wind field; the sailing model (polar, trim, tack and jibe windows, heel, capsize, buoyancy on `WAVES`) with Steady Hands as default; helm HUD; Seamanship 1 to 5 (Helmsman, Rigger, Diver tiers); Mira's sailing lessons; the first Regatta course in Port Aurelle harbour | Swim stamina drains and drowning kills; a beam reach beats close-hauled; perfect tack keeps speed; capsize past the heel limit in Seafarer; the regatta can be won in a scripted run |
| S2 | **The Coast** | fishing sloop | Docking and berths; net and trawl fishing; harpoon fishing for big game (the first tether: Old Teeth); lighthouses; two nearby islands; river punts and the Kingsbridge ferry; Deep Angler tier; the first **squalls** (wind gusts and short steep seas) | Dock without damage; a harpooned fish tows the boat; a squall's gust heels the boat over |
| S3 | **Storms and Open Water** | cutter | **Full storms** (cells, storm waves, yaw kick, drift, broaching, pitchpoling, green water, overboard, lightning), course error and the safe-angle skill; navigation (charts, stars, Weather Eye); currents; crew basics; trade runs and contracts; the Azure Isles | A storm throws an unattended boat miles off course; meeting waves on the quarter keeps the course error small; a broach knocks a skiff down but not a reefed cutter; overboard crew can be recovered |
| S4 | **Steel, Powder and Teeth** | brigantine | Cannons, shot types, swivels, the harpoon tether in combat; hull sections, bailing and plugging, sinking and **permanent loss with wrecks to dive**; boarding fights on deck; pirates and the Black Tide rival; the Shattered Isles; the **sea serpent**, **reef sharks**, the **crab colossus** and the **siren choir**; smuggling | A broadside holes the right section; a sunk ship leaves a wreck you can dive and loot; the serpent can be beaten in a scripted fight; boarding moves the fight onto the enemy deck |
| S5 | **The Deep** | galleon | The Sunken Isles and their ruins; the **storm wyrm**; the **kraken** boss; the ship as home; the Iron Kettle voyage for real; the crossing to the Demon Continent past the **Leviathan** | The kraken fight can be won; the cabin bed saves; the crossing reaches Ashen Port |

---

## 15. Still open

1. **Where sailing starts:** Port Aurelle harbour with Mira (default), or on the capital's river?
2. **Crew death:** are drowned crew gone for good too (matching ships), or do they wash up at the next port?
3. **Assisted mode and storms:** should Steady Hands also soften storm throws a little, or keep storms equally brutal in both modes (current plan: equally brutal)?
