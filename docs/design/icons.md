# Icons

Every item, skill, spell, origin ability and class has its own icon. There are
two kinds:

- **Painted icons.** These are drawn in code in `src/ui/art/`. They cover
  potions and brews, herbs, food and fish, books and paper, jewellery and
  trinkets, keys, monster parts and materials, armour and shields, and every
  skill, spell and origin emblem.
- **3D renders.** These are renders of the in-game model, made by
  `src/ui/icons.ts`. They cover weapons, ammunition and tools, so each icon
  shows exactly what the hero holds.

## Look

The light comes from the upper left. Each shape gets these layers:

- a body gradient;
- a darker band along its lower-right edge;
- a soft gloss;
- a dark painted outline and a drop shadow, from `finish()` in `art/finish.ts`.

Only solid parts get the outline. Glows and smoke stay soft. 3D renders use a
studio rig: a warm key light, a cool rim light, a fill and sky reflections. A
filmic curve keeps highlights from clipping, and long weapons are drawn a
little thicker across.

Skills use a medallion in the class's colours with a metal rim:

| Class family | Rim |
|---|---|
| Combat | Steel |
| Magic | Gold |
| Callings | Bronze |

Each skill also gets its own motif on the medallion.

## Adding a new thing

1. **An item.** Add an entry in the matching table in `src/ui/art/`:

   | Table | Holds |
   |---|---|
   | `POTIONS` / `BREWS` | potions and brews |
   | `PLANTS` | herbs and plants |
   | `FISH` | fish |
   | `FOODS` | food |
   | `PAPERS` | books and paper |
   | `TRINKETS` | jewellery, trinkets and keys |
   | `PARTS` | monster parts and materials |
   | `ARMOURS` | armour and shields |

   Weapons need nothing: their model is rendered.
2. **A skill, spell or origin ability.** Add its emblem in
   `src/ui/art/emblems.ts` (`EMBLEMS`). `tests/icons.spec.ts` fails if one is
   missing.
3. **Bake.** With the dev server up, run `node tools/bake-icons.mjs`. It writes
   256 px WebP files to `public/assets/icons`.

To look at art without starting the game, open
`/tools/art-preview.html?ids=a,b` on the dev server. `?prefix=brew_&tier=3`
and `?prefix=emblem:` also work.
