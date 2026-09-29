import * as THREE from 'three';
import { compressedGltf } from '../core/gltf';
import { heightAt, riverX, roadDist, TOWN_R, WORLD_SIZE, CRYPT } from './terrain';
import { fbm, mulberry32, smoothstep } from '../core/math';

type Kind = 'tree' | 'pine' | 'fern' | 'flower' | 'mushroom' | 'grass';

interface AssetSpec {
  file: string;
  kind: Kind;
  targetHeight: number;
  variants: number;
}

interface PrototypeMesh {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  local: THREE.Matrix4;
  castShadow: boolean;
  receiveShadow: boolean;
}

interface Prototype {
  spec: AssetSpec;
  meshes: PrototypeMesh[];
  height: number;
}

interface Instance {
  prototype: number;
  pos: THREE.Vector3;
  rot: number;
  scale: number;
  hidden: boolean;
}

interface DrawGroup {
  mesh: THREE.InstancedMesh;
  prototype: number;
  local: THREE.Matrix4;
  count: number;
}

const ASSETS: AssetSpec[] = [
  { file: 'CommonTree_1.glb', kind: 'tree', targetHeight: 13, variants: 1 },
  { file: 'CommonTree_2.glb', kind: 'tree', targetHeight: 16, variants: 1 },
  { file: 'CommonTree_3.glb', kind: 'tree', targetHeight: 12, variants: 1 },
  { file: 'CommonTree_4.glb', kind: 'tree', targetHeight: 18, variants: 1 },
  { file: 'CommonTree_5.glb', kind: 'tree', targetHeight: 14, variants: 1 },
  { file: 'Pine_1.glb', kind: 'pine', targetHeight: 17, variants: 1 },
  { file: 'Pine_2.glb', kind: 'pine', targetHeight: 21, variants: 1 },
  { file: 'Pine_4.glb', kind: 'pine', targetHeight: 18, variants: 1 },
  { file: 'Pine_5.glb', kind: 'pine', targetHeight: 15, variants: 1 },
  { file: 'Fern_1.glb', kind: 'fern', targetHeight: 0.9, variants: 1 },
  { file: 'Flower_3_Group.glb', kind: 'flower', targetHeight: 0.8, variants: 1 },
  { file: 'Mushroom_Common.glb', kind: 'mushroom', targetHeight: 0.55, variants: 1 },
];

const TREE_COUNT = 340;
const UNDERSTORY_COUNT = 620;
const FAR_TREE_DISTANCE = 850;
const UNDERSTORY_DISTANCE = 110;

function meshLocalMatrices(root: THREE.Object3D): PrototypeMesh[] {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const out: PrototypeMesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const local = inv.clone().multiply(mesh.matrixWorld);
    const name = mesh.name.toLowerCase();
    const foliage = /leaf|foliage|flower|grass|fern|needle|canopy/.test(name);
    out.push({
      geometry: mesh.geometry,
      material: mesh.material,
      local,
      castShadow: !foliage,
      receiveShadow: true,
    });
  });
  return out;
}

function modelHeight(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  return Math.max(0.01, box.max.y - box.min.y);
}

export class StylizedNature {
  private readonly loader = compressedGltf;
  private readonly prototypes: Prototype[] = [];
  private readonly instances: Instance[] = [];
  private readonly groups: DrawGroup[] = [];
  private readonly scratchMatrix = new THREE.Matrix4();
  private readonly scratchQuat = new THREE.Quaternion();
  private readonly scratchScale = new THREE.Vector3();
  private readonly center = new THREE.Vector3();
  private loadedAny = false;
  private visible = true;
  private refreshT = 0;

  readonly ready: Promise<void>;

  /** `town`: extra tree and flower spots chosen by the village layout. */
  constructor(private readonly scene: THREE.Scene, private readonly town?: { treeSpots: THREE.Vector3[]; flowerSpots: THREE.Vector3[] }) {
    this.ready = this.load();
  }

  get loaded() {
    return this.loadedAny;
  }

