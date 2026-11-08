# The calendar and the festivals

Code: `src/world/calendar.ts` (dates), `src/world/festivals.ts` (the
festivals), `src/ui/almanac.ts` (Journal, Almanac),
`src/items/catalog/festival.ts` (tokens and prizes).

## Dates

A **season** is one turn of the moon: eight days, ending on the full moon.
Four seasons (Thaw, High Sun, Harvest, Frost) make a **year** of 32 days,
about 25 hours of play. Dates read "Harvest 6, year 1".

## The festivals

| Festival | When | Where | What you do |
| --- | --- | --- | --- |
| The Crown Tourney | Thaw 5-7, 10:00-18:00 | The lists, the capital | A bracket of three duels (Ser Aldric Penn, Dame Ysolde Marr, Ser Corlan the Unbowed). Champion: the Champion's Favour, 250 gold. One loss ends your day. |
| Harbour Week | High Sun 3-6, 6:00-18:00 | Port Aurelle's fish market | A daily derby for one fish (Harbour Mackerel or Sea Bream, by turns). Land the heaviest, then weigh in against Old Nell, Captain Tallow and Mira Vane. Gold, silver and bronze medals. |
| The Harvest Fair | Harvest 6-8, 8:00-20:00 | A field at Elder Glen's edge | The produce show and the cookery (hand in your best), and the Strongman's Post (three blows). Three blue ribbons at one fair: the Harvest Crown. |
| The Dawn Vigil | Frost 4, 21:00-3:00 | The Chapel of the Dawn | Three risings of the dead around the chapel (5, 7, 9). The Vigil Candle and a blessing. |
| The Night of Lanterns | Frost 8, 18:00-2:00 | The river, Elder Glen | Lanterns float down the river and sky lanterns rise. Float one for a blessing. Every Lost Lantern glimmers from 60 m. |
| The Black Market | Every full moon, 20:00-4:00 | Port Aurelle's back alleys | Velvet Jack sells six rare things that change each moon, the Moonlight Mask, and rumours of Lost Lanterns. |

Each festival has a **host** who stands at its ground only while it is on,
and some dressing (stalls, bunting, banners, a striking post, candles,
river lanterns). Every host:

- trades **Festival Tokens**, earned at every festival, for festival goods:
  the Harvest Crown, the Lantern-Glass Charm, and food and potions;
- explains the festival.

Prizes are given once. Winning again pays tokens instead.

## Notices and the map

Each morning a notice says what is on today and what opens tomorrow. A
festival that is on is marked on the world map. The Almanac shows today's
date and the moon, the year as four rows of days with the festivals marked,
and every festival with when it next opens.
