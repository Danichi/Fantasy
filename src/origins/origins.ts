import * as THREE from 'three';
import { events } from '../core/events';
import type { Player } from '../player/player';
import type { Input } from '../core/input';
import type { ThirdPersonCamera } from '../player/camera';
import type { SkillRuntime } from '../paths/skills';
import type { FX } from '../fx/particles';
import { DISC } from '../paths/data';
import { XP_FOR_KIND, type Origin } from '../progression/progression';
import { insideWalls } from '../world/capitalCity';
import { ORIGINS, REACTIONS, cleanLook, defaultLook, type OriginLook } from './data';
import { Legacy } from './legacy';
import { heroBody, setHeroLook } from './hero';
import { OriginAbilities } from './abilities';
import { Flight } from './flight';
import { Forms } from './forms';

// The origins runtime (docs/design/origins.md): who you are and what that
// gives you. Every step it lays your people's passives over the combat
// modifiers the skill runtime has just written (regeneration, poise, fire
// resistance, speed), runs the legendary abilities, flight and forms, and
// every frame it animates the body's parts and the senses (glints, night
// sight, the beasts and the wounded you can smell).

export interface OriginsDeps {
  player: Player;
  rt: SkillRuntime;
  fx: FX;
  scene: THREE.Scene;
  input: Input;
  cam: ThirdPersonCamera;
  toast(msg: string): void;
  /** 'overworld' | 'dungeon' | 'interior' */
  mode(): string;
  /** 0 day .. 1 deep night (overworld) */
  night(): number;
  /** region id where the player stands */
  region(): string;
  /** the Gravewood's curse 0..1 */
  curse(): number;
  /** storm strength 0..1 */
  storm(): number;
  /** main-story quest title by id (null for side quests) */
  mainQuestTitle(id: string): string | null;
  /** quest reward XP by id */
  questXp(id: string): number;
  /** herb nodes, ore veins, secret doors near the player */
  senses(): { herbs: THREE.Vector3[]; ore: THREE.Vector3[]; secrets: THREE.Vector3[] };
  /** live enemies to show (Feral Senses, Bloodscent) */
  foes(): { center: THREE.Vector3; hp: number; maxHp: number; alive: boolean; kind: string }[];
}

const FOREST_REGIONS = new Set(['verdantElves', 'deepWilderness', 'emeraldIsles']);

export class Origins {
  readonly legacy: Legacy;
  readonly abilities: OriginAbilities;
  readonly flight: Flight;
  readonly forms: Forms;
  readonly player: Player;
  /** origin-only perks other systems may read (crafting, afflictions) */
  readonly perks = { forgemaster: 0, poisonImmune: false, runeheart: false };
  private nightLight = new THREE.AmbientLight(0x9fb4d8, 0);
  private glintT = 0;
  private markers: THREE.Sprite[] = [];
  private markerMats: Record<'beast' | 'blood', THREE.SpriteMaterial>;
  private greeted = new Set<string>();
  private secondWind = { used: false, quiet: 99 };
  private rebuilding: Promise<void> | null = null;

