# Sites: points of interest across Cresha (world life, phase 4)

About 240 sites of 31 kinds, scattered across the kingdom of Cresha from a
fixed seed, so every playthrough has the same world. Code: `src/world/sites/`.

## How it works

- **Placement** (`place.ts`): each kind says what country it likes (the herb
  habitats from `herbs/flora.ts`: meadow, wood edge, forest, deep forest,
  hills, mountain, lakeshore, river, marsh, coast), how many there are, how much
  room it needs, and optionally a preference (height for towers and beacons),
  a minimum distance from Elder Glen, or a maximum distance from a road. The
  placer tries random points in Cresha's box and keeps one when it's in Cresha
  (`regionAt`), in the right country, out of towns (`keptOut`), at least 32 m
  plus the site's size from any road, on level dry ground, 150 m from every
  other site, 170 m from every named place, and clear of everything already
  placed (the clearings list main.ts builds for the trees: lairs, wayside
  places, farms, crops, landmarks, towns, the Crown Road's sites, the boss
  territories, the creature dens). The rarer and bigger kinds choose first.
- **Streaming** (`sites.ts`): a site is built when you come within 330 m and
  taken down beyond 450 m (meshes merged per material into a few draw calls;
  colliders added and removed with it; fires, people and animals animated only
  while it's built). Anything a site lets loose (rats, wolves, the dead,
  bandits) goes when the site does.
- **The prompt**: one interactable asks the sites manager for the nearest thing
  you can do; each site offers its own actions.
- **The map**: a site is marked once you've been within 70 m of it (or heard of
  it from a hermit, a fortune teller, a spyglass, a journal page). Done sites
  are greyed. Each kind has its own glyph.
- **Saving**: per site: seen, done, the day something was last used, and a
  little state of its own (`world.sites` in the save).

## The kinds

| Kind | n | What you do there |
|---|---|---|
| Ruined watchtower | 16 | Climb the stair; the map is revealed for 800 m. Two in five have a chest at the top. |
| Abandoned farmstead | 16 | Open the cellar: food, coin, a potion. Half the time rats come up first. |
| Hunter's camp | 14 | Rest by the fire (heal, save) or sleep until morning. Half have a hunter with a job: a rogue boar or a wolf pack. |
| Wayside shrine | 16 | Dawn, Wheel, Old Kings or Moon: a ten-minute blessing, once a day. |
| Sunwheel stone | 12 | A line of the old lore each; read all twelve for the Sunwheel Charm. |
| Wrecked caravan | 16 | Search the wreckage for trade goods. Often wolves or a boar are still at it. |
| Old well | 12 | A few coins. One in three: a giant spider climbs out, guarding a purse. |
| Forgotten graves | 12 | Grave goods and a mausoleum. At night the dead get up. |
| Bandit hideout | 8 | A palisade, a band (a named chief, swordsmen, crossbowmen), a locked strongbox. |
| Hermit's cottage | 5 | Agathe Bonereader (rumours), Brother Aldous (potions, blessing), Mad Pell (lore, bone dust), Ysolde the beekeeper (honey, wild mint), Corrin Ashfoot (advice, wolf pelts). |
| Ruined bridge | 8 | A broken stone bridge at the water. Half have a toll-keeper: pay, or fight. |
| Fallen statue | 3 | Five pieces scattered over a hillside; find them all for a rune. |
| Signal beacon | 8 | Light it: the map is revealed for 1.4 km and no raids on Elder Glen that night. |
| Wild beehives | 10 | Honeycomb every two days (sometimes a sting). |
| Wild orchard | 8 | Apples or pears every three days. |
| Lost champion's camp | 3 | The first champion's trail: three journal pages, her grave, her sword Firstlight. |
| Dark scar | 8 | Touch the violet crystal; gloam wolves come through; shatter it for void crystal. |
| Fallen star | 4 | Starmetal, with a mining pick, once. |
| Ruined chapel | 6 | A hymn on the lectern; ring the bell by day for a blessing, by night to wake the yard. |
| Fairy ring | 6 | At dusk, step in to come out of another ring; fey luck the first time. |
| Spring grotto | 6 | Bathe: healed, and a blessing, once a day. A cache behind the falls. |
| Hollow great tree | 6 | Climb up inside to the nest. |
| Smugglers' cache | 8 | A trapdoor only seen up close. One holds the Key of the Sun. |
| The Sealed Vault | 1 | Three keys (sun, sword, noose) open it: a strongroom. |
| Old lookout | 6 | Climb up; the spyglass marks the four nearest sites you haven't found. |
| Shepherd's hut | 5 | Rest, and find the lost ewe. |
| Charcoal burners | 5 | Coal, a hatchet, a mining pick. |
| Travelling players | 3 | Watch the show (stamina); the fortune teller's rumour and a little luck. |
| Skirmish ground | 6 | Salvage scrap iron; at night the soldiers stand up. |
| Duelling ground | 4 | The pale duellist, to a yield. One gives the Key of the Sword. |
| Crossroads gallows | 4 | At night a ghost wants his killer's name, from a grave nearby. One gives the Key of the Noose. |

