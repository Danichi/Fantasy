# Elder Glen: living circuit

The first immersion benchmark is the existing village square, south farms,
east gate, river crossing and a small roadside rest. Its purpose is to make a
short walk readable, inhabited and worth remembering. It introduces no new
main-story branch or alternate geography.

## Recognizable places

- **Market Bell:** a timber belfry with a bronze bell, roof and blue pennant.
  An oak and planted seating pockets give the square a shaded edge. The bell
  can be rung, with a short cooldown.
- **Sheaf Yard:** the granary frontage has loading racks and counted sacks.
  Dora and two grain carriers serve household and Watch supplies.
- **Eastgate Lantern:** lantern pillars and blue-and-gold pennants frame the
  existing gate. The carriage route stays open between them.
- **White-Stone Rest:** a fire, benches, planted rock bank and tree cluster
  just beyond the existing stone bridge. Painted roadside stones identify it.

The same authored names and directions are used on boards, in read
interactions and in local conversations. Residents describe the gate,
granaries, bridge and bell rather than sending the player toward coordinates.
Directions explain the return journey as well as the outward route.

`glenCircuitData.ts` owns the names, positions, worn-earth patches and local
sound sources. Ground wear blends through the terrain splat, so grass density
and foot contacts agree with the visible dirt around the work and rest areas.
`glenCircuit.ts` builds the scenery with the existing painted material and
stylized vegetation kits. Static geometry is batched by material and region;
foliage uses the shared wind shader, while pennants, fire, lanterns and the bell
provide local animation. Authored clearings keep
streamed trees away from the props. The scenery and interactions hide when
leaving the living overworld.

## Work the player can observe

Oswin checks the millrace and carries flour, Dora checks sacks and her ledger,
Hale tends the trough and pasture latch, and Wren sorts and waters wheat.
Two carriers move counted sacks through the granary yard. Selected market
keepers alternate serving and replenishing the bread counter.

Small tasks run within each resident's existing working schedule. Their phase
comes from the world clock, so reloading at the same hour does not randomly
change their job. Ordinary pathfinding, collision avoidance and actor pooling
still own movement and rendering. Conversations hold a worker; weather,
festival and raid rules take precedence. Quest givers keep their established
districts and retain ordinary quest interactions and markers.

Carried sacks, baskets and ledgers are visual props on pooled actors. Carrying
uses an upper-body pose over a walk with arm tracks removed, preserving the
walk's ground speed. Dialogue and emergencies release the carrying layer;
pool release clears it too. Contextual work replies live in the conversation
menu, without extra overhead labels.

## Light and sound

Nearby surfaces keep more contrast in clear weather. Distance still forms blue
layers, with close fog retained for storms and the Dark. Daylight ambient fill
and rim light are quieter so sunlight, roof overhangs and silhouettes read.
Balanced begins at native CSS resolution and bottoms out at 80%; Medium and
High retain at least 85% and 90% of their base resolution. Adaptive steps are
smaller to reduce abrupt clarity changes. Software-rendered test presets remain
separate from the visual benchmark.

The market, granary yard, bridge and rest have distance-faded local audio with
camera-relative stereo pan. Night reduces daytime crowd sound, interiors
muffle weather, and realm transitions silence local sources. Grass and snow
retain recorded footsteps; stone, dirt, sand, wood and water get distinct
filtered contact sounds. Landings use a heavier surface contact. Audio starts
after the existing user gesture and respects mute.

## Validation

`tests/glenImmersion.spec.ts` exercises positional sound, night and shelter,
surface dispatch, task movement, repeatable timing, dialogue holds, rain and
raid overrides, native sign interactions, bell cooldown, visible carrying and
interior hiding/return. A palette check covers normalized GLTF vertex colours
and missing-colour fallbacks in the static batcher.
The existing NPC checks cover unique residents, connected walking graphs,
different walking lanes and personal dialogue.

Inspect the square, farm frontage, gate and rest at normal Medium quality,
including a dusk view. Also capture the four fixed art-direction viewpoints
before committing a visual update. CPU-rendered captures establish appearance;
integrated-GPU frame-rate claims require measurement on that hardware.
