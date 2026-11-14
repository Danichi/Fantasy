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

## Story films (`public/assets/film/`, `src/story/film.ts`)

Painted cutscenes played full screen by the story director (`s.film(id)` in `src/story/scene.ts`). Esc or the
Skip button ends just the film; tests and fast mode never play them.

| film | where it plays | shots |
| --- | --- | --- |
| `fall` | New game, the prologue (replaces the whispered prologue lines; captions in `FILMS.fall`) | star over the kingdom, the Hollow King, seven powers round the empty throne, four graves, the star plunging, shades in the wheat, waking |
| `wheel` | Act I, touching the east-gate waystone | the Sunwheel waking under your hand |
| `malric` | Act I, Malric at the crypt | the Wheelbreaker coming up out of the crypt with the box |
| `dark` | Act I, looking through the ring | the Dark: the same hills, the Gravewood rift |
| `bells` | Act I, the Night of Bells | rifts round the Glen, the wall holding |
| `dawn` | Act I end | dawn after the Night of Bells |
| `academy` | Act II, the archive | Port Aurelle and the Academy on the cliffs |
| `feast` | Act II, the Feast of the Dawn | Varro walking through the hall |
| `duel` | Act II, the Plaza of Crowns | Malric waiting, Varro on the balcony |
| `turning` | Act III, the turning of the wheel | the ring of stones turning |
| `wheelshield` | Act III, Ysra steps in | the Wheel-Shield and Ysra |

- Key frames: gpt_image_2_6, 16:9, 2k. Clips: seedance_2_0 / seedance_2_0_mini, 720p, start_image = the key
  frame, no audio. Only one unlimited video job runs at a time.
- Prologue narration: seed_audio, preset voice Helena, all ten lines in one take; caption times from
  faster-whisper, offset 1.5 s.
- Cut in the Higgsfield sandbox with `film_build.py` (crossfades of 1 s, fade in and out, x264 crf 24 veryfast,
  1280x720, 24 fps, faststart).
- The prologue: `film_build.py fall "f1:9.0,f4:9.0,f5:7.2,f6:14.2,f7:12.2,f2:5.8,f3:5.1" prologue.wav 1.5`; the
  others are one 8 s shot each (`bells` 10 s). `wheelshield` plays mid-scene, after Ysra steps in.

## Boss intros and the death screen

- `public/assets/film/boss-<id>.mp4`: a 6 s intro for twelve bosses (Grukk, Edric, the Rust Knight, the Hollow
  Thane, the Mother Ooze, Varga, the Delver, the Wraith of the Wrong Circle, Greymane, Thornhorn, the Kraken, the
  Storm Wyrm). Key frames gpt_image_2_6 written to match each bestiary plate; clips seedance_2_0_mini 720p.
  `BOSS_FILMS` in `src/story/film.ts` matches a boss bar's name to its film; main plays it the first time that
  bar comes up (`hud.onBossShown`), holding the world still; the name and title come up over it.
- `film/death.mp4` + `art/death/death.webp`: the death screen, a sword in a hill at dusk, looped (the same frame
  as start and end image so it loops cleanly), under "You Have Fallen" and a line from the Dawn (`hud.ts`).
