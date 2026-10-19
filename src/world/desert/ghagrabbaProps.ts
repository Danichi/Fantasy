import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Builders for Ghagrabba's street furniture and story props: palms, stalls,
// carts, camels, the Great Well and the bazaar fountain, the seer's tent, the
// dice table, the Sun Disc shrine, the Queen's palanquin, and the landmarks
// out in the dunes (the Glass Spire, star-stones, Amaunet's stelae). Small
// repeated things come back as single geometries for instancing.

export const std = (color: number, roughness = 0.85, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const glow = (color: number, intensity = 1) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.5 });
const cloth = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide });
const M = <T extends THREE.Object3D>(o: T, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  return o;
};
const shadows = (g: THREE.Object3D) => {
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
  });
  return g;
};

export const GOLD = 0xd4a640, TEAL = 0x1f7a7a, SAND = 0xd9b77a, STONE = 0xe0c896, WOOD = 0x6a4a2a;

/** Vertex-coloured copy of a geometry (for merged, single-material props). */
export function tint(g: THREE.BufferGeometry, color: number) {
  const n = g.index ? g.toNonIndexed() : g;
  if (n.getAttribute('uv')) n.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const arr = new Float32Array(n.getAttribute('position').count * 3);
  for (let i = 0; i < arr.length; i += 3) (arr[i] = c.r), (arr[i + 1] = c.g), (arr[i + 2] = c.b);
  n.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return n;
}

// ---- instanced pieces ------------------------------------------------------------------------------

/** A clay water jar (lathe), feet at 0. */
export function jarGeometry() {
  const pts = [[0, 0], [0.16, 0.02], [0.24, 0.18], [0.26, 0.34], [0.2, 0.52], [0.11, 0.6], [0.12, 0.68], [0.14, 0.7]].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, 12);
}

/** A slanted cloth awning sticking out of a wall: origin at the wall, +Z out into the street. */
export function awningGeometry() {
  const g = new THREE.PlaneGeometry(2.6, 1.5, 4, 2);
  const p = g.getAttribute('position');
  // A gentle sag between the poles.
  for (let i = 0; i < p.count; i++) p.setZ(i, -Math.cos((p.getX(i) / 2.6) * Math.PI) * 0.05);
  g.computeVertexNormals();
  g.rotateX(-Math.PI / 2 + 0.38);
  g.translate(0, 3.0, 0.72);
  return g;
}

/** A brazier on a tripod (stand only; the flame is instanced separately), feet at 0. */
export function brazierStandGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const leg = new THREE.CylinderGeometry(0.03, 0.04, 1.1, 5);
    leg.rotateZ(0.22);
    leg.rotateY((k / 3) * Math.PI * 2);
    leg.translate(Math.cos((k / 3) * Math.PI * 2) * 0.12, 0.55, -Math.sin((k / 3) * Math.PI * 2) * 0.12);
    parts.push(leg);
  }
  const bowl = new THREE.CylinderGeometry(0.42, 0.22, 0.28, 12, 1, true);
  bowl.translate(0, 1.14, 0);
  parts.push(bowl);
  const coals = new THREE.CircleGeometry(0.38, 12);
  coals.rotateX(-Math.PI / 2);
  coals.translate(0, 1.2, 0);
  parts.push(coals);
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!;
}

export function flameGeometry() {
  const g = new THREE.ConeGeometry(0.28, 0.8, 7);
  g.translate(0, 1.6, 0);
  return g;
}

/** A hanging lantern (pierced brass), hanging point at the origin. */
export function lanternGeometry() {
  const body = new THREE.CylinderGeometry(0.11, 0.09, 0.26, 8);
  body.translate(0, -0.3, 0);
  const cap = new THREE.ConeGeometry(0.12, 0.12, 8);
  cap.translate(0, -0.12, 0);
  return mergeGeometries([body.toNonIndexed(), cap.toNonIndexed()])!;
}

/** A woven rug lying on the paving. */
export function rugGeometry() {
  const g = new THREE.PlaneGeometry(1.6, 2.4);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.02, 0);
  return g;
}

