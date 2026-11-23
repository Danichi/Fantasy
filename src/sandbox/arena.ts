import * as THREE from 'three';
import './arena.css';
import { dressPracticeArena } from './presentation';
import { PRACTICE_BOSSES, practiceBoss, type BossSession } from './bossRoster';
import { targets, type Target } from '../combat/targets';
import type { FX } from '../fx/particles';
import { setGroundOverride } from '../world/terrainHeight';
import { Bandit, Bolts, type BanditRole } from '../enemies/bandit';
import { moveName, UAL_MOVES } from '../combat/ai';
import { combat, peekCombat } from '../combat/core';
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
  {
    id: 'boss',
    name: 'Boss trial',
    text: 'Pick any boss from the roster. Phases, adds and real attacks.',
  },
  {
    id: 'dummy',
    name: 'Straw dummy',
    text: 'Light enough to launch, juggle and throw.',
  },
  {
    id: 'moving',
    name: 'Moving target',
    text: 'Slides side to side: lunges and dash strikes.',
  },
  {
    id: 'shield',
    name: 'Shield bearer',
    text: 'Guards in front. Vault it, drive it, break it.',
  },
  {
    id: 'iron',
    name: 'Iron dummy',
    text: 'Too heavy to throw: posture and the hook zip.',
  },
  {
    id: 'world',
    name: 'World as a weapon',
    text: 'Dummies by the wall, fence, fire, pool, barrels and ledge.',
  },
  {
    id: 'melee',
    name: 'Sparring partner',
    text: 'Attacks you: counters, ripostes, feints.',
  },
  { id: 'ranged', name: 'Crossbow', text: 'Keeps its distance and shoots.' },
  { id: 'group', name: 'Three opponents', text: 'Take turns at you.' },
  {
    id: 'crowd',
    name: 'The crowd',
    text: 'Five around you: dash between them, watch your back.',
  },
  { id: 'gauntlet', name: 'Gauntlet', text: 'Five waves, against the clock.' },
];

const WAVES: BanditRole[][] = [
  ['sword'],
  ['sword', 'sword'],
  ['sword', 'crossbow', 'sword'],
  ['sword', 'sword', 'sword', 'crossbow'],
  ['sword', 'sword', 'sword', 'sword', 'crossbow', 'crossbow'],
];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
type Actor = Bandit | SandboxTarget;

