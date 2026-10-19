import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt } from './terrainHeight';
import { roadPoint } from './roadData';
import { HERB_MODELS } from '../items/herbs';
import { REAGENT_MODELS, propLine } from '../items/reagents';
import { ITEMS } from '../items/itemDefs';
import { mulberry32 } from '../core/math';
import { events } from '../core/events';
import type { Interactable } from '../dungeon/instance';
import type { FX } from '../fx/particles';
import { FORAGE, RARE_SPOTS, habitatAt, pickFrom, settleSpot, isNightHour, nightFactor, type HerbId } from './herbs/flora';
import { gatherMods, setGatherModifiers, propsKnownByMods, bonusYield, type GatherModifiers } from './herbs/gatherMods';

// Foraging (World Expansion phase 4, grown into the herbalism content): every
// plant in the reagent table grows somewhere real. Plants are scattered
// deterministically per 256 m tile by habitat (herbs/flora.ts: meadow, verge,
// roadside, wood edge, forest, deep forest, elven glade, river, lake shore,
// marsh, coast, hills, mountain, snow, desert, volcanic), plus fixed roadside
// patches and a few hand-placed rare spots per region. Picked plants come
// back after some game hours; night flowers only show (and glow) after dark;
// rare plants only show where a hidden roll beats their rarity, so a better
// herbalist literally sees more of them. One instanced mesh per plant, drawn
// only within 160 m, keeps the whole flora to a few dozen cheap draw calls.
//
// Herbalism hook (for the brewing system): setGatherModifiers({ yieldBonus,
// rareChance, showProps, regrowMul }) — see herbs/gatherMods.ts.

export { FORAGE, setGatherModifiers };
export type { GatherModifiers, HerbId };

interface Node {
  id: string;
  herb: HerbId;
  pos: THREE.Vector3;
  yaw: number;
  scale: number;
  /** tile key it streamed in with (-1: fixed, never unloaded) */
  tile: number;
  /** hidden rarity roll: a rare plant is there only if this beats its odds */
  roll: number;
  /** a hand-placed rare spot: always there */
  spot?: boolean;
}

/** A plucked plant flying up to the gatherer's hands. */
interface Pluck {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  t: number;
  yaw: number;
  scale: number;
}

const T = 256;
const MAX_PER_HERB = 96;
const DRAW_R = 160;
/** longest regrowth (hours): picks older than this are forgotten even if their node is far away */
const MAX_REGROW = 130;
/** gathers of one plant before you can name its properties yourself */
const LEARN_AFTER = 5;
const THORN_GLOVES = 'thornGloves', SICKLE = 'herbSickle', ALMANAC = 'herbAlmanac';

/** Fixed patches along the King's Road (as they were before phase 4, plus new finds). */
const ROADSIDE: [HerbId, number, number][] = [
  ['sungrass', 132, 18], ['wildmint', 151, 30], ['moongrass', 178, 8], ['sungrass', 290, 70],
  ['ironleaf', 480, 104], ['wildmint', 640, 118], ['moongrass', 790, 96], ['sungrass', 960, 136],
  ['ironleaf', 1130, 108], ['wildmint', 1300, 132], ['moongrass', 1470, 110], ['sungrass', 1620, 140],
  ['ironleaf', 1790, 124], ['wildmint', 1950, 162], ['moongrass', 2120, 138], ['sungrass', 2300, 166],
  ['ironleaf', 2450, 136], ['wildmint', 2560, 164], ['brambleBerries', 560, 102], ['wildGarlic', 880, 138],
  ['brambleBerries', 1210, 104], ['silverthistle', 1560, 142], ['brambleBerries', 1880, 118], ['emberroot', 2250, 134],
  // The herbalist's roadside: yarrow, chamomile and marigold along the King's Road.
  ['yarrow', 420, 60], ['chamomile', 700, 122], ['marigold', 1010, 146], ['yarrow', 1500, 104],
  ['nettle', 1700, 112], ['chamomile', 2050, 168], ['yarrow', 2380, 134],
];
/** Patches along the Crown Road short of the checkpoint: [plant, metres along, metres to the left]. */
const CROWNSIDE: [HerbId, number, number][] = [
  ['yarrow', 60, 9], ['marigold', 140, -11], ['chamomile', 230, 12], ['yarrow', 320, -9],
  ['sungrass', 380, 13], ['nettle', 470, -14], ['marigold', 540, 10], ['yarrow', 610, -10],
];

