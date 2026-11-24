# Authored world terrain

The landscape now has regional ridges, shelves, basins, gullies and alternate walking routes across the built world. The shared sampler is used by local ground, streamed heightfields, far terrain, worker tiles, shorelines and vegetation. Main roads and settlement foundations retain their existing profiles; new crossings have independent decks so the riverbed remains open underneath.

## Regional changes

| Area | Terrain and route character |
| --- | --- |
| Elder Glen / Meadow Lane | Western wooded ridge, northern watershed, eastern knoll, meadow shelves, West Ridge Trail and Northspring Walk. |
| Gravewood | Sunken basin enclosed by a raised rim; a connected high approach returns to the graveyard gate. |
| King's Road | Lantern ridge and valley, Lantern Beck and Mere, ridgeway and bank walk, Millbrook hills. Lantern Bridge carries the road. |
| Crown Road | Rocky spurs, Crownwater ravine and basin, Watchman's Spur, an angled road bridge aligned with the actual road; six graded spurs preserve access to the older roadside sites, including the cottage and barrow. |
| Port Aurelle | Coastal headland, southern shelves and a marked headland walk around the established harbour and city. |
| Royal Capital | Northern bluffs and southern shelves; the bluff walk connects the outer approaches. Existing Kingsbridge, city terraces and harbour retain their foundations. |
| White Mountains / Kettle Cove | Eastern spine, hanging basin and tarn, a cascading run following the mountain's fall, Frostpeak spur. Existing winch, Dwarf Road, holds and mine access retain their profiles. |
| Golden Expanse / Ghagrabba | Eastern and western mesas, dry river, saltpan basin, red rim, Glasswind spring and oasis, Redstone Wash route and a graded shelf path to Tinroof. Camp pads and city foundations are reserved. |
| Azure Isles | Limestone shelves and separate stone arches; compact outcrops on smaller keys. |
| Emerald Isles | Forest uplands, two shallow waterfall runs, drainage gullies and stone outcrops away from the established paths. |
| Shattered Isles | Fractured ridges, gullies and stacked stone silhouettes. |
| Sunken Isles | Broken shelves, channels and stone arches around the existing drowned sites. |
| Ashen Port | Basalt spur, ash gully and marked inland pass in the built bridgehead. |

All 43 island records receive a landform definition and a streamed geology feature. The smallest keys have little room outside their quest pads and landing routes, so their changes stay compact. Existing island trails, harbour links, landings and underwater finds remain in place.

## Water and traversal

Seven watercourses and four ponds have independent surface elevations. The same local water query drives carving, surface meshes, wading, swimming, currents, vegetation suppression and land-creature spawn rejection. Existing Millbrook water is included in the local water query, and crop rows and hedges avoid the new channels. Distant tree billboards now share scene fog and display colour handling with the terrain. Lake shores have irregular outlines and a contained bank profile; river inlets flatten before joining a lake, and adjacent surfaces clip to their shared ownership boundary. Water strips follow channel elevations; steeper cascades use a foamy material. Normal-map ripples animate without adding collision surfaces.

Three crossings have physical decks, rails, short approach ramps and bank abutments. Decks and ramps use matching triangle collision meshes to avoid Rapier capsule slowdown on rotated cuboids. Their transforms match the road or trail direction. `heightAt` continues to mean ground or seabed. `walkHeightAt` resolves the new decks for horses, caravans and NPC navigation. The player's character controller follows the actual colliders. Existing native bridges keep their existing collision implementations.

Marked trails are graded to a nominal maximum rise/run of 0.48 (about 26 degrees). Bridge approaches and older protected ground are also checked against the character controller's climb limit. Water has deliberate narrow shoals and bank paths: a shallow first section rises above the surface before the path joins the surrounding ground. Cairns mark their dry ends. Exit endpoints are resolved onto nearby dry terrain and checked for a gentle continuation, rather than raising long strips across a valley. Coastal waterfall mouths retain the sea floor and use the sea surface for swimmers underneath. Pond banks offer native fishing interactions.

Move toward a clear ledge and press **Jump (C by default)** to scramble onto it. The supported lip height is 0.45–1.5 m. A capsule fit check rejects blocked landings and low ceilings; each movement step uses the character controller. Combat launchers retain priority, and scrambling is unavailable while locked on, guarding, attacking, mounted, swimming or flying. The sandbox has a separate lane with 0.65, 1.1 and 1.45 m ledges beside the flat central ring.

