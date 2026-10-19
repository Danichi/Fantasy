import * as THREE from 'three';
import { heightAt, roadDist } from '../terrainHeight';
import { events } from '../../core/events';
import { WildBeast, type WildCtx } from '../../enemies/wilds/wildBeast';
import { WILD_SPECS, ELITES, type WildSpec, type EliteAffix, type WildSpecId } from '../../enemies/wilds/wildSpecs';
import { Undead } from '../../enemies/undead';
import { LivingArmour } from '../../enemies/livingArmour';
import { Slime, type SlimeKind } from '../../enemies/slime';
import { dangerAt, dangerTier, DANGER_BANDS, terrainAt, nightness, noRoamAt, inWilds, type Terrain } from './danger';
import type { Target } from '../../combat/targets';
import type { Player } from '../../player/player';
import type { FX } from '../../fx/particles';
import type { WildsHooks } from './lairs';

// Roaming monsters in the land either side of the Crown Road and the King's
// Road: wandering packs and lone beasts you simply come across. Each spawn
// reads the danger where it lands (dangerAt), the kind of country (fields,
// forest, hills, marsh) and the hour, and picks from a table: near the Glen a
// pair of wolves or a boar; out in the wildlands bigger packs with an alpha;
// in the Dark Marches orc war-bands, dire wolves and, after dark, the dead and
// wisp hounds; under the capital, champions with two affixes. Packs drift
// across the country while you're near, spawn out of sight ahead of you, and
// are dropped once you've left them far behind, so only a handful exist at a
// time.

const MAX_GROUPS = 4;
const MAX_BODIES = 14;
const SPAWN_MIN = 78, SPAWN_MAX = 118;
const DESPAWN = 215;

interface Member {
  t: Target;
  update(dt: number, player: Player): void;
  done(): boolean;
  dispose(): void;
  engaged(): boolean;
  setHome?(p: THREE.Vector3): void;
}

interface Group {
  label: string;
  members: Member[];
  home: THREE.Vector3;
  target: THREE.Vector3 | null;
  restT: number;
  danger: number;
  night: boolean;
  howled: boolean;
  spec?: WildSpec;
  offsets: THREE.Vector3[];
}

interface Entry {
  label: string;
  w: number;
  /** danger range it appears in */
  min: number;
  max?: number;
  terrain?: Terrain[];
  time?: 'day' | 'night';
  build(s: Spawner): void;
}

/** What gets built for a spawn (the roaming system implements it). */
interface Spawner {
  danger: number;
  night: boolean;
  pack(id: WildSpecId, size?: [number, number]): void;
  undead(n: number): void;
  knights(n: number): void;
  slimes(n: number): void;
}

