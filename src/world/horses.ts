import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { heightAt } from './terrainHeight';
import { dampAngle } from '../core/math';
import type { Player } from '../player/player';
import type { Interactable } from '../dungeon/instance';
import type { DialogueOption } from '../ui/dialogue';

// Horses (World Expansion phase 4, prompt §19): stables sell three breeds
// with different speed, stamina and acceleration; you name your horse and
// pick its coat and blanket; ride it with a real animated horse under you;
// galloping drains the horse's stamina and it drops back to a canter when
// it is spent; whistle (X) and it comes running. Stables also run coaches
// between the ones you have discovered.

export interface Breed {
  id: string;
  name: string;
  price: number;
  canter: number; // m/s
  gallop: number; // m/s
  stamina: number;
  accel: number; // m/s²
  blurb: string;
  coats: string[];
}

export const BREEDS: Record<string, Breed> = {
  cob: { id: 'cob', name: 'Farm Cob', price: 180, canter: 9, gallop: 12.5, stamina: 80, accel: 6, blurb: 'Stocky and steady. Not fast, never spooked.', coats: ['bay', 'chestnut', 'dun'] },
  courser: { id: 'courser', name: 'Cresha Courser', price: 420, canter: 11.5, gallop: 15, stamina: 100, accel: 8, blurb: 'The kingdom\'s riding horse: quick, willing, handsome.', coats: ['bay', 'black', 'grey'] },
  runner: { id: 'runner', name: 'Coastal Runner', price: 780, canter: 12.5, gallop: 17.5, stamina: 125, accel: 10, blurb: 'Long-legged sea-coast stock bred for the King\'s couriers.', coats: ['palomino', 'white', 'black'] },
};

const COATS: Record<string, { name: string; main: number; dark: number; light: number; hair: number }> = {
  bay: { name: 'Bay', main: 0x7a3f1c, dark: 0x4a2410, light: 0x9a5a2a, hair: 0x1a1210 },
  chestnut: { name: 'Chestnut', main: 0x9a4a1e, dark: 0x6a2e12, light: 0xba6a34, hair: 0x7a3a18 },
  dun: { name: 'Dun', main: 0xb8925a, dark: 0x7a5a32, light: 0xd8b880, hair: 0x2a1e14 },
  black: { name: 'Black', main: 0x1e1a1a, dark: 0x100e0e, light: 0x3a3232, hair: 0x0a0808 },
  grey: { name: 'Dapple Grey', main: 0x9a9a98, dark: 0x6a6a6a, light: 0xd0d0cc, hair: 0x3a3a3a },
  palomino: { name: 'Palomino', main: 0xd8a85a, dark: 0xa87a3a, light: 0xeccc8a, hair: 0xf2eadc },
  white: { name: 'White', main: 0xe6e2da, dark: 0xb8b4ac, light: 0xf6f4f0, hair: 0xd8d0c0 },
};
const BLANKETS: [string, number][] = [['Cresha blue', 0x2f5f9a], ['Harvest red', 0xb8402e], ['Forest green', 0x3d7a45], ['Gold', 0xc9922a], ['Plum', 0x7a3f8a]];

export interface OwnedHorse {
  id: number;
  name: string;
  breed: string;
  coat: string;
  blanket: number;
}
export interface HorseSave {
  owned: OwnedHorse[];
  active: number | null;
  pos?: [number, number, number];
}

const loader = new GLTFLoader();
let horseGltf: Promise<GLTF> | null = null;

class HorseActor {
  root = new THREE.Group();
  mixer: THREE.AnimationMixer | null = null;
  actions = new Map<string, THREE.AnimationAction>();
  clip = '';
  pos = new THREE.Vector3();
  yaw = 0;
  loaded = false;

