# NPC overhaul: personality, conversation and reputation

Everything lives in `src/social/`, plus a few hooks in `npcManager.ts`,
`town.ts`, `questLog.ts`, `dialogue.ts` and `main.ts`.

## People (`people.ts`, `profile.ts`, `cast.ts`)

Every resident gets a **profile** the first time anyone in their settlement is
asked about (lazily, a whole settlement at once so ties stay local):

- **Traits** from -1 to 1: warmth, courage, honesty, greed, humour, piety, temper.
- **Voice**: folksy, gruff, formal, flowery, blunt, nervous or cheery. Lines are
  written per voice, so a gruff guard and a cheery baker greet you differently.
- **Likes and dislikes** (gift kinds), what they **want**, a **secret**, a line
  **about** themselves.
- **Ties**: families by surname, friends, rivals, sweethearts, mentors. Ties are
  mutual.
- `essential` (story and quest characters: knocked out, never killed, never
  leave), `child`, `guard`, hit points.

Rolled profiles are deterministic (seeded by id). The **cast** (`cast.ts`) is
written by hand for the people who matter: Elder Glen's 12 town NPCs and 13
named residents, the Port Aurelle Academy and harbour, and the Royal Capital's
court. Written characters also have personal topics that unlock as they warm
to you, and their own lines for when they adore or despise you.

`firstName()` strips honorifics: "Master Fröst" is Fröst, "Elder Maud Hollis"
is Maud, "Delphine “Dice” Coveley" is Dice.

## Lines (`lines.ts`)

A library of pools (greetings by mood, reactions to each tone, gifts,
apologies, persuasion, bribes, refusals, small talk, ties, barks, chatter,
screams, the Watch). Entries can be limited to voices or to natures (the
brave, the timid, the hot-tempered, the pious...). `pickLine` never repeats
one of a person's last 14 lines and varies the pick per person and moment.
Tokens: `{you} {town} {deed} {other} {bond} {about} {want} {secret} {name}`.

## Conversations (`conversation.ts`, `ui/dialogue.ts`)

Every "Talk to" (the 12 town NPCs through `Town.converse`, every other
resident through `folkTalk`) goes through `Conversation.open(spec)`:

1. **Greeting**: their introduction the first time; after that a line for how
   they feel, plus one thing on their mind (a story beat, what you did lately,
   that you've been away, the weather, the hour). Friends sometimes press a
   keepsake into your hands.
2. **Their business** (quests, wares, services), hidden from people who refuse
   you.
3. **Let's talk**: about themselves, what they want (neutral or better), their
   secret (friends; otherwise persuade, bribe or threaten), the people in their
   life, the town, what people say about you, their personal topics, the news.
4. **Say something...**: tone-tagged replies (Kind, Rude, Threaten). A kind
   word counts once a day.
5. **Gifts**: loved (their first like), liked, neutral, disliked; only the first
   gift of a day counts in full.
6. **Apology** when they're wary or worse, or you've insulted or threatened
   them (once a day; grudges and temper make it harder).
7. **Amends** with an elder or priest when the town's standing is poor: gold to
   the poor box raises standing as word gets round.

The dialogue box shows a **mood badge** beside the speaker's name and a
coloured **tone chip** before tone-tagged replies.

## Reputation (`reputation.ts`)

- **Disposition** per person, -100..100, shown as a mood: Hostile, Cold, Wary,
  Neutral, Warm, Friend, Devoted (or Afraid). Starts from their first impression
  (capped so nobody starts warm) and your standing in their town.
- **Standing** per community (Elder Glen, the Capital, Port Aurelle,
  Ghagrabba, the roads) and faction (the Watch, the Guild, the Academy, the
  Crown), -1000..1000, in tiers from Hated to Honoured.
- **Deeds** move both. A crime only costs standing and adds a bounty if someone
  saw it; then the news goes round over a few hours (rumours). The latest deeds
  are what people greet you with and gossip about.
- **Effects**: shop prices (a friend's discount, a cold shopkeeper's markup;
  what they pay for your goods moves the other way), quest rewards (x0.5 to
  x1.4), side quests withheld by people who are wary or worse, refusal to deal
  at all when hostile or when the town hates you (apologise or bribe).
- **Leaving**: someone whose disposition drops to -85 or below packs up and
  leaves town. They come home after two days once the town no longer distrusts
  you and there's no bounty. Story characters never leave.

## Trouble (`trouble.ts`, `npcManager.react`)

Townsfolk near you are targets for your blows (not lockable, no finishers).
A blow: they cry out and run, then hide indoors for a while; people who saw it
scream and scatter. The first blow in 30 s counts as a scuffle (a smaller
assault); after that it's assault. At 0 hp, ordinary adults die (murder: their
family and friends turn on you, seen or not); story characters and children
are knocked out. Blows during raids, and anywhere but the overworld, don't
count.

**The Watch** (Elder Glen, the Capital, Port Aurelle): with a bounty on you in
town, a watchman walks up and calls a halt. Pay the fine, spend 1-3 nights in
the cells, persuade (small bounties), bribe, or "Make me." (a fight; resisting
arrest adds to the bounty, killing a watchman is murder). Walk away mid-halt
and he draws steel. Run far enough and he gives up, for a while.

## Speech bubbles (`barks.ts`)

People you pass say something coloured by how they feel (and flinch if you
pass with steel drawn); children, guards, rain and night have their own lines.
Two townsfolk standing together chat, and you can overhear them, sometimes
about you.

## Favours (`requests.ts`)

People who are neutral or better sometimes ask a favour when you talk to them:
fetch something they like, take a word to someone in their life, or thin out
the wolves. They're ordinary quests (journal, markers, rewards scaled by
goodwill). Friends ask more often and add items to the reward.

## The People page (`ui/repPanel.ts`, key P)

Standing with every town and faction, bounties, what people are saying, and
everyone you've met: their mood, gifts, favours, insults and threats, and what
they like once you know them.

## Save

`WorldSave.social` (dispositions, standing, memories, bounties, the dead and
the gone, rumours, deeds) and `WorldSave.requests` (favours in play, so their
quests can be rebuilt before the journal loads). `resetForTest` clears both.

## Tests

`tests/social.spec.ts`.
