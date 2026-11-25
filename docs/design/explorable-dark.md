# The explorable Dark

The Dark is now a traversable ancient mirror of the playable continent. Use
the Dawn at any accessible Sunwheel, explore on foot with the existing combat,
climbing and gliding systems, and emerge through another wheel. It is older
than the current kingdoms: petrified woodland, exposed sea beds, fused impact
basins, broken monoliths and cleaved ridges replace roads and towns. A real
passage runs beneath the severed ridge west of Elder Glen.

The Champions’ Game and the Hollow King remain the main story. Present-day
wars remain wars between mortal governments and armies; great powers’ influence
does not make every nation their property. The Dark gives another approach to
a defended place, without changing reputation or pacifying the troops there.
The Queen’s blockade and the eastern army’s preparations still exist in the
living world.

## Playing

- At a Sunwheel, choose **Use the Dawn · enter the Dark**. This crossing works
  before learning living-world fast travel. Dismount and stand on dry ground.
- The tether panel shows current time, permanent capacity and the bearing to
  the nearest wheel. **M** opens a dedicated Dark chart; M or Esc closes it.
- Walk, sprint, climb and glide using the normal traversal controls. Terrain,
  petrified trunks, rocks and the ancient ridge passage have their own collision.
- Ancient wheels shelter the tether. Nearby enemies prevent that shelter;
  neither shelter nor opening a menu repeatedly refills the timer.
- Touch a Dark wheel to emerge at its living counterpart or keep exploring.
  A newly found wheel also attunes its living counterpart. Normal fast travel
  retains its existing story gate.
- Collect memories at the glowing blue stones on seven ancient battle scars.
  These explain what the landscape remembers and extend the tether once each.
- **Recall to entry** on the panel/chart returns to the place where this trip
  began. Exhaustion does this automatically. Health is not restored by recalling
  or crossing. Death uses the normal death screen, then returns to the entry.

## Tether rules

Capacity starts at 90 seconds, with the following permanent gains:

| Discovery                   |                Capacity gain |
| --------------------------- | ---------------------------: |
| Living Sunwheel attunement  |  +8 seconds, first 30 wheels |
| Ancient counterpart attuned | +35 seconds per unique wheel |
| Ancient memory              |  +18 seconds per unique scar |
| Maximum capacity            |                   15 minutes |

Discovering a wheel or memory adds only that newly earned capacity to the
current run. Taking health damage frays the tether by `min(15, damage × .25)`
seconds. Small poison/burn ticks therefore do not multiply a fixed per-hit loss.
Blocking a blow without health damage does not fray it. Tether pauses
in menus and during the title/loading/pause screens. Offline time is not charged.

Every run saves its entry wheel, logical map position, height, health and remaining time.
Reloading resumes the same connection, with no refill. The ordinary world
position in the save remains a safe living anchor; invalid run data falls back
to that position. Dark memory, attunement and defeated-sentinel flags persist.

## Geography and crossings

The main network’s existing wheels, including all twelve wild stones, have
ancient counterparts. Wild stones can be found in the Dark before their living
inscriptions have been read; inscription/quest progress is kept separate.

Additional paired wheels connect Elder Glen’s western palisade, the far river
bank, Aurelle’s sea approaches, the forest near Eastwatch, the White Mountains,
the western and southern marches, the eastern requisition camp, and one shore
in each built island group. Destination overlap, slope and water checks select
a clear emergence spot near a wheel. An obstructed destination leaves the
player in the Dark with recall available.

This uses the current playable map’s coordinates. The newer painted political
map concepts do not silently relocate the game’s existing settlements.

The original Gravewood mirror fight remains a scripted story echo, using its
existing quest state and six shades. Its story rite is separate from the Dawn’s
free-exploration option on the same pedestal. The standing-stone vision and
opening’s Dark incursions also keep their existing cinematic behavior.

## Implementation and verification

- `world/dark/land.ts`: ancient heights, scars, logical/physical coordinates,
  paired passage definitions.
- `world/dark/world.ts`: streamed heightfields and meshes, nearby prop collision,
  petrified trees/rocks, Sunwheels, memories, ancient sentinels and disposal.
- `world/dark/tether.ts`: permanent progression and resumable run state.
- `world/dark/journey.ts`: crossings, safe emergence, attunement, recall,
  exhaustion, health damage, death recovery and save restoration.
- `world/dark/view.ts`: tether HUD, bearing, chart and recall controls.
- `dungeon/realm.ts`: a separate outdoor realm mode, with saved/restored lighting,
  hidden living visuals and a Dark ground override.

Physical Dark coordinates are offset from the living world, so its walls cannot
block ancient paths. Heightfields and visible ground use the same samples.
Only nearby terrain and prop collision is kept; departure removes all Dark
colliders, enemies, meshes and climb registrations. The living water query
rejects Dark coordinates, so exposed basins do not accidentally become ocean.
Nearby trees and rocks use their rendered meshes for collision. Forest and
island destination structures are warmed at the target position before checking
an emergence spot, without moving the player prematurely.

`tests/darkDimension.spec.ts` covers tether math and persistence, real Sunwheel
entry, native movement and terrain collision, health damage, pause behavior,
different-wheel emergence, memory gains, travel beyond the old mirror limit,
save/reload, exhaustion, death recovery, cleanup and distant/stale entry rejection.
