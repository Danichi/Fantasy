// Guild ranks (docs/design/guild.md). Reputation alone no longer promotes you:
// once you have enough for the next rank, the Registrar sets you an exam, a
// special contract, and passing it is the promotion. Each rank gives you
// something you can feel: more contracts at once, better prices with the
// guild's partners, more Marks for your work, and harder, better-paid notices.

export type GuildRank = 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS';

export interface RankDef {
  name: GuildRank;
  /** reputation needed to sit the exam for this rank */
  rep: number;
  color: string;
  /** contracts you can hold at once */
  slots: number;
  /** off at guild-partner shops */
  discount: number;
  /** extra Marks on every contract */
  marksBonus: number;
  /** what the rank gives, in words (all of it real) */
  perks: string[];
}

export const RANKS: RankDef[] = [
  { name: 'D', rep: 0, color: '#a9b3ba', slots: 2, discount: 0, marksBonus: 0, perks: ['Two contracts at once', 'The D-rank column of the Quest Wall'] },
  { name: 'C', rep: 150, color: '#9fb6c4', slots: 3, discount: 0.05, marksBonus: 0, perks: ['Three contracts at once', '5% off at the guild\'s partner shops', 'Port Aurelle\'s hall opens its wall to you'] },
  { name: 'B', rep: 400, color: '#8fb0c6', slots: 4, discount: 0.08, marksBonus: 1, perks: ['Four contracts at once', '8% off at partner shops', '+1 Mark on every contract', 'The Grand Hall in the Capital opens its wall to you'] },
  { name: 'A', rep: 900, color: '#d9a650', slots: 4, discount: 0.1, marksBonus: 2, perks: ['10% off at partner shops', '+2 Marks on every contract', 'A-rank arms, rings and charms at the Quartermaster'] },
  { name: 'S', rep: 1800, color: '#f0c24a', slots: 5, discount: 0.12, marksBonus: 3, perks: ['Five contracts at once', '12% off at partner shops', '+3 Marks on every contract'] },
  { name: 'SS', rep: 3600, color: '#7fb0ee', slots: 5, discount: 0.15, marksBonus: 4, perks: ['15% off at partner shops', '+4 Marks on every contract', 'Masterwork blades at the Quartermaster'] },
  { name: 'SSS', rep: 7500, color: '#c08af0', slots: 6, discount: 0.2, marksBonus: 5, perks: ['Six contracts at once', '20% off at partner shops', '+5 Marks on every contract'] },
];

export const rankIndex = (r: GuildRank) => RANKS.findIndex((x) => x.name === r);

export interface ExamDef {
  rank: GuildRank;
  title: string;
  /** what the Registrar says when setting it */
  brief: string;
  /** how it's passed */
  kind: 'hunt' | 'boss' | 'bosses';
  targetFamily?: string;
  targetCount?: number;
  /** days allowed (hunt exams) */
  days?: number;
}

/** The exam for each rank above D. */
export const EXAMS: Record<string, ExamDef> = {
  C: { rank: 'C', title: 'C-Rank Exam: The Cull', kind: 'hunt', targetFamily: 'beast', targetCount: 10, days: 2, brief: 'Your exam is a cull. Ten beasts, wolves or boars or worse, inside two days. The examiner counts what you bring down, not how pretty you make it.' },
  B: { rank: 'B', title: 'B-Rank Exam: A Named Beast', kind: 'boss', brief: 'B-rank means the guild trusts you with the things that have names. Bring down one of the great beasts or monsters that have names, or a dungeon\'s master, and bring me proof.' },
  A: { rank: 'A', title: 'A-Rank Exam: Two Legends', kind: 'bosses', targetCount: 2, brief: 'For A-rank, one named kill is luck. Two is skill. Bring down two of the named beasts or dungeon masters since this exam was set.' },
  S: { rank: 'S', title: 'S-Rank Exam: The Hunt of the Year', kind: 'bosses', targetCount: 3, brief: 'S-rank. There are perhaps a dozen of you in the kingdom. Three named kills, set from today. The whole guild will hear about it.' },
  SS: { rank: 'SS', title: 'SS-Rank Exam: Beyond the Kingdom', kind: 'bosses', targetCount: 5, brief: 'Five named kills. The guild has never asked this of anyone it didn\'t expect to lose.' },
  SSS: { rank: 'SSS', title: 'SSS-Rank: By Acclaim', kind: 'bosses', targetCount: 8, brief: 'Nobody sits an exam for SSS. But if you bring down eight named horrors, the guild masters will have no choice but to say your name.' },
};

/** What the death event names a named foe (field bosses, dungeon masters): set by main from the boss lists. */
export const NAMED_KINDS = new Set<string>(['grukk', 'captainVess', 'tideWarden', 'ratQueen', 'rustKnight']);
