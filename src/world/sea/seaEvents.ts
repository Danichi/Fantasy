import * as THREE from 'three';
import { SEA_LEVEL } from '../worldMap';
import { heightAt } from '../terrainHeight';
import { waveAt } from './seaState';
import { Part } from './seaMonsters';
import type { Ship } from './ship';
import type { FX } from '../../fx/particles';

// Life on the open sea (docs/design/boating.md §11): every minute or two of
// sailing, something: a pod of dolphins riding the bow wave, a whale blowing
// and sounding, floating cargo, a bottle with a treasure map in it, a
// waterspout to steer clear of, the sea glowing blue at night, survivors on
// a raft, a boiling shoal with a great fish in it for the harpoon, a
// merchantman passing on her way. Hurt the dolphins or the whales and the
// sea takes it badly.

const surface = (x: number, z: number) => SEA_LEVEL + waveAt(x, z).y;
const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });

export type SeaEventId = 'dolphins' | 'whale' | 'flotsam' | 'bottle' | 'waterspout' | 'bloom' | 'survivors' | 'shoal' | 'merchant';

/** What an event can do (Sailing supplies it). */
export interface EventCtx {
  toast(m: string): void;
  shake(n: number): void;
  xp(n: number, why?: string): void;
  gold(n: number): void;
  give(id: string, n: number): void;
  /** goods into the current ship's hold (as many as fit); returns how many */
  stow(good: string, n: number): number;
  /** a survivor joins your crew (or pays you); returns their name */
  rescue(): string;
  /** a bottle's treasure: a dig or dive site somewhere near */
  treasure(near: THREE.Vector3): void;
  /** the sea is angered (a dolphin or whale was hurt) */
  angered(): void;
  bigGame: boolean;
  shoalSight: boolean;
}

export abstract class SeaEvent {
  abstract readonly id: SeaEventId;
  readonly group = new THREE.Group();
  pos = new THREE.Vector3();
  t = 0;
  done = false;
  /** gun targets (a great fish), and creatures that anger the sea if struck */
  parts: Part[] = [];
  protected angry = false;
  private said = false;
  /** Announce the event, once. */
  protected once(ctx: EventCtx, msg: string, xp = 0) {
    if (this.said) return false;
    this.said = true;
    ctx.toast(msg);
    if (xp) ctx.xp(xp);
    return true;
  }
  constructor(protected scene: THREE.Scene, protected fx: FX, at: THREE.Vector3) {
    this.pos.copy(at);
    scene.add(this.group);
  }
  abstract update(dt: number, ship: Ship | null, ctx: EventCtx): void;
  dispose() {
    for (const p of this.parts) p.dispose();
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
  }
  /** Is the ship close and slow enough to haul something aboard? */
  protected alongside(ship: Ship | null, r = 12) {
    return !!ship && Math.hypot(ship.pos.x - this.pos.x, ship.pos.z - this.pos.z) < ship.length * 0.5 + r && Math.abs(ship.speed) < 4.5;
  }
}

// ---- dolphins at the bow ---------------------------------------------------------------------

