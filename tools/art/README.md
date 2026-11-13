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
