import * as THREE from 'three';
import { buildCharacter, type Look, type BuiltCharacter } from '../npc/charBuilder';
import { heightAt } from './terrainHeight';
import { road, roadLength, pointAlong, distanceAlong } from './roadNetwork';
import { Bandit, Bolts } from '../enemies/bandit';
import { OrcMob } from '../enemies/orcMob';
import { Undead } from '../enemies/undead';
import type { Beast } from '../enemies/beast';
import type { BeastSpawner } from '../enemies/beastSpawner';
import type { Player } from '../player/player';
import type { Interactable } from '../dungeon/instance';
import type { FX } from '../fx/particles';

// Road encounters (World Expansion phase 4, prompt §42): data tables for each
// stretch of the King's Road by time of day and weather. Travellers,
// pilgrims, merchants, adventuring parties and Crown patrols walk the road
// and can be talked to; wolves, stags, a rare dire wolf and night-time
// bandit ambushes wait beside it. Groups appear out of sight ahead or behind
// and are dropped once they fall far behind, so only a few exist at a time.

type Kind = 'traveller' | 'pilgrims' | 'merchant' | 'adventurers' | 'patrol' | 'wolves' | 'stag' | 'dire' | 'bandits' | 'orcs' | 'undead' | 'knights';
type Table = [number, Kind][];
type Segment = 'farmland' | 'woods' | 'coast' | 'crownFields' | 'crownWilds' | 'orcMarches' | 'capitalApproach';

const TABLES: Record<Segment, { day: Table; night: Table }> = {
  farmland: {
    day: [[4, 'traveller'], [2, 'pilgrims'], [1, 'patrol'], [2, 'merchant'], [1, 'wolves']],
    night: [[3, 'wolves'], [1, 'traveller'], [0.3, 'dire']],
  },
  woods: {
    day: [[2, 'merchant'], [2, 'adventurers'], [2, 'traveller'], [2, 'wolves'], [1, 'stag']],
    night: [[3, 'wolves'], [3, 'bandits'], [0.6, 'dire']],
  },
  coast: {
    day: [[3, 'patrol'], [2, 'traveller'], [2, 'merchant'], [1, 'stag']],
    night: [[2, 'wolves'], [1, 'bandits']],
  },
  // The Crown Road past the checkpoint: wilder the further from either end,
  // with orcs raiding out of the marches and the barrow dead walking at night.
  crownFields: {
    day: [[3, 'traveller'], [2, 'pilgrims'], [2, 'patrol'], [2, 'merchant'], [1.5, 'wolves'], [1.2, 'bandits']],
    night: [[3, 'wolves'], [2.5, 'bandits'], [0.5, 'dire']],
  },
  crownWilds: {
    day: [[3, 'wolves'], [3, 'bandits'], [2, 'adventurers'], [1, 'merchant'], [1, 'traveller'], [1.2, 'orcs'], [0.6, 'stag']],
    night: [[3, 'wolves'], [3, 'bandits'], [2, 'orcs'], [0.8, 'dire']],
  },
  orcMarches: {
    day: [[3.5, 'orcs'], [2, 'knights'], [2, 'wolves'], [1, 'traveller'], [1, 'bandits']],
    night: [[3.5, 'orcs'], [3, 'undead'], [2, 'wolves'], [0.6, 'dire']],
  },
  capitalApproach: {
    day: [[4, 'traveller'], [3, 'pilgrims'], [3, 'patrol'], [2, 'knights'], [3, 'merchant']],
    night: [[2, 'patrol'], [1, 'bandits'], [1, 'undead']],
  },
};

/** The roads encounters happen on: where along them, which stretch, how busy. */
interface Route { id: string; from: number; to: number; segment(s: number): Segment; max: number; gap: [number, number] }
const ROUTES: Route[] = [
  { id: 'kings', from: 180, to: -250, segment: (s) => (s < 900 ? 'farmland' : s < 1900 ? 'woods' : 'coast'), max: 3, gap: [22, 48] },
  { id: 'capital', from: 240, to: -140, segment: (s) => (s < 650 ? 'farmland' : s < 1450 ? 'crownFields' : s < 2300 ? 'crownWilds' : s < 2900 ? 'orcMarches' : 'capitalApproach'), max: 4, gap: [12, 26] },
];

