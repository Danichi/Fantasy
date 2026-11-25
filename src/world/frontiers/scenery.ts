import * as THREE from 'three';
import type { WorldMats } from '../buildings';
import type { FieldDef } from './catalog';
import { FRONTS } from './context';
import { heightAt } from '../terrainHeight';
import { buildCharacter, type BuiltCharacter } from '../../npc/charBuilder';
export const NODE_OFFSETS = [
  [0, 0],
  [12, -10],
  [25, -6],
] as const;
export class FieldScenery {
  readonly root = new THREE.Group();
  readonly nodes: THREE.Vector3[];
  readonly ready: Promise<void>;
  private person?: BuiltCharacter;
  private disposed = false;
  private owned: THREE.Material[] = [];
  private aura?: THREE.Mesh;
  private lamps: THREE.Mesh[] = [];
  private cart?: THREE.Group;
  private depart = 0;
  private walk?: THREE.AnimationAction;
  constructor(
    private scene: THREE.Scene,
    readonly def: FieldDef,
    readonly at: THREE.Vector3,
    mats: WorldMats,
    private initiallyDone = false
  ) {
    this.root.name = 'Field: ' + def.name;
    this.nodes = NODE_OFFSETS.map(([x, z]) => new THREE.Vector3(at.x + x, heightAt(at.x + x, at.z + z), at.z + z));
    const wood = mats.timber,
      stone = mats.stone;
    const color = new THREE.MeshStandardMaterial({ color: FRONTS[def.front].color, roughness: 0.9 });
    const glow = new THREE.MeshStandardMaterial({ color: 0x9d76c4, emissive: 0x5a287a, emissiveIntensity: 0.7 });
    const paper = new THREE.MeshStandardMaterial({ color: 0xddceaa, roughness: 1 });
    this.owned.push(color, glow, paper);
    const box = (pos: THREE.Vector3, dx: number, y: number, dz: number, w: number, h: number, d: number, mat: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(pos.x + dx, pos.y + y, pos.z + dz);
      mesh.castShadow = mesh.receiveShadow = true;
      this.root.add(mesh);
      return mesh;
    };
    if (['cache', 'memory', 'vista', 'rift'].includes(def.kind)) {
      this.nodes.forEach((p, i) => {
        box(p, 0, 0.55, 0, def.kind === 'memory' ? 0.65 : 0.24, 1.1, 0.24, def.kind === 'rift' || def.kind === 'memory' ? stone : wood);
        // Notches and ribbons make the order readable in the world, not only in a menu.
        for (let n = 0; n <= i; n++) box(p, 0, 0.78 - n * 0.16, 0.14, 0.32, 0.07, 0.05, paper);
        const lamp = box(p, 0.22, 0.95, 0, 0.13, 0.2, 0.16, def.kind === 'rift' ? glow : color);
        this.lamps.push(lamp);
        if (def.kind !== 'rift') box(p, 0.7, 0.15, 0.1, 0.65, 0.3, 0.45, i === 2 ? wood : paper);
      });
      if (def.kind === 'rift') {
        const geometry = new THREE.TorusGeometry(1.0, 0.09, 5, 20);
        this.aura = new THREE.Mesh(geometry, glow);
        this.aura.position.copy(at).add(new THREE.Vector3(0, 1.45, 1.8));
        this.aura.scale.set(0.6, 1.5, 1);
        this.root.add(this.aura);
        for (const x of [-1, 1]) box(at, x, 0.45, 1.8, 0.45, 0.9, 0.6, stone);
      } else if (def.kind === 'vista') {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.06, 5, 18), stone);
        ring.rotation.x = Math.PI / 2;
        ring.position.copy(this.nodes[2]);
        ring.position.y += 0.09;
        this.root.add(ring);
      }
    } else {
      // Torn awning, bedrolls, medicine chest and a cargo cart: small readable silhouettes.
      box(at, -2, 0.3, -1, 1.6, 0.55, 1.1, wood);
      box(at, 2, 0.08, -2, 1, 0.12, 2, color);
      box(at, 3, 0.08, -2, 1, 0.12, 2, color);
      for (const x of [-3, 3]) box(at, x, 1.05, 2, 0.13, 2.1, 0.13, wood);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1, 4), color);
      roof.rotation.y = Math.PI / 4;
      roof.position.copy(at).add(new THREE.Vector3(0, 2.4, 2));
      roof.scale.z = 0.65;
      this.root.add(roof);
      if (def.kind === 'checkpoint') {
        box(at, 0, 0.6, -5, 5, 0.18, 0.18, wood);
        box(at, 0, 1.3, -5, 0.65, 0.8, 0.06, color);
      } else {
        this.cart = new THREE.Group();
        this.cart.name = 'FieldSupplyCart';
        this.root.add(this.cart);
        this.cart.add(box(at, 3, 0.8, 3, 2, 0.35, 1.4, wood));
        for (const x of [2, 4]) {
          const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.08, 5, 12), wood);
          wheel.rotation.y = Math.PI / 2;
          wheel.position.set(at.x + x, at.y + 0.5, at.z + 3);
          this.cart.add(wheel);
        }
        this.cart.visible = !(initiallyDone && def.kind === 'convoy');
      }
    }
    scene.add(this.root);
    this.ready = ['refugees', 'checkpoint', 'convoy'].includes(def.kind) && !(initiallyDone && def.kind === 'convoy') ? this.loadPerson(color.color.getHex()) : Promise.resolve();
  }
  private async loadPerson(cloth: number) {
    const b = await buildCharacter({ body: 'female', outfit: 'peasant', hair: 'buns', hairColor: 0x593e31, skin: 0xb68464, linen: 0xcbbd9a, cloth, height: 1.69 }, [
      'idle',
      'talk',
      'walk',
    ]);
    if (this.disposed) return;
    this.person = b;
    b.root.position.copy(this.at).add(new THREE.Vector3(1, 0, 0));
    this.root.add(b.root);
    const actions = (b.mixer as unknown as { _actions: THREE.AnimationAction[] })._actions;
    this.walk = actions.find((a) => a.getClip().name === 'walk');
    actions.find((a) => a.getClip().name === 'idle')?.play();
  }
  update(dt: number, step: number, done: boolean) {
    if (done && this.def.kind === 'convoy' && !this.initiallyDone) {
      if (this.person && this.walk && !this.walk.isRunning()) {
        this.person.mixer.stopAllAction();
        this.walk.reset().play();
      }
      this.depart = Math.min(1, this.depart + dt / 14);
      const x = this.at.x + this.depart * 25,
        z = this.at.z - this.depart * 6;
      if (this.cart) {
        this.cart.position.set(x - this.at.x, heightAt(x, z) - this.at.y, z - this.at.z);
        this.cart.visible = this.depart < 1;
      }
      if (this.person) {
        this.person.root.position.set(x, heightAt(x, z), z);
        this.person.root.rotation.y = Math.atan2(25, -6);
        this.person.root.visible = this.depart < 1;
      }
    }
    this.person?.mixer.update(dt);
    if (this.aura) {
      this.aura.visible = !done;
      this.aura.rotation.z += dt * 0.13;
    }
    this.lamps.forEach((m, i) => {
      m.visible = !done && i >= step;
    });
  }
  dispose() {
    this.disposed = true;
    this.scene.remove(this.root);
    // Character meshes and shared world materials belong to their asset caches.
    for (const child of [...this.root.children])
      if (child !== this.person?.root)
        child.traverse((o) => {
          if (o instanceof THREE.Mesh) o.geometry.dispose();
        });
    this.owned.forEach((m) => m.dispose());
  }
}
