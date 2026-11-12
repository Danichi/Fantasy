# Painted VFX (`public/assets/fx/`)

The spell and weapon effects draw a painted layer on top of the procedural
particles: animated bursts, sword-arc ribbons, magic circles, a looping
fireball, a hex shield and a light pillar. The art was generated with
Higgsfield (GPT Image 2.6 for the animated GIF flipbooks and the slashes, Nano
Banana for the circles), every piece on pure black. Code:
`src/fx/vfxSprites.ts` (loading, shader, billboards) and the call sites in
`src/paths/skillFx.ts`, `src/magic/circles.ts` and `src/magic/spells.ts`.

## Look

Realistic, cinematic energy (film-grade fire, ice, lightning and light), with
each school's colour taken from the combat reference boards:

| School (`Style`) | Used by | Burst | Slash | Circle |
| --- | --- | --- | --- | --- |
| fire | Pyromancer, axe | fire | ember | fire |
| light | Lightbinder, Dawnblade | holy | gold | holy |
| gale | Gale Style, sword | wind | blue | arcane |
| wind | Windcaller | nature | emerald | nature |
| frost | Cryomancer, Boundary | frost | blue | frost |
| steel | Cross Style | spark | crimson | blood |
| shadow / void | Shadowcaller, Voidwalker, mace | void | violet | void |
| blood | Warbreaker, greatsword | blood | crimson | blood |
| nature | daggers, druid trees | nature | emerald | nature |
| earth | stone classes | earth | crimson | earth |
| water | sea classes | water | blue | arcane |
| storm | storm classes | storm | violet | arcane |

## File rules

- **Bursts** (`burst_<name>.webp`) and **loops** (`loop_<name>.webp`): 4x4
  flipbooks, 16 frames of 256 px, read left to right, top to bottom. Bursts
  play once (start small, bloom, fade to nothing); loops cycle.
- **Slashes** (`slash_<colour>.webp`): an upside-down U arch whose centre of
  curvature is the image centre, radius about 0.42 of the frame.
- **Circles** (`sigil_<name>.webp`): top-down, centred, a small margin.
- **Ground marks** (`decal_<name>.webp`): top-down, rendered with a real
  transparent background (GPT Image 2.6 `background: transparent`) and kept
  with alpha; they stain the ground rather than glow.
- Everything else is on pure black with no alpha: the shader reads brightness as
  coverage (it glows, and darkens the ground a little behind the bright parts
  so effects read in daylight).

## Adding or replacing art

1. Generate the effect on pure black (see the prompts in the commit history
   for the house style: "realistic cinematic ... AAA Unreal Engine 5 Niagara
   VFX ... pure solid black background, nothing else, never touching the
   frame edges"). For a flipbook use GPT Image 2.6 with
   `output_format: gif, size: 512x512, frame_count: 16`.
2. Save the raw files as `fxgen_<asset>.gif|png` in one folder and run
   `python3 tools/fx/process.py <folder>`. It flattens GIF transparency onto
   black, builds the 4x4 sheet, crushes the black and writes WebP.
3. New keys go in the key types and `preloadVfx()` in `src/fx/vfxSprites.ts`.
   Every key listed there must have a file, or the tests fail on the 404.

`node tools/fx/shoot.mjs [outDir]` boots the game and screenshots each
school's slash, circle and impact.