const LINES: Record<string, string[]> = {
  traveller: ['Long road, but a good one. Mind the ridge after dark.', 'Port Aurelle? Keep walking till you smell the sea.', 'Stopped at the Wayfarer\'s Rest last night. Best stew this side of the capital.'],
  pilgrims: ['We walk to the Chapel of the Dawn at Millbrook. The Dawn keeps travellers safe.', 'May your road be dry and your boots be whole, friend.'],
  merchant: ['Wares for the road! Potions, rope, dried fruit, honest prices.', 'Caravans pay better, but I like my own company.'],
  adventurers: ['Heading for Port Aurelle to try the big guild board.', 'We took a goblin nest apart last week. Easy money, if you don\'t mind the smell.'],
  patrol: ['Crown road patrol. Keep to the road and you\'ll keep your purse.', 'Bandits have been sighted around Hollow Ridge. Travel in daylight if you can.'],
  knights: ["Silver Lance patrol. Gorrak's raiders have been striking east of the Kingsmile.", 'For Crown and Lance. If you see orcs, run west and shout.', 'The barrow mounds wake after dark. We ride past them at a gallop.'],
};

const LOOKS: Record<string, Look[]> = {
  traveller: [
    { body: 'male', outfit: 'peasant', hair: 'simpleparted', beard: true, hairColor: 0x6a4428, skin: 0xe0b894, linen: 0xd8c29a, height: 1.76 },
    { body: 'female', outfit: 'peasant', hair: 'long', hairColor: 0x3a2618, skin: 0xfff0e6, linen: 0xc9dbe8, height: 1.66 },
  ],
  pilgrims: [
    { body: 'male', outfit: 'peasant', hair: 'buzzed', hairColor: 0xb8b4ae, skin: 0xfff0e6, linen: 0xf0e0a8, cloth: 0xe0c060, height: 1.72 },
    { body: 'female', outfit: 'peasant', hair: 'buns', hairColor: 0xe6e2da, skin: 0xe0b894, linen: 0xf0e0a8, cloth: 0xe0c060, height: 1.62 },
  ],
  merchant: [{ body: 'male', outfit: 'peasant', hair: 'buzzed', beard: true, hairColor: 0x1f1a17, skin: 0xa8744e, linen: 0xe8c8c0, cloth: 0x2f7f86, height: 1.78 }],
  adventurers: [
    { body: 'female', outfit: 'ranger', hair: 'long', hairColor: 0xb0562a, skin: 0xfff0e6, cloth: 0x3d7a45, hood: true, height: 1.72 },
    { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x3a2618, skin: 0x7a4e32, cloth: 0x8a3a2a, pauldron: true, height: 1.84 },
    { body: 'male', outfit: 'peasant', hair: 'simpleparted', hairColor: 0xd2b26a, skin: 0xfff0e6, linen: 0xd9cfe8, cloth: 0x2f5f9a, height: 1.74 },
  ],
  patrol: [
    { body: 'male', outfit: 'ranger', hair: 'buzzed', hairColor: 0x1f1a17, skin: 0xe0b894, cloth: 0x3a5f9e, pauldron: true, height: 1.84 },
    { body: 'female', outfit: 'ranger', hair: 'buns', hairColor: 0x6a4428, skin: 0xfff0e6, cloth: 0x3a5f9e, pauldron: true, height: 1.74 },
  ],
  knights: [
    { body: 'male', outfit: 'ranger', hair: 'simpleparted', hairColor: 0xd2b26a, skin: 0xfff0e6, cloth: 0xc9d6e6, pauldron: true, bracers: true, height: 1.86 },
    { body: 'female', outfit: 'ranger', hair: 'buns', hairColor: 0x3a2618, skin: 0xa8744e, cloth: 0xc9d6e6, pauldron: true, bracers: true, height: 1.78 },
    { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x6a6a6a, skin: 0xe0b894, cloth: 0xc9d6e6, pauldron: true, bracers: true, height: 1.9 },
  ],
};

