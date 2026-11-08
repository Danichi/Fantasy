import * as THREE from 'three';
import { heightAt, GRAVEWOOD, roadDist, hasTile, TILE } from './terrainHeight';
import { regionAt, reliefAt, macroHeight, RELIEF, SEA_LEVEL, PLACE_DEFS, pxToWorld } from './worldMap';
import MAPDATA from './data/regions.json';
import { REGIONS } from './regionDefinitions';
import { ROAD_SPECS } from './roadData';
import { roadLength, pointAlong } from './roadNetwork';
import { mulberry32 } from '../core/math';
import { physics } from '../physics/physics';
import { setBlessing } from '../progression/blessings';
import { sfx } from '../audio/sfx';
import type { FX } from '../fx/particles';
import type { Interactable } from '../dungeon/instance';
import type RAPIER from '@dimforge/rapier3d-compat';

// The Lost Lanterns (docs/design/lanterns.md). Before the Fall the Dawn's
// keepers hung lanterns along every road and over every hearth. When the Dark
// came they went out and were scattered: on roadsides and in ruins, on stone
// stacks and dead trees, out on the islands and over the mountains, and in the
// Dark itself. Find one and it lights again, and stays lit in the world for
// good. Brother Aldous at the Chapel of the Dawn (or the High Priestess in the
// capital) takes word of them in tens: each ten is a little more health,
// stamina and mana. Light every lantern of a region and, at night, its foes
// hit you more softly.
//
// Saved in the world flags: 'll:<id>' (lit), 'llTold' (how many you've told of).

export type LanternStyle = 'post' | 'hang' | 'cairn' | 'tall' | 'nook' | 'buried';
export interface LanternSpot {
  id: string;
  x: number;
  z: number;
  /** the set it counts toward: a region id, or 'dark' */
  region: string;
  style: LanternStyle;
  dark: boolean;
  yaw: number;
  /** pillar height (tall), stack height (cairn) */
  h: number;
}

/** Display names for the sets. */
export function setName(region: string) {
  if (region === 'dark') return 'The Dark';
  return REGIONS[region]?.name ?? region;
}

/** How many told-of lanterns make a blessing, and what each gives. */
export const TELL_STEP = 10;
export const BLESS = { hp: 2, mana: 2, stamina: 1 } as const;
/** Lanternbearer titles: [lanterns told of, title]. */
export const BEARER_TITLES: [number, string][] = [
  [0, 'None yet'], [10, 'Wick-Trimmer'], [30, 'Lamplighter'], [60, 'Keeper of the Flame'], [100, 'Lanternbearer'],
  [180, 'Torch of the Dawn'], [280, 'Dawnwalker'], [400, 'Bringer of Light'], [550, 'The Long Light'],
];
/** At night, in a region whose lanterns are all lit, foes hit this much softer. */
export const LIT_WARD = 0.15;

// ---- placing them ---------------------------------------------------------------------------------

interface PlaceInput {
  /** circles to keep out of: towns, farms, camps, lairs */
  avoid: [number, number, number][];
  /** the sites across Cresha */
  sites: { x: number; z: number }[];
}

const STYLES: Record<string, [LanternStyle, number][]> = {
  glen: [['post', 3], ['hang', 3], ['nook', 2], ['buried', 2], ['cairn', 2], ['tall', 1]],
  road: [['post', 5], ['buried', 2], ['hang', 2], ['cairn', 1]],
  site: [['nook', 3], ['cairn', 3], ['hang', 2], ['buried', 2], ['tall', 1]],
  place: [['cairn', 3], ['tall', 2], ['nook', 2], ['post', 2]],
  wild: [['tall', 3], ['cairn', 3], ['buried', 2], ['nook', 2]],
  dark: [['nook', 3], ['hang', 3], ['cairn', 2], ['tall', 2], ['buried', 2]],
};
const pick = (rnd: () => number, table: [LanternStyle, number][]) => {
  const total = table.reduce((n, [, w]) => n + w, 0);
  let r = rnd() * total;
  for (const [s, w] of table) if ((r -= w) <= 0) return s;
  return table[0][0];
};

