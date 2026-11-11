import { events } from '../core/events';
import type { Progression } from '../progression/progression';
import { DISC, DISCIPLINES, type DisciplineDef } from './data';
import { ASCENSIONS, ASC_COST, ASC_LEVEL } from './ascensions';

// The player's disciplines: levels bought with XP, tree nodes bought with
// each discipline's tree points, mastery, attributes and the active combat
// class. XP itself lives on Progression (it's also what pickups add to).

export type AttrId = 'vig' | 'end' | 'mig' | 'fin' | 'int' | 'fai' | 'spi';
// Each point is worth about the same: Vigor used to give +10 health (8% of a
// new hero's 120) while Might gave 3% damage with half the weapons, so every
// build poured everything into Vigor. Now each attribute is one clear role,
// and the damage ones also carry a defensive perk.
export const ATTRS: { id: AttrId; name: string; glyph: string; desc: string }[] = [
  { id: 'vig', name: 'Vigor', glyph: 'V', desc: 'Toughness. +7 max health.' },
  { id: 'end', name: 'Endurance', glyph: 'E', desc: 'Staying power for blocking, rolling and swinging. +6 max stamina and +4% stamina regen.' },
  { id: 'mig', name: 'Might', glyph: 'M', desc: 'Heavy weapons and shields. +4% damage with heavy weapons (2% with balanced ones), +3% stagger with every weapon, and blocking costs 2% less stamina.' },
  { id: 'fin', name: 'Finesse', glyph: 'F', desc: 'Light weapons and footwork. +4% damage with light weapons (2% with balanced ones), +0.5% critical chance, and rolling costs 2% less stamina.' },
  { id: 'int', name: 'Intellect', glyph: 'I', desc: 'Spell power. +8 max mana and +4% spell damage.' },
  { id: 'fai', name: 'Faith', glyph: 'Fa', desc: 'Protection. +5% healing from every source, and you take 1% less damage.' },
  { id: 'spi', name: 'Spirit', glyph: 'S', desc: 'Mana flow. +6% mana regen and +4 max mana.' },
];
/** the most the defensive perks can reach (so no attribute makes you untouchable) */
const PERK_CAP = 0.35;

export type NodeType = 'center' | 'minor' | 'notable' | 'active' | 'keystone' | 'choice' | 'cap';
export interface TreeNode {
  id: string;
  type: NodeType;
  name: string;
  tier: number; // 0 center, 1-5, 6 capstone
  branch: number; // -1 for the center
  k: number;
  len: number;
  parent?: string;
  x?: number;
  y?: number;
}
export interface Tree {
  nodes: TreeNode[];
  map: Record<string, TreeNode>;
}

export const NODE_COST: Record<NodeType, number> = { center: 0, minor: 1, notable: 2, active: 2, choice: 2, keystone: 3, cap: 5 };
export const TIER_GATE = [0, 1, 5, 10, 15, 20, 25];
export const MAX_LEVEL = 30;
/** Combat and magic classes go further: levels 30 to 50 are the Ascension (paths/ascensions.ts). */
export const CLASS_MAX_LEVEL = 50;
/** The level cap for a discipline: classes 50, callings and the legacy 30. */
export function capOf(id: string) {
  const f = DISC[id]?.fam;
  return f === 'combat' || f === 'magic' ? CLASS_MAX_LEVEL : MAX_LEVEL;
}
export const MAX_RANK = 5;
export const MASTERY_XP = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500];
export const MASTERY_NAMES = ['Untrained', 'Novice', 'Novice', 'Apprentice', 'Apprentice', 'Adept', 'Adept', 'Expert', 'Expert', 'Master', 'Grandmaster'];
export const MASTERY_DISCOUNT = 0.035;
export const RESPEC_REFUND = 0.75;
/** nodes a branch needs before its gateway opens */
export const GATE_NODES = 10;
export const PATHS_VERSION = 4;
const REDESIGNED_V2 = ['pyromancer', 'lightbinder'];
const REDESIGNED_V3 = ['gale', 'boundary', 'cross'];
const REDESIGNED_V4 = ['warbreaker'];

