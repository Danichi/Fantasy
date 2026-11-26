import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { physics } from '../../physics/physics';
import { markClimbable } from '../../player/traversalSurfaces';
import type { Player } from '../../player/player';
import type { FX } from '../../fx/particles';
import type { WheelNode } from '../../story/sunwheel';
import type { Interactable } from '../../dungeon/instance';
import { Undead } from '../../enemies/undead';
import { LivingArmour } from '../../enemies/livingArmour';
import { heightAt, normalAt } from '../terrainHeight';
import { waterSurfaceAt } from '../waterLevel';
import { REGIONS } from '../regionDefinitions';
import { SCARS, onMap } from './land';
import type { Tether } from './tether';
import { RuinKit, ruin, mirror, deadTreeGeo, RUIN_KINDS, RUIN_R, type Ruin, type RuinMat, type MirrorKind, type RuinKind } from './ruins';

// The explorable Dark (the old Gravewood mirror, everywhere): the same land in
// the same place, under a red sky. Nothing anyone built stands in it (the
// physics veil switches the living world's walls off). Every living tree
// stands here as a dead black one, and the forest is thicker. Old ruins rise
// out of the fields, and every town has a burned mirror where it stands: the
// capital's is a palace older than the one above, with a statue whose face
// was cut away. Shades rise in packs, the seven scars keep their memories and
// their knights, and black-iron caches hold what the Dark's dead left behind.
//
// Everything streams around the player and is disposed on the way out.

const hash = (x: number, z: number, k = 0) => {
  const v = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453;
  return v - Math.floor(v);
};

type Foe = Undead | LivingArmour;
type Tree = [number, number, number, number, number];

export interface DarkWorldDeps {
  /** the living world's trees near a point: [x, y, z, yaw, height] */
  treesNear(x: number, z: number, r: number): Tree[];
  /** the danger of a place (the living world's zone level there) */
  level(x: number, z: number): number;
  /** hand out a cache's spoils; returns what was in it, for the toast */
  loot(at: THREE.Vector3, tier: number): string;
  toast(text: string): void;
  /** show a stone's words (a dialogue box) */
  read(title: string, text: string): void;
  /** a few things the living world lends the Dark (the Lost Lanterns' interaction) */
  borrowed(): Interactable[];
}

interface Site {
  key: string;
  x: number;
  z: number;
  r: number;
  build(): Ruin;
  built?: Ruin;
  solids?: RAPIER.Collider[];
  /** only mirrors: the name to tell you on first sight */
  seen?: { flag: string; text: string };
  /** only mirrors: a stone to read by the fire */
  stone?: Interactable;
}

interface Cache {
  key: string;
  at: THREE.Vector3;
  tier: number;
  mesh: THREE.Group;
  action: Interactable;
}

interface Pack {
  key: string;
  x: number;
  z: number;
  foes: Foe[];
}

/** The ruined mirror of every living place, by the place's kind. */
function mirrorKind(id: string, kind: string): MirrorKind | null {
  if (id === 'royalCapital') return 'palace';
  if (id === 'elvenSanctum') return 'tree';
  if (/frostpeak|deepHold|frosthold/.test(id)) return 'hold';
  if (/sunspire|rustMarket|waystop/.test(id)) return 'glass';
  if (kind === 'port' || id === 'portAurelle') return 'harbour';
  if (/town|city|capital|castle/.test(kind)) return 'town';
  return null;
}

const MIRROR_TEXT: Record<MirrorKind, (name: string) => string> = {
  town: (n) => `${n}, in the Dark: ash where the houses stand, and graves where the square is. Nobody has lived here, on this side, for a very long time.`,
  harbour: (n) => `${n}, in the Dark. The sea here is black and still, and the hulls on the shore are older than any ship you know.`,
  palace: () => 'A palace stands here in the Dark, older than the one above it. A sunwheel the size of a house has fallen in its court. Every statue\'s face has been cut away.',
  tree: () => 'The World Tree, in the Dark: stone to the crown, and long dead. Something burned this forest without ever letting the sun go down.',
  hold: (n) => `${n}, in the Dark: a gate split down the middle, and the mountain behind it burned hollow.`,
  glass: (n) => `${n}, in the Dark: spires of black glass, where a sun that never set melted the sand.`,
};

