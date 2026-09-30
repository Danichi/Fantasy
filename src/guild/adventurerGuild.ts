import * as THREE from 'three';
import { events } from '../core/events';
import type { Progression } from '../progression/progression';
import type { DialogueUI } from '../ui/dialogue';

export type GuildRank = 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS';

export interface GuildQuest {
  id: string;
  templateId: string;
  title: string;
  description: string;
  objective: 'kill' | 'explore' | 'survey' | 'gather';
  /** gather contracts: the item handed in */
  targetItem?: string;
  targetKind?: string;
  targetCount?: number;
  targetName?: string;
  target?: [number, number];
  radius?: number;
  progress: number;
  rewardGold: number;
  rewardXp: number;
  rewardRep: number;
  minRank: number;
}

export interface GuildSaveData {
  rank: GuildRank;
  rep: number;
  completed: number;
  nextQuestId: number;
  active: GuildQuest[];
  available: GuildQuest[];
  explored: string[];
}

const RANKS: { name: GuildRank; rep: number }[] = [
  { name: 'D', rep: 0 },
  { name: 'C', rep: 150 },
  { name: 'B', rep: 400 },
  { name: 'A', rep: 900 },
  { name: 'S', rep: 1800 },
  { name: 'SS', rep: 3600 },
  { name: 'SSS', rep: 7500 },
];

const RANK_COLORS: Record<GuildRank, string> = {
  D: '#a9b3ba',
  C: '#9fb6c4',
  B: '#8fb0c6',
  A: '#d9a650',
  S: '#f0c24a',
  SS: '#7fb0ee',
  SSS: '#c08af0',
};

interface QuestTemplate {
  id: string;
  title: string;
  description: string;
  objective: GuildQuest['objective'];
  targetItem?: string;
  targetKind?: string;
  targetCount?: number;
  targetName?: string;
  target?: [number, number];
  radius?: number;
  rewardGold: number;
  rewardXp: number;
  rewardRep: number;
  minRank: number;
}