/** Full-price XP to go from level L to L+1 (learning, 0 to 1, is done by a mentor). */
export function levelCost(L: number) {
  return L === 0 ? 100 : 150 * L * L;
}
export function masteryRank(xp: number) {
  let r = 0;
  for (let i = 0; i < MASTERY_XP.length; i++) if (xp >= MASTERY_XP[i]) r = i;
  return r;
}

const trees: Record<string, Tree | null> = {};
export function treeOf(d: DisciplineDef): Tree | null {
  if (d.id in trees) return trees[d.id];
  if (!d.branches) return (trees[d.id] = null);
  const nodes: TreeNode[] = [{ id: 'c', type: 'center', name: d.core ?? d.name, tier: 0, branch: -1, k: 0, len: 1 }];
  d.branches.forEach((b, bi) => {
    let prev: TreeNode[] = [];
    b.tiers.forEach((row, ti) => {
      const cur = row.map((raw, k): TreeNode => {
        let type: NodeType = ti === 0 ? 'minor' : 'notable';
        let name = raw;
        if (raw[0] === '*') (type = 'active'), (name = raw.slice(1));
        else if (raw[0] === '!') (type = 'keystone'), (name = raw.slice(1));
        else if (raw[0] === '?') (type = 'choice'), (name = raw.slice(1));
        else if (ti > 0 && ti < 4 && k === row.length - 1) type = 'minor';
        const parent = ti === 0 ? 'c' : prev[Math.round((row.length === 1 ? 0.5 : k / (row.length - 1)) * (prev.length - 1))].id;
        return { id: `${bi}-${ti}-${k}`, type, name, tier: ti + 1, branch: bi, k, len: row.length, parent };
      });
      nodes.push(...cur);
      prev = cur;
    });
    nodes.push({ id: `${bi}-cap`, type: 'cap', name: b.cap, tier: 6, branch: bi, k: 0, len: 1, parent: prev[Math.floor(prev.length / 2)].id });
  });
  return (trees[d.id] = { nodes, map: Object.fromEntries(nodes.map((n) => [n.id, n])) });
}

export interface LearnedNode {
  r: number; // rank (skills only; 1 otherwise)
  pick?: number; // choice nodes: 0 or 1
}

export interface PathsSave {
  lv: Record<string, number>;
  mx: Record<string, number>;
  nodes: Record<string, Record<string, LearnedNode>>;
  attrs: Record<AttrId, number>;
  active: string;
  secondary?: string;
  asc?: Record<string, { k: number; n: number }>;
  /** 2: the Pyromancer and Lightbinder trees were redesigned (their old nodes are refunded) */
  v?: number;
}

export class Paths {
  lv: Record<string, number> = {};
  mx: Record<string, number> = {};
  nodes: Record<string, Record<string, LearnedNode>> = {};
  attrs: Record<AttrId, number> = { vig: 0, end: 0, mig: 0, fin: 0, int: 0, fai: 0, spi: 0 };
  /** the active combat class ('' until one is learned) */
  active = '';
  /** a second combat class: its passives at half strength, its techniques usable (recharging a quarter slower) */
  secondary = '';
  /** Ascensions: for each class, the one chosen (k) and how many of its nodes are learned (n) */
  asc: Record<string, { k: number; n: number }> = {};

  constructor(private prog: Progression) {
    this.reset();
  }

  /** A new character: the starter disciplines at level 1. */
  reset() {
    this.lv = {};
    this.mx = {};
    this.nodes = {};
    for (const d of DISCIPLINES) {
      this.lv[d.id] = d.starter ? 1 : 0;
      this.mx[d.id] = 0;
      this.nodes[d.id] = {};
    }
    this.attrs = { vig: 0, end: 0, mig: 0, fin: 0, int: 0, fai: 0, spi: 0 };
    this.active = '';
    this.secondary = '';
    this.asc = {};
    this.syncLevel(false);
  }

