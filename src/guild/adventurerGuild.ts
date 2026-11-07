import * as THREE from 'three';
import { events } from '../core/events';
import type { Progression } from '../progression/progression';
import type { DialogueUI, DialogueOption } from '../ui/dialogue';
import { familyOf } from '../items/catalog/gearFx';
import { ITEMS } from '../items/itemDefs';
import { HALLS, makeContract, seeded, type ContractKind, type HallId } from './contracts';
import { EXAMS, NAMED_KINDS, RANKS, rankIndex, type GuildRank } from './ranks';
import { WORLD_X0, WORLD_Z0, WORLD_W, WORLD_H } from '../world/worldMap';

export type { GuildRank } from './ranks';
export type { HallId } from './contracts';

// The Adventurer's Guild (docs/design/guild.md). Three halls (Elder Glen, Port
// Aurelle, the Grand Hall in the Capital), each with its own Quest Wall that
// refreshes every dawn with work from its region. Contracts pay gold, XP,
// reputation and Guild Marks; Marks buy kit from the Quartermaster upstairs.
// Bounties are the named beasts, posted under red wax: bring one down and its
// trophy goes to the Registrar for the purse (and onto the hall's trophy rack).
// Ranks come by exam: reputation earns you the right to sit it.

export interface GuildQuest {
  id: string;
  templateId: string;
  title: string;
  description: string;
  objective: ContractKind;
  hall?: HallId;
  client?: string;
  stars?: number;
  targetItem?: string;
  targetKind?: string;
  targetFamily?: string;
  targetCount?: number;
  targetName?: string;
  target?: [number, number];
  radius?: number;
  progress: number;
  /** survey contracts: sectors already mapped when taken */
  base?: number;
  rewardGold: number;
  rewardXp: number;
  rewardRep: number;
  rewardMarks?: number;
  minRank: number;
  /** urgent: the day it comes down */
  expires?: number;
  /** bounties: the beast is dead; bring its trophy to a Registrar */
  trophy?: boolean;
  /** the rank exam */
  exam?: GuildRank;
  /** exam counts: named kills since the exam was set */
  named?: number;
}

export interface GuildSaveData {
  rank: GuildRank;
  rep: number;
  completed: number;
  nextQuestId: number;
  active: GuildQuest[];
  /** (old saves: the one board) */
  available: GuildQuest[];
  explored: string[];
  marks?: number;
  trophies?: string[];
  halls?: Partial<Record<HallId, { day: number; available: GuildQuest[] }>>;
  /** old saves start promoted by rep, exams passed */
  v?: number;
}

/** The bounties the field bosses post (bosses/fieldBosses.ts). */
export interface BountyTemplate {
  id: string;
  bossId: string;
  title: string;
  description: string;
  objective: 'kill';
  targetKind: string;
  targetCount: number;
  targetName: string;
  target: [number, number];
  radius: number;
  rewardGold: number;
  rewardXp: number;
  rewardRep: number;
  minRank: number;
}

/** A mark on the Hunt Map: a named beast, a rumour, a kill, a contract. */
export interface HuntMark {
  x: number;
  z: number;
  kind: 'boss' | 'bossRumour' | 'bossSlain' | 'contract' | 'bounty' | 'hall';
  label: string;
}

const HALL_POS: Record<HallId, [number, number]> = { glen: [25, -18], port: [2746, 256], capital: [-3625, -1036] };
const BOARD_SIZE = 8;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function rankForRep(rep: number): GuildRank {
  let out: GuildRank = 'D';
  for (const r of RANKS) if (rep >= r.rep) out = r.name;
  return out;
}

function progressText(q: GuildQuest) {
  if (q.trophy) return 'Done. Take the trophy to a Registrar';
  if (q.objective === 'explore') return q.targetName + ': ' + (q.progress ? 'reached' : 'not reached');
  if (q.objective === 'deliver') return 'Deliver to ' + q.targetName + (q.progress ? ': delivered' : '');
  if (q.objective === 'survey') return 'Mapped ' + q.progress + ' / ' + q.targetCount + ' new sectors';
  if (q.objective === 'gather') return 'Gathered ' + q.progress + ' / ' + q.targetCount;
  return q.progress + ' / ' + (q.targetCount ?? 1);
}