class Dolphins extends SeaEvent {
  readonly id = 'dolphins' as const;
  private pod: { m: THREE.Group; off: THREE.Vector3; ph: number; part: Part }[] = [];
  constructor(scene: THREE.Scene, fx: FX, at: THREE.Vector3) {
    super(scene, fx, at);
    const skin = mat(0x6a7a8a, { roughness: 0.35 });
    const belly = mat(0xd8dde0);
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), skin);
      body.scale.set(0.8, 0.8, 2.6);
      const under = new THREE.Mesh(new THREE.SphereGeometry(0.46, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), belly);
      under.scale.set(0.8, 0.8, 2.5);
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 4), skin);
      fin.position.set(0, 0.5, -0.1);
      fin.rotation.x = -0.4;
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 6), skin);
      beak.rotation.x = Math.PI / 2;
      beak.position.z = 1.45;
      const fluke = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.4), skin);
      fluke.position.z = -1.4;
      m.add(body, under, fin, beak, fluke);
      this.group.add(m);
      const part = new Part('dolphin', 60, 0.8, 0.5);
      part.lockable = false;
      part.onHit = () => { this.angry = true; };
      this.parts.push(part);
      this.pod.push({ m, off: new THREE.Vector3((i % 2 ? 1 : -1) * (3 + i), 0, 6 + i * 3), ph: i * 1.3, part });
    }
  }
  update(dt: number, ship: Ship | null, ctx: EventCtx) {
    this.t += dt;
    if (this.angry) { ctx.angered(); this.done = true; return; }
    if (!ship || this.t > 40) { this.done = true; return; }
    if (this.t > 0.3) this.once(ctx, 'A pod of dolphins races to ride your bow wave, leaping and chattering!', 10);
    const heading = new THREE.Vector3(Math.sin(ship.yaw), 0, Math.cos(ship.yaw));
    const port = new THREE.Vector3(Math.cos(ship.yaw), 0, -Math.sin(ship.yaw));
    for (const d of this.pod) {
      const leap = Math.max(0, Math.sin(this.t * 2.2 + d.ph));
      const p = ship.pos.clone().addScaledVector(heading, ship.length * 0.5 + d.off.z * 0.6).addScaledVector(port, d.off.x);
      p.y = surface(p.x, p.z) - 0.5 + leap * 1.6;
      d.m.position.copy(p);
      d.m.rotation.set(-Math.cos(this.t * 2.2 + d.ph) * 0.6, ship.yaw, 0);
      d.part.center.copy(p);
      if (leap > 0.9 && Math.random() < dt * 4) this.fx.alpha.spawn({ pos: p.clone().setY(SEA_LEVEL + 0.2), vel: new THREE.Vector3(0, 2, 0), spread: 0.6, count: 4, life: [0.4, 0.8], size: [0.3, 0.1], color: 0xeaf6fa, alpha: 0.7, gravity: 8 });
    }
    this.pos.copy(ship.pos);
  }
}

// ---- a whale ------------------------------------------------------------------------------

class Whale extends SeaEvent {
  readonly id = 'whale' as const;
  private body = new THREE.Group();
  private tail: THREE.Mesh;
  private yaw = Math.random() * 6;
  private part: Part;
  constructor(scene: THREE.Scene, fx: FX, at: THREE.Vector3) {
    super(scene, fx, at);
    const skin = mat(0x2a3a4a, { roughness: 0.6 });
    const pale = mat(0x9aa8b0);
    const b = new THREE.Mesh(new THREE.SphereGeometry(2.4, 16, 10), skin);
    b.scale.set(1, 0.8, 4.2);
    const chin = new THREE.Mesh(new THREE.SphereGeometry(2.2, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), pale);
    chin.scale.set(1, 0.8, 4);
    this.tail = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 1.8), skin);
    this.tail.position.set(0, 0.6, -10.5);
    this.body.add(b, chin, this.tail);
    this.group.add(this.body);
    this.part = new Part('whale', 400, 3, 2);
    this.part.lockable = false;
    this.part.onHit = () => { this.angry = true; };
    this.parts.push(this.part);
  }
  update(dt: number, ship: Ship | null, ctx: EventCtx) {
    this.t += dt;
    if (this.angry) { ctx.angered(); this.done = true; return; }
    if (this.t > 45) { this.done = true; return; }
    if (ship && this.t > 0.3) this.once(ctx, 'A whale breaks the surface off your beam and blows: a fountain twice the height of your mast!', 15);
    this.pos.x += Math.sin(this.yaw) * 3 * dt;
    this.pos.z += Math.cos(this.yaw) * 3 * dt;
    // It surfaces, blows, rolls and sounds, tail high.
    const cycle = this.t % 15;
    const y = cycle < 9 ? -1.4 + Math.sin(cycle * 0.35) * 0.3 : cycle < 12 ? -1.4 - (cycle - 9) * 1.5 : -6;
    this.body.position.copy(this.pos).setY(surface(this.pos.x, this.pos.z) + y);
    this.body.rotation.set(cycle > 9 && cycle < 12 ? 0.35 : 0, this.yaw, 0);
    this.tail.rotation.x = cycle > 9 && cycle < 12 ? -0.8 : Math.sin(this.t) * 0.1;
    if (cycle > 2 && cycle < 3.2 && Math.random() < dt * 30) this.fx.alpha.spawn({ pos: this.pos.clone().setY(SEA_LEVEL + 1.5), vel: new THREE.Vector3(0, 12, 0), spread: 1.2, count: 6, life: [0.8, 1.5], size: [0.8, 0.3], color: 0xf4fafc, alpha: 0.75, gravity: 6 });
    this.part.center.copy(this.body.position);
  }
}