const modelFor = (id: string) => (HERB_MODELS[id] ?? REAGENT_MODELS[id])();

/** Bake a painted model into one geometry: vertex colours, plus a per-vertex glow weight. */
function bakeModel(id: string, scale: number) {
  const model = modelFor(id);
  model.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  let tint = new THREE.Color(0, 0, 0), tintW = 0;
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const c = mat.color.clone().lerp(mat.emissive, Math.min(1, mat.emissiveIntensity * 0.4));
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // Only the parts that glow in the icon glow in the world.
    const w = mat.emissiveIntensity > 0.3 ? Math.min(1.5, mat.emissiveIntensity) : 0;
    g.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(n).fill(w), 1));
    if (w > 0) (tint.add(mat.emissive.clone().multiplyScalar(w * n)), (tintW += w * n));
    parts.push(g);
  });
  const geo = mergeGeometries(parts, false)!;
  geo.scale(scale, scale, scale);
  if (tintW > 0) tint = tint.multiplyScalar(1 / tintW);
  return { geo, tint, glows: tintW > 0 };
}

/** Plant material: painted vertex colours, with emissive light only where the model glows. */
function plantMaterial(glows: boolean) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  if (!glows) return mat;
  mat.emissive.set(0xffffff);
  mat.emissiveIntensity = 0;
  mat.userData.styleSoftness = 0;
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvGlow = aGlow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vGlow * vColor.rgb;');
  };
  return mat;
}

let audioCtx: AudioContext | null = null;
/** A soft rustle of leaves (synthesised, no sample file). */
function rustle(bright = false) {
  try {
    audioCtx ??= new AudioContext();
    const c = audioCtx;
    if (c.state === 'suspended') void c.resume();
    const t = c.currentTime + 0.01, dur = 0.32;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    // Crackly noise: bursts of grains, like stems snapping and leaves brushing.
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (Math.random() < 0.25 ? 1 : 0.3);
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(bright ? 5200 : 3200, t);
    bp.frequency.exponentialRampToValueAtTime(1400, t + dur);
    bp.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(c.destination);
    src.start(t);
    if (bright) {
      // A little chime for a rare find.
      for (const [f, at] of [[1568, 0.05], [2093, 0.13]] as const) {
        const o = c.createOscillator(), og = c.createGain();
        o.frequency.value = f;
        og.gain.setValueAtTime(0.0001, t + at);
        og.gain.exponentialRampToValueAtTime(0.06, t + at + 0.02);
        og.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.6);
        o.connect(og).connect(c.destination);
        o.start(t + at);
        o.stop(t + at + 0.65);
      }
    }
  } catch {
    // no audio (headless, blocked): gathering works silently
  }
}

export class Foraging {
  private nodes = new Map<string, Node>();
  private tiles = new Set<number>();
  /** node id -> game hour it was picked */
  private picked = new Map<string, number>();
  /** how many times each plant has been gathered (you learn its properties) */
  private seen = new Map<string, number>();
  private meshes = new Map<HerbId, THREE.InstancedMesh>();
  private geos = new Map<HerbId, THREE.BufferGeometry>();
  private glowCol = new Map<HerbId, THREE.Color>();
  private dirty = true;
  private near: Node | null = null;
  private shown = true;
  private plucks: Pluck[] = [];
  private glowing: Node[] = [];
  private moteT = 0;
  private tools = { gloves: false, sickle: false, almanac: false };
  private player = new THREE.Vector3();
  private scene: THREE.Scene;
  readonly interactable: Interactable & { update(p: THREE.Vector3, hours: number): void };
  onGather?: (herb: string, n: number) => void;
  /** particles for the gather burst and night motes (set by main) */
  fx?: FX;
  /** does the player carry an item? (herbalist's tools; set by main) */
  has?: (id: string) => boolean;
  /** stings and poisons from bare-handed gathering (set by main) */
  hurt?: (n: number) => void;
  /** messages: rare finds, stings (set by main) */
  toast?: (m: string) => void;

