import * as THREE from 'three';
import { heightAt } from '../../world/terrain';
import { Bandit, Bolts } from '../bandit';
import { ForestCreature, type ForestKind, type Affliction } from './forestCreature';
import { BlightedElder } from './blightedElder';
import { forestLayer, SITES, type Layer } from '../../world/elves/elvenForestData';
import { events } from '../../core/events';
import type { Look } from '../../npc/charBuilder';
import type { Player } from '../../player/player';
import type { FX } from '../../fx/particles';

// What hunts in the elven woods, and where (docs/design/verdant-elves.md §7):
//   the charcoal burners in the old pits of the Outer Forest (a camp that
//   fills when you come near and empties a while after it's cleared);
//   the wild things of each layer, a few at a time around you (foxes,
//   spiders and wisps in the Inner Forest; treants' kin, spiders and, at
//   night, giant moths in the Ancient Forest); the spiders at Silverbough's
//   spring and the brood-mother in her hollow while their quests want them;
//   treants woken by an axe; and the Blighted Elder in the oldest grove.

export interface ThreatHooks {
  toast(msg: string): void;
  bossBar(t: { hp: number; maxHp: number; alive: boolean } | null, name?: string): void;
  flags: Record<string, boolean | number | string>;
  hour(): number;
  /** is a quest signal wanted (the spring's spiders, the brood-mother) */
  wants(id: string): boolean;
  isActive(quest: string): boolean;
  addGold(n: number): void;
  save(): void;
}

const BURNER_LOOKS: Look[] = [
  { body: 'male', outfit: 'ranger', hood: true, hair: 'buzzed', beard: true, hairColor: 0x2a1a10, skin: 0xc8a080, cloth: 0x2a2620, height: 1.8 },
  { body: 'female', outfit: 'ranger', hood: true, hair: 'long', hairColor: 0x1a1410, skin: 0xa8744e, cloth: 0x3a3028, height: 1.7 },
];
const GANT_LOOK: Look = { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x1a1410, skin: 0xb88a6a, cloth: 0x1a1612, pauldron: true, bracers: true, height: 1.9 };

const RESPAWN = 420;

export class ForestThreats {
  burners: Bandit[] = [];
  creatures: ForestCreature[] = [];
  elder: BlightedElder | null = null;
  /** sleeping treants by tree id (woken by an axe) */
  readonly treants = new Map<string, ForestCreature>();
  private bolts: Bolts;
  private clearedPits = -1e9;
  private t = 0;
  private wildT = 0;
  private bossShown: string | null = null;
  /** the player's current slow (webs, moth dust) */
  slowLeft = 0;
  slowK = 1;
  reel = 0;

  constructor(private scene: THREE.Scene, private fx: FX, private hooks: ThreatHooks) {
    this.bolts = new Bolts(scene);
    events.on('enemyDied', ({ kind }) => {
      if (kind === 'blightedElder') {
        this.hooks.flags['elves:elderDead'] = true;
        events.emit('deed', { id: 'boss:blightedElder', renown: 2, label: 'Felled the Blighted Elder of the oldest grove' });
        this.hooks.toast('The Blighted Elder shudders and falls still. The rot drains out of the grove like a tide going out.');
        this.hooks.save();
      }
    });
  }

  stats() {
    return { burners: this.burners.filter((b) => !b.dead).length, creatures: this.creatures.filter((c) => c.alive).length, elder: this.elder?.alive ?? false, phase: this.elder?.phase ?? 0 };
  }

  private spawnBurners() {
    const [x, z] = SITES.pits;
    const roles: ('chief' | 'sword' | 'crossbow')[] = ['chief', 'sword', 'sword', 'crossbow', 'sword'];
    roles.forEach((role, i) => {
      const a = (i / roles.length) * Math.PI * 2;
      const r = i === 0 ? 3 : 10;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const b = new Bandit(role, new THREE.Vector3(px, heightAt(px, pz) + 0.3, pz), this.scene, this.bolts, undefined, i === 0 ? GANT_LOOK : BURNER_LOOKS[i % 2]);
      b.kind = role === 'chief' ? 'charcoalChief' : 'charcoalBurner';
      b.name = role === 'chief' ? 'Gant the Burner' : 'Charcoal Burner';
      this.burners.push(b);
    });
  }