/** A friendly walker on the road. */
class Walker {
  built: BuiltCharacter | null = null;
  pos = new THREE.Vector3();
  yaw = 0;
  talkT = 0;
  private clip = '';
  private actions: Record<string, THREE.AnimationAction> = {};
  constructor(scene: THREE.Scene, readonly kind: string, look: Look, readonly name: string) {
    void buildCharacter(look, ['walk', 'idle', 'talk']).then((b) => {
      this.built = b;
      const acts = (b.mixer as unknown as { _actions: THREE.AnimationAction[] })._actions;
      for (const a of acts) this.actions[a.getClip().name] = a;
      b.root.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
      scene.add(b.root);
    });
  }
  play(n: string) {
    if (this.clip === n) return;
    const next = this.actions[n];
    if (!next) return;
    const prev = this.actions[this.clip];
    next.reset().play();
    if (prev) prev.crossFadeTo(next, 0.25, false);
    this.clip = n;
  }
  update(dt: number) {
    if (!this.built) return;
    this.built.root.position.copy(this.pos);
    this.built.root.rotation.y = this.yaw;
    this.built.mixer.update(dt);
  }
  dispose(scene: THREE.Scene) {
    if (this.built) scene.remove(this.built.root);
  }
}

interface Group {
  kind: Kind;
  route: Route;
  /** distance along the road where it is (friendlies move) */
  s: number;
  dir: 1 | -1;
  walkers: Walker[];
  beasts: Beast[];
  bandits: Bandit[];
  orcs: OrcMob[];
  dead: Undead[];
  center: THREE.Vector3;
}

const NAMES: Record<string, string[]> = {
  traveller: ['A Traveller', 'A Wayfarer'],
  pilgrims: ['A Pilgrim of the Dawn'],
  merchant: ['A Road Merchant'],
  adventurers: ['An Adventurer'],
  patrol: ['A Crown Road Warden'],
  knights: ['A Knight of the Silver Lance'],
};

export class Encounters {
  private groups: Group[] = [];
  private timer = 8;
  readonly bolts: Bolts;
  enabled = true;
  private near: Walker | null = null;
  readonly interactable: Interactable & { update(p: THREE.Vector3): void };
  /** a road merchant's shop */
  onShop?: (name: string) => void;
  onTalk?: (name: string, title: string, text: string, shop: boolean) => void;
  private kr = road('kings');
  private fx: FX;
  /** the Hollow Ridge camp and its chief (spawned by the quest system) */
  readonly bandits: Bandit[] = [];

  constructor(private scene: THREE.Scene, private player: Player, private beasts: BeastSpawner, fx: FX) {
    this.fx = fx;
    this.bolts = new Bolts(scene);
    const pos = new THREE.Vector3(0, -999, 0);
    const self = this;
    this.interactable = {
      pos, radius: 2.4,
      label: () => (self.near ? `Talk to ${self.near.name}` : ''),
      enabled: () => !!self.near,
      action: () => {
        const w = self.near;
        if (!w) return;
        w.talkT = 5;
        const lines = LINES[w.kind] ?? LINES.traveller;
        const title = { traveller: 'On the road', pilgrims: 'Pilgrim', merchant: 'Travelling merchant', adventurers: 'Adventurer', patrol: 'Crown Road Warden', knights: 'Knight of the Silver Lance' }[w.kind] ?? '';
        self.onTalk?.(w.name, title, lines[Math.floor(Math.random() * lines.length)], w.kind === 'merchant');
      },
      update(p: THREE.Vector3) {
        self.near = null;
        let best = 2.6;
        for (const g of self.groups) for (const w of g.walkers) {
          const d = w.pos.distanceTo(p);
          if (d < best && w.built) (best = d), (self.near = w);
        }
        if (self.near) pos.copy(self.near.pos);
        else pos.set(0, -999, 0);
      },
    };
  }

  private roll(t: Table) {
    let total = 0;
    for (const [w] of t) total += w;
    let r = Math.random() * total;
    for (const [w, k] of t) if ((r -= w) <= 0) return k;
    return t[0][1];
  }