export class AdventurerGuild {
  readonly group = new THREE.Group();
  private ui: HTMLDivElement;
  private tab: 'board' | 'map' | 'roster' = 'board';
  private hall: HallId = 'glen';
  private boardEl: HTMLDivElement;
  private mapEl: HTMLDivElement;
  private rosterEl: HTMLDivElement;
  private time = 0;
  private nextId = 1;
  private active: GuildQuest[] = [];
  private halls: Record<HallId, { day: number; available: GuildQuest[] }> = { glen: { day: -1, available: [] }, port: { day: -1, available: [] }, capital: { day: -1, available: [] } };
  private explored = new Set<string>();
  private _rep = 0;
  private _completed = 0;
  private _marks = 0;
  private rank: GuildRank = 'D';
  private trophies: string[] = [];
  private openState = false;
  onToggle?: (open: boolean) => void;
  onSave?: () => void;
  onContract?: (q: GuildQuest, what: 'accepted' | 'completed' | 'abandoned') => void;
  /** A bounty was taken: the boss is marked (roughly) on the map. */
  onBounty?: (bossId: string) => void;
  /** Bounty notices on the wall, from the field bosses (set by main). */
  bounties?: () => BountyTemplate[];
  /** Named beasts for the Hunt Map: found, rumoured and slain (set by main). */
  huntMarks?: () => HuntMark[];
  /** the world's day (set by main) */
  day: () => number = () => 0;
  /** you were promoted (main: the ceremony, the HUD badge) */
  onPromote?: (rank: GuildRank) => void;
  /** the trophies changed (main: the hall's rack) */
  onTrophies?: (ids: string[]) => void;
  /** a message for the HUD (set by main) */
  toast?: (m: string) => void;
  /** a parcel to carry (deliveries): give and take it from the bag (set by main) */
  parcel?: { give(): void; take(): void };

  get activeContracts() {
    return this.active;
  }

  constructor(scene: THREE.Scene, private progression: Progression, dialogue: DialogueUI) {
    void scene;
    void dialogue;
    const root = document.getElementById('ui')!;
    this.ui = document.createElement('div');
    this.ui.className = 'guild-ui hidden';
    this.ui.innerHTML =
      '<div class="guild-head"><div><span class="eyebrow"></span><h1>ADVENTURER\'S GUILD</h1><p class="guild-rank"></p></div><button class="guild-close">LEAVE ✕</button></div>' +
      '<div class="guild-tabs"><button data-tab="board">QUEST WALL</button><button data-tab="map">HUNT MAP</button><button data-tab="roster">RANK LADDER</button></div>' +
      '<div class="guild-body"><div class="guild-board"></div><div class="guild-hunt"></div><div class="guild-roster"></div></div>' +
      '<div class="guild-foot"><span>Pull a notice off the wall to take it. Bounty trophies go to the Registrar\'s counter.</span><span>Esc · leave</span></div>';
    root.appendChild(this.ui);
    this.boardEl = this.ui.querySelector('.guild-board')!;
    this.mapEl = this.ui.querySelector('.guild-hunt')!;
    this.rosterEl = this.ui.querySelector('.guild-roster')!;
    this.ui.querySelector('.guild-close')!.addEventListener('click', () => this.close());
    this.ui.querySelectorAll<HTMLButtonElement>('.guild-tabs button').forEach((b) =>
      b.addEventListener('click', () => {
        this.tab = b.dataset.tab as 'board' | 'map' | 'roster';
        this.render();
      }),
    );
    window.addEventListener('keydown', (e) => {
      if (!this.openState) return;
      if (e.code === 'Escape') {
        e.stopImmediatePropagation();
        this.close();
      }
    }, true);
    events.on('enemyDied', ({ kind }) => this.onKill(kind));
  }

