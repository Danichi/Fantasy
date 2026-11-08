// The calendar (docs/design/calendar.md). A season is one turn of the moon,
// eight days, ending on the full moon; four seasons make a year of 32 days
// (about 25 hours of play at the default day length). The festivals fall on
// fixed days of the year, and the Black Market comes every full moon.

export const SEASON_DAYS = 8;
export const YEAR_DAYS = SEASON_DAYS * 4;
export const SEASONS = ['Thaw', 'High Sun', 'Harvest', 'Frost'] as const;
export type Season = (typeof SEASONS)[number];

export type FestivalId = 'tourney' | 'harbourWeek' | 'harvestFair' | 'dawnVigil' | 'lanterns' | 'blackMarket';

export interface FestivalDef {
  id: FestivalId;
  name: string;
  /** where, in words */
  where: string;
  /** which days of the year it is on (1..32); blackMarket: every full moon */
  days: number[];
  /** opening and closing hour; a close below the open runs past midnight */
  open: number;
  close: number;
  blurb: string;
  /** what you can do there, shortly */
  what: string;
}

const season = (s: number, from: number, to = from) => Array.from({ length: to - from + 1 }, (_, i) => s * SEASON_DAYS + from + i);

export const FESTIVALS: FestivalDef[] = [
  {
    id: 'tourney', name: 'The Crown Tourney', where: 'The lists, the Royal Capital', days: season(0, 5, 7), open: 10, close: 18,
    blurb: 'Knights from every corner of Cresha ride to the capital for three days of bouts under the Crown\'s banners.',
    what: 'Fight a bracket of three duels. Win it to be named champion of the tourney.',
  },
  {
    id: 'harbourWeek', name: 'Harbour Week', where: 'The fish market, Port Aurelle', days: season(1, 3, 6), open: 6, close: 18,
    blurb: 'The port\'s summer week: bunting on every mast, music on the quays and a fishing derby every day.',
    what: 'Enter the day\'s fishing derby: land the heaviest of the day\'s fish before the evening bell.',
  },
  {
    id: 'harvestFair', name: 'The Harvest Fair', where: 'The fairground, Elder Glen', days: season(2, 6, 8), open: 8, close: 20,
    blurb: 'Forty days of bread, and three of celebration. Stalls, ribbons and the whole Glen in its best clothes.',
    what: 'Show your best produce and your best cooking, and try the Strongman\'s Post.',
  },
  {
    id: 'dawnVigil', name: 'The Dawn Vigil', where: 'The Chapel of the Dawn, on the King\'s Road', days: season(3, 4), open: 21, close: 3,
    blurb: 'The longest night of Frost, when the dead stir. The faithful keep watch at the chapel until the sun comes back.',
    what: 'Stand the vigil with Brother Aldous: hold the chapel through three risings of the dead.',
  },
  {
    id: 'lanterns', name: 'The Night of Lanterns', where: 'The river, Elder Glen', days: season(3, 8), open: 18, close: 2,
    blurb: 'On the last full moon of the year the Glen floats lanterns down the river for everyone it lost, and every Lost Lantern in the world glimmers.',
    what: 'Float a lantern for a blessing, and hunt the Lost Lanterns while they glimmer from far off.',
  },
  {
    id: 'blackMarket', name: 'The Black Market', where: 'The back alleys of Port Aurelle', days: [1, 2, 3, 4].map((s) => s * SEASON_DAYS), open: 20, close: 4,
    blurb: 'Every full moon a fence of the Two Coins crew sets out a cloth in the alley and sells what nobody else will.',
    what: 'Buy rare goods that change every moon, and rumours of where a Lost Lantern lies.',
  },
];
export const FESTIVAL = Object.fromEntries(FESTIVALS.map((f) => [f.id, f])) as Record<FestivalId, FestivalDef>;

/** The day of the year (1..32) for a world day (1, 2, 3...). */
export const dayOfYear = (day: number) => ((((day - 1) % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS) + 1;
export const yearOf = (day: number) => Math.floor((day - 1) / YEAR_DAYS) + 1;
export const seasonOf = (day: number): Season => SEASONS[Math.floor((dayOfYear(day) - 1) / SEASON_DAYS)];
export const dayOfSeason = (day: number) => ((dayOfYear(day) - 1) % SEASON_DAYS) + 1;

/** A date in words: "Harvest 6, year 1". */
export function dateText(day: number) {
  return `${seasonOf(day)} ${dayOfSeason(day)}, year ${yearOf(day)}`;
}

/** The world day a festival's current (or next) sitting belongs to, if it is open at (day, hour). */
export function sittingDay(f: FestivalDef, day: number, hour: number): number | null {
  const on = (d: number) => f.days.includes(dayOfYear(d));
  if (f.close > f.open) return on(day) && hour >= f.open && hour < f.close ? day : null;
  // Past midnight: the evening's day still owns the small hours.
  if (hour >= f.open && on(day)) return day;
  if (hour < f.close && on(day - 1)) return day - 1;
  return null;
}

export function isOpen(f: FestivalDef, day: number, hour: number) {
  return sittingDay(f, day, hour) !== null;
}

/** The next time each festival opens, from (day, hour): [festival, world day it opens, days from now]. */
export function upcoming(day: number, hour: number, n = 6): { f: FestivalDef; day: number; in: number; open: boolean }[] {
  const out: { f: FestivalDef; day: number; in: number; open: boolean }[] = [];
  for (const f of FESTIVALS) {
    const sit = sittingDay(f, day, hour);
    if (sit !== null) {
      out.push({ f, day: sit, in: 0, open: true });
      continue;
    }
    for (let k = 0; k <= YEAR_DAYS; k++) {
      const d = day + k;
      if (!f.days.includes(dayOfYear(d))) continue;
      if (k === 0 && hour >= (f.close > f.open ? f.close : 24)) continue;
      out.push({ f, day: d, in: k, open: false });
      break;
    }
  }
  return out.sort((a, b) => a.in - b.in || a.f.open - b.f.open).slice(0, n);
}