  private spawn(kind: Kind, s: number, dir: 1 | -1, route = ROUTES[0]) {
    const r = road(route.id), len = roadLength(r);
    const p = pointAlong(r, Math.max(20, Math.min(len - 60, s)));
    const side = new THREE.Vector2(-p.dir.y, p.dir.x);
    const g: Group = { kind, route, s, dir, walkers: [], beasts: [], bandits: [], orcs: [], dead: [], center: new THREE.Vector3(p.x, heightAt(p.x, p.z), p.z) };
    const off = (lat: number, along = 0) => {
      const x = p.x + side.x * lat + p.dir.x * along, z = p.z + side.y * lat + p.dir.y * along;
      return new THREE.Vector3(x, heightAt(x, z), z);
    };
    const flank = Math.random() < 0.5 ? 1 : -1;
    switch (kind) {
      case 'wolves': {
        const n = 2 + Math.floor(Math.random() * 2);
        for (let k = 0; k < n; k++) {
          const q = off(flank * (26 + k * 3), k * 4);
          g.beasts.push(this.beasts.spawn('green', q.x, q.z));
        }
        break;
      }
      case 'stag': {
        const q = off(flank * 30);
        g.beasts.push(this.beasts.spawn('blue', q.x, q.z));
        break;
      }
      case 'dire': {
        const q = off(flank * 34);
        g.beasts.push(this.beasts.spawn('dire', q.x, q.z));
        break;
      }
      case 'orcs': {
        // A raiding party out of the marches: three orcs coming through the grass.
        for (let k = 0; k < 3; k++) {
          const q = off(flank * (24 + k * 2.5), k * 3 - 3);
          g.orcs.push(new OrcMob(q.setY(q.y + 0.3), this.scene, this.fx));
        }
        break;
      }
      case 'undead': {
        // The barrow dead, clawing up out of the verge.
        for (let k = 0; k < 3; k++) {
          const q = off(flank * (12 + k * 3), k * 4 - 4);
          g.dead.push(new Undead(k === 0 ? 'zombie' : 'skeleton', q, Math.random() * 6, this.scene, this.fx));
        }
        break;
      }
      case 'bandits': {
        // An ambush: two cutthroats in the brush either side, a crossbowman behind.
        for (const [lat, along, role] of [[14, 0, 'sword'], [-14, 4, 'sword'], [22 * flank, -10, 'crossbow']] as const) {
          const q = off(lat, along);
          g.bandits.push(new Bandit(role, q, this.scene, this.bolts));
        }
        break;
      }
      default: {
        const looks = LOOKS[kind] ?? LOOKS.traveller;
        const n = kind === 'traveller' || kind === 'merchant' ? 1 : kind === 'adventurers' || kind === 'knights' ? 3 : 2;
        for (let k = 0; k < n; k++) {
          const w = new Walker(this.scene, kind, looks[k % looks.length], NAMES[kind]?.[k % (NAMES[kind]?.length ?? 1)] ?? 'A Traveller');
          w.pos.copy(off(-dir * 1.8 + (k % 2) * 0.9 * dir, -k * 1.6 * dir));
          g.walkers.push(w);
        }
      }
    }
    this.groups.push(g);
  }

  private despawn(g: Group) {
    for (const w of g.walkers) w.dispose(this.scene);
    for (const b of g.beasts) if (b.alive) { b.alive = false; b.dispose(); }
    for (const b of g.bandits) if (!b.dead) b.dispose();
    for (const o of g.orcs) o.dispose();
    for (const u of g.dead) u.dispose();
  }