/** Bunting: a line of little triangular flags, 1 m apart, along +X from 0 to `len`. */
export function buntingGeometry(len: number, colors: number[]) {
  const parts: THREE.BufferGeometry[] = [];
  const n = Math.max(2, Math.floor(len));
  for (let k = 0; k < n; k++) {
    const x = (k + 0.5) * (len / n);
    const sag = -Math.sin((x / len) * Math.PI) * 0.8;
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.22, 0, 0, 0.22, 0, 0, 0, -0.42, 0], 3));
    tri.computeVertexNormals();
    tri.translate(x, sag, 0);
    parts.push(tint(tri, colors[k % colors.length]));
  }
  return mergeGeometries(parts)!;
}

// ---- built props ----------------------------------------------------------------------------------------

/** A date palm with a few clusters of dates. */
export function palm(scale = 1) {
  const g = new THREE.Group();
  const H = 6.8 * scale;
  let x = 0, y = 0;
  for (let k = 0; k < 8; k++) {
    const lean = 0.03 * k;
    const seg = M(new THREE.Mesh(new THREE.CylinderGeometry(0.19 - k * 0.012, 0.23 - k * 0.012, H / 8, 7), std(k % 2 ? 0x8a6a46 : 0x7a5a3a)), x, y + H / 16, 0, 0, 0, -lean);
    g.add(seg);
    x += Math.sin(lean) * (H / 8);
    y += Math.cos(lean) * (H / 8);
  }
  const leafMat = cloth(0x4f8030);
  for (let f = 0; f < 9; f++) {
    const fr = new THREE.PlaneGeometry(0.7, 3.2, 1, 4);
    const p = fr.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const t = (p.getY(i) + 1.6) / 3.2;
      p.setZ(i, -t * t * 1.5);
      p.setX(i, p.getX(i) * (1 - t * 0.7));
    }
    fr.translate(0, 1.6, 0);
    fr.rotateX(-Math.PI / 2 + 0.5);
    fr.rotateY((f / 9) * Math.PI * 2);
    fr.computeVertexNormals();
    g.add(M(new THREE.Mesh(fr, leafMat), x, y, 0));
  }
  const dates = std(0x8a3a1a, 0.5);
  for (let d = 0; d < 4; d++) g.add(M(new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), dates), x + Math.cos(d * 1.7) * 0.32, y - 0.35, Math.sin(d * 1.7) * 0.32));
  return shadows(g);
}

/** A market stall: posts, a striped awning, a counter heaped with goods. */
export function stall(color: number, rnd: () => number, goods = [GOLD, 0xb8402e, 0x1f9a9a, 0xe8dcc0, 0x8a5a2a]) {
  const g = new THREE.Group();
  const wood = std(WOOD);
  for (const [x, z] of [[-1.3, -0.9], [1.3, -0.9], [-1.3, 0.9], [1.3, 0.9]]) g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.4, 6), wood), x, 1.2, z));
  // Stripes: alternate the colour with cream.
  for (let s = 0; s < 5; s++) {
    const strip = M(new THREE.Mesh(new THREE.PlaneGeometry(0.6, 2.3), cloth(s % 2 ? 0xf0e4c8 : color)), -1.2 + s * 0.6, 2.42, 0, -Math.PI / 2 + 0.22);
    g.add(strip);
  }
  g.add(M(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 0.8), wood), 0, 0.45, 0.4));
  for (let k = 0; k < 7; k++) {
    const c = goods[k % goods.length];
    const r = rnd();
    const item = r < 0.4 ? new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), std(c, 0.5)) : r < 0.7 ? new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.3, 8), std(c, 0.4, 0.3)) : new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.22), std(c, 0.9));
    g.add(M(item, -1.05 + k * 0.35, 1.0, 0.35 + (rnd() - 0.5) * 0.3));
  }
  // Sacks of spice at the front.
  for (let s = 0; s < 3; s++) {
    const sack = M(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.5, 8), std(0xc8b088, 0.95)), -0.8 + s * 0.8, 0.25, 1.2);
    const top = M(new THREE.Mesh(new THREE.CircleGeometry(0.21, 8), std([0xc8641e, 0xd8b030, 0x8a2a14][s], 0.9)), -0.8 + s * 0.8, 0.505, 1.2, -Math.PI / 2);
    g.add(sack, top);
  }
  return shadows(g);
}