  // ---- levels ----------------------------------------------------------------
  level(id: string) {
    return this.lv[id] ?? 0;
  }
  learned(id: string) {
    return this.level(id) > 0;
  }
  /** Shown in the Skills screen: basics always, secrets only once learned. */
  visible(d: DisciplineDef) {
    return !d.secret || this.learned(d.id);
  }
  masteryRank(id: string) {
    return masteryRank(this.mx[id] ?? 0);
  }
  discount(id: string) {
    return this.masteryRank(id) * MASTERY_DISCOUNT;
  }
  nextCost(id: string) {
    return Math.round(levelCost(this.level(id)) * (1 - this.discount(id)));
  }
  canInvest(id: string) {
    if (DISC[id]?.fam === 'legacy') return false; // Renown only (origins/legacy.ts)
    const L = this.level(id);
    return L > 0 && L < capOf(id) && this.prog.xp >= this.nextCost(id);
  }
  /** Spend XP to raise a learned discipline one level. */
  invest(id: string) {
    if (!this.canInvest(id)) return false;
    this.prog.xp -= this.nextCost(id);
    this.lv[id]++;
    events.emit('disciplineLevel', { id, level: this.lv[id] });
    this.syncLevel(true);
    events.emit('progressChanged', {});
    return true;
  }
  /** Taught by a mentor: the discipline starts at level 1. */
  canTeach(id: string) {
    const d = DISC[id];
    if (!d || this.learned(id) || d.fam === 'legacy') return false;
    if (d.origin && this.prog.origin !== d.origin) return false;
    if (d.gateFrom && !this.gateOpen(id)) return false;
    if (d.also && this.level(d.also[0]) < d.also[1]) return false;
    return !d.requires || this.level(d.requires[0]) >= d.requires[1];
  }
  /** What still stands between you and a class, in words (null: nothing). */
  teachWhyNot(id: string): string | null {
    const d = DISC[id];
    if (!d) return 'No such class';
    if (this.learned(id)) return null;
    if (d.origin && this.prog.origin !== d.origin) return `Only the ${d.origin === 'beastfolk' ? 'beastfolk' : d.origin === 'dwarf' ? 'dwarves' : d.origin === 'elf' ? 'elves' : d.origin === 'demon' ? 'demonkind' : 'dragonkin'} can learn it`;
    if (d.gateFrom && !this.gateOpen(id)) return `Open its gateway in ${DISC[d.gateFrom]?.name ?? d.gateFrom}'s tree first`;
    const need = [d.requires, d.also].filter((r): r is [string, number] => !!r && this.level(r[0]) < r[1]);
    if (need.length) return `Needs ${need.map(([r, lv]) => `${DISC[r]?.name ?? r} at level ${lv}`).join(' and ')}`;
    return null;
  }
  /** A hidden class's gateway capstone has been opened. */
  gateOpen(id: string) {
    const d = DISC[id];
    if (!d?.gateFrom) return false;
    const host = DISC[d.gateFrom], t = treeOf(host);
    if (!t) return false;
    return Object.keys(this.nodes[d.gateFrom] ?? {}).some((nid) => {
      const n = t.map[nid];
      return n?.type === 'cap' && host.branches?.[n.branch]?.gate === id;
    });
  }
  teach(id: string) {
    if (!this.canTeach(id)) return false;
    this.lv[id] = 1;
    // Your first combat class becomes the active one.
    if (DISC[id].fam === 'combat' && !this.learned(this.active)) this.active = id;
    events.emit('disciplineLearned', { id });
    events.emit('disciplineLevel', { id, level: 1 });
    this.syncLevel(true);
    events.emit('progressChanged', {});
    return true;
  }
  /** Legacy disciplines level from Renown (origins/legacy.ts), never from XP. */
  setLevelFromRenown(id: string, L: number, announce = false) {
    if (this.level(id) === L) return;
    this.lv[id] = L;
    if (announce) events.emit('disciplineLevel', { id, level: L });
    this.syncLevel(announce);
  }
  /** Only combat classes can be active, and only one at a time. */
  setActive(id: string) {
    if (DISC[id]?.fam !== 'combat' || !this.learned(id) || this.active === id) return false;
    this.active = id;
    if (this.secondary === id) this.secondary = '';
    events.emit('pathsChanged', {});
    return true;
  }
  /** A second combat class ('' clears it). */
  setSecondary(id: string) {
    if (id && (DISC[id]?.fam !== 'combat' || !this.learned(id) || this.active === id)) return false;
    this.secondary = id;
    events.emit('pathsChanged', {});
    return true;
  }