  /** A creature of the woods (also used by quests and tests). */
  spawn(kind: ForestKind, x: number, z: number) {
    const c = new ForestCreature(kind, new THREE.Vector3(x, heightAt(x, z), z), this.scene, this.fx);
    this.creatures.push(c);
    return c;
  }

  /** The Blighted Elder takes its place in the grove (while it lives). */
  spawnElder() {
    if (this.elder || this.hooks.flags['elves:elderDead']) return this.elder;
    const [x, z] = SITES.elderGrove;
    this.elder = new BlightedElder(new THREE.Vector3(x, 0, z), this.scene, this.fx);
    this.elder.onPhase = (p) => this.hooks.toast(p === 2 ? 'The Elder splits its bark and the blight pours out: sprouts claw up from the rot.' : 'With a scream of tearing roots the Elder pulls itself out of the earth.');
    return this.elder;
  }

  /** A sleeping treant stands where a marked tree is (it wakes when cut). */
  sleeper(id: string, at: THREE.Vector3) {
    let t = this.treants.get(id);
    if (t) return t;
    t = new ForestCreature('treant', at, this.scene, this.fx);
    t.dormant = true;
    t.lockable = false;
    this.treants.set(id, t);
    this.creatures.push(t);
    return t;
  }

  /** Fill the pits now (tests). */
  fillPits() {
    if (!this.burners.length) this.spawnBurners();
  }

  update(dt: number, player: Player) {
    this.t += dt;
    const p = player.pos;
    const dist = (c: readonly [number, number]) => Math.hypot(p.x - c[0], p.z - c[1]);
    const pits = dist(SITES.pits);
    if (!this.burners.length && pits < 170 && pits > 40 && this.t - this.clearedPits > RESPAWN) this.spawnBurners();
    for (const b of this.burners) b.update(dt, player);
    this.bolts.update(dt, player);
    const before = this.burners.length;
    for (const b of this.burners) if (b.dead) b.dispose();
    this.burners = this.burners.filter((b) => !b.dead);
    if (before && !this.burners.length) this.clearedPits = this.t;
    if (pits > 380 && this.burners.length) {
      for (const b of this.burners) b.dispose();
      this.burners = [];
    }

    // The wild things of each layer, a few at a time around the player.
    const layer = forestLayer(p.x, p.z);
    this.wildT -= dt;
    if (this.wildT <= 0) {
      this.wildT = 6;
      this.wild(layer, p);
    }
    // Quest nests: the spring's spiders, the brood-mother.
    if (this.hooks.isActive('the-guides-token') && dist(SITES.spring) < 120 && !this.creatures.some((c) => c.alive && c.home.distanceTo(new THREE.Vector3(SITES.spring[0], c.home.y, SITES.spring[1])) < 30)) {
      for (let k = 0; k < 5; k++) this.spawn('forestSpider', SITES.spring[0] + Math.cos(k * 1.3) * 9, SITES.spring[1] + Math.sin(k * 1.3) * 9);
    }
    if (this.hooks.isActive('webs-in-the-spring') && dist(SITES.spiderHollow) < 140 && !this.creatures.some((c) => c.kind === 'spiderQueen')) {
      this.spawn('spiderQueen', SITES.spiderHollow[0], SITES.spiderHollow[1]);
      for (let k = 0; k < 3; k++) this.spawn('forestSpider', SITES.spiderHollow[0] + Math.cos(k * 2) * 10, SITES.spiderHollow[1] + Math.sin(k * 2) * 10);
    }
    // The Blighted Elder holds the oldest grove until it is felled.
    const grove = dist(SITES.elderGrove);
    if (!this.elder && grove < 220 && !this.hooks.flags['elves:elderDead']) this.spawnElder();
    if (this.elder) {
      this.elder.update(dt, player);
      for (const s of this.elder.sprouts) s.update(dt, player);
      for (const s of this.elder.sprouts.filter((x) => x.dead)) s.dispose();
      this.elder.sprouts = this.elder.sprouts.filter((x) => !x.dead);
      if (this.elder.dead || (grove > 420 && this.elder.alive)) {
        this.elder.dispose();
        this.elder = null;
      }
    }

    for (const c of this.creatures) c.update(dt, player);
    // What the creatures did to the player: webs slow, moth dust makes you reel, foxes steal.
    for (const c of this.creatures) {
      const a: Affliction | null = c.inflicted;
      if (!a) continue;
      c.inflicted = null;
      if (c.kind === 'spiritFox' && c.stolen) {
        this.hooks.addGold(-c.stolen);
        this.hooks.toast(`The spirit fox snatches ${c.stolen} gold from your purse and bolts!`);
      } else if (a.seconds) {
        this.slowLeft = Math.max(this.slowLeft, a.seconds);
        this.slowK = Math.min(this.slowK, a.slow);
        if (a.reel) this.reel = a.seconds;
        this.hooks.toast(a.reel ? 'The moth’s dust fills your eyes; the trees swim.' : 'Sticky web clings to your legs.');
      }
    }
    // A thief caught gives back what it stole.
    for (const c of this.creatures) if (!c.alive && c.stolen && c.dead === false && c.hp <= 0) {
      this.hooks.addGold(c.stolen);
      this.hooks.toast(`You get back the ${c.stolen} gold the fox took.`);
      c.stolen = 0;
    }
    const gone = this.creatures.filter((c) => c.dead || (c.home.distanceTo(new THREE.Vector3(p.x, c.home.y, p.z)) > 320 && !c.dormant) || (c.dormant && c.home.distanceTo(new THREE.Vector3(p.x, c.home.y, p.z)) > 600));
    for (const c of gone) {
      c.dispose();
      for (const [id, t] of this.treants) if (t === c) this.treants.delete(id);
    }
    this.creatures = this.creatures.filter((c) => !gone.includes(c));

    // Slowed by webs.
    if (this.slowLeft > 0) {
      this.slowLeft -= dt;
      this.reel = Math.max(0, this.reel - dt);
      player.mods.moveSpeed *= this.slowK;
      if (this.slowLeft <= 0) this.slowK = 1;
    }

    // Boss bars: the Elder, the brood-mother, Gant, a woken treant.
    const near = (t: { position: THREE.Vector3 } | null | undefined, r: number) => !!t && t.position.distanceTo(p) < r;
    const queen = this.creatures.find((c) => c.kind === 'spiderQueen' && c.alive);
    const gant = this.burners.find((b) => b.kind === 'charcoalChief' && !b.dead);
    const show = this.elder?.alive && near(this.elder, 40) ? 'elder' : queen && near(queen, 26) ? 'queen' : gant && near(gant, 26) ? 'gant' : null;
    if (show === 'elder') this.hooks.bossBar(this.elder!, 'The Blighted Elder');
    else if (show === 'queen') this.hooks.bossBar(queen!, 'The Brood-Mother of the Hollow');
    else if (show === 'gant') this.hooks.bossBar(gant!, 'Gant the Burner');
    else if (this.bossShown) this.hooks.bossBar(null);
    this.bossShown = show;
  }

