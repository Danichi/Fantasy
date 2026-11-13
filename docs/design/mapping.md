# Mapping: discovery, pieces and rumour maps

The world map no longer draws itself. You find it.

## Two layers: sketch and ink

`world/discovery.ts` keeps two bitmasks over the 60 m map grid.

- **Sketch** (`cells`): where you've been. Walking pencils in a rough outline within 260 m, and a pencil trail follows you (a point every 24 m, last 900 kept). From high ground (over 120 m up) the land below sketches itself in, up to 900 m away.
- **Ink** (`ink`): what you actually know. Only ink names places and draws the real map. Ink comes from:
  - map pieces, old charts, the sea chart and survey sheets (below);
  - roads you've walked (that stretch of road only);
  - towns: arriving inks 380 m around it, and its signposts name towns within 2600 m.

`classic` (the "Auto-ink" toggle on the map) inks as you walk, like the old automap, for players who want it.

Old saves migrate with everything they'd seen already inked.

## Map pieces

`items/mapItems.ts` + `world/cartography.ts`.

Each of the 18 regions is cut into 4 to 8 pieces (farthest-point partition of its cells, numbered north to south). Reading a piece inks its patch and shows where it went.

Where pieces are:

1. Piece 1 of every region: the Royal Cartographer (Ysolde Penwright) sells it once you've set foot in the region.
2. Piece 2: in the hoard of the region's boss, if it has one (drops on `bossSlain`).
3. The rest: in world caches (satchels, map cases, nests, cairn stones), off the roads. Every third cache also holds a treasure map.

All of a region's pieces give its **Full Chart** (400 xp). Titles at 3, 10 and 18 charted regions: Surveyor, Cartographer, Mapmaker of the Known World. The Cartographer pays 300 gold to copy each Full Chart.

Other papers:

- **Old charts**: a whole region in ink, but old. A few places on it are gone; walk within 140 m of one and you strike it out.
- **Sea chart**: the four isle regions.
- **Survey sheet**: everything you've sketched within 600 m goes into ink.
- **Treasure maps**: 25, each a scrap showing a patch of land and an X. Lay it beside your map, work out where it is, dig there. Some turn up in fishing nets.

## Your marks

The map has tools: pan, pin, circle, line, note, strike and erase, with five inks and a glyph picker. Marks are saved. Right-click toggles a pin, and your waypoint is the last pin.

## Guild Hunt Walls

Each guild hall's Hunt Map tab is a wall of what the guild has heard (`cartography.wallMarks`). None of it is on your map.

- **Rumour**: a beast you haven't heard of. A red dashed circle 460 m wide around a guess that drifts every ten days.
- **Sighting**: one you've heard of. A tighter 260 m circle.
- **Lair**: a found beast, exact.
- **Place**: a dungeon or ruin nobody's mapped.

"Lay your map beside it and copy" opens your map with the wall's paper beside it. You either copy a mark by hand (drag a circle on your sheet) or buy the clerk's copy (rumour 70, sighting 45, place 25, lair 20 gold).

When you find a beast you'd copied a rumour of, your circle snaps to a skull on its lair. Report it at a Registrar for 80 gold and 150 xp.

## Dungeon plans

`dungeon/plans.ts`. Dungeons keep their hand-drawn maps (`ui/dungeonMap.ts`). Plans lay over them in dashed brown.

- **Builders' plans**: the Old Crypt, the Drowned Shrine and Hollow Ridge in 3 pieces, the Glen Mine in 2. Each piece covers a west-to-east strip of every floor.
  - The pieces lie on the dungeon floors with the delvers' notes, in rooms off the main way.
  - The builders left gaps where their secret doors are.
- **Guild plans**: the whole floor, sold by the Quartermaster for Marks. Secret doors are drawn as walls until you find them.
- **Errors**: 7% of a builders' plan's inner walls are wrong (3.5% on a guild plan). Outer walls are always right.
- **Cartographer's Eye** (the Delver perk that already gave the automap): crosses out the wrong walls in red once you've seen the room.
- **Delvers' notes**: 12 pages, 3 per dungeon. Reading one pins its first line on your map where you picked it up.

## Art

All generated in Higgsfield (gpt_image_2_6, medium quality, unlimited plan):

- `public/assets/icons/`: map items, mapglyph/, notice/ and treasure/ sheets.
- `public/assets/ui/map/desk.webp`: the map's desk.
- `public/assets/ui/map/guildwall.webp`: the Hunt Wall.

## Tests

`tests/mapping.spec.ts`.