/** A two-wheeled hand cart with a load of sacks or jars. */
export function cart(rnd: () => number) {
  const g = new THREE.Group();
  const wood = std(0x7a5a36);
  g.add(M(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 2.0), wood), 0, 0.75, 0, 0.08));
  for (const s of [-1, 1]) {
    g.add(M(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 2.0), wood), s * 0.65, 0.95, 0, 0.08));
    const wheel = M(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 14), std(0x5a3a1a)), s * 0.75, 0.45, 0.2, 0, Math.PI / 2);
    g.add(wheel);
    for (let k = 0; k < 4; k++) g.add(M(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.8, 0.04), std(0x5a3a1a)), s * 0.75, 0.45, 0.2, (k / 4) * Math.PI, 0, 0));
    g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 5), wood), s * 0.45, 0.6, 1.6, Math.PI / 2 - 0.35));
  }
  const n = 3 + Math.floor(rnd() * 3);
  for (let k = 0; k < n; k++) {
    const sack = M(new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), std([0xc8b088, 0xb89a6a, 0xd8c8a0][k % 3], 0.95)), (rnd() - 0.5) * 0.7, 1.05, (rnd() - 0.5) * 1.4);
    sack.scale.set(1, 0.7, 1.3);
    g.add(sack);
  }
  return shadows(g);
}

/** A camel (standing, or kneeling with its legs folded). Returns parts for a little idle animation. */
export function camel(kneeling: boolean, color = 0xc49a62, saddle = 0x8a2a2a) {
  const g = new THREE.Group();
  const hide = std(color, 0.95);
  const dark = std(new THREE.Color(color).multiplyScalar(0.7).getHex(), 0.95);
  const lift = kneeling ? 0.55 : 1.45;
  const body = M(new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 10), hide), 0, lift + 0.35, 0);
  body.scale.set(0.85, 0.8, 1.5);
  const hump = M(new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), hide), 0, lift + 0.85, -0.05);
  hump.scale.set(0.9, 0.9, 1.1);
  g.add(body, hump);
  // Neck and head on a pivot so it can bob and chew.
  const neckPivot = new THREE.Group();
  neckPivot.position.set(0, lift + 0.45, 0.75);
  const neck = M(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 1.1, 8), hide), 0, 0.45, 0.25, 0.6);
  const head = new THREE.Group();
  head.position.set(0, 0.95, 0.6);
  const skull = M(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.55), hide), 0, 0, 0.18);
  const jaw = M(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.4), dark), 0, -0.13, 0.22);
  for (const s of [-1, 1]) head.add(M(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 5), dark), s * 0.11, 0.16, -0.02));
  head.add(skull, jaw);
  neckPivot.add(neck, head);
  g.add(neckPivot);
  // Legs.
  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [[-0.3, 0.6], [0.3, 0.6], [-0.3, -0.6], [0.3, -0.6]]) {
    if (kneeling) {
      const fold = M(new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.7, 4, 6), dark), x * 1.1, 0.18, z, Math.PI / 2);
      g.add(fold);
    } else {
      const leg = M(new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 1.25, 4, 6), hide), x, 0.72, z);
      legs.push(leg);
      g.add(leg);
    }
  }
  // A saddle blanket and a tassel.
  const blanket = M(new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.05, 0.9), cloth(saddle)), 0, lift + 0.78, 0.45, 0.12);
  g.add(blanket);
  const tail = M(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.6, 5), dark), 0, lift + 0.25, -0.95, -0.3);
  g.add(tail);
  shadows(g);
  return { group: g, neck: neckPivot, jaw, tail };
}