  update(dt: number, hour: number, rain: number) {
    const p = this.player.pos;
    // Which road are we on (if any)?
    let route = ROUTES[0], s = 0, lateral = Infinity, onRoad = pointAlong(this.kr, 0);
    for (const rt of ROUTES) {
      const r = road(rt.id);
      const rs = distanceAlong(r, p.x, p.z), q = pointAlong(r, rs), lat = Math.hypot(p.x - q.x, p.z - q.z);
      if (lat < lateral) (route = rt), (s = rs), (lateral = lat), (onRoad = q);
    }
    const len = roadLength(road(route.id));
    // Spawn along the road away from the towns at either end.
    this.timer -= dt;
    if (this.enabled && this.timer <= 0 && lateral < 90 && s > route.from && s < len + route.to && this.groups.length < route.max) {
      this.timer = route.gap[0] + Math.random() * (route.gap[1] - route.gap[0]);
      const night = hour >= 21 || hour < 5;
      const table = TABLES[route.segment(s)][night ? 'night' : 'day'].map(([w, k]) => [k === 'traveller' || k === 'pilgrims' || k === 'merchant' ? w * (1 - rain * 0.6) : w, k] as [number, Kind]);
      const kind = this.roll(table);
      // Friendlies come toward you; ambushes wait ahead of you.
      const fwd = Math.sign(this.player.vel.x * onRoad.dir.x + this.player.vel.z * onRoad.dir.y) || (Math.random() < 0.5 ? 1 : -1);
      const ahead = fwd as 1 | -1;
      this.spawn(kind, s + ahead * (100 + Math.random() * 30), -ahead as 1 | -1, route);
    }
    // Walk the friendlies along the road; drop anything far behind.
    for (const g of this.groups) {
      for (const w of g.walkers) {
        if (w.talkT > 0) {
          w.talkT -= dt;
          w.yaw = Math.atan2(p.x - w.pos.x, p.z - w.pos.z);
          w.play('talk');
        } else {
          const gr = road(g.route.id);
          const here = distanceAlong(gr, w.pos.x, w.pos.z) + g.dir * 1.25 * dt;
          const q = pointAlong(gr, here);
          const side = new THREE.Vector2(-q.dir.y, q.dir.x).multiplyScalar(-g.dir * 1.8);
          const target = new THREE.Vector3(q.x + side.x, 0, q.z + side.y);
          const d = target.clone().sub(w.pos).setY(0);
          if (d.lengthSq() > 1e-4) w.yaw = Math.atan2(d.x, d.z);
          w.pos.set(target.x, heightAt(target.x, target.z), target.z);
          w.play('walk');
        }
        w.update(dt);
      }
      for (const b of g.bandits) b.update(dt, this.player);
      for (const o of g.orcs) o.update(dt, this.player);
      for (const u of g.dead) u.update(dt, this.player, g.dead);
      for (const o of g.orcs) if (o.dead) o.dispose();
      for (const u of g.dead) if (u.dead) u.dispose();
      g.orcs = g.orcs.filter((o) => !o.dead);
      g.dead = g.dead.filter((u) => !u.dead);
      g.center.copy(g.walkers[0]?.pos ?? g.beasts[0]?.position ?? g.bandits[0]?.position ?? g.orcs[0]?.position ?? g.dead[0]?.position ?? g.center);
    }
    for (const b of this.bandits) b.update(dt, this.player);
    for (let i = this.bandits.length - 1; i >= 0; i--) if (this.bandits[i].dead) this.bandits.splice(i, 1);
    this.bolts.update(dt, this.player);
    const keep: Group[] = [];
    for (const g of this.groups) {
      const alive = g.walkers.length || g.beasts.some((b) => b.alive) || g.bandits.some((b) => !b.dead) || g.orcs.length || g.dead.length;
      if (!alive || g.center.distanceTo(p) > 260) this.despawn(g);
      else keep.push(g);
    }
    this.groups = keep;
    this.interactable.update(p);
  }

  /** Put a named group down (quests: the Hollow Ridge camp). */
  addBandit(b: Bandit) {
    this.bandits.push(b);
  }

  clear() {
    for (const g of this.groups) this.despawn(g);
    this.groups = [];
    this.bolts.clear();
  }

  setVisible(v: boolean) {
    for (const g of this.groups) for (const w of g.walkers) if (w.built) w.built.root.visible = v;
  }

  get groupCount() {
    return this.groups.length;
  }

  /** Force an encounter (tests, quests), on the King's Road unless another road is named. */
  force(kind: Kind, s: number, routeId = 'kings') {
    this.spawn(kind, s, 1, ROUTES.find((r) => r.id === routeId) ?? ROUTES[0]);
  }

  /** What's out on the roads right now (tests). */
  census() {
    return this.groups.map((g) => ({ kind: g.kind, route: g.route.id, orcs: g.orcs.length, dead: g.dead.length, bandits: g.bandits.length, beasts: g.beasts.length, walkers: g.walkers.length }));
  }
}
