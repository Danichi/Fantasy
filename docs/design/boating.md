# Boats, Sailing and Seamanship (design plan v0.1)

Status: a plan for review. Nothing here is built yet beyond what "What exists"
lists. Numbers are starting points to tune; names are placeholders you can veto.
It follows the progression model in `combat-paths.md` (XP invested in
disciplines; Callings are real power) and the Grand Ocean phase of the World
Expansion plan (six ship types, sea encounters, ports, islands).

---

## 1. What makes it fun (the pillars)

Every system below has to serve at least one of these. If a feature serves none,
it goes.

1. **The wind is a puzzle you can feel.** You never just press W. You read the
   wind, set the sail, pick an angle, and the boat answers: heeling, surging,
   hissing through the water. Good sailing is visibly faster than bad sailing.
2. **Skill shows.** A clean tack, a perfectly trimmed sail and a wave surfed
   down its face are things the player does with their hands, not stats. The
   Seamanship calling makes you better, but a skilled player on a skiff beats a
   clumsy one on a cutter.
3. **The sea is a place, not a loading screen.** Islands on the horizon, a
   lighthouse to steer by, dolphins at the bow, a storm wall building in the
   west. Long voyages can be compressed, but never skipped blind.
4. **Danger with a choice.** Storms, reefs, pirates and sea monsters are always
   avoidable by a smarter route, a reefed sail or a faster hull. Losing should
   feel like a mistake you understand.
5. **A ship is a home you grow.** From a hired rowboat to your own named
   galleon with a crew who know your name, upgrades you chose, and a cabin with
   your trophies.

---

## 2. What exists today (build on it, don't duplicate it)

| Piece | Where | State |
|---|---|---|
| Ocean surface | `src/world/sea/ocean.ts` | Camera-following radial grid; Gerstner `WAVES` shared by shader and CPU (ready for buoyancy) |
| Rowboat hire | `src/world/boats.ts` | Mira rents a rowboat at Fisherman's Wharf: WASD rowing, Shift pulls harder, fish from it, step ashore |
| Ship models | `src/world/cityKit.ts` `buildShip()` | Six types (fishing, sloop, merchant, galleon, naval, expedition), merged into a few draws each; static in Port Aurelle's harbour |
| Fishing | `src/world/fishing.ts` | Cast, bite, strike, reel with tension; fish by water type, hour and weather |
| Ports | Port Aurelle quays, piers, shipyard, customs house; the Crown Quay on the capital's river | Static dressing, NPCs (Mira, Tallow, Nell) |
| Story hook | `dwarf-expedition` quest | Board the Iron Kettle on sailing day (currently ends at the signal) |
| Water level | `src/world/waterLevel.ts` | `waterSurfaceAt` / `waterDepth` for any point |

---

## 3. The core loop

