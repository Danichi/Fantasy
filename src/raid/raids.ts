import * as THREE from 'three';
import { heightAt, GATES } from '../world/terrainHeight';
import { events } from '../core/events';
import { sfx } from '../audio/sfx';
import { Wolf, Pack } from '../creatures/wolf/wolf';
import { creatureReady, prepareCreature } from '../creatures/geometryStore';
import { extraFoes, type Foe } from '../creatures/foes';
import { zoneLevel } from '../creatures/population';
import { Watchman, WATCH_LOOKS, BRANNOC_LOOK } from './watchman';
import { Rift } from './rift';
import type { Fauna, Animal, Range } from '../world/fauna';
import type { Creature } from '../creatures/creature';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';
import type { DefenceResult, IncomingAttack, Target } from '../combat/targets';
import type { Look } from '../npc/charBuilder';

// Night raids on Elder Glen. Some nights, once the village knows you, a horn
// sounds from one of the gates: something is coming for the pens. The
// villagers bar their doors; Captain Brannoc and the watch run out to meet
// it. The raid comes in waves, then its leader, with a bar of its own.
//
//   Wolves: grey wolf packs out of the woods, a Pack Leader at the end.
//   The Gloaming: a rift opens in the dark beyond the pens and gloam wolves
//   come through it, out of the Dark, with a Gloam Alpha at the end.
//
// Beat it back for coin, the watch's thanks and, after a few, the Watch's
// Banner. Ignore it and the village counts its losses in the morning: a few
// animals gone and people talking. Nothing that can't be mended.

export type RaidKind = 'wolves' | 'gloam';
/** Elder Glen, or one of the King's Road stops (smaller raids, wolves only) */
export type RaidSite = 'glen' | 'millbrook' | 'rest';

export interface Front {
  id: string;
  site: RaidSite;
  /** what the raiders are after */
  pen: Range;
  penName: string;
  /** where they'd break into the village */
  gate: THREE.Vector2;
  gateName: string;
  /** the alarm (road stops have no horn of their own) */
  alarm?: string;
}

interface SiteDef {
  name: string;
  /** the middle of the settlement: raiders come from the far side of the pen */
  center: THREE.Vector3;
  /** NPC settlement that hides indoors (null: nobody there at night anyway) */
  settlement: string | null;
  /** who turns out: the first is the captain */
  defenders: { name: string; look: Look }[];
  waves: { n: number; leader: boolean }[];
}

const SITES: Record<RaidSite, SiteDef> = {
  glen: {
    name: 'Elder Glen', center: new THREE.Vector3(0, 0, -4), settlement: 'elderGlen',
    defenders: [
      { name: 'Captain Brannoc', look: BRANNOC_LOOK },
      { name: 'Watchman Edric', look: WATCH_LOOKS[0] },
      { name: 'Watchwoman Hale', look: WATCH_LOOKS[1] },
      { name: 'Watchman Tobin', look: WATCH_LOOKS[2] },
      { name: 'Watchman Rusk', look: WATCH_LOOKS[3] },
    ],
    waves: [{ n: 3, leader: false }, { n: 3, leader: false }, { n: 2, leader: true }],
  },
  millbrook: {
    name: 'Millbrook', center: new THREE.Vector3(600, 0, 104), settlement: null,
    defenders: [
      { name: 'Old Garth', look: { body: 'male', outfit: 'ranger', hair: 'simpleparted', beard: true, hairColor: 0xb8b4ae, skin: 0xe0b894, cloth: 0x6a7f3a, hood: true, height: 1.72 } },
      { name: 'Wenna Cole', look: { body: 'female', outfit: 'peasant', hair: 'buns', hairColor: 0x6a4428, skin: 0xe0b894, linen: 0xe8d8b8, cloth: 0x5a6a3a, height: 1.68 } },
      { name: 'Tam Reeve', look: { body: 'male', outfit: 'peasant', hair: 'buzzed', beard: true, hairColor: 0x3a2618, skin: 0xa8744e, linen: 0xd8c8a0, cloth: 0x6a4a2a, height: 1.8 } },
    ],
    waves: [{ n: 2, leader: false }, { n: 2, leader: true }],
  },
  rest: {
    name: "the Wayfarer's Rest", center: new THREE.Vector3(1385, 0, 92), settlement: 'wayfarersRest',
    defenders: [
      { name: 'Sergeant Tove', look: { body: 'female', outfit: 'ranger', hair: 'buns', hairColor: 0x3a2618, skin: 0xa8744e, cloth: 0x3a5f9e, pauldron: true, height: 1.74 } },
      { name: 'Col Dunmore', look: { body: 'male', outfit: 'ranger', hair: 'simpleparted', beard: true, hairColor: 0x6a4428, skin: 0xe0b894, cloth: 0x7a5a3a, height: 1.82 } },
      { name: 'Stablehand Pell', look: { body: 'male', outfit: 'peasant', hair: 'buzzed', beard: false, hairColor: 0x8a3f22, skin: 0xfff0e6, linen: 0xe8d8b8, cloth: 0x5a4a3a, height: 1.74 } },
    ],
    waves: [{ n: 2, leader: false }, { n: 2, leader: true }],
  },
};