/** What's written by each mirror's fire: the old history, a line at a time. */
const MIRROR_STONE: Record<MirrorKind, [string, string]> = {
  town: ['A scorched hearthstone', 'Someone scratched words into it with a knife: "We kept the lamps lit, as we were told. We kept them lit."'],
  harbour: ['A mooring post', 'Carved with tally marks, hundreds of them, and underneath: "No nights between. Only days."'],
  palace: ['The faceless king\'s plinth', 'Its inscription has been chiselled away, all but one word, low in the corner where the chisel couldn\'t reach: LAMPLIGHTER.'],
  tree: ['The stone bark', 'Words cut in the elves\' oldest script: "The sun stood over us for a hundred years, and we burned rather than kneel to it."'],
  hold: ['The split gate', 'The dwarf rune for "debt", cut into the stone a hundred times over, each one deeper than the last.'],
  glass: ['Under the black glass', 'Furrows. Straight rows, a hand apart, sealed under the glass. This was farmland once.'],
};

export class DarkWorld {
  readonly group = new THREE.Group();
  readonly actions: Interactable[] = [];
  readonly foes = new Map<string, Foe>();
  private nodes: WheelNode[] = [];
  private mats: Record<RuinMat, THREE.Material> = {
    stone: new THREE.MeshStandardMaterial({ color: 0x2c2832, roughness: 0.95, metalness: 0.05 }),
    char: new THREE.MeshStandardMaterial({ color: 0x0e0c0c, roughness: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0b0912, roughness: 0.12, metalness: 0.7, emissive: 0x16061f, emissiveIntensity: 0.8 }),
    bone: new THREE.MeshStandardMaterial({ color: 0xcfc6b2, roughness: 0.8 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xc08cff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
  private bark = new THREE.MeshStandardMaterial({ color: 0x141018, roughness: 0.9, emissive: 0x12061e, emissiveIntensity: 0.6 });
  private crackMat = new THREE.MeshBasicMaterial({ color: 0x9a5aff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  private glow = new THREE.MeshBasicMaterial({ color: 0xffd99b });
  private echo = new THREE.MeshBasicMaterial({ color: 0x9bdce3 });
  private shaftMat = new THREE.MeshBasicMaterial({ color: 0xf9ce8c, transparent: true, opacity: 0.18, depthWrite: false });
  private props = new THREE.Group();
  private trees: THREE.InstancedMesh[] = [];
  private graves: THREE.InstancedMesh;
  private cracks: THREE.InstancedMesh;
  private treeSolids = new Map<string, RAPIER.Collider>();
  private solids: RAPIER.Collider[] = [];
  private sites: Site[] = [];
  private mirrors: Site[] = [];
  private caches = new Map<string, Cache>();
  private packs = new Map<string, Pack>();
  private cleared = new Set<string>();
  private fireLight = new THREE.PointLight(0xa66bff, 0, 22, 1.6);
  private dressedAt = new THREE.Vector3(Infinity, 0, Infinity);
  private sitesAt = new THREE.Vector3(Infinity, 0, Infinity);
  private memorySpots = new Map<string, THREE.Vector3>();
  private ashT = 0;
  private geos: THREE.BufferGeometry[] = [];

  constructor(
    private scene: THREE.Scene,
    private fx: FX,
    private tether: Tether,
    private wheel: (n: WheelNode) => void,
    private memory: (id: string, text: string) => void,
    private d: DarkWorldDeps
  ) {
    this.group.name = 'The explorable Dark';
    this.group.add(this.props, this.fireLight);
    for (let v = 0; v < 3; v++) {
      const g = deadTreeGeo(101 + v * 37);
      this.geos.push(g);
      const t = new THREE.InstancedMesh(g, this.bark, 2400);
      t.count = 0;
      t.castShadow = true;
      t.frustumCulled = false;
      this.group.add(t);
      this.trees.push(t);
    }
    const graveGeo = new THREE.BoxGeometry(0.7, 1.3, 0.18);
    this.geos.push(graveGeo);
    this.graves = new THREE.InstancedMesh(graveGeo, this.mats.stone, 1400);
    this.graves.count = 0;
    this.graves.frustumCulled = false;
    const crackGeo = new THREE.PlaneGeometry(0.3, 1).rotateX(-Math.PI / 2);
    this.geos.push(crackGeo);
    this.cracks = new THREE.InstancedMesh(crackGeo, this.crackMat, 900);
    this.cracks.count = 0;
    this.cracks.frustumCulled = false;
    this.group.add(this.graves, this.cracks);
  }

  /** The ground in the Dark is the living ground. */
  height = (x: number, z: number) => heightAt(x, z);
  at(x: number, z: number, above = 0) {
    return new THREE.Vector3(x, heightAt(x, z) + above, z);
  }
  /** Where a scar's memory stone stands. */
  memoryAt(id: string) {
    return this.memorySpots.get(id) ?? null;
  }

  private dry(x: number, z: number, slope = 0.82) {
    if (!onMap(x, z)) return false;
    const w = waterSurfaceAt(x, z);
    if (w !== null && w > heightAt(x, z) - 0.2) return false;
    return normalAt(x, z).y > slope;
  }
  /** The nearest dry, level spot to a point (searching outward), or null. */
  private dryNear(x: number, z: number, reach: number, slope = 0.86) {
    if (this.dry(x, z, slope)) return [x, z] as [number, number];
    for (let r = 8; r <= reach; r += 8)
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + r * 0.1,
          px = x + Math.cos(a) * r,
          pz = z + Math.sin(a) * r;
        if (this.dry(px, pz, slope)) return [px, pz] as [number, number];
      }
    return null;
  }
  private nearNode(x: number, z: number, r: number) {
    return this.nodes.some((n) => Math.hypot(n.pos.x - x, n.pos.z - z) < r);
  }
  private onSite(x: number, z: number, pad = 0) {
    for (const s of this.sites) if (Math.hypot(s.x - x, s.z - z) < s.r + pad) return true;
    for (const s of this.mirrors) if (Math.hypot(s.x - x, s.z - z) < s.r + pad) return true;
    return false;
  }

  start(nodes: WheelNode[]) {
    this.nodes = nodes;
    this.scene.add(this.group);
    // The Sunwheels: a low dais, the ring, and a shaft of light you can see from far off.
    const ring = new THREE.TorusGeometry(1.15, 0.16, 6, 16),
      dais = new THREE.CylinderGeometry(2.2, 2.5, 0.25, 12),
      shaft = new THREE.CylinderGeometry(0.09, 0.3, 40, 6, 1, true);
    this.geos.push(ring, dais, shaft);
    for (const n of nodes) {
      const p = n.pos.clone();
      p.y = heightAt(p.x, p.z);
      const r = new THREE.Mesh(ring, this.glow);
      r.position.copy(p).y += 1.7;
      const b = new THREE.Mesh(dais, this.mats.stone);
      b.position.copy(p).y += 0.05;
      const s = new THREE.Mesh(shaft, this.shaftMat);
      s.position.copy(p).y += 20;
      this.props.add(r, b, s);
      this.actions.push({ pos: p, radius: 4.3, level: 4, label: () => `Sunwheel • ${n.name}`, enabled: () => true, action: () => this.wheel(n) });
    }
    // The seven scars: a floor of fused glass, a ring of leaning stones, a memory on a plinth.
    for (const s of SCARS) {
      const spot = this.dryNear(s.x, s.z, Math.max(120, s.r), 0.8) ?? [s.x, s.z];
      const [cx, cz] = spot;
      const R = Math.min(46, s.r * 0.4);
      this.scar(s.id, cx, cz, R);
      const p = this.at(cx, cz);
      this.memorySpots.set(s.id, p);
      this.actions.push({
        pos: p,
        radius: 3,
        level: 4,
        label: () => (this.tether.flags['dark:memory:' + s.id] ? `Recall • ${s.name}` : `Ancient memory • ${s.name} (+${Math.min(18, 900 - this.tether.capacity)}s tether)`),
        enabled: () => true,
        action: () => this.memory(s.id, s.text),
      });
      this.sites.push({ key: 'scar:' + s.id, x: cx, z: cz, r: R + 6, build: () => ({ group: new THREE.Group(), boxes: [], fires: [] }) });
    }
    // The mirrors of the living places.
    const seenAt: [number, number, number][] = [];
    const order = Object.values(REGIONS)
      .flatMap((reg) => reg.landmarks)
      .map((l) => ({ l, kind: mirrorKind(l.id, l.kind) }))
      .filter((m) => m.kind)
      .sort((a, b) => (b.kind === 'palace' || b.kind === 'tree' ? 1 : 0) - (a.kind === 'palace' || a.kind === 'tree' ? 1 : 0));
    for (const { l, kind } of order) {
      const k = kind!;
      const size = k === 'palace' ? 50 : k === 'tree' ? 30 : l.kind === 'city' || l.kind === 'capital' ? 34 : l.kind === 'castle' ? 22 : 26;
      if (seenAt.some(([x, z, r]) => Math.hypot(x - l.x, z - l.z) < r + size)) continue;
      const spot = this.dryNear(l.x, l.z, 160, 0.8);
      if (!spot) continue;
      const [x, z] = spot;
      seenAt.push([x, z, k === 'palace' ? 320 : k === 'tree' ? 220 : size + 30]);
      const seed = Math.floor(hash(x, z, 9) * 1e6);
      this.mirrors.push({
        key: 'mirror:' + l.id,
        x,
        z,
        r: size + 8,
        build: () => {
          const kit = new RuinKit(x, z, hash(x, z, 3) * Math.PI * 2, seed, k !== 'palace');
          mirror(kit, k, size);
          return kit.finish(this.mats, this.crackMat);
        },
        seen: { flag: 'dark:seen:' + l.id, text: MIRROR_TEXT[k](l.name) },
        stone: (() => {
          const [title, text] = MIRROR_STONE[k];
          const f = k === 'palace' ? [-14, 10] : k === 'tree' ? [24, 0] : k === 'hold' ? [0, -8] : k === 'glass' ? [0, 0] : [-4, -4];
          const yaw = hash(x, z, 3) * Math.PI * 2,
            c = Math.cos(yaw),
            sn = Math.sin(yaw);
          const px = x + f[0] * c + f[1] * sn + 2.2,
            pz = z - f[0] * sn + f[1] * c;
          return {
            pos: new THREE.Vector3(px, heightAt(px, pz), pz),
            radius: 3.2,
            level: 4,
            label: () => `Read • ${title}`,
            enabled: () => true,
            action: () => {
              this.tether.flags['dark:read:' + k] = true;
              this.d.read(title, text);
            },
          };
        })(),
      });
    }
  }

  /** A scar: fused glass underfoot, cracks of violet, leaning monoliths you can climb. */
  private scar(id: string, cx: number, cz: number, R: number) {
    const disc = new THREE.RingGeometry(0.5, R, 40, 8).rotateX(-Math.PI / 2);
    const pos = disc.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + cx,
        z = pos.getZ(i) + cz;
      pos.setXYZ(i, x, heightAt(x, z) + 0.07, z);
    }
    disc.computeVertexNormals();
    this.geos.push(disc);
    const glass = new THREE.Mesh(disc, this.mats.glass);
    glass.receiveShadow = true;
    this.props.add(glass);
    const kit = new RuinKit(cx, cz, hash(cx, cz) * 6.28, Math.floor(hash(cx, cz, 1) * 1e6));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2,
        h = 14 + kit.r() * 14;
      kit.box(3.5 + kit.r() * 2, h, 4, Math.cos(a) * (R + 3), h * 0.42, Math.sin(a) * (R + 3), 0, -a, (kit.r() - 0.5) * 0.4);
    }
    for (let i = 0; i < 12; i++) kit.crack(0, 0, R * (0.5 + kit.r() * 0.5), (i / 12) * Math.PI * 2 + kit.r() * 0.3);
    kit.box(1.6, 1.1, 1.6, 0, 0.4, 0, 0, 0, 0, 'stone', false);
    const built = kit.finish(this.mats, this.crackMat);
    this.props.add(built.group);
    physics.dark(() => {
      for (const b of built.boxes) this.solids.push(markClimbable(physics.addBox(b.c, b.h, b.q)));
    });
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.65, 1), this.echo);
    this.geos.push(orb.geometry);
    orb.position.set(cx, heightAt(cx, cz) + 1.6, cz);
    orb.name = 'memory:' + id;
    this.props.add(orb);
  }

