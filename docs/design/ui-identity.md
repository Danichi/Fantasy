# The Dawn Codex interface

The interface belongs to the same world as the Sunwheels: an adventurer’s
field book, tooled leather, warm brass, worn paper and an oxblood wax seal.
Descriptions should read like a printed folio, not a web dashboard. Keep the
existing painted book covers, portraits, item illustrations and node frames.

## Lettering

| Role | Typeface | Use |
| --- | --- | --- |
| Reading | Alegreya, regular through bold | Descriptions, dialogue options, controls, numbers |
| Display | IM Fell English SC | Names, headings, tabs, engraved world signs |
| Flavour | IM Fell English / italic | Character voices, quotations, marginal notes |

The fonts are bundled locally and work offline. Their licenses are shipped in
`public/assets/ui/font-licenses.txt`. Inter and Cinzel are no longer part of
the game’s font kit. Developer diagnostics can still use monospace.

`src/ui/typography.ts` loads the kit before the world is constructed. This
matters for lettering painted onto canvases: an early fallback font would
otherwise stay baked into signs and skill-tree labels. HTML uses
`--font-body`, `--font-display` and `--font-flavour`; the older `--sans`,
`--serif`, `--fell` and skill-screen aliases resolve to those roles too.
Canvas text uses the same family names in valid canvas font strings.

Use 16–17px reading text in descriptions and notes, a clear heading above it,
and tabular numbers for changing resources. Keep tracking modest. Large
display lettering should not spread into every sentence or small counter.

## Surfaces

`src/ui/codexTheme.css` owns the shared identity. Two small SVG assets provide
stretchable nine-slice surfaces:

- `codex-leaf.svg`: uneven paper edges and a quiet printed corner detail.
  Skill descriptions and hover notes use dark ink on this light surface.
- `codex-plaque.svg`: substantial chamfered brass, leather and stitching.
  Menus, gear details, compact HUD panels and controls use warm light ink.
- `dawn-seal.svg`: the Sunwheel pressed into red wax. It marks notes without
  inventing a new faction emblem or changing the game’s name.

Use framing without a center fill when preserving a page’s existing painted
background. Interior lists should usually have a divider or a stamped state,
not another floating outlined rectangle. Keep class colors, item rarity,
comparison colors, disabled states and visible keyboard focus meaningful.

The selected skill is a readable parchment leaf in its side pane; clicking a
node brings that leaf into view immediately. Gear
details sit in a leather inset. Skills, attributes, mastery, the class atlas,
inventory, journal, workshop, dialogue, navigation, traversal, sailing,
technique library and Dark interface share the lettering and material rules.
At narrower widths, the inventory’s selected item moves below its bag grid;
the narrowest layout stacks the character sheet and bag with scrolling.

## Hover notes

`src/ui/codexTooltip.ts` provides one shared note outside clipped canvases
and panels. Plain `title` hints in the game UI are migrated automatically,
including hints added when a screen rebuilds. Rich notes use `codexHelp().show`
with a title, reading text, optional category and footer, and an optional
viewport anchor. Skill trees supply their node’s screen rectangle; they no
longer draw the old little name box into the canvas. Cartographers’ map
annotations use the same note instead of a small canvas rectangle.

Notes support pointer hover and keyboard focus, preserve existing accessible
descriptions, stay within the viewport and allow long text to scroll. Escape,
page changes, removed/hidden owners and pointer capture dismiss them. All note
content is text, including content that resembles HTML. Combat does not acquire
new floating enemy-head tooltips.

Menu changes also cancel stale mouse-capture requests. A closing skill page
must not capture the pointer after the inventory has opened.

## Verification

`tests/codexUI.spec.ts` checks title migration, keyboard access, changed hints,
viewport edges, resize dismissal, long text, safe text rendering, owner cleanup, the real skill
hover and selected card, inventory item clicks at normal and compact sizes,
map annotations and the other book pages. It captures UI previews and the four fixed world
viewpoints used by `tools/views/all.sh` to check baked lettering as well.

Keep screenshots long enough for short entrance animations to finish. The
existing skill progression, stat, keyboard-learning, save/reload and mentor
tests remain the regression checks for the menu’s underlying behavior.