export interface RaidSave {
  /** day of the last raid, raids beaten back, banner given */
  last?: number;
  defended?: number;
  banner?: boolean;
  /** the last raid's outcome, for the morning's talk */
  lastWon?: boolean;
  lastLost?: number;
  lastKind?: RaidKind;
  /** no raids before this day (a signal beacon was lit) */
  calmUntil?: number;
  /** where the last raid fell (older saves: Elder Glen) */
  lastSite?: RaidSite;
  /** raids beaten back at the road stops */
  roadDefended?: number;
}

interface Hooks {
  scene: THREE.Scene;
  fx: FX;
  fauna: Fauna;
  toast: (m: string) => void;
  addGold: (n: number) => void;
  give: (id: string, n: number) => void;
  bossBar: (t: { hp: number; maxHp: number; alive: boolean } | null, name?: string) => void;
  /** may raids happen yet (the village knows you) */
  unlocked: () => boolean;
  /** where the player is: raids only play out when you're close */
  playerPos: () => THREE.Vector3;
  /** the player is outdoors in the overworld */
  outdoors: () => boolean;
  /** compass target for the raid */
  mark: (m: { x: number; z: number; label: string } | null) => void;
}

/** One of the raid's living creatures. */
type Raider = Creature & { raider?: boolean; objective?: THREE.Vector3 | null };

/** An animal in a pen, as something raiders can bite. */
class Stock implements Foe {
  readonly kind = 'stock' as const;
  readonly center = new THREE.Vector3();
  hp = 30;
  constructor(readonly animal: Animal, private onKilled: (s: Stock) => void) {}
  get pos() {
    return this.animal.pos;
  }
  get alive() {
    return this.hp > 0;
  }
  strike(att: IncomingAttack): DefenceResult {
    if (this.hp <= 0) return 'dodged';
    this.hp -= att.damage;
    this.animal.state = 'flee';
    this.animal.timer = 2;
    if (this.hp <= 0) this.onKilled(this);
    return 'hit';
  }
  update() {
    this.center.copy(this.animal.pos).setY(this.animal.pos.y + 0.6);
  }
}

export class Raids {
  state: 'idle' | 'warning' | 'waves' | 'done' = 'idle';
  kind: RaidKind = 'wolves';
  front: Front | null = null;
  readonly fronts: Front[];
  wave = 0;
  waves: { n: number; leader: boolean }[] = [];
  raiders: Raider[] = [];
  watch: Watchman[] = [];
  stock: Stock[] = [];
  lost = 0;
  killed = 0;
  private t = 0;
  private waveT = 0;
  private spawnAt = new THREE.Vector3();
  private rift: Rift | null = null;
  private leader: Raider | null = null;
  private pack: Pack | null = null;
  /** tonight's planned horn (game hour), or -1 */
  private planned = -1;
  private plannedDay = -1;
  private level = 2;
  save: RaidSave = {};
  /** plan raids on their own (off in tests, which start them directly) */
  auto = true;
  /** seconds from the horn to the first wave */
  warnSeconds = 40;
  /** the village is hiding indoors */
  get villageIndoors() {
    return this.state === 'warning' || this.state === 'waves';
  }
  /** which settlement's people are hiding (NpcManager.raidOn) */
  get hidingSettlement() {
    return this.villageIndoors && this.front ? SITES[this.front.site].settlement : null;
  }
  get site(): RaidSite {
    return this.front?.site ?? 'glen';
  }

