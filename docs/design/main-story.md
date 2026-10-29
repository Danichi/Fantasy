# The main story: The Fifth Summon

Built 2026-10-29 from the lore brief in `lore-dark-dimension.md`. Code in
`src/story/`; the chain in `src/quests/mainQuest.ts`; tests in
`tests/story.spec.ts`.

## The world's secret

The **Hollow King** has ruled the Dark for thousands of years, and he is
dying. Whoever takes his chair rules the Dark. The great powers all want it:

| Power | Who | Marks its champions carry |
|---|---|---|
| **The Dawn** | Cresha's own god; the Sunwheel is its mark | the Sunwheel, warm hands |
| **The Dragon God** | Ashfang, worshipped in Valoria | ember eyes, a coiled flame |
| **The Dragon King** | Veyrmos, a living dragon in the north | a crowned claw, slit pupils in bright light, never their back to a door |
| **The Verdant Mother** | the elves' goddess | a ring of thorns; they don't age |
| **The Iron Below** | the buried god of the oldest dwarf-holds | black iron, cold to the touch; an anvil with an eye |

They swore never to fight each other directly. Instead, each time the
Sunwheel turns (an **age**), each power summons a champion. The wheel turns
faster as the king weakens:

| Age | When | What a champion of it is like |
|---|---|---|
| First | ~1000 years ago | terrifying: fed by a god for a millennium (60,000 hp, no stagger, steps through the air behind you; the world bleeds red at the edges near them) |
| Second | ~300 years ago | extraordinary: calls shades out of the ground, unblockable surges (9,500 hp) |
| Third | ~40 years ago | a legend: bursts of the Dark around them (3,800 hp) |
| Fourth | ~10 years ago | a veteran: closes any gap in a heartbeat (1,500 hp) |
| Fifth | now | a peer (480 hp) |

You are **the Dawn's champion of the Fifth Age**. Its first four are dead.

## The champions (src/story/champions.ts)

- **Ser Malric Dane, the Wheelbreaker** (Fourth, Iron Below): your rival. Paid Grukk to dig up a Sunwheel spoke; broke the Dawn's fourth.
- **Hesk the Quiet** (Fourth, Iron Below, hidden): the Chancellor's guest; the assassin at the Feast.
- **Cadet Dorian Vale** (Fifth, Dragon King, hidden): your classmate and your own year.
- **Master Veyr** (Third, Dragon King, hidden): the old duelist of Elder Glen. Clues only so far.
- **Legate Cassius Varro, the Ember Legate** (Second, Dragon God): Valoria's envoy. Burns an assassin to ash with one hand.
- **Ysra the Undying** (First, Verdant Mother): knew the Dawn's first champion.
- **The Wheel-Shield** (First, patron unknown): a backwards Sunwheel on his shield. He has killed the Dawn's champion in every age.
- The Dawn's dead: **Elin** (First; the lost champion's camps and grave), **Ser Oswald Marr** (Second; tomb under Hollow Ridge, where Ingrid's party died), **Ser Hallam** (Third; Harrow Ford, where young Corvin took his name), **Ser Tobin Reyes** (Fourth; the Rust Knight).

Hidden allegiances: clues to a hidden champion's patron are found through the
story; with two clues you can name their patron on the **Powers & Champions**
page (the People page, P). Dorian's naming is part of Act II.

## Story tools (src/story/)

- `scene.ts`: the director. Scenes are async scripts: camera moves, letterbox,
  subtitles, story actors (built characters that walk and animate), fades,
  the Dark mirror, choices. Esc skips; tests run scenes in fast mode
  (`director.autoChoice` answers choices).
- `ui.ts` + `story.css`: letterbox, subtitles, chapter cards, the patron's gold
  whisper, the champion card (by age), the dread vignette.
- `story.ts`: the hub. Champions, the Dark's shades, allies (watchmen who
  follow you and fight what fights you), the boss bar, the Dark mirror
  (`DARK` uniform in `render/post.ts`), rites at wheels, things to say to NPCs.
- `state.ts`: flags, "The Story So Far" (top of the Journal), champions met,
  clues, names; saved as `WorldSave.story`.
- `sunwheel.ts`: the Sunwheel network.

## The Sunwheel network (now working)

Every Sunwheel is one wheel: the waystones, the twelve Sunwheel stones (they
attune when read), the standing stones above Elder Glen, the Dawn's shrine on
the Crown Road, the Barrow of the Old Kings, Harrow Ford, the Temple of the
Dawn, and the Gravewood pedestal once the curse is broken. Touch one to attune
it. Once the wheel wakes (Act I chapter 2, or Magus Orren's old quest for old
saves) any wheel carries you to any attuned wheel, you can rest by one (full
health; you wake there if you fall), and the story's rites are done at them.
Attuned wheels show on the world map.

## The chapters

**Act I, The Fifth Summon (Elder Glen)**
1. *The Fall* (`mq-fall`): a new game opens at night in the wheat: the card, the voice ("Five."), a rift, shades; Kaela and Brannoc come over the wall as allies; morning, Maud.
2. *A Stranger in Elder Glen*: help any two of the Glen's troubles (its side quests count), Maud, Orren, then the waystone at the east gate: the voice speaks, and the wheel wakes.
3. *Lights on the Hill*: the Glen Wardens climb with you and hold the crypt door; Grukk; coming up, **Malric** waits. A choice (defy / ask about the fourth / yield), then a lesson you can't win.
4. *The Dead Wood*: a rite at the standing stones shows you the Dark; break the curse; step through the pedestal into the Dark mirror and hear the Hollow King.
5. *The Night of Bells*: a scripted gloam siege; who fights beside you depends on your reputation; Malric comes and you drive him off.

**Act II, The Academy and the Crown**
- *The Archivist's Index* (`mq-archive`): Mell's four names.
- *Same Year, Same Road* (`mq-dorian`): noon at the ring, read Dorian, name his patron, confront him (friend or rival).
- The existing Academy chapters, the Crown's Summons and the Oldest Prayer.
- *The Missing Gold* (`mq-ledger`): Twig, the Chancellor (persuade, threaten or wait), the ledger.
- *The Feast of the Dawn* (`mq-feast`): Legate Varro (Second Age); Hesk strikes. Shield the King (Varro burns her) or chase her (fight her).
- *The Wheelbreaker* (`mq-wheelbreaker`): Malric at dawn on the Plaza of Crowns; beat him and he throws you the black iron box.

**Act III, part one: The Four Who Came Before**
- *The Four Who Came Before* (`mq-four`): Elin's grave, Oswald's tomb (Ingrid, Hollow Ridge), Harrow Ford (Corvin, the cairn's rite), the Rust Knight (Tobin). A spoke from each.
- *The Turning of the Wheel* (`mq-turning`): five spokes in the standing stones; the Wheel-Shield comes through the Dark. You can't win; you last until Ysra the Undying steps in.

**Next (with the regions):** the elven woods, the mountains and the sea hold
the remaining spokes; Act IV is the chair.

## Falling in a story fight

If you die in a story fight, the story's fighters leave and that beat resets:
it plays again when you come back (the opening replays in the wheat, the
crypt door, the mirror, Hesk in the forecourt, the duel on the plaza, the
turning at the ring; at the Night of Bells Malric comes again later). The
two fights you can't win (Malric at the crypt, the Wheel-Shield) can't kill
you: they end in their scenes. (`Story.playerFell`, `Story.lesson`.)

## Old saves

`migrateMainQuest` (story/wiring.ts): old chapters in progress map to the
nearest new stage; chapters an old story has passed count as done; the wheel
is awake for anyone past A Stranger in Elder Glen.
