# Discoveries and encounters in a world at war

This update implements recommendations 2 and 3 after the traversal toolkit: more things worth finding, and more varied situations on the journey. The Champions’ Game remains the main story. Public regional wars and the Dark’s rifts supply additional context, without revealing the Accord or making every nation a great power’s directly controlled territory.

## Playing

There are 28 authored stops: 15 investigations and 13 situations. Look for notched route stakes, scraps of dispatches, stone records, survey rings, small roadside camps and violet breaches. Ordinary **E** interactions advance them. Each investigation has three physical points; the first two clues lead to the next point, and the last awards its find. Lookouts also ink a small surrounding area on your map. Existing quiet discoveries around Elder Glen remain available.

**J → Field Notes** keeps discovered accounts, the next clue, regional context and resolved outcomes. Only sites you have seen receive exact map markers. Ask a road traveler **“Any local leads?”** for one regional lead and an approximate map circle. Leads do not disclose every site or replace the main quest tracker.

Situations have different responses:

- **Refugees:** share one Health Draught or two Sungrass bundles. Supply checks happen again when you choose; leaving costs nothing. Aid earns a local civilian safe-conduct.
- **Checkpoints:** use a relevant safe-conduct, challenge forged authority with discovered evidence, pay the stated toll, fight, or leave. A checkpoint is a hired company’s local obstruction, not a declaration that every person in that nation is hostile.
- **Convoys:** agree to clear the raiders, defeat the armed party, then return to the camp to resolve the situation. The wagon and its civilian leave along the marked path. Reward and safe-conduct are claimed once.
- **Rifts:** bind three notched ward stakes in order, defeat the two entities released by the breach, then return to seal it. Closing a rift does not count as defeating a national army or reduce the ordinary war’s pressure.

Authored enemy tiers are fixed by the region and encounter, never scaled from the hero’s current level or gear. Surface raiders use the existing humanoid combat system; breaches release actual skeletons and zombies. These are localized field encounters, not armies fighting a global conquest simulation.

## Political context

`frontiers/context.ts` separates mortal governments, local pressures and supernatural seats. Cresha is an independent crown; Valoria remains independent in the wider lore. Elven councils and dwarven holds make their own decisions. Worship or a divine sanctuary does not turn every resident into a god’s soldier.

- Cresha’s heartland faces exhausted supply routes, displaced families and several simultaneous demands on the same wardens.
- The Crown Road suffers orc raids, false toll orders and hired companies profiting from the fighting.
- The forest frontier involves armed logging crews, protected crossings, reprisals and local agreements.
- The holds face food diversion, ore embargoes and pass-road extortion. An anvil badge alone is not proof of service to the Iron Below.
- The Sunspire Sultanate’s conflicts concern wells, convoy access and unauthorized water levies.
- Island communities remain independent while rival fleets demand timber, supplies, salvage and crossings.
- The Demon Lord is preparing stores on the eastern staging coast. The Queen still holds the dangerous sea crossing; neither fact makes her sovereign over every surface port.
- Dark breaches cross political boundaries and are a separate danger from the war.

Resolved aid, convoy and challenged checkpoint situations contribute up to three local relief flags. Paying a toll only buys your own passage and contributes no relief. On the existing King’s and Crown roads, relief modestly reduces bandit/orc encounter weights and increases engineers relative to displaced travelers. Road dialogue acknowledges the local improvement. It does not end a war, change a nation’s sovereignty or rewrite the Champions’ Game.

The approved map images guide later geographical work. This content uses the current playable terrain, roads and authored island paths; it does not move the existing cities and quest coordinates to match the concept artwork.

## Persistence and lifetime

All progress uses the ordinary world flags under `field:<site>:*`: discovery, heard leads, ordered steps, combat activation, defeated-enemy bits, completion and outcome. Supplies, payment and completion are checked again when a dialogue response executes. Rewards cannot be claimed by reexamining a completed find or replaying an old response. Enemy deaths are recorded before streaming unload; leaving does not resurrect already defeated members of the party.

At most three stops within 190 m have live scenery. Enemies are owned by their active situation. Interiors, the Dark mirror, distant travel and test resets remove their scenery, actors and bolts. Asynchronous civilian loads check that their site still exists before attaching a body. Shared character assets and world materials retain their existing ownership.

`frontiers/catalog.ts` holds authored content, `progress.ts` holds persistent state, `scenery.ts` builds the field furniture, and `frontierLife.ts` connects interaction, combat, streaming, rewards and map notes. The existing `encounters.ts` gains displaced travelers, dispatch riders and bridgewrights on roads, plus regional reports and relief weights.
