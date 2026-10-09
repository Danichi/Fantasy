import { events } from '../core/events';
import type { Progression } from '../progression/progression';
import type { Paths } from '../paths/paths';
import { RENOWN_LEVELS } from './data';

// Renown and the Legendary Hero (docs/design/origins.md §4). The discipline
// can't be bought with XP: it grows only from great deeds. Every deed is
// counted once, by its id, however many ways the game reports it (a boss's
// `enemyDied` and its `deed` both land on 'boss:<kind>').

export interface LegacySave {
  renown: number;
  /** deed id -> renown it gave and what it was */
  deeds: Record<string, { r: number; label: string }>;
  /** the tree ability V fires (null: the highest active one) */
  slot?: string | null;
}

export const LEGACY_ID = 'legendaryHero';

export function cleanLegacy(raw: unknown): LegacySave {
  const r = raw as Partial<LegacySave> | undefined;
  const deeds: LegacySave['deeds'] = {};
  let renown = 0;
  if (r?.deeds && typeof r.deeds === 'object') {
    for (const [id, v] of Object.entries(r.deeds)) {
      const n = Math.max(0, Math.min(10, Math.round(Number(v?.r) || 0)));
      deeds[id] = { r: n, label: String(v?.label ?? id).slice(0, 80) };
      renown += n;
    }
  }
  return { renown, deeds, slot: typeof r?.slot === 'string' ? r.slot : null };
}

/** Legendary Hero level for a Renown total (0 to 5). */
export function legacyLevel(renown: number) {
  let L = 0;
  for (const need of RENOWN_LEVELS) if (renown >= need) L++;
  return L;
}

/** Bosses whose deaths are great deeds, by the `kind` they die with. */
const BOSSES: Record<string, [id: string, label: string]> = {
  orc: ['boss:grukk', 'Grukk the Orc Warlord'],
  grukk: ['boss:grukk', 'Grukk the Orc Warlord'],
  gorrak: ['boss:gorrak', 'Gorrak Bonebreaker'],
  morwen: ['boss:morwen', 'Red Morwen of the Red Hand'],
  abomination: ['boss:abomination', 'The Gravewood Abomination'],
  sandGolem: ['boss:sandGolem', 'The Sand Golem'],
  sawtooth: ['boss:sawtooth', 'Sawtooth, the great sand shark'],
  scavengerChief: ['boss:scavengerChief', 'The scavenger chief'],
  captainVess: ['boss:captainVess', 'Captain Vess'],
  tideWarden: ['boss:tideWarden', 'The Tide Warden'],
  blightedElder: ['boss:blightedElder', 'The Blighted Elder'],
  templeGuardian: ['boss:templeGuardian', 'The Temple Guardian'],
  vathrax: ['boss:vathrax', 'Vathrax'],
  forgeWyrm: ['boss:forgeWyrm', 'The Forge Wyrm'],
  engineWarden: ['boss:engineWarden', 'The Engine Warden'],
  // The sea's great monsters also report here; sailing.ts emits the same ids.
  serpent: ['beast:serpent', 'A sea serpent'],
  kraken: ['beast:kraken', 'The Kraken'],
  crab: ['beast:crab', 'The Crab Colossus'],
  wyrm: ['beast:wyrm', 'The Storm Wyrm'],
  oldTeeth: ['beast:oldTeeth', 'Old Teeth'],
  leviathan: ['beast:leviathan', 'The Leviathan'],
  sirens: ['beast:sirens', 'The sirens of the silent rocks'],
};

export class Legacy {
  /** a deed was recorded (toasts, the save) */
  onDeed?: (label: string, renown: number, levelUp: number | null) => void;

  constructor(private prog: Progression, private paths: Paths) {}

  get save() {
    return this.prog.legacy;
  }
  get renown() {
    return this.prog.legacy.renown;
  }
  get level() {
    return legacyLevel(this.renown);
  }
  /** Renown still needed for the next level (null at 5). */
  get toNext() {
    const L = this.level;
    return L >= RENOWN_LEVELS.length ? null : RENOWN_LEVELS[L] - this.renown;
  }
  /** Tier index 0..4 is open. */
  open(tier: number) {
    return this.level > tier;
  }
  has(id: string) {
    return !!this.prog.legacy.deeds[id];
  }
  deeds() {
    return Object.entries(this.prog.legacy.deeds).map(([id, v]) => ({ id, ...v }));
  }

  /** Record a deed once. Returns the Renown gained (0 if it was already counted). */
  grant(id: string, renown: number, label: string) {
    const s = this.prog.legacy;
    if (!id || s.deeds[id] || renown <= 0) return 0;
    const before = legacyLevel(s.renown);
    const r = Math.min(10, Math.round(renown));
    s.deeds[id] = { r, label };
    s.renown += r;
    const after = legacyLevel(s.renown);
    this.sync(after > before);
    this.onDeed?.(label, r, after > before ? after : null);
    events.emit('progressChanged', {});
    return r;
  }

  /** Write the level onto the discipline (after a load, or a deed). */
  sync(announce = false) {
    this.paths.setLevelFromRenown(LEGACY_ID, this.level, announce);
  }

  /** Listen for deeds: the `deed` event, named bosses, first regions and main-story chapters. */
  listen(mainQuestTitle: (id: string) => string | null) {
    events.on('deed', ({ id, renown, label }) => this.grant(id, renown, label));
    events.on('enemyDied', ({ kind }) => {
      const b = BOSSES[kind];
      if (b) this.grant(b[0], 2, b[1]);
    });
    events.on('regionEntered', ({ id, name, first }) => {
      if (first) this.grant('region:' + id, 1, `Discovered ${name}`);
    });
    events.on('questChanged', ({ id, status }) => {
      const title = status === 'done' ? mainQuestTitle(id) : null;
      if (title) this.grant('chapter:' + id, 3, `Chapter: ${title}`);
    });
  }
}