  constructor(scene: THREE.Scene, readonly horse: OwnedHorse) {
    scene.add(this.root);
    void (horseGltf ??= loader.loadAsync('/assets/animals/horse.glb')).then((g) => {
      const model = SkeletonUtils.clone(g.scene);
      const box = new THREE.Box3().setFromObject(g.scene);
      model.scale.setScalar(1.72 / (box.max.y - box.min.y));
      const coat = COATS[horse.coat] ?? COATS.bay;
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        const mat = (m.material as THREE.MeshStandardMaterial).clone();
        const c = { Main: coat.main, Main_Dark: coat.dark, Main_Light: coat.light, Hair: coat.hair }[mat.name];
        if (c !== undefined) mat.color.set(c);
        m.material = mat;
      });
      // Saddle, blanket and bridle on the back bone.
      const back = model.getObjectByName('Back') ?? model.getObjectByName('Body');
      const tack = new THREE.Group();
      const leather = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.6 });
      const blanket = new THREE.MeshStandardMaterial({ color: horse.blanket, roughness: 0.95 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.7), blanket);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.5), leather);
      seat.position.y = 0.06;
      const cantle = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), leather);
      cantle.position.set(0, 0.12, -0.24);
      const pommel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.06), leather);
      pommel.position.set(0, 0.12, 0.24);
      tack.add(b, seat, cantle, pommel);
      for (const s of [-1, 1]) {
        const flap = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.6), blanket);
        flap.position.set(s * 0.25, -0.14, 0);
        flap.rotation.z = s * 0.12;
        const stirrup = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 5, 10), new THREE.MeshStandardMaterial({ color: 0x9a9690, metalness: 0.8, roughness: 0.4 }));
        stirrup.position.set(s * 0.3, -0.5, 0.02);
        tack.add(flap, stirrup);
      }
      tack.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
      model.updateMatrixWorld(true);
      if (back) {
        // Tack is authored in metres; undo the model's scale on the bone.
        const ws = back.getWorldScale(new THREE.Vector3());
        tack.scale.set(1 / ws.x, 1 / ws.y, 1 / ws.z);
        const bq = back.getWorldQuaternion(new THREE.Quaternion()).invert();
        tack.quaternion.copy(bq);
        const saddleWorld = new THREE.Vector3(0, 1.3, -0.1);
        tack.position.copy(back.worldToLocal(saddleWorld));
        back.add(tack);
      }
      this.root.add(model);
      this.mixer = new THREE.AnimationMixer(model);
      for (const clip of g.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
      this.loaded = true;
    });
  }

  play(name: string, speed = 1) {
    const next = this.actions.get(name);
    if (!next) return;
    next.setEffectiveTimeScale(speed);
    if (this.clip === name) return;
    const prev = this.actions.get(this.clip);
    next.reset().play();
    if (prev) prev.crossFadeTo(next, 0.25, false);
    this.clip = name;
  }

  update(dt: number) {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.mixer?.update(dt);
  }
}

export class Horses {
  owned: OwnedHorse[] = [];
  active: number | null = null;
  private actors = new Map<number, HorseActor>();
  private riding: HorseActor | null = null;
  private called = false;
  /** horse stamina 0..max (while mounted) */
  stamina = 100;
  private bar: HTMLDivElement;
  readonly interactable: Interactable & { update(): void };
  private nextId = 1;
  onChange?: () => void;
  private near: HorseActor | null = null;