  // ---- Ascensions --------------------------------------------------------------------
  /** The Ascension chosen for a class (-1: none yet). */
  ascension(id: string) {
    return this.asc[id]?.k ?? -1;
  }
  ascNodes(id: string) {
    return this.asc[id]?.n ?? 0;
  }
  canAscend(id: string) {
    return !!ASCENSIONS[id] && this.level(id) >= ASC_LEVEL[0] && this.ascension(id) < 0;
  }
  /** Choose one of a class's two Ascensions (at level 30; for good, until a respec). */
  ascend(id: string, k: number) {
    if (!this.canAscend(id) || (k !== 0 && k !== 1)) return false;
    this.asc[id] = { k, n: 0 };
    events.emit('pathsChanged', {});
    events.emit('progressChanged', {});
    return true;
  }
  /** Why the next Ascension node can't be learned (null: it can). */
  ascWhyNot(id: string): string | null {
    const a = this.asc[id];
    if (!a) return 'Choose an Ascension first';
    if (a.n >= 4) return 'Every node is learned';
    if (this.level(id) < ASC_LEVEL[a.n]) return `Needs level ${ASC_LEVEL[a.n]}`;
    if (this.points(id) < ASC_COST[a.n]) return `Needs ${ASC_COST[a.n]} tree points`;
    return null;
  }
  learnAscNode(id: string) {
    if (this.ascWhyNot(id)) return false;
    this.asc[id].n++;
    events.emit('pathsChanged', {});
    events.emit('progressChanged', {});
    return true;
  }
  /** Full-price XP that went into a discipline's levels past the first. */
  invested(id: string) {
    let s = 0;
    for (let L = 1; L < this.level(id); L++) s += levelCost(L);
    return s;
  }
  respecRefund(id: string) {
    return Math.round(this.invested(id) * RESPEC_REFUND);
  }
  /** At a mentor: back to level 1, tree cleared, 75% of the XP returned. Mastery stays. */
  respec(id: string) {
    if (this.level(id) < 1) return 0;
    const back = this.respecRefund(id);
    this.prog.xp += back;
    this.lv[id] = 1;
    this.nodes[id] = {};
    delete this.asc[id];
    this.syncLevel(false);
    events.emit('pathsChanged', {});
    events.emit('progressChanged', {});
    return back;
  }

  // ---- character level and attributes ----------------------------------------
  get charLevel() {
    let sum = 0;
    for (const d of DISCIPLINES) sum += this.level(d.id);
    return 1 + Math.floor(sum / 2);
  }
  get attrSpent() {
    return Object.values(this.attrs).reduce((a, b) => a + b, 0);
  }
  get attrFree() {
    return Math.max(0, this.charLevel - 1 - this.attrSpent);
  }
  raise(a: AttrId) {
    if (this.attrFree <= 0) return false;
    this.attrs[a]++;
    events.emit('pathsChanged', {});
    return true;
  }
  private syncLevel(announce: boolean) {
    const L = this.charLevel;
    const up = L > this.prog.level;
    this.prog.level = L;
    if (up && announce) events.emit('levelUp', { level: L });
    events.emit('pathsChanged', {});
  }