  // ---- rank ------------------------------------------------------------------------------------
  get guildRank() { return this.rank; }
  get reputation() { return this._rep; }
  get completedCount() { return this._completed; }
  get marks() { return this._marks; }
  get rankDef() { return RANKS[rankIndex(this.rank)]; }
  get slots() { return this.rankDef.slots; }
  /** off at the guild's partner shops */
  get discount() { return this.rankDef.discount; }
  get trophyIds() { return this.trophies; }
  /** the next rank, if your reputation has earned the right to sit its exam */
  get examDue(): GuildRank | null {
    const next = RANKS[rankIndex(this.rank) + 1];
    return next && this._rep >= next.rep ? next.name : null;
  }
  get examTaken() {
    return this.active.find((q) => q.exam);
  }

  /** Reputation from outside the board (side quests for the town). */
  addRep(n: number) {
    this._rep += n;
    this.render();
  }
  spendMarks(n: number) {
    if (this._marks < n) return false;
    this._marks -= n;
    this.onSave?.();
    return true;
  }

  /** Pass to the next rank (the exam is done, or a test/old save asks). */
  promote(to?: GuildRank) {
    const next = to ?? RANKS[rankIndex(this.rank) + 1]?.name;
    if (!next || rankIndex(next) <= rankIndex(this.rank)) return;
    this.rank = next;
    this.progression.addGold(75 * rankIndex(this.rank));
    events.emit('deed', { id: 'guild:' + this.rank, renown: 1, label: `Promoted to guild rank ${this.rank}` });
    this.onPromote?.(this.rank);
    for (const h of Object.keys(this.halls) as HallId[]) this.halls[h].day = -1; // fresh work for the new rank
    this.onSave?.();
    this.render();
  }

  // ---- the walls -------------------------------------------------------------------------------
  /** A hall's wall, refreshed at dawn (urgent notices that ran out come down). */
  board(hall: HallId) {
    const h = this.halls[hall];
    const day = this.day();
    if (h.day !== day) {
      const r = seeded(day * 977 + hall.length * 31 + rankIndex(this.rank) * 7);
      const keep = h.day >= 0 ? h.available.filter((q) => !q.expires || q.expires >= day).slice(0, 2) : [];
      h.available = keep;
      while (h.available.length < BOARD_SIZE) h.available.push(this.fromSpec(hall, makeContract(HALLS[hall], rankIndex(this.rank), day, r)));
      h.day = day;
    }
    return h.available;
  }
  private fromSpec(hall: HallId, s: ReturnType<typeof makeContract>): GuildQuest {
    return {
      id: 'guild-' + this.nextId++, templateId: hall + ':' + s.kind, title: s.title, description: s.description, objective: s.kind, hall, client: s.client, stars: s.stars,
      targetItem: s.targetItem, targetKind: s.targetKind, targetFamily: s.targetFamily, targetCount: s.targetCount, targetName: s.targetName, target: s.target, radius: s.radius,
      progress: 0, rewardGold: s.rewardGold, rewardXp: s.rewardXp, rewardRep: s.rewardRep, rewardMarks: s.rewardMarks, minRank: s.minRank, expires: s.expires,
    };
  }
  /** Whether a hall's wall is open to you (the port at C, the capital at B). */
  hallOpen(hall: HallId) {
    return rankIndex(this.rank) >= HALLS[hall].minRank;
  }
  /** For the interior's painted wall: notices per rank column, bounty posters. */
  wallLook(hall: HallId) {
    const cols = [0, 0, 0, 0, 0];
    for (const q of this.board(hall)) cols[Math.min(4, q.minRank)]++;
    return { columns: cols, bounties: (this.bounties?.() ?? []).length };
  }

  accept(id: string) {
    for (const hall of Object.keys(this.halls) as HallId[]) {
      const list = this.halls[hall].available;
      const i = list.findIndex((q) => q.id === id);
      if (i < 0) continue;
      if (this.active.length >= this.slots || list[i].minRank > rankIndex(this.rank)) return;
      const [q] = list.splice(i, 1);
      if (q.objective === 'survey') q.base = this.explored.size;
      if (q.objective === 'deliver') this.parcel?.give();
      this.active.push(q);
      this.onSave?.();
      this.render();
      this.onContract?.(q, 'accepted');
      return;
    }
  }

