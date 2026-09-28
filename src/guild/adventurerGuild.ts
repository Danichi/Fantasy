import * as THREE from 'three';
import { events } from '../core/events';
import type { Progression } from '../progression/progression';
import type { DialogueUI } from '../ui/dialogue';
import { heightAt } from '../world/terrain';

export type GuildRank = 'Novice' | 'Copper' | 'Iron' | 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Mythic';

export interface GuildQuest {
  id: string;
  templateId: string;
  title: string;
  description: string;
  objective: 'kill' | 'explore' | 'survey';
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
  { name: 'Novice', rep: 0 },
  { name: 'Copper', rep: 150 },
  { name: 'Iron', rep: 400 },
  { name: 'Bronze', rep: 800 },
  { name: 'Silver', rep: 1500 },
  { name: 'Gold', rep: 3000 },
  { name: 'Platinum', rep: 6000 },
  { name: 'Mythic', rep: 12000 },
];

const RANK_COLORS: Record<GuildRank, string> = {
  Novice: '#6f7e87',
  Copper: '#9b6a4c',
  Iron: '#6c7880',
  Bronze: '#a97842',
  Silver: '#6a8ca2',
  Gold: '#b78722',
  Platinum: '#557db0',
  Mythic: '#8749bb',
};

interface QuestTemplate {
  id: string;
  title: string;
  description: string;
  objective: GuildQuest['objective'];
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
  { id: 'green-1', title: 'Clean the South Road', description: 'Thin the green slimes harassing caravans south of town.', objective: 'kill', targetKind: 'green', targetCount: 5, rewardGold: 45, rewardXp: 45, rewardRep: 35, minRank: 0 },
  { id: 'green-2', title: 'Slime Patrol', description: 'Drive off another wave of slimes before merchants close the gate.', objective: 'kill', targetKind: 'green', targetCount: 8, rewardGold: 70, rewardXp: 65, rewardRep: 45, minRank: 0 },
  { id: 'blue-1', title: 'Blue Menace', description: 'Deal with the tougher blue slimes seen near the meadows.', objective: 'kill', targetKind: 'blue', targetCount: 4, rewardGold: 85, rewardXp: 90, rewardRep: 55, minRank: 1 },
  { id: 'mixed-1', title: 'Roadside Sweep', description: 'Remove any hostile creatures blocking the town approaches.', objective: 'kill', targetKind: 'any', targetCount: 10, rewardGold: 100, rewardXp: 105, rewardRep: 65, minRank: 1 },
  { id: 'cave-1', title: 'Cave Vermin', description: 'Cull cave slimes before they spread toward the hills.', objective: 'kill', targetKind: 'cave', targetCount: 5, rewardGold: 110, rewardXp: 120, rewardRep: 70, minRank: 1 },
  { id: 'armour-1', title: 'Restless Steel', description: 'Destroy the animated suits haunting the old roads.', objective: 'kill', targetKind: 'armour', targetCount: 3, rewardGold: 160, rewardXp: 170, rewardRep: 90, minRank: 2 },
  { id: 'orc-1', title: 'Orc Warband', description: 'Break the orcs pushing out from the crypt.', objective: 'kill', targetKind: 'orc', targetCount: 1, rewardGold: 350, rewardXp: 380, rewardRep: 220, minRank: 2 },
  { id: 'orc-2', title: 'Warlord Contract', description: 'A standing contract: end the threat of Grukk in the lower crypt.', objective: 'kill', targetKind: 'orc', targetCount: 1, rewardGold: 600, rewardXp: 700, rewardRep: 350, minRank: 4 },
  { id: 'south-1', title: 'Survey: Greenmeadow', description: 'Travel deep into the southern meadows and report what you find.', objective: 'explore', targetName: 'Greenmeadow', target: [0, 180], radius: 24, rewardGold: 90, rewardXp: 110, rewardRep: 75, minRank: 0 },
  { id: 'south-2', title: 'Survey: Far Fields', description: 'Reach the old fields beyond the first southern bend.', objective: 'explore', targetName: 'Far Fields', target: [-14, 285], radius: 28, rewardGold: 125, rewardXp: 145, rewardRep: 95, minRank: 1 },
  { id: 'east-1', title: 'Cross the East Bridge', description: 'Scout the road across the river and return safely.', objective: 'explore', targetName: 'East Bridge', target: [230, 22], radius: 26, rewardGold: 100, rewardXp: 125, rewardRep: 80, minRank: 0 },
  { id: 'east-2', title: 'Survey: Merchant Road', description: 'Follow the eastern road far enough to confirm the route is safe.', objective: 'explore', targetName: 'Merchant Road', target: [335, 60], radius: 30, rewardGold: 180, rewardXp: 210, rewardRep: 130, minRank: 2 },
  { id: 'north-1', title: 'Scout the Northern Road', description: 'Reach the first rise toward the crypt and mark the safe route.', objective: 'explore', targetName: 'Northern Rise', target: [6, -150], radius: 28, rewardGold: 125, rewardXp: 155, rewardRep: 95, minRank: 1 },
  { id: 'north-2', title: 'Scout the Crypt Hills', description: 'Travel into the hills beneath the crypt and report the terrain.', objective: 'explore', targetName: 'Crypt Hills', target: [-8, -225], radius: 30, rewardGold: 210, rewardXp: 250, rewardRep: 150, minRank: 2 },
  { id: 'west-1', title: 'Into the Greenwood', description: 'Explore the western forest edge where the old logging road begins.', objective: 'explore', targetName: 'Greenwood Edge', target: [-155, 20], radius: 30, rewardGold: 120, rewardXp: 150, rewardRep: 90, minRank: 1 },
  { id: 'west-2', title: 'Deepwood Survey', description: 'Push farther into the western forest and map a new route.', objective: 'explore', targetName: 'Deepwood', target: [-230, 80], radius: 32, rewardGold: 260, rewardXp: 310, rewardRep: 180, minRank: 3 },
  { id: 'map-1', title: 'Cartographer: Ten Squares', description: 'Explore ten new map sectors anywhere in the overworld.', objective: 'survey', targetCount: 10, rewardGold: 140, rewardXp: 175, rewardRep: 100, minRank: 1 },
  { id: 'map-2', title: 'Cartographer: Twenty-Five Squares', description: 'Expand the guild map by discovering twenty-five sectors.', objective: 'survey', targetCount: 25, rewardGold: 300, rewardXp: 340, rewardRep: 190, minRank: 2 },
  { id: 'map-3', title: 'Cartographer: Fifty Squares', description: 'Map fifty new sectors across the frontier.', objective: 'survey', targetCount: 50, rewardGold: 650, rewardXp: 700, rewardRep: 400, minRank: 4 },
];