  private async load() {
    const loaded: { spec: AssetSpec; root: THREE.Object3D }[] = [];
    for (const spec of ASSETS) {
      try {
        const gltf = await this.loader.loadAsync('/assets/vendor/stylized/' + spec.file);
        loaded.push({ spec, root: gltf.scene });
      } catch (error) {
        console.warn('[visual-assets] missing', spec.file, error);
      }
    }

    if (!loaded.some(({ spec }) => spec.kind === 'tree')) {
      this.visible = false;
      return;
    }

    for (const item of loaded) {
      const meshes = meshLocalMatrices(item.root);
      if (!meshes.length) continue;
      this.prototypes.push({
        spec: item.spec,
        meshes,
        height: modelHeight(item.root),
      });
    }

    this.placeTrees();
    this.placeUnderstory();
    this.placeTown();

    const instanceCounts = new Map<number, number>();
    for (const inst of this.instances) {
      instanceCounts.set(inst.prototype, (instanceCounts.get(inst.prototype) ?? 0) + 1);
    }

    for (const [pi, prototype] of this.prototypes.entries()) {
      const capacity = instanceCounts.get(pi) ?? 0;
      if (!capacity) continue;
      for (const part of prototype.meshes) {
        const mat = Array.isArray(part.material)
          ? part.material.map((m) => m.clone())
          : (part.material as THREE.Material).clone();
        const mesh = new THREE.InstancedMesh(part.geometry, mat, capacity);
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.castShadow = part.castShadow;
        mesh.receiveShadow = part.receiveShadow;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(mesh);
        this.groups.push({ mesh, prototype: pi, local: part.local, count: 0 });
      }
    }

    this.loadedAny = true;
    this.rebuildInstances(this.center);
  }

  private prototypeIndices(kind: Kind) {
    const list: number[] = [];
    for (let i = 0; i < this.prototypes.length; i++) {
      if (this.prototypes[i].spec.kind === kind) list.push(i);
    }
    return list;
  }

  private choose(list: number[], rnd: () => number) {
    return list[Math.floor(rnd() * list.length)] ?? -1;
  }

  private validNatureSpot(x: number, z: number) {
    const radius = Math.hypot(x, z);
    if (radius < TOWN_R + 8) return false;
    if (roadDist(x, z) < 5.5) return false;
    if (Math.abs(x - riverX(z)) < 11) return false;
    if (Math.hypot(x - CRYPT.x, z - CRYPT.y - 12) < 28) return false;
    if (heightAt(x, z) > 58) return false;
    return true;
  }

  private placeTrees() {
    const trees = [...this.prototypeIndices('tree'), ...this.prototypeIndices('pine')];
    if (!trees.length) return;

    const rnd = mulberry32(91173);
    const H = WORLD_SIZE * 0.5 - 35;
    const step = 13;
    let placed = 0;

    for (let z = -H; z < H && placed < TREE_COUNT; z += step) {
      for (let x = -H; x < H && placed < TREE_COUNT; x += step) {
        const px = x + (rnd() - 0.5) * step * 0.9;
        const pz = z + (rnd() - 0.5) * step * 0.9;
        if (!this.validNatureSpot(px, pz)) continue;

        const h = heightAt(px, pz);
        const grove = fbm(px * 0.011 + 8, pz * 0.011 - 4, 4);
        const riverBank = smoothstep(26, 13, Math.abs(px - riverX(pz)));
        const westForest = smoothstep(-70, -190, px);
        const northPines = smoothstep(-120, -265, pz);
        const fieldGap = smoothstep(0.62, 0.78, grove);
        const density = Math.max(
          westForest * (0.32 + grove * 0.8),
          fieldGap * 0.42,
          riverBank * 0.16,
          northPines * 0.28,
        );

        if (rnd() > density * 0.75) continue;

        const usePine = northPines > 0.48 || h > 28 || (rnd() < 0.16 && pz < -40);
        const pine = this.prototypeIndices('pine');
        const tree = this.prototypeIndices('tree');
        const pi = usePine ? this.choose(pine, rnd) : this.choose(tree, rnd);
        if (pi < 0) continue;

        this.instances.push({
          prototype: pi,
          pos: new THREE.Vector3(px, h - 0.05, pz),
          rot: rnd() * Math.PI * 2,
          scale: 0.86 + rnd() * 0.3,
          hidden: false,
        });
        placed++;
      }
    }
  }