// ---- floating cargo and a bottle ----------------------------------------------------------

class Flotsam extends SeaEvent {
  readonly id = 'flotsam' as const;
  constructor(scene: THREE.Scene, fx: FX, at: THREE.Vector3, private bottle: boolean) {
    super(scene, fx, at);
    if (bottle) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.5, 8), mat(0x3a8a5a, { transparent: true, opacity: 0.8, roughness: 0.1 }));
      b.rotation.z = 1.2;
      const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 6), mat(0x8a6a48));
      cork.position.set(0.28, 0.1, 0);
      cork.rotation.z = 1.2;
      this.group.add(b, cork);
    } else {
      for (let k = 0; k < 4; k++) {
        const c = new THREE.Mesh(k === 3 ? new THREE.CylinderGeometry(0.4, 0.45, 1, 10) : new THREE.BoxGeometry(1, 0.8, 1), mat(k === 3 ? 0x5a3a22 : 0x8a5a32));
        c.position.set((k % 2) * 1.4 - 0.7, 0, Math.floor(k / 2) * 1.4 - 0.7);
        c.rotation.y = k;
        this.group.add(c);
      }
    }
  }
  get id2() { return this.bottle ? 'bottle' : 'flotsam'; }
  update(dt: number, ship: Ship | null, ctx: EventCtx) {
    this.t += dt;
    this.group.position.copy(this.pos).setY(surface(this.pos.x, this.pos.z) - 0.1);
    this.group.rotation.y = this.t * 0.2;
    if (this.t > 120 || (ship && ship.pos.distanceTo(this.pos) > 700)) { this.done = true; return; }
    if (this.alongside(ship, 8)) {
      this.done = true;
      if (this.bottle) {
        ctx.toast('You fish a bottle out of the sea. Inside, a scrap of chart: an X, and a few lines in a dead man\'s hand.');
        ctx.treasure(this.pos);
        ctx.xp(20);
      } else {
        const goods = ['rum', 'cloth', 'spices', 'sugar', 'timber', 'saltFish'];
        const good = goods[Math.floor(Math.random() * goods.length)];
        const n = ctx.stow(good, 3 + Math.floor(Math.random() * 6));
        const g = 20 + Math.floor(Math.random() * 60);
        ctx.gold(g);
        ctx.toast(`You haul the floating cargo aboard: ${g} gold in a strongbox${n ? ` and ${n} crates of ${good === 'saltFish' ? 'salt fish' : good}` : ''}.`);
        ctx.xp(10);
      }
    }
  }
}

// ---- a waterspout -------------------------------------------------------------------------