  constructor(scene: THREE.Scene, private give: (id: string, n: number) => void, private hours: () => number, private hour: () => number) {
    this.scene = scene;
    for (const herb of Object.keys(FORAGE) as HerbId[]) {
      const def = FORAGE[herb];
      const { geo, tint, glows } = bakeModel(def.item, def.scale ?? 1.7);
      const im = new THREE.InstancedMesh(geo, plantMaterial(glows), MAX_PER_HERB);
      im.count = 0;
      im.visible = false;
      im.castShadow = true;
      im.frustumCulled = false;
      scene.add(im);
      this.meshes.set(herb, im);
      this.geos.set(herb, geo);
      if (glows) this.glowCol.set(herb, tint);
    }
    ROADSIDE.forEach(([herb, x, z], i) => this.addNode({ id: 'road:' + i, herb, pos: new THREE.Vector3(x, heightAt(x, z), z), yaw: i * 1.3, scale: 1, tile: -1, roll: 0 }));
    CROWNSIDE.forEach(([herb, s, lat], i) => {
      const [x, z] = roadPoint('capital', s, lat);
      this.addNode({ id: 'crown:' + i, herb, pos: new THREE.Vector3(x, heightAt(x, z), z), yaw: i * 2.1, scale: 1, tile: -1, roll: 0 });
    });
    const self = this;
    const pos = new THREE.Vector3(0, -999, 0);
    this.interactable = {
      pos, radius: 1.7,
      label: () => (self.near ? self.labelFor(self.near.herb) : ''),
      enabled: () => !!self.near,
      action: () => self.gather(),
      update(p: THREE.Vector3) {
        self.near = null;
        let best = 2.2;
        for (const n of self.nodes.values()) {
          if (Math.abs(n.pos.x - p.x) > 3 || Math.abs(n.pos.z - p.z) > 3) continue;
          if (!self.available(n)) continue;
          const d = n.pos.distanceTo(p);
          if (d < best) (best = d), (self.near = n);
        }
        if (self.near) pos.copy(self.near.pos);
        else pos.set(0, -999, 0);
      },
    };
  }

  /** "Gather Foxglove — poison, heal" once you know the plant. */
  private labelFor(herb: HerbId) {
    const item = FORAGE[herb].item;
    const name = ITEMS[item]?.name ?? item;
    return this.knows(item) ? `Gather ${name} — ${propLine(item)}` : `Gather ${name}`;
  }

  /**
   * Are this reagent's properties known? The Almanac names them all. Once the
   * Herbalism system drives identification (showProps as a function) it alone
   * decides; until then you learn a plant by gathering it a few times.
   */
  knows(item: string) {
    if (this.tools.almanac) return true;
    if (typeof gatherMods.showProps === 'function') return propsKnownByMods(item);
    return gatherMods.showProps || (this.seen.get(item) ?? 0) >= LEARN_AFTER;
  }

  private addNode(n: Node) {
    this.nodes.set(n.id, n);
    this.dirty = true;
  }

  private regrowHours(herb: HerbId) {
    return FORAGE[herb].regrow * gatherMods.regrowMul * (this.tools.sickle ? 0.75 : 1);
  }

  /** Is a rare plant there at all? (Better herbalists find more of them.) */
  private present(n: Node) {
    const rare = FORAGE[n.herb].rare;
    if (rare === undefined || n.spot) return true;
    return n.roll < rare + gatherMods.rareChance + (this.tools.almanac ? 0.08 : 0);
  }

  private available(n: Node) {
    const t = this.picked.get(n.id);
    if (t !== undefined && this.hours() - t < this.regrowHours(n.herb)) return false;
    if (FORAGE[n.herb].night && !isNightHour(this.hour())) return false;
    return this.present(n);
  }

