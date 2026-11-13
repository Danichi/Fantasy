import * as THREE from 'three';
import { GW, CELL, WORLD_X0, WORLD_Z0, reliefAt, macroHeight, RELIEF, SEA_LEVEL, regionAt } from './worldMap';
import { heightAt, roadDist } from './terrainHeight';
import { mulberry32 } from '../core/math';
import { events } from '../core/events';
import { REGION_PIECES, REGION_NAMES, TREASURE_COUNT } from '../items/mapItems';
import type { ItemDef } from '../items/itemDefs';
import type { Discovery } from './discovery';
import type { Paper, PaperMark, WorldMapUI } from '../ui/worldMap';
import type { Interactable } from '../dungeon/instance';

// Cartography (docs/design/mapping.md): what makes the world map more than an
// automap.
//  - Every region's map is torn into pieces. One is sold by the Royal
//    Cartographer, one rides in the region's field boss's hoard, the rest lie
//    in the world: a dead surveyor's satchel, a scroll case in a cairn, a
//    bird's nest, a box under a loose stone. Read one and its patch inks in.
//  - All the pieces of a region: the Full Chart, and the cartographer pays.
//  - Old charts ink a whole region, but some of what they show is gone.
//  - The guilds keep rumour maps on their walls. Nothing on them reaches your
//    map until you copy it by hand (or pay the clerk), and rumours move.
//  - Treasure maps are riddles: a patch of land and an X. Find it, dig.
//  - From high ground you see far: the land below sketches itself in.
// Saved in the world flags: 'mc:<cacheId>' (searched), 'dug:<n>', 'fc:<region>'
// (chart shown to the cartographer), 'snap:<bossId>', 'rep:<bossId>' (found,
// not yet reported), 'reported:<bossId>'.

export interface Patch {
  id: string; // the piece's item id
  region: string;
  index: number;
  of: number;
  cells: number[];
  cx: number;
  cz: number;
}

type CacheKind = 'satchel' | 'case' | 'nest' | 'stone';
export interface Cache {
  id: string;
  x: number;
  z: number;
  kind: CacheKind;
  items: string[];
  region: string;
}

export interface BossInfo {
  id: string;
  name: string;
  title: string;
  x: number;
  z: number;
  found: boolean;
  slain: boolean;
  heard: boolean;
}

export interface CartoDeps {
  discovery: Discovery;
  map: WorldMapUI;
  scene: THREE.Scene;
  flags: Record<string, unknown>;
  give(id: string, n?: number): void;
  has(id: string): boolean;
  take(id: string, n?: number): boolean;
  gold(): number;
  addGold(n: number): void;
  toast(m: string): void;
  card(title: string, sub?: string, region?: string): void;
  xp(n: number): void;
  day(): number;
  save(): void;
  bosses(): BossInfo[];
}

const HOW: Record<CacheKind, string> = {
  satchel: "Search the dead surveyor's satchel",
  case: 'Open the scroll case in the cairn',
  nest: "Reach into the old bird's nest",
  stone: 'Lift the loose stone',
};
const BUILD_R = 140;
const REACH = 2.6;

const dry = (x: number, z: number) => {
  const rel = reliefAt(x, z);
  if (rel === RELIEF.deep || rel === RELIEF.shelf || rel === RELIEF.lava) return false;
  return macroHeight(x, z) > SEA_LEVEL + 1.5;
};
const cellXZ = (k: number) => ({ x: WORLD_X0 + ((k % GW) + 0.5) * CELL, z: WORLD_Z0 + (Math.floor(k / GW) + 0.5) * CELL });

