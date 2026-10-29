// Reputation (NPC overhaul, phase 3).
//
//  - Disposition: how one person feels about you, -100 (hostile) .. 100
//    (devoted). Starts from their first impression and your standing in their
//    town, and moves with what you say and do to them.
//  - Standing: what a community thinks of you (a settlement, or a faction:
//    the Watch, the Guild, the Academy, the Crown), -1000 .. 1000, in tiers
//    from Hated to Honoured.
//  - Memory: met, how often, when, the last tone you took, gifts, insults,
//    favours, the lines they've said lately (so they don't repeat themselves).
//  - Crimes: a deed only counts against a community if someone saw it; then
//    gossip carries it round the town over the next few hours. Crimes add a
//    bounty the Watch will collect (a fine, a night in the cells, or steel).
//  - People who come to hate you badly enough leave town until you make amends.

export type Tier = 'hated' | 'distrusted' | 'neutral' | 'liked' | 'respected' | 'honoured';
export const TIERS: { id: Tier; name: string; min: number }[] = [
  { id: 'hated', name: 'Hated', min: -1000 },
  { id: 'distrusted', name: 'Distrusted', min: -250 },
  { id: 'neutral', name: 'Neutral', min: -60 },
  { id: 'liked', name: 'Liked', min: 120 },
  { id: 'respected', name: 'Respected', min: 350 },
  { id: 'honoured', name: 'Honoured', min: 650 },
];

/** How one person feels, in words. */
export type Mood = 'hostile' | 'cold' | 'wary' | 'neutral' | 'warm' | 'friend' | 'devoted';
export function moodOf(d: number): Mood {
  return d <= -60 ? 'hostile' : d <= -30 ? 'cold' : d <= -10 ? 'wary' : d < 15 ? 'neutral' : d < 40 ? 'warm' : d < 75 ? 'friend' : 'devoted';
}
export const MOOD_NAME: Record<Mood, string> = { hostile: 'Hostile', cold: 'Cold', wary: 'Wary', neutral: 'Neutral', warm: 'Warm', friend: 'Friend', devoted: 'Devoted' };

/** Communities you stand with: settlements and factions. */
export const COMMUNITIES: Record<string, string> = {
  elderGlen: 'Elder Glen', royalCapital: 'the Royal Capital', portAurelle: 'Port Aurelle', ghagrabba: 'Ghagrabba', roads: 'the roads',
  watch: 'the Watch', guild: 'the Adventurer\'s Guild', academy: 'the Knight\'s Academy', crown: 'the Crown',
};
/** Which community a settlement id belongs to. */
export function communityOf(settlement: string) {
  if (settlement === 'elderGlen' || settlement === 'royalCapital' || settlement === 'portAurelle') return settlement;
  if (settlement === 'sunspire' || /scrap|ghagrabba|desert|oasis/i.test(settlement)) return 'ghagrabba';
  return 'roads';
}

/** What you did (to a person or a place). */
export type Deed =
  | 'kind' | 'rude' | 'threat' | 'persuaded' | 'bribe' | 'gift' | 'giftLoved' | 'giftDisliked' | 'apology'
  | 'favour' | 'requestFailed' | 'questDone' | 'questAbandoned' | 'raidDefended' | 'donation' | 'bossSlain'
  | 'assault' | 'knockout' | 'murder' | 'theft' | 'trespass' | 'livestock' | 'resistArrest' | 'finePaid' | 'jailed' | 'atonement';

/** [disposition change for the person, standing change for their community, bounty added, a crime?] */
const DEED: Record<Deed, [number, number, number, boolean]> = {
  kind: [4, 2, 0, false],
  rude: [-8, -4, 0, false],
  threat: [-16, -12, 0, false],
  persuaded: [2, 0, 0, false],
  bribe: [3, -2, 0, false],
  gift: [8, 3, 0, false],
  giftLoved: [16, 6, 0, false],
  giftDisliked: [-4, 0, 0, false],
  apology: [10, 6, 0, false],
  favour: [14, 25, 0, false],
  requestFailed: [-10, -8, 0, false],
  questDone: [12, 40, 0, false],
  questAbandoned: [-12, -15, 0, false],
  raidDefended: [6, 60, 0, false],
  donation: [3, 20, 0, false],
  bossSlain: [4, 50, 0, false],
  assault: [-45, -90, 60, true],
  knockout: [-60, -140, 120, true],
  murder: [-100, -420, 600, true],
  theft: [-25, -60, 40, true],
  trespass: [-15, -30, 20, true],
  livestock: [-20, -45, 35, true],
  resistArrest: [-20, -150, 200, true],
  finePaid: [0, 40, 0, false],
  jailed: [0, 60, 0, false],
  atonement: [10, 120, 0, false],
};

