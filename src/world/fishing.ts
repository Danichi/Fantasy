import * as THREE from 'three';
import type { ItemDef } from '../items/itemDefs';
import type { Player } from '../player/player';

// Fishing (World Expansion phase 5, the Fisher class): cast a line from any
// fishing spot (riverbanks, the harbour piers, the wharf, the sea wall), wait
// for a bite, strike, then reel against the fish: holding reel builds
// progress but also tension, the fish surges and pulls, and too much tension
// snaps the line. What bites depends on the water, the hour and the weather.

export type Water = 'river' | 'lake' | 'harbour' | 'sea';

interface FishDef {
  id: string;
  name: string;
  water: Water[];
  /** hours it bites: [from, to) (wraps past midnight) */
  hours?: [number, number];
  /** only in these weathers */
  weather?: ('rain' | 'storm' | 'clear')[];
  rarity: number; // relative weight
  size: [number, number]; // kg
  fight: number; // 0.5 lazy .. 2 fierce
  price: number; // gold per kg
  color: number;
  desc: string;
  /** only from the trawl's deep tables (Seamanship: Deep Tables) */
  deep?: boolean;
  /** a great fish taken with the harpoon (Seamanship: Big Game) */
  bigGame?: boolean;
}

export const FISH: FishDef[] = [
  { id: 'glenPerch', name: 'Glen Perch', water: ['river', 'lake'], rarity: 10, size: [0.2, 0.9], fight: 0.6, price: 6, color: 0x7a9a4a, desc: 'A striped river perch. Every child in Elder Glen has caught one.' },
  { id: 'silverTrout', name: 'Silver Trout', water: ['river'], hours: [5, 11], rarity: 6, size: [0.5, 2.4], fight: 1.1, price: 10, color: 0xc0c8d0, desc: 'Quick and bright, biting best in the morning.' },
  { id: 'mudcat', name: 'Mudcat', water: ['river', 'lake'], hours: [19, 5], rarity: 5, size: [1, 5], fight: 0.9, price: 7, color: 0x5a4a3a, desc: 'A whiskered bottom-feeder that prowls after dark.' },
  { id: 'goldenCarp', name: 'Golden Carp', water: ['lake', 'river'], rarity: 1, size: [2, 7], fight: 1.2, price: 22, color: 0xe0a830, desc: 'A lucky fish. Innkeepers hang them over the bar.' },
  { id: 'mackerel', name: 'Harbour Mackerel', water: ['harbour', 'sea'], rarity: 10, size: [0.3, 1.2], fight: 1.0, price: 6, color: 0x4a7a9a, desc: 'Schools of them flash under the Port Aurelle piers.' },
  { id: 'seaBream', name: 'Sea Bream', water: ['harbour', 'sea'], rarity: 6, size: [0.6, 2.5], fight: 1.1, price: 11, color: 0xb8b0a0, desc: 'A silver-rose bream, prized at the fish market.' },
  { id: 'rainbowWrasse', name: 'Rainbow Wrasse', water: ['sea'], hours: [8, 17], weather: ['clear'], rarity: 3, size: [0.4, 1.6], fight: 1.3, price: 18, color: 0x3ab0c0, desc: 'Every colour of the reef in one fish. Only bites on bright days.' },
  { id: 'moonfish', name: 'Moonfish', water: ['sea'], hours: [22, 4], rarity: 1.2, size: [3, 12], fight: 1.5, price: 26, color: 0xd8dcf0, desc: 'A pale, round deep-water fish that rises to the moonlight.' },
  { id: 'stormjaw', name: 'Stormjaw Eel', water: ['sea', 'harbour'], weather: ['storm', 'rain'], rarity: 2, size: [2, 9], fight: 1.9, price: 24, color: 0x2a3a4a, desc: 'Sailors say it only feeds when the sea is angry.' },
  // The open ocean's great fish (never on a rod: the harpoon or the trawl).
  { id: 'bluefin', name: 'Bluefin Tuna', water: ['sea'], rarity: 0, size: [60, 240], fight: 2, price: 3, color: 0x2a4a8a, bigGame: true, desc: 'A torpedo of muscle that follows the mackerel shoals. A whole village could eat for a week.' },
  { id: 'marlin', name: 'Sailfin Marlin', water: ['sea'], rarity: 0, size: [80, 300], fight: 2, price: 3, color: 0x3a6aaa, bigGame: true, desc: 'A spear-billed giant with a sail on its back. Captains hang the bills over their doors.' },
  { id: 'lanternjaw', name: 'Lanternjaw', water: ['sea'], rarity: 0, size: [2, 8], fight: 1.4, price: 30, color: 0x1a2a3a, deep: true, desc: 'A black fish with a little lamp on a stalk. It glows in the hold for days.' },
  { id: 'ghostRay', name: 'Ghost Ray', water: ['sea'], rarity: 0, size: [6, 30], fight: 1.6, price: 14, color: 0xd0d8e0, deep: true, desc: 'A pale ray from the deep water, near transparent. Alchemists pay well for its skin.' },
  { id: 'kingCrab', name: 'King Crab', water: ['sea'], rarity: 0, size: [3, 9], fight: 1, price: 16, color: 0xa83a2a, deep: true, desc: 'Spiny, red and as wide as a shield. Worth its weight in silver at the Salty Anchor.' },
  { id: 'oldBoot', name: 'Old Boot', water: ['river', 'lake', 'harbour', 'sea'], rarity: 1.5, size: [0.6, 0.6], fight: 0.3, price: 0, color: 0x4a3a2a, desc: 'Someone, somewhere, is walking with one foot wet.' },
];