class Waterspout extends SeaEvent {
  readonly id = 'waterspout' as const;
  private col: THREE.Mesh;
  private dir: THREE.Vector3;
  private hit = false;
  constructor(scene: THREE.Scene, fx: FX, at: THREE.Vector3) {
    super(scene, fx, at);
    const g = new THREE.CylinderGeometry(4, 1.2, 60, 16, 8, true);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const a = y * 0.08;
      const x = p.getX(i), z = p.getZ(i);
      p.setXYZ(i, x * Math.cos(a) - z * Math.sin(a) + Math.sin(y * 0.05) * 3, y, x * Math.sin(a) + z * Math.cos(a));
    }
    g.computeVertexNormals();
    this.col = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xc8d8e0, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    this.group.add(this.col);
    this.dir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
  }
  update(dt: number, ship: Ship | null, ctx: EventCtx) {
    this.t += dt;
    if (this.t > 60) { this.done = true; return; }
    this.once(ctx, 'A waterspout twists down out of the cloud ahead! Steer clear of it!');
    this.pos.addScaledVector(this.dir, 4 * dt);
    this.col.position.copy(this.pos).setY(SEA_LEVEL + 30);
    this.col.rotation.y = this.t * 2;
    if (Math.random() < dt * 20) this.fx.alpha.spawn({ pos: this.pos.clone().setY(SEA_LEVEL + 0.5), vel: new THREE.Vector3(0, 6, 0), spread: 4, count: 3, life: [0.6, 1.2], size: [0.8, 0.3], color: 0xeef6fa, alpha: 0.7, gravity: 3 });
    if (ship && !this.hit && Math.hypot(ship.pos.x - this.pos.x, ship.pos.z - this.pos.z) < ship.length * 0.4 + 6) {
      this.hit = true;
      ship.yaw += (Math.random() < 0.5 ? -1 : 1) * 1.2;
      ship.sailHp = Math.max(0, ship.sailHp - ship.stats.sails * 0.25);
      ship.water = Math.min(1, ship.water + 0.12);
      ship.damage(1, ship.stats.hull * 0.08);
      ctx.shake(1);
      ctx.toast('The waterspout spins her round like a top! Sails torn, water in the hold!');
    }
  }
}

// ---- the sea glowing at night -------------------------------------------------------------

class Bloom extends SeaEvent {
  readonly id = 'bloom' as const;
  update(dt: number, ship: Ship | null, ctx: EventCtx) {
    this.t += dt;
    if (!ship || this.t > 45) { this.done = true; return; }
    if (this.once(ctx, 'The sea around you begins to glow blue: every wave and wake lit from within. The sailors fall silent.', 15) && Math.random() < 0.3) ctx.give('pearl', 1);
    this.pos.copy(ship.pos);
    for (let k = 0; k < 3; k++) {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 40;
      this.fx.add.spawn({ pos: new THREE.Vector3(ship.pos.x + Math.cos(a) * r, SEA_LEVEL + 0.1, ship.pos.z + Math.sin(a) * r), spread: 1.5, count: 2, life: [1, 2], size: [0.25, 0.05], color: 0x6af0ff, color2: 0x2a6aff });
    }
  }
}

// ---- survivors on wreckage ----------------------------------------------------------------

class Survivors extends SeaEvent {
  readonly id = 'survivors' as const;
  private figs: THREE.Mesh[] = [];
  constructor(scene: THREE.Scene, fx: FX, at: THREE.Vector3) {
    super(scene, fx, at);
    const raft = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 2.4), mat(0x6a4a2a));
    this.group.add(raft);
    for (let k = 0; k < 2; k++) {
      const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.9, 4, 8), mat(k ? 0x8a3a2a : 0x3a5a8a));
      f.position.set(k ? 0.6 : -0.5, 0.75, 0);
      this.group.add(f);
      this.figs.push(f);
    }
  }
  update(dt: number, ship: Ship | null, ctx: EventCtx) {
    this.t += dt;
    this.once(ctx, 'A raft! Two figures on it, waving for their lives. Come alongside slowly to pick them up.');
    this.group.position.copy(this.pos).setY(surface(this.pos.x, this.pos.z) - 0.1);
    this.figs.forEach((f, k) => (f.rotation.z = Math.sin(this.t * 6 + k) * 0.4));
    if (this.t > 150 || (ship && ship.pos.distanceTo(this.pos) > 800)) {
      this.done = true;
      return;
    }
    if (this.alongside(ship, 7)) {
      this.done = true;
      const who = ctx.rescue();
      ctx.xp(45, 'rescued castaways');
      ctx.toast(`You haul the castaways aboard. ${who}`);
    }
  }
}

