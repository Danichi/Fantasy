# Seafaring rebuild — v0.5

The default experience is assisted sailing with a compact HUD. The player can understand speed, heading, sail order, wind and hull condition without buying navigation perks. Advanced trim and detailed instruments remain optional. All crossings are sailed; a sunk owned hull is permanently lost and leaves a searchable wreck.

## Controls and vehicle ownership

All hired rowboats, skiffs and ships use the same coordinator, save path and HUD. The old rowboat controller only updates its own vehicle; it cannot move a sailing helm. W raises the anchor and increases sail or rowing order; S slows, A/D steer, E boards, docks or uses the nearest deck interaction. At a slow harbour approach, docking takes priority over leaving the wheel. P opens ship orders, charts, coastal work, stores, settings and controls. Larger ships support walking the deck and lashing the helm.

The HUD defaults to km/h and plain sail orders: Stopped, Slow, Half and Full. It includes compass heading, wind arrow, hull condition, destination, distance, approximate ETA and actionable warnings. Gunships show left/right reload readiness, ammunition and targets within the battery arc. Harpoons show line length and reeling/cutting controls. The settings menu switches knots, detailed instruments and camera motion; sailing and swimming keys can be rebound, with conflicting keys swapped within their active context. HUD hints follow the bindings.

Swimming is a full travel mode: WASD moves relative to the camera, Shift swims faster, C descends and Space rises. Releasing vertical controls gently returns toward the surface. Surface treading restores stamina and breath. Fast strokes and diving consume stamina; armour increases drag within a capped range. Low air and exhaustion appear in the HUD. Land attacks, rolls, jumping and weapon poses do not override swimming. E climbs a nearby boat or available ladder; shallow ground lets the character wade ashore. Swimming works in river, harbour and ocean water. Boat fishing remains available with a rod while stopped outside a harbour.

## Voyages with a purpose

Sea Legs provides a free training skiff and three visible harbour marks before the return to the quay. A completed course is saved and re-signals the quest on loading. Three short coastal jobs introduce supply delivery, rescue and shoal surveying, each with a visible objective and payment on the return to Aurelle. Each job pays once per game day. An active job, training progress and the voyage log persist.

Charts calculate a route suited to the hull's draft. Direct legs are sampled against seabed depth; obstructed passages use a bounded grid search that considers water, currents and storms, followed by safe simplification. A gold route appears on the water and world chart, and the HUD tracks remaining legs and distance. A route that cannot be found produces an explanation. Routes are advice, never automatic travel.

## Handling, danger and combat

Small assisted boats can make slow progress out of a headwind. Sail response, braking and steering are more immediate. Keel footprint checks replace a single point for grounding. The ship-orders menu can heave to or push a grounded boat toward nearby deeper water, costing stamina and requiring safety from nearby pirates. Anchors hold against normal currents. Storm exposure builds over several seconds so reefing and shelter warnings precede full forces. Deck carry and ships lashed alongside share stable reference frames. Sinking removes the deck collider immediately so survivors can swim and dive the wreck.

Naval shots sweep their travelled segment and resolve the nearest ship or monster contact. Delayed guns in a broadside retain their firing order. Chain shot damages canvas, grape reduces crew, and harpoons tether monsters for reeling or cutting. Pirates have authored combat levels, health, damage and posture based on sea danger; captains and named crews are tougher. Boarding, prizes, ransoms, the Black Tide and all six great monsters retain their combat loops and spoils. Reward guards prevent repeated sinking/death payouts.

## Life aboard and persistence

Ship orders expose rations, fresh water, estimated supply days, daily wages and debt. Provisions are purchased in harbour. Consumption follows elapsed game hours and crew count, and shortage affects morale. Missed wages accrue debt instead of silently removing crew at sea. Existing crew roles, wishes, mutiny, cargo, trade, contracts, customs, repair and refit systems remain connected.

Larger ships have walkable cabins with a chart table, bunk, ledger and trophy shelf. Enter safely at low speed; the exit returns to that ship's deck. Reloading a cabin save resumes safely on deck. The cabin bunk rests until morning.

Version 2 sailing saves add ship motion and orders, helm/deck/boarding resume positions, reloads and ability cooldowns, weather cells, seeded random state, stores, active jobs, routes, encounter phases, damage and boarding casualties. Dynamic monster parts are reconstructed before phase and health restoration. Older sailing saves default to safe anchored ships, assisted controls and fresh settings. Temporary in-flight projectiles are cleared on load.

The sea clock and wind drift advance on the fixed simulation step, independent of rendering. Sea encounters and gameplay rolls use a serialized seeded generator; tests can advance exact simulation steps without waiting for rendering.

## Verification

`tests/seafaring-rebuild.spec.ts` covers the new travel modes, UI ownership, swimming controls, input conflicts, voyage saves, training and job rewards, cabins, encounter restoration, safe chart routes, swept collisions, provisions and migration. `tests/sailing.spec.ts` exercises ownership/refits/crew, storms/deck carry/permanent sinking, naval combat/boarding/harpoons, seamanship, all great monsters, trade/contracts/customs, sea events/regatta and ship life.

Playtest balancing is still valuable: pirate durability, provision prices and long-distance voyage pacing are deliberate tuning points. Iron Kettle transport to the White Mountains continues to depend on that region's coastal landing.

Verification passed across 24 seafaring browser scenarios (the full naval run plus focused regressions), including an isolated browser reload. TypeScript and the production Vite build pass. The sailing card was checked at 1280×720 and 640×360; land combat panels hide during steering/swimming and interaction prompts stay above it. Linux and Windows unpacked desktop packaging were checked; native Windows execution is not tested.
