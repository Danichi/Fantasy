# The Wardens' Bestiary: hunt marks

Code: `src/progression/bestiary.ts` (rules), `src/ui/bestiaryUI.ts` (the
page), `src/items/catalog/wardens.ts` (Rook's gifts).

The bestiary already counted kills, revealed a foe's drops page by page and
gave drop luck. This adds lasting rewards for hunting.

## Hunt marks

Every kind of foe has five marks:

| Mark | Common foes | Bosses |
| --- | --- | --- |
| Tracker | 10 kills | 2 |
| Hunter | 50 | 5 |
| Slayer | 150 | 10 |
| Bane | 400 | 20 |
| Hunted Out | 1000 | 40 |

Each mark makes every blow, shot and spell against that kind **2% harder**
(up to 10%). The bonus is applied in the combat core (`strikeHooks.mult` in
`combat/core.ts`), so it covers every way of dealing damage.

## Family pages

When every creature of a family (beasts, crawlers, oozes, goblins, orcs,
outlaws, the dead, things of the Dark, constructs, sea and sand) reaches a
mark, the whole family counts:

- **Known** (all at Tracker): +3% damage to the whole family, and Rook sends
  that family's **Wardens' Charm** (a trinket: +6% damage to it, 6% less
  damage from it, +10 health).
- **Bane** (all at Slayer): +5% more.

## The Warden's Rank

Every mark held is a point. Ranks at 3, 8, 15, 25, 40, 60, 85, 115 and 150
points (Woodwise up to Warden of the Wild). Each rank is **+5 health and +3
stamina** for good (`progression/blessings.ts`). Rook sends a gift at three
of them: Rook's Bone Whistle (Stalker), the Wardens' Torc (Bane-Taker) and
the Greenmantle Ring (Warden of the Wild).

The page shows the rank in its header, stars for marks on every card, the
family's progress beside its heading, and a hunt-marks panel on every entry.
Kills from before you carried the book count the day Rook gives it to you.