  // ---- tree points -------------------------------------------------------------
  /** extra tree points from outside the tree (origins: Heroic Adaptation) */
  bonusPoints?: (id: string) => number;
  earned(id: string) {
    const L = this.level(id);
    return L + Math.floor(L / 5) + (L > 0 ? this.bonusPoints?.(id) ?? 0 : 0);
  }
  spent(id: string) {
    const t = treeOf(DISC[id]);
    if (!t) return 0;
    let s = 0;
    for (const [nid, v] of Object.entries(this.nodes[id] ?? {})) {
      const n = t.map[nid];
      if (n) s += NODE_COST[n.type] + (n.type === 'active' ? v.r - 1 : 0);
    }
    for (let i = 0; i < (this.asc[id]?.n ?? 0); i++) s += ASC_COST[i];
    return s;
  }
  points(id: string) {
    return this.earned(id) - this.spent(id);
  }
  has(id: string, nid: string) {
    return nid === 'c' ? this.learned(id) : !!this.nodes[id]?.[nid];
  }
  node(id: string, nid: string) {
    return this.nodes[id]?.[nid];
  }
  /** Reachable and unlocked, ignoring points. */
  open(id: string, n: TreeNode) {
    if (n.type === 'center' || this.has(id, n.id) || !this.learned(id)) return false;
    if (!n.parent || !this.has(id, n.parent)) return false;
    if (this.level(id) < TIER_GATE[n.tier]) return false;
    if (n.type === 'cap' && Object.keys(this.nodes[id]).some((k) => k.endsWith('-cap'))) return false;
    if (n.type === 'cap' && this.gate(id, n) && this.branchCount(id, n.branch) < GATE_NODES) return false;
    return true;
  }
  /** The hidden class a capstone opens, if it is a gateway. */
  gate(id: string, n: TreeNode) {
    return n.type === 'cap' ? DISC[id].branches?.[n.branch]?.gate : undefined;
  }
  /** A node's name as the player may know it: gateways stay "???" until their hidden class is found. */
  displayName(id: string, n: TreeNode, pick?: number) {
    const g = this.gate(id, n);
    if (g && !this.learned(g)) return '???';
    if (n.type === 'choice') return pick === undefined ? n.name.replace('|', ' or ') : n.name.split('|')[pick];
    return n.name;
  }
  /** Learned nodes in one branch (gateways need most of it). */
  branchCount(id: string, branch: number) {
    const t = treeOf(DISC[id]);
    return Object.keys(this.nodes[id] ?? {}).filter((k) => t?.map[k]?.branch === branch && t.map[k].type !== 'cap').length;
  }
  canLearn(id: string, n: TreeNode) {
    return this.open(id, n) && this.points(id) >= NODE_COST[n.type];
  }
  whyNot(id: string, n: TreeNode): string | null {
    const d = DISC[id];
    if (this.has(id, n.id)) return null;
    if (!this.learned(id)) return `Learn ${d.name} from ${d.mentor}`;
    if (this.level(id) < TIER_GATE[n.tier]) return `Needs ${d.name} level ${TIER_GATE[n.tier]}`;
    if (!n.parent || !this.has(id, n.parent)) return 'Learn the node before it first';
    if (n.type === 'cap' && Object.keys(this.nodes[id]).some((k) => k.endsWith('-cap'))) return this.gate(id, n) ? 'You have already opened a gateway in this tree' : 'You already own a capstone in this tree';
    if (n.type === 'cap' && this.gate(id, n) && this.branchCount(id, n.branch) < GATE_NODES) return `Needs ${GATE_NODES} nodes in ${d.branches![n.branch].name} (you have ${this.branchCount(id, n.branch)})`;
    if (this.points(id) < NODE_COST[n.type]) return `Needs ${NODE_COST[n.type]} tree point${NODE_COST[n.type] > 1 ? 's' : ''}`;
    return null;
  }
  learn(id: string, n: TreeNode, pick = 0) {
    if (!this.canLearn(id, n)) return false;
    this.nodes[id][n.id] = n.type === 'choice' ? { r: 1, pick } : { r: 1 };
    // A gateway no longer teaches at once: it shows you where the hidden teacher waits.
    const g = this.gate(id, n);
    if (g && !this.learned(g)) events.emit('gatewayOpened', { id: g });
    events.emit('pathsChanged', {});
    return true;
  }
  canRankUp(id: string, n: TreeNode) {
    const v = this.node(id, n.id);
    return n.type === 'active' && !!v && v.r < MAX_RANK && this.points(id) >= 1;
  }
  rankUp(id: string, n: TreeNode) {
    if (!this.canRankUp(id, n)) return false;
    this.nodes[id][n.id].r++;
    events.emit('pathsChanged', {});
    return true;
  }

