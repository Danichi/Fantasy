# The explorable Dark

Rebuilt 2026-11-26. The Dark is the world's shadow again: **the same land, in
the same place, under a red sky**, the look the Gravewood mirror had in Act I,
now stretching across the whole map. All the mechanics of the streamed Dark
stay: crossing at any Sunwheel, the tether, emerging at other wheels, the seven
memories, the chart, and saving and resuming a run.

## What you see

- **The red sky and the drained land.** The post-process Dark grading
  (`render/post.ts`, `DARK`) is held at full while you're in it. A Dark-only
  murk (`DARK_FOG`) darkens the land a little and sinks far things into a
  red-black haze. The light is a low, tired sun the colour of a bruise.
  Living time stands still while you're there.
- **The land is the living land.** The real terrain stays in view, and the
  sea and rivers with it (black and still under the grading). Everything else
  living goes out of view: people, animals, plants, buildings, roads' furniture,
  islands' and the elves' structures.
- **A dead forest.** Every living tree stands as a dead black one, and the
  Dark's forest is thicker than ours: it stands even where the fields are.
  Graves lean in clusters, and violet cracks run through the ground.
- **Wild ruins.** About one in two 300 m cells holds one: a broken round keep,
  a colonnade, a great arch over nothing, a fallen giant whose face was cut
  away, a huddle of burned shacks round a violet fire, an obelisk, a toppled
  Sunwheel half sunk in the ground, or a gallows. They're solid near you and
  you can climb them.
- **Mirrors of the living places.** Every town, city, castle and port has a
  ruined mirror where it stands: a broken ring of wall, burned shacks, graves,
  a fallen statue and a violet fire. Some are special:

  | Place | Its mirror |
  |---|---|
  | The Royal Capital | A palace older than the one above: a ring of colossal columns, a fallen Sunwheel the size of a house, a faceless king on a plinth |
  | The Elven Sanctum | The World Tree, stone to the crown and long dead, seen from far off |
  | Frostpeak, the Deep Hold, Frosthold | A hold's gate split down the middle |
  | Ghagrabba, the Rust Market, the Waystop | Spires of black glass where a sun that never set melted the sand |
  | Ports | Black hulls on the dry shore beyond the town |

  The first time you come near one, a line tells you what it is.
- **The seven scars.** Each is a floor of fused glass, a ring of leaning
  monoliths you can climb, violet cracks, and a memory stone. The memories now
  tell the war that ended the endless day (see the story guide):

  | Scar | Memory |
  |---|---|
  | The First Wound | Light fell the wrong way, down into the shadow |
  | The Severed Crown | A knight cut a ridge in two to stop an army that never slept |
  | The Unbuilt Harbour | The sea pulled back for a hundred years |
  | The Spear of Silence | Trees turned to stone rather than face the light |
  | The Fallen Horizon | A city that kept its lamps lit for someone else's king |
  | The Rootless Choir | Eleven knights went down; one came back, then went down alone |
  | The Last Footfall | Something remembers being held, and let go |

## What lives there

- **Packs of shades.** About one in two 180 m cells has a pack of two to four
  skeletons and zombies that rise out of the ground when you come within 110 m.
  They're as strong as the living zone there, plus two levels. A cleared pack
  stays cleared for the rest of the trip.
- **The scars' knights.** Each scar keeps a knight (a living armour) and two
  shades, stronger with each scar. They stay dead once killed (saved).
- **Black-iron caches.** About one in three 260 m cells has one: gold and the
  stuff of the Dark (shade smoke, gloam ichor, bone dust, rift shards, and now
  and then a Dusk Elixir at higher tiers). Each opens once (saved).
- **Lost Lanterns.** Besides the Gravewood's ring, the Dark has lanterns round
  each scar and by its wheels. **A relit lantern is a Wardlight: standing by
  one holds the tether** like a Sunwheel does (unless an enemy is close).

## Playing

- At a Sunwheel, choose **Use the Dawn · enter the Dark**. Dismount and stand
  on dry ground.
- The tether panel sits top-left, where the minimap was. **M** opens the Dark
  chart; M or Esc closes it.
- Walk, sprint, climb and glide as normal. Nothing anyone built is solid in
  the Dark: no walls, gates or guards. The Dark's own ruins and trees are.
- Touch a Dark wheel to emerge at its living counterpart, recall to your
  entry, or keep exploring. Emerging checks the living side for room first.
- **Recall** on the panel or chart returns you to where the trip began.
  Exhaustion does this automatically. Death uses the normal death screen, then
  returns you to the entry.

## Tether rules

Unchanged: capacity starts at 90 seconds and grows with living wheels
(+8 s each, first 30), Dark wheels (+35 s each) and memories (+18 s each), to
15 minutes. Damage frays it by `min(15, damage × 0.25)` seconds. Menus pause it.
Sunwheels and Wardlights hold it while no enemy is within 15 m.

## How it works

- **The veil** (`physics/physics.ts`): `physics.veil(true)` switches off every
  fixed collider except the terrain's heightfields, including ones that stream
  in while it's up. Colliders made inside `physics.dark(...)` belong to the
  Dark and stay solid. `veil(false)` brings back everything that still exists.
  Emerging lowers the veil for the overlap check, so a living wall still
  blocks an exit.
- **The scene veil** (`dark/journey.ts`): every visible scene child except the
  land, the sky, you, the particles, the lights and the Dark itself is hidden
  on entry and shown again on the way out.
- `dark/world.ts`: the Dark's streaming (trees every 24 m, sites every 30 m),
  the wheels, scars, mirrors, ruins, caches, packs, fires and ash.
- `dark/ruins.ts`: the ruin kit. Every ruin is built in world coordinates,
  each piece grounded where it stands, and merged into one mesh per material.
- `dark/land.ts`: the scars and the extra paired wheels (logical and physical
  coordinates are now the same).
- `dark/journey.ts`, `dark/tether.ts`, `dark/view.ts`: crossings, saving,
  recall, death, the HUD and the chart.

The Gravewood's scripted echo (Act I) still uses `world/darkRealm.ts` and is
unchanged.

`tests/darkDimension.spec.ts` covers the tether maths, the veil, a real
crossing (the land shown, the veil up, the grading at full, the dead forest),
walking, damage, pausing, an obstructed exit, emerging, a scar's knight and
memory, travel far across the map, saving, reloading, exhaustion, death and
cleanup.
