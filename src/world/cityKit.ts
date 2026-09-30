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

// ---- ships ---------------------------------------------------------------------------
//
// A ship is built as geometry in its own frame (bow toward +z, waterline near
// y = 0.3) and merged into a handful of meshes: the hull and all the timber
// and iron (vertex-coloured, one shared material), the sails and flags
// (double-sided), the lanterns (glowing) and the rigging (lines). A harbour
// full of ships costs a few draws each, not a hundred.

type ShipKind = 'fishing' | 'sloop' | 'merchant' | 'galleon' | 'naval' | 'expedition';

let shipMats: { solid: THREE.MeshStandardMaterial; cloth: THREE.MeshStandardMaterial; glow: THREE.MeshStandardMaterial; rope: THREE.LineBasicMaterial } | null = null;
const shipMaterials = () =>
  (shipMats ??= {
    solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.05 }),
    cloth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }),
    glow: new THREE.MeshStandardMaterial({ color: 0xffd58a, emissive: 0xffa640, emissiveIntensity: 1.2 }),
    rope: new THREE.LineBasicMaterial({ color: 0x3a2a1a }),
  });

/** Collects coloured pieces for one of the ship's merged meshes. */
class ShipPart {
  readonly geos: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, m?: THREE.Matrix4) {
    const geo = (g.index ? g.toNonIndexed() : g).clone();
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') geo.deleteAttribute(k);
    if (m) geo.applyMatrix4(m);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.color) {
      const c = new THREE.Color(color);
      const n = geo.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    this.geos.push(geo);
  }
  mesh(mat: THREE.Material) {
    if (!this.geos.length) return null;
    const merged = mergeGeometries(this.geos, false);
    for (const g of this.geos) g.dispose();
    if (!merged) return null;
    merged.computeBoundingSphere();
    return new THREE.Mesh(merged, mat);
  }
}

const M4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