  constructor(private h: Hooks, ranges: Record<string, Range>, road?: { flock: Range; paddock: Range }) {
    this.fronts = [
      { id: 'sheep', site: 'glen', pen: ranges.sheep, penName: 'the sheep pens', gate: GATES.north, gateName: 'the north gate' },
      { id: 'cows', site: 'glen', pen: ranges.cows, penName: 'the cow pasture', gate: GATES.west, gateName: 'the west gate' },
      { id: 'horses', site: 'glen', pen: ranges.horses, penName: 'the horse paddock', gate: GATES.north, gateName: 'the north gate' },
      { id: 'pigs', site: 'glen', pen: ranges.pigs, penName: 'the pigsties', gate: GATES.east, gateName: 'the east gate' },
    ];
    if (road) {
      this.fronts.push(
        { id: 'millbrook', site: 'millbrook', pen: road.flock, penName: "Old Garth's flock", gate: new THREE.Vector2(600, 104), gateName: 'Millbrook', alarm: "The chapel bell clangs over Millbrook! Wolves are after Old Garth's flock." },
        { id: 'rest', site: 'rest', pen: road.paddock, penName: "the Rest's paddock", gate: new THREE.Vector2(1385, 92), gateName: "the Wayfarer's Rest", alarm: "Shouting from the stables at the Wayfarer's Rest! Wolves are at the paddock." },
      );
    }
  }

  /** Living raiders (the watch fights these). */
  get living(): Target[] {
    return this.raiders.filter((r) => r.alive);
  }

  /** Decide tonight's raid at dusk; sound the horn when its hour comes. */
  private today = 0;
  private startDay = 0;
  update(dt: number, player: Player, hour: number, day: number) {
    this.t += dt;
    this.today = day;
    if (this.state === 'idle') {
      if (hour >= 19 && hour < 20 && this.plannedDay !== day) {
        this.plannedDay = day;
        const rested = day - (this.save.last ?? -10) >= 2;
        // Not every night: about one in three, never two nights running.
        const calm = (this.save.calmUntil ?? -1) >= day;
        this.planned = this.auto && !calm && this.h.unlocked() && rested && seeded(day) < 0.34 ? 21.5 + seeded(day * 7 + 3) * 1.5 : -1;
      }
      if (this.planned > 0 && this.plannedDay === day && hour >= this.planned && hour < 24) {
        this.planned = -1;
        // Staying at a road stop tonight? That's where the wolves come.
        const road = this.fronts.find((f) => f.site !== 'glen' && SITES[f.site].center.distanceTo(this.h.playerPos()) < 200);
        if (road) this.start('wolves', road.id);
        else {
          const kind: RaidKind = this.save.defended && this.save.defended >= 2 && seeded(day * 13) < 0.45 ? 'gloam' : 'wolves';
          const glen = this.fronts.filter((f) => f.site === 'glen');
          this.start(kind, glen[Math.floor(seeded(day * 5 + 1) * glen.length)].id);
        }
      }
      return;
    }
    if (this.state === 'done') return;

    for (const w of this.watch) w.update(dt);
    for (const s of this.stock) s.update();
    for (const r of this.raiders) if (!r.dead) r.update(dt, player);
    this.rift?.update(dt);

    if (this.state === 'warning') {
      if (this.t > this.warnSeconds) {
        // Too far off to matter? The watch deals with it as best it can.
        const near = this.h.outdoors() && this.h.playerPos().distanceTo(this.front!.pen.center) < 260;
        if (!near) this.resolveAway();
        else {
          this.state = 'waves';
          this.spawnWave();
        }
      }
      return;
    }
    // Waves: the next comes when most of this one is down, or after a while.
    this.waveT += dt;
    // Raiders still in the fight (a wolf running for the trees doesn't count).
    const alive = this.raiders.filter((r) => r.alive && !(r as unknown as { fleeing?: boolean }).fleeing).length;
    if (this.wave < this.waves.length && (alive <= 1 || this.waveT > 75)) this.spawnWave();
    if (this.leader) this.h.bossBar(this.leader.alive ? this.leader : null, this.leader.label);
    // Raiders: once the pen is empty, on to the gate.
    const penLeft = this.stock.some((s) => s.alive);
    for (const r of this.raiders) if (r.alive && !penLeft && r.objective && r.objective !== this.gatePoint) r.objective = this.gatePoint;
    const allIn = this.wave >= this.waves.length;
    if (allIn && alive === 0) this.finish(true);
    else if (hour >= 5 && hour < 12) this.finish(false); // dawn: they slink off with what they took
  }

  private get gatePoint() {
    return new THREE.Vector3(this.front!.gate.x, 0, this.front!.gate.y);
  }

