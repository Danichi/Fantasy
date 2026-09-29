import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// City kit (World Expansion phase 5): static batching for towns built from
// the painted house kit and props, so a city of a few hundred buildings costs
// one draw call per material instead of hundreds; plus the docked ships that
// fill Port Aurelle's harbour until real sailing arrives (phase 11).

/** Collects meshes and merges them per material. */
export class StaticBatch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private tmp = new THREE.Matrix4();

  /** Add every mesh under `obj` (already positioned) in world space. */
  addObject(obj: THREE.Object3D) {
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (mats.length !== 1) return;
      this.add(m.geometry, mats[0], m.matrixWorld);
    });
  }

  add(geo: THREE.BufferGeometry, mat: THREE.Material, matrix: THREE.Matrix4) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(this.tmp.copy(matrix));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g = g.index ? g.toNonIndexed() : g;
    const list = this.parts.get(mat) ?? [];
    list.push(g);
    this.parts.set(mat, list);
  }

  /** Merge into meshes (split into chunks so culling still works across a city). */
  build(scene: THREE.Scene, chunk = 60) {
    const out: THREE.Mesh[] = [];
    for (const [mat, list] of this.parts) {
      // Bucket by rough position so one far district doesn't draw with the near one.
      const buckets = new Map<string, THREE.BufferGeometry[]>();
      for (const g of list) {
        g.computeBoundingBox();
        const c = g.boundingBox!.getCenter(new THREE.Vector3());
        const key = Math.floor(c.x / chunk) + ',' + Math.floor(c.z / chunk);
        const b = buckets.get(key) ?? [];
        b.push(g);
        buckets.set(key, b);
      }
      for (const b of buckets.values()) {
        const merged = mergeGeometries(b, false);
        if (!merged) continue;
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = mesh.receiveShadow = !(mat as THREE.MeshStandardMaterial).transparent;
        scene.add(mesh);
        out.push(mesh);
      }
    }
    this.parts.clear();
    return out;
  }
}

