# Mixamo download checklist

This swaps the grey stand-in mannequin for a realistic character with real
motion-capture animation. Everything is free, but you need an Adobe account.

## 1. Sign in

Go to https://www.mixamo.com and sign in (or create a free Adobe account).

## 2. Pick your character (download once, WITH skin)

In the **Characters** tab, search for one of these and click it:

- **Paladin J Nordstrom** is a knight in plate armour. The equippable armour pieces will sit on top of his.
- **Knight D Pelegrini** is a lighter knight.
- For the equippable armour to show best, pick someone in plain clothes instead.

Click **Download** and use these settings:

| Setting | Value |
|---|---|
| Format | FBX Binary (.fbx) |
| Skin | With Skin |
| Pose | T-pose |

Save it as **`character.fbx`**.

## 3. Download the animations (WITHOUT skin)

Keep the character you picked selected. Then, for each row below:

1. Search the **Animations** tab.
2. Click the animation.
3. Tick **In Place** if the row says so.
4. Click **Download** with these settings:

| Setting | Value |
|---|---|
| Format | FBX Binary (.fbx) |
| Skin | **Without Skin** |
| Frames per second | 30 |
| Keyframe reduction | none |

Save each one with the **exact file name** in the first column. If a search
turns up several versions, any close match works.

### Movement

| Save as | Search Mixamo for | In Place |
|---|---|---|
| `idle.fbx` | Sword And Shield Idle | – |
| `walk.fbx` | Sword And Shield Walk | ✔ |
| `run.fbx` | Sword And Shield Run | ✔ |
| `sprint.fbx` | Sprint (or "Running") | ✔ |
| `strafe_l.fbx` | Sword And Shield Strafe (left) | ✔ |
| `strafe_r.fbx` | Sword And Shield Strafe (right) | ✔ |
| `walk_back.fbx` | Sword And Shield Walk (backwards) | ✔ |
| `roll.fbx` | Stand To Roll (or "Sprinting Forward Roll") | ✘ |
| `backstep.fbx` | Step Backward / Dodging Back | ✘ |
| `jump.fbx` | Sword And Shield Jump | ✔ |

### Attacks and defence

| Save as | Search Mixamo for | In Place |
|---|---|---|
| `attack_light_1.fbx` | Sword And Shield Slash | ✘ |
| `attack_light_2.fbx` | Sword And Shield Slash (a second variant) | ✘ |
| `attack_light_3.fbx` | Sword And Shield Attack (overhead) | ✘ |
| `attack_heavy.fbx` | Great Sword Slash / Standing Melee Attack Downward | ✘ |
| `attack_off_1.fbx` | Dual Weapon Combo (or any left-hand slash) | ✘ |
| `attack_off_2.fbx` | Standing Melee Attack Backhand | ✘ |
| `parry_shield.fbx` | Sword And Shield Block | – |
| `parry_dual.fbx` | Standing Block | – |
| `hit_react.fbx` | Sword And Shield Impact | – |
| `guard_break.fbx` | Standing React Large Gut / Stunned | – |
| `death.fbx` | Sword And Shield Death | – |

### Magic

| Save as | Search Mixamo for | In Place |
|---|---|---|
| `cast_fireball.fbx` | Standing 1H Magic Attack 01 | – |
| `cast_heal.fbx` | Standing 2H Magic Area Attack / Praying | – |

Any file you skip is fine. The game keeps using its built-in procedural
version of that move.

## 4. Import

1. Put every `.fbx` file into `fantasy-game/assets-src/mixamo/`.
2. Run:

```
npm run import:mixamo
```

The importer does three things:
- It converts every file to `.glb`.
- It pulls the forward movement out of attacks and rolls, so the physics body carries the character instead of the model sliding away from it.
- It writes `public/assets/character/manifest.json`.

Restart `npm run dev`. The new character loads automatically.

## 5. Tune timing (optional)

Real clips have their own timing. If a hit lands early or late, adjust the
windows for that move in `src/combat/actions.ts`: `hit.from`, `hit.to`,
`parry`, `iframes`, `combo.from` and `cancel`, all in seconds.