  // ---- streaming --------------------------------------------------------------------------------
  /** Load what's near a point now (before a teleport lands there). */
  warm(p: THREE.Vector3) {
    this.dress(p, true);
    this.stream(p, true);
  }

  /** Dead trees, graves and cracks around the player (rebuilt every 24 m). */
  private dress(p: THREE.Vector3, force = false) {
    if (!force && this.dressedAt.distanceToSquared(p) < 24 * 24) return;
    this.dressedAt.copy(p);
    const R = 230;
    const spots: Tree[] = this.d.treesNear(p.x, p.z, R).filter((t) => !this.onSite(t[0], t[2], 2) && !this.nearNode(t[0], t[2], 10));
    // The Dark's forest is thicker than ours, and stands even where the fields are.
    const C = 22;
    const i0 = Math.floor((p.x - R) / C),
      i1 = Math.floor((p.x + R) / C),
      j0 = Math.floor((p.z - R) / C),
      j1 = Math.floor((p.z + R) / C);
    const graves: THREE.Vector3[] = [],
      cracks: [number, number, number, number][] = [];
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const h = hash(i, j, 11);
        const x = (i + hash(i, j, 12)) * C,
          z = (j + hash(i, j, 13)) * C;
        if (Math.hypot(x - p.x, z - p.z) > R) continue;
        if (h < 0.42 && this.dry(x, z, 0.75) && !this.onSite(x, z, 2) && !this.nearNode(x, z, 12)) spots.push([x, heightAt(x, z), z, hash(i, j, 14) * 6.28, 7 + hash(i, j, 15) * 10]);
        if (h > 0.9 && this.dry(x, z, 0.85) && !this.onSite(x, z) && !this.nearNode(x, z, 8)) {
          const n = 1 + Math.floor(hash(i, j, 16) * 4);
          for (let g = 0; g < n; g++) graves.push(new THREE.Vector3(x + (hash(i, j, 20 + g) - 0.5) * 8, 0, z + (hash(i, j, 30 + g) - 0.5) * 8));
        }
        if (h > 0.7 && h < 0.8 && this.dry(x, z, 0.8)) cracks.push([x, z, 4 + hash(i, j, 17) * 9, hash(i, j, 18) * 3.14]);
      }
    const m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      s = new THREE.Vector3(),
      at = new THREE.Vector3(),
      up = new THREE.Vector3(0, 1, 0);
    for (const t of this.trees) t.count = 0;
    for (const [x, y, z, rot, h] of spots) {
      const mesh = this.trees[Math.floor(Math.abs(Math.sin(x * 12.9 + z * 78.2)) * 1000) % 3];
      if (mesh.count >= 2400) continue;
      const hh = Math.max(5, h * 1.15);
      q.setFromAxisAngle(up, rot);
      s.set(hh * 1.1, hh, hh * 1.1);
      at.set(x, y - 0.2, z);
      m.compose(at, q, s);
      mesh.setMatrixAt(mesh.count++, m);
    }
    for (const t of this.trees) t.instanceMatrix.needsUpdate = true;
    this.graves.count = 0;
    for (const g of graves) {
      if (this.graves.count >= 1400) break;
      const e = new THREE.Euler((hash(g.x, g.z, 1) - 0.5) * 0.5, hash(g.x, g.z, 2) * 6, (hash(g.x, g.z, 3) - 0.5) * 0.5);
      m.compose(at.set(g.x, heightAt(g.x, g.z) + 0.4, g.z), q.setFromEuler(e), s.set(1, 0.8 + hash(g.x, g.z, 4) * 0.5, 1));
      this.graves.setMatrixAt(this.graves.count++, m);
    }
    this.graves.instanceMatrix.needsUpdate = true;
    this.cracks.count = 0;
    for (const [x, z, len, a] of cracks) {
      if (this.cracks.count >= 900) break;
      m.compose(at.set(x, heightAt(x, z) + 0.08, z), q.setFromAxisAngle(up, a), s.set(1, 1, len));
      this.cracks.setMatrixAt(this.cracks.count++, m);
    }
    this.cracks.instanceMatrix.needsUpdate = true;
    // Trunks you can walk into near the player.
    const keep = new Set<string>();
    physics.dark(() => {
      for (const [x, y, z, , h] of spots) {
        if (Math.hypot(x - p.x, z - p.z) > 48) continue;
        const key = `${Math.round(x * 2)},${Math.round(z * 2)}`;
        keep.add(key);
        if (!this.treeSolids.has(key)) this.treeSolids.set(key, physics.addCylinder(new THREE.Vector3(x, y + 2, z), 2.2, Math.max(0.25, Math.max(5, h * 1.15) * 0.03)));
      }
    });
    for (const [key, c] of this.treeSolids)
      if (!keep.has(key)) {
        physics.removeStatic(c);
        this.treeSolids.delete(key);
      }
  }

  /** Ruins, mirrors, caches and packs: which exist near a point. */
  private stream(p: THREE.Vector3, force = false) {
    if (!force && this.sitesAt.distanceToSquared(p) < 30 * 30) return;
    this.sitesAt.copy(p);
    // Wild ruins: one cell in two of a 300 m grid has one.
    const RC = 300;
    const want = new Set<string>();
    for (let i = Math.floor((p.x - 450) / RC); i <= Math.floor((p.x + 450) / RC); i++)
      for (let j = Math.floor((p.z - 450) / RC); j <= Math.floor((p.z + 450) / RC); j++) {
        if (hash(i, j, 40) > 0.55) continue;
        const key = `ruin:${i},${j}`;
        want.add(key);
        if (this.sites.some((s) => s.key === key)) continue;
        const x = (i + 0.15 + hash(i, j, 41) * 0.7) * RC,
          z = (j + 0.15 + hash(i, j, 42) * 0.7) * RC;
        const kind: RuinKind = RUIN_KINDS[Math.floor(hash(i, j, 43) * RUIN_KINDS.length)];
        if (!this.dry(x, z, 0.88) || this.nearNode(x, z, 30) || this.mirrors.some((m) => Math.hypot(m.x - x, m.z - z) < m.r + 40)) continue;
        const seed = Math.floor(hash(i, j, 44) * 1e6);
        this.sites.push({
          key,
          x,
          z,
          r: RUIN_R[kind],
          build: () => {
            const kit = new RuinKit(x, z, hash(i, j, 45) * Math.PI * 2, seed);
            ruin(kit, kind);
            return kit.finish(this.mats, this.crackMat);
          },
        });
      }
    this.sites = this.sites.filter((s) => {
      if (s.key.startsWith('scar:') || want.has(s.key)) return true;
      this.unbuild(s);
      return false;
    });
    for (const s of [...this.sites, ...this.mirrors]) {
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      const show = s.key.startsWith('mirror:') && (s.r > 30 || s.key.includes('elvenSanctum')) ? 1500 : 520;
      if (d < show && !s.built && !s.key.startsWith('scar:')) {
        s.built = s.build();
        this.group.add(s.built.group);
        if (s.stone) this.actions.push(s.stone);
      } else if (d > show + 120 && s.built) this.unbuild(s);
      if (s.built && d < 160 && !s.solids) physics.dark(() => (s.solids = s.built!.boxes.map((b) => markClimbable(physics.addBox(b.c, b.h, b.q)))));
      else if (s.solids && d > 200) {
        for (const c of s.solids) physics.removeStatic(c);
        s.solids = undefined;
      }
    }
    // Black-iron caches: one cell in three of a 260 m grid.
    const CC = 260;
    const caches = new Set<string>();
    for (let i = Math.floor((p.x - 320) / CC); i <= Math.floor((p.x + 320) / CC); i++)
      for (let j = Math.floor((p.z - 320) / CC); j <= Math.floor((p.z + 320) / CC); j++) {
        if (hash(i, j, 60) > 0.33) continue;
        const key = `${i},${j}`;
        const x = (i + 0.2 + hash(i, j, 61) * 0.6) * CC,
          z = (j + 0.2 + hash(i, j, 62) * 0.6) * CC;
        if (Math.hypot(x - p.x, z - p.z) > 320 || !this.dry(x, z, 0.85) || this.nearNode(x, z, 15)) continue;
        caches.add(key);
        if (!this.caches.has(key)) this.addCache(key, x, z);
      }
    for (const [key, c] of this.caches) if (!caches.has(key)) this.dropCache(c);
    // Packs of shades: one cell in two of a 180 m grid, while you're near.
    const PC = 180;
    for (let i = Math.floor((p.x - 260) / PC); i <= Math.floor((p.x + 260) / PC); i++)
      for (let j = Math.floor((p.z - 260) / PC); j <= Math.floor((p.z + 260) / PC); j++) {
        if (hash(i, j, 80) > 0.5) continue;
        const key = `pack:${i},${j}`;
        if (this.packs.has(key) || this.cleared.has(key)) continue;
        const x = (i + 0.2 + hash(i, j, 81) * 0.6) * PC,
          z = (j + 0.2 + hash(i, j, 82) * 0.6) * PC;
        if (!this.dry(x, z, 0.8) || this.nearNode(x, z, 28)) continue;
        this.packs.set(key, { key, x, z, foes: [] });
      }
  }

  private unbuild(s: Site) {
    if (s.stone) {
      const i = this.actions.indexOf(s.stone);
      if (i >= 0) this.actions.splice(i, 1);
    }
    if (s.solids) for (const c of s.solids) physics.removeStatic(c);
    s.solids = undefined;
    if (s.built) {
      s.built.group.removeFromParent();
      s.built.group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    }
    s.built = undefined;
  }

  private addCache(key: string, x: number, z: number) {
    const at = this.at(x, z);
    const tier = Math.max(1, Math.round(this.d.level(x, z) / 8));
    const g = new THREE.Group();
    g.position.copy(at);
    g.rotation.y = hash(x, z, 63) * 6.28;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.8), this.mats.char);
    body.position.y = 0.35;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.18, 0.86), this.mats.stone);
    lid.position.y = 0.78;
    const seam = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.05, 0.88), this.crackMat);
    seam.position.y = 0.69;
    g.add(body, lid, seam);
    const open = () => !!this.tether.flags['dark:cache:' + key];
    if (open()) {
      lid.rotation.x = -1.2;
      lid.position.set(0, 0.9, -0.4);
      seam.visible = false;
    }
    this.group.add(g);
    const action: Interactable = {
      pos: at,
      radius: 2.4,
      level: 3,
      label: () => (open() ? 'An empty cache' : 'Open the black-iron cache'),
      enabled: () => !open(),
      action: () => {
        if (open()) return;
        this.tether.flags['dark:cache:' + key] = true;
        lid.rotation.x = -1.2;
        lid.position.set(0, 0.9, -0.4);
        seam.visible = false;
        this.fx.add.spawn({ pos: at.clone().setY(at.y + 0.8), spread: 0.6, count: 30, life: [0.4, 1.1], size: [0.14, 0.03], color: 0x9a5aff, color2: 0x0a0414, upBias: 1.6 });
        this.d.toast(`The cache opens cold under your hand. Inside: ${this.d.loot(at.clone(), tier)}.`);
      },
    };
    this.actions.push(action);
    this.caches.set(key, { key, at, tier, mesh: g, action });
  }

  private dropCache(c: Cache) {
    c.mesh.removeFromParent();
    c.mesh.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    const i = this.actions.indexOf(c.action);
    if (i >= 0) this.actions.splice(i, 1);
    this.caches.delete(c.key);
  }

  /** A foe of the Dark, risen out of the ground, as strong as the place it stands in. */
  private rise(id: string, kind: 'skeleton' | 'zombie' | 'knight', x: number, z: number, level: number) {
    const at = this.at(x, z);
    const f: Foe = kind === 'knight' ? new LivingArmour(at, this.scene, this.fx) : new Undead(kind, at, hash(x, z) * 6.28, this.scene, this.fx);
    const k = Math.max(0, level - 3);
    f.maxHp = f.hp = Math.round(f.maxHp * (1 + k * 0.12));
    f.damageScale = 1 + k * 0.06;
    if (f instanceof Undead) f.level = level;
    this.foes.set(id, f);
    this.fx.add.spawn({ pos: at.clone().setY(at.y + 0.5), spread: 1.2, count: 22, life: [0.4, 0.9], size: [0.22, 0.05], color: 0x4a1a6a, color2: 0x000000, upBias: 1.4 });
    return f;
  }

  update(dt: number, player: Player) {
    const p = player.pos;
    this.dress(p);
    this.stream(p);
    if (!onMap(p.x, p.z)) return;
    // The scars keep their knights, and two shades each.
    for (const s of SCARS) {
      const c = this.memorySpots.get(s.id);
      if (!c || c.distanceTo(p) > 95) continue;
      const lvl = this.d.level(c.x, c.z) + 4 + SCARS.indexOf(s);
      for (let i = 0; i < 3; i++) {
        const id = `${s.id}:${i}`;
        if (this.foes.has(id) || this.tether.flags['dark:slain:' + id]) continue;
        const a = i * 2.1 + 0.4;
        this.rise(id, i === 0 ? 'knight' : 'skeleton', c.x + Math.cos(a) * 12, c.z + Math.sin(a) * 12, lvl);
      }
    }
    // Packs rise when you come within 110 m.
    if (this.foes.size < 14)
      for (const pack of this.packs.values()) {
        if (pack.foes.length || Math.hypot(pack.x - p.x, pack.z - p.z) > 110) continue;
        const lvl = this.d.level(pack.x, pack.z) + 2;
        const n = 2 + Math.floor(hash(pack.x, pack.z, 90) * 3);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2,
            x = pack.x + Math.cos(a) * 3.5,
            z = pack.z + Math.sin(a) * 3.5;
          pack.foes.push(this.rise(`${pack.key}:${i}`, hash(pack.x, pack.z, 91 + i) < 0.35 ? 'zombie' : 'skeleton', x, z, lvl));
        }
        break;
      }
    const crowd = [...this.foes.values()].filter((f): f is Undead => f instanceof Undead);
    for (const [id, f] of this.foes) {
      if (f instanceof Undead) f.update(dt, player, crowd);
      else f.update(dt, player);
      if (!f.alive && !id.startsWith('pack:')) this.tether.flags['dark:slain:' + id] = true;
      if (f.dead || f.position.distanceTo(p) > 230) {
        f.dispose();
        this.foes.delete(id);
      }
    }
    for (const pack of this.packs.values()) {
      if (!pack.foes.length) continue;
      if (pack.foes.every((f) => !f.alive)) {
        this.cleared.add(pack.key);
        this.packs.delete(pack.key);
      } else if (pack.foes.every((f) => !this.foes.has(`${pack.key}:${pack.foes.indexOf(f)}`))) pack.foes = [];
    }
    // The nearest violet fire lights its ruin.
    let best: THREE.Vector3 | null = null,
      bd = 70;
    for (const s of [...this.sites, ...this.mirrors])
      if (s.built)
        for (const f of s.built.fires) {
          const d = f.distanceTo(p);
          if (d < bd) {
            bd = d;
            best = f;
          }
        }
    this.fireLight.intensity = best ? 7 * (0.85 + Math.sin(performance.now() / 140) * 0.15) : 0;
    if (best) this.fireLight.position.copy(best).y += 1.6;
    // What you see first in each mirror.
    for (const s of this.mirrors)
      if (s.seen && !this.tether.flags[s.seen.flag] && Math.hypot(s.x - p.x, s.z - p.z) < s.r + 30) {
        this.tether.flags[s.seen.flag] = true;
        this.d.toast(s.seen.text);
      }
    // Ash falls; now and then a mote of violet drifts up out of the cracks.
    this.ashT += dt;
    if (Math.random() < dt * 30) {
      const a = Math.random() * Math.PI * 2,
        rr = Math.random() * 30;
      this.fx.add.spawn({ pos: new THREE.Vector3(p.x + Math.cos(a) * rr, p.y + 6 + Math.random() * 6, p.z + Math.sin(a) * rr), vel: new THREE.Vector3(0.3, -0.6, 0.1), spread: 1, count: 1, life: [3, 5], size: [0.07, 0.03], color: 0x5a5560, color2: 0x1a1820, gravity: 0.1 });
    }
    if (Math.random() < dt * 3) {
      const a = Math.random() * Math.PI * 2,
        rr = 4 + Math.random() * 20,
        x = p.x + Math.cos(a) * rr,
        z = p.z + Math.sin(a) * rr;
      this.fx.add.spawn({ pos: new THREE.Vector3(x, heightAt(x, z) + 0.2, z), vel: new THREE.Vector3(0, 0.8, 0), spread: 0.4, count: 1, life: [2, 3.5], size: [0.09, 0.02], color: 0x9a5aff, color2: 0x200838, gravity: -0.05 });
    }
    // The Lost Lanterns lend the Dark their interaction.
    for (const b of this.d.borrowed()) if (!this.actions.includes(b)) this.actions.push(b);
  }

  dispose() {
    for (const f of this.foes.values()) f.dispose();
    this.foes.clear();
    for (const s of [...this.sites, ...this.mirrors]) this.unbuild(s);
    this.sites = [];
    this.mirrors = [];
    for (const c of [...this.caches.values()]) this.dropCache(c);
    for (const c of this.treeSolids.values()) physics.removeStatic(c);
    this.treeSolids.clear();
    for (const c of this.solids) physics.removeStatic(c);
    this.solids = [];
    this.props.traverse((o) => {
      if (o instanceof THREE.Mesh && !this.geos.includes(o.geometry)) o.geometry.dispose();
    });
    this.group.removeFromParent();
    this.actions.length = 0;
    for (const t of this.trees) t.dispose();
    this.graves.dispose();
    this.cracks.dispose();
    for (const g of this.geos) g.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
    for (const m of [this.bark, this.crackMat, this.glow, this.echo, this.shaftMat]) m.dispose();
  }
}