  /** Top up the wild things around the player for this layer and hour. */
  private wild(layer: Layer | null, p: THREE.Vector3) {
    const alive = this.creatures.filter((c) => c.alive && !c.dormant).length;
    if (!layer || layer === 'outer' || layer === 'deep' || alive >= 4) return;
    // Not on the Oldest Way or the road (the elves keep them clear), not in villages.
    if (Math.hypot(p.x - SITES.silverbough[0], p.z - SITES.silverbough[1]) < 140) return;
    const h = this.hooks.hour();
    const night = h >= 20.5 || h < 5;
    const pool: ForestKind[] = layer === 'inner' ? ['spiritFox', 'forestSpider', 'wisp', 'forestSpider'] : night ? ['giantMoth', 'forestSpider', 'wisp', 'giantMoth'] : ['forestSpider', 'wisp', 'forestSpider', 'spiritFox'];
    const kind = pool[Math.floor(Math.random() * pool.length)];
    const a = Math.random() * Math.PI * 2, d = 45 + Math.random() * 35;
    const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
    if (forestLayer(x, z) !== layer || heightAt(x, z) < 0) return;
    this.spawn(kind, x, z);
    if (kind === 'forestSpider' && Math.random() < 0.5) this.spawn('forestSpider', x + 3, z + 2);
  }

  clear() {
    for (const b of this.burners) b.dispose();
    this.burners = [];
    for (const c of this.creatures) c.dispose();
    this.creatures = [];
    this.treants.clear();
    this.elder?.dispose();
    this.elder = null;
    this.bolts.clear();
    this.clearedPits = -1e9;
    this.slowLeft = 0;
    this.slowK = 1;
    if (this.bossShown) this.hooks.bossBar(null);
    this.bossShown = null;
  }
}