```
 port ─► pick a boat, crew, cargo, a goal (fish, trade, explore, hunt, race)
   │
   ▼
 sail ─► read wind + waves ─► trim, steer, tack ─► XP for doing it well
   │            │
   │            ├─► events: dolphins, a wreck, a pirate sail, a storm front
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

| Hull | Unlock | Crew | Feel | Speed (best reach) | Handling | Cargo | Draft | Seaworthy | Guns |
|---|---|---|---|---|---|---|---|---|---|
| Rowboat | hire (exists) | 0 | oars only, any direction | 2.5 m/s | very high | 2 | 0.3 m | calm only | 0 |
| Skiff (dinghy) | Seamanship 1 | 0 | one sail, tips if you're careless, pure skill | 6 m/s | very high | 4 | 0.5 m | breeze | 0 |
| Fishing sloop | Seamanship 5 | 1 | stable, a net winch, a live-well | 7 m/s | high | 12 | 1.0 m | moderate | 0 |
| Cutter | Seamanship 10 | 2 | fast and twitchy, a racer and a courier | 10 m/s | high | 10 | 1.4 m | strong | 2 swivels |
| Brigantine | Seamanship 15 | 4 | two masts, the trader and privateer | 9 m/s | medium | 40 | 2.4 m | storm | 8 |
| Galleon (Large Ocean Vessel) | Seamanship 20 + story | 8 | a floating fortress; needed for the Demon Continent | 8 m/s | low | 120 | 4 m | gale | 24 |
| Specials | story | | the Iron Kettle (dwarven expedition steamer-sail hybrid), Crown naval ships (quest-lent), a pirate ghost ship (endgame) | | | | | | |

- **Draft matters.** Deep hulls can't enter reefs, coves, rivers and the shallows
  of the Azure Isles; a skiff can. Some treasure is only reachable small.
- **Seaworthiness matters.** Each hull has a wave height it shrugs off. Above
  it, it takes on water, and in a storm a skiff simply can't go out.
- **River and lake boats.** Punts and barges on the capital's river (the Crown
  Quay, the Kingsbridge) and Elder Glen's river: calm-water boating and a
  gentle first lesson.

---

## 5. The sailing model (what you actually do)

The model is simple enough to test but deep enough to master. It's kinematic
(our own integration, not Rapier dynamics), so it's deterministic and testable.

### 5.1 Wind

- A **wind field**: base direction and strength per sea region (prevailing
  westerlies, trade winds round the Azure Isles, the wild Shattered Isles),
  bent by **weather** (calm, breeze, strong, gale, storm) and the **time of
  day** (sea breeze onshore by day, land breeze at night near coasts).
- **Gusts and lulls**: wind strength breathes over 5 to 20 seconds and shows
  as dark ripples on the water ahead, so you can see a gust coming.
- **Wind shadows**: islands and big ships block the wind behind them.

### 5.2 Points of sail (the polar curve)

Boat speed is wind speed × hull polar(angle to the wind) × trim quality.

```
angle off the wind:  0°-35°   in irons: the sail luffs, you stop (oars or tack out)
                    35°-60°   close-hauled: slow, high heel
                    60°-110°  beam reach: fastest
                   110°-150°  broad reach: fast, comfortable
                   150°-180°  running: steady, risk of an accidental jibe
