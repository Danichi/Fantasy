# Combat Paths, Skill Trees and Progression (design draft v0.1)

Status: brainstorm for review. Nothing here is implemented yet. Every number is a
starting point to tune, and every name is a placeholder you can veto.

---

## 0. What already exists (and what we build on)

| Piece | Where | Notes |
|---|---|---|
| Souls-like action model | `src/combat/actions.ts` | `ActionDef` already has hit windows, poise, combo chains, i-frames, parry windows, charge holds, air attacks, spell events. New skills are new `ActionDef`s, so the engine is ready for them. |
| Resources | `src/player/player.ts` | Health, stamina (100), mana (80), poise. No class resource yet. |
| Progression | `src/progression/progression.ts` | Level, XP (`80 * L^1.45`), gold, 1 skill point per level. Points are earned but nothing spends them. |
| Moveset bar | `Equipment.moves` (6 slots, Tab) | Takes spells today. Comments already say "class skills later". |
| Skills tab | `src/ui/inventory.ts` `renderSkills()` | Placeholder cards: Swordsman, Mage, Tank, all "locked". |
| Mentors | `src/npc/town.ts` | Kaela Voss (Sword Master), Magus Orren (Old Arts), Ser Corvin (shield, "the Bulwark"), Master Fröst (smith). Their dialogue already promises training. |
| Animations on hand | `public/assets/character/` | light 1-3, heavy, leap, sprint, low, kick, spin, combo, parry, guard break, fireball, big cast, heal, roll. Enough to prototype a dozen skills before new mocap. |
| Magic visuals | `src/magic/circles.ts` | Procedural rune circles. Perfect base for the skill tree art. |

---

## 1. Big structural options (pick one)

### Option A - "One Path at a Time" (your pitch, pure)
- You walk a single **Combat Path** at a time (Blademaster, Bulwark, Pyromancer...).
- The Skills menu shows **only the active path's tree**. Other paths are invisible there.
- To change path you visit that path's **mentor**. If you haven't learned it, the mentor
  teaches it (quest or trial). If you have, the mentor swaps you onto it and your old
  tree is saved exactly as you left it.
- Each path has its **own rank and its own points**. Nothing is lost by switching.
- Pro: very clear identity, each tree can be huge and special. Con: no mixing at all.

### Option B - "Main Path + Echo" (recommended)
- Everything in A, plus **one Echo slot**: pick one previously learned path as your echo.
  You keep that path's **passive "Foundation" ring** (its first tier) and can put up to
  **2 of its actives** on your bar at reduced power (e.g. 75% effect, +25% cost).
- The echo's tree is still NOT shown in your menu; you set the echo at a mentor too.
- Mastering two specific paths unlocks **Hybrid Paths** (Spellblade, Paladin, Death
  Knight...), which are full trees of their own.
- Pro: identity stays strong, but builds get spicy. Con: more balancing.

### Option C - "Classless Mastery"
- No classes. Every weapon type and spell school is its own tree that levels **by use**
  (Skyrim/Kenshi). Any node from any tree can be learned.
- Pro: total freedom. Con: loses the "I am a Blademaster" fantasy you described and the
  mentor-swap moment. Doesn't match your pitch, listed for completeness.

**Recommendation: B.** It is A with a controlled escape valve, and hybrids give the
world a long-term chase ("find the hermit who teaches Hexblade").

---

## 2. How progression levels (the three clocks)

Three things level independently, so every fight feeds something:

| Clock | Earned by | Gives | Cap (draft) |
|---|---|---|---|
| **Character Level** | All XP (current system) | +HP/stamina/mana (already coded) and **1 Attribute point** per level | 60 |
| **Path Rank** | XP earned while that path is active (100%). Echo path gets 25%. | **1 Path point** per rank, plus bonus points from mentor Trials | 40 |
| **Skill Mastery** | Using a specific active skill in combat (hits, kills, parries with it) | Ranks I-V per skill. Rank III unlocks a **Form** choice (see 4.3). Rank V unlocks its **Mastery Seal** passive. | V |

