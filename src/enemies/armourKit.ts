import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// The "Old Rusty Gothic Worn Armor" model cut into rigid plates for the
// Living Armour: helm, torso, two arms and two legs. Each part's geometry is
// re-centred on its joint (neck, shoulder, hip) so it can swing from there.

export type PartName = 'helm' | 'torso' | 'armR' | 'armL' | 'legR' | 'legL';

export interface ArmourKit {
  height: number;
  material: THREE.Material;
  parts: Record<PartName, { geometry: THREE.BufferGeometry; pivot: THREE.Vector3 }>;
}

const HEIGHT = 1.9;
let kit: ArmourKit | null = null;
let loading: Promise<ArmourKit | null> | null = null;

export function getArmourKit() {
  return kit;
}

export function loadArmourKit() {
  return (loading ??= (async () => {
    try {
      const g = await new GLTFLoader().loadAsync('/assets/npc/rustyArmour.glb');
      let mesh: THREE.Mesh | null = null;
      g.scene.traverse((o) => {
        if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
      });
      if (!mesh) return null;
      const m = mesh as THREE.Mesh;
      g.scene.updateMatrixWorld(true);
      const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
      const nonIdx = geo.index ? geo.toNonIndexed() : geo;
      nonIdx.computeBoundingBox();
      const bb = nonIdx.boundingBox!;
      const s = HEIGHT / (bb.max.y - bb.min.y);
      const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
      nonIdx.translate(-cx, -bb.min.y, -cz);
      nonIdx.scale(s, s, s);
      const pos = nonIdx.attributes.position as THREE.BufferAttribute;
      const uv = nonIdx.attributes.uv as THREE.BufferAttribute | undefined;
      const nor = nonIdx.attributes.normal as THREE.BufferAttribute | undefined;
      const H = HEIGHT;
      const pivots: Record<PartName, THREE.Vector3> = {
        helm: new THREE.Vector3(0, H * 0.83, 0),
        torso: new THREE.Vector3(0, H * 0.62, 0),
        armR: new THREE.Vector3(-H * 0.14, H * 0.79, 0),
        armL: new THREE.Vector3(H * 0.14, H * 0.79, 0),
        legR: new THREE.Vector3(-H * 0.06, H * 0.47, 0),
        legL: new THREE.Vector3(H * 0.06, H * 0.47, 0),
      };
      const buckets: Record<PartName, number[]> = { helm: [], torso: [], armR: [], armL: [], legR: [], legL: [] };
      const v = new THREE.Vector3();
      for (let t = 0; t < pos.count; t += 3) {
        v.set(0, 0, 0);
        for (let k = 0; k < 3; k++) v.add(new THREE.Vector3().fromBufferAttribute(pos, t + k));
        v.multiplyScalar(1 / 3);
        const h = v.y / H;
        let part: PartName;
        if (h > 0.83) part = 'helm';
        else if (h < 0.46) part = v.x < 0 ? 'legR' : 'legL';
        else if (Math.abs(v.x) > H * 0.125 && h < 0.82) part = v.x < 0 ? 'armR' : 'armL';
        else part = 'torso';
        buckets[part].push(t);
      }
      const parts = {} as ArmourKit['parts'];
      for (const [name, tris] of Object.entries(buckets) as [PartName, number[]][]) {
        const p = new Float32Array(tris.length * 9);
        const u = uv ? new Float32Array(tris.length * 6) : null;
        const n = nor ? new Float32Array(tris.length * 9) : null;
        const piv = pivots[name];
        tris.forEach((t, i) => {
          for (let k = 0; k < 3; k++) {
            p[i * 9 + k * 3] = pos.getX(t + k) - piv.x;
            p[i * 9 + k * 3 + 1] = pos.getY(t + k) - piv.y;
            p[i * 9 + k * 3 + 2] = pos.getZ(t + k) - piv.z;
            if (u) (u[i * 6 + k * 2] = uv!.getX(t + k)), (u[i * 6 + k * 2 + 1] = uv!.getY(t + k));
            if (n) (n[i * 9 + k * 3] = nor!.getX(t + k)), (n[i * 9 + k * 3 + 1] = nor!.getY(t + k)), (n[i * 9 + k * 3 + 2] = nor!.getZ(t + k));
          }
        });
        const pg = new THREE.BufferGeometry();
        pg.setAttribute('position', new THREE.BufferAttribute(p, 3));
        if (u) pg.setAttribute('uv', new THREE.BufferAttribute(u, 2));
        if (n) pg.setAttribute('normal', new THREE.BufferAttribute(n, 3));
        else pg.computeVertexNormals();
        pg.computeBoundingSphere();
        parts[name] = { geometry: pg, pivot: piv };
      }
      kit = { height: H, material: m.material as THREE.Material, parts };
      return kit;
    } catch (e) {
      console.warn('armour kit failed', e);
      return null;
    }
  })());
}
