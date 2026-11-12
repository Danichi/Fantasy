# Port Aurelle: the bright harbour

Port Aurelle is Cresha’s working maritime city: cream stone and blue slate above two sheltered basins, an Academy above the roofs, and older quays beneath the streets. The rebuild preserves existing character IDs, Academy ranks, Quiet Hands obligations, sea quests, guild progression and save slots.

## Geography and navigation

`src/world/portCity.ts` is the worker-safe source of truth for the city footprint, scalloped quay, terraces, causeway, street graph, district anchors, fishing neighbourhood and sailing berths. Construction, quests, festivals, residents, terrain and sailing use these locations. The inner harbour holds fishing craft and training boats; the outer basin serves commerce and expeditions. Four owned-ship berths and a separate rental berth sit beside the piers. Larger fleets use spaced offshore moorings; migration uses the same allocation.

Eight surface districts:

- Westgate and Caravan Court: the King’s Road approach, coaches and stables.
- Grand Exchange: covered arcades, specialist shops, public notices and the Guild approach.
- Academy Heights: three sword schools, ring, library, mess, dormitory and oath wall.
- Crown Heights: the citadel chart room and the Aurelle family’s gardens.
- Great Quays: warehouses, customs, bell, trade board, cranes, ship access and crews.
- Netters’ Reach: fish auction, boat hire, drying nets, households and communal kitchen.
- Forgewater: foundry, expedition office, shipwright, dry dock and ropewalk.
- Lantern Ward: lodging courts, canal bridges, the Drowned Lantern and old service passages.

The old customs vault, Quiet Landing and flooded cistern share the undercity. The red-hand trapdoor still follows the existing Quiet Hands quest. The old customs and pump-house doors provide additional entrances. The lighthouse has a separate two-level signal interior, machinery well and walkable gallery.

The nautical kit shares painted materials and batches small geometry spatially. Fixed infill lots keep roads and landmark courts open. Shutters on every façade, balconies, chimneys, striped awnings, planted courts, ropework and signs establish the port’s character. Door records preserve interior services.

## False Lights

Six linked quests introduce a self-contained harbour investigation alongside the existing main story:

1. **An Empty Berth:** inspect the Brightwater’s mooring, listen to Nell and report to Mira.
2. **Marks on the Cargo:** obtain an official customs copy or the warehouse’s rear tally; compare the cargo marks.
3. **What the Water Keeps:** recover the oilskin log from the nearby wreck and compare Edda’s signals.
4. **A Favour Below:** recover the guarded vault ledger or bargain with Sallow; pay gold or settle an existing obligation.
5. **The Harbour’s Witnesses:** secure testimony and choose Academy protection, Quiet Hands access, or public exposure.
6. **The Night of False Lights:** begin the night operation, defeat Captain Serrat, climb to the lighthouse gallery and restore the signal, sound the rescue bell, and decide the warehouse’s future.

Academy protection removes the signal captain’s accompanying guard. Quiet Hands support opens a maintenance approach. Choices and collected evidence are quest flags, while the restored light, returned crew and memorial follow persistent world state. The confiscated warehouse’s charter records the chosen community use. Barrow offers the rescuer’s gold pennant after the story.

## People and local work

Six additional stories:

- **A Bowl for Every Boat:** supply grain and prepare communal supper. The kitchen offers a daily restorative meal.
- **The Crooked Frame:** inspect the dry dock and test the fastening. Tessa opens her workbench.
- **The Anchor Holds:** follow an arrival slate to Bess’s old navigator. He returns to the tavern and Bess reduces the room price.
- **A Better Debt:** after the existing Aldric story, help him begin honest work in Netters’ Reach. His morning schedule changes.
- **Proof Against the North:** test the expedition’s lantern, rope and supplies. Supply chests appear and Bruni awards a lantern.
- **The Favour Comes Due:** if the player owes Sallow, recover a customs copy and choose how to settle that obligation.

Registered residents retain day/night schedules, with work, market, kitchen and tavern destinations spread across districts. Harbour arrivals and departures follow the clock; nearby moving dockworkers carry cargo. The bell marks morning, noon and evening. Harbour Week adds waterfront pennants alongside the existing festival, fish competition and regatta systems.

Repeatable local activities are a morning fish auction, daytime hoist work, afternoon senior-cadet exhibition and evening tavern music. Purchases, paid work, exhibition entry and communal meals have saved daily limits. Existing fishing, trade contracts, ships, crews, crafting and regatta progression remain available.

Eighteen authored discoveries award one-time XP and modest gold. They include ship traditions, reused foundations, shared courtyards, local memorials and details connecting households to the sea.

## A room at the Anchor

Bess rents the player a permanent local room for 120 gold, reduced to 75 after helping her navigator. The room has a bed, chart table, letters and a chest holding forty inventory stacks. Equipment quality and runes survive storage and saves. Equipped items, attuned spells and items on the action bars cannot be deposited. Letters respond to completed harbour stories. Sleeping restores health, mana, stamina and armour.

## Combat progression

Encounter strength is authored by location and rank, rather than tracking the player’s current gear.

| Encounter | Level | HP | Base damage |
|---|---:|---:|---:|
| First ladder cadet | 14 | 1,800 | 62 |
| Wren | 15 | 2,100 | 68 |
| Dorian, ladder | 17 | 2,600 | 78 |
| Lyra | 20 | 3,400 | 92 |
| Sable | 22 | 4,100 | 108 |
| Hadrik | 25 | 5,000 | 128 |
| Marrow | 28 | 6,400 | 148 |
| Entrance trial | 16 | 2,800 | 78 |
| Rival quest | 15 | 2,400 | 72 |
| Vault guard | 16 | 1,600 | 65 |
| Signal captain | 23 | 4,800 | 98 |

Gale partners use mobile skirmishing, Boundary partners use heavier defence and retaliation, and Cross partners press close openings. Academy duels remain non-lethal. Explicit non-boss classification keeps their posture rules appropriate despite higher HP.

Practical lessons teach dodge-and-counter, perfect parries and guard counters against a real practice partner. First Lessons requires completion of one chosen school’s practical alongside the instructor introductions. Earlier mastery counts, and completed older saves keep their progress. Completion is recorded once, with repeat practice available. Leaving the ring or starting a duel ends the practical and clears its damage floor.

Eastward road tiers rise from the introductory Glen encounters to level 14 approaches and level 18 port-country encounters. Creature health now grows quadratically with level; wild-danger scaling is steeper too. Instanced dungeons use authored tiers rather than deriving strength from their remote world coordinates. Port cistern rats and their matron are substantially stronger than farm pests.

## Save compatibility and lifecycle

`port/migration.ts` runs once for saves predating layout revision 2. It relocates a hero inside the changed footprint to the safe arrival street, and reassigns berthed ships and rentals without altering cargo or upgrades. Voyages, other regions, character progression, quest IDs and obligations retain their data.

PortLife owns event subscriptions, temporary combatants, practical lessons and interior additions. Temporary actors are cleared on exit/reset; state-dependent scenery is reconstructed from quests and flags. PortKit owns its procedural scenery and colliders.

## Validation

The rebuild has dedicated Playwright coverage for its structure, harbour depths, complete investigation, guarded and negotiated evidence routes, non-lethal combat tiers, public walking routes, practical mastery, daily reward limits, quality-preserving storage and legacy migration. Existing Academy, port and interior tests also exercise the retained progression.

Run with the normal bundled Playwright browser, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an installed Chromium executable. GPU-less runs use `PW_SWIFTSHADER=1`.
