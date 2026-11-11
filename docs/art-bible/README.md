# Fantasy: art bible

The working reference for how the world looks and how its surfaces are made. The rules of the look (lighting, palette, shapes, atmosphere) are in [`../ART-DIRECTION.md`](../ART-DIRECTION.md); this folder holds the material library, the pipeline that produces it, and the roadmap for the rest of the game.

Status, 10 November 2026: the shared surface kit is done and in the game. Creatures, gear, props and the regions beyond the Glen are not yet repainted; see the roadmap at the end.

## 1. The look in one paragraph

A bright, hand-painted world under soft cel light. Surfaces are painted, not photographed: clean shapes, soft brushwork, colour that varies gently, and only a hint of shading painted in, because the sun, the cool sky fill and the blue distance are added by the renderer. Every region keeps the same brush and the same light, and differs in palette, architecture and air.

## 2. Material library

Each sheet shows the tile repeated 2 × 2, as it will repeat in the world. These are the textures the game ships (`public/assets/textures/painted/`).

### Walls and timber

| Plaster | Timber beam | Planks | Masonry |
|---|---|---|---|
| ![plaster](materials/plaster.jpg) | ![timber](materials/timber.jpg) | ![planks](materials/planks.jpg) | ![stone](materials/stone.jpg) |
| Cream lime plaster. Broad stains removed so it does not repeat; the shader adds drift and rain streaks. | Mid-brown oak, grain along the beam, knots. Never near-black. | Warm boards with dark gaps: doors, shutters, stalls, floors. | Warm grey blocks in courses, pale mortar, a few ochre and mossy stones. Plinths, wells, chimneys, bridges (bridges a shade paler). |

### Roofs

| Terracotta tile | Slate | Thatch |
|---|---|---|
| ![tile](materials/roof_tile.jpg) | ![slate](materials/roof_slate.jpg) | ![thatch](materials/thatch.jpg) |
| Beaver-tail tiles, rounded butts pointing to the eave, moss in the joints. | Blue-grey slates, uneven lower edges, lichen. | Layered golden straw, strands running down the slope. |

### Ground

| Cobbles | Packed dirt | Turf | Forest floor | Cliff rock |
|---|---|---|---|---|
| ![cobbles](materials/cobbles.jpg) | ![dirt](materials/dirt.jpg) | ![grass](materials/grass.jpg) | ![forest floor](materials/forest_floor.jpg) | ![rock](materials/rock.jpg) |
| Streets and plazas. Warm and cool greys, moss between stones. | Roads and lanes. Pebbles, fine cracks. | Under the grass blades, as light and shade on the meadow colour. | Under the trees: leaves, twigs, moss. | Projected on steep ground, as light and shade on the rock strata. |

### Dungeons

| Dungeon wall | Flagstones |
|---|---|
| ![dungeon wall](materials/dungeon_wall.jpg) | ![flagstones](materials/flagstones.jpg) |
| Dressed blocks. Tinted per dungeon: grey for the crypt, teal for the drowned shrine. | Floors, and trim on pillars. |

### Whole objects

| Window | Door |
|---|---|
| ![window](materials/window.jpg) | ![door](materials/door.jpg) |
| Leaded glass in an oak frame. The glass is masked so lit windows glow warm at night. | Oak planks, iron strap hinges, ring handle. |

Tree bark ([sheet](materials/bark.jpg)) completes the set.

## 3. In the game

| | |
|---|---|
| ![street](progress/street-before-after.jpg) | Timber frame, before and after. |
| ![well](progress/well-before-after.jpg) | The plaza: cobbles, roofs, thatch, the well. |
| ![crypt](progress/crypt-before-after.jpg) | The crypt hill: cliff rock, cobbles, turf. |
| ![house](progress/house.jpg) | Painted windows and doors on a Glen house. |
| ![crypt interior](progress/crypt-interior.jpg) | The Upper Crypt in painted stone. |

## 4. How a surface is made

1. **Paint it.** The source paintings were generated with Higgsfield (Nano Banana Pro, 2K, square). The prompt that worked, with the subject swapped in:

   > Seamless tileable game texture: *[subject, its colours as hex, its layout: "five even horizontal courses", "about seven stones across", "strands running vertically"]*. Stylised hand-painted texture for a colourful fantasy adventure game: clean readable shapes, soft painterly brushwork, gentle colour variation, only subtle soft ambient shading, perfectly flat even lighting with no directional shadows, straight-on orthographic view with no perspective, the surface fills the whole image edge to edge at one uniform scale, no border, no vignette, no text, no objects.

   Ground textures say "seen from directly above" and "top-down orthographic view". Say how many rows, courses or stones there should be: the count sets the scale in the world.
2. **Keep the source** in `assets-src/higgsfield/<name>.png` (not in git: the folder is ignored, so back it up).
3. **Make it seamless**: add a line to `tools/build-textures.sh` and run `sh tools/build-textures.sh <name>`. `tools/make-texture.mjs` finds the overlap at which opposite edges agree best and joins them along the cheapest path (so rows meet in step and the join runs along mortar and gaps), evens out the lighting, optionally calms broad stains (`--calm`) and pulls the colour to the palette (`--tint`), derives a normal map from the painting, and records the set in `src/render/paintedSets.json`.
4. **Check the sheet** it writes to `docs/art-bible/materials/` (the tile 2 × 2), then check it in the game with `node tools/lookdev.mjs <prefix>` (viewpoints in `tools/views/lookdev.json`).