Plus a fourth, non-combat clock: **Life Skills** (smithing, alchemy, etc.), section 7.

### 2.1 Attributes (global, Souls-style)
Character levels give Attribute points. Paths scale off them, so a Blademaster wants
Finesse, a Bulwark wants Vigor/Might, etc.

| Attribute | Raises | Scales |
|---|---|---|
| **Vigor** | Max HP | Bulwark, Berserker |
| **Endurance** | Max stamina, stamina regen, equip load | Everything martial |
| **Might** | Heavy weapon damage, poise damage | Berserker, Bulwark, Lancer |
| **Finesse** | Light weapon damage, crit chance, attack speed | Blademaster, Duelist, Shadow, Ranger |
| **Intellect** | Spell damage, max mana | Elementalist, Occultist, Runesmith |
| **Faith** | Holy power, healing, ward strength | Lightbearer, Paladin |
| **Spirit** | Mana regen, class resource gain, summon strength | Druid, Necromancer, Monk |

### 2.2 Path points math (draft)
- Path Rank 1-40 gives 40 points. Mentor Trials (one per tier, 5 total) give +2 each = **50 points max**.
- A full tree costs about **85 points**. You can own roughly **60%** of a tree, so two
  Blademasters can play very differently.
- **Tier gates** (points spent in this tree): T1 0, T2 4, T3 10, T4 18, T5 28, Capstone 38.
- **Respec** at the path's mentor for gold, scaling with rank. First respec free.

### 2.3 Switching paths
- Only at mentors (Option A/B). Later unlock: **Waystone Shrines** in dungeons that let
  you switch among already-learned paths (a mid/late game convenience reward).
- Switching swaps: tree, class resource, path passives, bar skills. Gear stays.
- The bar remembers a **layout per path**, so switching back restores your hotkeys.

---

## 3. Skill tree presentation (the "way cooler than RSL" part)

Raid Shadow Legends masteries are 3 columns with tiers and point gates. We keep that
proven structure (3 branches, tiers, gates) but present it very differently.

### Look option 1 - **Sigil Wheel** (recommended)
A giant rune circle, drawn with the same procedural style as `circles.ts`.
- Path emblem in the center. **Three branches are 120-degree wedges** radiating out.
- Tiers are concentric rings. Capstones sit on the outer rim.
- Unlearned nodes are faint etched runes; learned nodes ignite and **light flows along
  the connecting lines** from the center out. The outer ring slowly rotates.
- Each path re-skins the wheel: Blademaster is engraved steel with wind streaks,
  Pyromancer is burning glyphs, Necromancer is bone and green soulfire, Druid is roots.
- Spending a point: node flares, a shockwave ring pulses outward, the wheel "clicks".

```
                 [CAPSTONE]
                    |
          T5  o   o   o   o
        T4  o   o   o   o   o          Tempest wedge (top)
      T3   o   o   o   o   o
     T2   o    o   o    o
    T1     o  o  (EMBLEM)  o  o
          /                     \
  Riposte wedge              Iaido wedge
  (bottom left)             (bottom right)
```

### Look option 2 - **Constellation**
Each path is a star chart on a deep nebula. Nodes are stars, learned lines become
constellation art (a wolf, a blade). Pan and zoom. Gorgeous, a bit harder to read.

### Look option 3 - **Living Tree / Forge / Grimoire (per-path metaphor)**
Each path gets a fully bespoke layout: Druid is a literal tree growing upward, Bulwark is
a fortress wall you build brick by brick, Runesmith is an anvil schematic, Occultist is a
grimoire whose pages fill with ink. Most flavour, most art work.

### Menu behaviour (all looks)
- Skills tab shows **only the active path** (+ a small echo badge if Option B).
- Header: path name, rank, rank XP bar, unspent points, class resource icon.
- Hover a node: animated preview card (short looping clip or pose), numbers per rank,
  which tier gate it needs.
- A "path ribbon" at the bottom lists learned paths as **greyed seals** with the mentor's
  name and location, so the player knows where to go but can't browse the trees.

---

## 4. Tree anatomy (same grammar for every path)

