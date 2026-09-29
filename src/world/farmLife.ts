import * as THREE from 'three';
import { heightAt } from './terrainHeight';
import { physics } from '../physics/physics';
import { CROPS } from '../items/produce';
import { ITEMS } from '../items/itemDefs';
import type { Interactable } from '../dungeon/instance';
import type { Fauna, Animal } from './fauna';
import type { WorldTime } from './worldTime';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';
import type { WorldMats } from './buildings';
import { GRASS_MASKS } from './groundWindow';

// Farm life in Elder Glen (World Expansion phase 3): the player's own plot
// (till, plant, water, grow on the world clock, harvest), helping bring in
// the wheat, picking orchard fruit, milking cows, shearing sheep and
// collecting eggs. Everything runs on game hours so it keeps pace with the
// day/night cycle and survives a reload.

export const PLOT_CENTER = new THREE.Vector3(20, 0, 121);
export const COOP = new THREE.Vector3(55, 0, 92);
const BED_W = 2.6, BED_D = 1.8;

type BedState = { stage: 'wild' | 'tilled' | 'planted'; crop?: string; planted?: number; watered?: boolean };
export interface FarmSave {
  beds: BedState[];
  coopDay?: number;
  orchard?: Record<string, number>;
}

interface Bed {
  state: BedState;
  pos: THREE.Vector3;
  soil: THREE.Mesh;
  plants: THREE.Group;
  shown: string;
}

const SEED_ORDER = ['wheatSeed', 'carrotSeed', 'cabbageSeed', 'pumpkinSeed'];
const cropOfSeed = (seed: string) => Object.keys(CROPS).find((k) => CROPS[k].seed === seed)!;