export interface Memory {
  met: number;
  /** game day of the last talk */
  lastDay: number;
  lastTone?: string;
  gifts: number;
  /** gifts today (only the first of a day counts in full) */
  giftDay: number;
  insults: number;
  threats: number;
  favours: number;
  /** recently said line keys (no repeats) */
  said: string[];
  /** they told you their secret */
  confided?: boolean;
  /** persuasion tried today */
  persuadeDay?: number;
  apologyDay?: number;
  /** the last day a kind word counted */
  kindDay?: number;
  /** the last day they gave you something */
  lastGiftFrom?: number;
}

export interface Rumour {
  /** what happened, in words people repeat */
  text: string;
  community: string;
  deed: Deed;
  /** game hours until it has gone round */
  left: number;
  /** standing change it carries when it lands */
  standing: number;
  /** the victim, if any */
  about?: string;
}

/** Something the town says you did ("you drove the wolves off the pens"). */
export interface Told {
  text: string;
  good: boolean;
  community: string;
  day: number;
}

export interface SocialSave {
  disp: Record<string, number>;
  standing: Record<string, number>;
  mem: Record<string, Memory>;
  bounty: Record<string, number>;
  /** residents who have died, and who have left town (and when) */
  dead: string[];
  gone: Record<string, number>;
  rumours: Rumour[];
  /** deeds the town talks about (newest first) */
  told: Told[];
}

export class Reputation {
  disp: Record<string, number> = {};
  standing: Record<string, number> = {};
  mem: Record<string, Memory> = {};
  bounty: Record<string, number> = {};
  dead = new Set<string>();
  gone = new Map<string, number>();
  rumours: Rumour[] = [];
  told: Told[] = [];
  /** profile lookups (social/people.ts fills this in) */
  firstImpression: (id: string) => number = () => 0;
  communityFor: (id: string) => string = () => 'roads';
  /** the game day (worldTime) */
  day = () => 0;
  /** a change the player should hear about */
  notify?: (msg: string) => void;
  /** someone was moved enough to leave town */
  onLeave?: (id: string) => void;

  // ---- people ----
  /** How someone feels about you right now. */
  dispOf(id: string) {
    if (!(id in this.disp)) {
      const c = this.communityFor(id);
      // Nobody starts out warm: that has to be earned.
      return Math.max(-100, Math.min(100, Math.min(12, this.firstImpression(id)) + this.standingOf(c) / 25));
    }
    return this.disp[id];
  }
  moodOf(id: string): Mood {
    return moodOf(this.dispOf(id));
  }
  memOf(id: string): Memory {
    return (this.mem[id] ??= { met: 0, lastDay: -1, gifts: 0, giftDay: -1, insults: 0, threats: 0, favours: 0, said: [] });
  }
  /** Shift one person's feelings (and nobody else's). */
  nudge(id: string, d: number) {
    const v = Math.max(-100, Math.min(100, this.dispOf(id) + d));
    this.disp[id] = v;
    if (v <= -85 && !this.gone.has(id) && !this.dead.has(id)) this.leaves(id);
    return v;
  }
  /** They pack up and leave town (until your standing there recovers). */
  private leaves(id: string) {
    if (this.essentialCheck(id)) return;
    this.gone.set(id, this.day());
    this.onLeave?.(id);
  }
  essentialCheck: (id: string) => boolean = () => false;

  // ---- communities ----
  standingOf(c: string) {
    return this.standing[c] ?? 0;
  }
  tierOf(c: string): Tier {
    const s = this.standingOf(c);
    let t: Tier = 'hated';
    for (const x of TIERS) if (s >= x.min) t = x.id;
    return t;
  }
  tierName(c: string) {
    return TIERS.find((t) => t.id === this.tierOf(c))!.name;
  }
  shift(c: string, d: number) {
    const before = this.tierOf(c);
    this.standing[c] = Math.max(-1000, Math.min(1000, this.standingOf(c) + d));
    const after = this.tierOf(c);
    if (before !== after) {
      const up = TIERS.findIndex((t) => t.id === after) > TIERS.findIndex((t) => t.id === before);
      this.notify?.(`${capital(COMMUNITIES[c] ?? c)} ${up ? 'thinks better of you' : 'thinks less of you'}: ${TIERS.find((t) => t.id === after)!.name}`);
    }
  }