  /** Sound the horn: a raid is coming (debug and tests call this directly). */
  start(kind: RaidKind, frontId?: string) {
    if (this.state === 'warning' || this.state === 'waves') return;
    void prepareCreature('wolf');
    this.kind = kind;
    const glen = this.fronts.filter((f) => f.site === 'glen');
    this.front = this.fronts.find((f) => f.id === frontId) ?? glen[Math.floor(Math.random() * glen.length)];
    const site = SITES[this.front.site];
    if (this.front.site !== 'glen') kind = 'wolves';
    this.kind = kind;
    this.state = 'warning';
    this.startDay = this.today;
    this.t = 0;
    this.wave = 0;
    this.lost = 0;
    this.killed = 0;
    this.raiders = [];
    this.leader = null;
    this.pack = new Pack();
    const f = this.front;
    this.level = Math.max(2, zoneLevel(f.pen.center.x, f.pen.center.z) + (kind === 'gloam' ? 2 : 0));
    this.waves = kind === 'gloam' ? [{ n: 3, leader: false }, { n: 4, leader: false }, { n: 2, leader: true }] : site.waves.map((w) => ({ ...w }));
    // Where they come from: out beyond the pen, away from the village.
    const away = f.pen.center.clone().sub(site.center).setY(0).normalize();
    const side = new THREE.Vector3(-away.z, 0, away.x).multiplyScalar((Math.random() - 0.5) * 30);
    this.spawnAt.copy(f.pen.center).addScaledVector(away, 70).add(side);
    this.spawnAt.y = heightAt(this.spawnAt.x, this.spawnAt.z);
    sfx.horn(0.7);
    const what = kind === 'gloam' ? 'Something is coming out of the dark' : 'Wolves are coming';
    this.h.toast(f.alarm ?? `A horn from ${f.gateName}! ${what} for ${f.penName}.`);
    this.h.mark({ x: f.pen.center.x, z: f.pen.center.z, label: `Raid: ${f.penName}` });
    // The watch turns out: they take their stand on the far side of the pen,
    // between it and the dark, coming round from the gate.
    const reach = (f.pen.half ? Math.max(f.pen.half.x, f.pen.half.y) : f.pen.radius) + 7;
    const post = f.pen.center.clone().addScaledVector(away, reach);
    post.y = heightAt(post.x, post.z);
    const sideStep = new THREE.Vector3(-away.z, 0, away.x);
    const n = site.defenders.length, mid = (n - 1) / 2;
    site.defenders.forEach((d, i) => {
      const at = post.clone().addScaledVector(sideStep, (i - mid) * 2.2).addScaledVector(away, -8);
      at.y = heightAt(at.x, at.z);
      const p = post.clone().addScaledVector(sideStep, (i - mid) * 2.5);
      this.watch.push(new Watchman(d.name, at, p, this.h.scene, d.look, () => this.living, i === 0));
    });
    for (const w of this.watch) extraFoes.add(w);
    // The animals in the pen.
    for (const a of this.h.fauna.animals) {
      if (!this.h.fauna.contains(f.pen, a.pos)) continue;
      const s = new Stock(a, (st) => this.stockKilled(st));
      this.stock.push(s);
      extraFoes.add(s);
    }
    if (kind === 'gloam') this.rift = new Rift(this.h.scene, this.h.fx, this.spawnAt.clone());
    events.emit('raidStarted', { kind, front: f.id });
  }

  private stockKilled(s: Stock) {
    this.lost++;
    extraFoes.delete(s);
    this.h.fx.add.spawn({ pos: s.pos.clone().setY(s.pos.y + 0.5), spread: 1, count: 14, life: [0.3, 0.7], size: [0.08, 0.02], color: 0x8a1a12, color2: 0x3a0806, gravity: 6 });
    this.h.fauna.remove(s.animal);
  }

  private spawnWave() {
    if (!creatureReady('wolf')) return; // still building: try again next step
    const w = this.waves[this.wave++];
    this.waveT = 0;
    const f = this.front!;
    for (let i = 0; i < w.n; i++) {
      const leader = w.leader && i === 0;
      const a = Math.random() * Math.PI * 2, r = leader ? 0 : 2 + Math.random() * 5;
      const at = this.spawnAt.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      at.y = heightAt(at.x, at.z);
      const wolf = new Wolf(at, this.level + (leader ? 2 : 0), this.h.scene, this.h.fx, { pack: this.pack!, leader, look: this.kind === 'gloam' ? 'gloam' : 'grey' }) as Raider;
      (wolf as unknown as Wolf).beginRaid(this.stock.some((s) => s.alive) ? f.pen.center.clone() : this.gatePoint);
      this.raiders.push(wolf);
      if (leader) this.leader = wolf;
      if (this.rift) this.rift.surge();
    }
    if (w.leader) {
      sfx.howl(0.6);
      this.h.toast(this.kind === 'gloam' ? 'The rift shudders. Something larger steps through.' : 'A great wolf howls beyond the pens. The pack leader is coming.');
    }
  }