/** The Great Well of the Court of the Sun: a wide stone drum, a gilded windlass, a bucket on a rope. */
export function greatWell() {
  const g = new THREE.Group();
  const stone = std(STONE, 0.9), gold = std(GOLD, 0.35, 0.8);
  g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.05, 1.0, 20, 1, true), new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.9, side: THREE.DoubleSide })), 0, 0.5, 0));
  g.add(M(new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.14, 6, 24), stone), 0, 1.0, 0, Math.PI / 2));
  const dark = M(new THREE.Mesh(new THREE.CircleGeometry(1.85, 20), new THREE.MeshBasicMaterial({ color: 0x0a0806 })), 0, 0.35, 0, -Math.PI / 2);
  g.add(dark);
  for (const s of [-1, 1]) {
    g.add(M(new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.6, 0.22), std(0x7a5a36)), s * 1.7, 1.3, 0));
    g.add(M(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 4), gold), s * 1.7, 2.75, 0, 0, Math.PI / 4));
  }
  g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 8), std(0x6a4a2a)), 0, 2.2, 0, 0, 0, Math.PI / 2));
  g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.6, 4), std(0xb89a6a)), 0, 1.4, 0));
  const bucket = M(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.3, 10), std(0x5a3a1a)), 0, 0.6, 0);
  g.add(bucket);
  // The Sunwheel inlaid on the rim.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    g.add(M(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.05, 0.12), gold), Math.cos(a) * 1.95, 1.12, Math.sin(a) * 1.95, 0, -a));
  }
  return { group: shadows(g), bucket };
}

/** The bazaar fountain: a stepped basin and a gilded spout. Water arcs are particles. */
export function fountain() {
  const g = new THREE.Group();
  const stone = std(STONE, 0.9);
  g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.6, 24, 1, true), new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.9, side: THREE.DoubleSide })), 0, 0.3, 0));
  g.add(M(new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.12, 6, 28), stone), 0, 0.6, 0, Math.PI / 2));
  const water = M(new THREE.Mesh(new THREE.CircleGeometry(2.4, 24), new THREE.MeshStandardMaterial({ color: 0x2a7a8a, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.85 })), 0, 0.48, 0, -Math.PI / 2);
  g.add(water);
  g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.4, 12), stone), 0, 0.7, 0));
  g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.3, 0.25, 16), std(GOLD, 0.35, 0.8)), 0, 1.5, 0));
  g.add(M(new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), std(GOLD, 0.3, 0.85)), 0, 1.75, 0));
  return { group: shadows(g), water };
}

/** The seer's tent: purple cloth on poles, a low table and a crystal. */
export function seerTent() {
  const g = new THREE.Group();
  const tent = M(new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.8, 8, 1, true), cloth(0x4a1a5a)), 0, 1.9, 0);
  g.add(tent);
  g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 5), std(WOOD)), 0, 1.7, 0));
  // A flap tied open toward +Z.
  g.add(M(new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.0), cloth(0x6a2a7a)), 0.9, 1.2, 1.7, 0, 0.8));
  g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.45, 12), std(0x4a2a1a)), 0, 0.22, 0.9));
  g.add(M(new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshStandardMaterial({ color: 0xc8b0ff, emissive: 0x8a6aff, emissiveIntensity: 0.8, roughness: 0.05, transparent: true, opacity: 0.85 })), 0, 0.62, 0.9));
  for (let k = 0; k < 5; k++) g.add(M(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.01, 0.08), std(0xe8dcc0)), -0.25 + k * 0.12, 0.46, 1.1, 0, k * 0.3));
  return shadows(g);
}

