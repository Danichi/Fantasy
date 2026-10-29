import { authored, CAST } from './cast';
import { rollProfile, weaveTies, type PersonSeed, type Profile } from './profile';
import { communityOf, Reputation } from './reputation';

// Everyone in the world who can be spoken to (NPC overhaul): a profile per
// person (rolled for ordinary folk, written by hand for the people who
// matter), the ties between them, and the reputation store that remembers
// what you've done to each of them.

/** A plain job word from whatever a record calls itself. */
export function jobOf(job: string, title = '') {
  const known = ['farmer', 'merchant', 'guard', 'child', 'elder', 'miller', 'smith', 'innfolk', 'shepherd', 'weaver', 'sailor', 'fisher', 'noble', 'priest', 'scholar', 'dockhand', 'herbalist'];
  if (known.includes(job)) return job;
  const s = `${job} ${title}`.toLowerCase();
  const rules: [RegExp, string][] = [
    [/child|urchin|boy\b|girl\b|kid\b/, 'child'],
    [/watch|guard|captain of the|sergeant|warden|knight|soldier|checkpoint|sentry/, 'guard'],
    [/elder|chronicler/, 'elder'],
    [/smith|forge|armourer|bladesmith/, 'smith'],
    [/inn|tavern|barkeep|brewer|alewife/, 'innfolk'],
    [/farm|wheat|cattle|orchard|granary|harvest/, 'farmer'],
    [/miller|mill\b/, 'miller'],
    [/shepherd|herd/, 'shepherd'],
    [/weav|tailor|loom|dyer/, 'weaver'],
    [/fish|angler|net/, 'fisher'],
    [/sail|harbour|ship|captain|bosun|deckhand|ferry|quay/, 'sailor'],
    [/dock|porter|teamster|stevedore/, 'dockhand'],
    [/lord|lady|noble|countess|duke|court|prince|princess|queen|king/, 'noble'],
    [/priest|brother|sister|chapel|temple|monk|pilgrim|acolyte/, 'priest'],
    [/scholar|magus|mage|arcan|collegium|scribe|cartograph|archmage|sage/, 'scholar'],
    [/herb|apothecar|alchem|healer/, 'herbalist'],
    [/merchant|trader|hawker|shop|jewell|fence|broker|vendor|stall|provision/, 'merchant'],
  ];
  for (const [re, j] of rules) if (re.test(s)) return j;
  return job || 'townsfolk';
}

export interface PersonInfo extends PersonSeed {
  title?: string;
}

export class People {
  readonly rep = new Reputation();
  private map = new Map<string, Profile>();
  private titles = new Map<string, string>();
  /** checks whether a resident is a story character that can't die or leave (quests, mentors) */
  essential: (id: string) => boolean = () => false;

  /** where to find people we haven't met yet: a person's settlement, and everyone who lives there */
  settlementOf?: (id: string) => string | undefined;
  residents?: (settlement: string) => PersonInfo[];

  constructor() {
    this.rep.firstImpression = (id) => this.get(id)?.firstImpression ?? 0;
    this.rep.communityFor = (id) => this.communityFor(id);
    this.rep.essentialCheck = (id) => this.isEssential(id);
  }

  /** Give a group of people profiles (one settlement at a time, so their ties stay local). */
  register(people: PersonInfo[]) {
    const fresh: Profile[] = [];
    const bySettlement = new Map<string, Profile[]>();
    for (const p of people) {
      if (this.map.has(p.id)) continue;
      const job = jobOf(p.job, p.title);
      let prof = rollProfile({ ...p, job });
      if (CAST[p.id] && p.settlement === 'elderGlen') prof = authored(prof);
      this.map.set(p.id, prof);
      if (p.title) this.titles.set(p.id, p.title);
      fresh.push(prof);
      const list = bySettlement.get(p.settlement) ?? [];
      list.push(prof);
      bySettlement.set(p.settlement, list);
    }
    // Ties among the people of each place (the Glen's are joined with its townsfolk).
    for (const list of bySettlement.values()) weaveTies(list);
    // A tie is mutual: if Kaela calls Veyr her rival, Veyr knows it.
    for (const p of fresh) for (const t of p.ties) {
      const o = this.map.get(t.id);
      if (o && !o.ties.some((x) => x.id === p.id)) o.ties.push({ id: p.id, bond: t.bond === 'parent' ? 'child' : t.bond === 'child' ? 'parent' : t.bond === 'mentor' ? 'friend' : t.bond });
    }
    return fresh;
  }

  /** A person's profile (their whole settlement is given profiles the first time anyone there is asked about). */
  get(id: string) {
    const p = this.map.get(id);
    if (p || !this.settlementOf || !this.residents) return p;
    const sid = this.settlementOf(id);
    if (!sid) return undefined;
    this.register(this.residents(sid));
    return this.map.get(id);
  }
  has(id: string) {
    return !!this.get(id);
  }
  all() {
    return [...this.map.values()];
  }
  titleOf(id: string) {
    return this.titles.get(id) ?? '';
  }
  byName(name: string) {
    for (const p of this.map.values()) if (p.name === name) return p;
    return undefined;
  }
  communityFor(id: string) {
    const p = this.get(id);
    return p ? communityOf(p.settlement) : 'roads';
  }
  isEssential(id: string) {
    const p = this.get(id);
    return !!p && (p.essential || this.essential(id));
  }
  /** Here and about (not dead, not gone away). */
  present(id: string) {
    return !this.rep.dead.has(id) && !this.rep.gone.has(id);
  }
  /** The first name of someone they're tied to by this bond (for lines like "my sister Wren"). */
  tieName(id: string) {
    return this.map.get(id)?.first ?? id;
  }
}