### 4.1 Node types
| Type | Shape | What it does | Typical cost |
|---|---|---|---|
| **Minor** | small dot | +stat (e.g. +4% combo damage) | 1 pt, 1-3 ranks |
| **Notable** | diamond | A real passive effect ("parries restore 10 stamina") | 2 pts |
| **Active** | large circle | Grants a skill for the moves bar | 2 pts |
| **Augment** | ring around an active | Modifies one active ("Gale Step chains twice") | 1-2 pts |
| **Choice pair** | split node | Pick one of two, the other locks (respec to change) | 2 pts |
| **Keystone** | octagon | Build-defining effect with a real drawback | 3 pts |
| **Capstone** | crown on the rim | One per tree: you may only own ONE of the three branch capstones | 5 pts |

### 4.2 Each path has
- **Foundation** (center ring, 5-6 nodes): the class resource, a starter active, core passives.
- **3 branches** of ~12-14 nodes each: 3-4 actives, 1-2 keystones, 1 capstone.
- Total ~45 nodes, ~12 actives, 3 capstones.

### 4.3 Skill Mastery and Forms
Every active levels I-V by use. At Mastery III you pick one of **2-3 Forms** that change
how it plays (not just numbers). Example, Fireball:
- **Cinder Volley**: 3 small fireballs in a fan.
- **Meteor**: slow, huge, charged by holding.
- **Wisp**: orbits you for 6 s, then seeks the nearest foe.
Mastery V gives a **Seal**, a small permanent passive that stays even when you switch
paths ("Fire Seal: +5% fire damage everywhere"). Seals are the reward for playing a path
deeply and reward going back to old mentors.

### 4.4 Class resources (one per path)
Stamina and mana stay universal. Each path adds a **third meter** on the HUD with its
own rules. This is what makes paths feel different moment to moment:

| Path | Resource | Gain | Spend / effect |
|---|---|---|---|
| Blademaster | **Flow** (5 pips) | Uninterrupted combo hits | Techniques; at 5 pips you enter "Edge" (faster, longer hit windows) |
| Bulwark | **Resolve** (bar) | Blocking, parrying, taking hits | Bashes, taunts, fortify |
| Berserker | **Rage** (bar, decays) | Dealing and taking damage | Passive: more damage, less defense. Spend on Frenzy |
| Duelist | **Tempo** (stacks) | Alternating main/off hand hits in rhythm | Stacks raise speed; feints spend them |
| Ranger | **Focus** | Standing still, aiming, headshots | Charged shots, time-slow aim |
| Shadow | **Shade** + stealth | Backstabs, unseen time | Vanish, shadowstep |
| Elementalist | **Attunement** (3 element orbs) | Casting an element adds its orb | Mixing orbs triggers **Reactions** (see 5.7) |
| Lightbearer | **Radiance** | Healing, parrying, holy hits | Miracles, judgments |
| Occultist / Necromancer | **Souls** (count) | Kills, curses finishing | Summons, soul bursts |
| Druid | **Wild** | Time in nature, forms | Shapeshift duration |
| Runesmith | **Charge** (per inscription) | Hitting with inscribed weapon | Detonate runes, power turrets |
| Monk | **Ki** (pips) | Unarmed hits, perfect dodges | Ki strikes, stances |
| Lancer | **Momentum** | Moving while attacking, sprinting | Leaps, impaling charges |

---

## 5. The Paths (base paths)

Twelve base paths, plus late/secret ones. For each: fantasy, mentor, weapon, resource,
three branches with signature nodes, and capstones. The Blademaster is fully worked
out node by node in section 6 as the template for the rest.