/** A low dice table with two stools and a cup. */
export function diceTable() {
  const g = new THREE.Group();
  g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.55, 0.55, 12), std(0x6a4a2a)), 0, 0.27, 0));
  g.add(M(new THREE.Mesh(new THREE.CircleGeometry(0.5, 12), std(0x2a5a3a, 0.95)), 0, 0.555, 0, -Math.PI / 2));
  for (const s of [-1, 1]) g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.42, 8), std(0x7a5a36)), s * 0.95, 0.21, 0));
  g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.12, 8), std(0x5a3a1a)), 0.2, 0.62, 0.1));
  for (let k = 0; k < 3; k++) g.add(M(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), std(0xf2e8d0, 0.6)), -0.15 + k * 0.08, 0.58, -0.1, 0, k));
  return shadows(g);
}

/** The Sun Disc shrine: a gold disc on a pylon before which the priests hold their rites. */
export function sunShrine() {
  const g = new THREE.Group();
  const stone = std(STONE, 0.85), gold = std(GOLD, 0.3, 0.85);
  g.add(M(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 1.8), stone), 0, 0.15, 0));
  g.add(M(new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 0.5), stone), 0, 1.5, -0.4));
  const disc = M(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 32), gold), 0, 3.2, -0.4, Math.PI / 2);
  g.add(disc);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    g.add(M(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.04), gold), Math.cos(a) * 1.15, 3.2 + Math.sin(a) * 1.15, -0.4, 0, 0, a + Math.PI / 2));
  }
  // Offering bowl and two incense stands.
  g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.2, 0.2, 12), std(0x8a5a2a, 0.5, 0.6)), 0, 0.42, 0.45));
  for (const s of [-1, 1]) g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 1.1, 6), std(0x8a5a2a, 0.5, 0.6)), s * 1.1, 0.85, 0.5));
  return { group: shadows(g), disc };
}

/** The Queen's palanquin: a gilded litter with a teal canopy and carrying poles. */
export function palanquin() {
  const g = new THREE.Group();
  const gold = std(GOLD, 0.35, 0.8), teal = cloth(TEAL);
  g.add(M(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.25, 1.8), gold), 0, 1.0, 0));
  for (const s of [-1, 1]) g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.2, 6), std(0x5a3a1a)), s * 0.75, 1.05, 0, Math.PI / 2));
  for (const [x, z] of [[-0.6, -0.85], [0.6, -0.85], [-0.6, 0.85], [0.6, 0.85]]) g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), gold), x, 1.9, z));
  g.add(M(new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.08, 1.95), teal), 0, 2.72, 0));
  g.add(M(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 8), gold), 0, 2.96, 0));
  for (const s of [-1, 1]) g.add(M(new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2), cloth(0x2a8a8a)), s * 0.66, 2.1, 0, 0, Math.PI / 2));
  g.add(M(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, 0.9), cloth(0x8a2a2a)), 0, 1.25, -0.2));
  return shadows(g);
}

/** Small held things. */
export const held = {
  bell() {
    const g = new THREE.Group();
    g.add(M(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 10, 1, true), new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.8, roughness: 0.3, side: THREE.DoubleSide })), 0, -0.1, 0.05));
    g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.14, 5), std(WOOD)), 0, 0, 0.05));
    return g;
  },
  lantern() {
    const g = new THREE.Group();
    g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.2, 8), glow(0xffb050, 1.6)), 0, -0.2, 0.05));
    g.add(M(new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.08, 8), std(GOLD, 0.4, 0.7)), 0, -0.06, 0.05));
    return g;
  },
  standard(color = TEAL) {
    const g = new THREE.Group();
    g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.6, 5), std(GOLD, 0.4, 0.7)), 0, 0.6, 0.05));
    g.add(M(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.9), cloth(color)), 0.27, 1.5, 0.05));
    g.add(M(new THREE.Mesh(new THREE.CircleGeometry(0.16, 14), std(GOLD, 0.4, 0.7)), 0.27, 1.65, 0.06));
    return g;
  },
  spear() {
    const g = new THREE.Group();
    g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.2, 5), std(WOOD)), 0, 0.5, 0.05));
    g.add(M(new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 5), std(0xc8c8c0, 0.3, 0.8)), 0, 1.7, 0.05));
    return g;
  },
  drum() {
    const g = new THREE.Group();
    g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 16), std(0xe8dcc0, 0.8)), 0.05, -0.05, 0.12, Math.PI / 2));
    g.add(M(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 5, 16), std(WOOD)), 0.05, -0.05, 0.12));
    return g;
  },
  oud() {
    const g = new THREE.Group();
    const b = M(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), std(0x8a5a2a, 0.5)), 0, -0.1, 0.1);
    b.scale.set(1, 1.3, 0.6);
    g.add(b, M(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.03), std(0x3a2414)), 0, 0.2, 0.12, 0.2));
    return g;
  },
  torch() {
    const g = new THREE.Group();
    g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.6, 5), std(WOOD)), 0, 0.1, 0.05));
    g.add(M(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 6), new THREE.MeshBasicMaterial({ color: 0xffa040 })), 0, 0.5, 0.05));
    return g;
  },
};