// ---- a boiling shoal, maybe with a great fish in it ---------------------------------------

export class Shoal extends SeaEvent {
  readonly id = 'shoal' as const;
  fish: Part | null = null;
  fishKind = 'bluefin';
  private fishMesh: THREE.Group | null = null;
  private yaw = Math.random() * 6;
  constructor(scene: THREE.Scene, fx: FX, at: THREE.Vector3, bigGame: boolean) {
    super(scene, fx, at);
    if (bigGame) {
      this.fishKind = Math.random() < 0.5 ? 'bluefin' : 'marlin';
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), mat(this.fishKind === 'marlin' ? 0x3a6aaa : 0x2a4a8a, { metalness: 0.4, roughness: 0.3 }));
      b.scale.set(0.8, 0.9, 3);
      g.add(b);
      if (this.fishKind === 'marlin') {
        const bill = new THREE.Mesh(new THREE.ConeGeometry(0.08, 1.6, 6), mat(0x2a3a5a));
        bill.rotation.x = Math.PI / 2;
        bill.position.z = 2.4;
        const sail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1, 1.6), mat(0x2a4a8a));
        sail.position.y = 0.8;
        g.add(bill, sail);
      }
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1, 3), mat(0x2a3a5a));
      tail.position.z = -1.9;
      tail.rotation.x = -Math.PI / 2;
      g.add(tail);
      g.scale.setScalar(1.4);
      this.group.add(g);
      this.fishMesh = g;
      this.fish = new Part('greatFish', 260, 1.4, 0.8);
      this.fish.tetherable = true;
      this.parts.push(this.fish);
    }
  }
  update(dt: number, ship: Ship | null, ctx: EventCtx) {
    this.t += dt;
    if (this.t > 120 || (ship && ship.pos.distanceTo(this.pos) > 700)) { this.done = true; return; }
    this.once(ctx, this.fish ? `A shoal boils on the surface, and something big is feeding in it: a ${this.fishKind === 'marlin' ? 'sailfin marlin' : 'bluefin tuna'}! Harpoon it!` : 'A shoal boils the water ahead: trawl through it!');
    // Boiling water (brighter with Shoal Sight).
    if (Math.random() < dt * (ctx.shoalSight ? 30 : 14)) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 22;
      this.fx.alpha.spawn({ pos: new THREE.Vector3(this.pos.x + Math.cos(a) * r, SEA_LEVEL + 0.15, this.pos.z + Math.sin(a) * r), vel: new THREE.Vector3(0, 1.5, 0), spread: 0.5, count: 2, life: [0.4, 0.8], size: [0.3, 0.1], color: 0xf4fafc, alpha: 0.7, gravity: 6 });
    }
    if (this.fish && this.fishMesh) {
      if (!this.fish.alive) {
        this.fishMesh.visible = false;
        this.done = true;
        ctx.give(this.fishKind, 1);
        ctx.xp(60, 'landed a great fish');
        ctx.toast(`You haul the ${this.fishKind === 'marlin' ? 'sailfin marlin' : 'bluefin tuna'} aboard: a monster of a fish!`);
        return;
      }
      const speed = this.fish.held ? 2.5 : 6;
      this.yaw += dt * (this.fish.held ? 0.6 : 0.4);
      this.pos.x += Math.sin(this.yaw) * speed * dt * 0.3;
      this.pos.z += Math.cos(this.yaw) * speed * dt * 0.3;
      const fp = this.pos.clone().add(new THREE.Vector3(Math.sin(this.t * 0.7) * 12, 0, Math.cos(this.t * 0.7) * 12));
      fp.y = surface(fp.x, fp.z) - 0.4 + Math.max(0, Math.sin(this.t * 1.7)) * (this.fish.held ? 1.2 : 0.4);
      this.fishMesh.position.copy(fp);
      this.fishMesh.rotation.y = this.t * 0.7 + Math.PI / 2;
      this.fish.center.copy(fp);
      this.fish.vel.set(Math.cos(this.t * 0.7) * 8, 0, -Math.sin(this.t * 0.7) * 8);
      if (this.fish.held) {
        // On the line it tires and bleeds.
        this.fish.hp -= dt * 18;
        if (this.fish.hp <= 0) this.fish.break();
      }
    } else this.pos.x += dt * 0.5;
  }
  /** Is the ship's trawl inside the shoal? */
  contains(p: THREE.Vector3) {
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 26;
  }
}

