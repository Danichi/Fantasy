import * as THREE from 'three';
import { registerDoor, DOORS, type Door, type InteriorKind } from './doors';
import { buildHouse, worldUV, type WorldMats, type HouseSpec } from './buildings';
import { heightAt } from './terrainHeight';
import { physics } from '../physics/physics';
import { mulberry32 } from '../core/math';
import { StaticBatch, buildShip } from './cityKit';
import { sunwheelTexture } from './glenLandmarks';
import { WAYSTONES } from './kingsRoad';
import {
  CAP_CENTER, CAP_RX, CAP_RZ, PALACE, RING_R, PALACE_R, RING_Y, TOP_Y, EAST_GATE, SOUTH_GATE, WEST_GATE, PLAZA, MARKET, TEMPLE,
  GUILD, COMMANDERY, ENVOYS, LIBRARY, COLLEGIUM, CHANCERY, NOBLES, QUEENS_GARDEN, KINGSBRIDGE, QUAY, AVENUE_DIR, RAMPS,
  CAP_STREETS, CAP_RESERVED, CAP_SQUARES, RING_STREET_R, capitalGround, insideWalls, type P2,
} from './capitalCity';
import type { FX } from '../fx/particles';
import type { FishingSpot } from './fishing';

// The Royal Capital of Cresha (World Expansion phase 8, prompt §6 and the
// design board): white marble, gold and royal blue on Crown Hill, west of
// Elder Glen at the end of the Crown Road. Walls with three gates; the Lower
// City (the Plaza of Crowns and King Aldric's statue, the Crown Market, the
// Temple of the Dawn, the Grand Hall of the Adventurer's Guild, the Silver
// Lance Commandery and its tilting yard, the envoys' quarter, the Gilded Stag,
// the Crown Stables); the Crown Ring terrace (the Royal Library, the Arcane
// Collegium, the Royal Chancery, the noble houses, the Queen's Garden); and
// the palace on the summit with its keep and golden spires. Outside the West
// Gate the Kingsbridge crosses the river beside a fishing quay.
//
// The city streams: a cheap skyline stands on the horizon from anywhere, and
// the real city is built (over a few frames) as you come within reach of it.

const v3 = (x: number, z: number, dy = 0) => new THREE.Vector3(x, heightAt(x, z) + dy, z);

/** Where things are (quests, services, tests). */
export const CAPITAL_SPOTS = {
  eastGate: new THREE.Vector3(EAST_GATE[0] - 18, 0, EAST_GATE[1]),
  plaza: new THREE.Vector3(PLAZA[0], 0, PLAZA[1]),
  throneDoor: new THREE.Vector3(),
  forecourt: new THREE.Vector3(),
  temple: new THREE.Vector3(TEMPLE[0], 0, TEMPLE[1] - 24),
  library: new THREE.Vector3(LIBRARY[0], 0, LIBRARY[1]),
  collegium: new THREE.Vector3(COLLEGIUM[0], 0, COLLEGIUM[1]),
  guild: new THREE.Vector3(GUILD[0], 0, GUILD[1] - 12),
  commandery: new THREE.Vector3(COMMANDERY[0], 0, COMMANDERY[1]),
  lists: new THREE.Vector3(COMMANDERY[0] - 2, 0, COMMANDERY[1] + 8),
  stable: new THREE.Vector3(-3214, 0, -1004),
  quay: new THREE.Vector3(QUAY[0], 0, QUAY[1]),
  bridge: new THREE.Vector3(KINGSBRIDGE[0], 0, KINGSBRIDGE[1]),
  envoys: new THREE.Vector3(ENVOYS[0], 0, ENVOYS[1]),
  garden: new THREE.Vector3(QUEENS_GARDEN[0], 0, QUEENS_GARDEN[1]),
};

// The palace's own frame: u out along the Royal Avenue (east), v across it.
const PYAW = Math.atan2(AVENUE_DIR[0], AVENUE_DIR[1]);
const pal = (u: number, v: number): P2 => [PALACE[0] + AVENUE_DIR[0] * u + Math.cos(PYAW) * v, PALACE[1] + AVENUE_DIR[1] * u - Math.sin(PYAW) * v];
{
  const [fx, fz] = pal(1.2, 0);
  CAPITAL_SPOTS.throneDoor.set(fx, TOP_Y, fz);
  const [cx, cz] = pal(20, 0);
  CAPITAL_SPOTS.forecourt.set(cx, TOP_Y, cz);
}

/** The capital's waystone stands outside the East Gate. */
WAYSTONES.push({ id: 'capital', name: 'The Royal Capital (East Gate)', pos: new THREE.Vector3(EAST_GATE[0] + 26, 0, EAST_GATE[1] + 16) });

// ---- materials -----------------------------------------------------------------------

/** A painted material re-tinted (keeping the weathering the shader adds to buildings). */
function tinted(src: THREE.Material, r: number, g: number, b: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const s = src as THREE.MeshStandardMaterial;
  const m = s.clone();
  m.defines = { ...(s.defines ?? {}) };
  m.userData = { ...s.userData };
  m.color.setRGB(r, g, b);
  m.setValues(extra);
  return m;
}

interface CapMats {
  marble: THREE.MeshStandardMaterial;
  marbleDark: THREE.MeshStandardMaterial;
  blue: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  glow: THREE.MeshStandardMaterial;
  hedge: THREE.MeshStandardMaterial;
  water: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial;
  arcane: THREE.MeshStandardMaterial;
  houses: WorldMats;
}

let mats: CapMats | null = null;
function capMats(m: WorldMats): CapMats {
  if (mats) return mats;
  const stone = (m.bridgeStone ?? m.stone);
  mats = {
    marble: tinted(stone, 1.8, 1.76, 1.66),
    marbleDark: tinted(stone, 1.25, 1.22, 1.18),
    blue: tinted(m.slate, 0.62, 0.86, 1.55),
    gold: new THREE.MeshStandardMaterial({ color: 0xe2bc62, metalness: 0.75, roughness: 0.32 }),
    glow: new THREE.MeshStandardMaterial({ color: 0x23304a, emissive: 0xffc070, emissiveIntensity: 0, roughness: 0.25, metalness: 0.3 }),
    hedge: new THREE.MeshStandardMaterial({ color: 0x3f7434, roughness: 1 }),
    water: new THREE.MeshStandardMaterial({ color: 0x3a8ab0, roughness: 0.08, metalness: 0.15 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x3a3632, metalness: 0.6, roughness: 0.5 }),
    arcane: new THREE.MeshStandardMaterial({ color: 0x6a5aff, emissive: 0x7a6aff, emissiveIntensity: 1.4, roughness: 0.3 }),
    houses: {
      ...m,
      plaster: tinted(m.plaster, 1.1, 1.1, 1.12),
      slate: tinted(m.slate, 0.7, 0.9, 1.4),
      stone: tinted(stone, 1.35, 1.32, 1.26),
    },
  };
  return mats;
}

const bannerCache = new Map<string, THREE.MeshStandardMaterial>();
/** A hanging banner: field colour, an emblem, a swallowtail. */
function bannerMat(field: number, emblem: number, kind: 'lozenge' | 'crown' | 'lance' | 'sun' | 'leaf' | 'anvil' | 'eagle' | 'star' | 'sword' = 'crown') {
  const key = field + ':' + emblem + ':' + kind;
  const hit = bannerCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 160;
  const g = c.getContext('2d')!;
  const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  g.fillStyle = hex(field); g.fillRect(0, 0, 64, 160);
  g.fillStyle = hex(emblem); g.strokeStyle = hex(emblem); g.lineWidth = 4;
  g.fillRect(0, 0, 64, 8);
  g.fillRect(4, 12, 56, 3);
  if (kind === 'crown') {
    g.beginPath(); g.moveTo(14, 82); g.lineTo(14, 58); g.lineTo(23, 70); g.lineTo(32, 52); g.lineTo(41, 70); g.lineTo(50, 58); g.lineTo(50, 82); g.closePath(); g.fill();
    g.fillRect(14, 86, 36, 6);
  } else if (kind === 'lance') {
    g.beginPath(); g.moveTo(32, 30); g.lineTo(38, 60); g.lineTo(34, 60); g.lineTo(34, 120); g.lineTo(30, 120); g.lineTo(30, 60); g.lineTo(26, 60); g.closePath(); g.fill();
    g.fillRect(22, 92, 20, 5);
  } else if (kind === 'sun') {
    g.beginPath(); g.arc(32, 74, 12, 0, Math.PI * 2); g.fill();
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; g.beginPath(); g.moveTo(32 + Math.cos(a) * 15, 74 + Math.sin(a) * 15); g.lineTo(32 + Math.cos(a) * 24, 74 + Math.sin(a) * 24); g.stroke(); }
  } else if (kind === 'leaf') {
    g.beginPath(); g.ellipse(32, 74, 11, 26, 0.3, 0, Math.PI * 2); g.fill();
  } else if (kind === 'anvil') {
    g.fillRect(16, 60, 32, 10); g.fillRect(26, 70, 12, 14); g.fillRect(18, 84, 28, 8);
  } else if (kind === 'eagle') {
    g.beginPath(); g.moveTo(32, 54); g.lineTo(58, 64); g.lineTo(38, 72); g.lineTo(36, 96); g.lineTo(28, 96); g.lineTo(26, 72); g.lineTo(6, 64); g.closePath(); g.fill();
  } else if (kind === 'star') {
    g.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k / 10) * Math.PI * 2, r = k % 2 ? 8 : 20; g.lineTo(32 + Math.cos(a) * r, 74 + Math.sin(a) * r); }
    g.closePath(); g.fill();
  } else if (kind === 'sword') {
    g.fillRect(30, 40, 4, 64); g.fillRect(20, 92, 24, 5); g.fillRect(29, 97, 6, 12);
  } else {
    g.beginPath(); g.moveTo(32, 46); g.lineTo(48, 76); g.lineTo(32, 106); g.lineTo(16, 76); g.closePath(); g.fill();
  }
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.moveTo(0, 160); g.lineTo(32, 138); g.lineTo(64, 160); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
  bannerCache.set(key, mat);
  return mat;
}

function signMat(text: string, sub = '', bg = '#f3ead2', ink = '#1f2c4a') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#c9a55a'; g.lineWidth = 10; g.strokeRect(5, 5, 502, 118);
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 40;
  g.font = `700 ${size}px Cinzel, serif`;
  while (g.measureText(text).width > 470 && size > 20) g.font = `700 ${--size}px Cinzel, serif`;
  g.fillText(text, 256, sub ? 50 : 64);
  if (sub) { g.font = '600 22px Cinzel, serif'; g.fillText(sub, 256, 94); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, side: THREE.DoubleSide });
}

// ---- the builder ---------------------------------------------------------------------

/** Roof helpers: a gable over w (across) × d (along local z), and a four-sided hip. */
function gable(w: number, d: number, pitch: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 - 0.4, 0); s.lineTo(w / 2 + 0.4, 0); s.lineTo(0, pitch); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d + 0.8, bevelEnabled: false });
  g.translate(0, 0, -(d + 0.8) / 2);
  return g;
}
function hip(w: number, d: number, h: number) {
  return new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).scale(w + 1, h, d + 1).translate(0, h / 2, 0);
}
function pediment(w: number, h: number, depth: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return g;
}

interface LightMat { mat: THREE.MeshStandardMaterial; base: number }

export class RoyalCapital {
  /** the streamed city */
  readonly group = new THREE.Group();
  /** the skyline seen from far away */
  readonly proxy = new THREE.Group();
  readonly clearings: [number, number, number][] = [[CAP_CENTER[0], CAP_CENTER[1], Math.max(CAP_RX, CAP_RZ) + 16], [KINGSBRIDGE[0], KINGSBRIDGE[1], 60], [QUAY[0], QUAY[1], 24]];
  readonly fishingSpots: FishingSpot[];
  built = false;
  /** called once the city stands, with the doors it added (so they can be walked through) */
  onBuilt: ((doors: Door[]) => void) | null = null;
  private doorStart = 0;
  private building = false;
  private steps: (() => void)[] = [];
  /** static decorations (windows, banners, lamps, water) batched by material */
  private deco: StaticBatch | null = null;
  private lights: LightMat[] = [];
  private fountains: THREE.Vector3[] = [];
  private runes: THREE.Object3D[] = [];
  private crystal: THREE.Object3D | null = null;
  private crystalY = 0;
  private boats: { g: THREE.Object3D; phase: number; y: number }[] = [];
  private t = 0;
  private m: CapMats;
  private rnd = mulberry32(3300);