/** A docked ship of one of the Grand Ocean's six types. */
export function buildShip(kind: ShipKind, hullColor = 0x5a3a24, trim = 0xc9a25a) {
  const g = new THREE.Group();
  const L = { fishing: 7, sloop: 12, merchant: 18, galleon: 26, naval: 22, expedition: 16 }[kind];
  const B = L * (kind === 'fishing' ? 0.34 : 0.3), D = L * 0.16;
  const solid = new ShipPart(), cloth = new ShipPart(), glow = new ShipPart();
  const rope: THREE.Vector3[] = [];
  // Hulls are painted: lift dark wood so it reads warm on bright water.
  const hullC = new THREE.Color(hullColor).multiplyScalar(2.3);
  const castleC = new THREE.Color(0x9a6a3e);
  const trimC = new THREE.Color(trim);
  const woodC = new THREE.Color(0x8a5a32), deckC = new THREE.Color(0xb08a58), ironC = new THREE.Color(0x2c2c30);
  const big = kind === 'merchant' || kind === 'galleon' || kind === 'naval' || kind === 'expedition';

  // ---- the hull: stations along the length, each a rounded section ----------------
  // u: 0 stern .. 1 bow. The sheer (deck edge) sweeps up toward bow and stern.
  const halfBeam = (u: number) => (u < 0.2 ? 0.8 + (u / 0.2) * 0.2 : u > 0.62 ? Math.cos(((u - 0.62) / 0.38) * Math.PI * 0.5) * 0.98 + 0.02 : 1) * (B / 2);
  const sheer = (u: number) => D * (1 + (u < 0.25 ? Math.pow(1 - u / 0.25, 2) * (big ? 0.55 : 0.3) : 0) + (u > 0.7 ? Math.pow((u - 0.7) / 0.3, 2) * 0.75 : 0));
  const keel = (u: number) => -D * (0.55 + 0.45 * Math.sin(Math.min(1, u * 1.15) * Math.PI));
  const NZ = 32, NS = 30;
  const pos: number[] = [], col: number[] = [];
  const colorAt = (y: number, s: number) => {
    // Bottom paint below the waterline, a dark wale, the hull colour with plank
    // seams, and the painted trim under the rail.
    const top = s;
    if (y < 0.28) return new THREE.Color(0x7a3222);
    if (y < 0.28 + D * 0.06) return new THREE.Color(0x2a221c);
    if (y > top - D * 0.16) return trimC.clone();
    if (y > top - D * 0.22) return new THREE.Color(0x2a221c);
    const seam = Math.abs(((y * 3.2) % 1) - 0.5) < 0.06 ? 0.86 : 1;
    return hullC.clone().multiplyScalar(seam);
  };
  const ring: THREE.Vector3[][] = [];
  for (let i = 0; i <= NZ; i++) {
    const u = i / NZ;
    const z = -L / 2 + u * L;
    const hb = halfBeam(u), sh = sheer(u), kl = keel(u);
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= NS; k++) {
      const th = (k / NS) * Math.PI;
      const s = Math.sin(th);
      // Tumblehome above the bilge, a full round bilge, a sharp keel line.
      const x = -Math.cos(th) * hb * (1 - 0.08 * Math.pow(Math.cos(th), 8));
      const y = sh - (sh - kl) * Math.pow(s, 1.35);
      pts.push(new THREE.Vector3(x, y, z));
    }
    ring.push(pts);
  }
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, sh: number) => {
    for (const p of [a, b, c]) {
      pos.push(p.x, p.y, p.z);
      const cc = colorAt(p.y, sh);
      col.push(cc.r, cc.g, cc.b);
    }
  };
  for (let i = 0; i < NZ; i++) {
    const sh = Math.min(sheer(i / NZ), sheer((i + 1) / NZ));
    for (let k = 0; k < NS; k++) {
      const a = ring[i][k], b = ring[i + 1][k], c = ring[i + 1][k + 1], d = ring[i][k + 1];
      tri(a, c, b, sh);
      tri(a, d, c, sh);
    }
  }
  // The transom (flat stern) closes the back.
  const st = ring[0];
  for (let k = 1; k < NS; k++) tri(st[0], st[k], st[k + 1], sheer(0));
  const hullGeo = new THREE.BufferGeometry();
  hullGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hullGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  hullGeo.computeVertexNormals();
  solid.add(hullGeo, 0xffffff);
  // The keel and the rudder.
  solid.add(new THREE.BoxGeometry(0.16, D * 0.3, L * 0.86), woodC.clone().multiplyScalar(0.6), M4(0, keel(0.5) - D * 0.1, 0));
  solid.add(new THREE.BoxGeometry(0.12, D * 1.3, L * 0.07), woodC.clone().multiplyScalar(0.7), M4(0, D * 0.2, -L / 2 - L * 0.03));

  // ---- decks, rails and castles ------------------------------------------------------
  const deckY = D * 0.95;
  solid.add(new THREE.BoxGeometry(B * 0.9, 0.1, L * 0.78), deckC, M4(0, deckY, L * 0.02));
  for (let i = 0; i < NZ; i++) {
    const u0 = i / NZ, u1 = (i + 1) / NZ;
    for (const s of [-1, 1]) {
      const p0 = new THREE.Vector3(s * halfBeam(u0) * 0.97, sheer(u0) + 0.22, -L / 2 + u0 * L);
      const p1 = new THREE.Vector3(s * halfBeam(u1) * 0.97, sheer(u1) + 0.22, -L / 2 + u1 * L);
      const len = p0.distanceTo(p1);
      const mid = p0.clone().add(p1).multiplyScalar(0.5);
      const m = new THREE.Matrix4().lookAt(p0, p1, new THREE.Vector3(0, 1, 0)).setPosition(mid);
      solid.add(new THREE.BoxGeometry(0.1, 0.12, len + 0.02), trimC, m);
      if (i % 2 === 0) solid.add(new THREE.BoxGeometry(0.07, 0.42, 0.07), woodC, M4(p0.x, p0.y - 0.2, p0.z));
    }
  }
  if (big) {
    // Quarterdeck and stern cabin, with windows and lanterns on the transom.
    const qd = L * 0.22;
    solid.add(new THREE.BoxGeometry(B * 0.86, D * 0.9, qd), castleC, M4(0, deckY + D * 0.45, -L / 2 + qd / 2 + L * 0.03));
    solid.add(new THREE.BoxGeometry(B * 0.88, D * 0.12, qd + 0.04), hullC, M4(0, deckY + D * 0.1, -L / 2 + qd / 2 + L * 0.03));
    solid.add(new THREE.BoxGeometry(B * 0.9, 0.1, qd + 0.1), deckC, M4(0, deckY + D * 0.92, -L / 2 + qd / 2 + L * 0.03));
    solid.add(new THREE.BoxGeometry(B * 0.9, 0.14, 0.1), trimC, M4(0, deckY + D * 1.25, -L / 2 + L * 0.03));
    for (let w = -1; w <= 1; w++) glow.add(new THREE.BoxGeometry(B * 0.14, D * 0.3, 0.06), 0xffffff, M4(w * B * 0.24, deckY + D * 0.5, -L / 2 + L * 0.025));
    // Stern lanterns on posts at the corners of the quarterdeck.
    const lt = deckY + D * 0.92;
    for (const s of [-1, 1]) {
      solid.add(new THREE.BoxGeometry(0.1, 0.9, 0.1), ironC, M4(s * B * 0.38, lt + 0.45, -L / 2 + L * 0.035));
      glow.add(new THREE.BoxGeometry(0.3, 0.42, 0.3), 0xffffff, M4(s * B * 0.38, lt + 1.1, -L / 2 + L * 0.035));
      solid.add(new THREE.ConeGeometry(0.26, 0.24, 4), ironC, M4(s * B * 0.38, lt + 1.43, -L / 2 + L * 0.035, 0, Math.PI / 4, 0));
    }
    if (kind === 'galleon' || kind === 'naval') {
      const fc = L * 0.14;
      solid.add(new THREE.BoxGeometry(B * 0.6, D * 0.7, fc), castleC, M4(0, deckY + D * 0.35, L / 2 - fc / 2 - L * 0.1));
      solid.add(new THREE.BoxGeometry(B * 0.64, 0.12, fc + 0.1), trimC, M4(0, deckY + D * 0.72, L / 2 - fc / 2 - L * 0.1));
    }
  } else if (kind === 'fishing') {
    // An open working boat: thwarts, nets and oars.
    for (const z of [-0.25, 0.1]) solid.add(new THREE.BoxGeometry(B * 0.85, 0.08, 0.3), deckC, M4(0, deckY + 0.25, z * L));
    cloth.add(new THREE.SphereGeometry(0.55, 8, 6), 0x7a8a6a, M4(0.2, deckY + 0.25, -L * 0.32, 0, 0, 0, 1.3, 0.45, 1));
    for (const s of [-1, 1]) solid.add(new THREE.CylinderGeometry(0.03, 0.03, L * 0.5, 5), woodC, M4(s * B * 0.46, deckY + 0.35, 0, Math.PI / 2 - 0.05, 0, s * 0.3));
    glow.add(new THREE.BoxGeometry(0.2, 0.28, 0.2), 0xffffff, M4(0, sheer(1) + 0.3, L / 2 - 0.5));
  } else {
    glow.add(new THREE.BoxGeometry(0.24, 0.34, 0.24), 0xffffff, M4(0, sheer(0) + 0.45, -L / 2 + 0.3));
  }
  if (kind === 'naval') {
    // Gun ports, each with a muzzle.
    for (const sd of [-1, 1]) for (let k = -3; k <= 3; k++) {
      const z = k * L * 0.1;
      const hx = halfBeam(0.5 + z / L) * 1.0;
      solid.add(new THREE.BoxGeometry(0.06, 0.42, 0.52), 0x1a1410, M4(sd * hx, D * 0.62, z));
      solid.add(new THREE.CylinderGeometry(0.1, 0.12, 0.7, 8), ironC, M4(sd * (hx + 0.2), D * 0.62, z, 0, 0, Math.PI / 2));
    }
  }
  // Anchor at the bow, bowsprit and figure.
  const bowY = sheer(0.97);
  solid.add(new THREE.CylinderGeometry(0.05, 0.09, L * 0.32, 6), woodC, M4(0, bowY + 0.25, L / 2 + L * 0.1, Math.PI / 2 - 0.32, 0, 0));
  if (kind !== 'fishing') {
    solid.add(new THREE.BoxGeometry(0.08, 0.8, 0.08), ironC, M4(halfBeam(0.9) + 0.05, D * 0.7, L * 0.38));
    solid.add(new THREE.TorusGeometry(0.25, 0.04, 5, 10, Math.PI), ironC, M4(halfBeam(0.9) + 0.05, D * 0.35, L * 0.38, 0, Math.PI / 2, Math.PI));
  }

  // ---- masts, yards, sails, pennants, rigging ----------------------------------------
  const masts = kind === 'fishing' ? [0.12] : kind === 'sloop' ? [0.08] : kind === 'merchant' || kind === 'expedition' ? [-0.16, 0.2] : [-0.26, 0.04, 0.3];
  const H = L * (kind === 'fishing' ? 0.7 : kind === 'sloop' ? 1.05 : 0.95);
  const sailC = kind === 'naval' ? new THREE.Color(0xf4f0e6) : kind === 'expedition' ? new THREE.Color(0xd8c8a0) : new THREE.Color(0xece0c4);
  const flagC = kind === 'naval' ? 0x2f5f9a : kind === 'expedition' ? 0x8a3f22 : 0xb8402e;
  /** A billowing sail: a segmented sheet pushed forward in the middle, `stripe` across. */
  const sail = (w: number, h: number, m: THREE.Matrix4, belly: number, taper = 0, stripe?: THREE.Color) => {
    const geo = new THREE.PlaneGeometry(w, h, 8, 8);
    const p = geo.attributes.position as THREE.BufferAttribute;
    const c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / w + 0.5, y = p.getY(i) / h + 0.5;
      p.setX(i, p.getX(i) * (1 - taper * (1 - y)));
      p.setZ(i, Math.sin(x * Math.PI) * Math.sin((y * 0.85 + 0.1) * Math.PI) * belly);
      const cc = stripe && y > 0.42 && y < 0.58 ? stripe : sailC;
      const shade = 0.9 + 0.1 * Math.sin(x * Math.PI);
      c.set([cc.r * shade, cc.g * shade, cc.b * shade], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    geo.computeVertexNormals();
    cloth.add(geo, 0xffffff, m);
  };
  const stripe = kind === 'naval' ? new THREE.Color(0x2f5f9a) : kind === 'merchant' ? new THREE.Color(0xb8402e) : undefined;
  for (const mz of masts) {
    const z = mz * L;
    const base = deckY;
    solid.add(new THREE.CylinderGeometry(0.07 + L * 0.004, 0.12 + L * 0.007, H, 8), woodC, M4(0, base + H / 2, z));
    if (big) solid.add(new THREE.CylinderGeometry(B * 0.16, B * 0.12, 0.14, 10), woodC, M4(0, base + H * 0.66, z));
    // Pennant streaming from the masthead.
    const pen = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.22, 0), new THREE.Vector3(0, -0.22, 0), new THREE.Vector3(0, 0, -L * 0.14)]);
    cloth.add(pen, flagC, M4(0, base + H + 0.1, z));
    if (kind === 'fishing') {
      // Lateen: a triangle on a long slanted yard.
      solid.add(new THREE.CylinderGeometry(0.04, 0.04, L * 0.9, 6), woodC, M4(0, base + H * 0.6, z - L * 0.08, 0.95, 0, 0));
      const t = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, H * 0.95, -L * 0.3), new THREE.Vector3(0, H * 0.2, L * 0.22), new THREE.Vector3(0, H * 0.12, -L * 0.34)]);
      t.setAttribute('color', new THREE.Float32BufferAttribute([sailC.r, sailC.g, sailC.b, sailC.r, sailC.g, sailC.b, sailC.r * 0.9, sailC.g * 0.9, sailC.b * 0.9], 3));
      cloth.add(t, 0xffffff, M4(0.12, base, z));
    } else if (kind === 'sloop') {
      // Fore-and-aft: a gaff mainsail and a jib to the bowsprit.
      solid.add(new THREE.CylinderGeometry(0.05, 0.05, L * 0.55, 6), woodC, M4(0, base + 1.1, z - L * 0.27, Math.PI / 2, 0, 0));
      sail(L * 0.5, H * 0.7, M4(0.1, base + 1.2 + H * 0.35, z - L * 0.26, 0, Math.PI / 2, 0), -0.5, 0.25);
      const jib = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, H * 0.92, z + 0.2), new THREE.Vector3(0, bowY + 0.4, L / 2 + L * 0.2), new THREE.Vector3(0, base + 0.9, z + 0.5)]);
      jib.setAttribute('color', new THREE.Float32BufferAttribute([...sailC.toArray(), ...sailC.toArray(), ...sailC.toArray()], 3));
      cloth.add(jib, 0xffffff, M4(0, base, 0));
    } else {
      // Square rig: a course and a topsail on each mast, bellied forward.
      for (const [yy, w, hh] of [[0.3, 1.0, 0.3], [0.62, 0.78, 0.26], ...(kind === 'galleon' ? [[0.86, 0.55, 0.16]] : [])] as [number, number, number][]) {
        const yw = B * 1.7 * w;
        solid.add(new THREE.CylinderGeometry(0.05, 0.05, yw, 6), woodC, M4(0, base + H * (yy + hh), z, 0, 0, Math.PI / 2));
        sail(yw * 0.94, H * hh, M4(0, base + H * (yy + hh / 2), z + 0.15), Math.min(1.1, L * 0.05), 0.08, yy < 0.4 ? stripe : undefined);
      }
    }
    // Shrouds with ratlines, down to the rails either side, and stays fore and aft.
    const top = new THREE.Vector3(0, base + H * 0.95, z);
    for (const s of [-1, 1]) {
      const feet = (big ? [-0.5, 0, 0.5] : [0]).map((dz) => new THREE.Vector3(s * B * 0.47, sheer(0.5 + z / L) + 0.1, z + dz));
      for (const f of feet) rope.push(top, f);
      // Ratlines: the rope ladders sailors climb (big ships).
      if (big) for (let r = 1; r < 7; r++) {
        const k = r / 7;
        rope.push(feet[0].clone().lerp(top, k), feet[2].clone().lerp(top, k));
      }
    }
    rope.push(top, new THREE.Vector3(0, bowY + 0.5, L / 2 + L * 0.18), top, new THREE.Vector3(0, sheer(0) + 0.3, -L / 2 + 0.3));
  }

  const ms = shipMaterials();
  for (const [part, mat, shadow] of [[solid, ms.solid, true], [cloth, ms.cloth, true], [glow, ms.glow, false]] as const) {
    const mesh = part.mesh(mat);
    if (!mesh) continue;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(rope), ms.rope));
  return { group: g, length: L, beam: B, draft: D };
}