/** Every Lost Lantern, from a fixed seed: the same world gets the same lanterns. */
export function placeLanterns(inp: PlaceInput): LanternSpot[] {
  const out: LanternSpot[] = [];
  const rnd = mulberry32(9137);
  const CELLS = new Map<number, LanternSpot[]>();
  const key = (x: number, z: number) => Math.floor(x / 60) * 100003 + Math.floor(z / 60);
  const SPACING = 38;
  const near = (x: number, z: number) => {
    const cx = Math.floor(x / 60), cz = Math.floor(z / 60);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const s of CELLS.get((cx + i) * 100003 + cz + j) ?? []) if ((s.x - x) ** 2 + (s.z - z) ** 2 < (s.dark ? 26 : SPACING) ** 2) return true;
    }
    return false;
  };
  const dry = (x: number, z: number) => {
    const rel = reliefAt(x, z);
    if (rel === RELIEF.deep || rel === RELIEF.shelf || rel === RELIEF.lava) return false;
    return macroHeight(x, z) > SEA_LEVEL + 1.5;
  };
  const clear = (x: number, z: number, dark: boolean) => {
    if (!dark) for (const [cx, cz, cr] of inp.avoid) if ((x - cx) ** 2 + (z - cz) ** 2 < (cr + 4) ** 2) return false;
    return roadDist(x, z) > 7;
  };
  const push = (x: number, z: number, kind: keyof typeof STYLES, dark = false) => {
    if (!dry(x, z) || near(x, z) || !clear(x, z, dark)) return false;
    const region = dark ? 'dark' : regionAt(x, z);
    if (region === 'ocean') return false;
    const style = pick(rnd, STYLES[kind]);
    const h = style === 'tall' ? 4.2 + rnd() * 2.6 : style === 'cairn' ? 1.15 + rnd() * 0.3 : 0;
    const s: LanternSpot = { id: `${dark ? 'd' : 'w'}${Math.round(x)}_${Math.round(z)}`, x, z, region, style, dark, yaw: rnd() * Math.PI * 2, h };
    out.push(s);
    const k = key(x, z);
    (CELLS.get(k) ?? CELLS.set(k, []).get(k)!).push(s);
    return true;
  };
  const ring = (cx: number, cz: number, r0: number, r1: number, n: number, kind: keyof typeof STYLES, dark = false, tries = 14) => {
    let got = 0;
    for (let t = 0; t < n * tries && got < n; t++) {
      const a = rnd() * Math.PI * 2, r = r0 + rnd() * (r1 - r0);
      if (push(cx + Math.cos(a) * r, cz + Math.sin(a) * r, kind, dark)) got++;
    }
    return got;
  };

  // The Glen: its meadows, woods and river banks, close to home.
  ring(0, 0, 125, 880, 44, 'glen');
  // Every road: a lantern every few hundred metres, a little off the verge.
  for (const r of ROAD_SPECS) {
    const len = roadLength(r);
    for (let s = 200 + rnd() * 120; s < len; s += 340 + rnd() * 160) {
      const p = pointAlong(r, s);
      if (Math.hypot(p.x, p.z) < 140) continue;
      const side = rnd() < 0.5 ? -1 : 1, off = 10 + rnd() * 10;
      push(p.x - p.dir.y * off * side, p.z + p.dir.x * off * side, 'road');
    }
  }
  // The sites across Cresha: every second or third has one tucked nearby.
  for (const s of inp.sites) {
    if (rnd() > 0.42) continue;
    const a = rnd() * Math.PI * 2, r = 9 + rnd() * 9;
    push(s.x + Math.cos(a) * r, s.z + Math.sin(a) * r, 'site');
  }
  // The named places of every region: towns, castles, ruins, ports.
  const anchors: { x: number; z: number; big: boolean }[] = [];
  for (const reg of Object.values(REGIONS)) for (const l of reg.landmarks) anchors.push({ x: l.x, z: l.z, big: /town|city|capital|castle|port/.test(l.kind) });
  for (const p of PLACE_DEFS) {
    const w = pxToWorld(p.px[0], p.px[1]);
    anchors.push({ x: w.x, z: w.y, big: true });
  }
  for (const a of anchors) ring(a.x, a.z, a.big ? 190 : 40, a.big ? 380 : 160, a.big ? 4 : 3, 'place');
  // Out in every region: high places, lonely ones.
  for (const reg of MAPDATA.regions as { id: string; circle?: number[]; poly?: number[][] }[]) {
    const id = reg.id;
    if (id === 'elderGlen') continue;
    // The region's box on the map, in world metres.
    const pts = reg.circle ? [[reg.circle[0] - reg.circle[2], reg.circle[1] - reg.circle[2]], [reg.circle[0] + reg.circle[2], reg.circle[1] + reg.circle[2]]] : reg.poly!;
    const ws = pts.map(([px, py]) => pxToWorld(px, py));
    const x0 = Math.min(...ws.map((w) => w.x)), x1 = Math.max(...ws.map((w) => w.x)), z0 = Math.min(...ws.map((w) => w.y)), z1 = Math.max(...ws.map((w) => w.y));
    const want = reg.circle ? 10 : 18;
    let got = 0;
    for (let t = 0; t < 900 && got < want; t++) {
      const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
      if (regionAt(x, z) !== id) continue;
      // Lean toward the high ground: try a few steps uphill.
      let bx = x, bz = z, bh = macroHeight(x, z);
      for (let k = 0; k < 6; k++) {
        const a = rnd() * Math.PI * 2, nx = bx + Math.cos(a) * 40, nz = bz + Math.sin(a) * 40, nh = macroHeight(nx, nz);
        if (nh > bh && regionAt(nx, nz) === id) { bx = nx; bz = nz; bh = nh; }
      }
      if (push(bx, bz, 'wild')) got++;
    }
  }
  // The Dark: around the Gravewood's wheel, among the dead trees and the ruins.
  ring(GRAVEWOOD.x, GRAVEWOOD.y, 40, 222, 84, 'dark', true, 30);
  return out;
}

