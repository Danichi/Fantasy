import * as THREE from 'three';
import type { ItemDef } from '../items/itemDefs';
import { buildSword } from '../items/weaponModels';
import { buildKey } from './roadToRiches';
import { sfx } from '../audio/sfx';
import type { FX } from '../fx/particles';
import type { Gravewood } from './gravewood';
import type { Interactable } from '../dungeon/instance';
import type { Door } from './doors';

// The Gravewood pedestal's secret, once the curse is broken: a little stone
// door in its face with a scroll behind it (a riddle, and nothing else: no
// marker, no quest, no hint where to go), and a keyhole. The key opens a
// stair into the ground and the sanctum below, where Edric waits.

export const RIDDLE = 'The prettiest people do the ugliest things on the road to riches and diamond rings.';

export const GRAVEWOOD_KEY_ITEMS: Record<string, ItemDef> = {
  gravewoodKey: {
    id: 'gravewoodKey', name: 'Posy\'s Iron Key', kind: 'key', rarity: 'rare',
    desc: 'A small iron key on a pink ribbon, worn smooth by a child\'s fingers.', stats: {}, build: buildKey,
  },
  riddleScroll: {
    id: 'riddleScroll', name: 'A Weathered Scroll', kind: 'key', rarity: 'rare',
    desc: `Found in the Gravewood pedestal. In a cramped, careful hand: "${RIDDLE}"`, stats: {},
    build: () => {
      const g = new THREE.Group();
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.32, 10), new THREE.MeshStandardMaterial({ color: 0xe8d8b0, roughness: 0.9 }));
      roll.rotation.z = Math.PI / 2;
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.008, 4, 12), new THREE.MeshStandardMaterial({ color: 0x7a1a14 }));
      tie.rotation.y = Math.PI / 2;
      g.add(roll, tie);
      return g;
    },
  },
  hollowedBlade: {
    id: 'hollowedBlade', name: 'The Hollowed Blade', kind: 'sword', slot: 'main', rarity: 'epic',
    desc: 'Edric\'s sword, black with the curse he gave himself to. It still remembers his grief: it drinks from every wound, and burns.',
    stats: { damage: 40, speed: 1.05, lifesteal: 0.1, burn: 6, crit: 0.08 },
    build: () => buildSword({ bladeLen: 1.0, bladeWidth: 0.032, thickness: 0.0055, fullerLen: 0, gripLen: 0.18, guardSpan: 0.15, guardStyle: 'curved', pommel: 'wheel', tint: 0x2a2030, glow: 0xa040ff, glowStrength: 2.2 }),
  },
  posysRibbon: {
    id: 'posysRibbon', name: 'Posy\'s Ribbon', kind: 'accessory', slot: 'trinket', rarity: 'epic',
    desc: 'A faded pink ribbon from the sanctum chest. Nobody should have to carry this. You do.',
    stats: { maxHp: 30, staminaRegen: 0.15, damagePct: 0.06 },
    build: () => {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 6, 20), new THREE.MeshStandardMaterial({ color: 0xe0789a }));
      const g = new THREE.Group();
      g.add(r);
      return g;
    },
  },
};

export interface KeyHooks {
  flags: Record<string, boolean | number | string>;
  count(item: string): number;
  give(item: string, n: number): void;
  take(item: string, n: number): void;
  toast(msg: string): void;
  read(title: string, text: string): void;
  enterSanctum(door: Door): void;
  save(): void;
}

export class GravewoodKey {
  readonly interactables: Interactable[] = [];
  private built = false;
  private door = new THREE.Group();
  private scroll: THREE.Mesh | null = null;
  private slabs: THREE.Mesh[] = [];
  private stair = new THREE.Group();
  private doorOpen = 0;
  private slide = 0;
  private sanctumDoor: Door;
  private base = new THREE.Vector3();
  private front = new THREE.Vector3(0, 0, -1); // the pedestal's face toward the graveyard gate