/** A snake charmer's basket and the cobra in it (the cobra group sways). */
export function cobraBasket() {
  const g = new THREE.Group();
  g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.5, 12), std(0xa8865a, 0.95)), 0, 0.25, 0));
  const lid = M(new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.05, 12), std(0x8a6a3a)), 0.45, 0.03, 0.1);
  g.add(lid);
  const cobra = new THREE.Group();
  cobra.position.y = 0.45;
  const skin = std(0x4a5a2a, 0.6);
  const segs: THREE.Mesh[] = [];
  for (let k = 0; k < 7; k++) {
    const s = M(new THREE.Mesh(new THREE.SphereGeometry(0.07 - k * 0.004, 8, 6), skin), 0, k * 0.1, 0);
    segs.push(s);
    cobra.add(s);
  }
  const hood = M(new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 6), skin), 0, 0.68, 0.02);
  hood.scale.set(1.2, 1.1, 0.35);
  const head = M(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), std(0x3a4a1a, 0.5)), 0, 0.75, 0.07);
  head.scale.set(1, 0.8, 1.4);
  cobra.add(hood, head);
  g.add(cobra);
  return { group: shadows(g), cobra, segs };
}

/** A notice wall: a timber board pinned with papers. */
export function noticeBoard() {
  const g = new THREE.Group();
  for (const s of [-1, 1]) g.add(M(new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.4, 0.14), std(0x5a3a1a)), s * 0.95, 1.2, 0));
  g.add(M(new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.3, 0.08), std(0x8a6a3a)), 0, 1.55, 0));
  g.add(M(new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.1, 0.4), std(0x5a3a1a)), 0, 2.3, 0.1));
  const paper = [0xf0e4c8, 0xe8d8b0, 0xd8c8a0, 0xf2ead0];
  for (let k = 0; k < 7; k++) g.add(M(new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.5), std(paper[k % 4], 1)), -0.75 + (k % 4) * 0.5, 1.8 - Math.floor(k / 4) * 0.55, 0.05, 0, 0, (k % 3 - 1) * 0.08));
  return shadows(g);
}

/** The Glass Spire: a twisted tower of fused lightning glass with a gong at its foot. */
export function glassSpire() {
  const g = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fe8d8, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.78, emissive: 0x2a6a7a, emissiveIntensity: 0.4 });
  for (let k = 0; k < 7; k++) {
    const shard = M(new THREE.Mesh(new THREE.ConeGeometry(1.4 - k * 0.15, 4.2, 5), glass), Math.sin(k * 1.3) * 0.5, 1.8 + k * 2.4, Math.cos(k * 1.3) * 0.5, Math.sin(k) * 0.12, k * 0.7, Math.cos(k) * 0.12);
    g.add(shard);
  }
  const tip = M(new THREE.Mesh(new THREE.OctahedronGeometry(0.7), new THREE.MeshStandardMaterial({ color: 0xcff4ff, emissive: 0x6ad0ff, emissiveIntensity: 1.2, roughness: 0.05 })), 0, 18.5, 0);
  g.add(tip);
  // The storm-gong, hung between two bone posts.
  const gong = new THREE.Group();
  gong.position.set(5, 0, 2);
  for (const s of [-1, 1]) gong.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.6, 6), std(0xe8dcc0, 0.7)), s * 0.9, 1.3, 0));
  gong.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2, 5), std(WOOD)), 0, 2.5, 0, 0, 0, Math.PI / 2));
  const disc = M(new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.06, 24), std(0xb8863a, 0.3, 0.85)), 0, 1.6, 0, Math.PI / 2);
  gong.add(disc);
  g.add(gong);
  return { group: shadows(g), tip, gong: disc };
}

