import * as THREE from 'three';
import { heightAt, riverX } from './terrainHeight';
import type { Interactable } from '../dungeon/instance';
import type { WorldMats } from './buildings';

type Def = {
  id: string;
  title: string;
  x: number;
  z: number;
  text: string;
  gold?: number;
  xp?: number;
  item?: string;
  count?: number;
};

export class MicroDiscoveries {
  readonly group = new THREE.Group();
  readonly interactables: Interactable[] = [];
  onSave: (() => void) | null = null;
  private t = 0;
  private fires: { flame: THREE.Mesh; light: THREE.PointLight }[] = [];
  private defs: Def[];

  constructor(
    scene: THREE.Scene,
    private mats: WorldMats,
    private flags: Record<string, boolean | number | string>,
    private give: (id: string, n: number) => void,
    private gold: (n: number) => void,
    private xp: (n: number) => void,
    private toast: (s: string) => void,
  ) {
    this.defs = [
      { id: 'old-oak', title: 'The Old Oak', x: 82, z: 72, text: 'A broad oak shades an old bench. Fresh initials join decades of names carved into the wood.' },
      { id: 'forgotten-cart', title: 'The Forgotten Cart', x: 52, z: 146, text: 'An overturned farm cart has a split wheel and a faded route mark pointing back toward Elder Glen.', gold: 28 },
      { id: 'shepherd-rest', title: 'The Shepherd’s Rest', x: -86, z: 132, text: 'A shepherd’s blanket, kettle and old fire ring mark a favorite stopping place.', item: 'healthPotion', count: 1 },
      { id: 'bee-hollow', title: 'Bee Hollow', x: 112, z: 122, text: 'Three little hives sit beneath flowering clover. The bees hum lazily in the sun.', item: 'manaPotion', count: 1 },
      { id: 'river-steps', title: 'The River Steps', x: riverX(108) - 14, z: 112, text: 'Flat stones cross the shallow bank. Children have painted tiny fish and suns on them.' },
      { id: 'roadside-shrine', title: 'The Roadside Shrine', x: 86, z: -118, text: 'A tiny shrine to the Dawn stands beside the old path. Someone still leaves fresh flowers here.', xp: 35 },
      { id: 'hunter-cache', title: 'The Hunter’s Cache', x: -118, z: 62, text: 'A split log hides a hunter’s little reserve of dried herbs and useful odds and ends.', item: 'wildmint', count: 2 },
      { id: 'quiet-pool', title: 'The Quiet Pool', x: 156, z: -38, text: 'A still pool holds old coins beneath the water where the river slows.', gold: 18 },
    ];
    scene.add(this.group);
    this.group.name = 'ElderGlenMicroDiscoveries';
    for (const d of this.defs) this.build(d);
  }

  private material(color: number, roughness = 0.9) {
    return new THREE.MeshStandardMaterial({ color, roughness });
  }

  private box(parent: THREE.Object3D, mat: THREE.Material, size: [number, number, number], pos: [number, number, number], rot = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    m.position.set(...pos);
    m.rotation.y = rot;
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  private fire(parent: THREE.Object3D) {
    const flameMat = this.material(0xff7722, 0.25);
    flameMat.emissive = new THREE.Color(0xc63b08);
    flameMat.emissiveIntensity = 2;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 7), flameMat);
    flame.position.set(0, 0.35, 0);
    parent.add(flame);
    const light = new THREE.PointLight(0xff9340, 1.4, 7, 2);
    light.position.set(0, 0.8, 0);
    parent.add(light);
    this.fires.push({ flame, light });
  }

  private build(d: Def) {
    const root = new THREE.Group();
    root.position.set(d.x, heightAt(d.x, d.z), d.z);
    this.group.add(root);
    const wood = this.mats.timber;
    const plank = this.mats.planks;
    const stone = this.mats.stone;
    switch (d.id) {
      case 'old-oak':
        this.box(root, wood, [2.3, 0.12, 0.42], [0, 0.55, 1.2]);
        this.box(root, wood, [0.12, 0.5, 0.12], [-0.9, 0.28, 1.2]);
        this.box(root, wood, [0.12, 0.5, 0.12], [0.9, 0.28, 1.2]);
        break;
      case 'forgotten-cart':
        this.box(root, plank, [2.2, 0.32, 1.2], [0, 0.75, 0], 0.2);
        for (const x of [-0.8, 0.8]) {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.12, 14), this.material(0x594431));
          w.rotation.z = Math.PI / 2;
          w.position.set(x, 0.45, -0.05);
          w.castShadow = w.receiveShadow = true;
          root.add(w);
        }
        break;
      case 'shepherd-rest':
        this.fire(root);
        this.box(root, plank, [1.25, 0.1, 1.9], [1, 0.06, 0.25], 0.15);
        this.box(root, wood, [0.12, 0.8, 0.5], [1, 0.4, -0.55]);
        break;
      case 'bee-hollow':
        for (let i = -1; i <= 1; i++) {
          this.box(root, this.material(0xc79a4e, 0.95), [0.65, 0.75, 0.65], [i * 0.9, 0.4, 0], (i - 1) * 0.08);
          this.box(root, stone, [0.12, 0.2, 0.12], [i * 0.9, 0.55, 0.34]);
        }
        break;
      case 'river-steps':
        for (let i = -2; i <= 2; i++) this.box(root, stone, [0.85, 0.22, 0.7], [i * 0.9, 0.1, i % 2 ? 0.35 : -0.1], 0.18);
        break;
      case 'roadside-shrine':
        this.box(root, stone, [1, 1.5, 0.55], [0, 0.75, 0]);
        this.box(root, stone, [0.65, 0.65, 0.3], [0, 1.8, 0]);
        this.box(root, plank, [0.85, 0.08, 0.45], [0, 0.08, 0.42]);
        break;
      case 'hunter-cache':
        this.box(root, wood, [1.8, 0.3, 0.55], [0, 0.25, 0.15], 0.18);
        this.box(root, plank, [0.85, 0.5, 0.65], [0.5, 0.5, 0.1]);
        break;
      case 'quiet-pool': {
        const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.5, 24), stone);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.02;
        root.add(ring);
        const water = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), this.material(0x173542, 0.15));
        water.rotation.x = -Math.PI / 2;
        water.position.y = 0.04;
        root.add(water);
        break;
      }
    }
    this.interactables.push({
      pos: root.position.clone().add(new THREE.Vector3(0, 0.2, 0)),
      radius: 2.5,
      label: () => this.flags[d.id] ? 'Examine ' + d.title : 'Investigate ' + d.title,
      enabled: () => true,
      action: () => {
        if (!this.flags[d.id]) {
          this.flags[d.id] = true;
          if (d.gold) this.gold(d.gold);
          if (d.xp) this.xp(d.xp);
          if (d.item) this.give(d.item, d.count ?? 1);
          this.onSave?.();
          const reward = d.gold ? ' You find ' + d.gold + ' gold.' : d.xp ? ' You gain ' + d.xp + ' XP.' : d.item ? ' You find ' + (d.count ?? 1) + ' ' + d.item + '.' : '';
          this.toast(d.text + reward);
        } else {
          this.toast(d.text);
        }
      },
    });
  }

  update(dt: number) {
    this.t += dt;
    for (let i = 0; i < this.fires.length; i++) {
      const f = this.fires[i];
      f.flame.scale.y = 1 + Math.sin(this.t * 10 + i) * 0.12;
      f.light.intensity = 1.4 + Math.sin(this.t * 9 + i) * 0.15;
    }
  }

  setVisible(v: boolean) {
    this.group.visible = v;
  }
}