  constructor(private scene: THREE.Scene, private player: Player, private toast: (m: string) => void) {
    this.bar = document.createElement('div');
    this.bar.className = 'horse-bar hidden';
    this.bar.innerHTML = '<b></b><span><i></i></span>';
    document.getElementById('ui')!.appendChild(this.bar);
    const pos = new THREE.Vector3(0, -999, 0);
    const self = this;
    this.interactable = {
      pos, radius: 2.8,
      label: () => (self.near ? `Ride ${self.near.horse.name}` : ''),
      enabled: () => !!self.near && !self.player.mounted,
      action: () => self.near && self.mount(self.near),
      update() {
        self.near = null;
        if (!self.player.mounted) {
          for (const a of self.actors.values()) if (a.loaded && a.pos.distanceTo(self.player.pos) < 3) self.near = a;
        }
        if (self.near) pos.copy(self.near.pos);
        else pos.set(0, -999, 0);
      },
    };
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyX' || e.repeat) return;
      if ((document.activeElement as HTMLElement | null)?.tagName === 'INPUT') return;
      if (this.player.mounted) this.dismount();
      else this.whistle();
    });
  }

  get breed() {
    const h = this.activeHorse;
    return h ? BREEDS[h.breed] : null;
  }

  get activeHorse() {
    return this.owned.find((h) => h.id === this.active) ?? null;
  }

  private actorFor(h: OwnedHorse) {
    let a = this.actors.get(h.id);
    if (!a) {
      a = new HorseActor(this.scene, h);
      this.actors.set(h.id, a);
    }
    return a;
  }

  /** Give the player a horse (bought at a stable) standing at `at`. */
  add(breed: string, name: string, coat: string, blanket: number, at: THREE.Vector3) {
    const h: OwnedHorse = { id: this.nextId++, name, breed, coat, blanket };
    this.owned.push(h);
    this.active = h.id;
    // Only the active horse is out in the world.
    for (const [id, a] of this.actors) if (id !== h.id) (a.root.visible = false);
    const a = this.actorFor(h);
    a.pos.copy(at).setY(heightAt(at.x, at.z));
    a.yaw = Math.PI;
    this.stamina = BREEDS[breed].stamina;
    this.onChange?.();
    return h;
  }

  /** Call the active horse: it gallops over from wherever it is. */
  whistle() {
    const h = this.activeHorse;
    if (!h) return this.toast('You have no horse yet. The stables sell them.');
    const a = this.actorFor(h);
    a.root.visible = true;
    if (a.pos.distanceTo(this.player.pos) > 400) {
      // Too far to hear: it arrives from just out of sight.
      const back = this.player.forward.multiplyScalar(-60);
      a.pos.copy(this.player.pos).add(back);
    }
    this.called = true;
    this.toast(`You whistle for ${h.name}.`);
  }

  mount(a: HorseActor) {
    if (this.player.mounted || this.player.dead) return;
    this.riding = a;
    this.called = false;
    this.player.teleport(a.pos.clone().setY(a.pos.y + 0.2));
    this.player.yaw = a.yaw;
    this.player.setMount(BREEDS[a.horse.breed]);
    this.bar.classList.remove('hidden');
    (this.bar.querySelector('b') as HTMLElement).textContent = a.horse.name;
  }

  dismount() {
    if (!this.riding) return;
    const a = this.riding;
    this.riding = null;
    this.player.setMount(null);
    // Step off to the left of the horse.
    const side = new THREE.Vector3(Math.cos(a.yaw), 0, -Math.sin(a.yaw)).multiplyScalar(1.4);
    const p = a.pos.clone().add(side);
    const saddle = this.player.pos.clone();
    this.player.teleport(p.setY(heightAt(p.x, p.z) + 0.1));
    this.player.animateDismount(saddle);
    this.bar.classList.add('hidden');
  }

  get mountedHorse() {
    return this.riding?.horse ?? null;
  }

  update(dt: number) {
    this.interactable.update();
    const b = this.breed;
    if (this.riding && b) {
      const a = this.riding;
      a.pos.copy(this.player.pos);
      a.yaw = this.player.yaw;
      const speed = Math.hypot(this.player.vel.x, this.player.vel.z);
      const galloping = this.player.sprinting && speed > b.canter * 0.9;
      this.stamina = Math.max(0, Math.min(b.stamina, this.stamina + (galloping ? -14 : 9) * dt));
      this.player.mountCanGallop = this.stamina > (this.player.sprinting ? 0 : b.stamina * 0.25);
      if (speed < 0.4) a.play('Idle');
      else if (speed < 4) a.play('Walk', speed / 1.6);
      else a.play('Gallop', Math.max(0.6, speed / 11));
      (this.bar.querySelector('i') as HTMLElement).style.transform = `scaleX(${this.stamina / b.stamina})`;
      this.bar.classList.toggle('tired', this.stamina < b.stamina * 0.25);
      a.update(dt);
      return;
    }
    for (const a of this.actors.values()) {
      if (!a.root.visible) continue;
      if (this.called && a.horse.id === this.active) {
        const to = this.player.pos.clone().sub(a.pos).setY(0);
        const d = to.length();
        if (d < 3) {
          this.called = false;
          a.play('Idle');
        } else {
          const sp = d > 12 ? 13 : 4;
          a.yaw = dampAngle(a.yaw, Math.atan2(to.x, to.z), 5, dt);
          a.pos.addScaledVector(to.normalize(), Math.min(d - 2.8, sp * dt));
          a.pos.y = heightAt(a.pos.x, a.pos.z);
          a.play(sp > 6 ? 'Gallop' : 'Walk', sp > 6 ? 1.1 : 1);
        }
      } else {
        a.play(Math.floor(performance.now() / 9000) % 3 === 0 ? 'Eating' : 'Idle');
      }
      this.stamina = Math.min(this.breed?.stamina ?? 100, this.stamina + 12 * dt);
      a.update(dt);
    }
  }

  setVisible(v: boolean) {
    for (const a of this.actors.values()) a.root.visible = v && (a.horse.id === this.active);
  }

  // ---- stables ----------------------------------------------------------------------

  /** Dialogue options for a stablemaster. `yard` is where bought horses are brought round. */
  stableOptions(yard: THREE.Vector3, show: (t: string, o: DialogueOption[]) => void, back: () => void, gold: () => number, spend: (n: number) => void): DialogueOption[] {
    const out: DialogueOption[] = [{
      label: 'Buy a horse',
      run: () => show('Three breeds on the rail today. Look them over.', [
        ...Object.values(BREEDS).map((b) => ({
          label: `${b.name} — ${b.price}g  (canter ${b.canter}, gallop ${b.gallop} m/s, stamina ${b.stamina})`,
          run: () => {
            if (gold() < b.price) return show(`The ${b.name} is ${b.price} gold. Come back when your purse is heavier.`, [{ label: 'Back.', run: back }]);
            show(`${b.blurb} Which coat?`, b.coats.map((c) => ({
              label: COATS[c].name,
              run: () => show('And a blanket colour for the saddle?', BLANKETS.map(([bn, bc]) => ({
                label: bn,
                run: () => this.askName((name) => {
                  spend(b.price);
                  const h = this.add(b.id, name, c, bc, yard);
                  show(`${h.name} is yours. She's saddled and waiting in the yard. Whistle (X) and she'll come to you; press X again while riding to get down.`, [{ label: 'Thank you.', run: back }]);
                }),
              }))),
            })));
          },
        })),
        { label: 'Not today.', run: back },
      ]),
    }];
    if (this.owned.length > 1) {
      out.push({
        label: 'Swap to another of my horses',
        run: () => show('Which one?', [...this.owned.map((h) => ({
          label: `${h.name} (${BREEDS[h.breed].name}, ${COATS[h.coat].name})${h.id === this.active ? ' — riding' : ''}`,
          run: () => {
            if (this.riding) this.dismount();
            this.active = h.id;
            for (const [id, a] of this.actors) a.root.visible = id === h.id;
            const a = this.actorFor(h);
            a.root.visible = true;
            a.pos.copy(yard).setY(heightAt(yard.x, yard.z));
            this.onChange?.();
            show(`${h.name} is brought round to the yard.`, [{ label: 'Good.', run: back }]);
          },
        })), { label: 'Back.', run: back }]),
      });
    }
    return out;
  }

  /** A small naming dialog (the browser's prompt() does not exist in the desktop app). */
  private askName(done: (name: string) => void) {
    const wrap = document.createElement('div');
    wrap.className = 'name-prompt interactive';
    wrap.innerHTML = '<div><b>Name your horse</b><input maxlength="18" placeholder="Clover, Thunder, Biscuit…"><button>Done</button></div>';
    document.getElementById('ui')!.appendChild(wrap);
    const input = wrap.querySelector('input')!;
    const finish = () => {
      const name = input.value.trim().replace(/[<>]/g, '') || ['Biscuit', 'Thunder', 'Hazel', 'Rowan', 'Maple'][Math.floor(Math.random() * 5)];
      wrap.remove();
      done(name.charAt(0).toUpperCase() + name.slice(1));
    };
    wrap.querySelector('button')!.addEventListener('click', finish);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish();
    });
    setTimeout(() => input.focus(), 50);
  }

  toJSON(): HorseSave {
    const a = this.active != null ? this.actors.get(this.active) : undefined;
    return { owned: this.owned, active: this.active, pos: a ? [a.pos.x, a.pos.y, a.pos.z] : undefined };
  }

  fromJSON(d: HorseSave | undefined, fallback: THREE.Vector3) {
    if (!d) return;
    this.owned = d.owned ?? [];
    this.active = d.active ?? null;
    this.nextId = Math.max(1, ...this.owned.map((h) => h.id + 1));
    const h = this.activeHorse;
    if (h) {
      const a = this.actorFor(h);
      const p = d.pos ? new THREE.Vector3(...d.pos) : fallback;
      a.pos.copy(p).setY(heightAt(p.x, p.z));
      this.stamina = BREEDS[h.breed].stamina;
    }
  }
}

/** Coach routes between discovered stables: fare and travel time scale with road distance. */
export interface StableStop {
  id: string;
  name: string;
  pos: THREE.Vector3;
  /** metres along the King's Road (for fares and times) */
  along: number;
}