/** Fish items (one per species; size is rolled at catch time and sold by weight). */
export const FISH_ITEMS: Record<string, ItemDef> = Object.fromEntries(FISH.map((f) => [f.id, {
  id: f.id, name: f.name, kind: 'material' as const, rarity: f.rarity <= 1.2 ? 'rare' as const : f.rarity <= 3 ? 'fine' as const : 'common' as const, stack: true,
  desc: f.desc, stats: {},
  build: () => fishModel(f.color, f.id === 'oldBoot'),
}]));
FISH_ITEMS.fishingRod = {
  id: 'fishingRod', name: 'Fishing Rod', kind: 'key', rarity: 'common', desc: 'Ash rod, horsehair line, bone hook. Stand at any fishing spot and press E.', stats: {},
  build: () => {
    const g = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.02, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0x8a6a4a }));
    rod.rotation.z = 0.7;
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), new THREE.MeshStandardMaterial({ color: 0x9a9690, metalness: 0.7 }));
    reel.position.set(0.33, -0.45, 0.03);
    reel.rotation.x = Math.PI / 2;
    g.add(rod, reel);
    return g;
  },
};

function fishModel(color: number, boot = false) {
  const g = new THREE.Group();
  if (boot) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.26, 0.14), m);
    leg.position.y = 0.13;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.28), m);
    foot.position.set(0, 0.02, 0.07);
    g.add(leg, foot);
    return g;
  }
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.25 }));
  body.scale.set(0.45, 0.85, 2.2);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.14, 4), body.material);
  tail.rotation.x = -Math.PI / 2;
  tail.scale.set(0.3, 1, 1);
  tail.position.z = -0.27;
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 4), new THREE.MeshBasicMaterial({ color: 0x101010 }));
  eye.position.set(0.04, 0.02, 0.15);
  g.add(body, tail, eye);
  g.rotation.y = Math.PI / 2;
  return g;
}

export interface FishingSpot {
  pos: THREE.Vector3;
  /** where the float lands */
  water: THREE.Vector3;
  kind: Water;
  name: string;
}

type Phase = 'idle' | 'cast' | 'wait' | 'bite' | 'reel' | 'done';

export interface Catch { id: string; name: string; kg: number }

export class Fishing {
  phase: Phase = 'idle';
  private spot: FishingSpot | null = null;
  private t = 0;
  private biteAt = 0;
  private fish: FishDef | null = null;
  private kg = 0;
  private progress = 0;
  private tension = 0;
  private surge = 0;
  private power = 0;
  private ui: HTMLDivElement;
  private float: THREE.Mesh;
  private line: THREE.Line;
  private rod: THREE.Mesh;
  /** biggest of each species: the trophy log */
  trophies: Record<string, number> = {};
  /** unsold catch: kilograms per species (the market pays by weight) */
  held: Record<string, number> = {};
  onCatch?: (c: Catch) => void;
  onMessage?: (m: string) => void;
  onToggle?: (active: boolean) => void;
  private reeling = false;

