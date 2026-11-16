# Fluid combat

The aim: fights that flow and use all three dimensions, not "hit, block, run". Every action can lead into another, how you move shapes what your attack becomes, you can take a fight into the air, a crowd is something you move through, and the arena itself is a weapon.

Code: `src/player/player.ts` (inputs, openers, cancels, the air string), `src/combat/actions.ts` (the new moves, built from each weapon family's own cuts so every weapon gets them), `src/combat/impacts.ts` (launches, juggles, knockbacks and what a knocked foe hits), `src/combat/props.ts` (barrels, braziers, fences, pools), `src/combat/flow.ts` (dash targets, vault targets, the warning flash), `src/ui/threatWarn.ts`, `src/items/catalog/specials.ts` (hook yank and zip).

## 1. Flow between actions

- **Counter Slide** (`dodgeCounter`): after a perfect dodge, attack and you slide straight to the foe you dodged in a cut that always crits. It works from inside the dodge itself (no waiting for the roll to end).
- **Riposte** (`riposte`): after a perfect parry, attack and the parry cuts straight into a heavy thrust. The window is one second.
- **Dodge Offset**: dodge out of a string and attack within 0.9 s: the string carries on from where it was, rather than starting over.
- **Costed cancels**: a dodge can cut a swing short in its wind-up (a **Feint**, +8 stamina) or in its recovery (+12, or +6 if the blow landed). Never during the blow itself.
- **Shield Drive** (`shieldPush`): shield up, walk in, attack. Knocks the foe back hard and breaks guards.
- **Skill Weave**: once a blow has landed and its swing is past, a technique can come out straight away instead of waiting for the swing to finish.

## 2. Movement shapes the attack

The first cut depends on how you are moving relative to the nearest foe in front (the lock, or a soft target within 4.5 m):

- toward it: **Lunge** (`thrust`); away: **Retreat Cut**; across it: **Sweep**;
- sprinting: **Charging Strike**; sprint and kick: **Slide Tackle** (a low slide that knocks the legs out, half again as far down a slope);
- just out of a roll or step: **Rising Cut**, whose heavy branch is the launcher.

## 3. Vertical

- **Launcher**: jump during a grounded cut. A light foe goes up about 1.5 m; if it connected, you go up after it.
- **Air String**: three air cuts (`airSlash1`-`3`). Each keeps the foe up near your height; the third (**Falling Strike**) spikes it into the ground. You hang while you cut, on a budget: 1.4 s after a launcher, a third of a second otherwise. No finishers in the air.
- **Plunge**: kick in the air, or attack while falling with nobody up there to cut.
- **Vault**: dodge toward a reeling, broken or shield-raised foe close in front: you go over it and land behind (iframes most of the way).
- **Wall Kick**: jump again in the air against a wall: up and away from it, twice per jump.
- **Hook Yank / Hook Zip**: the grappling hook aimed at a foe. A light foe is pulled off its feet to you; a heavy one pulls you to it and you arrive in a dash strike.
- **High ground**: blows from 0.9 m or more above the foe do 20% more.

Who can be thrown: anything with a body (bandits, the dead, orcs, beasts, the Sandbox's straw dummies) that is not a boss and has a low poise pool. Heavier foes only stagger, and take a third of any knockback.

## 4. Crowd flow

- **Dash Strike**: moving at a foe 3 to 6.5 m away (in a narrow cone along your movement) and attacking closes the whole gap in one cut, with a few frames of iframes at the start. Nothing already in reach on that line: no dash, just the cut.
- **Warning flash**: a foe winding up a blow within 7 m and outside the camera's view lights the edge of the screen on its side, once per tell.

## 5. The world as a weapon

Kicks, shoves, the shield drive, charges and fully charged heavies knock a foe back. For half a second after, the foe is watched:

- a **wall** (anything static) in the way: a slam (heavy blunt hit, knocked down for 1.5 s);
- a **fence**: it breaks, and the foe is still slammed;
- a **brazier**: set alight;
- **water** (a pool, or wading depth): soaked and slow to get up;
- a **ledge** (a drop of more than 2.5 m): a long fall, out of the fight for a while.

Kicks also send **barrels** rolling; a rolling barrel knocks down the first foe it meets and bursts on a wall. Props are registered by whatever builds a scene (`combat/props.ts`); so far the Sandbox does.

## The Proving Grounds (the Sandbox)

The Sandbox (docs/design/sandbox.md) is now built for all of this: an open-air sand ring with stone walls and pillars, a high-ground platform with a long slope off it, a free-standing slam wall, a fence, two braziers, a pool and barrels, all reset by F7. Dummies have bodies (launch them, slam them); there is a shield bearer, an iron dummy, a "world as a weapon" layout, a crowd of five and a five-wave gauntlet. Beside the fight: a combo meter, a feed of every named move, and a move list that ticks each move the first time you pull it off.

Tested in `tests/fluid.spec.ts`.