export class FarmLife {
  readonly interactables: Interactable[] = [];
  private beds: Bed[] = [];
  private coopDay = -1;
  private orchardDay = new Map<string, number>();
  private fieldCooldown = new Map<string, number>();
  private soilMats = {
    wild: new THREE.MeshStandardMaterial({ color: 0x6f7a3a, roughness: 1 }),
    tilled: new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 1 }),
    wet: new THREE.MeshStandardMaterial({ color: 0x3f2c1e, roughness: 0.55 }),
  };
  /** fired for quests and class XP: 'till' | 'plant' | 'water' | 'harvest-plot' | 'harvest-field' | 'pick' | 'milk' | 'shear' | 'eggs' */
  onAction?: (kind: string, item?: string, n?: number) => void;

  constructor(
    private scene: THREE.Scene,
    private player: Player,
    private time: WorldTime,
    private fauna: Fauna,
    private fx: FX,
    private toast: (msg: string) => void,
    mats: WorldMats,
    orchards: { trees: THREE.Vector3[]; fruit: 'apple' | 'pear' }[],
    wheatFields: [number, number, number, number][],
  ) {
    this.buildPlot(mats);
    this.buildCoop(mats);
    // Harvest help along the wheat fields (the south edge of each).
    wheatFields.forEach(([x, z, w, d], f) => {
      for (let k = 0; k < 3; k++) {
        const px = x - w / 2 + (w * (k + 0.5)) / 3, pz = z - d / 2 - 0.5;
        const key = f + ':' + k;
        const pos = new THREE.Vector3(px, heightAt(px, pz), pz);
        this.interactables.push({
          pos, radius: 2.4,
          label: () => (this.fieldCooldown.get(key) ?? 0) > 0 ? 'This row is cut' : 'Help with the harvest',
          enabled: () => (this.fieldCooldown.get(key) ?? 0) <= 0,
          action: () => {
            this.fieldCooldown.set(key, 25);
            this.give('wheat', 2);
            this.fx.dust(pos, 1.2);
            this.onAction?.('harvest-field', 'wheat', 2);
          },
        });
      }
    });
    // Orchard trees: pick fruit once per tree per day.
    orchards.forEach((o, oi) => o.trees.forEach((t, ti) => {
      const key = oi + ':' + ti;
      this.interactables.push({
        pos: t, radius: 2.3,
        label: () => this.orchardDay.get(key) === this.time.day ? 'Picked clean today' : `Pick ${o.fruit === 'apple' ? 'apples' : 'pears'}`,
        enabled: () => this.orchardDay.get(key) !== this.time.day,
        action: () => {
          this.orchardDay.set(key, this.time.day);
          const n = 2 + ((ti * 7 + this.time.day) % 2);
          this.give(o.fruit, n);
          this.onAction?.('pick', o.fruit, n);
        },
      });
    }));
  }

  // ---- the player's plot ------------------------------------------------------------
  private buildPlot(m: WorldMats) {
    const c = PLOT_CENTER;
    c.y = heightAt(c.x, c.z);
    GRASS_MASKS.push({ x: c.x, z: c.z, hx: 5.9, hz: 3.3, amount: 0.85 });
    for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) {
      const x = c.x + (k - 1) * (BED_W + 0.9), z = c.z + (r - 0.5) * (BED_D + 1.2);
      const y = heightAt(x, z);
      const soil = new THREE.Mesh(new THREE.BoxGeometry(BED_W, 0.22, BED_D), this.soilMats.wild);
      soil.position.set(x, y + 0.04, z);
      soil.receiveShadow = true;
      this.scene.add(soil);
      // Edging boards.
      for (const [bx, bz, bw, bd] of [[0, BED_D / 2, BED_W + 0.12, 0.08], [0, -BED_D / 2, BED_W + 0.12, 0.08], [BED_W / 2, 0, 0.08, BED_D], [-BED_W / 2, 0, 0.08, BED_D]]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.2, bd), m.planks);
        b.position.set(x + bx, y + 0.1, z + bz);
        b.castShadow = true;
        this.scene.add(b);
      }
      const plants = new THREE.Group();
      plants.position.set(x, y + 0.15, z);
      this.scene.add(plants);
      const bed: Bed = { state: { stage: 'wild' }, pos: new THREE.Vector3(x, y, z), soil, plants, shown: '' };
      this.beds.push(bed);
      this.interactables.push({
        pos: bed.pos, radius: 1.9,
        label: () => this.bedLabel(bed),
        enabled: () => this.bedEnabled(bed),
        action: () => this.bedAction(bed),
      });
    }
    // A low fence, a water barrel and a sign.
    const fence = new THREE.Group();
    const hx = 6.4, hz = 3.8;
    for (const [ax, az, bx, bz] of [[-hx, -hz, hx, -hz], [hx, -hz, hx, hz], [-hx, hz, -1.2, hz], [1.2, hz, hx, hz], [-hx, -hz, -hx, hz]]) {
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / 1.6));
      for (let i = 0; i <= n; i++) {
        const px = c.x + ax + ((bx - ax) * i) / n, pz = c.z + az + ((bz - az) * i) / n;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), m.timber);
        post.position.set(px, heightAt(px, pz) + 0.35, pz);
        fence.add(post);
      }
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, len), m.timber);
      const mx = c.x + (ax + bx) / 2, mz = c.z + (az + bz) / 2;
      rail.position.set(mx, heightAt(mx, mz) + 0.6, mz);
      rail.rotation.y = Math.atan2(bx - ax, bz - az);
      fence.add(rail);
    }
    fence.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
    this.scene.add(fence);
    const bx = c.x + hx - 0.8, bz = c.z - hz + 0.8, by = heightAt(bx, bz);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 0.95, 12), m.planks);
    barrel.position.set(bx, by + 0.47, bz);
    barrel.castShadow = true;
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.38, 12).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2f5f7a, roughness: 0.1 }));
    water.position.set(bx, by + 0.9, bz);
    this.scene.add(barrel, water);
    physics.addCylinder(new THREE.Vector3(bx, by + 0.47, bz), 0.47, 0.42);
    const sc = document.createElement('canvas');
    sc.width = 256; sc.height = 64;
    const g = sc.getContext('2d')!;
    g.fillStyle = '#f5e8c9'; g.fillRect(0, 0, 256, 64);
    g.strokeStyle = '#8b6336'; g.lineWidth = 6; g.strokeRect(3, 3, 250, 58);
    g.fillStyle = '#4f6b2a'; g.font = '700 26px Cinzel, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('YOUR PLOT', 128, 33);
    const tex = new THREE.CanvasTexture(sc);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide }));
    const sx = c.x - 2.4, sz = c.z + hz + 0.3;
    sign.position.set(sx, heightAt(sx, sz) + 1.1, sz);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), m.timber);
    post.position.set(sx, heightAt(sx, sz) + 0.55, sz - 0.05);
    this.scene.add(sign, post);
  }

  private now() {
    return this.time.day * 24 + this.time.hour;
  }

  private growth(b: Bed) {
    const s = b.state;
    if (s.stage !== 'planted' || !s.crop || s.planted === undefined) return 0;
    const def = CROPS[s.crop];
    // Watered beds grow at full speed, dry beds at half.
    return Math.min(1, ((this.now() - s.planted) / def.hours) * (s.watered ? 1 : 0.5));
  }

  private seedInHand() {
    return SEED_ORDER.find((id) => this.count(id) > 0) ?? null;
  }

  private bedLabel(b: Bed) {
    const s = b.state;
    if (s.stage === 'wild') return 'Till the soil';
    if (s.stage === 'tilled') {
      const seed = this.seedInHand();
      return seed ? `Plant ${ITEMS[seed].name}` : 'Need seeds (Tessa sells them)';
    }
    const g = this.growth(b);
    const name = ITEMS[CROPS[s.crop!].crop].name;
    if (g >= 1) return `Harvest ${name}`;
    if (!s.watered) return `Water the ${name.toLowerCase()} (${Math.round(g * 100)}%)`;
    return `${name} growing — ${Math.round(g * 100)}%`;
  }

  private bedEnabled(b: Bed) {
    const s = b.state;
    if (s.stage === 'tilled') return !!this.seedInHand();
    if (s.stage === 'planted') return !s.watered || this.growth(b) >= 1;
    return true;
  }

  private bedAction(b: Bed) {
    const s = b.state;
    if (s.stage === 'wild') {
      s.stage = 'tilled';
      this.fx.dust(b.pos, 1.4);
      this.onAction?.('till');
    } else if (s.stage === 'tilled') {
      const seed = this.seedInHand();
      if (!seed) return;
      this.take(seed, 1);
      b.state = { stage: 'planted', crop: cropOfSeed(seed), planted: this.now(), watered: false };
      this.onAction?.('plant', seed, 1);
    } else if (this.growth(b) >= 1) {
      const def = CROPS[s.crop!];
      const n = def.yield[0] + Math.floor(Math.random() * (def.yield[1] - def.yield[0] + 1));
      this.give(def.crop, n);
      // A seed or two back most of the time, so the plot keeps itself going.
      if (Math.random() < 0.75) this.give(def.seed, 1 + (Math.random() < 0.3 ? 1 : 0));
      b.state = { stage: 'tilled' };
      this.fx.dust(b.pos, 1);
      this.onAction?.('harvest-plot', def.crop, n);
    } else if (!s.watered) {
      s.watered = true;
      // Keep the growth fraction continuous when the rate doubles.
      const def = CROPS[s.crop!];
      const g = Math.min(1, ((this.now() - s.planted!) / def.hours) * 0.5);
      s.planted = this.now() - g * def.hours;
      this.fx.add.spawn({ pos: b.pos.clone().setY(b.pos.y + 1.2), spread: 1.2, count: 24, life: [0.3, 0.6], size: [0.05, 0.01], color: 0x9fd0f0, color2: 0x5a9ad0, gravity: 9, upBias: -0.5 });
      this.onAction?.('water');
    }
    this.refresh(b, true);
  }

  /** Rebuild a bed's look when its state or growth band changes. */
  private refresh(b: Bed, force = false) {
    const s = b.state;
    const g = this.growth(b);
    const band = s.stage + ':' + (s.crop ?? '') + ':' + (s.watered ? 'w' : '') + ':' + Math.floor(g * 4);
    if (!force && band === b.shown) return;
    b.shown = band;
    b.soil.material = s.stage === 'wild' ? this.soilMats.wild : s.watered ? this.soilMats.wet : this.soilMats.tilled;
    b.plants.clear();
    if (s.stage !== 'planted' || !s.crop) return;
    const def = CROPS[s.crop];
    const scale = 0.25 + g * 0.75;
    const green = new THREE.MeshStandardMaterial({ color: g >= 1 && s.crop === 'wheat' ? 0xd9b660 : 0x5f9a3a, roughness: 0.9 });
    const fruit = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.6 });
    for (let i = 0; i < 6; i++) {
      const x = ((i % 3) - 1) * 0.8, z = (Math.floor(i / 3) - 0.5) * 0.8;
      const p = new THREE.Group();
      p.position.set(x, 0, z);
      if (s.crop === 'wheat') {
        for (let k = 0; k < 5; k++) {
          const st = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.9, 3), green);
          st.position.set(Math.cos(k) * 0.1, 0.45, Math.sin(k) * 0.1);
          st.rotation.z = Math.cos(k * 2) * 0.1;
          p.add(st);
        }
      } else {
        const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), green);
        leaves.scale.set(1, 0.6, 1);
        leaves.position.y = 0.15;
        p.add(leaves);
        if (g >= 0.5) {
          const f = new THREE.Mesh(s.crop === 'pumpkin' ? new THREE.SphereGeometry(0.2, 10, 8) : new THREE.IcosahedronGeometry(0.12, 1), fruit);
          f.position.set(0.12, s.crop === 'carrot' ? 0.05 : 0.14, 0.05);
          f.scale.setScalar(g);
          p.add(f);
        }
      }
      p.scale.setScalar(scale);
      p.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
      b.plants.add(p);
    }
  }

  // ---- the chicken coop ------------------------------------------------------------
  private buildCoop(m: WorldMats) {
    const x = COOP.x, z = COOP.z, y = heightAt(x, z);
    COOP.y = y;
    GRASS_MASKS.push({ x, z: z + 1, r: 4, amount: 0.6 });
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 1.8), m.planks);
    body.position.y = 1.0;
    g.add(body);
    for (const [lx, lz] of [[-1.2, -0.8], [1.2, -0.8], [-1.2, 0.8], [1.2, 0.8]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), m.timber);
      leg.position.set(lx, 0.17, lz);
      g.add(leg);
    }
    for (const sd of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 1.2), m.thatch);
      r.position.set(0, 1.95, sd * 0.5);
      r.rotation.x = sd * 0.6;
      g.add(r);
    }
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 1.4), m.timber);
    ramp.position.set(0.6, 0.4, 1.4);
    ramp.rotation.x = 0.5;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.05), new THREE.MeshStandardMaterial({ color: 0x2a1e14 }));
    door.position.set(0.6, 0.85, 0.91);
    g.add(ramp, door);
    g.traverse((o) => (o as THREE.Mesh).isMesh && (((o as THREE.Mesh).castShadow = true), ((o as THREE.Mesh).receiveShadow = true)));
    g.position.set(x, y, z);
    this.scene.add(g);
    physics.addBox(new THREE.Vector3(x, y + 1, z), new THREE.Vector3(1.35, 1, 0.95));
    this.interactables.push({
      pos: new THREE.Vector3(x, y, z + 1.4), radius: 2.2,
      label: () => this.coopDay === this.time.day ? 'No more eggs today' : 'Collect eggs',
      enabled: () => this.coopDay !== this.time.day,
      action: () => {
        this.coopDay = this.time.day;
        const n = 2 + (this.time.day % 3);
        this.give('egg', n);
        this.onAction?.('eggs', 'egg', n);
      },
    });
  }

  // ---- livestock -------------------------------------------------------------------
  private tended = new WeakMap<Animal, number>();
  /** The nearest cow or sheep the player can tend, for a follow-the-animal interactable. */
  livestockInteractable(): Interactable & { update(p: THREE.Vector3): void } {
    let near: Animal | null = null;
    const pos = new THREE.Vector3(0, -999, 0);
    const self = this;
    return {
      pos, radius: 2.3,
      label: () => {
        if (!near) return '';
        const done = self.tended.get(near) === self.time.day;
        if (near.species === 'sheep') return done ? 'Already shorn' : 'Shear the sheep';
        return done ? 'Already milked today' : 'Milk the cow';
      },
      enabled: () => !!near && self.tended.get(near) !== self.time.day,
      action: () => {
        if (!near) return;
        self.tended.set(near, self.time.day);
        if (near.species === 'sheep') {
          self.give('wool', 1);
          self.onAction?.('shear', 'wool', 1);
        } else {
          self.give('milk', 1);
          self.onAction?.('milk', 'milk', 1);
        }
      },
      update(p: THREE.Vector3) {
        near = null;
        let best = 2.6;
        for (const a of self.fauna.animals) {
          if ((a.species !== 'cow' && a.species !== 'sheep') || a.follow) continue;
          const d = a.pos.distanceTo(p);
          if (d < best) (best = d), (near = a);
        }
        if (near) pos.copy((near as Animal).pos);
        else pos.set(0, -999, 0);
      },
    };
  }

  // ---- inventory helpers -------------------------------------------------------------
  private count(id: string) {
    return this.player.equip.items.filter((i) => i.def.id === id).reduce((n, i) => n + i.qty, 0);
  }

  private take(id: string, n: number) {
    const it = this.player.equip.items.find((i) => i.def.id === id);
    if (!it) return;
    it.qty -= n;
    if (it.qty <= 0) this.player.equip.items.splice(this.player.equip.items.indexOf(it), 1);
  }

  private give(id: string, n: number) {
    this.player.equip.add(id, n);
    this.toast(`+${n} ${ITEMS[id].name}`);
  }

  update(dt: number) {
    for (const [k, v] of this.fieldCooldown) this.fieldCooldown.set(k, v - dt);
    for (const b of this.beds) this.refresh(b);
  }

  toJSON(): FarmSave {
    return { beds: this.beds.map((b) => ({ ...b.state })), coopDay: this.coopDay, orchard: Object.fromEntries(this.orchardDay) };
  }

  fromJSON(d: FarmSave | undefined) {
    if (!d) return;
    d.beds?.forEach((s, i) => {
      if (this.beds[i]) this.beds[i].state = { ...s };
    });
    this.coopDay = d.coopDay ?? -1;
    for (const [k, v] of Object.entries(d.orchard ?? {})) this.orchardDay.set(k, v);
    for (const b of this.beds) this.refresh(b, true);
  }
}