  // ---- stat effects ---------------------------------------------------------------
  // Character level gives a little of everything; attributes do the rest.
  get bonusHp() {
    return (this.charLevel - 1) * 4 + this.attrs.vig * 7;
  }
  get bonusStamina() {
    return (this.charLevel - 1) * 2 + this.attrs.end * 6;
  }
  get bonusMana() {
    return (this.charLevel - 1) * 2 + this.attrs.int * 8 + this.attrs.spi * 4;
  }
  get staminaRegen() {
    return this.attrs.end * 0.04;
  }
  get manaRegen() {
    return this.attrs.spi * 0.06;
  }
  get spellPower() {
    return 1 + this.attrs.int * 0.04;
  }
  get healPower() {
    return 1 + this.attrs.fai * 0.05;
  }
  /** Melee damage multiplier. Slow (heavy) weapons scale with Might, fast ones with Finesse. */
  meleePower(weaponSpeed = 1) {
    const heavy = weaponSpeed < 0.95 ? 1 : weaponSpeed > 1.05 ? 0 : 0.5;
    return 1 + 0.04 * (this.attrs.mig * heavy + this.attrs.fin * (1 - heavy));
  }
  get poisePower() {
    return 1 + this.attrs.mig * 0.03;
  }
  /** Might: what a block costs in stamina (a multiplier) */
  get blockCost() {
    return 1 - Math.min(PERK_CAP, this.attrs.mig * 0.02);
  }
  /** Finesse: what a roll costs in stamina (a multiplier) */
  get rollCost() {
    return 1 - Math.min(PERK_CAP, this.attrs.fin * 0.02);
  }
  /** Finesse: extra critical chance (0..1) */
  get critChance() {
    return this.attrs.fin * 0.005;
  }
  /** Faith: the damage you take (a multiplier) */
  get guard() {
    return 1 - Math.min(PERK_CAP, this.attrs.fai * 0.01);
  }

  // ---- save ------------------------------------------------------------------------
  serialize(): PathsSave {
    return { lv: { ...this.lv }, mx: { ...this.mx }, nodes: structuredClone(this.nodes), attrs: { ...this.attrs }, active: this.active, secondary: this.secondary, asc: structuredClone(this.asc), v: PATHS_VERSION };
  }
  load(s: PathsSave) {
    this.reset();
    for (const d of DISCIPLINES) {
      this.lv[d.id] = Math.max(0, Math.min(capOf(d.id), Math.floor(s.lv?.[d.id] ?? this.lv[d.id])));
      this.mx[d.id] = Math.max(0, s.mx?.[d.id] ?? 0);
      const t = treeOf(d);
      // Redesigned trees: old nodes don't map onto the new ones, so they're refunded (points come back).
      const v = s.v ?? 1;
      const saved = (v < 2 && REDESIGNED_V2.includes(d.id)) || (v < 3 && REDESIGNED_V3.includes(d.id)) || (v < 4 && REDESIGNED_V4.includes(d.id)) ? {} : s.nodes?.[d.id] ?? {};
      this.nodes[d.id] = {};
      if (t) for (const [nid, v] of Object.entries(saved)) if (t.map[nid]) this.nodes[d.id][nid] = { r: Math.max(1, Math.min(MAX_RANK, v.r | 0)), pick: v.pick };
    }
    for (const a of ATTRS) this.attrs[a.id] = Math.max(0, s.attrs?.[a.id] | 0);
    // Never more attribute points than the level allows.
    while (this.attrSpent > this.charLevel - 1) {
      const top = ATTRS.reduce((m, a) => (this.attrs[a.id] > this.attrs[m.id] ? a : m));
      this.attrs[top.id]--;
    }
    const combat = DISCIPLINES.find((d) => d.fam === 'combat' && this.learned(d.id));
    this.active = DISC[s.active]?.fam === 'combat' && this.learned(s.active) ? s.active : combat?.id ?? '';
    this.secondary = s.secondary && s.secondary !== this.active && DISC[s.secondary]?.fam === 'combat' && this.learned(s.secondary) ? s.secondary : '';
    for (const [id, a] of Object.entries(s.asc ?? {})) if (ASCENSIONS[id] && (a.k === 0 || a.k === 1)) this.asc[id] = { k: a.k, n: Math.max(0, Math.min(4, a.n | 0)) };
    this.syncLevel(false);
  }
}
