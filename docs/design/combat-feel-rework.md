# Combat feel rework

Status: first playable implementation. The accepted direction is fluid action RPG
combat with readable tells, responsive movement and weighty hits. This extends
`combat-rework.md` and uses the separate Sandbox for review.

The current pass implements fixed-step character poses and blade collision,
gameplay-time input buffering, attack steering and lower-body locomotion blending,
a lock-on quickstep, more deliberate sword travel, live humanoid attack phases,
committed attack directions, explicit swordsman strike reach, prepared crossbow
shots and camera-aimed Fireball. Swordsmen load their full flurry animation and
wait for their visible body before attacking; double-bolt attacks prepare each
shot separately. It also adds repeatable practice sequences,
optional attack footprints, moving targets and shared Sandbox speed controls.

Custom bosses retain their existing move timing and show timed preparation cues.
The full live commitment/recovery descriptions apply to the shared humanoid brain
and crossbowmen; attack footprints are only drawn for those described attacks.
Tailored boss move redesigns, new class move content and quick equipment-set
switching remain later iterations.

## Direction

Build fluid, readable action RPG combat with weight, distinct weapon spacing,
reliable controls and meaningful defensive decisions. Preserve the existing
classes, posture, skill trees, damage types and build depth. Interpret “range”
as both physical reach and a wider range of useful combat choices.

## Findings from the baseline

- Player melee damage is checked by `Player.present()` after the drawn rig pose
  is evaluated. Simulation and rendering therefore share authority over hits.
  The code handles skipped windows, but reliability across frame rates needs a
  deliberate fixed-step collision-pose design and regression tests.
- Player normal blade attacks have a fixed 3.6 m broad-phase distance gate.
  Weapon-family reach exists separately; most actual hits depend on the rendered
  blade sweep. Measure the complete pose and travel envelope before changing it.
- `MoveDef.reach` describes enemy attack starting distance, while `tryHit()` caps
  it at 2.6 m plus tolerance. A charge's starting distance and its actual weapon
  reach need separate fields rather than increasing the shared number.
- Telegraph feedback is primarily short particle bursts, overhead markers and
  sounds. Marker lifetime is presentation-driven; it is not a complete live
  representation of wind-up, committed direction, individual blows or recovery.
- Enemy tracking continues until the first blow, and most action movement replaces
  normal steering with root-motion travel. Both need explicit limits by phase.
- Player input buffering uses wall-clock timestamps, while attack progression uses
  gameplay time. Slow motion and frame stalls deserve direct coverage.
- Existing directional attacks, branches, parries and spacing archetypes already
  provide useful foundations. They need clear roles and dependable execution.

## 1. Timing and collision foundation

Use an authoritative gameplay clock for action progression, buffered inputs,
attack phases and enemy tells. Separate wind-up, commitment, active hit windows
and recovery. Give every blow of a string its own timing information.

Prototype fixed-step sampling of combat poses and blade sweeps, independent of
render interpolation. Keep collisions faithful to the visible weapon and profile
CPU cost before broad rollout. Derive candidate range from the weapon and move
rather than a universal gate. Keep height and wall checks. Resolve gameplay hits
once, then render/interpolate the result.

Acceptance: the same controlled swing at 30, 60 and 120 render FPS produces the
same hit count and damage; slow frames do not create missed or duplicate hits;
long weapons cannot hit beyond their visible sweep or through cover.

## 2. Readable attacks and honest commitment

Give enemies visible preparation poses and silhouettes, held long enough to read,
followed by a committed release and an exploitable recovery. Use the same phase
state for animation, sound, markers and damage. Interrupting or killing an enemy
must cancel its pending tells and blows immediately.

Keep the existing defence categories: normal, heavy, unblockable and grab. Add
shape/symbol differences as well as colour, a distinct release cue, and an optional
training label. Use ground shapes for sweeps, lunges and area attacks when useful;
ordinary attacks should remain readable from the body and weapon. Any displayed
attack footprint must use the actual attack geometry.

