# Weapon inputs and the technique library

The six moveset slots are optional favorites. Weapon combat, held class inputs and the complete learned-technique library are separate routes into the existing action and skill runtimes.

## Controls

| Input | Result |
| --- | --- |
| LMB | Light string; movement selects forward, retreating and sweeping openers |
| R | Heavy attack; during a string's follow-up window, its heavy branch |
| Hold R / release R | Charge through three tiers / release the heavy |
| Shift + LMB | Running attack |
| Dodge, then LMB | Evasive follow-up or earned perfect-dodge counter |
| RMB + LMB | Guard interrupt; after a blocked impact, guard counter |
| RMB + forward + R | Shield drive; after a blocked impact, guard counter |
| Perfect parry, then LMB | Riposte |
| C, then LMB / R | Air string / plunge |
| Hold T + LMB / R / Space / RMB | Selected discipline's light / heavy / dodge / guard technique; T + F also uses the guard binding |
| U | Technique library; click the persistent Techniques button to open it with the mouse |
| Y | Existing attuned item spell |
| Tab and 1–6 | Existing favorite moves; item bar retains quick items |

Light attacks no longer convert to heavies when held. Heavy branches use explicit R presses. The early input buffer is 0.22 seconds in simulation time. Existing hit-confirm weaving, costed dodge cancels, weapon-family timing, resources and defensive windows remain authoritative. Ordinary attacks never select a dash because an enemy happens to be at a particular distance. Grappling-hook arrival strikes retain their explicit dash behavior.

## Library and held layer

Every learned, implemented skill node and every carried spell appears in the library. Unknown or unimplemented nodes do not appear. Learned techniques from inactive combat classes show their existing active/secondary-class restriction. Opening the library multiplies world speed by 0.15; player movement and weapon input are captured by the interface. Costs and cooldowns continue at simulation speed. Normal pause and story holds retain priority.

Eight techniques are shown around the wheel at a time, with unlimited pages, discipline filtering and text search. Arrow keys select, Enter or Use activates the selected technique, and Escape or U closes. Search fields support normal typing, Tab stays within the dialog, and closing restores focus and pointer control. Cooldowns, target requirements, equipment requirements, resources and recovery status are visible before casting.

The held layer starts with a light, heavy, movement and defensive selection from a discipline. Each of the four inputs can be assigned any learned technique. Initial assignments are saved, so later unlocks do not silently replace them. The held selector offers the active and secondary combat classes, learned magic schools and carried spells. Switching the held discipline does not switch the active combat class. Changing combat class selects a valid held discipline if the previous one becomes inactive. The original skill runtime enforces all class and equipment restrictions. Held input presses are consumed before the weapon controller, including ranged aiming, so a class technique does not also fire an ordinary attack or dodge.

Optional direct shortcuts accept unused letters, punctuation, 9 and 0. Movement, menu, interaction, horse, sailing and favorite keys remain reserved. Rebinding a direct key replaces its previous assignment; Remove clears it. Favorites can be pinned from the library. There is no six-technique access limit.

## Practice and feedback

The sandbox starts with a live combat guide. It shows the equipped weapon, current action and phase, charge tier, light/heavy follow-ups and their availability, and recent input history. Holding T replaces that view with the four technique bindings and their readiness. The library's guide checkbox makes the same guide available during ordinary play.

Enemy overhead attack-name, phase and defense-hint cards have been removed. Enemy preparation animation, weapon effects, offscreen threat feedback and optional sandbox ground footprints remain. The practice console retains its attack-state readout.

## Saves and validation

`Equipment.techniques` is an optional save extension containing held discipline, per-discipline gesture bindings, direct shortcuts and last selected technique. It uses stable skill references and item-definition IDs. Inventory UIDs do not leak into these bindings. Missing data in older saves produces an empty loadout. The existing sandbox save destination keeps practice bindings separate from adventure saves.

`tests/techniqueLibrary.spec.ts` drives native light/heavy/air inputs, unslotted class casting, modifier isolation, costs, cooldowns, direct-key reservations, save compatibility, actual dialog navigation, live guide and removal of overhead cards. Existing combat-feel, weapon-family and spell tests use the new controls.
