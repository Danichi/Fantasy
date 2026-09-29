# Fantasy RPG: combat and movement foundation

A third-person, Souls-like fantasy action game that runs in the browser. It is
built with three.js for rendering and Rapier for physics. This first slice
covers the Training Grounds at the edge of a medieval town, a knight you can
equip, and slimes to fight.

## Run it

```
npm install
npm run dev          # http://localhost:5190
```

Click the title screen to lock the mouse. Press **Esc** to release it and
pause.

URL options:
- `?quality=low|medium|high`: quality preset. Medium is tuned for Intel Iris Xe.
- `?debug`: exposes `window.__game` for poking at the game from the console.
- `?test`: no title screen, no slime spawner, and it never pauses. The tests use this.

## Controls

| Key | Action |
|---|---|
| WASD | Move |
| Mouse | Look (wheel zooms) |
| Shift | Sprint (uses stamina) |
| Space | Dodge roll. Standing still gives a backstep. Both have invulnerability frames. |
| Left mouse | Light attack, which chains into a 3-hit combo. Hold for a charged heavy attack. |
| Right mouse | Block with a shield. With two swords, it's an off-hand attack instead. |
| F | Parry. Time it to a slime's leap to stun it, then hit it for a critical. |
| Middle mouse / Tab | Lock on |
| R | Cast the attuned spell (Fireball or Healing Light) |
| C | Jump |
| 1–8 | Hotbar: equip a weapon, attune a spell, drink a potion. Shift+number puts a sword in the off hand. |
| I | Inventory and equipment. Click to equip, shift-click for off hand, drag items onto the hotbar. |
| K | Skills: spend XP on combat classes, magic classes and callings, open their skill trees, and spend attribute points. |
| Tab | Switch the bar between quick items (1–4) and moves (1–6) |
| Q / middle mouse | Lock on |
| E | Interact: enter the crypt, open chests, unlock gates, take stairs |
| M | In the dungeon: open the map to draw walls, floor, icons and notes |
| H | Controls |

## The stand-in character and Mixamo

Until you download the Mixamo files, the player is the grey three.js "Xbot"
mannequin, dressed in a dark gambeson. It has only idle, walk and run
animations. Every attack, block, parry, cast and roll is posed procedurally
with IK in `src/combat/actions.ts` and `src/player/rigLayer.ts`.

To switch to a realistic character with motion capture, follow
**`tools/mixamo-checklist.md`** and run `npm run import:mixamo`. Any clip you
provide replaces its procedural version automatically, and any clip you skip
keeps the procedural one. Weapons and armour attach through hand and limb
frames measured from the skeleton, so they fit any Mixamo character.

## The crypt (first dungeon)

The crypt entrance is at the end of the north road, in the hills. Inside:
- **Upper Crypt:** a labyrinth with a locked portcullis. The key is in a chest somewhere on your side of the gate. Beyond the gate are the stairs down.
- **Lower Crypt:** Grukk, the Orc Warlord, waits in his hall. He wields a giant odachi (cleave, spinning sweep, three-hit combo, leaping slam, kick) and a war bow, and he's faster below half health.

You map the dungeon yourself: the minimap only shows where you are and which way you face. Press **M** to draw. Enemies drop XP and gold. XP is a currency: press **K** to invest it in your classes and callings, open each one's skill tree, and spend attribute points. Mentors in town teach new classes, switch your active combat class, and reset a class for 75% of its XP. Progress, gear and your maps save to the browser automatically.

## Layout

```
src/
  main.ts              boot + fixed 60Hz loop, hit-stop, render interpolation
  core/                input (rebindable, buffered), events, math, quality presets
  render/renderer.ts   renderer, HDRI sky, sun shadows, dynamic resolution, optional bloom/SMAA
  physics/physics.ts   Rapier world, character controllers, collision groups
  world/               terrain (splat-blended PBR), grass, houses, palisade, props, dummies
  player/              character loader, rig layer (IK, grip frames), player controller, camera
  combat/              action timing data (hit/parry/i-frame windows), targets
  items/               item data, equipment/inventory, procedural sword/shield/armour models
  enemies/             slimes (jelly shader + AI) and spawner
  magic/spells.ts      Fireball, Healing Light, potion effects
  paths/               classes and callings: data, XP investing, attributes, tree points, mentors
  fx/particles.ts      pooled particles and jelly droplets
  ui/                  HUD, inventory, skills screen and skill trees, icons, overlays
tools/
  mixamo-checklist.md  what to download from Mixamo and how
  import-mixamo.mjs    FBX -> GLB, root-motion extraction, manifest
  fetch-polyhaven.mjs  download CC0 textures/models
  optimize-props.mjs   simplify Poly Haven photoscans to game budgets
  shot.mjs, poses.mjs  screenshot + pose contact-sheet helpers
tests/smoke.spec.ts    Playwright end-to-end checks
```

## Tests

```
npm run typecheck
npm test             # Playwright; starts Vite if it isn't running
```

## Assets and licences

- Textures, HDRI and props come from Poly Haven (CC0).
- The placeholder character is the three.js `Xbot.glb`, which comes from Mixamo.
- Swords, shields, armour, slimes, houses and trees are generated in code.