  /** The raid ran its course without you. */
  private resolveAway() {
    // The watch saves most of it; a few animals are lost.
    const take = Math.min(this.stock.length, 2 + Math.floor(Math.random() * 3));
    for (let i = 0; i < take; i++) this.stockKilled(this.stock[i]);
    this.finish(false);
  }

  private finish(won: boolean) {
    const f = this.front!;
    this.state = 'done';
    this.h.bossBar(null);
    this.h.mark(null);
    this.save.last = this.startDay;
    this.save.lastWon = won;
    this.save.lastLost = this.lost;
    this.save.lastKind = this.kind;
    this.save.lastSite = f.site;
    const lostText = this.lost ? `, for the loss of ${this.lost} ${this.lost === 1 ? 'animal' : 'animals'}` : '';
    if (won && f.site !== 'glen') {
      this.save.roadDefended = (this.save.roadDefended ?? 0) + 1;
      const gold = 25 + this.level * 8;
      this.h.addGold(gold);
      const who = f.site === 'rest' ? "Hester stands you a meal and the Rest's purse" : 'Millbrook passes round a hat';
      this.h.toast(`The wolves are driven off${lostText}. ${who}: ${gold} gold.`);
      events.emit('deed', { id: 'raid:road', renown: 1, label: "Stood with the King's Road folk against a night raid" });
    } else if (won) {
      this.save.defended = (this.save.defended ?? 0) + 1;
      const gold = 40 + this.level * 12 + (this.kind === 'gloam' ? 60 : 0);
      this.h.addGold(gold);
      this.h.toast(`The raid is beaten back${lostText}. The watch's purse: ${gold} gold.`);
      if (this.save.defended === 1) events.emit('deed', { id: 'raid:first', renown: 1, label: 'Held Elder Glen against a night raid' });
      if (this.kind === 'gloam') events.emit('deed', { id: 'raid:gloam', renown: 2, label: 'Drove the Gloaming back into the Dark' });
      if (this.save.defended >= 3 && !this.save.banner) {
        this.save.banner = true;
        this.h.give('watchBanner', 1);
        this.h.toast("Captain Brannoc presses the Watch's Banner into your hands. 'You've stood with us three times. Wear it.'");
      }
    } else {
      this.h.toast(`Dawn. The raid on ${f.penName} is over: ${this.lost ? `${this.lost} ${this.lost === 1 ? 'animal' : 'animals'} lost` : 'nothing lost'}. ${f.site === 'glen' ? 'The watch is bruised.' : 'Nobody slept much.'}`);
    }
    events.emit('raidEnded', { kind: this.kind, won, lost: this.lost });
    this.cleanup();
  }

  private cleanup() {
    for (const w of this.watch) {
      extraFoes.delete(w);
      w.dispose();
    }
    this.watch = [];
    for (const s of this.stock) extraFoes.delete(s);
    this.stock = [];
    // Survivors melt back into the night; the fallen keep their corpse a moment.
    for (const r of this.raiders) if (r.alive) r.dispose();
    this.leaveCorpses = this.raiders.filter((r) => !r.dead);
    this.raiders = [];
    this.rift?.close();
    this.state = 'idle';
  }
  private leaveCorpses: Raider[] = [];

  /** Corpses and the closing rift keep animating a little after the raid. */
  tail(dt: number, player: Player) {
    for (const c of this.leaveCorpses) if (!c.dead) c.update(dt, player);
    this.leaveCorpses = this.leaveCorpses.filter((c) => !c.dead);
    if (this.rift) {
      this.rift.update(dt);
      if (this.rift.gone) this.rift = null;
    }
  }

  toJSON(): RaidSave {
    return { ...this.save };
  }
  /** Keep the raids off for `days` (a beacon is burning). */
  calm(day: number, days: number) {
    this.save.calmUntil = Math.max(this.save.calmUntil ?? -1, day + days);
    if (this.plannedDay === day) this.planned = -1;
  }

  fromJSON(s?: RaidSave) {
    this.save = { ...(s ?? {}) };
  }

  /** Abandon any raid (tests, realm changes). */
  clear() {
    if (this.state === 'warning' || this.state === 'waves') {
      this.h.bossBar(null);
      this.h.mark(null);
      this.cleanup();
    }
    this.state = 'idle';
    this.planned = -1;
  }
}

/** A steady pseudo-random number per day (same night, same choice). */
function seeded(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