## Lore

- The twelve **Sunwheel stones** were carved by someone who knew about the
  Champions' Game; the last line is addressed to "fifth" (the player).
- The **first champion** was a woman called from far away; her pages say
  there are other champions, that someone carves the Sunwheel backwards (the
  Wrong Stone Circle, phase 4.5), and that "the one who calls you ... wants
  the chair". Her sword is Firstlight.
- **Dark scars** are where the Dark leaks as its old ruler dies.
- **Mad Pell** says it outright, and nobody listens to him.

## The discovery bosses (phase 4.5)

Five places at chosen spots (`world/sites/batch5.ts`), each with something you
do there that wakes what lives in it. Each happens once: the boss never comes
back, the site is marked done, and the townsfolk talk about it while it's
alive (a rumour marks it, roughly, on your map). They're never posted as Guild
bounties. Code: the bodies in `bosses/ratQueen.ts`, `bosses/deadLords.ts`,
`bosses/delver.ts`; the definitions in `bosses/discoveryBosses.ts`; field
bosses get `summoned` (only appears when its site calls it) and `once`.

| Site | Where | The trigger | The boss |
|---|---|---|---|
| The Drowned Watchtower | a mere cut into a meadow north-west of Elder Glen, holding its own water | read the captain's last log | **Captain Ansel Hale**, a skeleton in the rags of a naval coat, weed and barnacles, a rusted morion. Calls his drowned crew up out of the water; spews black brine that slows you. Drops the Drowned Compass (water breathing) and his log. |
| The Sinkhole | a pit cut into the north hills, a slope of fallen earth on its east side | step onto the rotten rim (or look over the edge) and it gives way | **The Rat Queen**, an ox-sized rat bloated with young, a crown of bone grown from her skull. Bites (parry it), whips her tail at you behind her (dodge), rears up to screech for her brood: her belly is open then (double damage; hit her hard enough and she comes down). Drops her crown. |
| The Hanging Tree | a great dead oak by the western road | dig at the robber's grave at midnight | **Red Corwen, the Hanged Lord**, a revenant in a long coat with the noose still on him and a lantern. Raises his hanged men, flings burning oil, throws the noose and drags you in. His silver is in the grave. Drops the Hangman's Knot (life steal). |
| The Wrong Stone Circle | the highest hill in Cresha | touch the altar at the full moon | **The Wraith**, a skull in a deep hood and a robe of grave-black, hooked claws. Drifts, fades out and in behind you, shrieks (saps stamina). While four of the stones burn it can barely be hurt: scrape the wheels out of them. Worn down, it relights two. Drops the Backwards Wheel. Near the end it speaks to "the fifth". |
| The Abandoned Mine | a timbered adit in a crag in the north hills | clear the rubble from the adit | **The Delver**, a blind burrowing beast with spade claws and stone grown into its back. Underground it can't be hurt; it hunts by the sound of your feet (walk, don't run) and bursts up under you; up, it rakes (parry), rears and slams (dodge), and is stuck for a moment after a slam. Drops its crystal and a claw. |

The three dead (the captain, the hanged lord, the wraith) share one sculpted
body (`creatures/undeadHumanoid/`), dressed three ways. The Rat Queen and her
brood share a rat (`creatures/rat/`); the Delver is its own
(`creatures/delver/`).

## The moon

Full every eighth night (day 8, 16, 24...), and the night after midnight still
belongs to the evening before. The sky draws the moon's phase; the darker the
moon the darker the night (a little); the clock under the map shows it
(● full, ◐ ☾ ○ ☽ ◑ through the cycle). `time.fullMoon`, `time.nightsToFull`.