### 5.1 Blademaster (sword) - mentor: Kaela Voss, the drill yard
Fantasy: speed, precision, flowing combos. The default starting path.
- **Tempest** (aggression, mobility): *Gale Step* (dash-cut through a target, i-frames on the dash), *Crescent Wind* (spinning slash, uses `skill_spin`), *Squall* (combo finisher becomes a 3-hit flurry), Notable *Tailwind* (dodging forward right after a hit costs no stamina). Keystone **Storm Unbound**: combo never resets while you keep hitting, but blocking is disabled.
- **Iaido** (precision, burst): *Sheathe* stance (hold to sheathe, uses `sheath`/`draw`), *Moonlit Draw* (release from sheathe: huge crit cut), *Severing Arc* (ranged wind blade), Notable *Still Water* (standing still builds crit chance). Keystone **One Breath**: sheathed draws always crit, but normal light attacks deal -30%.
- **Riposte** (defense into offense): *Counterstance* (a stance that auto-parries the next hit), *Riposte* (after a parry, a guaranteed critical thrust), *Disarm* (parry that drops enemy poise to 0), Notable *Read the Blade* (enemy attack wind-ups flash for you). Keystone **Mirror Guard**: parry window doubled, but getting hit costs 2 Flow.
- Capstones: **Eye of the Storm** (Tempest: at 5 Flow, every 3rd hit releases a wind slash), **Thousand Cuts** (Iaido: a cinematic multi-slash on one target, time freezes), **Perfect Guard** (Riposte: a perfect parry slows time 1.5 s).