  constructor(private gw: Gravewood, private scene: THREE.Scene, private fx: FX, private hooks: KeyHooks) {
    this.sanctumDoor = { pos: new THREE.Vector3(), yaw: Math.PI, spec: { w: 22, d: 72, floors: 1, roof: 'slate', seed: 9161 }, kind: 'sanctum', name: 'the Sanctum Below' };
    const at = (side: number, up = 0) => () => this.base.clone().addScaledVector(this.front, 1.6).add(new THREE.Vector3(side, up, 0));
    const pos = (fn: () => THREE.Vector3) => {
      const v = new THREE.Vector3();
      return { get: () => v.copy(fn()) };
    };
    const doorAt = pos(at(0.7)), keyAt = pos(at(-0.7)), stairAt = pos(() => this.base.clone().addScaledVector(this.front, 4.2));
    const ready = () => this.built && this.gw.cleared && this.gw.pedestalUp >= 1;
    this.interactables.push(
      {
        get pos() { return doorAt.get(); }, radius: 1.5,
        label: () => (this.hooks.flags.gwScrollOpen ? (this.hooks.flags.gwScrollTaken ? 'An empty niche in the pedestal' : 'Take the scroll') : 'A little stone door in the pedestal'),
        enabled: () => ready() && !this.hooks.flags.gwScrollTaken,
        action: () => {
          if (!this.hooks.flags.gwScrollOpen) {
            this.hooks.flags.gwScrollOpen = true;
            sfx.rumble(0.6, 0.4);
            this.hooks.save();
            return;
          }
          this.hooks.flags.gwScrollTaken = true;
          if (this.scroll) this.scroll.visible = false;
          this.hooks.give('riddleScroll', 1);
          this.hooks.read('A Weathered Scroll', `Rolled tight and tied with red thread, in a cramped, careful hand:\n\n"${RIDDLE}"`);
          this.hooks.save();
        },
      } as Interactable,
      {
        get pos() { return keyAt.get(); }, radius: 1.5,
        label: () => (this.hooks.flags.gwUnlocked ? 'The keyhole, turned' : this.hooks.count('gravewoodKey') ? 'Turn the iron key in the keyhole' : 'A keyhole in the pedestal'),
        enabled: () => ready() && !this.hooks.flags.gwUnlocked,
        action: () => {
          if (!this.hooks.count('gravewoodKey')) {
            this.hooks.read('A Keyhole', 'A small keyhole, rimmed with rust, low in the pedestal\'s face. Something small and iron would fit it.');
            return;
          }
          this.hooks.take('gravewoodKey', 1);
          this.hooks.flags.gwUnlocked = true;
          this.hooks.toast('The key turns with a sound like a bone snapping. Stone grinds under the earth.');
          sfx.rumble(4, 1);
          this.hooks.save();
        },
      } as Interactable,
      {
        get pos() { return stairAt.get(); }, radius: 2,
        label: () => 'Go down the stair',
        enabled: () => ready() && !!this.hooks.flags.gwUnlocked && this.slide >= 1,
        action: () => {
          this.sanctumDoor.pos.copy(this.base).addScaledVector(this.front, 6.2);
          this.sanctumDoor.yaw = Math.atan2(this.front.x, this.front.z);
          this.hooks.enterSanctum(this.sanctumDoor);
        },
      } as Interactable,
    );
  }

