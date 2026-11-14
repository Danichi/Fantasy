import * as THREE from 'three';
import { Bandit, Bolts } from '../enemies/bandit';
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
import { SandboxTarget } from './target';
import { sandboxBuild, buildMoves, COMBAT_STYLES, MAGIC_SCHOOLS, refill } from './hero';
import { readSandboxSettings, saveSandboxSettings, type Scenario } from './settings';

const CSS = `
.sandbox-panel label:has(input[type=checkbox]){flex-wrap:nowrap;align-items:flex-start;line-height:1.4}.sandbox-panel input[type=checkbox]{flex:none;margin:2px 0}
.sandbox-badge output{white-space:pre-line}
body.in-sandbox :is(.quest-tracker,.wmini,.compass,.waypoint,.region-card,.book-button){display:none!important}
.sandbox-badge{position:fixed;left:18px;top:18px;z-index:35;color:#e0e8f0;background:#111820eb;border:1px solid #546579;border-radius:6px;padding:10px 14px;font:12px Inter,sans-serif;max-width:320px}.sandbox-badge b{display:block;font-size:15px;margin-bottom:5px}.sandbox-badge button{pointer-events:auto;margin-top:7px}.sandbox-badge output{display:block;color:#b9cfad;line-height:1.6;margin-top:5px}
.sandbox-panel{position:fixed;inset:0;background:#080b10e8;z-index:110;display:grid;place-items:center;pointer-events:auto;color:#e7edf4;font:13px Inter,sans-serif}.sandbox-panel[hidden]{display:none}.sandbox-panel article{width:min(880px,calc(100vw - 32px));max-height:calc(100vh - 30px);overflow:auto;background:#151c25;border:1px solid #62788e;padding:20px;box-sizing:border-box;border-radius:8px}.sandbox-panel h2{margin:0 0 8px}.sandbox-panel h3{font-size:14px;color:#d9c392;margin:18px 0 10px}.sandbox-panel p{color:#b7c7d7;line-height:1.5}.sandbox-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}.sandbox-panel label{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.sandbox-panel select,.sandbox-panel input[type=number],.sandbox-panel input[type=search]{max-width:100%;box-sizing:border-box;padding:6px;background:#0d1218;color:#e7edf4;border:1px solid #61758b;border-radius:3px}.sandbox-panel select{width:100%}.sandbox-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.sandbox-panel button,.sandbox-badge button{padding:7px 12px;color:#f1e4c2;background:#253549;border:1px solid #6a7f95;border-radius:4px;cursor:pointer}.sandbox-panel button:hover,.sandbox-badge button:hover{background:#344d66}.sandbox-panel .sandbox-close{float:right;position:sticky;top:0;z-index:1}.sandbox-moves label{display:block}.sandbox-note{min-height:18px;color:#b9d7ab}
`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
type Actor = Bandit | SandboxTarget;
export class SandboxArena {
  readonly settings = readSandboxSettings();
  readonly panel: HTMLDivElement;
  readonly actors: Actor[] = [];
  readonly bolts: Bolts;
  private badge: HTMLDivElement;
  private deadTime = 0;
  private respawnTime = 0;
  private clock = 0;
  private badgeText = '';
  metrics = { damage: 0, hits: 0, peak: 0, parries: 0, dodges: 0 };
  private firstHit = -1;
  constructor(
    private scene: THREE.Scene,
    readonly player: Player,
    private rt: SkillRuntime,
    private it: Interior,
    private cam: ThirdPersonCamera,
    private input: Input,
    private hooks: { save(): void; toggle(open: boolean): void; debug(): void; clearEffects(): void; leave(): void },
  ) {
    it.interactables.length = 0;
    this.bolts = new Bolts(scene);
    document.body.classList.add('in-sandbox');
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.badge = document.createElement('div');
    this.badge.className = 'sandbox-badge';
    this.badge.innerHTML =
      '<b>SANDBOX · COMBAT LAB</b><span>Separate save · I equipment · K skills<br>F6 controls · F7 reset · F8 speed · F9 hitboxes</span><output></output><button type="button">Sandbox controls</button>';
    document.body.append(this.badge);
    this.badge.querySelector('button')!.onclick = () => this.openControls();
    this.panel = document.createElement('div');
    this.panel.className = 'sandbox-panel';
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
    });
    events.on('parrySuccess', (e) => {
      if (e.perfect) this.metrics.parries++;
    });
    events.on('perfectDodge', () => this.metrics.dodges++);
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
  spawn(scenario: Scenario = this.settings.scenario) {
    this.clearTargets();
    this.settings.scenario = scenario;
    const count = scenario === 'group' ? 3 : 1;
    for (let i = 0; i < count; i++) {
      const at = this.it.at((i - (count - 1) / 2) * 4, -2);
      if (scenario === 'dummy' || scenario === 'moving') this.actors.push(new SandboxTarget(this.scene, at, this.settings.targetHp, () => true, scenario === 'moving'));
      else {
        const b = new Bandit(scenario === 'ranged' ? 'crossbow' : 'sword', at, this.scene, this.bolts);
        b.name = b.label = scenario === 'ranged' ? 'Sandbox crossbow' : 'Sandbox sparring partner';
        b.kind = 'sandboxOpponent';
        b.level = 50;
        b.maxHp = b.hp = this.settings.targetHp;
        b.hitDamage = this.settings.enemyDamage;
        b.postureMax = 240;
        b.poiseMax = 80;
        b.alerted = true;
        b.nonLethal = false;
        if (scenario !== 'ranged') {
          const ids = this.settings.drill === 'sequence' ? ['cut', 'delayed', 'lunge'] : [this.settings.drill];
          b.brain.setMoves(this.settings.drill === 'free' ? UAL_MOVES : ids.flatMap((id) => UAL_MOVES.filter((m) => m.id === id)));
          b.brain.practiceSequence = this.settings.drill !== 'free';
        }
        this.actors.push(b);
      }
    }
    this.persist();
  }
  resetFight() {
    this.player.yaw = Math.PI;
    this.player.respawn(this.it.spawn.clone().setY(this.it.spawn.y + 0.3));
    this.cam.yaw = Math.PI;
    this.cam.snapTo(this.player.pos);
    this.rt.reset();
    this.player.invulnerable = this.settings.immortal;
    this.spawn();
    this.metrics = { damage: 0, hits: 0, peak: 0, parries: 0, dodges: 0 };
    this.firstHit = -1;
    this.deadTime = 0;
  }
  update(dt: number) {
    this.clock += dt;
    const p = this.player;
    p.invulnerable = this.settings.immortal;
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
    if (this.settings.autoReset && this.actors.length && this.actors.every((a) => !a.alive)) {
      this.respawnTime += dt;
      if (this.respawnTime > 2) this.spawn();
    }
    if (Math.abs(p.pos.x - this.it.spawn.x) > 27 || Math.abs(p.pos.z - this.it.at(0, 0).z) > 27 || p.pos.y < this.it.spawn.y - 4)
      this.resetFight();
  }
  /** Live phase labels read gameplay state even while a practice frame is paused. */
  frame() {
    const p = this.player;
    const focus = this.player.lock ?? this.actors.find((a) => a.alive);
    const read = focus ? peekCombat(focus)?.read : null;
    const distance = focus ? Math.max(0, focus.position.distanceTo(p.pos) - focus.radius).toFixed(1) + ' m to target' : 'No target';
    const playerPhase = p.combatPhase;
    const detail = `${Math.round(this.settings.speed * 100)}% speed · ${distance} · ${p.combatReach.toFixed(1)} m weapon reach · ${Math.round(p.inputLatency * 1000)} ms queued`;
    const phase = read
      ? `${read.name}: ${PHASE_LABEL[read.phase]}`
      : playerPhase
        ? `Your ${p.act!.def.id}: ${PHASE_LABEL[playerPhase]}`
        : 'Space: combat step · Shift + Space: roll';
    const m = this.metrics,
      seconds = Math.max(1, this.clock - this.firstHit);
    const text = `${detail}\n${phase}\n${m.hits} hits · ${Math.round(m.damage)} damage · ${this.firstHit < 0 ? 0 : Math.round(m.damage / seconds)} DPS\nPeak ${Math.round(m.peak)} · perfect parries ${m.parries} · dodges ${m.dodges}`;
    if (text !== this.badgeText) {
      this.badgeText = text;
      this.badge.querySelector('output')!.textContent = text;
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
        '<option value="">Empty slot</option>' +
        moves.map((m) => `<option value="${esc(m.ref)}"${m.ref === selected ? ' selected' : ''}>${esc(m.name)}</option>`).join('');
    this.panel.innerHTML = `<article><button class="sandbox-close" data-action="resume">Resume · F6 / Esc</button><h2>Sandbox</h2><p>A plain arena for trying the real combat systems. This character, equipment and settings have their own save. Your adventure stays separate.</p><h3>Build</h3><p>Every combat class is level 50. Pick a style and a magic school to unlock their complete movesets at maximum rank. Switching builds resets the fight.</p><div class="sandbox-grid"><label>Combat style<select data-setting="combat">${options(COMBAT_STYLES, s.combat)}</select></label><label>Magic school<select data-setting="magic"><option value="">None</option>${options(MAGIC_SCHOOLS, s.magic)}</select></label></div><h3>Moves · use Tab to show the moves bar</h3><div class="sandbox-grid sandbox-moves">${Array.from({ length: 6 }, (_, i) => `<label>Slot ${i + 1}<select data-move="${i}">${moveOptions(this.player.equip.moves[i])}</select></label>`).join('')}</div><p>Weapon and target requirements still apply. I opens equipment; K opens the normal skill trees.</p><h3>Equipment</h3><div class="sandbox-grid"><input type="search" placeholder="Find a weapon, spell or armour…" aria-label="Find Sandbox equipment" data-gear-search><select aria-label="Sandbox equipment" data-gear></select></div><div class="sandbox-actions"><button data-action="grant">Add selected item to inventory</button><button data-action="refill">Refill health, mana, stamina and armour</button></div><h3>Combat practice</h3><p>Space quicksteps while locked on. Shift + Space rolls. Attacks show preparation, commitment, strike and recovery.</p><div class="sandbox-grid"><label>Practice speed<select data-setting="speed">${[1, 0.5, 0.25].map((v) => `<option value="${v}"${s.speed === v ? ' selected' : ''}>${v * 100}%</option>`).join('')}</select></label><label>Enemy drill<select data-setting="drill"><option value="free"${s.drill === 'free' ? ' selected' : ''}>Normal AI</option><option value="sequence"${s.drill === 'sequence' ? ' selected' : ''}>Repeat: cut, held strike, lunge</option>${UAL_MOVES.map((m) => `<option value="${m.id}"${s.drill === m.id ? ' selected' : ''}>Repeat: ${esc(moveName(m))}</option>`).join('')}</select></label></div><div class="sandbox-actions"><button data-action="duel">Reference duel · real costs</button><button data-action="lesson">Read the tell · unlimited practice</button></div><h3>Opponents</h3><p>Stationary targets stay alive for damage testing. Living opponents can be defeated and replaced.</p><div class="sandbox-grid"><label>Encounter<select data-setting="scenario">${options(
      [
        { id: 'dummy', name: 'Stationary target' },
        { id: 'moving', name: 'Moving range target' },
        { id: 'melee', name: 'Melee partner' },
        { id: 'ranged', name: 'Crossbow opponent' },
        { id: 'group', name: 'Three melee opponents' },
      ],
      s.scenario,
    )}</select></label><label>Target health<input data-setting="targetHp" type="number" min="100" max="10000000" value="${s.targetHp}"></label><label>Enemy damage<input data-setting="enemyDamage" type="number" min="1" max="10000" value="${s.enemyDamage}"></label></div><h3>Practice rules</h3><div class="sandbox-grid">${(
      [
        ['footprints', 'Show actual attack footprints'],
        ['immortal', 'Player takes no damage'],
        ['unlimited', 'Unlimited mana and stamina'],
        ['instantCooldowns', 'Instant technique cooldowns'],
        ['enemyAI', 'Opponents attack'],
        ['autoReset', 'Replace defeated opponents'],
      ] as const
    )
      .map(([key, label]) => `<label><input type="checkbox" data-setting="${key}" ${s[key] ? 'checked' : ''}>${label}</label>`)
      .join(
        '',
      )}</div><div class="sandbox-actions"><button data-action="reset">Reset fight · F7</button><button data-action="clear">Clear opponents</button><button data-action="debug">Toggle combat hitboxes · F9</button><button data-action="leave">Save Sandbox & return to adventure</button></div><p class="sandbox-note" role="status"></p></article>`;
    this.panel.querySelectorAll<HTMLSelectElement | HTMLInputElement>('[data-setting]').forEach(
      (el) =>
        (el.onchange = () => {
          const key = el.dataset.setting as keyof typeof s;
          if (key === 'combat' || key === 'magic') {
            this.changeBuild(key === 'combat' ? el.value : s.combat, key === 'magic' ? el.value : s.magic);
            this.renderPanel();
            return;
          }
          if (key === 'speed') { s.speed = Number(el.value); this.persist(); return; }
          if (key === 'drill') { s.drill = el.value; this.spawn(); return; }
          if (key === 'targetHp' || key === 'enemyDamage') {
            const n = Number(el.value);
            if (!Number.isFinite(n)) return;
            s[key] = Math.round(Math.max(key === 'targetHp' ? 100 : 1, Math.min(key === 'targetHp' ? 10000000 : 10000, n)));
            el.value = String(s[key]);
          } else if (key === 'scenario') s.scenario = el.value as Scenario;
          else (s[key] as boolean) = (el as HTMLInputElement).checked;
          if (['scenario', 'targetHp', 'enemyDamage'].includes(key)) this.spawn();
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