```

To go upwind you **tack** (zig-zag). That is the heart of the puzzle.

### 5.3 Trim (the skill in your hands)

- **Sheet in / out** sets the sail angle. Each point of sail has a
  **sweet spot**. The UI shows telltales (little ribbons) on the sail: both
  streaming means perfect trim, one fluttering means adjust.
- **Perfect trim** gives a speed bonus and Seamanship XP over time. Over-sheeted
  you heel and drag; under-sheeted the sail luffs and you lose drive.
- **Reef** (shorten sail) in strong wind: less speed but much less heel and no
  capsize risk. Shaking out a reef too early in a gale is how skiffs drown.

### 5.4 Tacking and jibing

- **Tack** (bow through the wind): turn, switch the sail side at the right
  moment. A timing window, like a parry: perfect gives a speed carry-over and
  XP; late stalls you in irons.
- **Jibe** (stern through the wind): faster but dangerous. The boom swings
  hard; a careless jibe in strong wind can knock the player overboard
  (small boats) or tear a sail (big ones).

### 5.5 Heel, waves and surfing

- **Heel** (lean) from wind pressure: lean out (a key on small boats) to
  counter it. Too much heel and you **capsize** (skiff, sloop): right the
  boat with a short minigame, or swim.
- **Buoyancy** from the Gerstner `WAVES` already in `ocean.ts`: sample the
  surface at 4 to 8 hull points, so the boat pitches and rolls on real waves.
- **Surfing**: on a following sea, catch a wave's face and the boat surges.
  Riding wave sets well is one of the best feelings in the system.

### 5.6 Leeway, currents and grounding

- Boats slip sideways a little (leeway), more when close-hauled; a keel upgrade
  reduces it.
- **Currents**: fast lanes between islands (marked on charts once found),
  tidal races in straits, the river's flow.
- **Grounding**: depth under the hull below the draft (from `waterDepth`) means
  the boat scrapes, slows and takes hull damage; on rocks it holes.

### 5.7 Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Rudder | A / D | left stick |
| Sheet in / out | W / S | triggers |
| Hoist / lower sail | Space | A |
| Reef / shake out | R | Y |
| Lean out (small boats) | Shift | B (hold) |
| Row (no wind or tight spaces) | hold C + WASD | X (hold) |
| Anchor / weigh anchor | F | dpad down |
| Spyglass | right mouse | LB |
| Walk the deck | E at the helm to let go | |

**Assist modes:** *Steady Hands* (auto-trim, no capsize, wider tack window) for
players who want to explore, and *Seafarer* (full model). Seamanship XP is
higher in Seafarer.

### 5.8 Feedback (so it feels great)

- Camera: low chase cam that leans with the heel, a lookout cam from the
  masthead, a spyglass zoom.
- Wake and bow spray scaled by speed; sails that belly, luff and flog;
  telltales; rope creak, flapping canvas, hull slap, gulls near land.
- HUD (navy and gold): a compass rose with a wind arrow and its strength,
  speed in knots, heading, a heel gauge, the trim telltales, and a hull and
  water meter.

---

## 6. Seamanship: the calling (skill tree)

A **Calling** in the `combat-paths.md` model: XP invested buys levels 1 to 30,
tree tiers at 1/5/10/15/20, capstones at 25. Sailing well earns it.

**XP sources:** distance sailed at good trim; perfect tacks and jibes; surfed
waves; docking cleanly (slow, no bump); storms weathered; first landfalls;
deliveries on time; races; sea fights won.

**Hull licences** ride on the level: Skiff 1, Fishing sloop 5, Cutter 10,
Brigantine 15, Galleon 20 (plus the story).

### Branches (pick freely; depth is expensive)

**Helmsman** (handling)
- Tack window +, perfect-tack speed carry-over +
- *Wave Reader*: highlights surfable wave faces; surf boost +
- *Storm Hand*: less heel and water taken in heavy seas
- Capstone *Wavebreaker*: once per voyage, right a capsize instantly

**Navigator** (where to go)
- Compass, then charts: reveal coastlines and currents as you sail
- *Star Reckoning*: at night, a star sight points to the nearest known port
- *Fog Sense*: see reefs and hulls in fog
- *Current Lore*: currents show on the water; riding them gives a big boost
- Capstone *Windcaller*: summon a fair wind for 60 seconds (long cooldown)

**Rigger** (the sails)
- Trim sweet spot wider; sail speed +
- Faster reefing and hoisting
- *Patch and Splice*: repair torn sails and holed planks at sea
- Capstone *Full Press*: for 30 seconds, sails ignore the in-irons cone a little (pinch higher)

**Captain** (crew and command)
- Crew slots +, morale +, wages -
- *Gun Captain*: faster reloads, tighter spread
- *Boarding Party*: grapples; crew fight beside you on deck
- Capstone *Fleet Signal*: one AI ally ship (a hired consort) sails with you

**Deep Angler** (with the Fisher class)
- Trawl nets from the sloop; deep-sea fish tables; harpoon for big game
- *Bait Lore*, *Shoal Sight* (see shoals as glints on the water)
- Capstone *The One That Got Away*: legendary fish quests become available

---

## 7. Why you go to sea (activities)

- **Fishing:** from rowboat and skiff (rod), sloop (nets, trawl lines), big
  game (harpoon: tuna, swordfish, the shark that follows the trawlers). Deep
  water gets its own fish table and legendary fish.
- **Trade runs:** buy where it's cheap, sell where it's dear (the economy plan:
  fish and imports from Port Aurelle, spices from Sunspire, ore from the
  mountain coast). Hold space matters; contracts from the Maritime Guild pay a
  bonus for speed.
- **Couriers and passengers:** time-limited runs (a cutter's job): letters,
  medicine, a noble late for a wedding. Rough seas lower passenger happiness.
- **Races:** the **Port Aurelle Regatta** (buoy courses round the harbour and
  the lighthouse), island-to-island time trials, a rival captain NPC (a
  sea-going Dorian Vale) with a three-race arc. Races teach the sailing model
  better than any tutorial.
- **Exploration:** uncharted islands, sea caves at low tide, lighthouses to
  relight (each lit one becomes a fast-sail waypoint and a map reveal),
  messages in bottles with treasure maps, wrecks to dive, and the Sunken Isles'
  drowned ruins with Sunwheel carvings (the main mystery).
- **Hunting:** pirate bounties from the harbourmaster; sea monsters
  (a sea serpent hunt, Nell's rumour paid off; the kraken as a set-piece boss).
- **Smuggling:** the Quiet Hands want night runs past the customs cutter, with
  no lanterns, through the reef gaps.
- **Story voyages:** the Iron Kettle to the White Mountains (sailed for real,
  with a storm and a pirate scare), later the long crossing to the Demon
  Continent, which needs a galleon.

---

## 8. Danger at sea

- **Weather:** squalls (gusty and short), fog (navigation by sound, the
  lighthouse horn, stars), storms (huge waves, lightning; reef or run before
  it), and dead calm (row, or wait).
- **Hull damage:** sections (bow, mid, stern) take holes; water comes in
  faster than the pumps clear it. A **bailing / plugging** minigame below
  decks; a shipwright crewmate patches faster.
- **Torn sails, a broken mast, fire** (lightning, enemy fire arrows): each one
  changes how the boat sails until repaired.
- **Sinking:** the boat goes down, you swim. Nearby cargo floats as salvage.
  A sunk *owned* ship can be raised by the shipyard for a fee (no permanent
  loss unless the save is set to Ironwater mode).
- **Overboard:** swim back, grab a thrown line, or the crew comes about for you.

### Sea combat

- **Broadsides:** aim along the beam; elevation sets range; reload is a
  timing press (perfect reload = faster). Shot types: round (hull), chain
  (sails), grape (crew).
- **Positioning is the skill:** keep the wind (the "weather gauge"), cross the
  enemy's bow to rake it, and stay out of their broadside arc.
- **Ramming** with a reinforced bow; **boarding** with grapples, then a deck
  fight using the normal combat system on a moving deck (the moving-platform
  tech below).
- **Enemies:** pirate sloops and brigantines, a privateer captain with a
  rivalry, Crown naval patrols (if you smuggle), the sea serpent (circles, dives,
  rams), the kraken (tentacles grab the rigging; cut them free).

---

## 9. Crew

- Hire at harbour taverns and the Maritime Guild: **Bosun** (sail handling),
  **Navigator** (charts, currents), **Gunner** (reload, aim), **Shipwright**
  (repairs), **Cook** (morale and buffs), **Lookout** (spots sails, shoals and
  reefs sooner).
- Each crewmate has a name, a trait or two (Superstitious, Old Salt, Seasick),
  a level that rises with voyages, and a short personal quest.
- **Morale** from pay, food, victories and storms survived; low morale slows
  sail handling and can end in a mutiny event on long voyages.
- Crew walk the deck and man stations (pooled NPC actors).

---

## 10. Owning a ship

- **Buy** used hulls at the harbours, or **commission** one at the Aurelle
  Shipwrights (pick a hull, wait some game days, watch it take shape on the
  slipway that's already in the harbour). Materials from the Carpenter and
  Shipwright crafting path make it cheaper and better.
- **Upgrades:** sails (cotton, then silk-weave, then elven), keel (less leeway),
  copper sheathing (speed, fewer barnacles), reinforced bow, hull plating, guns,
  figurehead (a small passive), lanterns, a bigger hold.
- **Look:** paint, sail colours, flags, a name painted on the stern.
- **Ship as home:** the captain's cabin (bed to rest and save, trophy shelf,
  chart table), the hold (shared storage), later a galley and a forge.
- **Berths:** your ship docks at any discovered port; a harbourmaster can send
  it to another port (it arrives after a while), or summon it to the nearest one.

---

## 11. The world at sea

- **Ports** (data-driven): Port Aurelle first (exists), then island ports, the
  mountain coast landing, Valoria's harbours, the Demon Continent's Ashen Port.
- **Regions:** the coastal shelf (gentle, learn here), the Azure Isles
  (turquoise shallows, reefs, trade winds), the Emerald Isles (forest coves),
  the Shattered Isles (storms, black rocks, the pirate haven), the Sunken Isles
  (diving, ruins), and the open Grand Ocean (long crossings).
- **Routes and the map:** sea routes appear as dashed lines once sailed; the
  painted map gets a nautical layer (currents, reefs, lighthouses).
- **Long voyages:** sail it for real, or **charted passage**: pick a known route
  and time compresses (the world slides by), encounters still roll, and you can
  take the helm at any moment.
- **Rivers and lakes:** punts and barges on the capital's river (a ferry at the
  Kingsbridge, a race under its arches), Elder Glen's river, Millbrook Mere.

---

## 12. How it's built (architecture)

New modules under `src/world/sea/` (existing `ocean.ts` stays the water):

| Module | Job |
|---|---|
| `wind.ts` | Wind field: region prevailing wind, weather, gusts and lulls, wind shadows; `windAt(x, z, t)` |
| `hull.ts` | Boat physics: 2D heading, speed, leeway plus vertical buoyancy from `WAVES` sampled at hull points; heel; grounding via `waterDepth` |
| `sail.ts` | Polar curves per hull, sheet/trim, reef, tack/jibe state machine with its timing windows |
| `ship.ts` | A sailable ship: model (`buildShip`), hull + sails + damage + cargo + crew stations; moving-platform frame |
| `shipTypes.ts` | Data for every hull (the table in §4) |
| `helm.ts` | Player control, assist modes, cameras, HUD binding |
| `ports.ts` | Ports, berths, docking zones, harbourmaster services |
| `seaRoutes.ts` | Known routes, currents, charted passage (time compression) |
| `seaEncounters.ts` | Data tables by region, weather and time; pooled AI ships and creatures |
| `cannons.ts` | Broadsides, shot types, hit detection on hull sections |
| `crew.ts` | Crew records, stations, morale, wages |
| `progression` | Seamanship calling and its tree (in the Callings system) |

- **Walking on deck:** the player and crew attach to the ship's frame (a
  moving platform). The character controller moves in ship-local space; the
  ship's transform is applied after. This is also what boarding uses.
- **Physics:** hulls are kinematic with our own integration (deterministic,
  testable). Rapier is used only for the deck colliders in the ship frame, and
  for cannonball and terrain raycasts.
- **Performance budget (Iris Xe):** one detailed player ship, up to six AI
  ships at medium detail, impostors beyond 600 m. The ocean stays one plane;
  islands stream like terrain tiles.
- **Save:** owned ships (hull, upgrades, damage, berth, name, colours), crew,
  cargo, charts and routes, lit lighthouses, Seamanship XP.

---

## 13. Roadmap (each phase is playable on its own)

| Phase | Name | Ships | What ships in it | Done when (tests) |
|---|---|---|---|---|
| S1 | **Wind and Sail** | rowboat, skiff | Wind field; the sailing model (polar, trim, tack and jibe windows, heel, capsize, buoyancy on `WAVES`); helm HUD; Seamanship 1 to 5 with Helmsman and Rigger tiers; Mira's sailing lessons quest; the first Regatta course in Port Aurelle harbour | Skiff speed on a beam reach beats a close-hauled one; perfect tack carries speed; capsize past the heel limit; regatta can be won in a scripted run |
| S2 | **The Coast** | fishing sloop | Docking and berths; the harbour travel UI; net and trawl fishing; lighthouses (relight = waypoint); two nearby coastal islands; river punts and the Kingsbridge ferry at the capital; Deep Angler tier | Dock without damage; trawl yields deep-water fish; a lit lighthouse appears on the map |
| S3 | **Open Water** | cutter | Navigation (charts, stars, fog), currents, storms and reefing, charted passage, crew basics (hire, stations, morale), trade runs and Maritime Guild contracts, the Azure Isles | A storm sinks an unreefed skiff and not a reefed cutter; charted passage arrives with time advanced; contract pays the speed bonus |
| S4 | **Steel and Powder** | brigantine | Cannons and shot types, damage sections, bailing, boarding fights on deck, pirates and the privateer rival, the Shattered Isles pirate haven, smuggling for the Quiet Hands | A broadside holes the right section; boarding moves the fight onto the enemy deck; a sunk ship drops salvage |
| S5 | **The Deep** | galleon | Diving and the Sunken Isles ruins, the sea serpent hunt, the kraken boss, the ship as home (cabin, storage), the Iron Kettle voyage for real, the crossing to the Demon Continent | Kraken can be beaten with a scripted fight; the cabin bed saves; the crossing reaches Ashen Port |

---

## 14. Decisions for you

1. **Default realism:** start players on *Steady Hands* (assisted) or *Seafarer* (full)?
2. **Losing a ship:** raise it for a fee (my suggestion), or permanent loss as an option?
3. **Long voyages:** is charted passage (time compression) fine, or should every crossing be sailed?
4. **Drowning:** can you drown (stamina while swimming), or always wash ashore?
5. **Where it starts:** S1 in Port Aurelle harbour with Mira (my suggestion), or on the capital's river first?