  constructor(readonly d: OriginsDeps) {
    this.player = d.player;
    const p = d.player;
    this.legacy = new Legacy(p.prog, p.paths);
    this.legacy.listen((id) => d.mainQuestTitle(id));
    this.legacy.onDeed = (label, r, up) => {
      d.toast(`Great deed: ${label} · +${r} Renown`);
      if (up) {
        d.toast(`Legendary Hero ${up}: ${this.def.tree[up - 1].name} awakens (K)`);
        events.emit('originAbility', { origin: this.origin, ability: `Legend ${up}` });
      }
    };
    this.legacy.sync();
    this.abilities = new OriginAbilities(this);
    this.flight = new Flight(this);
    this.forms = new Forms(this);
    d.scene.add(this.nightLight);
    const dot = (color: string, paw: boolean) => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      g.fillStyle = color;
      if (paw) {
        g.beginPath(); g.ellipse(32, 40, 13, 11, 0, 0, Math.PI * 2); g.fill();
        for (const [x, y] of [[16, 22], [27, 15], [38, 15], [49, 22]]) { g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill(); }
      } else {
        g.beginPath(); g.moveTo(32, 6); g.quadraticCurveTo(52, 34, 32, 58); g.quadraticCurveTo(12, 34, 32, 6); g.fill();
      }
      return new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true, opacity: 0.85 });
    };
    this.markerMats = { beast: dot('#e8c070', true), blood: dot('#e03a2a', false) };

    // Heroic Adaptation (human): +15% of the XP the world pays out.
    const bonusXp = (n: number) => {
      if (this.origin === 'human' && n > 0) p.prog.addXp(Math.max(1, Math.round(n * 0.15)));
    };
    events.on('enemyDied', ({ kind }) => bonusXp(XP_FOR_KIND[kind]?.[0] ?? 0));
    events.on('placeDiscovered', () => bonusXp(25));
    events.on('questChanged', ({ id, status }) => status === 'done' && bonusXp(d.questXp(id)));
    // ...and one more tree point in each combat class every 5 character levels.
    p.paths.bonusPoints = (id) => (this.origin === 'human' && DISC[id]?.fam === 'combat' ? Math.floor(p.paths.charLevel / 5) : 0);
    // Second Wind (human): once per fight, at 20% health.
    events.on('playerDamaged', () => {
      this.secondWind.quiet = 0;
      if (this.origin !== 'human' || this.secondWind.used || p.dead || p.hp <= 0 || p.hp > p.maxHp * 0.2) return;
      this.secondWind.used = true;
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.25);
      events.emit('originAbility', { origin: 'human', ability: 'Second Wind' });
    });
    // A loaded save or a test reset: keep the discipline level and the body in step with the save.
    events.on('progressChanged', () => this.legacy.sync());
  }

  get origin(): Origin {
    return this.player.prog.origin;
  }
  get def() {
    return ORIGINS[this.origin];
  }
  get look(): OriginLook {
    return this.player.prog.look ?? defaultLook(this.origin);
  }

  // ---- the look ---------------------------------------------------------------------------

  /** Become this look (and its origin): the body is rebuilt with its parts. */
  async setLook(raw: Partial<OriginLook> & { origin: Origin }) {
    const look = cleanLook(raw, raw.origin);
    const p = this.player;
    this.forms.endAll();
    this.flight.reset();
    p.prog.origin = look.origin;
    p.prog.look = look;
    setHeroLook(p, look);
    const job = p.rebuildBody();
    this.rebuilding = job;
    await job;
    if (this.rebuilding === job) this.rebuilding = null;
    events.emit('equipmentChanged', {});
    events.emit('progressChanged', {});
  }

  /** A whole new origin with its default look. */
  setOrigin(origin: Origin) {
    return this.setLook({ ...defaultLook(origin, this.look.body), name: this.look.name, origin });
  }

  /** Does the hero's body match the saved look (after a load or test reset)? */
  bodyMatches() {
    return JSON.stringify(heroBody.look) === JSON.stringify(this.look);
  }

  /** Tests: back to boot state (abilities, flight, forms, the body if it changed). */
  async resetForTest() {
    this.abilities.reset();
    this.flight.reset();
    this.forms.endAll();
    this.secondWind = { used: false, quiet: 99 };
    this.greeted.clear();
    if (this.rebuilding) await this.rebuilding;
    if (!this.bodyMatches()) await this.setLook(this.look);
    this.legacy.sync();
  }

  // ---- reactions ---------------------------------------------------------------------------

  /** The faction of the region you're in (REGIONS), for NPC lines and prices. */
  private faction: () => string = () => 'cresha';
  setFaction(f: () => string) {
    this.faction = f;
  }

  /** The first time someone speaks to you, they may react to what you are. */
  greet(speaker: string, text: string) {
    const r = REACTIONS[this.origin];
    if (!r || this.greeted.has(speaker) || /^(the |a |an )|sign|notice|board|stone|cabin|chest|grave|post|log|map/i.test(speaker)) return text;
    const line = r.lines[this.faction()];
    this.greeted.add(speaker);
    return line ? `${line} ${text}` : text;
  }

  /** Price nudge where your people are liked or feared. */
  priceFactor() {
    return REACTIONS[this.origin]?.prices[this.faction()] ?? 1;
  }

  // ---- simulation -----------------------------------------------------------------------------

  /** Called by the player each step while in the air or landing (origins/flight.ts). */
  flightStep(dt: number, input: Input, cam: ThirdPersonCamera) {
    this.flight.step(dt, input, cam);
  }

  /** Why you can't fly here, or null. */
  noFly(): string | null {
    const d = this.d, p = this.player;
    if (d.mode() !== 'overworld') return 'There is no sky down here.';
    if (d.curse() > 0.2) return 'The Gravewood\'s curse drags at your wings.';
    if (insideWalls(p.pos.x, p.pos.z, -40)) return 'The capital\'s wardstones pull you to the ground.';
    return null;
  }

  /** One fixed step, after the skill runtime has written the combat modifiers. */
  update(dt: number) {
    const p = this.player, m = p.mods, o = this.origin;
    // Defaults every step; passives and buffs below lay their changes on top.
    p.poiseMul = 1;
    p.poiseFlat = 0;
    p.fireResist = 0;
    p.lockRange = 24;
    p.staggerImmune = false;
    this.perks.forgemaster = o === 'dwarf' ? 0.15 : 0;
    this.perks.poisonImmune = o === 'dwarf';
    this.perks.runeheart = o === 'dwarf' && this.legacy.open(2);
    this.secondWind.quiet += dt;
    if (this.secondWind.quiet > 20) this.secondWind.used = false;
    const baseHp = 120 + p.paths.bonusHp + (p.equip?.bonus('maxHp') ?? 0);
    if (o === 'elf') {
      m.manaRegen += 0.3;
      if (FOREST_REGIONS.has(this.d.region()) || this.d.curse() > 0.05) m.moveSpeed += 0.2;
    } else if (o === 'dwarf') {
      p.poiseMul = 1.25;
      p.poiseFlat = 6;
    } else if (o === 'beastfolk') {
      if (p.sprinting) m.moveSpeed += 0.12;
    } else if (o === 'demon') {
      if (!p.dead) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.01 * dt);
      p.fireResist = 0.4;
    } else if (o === 'dragonkin') {
      p.fireResist = 0.5;
      m.hp += Math.round(baseHp * 0.1);
      p.poiseMul = 1.1;
      p.lockRange = 24 * 1.3;
    }
    this.abilities.update(dt, m);
    this.forms.update(dt, m);
    m.dmgTaken = Math.max(0, m.dmgTaken);
    m.moveSpeed = Math.max(0, m.moveSpeed);
  }

  // ---- presentation ---------------------------------------------------------------------------

  /** Once per rendered frame (after the player has posed). */
  frame(dt: number) {
    const p = this.player, o = this.origin, d = this.d;
    const speed = Math.hypot(p.vel.x, p.vel.z);
    this.flight.frame(dt);
    heroBody.parts?.update(dt, { spread: this.flight.spread, flap: this.flight.flapPhase, speed });
    this.forms.frame(dt);
    this.abilities.frame(dt);
    // Night sight (beastfolk, demon): the dark is lighter.
    const sees = o === 'beastfolk' || o === 'demon';
    const dark = d.mode() === 'overworld' ? d.night() : d.mode() === 'dungeon' ? 1 : 0.4;
    this.nightLight.intensity = sees ? 0.9 * dark : 0;
    // Keen Sight (elf) and Deep Sense (dwarf): glints.
    this.glintT -= dt;
    if (this.glintT <= 0 && (o === 'elf' || o === 'dwarf')) {
      this.glintT = 1.1;
      const s = d.senses();
      const pts = o === 'elf' ? [...s.herbs, ...s.secrets] : s.ore;
      const range = o === 'elf' ? 20 : 30;
      for (const at of pts) {
        if (at.distanceTo(p.pos) > range) continue;
        this.d.fx.add.spawn({ pos: at.clone().setY(at.y + 0.5), spread: 0.6, count: 6, life: [0.5, 1], size: [0.16, 0.02], color: o === 'elf' ? 0xe8fff0 : 0xffe0a0, color2: o === 'elf' ? 0x60e0a0 : 0xff9a30, upBias: 0.8, jitter: 0.3 });
      }
    }
    // Feral Senses (beasts nearby) and Bloodscent (the wounded, through walls).
    let n = 0;
    const show = (at: THREE.Vector3, kind: 'beast' | 'blood') => {
      let s = this.markers[n];
      if (!s) {
        s = new THREE.Sprite(this.markerMats.beast);
        s.renderOrder = 999;
        s.scale.setScalar(0.45);
        d.scene.add(s);
        this.markers.push(s);
      }
      s.material = this.markerMats[kind];
      s.visible = true;
      s.position.copy(at).setY(at.y + 1.2);
      n++;
    };
    if (o === 'beastfolk') {
      const blood = this.legacy.open(3);
      for (const f of d.foes()) {
        if (!f.alive || n >= 16) continue;
        const dist = f.center.distanceTo(p.pos);
        if (blood && f.hp < f.maxHp * 0.6 && dist < 30) show(f.center, 'blood');
        else if (dist < 40 && dist > 6 && !/dummy/.test(f.kind)) show(f.center, 'beast');
      }
    }
    for (let i = n; i < this.markers.length; i++) this.markers[i].visible = false;
  }

  /** Extra objects of the hero's body (for the inventory preview layer). */
  get bodyParts() {
    return heroBody.parts?.objects ?? [];
  }
}