  constructor(scene: THREE.Scene, private world: WorldMats, private fx: FX) {
    this.m = capMats(world);
    scene.add(this.group, this.proxy);
    this.group.visible = false;
    this.buildProxy();
    const W = -1.2;
    this.fishingSpots = [
      { pos: v3(QUAY[0] - 13, QUAY[1] + 1.5), water: new THREE.Vector3(QUAY[0] - 22, W, QUAY[1] + 2), kind: 'river', name: 'The Crown Quay' },
      { pos: v3(KINGSBRIDGE[0] + 70, KINGSBRIDGE[1] + 12), water: new THREE.Vector3(KINGSBRIDGE[0] + 52, W, KINGSBRIDGE[1] + 16), kind: 'river', name: 'Below the Kingsbridge' },
    ];
  }

  /** Near enough that the city should exist? */
  private dist(p: THREE.Vector3) {
    return Math.hypot(p.x - CAP_CENTER[0], p.z - CAP_CENTER[1]);
  }

  update(dt: number, player: THREE.Vector3, night: number) {
    const d = this.dist(player);
    if (!this.built && !this.building && d < 1250) this.startBuild(d < 520);
    if (this.building) {
      // A few steps a frame: the whole city in about a second.
      const t0 = performance.now();
      while (this.steps.length && performance.now() - t0 < 12) this.steps.shift()!();
      if (!this.steps.length) this.finishBuild();
    }
    const near = this.built && d < 1500;
    this.group.visible = near;
    this.proxy.visible = !near;
    if (!near) return;
    this.t += dt;
    for (const l of this.lights) l.mat.emissiveIntensity = l.base + night * 2.6;
    this.runes.forEach((r, i) => {
      r.rotation.y = this.t * (0.25 + i * 0.07) * (i % 2 ? -1 : 1);
    });
    if (this.crystal) {
      this.crystal.position.y = this.crystalY + Math.sin(this.t * 0.9) * 0.6;
      this.crystal.rotation.y = this.t * 0.5;
    }
    for (const b of this.boats) {
      b.g.position.y = b.y + Math.sin(this.t * 0.8 + b.phase) * 0.08;
      b.g.rotation.z = Math.sin(this.t * 0.6 + b.phase) * 0.02;
    }
    if (d < 420) for (const f of this.fountains) {
      if (Math.random() < dt * 10) this.fx.add.spawn({ pos: f, vel: new THREE.Vector3(0, 1.6, 0), spread: 0.5, count: 1, life: [0.5, 0.9], size: [0.13, 0.05], color: 0xd8f0ff, color2: 0x7ab8e0, gravity: 6, upBias: 1.2 });
    }
  }

  /** Build the city now (tests, or a teleport straight into it). */
  buildNow() {
    if (this.built) return;
    if (!this.building) this.startBuild(true);
    while (this.steps.length) this.steps.shift()!();
    this.finishBuild();
  }

  private startBuild(now: boolean) {
    this.building = true;
    this.doorStart = DOORS.length;
    const B = new StaticBatch(); // walls, terraces, gates
    const L = new StaticBatch(); // landmarks
    const H = new StaticBatch(); // houses
    const D = (this.deco = new StaticBatch()); // decorations
    this.steps = [
      () => this.buildWalls(B, 0),
      () => this.buildWalls(B, 1),
      () => this.buildTerraces(B),
      () => this.buildGates(B),
      () => this.buildPalace(L),
      () => this.buildPlaza(L),
      () => this.buildMarket(L),
      () => this.buildTemple(L),
      () => this.buildGuild(L),
      () => this.buildCommandery(L),
      () => this.buildEnvoys(L),
      () => this.buildRing(L),
      () => this.buildLibrary(L),
      () => this.buildCollegium(L),
      () => this.buildChancery(L),
      () => this.buildStablesInn(L),
      () => this.buildRiver(L),
      ...this.houseSteps(H),
      () => this.buildStreetLights(B),
      () => B.build(this.group),
      () => L.build(this.group),
      () => H.build(this.group),
      () => {
        for (const m of D.build(this.group)) m.castShadow = false;
        this.deco = null;
      },
    ];
    if (now) {
      while (this.steps.length) this.steps.shift()!();
      this.finishBuild();
    }
  }

  private finishBuild() {
    this.building = false;
    this.built = true;
    this.group.visible = true;
    this.onBuilt?.(DOORS.slice(this.doorStart));
  }

  // ---- little kit pieces -----------------------------------------------------------------