function rankForRep(rep: number): GuildRank {
  let out: GuildRank = 'Novice';
  for (const r of RANKS) if (rep >= r.rep) out = r.name;
  return out;
}

function rankIndex(rank: GuildRank) {
  return RANKS.findIndex((r) => r.name === rank);
}

function progressText(q: GuildQuest) {
  if (q.objective === 'explore') return q.targetName + ': ' + (q.progress ? 'reached' : 'not reached');
  if (q.objective === 'survey') return 'Mapped ' + q.progress + ' / ' + q.targetCount + ' sectors';
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
  private rank: GuildRank = 'Novice';
  onToggle?: (open: boolean) => void;
  onSave?: () => void;
  openState = false;

  constructor(private scene: THREE.Scene, private progression: Progression, private dialogue: DialogueUI) {
    this.buildHallCrowd();
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
  }

  private buildHallCrowd() {
    const matBody = new THREE.MeshStandardMaterial({ color: 0x40566b, roughness: 0.88 });
    const matCloth: THREE.Material[] = [
      new THREE.MeshStandardMaterial({ color: 0x7d352e, roughness: 0.92 }),
      new THREE.MeshStandardMaterial({ color: 0x3c6d55, roughness: 0.92 }),
      new THREE.MeshStandardMaterial({ color: 0x5c4a83, roughness: 0.92 }),
      new THREE.MeshStandardMaterial({ color: 0x956a2b, roughness: 0.92 }),
      new THREE.MeshStandardMaterial({ color: 0x365f87, roughness: 0.92 }),
    ];
    const skin = new THREE.MeshStandardMaterial({ color: 0xd7a786, roughness: 0.95 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x98a4ab, metalness: 0.6, roughness: 0.42 });
    const weapon = new THREE.MeshStandardMaterial({ color: 0xb9c5c8, metalness: 0.85, roughness: 0.28 });
    const names = ['Ari', 'Bren', 'Celia', 'Dax', 'Elin', 'Farris', 'Galen', 'Hana', 'Iris', 'Jory', 'Kellan', 'Lysa', 'Mira', 'Nolan', 'Orin', 'Pella', 'Quinn', 'Rhea', 'Soren', 'Talia', 'Ulric', 'Vera', 'Wren', 'Yara', 'Zane', 'Alden', 'Bria', 'Corin', 'Della', 'Eamon', 'Freya', 'Garrick', 'Helia', 'Ivan', 'Jessa', 'Kael', 'Lina', 'Marek', 'Nessa', 'Oren', 'Petra', 'Rowan', 'Syl', 'Theo', 'Uma', 'Viktor', 'Willa', 'Yves'];
    const surnames = ['Ashvale', 'Brightwood', 'Crowe', 'Dawnrunner', 'Emberhand', 'Fell', 'Greymark', 'Hawk', 'Ironwood', 'Kestrel', 'Lark', 'Morrow'];
    const center = this.guildPos.clone();
    for (let i = 0; i < names.length; i++) {
      const a = (i / names.length) * Math.PI * 2 + 0.18;
      const radius = 8 + (i % 4) * 1.6;
      const x = center.x + Math.sin(a) * radius;
      const z = center.z + Math.cos(a) * radius * 0.7;
      const g = new THREE.Group();
      g.position.set(x, heightAt(x, z), z);
      g.rotation.y = a + Math.PI;
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.72, 5, 8), i % 6 === 0 ? matBody : matCloth[i % matCloth.length]);
      body.position.y = 0.8;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
      head.position.y = 1.48;
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), i % 3 === 0 ? metal : matBody);
      hair.position.y = 1.56;
      g.add(body, head, hair);
      if (i % 3 !== 0) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.85, 0.035), weapon);
        blade.position.set(0.48, 0.72, 0.05);
        blade.rotation.z = i % 2 ? 0.12 : -0.12;
        g.add(blade);
      } else {
        const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.5, 7), woodMaterial(i));
        staff.position.set(-0.45, 0.75, 0);
        g.add(staff);
      }
      if (i % 5 === 0) {
        const shield = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16), metal);
        shield.position.set(-0.38, 0.85, 0.04);
        shield.rotation.y = Math.PI / 2;
        g.add(shield);
      }
      g.traverse((o) => { (o as THREE.Mesh).castShadow = true; (o as THREE.Mesh).receiveShadow = true; });
      this.group.add(g);
    }
    this.group.visible = false;
    this.scene.add(this.group);
    function woodMaterial(i: number) {
      return new THREE.MeshStandardMaterial({ color: [0x4f3829, 0x6e5135, 0x3d4b2d][i % 3], roughness: 0.95 });
    }
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
    this.progression.combat.learnClass('dungeoneer');
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

  private complete(q: GuildQuest) {
    this.active = this.active.filter((x) => x.id !== q.id);
    this._completed++;
    this._rep += q.rewardRep;
    this.progression.addGold(q.rewardGold);
    this.progression.addXp(q.rewardXp);
    const oldRank = this.rank;
    this.rank = rankForRep(this._rep);
    if (rankIndex(this.rank) > rankIndex(oldRank)) {
      this.progression.combat.learnClass('dungeoneer');
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
    this.rank = data.rank ?? rankForRep(data.rep ?? 0);
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
