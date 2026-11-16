import * as THREE from 'three';
import { Bandit, Bolts, type BanditRole } from '../enemies/bandit';
import { moveName, UAL_MOVES } from '../combat/ai';
import { peekCombat } from '../combat/core';
import { PHASE_LABEL } from '../combat/phases';
import { events } from '../core/events';
import { ITEMS } from '../items/itemDefs';
import type { Player } from '../player/player';
import type { SkillRuntime } from '../paths/skills';
import type { Interior } from '../world/interior';
import type { ThirdPersonCamera } from '../player/camera';
import type { Input } from '../core/input';
import { SandboxTarget, type DummyKind } from './target';
import { ArenaProps } from './props';
import { MOVE_LIST, MOVE_IDS } from './moveList';
import { sandboxBuild, buildMoves, COMBAT_STYLES, MAGIC_SCHOOLS, refill } from './hero';
import { readSandboxSettings, saveSandboxSettings, type Scenario } from './settings';

// The Sandbox: the Proving Grounds (docs/design/combat-flow.md). A walled sand
// ring with high ground, a slope, a slam wall, barrels, a fence, braziers and a
// pool; training dummies with bodies (launch them, slam them); living
// opponents, a crowd and a five-wave gauntlet. Beside the fight: a combo
// meter, a feed of every named move you do, and the move list, which ticks
// each fluid move the first time you pull it off.

const SCENARIO_INFO: { id: Scenario; name: string; text: string }[] = [
  { id: 'dummy', name: 'Straw dummy', text: 'Light enough to launch, juggle and throw.' },
  { id: 'moving', name: 'Moving target', text: 'Slides side to side: lunges and dash strikes.' },
  { id: 'shield', name: 'Shield bearer', text: 'Guards in front. Vault it, drive it, break it.' },
  { id: 'iron', name: 'Iron dummy', text: 'Too heavy to throw: posture and the hook zip.' },
  { id: 'world', name: 'World as a weapon', text: 'Dummies by the wall, fence, fire, pool, barrels and ledge.' },
  { id: 'melee', name: 'Sparring partner', text: 'Attacks you: counters, ripostes, feints.' },
  { id: 'ranged', name: 'Crossbow', text: 'Keeps its distance and shoots.' },
  { id: 'group', name: 'Three opponents', text: 'Take turns at you.' },
  { id: 'crowd', name: 'The crowd', text: 'Five around you: dash between them, watch your back.' },
  { id: 'gauntlet', name: 'Gauntlet', text: 'Five waves, against the clock.' },
];

const WAVES: BanditRole[][] = [['sword'], ['sword', 'sword'], ['sword', 'crossbow', 'sword'], ['sword', 'sword', 'sword', 'crossbow'], ['sword', 'sword', 'sword', 'sword', 'crossbow', 'crossbow']];

