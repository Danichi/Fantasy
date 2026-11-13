# Painted art (Higgsfield)

Bestiary plates, conversation portraits, region vistas and the title painting, all made with
Higgsfield `gpt_image_2_6` (medium quality, 2k) as sheets, then cut up here.

- `gen.py` writes `sheets.json`: the 4x4 bestiary sheets and the 5x5 portrait sheets, with their prompts.
- `slice.py <sheet> <png>`: grid cut of a transparent sheet into `public/assets/art/<id>.webp`.
  `FLOOR=90` strips a faint halo the painter sometimes leaves.
- `seg.py <sheet> <png> [skip-ids]`: cuts by the transparent gaps instead of the grid. Use it when a sheet's
  rows are uneven or the subjects overflow their cells; it checks the count matches.
- `rslice.py region0.json <png>`: cuts a 3x3 sheet of paintings divided by black bars (region vistas, 1280x720).
- `manifest.py`: rewrites `src/ui/art/artManifest.json` from what is on disk. The game only uses art listed there.

Where it shows: `src/ui/bestiaryUI.ts` (plates), `src/ui/dialogue.ts` + `src/ui/art/portraits.ts` (portraits:
named people first, then a stock type picked from their name and title), `src/ui/hud.ts` `regionCard`
(first entry into a region, and a Full Chart), and the first screen (`.overlay.title-screen`).

## Title screen (`public/assets/art/title/`)

- `bg.webp`: the key art (gpt_image_2_6, 16:9, 2k), painted with the left third dark for the menu.
- `loop.mp4`: Seedance 2.0 (720p, 10 s, start and end frame = the key art), then made seamless in the
  Higgsfield sandbox by crossfading the last 1.2 s into the start (ffmpeg xfade), H.264 CRF 25, about 1 MB.
- `icon-*.webp`, `crest.webp`, `divider.webp`, `corner.webp`, `gem.webp`: cut by `title.py` from a 3x3 icon
  sheet and a 2x2 ornament sheet. The crest and corner had a white haze, removed by dropping pale, unsaturated pixels.
- The screen itself: `src/ui/titleScreen.ts` and `.css`. The game's name and tagline are `GAME_NAME` and
  `GAME_TAGLINE` at the top of that file.

## Pause screen, page surfaces, workshop rooms

- `title/icon-{resume,save,title,map,journal,character,rest,guild,gold}.webp`: a second 3x3 icon sheet for the
  pause menu (`src/ui/pauseScreen.ts`, styled by `titleScreen.css`).
- `theme/`: painted surfaces for the menu pages (`src/ui/art/themes.css`): `leather` (the bag panel, with its
  tooled border) and `leather-plain` (its centre, for the small cards), `starchart` (Skills), `seachart`
  (Seamanship), `journal` (Quests, People, Bestiary, Almanac), `herbal` (Herbal and the brewing book).
- `scene/`: a room painted behind each workshop and shop window (`src/ui/art/scene.ts`): forge, kitchen,
  loom, workbench, runestone, alchemy (the brewing bench), shop.
- All gpt_image_2_6 16:9 2k, fetched and cut in the Higgsfield sandbox, then brought down as one zip.

## UI kit (`public/assets/art/ui/`, `src/ui/art/uikit.css`)

- One sheet of six plates (gpt_image_2_6, transparent): red, iron, parchment and leather button plates, a round
  close button and a square item slot. Each long plate was rebuilt in the sandbox as its two painted end caps
  with a mirrored repeat of a clean piece of its face between them, so it stretches as a nine-slice
  (`border-image`, slice 40/110) without smearing the centre ornament.
- `frame.webp`: a carved walnut and gold window frame, rebuilt the same way (real corners, mirrored repeats of
  each edge, the top crest cut out as `frame-crest.webp`). Drawn over the book's edges (`.bk-ornate`) and round
  the shop, workshop and brewing windows.