/** A star-stone: a short obelisk cut with three stars that glow after dark. */
export function starStone() {
  const g = new THREE.Group();
  g.add(M(new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.6, 0.8), std(0xc8b088, 0.9)), 0, 1.3, 0));
  g.add(M(new THREE.Mesh(new THREE.ConeGeometry(0.58, 0.6, 4), std(GOLD, 0.4, 0.7)), 0, 2.9, 0, 0, Math.PI / 4));
  const starMat = glow(0x9ac8ff, 0);
  for (let k = 0; k < 3; k++) g.add(M(new THREE.Mesh(new THREE.OctahedronGeometry(0.09), starMat), -0.2 + k * 0.2, 1.7 + (k % 2) * 0.3, 0.41));
  return { group: shadows(g), starMat };
}

/** A half-buried stele of old Amaunet, leaning in the sand. */
export function stele(seed: number) {
  const g = new THREE.Group();
  const slab = M(new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.6, 0.35), std(0xb8a070, 0.95)), 0, 0.8, 0, 0.12, 0, (seed % 3 - 1) * 0.15);
  g.add(slab);
  for (let r = 0; r < 5; r++) g.add(M(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.02), std(0x6a5030)), 0, 1.6 - r * 0.28, 0.2, 0.12, 0, (seed % 3 - 1) * 0.15));
  const drift = M(new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), std(SAND, 1)), 0, -0.2, 0.3);
  drift.scale.set(1.2, 0.4, 0.9);
  g.add(drift);
  return shadows(g);
}

/** A purple-hung tent of the Vizier's diggers. */
export function vizierTent() {
  const g = new THREE.Group();
  const roof = M(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 2.0, 2.2, 4, 1, true), cloth(0x5a2a7a)), 0, 1.6, 0, 0, Math.PI / 4);
  g.add(roof);
  g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.9, 5), std(WOOD)), 0, 1.45, 0));
  return shadows(g);
}

/** A dig shaft: a timber frame, a windlass with its rope down into the dark, spoil heaps. */
export function digShaft() {
  const g = new THREE.Group();
  g.add(M(new THREE.Mesh(new THREE.CircleGeometry(1.3, 16), new THREE.MeshBasicMaterial({ color: 0x050403 })), 0, 0.05, 0, -Math.PI / 2));
  g.add(M(new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.18, 5, 16), std(0x7a5a36)), 0, 0.1, 0, Math.PI / 2));
  for (const s of [-1, 1]) g.add(M(new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.4, 0.16), std(0x6a4a2a)), s * 1.4, 1.2, 0));
  g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 3.0, 8), std(0x5a3a1a)), 0, 2.2, 0, 0, 0, Math.PI / 2));
  g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.2, 4), std(0xb89a6a)), 0.2, 1.1, 0));
  for (let k = 0; k < 3; k++) {
    const heap = M(new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), std(0xa88a5a, 1)), Math.cos(k * 2.1) * 3.2, 0, Math.sin(k * 2.1) * 3.2);
    heap.scale.set(1, 0.5, 1);
    g.add(heap);
  }
  const ban = M(new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.6), cloth(0x5a2a7a)), -2, 2.6, -1.5);
  const pole = M(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.6, 5), std(WOOD)), -2.45, 1.8, -1.5);
  const eye = M(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 14), std(GOLD, 0.4, 0.7)), -2, 2.8, -1.48);
  g.add(ban, pole, eye);
  return shadows(g);
}