export class Cartography {
  private patchList: Patch[] | null = null;
  readonly caches: Cache[] = [];
  /** where each treasure map's X is */
  readonly treasures: { x: number; z: number; region: string }[] = [];
  /** field boss -> the piece in its hoard */
  readonly bossPiece = new Map<string, string>();
  /** region -> the piece the cartographer sells */
  readonly shopPiece = new Map<string, string>();
  readonly interactable: Interactable;
  /** the paper laid beside your map when you came from a guild's wall */
  private wall: string | null = null;
  private built = new Map<string, THREE.Object3D>();
  private nearest: Cache | null = null;
  private nearDig = -1;
  private t = 0;
  private vistaT = 0;
  private mats = {
    leather: new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.9 }),
    bone: new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.8 }),
    brass: new THREE.MeshStandardMaterial({ color: 0x8a6a30, roughness: 0.45, metalness: 0.8 }),
    stone: new THREE.MeshStandardMaterial({ color: 0x77736a, roughness: 0.95 }),
    twig: new THREE.MeshStandardMaterial({ color: 0x5a4a32, roughness: 1 }),
    paper: new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9, emissive: 0x3a2a10, emissiveIntensity: 0.25 }),
    dirt: new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 1 }),
  };

  constructor(private d: CartoDeps) {
    this.interactable = {
      pos: new THREE.Vector3(0, -9999, 0),
      radius: REACH,
      label: () => (this.nearDig >= 0 ? 'Dig at the X' : this.nearest ? HOW[this.nearest.kind] : ''),
      enabled: () => this.nearDig >= 0 || (!!this.nearest && !this.d.flags['mc:' + this.nearest.id]),
      action: () => (this.nearDig >= 0 ? this.dig(this.nearDig) : this.nearest && this.search(this.nearest)),
    };
    d.map.papers = () => this.papers();
    d.map.chartProgress = () => this.progress();
    d.map.onCopy = (_p, m) => this.d.toast(`You copy “${m.label}” onto your map, as best you can.`);
    events.on('bossSlain', ({ id }) => this.bossDrop(id));
  }

  // ---- the region pieces -------------------------------------------------------------
  /** Each region's cells cut into pieces around well-spread seeds (deterministic). */
  patches() {
    if (this.patchList) return this.patchList;
    const out: Patch[] = [];
    for (const [region, k] of Object.entries(REGION_PIECES)) {
      const cells = this.d.discovery.regionCells(region);
      if (!cells.length) continue;
      // Farthest-point seeds over a thinned sample, starting near the middle.
      const sample = cells.filter((_, i) => i % 5 === 0);
      let mx = 0, mz = 0;
      for (const c of sample) { const p = cellXZ(c); mx += p.x; mz += p.z; }
      mx /= sample.length; mz /= sample.length;
      const seeds: { x: number; z: number }[] = [];
      let first = sample[0], fd = Infinity;
      for (const c of sample) { const p = cellXZ(c); const dd = (p.x - mx) ** 2 + (p.z - mz) ** 2; if (dd < fd) { fd = dd; first = c; } }
      seeds.push(cellXZ(first));
      while (seeds.length < k) {
        let best = sample[0], bd = -1;
        for (const c of sample) {
          const p = cellXZ(c);
          let m = Infinity;
          for (const s of seeds) m = Math.min(m, (p.x - s.x) ** 2 + (p.z - s.z) ** 2);
          if (m > bd) { bd = m; best = c; }
        }
        seeds.push(cellXZ(best));
      }
      const parts: number[][] = seeds.map(() => []);
      for (const c of cells) {
        const p = cellXZ(c);
        let bi = 0, bd = Infinity;
        seeds.forEach((s, i) => { const dd = (p.x - s.x) ** 2 + (p.z - s.z) ** 2; if (dd < bd) { bd = dd; bi = i; } });
        parts[bi].push(c);
      }
      // Number the pieces west to east, north to south, so "piece 1" is a stable place.
      const order = seeds.map((s, i) => ({ s, i })).sort((a, b) => a.s.z - b.s.z || a.s.x - b.s.x);
      order.forEach(({ s, i }, n) => {
        out.push({ id: `mapPiece_${region}_${n + 1}`, region, index: n + 1, of: k, cells: parts[i], cx: s.x, cz: s.z });
      });
    }
    this.patchList = out;
    return out;
  }

  /**
   * Put the pieces, the treasure and the caches in the world (after the macro
   * map has loaded). `avoid`: circles to keep clear (sites, towns, lairs).
   * `bossHomes`: field bosses by where they live.
   */
  place(avoid: [number, number, number][], bossHomes: { id: string; x: number; z: number }[]) {
    const rnd = mulberry32(51723);
    const clear = (x: number, z: number) => {
      if (!dry(x, z) || roadDist(x, z) < 9) return false;
      for (const [cx, cz, cr] of avoid) if ((x - cx) ** 2 + (z - cz) ** 2 < (cr + 6) ** 2) return false;
      return !this.caches.some((c) => (c.x - x) ** 2 + (c.z - z) ** 2 < 60 * 60);
    };
    /** a dry spot near a point, inside a set of cells if given */
    const spotNear = (x0: number, z0: number, inside?: Set<number>) => {
      for (let tries = 0; tries < 400; tries++) {
        const r = 30 + tries * 4, a = rnd() * Math.PI * 2;
        const x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
        if (inside) {
          const gx = Math.floor((x - WORLD_X0) / CELL), gz = Math.floor((z - WORLD_Z0) / CELL);
          if (!inside.has(gz * GW + gx)) continue;
        }
        if (clear(x, z)) return { x, z };
      }
      return null;
    };
    const kinds: CacheKind[] = ['satchel', 'case', 'nest', 'stone'];
    let treasureHand = 0;
    for (const p of this.patches()) {
      if (p.index === 1) { this.shopPiece.set(p.region, p.id); continue; }
      if (p.index === 2) {
        const boss = bossHomes.find((b) => regionAt(b.x, b.z) === p.region && !this.bossPiece.has(b.id));
        if (boss) { this.bossPiece.set(boss.id, p.id); continue; }
      }
      const at = spotNear(p.cx, p.cz, new Set(p.cells));
      if (!at) { this.shopPiece.set(p.region + ':' + p.index, p.id); continue; }
      const items = [p.id];
      // every third cache has a treasure map tucked in with the piece
      if (this.caches.length % 3 === 1 && treasureHand < TREASURE_COUNT) items.push(`treasureMap_${treasureHand++}`);
      this.caches.push({ id: `c${Math.round(at.x)}_${Math.round(at.z)}`, x: at.x, z: at.z, kind: kinds[Math.floor(rnd() * kinds.length)], items, region: p.region });
    }
    // The treasure: one X per map, spread over the regions, never on a road.
    const regions = Object.keys(REGION_PIECES);
    for (let i = 0; i < TREASURE_COUNT; i++) {
      const region = regions[i % regions.length];
      const cells = this.patches().filter((p) => p.region === region).flatMap((p) => p.cells);
      let at: { x: number; z: number } | null = null;
      for (let t = 0; t < 60 && !at && cells.length; t++) {
        const c = cellXZ(cells[Math.floor(rnd() * cells.length)]);
        if (clear(c.x, c.z)) at = c;
      }
      this.treasures.push(at ? { ...at, region } : { x: 0, z: 0, region: '' });
    }
  }

  /** Treasure maps that no cache holds: these turn up in fishing nets and on the dead. */
  looseTreasure() {
    const held = new Set(this.caches.flatMap((c) => c.items));
    const out: string[] = [];
    for (let i = 0; i < TREASURE_COUNT; i++) if (!held.has(`treasureMap_${i}`) && this.treasures[i].region) out.push(`treasureMap_${i}`);
    return out;
  }

  // ---- reading maps -----------------------------------------------------------------
  /** A map item was used from the bags (player.onConsume). */
  read(def: ItemDef) {
    const kind = def.use?.kind;
    const dsc = this.d.discovery;
    if (kind === 'map') {
      dsc.pieces.add(def.id);
      if (def.id.startsWith('mapPiece_')) {
        const p = this.patches().find((q) => q.id === def.id);
        if (!p) return;
        dsc.inkCells(p.cells);
        this.d.map.showReveal(p.cx, p.cz, `${REGION_NAMES[p.region]}, piece ${p.index} of ${p.of}`);
        this.checkRegion(p.region);
      } else if (def.id.startsWith('oldChart_')) {
        const region = def.id.slice('oldChart_'.length);
        dsc.inkRegion(region);
        this.chartErrors(region);
        const c = this.patches().find((q) => q.region === region);
        if (c) this.d.map.showReveal(c.cx, c.cz, `An old chart of ${REGION_NAMES[region]}`);
      } else if (def.id === 'seaChart') {
        for (const r of ['azureIsles', 'emeraldIsles', 'shatteredIsles', 'sunkenIsles']) dsc.inkRegion(r);
        const c = this.patches().find((q) => q.region === 'azureIsles');
        if (c) this.d.map.showReveal(c.cx, c.cz, 'The Western Isles');
      }
    } else if (kind === 'survey') {
      // Everything you've walked within 600 m goes down in ink.
      const pos = this.lastPos;
      const cells: number[] = [];
      const n = Math.ceil(600 / CELL);
      const gx = Math.floor((pos.x - WORLD_X0) / CELL), gz = Math.floor((pos.z - WORLD_Z0) / CELL);
      for (let dz = -n; dz <= n; dz++) for (let dx = -n; dx <= n; dx++) {
        if (dx * dx + dz * dz > n * n) continue;
        if (dsc.isSketched(gx + dx, gz + dz)) cells.push((gz + dz) * GW + gx + dx);
      }
      const got = dsc.inkCells(cells);
      this.d.map.showReveal(pos.x, pos.z, got ? 'Surveyed' : 'Nothing new to survey here');
    } else if (kind === 'treasure') {
      dsc.pieces.add(def.id);
      this.d.toast('A treasure map. Open your map (M) and lay it beside your sheet to work out where the X is.');
    }
    this.d.save();
  }

  private lastPos = new THREE.Vector3();

  /** Every piece of a region read: the Full Chart. */
  private checkRegion(region: string) {
    const n = REGION_PIECES[region];
    for (let i = 1; i <= n; i++) if (!this.d.discovery.pieces.has(`mapPiece_${region}_${i}`)) return;
    if (this.d.flags['chart:' + region]) return;
    this.d.flags['chart:' + region] = true;
    this.d.discovery.inkRegion(region);
    this.d.give(`fullChart_${region}`, 1);
    this.d.xp(400);
    const done = Object.keys(REGION_PIECES).filter((r) => this.d.flags['chart:' + r]).length;
    const title = done >= 18 ? 'Mapmaker of the Known World' : done >= 10 ? 'Cartographer' : done >= 3 ? 'Surveyor' : '';
    this.d.card(`${REGION_NAMES[region]}: Fully Charted`, title && [3, 10, 18].includes(done) ? `You are known now as ${title}` : `${done} of 18 regions charted`, region);
  }

  /** An old chart's mistakes: places it shows that aren't there any more. */
  private chartErrors(region: string) {
    const rnd = mulberry32(region.length * 977 + region.charCodeAt(0));
    const cells = this.d.discovery.regionCells(region);
    const WHAT = ['Village', 'Bridge', 'Watchtower', 'Ferry', 'Inn', 'Shrine', 'Mill'];
    const NAMES = ['Thornby', 'Ashford', 'Wenlow', 'Coldharbour', 'Marrowdale', 'Fenwick', 'Saltmere', 'Brackwater'];
    const count = 1 + Math.floor(rnd() * 3);
    for (let i = 0, made = 0; i < 40 && made < count && cells.length; i++) {
      const c = cellXZ(cells[Math.floor(rnd() * cells.length)]);
      if (!dry(c.x, c.z)) continue;
      const what = WHAT[Math.floor(rnd() * WHAT.length)], name = NAMES[Math.floor(rnd() * NAMES.length)];
      this.d.discovery.addMark({ kind: 'pin', x: c.x, z: c.z, glyph: what === 'Bridge' ? 'signpost' : what === 'Watchtower' ? 'tower' : 'house', color: '#5a4030', text: `${what} of ${name} (old chart)`, err: true });
      made++;
    }
  }

  // ---- the world caches -------------------------------------------------------------
  private search(c: Cache) {
    if (this.d.flags['mc:' + c.id]) return;
    this.d.flags['mc:' + c.id] = true;
    for (const id of c.items) this.d.give(id, 1);
    const what = c.items.length > 1 ? 'a piece of a map, and a scrap with an X on it' : 'a piece of a map';
    this.d.toast(`${HOW[c.kind].replace(/^(Search|Open|Reach into|Lift) /, 'In ').replace(/^In the loose stone/, 'Under the stone')}: ${what}.`);
    this.d.save();
  }

  private dig(i: number) {
    if (this.d.flags['dug:' + i]) return;
    this.d.flags['dug:' + i] = true;
    const gold = 120 + ((i * 37) % 160);
    this.d.addGold(gold);
    const loot = ['oldChart_' + (this.treasures[i].region || 'cresha'), 'surveySheet', 'blankSheet'][i % 3];
    this.d.give(loot, 1);
    this.d.card('Treasure!', `${gold} gold, and something wrapped in oilcloth`);
    // the treasure map's X goes on your map, struck through
    this.d.discovery.addMark({ kind: 'pin', x: this.treasures[i].x, z: this.treasures[i].z, glyph: 'treasure', color: '#b3241c', text: 'Dug up', struck: true });
    this.d.save();
  }

  private buildCache(c: Cache) {
    const g = new THREE.Group();
    const m = this.mats;
    const box = (w: number, h: number, dd: number, mat: THREE.Material, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), mat);
      o.position.set(x, y, z);
      o.castShadow = true;
      g.add(o);
      return o;
    };
    const rnd = mulberry32(Math.abs(Math.round(c.x * 7 + c.z * 13)));
    if (c.kind === 'satchel') {
      // a fallen surveyor: skull, a few bones, the satchel with paper sticking out
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), m.bone);
      skull.position.set(-0.45, 0.1, 0.1);
      g.add(skull);
      for (let i = 0; i < 4; i++) box(0.04, 0.04, 0.34, m.bone, -0.15 + i * 0.09, 0.03, 0.15 + (rnd() - 0.5) * 0.1).rotation.y = rnd() * 0.6;
      box(0.34, 0.2, 0.12, m.leather, 0.25, 0.1, -0.1);
      box(0.22, 0.02, 0.16, m.paper, 0.25, 0.22, -0.1).rotation.z = 0.3;
      const staff = box(0.04, 0.04, 1.5, m.twig, 0.1, 0.03, 0.35);
      staff.rotation.y = 0.5;
    } else if (c.kind === 'case') {
      for (let i = 0; i < 6; i++) {
        const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28 - i * 0.03, 0), m.stone);
        s.position.set((rnd() - 0.5) * 0.2, 0.18 + i * 0.2, (rnd() - 0.5) * 0.2);
        s.rotation.set(rnd(), rnd(), rnd());
        g.add(s);
      }
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 10), m.brass);
      tube.rotation.z = Math.PI / 2;
      tube.position.set(0.32, 0.12, 0.1);
      g.add(tube);
    } else if (c.kind === 'nest') {
      const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.1, 9), m.twig);
      stump.position.y = 0.55;
      g.add(stump);
      const nest = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.08, 6, 12), m.twig);
      nest.rotation.x = Math.PI / 2;
      nest.position.y = 1.15;
      g.add(nest);
      box(0.16, 0.02, 0.12, m.paper, 0, 1.17, 0).rotation.y = 0.4;
    } else {
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), m.stone);
      s.scale.set(1.2, 0.45, 1);
      s.position.set(0, 0.12, 0);
      s.rotation.z = 0.25;
      g.add(s);
      box(0.6, 0.03, 0.5, m.dirt, 0.3, 0.01, 0);
      box(0.14, 0.02, 0.1, m.paper, 0.42, 0.04, 0.05);
    }
    g.position.set(c.x, heightAt(c.x, c.z), c.z);
    g.rotation.y = rnd() * Math.PI * 2;
    this.d.scene.add(g);
    this.built.set(c.id, g);
  }

  private drop(id: string) {
    const g = this.built.get(id);
    if (!g) return;
    this.d.scene.remove(g);
    g.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    this.built.delete(id);
  }

  /** Per frame (overworld only). */
  update(dt: number, pos: THREE.Vector3, active: boolean) {
    this.lastPos.copy(pos);
    if (!active) {
      for (const id of [...this.built.keys()]) this.drop(id);
      this.interactable.pos.set(0, -9999, 0);
      this.nearest = null;
      this.nearDig = -1;
      return;
    }
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 0.5;
      for (const c of this.caches) {
        const dd = Math.hypot(c.x - pos.x, c.z - pos.z);
        if (dd < BUILD_R && !this.built.has(c.id)) this.buildCache(c);
        else if (dd > BUILD_R + 30 && this.built.has(c.id)) this.drop(c.id);
      }
      this.checkMarks(pos);
    }
    let best: Cache | null = null, bd = REACH;
    for (const c of this.caches) {
      if (!this.built.has(c.id) || this.d.flags['mc:' + c.id]) continue;
      const dd = Math.hypot(c.x - pos.x, c.z - pos.z);
      if (dd < bd) { bd = dd; best = c; }
    }
    this.nearest = best;
    // Treasure: you can only dig where you hold the map for.
    this.nearDig = -1;
    for (let i = 0; i < this.treasures.length; i++) {
      const t = this.treasures[i];
      if (!t.region || this.d.flags['dug:' + i] || !this.d.discovery.pieces.has(`treasureMap_${i}`)) continue;
      if (Math.hypot(t.x - pos.x, t.z - pos.z) < 4) { this.nearDig = i; break; }
    }
    if (this.nearDig >= 0) { const t = this.treasures[this.nearDig]; this.interactable.pos.set(t.x, heightAt(t.x, t.z) + 0.5, t.z); }
    else if (best) this.interactable.pos.set(best.x, heightAt(best.x, best.z) + 0.5, best.z);
    else this.interactable.pos.set(0, -9999, 0);
    // From high ground you see far: the land below sketches itself in.
    this.vistaT -= dt;
    if (this.vistaT <= 0) {
      this.vistaT = 2;
      const h = pos.y;
      if (h > 120) this.d.discovery.sketchAround(pos.x, pos.z, Math.min(900, 300 + h * 2));
    }
  }

  /** Old chart errors you've come close to, and rumours you've run down. */
  private checkMarks(pos: THREE.Vector3) {
    for (const m of this.d.discovery.marks) {
      if (m.err && !m.struck && Math.hypot(m.x - pos.x, m.z - pos.z) < 140) {
        m.struck = true;
        m.text = (m.text ?? '').replace('(old chart)', '(not here any more)');
        this.d.toast('Nothing here. The old chart was wrong; you strike it out.');
      }
    }
    for (const b of this.d.bosses()) {
      if (!b.found || this.d.flags['snap:' + b.id]) continue;
      const copied = this.d.discovery.marks.find((m) => m.kind === 'rumour' && m.rumour === 'boss:' + b.id);
      if (!copied) continue;
      this.d.flags['snap:' + b.id] = true;
      // Your red circle becomes a skull, exactly where it lives.
      copied.kind = 'pin';
      copied.glyph = 'skull';
      copied.x = b.x;
      copied.z = b.z;
      copied.r = undefined;
      copied.text = b.name;
      this.d.flags['rep:' + b.id] = true;
      this.d.toast(`${b.name}: the rumour was true. Your map has it now. Report it at a guild hall for the finder's fee.`);
    }
  }

  // ---- the boss hoards ----------------------------------------------------------------
  private bossDrop(id: string) {
    const piece = this.bossPiece.get(id);
    if (!piece || this.d.has(piece) || this.d.discovery.pieces.has(piece)) return;
    this.d.give(piece, 1);
    this.d.toast('In its hoard, wrapped in a scrap of oilcloth: a piece of a map.');
  }

  // ---- the guild walls ----------------------------------------------------------------
  /** Lay a guild's wall map beside your sheet (from the Hunt Map tab). */
  openWall(hall: string, hallName: string) {
    this.wall = hall + '|' + hallName;
    this.d.map.toggle(true);
  }

  /** What the guild's wall knows, from the beasts' rumours, sightings and finds. */
  wallMarks(): PaperMark[] {
    const epoch = Math.floor(this.d.day() / 10);
    const copied = new Set(this.d.discovery.marks.filter((m) => m.rumour).map((m) => m.rumour!));
    const out: PaperMark[] = [];
    for (const b of this.d.bosses()) {
      if (b.slain) continue;
      const id = 'boss:' + b.id;
      if (b.found || this.d.flags['reported:' + b.id]) {
        out.push({ id, x: b.x, z: b.z, kind: 'lair', label: `${b.name}, ${b.title}`, glyph: 'skull', price: 20, copied: copied.has(id) });
        continue;
      }
      // A rumour drifts: every ten days the guild's best guess moves.
      const rnd = mulberry32(b.id.length * 7919 + b.id.charCodeAt(0) * 31 + epoch * 104729);
      const r = b.heard ? 260 : 460;
      const a = rnd() * Math.PI * 2, off = (0.25 + rnd() * 0.5) * r;
      out.push({ id, x: b.x + Math.cos(a) * off, z: b.z + Math.sin(a) * off, r, kind: b.heard ? 'sighting' : 'rumour', label: b.heard ? `${b.name}: seen hereabouts` : `Something big: ${b.name}?`, glyph: 'rumour', price: b.heard ? 45 : 70, copied: copied.has(id) });
    }
    // Places nobody has mapped: dungeons and ruins you haven't been to.
    for (const l of this.d.discovery.landmarks) {
      if (l.kind !== 'dungeon' && l.kind !== 'ruin') continue;
      if (this.d.discovery.places.get(l.id) === 'visited') continue;
      const id = 'place:' + l.id;
      out.push({ id, x: l.x, z: l.z, kind: 'place', label: l.kind === 'dungeon' ? `A way down: ${l.name}` : `Old stones: ${l.name}`, glyph: l.kind === 'dungeon' ? 'cave' : 'tower', price: 25, copied: copied.has(id) });
    }
    return out;
  }

  /** The guild's marks, for its own Hunt Map tab (everything it knows, as it knows it). */
  huntMarks() {
    return this.wallMarks();
  }

  /** Finds you've made and not yet reported: the Registrar pays for each. */
  reportFinds() {
    let n = 0;
    for (const b of this.d.bosses()) {
      if (!this.d.flags['rep:' + b.id] || this.d.flags['reported:' + b.id]) continue;
      this.d.flags['reported:' + b.id] = true;
      n++;
    }
    if (!n) return 0;
    this.d.addGold(80 * n);
    this.d.xp(150 * n);
    this.d.save();
    return n;
  }
  unreported() {
    return this.d.bosses().filter((b) => this.d.flags['rep:' + b.id] && !this.d.flags['reported:' + b.id]).length;
  }

  // ---- the papers beside your map -------------------------------------------------------
  private papers(): Paper[] {
    const out: Paper[] = [];
    if (this.wall) {
      const [hall, hallName] = this.wall.split('|');
      out.push({
        id: 'guild:' + hall, title: `${hallName}: the Hunt Wall`, sub: 'Rumours, sightings, lairs, unmapped places', inkAll: true,
        marks: this.wallMarks(),
        buy: (markId) => {
          const m = this.wallMarks().find((q) => q.id === markId);
          if (!m || m.price === null || m.price === undefined) return 'Not for sale.';
          if (this.d.gold() < m.price) return `The clerk wants ${m.price} gold.`;
          this.d.addGold(-m.price);
          this.d.discovery.addMark(m.r
            ? { kind: 'rumour', x: m.x, z: m.z, r: m.r, rumour: m.id, text: m.label, color: '#b3241c', glyph: m.glyph, day: this.d.day() }
            : { kind: 'pin', x: m.x, z: m.z, rumour: m.id, text: m.label, color: '#b3241c', glyph: m.glyph, day: this.d.day() });
          this.d.toast(`The clerk inks “${m.label}” onto your map, neat as you like.`);
          this.d.save();
          return null;
        },
      });
    }
    // Treasure maps you've read: each a scrap with a patch of land and an X.
    for (let i = 0; i < this.treasures.length; i++) {
      const t = this.treasures[i];
      if (!t.region || !this.d.discovery.pieces.has(`treasureMap_${i}`) || this.d.flags['dug:' + i]) continue;
      out.push({ id: 'treasure:' + i, title: 'A treasure map', sub: `Somewhere in ${REGION_NAMES[t.region] ?? 'the world'}`, inkAll: false, marks: [{ id: 'tx:' + i, x: t.x, z: t.z, kind: 'note', label: 'X', glyph: 'treasure', price: null }] });
    }
    return out;
  }

  /** Close the wall when the map closes (main calls this from the map's onToggle). */
  mapClosed() {
    this.wall = null;
  }

  /** Region progress for the map's legend. */
  progress() {
    return Object.entries(REGION_PIECES).map(([id, of]) => {
      let have = 0;
      for (let i = 1; i <= of; i++) if (this.d.discovery.pieces.has(`mapPiece_${id}_${i}`)) have++;
      return { id, name: REGION_NAMES[id], have, of };
    });
  }

  // ---- the Royal Cartographer -----------------------------------------------------------
  /** Her stock: the piece she has of each region you've been to, old charts, sheets. */
  shopStock(): [string, number][] {
    const out: [string, number][] = [];
    for (const [key, id] of this.shopPiece) {
      const region = key.split(':')[0];
      if (!this.d.discovery.regions.has(region) && region !== 'elderGlen' && region !== 'cresha') continue;
      if (this.d.discovery.pieces.has(id) || this.d.has(id)) continue;
      out.push([id, 60 + REGION_PIECES[region] * 10]);
    }
    for (const r of Object.keys(REGION_PIECES)) {
      if (!this.d.discovery.regions.has(r) || this.d.discovery.pieces.has('oldChart_' + r)) continue;
      out.push(['oldChart_' + r, 260 + REGION_PIECES[r] * 25]);
    }
    out.push(['surveySheet', 60], ['blankSheet', 5], ['inkPot', 8]);
    if (this.d.discovery.regions.has('azureIsles') && !this.d.discovery.pieces.has('seaChart')) out.push(['seaChart', 320]);
    return out;
  }

  /** Show her your Full Charts: she copies each and pays. */
  showCharts() {
    let paid = 0, n = 0;
    for (const r of Object.keys(REGION_PIECES)) {
      if (!this.d.has('fullChart_' + r) || this.d.flags['fc:' + r]) continue;
      this.d.flags['fc:' + r] = true;
      paid += 300;
      n++;
    }
    if (paid) { this.d.addGold(paid); this.d.save(); }
    return { n, paid };
  }
}