const ALL: Terrain[] = ['fields', 'forest', 'hills', 'marsh'];
const TABLE: Entry[] = [
  // ---- the Glen's edge and the borderland ----
  { label: 'wolves', w: 4, min: 0, terrain: ['fields', 'forest', 'hills'], build: (s) => s.pack('wolf') },
  { label: 'foxes', w: 2, min: 0, max: 0.35, terrain: ['fields', 'forest'], build: (s) => s.pack('fox') },
  { label: 'boar', w: 3, min: 0, max: 0.75, terrain: ['forest', 'fields', 'marsh'], time: 'day', build: (s) => s.pack('boar') },
  { label: 'stag', w: 1.5, min: 0.05, terrain: ['forest', 'fields'], time: 'day', build: (s) => s.pack('stag') },
  { label: 'goblins', w: 2.5, min: 0.15, terrain: ['hills', 'forest', 'fields'], build: (s) => { s.pack('goblin'); if (s.danger > 0.3) s.pack('goblinSlinger'); } },
  { label: 'slimes', w: 4, min: 0, terrain: ['marsh'], build: (s) => s.slimes(2 + Math.round(s.danger * 3)) },
  // ---- the wildlands ----
  { label: 'aurochs', w: 2, min: 0.3, terrain: ['fields', 'hills'], time: 'day', build: (s) => s.pack('aurochs') },
  { label: 'dire wolf', w: 1.5, min: 0.35, terrain: ['forest', 'hills', 'fields'], time: 'night', build: (s) => { s.pack('direWolf'); s.pack('wolf', [2, 3]); } },
  { label: 'dire wolf', w: 0.8, min: 0.45, terrain: ['forest', 'hills'], time: 'day', build: (s) => s.pack('direWolf') },
  { label: 'wisp hounds', w: 1.6, min: 0.4, terrain: ALL, time: 'night', build: (s) => s.pack('wispHound') },
  { label: 'risen dead', w: 2, min: 0.5, terrain: ALL, time: 'night', build: (s) => s.undead(2 + Math.round(s.danger * 3)) },
  // ---- the Dark Marches and the Crown's shadow ----
  { label: 'orc war-band', w: 3, min: 0.55, terrain: ['fields', 'hills', 'forest'], build: (s) => { s.pack('orc'); if (s.danger > 0.75) s.pack('goblinSlinger', [1, 2]); } },
  { label: 'hollow knights', w: 1.4, min: 0.75, terrain: ALL, time: 'night', build: (s) => { s.knights(1 + Math.round(Math.random())); s.undead(2); } },
  { label: 'great hunt', w: 1.2, min: 0.8, terrain: ['forest', 'fields'], build: (s) => { s.pack('direWolf', [1, 2]); s.pack('wolf', [2, 3]); } },
];

export class Roamers {
  private groups: Group[] = [];
  private timer = 6;
  private registry = new Map<number, { spec?: WildSpec; danger: number; elite: boolean }>();
  private bandSeen = -1;
  enabled = true;
  /** extra no-roam circles (the lairs) */
  readonly avoid: [number, number, number][] = [];

  constructor(private scene: THREE.Scene, private fx: FX, private ctx: WildCtx, private hooks: WildsHooks) {
    ctx.onHowl = (b) => this.howled(b);
    events.on('enemyDied', ({ at, enemyId }) => {
      const r = this.registry.get(enemyId);
      if (!r) return;
      this.registry.delete(enemyId);
      this.loot(at, r);
    });
  }

  // ---- spawning ----------------------------------------------------------------------------

  private pickSpot(player: Player): THREE.Vector3 | null {
    const p = player.pos;
    const moving = Math.hypot(player.vel.x, player.vel.z) > 1;
    const heading = moving ? Math.atan2(player.vel.x, player.vel.z) : Math.random() * Math.PI * 2;
    for (let tries = 0; tries < 10; tries++) {
      const a = heading + (Math.random() - 0.5) * (moving ? 2.4 : Math.PI * 2);
      const d = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
      const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
      if (!inWilds(x, z) || noRoamAt(x, z, 20)) continue;
      if (this.avoid.some(([cx, cz, r]) => (x - cx) ** 2 + (z - cz) ** 2 < (r + 40) ** 2)) continue;
      if (roadDist(x, z) < 16) continue;
      const h = heightAt(x, z);
      if (h < 0.4) continue; // water
      if (this.groups.some((g) => g.home.distanceToSquared(new THREE.Vector3(x, g.home.y, z)) < 70 * 70)) continue;
      return new THREE.Vector3(x, h, z);
    }
    return null;
  }

  private roll(danger: number, terrain: Terrain, night: boolean) {
    const ok = TABLE.filter((e) => danger >= e.min && danger <= (e.max ?? 2) && (e.terrain ?? ALL).includes(terrain) && (!e.time || (e.time === 'night') === night));
    if (!ok.length) return null;
    let r = Math.random() * ok.reduce((a, e) => a + e.w, 0);
    for (const e of ok) if ((r -= e.w) <= 0) return e;
    return ok[0];
  }