export class SandboxArena {
  readonly settings = readSandboxSettings();
  readonly panel: HTMLDivElement;
  readonly actors: Actor[] = [];
  readonly bolts: Bolts;
  readonly props: ArenaProps;
  bossSession: BossSession | null = null;
  bossReady: Promise<void> = Promise.resolve();
  bossStatus = '';
  private generation = 0;
  private bossLoaded = false;
  private tab = 'fight';
  private chosenBoss = this.settings.bossId;
  private bossFilter = '';
  private bossSearch = '';
  private bossOwned = new Set<Target>();
  private bossHealthScaled = new WeakSet<object>();
  private badge: HTMLDivElement;
  private comboEl: HTMLDivElement;
  private feedEl: HTMLDivElement;
  private movesEl: HTMLDivElement;
  private deadTime = 0;
  private respawnTime = 0;
  private clock = 0;
  private badgeText = '';
  metrics = {
    damage: 0,
    hits: 0,
    peak: 0,
    parries: 0,
    dodges: 0,
    combo: 0,
    bestCombo: 0,
  };
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
    private fx: FX,
    private hooks: {
      save(): void;
      toggle(open: boolean): void;
      debug(): void;
      clearEffects(): void;
      leave(): void;
      banner?(text: string): void;
      message?(text: string): void;
    }
  ) {
    it.interactables.length = 0;
    this.bolts = new Bolts(scene);
    this.props = new ArenaProps(scene, it);
    document.body.classList.add('in-sandbox');
    const el = (cls: string, html = '') => {
      const d = document.createElement('div');
      d.className = 'sbx ' + cls;
      d.innerHTML = html;
      document.body.append(d);
      return d;
    };
    this.badge = el(
      'sandbox-badge',
      '<h4>THE PROVING GROUNDS</h4><div class="sbx-live-name">Combat laboratory</div><div class="keys">F6 fight console · F7 retry · F8 slow motion</div><div class="stats"></div><output></output><div class="sbx-quick"><button type="button" data-quick="console">Choose a fight</button><button type="button" data-quick="retry">↻ Retry</button><button type="button" data-quick="heal">Refill</button></div><p class="sbx-context"></p>'
    );
    this.badge.querySelector<HTMLButtonElement>('[data-quick=console]')!.onclick = () => this.openControls();
    this.badge.querySelector<HTMLButtonElement>('[data-quick=retry]')!.onclick = () => this.resetFight();
    this.badge.querySelector<HTMLButtonElement>('[data-quick=heal]')!.onclick = () => refill(this.player);
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
      if (!this.actors.includes(e.target as Actor) && !this.bossOwned.has(e.target)) return;
      this.recordHit(e.damage);
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
        if (e.code === 'Tab' && !this.panel.hidden) {
          const items = [...this.panel.querySelectorAll<HTMLElement>('button,a[href],input,select')].filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
          const first = items[0],
            last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
          e.stopImmediatePropagation();
          return;
        }
        if (e.repeat) return;
        if (this.bossSession?.naval && this.panel.hidden && !/INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement)?.tagName ?? '')) {
          const kind = ({ F2: 'swivel', F3: 'harpoon', F4: 'broadside' } as const)[e.code as 'F2' | 'F3' | 'F4'];
          if (kind) {
            e.preventDefault();
            this.bossSession.naval.fire(kind, this.player, this.player.aimDir);
          }
        }
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
      true
    );
    this.spawn(this.settings.scenario);
    this.renderPanel();
    dressPracticeArena(
      it,
      (tab) => {
        this.tab = tab;
        this.openControls();
      },
      () => this.resetFight()
    );
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
  private recordHit(damage: number) {
    if (this.firstHit < 0) this.firstHit = this.clock;
    this.metrics.damage += damage;
    this.metrics.hits++;
    this.metrics.peak = Math.max(this.metrics.peak, damage);
    // The combo: blows that land within two seconds of each other.
    this.metrics.combo = this.clock - this.lastHit < 2.2 ? this.metrics.combo + 1 : 1;
    this.lastHit = this.clock;
    this.metrics.bestCombo = Math.max(this.metrics.bestCombo, this.metrics.combo);
    if (this.metrics.combo > this.settings.best.combo) this.settings.best.combo = this.metrics.combo;
    this.showCombo();
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
    this.input.endFrame();
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
    ++this.generation;
    this.bossLoaded = false;
    if (this.bossSession?.naval) {
      this.player.teleport(this.it.spawn.clone().add(new THREE.Vector3(0, 0.3, 0)));
      this.cam.distance = 5.5;
      this.cam.snapTo(this.player.pos);
    }
    for (const t of this.bossOwned) combat.cancel(t);
    this.bossSession?.dispose();
    this.bossSession = null;
    for (const t of this.bossOwned) {
      if (targets.has(t)) {
        (t as Target & { dispose?(): void }).dispose?.();
        targets.delete(t);
      }
      t.alive = false;
      t.lockable = false;
    }
    this.bossOwned.clear();
    this.bossStatus = '';
    setGroundOverride(this.it.groundAt);
    for (const a of this.actors) a.dispose();
    this.actors.length = 0;
    this.bolts.clear();
    this.hooks.clearEffects();
    this.player.lock = null;
    this.cam.lockTarget = null;
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
    if (s === 'boss') {
      this.bossReady = this.spawnBoss(this.generation);
    } else if (s === 'dummy') this.dummy('straw', 0, -2);
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
    } else if (s === 'melee' || s === 'ranged')
      this.bandit(s === 'ranged' ? 'crossbow' : 'sword', this.it.at(0, -2), s === 'ranged' ? 'Sandbox crossbow' : 'Sandbox sparring partner');
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
  private async spawnBoss(generation: number) {
    const def = practiceBoss(this.settings.bossId);
    this.settings.bossId = def.id;
    this.bossStatus = 'Preparing ' + def.name + '…';
    const before = new Set(targets);
    let session: BossSession | null = null;
    try {
      session = await def.create({
        scene: this.scene,
        fx: this.fx,
        bolts: this.bolts,
        at: this.it.at(0, -7),
        say: (text) => (this.hooks.message ?? this.hooks.banner)?.(text),
      });
      if (generation !== this.generation) {
        session.dispose();
        return;
      }
      this.bossSession = session;
      this.captureBossTargets(before);
      await session.ready;
      if (generation !== this.generation) return;
      this.bossLoaded = true;
      session.scaleReserve?.(this.settings.bossHealth);
      if (session.naval) {
        session.naval.onDamage = (damage) => this.recordHit(damage);
        session.naval.beast.maxHp *= this.settings.bossHealth;
        session.naval.beast.hp *= this.settings.bossHealth;
      }
      this.captureBossTargets(before);
      this.bossStatus = def.name;
      if (session.naval) {
        this.player.teleport(session.naval.spawn);
        setGroundOverride((x, z) => (Math.abs(z - session!.naval!.centre.z) < 300 ? -5 : this.it.groundAt(x, z)));
        this.cam.distance = 8;
      } else this.cam.distance = 5.5;
      this.cam.snapTo(this.player.pos);
      this.hooks.banner?.(def.name);
    } catch (error) {
      if (generation !== this.generation) return;
      if (this.bossSession !== session) session?.dispose();
      this.clearTargets();
      this.bossStatus = 'Could not load this boss. Retry or choose another fight.';
      console.error('Sandbox boss load failed', error);
    }
    if (!this.panel.hidden) this.renderPanel();
  }
  private captureBossTargets(before: Set<Target>) {
    for (const t of targets) if (!before.has(t)) this.bossOwned.add(t);
    for (const t of this.bossSession?.targets() ?? []) this.bossOwned.add(t);
    for (const t of this.bossOwned)
      if (!this.bossHealthScaled.has(t)) {
        this.bossHealthScaled.add(t);
        // Composite bosses own their total health through their child targets.
        t.maxHp *= this.settings.bossHealth;
        t.hp *= this.settings.bossHealth;
      }
  }
  private async deployBoss() {
    this.selectBoss(this.chosenBoss);
    const generation = this.generation;
    this.renderPanel();
    await this.bossReady;
    if (generation === this.generation && this.bossSession && this.bossLoaded) this.openControls(false);
  }
  openTab(tab: string) {
    this.tab = tab;
    this.openControls();
  }
  selectBoss(id: string) {
    this.settings.bossId = practiceBoss(id).id;
    this.chosenBoss = this.settings.bossId;
    this.settings.scenario = 'boss';
    this.resetFight();
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
    this.cam.pitch = 0.22;
    this.cam.distance = 5.5;
    this.cam.lockTarget = null;
    this.cam.snapTo(this.player.pos);
    this.rt.reset();
    this.player.invulnerable = this.settings.immortal;
    this.props.reset(this.settings.scenario !== 'boss');
    this.spawn();
    this.metrics = {
      damage: 0,
      hits: 0,
      peak: 0,
      parries: 0,
      dodges: 0,
      combo: 0,
      bestCombo: 0,
    };
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
    if (this.bossSession && this.bossLoaded) {
      const before = new Set(targets);
      this.bossSession.naval?.setImmortal(this.settings.immortal);
      this.bossSession.naval?.setAI(this.settings.enemyAI);
      if (this.settings.enemyAI || this.bossSession.naval) {
        const receive = p.receiveAttack;
        const takeDamage = p.takeDamage;
        p.takeDamage = (damage) => takeDamage.call(p, damage * this.settings.bossDamage);
        p.receiveAttack = (attack) =>
          receive.call(p, {
            ...attack,
            damage: attack.damage * this.settings.bossDamage,
          });
        try {
          this.bossSession.update(dt, p);
          this.bolts.update(dt, p);
        } finally {
          p.receiveAttack = receive;
          p.takeDamage = takeDamage;
        }
      }
      this.captureBossTargets(before);
      const interaction = this.bossSession.interact?.();
      if (interaction && interaction.at.distanceTo(p.pos) < 3 && this.input.wasPressed('interact')) interaction.act();
      if (this.bossSession.naval && (p.pos.y < -1 || this.bossSession.naval.ship.hullFrac <= 0)) this.resetFight();
    }
    for (const a of this.actors) {
      if (a instanceof SandboxTarget) a.update(dt);
      else if (this.settings.enemyAI || !a.alive) a.update(dt, p);
    }
    if (!this.bossSession) this.bolts.update(dt, p);
    if (this.settings.scenario === 'gauntlet') this.stepGauntlet(dt);
    else if (
      this.settings.autoReset &&
      (this.actors.length || (this.bossLoaded && this.bossSession?.health())) &&
      (this.bossSession ? !this.bossSession.health()?.alive : this.actors.every((a) => !a.alive))
    ) {
      this.respawnTime += dt;
      if (this.respawnTime > 2) {
        this.props.reset(this.settings.scenario !== 'boss');
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
    if (!this.bossSession?.naval && (Math.abs(p.pos.x - this.it.spawn.x) > 27 || Math.abs(p.pos.z - this.it.at(0, 0).z) > 27 || p.pos.y < this.it.spawn.y - 4)) this.resetFight();
  }
  /** Live phase labels read gameplay state even while a practice frame is paused. */
  present(alpha: number, dt: number) {
    this.bossSession?.present?.(alpha, dt, this.player);
  }
  frame() {
    const p = this.player;
    const focus = this.player.lock ?? this.bossSession?.targets().find((a) => a.alive && a.lockable) ?? this.actors.find((a) => a.alive);
    const read = focus ? peekCombat(focus)?.read : null;
    const distance = focus ? Math.max(0, focus.position.distanceTo(p.pos) - focus.radius).toFixed(1) + ' m to target' : 'No target';
    const playerPhase = p.combatPhase;
    const phase = read ? `${read.name}: ${PHASE_LABEL[read.phase]}` : playerPhase ? `Your ${p.act!.def.id}: ${PHASE_LABEL[playerPhase]}` : 'Space: dodge · C: jump · G: kick';
    const m = this.metrics,
      seconds = Math.max(1, this.clock - this.firstHit);
    const dps = this.firstHit < 0 ? 0 : Math.round(m.damage / seconds);
    const g = this.gauntlet;
    const gauntlet =
      this.settings.scenario === 'gauntlet'
        ? `\nWave ${g.wave + 1}/${WAVES.length} · ${fmtTime(g.t)}${this.settings.best.gauntlet ? ` · best ${fmtTime(this.settings.best.gauntlet)}` : ''}`
        : '';
    const health = this.bossSession?.health();
    const name = this.settings.scenario === 'boss' ? this.bossStatus : (SCENARIO_INFO.find((c) => c.id === this.settings.scenario)?.name ?? 'Empty arena');
    const title = this.badge.querySelector('.sbx-live-name')!;
    if (title.textContent !== name) title.textContent = name;
    const naval = this.bossSession?.naval;
    const context = naval
      ? `NAVAL TRIAL · F2 swivel · F3 harpoon · F4 broadside · Hull ${Math.round(naval.ship.hullFrac * 100)}%`
      : (this.bossSession?.interact?.()?.label ?? 'LMB strike · RMB guard · F parry · Space dodge · Q lock on');
    this.badge.querySelector('.sbx-context')!.textContent = context;
    const bar = this.badge.querySelector<HTMLDivElement>('.sbx-boss-health');
    if (health && !bar) {
      const el = document.createElement('div');
      el.className = 'sbx-boss-health';
      this.badge.querySelector('.sbx-live-name')!.after(el);
    }
    if (!health) bar?.remove();
    if (health) {
      const el = this.badge.querySelector<HTMLDivElement>('.sbx-boss-health')!;
      const pct = Math.max(0, (health.hp / health.maxHp) * 100);
      el.innerHTML = `<span>${Math.ceil(health.hp).toLocaleString()} / ${Math.ceil(health.maxHp).toLocaleString()} HP${!health.alive ? ' · DEFEATED' : ''}</span><i style="width:${pct}%"></i>`;
    }
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
  private bossPanel() {
    const boss = practiceBoss(this.chosenBoss),
      s = this.settings;
    const loading = s.scenario === 'boss' && !this.bossLoaded && this.bossStatus.startsWith('Preparing');
    const filtered = PRACTICE_BOSSES.filter(
      (b) => (!this.bossFilter || b.group === this.bossFilter) && `${b.name} ${b.description}`.toLowerCase().includes(this.bossSearch.toLowerCase())
    );
    return `<section id="sbx-bosses"><div class="sbx-section-heading"><div><span class="eyebrow">NO UNLOCKS REQUIRED</span><h3>The boss roster</h3><p>Every boss. Your build. As many attempts as it takes.</p></div><span class="sbx-count">${PRACTICE_BOSSES.length} encounters</span></div><div class="sbx-boss-layout"><div><label class="sbx-search">Find a boss<input type="search" data-boss-search placeholder="Search names or fighting styles…" value="${esc(this.bossSearch)}"></label><div class="sbx-filters" role="group" aria-label="Boss categories">${['', 'Field', 'Lair', 'Dungeon', 'Story', 'Sea'].map((g) => `<button data-boss-filter="${g}" class="${this.bossFilter === g ? 'on' : ''}">${g || 'All bosses'}</button>`).join('')}</div><div class="sbx-roster">${filtered.map((b) => `<button type="button" data-boss="${b.id}" aria-pressed="${b.id === boss.id}" class="${b.id === boss.id ? 'selected' : ''}"><img src="/assets/art/beast/${b.art}.webp" alt="" loading="lazy"><div><small>${b.group} ${b.group === 'Sea' ? '· NAVAL TRIAL' : ''}</small><b>${esc(b.name)}</b><span>${esc(b.description)}</span></div><i>${b.id === boss.id ? '✓' : '→'}</i></button>`).join('') || '<p class="sbx-empty">No bosses match. Try a different name or category.</p>'}</div></div><aside class="sbx-boss-preview"><img src="/assets/art/beast/${boss.art}.webp" alt=""><div><span class="eyebrow">${boss.group.toUpperCase()} ENCOUNTER</span><h3>${esc(boss.name)}</h3><p>${esc(boss.description)}</p><div class="sbx-trial-notes">${boss.group === 'Sea' ? 'A training ship, working swivel guns and heavy harpoons. F2 fires the swivel, F3 the harpoon, F4 a broadside. Lock on to choose a part.' : 'Original boss moves, phase transitions and summons. Retry rebuilds the encounter and clears its hazards.'}</div><div class="sandbox-grid"><label>Boss health<select data-boss-tuning="bossHealth">${[0.25, 0.5, 1, 2, 4].map((n) => `<option value="${n}"${s.bossHealth === n ? ' selected' : ''}>${n}× health</option>`).join('')}</select></label><label>Boss damage<select data-boss-tuning="bossDamage">${[0.25, 0.5, 1, 2, 4].map((n) => `<option value="${n}"${s.bossDamage === n ? ' selected' : ''}>${n}× damage</option>`).join('')}</select></label></div><div class="sbx-presets"><button data-boss-mode="learn" class="${s.immortal ? 'on' : ''}"><b>Learn the fight</b><span>No player damage · unlimited resources</span></button><button data-boss-mode="challenge" class="${!s.immortal ? 'on' : ''}"><b>Test your build</b><span>Real damage · real resource costs</span></button></div><button class="primary sbx-deploy" data-boss-deploy ${loading ? 'disabled aria-busy="true"' : ''}>${loading ? 'Preparing encounter…' : 'Spawn & fight →'}</button><p class="sbx-muted">Health applies on spawn or retry. F8 slows the fight.</p></div></aside></div></section>`;
  }
  private bindBossPanel() {
    const search = this.panel.querySelector<HTMLInputElement>('[data-boss-search]')!;
    search.oninput = () => {
      const start = search.selectionStart;
      this.bossSearch = search.value;
      this.renderPanel();
      const next = this.panel.querySelector<HTMLInputElement>('[data-boss-search]')!;
      next.focus();
      next.setSelectionRange(start, start);
    };
    this.panel.querySelectorAll<HTMLButtonElement>('[data-boss-filter]').forEach(
      (b) =>
        (b.onclick = () => {
          this.bossFilter = b.dataset.bossFilter!;
          this.renderPanel();
        })
    );
    this.panel.querySelectorAll<HTMLButtonElement>('[data-boss]').forEach(
      (b) =>
        (b.onclick = () => {
          const scroll = this.panel.querySelector('.body')!.scrollTop;
          this.chosenBoss = b.dataset.boss!;
          this.renderPanel();
          this.panel.querySelector('.body')!.scrollTop = scroll;
        })
    );
    this.panel.querySelectorAll<HTMLSelectElement>('[data-boss-tuning]').forEach(
      (el) =>
        (el.onchange = () => {
          this.settings[el.dataset.bossTuning as 'bossHealth' | 'bossDamage'] = Number(el.value);
          this.persist();
        })
    );
    this.panel.querySelectorAll<HTMLButtonElement>('[data-boss-mode]').forEach(
      (b) =>
        (b.onclick = () => {
          const learn = b.dataset.bossMode === 'learn';
          Object.assign(this.settings, {
            immortal: learn,
            unlimited: learn,
            instantCooldowns: false,
          });
          this.persist();
          this.renderPanel();
        })
    );
    this.panel.querySelector<HTMLButtonElement>('[data-boss-deploy]')!.onclick = () => {
      void this.deployBoss();
    };
  }
  private renderPanel() {
    const s = this.settings,
      options = (rows: { id: string; name: string }[], selected: string) =>
        rows.map((d) => `<option value="${esc(d.id)}"${d.id === selected ? ' selected' : ''}>${esc(d.name)}</option>`).join('');
    const moves = buildMoves(this.player),
      moveOptions = (selected: unknown) =>
        '<option value="">Empty slot</option>' + moves.map((m) => `<option value="${esc(m.ref)}"${m.ref === selected ? ' selected' : ''}>${esc(m.name)}</option>`).join('');
    const learned = new Set(s.learned);
    const cards = SCENARIO_INFO.map(
      (c) =>
        `<button type="button" data-scenario="${c.id}" class="${c.id === s.scenario ? 'on' : ''}"><img src="/assets/art/beast/${({ boss: 'rustKnight', dummy: 'bandit', moving: 'bandit', shield: 'armour', iron: 'armour', world: 'boar', melee: 'bandit', ranged: 'banditChief', group: 'orc', crowd: 'goblin', gauntlet: 'greymane' } as Record<string, string>)[c.id]}.webp" alt="" loading="lazy"><b>${esc(c.name)}</b><span>${esc(c.text)}</span></button>`
    ).join('');
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
    this.panel.innerHTML = `<article><nav aria-label="Sandbox sections"><div class="sbx-brand"><span>COMBAT LABORATORY</span><h2>The Proving<br>Grounds</h2><p>Experiment. Learn. Go again.</p></div>${[
      ['fight', '01', 'Training'],
      ['bosses', '02', 'Boss roster'],
      ['build', '03', 'Your build'],
      ['gear', '04', 'Equipment'],
      ['moves', '05', 'Move library'],
      ['rules', '06', 'Session rules'],
    ]
      .map(
        ([id, n, label]) =>
          `<a href="#sbx-${id}" data-tab="${id}" class="${this.tab === id ? 'active' : ''}"><small>${n}</small>${label}${id === 'bosses' ? `<em>${PRACTICE_BOSSES.length}</em>` : ''}</a>`
      )
      .join(
        ''
      )}<div class="grow"></div><div class="sbx-safe">SEPARATE SAVE<span>Your adventure stays where you left it.</span></div><button data-action="leave">Return to adventure ↗</button></nav><div class="sbx-main"><header class="sbx-top"><div><span>THE PROVING GROUNDS</span><b>${({ fight: 'Find your flow', bosses: 'Choose your next challenge', build: 'Make it your own', gear: 'Bring the right tools', moves: 'Learn something new', rules: 'Set your conditions' } as Record<string, string>)[this.tab]}</b></div><button class="sandbox-close" data-action="resume">Resume · F6 / Esc</button></header><div class="body">${this.bossPanel()}

<section id="sbx-fight"><h3>Fight</h3><p>Pick what to fight. Dummies have bodies now: launch them, throw them into the wall, the fence, the fire or the pool.</p><div class="sbx-cards">${cards}</div><div class="sandbox-grid"><label>Encounter<select data-setting="scenario">${options(SCENARIO_INFO, s.scenario)}</select></label><label>Target health<input data-setting="targetHp" type="number" min="100" max="10000000" value="${s.targetHp}"></label><label>Enemy damage<input data-setting="enemyDamage" type="number" min="1" max="10000" value="${s.enemyDamage}"></label><label>Practice speed<select data-setting="speed">${[1, 0.5, 0.25].map((v) => `<option value="${v}"${s.speed === v ? ' selected' : ''}>${v * 100}%</option>`).join('')}</select></label><label>Opponent drill<select data-setting="drill"><option value="free"${s.drill === 'free' ? ' selected' : ''}>Normal AI</option><option value="sequence"${s.drill === 'sequence' ? ' selected' : ''}>Repeat: cut, held strike, lunge</option>${UAL_MOVES.map((m) => `<option value="${m.id}"${s.drill === m.id ? ' selected' : ''}>Repeat: ${esc(moveName(m))}</option>`).join('')}</select></label></div><div class="sandbox-actions"><button data-action="reset">Reset fight · F7</button><button data-action="clear">Clear opponents</button><button data-action="duel">Reference duel · real costs</button><button data-action="lesson">Read the tell · unlimited practice</button></div><p>Best combo ${s.best.combo}${s.best.gauntlet ? ` · best gauntlet ${fmtTime(s.best.gauntlet)}` : ''}</p></section>
<section id="sbx-moves"><h3>Move list · ${MOVE_LIST.filter((m) => learned.has(m.id)).length} of ${MOVE_LIST.length}</h3><p>Every fluid move and how to do it. Each one is ticked the first time you pull it off here.</p><div class="sbx-list">${list}</div><div class="sandbox-actions"><button data-action="forget">Clear the ticks</button></div></section>
<section id="sbx-build"><h3>Build</h3><p>Every combat class is level 50. Pick a style and a magic school to unlock their complete movesets at maximum rank. Switching builds resets the fight.</p><div class="sandbox-grid"><label>Combat style<select data-setting="combat">${options(COMBAT_STYLES, s.combat)}</select></label><label>Magic school<select data-setting="magic"><option value="">None</option>${options(MAGIC_SCHOOLS, s.magic)}</select></label></div><h3 style="margin-top:14px">Moves bar · Tab shows it</h3><div class="sandbox-grid">${Array.from({ length: 6 }, (_, i) => `<label>Slot ${i + 1}<select data-move="${i}">${moveOptions(this.player.equip.moves[i])}</select></label>`).join('')}</div></section>
<section id="sbx-gear"><h3>Equipment</h3><p>I opens equipment; K opens the skill trees. The grappling hook is on key 4.</p><div class="sandbox-grid"><input type="search" placeholder="Find a weapon, spell or armour…" aria-label="Find Sandbox equipment" data-gear-search><select aria-label="Sandbox equipment" data-gear></select></div><div class="sandbox-actions"><button data-action="grant">Add selected item to inventory</button><button data-action="refill">Refill health, mana, stamina and armour</button></div><p class="sandbox-note" role="status"></p></section>
<section id="sbx-rules"><h3>Rules</h3><div class="sandbox-grid">${rules}</div><div class="sandbox-actions"><button data-action="debug">Toggle combat hitboxes · F9</button></div></section></div><footer class="sbx-footer"><span><i></i> ${esc(this.settings.scenario === 'boss' ? this.bossStatus : (SCENARIO_INFO.find((c) => c.id === s.scenario)?.name ?? 'Arena ready'))} · ${Math.round(s.speed * 100)}% speed</span><div><button data-action="reset">↻ Reset fight · F7</button><button data-action="start" class="primary">Enter arena →</button></div></footer></div></article>`;
    this.panel.querySelectorAll<HTMLElement>('.body > section').forEach((section) => (section.hidden = section.id !== 'sbx-' + this.tab));
    this.panel.querySelectorAll<HTMLAnchorElement>('[data-tab]').forEach(
      (a) =>
        (a.onclick = (e) => {
          e.preventDefault();
          this.tab = a.dataset.tab!;
          this.renderPanel();
        })
    );
    this.bindBossPanel();
    this.panel.querySelectorAll<HTMLButtonElement>('[data-scenario]').forEach(
      (b) =>
        (b.onclick = () => {
          if (b.dataset.scenario === 'boss') {
            this.tab = 'bosses';
            this.renderPanel();
            return;
          }
          this.settings.scenario = b.dataset.scenario as Scenario;
          this.resetFight();
          this.renderPanel();
        })
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
            this.resetFight();
            return;
          }
          if (key === 'targetHp' || key === 'enemyDamage') {
            const n = Number(el.value);
            if (!Number.isFinite(n)) return;
            s[key] = Math.round(Math.max(key === 'targetHp' ? 100 : 1, Math.min(key === 'targetHp' ? 10000000 : 10000, n)));
            el.value = String(s[key]);
          } else if (key === 'scenario') s.scenario = el.value as Scenario;
          else if (
            key === 'footprints' ||
            key === 'immortal' ||
            key === 'unlimited' ||
            key === 'instantCooldowns' ||
            key === 'enemyAI' ||
            key === 'autoReset' ||
            key === 'showMoves'
          )
            s[key] = (el as HTMLInputElement).checked;
          if (key === 'showMoves') this.renderMoveList();
          if (key === 'scenario') {
            this.props.reset(this.settings.scenario !== 'boss');
            this.panel.querySelectorAll('[data-scenario]').forEach((c) => c.classList.toggle('on', (c as HTMLElement).dataset.scenario === s.scenario));
          }
          if (key === 'scenario' || key === 'targetHp' || key === 'enemyDamage') this.resetFight();
          this.player.invulnerable = s.immortal;
          this.persist();
        })
    );
    this.panel.querySelectorAll<HTMLSelectElement>('[data-move]').forEach(
      (el) =>
        (el.onchange = () => {
          this.player.equip.moves[Number(el.dataset.move)] = el.value || null;
          events.emit('equipmentChanged', {});
          this.persist();
        })
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
            case 'start':
              if (this.tab === 'bosses') void this.deployBoss();
              else this.openControls(false);
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
        })
    );
  }
}

const fmtTime = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