Sizes: 1024 px albedo, 512 px normal map, WebP. The whole kit is 2 MB on disk. A surface the kit lacks falls back to the simple pattern drawn in code (`PAINT` in `src/render/painted.ts`), so a missing file never leaves a hole.

Whole objects (windows, doors) use `--decal`: no tiling, the picture fills a box face. `--glow` also writes a mask of the glass for lit windows.

## 5. Where the kit reaches

- `paintedMaterials()` in `src/render/painted.ts` builds the shared set (`world.mats`) that 46 world files build with: Elder Glen, the farmsteads, the King's Road, Port Aurelle, the Royal Capital, the frontier, the Gravewood, the sites and lairs.
- `pbr()` in `src/world/props.ts` used to load photographic sets for dungeons, the mine and rock landmarks. It now returns the matching painting, tinted to the same overall colour the photo gave, so each dungeon keeps its mood.
- The terrain shader (`src/world/terrain.ts`) samples cobbles and dirt for streets and roads, turf under the meadows, leaf litter under forests and the rock face on cliffs.

## 6. Region palettes (direction for the work ahead)

| Region | Light and air | Key colours | Surfaces to add |
|---|---|---|---|
| Cresha and Elder Glen | Warm sun, cool lifted shade, blue distance | Meadow greens, cream plaster, terracotta and slate blue | Done: this kit |
| Verdant Elves | Green-gold light through canopy, turquoise glow at night | Emerald, jade, teal, pale silver wood | Elven carved wood, pale smooth stone, giant-tree bark, glowing blossom |
| Crypt and dungeons | Warm torchlight on cool stone, dust in the air | Grey-blue stone, bone, candle wax, rust | Carved relief trim, bone niches, damp moss, each dungeon its own wall |
| Gravewood | Pale moonlight, blue and violet mist, never plain white fog under a sunny sky | Ash grey bark, cold blue, spectral violet | Dead bark, weathered headstone, wet leaf mould |
| White and Deep Mountains | Clear blue daylight, snow glare, forge glow underground | Snow white-blue, granite, warm forge orange, crystal blue | Snow, ice, carved dwarven stone with geometric bands, worked metal |
| Dark Dimension | Crimson sky, violet rim light, ash on the air | Blackened stone, crimson, deep violet | The Glen's own surfaces, corrupted: charred timber, cracked black masonry with violet fissures |
| Orc camps | As the land they stand in | Raw timber, hide, bone, rusted iron, dull red cloth | Hide, lashed logs, bone, daubed warpaint |

## 7. Roadmap

**Keep as they are**
- The lighting model, haze, sky and grade (`src/render/stylize.ts`, `post.ts`, `sky.ts`).
- The grass, the stylised trees, the creature kit's fur and skin shaders.
- The orc models (`orcWarrior.glb`, `orcWarchief.glb`, `orcHouse.glb`) and their rigs.

**Done in this pass**
- The painted kit above, in the world, the terrain and the dungeons.
- Wood grain follows each beam; tiles and thatch hang toward the eave on both roof slopes.
- Painted windows (lit ones glow at night) and doors on Glen houses.
- Grass blades light like the ground they stand on (a morning meadow no longer shows dark blades scattered on bright ground).

**Next, highest impact first**
1. **Props.** Market stalls, barrels, crates, carts, the training dummies, awnings and signs still use flat colours or small drawn textures. Route them to `planks`, `timber` and `thatch`, and paint cloth, rope and straw.
2. **Characters and gear.** The hero, townsfolk, weapons, shields and armour are flat-coloured. They need painted leather, cloth, worked metal and wood grain, applied by projection (they have no texture coordinates to speak of). This is the largest remaining gap between the world and what stands in it.
3. **Creatures and bosses.** Each field boss needs its own surface (Brine-Maw's shell, Mother Ooze's jelly, the Rust Knight's corroded plate, the Hollow Thane's grave-cloth). The creature kit already supports per-species skin; the paintings are missing.
4. **Regions.** One wall, one roof and one ground painting per region from the table in §6, starting with the Gravewood (whose fog is still white under a blue sky) and the Royal Capital.
5. **Roof direction outside the Glen.** Port Aurelle, the capital and the sites build their own roofs; check each for tiles hanging the wrong way on one slope.
6. **Interiors.** Floors, walls and furniture inside houses and shops.
7. **Clean-up.** `public/assets/textures/*_1k.jpg` (22 MB of photographic sets) is no longer loaded once every painting is in place and can be removed.

**Performance note.** The game is tuned for integrated graphics. The kit adds one normal-map sample per surface and three texture samples to near terrain, and uses far less texture memory than the photographic sets it replaces in dungeons (one shared 1024 px painting instead of three 1024 px maps per material).