  private placeUnderstory() {
    const types = [
      ...this.prototypeIndices('fern'),
      ...this.prototypeIndices('flower'),
      ...this.prototypeIndices('mushroom'),
    ];
    if (!types.length) return;

    const rnd = mulberry32(77231);
    const H = WORLD_SIZE * 0.5 - 25;
    const step = 7;
    let placed = 0;

    for (let z = -H; z < H && placed < UNDERSTORY_COUNT; z += step) {
      for (let x = -H; x < H && placed < UNDERSTORY_COUNT; x += step) {
        const px = x + (rnd() - 0.5) * step;
        const pz = z + (rnd() - 0.5) * step;
        if (!this.validNatureSpot(px, pz)) continue;

        const grove = fbm(px * 0.025, pz * 0.025, 3);
        const grassland = smoothstep(0.3, 0.75, grove);
        if (rnd() > grassland * 0.42) continue;

        const pi = this.choose(types, rnd);
        if (pi < 0) continue;

        this.instances.push({
          prototype: pi,
          pos: new THREE.Vector3(px, heightAt(px, pz) - 0.02, pz),
          rot: rnd() * Math.PI * 2,
          scale: 0.72 + rnd() * 0.65,
          hidden: false,
        });
        placed++;
      }
    }
  }

  /** Yard and green trees (a little smaller than wild ones) and flowers by walls and fences. */
  private placeTown() {
    if (!this.town) return;
    const rnd = mulberry32(3301);
    const trees = this.prototypeIndices('tree');
    for (const p of this.town.treeSpots) {
      const pi = this.choose(trees, rnd);
      if (pi < 0) break;
      this.instances.push({ prototype: pi, pos: p.clone().setY(p.y - 0.05), rot: rnd() * Math.PI * 2, scale: 0.55 + rnd() * 0.25, hidden: false });
    }
    const small = [...this.prototypeIndices('flower'), ...this.prototypeIndices('flower'), ...this.prototypeIndices('fern')];
    for (const p of this.town.flowerSpots) {
      const pi = this.choose(small, rnd);
      if (pi < 0) break;
      this.instances.push({ prototype: pi, pos: p.clone().setY(p.y - 0.02), rot: rnd() * Math.PI * 2, scale: 0.7 + rnd() * 0.5, hidden: false });
    }
  }

  private rebuildInstances(camera: THREE.Vector3) {
    this.center.copy(camera);
    for (const group of this.groups) {
      group.count = 0;
    }

    for (const inst of this.instances) {
      const distance = Math.hypot(inst.pos.x - camera.x, inst.pos.z - camera.z);
      const proto = this.prototypes[inst.prototype];
      const maxDistance = proto.spec.kind === 'tree' || proto.spec.kind === 'pine'
        ? FAR_TREE_DISTANCE
        : UNDERSTORY_DISTANCE;
      inst.hidden = distance > maxDistance;
      if (inst.hidden) continue;

      const scale = (proto.spec.targetHeight / proto.height) * inst.scale;
      this.scratchQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), inst.rot);
      this.scratchScale.setScalar(scale);
      this.scratchMatrix.compose(inst.pos, this.scratchQuat, this.scratchScale);

      for (const group of this.groups) {
        if (group.prototype !== inst.prototype) continue;
        const matrix = this.scratchMatrix.clone().multiply(group.local);
        group.mesh.setMatrixAt(group.count++, matrix);
      }
    }

    for (const group of this.groups) {
      group.mesh.count = group.count;
      group.mesh.instanceMatrix.needsUpdate = true;
      group.mesh.visible = this.visible;
    }
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    for (const group of this.groups) group.mesh.visible = visible;
  }

  update(dt: number, camera: THREE.Vector3) {
    if (!this.loadedAny) return;
    this.refreshT -= dt;
    if (this.refreshT > 0) return;
    this.refreshT = 0.22;
    this.rebuildInstances(camera);
  }
}