/** A bound captive's stake, with cut ropes once freed. */
export function stake() {
  const g = new THREE.Group();
  g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 6), std(0x5a3a1a)), 0, 1.1, -0.35));
  g.add(M(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 4, 10), std(0xb89a6a)), 0, 0.8, -0.3, Math.PI / 2));
  return shadows(g);
}

/** A fallen patrol: a shield in the sand, a broken spear, a torn teal banner. */
export function fallenPatrol() {
  const g = new THREE.Group();
  g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 18), std(TEAL, 0.6)), 0, 0.2, 0, 1.2, 0, 0.3));
  g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 5), std(WOOD)), 1.2, 0.1, 0.5, 0, 0.5, Math.PI / 2 - 0.1));
  g.add(M(new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.2), cloth(TEAL)), -1.0, 0.05, -0.6, -Math.PI / 2 + 0.1, 0, 0.4));
  g.add(M(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 18), std(GOLD, 0.4, 0.7)), 0.4, 0.15, -1.2, 1.4, 0, -0.2));
  return shadows(g);
}

/** A falcon (perched or flying: the wings open). */
export function falcon() {
  const g = new THREE.Group();
  const brown = std(0x6a4a30, 0.8), cream = std(0xe8dcc0, 0.8);
  const body = M(new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), brown), 0, 0.2, 0);
  body.scale.set(0.8, 1.2, 1);
  const chest = M(new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), cream), 0, 0.17, 0.07);
  const head = M(new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), brown), 0, 0.42, 0.04);
  const beak = M(new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.07, 5), std(0xd4a640, 0.5)), 0, 0.4, 0.14, Math.PI / 2);
  const wings: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const w = M(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.2), new THREE.MeshStandardMaterial({ color: 0x5a3a20, side: THREE.DoubleSide, roughness: 0.9 })), s * 0.12, 0.25, -0.02, 0, 0, s * 1.3);
    wings.push(w);
    g.add(w);
  }
  g.add(body, chest, head, beak);
  return { group: shadows(g), wings };
}

/** Broken obelisks and a key-stone for the Sunken Gate's rim. */
export function obelisk(h: number, broken: boolean) {
  const g = new THREE.Group();
  const stone = std(0xc8a87a, 0.9);
  g.add(M(new THREE.Mesh(new THREE.BoxGeometry(1.3, h, 1.3), stone), 0, h / 2, 0));
  if (!broken) g.add(M(new THREE.Mesh(new THREE.ConeGeometry(0.92, 1.2, 4), std(GOLD, 0.4, 0.75)), 0, h + 0.6, 0, 0, Math.PI / 4));
  else g.add(M(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.6, 1.3), stone), 0.2, h + 0.1, 0, 0.3, 0.2, 0.4));
  return shadows(g);
}

/**
 * Bake props into one vertex-coloured mesh (one draw call for a whole square
 * of stalls, carts and tables). Each object should already sit where it goes
 * in world space; emissive parts keep a little of their glow in the colour.
 */
export function bake(objs: THREE.Object3D[], name = 'baked') {
  const parts: THREE.BufferGeometry[] = [];
  for (const root of objs) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.visible) return;
      const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
      const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
      const n = g.index ? g.toNonIndexed() : g;
      for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
      if (!n.getAttribute('normal')) n.computeVertexNormals();
      const c = (mat.color ?? new THREE.Color(0xffffff)).clone();
      if (mat.emissive && mat.emissiveIntensity) c.lerp(mat.emissive, Math.min(0.6, mat.emissiveIntensity * 0.3));
      const arr = new Float32Array(n.getAttribute('position').count * 3);
      for (let i = 0; i < arr.length; i += 3) (arr[i] = c.r), (arr[i + 1] = c.g), (arr[i + 2] = c.b);
      n.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      parts.push(n);
    });
  }
  const mesh = new THREE.Mesh(parts.length ? mergeGeometries(parts)! : new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, side: THREE.DoubleSide }));
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  for (const g of parts) g.dispose();
  return mesh;
}