  private build() {
    const ped = this.gw.pedestalNode;
    if (!ped) return;
    this.built = true;
    const iron = new THREE.MeshStandardMaterial({ color: 0x4a4440, metalness: 0.7, roughness: 0.45 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xb08a40, metalness: 0.8, roughness: 0.35 });
    const stone = new THREE.MeshStandardMaterial({ color: 0x7a746c, roughness: 0.95 });
    const black = new THREE.MeshBasicMaterial({ color: 0x050403 });
    const fz = -0.476; // the column's face toward the gate (-Z)
    // The keyhole plate, low on the column.
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.02), brass);
    plate.position.set(-0.22, 1.35, fz - 0.01);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), black);
    hole.position.set(-0.22, 1.4, fz - 0.022);
    hole.rotation.y = Math.PI;
    const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.025, 0.08), black);
    slot.position.set(-0.22, 1.34, fz - 0.022);
    slot.rotation.y = Math.PI;
    ped.add(plate, hole, slot);
    // The niche and its little door (hinged on the left).
    const niche = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 0.2), black);
    niche.position.set(0.2, 2.15, fz + 0.09);
    ped.add(niche);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.32, 0.04), stone);
    leaf.position.set(0.19, 0, 0);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), iron);
    knob.position.set(0.33, 0, -0.03);
    this.door.add(leaf, knob);
    this.door.position.set(0.01, 2.15, fz - 0.02);
    ped.add(this.door);
    this.scroll = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 10), new THREE.MeshStandardMaterial({ color: 0xe8d8b0, roughness: 0.9, emissive: 0x3a3020, emissiveIntensity: 0.4 }));
    this.scroll.rotation.z = Math.PI / 2;
    this.scroll.position.set(0.2, 2.1, fz + 0.07);
    this.scroll.visible = !this.hooks.flags.gwScrollTaken;
    ped.add(this.scroll);
    // The stair: two slabs in the earth that slide apart over steps going down.
    this.base.copy(this.gw.pedestalBase);
    const s0 = this.base.clone().addScaledVector(this.front, 4.2);
    this.stair.position.copy(s0);
    this.stair.rotation.y = Math.atan2(this.front.x, this.front.z);
    const pit = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 3), black);
    pit.position.y = -0.02;
    this.stair.add(pit);
    for (let k = 0; k < 6; k++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(2, 0.22, 0.5), stone);
      step.position.set(0, -0.15 - k * 0.3, -1.2 + k * 0.48);
      this.stair.add(step);
    }
    for (const sx of [-1, 1]) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.22, 3.1), stone);
      slab.position.set(sx * 0.57, 0.05, 0);
      slab.userData.sx = sx;
      slab.castShadow = slab.receiveShadow = true;
      this.stair.add(slab);
      this.slabs.push(slab);
    }
    this.stair.visible = false;
    this.scene.add(this.stair);
  }

  update(dt: number) {
    if (!this.built) {
      if (this.gw.pedestalNode) this.build();
      return;
    }
    const up = this.gw.cleared && this.gw.pedestalUp >= 1;
    this.stair.visible = up;
    // The niche door swings open.
    const want = this.hooks.flags.gwScrollOpen ? 1 : 0;
    this.doorOpen += Math.sign(want - this.doorOpen) * Math.min(Math.abs(want - this.doorOpen), dt * 1.5);
    this.door.rotation.y = this.doorOpen * 1.9;
    if (this.scroll) this.scroll.visible = !this.hooks.flags.gwScrollTaken;
    // The stair opens once unlocked.
    if (this.hooks.flags.gwUnlocked && this.slide < 1) {
      this.slide = Math.min(1, this.slide + dt / 3.5);
      if (Math.random() < dt * 20) this.fx.add.spawn({ pos: this.stair.position.clone().setY(this.stair.position.y + 0.2), spread: 1.5, count: 3, life: [0.6, 1.3], size: [0.25, 0.08], color: 0x6a5a48, color2: 0x2a221a, gravity: 3, upBias: 1, alpha: 0.7 });
    } else if (this.hooks.flags.gwUnlocked) this.slide = 1;
    for (const s of this.slabs) s.position.x = (s.userData.sx as number) * (0.57 + this.slide * 1.25);
    // A breath of violet light from below once it's open.
    if (this.slide >= 1 && up && Math.random() < dt * 4) this.fx.add.spawn({ pos: this.stair.position.clone().setY(this.stair.position.y - 0.5), vel: new THREE.Vector3(0, 1.4, 0), spread: 0.8, count: 1, life: [0.8, 1.6], size: [0.12, 0.02], color: 0xb070ff, color2: 0x301050, upBias: 1 });
  }

  setVisible(v: boolean) {
    this.stair.visible = v && this.gw.cleared && this.gw.pedestalUp >= 1;
  }
}