  /** Take a bounty off the wall (it counts as one of your contracts). */
  acceptBounty(templateId: string) {
    const t = this.bounties?.().find((b) => b.id === templateId);
    if (!t || this.active.length >= this.slots || this.active.some((q) => q.templateId === templateId) || t.minRank > rankIndex(this.rank)) return false;
    const q: GuildQuest = { id: 'guild-' + this.nextId++, templateId: t.id, title: t.title, description: t.description, objective: 'kill', targetKind: t.targetKind, targetCount: 1, targetName: t.targetName, target: t.target, radius: t.radius, progress: 0, rewardGold: t.rewardGold, rewardXp: t.rewardXp, rewardRep: t.rewardRep, rewardMarks: 6 + t.minRank * 3, minRank: t.minRank };
    this.active.push(q);
    this.onBounty?.(t.bossId);
    this.onSave?.();
    this.render();
    this.onContract?.(q, 'accepted');
    return true;
  }

  /** Sit the exam for the next rank (from the Registrar). */
  takeExam() {
    const due = this.examDue;
    if (!due || this.examTaken) return null;
    const e = EXAMS[due];
    const q: GuildQuest = { id: 'guild-' + this.nextId++, templateId: 'exam:' + due, title: e.title, description: e.brief, objective: e.kind === 'hunt' ? 'hunt' : 'kill', targetFamily: e.targetFamily, targetCount: e.targetCount ?? 1, progress: 0, rewardGold: 0, rewardXp: 150 * (rankIndex(due) + 1), rewardRep: 0, rewardMarks: 5 * (rankIndex(due) + 1), minRank: 0, exam: due, expires: e.days ? this.day() + e.days : undefined };
    this.active.push(q);
    this.onSave?.();
    this.render();
    this.onContract?.(q, 'accepted');
    return q;
  }

  abandon(id: string) {
    const i = this.active.findIndex((q) => q.id === id);
    if (i < 0) return;
    const [q] = this.active.splice(i, 1);
    // Walking away costs a little standing (and a parcel goes back).
    if (!q.exam) this._rep = Math.max(0, this._rep - Math.round(q.rewardRep * 0.25));
    if (q.objective === 'deliver' && !q.progress) this.parcel?.take();
    this.onSave?.();
    this.render();
    this.onContract?.(q, 'abandoned');
  }

  /** Gather contracts read (and on completion take) from the player's bag. */
  inventory?: { count(id: string): number; take(id: string, n: number): void };

  private onKill(kind: string) {
    let changed = false;
    const fam = familyOf(kind);
    for (const q of this.active) {
      if (q.trophy || q.progress >= (q.targetCount ?? 1)) continue;
      if (q.exam && q.objective === 'kill') {
        if (NAMED_KINDS.has(kind)) (q.progress++, (changed = true));
        continue;
      }
      if (q.objective === 'hunt' && (q.targetFamily === fam || (q.targetFamily === 'beast' && fam === 'beast'))) (q.progress++, (changed = true));
      else if (q.objective === 'kill' && (q.targetKind === 'any' || q.targetKind === kind)) (q.progress++, (changed = true));
      else if (q.objective === 'clear' && q.target && this.lastPos && Math.hypot(this.lastPos.x - q.target[0], this.lastPos.z - q.target[1]) <= (q.radius ?? 40) + 20) (q.progress++, (changed = true));
    }
    if (changed) {
      this.onSave?.();
      this.render();
    }
  }
  private lastPos: THREE.Vector3 | null = null;

  private complete(q: GuildQuest) {
    this.active = this.active.filter((x) => x.id !== q.id);
    if (q.objective === 'gather' && q.targetItem) this.inventory?.take(q.targetItem, q.targetCount ?? 1);
    if (q.objective === 'deliver') this.parcel?.take();
    this._completed++;
    this._rep += q.rewardRep;
    const marks = (q.rewardMarks ?? 0) + (q.exam ? 0 : this.rankDef.marksBonus);
    this._marks += marks;
    this.progression.addGold(q.rewardGold);
    this.progression.addXp(q.rewardXp);
    if (q.templateId.startsWith('bounty:')) {
      this.trophies = [q.templateId.slice(7), ...this.trophies.filter((t) => t !== q.templateId.slice(7))].slice(0, 12);
      this.onTrophies?.(this.trophies);
    }
    this.onSave?.();
    events.emit('progressChanged', {});
    this.render();
    this.onContract?.(q, 'completed');
    if (q.exam) this.promote(q.exam);
  }