/** A docked ship: hull, deck, masts with furled sails, a few lines of rigging. */
export function buildShip(kind: 'fishing' | 'sloop' | 'merchant' | 'galleon' | 'naval' | 'expedition', hullColor = 0x5a3a24, trim = 0xc9a25a) {
  const g = new THREE.Group();
  const L = { fishing: 7, sloop: 12, merchant: 18, galleon: 26, naval: 22, expedition: 16 }[kind];
  const B = L * 0.3, D = L * 0.16;
  // Hulls are painted: lift the wood so it reads warm, not black, on the water.
  const wood = new THREE.MeshStandardMaterial({ color: new THREE.Color(hullColor).multiplyScalar(1.9), roughness: 0.75 });
  const deckM = new THREE.MeshStandardMaterial({ color: 0xa6804e, roughness: 0.9 });
  const trimM = new THREE.MeshStandardMaterial({ color: trim, roughness: 0.6, metalness: 0.2 });
  const canvas = new THREE.MeshStandardMaterial({ color: 0xece2cc, roughness: 1 });
  // Hull: a lathe-like hull made from a shape swept along its length.
  const shape = new THREE.Shape();
  shape.moveTo(-B / 2, D);
  shape.quadraticCurveTo(-B / 2, -D * 0.2, 0, -D);
  shape.quadraticCurveTo(B / 2, -D * 0.2, B / 2, D);
  shape.lineTo(-B / 2, D);
  const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: L, bevelEnabled: false, steps: 12 });
  // Taper bow and stern.
  const p = hullGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i) / L; // 0 stern .. 1 bow
    const taper = z > 0.7 ? 1 - Math.pow((z - 0.7) / 0.3, 1.6) * 0.92 : z < 0.12 ? 0.82 + z * 1.5 : 1;
    p.setX(i, p.getX(i) * taper);
    const rise = z > 0.75 ? Math.pow((z - 0.75) / 0.25, 2) * D * 0.8 : z < 0.1 ? (0.1 - z) * D * 3 : 0;
    if (p.getY(i) > 0) p.setY(i, p.getY(i) + rise);
  }
  hullGeo.translate(0, 0, -L / 2);
  hullGeo.computeVertexNormals();
  const hull = new THREE.Mesh(hullGeo, wood);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(B * 0.9, 0.12, L * 0.8), deckM);
  deck.position.y = D * 0.95;
  // A painted band along the gunwale.
  const band = new THREE.Mesh(new THREE.BoxGeometry(B * 1.01, D * 0.22, L * 0.84), trimM);
  band.position.y = D * 0.72;
  g.add(hull, deck, band);
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, L * 0.78), trimM);
    r.position.set(s * B * 0.44, D * 1.15, 0);
    g.add(r);
  }
  // Masts and furled sails.
  const masts = kind === 'fishing' ? [0.1] : kind === 'sloop' ? [0.05] : kind === 'merchant' || kind === 'expedition' ? [-0.18, 0.18] : [-0.28, 0.02, 0.3];
  const H = L * (kind === 'fishing' ? 0.8 : 0.95);
  for (const mz of masts) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08 + L * 0.004, 0.12 + L * 0.006, H, 8), wood);
    mast.position.set(0, D + H / 2, mz * L);
    g.add(mast);
    for (const [yy, w] of [[0.45, 1], [0.75, 0.75]] as const) {
      const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, B * 1.6 * w, 6), wood);
      yard.rotation.z = Math.PI / 2;
      yard.position.set(0, D + H * yy, mz * L);
      const furled = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, B * 1.5 * w, 8), canvas);
      furled.rotation.z = Math.PI / 2;
      furled.position.set(0, D + H * yy - 0.18, mz * L + 0.05);
      g.add(yard, furled);
    }
  }
  // Bowsprit and a stern cabin on bigger ships.
  const sprit = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, L * 0.3, 6), wood);
  sprit.rotation.x = Math.PI / 2 - 0.3;
  sprit.position.set(0, D * 1.5, L * 0.55);
  g.add(sprit);
  if (kind === 'naval') {
    // A gun deck: a row of ports with cannon muzzles each side.
    const iron = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.7, roughness: 0.4 });
    for (const sd of [-1, 1]) for (let k = -3; k <= 3; k++) {
      const port = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.5), new THREE.MeshStandardMaterial({ color: 0x1a1410 }));
      port.position.set(sd * B * 0.47, D * 0.55, k * L * 0.1);
      const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.6, 8), iron);
      gun.rotation.z = Math.PI / 2;
      gun.position.set(sd * B * 0.52, D * 0.55, k * L * 0.1);
      g.add(port, gun);
    }
  }
  if (kind === 'merchant' || kind === 'galleon' || kind === 'naval' || kind === 'expedition') {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(B * 0.85, D * 1.2, L * 0.18), wood);
    cabin.position.set(0, D * 1.6, -L * 0.36);
    const band = new THREE.Mesh(new THREE.BoxGeometry(B * 0.88, 0.14, L * 0.19), trimM);
    band.position.set(0, D * 2.2, -L * 0.36);
    g.add(cabin, band);
  }
  // Rigging: lines from mast tops to bow and stern.
  const pts: THREE.Vector3[] = [];
  for (const mz of masts) {
    const top = new THREE.Vector3(0, D + H, mz * L);
    pts.push(top, new THREE.Vector3(0, D * 1.3, L * 0.62), top, new THREE.Vector3(0, D * 1.3, -L * 0.48));
    for (const s of [-1, 1]) pts.push(top, new THREE.Vector3(s * B * 0.46, D * 1.2, mz * L));
  }
  const rig = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x3a2a1a }));
  g.add(rig);
  g.traverse((o) => (o as THREE.Mesh).isMesh && (((o as THREE.Mesh).castShadow = true), ((o as THREE.Mesh).receiveShadow = true)));
  return { group: g, length: L, beam: B, draft: D };
}