  /** Elite affixes for a creature spawned at this danger (champions get two near the capital). */
  private eliteRoll(danger: number, night: boolean, leader: boolean): EliteAffix[] {
    const chance = 0.02 + danger * 0.28 + (night ? 0.08 : 0) + (leader ? 0.1 : 0);
    if (Math.random() > chance) return [];
    const pool = ELITES.filter((e) => e.min <= danger && (!e.night || night));
    if (!pool.length) return [];
    const first = pool[Math.floor(Math.random() * pool.length)];
    const out = [first];
    if (danger > 0.8 && Math.random() < 0.35) {
      const rest = pool.filter((e) => e !== first);
      if (rest.length) out.push(rest[Math.floor(Math.random() * rest.length)]);
    }
    return out;
  }

  private spawnGroup(at: THREE.Vector3, entry: Entry, danger: number, night: boolean) {
    const g: Group = { label: entry.label, members: [], home: at.clone(), target: null, restT: 4 + Math.random() * 8, danger, night, howled: false, offsets: [] };
    const scene = this.scene, fx = this.fx;
    const place = (k: number) => {
      const a = (k / 5) * Math.PI * 2 + Math.random() * 0.6, r = k === 0 ? 0 : 2.5 + Math.random() * 3;
      const off = new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r);
      const p = at.clone().add(off);
      p.y = heightAt(p.x, p.z);
      return { p, off };
    };
    const self = this;
    const spawner: Spawner = {
      danger, night,
      pack(id, size) {
        const spec: WildSpec = WILD_SPECS[id];
        const [lo, hi] = size ?? spec.pack;
        const n = Math.min(6, lo + Math.floor(Math.random() * (hi - lo + 1)) + (size ? 0 : Math.round(danger * 1.6 * Math.random())));
        const pack: WildBeast[] = [];
        g.spec ??= spec;
        for (let k = 0; k < n; k++) {
          const { p, off } = place(g.members.length);
          const elites = self.eliteRoll(danger, night, k === 0 && n > 1);
          const b = new WildBeast(spec, p, scene, fx, self.ctx, { danger, elites, pack, leash: 55 });
          pack.push(b);
          self.registry.set(b.id, { spec, danger, elite: elites.length > 0 });
          g.offsets.push(off);
          g.members.push({ t: b, update: (dt, pl) => b.update(dt, pl), done: () => b.dead || (!b.alive && !b.group.parent), dispose: () => b.dispose(), engaged: () => b.engaged, setHome: (h) => b.home.copy(h).add(off) });
        }
      },
      undead(n) {
        const crowd: Undead[] = [];
        for (let k = 0; k < n; k++) {
          const { p, off } = place(g.members.length);
          const u = new Undead(Math.random() < 0.45 ? 'zombie' : 'skeleton', p, Math.random() * 6, scene, fx);
          u.hp = u.maxHp = Math.round(u.maxHp * (1 + danger));
          crowd.push(u);
          self.registry.set(u.id, { danger, elite: false });
          g.offsets.push(off);
          g.members.push({ t: u, update: (dt, pl) => u.update(dt, pl, crowd), done: () => u.dead, dispose: () => u.dispose(), engaged: () => u.alive && u.position.distanceTo(self.playerPos) < 30 });
        }
      },
      knights(n) {
        for (let k = 0; k < n; k++) {
          const { p, off } = place(g.members.length);
          const a = new LivingArmour(p.setY(p.y + 0.4), scene, fx);
          a.kind = 'hollowKnight';
          a.hp = a.maxHp = Math.round(a.maxHp * (1 + danger * 0.8));
          self.registry.set(a.id, { danger, elite: true });
          g.offsets.push(off);
          g.members.push({ t: a, update: (dt, pl) => a.update(dt, pl), done: () => a.dead, dispose: () => a.dispose(), engaged: () => a.alive && a.position.distanceTo(self.playerPos) < 30 });
        }
      },
      slimes(n) {
        const crowd: Slime[] = [];
        const kinds: SlimeKind[] = danger > 0.65 ? ['magma', 'blue', 'cave'] : danger > 0.35 ? ['blue', 'cave', 'green'] : ['green', 'green', 'cave'];
        for (let k = 0; k < n; k++) {
          const { p, off } = place(g.members.length);
          const s = new Slime(kinds[k % kinds.length], p, scene, fx);
          s.hp = s.maxHp = Math.round(s.maxHp * (1 + danger));
          crowd.push(s);
          self.registry.set(s.id, { danger, elite: false });
          g.offsets.push(off);
          g.members.push({ t: s, update: (dt, pl) => s.update(dt, pl, crowd), done: () => s.dead, dispose: () => s.dispose(), engaged: () => s.alive && s.position.distanceTo(self.playerPos) < 25 });
        }
      },
    };
    entry.build(spawner);
    if (g.members.length) this.groups.push(g);
  }
  /** where the player is (the undead and slimes are "engaged" by distance) */
  private playerPos = new THREE.Vector3();

  /** An alpha howls: in the deeper wilds, more of its kind come running. */
  private howled(b: WildBeast) {
    const g = this.groups.find((gg) => gg.members.some((m) => m.t === b));
    if (!g || g.howled || g.danger < 0.35 || this.bodies >= MAX_BODIES) return;
    g.howled = true;
    const n = 1 + Math.round(g.danger * 1.5);
    const pack = b.pack ?? [b];
    for (let k = 0; k < n; k++) {
      const a = b.facing + Math.PI + (Math.random() - 0.5) * 1.4;
      const p = b.position.clone().add(new THREE.Vector3(Math.sin(a) * 26, 0, Math.cos(a) * 26));
      p.y = heightAt(p.x, p.z);
      const nb = new WildBeast(b.spec, p, this.scene, this.fx, this.ctx, { danger: g.danger, pack, alerted: true, leash: 70 });
      pack.push(nb);
      this.registry.set(nb.id, { spec: b.spec, danger: g.danger, elite: false });
      const off = new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6);
      g.offsets.push(off);
      g.members.push({ t: nb, update: (dt, pl) => nb.update(dt, pl), done: () => nb.dead || (!nb.alive && !nb.group.parent), dispose: () => nb.dispose(), engaged: () => nb.engaged, setHome: (h) => nb.home.copy(h).add(off) });
    }
    this.hooks.toast(`The ${b.name} howls — more answer from the trees!`);
  }

  // ---- loot --------------------------------------------------------------------------------

  private loot(at: THREE.Vector3, r: { spec?: WildSpec; danger: number; elite: boolean }) {
    // The deeper the wilds, the more a kill is worth.
    const bonus = Math.round((r.spec ? 8 + r.spec.hp * 0.2 : 14) * r.danger * (r.elite ? 2.5 : 1));
    if (bonus > 0) this.hooks.reward?.(at, bonus, Math.round(bonus / 3));
    for (const [id, chance, max] of r.spec?.drops ?? []) {
      if (Math.random() < chance * (r.elite ? 1.5 : 1)) this.hooks.give(id, 1 + Math.floor(Math.random() * max));
    }
    if (r.elite && Math.random() < 0.45 + r.danger * 0.3) this.hooks.give('championTrophy', 1);
  }

  // ---- per step ----------------------------------------------------------------------------

  get bodies() {
    return this.groups.reduce((n, g) => n + g.members.length, 0);
  }

  update(dt: number, player: Player) {
    const p = player.pos;
    this.playerPos.copy(p);
    const hour = this.hooks.hour();
    const night = nightness(hour) > 0.5;
    // Crossing into a deeper band of the wilds: a warning, once per save.
    if (inWilds(p.x, p.z)) {
      const band = dangerTier(dangerAt(p.x, p.z));
      if (band > this.bandSeen) {
        this.bandSeen = band;
        const key = 'wildsBand:' + band;
        if (band > 0 && !this.hooks.flags[key]) {
          this.hooks.flags[key] = true;
          this.hooks.toast(`${DANGER_BANDS[band].name}. ${DANGER_BANDS[band].note}`);
        }
      }
    }
    // Spawn out of sight, ahead of the player.
    this.timer -= dt;
    if (this.enabled && this.timer <= 0) {
      this.timer = 5 + Math.random() * 6;
      if (this.groups.length < MAX_GROUPS && this.bodies < MAX_BODIES - 2 && inWilds(p.x, p.z) && !player.dead) {
        const at = this.pickSpot(player);
        if (at) {
          const danger = dangerAt(at.x, at.z);
          // The Glen's edge is quiet: fewer spawns there than in the deep wilds.
          if (Math.random() < 0.45 + danger * 0.55) {
            const e = this.roll(danger, terrainAt(at.x, at.z), night);
            if (e) this.spawnGroup(at, e, danger, night);
          }
        }
      }
    }
    const keep: Group[] = [];
    for (const g of this.groups) {
      this.wander(g, dt);
      for (const m of g.members) m.update(dt, player);
      for (const m of g.members.filter((m) => m.done())) m.dispose();
      g.members = g.members.filter((m) => !m.done());
      // Where the group is now (its living members).
      let cx = 0, cz = 0, n = 0;
      for (const m of g.members) if (m.t.alive) (cx += m.t.position.x), (cz += m.t.position.z), n++;
      const far = n ? Math.hypot(cx / n - p.x, cz / n - p.z) > DESPAWN : true;
      const engaged = g.members.some((m) => m.engaged());
      // The night's dead crumble at sunrise when nobody is watching.
      const dawn = g.night && !night && g.label.includes('dead') && Math.hypot(g.home.x - p.x, g.home.z - p.z) > 60;
      if (!g.members.length || ((far || dawn) && !engaged) || !this.enabled) {
        for (const m of g.members) m.dispose();
        continue;
      }
      keep.push(g);
    }
    this.groups = keep;
  }

  /** Packs drift across the country: a slow walk to a new spot, a rest, and on. */
  private wander(g: Group, dt: number) {
    if (g.members.some((m) => m.engaged())) return;
    if (!g.target) {
      g.restT -= dt;
      if (g.restT > 0) return;
      for (let tries = 0; tries < 6; tries++) {
        const a = Math.random() * Math.PI * 2, d = 25 + Math.random() * 30;
        const x = g.home.x + Math.sin(a) * d, z = g.home.z + Math.cos(a) * d;
        if (!inWilds(x, z) || noRoamAt(x, z, 20) || roadDist(x, z) < 10 || heightAt(x, z) < 0.4) continue;
        if (this.avoid.some(([cx, cz, r]) => (x - cx) ** 2 + (z - cz) ** 2 < (r + 40) ** 2)) continue;
        g.target = new THREE.Vector3(x, 0, z);
        break;
      }
      g.restT = 10 + Math.random() * 16;
      return;
    }
    const to = g.target.clone().sub(g.home).setY(0);
    const d = to.length();
    if (d < 1) {
      g.target = null;
      return;
    }
    g.home.addScaledVector(to.normalize(), Math.min(d, 1.1 * dt));
    g.home.y = heightAt(g.home.x, g.home.z);
    for (const m of g.members) m.setHome?.(g.home);
  }

  clear() {
    for (const g of this.groups) for (const m of g.members) m.dispose();
    this.groups = [];
  }

  /** Is anything hostile hunting the player (no resting, no fast travel)? */
  hostileNear(p: THREE.Vector3) {
    return this.groups.some((g) => g.members.some((m) => m.engaged() && m.t.alive && m.t.position.distanceTo(p) < 40));
  }

  /** Force a spawn here (tests and the console): an entry by label, or the table's pick. */
  force(at: THREE.Vector3, label?: string, night = false) {
    const danger = dangerAt(at.x, at.z);
    const e = label ? TABLE.find((t) => t.label === label) : this.roll(danger, terrainAt(at.x, at.z), night);
    if (e) this.spawnGroup(at.clone().setY(heightAt(at.x, at.z)), e, danger, night);
  }

  census() {
    return this.groups.map((g) => ({ label: g.label, danger: +g.danger.toFixed(2), members: g.members.map((m) => ({ name: (m.t as { name?: string }).name ?? m.t.kind, kind: m.t.kind, hp: Math.round(m.t.hp), alive: m.t.alive })) }));
  }
}