Trail guides use the ordinary interaction key. Reading one records a `terrain:seen:*` world flag and adds the trail's map marker. These discoveries use the existing save system.

## Implementation and budgets

- `src/world/landscape/layout.ts`: pure authored data, 256 m spatial buckets, landform reservations, trail profiles, hydrology, bank exits and crossing coordinates.
- `terrainHeight.ts`: original regional sampler plus the shared landscape shaping pass. Terrain workers use the same function.
- `landscape.ts`: nearby water strips, trail strips, bridges, cairns and regional geology. Construction is capped at four features per 350 ms update. Nearby bridges load first on teleport. Geometry is split into short chunks and culled by distance; static geometry is batched by material.
- Unloading removes owned geometry, colliders **and fixed bodies**. Interior/sandbox transitions unload the landscape. `__game.landscape.stats` exposes live chunk and collider counts for profiling.
- `waterLevel.ts`, `GroundWindow`, `StylizedNature` and creature population consult the new local water/path data.

The far mesh now samples the authored world function everywhere. A per-tile coverage texture hides it only where detailed geometry has actually loaded, so pending worker jobs and teleports retain visible ground. This retains the existing terrain LOD system. Software-rendered browser timings are useful regression measurements, not a hardware performance guarantee. Use representative travel and GPU profiling before tightening minimum-spec claims.

## Save compatibility

`terrain:revision` versions the terrain layout. On the first ordinary overworld resume after a revision, old positions are projected to the current walking surface or a nearby dry, walkable bank. Nearby static-floor probes preserve legitimate roofs and galleries. Inventory, quests, discoveries and ships remain in the existing save. An aboard-ship resume keeps the sailing restore path. If a remote water save has no safe bank within 160 m, it stays nearby rather than moving across the world.

## Validation

`tests/landscape.spec.ts` audits regional relief, protected foundations, all island landings, trail grades, local surface/depth consistency, bridge decks, road crossings and dry bank exits. `tests/landscapeGameplay.spec.ts` exercises native jump and interaction input, ceiling rejection, crossing collision, swimming currents, safe migration, discovery markers, streaming cleanup and regional screenshots. `tests/landscapeWater.spec.ts` checks dry shorelines, inlet continuity, bank-exit continuation and waterfall coastal clearance, and captures focused water views. `tests/landscapePhysics.spec.ts` checks deck walking speed, elevated-floor migration and exact worker/main-thread tile agreement. `tests/islandTerrain.spec.ts` retains the existing island traversal and sparse terrain sampling checks.

Release checks: type checking and the production build pass, with eight targeted Playwright tests passing across terrain, island traversal, physics/worker parity, native input, rendering, swimming, ship restoration and coastal navigation. The final anchor audit includes every older Crown Road site and all five scrap towns, and checks that island landings and dive approaches keep their sea-floor clearance.

## Living terrain pass

Seeded boulder clusters, layered shelves and tall split fins dress the existing terrain. Mountain flanks receive larger formations with scattered talus; meadows receive occasional smaller clusters. Dry regions use warm stone and volcanic regions darker stone. Clusters reserve their footprint against settlement, quest and encounter clearings, foundation protection, trails and water. Existing landforms and height data stay authoritative; this pass adds no caves.

Broadleaf and pine placement uses a tighter candidate grid, denser woodland and meadow copses, and more pine pockets up mountain flanks. High summits stay sparse, and steep faces reject trees. Understory and small stones fill out the nearby ground. Small-rock collision now follows the visible prototype height instead of using the tall tree collision cylinder.

Grass uses three instanced rings with multiple individually grounded blades per tuft. The near ring has 1.8 times the previous visible root budget, with about 22% more total grass triangles across the three rings. Woodland and mountain grass coverage increases; steep rock, waterways and forest paths suppress growth. Wind and player interaction continue through the shared shader.

`TerrainDressing` streams within 850 m in three shared rendering batches, simplifies distant formations and creates matching convex-hull collision only within 70 m. Unloading and interior transitions release the fixed bodies. `__game.terrainDressing.stats` reports active cells, formations, colliders, drawn instances and batches.

Regression coverage: `traversalSlopes.spec.ts` exercises real Rapier capsules from flat ground through 65° slopes; `playerTerrain.spec.ts` checks the native player; `terrainLife.spec.ts` checks seeded placement, protection, render budgets and collision cleanup; `terrainRender.spec.ts` renders the production terrain, vegetation and grass shaders in meadow, mountain and woodland scenes.
