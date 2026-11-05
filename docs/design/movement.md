# Moving on foot

How the hero walks, runs and turns (`player/player.ts`, `player/animator.ts`, `player/rigLayer.ts`).

## Two ways of moving

- **Free movement** (the usual case): the body leads.
  - The hero turns toward the direction pressed, and the legs carry them the way they face.
  - Velocity may bend up to about 30° off the facing at a run (any amount from a standstill), so the controls stay responsive.
  - Only the forward walk and run clips play, so a change of direction is always a turn, never a slide on the backpedal or strafe clips.
- **Strafing** (locked on and not sprinting, shield up, or aiming): the body stays square to its target. You move the way you press, and the directional clips (backpedal, strafe left and right) blend by the direction of travel.

## Speeds and handling

| | Speed (m/s) | Notes |
|---|---|---|
| Walk (Z toggles) | 1.7 | the walk clip's own pace |
| Run | 4.2 | the run clip at 1x |
| Sprint (Shift) | 8.4 | |
| Locked on | 3.2 | strafing |
| Shield up or aiming | 1.6 | strafing |

- **Acceleration:** speed builds at a steady rate. A run is reached in about a quarter of a second; a sprint takes about half a second more.
- **Stopping:** a run stops in about 0.2 s, a sprint in about 0.5 s (a stride or two).
- **Turning:** quick from a standstill and in wider arcs at speed. Sharp turns shed speed.
- **Pivot:** reversing at a sprint plants a foot and swings round (0.3 s), then drives out the other way.

## Animation

- **Walk and run blend by speed.** Each walk clip is paired with the run clip going the same way. The pairing used to require exactly equal directions, which the measured clip directions never were, so walk and run always played half and half.
- **Sprint stride:** past a clip's own pace the legs quicken only partly (at most 1.6x). The rest is a longer stride: the thigh, knee and arm swing are scaled away from the standing pose (at most 1.35x), and the hips sink a little.
- **Leans:**
  - the whole body banks into turns, from the feet, as a runner does;
  - the torso leans forward when speeding up and back when braking;
  - a sprint runs leaning forward;
  - a pivot sits down and leans back from the skid.
- **Foot planting:** each foot keeps its animated stride but rides the real ground under it.
  - On a slope or a step, the uphill foot lifts, the hips sink so the downhill foot can reach, and planted feet tip to match the slope.
  - It is off while rolling, in the air, swimming, riding or dead.
- **Steps and kerbs:** when the capsule drops or climbs a step in one tick, the drawn body eases through it (`stepOffset`), and the planted feet still land on the step.
- **Stopping:** the legs settle into idle over about a sixth of a second instead of snapping.

Enemies that share the hero's clips (orcs, the dead) use the same animator. They keep the directional blend, since they strafe around you, and they also gain the walk and run pairing fix.

## Combat animation

### Blending into and out of moves

- **Eased fades:** fade weights ease in and out instead of ramping linearly, so a blend starts and stops without a jolt.
- **Blend-in times:**
  - a cut out of another cut (a combo link) blends over 0.2 s;
  - a move from rest blends over 0.13 s;
  - parries, staggers and guard breaks snap in over 0.07 s.
- **Follow-through:** a clip that is fading out keeps playing at its own pace instead of freezing mid-swing, so the follow-through of one cut flows into the next.
- **Weapon holds:** a weapon family's hold (two-handed grips, guards) is applied before the blend out of a move, so leaving an attack eases back into the guard.

Measured from the hand's frame-to-frame jump at each handover:

| | Before | After |
|---|---|---|
| Sword combo link | 0.25 m/frame | 0.10 m/frame, ramping smoothly |
| Two-handed and axe/mace, returning to guard | up to 0.76 m/frame | 0.03 m/frame or less |

### Feet through attacks (`RigLayer.plantFeet`, `lock`)

- **Pinned feet:** feet the clip has planted are pinned to the ground where they landed, through attacks, casts, parries and turning on the spot.
- **Stepping:**
  - When the body has carried a pinned foot more than 0.28 m from where the clip wants it, or turned it more than 40°, the foot lifts and steps there in 0.16 s.
  - The step lands a little ahead of where the body is taking the foot, and only one foot steps at a time.
  - A step the clip makes itself is followed as authored.
- **Procedural moves:** moves without a clip (spear, staff, dagger stab) used to slide on idle legs. They now step into a planted fighting stance.
- **Result:** planted feet slide under 0.22 m per move (most under 0.1 m), down from 0.3-1.3 m.

### Weight

- **Momentum:** a move started from a run carries its momentum through its first 0.22 s instead of stopping dead.
- **Flinch:** a blow that lands jolts the body away from where it came from (lean, twist and head) and settles within a third of a second. It shows on top of whatever you are doing, staggers included, so reactions show their direction.