  /** Bring bounty trophies to the counter: the purse for each (Registrars, guildmasters). */
  turnIn() {
    const due = this.active.filter((q) => q.trophy);
    for (const q of due) this.complete(q);
    return due;
  }

  private questProgress(q: GuildQuest, at: THREE.Vector3) {
    if ((q.objective === 'explore' || q.objective === 'deliver') && q.target) {
      q.progress = q.progress || (Math.hypot(at.x - q.target[0], at.z - q.target[1]) <= (q.radius ?? 24) ? 1 : 0);
    } else if (q.objective === 'survey') {
      q.progress = Math.min(q.targetCount ?? 0, this.explored.size - (q.base ?? 0));
    } else if (q.objective === 'gather' && q.targetItem && this.inventory) {
      q.progress = Math.min(q.targetCount ?? 1, this.inventory.count(q.targetItem));
    }
  }

  update(dt: number, playerPos: THREE.Vector3) {
    this.time += dt;
    this.lastPos = playerPos;
    const cell = Math.floor(playerPos.x / 64) + ',' + Math.floor(playerPos.z / 64);
    this.explored.add(cell);
    for (const q of this.active) this.questProgress(q, playerPos);
    const day = this.day();
    // Urgent work that ran out of time comes down, and the guild remembers.
    for (const q of [...this.active]) {
      if (!q.expires || day <= q.expires || q.progress >= (q.targetCount ?? 1)) continue;
      this.active = this.active.filter((x) => x !== q);
      this._rep = Math.max(0, this._rep - (q.exam ? 0 : Math.round(q.rewardRep * 0.5)));
      if (q.objective === 'deliver') this.parcel?.take();
      this.toast?.(q.exam ? `The exam ran out of time: ${q.title}. You may sit it again.` : `Contract failed: ${q.title} (out of time)`);
      this.onContract?.(q, 'abandoned');
      this.onSave?.();
    }
    for (const q of this.active.filter((x) => !x.trophy && x.progress >= (x.targetCount ?? 1))) {
      // Bounties: the beast is dead; its trophy still has to reach a Registrar.
      if (q.templateId.startsWith('bounty:')) {
        q.trophy = true;
        this.toast?.(`You take a trophy from ${q.targetName}. Bring it to a guild Registrar.`);
        this.onSave?.();
        this.render();
      } else this.complete(q);
    }
  }

  setVisible(v: boolean) {
    this.group.visible = v;
    if (!v && this.openState) this.close();
  }

  // ---- the Registrar ---------------------------------------------------------------------------
  /** What a Registrar or guildmaster can do for you, as dialogue replies. */
  registrarOptions(say: (text: string) => void): DialogueOption[] {
    const out: DialogueOption[] = [];
    const trophies = this.active.filter((q) => q.trophy);
    if (trophies.length) {
      out.push({
        label: `Hand over ${trophies.length > 1 ? 'the trophies' : `${trophies[0].targetName}'s trophy`}.`,
        auto: true,
        run: () => {
          const done = this.turnIn();
          const gold = done.reduce((a, q) => a + q.rewardGold, 0);
          say(`${done.map((q) => q.targetName).join(' and ')}. The guild will hang ${done.length > 1 ? 'them' : 'it'} on the rack outside, and the whole valley will hear. Your purse: ${gold} gold, and Marks besides.`);
        },
      });
    }
    const due = this.examDue, taken = this.examTaken;
    if (due && !taken) {
      out.push({
        label: `I'm ready for my ${due}-rank exam.`,
        run: () => {
          const q = this.takeExam();
          say(q ? `${q.description} It's in your contracts now. Pass it and you leave here ${due}-rank.` : 'Not today.');
        },
      });
    } else if (taken) {
      out.push({ label: 'How am I doing on the exam?', run: () => say(`${taken.title}: ${progressText(taken)}.${taken.expires ? ` You have until the end of day ${taken.expires}.` : ''}`) });
    }
    out.push({
      label: 'What does my rank give me?',
      run: () => {
        const r = this.rankDef, next = RANKS[rankIndex(this.rank) + 1];
        say(`You're ${r.name}-rank: ${r.perks.join('; ')}. You hold ${this._marks} Guild Marks.` + (next ? ` ${next.name}-rank needs ${next.rep} reputation (you have ${this._rep}) and its exam. It gives: ${next.perks.join('; ')}.` : ' There is no rank above yours.'));
      },
    });
    return out;
  }

