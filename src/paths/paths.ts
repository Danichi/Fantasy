import { events } from '../core/events';
import type { Progression } from '../progression/progression';
import { DISC, DISCIPLINES, type DisciplineDef } from './data';

// The player's disciplines: levels bought with XP, tree nodes bought with
// each discipline's tree points, mastery, attributes and the active combat
// class. XP itself lives on Progression (it's also what pickups add to).

export type AttrId = 'vig' | 'end' | 'mig' | 'fin' | 'int' | 'fai' | 'spi';
export const ATTRS: { id: AttrId; name: string; glyph: string; desc: string }[] = [
  { id: 'vig', name: 'Vigor', glyph: 'V', desc: '+10 max health.' },
  { id: 'end', name: 'Endurance', glyph: 'E', desc: '+4 max stamina and +2% stamina regen.' },
  { id: 'mig', name: 'Might', glyph: 'M', desc: '+3% damage with heavy weapons and +2% poise damage.' },
  { id: 'fin', name: 'Finesse', glyph: 'F', desc: '+3% damage with light and balanced weapons.' },
  { id: 'int', name: 'Intellect', glyph: 'I', desc: '+6 max mana and +3% spell damage.' },
  { id: 'fai', name: 'Faith', glyph: 'Fa', desc: '+4% healing from spells and potions.' },
  { id: 'spi', name: 'Spirit', glyph: 'S', desc: '+4% mana regen.' },
];

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
export const MAX_RANK = 5;
export const MASTERY_XP = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500];
export const MASTERY_NAMES = ['Untrained', 'Novice', 'Novice', 'Apprentice', 'Apprentice', 'Adept', 'Adept', 'Expert', 'Expert', 'Master', 'Grandmaster'];
export const MASTERY_DISCOUNT = 0.035;
export const RESPEC_REFUND = 0.75;

/** Full-price XP to go from level L to L+1 (learning, 0 to 1, is done by a mentor). */
export function levelCost(L: number) {
  return L === 0 ? 100 : Math.round(100 * Math.pow(L, 1.5));
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
  const nodes: TreeNode[] = [{ id: 'c', type: 'center', name: d.name, tier: 0, branch: -1, k: 0, len: 1 }];
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
}

export class Paths {
  lv: Record<string, number> = {};
  mx: Record<string, number> = {};
  nodes: Record<string, Record<string, LearnedNode>> = {};
  attrs: Record<AttrId, number> = { vig: 0, end: 0, mig: 0, fin: 0, int: 0, fai: 0, spi: 0 };
  active = 'gale';

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
    this.active = 'gale';
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
    const L = this.level(id);
    return L > 0 && L < MAX_LEVEL && this.prog.xp >= this.nextCost(id);
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
    if (!d || this.learned(id)) return false;
    return !d.requires || this.level(d.requires[0]) >= d.requires[1];
  }
  teach(id: string) {
    if (!this.canTeach(id)) return false;
    this.lv[id] = 1;
    events.emit('disciplineLearned', { id });
    events.emit('disciplineLevel', { id, level: 1 });
    this.syncLevel(true);
    events.emit('progressChanged', {});
    return true;
  }
  /** Only combat classes can be active, and only one at a time. */
  setActive(id: string) {
    if (DISC[id]?.fam !== 'combat' || !this.learned(id) || this.active === id) return false;
    this.active = id;
    events.emit('pathsChanged', {});
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
  earned(id: string) {
    const L = this.level(id);
    return L + Math.floor(L / 5);
  }
  spent(id: string) {
    const t = treeOf(DISC[id]);
    if (!t) return 0;
    let s = 0;
    for (const [nid, v] of Object.entries(this.nodes[id] ?? {})) {
      const n = t.map[nid];
      if (n) s += NODE_COST[n.type] + (n.type === 'active' ? v.r - 1 : 0);
    }
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
    return true;
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
    if (n.type === 'cap' && !this.open(id, n)) return 'You already own a capstone in this tree';
    if (this.points(id) < NODE_COST[n.type]) return `Needs ${NODE_COST[n.type]} tree point${NODE_COST[n.type] > 1 ? 's' : ''}`;
    return null;
  }
  learn(id: string, n: TreeNode, pick = 0) {
    if (!this.canLearn(id, n)) return false;
    this.nodes[id][n.id] = n.type === 'choice' ? { r: 1, pick } : { r: 1 };
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
    return (this.charLevel - 1) * 4 + this.attrs.vig * 10;
  }
  get bonusStamina() {
    return (this.charLevel - 1) * 2 + this.attrs.end * 4;
  }
  get bonusMana() {
    return (this.charLevel - 1) * 2 + this.attrs.int * 6;
  }
  get staminaRegen() {
    return this.attrs.end * 0.02;
  }
  get manaRegen() {
    return this.attrs.spi * 0.04;
  }
  get spellPower() {
    return 1 + this.attrs.int * 0.03;
  }
  get healPower() {
    return 1 + this.attrs.fai * 0.04;
  }
  /** Melee damage multiplier. Slow (heavy) weapons scale with Might, fast ones with Finesse. */
  meleePower(weaponSpeed = 1) {
    const heavy = weaponSpeed < 0.95 ? 1 : weaponSpeed > 1.05 ? 0 : 0.5;
    return 1 + 0.03 * (this.attrs.mig * heavy + this.attrs.fin * (1 - heavy));
  }
  get poisePower() {
    return 1 + this.attrs.mig * 0.02;
  }

  // ---- save ------------------------------------------------------------------------
  serialize(): PathsSave {
    return { lv: { ...this.lv }, mx: { ...this.mx }, nodes: structuredClone(this.nodes), attrs: { ...this.attrs }, active: this.active };
  }
  load(s: PathsSave) {
    this.reset();
    for (const d of DISCIPLINES) {
      this.lv[d.id] = Math.max(0, Math.min(MAX_LEVEL, Math.floor(s.lv?.[d.id] ?? this.lv[d.id])));
      this.mx[d.id] = Math.max(0, s.mx?.[d.id] ?? 0);
      const t = treeOf(d);
      const saved = s.nodes?.[d.id] ?? {};
      this.nodes[d.id] = {};
      if (t) for (const [nid, v] of Object.entries(saved)) if (t.map[nid]) this.nodes[d.id][nid] = { r: Math.max(1, Math.min(MAX_RANK, v.r | 0)), pick: v.pick };
    }
    for (const a of ATTRS) this.attrs[a.id] = Math.max(0, s.attrs?.[a.id] | 0);
    // Never more attribute points than the level allows.
    while (this.attrSpent > this.charLevel - 1) {
      const top = ATTRS.reduce((m, a) => (this.attrs[a.id] > this.attrs[m.id] ? a : m));
      this.attrs[top.id]--;
    }
    this.active = DISC[s.active]?.fam === 'combat' && this.learned(s.active) ? s.active : 'gale';
    if (!this.learned(this.active)) this.lv[this.active] = 1;
    this.syncLevel(false);
  }
}