  private gather() {
    const n = this.near;
    if (!n) return;
    const def = FORAGE[n.herb];
    const rnd = Math.random;
    let k = def.n[0] + Math.floor(rnd() * (def.n[1] - def.n[0] + 1));
    if (this.tools.sickle && n.herb !== 'honeycomb' && rnd() < 0.4) k++;
    k += bonusYield(rnd);
    this.picked.set(n.id, this.hours());
    this.seen.set(def.item, (this.seen.get(def.item) ?? 0) + 1);
    this.give(def.item, k);
    events.emit('herbGathered', { id: def.item, qty: k, at: n.pos.clone(), source: 'forage' });
    this.onGather?.(n.herb, k);
    const name = ITEMS[def.item]?.name ?? def.item;
    // Thorns and poison sap bite bare hands.
    if (def.thorny && !this.tools.gloves && this.hurt) {
      this.hurt(def.thorny);
      this.toast?.(`+${k} ${name} — it stings your bare hands! (Thornproof Gloves would help.)`);
      this.fx?.add.spawn({ pos: n.pos.clone().setY(n.pos.y + 0.5), spread: 1.2, count: 6, life: [0.2, 0.4], size: [0.05, 0.01], color: 0xff6a4a, color2: 0x8a1a10, gravity: 4 });
    }
    // Sometimes a rarer plant grows in among the common one.
    let rare = false;
    if (def.find) {
      const [item, base] = def.find;
      const chance = base * (1 + gatherMods.rareChance * 4) + (this.tools.almanac ? 0.015 : 0);
      if (rnd() < chance) {
        rare = true;
        this.give(item, 1);
        events.emit('herbGathered', { id: item, qty: 1, at: n.pos.clone(), source: 'forage' });
        this.toast?.(`Growing in among the ${name}: ${ITEMS[item]?.name ?? item}!`);
      }
    }
    this.pluck(n, rare || !!def.rare);
    this.dirty = true;
  }

  /** The plant lifts out of the ground, spins and shrinks into your hands; leaves scatter. */
  private pluck(n: Node, sparkle: boolean) {
    const im = this.meshes.get(n.herb)!;
    const mesh = new THREE.Mesh(this.geos.get(n.herb)!, im.material);
    mesh.position.copy(n.pos);
    mesh.rotation.y = n.yaw;
    mesh.scale.setScalar(n.scale);
    this.scene.add(mesh);
    this.plucks.push({ mesh, from: n.pos.clone(), t: 0, yaw: n.yaw, scale: n.scale });
    rustle(sparkle);
    if (!this.fx) return;
    const at = n.pos.clone().setY(n.pos.y + 0.25);
    const geo = this.geos.get(n.herb)!;
    const col = geo.attributes.color as THREE.BufferAttribute;
    const leaf = new THREE.Color(col.getX(0), col.getY(0), col.getZ(0));
    const top = new THREE.Color(col.getX(col.count - 1), col.getY(col.count - 1), col.getZ(col.count - 1));
    this.fx.alpha.spawn({ pos: at, spread: 1.6, count: 10, life: [0.5, 0.9], size: [0.07, 0.03], color: leaf, color2: top, gravity: 3.5, drag: 2, upBias: 0.9, jitter: 0.3 });
    this.fx.alpha.spawn({ pos: n.pos.clone().setY(n.pos.y + 0.05), spread: 0.6, count: 4, life: [0.4, 0.8], size: [0.18, 0.4], color: 0x8a7a5a, alpha: 0.25, drag: 3, upBias: 0.5, jitter: 0.3 });
    const glow = this.glowCol.get(n.herb);
    if (sparkle || glow) this.fx.add.spawn({ pos: at, spread: 1.4, count: 18, life: [0.4, 1.0], size: [0.07, 0.01], color: 0xfff4c8, color2: glow ?? 0xffc860, drag: 2, upBias: 1.2, jitter: 0.4 });
  }