  /** Quartermaster stock, priced in Marks, by rank. */
  quartermasterStock(): { id: string; marks: number; rank: GuildRank }[] {
    const list: [string, number, GuildRank][] = [
      ['healthPotion', 3, 'D'], ['manaPotion', 3, 'D'], ['lockpicks', 4, 'D'], ['arrowIron', 2, 'D'], ['minersLantern', 6, 'D'],
      ['greaterHealthPotion', 8, 'C'], ['greaterManaPotion', 8, 'C'],
      ['knightSword', 30, 'B'], ['kiteShield', 26, 'B'],
    ];
    return list.filter(([id]) => ITEMS[id]).map(([id, marks, rank]) => ({ id, marks, rank }));
  }

  // ---- the screens -----------------------------------------------------------------------------
  open(tab: 'board' | 'map' | 'roster' = 'board', hall: HallId = this.hall) {
    this.tab = tab;
    this.hall = hall;
    this.openState = true;
    this.ui.classList.remove('hidden');
    this.onToggle?.(true);
    this.render();
  }

  close() {
    this.openState = false;
    this.ui.classList.add('hidden');
    this.onToggle?.(false);
  }

  private render() {
    if (!this.openState) return;
    const r = this.rankDef, next = RANKS[rankIndex(this.rank) + 1];
    this.ui.querySelector('.eyebrow')!.textContent = 'By charter of the Crown of Cresha · ' + HALLS[this.hall].name;
    this.ui.querySelector('.guild-rank')!.innerHTML = '<b style="color:' + r.color + '">' + this.rank + ' Rank</b> · ' + this._rep + ' reputation · <b class="guild-marks">' + this._marks + ' Marks</b>' + (next ? ' · ' + (this.examDue ? '<em class="guild-exam">' + next.name + '-rank exam ready: see the Registrar</em>' : (next.rep - this._rep) + ' to sit the ' + next.name + '-rank exam') : ' · MAX RANK');
    this.ui.querySelectorAll<HTMLButtonElement>('.guild-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    this.boardEl.style.display = this.tab === 'board' ? 'grid' : 'none';
    this.mapEl.style.display = this.tab === 'map' ? 'block' : 'none';
    this.rosterEl.style.display = this.tab === 'roster' ? 'grid' : 'none';
    if (this.tab === 'board') this.renderBoard();
    if (this.tab === 'map') this.renderMap();
    if (this.tab === 'roster') this.renderRoster();
  }

  private card(q: GuildQuest, cls: string, button: string) {
    const stars = q.stars ? '<span class="quest-stars">' + '★'.repeat(q.stars) + '<i>' + '★'.repeat(5 - q.stars) + '</i></span>' : '';
    const urgent = q.expires ? '<span class="quest-urgent">' + (q.exam ? 'TIMED' : 'URGENT') + ' · until day ' + q.expires + '</span>' : '';
    const pay = q.exam ? 'Pass: promotion to ' + q.exam + '-rank' : '+' + q.rewardGold + ' gold · +' + q.rewardXp + ' XP · +' + q.rewardRep + ' rep · +' + ((q.rewardMarks ?? 0) + this.rankDef.marksBonus) + ' Marks';
    return '<article class="guild-quest ' + cls + (q.expires ? ' urgent' : '') + '"><div class="quest-top"><span class="quest-rank">' + (q.exam ? 'EXAM' : q.templateId.startsWith('bounty:') ? 'BOUNTY · RANK ' + RANKS[q.minRank].name : 'RANK ' + RANKS[Math.min(q.minRank, RANKS.length - 1)].name) + '</span>' + stars + '<h3>' + esc(q.title) + '</h3>' + urgent + '</div>' +
      (q.client ? '<small class="quest-client">Posted by ' + esc(q.client) + '</small>' : '') + '<p>' + esc(q.description) + '</p><b class="quest-progress">' + progressText(q) + '</b><div class="quest-reward">' + pay + '</div>' + button + '</article>';
  }

  private renderBoard() {
    const hall = this.hall;
    const full = this.active.length >= this.slots;
    const active = this.active.map((q) => this.card(q, 'active', q.exam ? '' : '<button data-abandon="' + q.id + '">ABANDON</button>')).join('');
    if (!this.hallOpen(hall)) {
      this.boardEl.innerHTML = '<section class="guild-section"><h2>' + HALLS[hall].name.toUpperCase() + '</h2><p class="guild-empty">This hall\'s wall is for ' + RANKS[HALLS[hall].minRank].name + '-rank and above. Come back when you\'ve earned it.</p></section>';
      return;
    }
    const board = this.board(hall).map((q) => this.card(q, '', '<button data-accept="' + q.id + '" ' + (full || q.minRank > rankIndex(this.rank) ? 'disabled' : '') + '>TAKE THE NOTICE</button>')).join('');
    const offered = (this.bounties?.() ?? []).filter((b) => !this.active.some((q) => q.templateId === b.id));
    const bounties = offered.map((b) =>
      '<article class="guild-quest bounty"><div class="quest-top"><span class="quest-rank">BOUNTY · RANK ' + RANKS[b.minRank].name + '</span><h3>' + esc(b.title) + '</h3></div><p>' + esc(b.description) + '</p><b class="quest-progress">Wanted: ' + esc(b.targetName) + '</b><div class="quest-reward">+' + b.rewardGold + ' gold · +' + b.rewardXp + ' XP · +' + b.rewardRep + ' rep · +' + (6 + b.minRank * 3 + this.rankDef.marksBonus) + ' Marks · trophy to the Registrar</div><button data-bounty="' + b.id + '" ' + (full || b.minRank > rankIndex(this.rank) ? 'disabled' : '') + '>TAKE THE BOUNTY</button></article>',
    ).join('');
    this.boardEl.innerHTML = '<section class="guild-section"><h2>YOUR CONTRACTS <span>' + this.active.length + ' / ' + this.slots + '</span></h2>' + (active ? '<div class="guild-grid">' + active + '</div>' : '<p class="guild-empty">No contracts. Take a notice from the wall.</p>') + '</section>' +
      (bounties ? '<section class="guild-section wanted"><h2>WANTED <span>under red wax</span></h2><div class="guild-grid">' + bounties + '</div></section>' : '') +
      '<section class="guild-section"><h2>THE QUEST WALL <span>fresh notices every dawn</span></h2><div class="guild-grid">' + board + '</div></section>';
    this.boardEl.querySelectorAll<HTMLButtonElement>('[data-bounty]').forEach((b) => b.addEventListener('click', () => this.acceptBounty(b.dataset.bounty!)));
    this.boardEl.querySelectorAll<HTMLButtonElement>('[data-accept]').forEach((b) => b.addEventListener('click', () => this.accept(b.dataset.accept!)));
    this.boardEl.querySelectorAll<HTMLButtonElement>('[data-abandon]').forEach((b) => b.addEventListener('click', () => this.abandon(b.dataset.abandon!)));
  }

  /** The Hunt Map: the land, every named beast you know of, the bounties and your contracts. */
  private renderMap() {
    const marks: HuntMark[] = [...(this.huntMarks?.() ?? [])];
    for (const q of this.active) if (q.target) marks.push({ x: q.target[0], z: q.target[1], kind: q.templateId.startsWith('bounty:') ? 'bounty' : 'contract', label: q.targetName ?? q.title });
    for (const [h, [x, z]] of Object.entries(HALL_POS)) marks.push({ x, z, kind: 'hall', label: HALLS[h as HallId].name });
    const px = (x: number) => ((x - WORLD_X0) / WORLD_W) * 100, pz = (z: number) => ((z - WORLD_Z0) / WORLD_H) * 100;
    const pins = marks.map((m) => '<i class="hm-pin hm-' + m.kind + '" style="left:' + px(m.x).toFixed(2) + '%;top:' + pz(m.z).toFixed(2) + '%" title="' + esc(m.label) + '"><span>' + esc(m.label) + '</span></i>').join('');
    const known = marks.filter((m) => m.kind === 'boss' || m.kind === 'bossRumour');
    const slain = marks.filter((m) => m.kind === 'bossSlain');
    this.mapEl.innerHTML = '<div class="hm-wrap"><div class="hm-map">' + pins + '</div><aside class="hm-side"><h2>THE HUNT</h2><p>Every named beast the guild knows of, pinned where it was last seen. Rumours are marked with a question; kills are struck through.</p>' +
      '<h3>At large</h3>' + (known.length ? '<ul>' + known.map((m) => '<li class="' + m.kind + '">' + esc(m.label) + '</li>').join('') + '</ul>' : '<p class="guild-empty">Nothing known yet. Listen in taverns, and take bounties.</p>') +
      (slain.length ? '<h3>Brought down</h3><ul>' + slain.map((m) => '<li class="slain">' + esc(m.label) + '</li>').join('') + '</ul>' : '') +
      '<h3>Your trophies</h3><p>' + (this.trophies.length ? this.trophies.length + ' on the rack outside the Glen hall' : 'None yet') + '</p></aside></div>';
  }

  /** The Rank Ladder: every rank, what it gives, and where you stand. */
  private renderRoster() {
    const me = rankIndex(this.rank);
    // The kingdom's adventurers you've heard of, at the ranks they hold.
    const who: Record<GuildRank, string[]> = {
      SSS: [], SS: ['Grandmaster Brannoc Steel'], S: ['Wendeline Ashcombe'], A: [],
      B: ['Ingrid Vale'], C: ['Lyssa Fen', 'Sif Arden', 'Dagna Holt'], D: ['Rook Ashdown', 'Garrick Stone', 'Selka Moor', 'Tam Quickley', 'Pell Harrow'],
    };
    const rungs = RANKS.map((r, i) => {
      const others = who[r.name];
      const you = i === me ? '<b class="rl-you">You</b>' : '';
      return '<article class="rl-rung' + (i === me ? ' here' : i < me ? ' passed' : '') + '"><span class="rl-rank" style="color:' + r.color + '">' + r.name + '</span><div><div class="rl-names">' + you + others.map((n) => '<span>' + n + '</span>').join('') + '</div><small>' + r.perks.join(' · ') + '</small>' + (i > 0 ? '<em>' + r.rep + ' reputation, then the exam</em>' : '') + '</div></article>';
    }).reverse().join('');
    this.rosterEl.innerHTML = '<div class="guild-roster-intro"><h2>THE RANK LADDER</h2><p>Reputation earns you the right to sit the next exam; passing it is the promotion. You have ' + this._rep + ' reputation, ' + this._marks + ' Marks, and ' + this._completed + ' contracts done.</p></div><div class="rl-ladder">' + rungs + '</div>';
  }

  // ---- save ----------------------------------------------------------------------------------
  toJSON(): GuildSaveData {
    return { v: 2, rank: this.rank, rep: this._rep, completed: this._completed, nextQuestId: this.nextId, active: this.active, available: [], explored: Array.from(this.explored), marks: this._marks, trophies: this.trophies, halls: this.halls };
  }

  fromJSON(data: GuildSaveData | undefined) {
    if (!data) return;
    // Old saves: the rank their reputation had earned stands (no exam to sit for it).
    this.rank = data.rank && RANKS.some((r) => r.name === data.rank) ? data.rank : rankForRep(data.rep ?? 0);
    this._rep = data.rep ?? 0;
    this._completed = data.completed ?? 0;
    this.nextId = data.nextQuestId ?? 1;
    this.active = Array.isArray(data.active) ? data.active.filter((q) => q.objective) : [];
    for (const q of this.active) if ((q.objective as string) === 'kill' && q.targetKind && !q.hall && !q.templateId.startsWith('bounty:') && !q.exam) q.hall = 'glen';
    this.explored = new Set(data.explored ?? []);
    this._marks = data.marks ?? 0;
    this.trophies = data.trophies ?? [];
    for (const h of Object.keys(this.halls) as HallId[]) {
      const s = data.halls?.[h];
      this.halls[h] = s ? { day: s.day, available: s.available ?? [] } : { day: -1, available: [] };
    }
    this.onTrophies?.(this.trophies);
    this.render();
  }
}