const TEMPLATES: QuestTemplate[] = [
  // Elder Glen (D rank): the farming town's everyday trouble.
  { id: 'wolf-1', title: 'Wolves at the Pasture', description: 'Wolves have been circling Tom Hale\'s cattle. Put down the pack before it grows bold.', objective: 'kill', targetKind: 'green', targetCount: 3, rewardGold: 45, rewardXp: 50, rewardRep: 35, minRank: 0 },
  { id: 'wolf-2', title: 'The Long Howl', description: 'The wolves in the western woods are still hunting the road. Thin the packs further.', objective: 'kill', targetKind: 'green', targetCount: 6, rewardGold: 75, rewardXp: 80, rewardRep: 50, minRank: 0 },
  { id: 'goblin-1', title: 'Goblin Scouts', description: 'Goblin scouts have been seen around the fields at dusk. Deal with them before they bring the rest.', objective: 'kill', targetKind: 'cave', targetCount: 3, rewardGold: 70, rewardXp: 80, rewardRep: 50, minRank: 0 },
  { id: 'herb-1', title: 'Apothecary Supply', description: 'Ilyra Moss needs Sungrass for her healing draughts. Gather it along the roadsides.', objective: 'gather', targetItem: 'sungrass', targetCount: 4, rewardGold: 40, rewardXp: 45, rewardRep: 30, minRank: 0 },
  { id: 'wheat-1', title: 'Harvest Hands', description: 'The farmers are short-handed. Help bring in the wheat and hand over a dozen sheaves.', objective: 'gather', targetItem: 'wheat', targetCount: 12, rewardGold: 45, rewardXp: 45, rewardRep: 30, minRank: 0 },
  { id: 'wool-1', title: 'Wool for the Weavers', description: 'The Glen\'s weavers are behind on a capital order. Shear the north-pasture sheep.', objective: 'gather', targetItem: 'wool', targetCount: 3, rewardGold: 50, rewardXp: 50, rewardRep: 30, minRank: 0 },
  { id: 'quarry-1', title: 'Survey: The Old Quarry', description: 'Nobody has checked the old quarry in the northern hills in years. See what lives there now.', objective: 'explore', targetName: 'The Old Quarry', target: [-180, -262], radius: 26, rewardGold: 70, rewardXp: 90, rewardRep: 55, minRank: 0 },
  { id: 'herb-2', title: 'Moonlit Harvest', description: 'Moongrass is easiest to find by night along the river. Bring three stems.', objective: 'gather', targetItem: 'moongrass', targetCount: 3, rewardGold: 70, rewardXp: 80, rewardRep: 50, minRank: 1 },
  { id: 'ore-1', title: 'Quarry Samples', description: 'The guild smith wants iron samples from the old quarry. Four lumps of ore.', objective: 'gather', targetItem: 'ironOre', targetCount: 4, rewardGold: 95, rewardXp: 100, rewardRep: 60, minRank: 1 },
  { id: 'stag-1', title: 'Rutting Stags', description: 'Maddened stags have been charging travellers on the roads. Bring two down.', objective: 'kill', targetKind: 'blue', targetCount: 2, rewardGold: 85, rewardXp: 90, rewardRep: 55, minRank: 1 },
  { id: 'mixed-1', title: 'Roadside Sweep', description: 'Remove any hostile creatures blocking the town approaches.', objective: 'kill', targetKind: 'any', targetCount: 10, rewardGold: 100, rewardXp: 105, rewardRep: 65, minRank: 1 },
  { id: 'cave-1', title: 'Goblin Warband', description: 'A goblin warband is massing in the hills. Break it before it raids the Glen.', objective: 'kill', targetKind: 'cave', targetCount: 6, rewardGold: 120, rewardXp: 130, rewardRep: 75, minRank: 1 },
  { id: 'armour-1', title: 'Restless Steel', description: 'Destroy the animated suits haunting the old roads.', objective: 'kill', targetKind: 'armour', targetCount: 3, rewardGold: 160, rewardXp: 170, rewardRep: 90, minRank: 2 },
  { id: 'orc-1', title: 'Orc Warband', description: 'Break the orcs pushing out from the crypt.', objective: 'kill', targetKind: 'orc', targetCount: 1, rewardGold: 350, rewardXp: 380, rewardRep: 220, minRank: 2 },
  { id: 'orc-2', title: 'Warlord Contract', description: 'A standing contract: end the threat of Grukk in the lower crypt.', objective: 'kill', targetKind: 'orc', targetCount: 1, rewardGold: 600, rewardXp: 700, rewardRep: 350, minRank: 4 },
  { id: 'south-1', title: 'Survey: Greenmeadow', description: 'Travel deep into the southern meadows and report what you find.', objective: 'explore', targetName: 'Greenmeadow', target: [0, 180], radius: 24, rewardGold: 90, rewardXp: 110, rewardRep: 75, minRank: 0 },
  { id: 'south-2', title: 'Survey: Far Fields', description: 'Reach the old fields beyond the first southern bend.', objective: 'explore', targetName: 'Far Fields', target: [-14, 285], radius: 28, rewardGold: 125, rewardXp: 145, rewardRep: 95, minRank: 1 },
  { id: 'east-1', title: 'Cross the East Bridge', description: 'Scout the road across the river and return safely.', objective: 'explore', targetName: 'East Bridge', target: [230, 22], radius: 26, rewardGold: 100, rewardXp: 125, rewardRep: 80, minRank: 0 },
  { id: 'east-2', title: 'Survey: Merchant Road', description: 'Follow the King\'s Road east far enough to confirm the route to Port Aurelle is safe.', objective: 'explore', targetName: 'Merchant Road', target: [700, 110], radius: 30, rewardGold: 180, rewardXp: 210, rewardRep: 130, minRank: 2 },
  { id: 'north-1', title: 'Scout the Northern Road', description: 'Reach the first rise toward the crypt and mark the safe route.', objective: 'explore', targetName: 'Northern Rise', target: [6, -150], radius: 28, rewardGold: 125, rewardXp: 155, rewardRep: 95, minRank: 1 },
  { id: 'north-2', title: 'Scout the Crypt Hills', description: 'Travel into the hills beneath the crypt and report the terrain.', objective: 'explore', targetName: 'Crypt Hills', target: [-8, -225], radius: 30, rewardGold: 210, rewardXp: 250, rewardRep: 150, minRank: 2 },
  { id: 'west-1', title: 'Into the Greenwood', description: 'Explore the western forest edge where the old logging road begins.', objective: 'explore', targetName: 'Greenwood Edge', target: [-155, 20], radius: 30, rewardGold: 120, rewardXp: 150, rewardRep: 90, minRank: 1 },
  { id: 'west-2', title: 'Deepwood Survey', description: 'Push farther into the western forest and map a new route.', objective: 'explore', targetName: 'Deepwood', target: [-230, 80], radius: 32, rewardGold: 260, rewardXp: 310, rewardRep: 180, minRank: 3 },
  { id: 'map-1', title: 'Cartographer: Ten Squares', description: 'Explore ten new map sectors anywhere in the overworld.', objective: 'survey', targetCount: 10, rewardGold: 140, rewardXp: 175, rewardRep: 100, minRank: 1 },
  { id: 'map-2', title: 'Cartographer: Twenty-Five Squares', description: 'Expand the guild map by discovering twenty-five sectors.', objective: 'survey', targetCount: 25, rewardGold: 300, rewardXp: 340, rewardRep: 190, minRank: 2 },
  { id: 'map-3', title: 'Cartographer: Fifty Squares', description: 'Map fifty new sectors across the frontier.', objective: 'survey', targetCount: 50, rewardGold: 650, rewardXp: 700, rewardRep: 400, minRank: 4 },
];