Lock attack direction before contact, with a small explicit steering allowance
where the move calls for it. Delayed attacks visibly hold preparation; follow-ups
receive their own tells. Add restrained off-screen threat warnings.

Acceptance: a player can identify preparation, release and recovery without F9;
a successful sidestep is not undone by a last-instant turn; blocking, parrying and
dodging visibly match the announced attack category.

## 3. Responsive movement and input

Make buffered inputs and their priority predictable in gameplay time. Tune bounded
steering during light-attack preparation and recovery; preserve planted commitment
for the active swing and heavy attacks. Smooth transitions between locomotion,
attacks, guards and reactions. Test the existing root curves and procedural moves
with the same rules rather than stacking unexplained extra travel.

Review dodge/parry cancel windows, hit-confirm recovery, whiff recovery and lock-on
turning together. Prototype a short combat step alongside the existing roll in
Sandbox before settling bindings. Prevent repeated input from triggering an
unexpected extra attack after the player changes intent.

## 4. Range and meaningful offensive choices

Establish measured neutral reach, moving reach, starting distance and recovery
for each weapon family. Initial roles:

| Family | Spacing and purpose |
| --- | --- |
| Dagger / dual weapons | Close entries, quick cuts, flanking and exit options |
| Sword | Reliable mid-close pressure, thrusts and directional cuts |
| Spear / polearm | Clearly longer pokes, distance control, vulnerable recovery up close |
| Greatsword | Broad space control and committed punish attacks |
| Axe / mace | Guard and posture pressure, distinct impact and recovery |
| Bow / crossbow | Useful aimed attacks with visible draw/reload and clear projectiles |
| Staff / magic | Midrange control, aimed spells and deliberate targeted abilities |

Gap closers need real travel and an escape/recovery tradeoff; they should not grant
an invisible extension to every swing. Support targeted and aimed ranged abilities
according to their actual requirements. Consider quick equipment-set switching
only after core spacing and movement work reliably.

Give existing attacks distinct problems to solve: thrusts catch retreating foes
but lose to lateral movement; sweeps catch circles but can be outranged; overheads
punish openings; guard breakers answer defence; ranged pressure changes approach
paths. Class kits should express these choices differently.

## 5. Enemy behaviour and impact

Use distinct pressure roles: approaching swordsman, spacing polearm fighter,
flanking skirmisher, committed brute and visible ranged support. Tune approach,
retreat, attack selection and group attack overlap with the new reach profiles.
Every threatening action needs a readable opportunity to respond.

Make block, deflect, flesh hit, armour hit, stagger and posture break distinct in
pose and sound. Place contact effects at impact, tune hit-stop by weapon weight,
and keep camera shake restrained. Improve combat framing so attacks remain visible.
Difficulty should come from combinations and decisions, with consistent timings
and recovery, rather than unexpected tracking or unreadable overlap.

## 6. Sandbox iteration tools

Add repeatable attack drills, stationary and moving range targets, distance
markers, optional attack footprints and an action-phase readout. Provide shared
combat speed controls for normal speed, half speed and quarter speed, with
resource, projectile and animation timing kept consistent. Allow selected enemy
moves and predictable sequences, alongside the normal AI.

Record input-to-action delay, hits/whiffs, actual damage, defence outcomes and
phase/timing information. Keep debug overlays optional and preserve the Sandbox's
separate save. Provide ordinary-feel practice presets with immortality and
unlimited resources disabled as well as uninterrupted lab presets.

## Delivery order

1. Establish reproducible Sandbox baselines and fix timing/collision authority.
2. Build a sword-versus-swordsman reference duel with readable phases, honest
   direction commitment, reliable input and tuned movement.
3. Give spear, dagger and greatsword distinct tested spacing and transitions.
4. Expand ranged combat, class/magic interactions, enemy groups and bosses.
5. Balance costs, difficulty, feedback and accessibility in real world encounters.

The first reviewable milestone is a convincing reference duel in Sandbox. Assess
it against the current feel before propagating tuning across the game. Test both
low-level adventure characters and capped Sandbox builds so unlimited practice
rules do not hide stamina, recovery or progression problems.