  private updatePlucks(dt: number) {
    for (let i = this.plucks.length - 1; i >= 0; i--) {
      const p = this.plucks[i];
      p.t += dt / 0.55;
      const t = Math.min(1, p.t);
      const lift = Math.sin(t * Math.PI * 0.6) * 0.9;
      const hand = this.player.clone().setY(this.player.y + 1.0);
      const e = t * t;
      p.mesh.position.lerpVectors(p.from, hand, e * 0.85);
      p.mesh.position.y += lift * (1 - e);
      p.mesh.rotation.y = p.yaw + t * 4;
      p.mesh.scale.setScalar(p.scale * (1 - e * 0.85));
      if (t >= 1) {
        this.scene.remove(p.mesh);
        this.plucks.splice(i, 1);
      }
    }
  }

  private stream(p: THREE.Vector3) {
    const ci = Math.floor(p.x / T), cj = Math.floor(p.z / T);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const i = ci + di, j = cj + dj;
      const key = (i + 2048) * 4096 + (j + 2048);
      if (this.tiles.has(key)) continue;
      this.tiles.add(key);
      this.fillTile(i, j, key);
    }
    for (const key of [...this.tiles]) {
      const i = Math.floor(key / 4096) - 2048, j = (key % 4096) - 2048;
      if (Math.abs(i - ci) <= 2 && Math.abs(j - cj) <= 2) continue;
      this.tiles.delete(key);
      for (const [id, n] of this.nodes) if (n.tile === key) this.nodes.delete(id);
      this.dirty = true;
    }
  }

  /** Scatter one tile's plants (deterministic: the same patches every visit). */
  private fillTile(i: number, j: number, key: number) {
    const rnd = mulberry32(((i * 73856093) ^ (j * 19349663)) >>> 0);
    const count = 10 + Math.floor(rnd() * 6);
    for (let k = 0; k < count; k++) {
      // Always draw the same numbers per patch so ids stay stable.
      const x = i * T + rnd() * T, z = j * T + rnd() * T, r = rnd(), roll = rnd();
      const hab = habitatAt(x, z);
      if (!hab) continue;
      const herb = pickFrom(hab, r);
      const def = FORAGE[herb];
      const [c0, c1] = def.cluster ?? [1, 3];
      const cl = c0 + Math.floor(rnd() * (c1 - c0 + 1));
      for (let c = 0; c < cl; c++) {
        const px = x + (rnd() - 0.5) * 6, pz = z + (rnd() - 0.5) * 6;
        this.addNode({ id: `${i},${j},${k},${c}`, herb, pos: new THREE.Vector3(px, heightAt(px, pz) + (def.lift ?? 0), pz), yaw: rnd() * 6.28, scale: 0.85 + rnd() * 0.3, tile: key, roll });
      }
    }
    // The hand-placed rare spots in this tile.
    RARE_SPOTS.forEach((s, si) => {
      if (Math.floor(s.x / T) !== i || Math.floor(s.z / T) !== j) return;
      const at = settleSpot(s.x, s.z);
      if (!at) return;
      const srnd = mulberry32(si * 7919 + 13);
      for (let c = 0; c < s.n; c++) {
        const a = c * 2.4 + srnd(), d = c === 0 ? 0 : 1.8 + srnd() * 3;
        const px = at[0] + Math.cos(a) * d, pz = at[1] + Math.sin(a) * d;
        this.addNode({ id: `spot:${si}:${c}`, herb: s.herb, pos: new THREE.Vector3(px, heightAt(px, pz) + (FORAGE[s.herb].lift ?? 0), pz), yaw: srnd() * 6.28, scale: 1 + srnd() * 0.15, tile: key, roll: 0, spot: true });
      }
    });
  }

  private tick = 0;
  update(dt: number, p: THREE.Vector3) {
    this.player.copy(p);
    this.tick += dt;
    if (this.tick > 1) {
      this.tick = 0;
      this.stream(p);
      if (this.has) this.tools = { gloves: this.has(THORN_GLOVES), sickle: this.has(SICKLE), almanac: this.has(ALMANAC) };
      // Night flowers shine; glowmoss brightens as the light goes.
      const nf = nightFactor(this.hour());
      for (const [herb, im] of this.meshes) {
        const def = FORAGE[herb];
        if (!def.glow) continue;
        const m = im.material as THREE.MeshStandardMaterial;
        m.emissiveIntensity = def.glow * (def.nightGlow || def.night ? 0.15 + nf * 0.85 : 0.6 + nf * 0.4);
      }
      this.dirty = true; // regrowth, night flowers and rare finds change with the clock
    }
    this.interactable.update(p, this.hours());
    this.updatePlucks(dt);
    this.motes(dt);
    if (!this.dirty) return;
    this.dirty = false;
    const counts = new Map<HerbId, number>();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    this.glowing.length = 0;
    for (const n of this.nodes.values()) {
      if (Math.abs(n.pos.x - p.x) > DRAW_R || Math.abs(n.pos.z - p.z) > DRAW_R) continue;
      if (!this.available(n)) continue;
      const im = this.meshes.get(n.herb)!;
      const c = counts.get(n.herb) ?? 0;
      if (c >= MAX_PER_HERB) continue;
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, n.yaw);
      im.setMatrixAt(c, m.compose(n.pos, q, s.setScalar(n.scale)));
      counts.set(n.herb, c + 1);
      if (this.glowCol.has(n.herb) && Math.abs(n.pos.x - p.x) < 40 && Math.abs(n.pos.z - p.z) < 40) this.glowing.push(n);
    }
    for (const [herb, im] of this.meshes) {
      im.count = counts.get(herb) ?? 0;
      im.visible = this.shown && im.count > 0;
      im.instanceMatrix.needsUpdate = true;
    }
  }

  /** Motes of light drifting up from glowing plants after dark. */
  private motes(dt: number) {
    if (!this.fx || !this.shown || !this.glowing.length) return;
    const nf = nightFactor(this.hour());
    if (nf < 0.3) return;
    this.moteT -= dt;
    if (this.moteT > 0) return;
    this.moteT = 0.12 + Math.random() * 0.2;
    const n = this.glowing[Math.floor(Math.random() * this.glowing.length)];
    if (!this.available(n)) return;
    const c = this.glowCol.get(n.herb)!;
    this.fx.add.spawn({ pos: n.pos.clone().setY(n.pos.y + 0.35), vel: new THREE.Vector3(0, 0.35, 0), spread: 0.25, count: 1, life: [1.6, 2.8], size: [0.05, 0.01], color: c, color2: 0xffffff, drag: 0.6, jitter: 0.5, alpha: 0.9 });
  }

  setVisible(v: boolean) {
    this.shown = v;
    for (const im of this.meshes.values()) im.visible = v && im.count > 0;
    for (const p of this.plucks) p.mesh.visible = v;
  }

  get nodeCount() {
    return this.nodes.size;
  }

  /** Plants within r metres that are there now (for map pins, the almanac, debugging). */
  plantsNear(p: THREE.Vector3, r: number) {
    const out: { herb: HerbId; pos: THREE.Vector3 }[] = [];
    for (const n of this.nodes.values()) if (n.pos.distanceTo(p) < r && this.available(n)) out.push({ herb: n.herb, pos: n.pos });
    return out;
  }

  /** Times each reagent has been gathered by hand. */
  gatheredCount(item: string) {
    return this.seen.get(item) ?? 0;
  }

  toJSON() {
    // Picks that have not regrown yet (by their own plant when it is loaded,
    // else the longest regrowth), plus '#item' gather counts.
    const out: Record<string, number> = {};
    for (const [id, t] of this.picked) {
      const n = this.nodes.get(id);
      const limit = n ? this.regrowHours(n.herb) : MAX_REGROW;
      if (this.hours() - t < limit) out[id] = t;
    }
    for (const [item, k] of this.seen) out['#' + item] = k;
    return out;
  }

  fromJSON(d?: Record<string, number>) {
    for (const [id, t] of Object.entries(d ?? {})) {
      if (id.startsWith('#')) this.seen.set(id.slice(1), t);
      else this.picked.set(id, t);
    }
    this.dirty = true;
  }
}