// ---- the lanterns in the world --------------------------------------------------------------------

export interface LanternDeps {
  scene: THREE.Scene;
  fx: FX;
  flags: Record<string, boolean | number | string>;
  toast(m: string): void;
  card(title: string, sub: string): void;
  /** are you in the Dark right now */
  inDark(): boolean;
  /** do you carry a light (Lightbinder's Lantern Soul and the like): hints reach twice as far */
  hasLight(): boolean;
  /** 0 day .. 1 night */
  night(): number;
  /** the Night of Lanterns: every unlit lantern glimmers from far off */
  festival(): boolean;
  save(): void;
}

interface Built {
  spot: LanternSpot;
  group: THREE.Group;
  glass: THREE.Mesh;
  flame: THREE.Mesh;
  colliders: RAPIER.Collider[];
  /** the lantern's middle (where you reach for it) */
  at: THREE.Vector3;
}

const BUILD_R = 150, DROP_R = 185;
const REACH = 2.5;

export class LostLanterns {
  readonly spots: LanternSpot[];
  readonly byId = new Map<string, LanternSpot>();
  readonly interactable: Interactable;
  /** for tests: the lanterns built near you */
  readonly built = new Map<string, Built>();
  private grid = new Map<number, LanternSpot[]>();
  private t = 0;
  private hintT = new Map<string, number>();
  private moteT = 0;
  private nearest: Built | null = null;
  /** an unlit lantern right above you, too high to reach */
  private above: Built | null = null;
  private realmDark = false;
  private light = new THREE.PointLight(0xffb060, 0, 14, 1.6);
  private glow: THREE.Points;
  private glowIds: string[] = [];
  private glowExact = new Set<string>();
  private exactY = new Map<string, number>();
  private mats = {
    iron: new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.6, metalness: 0.7 }),
    brass: new THREE.MeshStandardMaterial({ color: 0x8a6a30, roughness: 0.45, metalness: 0.8 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.95 }),
    deadWood: new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 1 }),
    stone: new THREE.MeshStandardMaterial({ color: 0x7a766c, roughness: 0.95 }),
    darkStone: new THREE.MeshStandardMaterial({ color: 0x34303a, roughness: 0.95 }),
    glassOut: new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.55 }),
    glassLit: new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xffa040, emissiveIntensity: 1.6, roughness: 0.3, transparent: true, opacity: 0.85 }),
    glassDark: new THREE.MeshStandardMaterial({ color: 0xc8a8ff, emissive: 0x9a6aff, emissiveIntensity: 1.5, roughness: 0.3, transparent: true, opacity: 0.85 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xfff0b0 }),
    flameDark: new THREE.MeshBasicMaterial({ color: 0xeedcff }),
  };
  private geo = {
    bar: new THREE.BoxGeometry(0.025, 0.3, 0.025),
    cap: new THREE.ConeGeometry(0.17, 0.13, 6),
    base: new THREE.CylinderGeometry(0.15, 0.13, 0.04, 6),
    glass: new THREE.CylinderGeometry(0.11, 0.11, 0.28, 6, 1, true),
    ring: new THREE.TorusGeometry(0.045, 0.012, 6, 12),
    flame: new THREE.SphereGeometry(0.045, 8, 6).scale(1, 1.8, 1),
    box: new THREE.BoxGeometry(1, 1, 1),
    rock: new THREE.DodecahedronGeometry(0.5, 0),
    post: new THREE.CylinderGeometry(0.07, 0.09, 1, 6),
  };

  constructor(private d: LanternDeps, spots: LanternSpot[]) {
    this.spots = spots;
    for (const s of spots) {
      this.byId.set(s.id, s);
      const k = this.cell(s.x, s.z);
      (this.grid.get(k) ?? this.grid.set(k, []).get(k)!).push(s);
    }
    d.scene.add(this.light);
    // Far off at night, every lantern you've lit is a warm point on the land.
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(spots.length * 3), 3));
    geo.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(spots.length), 1));
    geo.setDrawRange(0, 0);
    this.glow = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: { uNight: { value: 0 } },
      vertexShader: `attribute float tint; varying float vT; varying float vFade; uniform float uNight;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z; vT = tint;
          vFade = smoothstep(35.0, 90.0, d) * uNight; gl_PointSize = clamp(5200.0 / d, 2.5, 16.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vT; varying float vFade;
        void main() { vec2 c = gl_PointCoord - 0.5; float r = length(c); float a = smoothstep(0.5, 0.0, r); a = a * a * vFade;
          vec3 col = mix(vec3(1.0, 0.72, 0.35), vec3(0.75, 0.6, 1.0), vT); gl_FragColor = vec4(col * (1.0 + 1.5 * a), a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 5;
    d.scene.add(this.glow);
    this.rebuildGlow();
    this.interactable = {
      pos: new THREE.Vector3(0, -9999, 0),
      radius: REACH + 0.5,
      label: () => (this.nearest ? 'Relight the lost lantern' : 'A lost lantern, out of reach above you'),
      enabled: () => (!!this.nearest && !this.isLit(this.nearest.spot.id)) || !!this.above,
      action: () => {
        if (this.nearest) this.lightUp(this.nearest.spot.id);
        else if (this.above) this.d.toast('It sits too high to reach from the ground. Climb to it: an air jump, a glide from higher ground, or a grappling hook.');
      },
    };
    this.refreshBlessing();
  }

  private cell(x: number, z: number) {
    return Math.floor(x / 200) * 100003 + Math.floor(z / 200);
  }

  isLit(id: string) {
    return !!this.d.flags['ll:' + id];
  }
  litCount(region?: string) {
    let n = 0;
    for (const s of this.spots) if ((!region || s.region === region) && this.isLit(s.id)) n++;
    return n;
  }
  total(region?: string) {
    return region ? this.spots.filter((s) => s.region === region).length : this.spots.length;
  }
  /** Every set (region, or the Dark) with its counts. */
  sets() {
    const m = new Map<string, { lit: number; total: number }>();
    for (const s of this.spots) {
      const e = m.get(s.region) ?? m.set(s.region, { lit: 0, total: 0 }).get(s.region)!;
      e.total++;
      if (this.isLit(s.id)) e.lit++;
    }
    return [...m.entries()].map(([id, v]) => ({ id, name: setName(id), ...v }));
  }
  regionDone(region: string) {
    const t = this.total(region);
    return t > 0 && this.litCount(region) >= t;
  }
  /** How many lanterns you've told the Temple of. */
  get told() {
    return Number(this.d.flags.llTold ?? 0);
  }
  /** Lit lanterns not yet told of. */
  get untold() {
    return Math.max(0, this.litCount() - this.told);
  }
  /** Your Lanternbearer title (from the lanterns told of). */
  title() {
    let t = BEARER_TITLES[0][1];
    for (const [n, name] of BEARER_TITLES) if (this.told >= n) t = name;
    return t;
  }
  blessings() {
    const k = Math.floor(this.told / TELL_STEP);
    return { hp: k * BLESS.hp, mana: k * BLESS.mana, stamina: k * BLESS.stamina };
  }
  private refreshBlessing() {
    setBlessing('lanternbearer', this.blessings());
  }

  /**
   * Tell the Temple of the lanterns you've lit since you last came: every ten
   * is a blessing. Returns what was said, for the keeper's reply.
   */
  tell(): { told: number; blessed: number; title: string; titleUp: boolean } {
    const before = this.told, oldTitle = this.title();
    const now = this.litCount();
    this.d.flags.llTold = now;
    const blessed = Math.floor(now / TELL_STEP) - Math.floor(before / TELL_STEP);
    this.refreshBlessing();
    this.d.save();
    return { told: now - before, blessed, title: this.title(), titleUp: this.title() !== oldTitle };
  }

  /** Relight a lantern (the interactable, or tests). */
  lightUp(id: string) {
    const s = this.byId.get(id);
    if (!s || this.isLit(id)) return false;
    this.d.flags['ll:' + id] = 1;
    const b = this.built.get(id);
    if (b) {
      this.setLook(b, true);
      this.d.fx.add.spawn({ pos: b.at.clone(), spread: 0.4, count: 26, life: [0.6, 1.4], size: [0.08, 0.02], color: s.dark ? 0xd8c0ff : 0xffe0a0, color2: s.dark ? 0x7a4aff : 0xff8a20, gravity: -1.2, drag: 1.5 });
    }
    sfx.kindle();
    const lit = this.litCount(s.region), tot = this.total(s.region);
    this.d.toast(`Lost Lantern relit · ${setName(s.region)} ${lit}/${tot} · ${this.litCount()}/${this.spots.length} in all`);
    if (lit >= tot) this.d.card(`${setName(s.region)} Is Lit`, s.dark ? 'Even the Dark remembers the Dawn' : 'Its foes hit softer here by night');
    if (this.untold === TELL_STEP) this.d.toast('Brother Aldous at the Chapel of the Dawn would want to hear of these.');
    this.rebuildGlow();
    this.d.save();
    return true;
  }

  /** At night in a fully lit region, how much softer foes hit (0 otherwise). */
  wardAt(x: number, z: number) {
    if (this.d.night() < 0.5) return 0;
    if (this.d.inDark()) return this.regionDone('dark') ? LIT_WARD : 0;
    return this.regionDone(regionAt(x, z)) ? LIT_WARD : 0;
  }

  private rebuildGlow() {
    const pos = this.glow.geometry.getAttribute('position') as THREE.BufferAttribute;
    const tint = this.glow.geometry.getAttribute('tint') as THREE.BufferAttribute;
    this.glowIds = [];
    let n = 0;
    for (const s of this.spots) {
      if (!this.isLit(s.id) || s.dark !== this.realmDark) continue;
      const y = this.exactY.get(s.id) ?? macroHeight(s.x, s.z);
      pos.setXYZ(n, s.x, y + this.topOf(s) + 0.3, s.z);
      tint.setX(n, s.dark ? 1 : 0);
      this.glowIds.push(s.id);
      n++;
    }
    pos.needsUpdate = true;
    tint.needsUpdate = true;
    this.glow.geometry.setDrawRange(0, n);
  }

  /** How high above the ground the lantern sits. */
  private topOf(s: LanternSpot) {
    switch (s.style) {
      case 'tall': case 'cairn': return s.h + 0.2;
      case 'post': return 1.35;
      case 'hang': return 1.95;
      case 'buried': return 0.08;
      default: return 0.2;
    }
  }

  private lantern(lit: boolean, dark: boolean) {
    const g = new THREE.Group();
    const m = this.mats;
    const base = new THREE.Mesh(this.geo.base, m.iron);
    base.position.y = -0.16;
    g.add(base);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, bar = new THREE.Mesh(this.geo.bar, m.iron);
      bar.position.set(Math.cos(a) * 0.125, 0, Math.sin(a) * 0.125);
      g.add(bar);
    }
    const glass = new THREE.Mesh(this.geo.glass, lit ? (dark ? m.glassDark : m.glassLit) : m.glassOut);
    g.add(glass);
    const cap = new THREE.Mesh(this.geo.cap, m.brass);
    cap.position.y = 0.21;
    g.add(cap);
    const ring = new THREE.Mesh(this.geo.ring, m.brass);
    ring.position.y = 0.31;
    g.add(ring);
    const flame = new THREE.Mesh(this.geo.flame, dark ? m.flameDark : m.flame);
    flame.position.y = -0.04;
    flame.visible = lit;
    g.add(flame);
    for (const c of g.children) c.castShadow = true;
    return { g, glass, flame };
  }

  private setLook(b: Built, lit: boolean) {
    b.glass.material = lit ? (b.spot.dark ? this.mats.glassDark : this.mats.glassLit) : this.mats.glassOut;
    b.flame.visible = lit;
  }

  private build(s: LanternSpot): Built {
    const y = heightAt(s.x, s.z);
    this.exactY.set(s.id, y);
    const group = new THREE.Group();
    group.position.set(s.x, y, s.z);
    group.rotation.y = s.yaw;
    const m = this.mats, stone = s.dark ? m.darkStone : m.stone, rnd = mulberry32(Math.abs(Math.round(s.x * 7 + s.z * 13)) + 1);
    const colliders: RAPIER.Collider[] = [];
    const lit = this.isLit(s.id);
    const L = this.lantern(lit, s.dark);
    const top = this.topOf(s);
    const addBox = (w: number, h: number, dd: number, x: number, yy: number, z: number, mat: THREE.Material, solid = true, ry = 0) => {
      const b = new THREE.Mesh(this.geo.box, mat);
      b.scale.set(w, h, dd);
      b.position.set(x, yy, z);
      b.rotation.y = ry;
      b.castShadow = b.receiveShadow = true;
      group.add(b);
      if (solid) {
        const wp = new THREE.Vector3(x, yy, z).applyEuler(group.rotation).add(group.position);
        colliders.push(physics.addBox(wp, new THREE.Vector3(w / 2, h / 2, dd / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s.yaw + ry, 0))));
      }
      return b;
    };
    switch (s.style) {
      case 'post': {
        const post = new THREE.Mesh(this.geo.post, m.wood);
        post.scale.set(1, 1.7, 1);
        post.position.set(0, 0.8, 0);
        post.rotation.z = 0.08;
        group.add(post);
        addBox(0.06, 0.06, 0.55, 0, 1.62, 0.22, m.wood, false);
        L.g.position.set(0, top, 0.42);
        break;
      }
      case 'hang': {
        // A dead stump with one crooked arm; the lantern hangs from it on a chain.
        const trunk = new THREE.Mesh(this.geo.post, m.deadWood);
        trunk.scale.set(2.4, 2.6, 2.4);
        trunk.position.y = 1.2;
        group.add(trunk);
        const arm = addBox(0.1, 0.1, 1.1, 0, 2.35, 0.45, m.deadWood, false);
        arm.rotation.x = -0.25;
        addBox(0.015, 0.3, 0.015, 0, 2.15, 0.8, m.iron, false);
        L.g.position.set(0, top, 0.8);
        break;
      }
      case 'cairn': {
        // A stack of stones with the lantern on top, and a step stone to climb it.
        addBox(1.3, s.h * 0.5, 1.2, 0, s.h * 0.25, 0, stone, true, rnd() * 0.4);
        addBox(1.0, s.h * 0.5, 0.9, 0.05, s.h * 0.75, -0.04, stone, true, rnd() * 0.6);
        addBox(0.9, 0.55, 0.9, 1.25, 0.27, 0.2, stone, true, rnd());
        L.g.position.set(0, top, 0);
        break;
      }
      case 'tall': {
        // A standing pillar too tall to climb by hand: an air jump, a glide from higher ground, a grappling hook.
        addBox(1.5, s.h, 1.4, 0, s.h / 2, 0, stone, true, 0);
        addBox(1.8, 0.25, 1.7, 0, s.h + 0.02, 0, stone, false, 0.3);
        for (let i = 0; i < 4; i++) {
          const r = new THREE.Mesh(this.geo.rock, stone);
          const a = rnd() * Math.PI * 2;
          r.position.set(Math.cos(a) * 1.4, 0.15, Math.sin(a) * 1.4);
          r.scale.setScalar(0.4 + rnd() * 0.5);
          group.add(r);
        }
        L.g.position.set(0, top + 0.1, 0);
        break;
      }
      case 'nook': {
        // A broken stretch of old wall; the lantern sits in its corner.
        addBox(2.4, 1.4 + rnd() * 0.6, 0.45, 0, 0.75, -0.6, stone, true, 0);
        addBox(0.45, 1.0, 1.6, -1.0, 0.5, 0.1, stone, true, 0);
        L.g.position.set(-0.45, top, -0.15);
        break;
      }
      case 'buried': {
        // Half sunk in the earth, on its side, glinting.
        L.g.rotation.z = 1.1;
        L.g.position.set(0, top, 0);
        const r = new THREE.Mesh(this.geo.rock, stone);
        r.position.set(0.5, 0.05, 0.2);
        r.scale.setScalar(0.5);
        group.add(r);
        break;
      }
    }
    group.add(L.g);
    this.d.scene.add(group);
    group.updateMatrixWorld(true);
    const at = new THREE.Vector3();
    L.glass.getWorldPosition(at);
    const b: Built = { spot: s, group, glass: L.glass, flame: L.flame, colliders, at };
    this.built.set(s.id, b);
    return b;
  }

  private drop(id: string) {
    const b = this.built.get(id);
    if (!b) return;
    this.d.scene.remove(b.group);
    for (const c of b.colliders) physics.removeStatic(c);
    this.built.delete(id);
    if (this.nearest === b) this.nearest = null;
    if (this.above === b) this.above = null;
  }

  /** Back to a fresh world (tests): nothing built, nothing lit. */
  reset() {
    for (const id of [...this.built.keys()]) this.drop(id);
    this.hintT.clear();
    this.refreshBlessing();
    this.rebuildGlow();
  }

    /** Everything near a point, of the realm you're in. */
  private around(x: number, z: number, r: number) {
    const out: LanternSpot[] = [];
    const c0 = Math.floor((x - r) / 200), c1 = Math.floor((x + r) / 200), d0 = Math.floor((z - r) / 200), d1 = Math.floor((z + r) / 200);
    for (let i = c0; i <= c1; i++) for (let j = d0; j <= d1; j++) {
      for (const s of this.grid.get(i * 100003 + j) ?? []) if (s.dark === this.realmDark && (s.x - x) ** 2 + (s.z - z) ** 2 < r * r) out.push(s);
    }
    return out;
  }

  /** Per frame (overworld only; pass active=false indoors, underground, at sea's bottom). */
  update(dt: number, pos: THREE.Vector3, center: THREE.Vector3, active: boolean) {
    const dark = this.d.inDark();
    if (dark !== this.realmDark) {
      this.realmDark = dark;
      for (const id of [...this.built.keys()]) this.drop(id);
      this.rebuildGlow();
    }
    const night = this.d.night();
    (this.glow.material as THREE.ShaderMaterial).uniforms.uNight.value = active ? Math.max(this.realmDark ? 1 : 0, night) : 0;
    this.glow.visible = active;
    this.t -= dt;
    if (!active) {
      if (this.built.size) for (const id of [...this.built.keys()]) this.drop(id);
      this.light.intensity = 0;
      this.nearest = null;
      this.above = null;
      this.interactable.pos.set(0, -9999, 0);
      return;
    }
    if (this.t <= 0) {
      this.t = 0.5;
      const want = new Set(this.around(pos.x, pos.z, BUILD_R).map((s) => s.id));
      for (const [id, b] of this.built) if (!want.has(id) && Math.hypot(b.spot.x - pos.x, b.spot.z - pos.z) > DROP_R) this.drop(id);
      for (const id of want) if (!this.built.has(id)) this.build(this.byId.get(id)!);
      // Lit lanterns whose ground has loaded: their far glow sits on the real height.
      let moved = false;
      for (const id of this.glowIds) {
        if (this.glowExact.has(id)) continue;
        const s = this.byId.get(id)!;
        if (!hasTile(Math.floor(s.x / TILE), Math.floor(s.z / TILE)) && Math.hypot(s.x, s.z) > 1000) continue;
        this.exactY.set(id, heightAt(s.x, s.z));
        this.glowExact.add(id);
        moved = true;
      }
      if (moved) this.rebuildGlow();
    }
    // The nearest lantern within reach (a true 3D reach: one on a pillar must be climbed to).
    let best: Built | null = null, bd = Infinity, warm: Built | null = null, wd = Infinity;
    const hintR = (this.d.festival() ? 60 : 18) * (this.d.hasLight() ? 2 : 1);
    this.moteT -= dt;
    const mote = this.moteT <= 0;
    if (mote) this.moteT = 1.4;
    const now = performance.now() / 1000;
    for (const b of this.built.values()) {
      const lit = this.isLit(b.spot.id);
      const dd = b.at.distanceTo(center);
      if (!lit && dd < bd) { bd = dd; best = b; }
      if (lit && dd < wd) { wd = dd; warm = b; }
      if (lit) {
        b.flame.scale.setScalar(0.85 + Math.sin(now * 11 + b.spot.x) * 0.1 + Math.sin(now * 17.3 + b.spot.z) * 0.06);
        continue;
      }
      // Unlit and near: a faint glimmer, and a chime the first time you come close.
      const flat = Math.hypot(b.spot.x - pos.x, b.spot.z - pos.z);
      if (flat < hintR) {
        if (mote) this.d.fx.add.spawn({ pos: b.at.clone(), spread: 0.25, count: 2, life: [0.8, 1.6], size: [0.05, 0.01], color: b.spot.dark ? 0xd8c0ff : 0xffe6a8, color2: 0xffffff, gravity: -0.4, drag: 1 });
        const last = this.hintT.get(b.spot.id) ?? -999;
        if (now - last > 75) {
          this.hintT.set(b.spot.id, now);
          sfx.chime(0.1);
        }
      }
    }
    this.nearest = best && bd < REACH ? best : null;
    this.above = !this.nearest && best && Math.hypot(best.at.x - pos.x, best.at.z - pos.z) < REACH && best.at.y - pos.y > 2.2 ? best : null;
    const show = this.nearest ?? this.above;
    if (show) this.interactable.pos.copy(show.at);
    else this.interactable.pos.set(0, -9999, 0);
    // One warm light, at the nearest lit lantern, by night.
    if (warm && wd < 30 && (night > 0.25 || this.realmDark)) {
      this.light.position.copy(warm.at);
      this.light.color.setHex(warm.spot.dark ? 0xb08aff : 0xffb060);
      this.light.intensity = 3.2 * Math.max(night, this.realmDark ? 1 : 0) * (0.92 + Math.sin(now * 9) * 0.08);
    } else this.light.intensity = 0;
  }
}