const CSS = `
body.in-sandbox :is(.quest-tracker,.wmini,.compass,.waypoint,.region-card,.book-button){display:none!important}
.sbx{--ink:#ece4d2;--dim:#b6ab95;--gold:#e3b868;--line:#5d5242;--bg:#16120ee8;--ok:#9fd38a;font:12px Inter,system-ui,sans-serif;color:var(--ink)}
.sbx button{pointer-events:auto;padding:6px 11px;color:#f6e9c8;background:#3a2d1f;border:1px solid #7d6543;border-radius:4px;cursor:pointer;font:inherit}.sbx button:hover{background:#4d3b27}
.sandbox-badge{position:fixed;left:16px;top:16px;z-index:35;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px 13px;width:290px;box-shadow:0 6px 24px #0008}
.sandbox-badge h4{margin:0;font:600 11px Inter,sans-serif;letter-spacing:.16em;color:var(--gold)}.sandbox-badge .keys{color:var(--dim);margin:4px 0 8px;line-height:1.5}
.sandbox-badge .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:6px 0}.sandbox-badge .stats div{background:#0006;border-radius:4px;padding:5px 6px}.sandbox-badge .stats b{display:block;font-size:15px;color:#fff}.sandbox-badge .stats span{color:var(--dim);font-size:10px}
.sandbox-badge output{display:block;white-space:pre-line;color:#c8dcb8;line-height:1.55}
.sbx-combo{position:fixed;right:300px;top:38%;z-index:34;text-align:right;pointer-events:none;transition:opacity .25s}.sbx-combo b{display:block;font:800 54px/1 Georgia,serif;color:#fff;text-shadow:0 3px 0 #0009,0 0 18px #e3b86888}.sbx-combo span{font:700 12px Inter,sans-serif;letter-spacing:.3em;color:var(--gold)}.sbx-combo em{display:block;font:italic 600 15px Georgia,serif;color:#ffd890}
.sbx-feed{position:fixed;right:300px;top:calc(38% + 96px);z-index:34;display:flex;flex-direction:column;align-items:flex-end;gap:4px;pointer-events:none}.sbx-feed div{background:#120e0acc;border-left:3px solid var(--gold);padding:4px 10px;border-radius:3px;font-weight:600;transition:opacity .4s,transform .2s}.sbx-feed div.new{border-color:#9fe07a;color:#dfffd0}.sbx-feed div small{color:var(--ok);margin-left:6px;font-weight:700;letter-spacing:.1em}
.sbx-moves{position:fixed;right:16px;top:124px;bottom:96px;width:268px;z-index:35;background:var(--bg);border:1px solid var(--line);border-radius:8px;display:flex;flex-direction:column;box-shadow:0 6px 24px #0008}.sbx-moves.closed{bottom:auto}.sbx-moves.closed ol{display:none}
.sbx-moves header{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border-bottom:1px solid var(--line)}.sbx-moves header b{color:var(--gold);letter-spacing:.12em;font-size:11px}.sbx-moves header button{padding:2px 8px}
.sbx-moves .bar{height:3px;background:#0008}.sbx-moves .bar i{display:block;height:100%;background:linear-gradient(90deg,#c9953e,#ffe0a0);transition:width .4s}
.sbx-moves ol{list-style:none;margin:0;padding:6px 10px 10px;overflow:auto}.sbx-moves li.g{color:var(--gold);font-size:10px;letter-spacing:.16em;margin:9px 0 3px}.sbx-moves li.m{display:grid;grid-template-columns:16px 1fr;gap:2px 6px;padding:3px 0}.sbx-moves li.m::before{content:'○';color:#7d6f5a}.sbx-moves li.m.done::before{content:'✓';color:var(--ok);font-weight:700}.sbx-moves li.m b{font-weight:600}.sbx-moves li.m.done b{color:var(--ok)}.sbx-moves li.m small{grid-column:2;color:var(--dim);line-height:1.35}
.sbx-moves li.m.flash{animation:sbxflash 1.2s}@keyframes sbxflash{0%{background:#9fe07a55}100%{background:transparent}}
.sandbox-panel{position:fixed;inset:0;background:#07060599;backdrop-filter:blur(3px);z-index:110;display:grid;place-items:center;pointer-events:auto}.sandbox-panel[hidden]{display:none}
.sandbox-panel article{width:min(980px,calc(100vw - 32px));height:min(720px,calc(100vh - 32px));display:grid;grid-template-columns:170px 1fr;background:#17130f;border:1px solid #6d5a40;border-radius:10px;overflow:hidden;box-shadow:0 20px 60px #000a}
.sandbox-panel nav{background:#100d0a;border-right:1px solid #3d3326;padding:18px 12px;display:flex;flex-direction:column;gap:6px}.sandbox-panel nav h2{margin:0 0 10px;font:600 17px Georgia,serif;color:var(--gold)}.sandbox-panel nav a{color:var(--dim);text-decoration:none;padding:6px 8px;border-radius:4px}.sandbox-panel nav a:hover{background:#2a2219;color:var(--ink)}.sandbox-panel nav .grow{flex:1}
.sandbox-panel .body{overflow:auto;padding:18px 22px 26px;position:relative}.sandbox-panel .sandbox-close{position:sticky;top:0;float:right;z-index:2}
.sandbox-panel section{margin-bottom:22px}.sandbox-panel h3{font:600 15px Georgia,serif;color:var(--gold);margin:0 0 8px;padding-bottom:6px;border-bottom:1px solid #3d3326}.sandbox-panel p{color:var(--dim);line-height:1.5;margin:6px 0 10px}
.sandbox-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}.sandbox-panel label{display:flex;gap:6px;flex-direction:column;color:var(--dim)}.sandbox-panel label:has(input[type=checkbox]){flex-direction:row;align-items:center;color:var(--ink)}.sandbox-panel input[type=checkbox]{flex:none;margin:0}
.sandbox-panel select,.sandbox-panel input[type=number],.sandbox-panel input[type=search]{width:100%;box-sizing:border-box;padding:7px;background:#0d0b09;color:var(--ink);border:1px solid #5d5242;border-radius:4px;font:inherit}
.sbx-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;margin-bottom:12px}.sbx-cards button{text-align:left;padding:10px;background:#211a13;border-color:#4b3e2d;display:flex;flex-direction:column;gap:4px}.sbx-cards button b{color:var(--ink)}.sbx-cards button span{color:var(--dim);font-size:11px;line-height:1.35}.sbx-cards button.on{border-color:var(--gold);background:#3a2c1a;box-shadow:inset 0 0 0 1px var(--gold)}
.sandbox-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.sandbox-note{min-height:18px;color:var(--ok)}
.sbx-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:6px}.sbx-list div{background:#0d0b09;border:1px solid #3d3326;border-radius:4px;padding:7px 9px}.sbx-list div.done{border-color:#4e7a3e}.sbx-list b{display:block}.sbx-list div.done b::after{content:' ✓';color:var(--ok)}.sbx-list small{color:var(--dim);line-height:1.35}.sbx-list em{color:var(--gold);font-style:normal;font-size:10px;letter-spacing:.1em;display:block;margin-top:3px}
`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
type Actor = Bandit | SandboxTarget;

