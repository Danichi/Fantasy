# Art Direction: "Storybook Frontier"

The target is a bright, painterly open world in the spirit of Breath of the Wild and Studio Ghibli landscapes: wide, windy, alive, and readable at a glance. Every asset, shader and layout decision follows this page. When something looks wrong, check it against these rules before adding detail.

## 1. The five rules

1. **Colour and light before detail.** Broad, soft colour shapes read better than fine texture. No photographic textures. A surface should look painted, not scanned.
2. **One lighting model for everything.** Terrain, buildings, props, characters and creatures all use the shared stylised lighting (`src/render/stylize.ts`). Nothing ships with its own realistic shading.
3. **Nothing sits on bare ground.** Every building, rock, fence post and tree has grass, flowers, pebbles or dirt around its base. Empty flat ground near the player is a bug.
4. **Distance turns blue.** Aerial perspective does the depth work: near is saturated and warm, far is pale and cool. Hills stack in visible layers.
5. **The world moves.** Grass, trees, cloth, smoke, water, birds and people are always moving a little. A still frame of the game should still suggest wind.

## 2. Lighting

- **Key light:** warm sun (`#fff1d6`), from a high angle, with soft shadows.
- **Shadows are tinted, never black:** shadowed surfaces fall back to a cool sky fill (`#6f8fb8` sky, `#7a7050` bounce from the ground).
- **Diffuse is wrapped and softly banded:** a gentle two-tone ramp with a wide, soft terminator. This is not a hard cel look.
- **Rim light:** a thin, bright sky-coloured rim on characters and creatures separates them from the background.
- **Low specular:** only metal, water and wet stone get highlights, and those are broad.
- **Time of day:** golden hour is the "hero" lighting for screenshots; midday stays bright but not flat.

## 3. Palette (starting meadows and Elderglen town)

| Role | Colour | Notes |
|---|---|---|
| Grass base | `#3f6e2f` | dark, slightly blue-green, at the root |
| Grass body | `#6fa843` | the main field colour |
| Grass tips | `#c8d66a` | warm, sunlit yellow-green |
| Dry patches | `#b9a95a` | low-frequency variation across fields |
| Path dirt | `#b08a5a` | warm, desaturated |
| Stone | `#a7a39a` | slightly warm grey, soft and rounded |
| Plaster walls | `#efe3c8` | warm cream |
| Timber | `#6b4a33` | mid-brown, never near-black |
| Roof tiles | `#b0553a` and `#5d6f8a` | terracotta and slate-blue, mixed |
| Sky zenith | `#6fb4ea` | |
| Sky horizon | `#e3f3f6` | |
| Far mountains | `#a3bccb` | pale and cool |
| Shadow tint | `#3f5d80` | never pure black |

Other regions (crypt, frontier, harbour) get their own small palettes, written down here before they are built.

## 4. Shape language

- **Chunky and readable:** exaggerated roofs, thick canopies, rounded rocks, slightly oversized props.
- **Silhouettes first:** every building and character must be recognisable as a flat black shape.
- **Organic over grid:** houses cluster and lean toward the street, paths curve, and nothing is placed on a perfect grid.
- **Scale cues:** doors, fences and barrels are human-sized, so the size of mountains and trees reads.

## 5. Vegetation

- **Grass** is the signature. Dense, knee-high (0.35 to 0.7 m), thin blades that fade from a dark root to bright tips. Visible wind gusts roll across fields as bright bands. The ground under the grass matches its colour, so the edge of the grass is invisible.
- **Trees** have fat, soft canopies with spherised normals, so they shade like clouds rather than leaf noise. Stylised (Quaternius) models only.
- **Flowers** grow in clusters of one colour (white, yellow, violet), not scattered evenly.
- **Undergrowth:** bushes, ferns and tall grass tufts collect around rocks, fences and walls.

## 6. Architecture (Elderglen)

- Timber-framed houses with cream plaster, steep terracotta or slate roofs, stone foundations, and chimneys that smoke.
- Houses come in at least four sizes and cluster in twos and threes around shared yards.
- Every house gets at least three props from the dressing kit: fence, garden bed, barrels or crates, bench, lantern, washing line, woodpile, flower box, cart.
- Roofs overhang generously, and doors and windows glow warm at dusk.

## 7. Characters

- **Style:** stylised, storybook proportions (slightly large heads, hands and feet), clean shapes, soft painted materials, no photoreal skin or scanned fabric.
- **Clothing reads by colour block:** each named character has one signature colour so they are identifiable from 30 m away.
- **Rig:** every character uses the shared humanoid skeleton (`hips`, `spine`, `chest`, `leftUpperArm`…). Animations are retargeted onto it, so any character can play any clip.
- **Signature colours (town cast):**
  - Hero: sky blue
  - Kaela Voss: teal and white
  - Ser Corvin: gunmetal and deep red
  - Master Veyr: ochre and black
  - Magus Orren: violet
  - Master Fröst: ice blue and leather
  - Villagers: cream, brown and muted green

## 8. Atmosphere and effects

- **Sky:** a painted gradient with soft stylised clouds. No photographic sky.
- **Haze:** height fog tinted toward the horizon colour, strong enough that hills 300 m away read as layers.
- **Always-on ambience:**
  - drifting pollen and leaves
  - wind streaks on gusts
  - birds
  - butterflies over flowers
  - chimney smoke
  - fireflies at dusk
- **Post-processing:** soft bloom on sky and highlights, a light warm grade that lifts shadows toward blue, and a subtle vignette. No chromatic aberration and no heavy sharpening.

## 9. Performance budget (Intel Iris Xe, Medium preset)

- Target 30 to 45 fps at 1080p, with dynamic resolution holding the rest.
- Grass: about 120k blades near the player on Medium (40k on Low, 250k on High). Grass doesn't cast shadows.
- Vegetation beyond 120 m uses impostors or merged low-LOD meshes.
- Only the sun casts shadows, and the shadow box follows the player.

## 10. Checking work

Any visual change gets screenshots from the fixed look-dev viewpoints before it is committed:

```sh
npx vite --port 5190 &
sh tools/views/all.sh <name>     # spawn, vista, meadow, street
node tools/views/grid.mjs <name> # 2x2 contact sheet in screenshots/
```

Compare against the previous sheet. Judge by eye, not by metrics.