  private add(g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0, b?: StaticBatch, uv = 1.5) {
    const mesh = new THREE.Mesh(worldUV(g, uv), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    if (b) b.addObject(mesh);
    else {
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    return mesh;
  }
  /** A static decoration: batched with others of its material once the city is built. */
  private put(o: THREE.Object3D) {
    if (this.deco) this.deco.addObject(o);
    else this.group.add(o);
  }
  private solid(w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) {
    physics.addBox(new THREE.Vector3(x, y, z), new THREE.Vector3(w / 2, h / 2, d / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)));
  }
  /** A block in a local frame (origin ox,oz; yaw; u forward, v right); dims are (across v, height, along u). */
  private frame(ox: number, oz: number, yaw: number, b: StaticBatch) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const at = (u: number, v: number): P2 => [ox + v * c + u * s, oz - v * s + u * c];
    return {
      at,
      box: (w: number, h: number, d: number, u: number, y: number, v: number, mat: THREE.Material, collide = true) => {
        const [x, z] = at(u, v);
        this.add(new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z, yaw, b, 1.2);
        if (collide) this.solid(w, h, d, x, y + h / 2, z, yaw);
      },
      geo: (g: THREE.BufferGeometry, mat: THREE.Material, u: number, y: number, v: number, extraYaw = 0, uv = 1.2) => {
        const [x, z] = at(u, v);
        this.add(g, mat, x, y, z, yaw + extraYaw, b, uv);
      },
      yaw,
    };
  }
  /** A round tower: marble drum, a ring of merlons or a blue cone roof with a gold finial. */
  private tower(x: number, z: number, r: number, h: number, b: StaticBatch, opts: { base?: number; roof?: 'cone' | 'crown' | 'gold'; finial?: boolean } = {}) {
    const y = opts.base ?? heightAt(x, z) - 0.6;
    const m = this.m;
    this.add(new THREE.CylinderGeometry(r, r * 1.08, h, 18), m.marble, x, y + h / 2, z, 0, b, 1.2);
    this.add(new THREE.CylinderGeometry(r * 1.12, r * 1.12, 0.6, 18), m.marbleDark, x, y + h - 0.3, z, 0, b, 1.2);
    const roof = opts.roof ?? 'cone';
    if (roof === 'crown') {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        this.add(new THREE.BoxGeometry(0.9, 1.0, 0.7), m.marble, x + Math.cos(a) * r * 1.02, y + h + 0.5, z + Math.sin(a) * r * 1.02, -a, b, 1.2);
      }
    } else {
      const rm = roof === 'gold' ? m.gold : m.blue;
      const ch = r * 2.1;
      this.add(new THREE.ConeGeometry(r * 1.2, ch, 18), rm, x, y + h + ch / 2, z, 0, b, 1);
      if (opts.finial !== false) {
        this.add(new THREE.ConeGeometry(0.22, r * 0.9, 6), m.gold, x, y + h + ch + r * 0.42, z, 0, b);
        this.add(new THREE.SphereGeometry(0.32, 10, 8), m.gold, x, y + h + ch + 0.1, z, 0, b);
      }
    }
    physics.addCylinder(new THREE.Vector3(x, y + h / 2, z), h / 2, r);
    return y + h;
  }
  private banner(x: number, y: number, z: number, yaw: number, field = 0x24467e, emblem = 0xe8c060, kind: Parameters<typeof bannerMat>[2] = 'crown', w = 1.2, h = 3.2) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), bannerMat(field, emblem, kind));
    b.position.set(x, y, z);
    b.rotation.y = yaw;
    this.put(b);
  }
  /** A flag on a pole. */
  private flag(x: number, z: number, h: number, field: number, emblem: number, kind: Parameters<typeof bannerMat>[2], b: StaticBatch, base?: number) {
    const y = base ?? heightAt(x, z);
    this.add(new THREE.CylinderGeometry(0.08, 0.11, h, 6), this.m.gold, x, y + h / 2, z, 0, b);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.2).rotateZ(Math.PI / 2), bannerMat(field, emblem, kind));
    f.position.set(x + 1.15, y + h - 0.8, z);
    f.rotation.y = 0.2;
    this.put(f);
  }
  private sign(text: string, sub: string, x: number, y: number, z: number, yaw: number, w = 4) {
    const board = new THREE.Group();
    board.position.set(x, y, z);
    board.rotation.y = yaw;
    const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, w / 4 + 0.2, 0.08), this.m.gold);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), signMat(text, sub));
    front.position.z = 0.045;
    board.add(back, front);
    this.group.add(board);
  }
  private lamp(x: number, z: number, b: StaticBatch, base?: number) {
    const y = base ?? heightAt(x, z);
    this.add(new THREE.CylinderGeometry(0.08, 0.12, 3.6, 8), this.m.iron, x, y + 1.8, z, 0, b);
    this.add(new THREE.BoxGeometry(0.5, 0.18, 0.5), this.m.iron, x, y + 3.65, z, 0, b);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.48, 0.36), this.lampMat());
    l.position.set(x, y + 3.95, z);
    this.put(l);
  }
  private colours = new Map<number, THREE.MeshStandardMaterial>();
  private coals: THREE.MeshStandardMaterial | null = null;
  /** One plain material per colour (so batched props stay one draw per colour). */
  private colour(c: number) {
    let m = this.colours.get(c);
    if (!m) this.colours.set(c, (m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 })));
    return m;
  }
  private lampMatCache: THREE.MeshStandardMaterial | null = null;
  private lampMat() {
    if (!this.lampMatCache) {
      this.lampMatCache = new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xffb050, emissiveIntensity: 0.3 });
      this.lights.push({ mat: this.lampMatCache, base: 0.3 });
    }
    return this.lampMatCache;
  }
  private glowMat() {
    if (!this.lights.some((l) => l.mat === this.m.glow)) this.lights.push({ mat: this.m.glow, base: 0 }); // dark glass by day, lamplight at night
    return this.m.glow;
  }
  /** Columns in a row along a frame's v axis. */
  private colonnade(F: ReturnType<RoyalCapital['frame']>, u: number, v0: number, v1: number, n: number, y: number, h: number, r = 0.7) {
    for (let k = 0; k < n; k++) {
      const v = v0 + ((v1 - v0) * k) / Math.max(1, n - 1);
      F.geo(new THREE.CylinderGeometry(r, r * 1.1, h, 14), this.m.marble, u, y + h / 2, v);
      F.geo(new THREE.BoxGeometry(r * 2.6, 0.5, r * 2.6), this.m.marbleDark, u, y + 0.25, v);
      F.geo(new THREE.BoxGeometry(r * 2.5, 0.45, r * 2.5), this.m.marbleDark, u, y + h - 0.22, v);
      const [x, z] = F.at(u, v);
      physics.addCylinder(new THREE.Vector3(x, y + h / 2, z), h / 2, r);
    }
  }
  /** A house from the painted kit (whiter plaster, royal-blue slate), with its door. */
  private house(x: number, z: number, rot: number, spec: HouseSpec, b: StaticBatch, info: Partial<Door> = {}) {
    const { group, half, door } = buildHouse(spec, this.m.houses);
    let gy = Infinity;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) gy = Math.min(gy, heightAt(x + Math.cos(rot) * sx * half.x + Math.sin(rot) * sz * half.z, z - Math.sin(rot) * sx * half.x + Math.cos(rot) * sz * half.z));
    group.position.set(x, gy, z);
    group.rotation.y = rot;
    registerDoor(group, door, spec, info);
    b.addObject(group);
    physics.addBox(new THREE.Vector3(x, gy + half.y, z), half, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)));
    return { gy, half };
  }
  /** A door into a landmark built from blocks: the doorstep at (x, z) facing `yaw`. */
  private door(x: number, y: number, z: number, yaw: number, kind: InteriorKind, name: string, keeper: string | undefined, w: number, d: number, seed: number) {
    const g = new THREE.Object3D();
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    registerDoor(g, new THREE.Vector3(0, 0, 0), { w, d, floors: 2, roof: 'slate', seed }, { kind, name, keeper });
  }
  private hedge(x: number, z: number, w: number, d: number, yaw: number, b: StaticBatch, base?: number, h = 1.1) {
    const y = base ?? heightAt(x, z);
    this.add(new THREE.BoxGeometry(w, h, d), this.m.hedge, x, y + h / 2, z, yaw, b);
  }
  /** A clipped cone tree (cypress) or a round topiary. */
  private tree(x: number, z: number, b: StaticBatch, kind: 'cypress' | 'round' = 'cypress', base?: number, s = 1) {
    const y = base ?? heightAt(x, z);
    this.add(new THREE.CylinderGeometry(0.14 * s, 0.2 * s, 1.2 * s, 6), this.world.bark, x, y + 0.6 * s, z, 0, b);
    if (kind === 'cypress') this.add(new THREE.ConeGeometry(0.95 * s, 6.5 * s, 9), this.m.hedge, x, y + 4.0 * s, z, 0, b);
    else this.add(new THREE.SphereGeometry(1.5 * s, 10, 8), this.m.hedge, x, y + 2.4 * s, z, 0, b);
  }
  private fountain(x: number, z: number, r: number, b: StaticBatch, base?: number) {
    const y = base ?? heightAt(x, z);
    const m = this.m;
    this.add(new THREE.CylinderGeometry(r, r + 0.2, 0.9, 28, 1, true), m.marble, x, y + 0.45, z, 0, b, 1.2);
    this.add(new THREE.TorusGeometry(r + 0.05, 0.28, 6, 32).rotateX(Math.PI / 2), m.marble, x, y + 0.92, z, 0, b);
    const water = new THREE.Mesh(new THREE.CircleGeometry(r - 0.1, 28).rotateX(-Math.PI / 2), m.water);
    water.position.set(x, y + 0.62, z);
    this.put(water);
    physics.addCylinder(new THREE.Vector3(x, y + 0.5, z), 0.5, r + 0.2);
    return y;
  }

  // ---- the skyline ---------------------------------------------------------------------

  private buildProxy() {
    const m = this.m;
    const put = (g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.set(x, y, z);
      this.proxy.add(mesh);
    };
    // The wall ring and its towers.
    const ring = new THREE.CylinderGeometry(1, 1, 1, 48, 1, true).scale(CAP_RX, 12, CAP_RZ);
    put(ring, m.marble, CAP_CENTER[0], 12, CAP_CENTER[1]);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = CAP_CENTER[0] + Math.cos(a) * CAP_RX, z = CAP_CENTER[1] + Math.sin(a) * CAP_RZ;
      put(new THREE.CylinderGeometry(5, 5, 18, 8), m.marble, x, 14, z);
      put(new THREE.ConeGeometry(6, 10, 8), m.blue, x, 28, z);
    }
    // The hill's terraces: two stepped drums.
    // (Open drums: their tops would fight the terrain's own terraces.)
    put(new THREE.CylinderGeometry(RING_R + 3.4, RING_R + 4, RING_Y - 6, 40, 1, true), m.marble, PALACE[0], 6 + (RING_Y - 6) / 2, PALACE[1]);
    put(new THREE.CylinderGeometry(PALACE_R + 3.4, PALACE_R + 4, TOP_Y - RING_Y + 1, 32, 1, true), m.marble, PALACE[0], RING_Y + (TOP_Y - RING_Y) / 2, PALACE[1]);
    // The palace: hall, keep, spires.
    const [hx, hz] = pal(-13, 0);
    put(new THREE.BoxGeometry(30, 20, 46).rotateY(PYAW - Math.PI / 2), m.marble, hx, TOP_Y + 10, hz);
    const [kx, kz] = pal(-24, 0);
    put(new THREE.CylinderGeometry(10, 10.5, 48, 12), m.marble, kx, TOP_Y + 24, kz);
    put(new THREE.ConeGeometry(8.6, 24, 12), m.gold, kx, TOP_Y + 60, kz);
    for (const [u, v, h] of [[0, 24, 32], [0, -24, 32], [-26, 24, 32], [-26, -24, 32], [-40, 12, 40], [-40, -12, 40]]) {
      const [x, z] = pal(u, v);
      put(new THREE.CylinderGeometry(4.6, 4.8, h, 10), m.marble, x, TOP_Y + h / 2, z);
      put(new THREE.ConeGeometry(5.4, 11, 10), u < -30 ? m.gold : m.blue, x, TOP_Y + h + 5.5, z);
    }
    // The temple dome and the Collegium's tower.
    put(new THREE.SphereGeometry(8.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.gold, TEMPLE[0], heightAt(TEMPLE[0], TEMPLE[1]) + 21, TEMPLE[1] + 10);
    put(new THREE.CylinderGeometry(6.5, 7, 48, 10), m.marble, COLLEGIUM[0], RING_Y + 24, COLLEGIUM[1]);
    put(new THREE.ConeGeometry(7.6, 14, 10), m.blue, COLLEGIUM[0], RING_Y + 55, COLLEGIUM[1]);
    put(new THREE.CylinderGeometry(11, 11, 13, 16), m.marble, LIBRARY[0], RING_Y + 6.5, LIBRARY[1]);
    put(new THREE.SphereGeometry(11.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.gold, LIBRARY[0], RING_Y + 13, LIBRARY[1]);
  }

  // ---- walls and gates -----------------------------------------------------------------------

  private gateAngles = [EAST_GATE, SOUTH_GATE, WEST_GATE].map(([x, z]) => Math.atan2((z - CAP_CENTER[1]) / CAP_RZ, (x - CAP_CENTER[0]) / CAP_RX));

  private buildWalls(b: StaticBatch, half: 0 | 1) {
    const m = this.m;
    const N = 184, H = 12, T = 3.2;
    const pt = (a: number): P2 => [CAP_CENTER[0] + Math.cos(a) * CAP_RX, CAP_CENTER[1] + Math.sin(a) * CAP_RZ];
    for (let k = half * N / 2; k < (half + 1) * N / 2; k++) {
      const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2, am = (a0 + a1) / 2;
      // Gaps for the three gates.
      if (this.gateAngles.some((g) => Math.abs(Math.atan2(Math.sin(am - g), Math.cos(am - g))) < 0.042)) continue;
      const [ax, az] = pt(a0), [bx, bz] = pt(a1);
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const len = Math.hypot(bx - ax, bz - az) + 0.08;
      const yaw = Math.atan2(bx - ax, bz - az);
      const y = Math.min(heightAt(mx, mz), heightAt(mx + Math.cos(am) * 3, mz + Math.sin(am) * 3)) - 1.5;
      this.add(new THREE.BoxGeometry(T, H, len), m.marble, mx, y + H / 2, mz, yaw, b, 1.2);
      // A plinth of darker stone along the foot.
      this.add(new THREE.BoxGeometry(T + 0.8, 2.2, len), m.marbleDark, mx, y + 1.1, mz, yaw, b, 1.2);
      // Merlons on the outer edge, a string course below them.
      const ox = Math.cos(am) * (T / 2 - 0.35), oz = Math.sin(am) * (T / 2 - 0.35);
      for (let c = 0; c < 3; c++) {
        const t = (c + 0.5) / 3;
        this.add(new THREE.BoxGeometry(0.7, 1.2, 1.3), m.marble, ax + (bx - ax) * t + ox, y + H + 0.6, az + (bz - az) * t + oz, yaw, b, 1.2);
      }
      this.add(new THREE.BoxGeometry(T + 0.3, 0.4, len), m.marbleDark, mx, y + H - 1.6, mz, yaw, b, 1.2);
      this.solid(T, H + 1.2, len, mx, y + (H + 1.2) / 2, mz, yaw);
      // Towers along the circuit.
      if (k % 12 === 6) {
        const [tx, tz] = pt(am);
        if (this.gateAngles.every((g) => Math.abs(Math.atan2(Math.sin(am - g), Math.cos(am - g))) > 0.12)) this.tower(tx + Math.cos(am) * 1.5, tz + Math.sin(am) * 1.5, 5, 17, b, { base: y });
      }
    }
  }

  private buildGates(b: StaticBatch) {
    const m = this.m;
    const gates: [P2, string, string][] = [[EAST_GATE, 'THE ROYAL CAPITAL', 'Heart of the Kingdom · The Crown Road'], [SOUTH_GATE, 'THE QUEEN’S GATE', 'The Queen’s Road · The Caravan Way'], [WEST_GATE, 'THE RIVER GATE', 'The Kingsbridge · The Wildlands']];
    for (const [[gx, gz], name, sub] of gates) {
      const a = Math.atan2((gz - CAP_CENTER[1]) / CAP_RZ, (gx - CAP_CENTER[0]) / CAP_RX);
      const out: P2 = [Math.cos(a), Math.sin(a)];
      const tan: P2 = [-out[1], out[0]];
      const gy = heightAt(gx, gz) - 1;
      const yaw = Math.atan2(out[0], out[1]); // facing out of the city
      for (const s of [-1, 1]) {
        const tx = gx + tan[0] * s * 10, tz = gz + tan[1] * s * 10;
        const top = this.tower(tx, tz, 6.2, 22, b, { base: gy });
        this.banner(tx + out[0] * 6.3, top - 6, tz + out[1] * 6.3, yaw, 0x24467e, 0xe8c060, 'crown', 1.6, 4.4);
      }
      // The gatehouse block over the passage, and its arch.
      const F = this.frame(gx, gz, yaw, b);
      F.box(14, 7, 6, 0, gy + 13, 0, m.marble, false);
      F.box(14.6, 0.5, 6.6, 0, gy + 20, 0, m.marbleDark, false);
      for (let c = -3; c <= 3; c++) F.box(0.9, 1.2, 0.8, 3, gy + 20.5, c * 2, m.marble, false);
      // Arches on both faces, springing from the towers.
      for (const u of [3.2, -3.2]) F.geo(new THREE.TorusGeometry(3.9, 0.8, 8, 20, Math.PI), m.marble, u, gy + 9.2, 0);
      // The raised portcullis, its gold trim, and the name over the arch.
      F.box(9, 2.6, 0.25, 0.4, gy + 16.6, 0, m.iron, false);
      F.box(14.6, 0.35, 0.3, 3.15, gy + 19.2, 0, m.gold, false);
      const [sx, sz] = F.at(3.25, 0);
      this.sign(name, sub, sx, gy + 18.0, sz, yaw, 7.5);
      this.lamp(gx + out[0] * 9 + tan[0] * 6, gz + out[1] * 9 + tan[1] * 6, b);
      this.lamp(gx + out[0] * 9 - tan[0] * 6, gz + out[1] * 9 - tan[1] * 6, b);
      this.lamp(gx - out[0] * 9 + tan[0] * 6, gz - out[1] * 9 + tan[1] * 6, b);
      this.lamp(gx - out[0] * 9 - tan[0] * 6, gz - out[1] * 9 - tan[1] * 6, b);
    }
  }

  // ---- Crown Hill's terraces ---------------------------------------------------------------

  /** Is a point (dx, dz from the palace) on one of the ramps? (t along it, lateral off it) */
  private onRamp(dx: number, dz: number, upperOnly = false, margin = 8.4) {
    for (const r of RAMPS) {
      if (upperOnly && !r.upper) continue;
      const t = dx * r.dir[0] + dz * r.dir[1];
      if (t < 0) continue;
      if (Math.abs(dx * r.dir[1] - dz * r.dir[0]) < margin) return true;
    }
    return false;
  }

  private buildTerraces(b: StaticBatch) {
    const m = this.m;
    // Retaining walls round both banks with a balustrade along the top.
    const ringWall = (R: number, topY: number, upper: boolean) => {
      const N = Math.ceil((Math.PI * 2 * R) / 5);
      const segLen = (Math.PI * 2 * R) / N + 0.06;
      for (let k = 0; k < N; k++) {
        const a = ((k + 0.5) / N) * Math.PI * 2;
        const cx = Math.cos(a), cz = Math.sin(a);
        if (this.onRamp(cx * R, cz * R, upper, 7.6 + segLen / 2)) continue;
        const outer = R + 3.4, inner = R - 4.2, mid = (outer + inner) / 2;
        const x = PALACE[0] + cx * mid, z = PALACE[1] + cz * mid;
        const yLow = heightAt(PALACE[0] + cx * (outer + 1.2), PALACE[1] + cz * (outer + 1.2)) - 1.2;
        const yaw = Math.atan2(-cz, cx) + Math.PI / 2;
        const h = topY + 0.12 - yLow;
        this.add(new THREE.BoxGeometry(segLen, h, outer - inner), m.marble, x, yLow + h / 2, z, yaw, b, 1.2);
        this.add(new THREE.BoxGeometry(segLen, 0.5, 0.6), m.marbleDark, PALACE[0] + cx * (outer + 0.1), yLow + 1.0, PALACE[1] + cz * (outer + 0.1), yaw, b, 1.2);
        this.solid(segLen, h, outer - inner, x, yLow + h / 2, z, yaw);
        // The balustrade: a rail on little posts.
        const bx = PALACE[0] + cx * (outer - 0.4), bz = PALACE[1] + cz * (outer - 0.4);
        this.add(new THREE.BoxGeometry(segLen, 0.22, 0.5), m.marble, bx, topY + 1.05, bz, yaw, b, 1.2);
        this.add(new THREE.BoxGeometry(segLen, 0.2, 0.55), m.marbleDark, bx, topY + 0.2, bz, yaw, b, 1.2);
        for (let p = 0; p < 4; p++) {
          const ta = a + ((p - 1.5) / 4) * (segLen / R);
          this.add(new THREE.CylinderGeometry(0.13, 0.17, 0.75, 6), m.marble, PALACE[0] + Math.cos(ta) * (outer - 0.4), topY + 0.6, PALACE[1] + Math.sin(ta) * (outer - 0.4), 0, b);
        }
        this.solid(segLen, 1.1, 0.5, bx, topY + 0.6, bz, yaw);
      }
    };
    ringWall(RING_R, RING_Y, false);
    ringWall(PALACE_R, TOP_Y, true);
    // Ramp walls: where a ramp runs above or below the ground beside it, a wall
    // with a parapet keeps the two apart.
    for (const r of RAMPS) {
      const [ux, uz] = r.dir;
      const px = -uz, pz = ux;
      const yaw = Math.atan2(ux, uz);
      const spans: [number, number][] = [[RING_R - 8, RING_R + 44]];
      if (r.upper) spans.push([PALACE_R - 28, PALACE_R + 46]);
      for (const [t0, t1] of spans) for (let t = t0; t < t1; t += 3) {
        for (const s of [-1, 1]) {
          const lat = 7.6 * s;
          const x = PALACE[0] + ux * (t + 1.5) + px * lat, z = PALACE[1] + uz * (t + 1.5) + pz * lat;
          const rampY = capitalGround(PALACE[0] + ux * (t + 1.5), PALACE[1] + uz * (t + 1.5));
          const outY = capitalGround(PALACE[0] + ux * (t + 1.5) + px * 12 * s, PALACE[1] + uz * (t + 1.5) + pz * 12 * s);
          if (Math.abs(rampY - outY) < 0.4) continue;
          const y0 = Math.min(rampY, outY) - 0.8, y1 = Math.max(rampY, outY) + 1.0;
          this.add(new THREE.BoxGeometry(1.0, y1 - y0, 3.05), m.marble, x, (y0 + y1) / 2, z, yaw, b, 1.2);
          this.add(new THREE.BoxGeometry(1.2, 0.2, 3.05), m.marbleDark, x, y1 + 0.1, z, yaw, b, 1.2);
          this.solid(1.0, y1 - y0, 3.05, x, (y0 + y1) / 2, z, yaw);
        }
      }
    }
    // Flower urns along the Crown Ring's edge, lamps along its street.
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      const r = RING_STREET_R;
      const x = PALACE[0] + Math.cos(a) * (r + 7), z = PALACE[1] + Math.sin(a) * (r + 7);
      if (this.onRamp(x - PALACE[0], z - PALACE[1], false, 11)) continue;
      if (k % 2 === 0) this.lamp(x, z, b, RING_Y);
      else this.tree(x, z, b, 'cypress', RING_Y, 0.8);
    }
  }

  // ---- the palace -------------------------------------------------------------------------

  private buildPalace(b: StaticBatch) {
    const m = this.m;
    const F = this.frame(PALACE[0], PALACE[1], PYAW, b);
    const Y = TOP_Y - 0.4;
    // The main block, its hip roof and a gold ridge.
    F.box(48, 20.4, 26, -13, Y, 0, m.marble);
    F.box(49, 0.8, 27, -13, Y + 20.4, 0, m.marbleDark, false);
    F.geo(hip(48, 26, 8), m.blue, -13, Y + 21.2, 0, 0, 1);
    F.box(48.4, 1.6, 26.4, -13, Y, 0, m.marbleDark, false);
    // The portico: eight columns, an entablature and a pediment bearing the Sunwheel.
    this.colonnade(F, 4.5, -14, 14, 8, Y + 0.8, 13, 0.85);
    F.box(32, 1.8, 6, 3, Y + 13.8, 0, m.marble, false);
    F.box(32.4, 0.35, 6.4, 3, Y + 15.6, 0, m.gold, false);
    F.geo(pediment(32, 6, 6), m.marble, 3, Y + 15.95, 0, 0);
    F.box(30, 0.8, 9, 3, Y, 0, m.marbleDark, false); // the steps' landing
    for (let k = 0; k < 4; k++) F.box(30, 0.2, 1.2, 7.6 + k * 1.1, Y + 0.6 - k * 0.2, 0, m.marble, false);
    {
      const wheel = new THREE.Mesh(new THREE.CircleGeometry(2.1, 32), new THREE.MeshStandardMaterial({ map: sunwheelTexture('rgba(255, 214, 120, 1)', false), color: 0xe8c060, metalness: 0.6, roughness: 0.4, transparent: true }));
      const [x, z] = F.at(6.05, 0);
      wheel.position.set(x, Y + 18, z);
      wheel.rotation.y = PYAW;
      this.group.add(wheel);
    }
    // The great doors and their gold frame.
    F.box(4.4, 7.6, 0.3, 0.1, Y + 0.8, 0, this.world.timber, false);
    F.box(5.2, 0.5, 0.4, 0.15, Y + 8.4, 0, m.gold, false);
    for (const s of [-1, 1]) F.box(0.4, 7.6, 0.4, 0.15, Y + 0.8, s * 2.4, m.gold, false);
    const [dx, dz] = F.at(1.0, 0);
    this.door(dx, TOP_Y, dz, PYAW, 'throne', 'The Throne Hall', 'king', 22, 30, 77001);
    // Tall windows along the front, both storeys, lit at night.
    const glow = this.glowMat();
    for (const yy of [Y + 3.5, Y + 12]) for (let k = -10; k <= 10; k++) {
      if (Math.abs(k) < 2) continue;
      const [x, z] = F.at(0.06, k * 2.15);
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.1, yy > Y + 10 ? 3.6 : 4.4), glow);
      w.position.set(x, yy + 2, z);
      w.rotation.y = PYAW;
      this.put(w);
    }
    for (let k = -2; k <= 2; k++) {
      if (k === 0) continue;
      const [x, z] = F.at(0.2, k * 9.5);
      this.banner(x, Y + 13, z, PYAW, 0x24467e, 0xe8c060, 'crown', 1.8, 6.4);
    }
    // Corner towers, and the keep with its golden crown and spire.
    for (const [u, v] of [[0, 24], [0, -24], [-26, 24], [-26, -24]]) {
      const [x, z] = F.at(u, v);
      this.tower(x, z, 4.8, 32, b, { base: Y });
    }
    {
      const [x, z] = F.at(-24, 0);
      this.add(new THREE.CylinderGeometry(10, 10.6, 48, 24), m.marble, x, Y + 24, z, 0, b, 1.2);
      for (const yy of [Y + 18, Y + 34]) this.add(new THREE.CylinderGeometry(10.3, 10.3, 0.7, 24), m.marbleDark, x, yy, z, 0, b);
      this.add(new THREE.CylinderGeometry(10.8, 10.8, 1.4, 24), m.gold, x, Y + 48.7, z, 0, b);
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        this.add(new THREE.ConeGeometry(0.7, 2.6, 4), m.gold, x + Math.cos(a) * 10.4, Y + 50.6, z + Math.sin(a) * 10.4, 0, b);
      }
      this.add(new THREE.CylinderGeometry(6.4, 7.2, 8, 16), m.marble, x, Y + 53.4, z, 0, b);
      this.add(new THREE.ConeGeometry(7.6, 24, 16), m.gold, x, Y + 69.4, z, 0, b);
      this.add(new THREE.SphereGeometry(0.9, 12, 10), m.gold, x, Y + 82, z, 0, b);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + 0.2;
        const w = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3.2), glow);
        w.position.set(x + Math.cos(a) * 10.05, Y + 40, z + Math.sin(a) * 10.05);
        w.rotation.y = Math.PI / 2 - a;
        this.put(w);
      }
      physics.addCylinder(new THREE.Vector3(x, Y + 24, z), 24, 10);
      this.flag(x, z, 16, 0x24467e, 0xe8c060, 'crown', b, Y + 81);
    }
    // Needle spires off the roof and the rear towers.
    for (const [u, v, h, r] of [[-6, 16, 22, 1.7], [-6, -16, 22, 1.7], [-40, 12, 40, 3], [-40, -12, 40, 3], [-34, 0, 30, 2.4]] as [number, number, number, number][]) {
      const [x, z] = F.at(u, v);
      const base = u > -30 ? Y + 20 : Y;
      this.add(new THREE.CylinderGeometry(r, r * 1.1, h, 12), m.marble, x, base + h / 2, z, 0, b, 1.2);
      this.add(new THREE.ConeGeometry(r * 1.25, r * 5, 12), m.gold, x, base + h + r * 2.5, z, 0, b);
      if (u <= -30) physics.addCylinder(new THREE.Vector3(x, base + h / 2, z), h / 2, r);
    }
    // The wings enclose the forecourt; towers at their ends.
    for (const s of [-1, 1]) {
      F.box(11, 13, 30, -3, Y, s * 31, m.marble);
      F.geo(gable(11, 30, 4.4), m.blue, -3, Y + 13, s * 31, 0, 1);
      for (let k = 0; k < 6; k++) {
        const [x, z] = F.at(-14 + k * 5, s * 25.45);
        const w = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 3.2), glow);
        w.position.set(x, Y + 7, z);
        w.rotation.y = PYAW + (s > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.PI;
        this.put(w);
      }
      const [x, z] = F.at(14, s * 31);
      this.tower(x, z, 4.2, 20, b, { base: Y });
      // Forecourt statues of the old kings, and lamps.
      const [qx, qz] = F.at(24, s * 13);
      this.statue(qx, qz, PYAW, b, TOP_Y, 0.9);
      const [lx, lz] = F.at(12, s * 9);
      this.lamp(lx, lz, b, TOP_Y);
    }
    {
      const [fx, fz] = F.at(18, 0);
      this.fountain(fx, fz, 4.2, b, TOP_Y);
      this.fountains.push(new THREE.Vector3(fx, TOP_Y + 1.2, fz));
    }
    // The palace gate at the head of the ramp.
    {
      const gy = RING_Y - 1;
      for (const s of [-1, 1]) {
        const [x, z] = F.at(60, s * 11);
        const top = this.tower(x, z, 4.4, TOP_Y - gy + 11, b, { base: gy });
        const [bx, bz] = F.at(64.5, s * 11);
        this.banner(bx, top - 5, bz, PYAW, 0x24467e, 0xe8c060, 'crown', 1.4, 4);
      }
      F.box(18, 3, 4, 60, TOP_Y + 6.5, 0, m.marble, false);
      F.box(18.4, 0.4, 4.4, 60, TOP_Y + 9.5, 0, m.gold, false);
      const [sx, sz] = F.at(62.1, 0);
      this.sign('THE PALACE OF CRESHA', 'By grace of the Crown · All petitioners welcome', sx, TOP_Y + 8, sz, PYAW, 7);
    }
    // Gardens behind the palace: parterres, clipped cypresses, a long pool.
    for (let k = 0; k < 6; k++) {
      const [x, z] = F.at(-44, -15 + k * 6);
      this.hedge(x, z, 0.8, 4.2, PYAW, b, TOP_Y);
    }
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
      const [x, z] = F.at(-30 + k * 9, s * 42);
      this.tree(x, z, b, 'cypress', TOP_Y);
    }
    {
      const [x, z] = F.at(-50, 0);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(4, 14).rotateX(-Math.PI / 2), m.water);
      pool.position.set(x, TOP_Y + 0.15, z);
      pool.rotation.y = PYAW + Math.PI / 2;
      this.put(pool);
      F.box(16, 0.4, 5, -50, TOP_Y - 0.1, 0, m.marbleDark, false);
    }
  }

  /** A gilded statue on a plinth: a robed king with a sword. */
  private statue(x: number, z: number, yaw: number, b: StaticBatch, base?: number, s = 1, gilt = true) {
    const y = base ?? heightAt(x, z);
    const mat = gilt ? this.m.gold : this.m.marble;
    this.add(new THREE.BoxGeometry(2.4 * s, 2.6 * s, 2.4 * s), this.m.marble, x, y + 1.3 * s, z, yaw, b);
    this.add(new THREE.BoxGeometry(2.8 * s, 0.4 * s, 2.8 * s), this.m.marbleDark, x, y + 2.7 * s, z, yaw, b);
    this.add(new THREE.CylinderGeometry(0.55 * s, 1.0 * s, 2.8 * s, 10), mat, x, y + 4.3 * s, z, yaw, b);
    this.add(new THREE.CylinderGeometry(0.62 * s, 0.55 * s, 1.0 * s, 10), mat, x, y + 6.1 * s, z, yaw, b);
    this.add(new THREE.SphereGeometry(0.42 * s, 12, 10), mat, x, y + 7.0 * s, z, yaw, b);
    this.add(new THREE.CylinderGeometry(0.44 * s, 0.4 * s, 0.3 * s, 8, 1, true), this.m.gold, x, y + 7.45 * s, z, yaw, b);
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    // A sword held point-down before him.
    this.add(new THREE.BoxGeometry(0.12 * s, 2.4 * s, 0.05 * s), mat, x + sn * 0.9 * s, y + 4.6 * s, z + c * 0.9 * s, yaw, b);
    this.add(new THREE.BoxGeometry(0.8 * s, 0.1 * s, 0.1 * s), mat, x + sn * 0.9 * s, y + 5.7 * s, z + c * 0.9 * s, yaw, b);
    this.solid(2.4 * s, 7 * s, 2.4 * s, x, y + 3.5 * s, z, yaw);
  }

  // ---- the Plaza of Crowns ------------------------------------------------------------------

  private buildPlaza(b: StaticBatch) {
    const m = this.m;
    const [px, pz] = PLAZA;
    const y = this.fountain(px, pz, 8, b);
    // King Aldric the First on a tall plinth in the middle of the fountain.
    this.add(new THREE.CylinderGeometry(2.2, 2.6, 3.4, 16), m.marble, px, y + 1.7, pz, 0, b);
    this.statue(px, pz, PYAW + Math.PI, b, y + 3.4, 1.2);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      this.fountains.push(new THREE.Vector3(px + Math.cos(a) * 3.4, y + 1.2, pz + Math.sin(a) * 3.4));
    }
    // Four obelisks with gold caps, benches, flower beds and lamps round the square.
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const x = px + Math.cos(a) * 24, z = pz + Math.sin(a) * 24, oy = heightAt(x, z);
      this.add(new THREE.BoxGeometry(2, 0.8, 2), m.marbleDark, x, oy + 0.4, z, a, b);
      this.add(new THREE.CylinderGeometry(0.5, 0.9, 9, 4), m.marble, x, oy + 5.3, z, a + Math.PI / 4, b);
      this.add(new THREE.ConeGeometry(0.62, 1.4, 4), m.gold, x, oy + 10.5, z, a + Math.PI / 4, b);
      this.solid(2, 10, 2, x, oy + 5, z, a);
    }
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + 0.13;
      const x = px + Math.cos(a) * 15, z = pz + Math.sin(a) * 15;
      if (Math.abs(Math.atan2(Math.sin(a - 0.18), Math.cos(a - 0.18))) < 0.35 || Math.abs(Math.atan2(Math.sin(a - Math.PI - 0.18), Math.cos(a - Math.PI - 0.18))) < 0.35) continue;
      const yy = heightAt(x, z);
      if (k % 2) {
        this.add(new THREE.BoxGeometry(2.6, 0.12, 0.7), this.world.planks, x, yy + 0.5, z, -a, b);
        this.add(new THREE.BoxGeometry(2.2, 0.45, 0.5), m.marble, x, yy + 0.22, z, -a, b);
      } else {
        this.add(new THREE.CylinderGeometry(1.6, 1.7, 0.6, 12), m.marbleDark, x, yy + 0.3, z, 0, b);
        this.add(new THREE.SphereGeometry(1.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), this.colour([0xd84a5a, 0xe8c040, 0x8a6ad8, 0xf2f0ea][k % 4]), x, yy + 0.55, z, 0, b);
      }
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.1;
      this.lamp(px + Math.cos(a) * 29, pz + Math.sin(a) * 29, b);
    }
    // The herald's rostrum.
    this.add(new THREE.CylinderGeometry(1.4, 1.6, 1.2, 12), m.marble, px - 18, heightAt(px - 18, pz + 18) + 0.6, pz + 18, 0, b);
    this.sign('THE PLAZA OF CROWNS', 'King Aldric I · Founder of Cresha', px + 6, y + 2.4, pz + 7.7, 0, 4.2);
  }

  // ---- the Crown Market -------------------------------------------------------------------

  private buildMarket(b: StaticBatch) {
    const m = this.m;
    const [mx, mz] = MARKET;
    const cols = [0xb8402e, 0x24467e, 0x3d7a45, 0xc9922a, 0x7a3f8a, 0x2f7f86, 0xd8b060, 0xb8402e, 0x24467e, 0x3d7a45];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + 0.3;
      const sx = mx + Math.cos(a) * 17, sz = mz + Math.sin(a) * 17;
      const sy = heightAt(sx, sz);
      const yaw = -a - Math.PI / 2;
      const F = this.frame(sx, sz, -a + Math.PI / 2, b);
      for (const [u, v] of [[-0.9, -1.5], [-0.9, 1.5], [0.9, -1.5], [0.9, 1.5]]) F.geo(new THREE.BoxGeometry(0.12, 2.7, 0.12), this.world.timber, u, sy + 1.35, v);
      F.box(3.2, 0.9, 0.9, 0.5, sy, 0, this.world.planks);
      const aw = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.06, 2.4), this.colour(cols[k]));
      aw.position.set(sx, sy + 2.8, sz);
      aw.rotation.set(0.1, yaw, 0, 'YXZ');
      this.put(aw);
      for (let g = 0; g < 3; g++) {
        const [x, z] = F.at(0.5, -1 + g);
        this.add(new THREE.SphereGeometry(0.16, 8, 6), this.colour([0xd84a3a, 0xe8b040, 0x6aa040][g]), x, sy + 1.0, z, 0, b);
      }
    }
    // The covered Market Hall: an arcade of columns under a long blue roof.
    {
      const F = this.frame(mx + 34, mz + 6, -Math.PI / 2, b);
      const y = heightAt(mx + 34, mz + 6) - 0.2;
      this.colonnade(F, 5, -12, 12, 7, y + 0.4, 6, 0.5);
      this.colonnade(F, -5, -12, 12, 7, y + 0.4, 6, 0.5);
      F.box(26, 0.8, 11.6, 0, y + 6.4, 0, m.marble, false);
      F.geo(gable(11.6, 26, 3.4).rotateY(Math.PI / 2), m.blue, 0, y + 7.2, 0, 0, 1);
      F.box(26, 0.4, 12, 0, y, 0, m.marbleDark, false);
      for (let k = 0; k < 6; k++) F.box(1.4, 0.9, 1, (k % 2) * 3 - 1.5, y + 0.4, -10 + k * 4, this.world.planks);
      const [sx, sz] = F.at(5.8, 0);
      this.sign('THE CROWN MARKET', 'Merchants by royal charter', sx, y + 5.4, sz, -Math.PI / 2 + Math.PI, 4.6);
    }
    for (let k = 0; k < 14; k++) {
      const a = this.rnd() * Math.PI * 2, r = 22 + this.rnd() * 5;
      const x = mx + Math.cos(a) * r, z = mz + Math.sin(a) * r;
      this.add(this.rnd() < 0.5 ? new THREE.BoxGeometry(1, 0.9, 1) : new THREE.CylinderGeometry(0.42, 0.48, 1, 10), this.world.planks, x, heightAt(x, z) + 0.45, z, this.rnd() * 3, b);
    }
    for (let k = 0; k < 6; k++) this.lamp(mx + Math.cos(k * 1.05) * 27, mz + Math.sin(k * 1.05) * 27, b);
  }

  // ---- the Temple of the Dawn ---------------------------------------------------------------

  private buildTemple(b: StaticBatch) {
    const m = this.m;
    const [tx, tz] = TEMPLE;
    const y = heightAt(tx, tz) - 0.4;
    // Facing north, toward its square and the palace.
    const F = this.frame(tx, tz, Math.PI, b);
    F.box(18, 15, 40, -6, y, 0, m.marble);
    F.box(36, 13, 12, -10, y, 0, m.marble);
    F.geo(gable(18, 40, 6.5), m.blue, -6, y + 15, 0, 0, 1);
    F.geo(gable(12, 36, 5.5).rotateY(Math.PI / 2), m.blue, -10, y + 13, 0, 0, 1);
    F.box(18.6, 0.6, 40.6, -6, y + 14.7, 0, m.marbleDark, false);
    // The dome over the crossing: a drum of windows, gold, a lantern.
    F.geo(new THREE.CylinderGeometry(8, 8.2, 6, 24), m.marble, -10, y + 21, 0);
    F.geo(new THREE.SphereGeometry(8.4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m.gold, -10, y + 24, 0, 0, 1);
    F.geo(new THREE.CylinderGeometry(1.2, 1.4, 3, 10), m.marble, -10, y + 33.6, 0);
    F.geo(new THREE.ConeGeometry(1.5, 4.5, 10), m.gold, -10, y + 37.3, 0);
    const glow = this.glowMat();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const [cx, cz] = F.at(-10, 0);
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3), glow);
      w.position.set(cx + Math.cos(a) * 8.25, y + 21, cz + Math.sin(a) * 8.25);
      w.rotation.y = Math.PI / 2 - a;
      this.put(w);
    }
    // The portico and the Sunwheel rose.
    this.colonnade(F, 16.5, -7, 7, 6, y + 0.6, 11, 0.75);
    F.box(17, 1.4, 5, 15.5, y + 11.6, 0, m.marble, false);
    F.geo(pediment(17, 4.5, 5), m.marble, 15.5, y + 13, 0);
    F.box(17.4, 0.3, 5.4, 15.5, y + 12.95, 0, m.gold, false);
    F.box(16, 0.6, 7, 16, y, 0, m.marbleDark, false);
    {
      const rose = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32), new THREE.MeshStandardMaterial({ map: sunwheelTexture(), emissive: 0xffc060, emissiveMap: sunwheelTexture(), emissiveIntensity: 0.6, transparent: true, color: 0xfff0d0 }));
      this.lights.push({ mat: rose.material as THREE.MeshStandardMaterial, base: 0.6 });
      const [x, z] = F.at(14.05, 0);
      rose.position.set(x, y + 9.6, z);
      rose.rotation.y = Math.PI;
      this.group.add(rose);
    }
    F.box(3.4, 6, 0.3, 14.1, y + 0.6, 0, this.world.timber, false);
    F.box(4, 0.4, 0.4, 14.15, y + 6.6, 0, m.gold, false);
    const [dx, dz] = F.at(14.8, 0);
    this.door(dx, y + 0.6, dz, Math.PI, 'temple', 'The Temple of the Dawn', 'priestess', 16, 26, 77002);
    // The bell tower.
    F.box(7, 30, 7, 9, y, 13.5, m.marble);
    for (const [u, v] of [[-2.8, -2.8], [-2.8, 2.8], [2.8, -2.8], [2.8, 2.8]]) F.box(1.2, 6, 1.2, 9 + u, y + 30, 13.5 + v, m.marble, false);
    F.box(7.4, 0.8, 7.4, 9, y + 36, 13.5, m.marbleDark, false);
    F.geo(hip(7, 7, 7), m.blue, 9, y + 36.8, 13.5, 0, 1);
    F.geo(new THREE.ConeGeometry(0.3, 3, 6), m.gold, 9, y + 45.2, 13.5);
    F.geo(new THREE.CylinderGeometry(1.1, 1.5, 1.8, 12), m.gold, 9, y + 32, 13.5);
    // The square before it: braziers and a sundial.
    for (const s of [-1, 1]) {
      const x = tx + s * 9, z = tz - 22, yy = heightAt(x, z);
      this.add(new THREE.CylinderGeometry(0.5, 0.7, 1.4, 8), m.marble, x, yy + 0.7, z, 0, b);
      this.add(new THREE.CylinderGeometry(0.9, 0.5, 0.5, 10), m.gold, x, yy + 1.6, z, 0, b);
      const coal = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), this.coals ??= new THREE.MeshStandardMaterial({ color: 0x3a1a0a, emissive: 0xff7a20, emissiveIntensity: 1.5 }));
      coal.position.set(x, yy + 1.8, z);
      this.put(coal);
      this.solid(1.4, 2, 1.4, x, yy + 1, z);
    }
    {
      const x = tx, z = tz - 34, yy = heightAt(x, z);
      this.add(new THREE.CylinderGeometry(2.4, 2.6, 0.8, 24), m.marbleDark, x, yy + 0.4, z, 0, b);
      this.add(new THREE.BoxGeometry(0.15, 2.2, 1.6).translate(0, 0, 0).rotateX(-0.6), m.gold, x, yy + 1.6, z, 0, b);
      this.solid(5, 1.6, 5, x, yy + 0.8, z);
    }
    this.sign('THE TEMPLE OF THE DAWN', 'Light returns to those who keep watch', tx, y + 4.2, tz - 19.9, Math.PI, 5);
  }

  // ---- the Grand Hall of the Adventurer's Guild -------------------------------------------

  private buildGuild(b: StaticBatch) {
    const m = this.m;
    const [gx, gz] = GUILD;
    // Facing north onto the west street.
    this.house(gx, gz, Math.PI, { w: 24, d: 15, floors: 2, roof: 'slate', seed: 77101 }, b, { kind: 'guild', name: 'The Grand Hall of the Adventurer’s Guild', keeper: 'grandmaster' });
    const y = heightAt(gx, gz);
    this.tower(gx + 14.5, gz - 2, 4.6, 20, b, { roof: 'cone' });
    this.flag(gx + 14.5, gz - 2, 7, 0x8a2a24, 0xe8c060, 'sword', b, y + 26);
    // The S-rank hall: a marble annex with a gilded roof.
    {
      const F = this.frame(gx - 18, gz + 2, Math.PI, b);
      F.box(10, 9, 12, 0, y - 0.4, 0, m.marble);
      F.geo(hip(10, 12, 3.6), m.gold, 0, y + 8.6, 0, 0, 1);
      const [sx, sz] = F.at(6.1, 0);
      this.sign('THE S-RANK HALL', 'By invitation of the Grandmaster', sx, y + 6, sz, Math.PI, 3.6);
    }
    for (const s of [-1, 1]) this.banner(gx + s * 8, y + 5.2, gz - 7.9, Math.PI, 0x8a2a24, 0xe8c060, 'sword');
    this.sign('ADVENTURER’S GUILD', 'Grand Hall of Cresha · Ranks D to SSS', gx, y + 4.6, gz - 8.0, Math.PI, 6.4);
    // The yard behind: training dummies and a weapon rack.
    for (let k = 0; k < 4; k++) {
      const x = gx - 8 + k * 5, z = gz + 14, yy = heightAt(x, z);
      this.add(new THREE.CylinderGeometry(0.22, 0.26, 1.9, 8), this.world.planks, x, yy + 0.95, z, 0, b);
      this.add(new THREE.BoxGeometry(1.1, 0.16, 0.16), this.world.planks, x, yy + 1.5, z, 0, b);
      this.solid(0.6, 1.9, 0.6, x, yy + 0.95, z);
    }
    this.lamp(gx - 6, gz - 12, b);
    this.lamp(gx + 6, gz - 12, b);
  }

  // ---- the Silver Lance Commandery ----------------------------------------------------------

  private buildCommandery(b: StaticBatch) {
    const m = this.m;
    const [cx, cz] = COMMANDERY;
    const y0 = heightAt(cx, cz) - 0.5;
    const W = 58, D = 44;
    const wall = (ax: number, az: number, bx: number, bz: number, gap?: P2) => {
      const len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
      const n = Math.ceil(len / 6);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        if (gap && Math.hypot(x - gap[0], z - gap[1]) < 5) continue;
        const yy = heightAt(x, z) - 0.6;
        this.add(new THREE.BoxGeometry(1.6, 7, len / n + 0.05), m.marble, x, yy + 3.5, z, yaw, b, 1.2);
        for (let c = 0; c < 2; c++) this.add(new THREE.BoxGeometry(1.7, 0.8, 0.8), m.marble, ax + (bx - ax) * (t + (c - 0.5) / n / 2), yy + 7.4, az + (bz - az) * (t + (c - 0.5) / n / 2), yaw, b, 1.2);
        this.solid(1.6, 7, len / n, x, yy + 3.5, z, yaw);
      }
    };
    const x0 = cx - W / 2, x1 = cx + W / 2, z0 = cz - D / 2, z1 = cz + D / 2;
    const gate: P2 = [cx - 8, z1];
    wall(x0, z0, x1, z0);
    wall(x1, z0, x1, z1);
    wall(x1, z1, x0, z1, gate);
    wall(x0, z1, x0, z0);
    for (const [tx, tz] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) this.tower(tx, tz, 3.4, 12, b, { base: y0 });
    for (const s of [-1, 1]) this.banner(gate[0] + s * 3.6, y0 + 5, z1 + 0.9, 0, 0x24467e, 0xdfe6ee, 'lance');
    this.sign('THE SILVER LANCE', 'Commandery of the Knights of Cresha', gate[0], y0 + 8.4, z1 + 0.9, 0, 5.2);
    // The keep on the north side, with its tall tower.
    {
      const F = this.frame(cx + 4, z0 + 11, 0, b);
      F.box(22, 12, 14, 0, y0, 0, m.marble);
      F.geo(hip(22, 14, 5), m.blue, 0, y0 + 12, 0, 0, 1);
      F.box(3, 5, 0.3, 7.05, y0, 0, this.world.timber, false);
      const [dx, dz] = F.at(7.6, 0);
      this.door(dx, y0 + 0.5, dz, 0, 'guild', 'The Hall of the Silver Lance', 'marshal', 14, 12, 77201);
      const glow = this.glowMat();
      for (let k = -3; k <= 3; k++) {
        if (k === 0) continue;
        const [x, z] = F.at(7.06, k * 3);
        const w = new THREE.Mesh(new THREE.PlaneGeometry(1, 2.6), glow);
        w.position.set(x, y0 + 7, z);
        this.put(w);
      }
      const [tx, tz] = F.at(-2, 13);
      const top = this.tower(tx, tz, 4.4, 26, b, { base: y0 });
      this.flag(tx, tz, 8, 0x24467e, 0xdfe6ee, 'lance', b, top + 9);
    }
    // Barracks along the east wall, stables along the west.
    this.house(x1 - 7, cz + 4, -Math.PI / 2, { w: 22, d: 9, floors: 2, roof: 'slate', seed: 77202 }, b, { kind: 'home', name: 'the knights’ barracks' });
    {
      const F = this.frame(x0 + 5, cz + 2, Math.PI / 2, b);
      for (let k = -3; k <= 3; k++) F.geo(new THREE.BoxGeometry(0.25, 3, 0.25), this.world.timber, 2.5, y0 + 1.9, k * 3.2);
      F.box(5.6, 0.3, 22, 0, y0 + 3.2, 0, this.world.planks, false);
      F.box(0.5, 3.4, 22, -2.6, y0 + 0.4, 0, this.world.planks);
      for (let k = -3; k < 3; k++) F.box(3.6, 1.4, 0.2, 0.4, y0 + 0.4, k * 3.2 + 1.6, this.world.planks, false);
    }
    // The tourney ring: sand inside a rope on posts, a spectators' stand, banners.
    {
      const [lx, lz] = [cx - 2, cz + 8];
      const ly = heightAt(lx, lz);
      const sand = new THREE.Mesh(new THREE.CircleGeometry(9.6, 40).rotateX(-Math.PI / 2), this.colour(0xd8c49a));
      sand.position.set(lx, ly + 0.05, lz);
      sand.receiveShadow = true;
      this.put(sand);
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2;
        this.add(new THREE.CylinderGeometry(0.08, 0.1, 1.2, 6), this.world.timber, lx + Math.cos(a) * 9.8, heightAt(lx + Math.cos(a) * 9.8, lz + Math.sin(a) * 9.8) + 0.6, lz + Math.sin(a) * 9.8, 0, b);
      }
      this.add(new THREE.TorusGeometry(9.8, 0.05, 4, 56).rotateX(Math.PI / 2), this.colour(0xdfe6ee), lx, ly + 1.05, lz, 0, b);
      for (const s of [-1, 1]) this.banner(lx + s * 10.6, ly + 3, lz, Math.PI / 2, 0x24467e, 0xdfe6ee, 'lance', 1, 2.6);
      for (let r = 0; r < 3; r++) this.add(new THREE.BoxGeometry(1.2, 0.5 + r * 0.6, 12), this.world.planks, lx - 13.5 - r * 1.1, ly + 0.25 + r * 0.3, lz, 0, b);
      this.solid(3.6, 1.6, 12, lx - 14.6, ly + 0.8, lz);
      for (let k = 0; k < 3; k++) {
        const x = cx + 11 + k * 2.2, z = cz + 18, yy = heightAt(x, z);
        this.add(new THREE.CylinderGeometry(0.22, 0.26, 1.9, 8), this.world.planks, x, yy + 0.95, z, 0, b);
        this.add(new THREE.BoxGeometry(1.1, 0.16, 0.16), this.world.planks, x, yy + 1.5, z, 0, b);
        this.solid(0.6, 1.9, 0.6, x, yy + 0.95, z);
      }
    }
  }

  // ---- the envoys' quarter ------------------------------------------------------------------

  private buildEnvoys(b: StaticBatch) {
    const [ex, ez] = ENVOYS;
    this.fountain(ex, ez, 3.4, b);
    this.fountains.push(v3(ex, ez, 1.4));
    const houses: [number, string, string, number, number, Parameters<typeof bannerMat>[2]][] = [
      [-Math.PI / 2 - 0.5, 'The Elven Embassy', 'elfEnvoy', 0x2f6a3a, 0xdfe6ee, 'leaf'],
      [-0.4, 'The Dwarven Embassy', 'dwarfEnvoy', 0x5a3a24, 0xd8a040, 'anvil'],
      [Math.PI / 2 - 0.3, 'The Valorian Legation', 'valorianEnvoy', 0x8a3a24, 0xe8c060, 'eagle'],
      [Math.PI - 0.2, 'The Sunborn Embassy', 'sunEnvoy', 0xd89a30, 0xfff0c0, 'sun'],
    ];
    houses.forEach(([a, name, keeper, field, emblem, kind], i) => {
      const x = ex + Math.cos(a) * 19, z = ez + Math.sin(a) * 19;
      const rot = Math.atan2(ex - x, ez - z);
      this.house(x, z, rot, { w: 12, d: 10, floors: 2, roof: i % 2 ? 'tile' : 'slate', seed: 77300 + i }, b, { kind: 'hall', name, keeper });
      const fx = ex + Math.cos(a) * 11 + Math.cos(a + Math.PI / 2) * 5, fz = ez + Math.sin(a) * 11 + Math.sin(a + Math.PI / 2) * 5;
      this.flag(fx, fz, 8, field, emblem, kind, b);
    });
    this.sign('THE ENVOYS’ QUARTER', 'Embassies of the known world', ex + 12, heightAt(ex + 12, ez - 10) + 3, ez - 10, Math.PI / 4, 4.4);
  }

  // ---- the Crown Ring: noble houses, the Queen's Garden -------------------------------------

  private buildRing(b: StaticBatch) {
    const m = this.m;
    // Noble houses with walled gardens.
    const [nx, nz] = NOBLES;
    for (let k = 0; k < 3; k++) {
      const a = 2.3 + (k - 1) * 0.2;
      const x = PALACE[0] + Math.cos(a) * (76 + (k % 2) * 6), z = PALACE[1] + Math.sin(a) * (76 + (k % 2) * 6);
      const rot = Math.atan2(Math.cos(a), Math.sin(a));
      this.house(x, z, rot, { w: 14, d: 11, floors: 2, roof: 'slate', seed: 77400 + k }, b, { kind: 'home', name: 'a noble house' });
      for (const s of [-1, 1]) this.tree(x + Math.cos(a + Math.PI / 2) * s * 9, z + Math.sin(a + Math.PI / 2) * s * 9, b, 'round', RING_Y, 0.8);
    }
    this.fountain(nx + 10, nz - 2, 2.4, b, RING_Y);
    this.fountains.push(new THREE.Vector3(nx + 10, RING_Y + 1.2, nz - 2));
    // The Queen's Garden: hedge parterres round a gilded gazebo and a pool.
    const [gx, gz] = QUEENS_GARDEN;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      this.hedge(gx + Math.cos(a) * 10, gz + Math.sin(a) * 10, 6, 0.9, -a + Math.PI / 2, b, RING_Y);
      this.tree(gx + Math.cos(a + 0.4) * 15, gz + Math.sin(a + 0.4) * 15, b, k % 2 ? 'cypress' : 'round', RING_Y, 0.85);
    }
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      this.add(new THREE.CylinderGeometry(0.22, 0.26, 3.6, 8), m.marble, gx + Math.cos(a) * 3.4, RING_Y + 1.8, gz + Math.sin(a) * 3.4, 0, b);
    }
    this.add(new THREE.CylinderGeometry(4, 4, 0.4, 6), m.marble, gx, RING_Y + 3.8, gz, 0, b);
    this.add(new THREE.SphereGeometry(3.8, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.gold, gx, RING_Y + 4.0, gz, 0, b);
    this.add(new THREE.CylinderGeometry(4.2, 4.4, 0.3, 6), m.marbleDark, gx, RING_Y + 0.15, gz, 0, b);
    for (const s of [-1, 1]) {
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(3, 9).rotateX(-Math.PI / 2), m.water);
      pool.position.set(gx + s * 7.5, RING_Y + 0.12, gz);
      this.put(pool);
    }
    this.sign('THE QUEEN’S GARDEN', 'Open to all from dawn to dusk', gx, RING_Y + 2.6, gz + 18, 0, 3.6);
  }

  // ---- the Royal Library ----------------------------------------------------------------------

  private buildLibrary(b: StaticBatch) {
    const m = this.m;
    const [lx, lz] = LIBRARY;
    const out = Math.atan2(lx - PALACE[0], lz - PALACE[1]);
    const F = this.frame(lx, lz, out, b);
    const y = RING_Y - 0.3;
    F.geo(new THREE.CylinderGeometry(11, 11.4, 13, 32), m.marble, 0, y + 6.5, 0);
    F.geo(new THREE.CylinderGeometry(11.6, 11.6, 0.8, 32), m.marbleDark, 0, y + 13.2, 0);
    F.geo(new THREE.SphereGeometry(11.4, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), m.gold, 0, y + 13.4, 0, 0, 1);
    F.geo(new THREE.CylinderGeometry(1.6, 1.8, 3, 12), m.marble, 0, y + 26, 0);
    F.geo(new THREE.ConeGeometry(1.9, 3.6, 12), m.blue, 0, y + 29.3, 0);
    physics.addCylinder(new THREE.Vector3(lx, y + 6.5, lz), 6.5, 11.2);
    for (const s of [-1, 1]) {
      F.box(10, 10, 15, -2, y, s * 15.5, m.marble);
      F.geo(gable(10, 15, 3.6), m.blue, -2, y + 10, s * 15.5, 0, 1);
    }
    this.colonnade(F, 13.5, -5.4, 5.4, 4, y + 0.6, 9, 0.6);
    F.box(13, 1.2, 4.4, 13, y + 9.6, 0, m.marble, false);
    F.geo(pediment(13, 3.4, 4.4), m.marble, 13, y + 10.8, 0);
    F.box(12, 0.6, 6, 13.2, y, 0, m.marbleDark, false);
    F.box(3, 5, 0.3, 11.05, y + 0.6, 0, this.world.timber, false);
    const [dx, dz] = F.at(11.8, 0);
    this.door(dx, y + 0.6, dz, out, 'library', 'The Royal Library', 'librarian', 18, 22, 77501);
    const glow = this.glowMat();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2 + out), Math.cos(a - Math.PI / 2 + out))) < 0.4) continue;
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 4.2), glow);
      w.position.set(lx + Math.cos(a) * 11.25, y + 7, lz + Math.sin(a) * 11.25);
      w.rotation.y = Math.PI / 2 - a;
      this.put(w);
    }
    const [sx, sz] = F.at(15.4, 6.6);
    this.sign('THE ROYAL LIBRARY', 'Knowledge is the Crown’s oldest treasure', sx, RING_Y + 2.6, sz, out, 4.4);
  }

  // ---- the Arcane Collegium ------------------------------------------------------------------

  private buildCollegium(b: StaticBatch) {
    const m = this.m;
    const [cx, cz] = COLLEGIUM;
    const out = Math.atan2(cx - PALACE[0], cz - PALACE[1]);
    const F = this.frame(cx, cz, out, b);
    const y = RING_Y - 0.3;
    const violet = tinted(this.world.slate, 0.9, 0.75, 1.5);
    // The great tower and three smaller ones.
    F.geo(new THREE.CylinderGeometry(6.5, 7.2, 48, 24), m.marble, -2, y + 24, 0);
    for (const yy of [16, 32]) F.geo(new THREE.CylinderGeometry(6.9, 6.9, 0.6, 24), m.marbleDark, -2, y + yy, 0);
    F.geo(new THREE.CylinderGeometry(7.4, 7.4, 1.2, 24), m.gold, -2, y + 48.6, 0);
    F.geo(new THREE.ConeGeometry(7.6, 14, 24), violet, -2, y + 56.2, 0, 0, 1);
    {
      const [x, z] = F.at(-2, 0);
      physics.addCylinder(new THREE.Vector3(x, y + 24, z), 24, 7);
      const glow = this.glowMat();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const w = new THREE.Mesh(new THREE.PlaneGeometry(1, 2.8), glow);
        w.position.set(x + Math.cos(a) * 6.85, y + 26 + (k % 2) * 10, z + Math.sin(a) * 6.85);
        w.rotation.y = Math.PI / 2 - a;
        this.put(w);
      }
      // A crystal hangs in the air over the spire, and runestones circle it.
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(2.2, 0).scale(1, 1.7, 1), m.arcane);
      this.crystalY = y + 70;
      crystal.position.set(x, this.crystalY, z);
      this.group.add(crystal);
      this.crystal = crystal;
      for (let ring = 0; ring < 2; ring++) {
        const g = new THREE.Group();
        g.position.set(x, y + 50 + ring * 3, z);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          const r = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.3), m.arcane);
          r.position.set(Math.cos(a) * (10 + ring * 2), 0, Math.sin(a) * (10 + ring * 2));
          r.rotation.y = -a;
          g.add(r);
        }
        this.group.add(g);
        this.runes.push(g);
      }
    }
    for (const [u, v, h] of [[4, 9, 24], [4, -9, 24], [-10, 0, 30]] as [number, number, number][]) {
      const [x, z] = F.at(u, v);
      const top = this.tower(x, z, 3.2, h, b, { base: y });
      this.add(new THREE.ConeGeometry(3.8, 7, 18), violet, x, top + 3.5, z, 0, b, 1);
    }
    // The lecture hall before the tower.
    F.box(16, 9, 10, 8, y, 0, m.marble);
    F.geo(gable(10, 16, 3.6).rotateY(Math.PI / 2), violet, 8, y + 9, 0, 0, 1);
    F.box(3, 5, 0.3, 13.05, y + 0.1, 0, this.world.timber, false);
    const [dx, dz] = F.at(13.8, 0);
    this.door(dx, y + 0.3, dz, out, 'library', 'The Arcane Collegium', 'archmage', 16, 12, 77601);
    // A rune circle glowing on the paving before the door.
    {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d')!;
      g.strokeStyle = 'rgba(160,150,255,1)'; g.lineWidth = 6;
      g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(128, 128, 90, 0, Math.PI * 2); g.stroke();
      g.font = '28px serif'; g.fillStyle = 'rgba(180,170,255,1)'; g.textAlign = 'center';
      const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃ';
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        g.save(); g.translate(128 + Math.cos(a) * 104, 128 + Math.sin(a) * 104); g.rotate(a + Math.PI / 2); g.fillText(runes[k], 0, 10); g.restore();
      }
      const tex = new THREE.CanvasTexture(c);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0x9a8aff });
      const circle = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2), mat);
      const [x, z] = F.at(20, 0);
      circle.position.set(x, RING_Y + 0.08, z);
      this.group.add(circle);
    }
    const [sx, sz] = F.at(17, 7);
    this.sign('THE ARCANE COLLEGIUM', 'School of the Mage Paths · By royal charter', sx, RING_Y + 2.6, sz, out, 4.6);
  }

  // ---- the Royal Chancery ------------------------------------------------------------------

  private buildChancery(b: StaticBatch) {
    const m = this.m;
    const [cx, cz] = CHANCERY;
    const out = Math.atan2(cx - PALACE[0], cz - PALACE[1]);
    const F = this.frame(cx, cz, out, b);
    const y = RING_Y - 0.3;
    F.box(26, 11, 14, 0, y, 0, m.marble);
    F.geo(hip(26, 14, 4.4), m.blue, 0, y + 11, 0, 0, 1);
    this.colonnade(F, 8.6, -11, 11, 8, y + 0.6, 9, 0.55);
    F.box(24, 1, 3.4, 8.2, y + 9.6, 0, m.marble, false);
    F.box(24, 0.5, 4, 8.6, y, 0, m.marbleDark, false);
    // The clock tower.
    F.box(6, 26, 6, -2, y, 0, m.marble, false);
    F.geo(hip(6, 6, 5), m.blue, -2, y + 26, 0, 0, 1);
    F.geo(new THREE.ConeGeometry(0.25, 2.4, 6), m.gold, -2, y + 32, 0);
    {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d')!;
      g.fillStyle = '#f4ecd6'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#c9a55a'; g.lineWidth = 6; g.stroke();
      g.fillStyle = '#1f2c4a';
      for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; g.fillRect(64 + Math.cos(a) * 48 - 3, 64 + Math.sin(a) * 48 - 3, 6, 6); }
      g.lineWidth = 5; g.strokeStyle = '#1f2c4a';
      g.beginPath(); g.moveTo(64, 64); g.lineTo(64, 26); g.moveTo(64, 64); g.lineTo(92, 74); g.stroke();
      const face = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), emissive: 0xffe0a0, emissiveIntensity: 0.1 });
      (face.map as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
      this.lights.push({ mat: face, base: 0.1 });
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2;
        const [x, z] = F.at(-2 + Math.cos(a) * 3.05, Math.sin(a) * 3.05);
        const clock = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), face);
        clock.position.set(x, y + 22, z);
        clock.rotation.y = out + a;
        this.put(clock);
      }
    }
    F.box(3, 5, 0.3, 7.05, y + 0.5, 0, this.world.timber, false);
    const [dx, dz] = F.at(7.6, 0);
    this.door(dx, y + 0.5, dz, out, 'library', 'The Royal Chancery', 'chancellor', 16, 14, 77701);
    const [sx, sz] = F.at(10.6, 7);
    this.sign('THE ROYAL CHANCERY', 'Petitions · Records · Writs of the Crown', sx, RING_Y + 2.6, sz, out, 4.4);
  }

  // ---- the Crown Stables and the Gilded Stag ------------------------------------------------

  private buildStablesInn(b: StaticBatch) {
    const m = this.m;
    // The Gilded Stag: an inn on the avenue below the plaza.
    {
      // Facing south onto the Royal Avenue.
      const rot = Math.atan2(-AVENUE_DIR[1], AVENUE_DIR[0]);
      const fx = Math.sin(rot), fz = Math.cos(rot);
      this.house(-3236, -1082, rot, { w: 13, d: 10, floors: 2, roof: 'tile', seed: 77801 }, b, { kind: 'tavern', name: 'The Gilded Stag', keeper: 'stagKeeper' });
      const x = -3236 + fx * 5.3, z = -1082 + fz * 5.3, y = heightAt(-3236, -1082);
      this.sign('THE GILDED STAG', 'Rooms · Ale · Music nightly', x + Math.cos(rot) * 3.4, y + 4.4, z - Math.sin(rot) * 3.4, rot, 3.6);
      // A gilded stag's head over the door.
      this.add(new THREE.SphereGeometry(0.45, 10, 8).scale(0.8, 1, 1.3), m.gold, x, y + 4.2, z, rot);
      for (const s of [-1, 1]) this.add(new THREE.ConeGeometry(0.08, 1.2, 5).rotateZ(s * 0.5), m.gold, x + Math.cos(rot) * s * 0.4, y + 4.9, z - Math.sin(rot) * s * 0.4, rot);
    }
    // The Crown Stables: a long open stable, a paddock and the royal coach.
    const [sx, sz] = [-3214, -1010];
    const F = this.frame(sx, sz, -Math.PI / 2, b);
    const y = heightAt(sx, sz);
    for (let k = -3; k <= 3; k++) F.geo(new THREE.BoxGeometry(0.28, 3.2, 0.28), this.world.timber, 3, y + 1.6, k * 3.4);
    F.box(7, 0.35, 24, 0, y + 3.2, 0, this.world.planks, false);
    F.geo(gable(7, 24, 2), m.blue, 0, y + 3.5, 0, 0, 1);
    F.box(0.5, 3.4, 24, -3.3, y, 0, this.world.planks);
    for (let k = -3; k < 3; k++) F.box(3.6, 1.4, 0.2, 0.4, y, k * 3.4 + 1.7, this.world.planks, false);
    // The royal coach.
    {
      const [cx, cz] = F.at(8, 9);
      const cy = heightAt(cx, cz);
      this.add(new THREE.BoxGeometry(2.0, 1.6, 3.2), this.colour(0x24467e), cx, cy + 1.6, cz, 0.2, b);
      this.add(new THREE.BoxGeometry(2.1, 0.2, 3.3), m.gold, cx, cy + 2.45, cz, 0.2, b);
      for (const [ox, oz] of [[1, 1.1], [-1, 1.1], [1, -1.1], [-1, -1.1]]) {
        const w = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.08, 6, 16), m.gold);
        w.position.set(cx + ox * Math.cos(0.2) + oz * Math.sin(0.2), cy + 0.6, cz - ox * Math.sin(0.2) + oz * Math.cos(0.2));
        w.rotation.y = 0.2 + Math.PI / 2;
        this.put(w);
      }
      this.solid(2.2, 2.4, 3.4, cx, cy + 1.2, cz, 0.2);
    }
    for (let k = 0; k < 8; k++) {
      const [x, z] = F.at(14, -12 + k * 3);
      this.add(new THREE.BoxGeometry(0.15, 1.2, 0.15), this.world.timber, x, heightAt(x, z) + 0.6, z, 0, b);
    }
    const [tx, tz] = F.at(5, -12);
    this.sign('THE CROWN STABLES', 'Horses · Coaches to Elder Glen and the coast', tx, y + 2.6, tz, -Math.PI / 2, 4.4);
  }

  // ---- outside the West Gate: the Kingsbridge and the Crown Quay -----------------------------

  private buildRiver(b: StaticBatch) {
    const m = this.m;
    // The Kingsbridge: a long humped bridge of seven arches over the river.
    const x0 = -4106, x1 = -3926, z = KINGSBRIDGE[1];
    const yA = heightAt(x0 - 2, z), yB = heightAt(x1 + 2, z);
    const N = 30;
    const deck = (s: number) => yA + (yB - yA) * s + 2.6 * Math.sin(Math.PI * s);
    for (let k = 0; k < N; k++) {
      const s0 = k / N, s1 = (k + 1) / N;
      const xa = x0 + (x1 - x0) * s0, xb = x0 + (x1 - x0) * s1;
      const ya = deck(s0), yb = deck(s1);
      const len = Math.hypot(xb - xa, yb - ya);
      const pitch = Math.atan2(yb - ya, xb - xa);
      const g = new THREE.BoxGeometry(len + 0.1, 1.2, 9);
      g.rotateZ(pitch);
      this.add(g, m.marble, (xa + xb) / 2, (ya + yb) / 2 - 0.6, z, 0, b, 1.2);
      for (const s of [-1, 1]) {
        const p = new THREE.BoxGeometry(len + 0.1, 1.0, 0.6);
        p.rotateZ(pitch);
        this.add(p, m.marble, (xa + xb) / 2, (ya + yb) / 2 + 0.5, z + s * 4.2, 0, b, 1.2);
      }
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, pitch));
      physics.addBox(new THREE.Vector3((xa + xb) / 2, (ya + yb) / 2 - 0.6, z), new THREE.Vector3(len / 2 + 0.05, 0.6, 4.5), q);
      for (const s of [-1, 1]) physics.addBox(new THREE.Vector3((xa + xb) / 2, (ya + yb) / 2 + 0.6, z + s * 4.2), new THREE.Vector3(len / 2, 0.7, 0.3), q);
    }
    // The masonry below the deck: nine spans, each a block with a flattened arch
    // cut through it where the river runs (solid over the banks).
    const SP = 9, spanLen = (x1 - x0) / SP;
    for (let k = 0; k < SP; k++) {
      const s0 = k / SP, s1 = (k + 1) / SP, xm = x0 + (x1 - x0) * (s0 + s1) / 2;
      const top = Math.min(deck(s0), deck(s1)) - 1.15, bottom = -6;
      const half = spanLen / 2 + 0.05;
      const open = spanLen / 2 - 1.8, spring = -0.9, rise = top - spring - 0.6;
      const river = heightAt(xm, z) < -1.4;
      // The block's outline, with the arch traced into it where the river runs.
      const shape = new THREE.Shape();
      shape.moveTo(-half, bottom);
      if (river && rise > 1.2) {
        shape.lineTo(-open, bottom);
        shape.lineTo(-open, spring);
        shape.absellipse(0, spring, open, Math.min(rise, open * 0.6), Math.PI, 0, true);
        shape.lineTo(open, bottom);
      }
      shape.lineTo(half, bottom); shape.lineTo(half, top); shape.lineTo(-half, top); shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, { depth: 8.6, bevelEnabled: false, curveSegments: 14 });
      g.translate(0, 0, -4.3);
      this.add(g, m.marble, xm, 0, z, 0, b, 1.2);
      // The piers (where the spans meet) take the colliders; cutwaters split the current.
      if (k > 0) {
        const px = x0 + (x1 - x0) * s0;
        physics.addBox(new THREE.Vector3(px, (top + bottom) / 2, z), new THREE.Vector3(1.8, (top - bottom) / 2, 4.3));
        if (heightAt(px, z) < -1.4) for (const sd of [-1, 1]) this.add(new THREE.ConeGeometry(2.2, 3.4, 4).rotateY(Math.PI / 4).scale(1, 1, 1.3), m.marbleDark, px, -0.4, z + sd * 5.2, 0, b);
      }
    }
    for (const xx of [x0 + 4, x1 - 4]) for (const s of [-1, 1]) this.lamp(xx, z + s * 4.2, b, heightAt(xx, z) + 0.6);
    this.sign('THE KINGSBRIDGE', 'Raised by King Aldric II', x1 + 6, heightAt(x1 + 6, z + 6.5) + 2.6, z + 6.5, -Math.PI / 2, 3.6);
    // The Crown Quay: a timber jetty, moored boats, a boathouse.
    const [qx, qz] = QUAY;
    const qy = 1.1;
    for (let x = qx; x > qx - 22; x -= 3) {
      this.add(new THREE.BoxGeometry(3.05, 0.3, 4), this.world.planks, x - 1.5, qy, qz, 0, b, 1);
      for (const s of [-1, 1]) this.add(new THREE.CylinderGeometry(0.18, 0.2, 5, 6), this.world.timber, x - 1.5, -1.4, qz + s * 1.8, 0, b);
    }
    this.solid(22, 0.4, 4, qx - 11, qy - 0.1, qz);
    for (let k = 0; k < 3; k++) {
      const { group } = buildShip('fishing', [0x24467e, 0x8a3a2a, 0x3a7a4a][k], 0xe8dcc0);
      group.position.set(qx - 6 - k * 7, -1.4, qz + (k % 2 ? -4.6 : 4.6));
      group.rotation.y = Math.PI / 2 + (k - 1) * 0.08;
      this.group.add(group);
      this.boats.push({ g: group, phase: k * 1.7, y: -1.4 });
    }
    this.house(qx + 10, qz + 12, -Math.PI / 2 - 0.3, { w: 8, d: 7, floors: 1, roof: 'slate', seed: 77901 }, b, { kind: 'shop', name: 'the boathouse', keeper: 'ferrywoman' });
    this.sign('THE CROWN QUAY', 'Boats · Bait · River fishing', qx + 4, heightAt(qx + 4, qz - 4) + 2.6, qz - 4, -Math.PI / 2, 3.6);
  }

  // ---- lamps along the Royal Avenue ---------------------------------------------------------

  private buildStreetLights(b: StaticBatch) {
    // Along the Royal Avenue as it runs (a bend from the East Gate to the plaza,
    // then straight up the hill): lamps and crown banners in turn on both sides.
    const line = CAP_STREETS[0];
    let n = 0;
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, az] = line[i], [bx, bz] = line[i + 1];
      const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
      const px = -uz, pz = ux;
      for (let s = 7; s < len - 4; s += 14) {
        const cx = ax + ux * s, cz = az + uz * s;
        if (Math.hypot(cx - PLAZA[0], cz - PLAZA[1]) < 36 || Math.hypot(cx - EAST_GATE[0], cz - EAST_GATE[1]) < 16) continue;
        const r = Math.hypot(cx - PALACE[0], cz - PALACE[1]);
        if ((r > RING_R - 10 && r < RING_R + 46) || r < PALACE_R + 48) continue; // the ramps carry their own parapets
        n++;
        for (const side of [-1, 1]) {
          const x = cx + px * 8.6 * side, z = cz + pz * 8.6 * side;
          if (n % 2) this.lamp(x, z, b);
          else {
            this.add(new THREE.CylinderGeometry(0.1, 0.12, 6, 6), this.m.gold, x, heightAt(x, z) + 3, z, 0, b);
            this.banner(x - px * 0.7 * side, heightAt(x, z) + 4.4, z - pz * 0.7 * side, Math.atan2(ux, uz) + Math.PI / 2, 0x24467e, 0xe8c060, 'crown', 0.9, 2.4);
          }
        }
      }
    }
  }

  // ---- houses --------------------------------------------------------------------------------

  private houseSteps(b: StaticBatch) {
    // Lots along both sides of every street, then infill facing the nearest street.
    const reserved = (x: number, z: number, r: number) => CAP_RESERVED.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr + r)
      || CAP_SQUARES.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr + r);
    const segs: [number, number, number, number, number][] = [];
    CAP_STREETS.forEach((line, li) => {
      for (let i = 0; i < line.length - 1; i++) segs.push([line[i][0], line[i][1], line[i + 1][0], line[i + 1][1], li === 0 ? 6.5 : 4.6]);
    });
    const onStreet = (x: number, z: number, r: number) => {
      for (const [ax, az, bx, bz, half] of segs) {
        const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
        if (Math.hypot(x - ax - vx * t, z - az - vz * t) < r + half + 0.8) return true;
      }
      return false;
    };
    const nearestStreet = (x: number, z: number) => {
      let best = Infinity, bx = x, bz = z;
      for (const [ax, az, cx, cz] of segs) {
        const vx = cx - ax, vz = cz - az, l2 = vx * vx + vz * vz;
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
        const px = ax + vx * t, pz = az + vz * t, d = Math.hypot(x - px, z - pz);
        if (d < best) (best = d), (bx = px), (bz = pz);
      }
      return { d: best, x: bx, z: bz };
    };
    const okSite = (x: number, z: number, r: number) => {
      if (!insideWalls(x, z, r + 6)) return false;
      const dr = Math.hypot(x - PALACE[0], z - PALACE[1]);
      if (dr < PALACE_R + r + 6) return false; // the palace terrace is the palace's alone
      if (Math.abs(dr - RING_R) < r + 6) return false; // not astride the Crown Ring's bank
      if (this.onRamp(x - PALACE[0], z - PALACE[1], false, r + 9)) return false;
      return !reserved(x, z, r) && !onStreet(x, z, r);
    };
    const placed: [number, number, number][] = [];
    const sites: [number, number, number, HouseSpec][] = [];
    let seed = 78000;
    const rnd = mulberry32(3301);
    for (const line of CAP_STREETS) {
      for (let i = 0; i < line.length - 1; i++) {
        const [ax, az] = line[i], [bx, bz] = line[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const dx = (bx - ax) / len, dz = (bz - az) / len;
        for (let s = 5; s < len - 4; s += 10 + rnd() * 3) {
          for (const side of [-1, 1]) {
            const ring = Math.hypot((ax + bx) / 2 - PALACE[0], (az + bz) / 2 - PALACE[1]) < RING_R;
            const w = ring ? 11 + rnd() * 3 : 7 + rnd() * 3, d = ring ? 9 + rnd() * 2 : 6.5 + rnd() * 2.5;
            const off = 5.4 + d / 2 + 0.6;
            const x = ax + dx * s - dz * off * side, z = az + dz * s + dx * off * side;
            const r = Math.max(w, d) / 2 + 0.8;
            if (!okSite(x, z, r)) continue;
            if (placed.some(([px, pz, pr]) => Math.hypot(px - x, pz - z) < pr + r + 0.6)) continue;
            placed.push([x, z, r]);
            const rot = Math.atan2(dz * side, -dx * side);
            sites.push([x, z, rot, { w, d, floors: ring || rnd() < 0.75 ? 2 : 1, roof: rnd() < 0.7 ? 'slate' : 'tile', seed: seed++ }]);
          }
        }
      }
    }
    for (let x = CAP_CENTER[0] - CAP_RX + 12; x < CAP_CENTER[0] + CAP_RX - 12; x += 11.5) {
      for (let z = CAP_CENTER[1] - CAP_RZ + 12; z < CAP_CENTER[1] + CAP_RZ - 12; z += 11.5) {
        const px = x + (rnd() - 0.5) * 3, pz = z + (rnd() - 0.5) * 3;
        const w = 7 + rnd() * 2.5, d = 6.5 + rnd() * 2;
        const r = Math.max(w, d) / 2 + 0.6;
        if (!okSite(px, pz, r)) continue;
        if (placed.some(([qx, qz, qr]) => Math.hypot(qx - px, qz - pz) < qr + r + 0.8)) continue;
        const ns = nearestStreet(px, pz);
        if (ns.d > 34) continue;
        placed.push([px, pz, r]);
        sites.push([px, pz, Math.atan2(ns.x - px, ns.z - pz), { w, d, floors: rnd() < 0.25 ? 1 : 2, roof: rnd() < 0.7 ? 'slate' : 'tile', seed: seed++ }]);
      }
    }
    this.houseCount = sites.length;
    const steps: (() => void)[] = [];
    for (let i = 0; i < sites.length; i += 24) {
      const chunk = sites.slice(i, i + 24);
      steps.push(() => { for (const [x, z, rot, spec] of chunk) this.house(x, z, rot, spec, b); });
    }
    return steps;
  }
  houseCount = 0;
}