// ---- a merchantman passing ---------------------------------------------------------------

class Merchant extends SeaEvent {
  readonly id = 'merchant' as const;
  constructor(scene: THREE.Scene, fx: FX, at: THREE.Vector3, readonly ship: Ship, private yaw: number) {
    super(scene, fx, at);
    ship.yaw = yaw;
    ship.pos.copy(at);
    ship.sailSet = 1;
    ship.anchored = false;
    ship.place();
  }
  update(dt: number, ship: Ship | null, ctx: EventCtx) {
    this.t += dt;
    this.once(ctx, `A merchantman, the ${this.ship.name}, passes on her way and dips her flag to you.`);
    this.ship.update(dt, { rudder: 0, sail: 1, sheet: null, reef: false, anchor: false, row: 0 }, { skill: 0.6, assisted: true });
    this.ship.yaw = this.yaw;
    this.pos.copy(this.ship.pos);
    if (this.t > 90 || (ship && ship.pos.distanceTo(this.pos) > 900)) this.done = true;
  }
  dispose() {
    this.ship.dispose();
    super.dispose();
  }
}

/** Raise a sea event near the ship. `makeShip` builds a passing merchantman. */
export function makeSeaEvent(id: SeaEventId, scene: THREE.Scene, fx: FX, ship: Ship, bigGame: boolean, makeShip: () => Ship): SeaEvent {
  const ahead = (d: number, side = 0) => ship.pos.clone().add(new THREE.Vector3(Math.sin(ship.yaw) * d + Math.cos(ship.yaw) * side, 0, Math.cos(ship.yaw) * d - Math.sin(ship.yaw) * side));
  switch (id) {
    case 'dolphins': return new Dolphins(scene, fx, ship.pos.clone());
    case 'whale': return new Whale(scene, fx, ahead(60, (Math.random() < 0.5 ? -1 : 1) * 70));
    case 'flotsam': return new Flotsam(scene, fx, ahead(110, (Math.random() - 0.5) * 60), false);
    case 'bottle': return new Flotsam(scene, fx, ahead(90, (Math.random() - 0.5) * 40), true);
    case 'waterspout': return new Waterspout(scene, fx, ahead(220, (Math.random() - 0.5) * 120));
    case 'bloom': return new Bloom(scene, fx, ship.pos.clone());
    case 'survivors': return new Survivors(scene, fx, ahead(140, (Math.random() - 0.5) * 80));
    case 'shoal': return new Shoal(scene, fx, ahead(130, (Math.random() - 0.5) * 80), bigGame);
    case 'merchant': {
      const side = Math.random() < 0.5 ? -1 : 1;
      const at = ahead(260, side * 200);
      return new Merchant(scene, fx, at, makeShip(), ship.yaw + side * 1.9);
    }
  }
}

/** A dig or dive site for a treasure map: a beach on the nearest island, or the seabed. */
export function treasureSite(near: THREE.Vector3): { x: number; z: number; kind: 'dig' | 'dive' } {
  for (let r = 300; r < 3000; r += 150) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2 + r;
      const x = near.x + Math.cos(a) * r, z = near.z + Math.sin(a) * r;
      const h = heightAt(x, z);
      if (h > 0.2 && h < 4) return { x, z, kind: 'dig' };
      if (h < -4 && h > -14 && Math.random() < 0.08) return { x, z, kind: 'dive' };
    }
  }
  return { x: near.x + 400, z: near.z, kind: 'dive' };
}