  /**
   * Something you did. `who` is the person it was done to (if any); `seen`
   * says whether anyone saw it (crimes nobody sees cost nothing but the
   * victim's goodwill). `text` is how the town will tell it.
   */
  act(deed: Deed, o: { who?: string; community?: string; seen?: boolean; text?: string; scale?: number } = {}) {
    const [dd, ds, bounty, crime] = DEED[deed];
    const k = o.scale ?? 1;
    if (o.who) {
      const m = this.memOf(o.who);
      if (deed === 'rude') m.insults++;
      if (deed === 'threat') m.threats++;
      if (deed === 'favour' || deed === 'questDone') m.favours++;
      this.nudge(o.who, dd * k);
    }
    const c = o.community ?? (o.who ? this.communityFor(o.who) : undefined);
    if (!c) return;
    if (crime) {
      if (o.seen === false) return; // nobody saw: only the victim knows
      this.bounty[c] = (this.bounty[c] ?? 0) + bounty * k;
      // The Watch hears of every crime.
      this.shift('watch', ds * 0.5 * k);
    }
    if (o.text) {
      // It goes round the town over the next few hours rather than at once.
      this.rumours.push({ text: o.text, community: c, deed, left: crime ? 3 : 6, standing: ds * k, about: o.who });
      this.told.unshift({ text: o.text, good: !crime && ds >= 0, community: c, day: this.day() });
      this.told.length = Math.min(this.told.length, 12);
      // The people who saw it feel it straight away.
      if (crime) this.shift(c, ds * 0.4 * k);
    } else this.shift(c, ds * k);
  }

  /** Game hours passing: rumours land, people who left come home when you've made amends. */
  tick(hours: number) {
    for (const r of this.rumours) {
      r.left -= hours;
      if (r.left <= 0) this.shift(r.community, r.deed === 'assault' || r.deed === 'murder' || r.deed === 'knockout' || r.deed === 'theft' || r.deed === 'trespass' || r.deed === 'livestock' || r.deed === 'resistArrest' ? r.standing * 0.6 : r.standing);
    }
    this.rumours = this.rumours.filter((r) => r.left > 0);
    for (const [id, day] of this.gone) {
      const c = this.communityFor(id);
      if (this.day() - day >= 2 && this.tierOf(c) !== 'hated' && this.tierOf(c) !== 'distrusted' && (this.bounty[c] ?? 0) <= 0) {
        this.gone.delete(id);
        this.disp[id] = -20;
        this.notify?.('Someone who left has come home.');
      }
    }
  }

  /** The bounty you owe a community. */
  bountyOf(c: string) {
    return Math.round(this.bounty[c] ?? 0);
  }
  clearBounty(c: string) {
    this.bounty[c] = 0;
  }

  // ---- what it changes ----
  /** Price multiplier at someone's stall (friends give a discount; the hated pay double). */
  priceMult(id: string) {
    const t = this.tierOf(this.communityFor(id));
    const tierK = { hated: 1.5, distrusted: 1.2, neutral: 1, liked: 0.95, respected: 0.9, honoured: 0.85 }[t];
    const moodK = { hostile: 1.5, cold: 1.25, wary: 1.1, neutral: 1, warm: 0.95, friend: 0.88, devoted: 0.8 }[this.moodOf(id)];
    return Math.max(0.65, Math.min(2, tierK * moodK));
  }
  /** What they pay for what you sell, as a multiplier. */
  sellMult(id: string) {
    return 1 / this.priceMult(id);
  }
  /** Rewards from them (quests and requests). */
  rewardMult(id: string) {
    const t = this.tierOf(this.communityFor(id));
    const tierK = { hated: 0.5, distrusted: 0.8, neutral: 1, liked: 1.1, respected: 1.2, honoured: 1.3 }[t];
    const moodK = { hostile: 0.5, cold: 0.7, wary: 0.9, neutral: 1, warm: 1.1, friend: 1.25, devoted: 1.4 }[this.moodOf(id)];
    return Math.max(0.4, tierK * moodK);
  }
  /** Won't deal with you at all. */
  refuses(id: string) {
    return this.dispOf(id) <= -60 || this.tierOf(this.communityFor(id)) === 'hated';
  }
  /** Afraid of you: steps back, won't meet your eye, runs if you come close. */
  fears(id: string) {
    const m = this.memOf(id);
    return m.threats >= 2 || this.dispOf(id) <= -70 || this.recentlyHurt.has(id);
  }
  recentlyHurt = new Map<string, number>();

  // ---- save ----
  save(): SocialSave {
    return { disp: this.disp, standing: this.standing, mem: this.mem, bounty: this.bounty, dead: [...this.dead], gone: Object.fromEntries(this.gone), rumours: this.rumours, told: this.told };
  }
  /** Back to a clean slate (tests). */
  reset() {
    this.load({ disp: {}, standing: {}, mem: {}, bounty: {}, dead: [], gone: {}, rumours: [], told: [] });
    this.recentlyHurt.clear();
  }
  load(s: SocialSave | undefined) {
    if (!s) return;
    this.disp = s.disp ?? {};
    this.standing = s.standing ?? {};
    this.mem = s.mem ?? {};
    this.bounty = s.bounty ?? {};
    this.dead = new Set(s.dead ?? []);
    this.gone = new Map(Object.entries(s.gone ?? {}));
    this.rumours = s.rumours ?? [];
    this.told = s.told ?? [];
  }
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