export class SandboxArena {
  readonly settings = readSandboxSettings();
  readonly panel: HTMLDivElement;
  readonly actors: Actor[] = [];
  readonly bolts: Bolts;
  readonly props: ArenaProps;
  private badge: HTMLDivElement;
  private comboEl: HTMLDivElement;
  private feedEl: HTMLDivElement;
  private movesEl: HTMLDivElement;
  private deadTime = 0;
  private respawnTime = 0;
  private clock = 0;
  private badgeText = '';
  metrics = { damage: 0, hits: 0, peak: 0, parries: 0, dodges: 0, combo: 0, bestCombo: 0 };
  private firstHit = -1;
  private lastHit = -9;
  private feed: { el: HTMLDivElement; t: number }[] = [];
  /** the gauntlet: wave index and its clock */
  gauntlet = { wave: 0, t: 0, done: false };
  constructor(
    private scene: THREE.Scene,
    readonly player: Player,
    private rt: SkillRuntime,
    private it: Interior,
    private cam: ThirdPersonCamera,
    private input: Input,
    private hooks: { save(): void; toggle(open: boolean): void; debug(): void; clearEffects(): void; leave(): void; banner?(text: string): void },
  ) {
    it.interactables.length = 0;
    this.bolts = new Bolts(scene);
    this.props = new ArenaProps(scene, it);
    document.body.classList.add('in-sandbox');
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    const el = (cls: string, html = '') => {
      const d = document.createElement('div');
      d.className = 'sbx ' + cls;
      d.innerHTML = html;
      document.body.append(d);
      return d;
    };
    this.badge = el(
      'sandbox-badge',
      '<h4>THE PROVING GROUNDS</h4><div class="keys">F6 controls · F7 reset · F8 speed · F9 hitboxes<br>I equipment · K skills · 4 grappling hook</div><div class="stats"></div><output></output><button type="button">Sandbox controls</button>',
    );
    this.badge.querySelector('button')!.onclick = () => this.openControls();
    this.comboEl = el('sbx-combo');
    this.comboEl.style.opacity = '0';
    this.feedEl = el('sbx-feed');
    this.movesEl = el('sbx-moves');
    this.renderMoveList();
    this.panel = document.createElement('div');
    this.panel.className = 'sbx sandbox-panel';
    this.panel.hidden = true;
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Sandbox controls');
    this.panel.setAttribute('aria-modal', 'true');
    document.body.append(this.panel);
    events.on('strike', (e) => {
      if (!this.actors.includes(e.target as Actor)) return;
      if (this.firstHit < 0) this.firstHit = this.clock;
      this.metrics.damage += e.damage;
      this.metrics.hits++;
      this.metrics.peak = Math.max(this.metrics.peak, e.damage);
      // The combo: blows that land within two seconds of each other.
      this.metrics.combo = this.clock - this.lastHit < 2.2 ? this.metrics.combo + 1 : 1;
      this.lastHit = this.clock;
      this.metrics.bestCombo = Math.max(this.metrics.bestCombo, this.metrics.combo);
      if (this.metrics.combo > this.settings.best.combo) this.settings.best.combo = this.metrics.combo;
      this.showCombo();
    });
    events.on('playerDamaged', ({ blocked }) => {
      if (!blocked) this.dropCombo();
    });
    events.on('parrySuccess', (e) => {
      if (e.perfect) this.metrics.parries++;
    });
    events.on('perfectDodge', () => this.metrics.dodges++);
    events.on('combatMove', ({ id, name }) => this.logMove(id, name));
    events.on('worldImpact', ({ kind }) => {
      const m = MOVE_LIST.find((x) => x.id === 'impact:' + kind);
      if (m) this.logMove(m.id, m.name);
    });
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.repeat) return;
        if (e.code === 'F6') {
          e.preventDefault();
          this.openControls(this.panel.hidden !== false);
        }
        if (e.code === 'F8') {
          e.preventDefault();
          this.settings.speed = this.settings.speed === 1 ? 0.5 : this.settings.speed === 0.5 ? 0.25 : 1;
          this.persist();
          if (!this.panel.hidden) this.renderPanel();
        }
        if (e.code === 'F7') {
          e.preventDefault();
          this.resetFight();
        }
        if (e.code === 'Escape' && !this.panel.hidden) {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.openControls(false);
        }
      },
      true,
    );
    this.spawn(this.settings.scenario);
    this.renderPanel();
  }

  // ---- the move feed, the combo and the move list ----------------------------------------------
  private logMove(id: string, name: string) {
    const fresh = MOVE_IDS.has(id) && !this.settings.learned.includes(id);
    if (fresh) {
      this.settings.learned.push(id);
      this.renderMoveList(id);
      this.persist();
    }
    // Plain cuts and rolls don't need announcing; anything with a name does.
    if (!MOVE_IDS.has(id) && /^(Cut|Roll|Step|Off-hand Cut|Parry)$/.test(name)) return;
    const d = document.createElement('div');
    d.innerHTML = esc(name) + (fresh ? '<small>NEW</small>' : '');
    if (fresh) d.className = 'new';
    this.feedEl.prepend(d);
    this.feed.unshift({ el: d, t: fresh ? 4.5 : 2.6 });
    while (this.feed.length > 6) this.feed.pop()!.el.remove();
  }
  private showCombo() {
    const n = this.metrics.combo;
    if (n < 2) return;
    const word = n >= 30 ? 'Unbroken' : n >= 20 ? 'Fluid' : n >= 12 ? 'Flowing' : n >= 6 ? 'Good' : '';
    this.comboEl.innerHTML = `<b>${n}</b><span>HITS</span>${word ? `<em>${word}</em>` : ''}`;
    this.comboEl.style.opacity = '1';
  }
  private dropCombo() {
    this.metrics.combo = 0;
    this.lastHit = -9;
    this.comboEl.style.opacity = '0';
  }
  private renderMoveList(flash?: string) {
    const learned = new Set(this.settings.learned);
    const done = MOVE_LIST.filter((m) => learned.has(m.id)).length;
    let group = '';
    const rows = MOVE_LIST.map((m) => {
      const head = m.group !== group ? `<li class="g">${(group = m.group).toUpperCase()}</li>` : '';
      return `${head}<li class="m${learned.has(m.id) ? ' done' : ''}${m.id === flash ? ' flash' : ''}"><b>${esc(m.name)}</b><small>${esc(m.how)}</small></li>`;
    }).join('');
    this.movesEl.classList.toggle('closed', !this.settings.showMoves);
    this.movesEl.innerHTML = `<header><b>MOVE LIST · ${done}/${MOVE_LIST.length}</b><button type="button">${this.settings.showMoves ? 'Hide' : 'Show'}</button></header><div class="bar"><i style="width:${(done / MOVE_LIST.length) * 100}%"></i></div><ol>${rows}</ol>`;
    this.movesEl.querySelector('button')!.onclick = () => {
      this.settings.showMoves = !this.settings.showMoves;
      this.renderMoveList();
      this.persist();
    };
  }

  openControls(open = true) {
    this.panel.hidden = !open;
    this.input.releaseAll();
    if (open) {
      this.renderPanel();
      this.panel.querySelector<HTMLButtonElement>('.sandbox-close')?.focus();
    }
    this.hooks.toggle(open);
  }
  private persist() {
    saveSandboxSettings(this.settings);
    this.hooks.save();
  }
  changeBuild(combat: string, magic: string) {
    sandboxBuild(this.player, combat, magic);
    this.settings.combat = this.player.paths.active;
    this.settings.magic = magic;
    this.rt.reset();
    this.resetFight();
    this.persist();
  }
  clearTargets() {
    for (const a of this.actors) a.dispose();
    this.actors.length = 0;
    this.bolts.clear();
    this.hooks.clearEffects();
    this.player.lock = null;
    this.respawnTime = 0;
  }

  // ---- encounters ------------------------------------------------------------------------------
  private dummy(kind: DummyKind, x: number, z: number, y = 0) {
    const at = this.it.at(x, z, y);
    const t = new SandboxTarget(this.scene, at, this.settings.targetHp, () => true, kind, this.it.spawn);
    this.actors.push(t);
    return t;
  }
  private bandit(role: BanditRole, at: THREE.Vector3, name: string) {
    const b = new Bandit(role, at, this.scene, this.bolts);
    b.name = b.label = name;
    b.kind = 'sandboxOpponent';
    b.level = 50;
    b.maxHp = b.hp = this.settings.targetHp;
    b.hitDamage = this.settings.enemyDamage;
    b.postureMax = 240;
    b.poiseMax = 80;
    b.alerted = true;
    b.nonLethal = false;
    if (role !== 'crossbow') {
      const ids = this.settings.drill === 'sequence' ? ['cut', 'delayed', 'lunge'] : [this.settings.drill];
      b.brain.setMoves(this.settings.drill === 'free' ? UAL_MOVES : ids.flatMap((id) => UAL_MOVES.filter((m) => m.id === id)));
      b.brain.practiceSequence = this.settings.drill !== 'free';
    }
    this.actors.push(b);
    return b;
  }
  /** Lighter opponents for crowds and waves: more of them, each less deadly and quicker to drop. */
  private crowdBandit(role: BanditRole, at: THREE.Vector3, name: string) {
    const b = this.bandit(role, at, name);
    b.maxHp = b.hp = Math.max(120, Math.round(this.settings.targetHp * 0.06));
    b.hitDamage = Math.max(1, Math.round(this.settings.enemyDamage * 0.5));
    b.postureMax = 90;
    b.poiseMax = 30;
    b.brain.setMoves(UAL_MOVES);
    b.brain.practiceSequence = false;
    return b;
  }
  spawn(scenario: Scenario = this.settings.scenario) {
    this.clearTargets();
    this.settings.scenario = scenario;
    const s = scenario;
    if (s === 'dummy') this.dummy('straw', 0, -2);
    else if (s === 'moving') this.dummy('moving', 0, -2);
    else if (s === 'shield') this.dummy('shield', 0, -2);
    else if (s === 'iron') this.dummy('iron', 0, -2);
    else if (s === 'world') {
      // One by each thing in the arena that hits back.
      this.dummy('straw', 15.6, -6); // the slam wall (hit it east)
      this.dummy('straw', 2, -13.6); // the fence (hit it north)
      this.dummy('straw', -6.7, 4); // a brazier (hit it west)
      this.dummy('straw', 12.4, 12.6); // the pool (hit it south-east)
      this.dummy('straw', 6.6, -0.6); // the barrels (kick one at it from behind them)
      this.dummy('straw', -16, -16.2, 2); // the high ground (knock it off the front edge)
    } else if (s === 'melee' || s === 'ranged') this.bandit(s === 'ranged' ? 'crossbow' : 'sword', this.it.at(0, -2), s === 'ranged' ? 'Sandbox crossbow' : 'Sandbox sparring partner');
    else if (s === 'group') for (let i = 0; i < 3; i++) this.bandit('sword', this.it.at((i - 1) * 4, -2), 'Sandbox sparring partner');
    else if (s === 'crowd') {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        this.crowdBandit('sword', this.it.at(Math.sin(a) * 6, -2 + Math.cos(a) * 6), 'Brawler');
      }
    } else if (s === 'gauntlet') {
      this.gauntlet = { wave: 0, t: 0, done: false };
      this.spawnWave();
    }
    this.persist();
  }
  private spawnWave() {
    const roles = WAVES[this.gauntlet.wave];
    roles.forEach((role, i) => {
      const a = (i / roles.length) * Math.PI * 2 + this.gauntlet.wave;
      const r = role === 'crossbow' ? 11 : 7;
      this.crowdBandit(role, this.it.at(Math.sin(a) * r, -2 + Math.cos(a) * r), role === 'crossbow' ? 'Gauntlet crossbow' : 'Gauntlet fighter');
    });
    this.hooks.banner?.(`WAVE ${this.gauntlet.wave + 1} OF ${WAVES.length}`);
  }
  private stepGauntlet(dt: number) {
    const g = this.gauntlet;
    if (g.done) return;
    g.t += dt;
    if (this.actors.some((a) => a.alive)) return;
    if (g.wave + 1 < WAVES.length) {
      g.wave++;
      for (const a of this.actors) a.dispose();
      this.actors.length = 0;
      this.spawnWave();
      return;
    }
    g.done = true;
    const best = this.settings.best.gauntlet;
    if (!best || g.t < best) this.settings.best.gauntlet = g.t;
    this.hooks.banner?.(`GAUNTLET CLEARED · ${fmtTime(g.t)}`);
    this.persist();
  }

  resetFight() {
    this.player.yaw = Math.PI;
    this.player.respawn(this.it.spawn.clone().setY(this.it.spawn.y + 0.3));
    this.cam.yaw = Math.PI;
    this.cam.snapTo(this.player.pos);
    this.rt.reset();
    this.player.invulnerable = this.settings.immortal;
    this.props.reset();
    this.spawn();
    this.metrics = { damage: 0, hits: 0, peak: 0, parries: 0, dodges: 0, combo: 0, bestCombo: 0 };
    this.dropCombo();
    this.firstHit = -1;
    this.deadTime = 0;
  }
  update(dt: number) {
    this.clock += dt;
    const p = this.player;
    p.invulnerable = this.settings.immortal;
    this.props.update(dt);
    if (p.dead) {
      if (this.deadTime === 0) this.hooks.clearEffects();
      this.deadTime += dt;
      if (this.deadTime > 1) this.resetFight();
      return;
    }
    this.deadTime = 0;
    if (this.settings.unlimited) {
      p.mana = p.maxMana;
      p.stamina = p.maxStamina;
      this.rt.flow = this.rt.flowMax;
      this.rt.cc.tempo = this.rt.cc.tempoMax;
      this.rt.cc.focus = this.rt.cc.focusMax;
    }
    if (this.settings.instantCooldowns) this.rt.clearCooldowns();
    for (const a of this.actors) {
      if (a instanceof SandboxTarget) a.update(dt);
      else if (this.settings.enemyAI || !a.alive) a.update(dt, p);
    }
    this.bolts.update(dt, p);
    if (this.settings.scenario === 'gauntlet') this.stepGauntlet(dt);
    else if (this.settings.autoReset && this.actors.length && this.actors.every((a) => !a.alive)) {
      this.respawnTime += dt;
      if (this.respawnTime > 2) {
        this.props.reset();
        this.spawn();
      }
    }
    // The combo fades once the blows stop.
    if (this.metrics.combo > 0 && this.clock - this.lastHit > 2.2) this.dropCombo();
    for (const f of this.feed) {
      f.t -= dt;
      if (f.t < 0.5) f.el.style.opacity = String(Math.max(0, f.t / 0.5));
    }
    while (this.feed.length && this.feed[this.feed.length - 1].t <= 0) this.feed.pop()!.el.remove();
    if (Math.abs(p.pos.x - this.it.spawn.x) > 27 || Math.abs(p.pos.z - this.it.at(0, 0).z) > 27 || p.pos.y < this.it.spawn.y - 4) this.resetFight();
  }
  /** Live phase labels read gameplay state even while a practice frame is paused. */
  frame() {
    const p = this.player;
    const focus = this.player.lock ?? this.actors.find((a) => a.alive);
    const read = focus ? peekCombat(focus)?.read : null;
    const distance = focus ? Math.max(0, focus.position.distanceTo(p.pos) - focus.radius).toFixed(1) + ' m to target' : 'No target';
    const playerPhase = p.combatPhase;
    const phase = read ? `${read.name}: ${PHASE_LABEL[read.phase]}` : playerPhase ? `Your ${p.act!.def.id}: ${PHASE_LABEL[playerPhase]}` : 'Space: dodge · C: jump · G: kick';
    const m = this.metrics,
      seconds = Math.max(1, this.clock - this.firstHit);
    const dps = this.firstHit < 0 ? 0 : Math.round(m.damage / seconds);
    const g = this.gauntlet;
    const gauntlet = this.settings.scenario === 'gauntlet' ? `\nWave ${g.wave + 1}/${WAVES.length} · ${fmtTime(g.t)}${this.settings.best.gauntlet ? ` · best ${fmtTime(this.settings.best.gauntlet)}` : ''}` : '';
    const text = `${phase}\n${Math.round(this.settings.speed * 100)}% speed · ${distance} · ${p.combatReach.toFixed(1)} m reach · ${Math.round(p.inputLatency * 1000)} ms queued${gauntlet}`;
    const stats = `<div><b>${dps}</b><span>DPS</span></div><div><b>${m.hits}</b><span>HITS</span></div><div><b>${Math.round(m.peak)}</b><span>PEAK</span></div><div><b>${m.bestCombo}</b><span>BEST COMBO</span></div><div><b>${m.parries}</b><span>PERFECT PARRIES</span></div><div><b>${m.dodges}</b><span>PERFECT DODGES</span></div>`;
    if (text + stats !== this.badgeText) {
      this.badgeText = text + stats;
      this.badge.querySelector('output')!.textContent = text;
      this.badge.querySelector('.stats')!.innerHTML = stats;
    }
  }
  private practicePreset(live: boolean) {
    const weapon = this.player.equip.mainWeapon?.def.stats;
    const damage = (weapon?.damage ?? 20) * this.player.paths.meleePower(weapon?.speed ?? 1) * this.player.mods.melee;
    Object.assign(this.settings, {
      scenario: 'melee',
      drill: live ? 'sequence' : 'cut',
      speed: 1,
      footprints: true,
      immortal: !live,
      unlimited: !live,
      instantCooldowns: false,
      enemyAI: true,
      targetHp: Math.max(300, Math.round(damage * 24)),
      enemyDamage: Math.max(30, Math.round(this.player.maxHp * 0.14)),
    });
    this.resetFight();
    this.renderPanel();
  }
  private renderPanel() {
    const s = this.settings,
      options = (rows: { id: string; name: string }[], selected: string) =>
        rows.map((d) => `<option value="${esc(d.id)}"${d.id === selected ? ' selected' : ''}>${esc(d.name)}</option>`).join('');
    const moves = buildMoves(this.player),
      moveOptions = (selected: unknown) =>
        '<option value="">Empty slot</option>' + moves.map((m) => `<option value="${esc(m.ref)}"${m.ref === selected ? ' selected' : ''}>${esc(m.name)}</option>`).join('');
    const learned = new Set(s.learned);
    const cards = SCENARIO_INFO.map((c) => `<button type="button" data-scenario="${c.id}" class="${c.id === s.scenario ? 'on' : ''}"><b>${esc(c.name)}</b><span>${esc(c.text)}</span></button>`).join('');
    const list = MOVE_LIST.map((m) => {
      const where = m.where ? SCENARIO_INFO.find((c) => c.id === m.where)?.name : '';
      return `<div class="${learned.has(m.id) ? 'done' : ''}"><b>${esc(m.name)}</b><small>${esc(m.how)}</small>${where ? `<em>TRY: ${esc(where.toUpperCase())}</em>` : ''}</div>`;
    }).join('');
    const rules = (
      [
        ['footprints', 'Show actual attack footprints'],
        ['immortal', 'Player takes no damage'],
        ['unlimited', 'Unlimited mana and stamina'],
        ['instantCooldowns', 'Instant technique cooldowns'],
        ['enemyAI', 'Opponents attack'],
        ['autoReset', 'Replace defeated opponents'],
        ['showMoves', 'Show the move list beside the fight'],
      ] as const
    )
      .map(([key, label]) => `<label><input type="checkbox" data-setting="${key}" ${s[key] ? 'checked' : ''}>${label}</label>`)
      .join('');
    this.panel.innerHTML = `<article><nav><h2>Proving Grounds</h2><a href="#sbx-fight">Fight</a><a href="#sbx-moves">Move list</a><a href="#sbx-build">Build</a><a href="#sbx-gear">Equipment</a><a href="#sbx-rules">Rules</a><span class="grow"></span><button data-action="leave">Save Sandbox & return to adventure</button></nav><div class="body"><button class="sandbox-close" data-action="resume">Resume · F6 / Esc</button>
<section id="sbx-fight"><h3>Fight</h3><p>Pick what to fight. Dummies have bodies now: launch them, throw them into the wall, the fence, the fire or the pool.</p><div class="sbx-cards">${cards}</div><div class="sandbox-grid"><label>Encounter<select data-setting="scenario">${options(SCENARIO_INFO, s.scenario)}</select></label><label>Target health<input data-setting="targetHp" type="number" min="100" max="10000000" value="${s.targetHp}"></label><label>Enemy damage<input data-setting="enemyDamage" type="number" min="1" max="10000" value="${s.enemyDamage}"></label><label>Practice speed<select data-setting="speed">${[1, 0.5, 0.25].map((v) => `<option value="${v}"${s.speed === v ? ' selected' : ''}>${v * 100}%</option>`).join('')}</select></label><label>Opponent drill<select data-setting="drill"><option value="free"${s.drill === 'free' ? ' selected' : ''}>Normal AI</option><option value="sequence"${s.drill === 'sequence' ? ' selected' : ''}>Repeat: cut, held strike, lunge</option>${UAL_MOVES.map((m) => `<option value="${m.id}"${s.drill === m.id ? ' selected' : ''}>Repeat: ${esc(moveName(m))}</option>`).join('')}</select></label></div><div class="sandbox-actions"><button data-action="reset">Reset fight · F7</button><button data-action="clear">Clear opponents</button><button data-action="duel">Reference duel · real costs</button><button data-action="lesson">Read the tell · unlimited practice</button></div><p>Best combo ${s.best.combo}${s.best.gauntlet ? ` · best gauntlet ${fmtTime(s.best.gauntlet)}` : ''}</p></section>
<section id="sbx-moves"><h3>Move list · ${MOVE_LIST.filter((m) => learned.has(m.id)).length} of ${MOVE_LIST.length}</h3><p>Every fluid move and how to do it. Each one is ticked the first time you pull it off here.</p><div class="sbx-list">${list}</div><div class="sandbox-actions"><button data-action="forget">Clear the ticks</button></div></section>
<section id="sbx-build"><h3>Build</h3><p>Every combat class is level 50. Pick a style and a magic school to unlock their complete movesets at maximum rank. Switching builds resets the fight.</p><div class="sandbox-grid"><label>Combat style<select data-setting="combat">${options(COMBAT_STYLES, s.combat)}</select></label><label>Magic school<select data-setting="magic"><option value="">None</option>${options(MAGIC_SCHOOLS, s.magic)}</select></label></div><h3 style="margin-top:14px">Moves bar · Tab shows it</h3><div class="sandbox-grid">${Array.from({ length: 6 }, (_, i) => `<label>Slot ${i + 1}<select data-move="${i}">${moveOptions(this.player.equip.moves[i])}</select></label>`).join('')}</div></section>
<section id="sbx-gear"><h3>Equipment</h3><p>I opens equipment; K opens the skill trees. The grappling hook is on key 4.</p><div class="sandbox-grid"><input type="search" placeholder="Find a weapon, spell or armour…" aria-label="Find Sandbox equipment" data-gear-search><select aria-label="Sandbox equipment" data-gear></select></div><div class="sandbox-actions"><button data-action="grant">Add selected item to inventory</button><button data-action="refill">Refill health, mana, stamina and armour</button></div><p class="sandbox-note" role="status"></p></section>
<section id="sbx-rules"><h3>Rules</h3><div class="sandbox-grid">${rules}</div><div class="sandbox-actions"><button data-action="debug">Toggle combat hitboxes · F9</button></div></section></div></article>`;
    this.panel.querySelectorAll<HTMLAnchorElement>('nav a').forEach(
      (a) =>
        (a.onclick = (e) => {
          e.preventDefault();
          this.panel.querySelector(a.getAttribute('href')!)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }),
    );
    this.panel.querySelectorAll<HTMLButtonElement>('[data-scenario]').forEach(
      (b) =>
        (b.onclick = () => {
          this.props.reset();
          this.spawn(b.dataset.scenario as Scenario);
          this.renderPanel();
        }),
    );
    this.panel.querySelectorAll<HTMLSelectElement | HTMLInputElement>('[data-setting]').forEach(
      (el) =>
        (el.onchange = () => {
          const key = el.dataset.setting as keyof typeof s;
          if (key === 'combat' || key === 'magic') {
            this.changeBuild(key === 'combat' ? el.value : s.combat, key === 'magic' ? el.value : s.magic);
            this.renderPanel();
            return;
          }
          if (key === 'speed') {
            s.speed = Number(el.value);
            this.persist();
            return;
          }
          if (key === 'drill') {
            s.drill = el.value;
            this.spawn();
            return;
          }
          if (key === 'targetHp' || key === 'enemyDamage') {
            const n = Number(el.value);
            if (!Number.isFinite(n)) return;
            s[key] = Math.round(Math.max(key === 'targetHp' ? 100 : 1, Math.min(key === 'targetHp' ? 10000000 : 10000, n)));
            el.value = String(s[key]);
          } else if (key === 'scenario') s.scenario = el.value as Scenario;
          else if (key === 'footprints' || key === 'immortal' || key === 'unlimited' || key === 'instantCooldowns' || key === 'enemyAI' || key === 'autoReset' || key === 'showMoves') s[key] = (el as HTMLInputElement).checked;
          if (key === 'showMoves') this.renderMoveList();
          if (key === 'scenario') {
            this.props.reset();
            this.panel.querySelectorAll('[data-scenario]').forEach((c) => c.classList.toggle('on', (c as HTMLElement).dataset.scenario === s.scenario));
          }
          if (key === 'scenario' || key === 'targetHp' || key === 'enemyDamage') this.spawn();
          this.player.invulnerable = s.immortal;
          this.persist();
        }),
    );
    this.panel.querySelectorAll<HTMLSelectElement>('[data-move]').forEach(
      (el) =>
        (el.onchange = () => {
          this.player.equip.moves[Number(el.dataset.move)] = el.value || null;
          events.emit('equipmentChanged', {});
          this.persist();
        }),
    );
    const gear = this.panel.querySelector<HTMLSelectElement>('[data-gear]')!,
      search = this.panel.querySelector<HTMLInputElement>('[data-gear-search]')!;
    const filter = () => {
      const needle = search.value.toLowerCase();
      gear.innerHTML = Object.values(ITEMS)
        .filter((d) => !['key', 'material'].includes(d.kind) && d.name.toLowerCase().includes(needle))
        .slice(0, 250)
        .map((d) => `<option value="${esc(d.id)}">${esc(d.name)} · ${d.kind}</option>`)
        .join('');
    };
    search.oninput = filter;
    filter();
    this.panel.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(
      (b) =>
        (b.onclick = () => {
          switch (b.dataset.action) {
            case 'duel':
            case 'lesson':
              this.practicePreset(b.dataset.action === 'duel');
              break;
            case 'resume':
              this.openControls(false);
              break;
            case 'reset':
              this.resetFight();
              break;
            case 'clear':
              this.clearTargets();
              break;
            case 'debug':
              this.hooks.debug();
              break;
            case 'refill':
              refill(this.player);
              break;
            case 'forget':
              s.learned = [];
              this.renderMoveList();
              this.renderPanel();
              this.persist();
              break;
            case 'leave':
              this.persist();
              this.hooks.leave();
              break;
            case 'grant': {
              const d = ITEMS[gear.value];
              if (!d) break;
              this.player.equip.add(d.id, ['ammo', 'consumable'].includes(d.kind) ? 99 : 1);
              events.emit('equipmentChanged', {});
              this.persist();
              this.panel.querySelector('.sandbox-note')!.textContent = `Added ${d.name}. Open I to equip it.`;
              break;
            }
          }
        }),
    );
  }
}

const fmtTime = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