function rankForRep(rep: number): GuildRank {
  let out: GuildRank = 'D';
  for (const r of RANKS) if (rep >= r.rep) out = r.name;
  return out;
}

function rankIndex(rank: GuildRank) {
  return RANKS.findIndex((r) => r.name === rank);
}

function progressText(q: GuildQuest) {
  if (q.objective === 'explore') return q.targetName + ': ' + (q.progress ? 'reached' : 'not reached');
  if (q.objective === 'survey') return 'Mapped ' + q.progress + ' / ' + q.targetCount + ' sectors';
  if (q.objective === 'gather') return 'Gathered ' + q.progress + ' / ' + q.targetCount;
  return q.progress + ' / ' + q.targetCount;
}

function questTemplate(rank: GuildRank, used: Set<string>, start: number): QuestTemplate {
  const idx = rankIndex(rank);
  const eligible = TEMPLATES.filter((q) => q.minRank <= idx);
  let offset = start % Math.max(1, eligible.length);
  for (let i = 0; i < eligible.length; i++) {
    const q = eligible[(offset + i) % eligible.length];
    if (!used.has(q.id)) return q;
  }
  return eligible[offset] ?? TEMPLATES[0];
}

export class AdventurerGuild {
  readonly guildPos = new THREE.Vector3(22, 0, -12);
  readonly group = new THREE.Group();
  private ui: HTMLDivElement;
  private tab: 'board' | 'map' | 'roster' = 'board';
  private mapCanvas: HTMLCanvasElement;
  private mapCtx: CanvasRenderingContext2D;
  private rosterEl: HTMLDivElement;
  private boardEl: HTMLDivElement;
  private time = 0;
  private nextId = 1;
  private active: GuildQuest[] = [];
  private available: GuildQuest[] = [];
  private explored = new Set<string>();
  private _rep = 0;
  private _completed = 0;
  private rank: GuildRank = 'D';
  onToggle?: (open: boolean) => void;
  onSave?: () => void;
  openState = false;