### 5.2 Bulwark (sword and shield, tank) - mentor: Ser Corvin, north road
Fantasy: the immovable wall. Shield is a weapon, not just a button.
- **Aegis** (blocking): *Shield Wall* (hold: frontal block with no stamina drain for 3 s), *Deflect* (parry that reflects projectiles), Notable *Iron Stance* (blocking raises poise +50%). Keystone **Unbreakable**: cannot be guard broken, but you can't roll (only a short shield-step).
- **Vanguard** (charge, bash): *Shield Bash* (stagger, uses `kick`-style push), *Bull Rush* (sprint shield charge that plows through small enemies), *Earthshaker* (slam the shield down, shockwave), Notable *Momentum Plate* (armor weight adds to bash damage).
- **Warden** (control, protect): *Challenge* (taunt, enemies focus you, gain Resolve per enemy), *Rallying Cry* (buff, cleanse stagger), *Oath Ward* (a bubble that absorbs a set amount of damage), Notable *Last to Fall* (once per fight, lethal damage leaves you at 1 HP).
- Capstones: **Living Fortress** (Aegis: blocking a hit charges a counter slam), **Juggernaut Charge** (Vanguard: Bull Rush becomes unstoppable and chains up to 3 times), **The Oath Kept** (Warden: a 10 s aura where you take 50% of nearby allies' damage and nothing can stagger you). Lore: Corvin's broken oath, and this capstone "keeps" it.

### 5.3 Berserker (greatswords, axes, odachi) - mentor: an orc exile at the Orc House
Fantasy: Grukk's style, earned from his people. Hyperarmor, huge hits, rage.
- **Bloodlust** (sustain): *Rending Cleave* (bleed), *Feast* (heal from bleeding foes), Notable *Red Mist* (lower HP = higher damage). Keystone **Blood Price**: skills cost HP instead of stamina.
- **Juggernaut** (poise): *Titan Swing* (charged heavy with full hyperarmor), *Leaping Slam* (uses `attack_leap`), *Iron Hide* (buff: -30% damage, can't dodge). Notable *Unstoppable* (poise can't break during heavy attacks).
- **Warcry** (fear, crowd): *Warcry* (enemies flee/stagger), *Whirlwind* (channel spin, move while spinning), *Challenge the Strong* (bonus damage vs bosses). Keystone **Frenzy Eternal**: Rage never decays, but you can't block.
- Capstones: **Avatar of Slaughter**, **Mountain Breaker**, **Warlord's Howl** (summons ghostly orc warband for 8 s, a nod to Grukk).

### 5.4 Duelist (dual wield, rapier) - mentor: a traveling fencer at the tavern
Fantasy: rhythm and misdirection. Existing off-hand combo system is the seed.
- **Twin Fang**: *Cross Cut* (X-slash with both blades), *Blade Dance* (8-hit rhythmic chain; press on the beat for Tempo), Notable *Ambidextrous* (off hand deals full damage).
- **Feint**: *Feint* (cancels your attack into a fake-out; enemies that react are staggered), *Sidestep* (short-range dodge with longer i-frames), *Flourish* (spend Tempo for a crit window).
- **Dancer**: *Whirling Step* (move through enemies while cutting), *Lunge* (long gap-closer thrust), Keystone **Glass Dancer**: +40% speed, +40% damage taken.
- Capstones: **Crimson Waltz** (auto-combo while Tempo is maxed), **Grand Deception** (leave a mirror image that fights 5 s), **Final Flourish**.

### 5.5 Ranger (bow) - mentor: huntress at the forest edge
Fantasy: the bow as a Souls-like weapon (Grukk's bow shows enemies already use one).
- **Marksman**: *Aimed Shot* (charged, headshots), *Piercing Arrow*, *Deadeye* (slow-mo aim), Keystone **Patience**: shots deal +80% after standing still 2 s, moving drains Focus.
- **Trapper**: *Snare Trap*, *Caltrops*, *Blast Arrow*, *Tripwire* (explode on contact).
- **Beastkin**: summon a **hawk** (marks targets, dives) then later a **wolf** companion, *Pack Tactics* passive.
- Capstones: **Rain of Arrows**, **Master Trapper** (traps chain react), **Alpha** (companion becomes a spirit beast).

### 5.6 Shadow (daggers, stealth) - mentor: hidden, found via a quest
- **Assassin**: *Backstab*, *Garrote*, *Execute* (instant kill under 20% HP, non-boss).
- **Poisoner**: *Coat Blade* (toxins: slow, weaken, bleed), *Smoke Bomb*, *Plague Cloud*.
- **Phantom**: *Shadowstep* (teleport behind lock-on target), *Vanish*, *Shade Clone*.
- Keystone **Silent Death**: triple damage from stealth, half damage when seen.
- Capstones: **Death Mark**, **The Black Plague**, **Thousand Shadows**.

### 5.7 Elementalist (staff/catalyst, fire, frost, storm) - mentor: Magus Orren, the tower
Fantasy: elemental "chemistry". Fireball already exists.
- **Pyromancy**: *Fireball* (existing), *Flame Wave*, *Ignite* (burn DoT), *Immolation Aura*, *Meteor*.
- **Cryomancy**: *Frost Lance*, *Ice Wall* (blocks paths/projectiles), *Frozen Ground*, *Glacial Prison* (freeze a target).
- **Stormcalling**: *Chain Lightning*, *Blink* (short teleport), *Static Field*, *Thunderstrike*.
- **Reactions** (the hook): casting different elements back to back combines them.
  - Fire + Frost = **Steam Burst** (blind, AoE)
  - Frost + Storm = **Shatter** (frozen targets explode for big damage)
  - Storm + Fire = **Plasma** (fireball becomes a chain-lightning bolt)
  - All three = **Prismatic Nova**
- Keystones: **Pure Element** (lock to one element, +50% power, no reactions), **Overload** (spells cost HP when out of mana).
- Capstones: **Heart of the Sun**, **Absolute Zero**, **Tempest Crown**.

### 5.8 Lightbearer (holy, cleric) - mentor: the town chapel's priestess
Healing Light already exists.
- **Mercy**: *Healing Light* (existing), *Renew*, *Sanctuary* (heal zone), *Resurrection Ward* (auto-revive once).
- **Judgment**: *Smite* (column of light), *Holy Brand* (enemies take more damage), *Radiant Spear*.
- **Sanctum**: *Blessed Weapon* (buff melee with holy), *Aegis of Faith* (barrier), *Consecrate*.
- Capstones: **Avatar of Dawn** (wings, flight hop, heal on hit), **Final Judgment**, **Cathedral** (a huge dome of protection).

### 5.9 Occultist / Necromancer - mentor: something beneath the crypt (the one who broke the seal?)
Great lore tie-in: Orren says the crypt seal was broken "from the inside".
- **Legion**: *Raise Dead* (skeleton warriors from corpses), *Bone Archers*, *Bone Colossus*.
- **Blight**: *Curse of Frailty*, *Wither* (DoT), *Plague Carrier* (curses spread on death).
- **Reaper**: *Soul Scythe* (summoned spectral scythe melee), *Life Drain*, *Soul Harvest*.
- Keystone **Lich Pact**: max HP halved, mana doubled, and you can't heal except by drain.
- Capstones: **Army of the Dead**, **Pestilence**, **Death Incarnate** (transform into a wraith).

### 5.10 Druid / Wildwarden (shapeshifting) - mentor: hermit in the deep forest
- **Bear**: form with huge HP, maul, roar.
- **Wolf**: fast form, pounce, bleed, pack howl.
- **Grove**: *Thorn Lash*, *Entangling Roots*, *Rejuvenation*, *Treant Guardian* summon.
- Capstones: **Primal Avatar** (swap forms mid-combo freely), **Worldroot**, **Alpha of the Wild**.

### 5.11 Runesmith (inscriptions, gadgets) - mentor: Master Fröst's forge
Fantasy: engineer-warrior. Hammer + runes. Ties combat to the smithing life skill.
- **Inscription**: carve runes into your weapon mid-fight (*Rune of Fire / Frost / Force*), *Detonate*.
- **Artifice**: *Rune Turret*, *Bombard*, *Tesla Pylon*, *Grappling Chain*.
- **Anvil**: *Hammer Slam*, *Forge Armor* (temporary plating), *Overheat* (weapon glows, burns).
- Capstones: **Grand Glyph**, **Clockwork Titan** (summon a golem), **Living Forge**.

### 5.12 Lancer (spear, halberd) - mentor: a retired captain at the barracks
- **Impaler**: *Skewer*, *Pinning Thrust*, *Impale Chain* (pierce a line).
- **Dragoon**: *High Jump* (leap out of view and dive down), *Vault* (spear pole-vault dodge).
- **Phalanx**: *Brace* (counter charges), *Sweep*, *Reach Mastery*.
- Capstones: **Dragon Dive**, **Spear of Heaven**, **The Unbroken Line**.

### 5.13 Monk (unarmed, ki) - mentor: a mountain monastery (mid game)
- **Iron Fist**, **Flowing River** (dodge-counter), **Inner Eye** (ki blasts, meditation).
- Capstones: **Hundred Hand Strike**, **Perfect Harmony**, **Spirit Awakening**.

### 5.14 Late / secret base paths
- **Chronomancer**: rewind 3 s, haste, slow fields. Mentor lives in a ruin that is "out of time".
- **Voidwalker**: blink, gravity wells, pull and crush. End-game area mentor.
- **Beastbinder**: capture and summon defeated monster essences (slimes first!).
- **Bard / Warchanter**: songs as auras, drum stomps, rhythm mini-game buffs.

---

## 6. Hybrid (prestige) Paths - Option B only

Unlocked by reaching **Rank 20 in two parent paths** and completing a joint trial. Each is
a full tree. Your two parents' Seals boost it.

| Hybrid | Parents | Fantasy | Signature |
|---|---|---|---|
| **Spellblade** | Blademaster + Elementalist | Elemental blade arts | *Imbue* (sword takes an element), *Flame Step*, reactions triggered by melee |
| **Paladin** | Bulwark + Lightbearer | Holy tank (your Paladin hero model!) | *Hammer of Light*, *Divine Shield*, *Lay on Hands* |
| **Death Knight** | Berserker + Occultist | Dark juggernaut | *Soul Rend*, *Army of One*, *Death Grip* |
| **Warlord** | Berserker + Bulwark | Battlefield commander | *Banners*, *War Stomp*, *Command* (summoned soldiers) |
| **Nightblade** | Shadow + Elementalist | Shadow magic assassin | *Shadow Flame*, *Blink Strike* |
| **Hexblade** | Duelist + Occultist | Cursed dueling | *Hex Mark*, *Cursed Riposte* |
| **Arcane Archer** | Ranger + Elementalist | Element arrows | *Frost Arrow*, *Storm Volley* |
| **Beastmaster** | Ranger + Druid | Companion army | Pack of 3 beasts |
| **Templar** | Lightbearer + Duelist | Inquisitor | *Judging Thrust*, *Zealous Flurry* |
| **Stormlancer** | Lancer + Elementalist | Lightning dragoon | *Thunder Dive* |
| **Battlemonk** | Monk + Lightbearer | Holy martial artist | *Radiant Palm* |
| **Siegebreaker** | Runesmith + Berserker | Explosive hammer | *Demolition Rune* |
| **Oathbreaker** (secret) | Bulwark + Occultist | Corvin's dark mirror | *Broken Oath*, *Black Shield* |

---

## 7. Non-combat skill trees ("all the other stuff")

These are **always visible** (not path-bound) in a separate "Crafts" tab. They level by
doing the activity (Mastery-style) and give their own points.

| Tree | Branches | Example nodes |
|---|---|---|
| **Smithing** | Weaponsmith, Armorsmith, Repair | Forge rarity tiers, sharpening (temp +dmg), masterwork chance |
| **Alchemy** | Draughts, Poisons, Bombs | Double-dose, poison coatings for Shadow, fire flasks |
| **Enchanting / Runecraft** | Imbue, Sockets, Disenchant | Put Seals into gear sockets |
| **Cooking** | Feasts, Rations, Campfire | Buff foods, campfire rest bonuses |
| **Survival** | Tracking, Foraging, Weather | See enemy footprints, find herbs, cold/heat resist |
| **Cartography** | Mapping, Scouting, Secrets | Builds on the existing hand-drawn map: auto-trace walls, reveal secret doors, place waypoints |
| **Thievery** | Lockpicking, Pickpocket, Stealth | Opens alternative dungeon routes |
| **Speech / Trade** | Barter, Persuade, Intimidate | Better shop prices, dialogue options, mentor discounts on respec |
| **Taming / Riding** | Mounts, Beast lore | Mounts for the 1 km overworld |

---

## 8. Example: Blademaster tree, full node list (template for every path)

Cost in parentheses. T = tier gate.

**Foundation (center)**
1. *Flow* resource (free, auto)
2. *Gale Step* active (free starter skill)
3. Minor: +4% sword damage (1, x3)
4. Minor: +5 max stamina (1, x3)
5. Notable *Blade Sense*: lock-on shows enemy poise bar (2)
6. Notable *Keen Edge*: 5 Flow grants "Edge" state (2)

**Tempest (top wedge)**
- T1: Minor combo speed +3% (x3) / Minor dash distance +10% (x2)
- T2: Active *Crescent Wind* (2) / Augment: *Gale Step* hits twice (2)
- T2: Notable *Tailwind* (2)
- T3: Choice: *Squall* (finisher flurry) OR *Updraft* (finisher launches small foes) (2)
- T3: Minor Flow gain +10% (x2)
- T4: Active *Cyclone* (channel spin, move while spinning) (2)
- T4: Keystone **Storm Unbound** (3)
- T5: Augment: *Crescent Wind* leaves a lingering vortex (2)
- T5: Notable *Hurricane Heart*: kills refill 1 Flow and 15 stamina (2)
- Capstone **Eye of the Storm** (5)

**Iaido (right wedge)**
- T1: Minor crit chance +2% (x3) / Minor crit damage +8% (x2)
- T2: Active *Sheathe* stance + *Moonlit Draw* (2)
- T2: Notable *Still Water* (2)
- T3: Active *Severing Arc* (ranged) (2)
- T3: Choice: *Quickdraw* (draw faster) OR *Heavy Draw* (charge draw 3 levels) (2)
- T4: Keystone **One Breath** (3)
- T4: Augment: *Severing Arc* pierces (2)
- T5: Notable *Blood on the Snow*: crits apply bleed (2)
- Capstone **Thousand Cuts** (5)

**Riposte (left wedge)**
- T1: Minor parry window +8% (x3) / Minor stamina cost of parry -10% (x2)
- T2: Active *Counterstance* (2)
- T2: Notable *Read the Blade* (2)
- T3: Active *Riposte* (2) / Augment: *Riposte* restores 2 Flow (1)
- T3: Choice: *Disarm* OR *Guard Crush* (parry breaks shields) (2)
- T4: Keystone **Mirror Guard** (3)
- T4: Active *Lightning Parry* (parry projectiles back) (2)
- T5: Notable *Duelist's Pride*: each parry this fight +3% damage, stacks 10 (2)
- Capstone **Perfect Guard** (5)

About 45 nodes, ~88 points total, 50 available. That forces a real build.

---

## 9. Moves bar and hotkeys

- Current bar: 6 slots on keys 1-6 when toggled with Tab. Proposal:
  - **4 Path skills** (Q/E/R/F style or 1-4), **1 Echo skill** (Option B), **1 Ultimate**
    (capstones and some T5 actives are "Ultimates" that charge from the class resource).
  - Or keep 6 flexible slots and let players choose. Question for you below.
- Skills cost **stamina** (martial), **mana** (magic), and/or **class resource**, and
  have short cooldowns only where needed (big ones). Souls-like feel = mostly
  resource-gated, not cooldown-gated.

---

## 10. Mentors and learning a path

| Path | Mentor | Where | How you learn it |
|---|---|---|---|
| Blademaster | Kaela Voss | Town drill yard | Starts learned (or a short sparring trial) |
| Bulwark | Ser Corvin | North road | Survive 60 s in his "hold the line" trial |
| Elementalist | Magus Orren | Tower | Clear the crypt first (his dialogue already says so) |
| Lightbearer | Chapel priestess (new NPC) | Town chapel | Heal 5 wounded townsfolk quest |
| Runesmith | Master Fröst | Market forge | Bring him ore from the crypt |
| Berserker | Orc exile (new) | Orc House | Beat him bare-handed, or return Grukk's Tusk |
| Duelist | Traveling fencer (new) | Tavern | Win 3 duels |
| Ranger | Huntress (new) | Forest edge | Hunt a named beast |
| Shadow | Hidden guild (new) | Unknown | Find the guild sign in the town |
| Occultist | The thing that broke the crypt seal | Deep crypt | Make a pact (moral choice) |
| Druid, Lancer, Monk | Later regions | Beyond the map | Region quests |

Each mentor also runs **5 Trials** (one per tier) that give the bonus points and unlock
the capstone. Trials double as combat tutorials for that path's mechanic.

---

## 11. Architecture sketch (for later implementation)

New code would live in its own folder to stay out of the other session's way:

```
src/paths/
  types.ts        PathDef, NodeDef, SkillDef, Form, Seal
  registry.ts     all paths, loaded per path file
  data/blademaster.ts, bulwark.ts, ...   pure data trees
  state.ts        PathState (active path, echo, ranks, points, owned nodes, mastery), save/load
  effects.ts      applies passives as stat modifiers to Player / Equipment.bonus()
  skills.ts       SkillDef -> ActionDef bridge (reuses combat/actions.ts machinery)
  resource.ts     class resource meters (Flow, Rage, Resolve...)
src/ui/skillTree.ts   the Sigil Wheel (canvas 2D or three.js ortho scene)
```

Touch points with existing files (small, to coordinate with the other session):
`progression.ts` (path XP), `player.ts` (resource + skill cast hook), `inventory.ts`
(Skills tab calls the tree UI), `hud.ts` (class meter), `save.ts`, `npc/town.ts` (mentor
dialogue options), `main.ts` (bar accepts skills).

---

## 12. Decisions needed from you

1. **Structure**: A (pure one path), **B (path + echo + hybrids, recommended)**, or C?
2. **Tree look**: **Sigil Wheel (recommended)**, Constellation, or bespoke per path?
3. **Path list**: which of the 12 base paths stay, merge, or get cut for v1?
   Suggested v1 slice: Blademaster, Bulwark, Elementalist (the three existing mentors).
4. **Bar**: fixed layout (4 path + 1 echo + 1 ultimate) or 6 free slots?
5. **Cooldowns**: mostly resource-gated (Souls feel), or MMO-style cooldowns?
6. **Switching**: mentors only, or unlock Waystone Shrines later?
7. **Level caps**: Character 60 / Path 40 / Mastery V, OK?
8. What is the other Claude session changing, so I stay clear of those files?