  constructor(scene: THREE.Scene, private player: Player, private hour: () => number, private weather: () => { rain: number; storm: number }) {
    this.ui = document.createElement('div');
    this.ui.className = 'fishing hidden';
    this.ui.innerHTML = '<b></b><div class="fbar"><i class="prog"></i></div><div class="fbar tension"><i class="ten"></i></div><small></small>';
    document.getElementById('ui')!.appendChild(this.ui);
    this.float = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: 0xe0402a, roughness: 0.4 }));
    this.float.visible = false;
    scene.add(this.float);
    this.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xf0f0f0, transparent: true, opacity: 0.7 }));
    this.line.visible = false;
    this.line.frustumCulled = false;
    scene.add(this.line);
    this.rod = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.022, 2.2, 6).translate(0, 1.1, 0), new THREE.MeshStandardMaterial({ color: 0x8a6a4a }));
    this.rod.visible = false;
    scene.add(this.rod);
    // E strikes and reels (held); Esc or moving away gives up.
    window.addEventListener('keydown', (e) => {
      if (this.phase === 'idle') return;
      if (e.code === 'KeyE' || e.code === 'Space') {
        e.stopImmediatePropagation();
        if (e.repeat) return;
        if (this.phase === 'cast') this.release();
        else if (this.phase === 'bite') this.strike();
        else if (this.phase === 'reel') this.reeling = true;
        else if (this.phase === 'wait') this.message('Too early — nothing has bitten yet.');
        else if (this.phase === 'done') this.stop();
      } else if (e.code === 'Escape') {
        e.stopImmediatePropagation();
        this.stop();
      }
    }, true);
    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyE' || e.code === 'Space') this.reeling = false;
    });
  }

  get active() {
    return this.phase !== 'idle';
  }

  /** Begin at a spot: a power meter swings; press E to cast. */
  start(spot: FishingSpot) {
    if (this.active) return;
    this.spot = spot;
    this.phase = 'cast';
    this.t = 0;
    this.player.yaw = Math.atan2(spot.water.x - spot.pos.x, spot.water.z - spot.pos.z);
    this.rod.visible = true;
    this.onToggle?.(true);
    this.render('Cast — press E at full power', spot.name);
  }

  private message(m: string) {
    this.onMessage?.(m);
  }

  private release() {
    const spot = this.spot!;
    this.phase = 'wait';
    this.t = 0;
    // A good cast lands further out and bites sooner.
    const dist = 0.5 + this.power * 0.5;
    this.float.position.copy(this.player.pos).lerp(spot.water, dist).setY(spot.water.y + 0.04);
    this.float.visible = true;
    this.line.visible = true;
    this.biteAt = 3 + Math.random() * 7 * (1.3 - this.power * 0.5);
    this.fish = this.roll();
    this.render('Waiting for a bite…', spot.name);
  }

  private roll(): FishDef {
    const h = this.hour();
    const w = this.weather();
    const sky = w.storm > 0.4 ? 'storm' : w.rain > 0.3 ? 'rain' : 'clear';
    const kind = this.spot!.kind;
    const pool = FISH.filter((f) => f.rarity > 0 && f.water.includes(kind)
      && (!f.hours || (f.hours[0] <= f.hours[1] ? h >= f.hours[0] && h < f.hours[1] : h >= f.hours[0] || h < f.hours[1]))
      && (!f.weather || f.weather.includes(sky as 'clear')));
    let total = 0;
    for (const f of pool) total += f.rarity;
    let r = Math.random() * total;
    for (const f of pool) if ((r -= f.rarity) <= 0) return f;
    return pool[0] ?? FISH[0];
  }

  private strike() {
    const f = this.fish!;
    this.kg = +(f.size[0] + Math.pow(Math.random(), 1.6) * (f.size[1] - f.size[0])).toFixed(2);
    this.phase = 'reel';
    this.progress = 0.15;
    this.tension = 0.2;
    this.t = 0;
    this.render('Hooked! Hold E to reel — ease off when the line strains', this.spot!.name);
  }

  stop() {
    if (!this.active) return;
    this.phase = 'idle';
    this.float.visible = false;
    this.line.visible = false;
    this.rod.visible = false;
    this.ui.classList.add('hidden');
    this.reeling = false;
    this.onToggle?.(false);
  }

  private render(title: string, sub: string) {
    this.ui.classList.remove('hidden');
    (this.ui.querySelector('b') as HTMLElement).textContent = title;
    (this.ui.querySelector('small') as HTMLElement).textContent = sub;
    this.ui.classList.toggle('reel', this.phase === 'reel' || this.phase === 'cast');
  }

  update(dt: number) {
    if (!this.active || !this.spot) return;
    this.t += dt;
    // Walking away gives up.
    if (this.player.pos.distanceTo(this.spot.pos) > 4) return this.stop();
    const rodTip = this.player.pos.clone().add(new THREE.Vector3(Math.sin(this.player.yaw) * 1.6, 2.6, Math.cos(this.player.yaw) * 1.6));
    this.rod.position.copy(this.player.pos).add(new THREE.Vector3(Math.sin(this.player.yaw) * 0.35, 1.1, Math.cos(this.player.yaw) * 0.35));
    this.rod.rotation.set(0, 0, 0);
    this.rod.lookAt(rodTip);
    this.rod.rotateX(Math.PI / 2);
    const prog = this.ui.querySelector('.prog') as HTMLElement;
    const ten = this.ui.querySelector('.ten') as HTMLElement;
    switch (this.phase) {
      case 'cast':
        this.power = 0.5 - 0.5 * Math.cos(this.t * 3.2);
        prog.style.transform = `scaleX(${this.power})`;
        ten.style.transform = 'scaleX(0)';
        break;
      case 'wait':
        this.float.position.y = this.spot.water.y + 0.04 + Math.sin(this.t * 2.2) * 0.02;
        // Nibbles before the real bite.
        if (this.t > this.biteAt - 1.2 && this.t < this.biteAt) this.float.position.y -= Math.abs(Math.sin(this.t * 20)) * 0.04;
        if (this.t >= this.biteAt) {
          this.phase = 'bite';
          this.t = 0;
          this.render('A BITE! Press E!', this.spot.name);
        }
        break;
      case 'bite':
        this.float.position.y = this.spot.water.y - 0.08;
        if (this.t > 1.1) {
          this.message('It got away. Strike faster when the float dips.');
          this.phase = 'wait';
          this.t = 0;
          this.biteAt = 3 + Math.random() * 6;
          this.render('Waiting for a bite…', this.spot.name);
        }
        break;
      case 'reel': {
        const f = this.fish!;
        // The fish surges every so often; a fierce fish surges harder.
        this.surge = Math.max(0, this.surge - dt);
        if (Math.random() < dt * (0.35 + f.fight * 0.35)) this.surge = 0.5 + Math.random() * 0.8;
        const pull = (this.surge > 0 ? 0.9 : 0.25) * f.fight * (0.7 + this.kg / f.size[1] * 0.5);
        if (this.reeling) {
          this.progress += dt * (0.24 / (0.6 + this.kg / 8)) * (this.surge > 0 ? 0.3 : 1);
          this.tension += dt * pull;
        } else {
          this.tension -= dt * 0.55;
          this.progress -= dt * 0.03 * f.fight;
        }
        this.tension = Math.max(0, this.tension);
        this.float.position.lerp(this.player.pos.clone().setY(this.spot.water.y), dt * (this.reeling ? 0.3 : 0));
        this.float.position.y = this.spot.water.y + Math.sin(this.t * 14) * 0.03 * (this.surge > 0 ? 3 : 1);
        prog.style.transform = `scaleX(${Math.min(1, this.progress)})`;
        ten.style.transform = `scaleX(${Math.min(1, this.tension)})`;
        this.ui.classList.toggle('danger', this.tension > 0.75);
        if (this.tension >= 1) {
          this.message('SNAP! The line breaks.');
          this.stop();
          return;
        }
        if (this.progress <= 0) {
          this.message('The fish shakes the hook and is gone.');
          this.stop();
          return;
        }
        if (this.progress >= 1) {
          this.phase = 'done';
          this.float.visible = false;
          const best = this.trophies[f.id] ?? 0;
          const record = f.id !== 'oldBoot' && this.kg > best;
          if (record) this.trophies[f.id] = this.kg;
          if (f.price > 0) this.held[f.id] = +((this.held[f.id] ?? 0) + this.kg).toFixed(2);
          this.onCatch?.({ id: f.id, name: f.name, kg: this.kg });
          this.render(`${f.name}, ${f.id === 'oldBoot' ? '' : this.kg + ' kg'}${record ? ' — a new record!' : ''}`, 'Press E to fish again elsewhere, Esc to stop');
        }
        break;
      }
    }
    const pts = [rodTip, this.float.visible ? this.float.position : rodTip];
    (this.line.geometry as THREE.BufferGeometry).setFromPoints(pts);
  }

  /** Sell every held fish; returns [gold, fish sold by id]. `count` reads the bag. */
  sellAll(count: (id: string) => number, take: (id: string, n: number) => void): number {
    let gold = 0;
    for (const [id, kg] of Object.entries(this.held)) {
      const n = count(id);
      if (!n) continue;
      gold += Fishing.price(id, kg);
      take(id, n);
      delete this.held[id];
    }
    return gold;
  }

  toJSON() {
    return { trophies: this.trophies, held: this.held };
  }

  fromJSON(d?: { trophies?: Record<string, number>; held?: Record<string, number> }) {
    this.trophies = d?.trophies ?? {};
    this.held = d?.held ?? {};
  }

  /** Price the fish market pays for a catch. */
  static price(id: string, kg: number) {
    const f = FISH.find((x) => x.id === id);
    return f ? Math.max(1, Math.round(f.price * kg)) : 0;
  }
}
