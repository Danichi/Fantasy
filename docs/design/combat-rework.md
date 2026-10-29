# Combat rework (2026-10)

Deliberate, posture-centred fighting in the spirit of Sekiro and God of War
(2018): read the enemy, answer each attack the right way, wear its posture
down, finish it. All six phases of the plan are in.

## 1. Foundation: posture, poise, crits, damage types (`src/combat/core.ts`)

Every blow the player lands goes through `strike(target, spec)`:

- **Damage types.** Slash, pierce, blunt (plus fire, frost, holy, arcane).
  Each enemy is made of something (`armourOf`: flesh, leather, hide, bone,
  plate, chitin, shell, slime, stone, spirit, wood) and `RESIST` says how
  each type fares: maces shatter skeletons, blades glance off plate while
  daggers and spears find the gaps, fire eats wood and slime. Weapon families
  have a default type (`FAMILY_DMG`); thrusts pierce.
- **Posture.** Blows, blocked blows and parried attacks fill a posture bar
  (shown under the enemy's health). Full, it **breaks**: the enemy reels for
  ~3 s (`onBreak`), can't attack, and any blow crits. Posture drains back
  after a moment, slower the more the enemy is hurt.
- **Poise.** A small pool per enemy. Hits wear it down; empty, the enemy is
  staggered (or knocked down by a big blow) and can't be staggered again for
  ~1 s. A light combo can't stunlock anything. Enemies with their own stagger
  meter (`ownPoise`) still get the raw numbers.
- **Super armour.** Big enemy swings shrug off reactions (not damage or
  posture).
- **Crits from play, never dice:** riposte (a parried, reeling enemy),
  broken posture, counter-hit (striking mid wind-up: also staggers), backstab,
  weak point, and skills that force one. Gear crit chance became crit power.

## 2. Offence (`src/combat/actions.ts`, `src/player/player.ts`)

- **Strings with branches.** Tap for the next cut; hold the button into it
  for its heavy branch (Rising Thrust, Whirling Cut, Crushing Overhead);
  press late after the first cut for the Hesitation Cut. Branches are built
  from the equipped family's own moves (`BRANCHES`), so every weapon has them.
- **Directional openers** while locked on: push toward (Lunge), away
  (Retreating Cut, brief i-frames) or across (Side Sweep).
- **Charge tiers:** a held heavy charges through three tiers (audible);
  release as it fills for a perfect blow (more damage and posture).
- **Hit-confirm:** a blow that lands can be cancelled sooner; a whiff
  leaves you open longer.
- **Kick / shield bash (G):** little damage, lots of posture, batters a
  raised guard aside.
- **Finishers:** attack a broken or reeling enemy in reach: heavy damage
  (a share of its health), i-frames, slow motion.
- Hit-stop scales with the weapon's weight.

## 3. Defence

- **Perfect parry** (the first ~0.12 s of the window): the attacker reels
  (riposte) and takes heavy posture damage. **Late parry:** a deflect, no
  damage, a little stamina, smaller posture damage.
- **Perfect dodge** (a blow meets the start of the roll's i-frames): time
  slows, and the next blow within ~1 s is a counter.
- **Guard counter:** attack straight out of a block that just took a hit.
- **Attack colours:** white = parry or block; gold = heavy (blockable at a
  big stamina cost); red = unblockable (dodge it); yellow = grab (dodge it,
  or hit the grabber mid wind-up). Older attacks that don't say are read
  from the attacker's last tell (`armedKind`), or a big unparryable blow
  counts as heavy.
- **Armour weight:** light gear rolls further with longer i-frames for less
  stamina; heavy gear rolls short and costly.
- The player can't be staggered again for 1 s after a stagger.

## 4. Enemy brains (`src/combat/ai.ts`)

- **The director** hands out attack turns: two attackers at once (three if
  the player turtles behind a shield, more while they heal or cast). The rest
  hold their distance, circle and look for the player's back.
- **HumanoidBrain** drives bandits, the walking dead and orc grunts:
  spacing, strafing, flanking (skirmishers), evading wind-ups, raising a
  shield (skeletons), retaliating through blows that didn't stagger, and a
  move list per enemy (`MOVESETS`, `UAL_MOVES`): strings, delayed swings,
  gap-closers, unblockable leaps, spins, kicks, grabs. It plans a move, closes
  to its range, then commits. It learns: parried often, it favours delays,
  unblockables and grabs.
- **Archetypes:** grunt, shield, spear, brute, skirmisher, archer.
- Every other enemy and all 13 bosses keep their own AI but now show
  coloured tells (`combat.windup`), carry posture, break, and answer to the
  new crits and reactions.

## 5. Feel (`src/combat/feedback.ts`, `src/fx/weaponTrail.ts`, `src/ui/hud.ts`)

- Synthesised combat sound (`sfx.whoosh/impact/clang/sting/breakCrash/
  chargeTick/slip`): there was none before.
- Impact particles by material, crit and break flashes, tells over heads,
  weapon trails, slow motion on perfect defence and finishers.
- HUD: posture bars (enemies and bosses), tell markers, crit labels on
  damage numbers (BACKSTAB, COUNTER...), weak and resisted hits tinted.
  Damage numbers can be turned off on the pause screen.
- Lock-on: the mouse wheel moves the lock to the next enemy left or right.

## 6. Integration

- **Classes:** Gale's Flow grows faster from branches and finishers;
  Boundary's ring counts as a perfect parry (posture damage); Cross openings
  come only from perfect defence.
- **Kaela Voss's drill yard** (`src/combat/trainingYard.ts`): seven drills
  (tells, perfect parries, perfect dodges, breaking posture, strings, charge,
  shove), each against the plaza dummies or a sparring partner who only throws
  what the drill is about. First passes pay XP (saved in world flags).
- **F9:** the combat debug overlay (action windows, posture, poise, tells,
  attack turns, blades and hurt capsules).
- **Tests:** `tests/combat.spec.ts` (rules, the defence ladder, strings, the
  brain, the drill yard, and a balance check of every family against every
  armour).