  constructor(scene: THREE.Scene, private progression: Progression, private dialogue: DialogueUI) {
    // The capsule placeholder crowd is gone (docs/ART-DIRECTION.md §7); real villagers replace it.
    void scene;
    const root = document.getElementById('ui')!;
    this.ui = document.createElement('div');
    this.ui.className = 'guild-ui hidden';
    this.ui.innerHTML =
      '<div class="guild-head"><div><span class="eyebrow">FRONTIER ADVENTURERS</span><h1>ADVENTURER\'S GUILD</h1><p class="guild-rank"></p></div><button class="guild-close">CLOSE</button></div>' +
      '<div class="guild-tabs"><button data-tab="board">QUEST BOARD</button><button data-tab="map">FRONTIER MAP</button><button data-tab="roster">ADVENTURERS</button></div>' +
      '<div class="guild-body"><div class="guild-board"></div><canvas class="guild-map" width="860" height="520"></canvas><div class="guild-roster"></div></div>' +
      '<div class="guild-foot"><span>Complete contracts for gold, XP and Guild Reputation.</span><span>Press M to view the frontier map.</span></div>';
    root.appendChild(this.ui);
    this.boardEl = this.ui.querySelector('.guild-board')!;
    this.mapCanvas = this.ui.querySelector('.guild-map')!;
    this.mapCtx = this.mapCanvas.getContext('2d')!;
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
      } else if (e.code === 'KeyM') {
        e.stopImmediatePropagation();
        this.tab = 'map';
        this.render();
      }
    }, true);
    this.ensureBoard();
    events.on('enemyDied', ({ kind }) => {
      let changed = false;
      for (const q of this.active) {
        if (q.objective !== 'kill' || q.progress >= (q.targetCount ?? 1)) continue;
        if (q.targetKind === 'any' || q.targetKind === kind) {
          q.progress++;
          changed = true;
        }
      }
      if (changed) {
        this.onSave?.();
        this.render();
      }
    });
  }

  private ensureBoard() {
    const used = new Set(this.active.concat(this.available).map((q) => q.templateId));
    while (this.available.length < 6) {
      const t = questTemplate(this.rank, used, this.nextId);
      used.add(t.id);
      this.available.push(this.makeQuest(t));
    }
  }

  private makeQuest(t: QuestTemplate): GuildQuest {
    const q: GuildQuest = {
      id: 'guild-' + this.nextId++,
      templateId: t.id,
      title: t.title,
      description: t.description,
      objective: t.objective,
      targetKind: t.targetKind,
      targetItem: t.targetItem,
      targetCount: t.targetCount,
      targetName: t.targetName,
      target: t.target,
      radius: t.radius,
      progress: 0,
      rewardGold: t.rewardGold + Math.max(0, rankIndex(this.rank)) * 15,
      rewardXp: t.rewardXp + Math.max(0, rankIndex(this.rank)) * 18,
      rewardRep: t.rewardRep + Math.max(0, rankIndex(this.rank)) * 10,
      minRank: t.minRank,
    };
    return q;
  }

  private canOffer(q: GuildQuest) {
    return q.minRank <= rankIndex(this.rank);
  }

  accept(id: string) {
    const i = this.available.findIndex((q) => q.id === id);
    if (i < 0 || this.active.length >= 4) return;
    const q = this.available.splice(i, 1)[0];
    if (!this.canOffer(q)) return;
    this.active.push(q);
    this.ensureBoard();
    this.onSave?.();
    this.render();
  }

  abandon(id: string) {
    const i = this.active.findIndex((q) => q.id === id);
    if (i < 0) return;
    const [q] = this.active.splice(i, 1);
    this.available.push(q);
    this.onSave?.();
    this.render();
  }

  /** Gather contracts read (and on completion take) from the player's bag. */
  inventory?: { count(id: string): number; take(id: string, n: number): void };

  /** Reputation from outside the board (side quests for the town). */
  addRep(n: number) {
    this._rep += n;
    const old = this.rank;
    this.rank = rankForRep(this._rep);
    if (this.rank !== old) this.ensureBoard();
    this.render();
  }

  private complete(q: GuildQuest) {
    this.active = this.active.filter((x) => x.id !== q.id);
    if (q.objective === 'gather' && q.targetItem) this.inventory?.take(q.targetItem, q.targetCount ?? 1);
    this._completed++;
    this._rep += q.rewardRep;
    this.progression.addGold(q.rewardGold);
    this.progression.addXp(q.rewardXp);
    const oldRank = this.rank;
    this.rank = rankForRep(this._rep);
    if (rankIndex(this.rank) > rankIndex(oldRank)) {
      this.progression.addGold(75 * rankIndex(this.rank));
      this.dialogue.show('Guild Registrar', 'Adventurer\'s Guild', 'Your deeds have been recorded. You have been promoted to ' + this.rank + ' rank.', [
        { label: 'Accept promotion.', run: () => this.dialogue.close() },
      ]);
    }
    this.ensureBoard();
    this.onSave?.();
    events.emit('progressChanged', {});
    this.render();
  }

  private questProgress(q: GuildQuest, at: THREE.Vector3) {
    if (q.objective === 'explore' && q.target) {
      q.progress = q.progress || (Math.hypot(at.x - q.target[0], at.z - q.target[1]) <= (q.radius ?? 24) ? 1 : 0);
    } else if (q.objective === 'survey') {
      q.progress = Math.min(q.targetCount ?? 0, this.explored.size);
    } else if (q.objective === 'gather' && q.targetItem && this.inventory) {
      q.progress = Math.min(q.targetCount ?? 1, this.inventory.count(q.targetItem));
    }
  }

  update(dt: number, playerPos: THREE.Vector3) {
    this.time += dt;
    const cell = Math.floor((playerPos.x + 320) / 32) + ',' + Math.floor((playerPos.z + 320) / 32);
    if (Math.abs(playerPos.x) < 330 && Math.abs(playerPos.z) < 330) this.explored.add(cell);
    for (const q of this.active) this.questProgress(q, playerPos);
    const done = this.active.filter((q) => q.progress >= (q.targetCount ?? 1));
    for (const q of done) this.complete(q);
    if (this.group.visible) {
      this.group.children.forEach((g, i) => {
        g.rotation.y += dt * (i % 3 === 0 ? 0.04 : -0.018);
      });
    }
  }

  setVisible(v: boolean) { this.group.visible = v; if (!v && this.openState) this.close(); }

  interactable(): { pos: THREE.Vector3; radius: number; label: () => string; enabled: () => boolean; action: () => void } {
    return {
      pos: this.guildPos.clone().setY(this.guildPos.y),
      radius: 5.5,
      label: () => 'Enter the Adventurer\'s Guild',
      enabled: () => true,
      action: () => this.open('board'),
    };
  }

  open(tab: 'board' | 'map' | 'roster' = 'board') {
    this.tab = tab;
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
    const rankLine = this.ui.querySelector('.guild-rank')!;
    const next = RANKS.find((r) => r.rep > this._rep);
    rankLine.innerHTML = '<b style="color:' + RANK_COLORS[this.rank] + '">' + this.rank + ' Rank</b> · ' + this._rep + ' Guild Reputation' + (next ? ' · ' + (next.rep - this._rep) + ' to ' + next.name : ' · MAX RANK');
    this.ui.querySelectorAll<HTMLButtonElement>('.guild-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    this.boardEl.style.display = this.tab === 'board' ? 'grid' : 'none';
    this.mapCanvas.style.display = this.tab === 'map' ? 'block' : 'none';
    this.rosterEl.style.display = this.tab === 'roster' ? 'grid' : 'none';
    if (this.tab === 'board') this.renderBoard();
    if (this.tab === 'map') this.renderMap();
    if (this.tab === 'roster') this.renderRoster();
  }

  private renderBoard() {
    const active = this.active.map((q) =>
      '<article class="guild-quest active"><div class="quest-top"><span class="quest-rank">ACTIVE</span><h3>' + q.title + '</h3></div><p>' + q.description + '</p><b class="quest-progress">' + progressText(q) + '</b><div class="quest-reward">+' + q.rewardGold + ' gold · +' + q.rewardXp + ' XP · +' + q.rewardRep + ' rep</div><button data-abandon="' + q.id + '">ABANDON</button></article>',
    ).join('');
    const board = this.available.map((q) =>
      '<article class="guild-quest"><div class="quest-top"><span class="quest-rank">RANK ' + RANKS[q.minRank].name.toUpperCase() + '</span><h3>' + q.title + '</h3></div><p>' + q.description + '</p><b class="quest-progress">' + progressText(q) + '</b><div class="quest-reward">+' + q.rewardGold + ' gold · +' + q.rewardXp + ' XP · +' + q.rewardRep + ' rep</div><button data-accept="' + q.id + '" ' + (this.active.length >= 4 || !this.canOffer(q) ? 'disabled' : '') + '>ACCEPT CONTRACT</button></article>',
    ).join('');
    this.boardEl.innerHTML = '<section class="guild-section"><h2>ACTIVE CONTRACTS <span>' + this.active.length + ' / 4</span></h2>' + (active || '<p class="guild-empty">No active contracts. Take a job from the board.</p>') + '</section><section class="guild-section"><h2>AVAILABLE CONTRACTS</h2><div class="guild-grid">' + board + '</div></section>';
    this.boardEl.querySelectorAll<HTMLButtonElement>('[data-accept]').forEach((b) => b.addEventListener('click', () => this.accept(b.dataset.accept!)));
    this.boardEl.querySelectorAll<HTMLButtonElement>('[data-abandon]').forEach((b) => b.addEventListener('click', () => this.abandon(b.dataset.abandon!)));
  }

  private renderMap() {
    const ctx = this.mapCtx, w = this.mapCanvas.width, h = this.mapCanvas.height;
    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#eef8e9'); bg.addColorStop(1, '#d8eadf');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    const sx = (x: number) => (x + 330) / 660 * w;
    const sz = (z: number) => (z + 330) / 660 * h;
    ctx.strokeStyle = 'rgba(59,125,96,.7)';
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(sx(0), sz(330)); ctx.lineTo(sx(-14), sz(210)); ctx.lineTo(sx(-8), sz(90)); ctx.stroke();
    ctx.strokeStyle = 'rgba(75,150,205,.7)';
    ctx.lineWidth = 13;
    ctx.beginPath(); ctx.moveTo(sx(155), sz(330)); ctx.bezierCurveTo(sx(175), sz(150), sx(140), sz(-40), sx(180), sz(-330)); ctx.stroke();
    ctx.strokeStyle = 'rgba(145,110,70,.8)';
    ctx.lineWidth = 5;
    const roads: [number, number, number, number][] = [[0, 74, 0, -300], [74, 0, 330, 60], [-230, 80, 0, 0]];
    for (const r of roads) { ctx.beginPath(); ctx.moveTo(sx(r[0]), sz(r[1])); ctx.lineTo(sx(r[2]), sz(r[3])); ctx.stroke(); }
    for (const key of this.explored) {
      const [gx, gz] = key.split(',').map(Number);
      const x = gx * 32 - 320, z = gz * 32 - 320;
      ctx.fillStyle = 'rgba(255,255,255,.48)';
      ctx.fillRect(sx(x), sz(z), w * 32 / 660 + 1, h * 32 / 660 + 1);
    }
    ctx.fillStyle = '#b88a29'; ctx.beginPath(); ctx.arc(sx(0), sz(0), 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#704a2c'; ctx.font = '700 16px Inter, sans-serif';
    ctx.fillText('STARTING TOWN', sx(0) + 14, sz(0) - 12);
    for (const q of this.active) if (q.target && q.progress === 0) {
      ctx.fillStyle = '#cf8f2d'; ctx.beginPath(); ctx.arc(sx(q.target[0]), sz(q.target[1]), 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5d4931'; ctx.font = '600 12px Inter, sans-serif'; ctx.fillText(q.targetName || 'Contract', sx(q.target[0]) + 10, sz(q.target[1]) + 4);
    }
    ctx.fillStyle = '#35566a'; ctx.font = '600 12px Inter, sans-serif';
    ctx.fillText('CRYPT', sx(0) + 10, sz(-318));
    ctx.fillText('EAST BRIDGE', sx(230) + 10, sz(22));
    ctx.fillText('GREENMEADOW', sx(0) + 10, sz(180));
    ctx.fillStyle = '#587068'; ctx.font = '500 11px Inter, sans-serif';
    ctx.fillText('Discovered sectors: ' + this.explored.size, 18, h - 18);
  }

  private renderRoster() {
    const names = ['Ari Ashvale','Bren Brightwood','Celia Crowe','Dax Dawnrunner','Elin Emberhand','Farris Fell','Galen Greymark','Hana Hawk','Iris Ironwood','Jory Kestrel','Kellan Lark','Lysa Morrow','Mira Ashvale','Nolan Brightwood','Orin Crowe','Pella Dawnrunner','Quinn Emberhand','Rhea Fell','Soren Greymark','Talia Hawk','Ulric Ironwood','Vera Kestrel','Wren Lark','Yara Morrow','Zane Ashvale','Alden Brightwood','Bria Crowe','Corin Dawnrunner','Della Emberhand','Eamon Fell','Freya Greymark','Garrick Hawk','Helia Ironwood','Ivan Kestrel','Jessa Lark','Kael Morrow','Lina Ashvale','Marek Brightwood','Nessa Crowe','Oren Dawnrunner','Petra Emberhand','Rowan Fell','Syl Greymark','Theo Hawk','Uma Ironwood','Viktor Kestrel','Willa Lark','Yves Morrow'];
    const jobs = ['Swordfighter','Shieldbearer','Ranger','Mage','Healer','Rogue','Hunter','Explorer'];
    this.rosterEl.innerHTML = '<div class="guild-roster-intro"><h2>48 REGISTERED ADVENTURERS</h2><p>The guild is a living organisation. Veterans take dangerous commissions, rookies chase local work, and new parties form here every morning.</p></div><div class="roster-grid">' +
      names.map((n, i) => '<article class="adventurer-card"><span class="adv-rank" style="color:' + RANK_COLORS[RANKS[i % RANKS.length].name] + '">' + RANKS[i % RANKS.length].name.toUpperCase() + '</span><h3>' + n + '</h3><p>' + jobs[i % jobs.length] + '</p><small>' + (8 + (i % 19)) + ' completed quests</small></article>').join('') +
      '</div>';
  }

  toJSON(): GuildSaveData {
    return { rank: this.rank, rep: this._rep, completed: this._completed, nextQuestId: this.nextId, active: this.active, available: this.available, explored: Array.from(this.explored) };
  }

  fromJSON(data: GuildSaveData | undefined) {
    if (!data) return;
    this.rank = data.rank && RANKS.some((r) => r.name === data.rank) ? data.rank : rankForRep(data.rep ?? 0);
    this._rep = data.rep ?? 0;
    this._completed = data.completed ?? 0;
    this.nextId = data.nextQuestId ?? 1;
    this.active = Array.isArray(data.active) ? data.active : [];
    this.available = Array.isArray(data.available) ? data.available : [];
    this.explored = new Set(data.explored ?? []);
    this.ensureBoard();
    this.render();
  }

  get guildRank() { return this.rank; }
  get reputation() { return this._rep; }
  get completedCount() { return this._completed; }
}
