import * as THREE from 'three';
import { mats } from '../materials';
import { buildSword } from '../weaponModels';

// Procedural models for the new weapon families, in the same "grip space" as
// the swords (items/weaponModels.ts): origin in the centre of the fist, +Y
// along the grip toward the business end, +Z the flat of the blade.
//
// userData:
//   bladeBase/bladeTip  the striking part along +Y (melee hit sweeps use it)
//   offGrip             where the second hand holds a two-handed weapon (+Y metres)
//   nock/string         bows and crossbows: where the arrow sits, the string line

/** Metal of each material tier. */
export const METAL = {
  iron: 0x9d9893,
  steel: 0xe2e0dc,
  silversteel: 0xdfe8ff,
} as const;
/** Wood of each tier (oak is the planks the carpenter sells). */
export const WOOD = {
  oak: 0x8a6440,
  ash: 0xc8a878,
  yew: 0xa0522d,
} as const;
export type Metal = keyof typeof METAL;
export type Wood = keyof typeof WOOD;

const woodMats = new Map<number, THREE.MeshStandardMaterial>();
function wood(c: number) {
  let m = woodMats.get(c);
  if (!m) woodMats.set(c, (m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.78, metalness: 0 })));
  return m;
}
const metalMats = new Map<string, THREE.MeshStandardMaterial>();
function metal(c: number, glow = 0) {
  const key = c + ':' + glow;
  let m = metalMats.get(key);
  if (!m) {
    m = (mats().blade as THREE.MeshStandardMaterial).clone();
    m.color.set(c);
    if (glow) {
      // Silversteel: a faint moonlit sheen so it reads at a distance.
      m.emissive.set(0x6f8fc8);
      m.emissiveIntensity = glow;
    }
    metalMats.set(key, m);
  }
  return m;
}
const metalOf = (t: Metal) => metal(METAL[t], t === 'silversteel' ? 0.18 : 0);

function finish(g: THREE.Group, base: number, tip: number, offGrip?: number) {
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  g.userData.bladeBase = base;
  g.userData.bladeTip = tip;
  if (offGrip !== undefined) g.userData.offGrip = offGrip;
  return g;
}

/** A round haft from y0 to y1 with leather wraps at `wraps` (y, length). */
function haft(g: THREE.Group, y0: number, y1: number, r: number, col: number, wraps: [number, number][] = []) {
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, y1 - y0, 9), wood(col));
  shaft.position.y = (y0 + y1) / 2;
  g.add(shaft);
  for (const [y, len] of wraps) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.18, r * 1.18, len, 9), mats().gripLeather);
    w.position.y = y;
    g.add(w);
  }
  return shaft;
}

/** A flat leaf-shaped blade lofted along +Y (spearheads, daggers, glaives). */
function leafBlade(len: number, width: number, thick: number, opts: { belly?: number; curve?: number; single?: boolean } = {}) {
  const S = 16;
  const shape = new THREE.Shape();
  const pts: [number, number][] = [];
  for (let i = 0; i <= S; i++) {
    const t = i / S;
    // Widest a third of the way up (a leaf), tapering to the point.
    const belly = opts.belly ?? 0.3;
    const w = width * (t < belly ? 0.55 + 0.45 * Math.sin((t / belly) * Math.PI / 2) : Math.cos(((t - belly) / (1 - belly)) * Math.PI / 2));
    pts.push([w, t * len]);
  }
  const curve = opts.curve ?? 0;
  shape.moveTo(-pts[0][0] * (opts.single ? 0.25 : 1), 0);
  for (const [w, y] of pts) shape.lineTo(w + curve * (y / len) ** 2, y);
  for (let i = pts.length - 1; i >= 0; i--) shape.lineTo(-pts[i][0] * (opts.single ? 0.25 : 1) + curve * (pts[i][1] / len) ** 2, pts[i][1]);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: true, bevelSize: thick * 0.9, bevelThickness: thick * 0.9, bevelSegments: 1, curveSegments: 4 });
  geo.translate(0, 0, -thick / 2);
  return geo;
}

// ---- spears and polearms ----------------------------------------------------------
export interface SpearSpec {
  metal: Metal;
  wood: Wood;
  /** shaft length behind and in front of the fist */
  back: number;
  front: number;
  head: 'leaf' | 'partisan' | 'glaive';
}

export function buildSpear(s: SpearSpec) {
  const g = new THREE.Group();
  haft(g, -s.back, s.front, 0.017, WOOD[s.wood], [[0, 0.16], [0.5, 0.14]]);
  const m = metalOf(s.metal);
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.12, 8), mats().darkSteel);
  socket.position.y = s.front + 0.04;
  g.add(socket);
  let headLen = 0.32;
  if (s.head === 'leaf') {
    const blade = new THREE.Mesh(leafBlade(0.32, 0.034, 0.006), m);
    blade.position.y = s.front + 0.09;
    g.add(blade);
  } else if (s.head === 'partisan') {
    headLen = 0.4;
    const blade = new THREE.Mesh(leafBlade(0.4, 0.04, 0.007, { belly: 0.15 }), m);
    blade.position.y = s.front + 0.1;
    g.add(blade);
    // Two side flukes.
    for (const side of [-1, 1]) {
      const f = new THREE.Mesh(leafBlade(0.12, 0.016, 0.005), m);
      f.position.set(side * 0.03, s.front + 0.1, 0);
      f.rotation.z = -side * 1.05;
      g.add(f);
    }
  } else {
    headLen = 0.52;
    const blade = new THREE.Mesh(leafBlade(0.52, 0.045, 0.007, { belly: 0.45, curve: 0.05, single: true }), m);
    blade.position.y = s.front + 0.1;
    g.add(blade);
  }
  // Butt cap.
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 8), mats().darkSteel);
  cap.position.y = -s.back - 0.02;
  cap.rotation.x = Math.PI;
  g.add(cap);
  // The hit sweep covers the head and the last span of shaft.
  return finish(g, s.front - 0.45, s.front + 0.1 + headLen, 0.48);
}

// ---- greatswords -----------------------------------------------------------------
export function buildGreatsword(metalTier: Metal, opts: { len?: number; flamberge?: boolean } = {}) {
  const len = opts.len ?? 1.28;
  const g = new THREE.Group();
  const sword = buildSword({
    bladeLen: len, bladeWidth: 0.034, thickness: 0.0055, fullerLen: 0.55, gripLen: 0.3, guardSpan: 0.19,
    guardStyle: opts.flamberge ? 'curved' : 'straight', pommel: 'pear', guardMat: metalTier === 'silversteel' ? 'brass' : 'darkSteel',
    tint: METAL[metalTier], ...(metalTier === 'silversteel' ? { glow: 0x9fc4ff, glowStrength: 0.7 } : {}),
  });
  // The right hand holds just under the guard; the left hand rides the long grip below.
  sword.position.y = -0.08;
  g.add(sword);
  if (opts.flamberge) {
    // Wavy edge: small steel teeth along both edges.
    const tooth = new THREE.ConeGeometry(0.008, 0.035, 3);
    const m = metalOf(metalTier);
    for (let i = 0; i < 12; i++) {
      for (const side of [-1, 1]) {
        const t = new THREE.Mesh(tooth, m);
        t.position.set(side * 0.034 * (1 - 0.25 * (i / 12)), 0.16 + 0.03 + (i / 12) * len * 0.75, 0);
        t.rotation.z = -side * Math.PI / 2;
        g.add(t);
      }
    }
  }
  return finish(g, sword.userData.bladeBase - 0.08, sword.userData.bladeTip - 0.08, -0.16);
}

// ---- axes ----------------------------------------------------------------------------
export function buildAxe(s: { metal: Metal; wood: Wood; two: boolean; bearded?: boolean; double?: boolean }) {
  const g = new THREE.Group();
  const len = s.two ? 0.95 : 0.55;
  haft(g, -0.12, len, s.two ? 0.019 : 0.016, WOOD[s.wood], [[0, 0.14], ...(s.two ? [[-0.0 + 0.42, 0.12] as [number, number]] : [])]);
  const m = metalOf(s.metal);
  const head = new THREE.Shape();
  // The bit faces +X; the poll sits on the haft.
  const W = s.two ? 0.24 : 0.15, H = s.two ? 0.26 : 0.15;
  head.moveTo(0, -0.03);
  head.lineTo(W * 0.45, -0.035);
  if (s.bearded) head.quadraticCurveTo(W * 0.7, -H * 0.2, W, -H * 0.6);
  else head.quadraticCurveTo(W * 0.8, -H * 0.15, W, -H * 0.45);
  head.quadraticCurveTo(W * 1.12, 0, W, H * 0.45);
  head.quadraticCurveTo(W * 0.75, H * 0.12, W * 0.45, 0.035);
  head.lineTo(0, 0.03);
  head.closePath();
  const geo = new THREE.ExtrudeGeometry(head, { depth: 0.012, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.006, bevelSegments: 1, curveSegments: 8 });
  geo.translate(0, 0, -0.006);
  const bit = new THREE.Mesh(geo, m);
  bit.position.y = len - 0.08;
  g.add(bit);
  if (s.double) {
    const bit2 = bit.clone();
    bit2.rotation.y = Math.PI;
    g.add(bit2);
  } else {
    const poll = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.04), mats().darkSteel);
    poll.position.set(-0.02, len - 0.08, 0);
    g.add(poll);
  }
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.09, 8), mats().darkSteel);
  collar.position.y = len - 0.08;
  g.add(collar);
  return finish(g, len - 0.32, len + 0.06, s.two ? 0.4 : undefined);
}

// ---- maces and hammers -----------------------------------------------------------------
export function buildMace(s: { metal: Metal; wood: Wood; two: boolean; head: 'flanged' | 'star' | 'hammer' | 'maul' }) {
  const g = new THREE.Group();
  const len = s.two ? 0.92 : 0.5;
  haft(g, -0.12, len, s.two ? 0.02 : 0.016, WOOD[s.wood], [[0, 0.14], ...(s.two ? [[0.4, 0.12] as [number, number]] : [])]);
  const m = metalOf(s.metal);
  const y = len;
  if (s.head === 'flanged') {
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 8), mats().darkSteel);
    core.position.y = y;
    g.add(core);
    for (let i = 0; i < 6; i++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.13, 0.05), m);
      const a = (i / 6) * Math.PI * 2;
      f.position.set(Math.cos(a) * 0.045, y, Math.sin(a) * 0.045);
      f.rotation.y = -a;
      g.add(f);
    }
  } else if (s.head === 'star') {
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.065, 1), mats().darkSteel);
    ball.position.y = y;
    g.add(ball);
    const spike = new THREE.ConeGeometry(0.014, 0.06, 5);
    const ico = new THREE.IcosahedronGeometry(1, 0).attributes.position;
    const seen = new Set<string>();
    for (let i = 0; i < ico.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(ico, i).normalize();
      const k = v.toArray().map((x) => x.toFixed(2)).join();
      if (seen.has(k)) continue;
      seen.add(k);
      const sp = new THREE.Mesh(spike, m);
      sp.position.copy(v).multiplyScalar(0.075).setY(y + v.y * 0.075);
      sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
      g.add(sp);
    }
  } else {
    const big = s.head === 'maul';
    const W = big ? 0.3 : 0.2, H = big ? 0.13 : 0.09;
    const block = new THREE.Mesh(new THREE.BoxGeometry(W, H, H), m);
    block.position.y = y;
    g.add(block);
    for (const side of [-1, 1]) {
      const face = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.58, H * 0.58, 0.02, 8), mats().darkSteel);
      face.rotation.z = Math.PI / 2;
      face.position.set(side * (W / 2 + 0.01), y, 0);
      g.add(face);
    }
    if (!big) {
      const pick = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.12, 4), m);
      pick.rotation.z = Math.PI / 2;
      pick.position.set(-W / 2 - 0.06, y, 0);
      g.add(pick);
    }
  }
  return finish(g, len - 0.2, len + 0.1, s.two ? 0.38 : undefined);
}

// ---- daggers ------------------------------------------------------------------------------
export function buildDagger(s: { metal: Metal; len: number; style: 'plain' | 'rondel' | 'stiletto' }) {
  const g = new THREE.Group();
  const m = metalOf(s.metal);
  const width = s.style === 'stiletto' ? 0.009 : 0.018;
  const blade = new THREE.Mesh(leafBlade(s.len, width, 0.004, { belly: s.style === 'plain' ? 0.25 : 0.05 }), m);
  blade.position.y = 0.07;
  g.add(blade);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.014, 0.1, 8), mats().gripLeather);
  g.add(grip);
  if (s.style === 'rondel') {
    for (const y of [-0.06, 0.06]) {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 12), mats().darkSteel);
      disc.position.y = y;
      g.add(disc);
    }
  } else {
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.012, 0.016), s.metal === 'silversteel' ? mats().brass : mats().darkSteel);
    guard.position.y = 0.058;
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), mats().darkSteel);
    pommel.position.y = -0.062;
    g.add(guard, pommel);
  }
  return finish(g, 0.07, 0.07 + s.len);
}

// ---- staffs ----------------------------------------------------------------------------------
export function buildStaff(s: { wood: Wood; shod?: Metal; focus?: number }) {
  const g = new THREE.Group();
  haft(g, -0.72, 1.02, 0.019, WOOD[s.wood], [[0, 0.16], [0.55, 0.14]]);
  if (s.shod) {
    for (const y of [-0.72, 1.02]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.1, 8), metalOf(s.shod));
      cap.position.y = y + (y > 0 ? -0.04 : 0.04);
      g.add(cap);
    }
  }
  if (s.focus !== undefined) {
    // A spell focus in a cage of wood at the head.
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), new THREE.MeshStandardMaterial({ color: s.focus, emissive: s.focus, emissiveIntensity: 1.1, roughness: 0.2 }));
    crystal.position.y = 1.1;
    crystal.scale.y = 1.5;
    g.add(crystal);
    for (let i = 0; i < 3; i++) {
      const prong = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.007, 4, 8, Math.PI), wood(WOOD[s.wood]));
      prong.position.y = 1.08;
      prong.rotation.set(0, (i / 3) * Math.PI, Math.PI / 2);
      g.add(prong);
    }
    g.userData.focusTip = 1.1;
  }
  // Both ends strike; the upper half is the one the sweeps track.
  return finish(g, 0.45, 1.06, 0.55);
}

// ---- bows and crossbows --------------------------------------------------------------------
/**
 * A bow held in the left fist: limbs along +Y, the belly toward +Z (away from
 * the archer), the string on the -Z side. `string` is a Line whose middle
 * vertex is pulled back when drawn (setDraw).
 */
export function buildPlayerBow(s: { wood: Wood; len: number; recurve?: boolean; tips?: Metal }) {
  const g = new THREE.Group();
  const H = s.len / 2;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = (i / 24) * 2 - 1;
    const z = (1 - t * t) * 0.08 - (s.recurve ? Math.pow(Math.abs(t), 6) * 0.07 : 0);
    pts.push(new THREE.Vector3(0, t * H, z));
  }
  const limb = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.014, 6), wood(WOOD[s.wood]));
  g.add(limb);
  const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.13, 8), mats().gripLeather);
  wrap.position.z = 0.08;
  g.add(wrap);
  if (s.tips) {
    for (const end of [pts[0], pts[24]]) {
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), metalOf(s.tips));
      tip.position.copy(end);
      g.add(tip);
    }
  }
  const top = pts[24], bot = pts[0];
  const geo = new THREE.BufferGeometry().setFromPoints([top, new THREE.Vector3(0, 0, top.z), bot]);
  const string = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xe8e0c8 }));
  g.add(string);
  // The fist wraps the grip: shift everything so the grip is at the origin.
  for (const c of g.children) c.position.z -= 0.08;
  g.userData.string = string;
  g.userData.restZ = top.z - 0.08;
  g.userData.nock = new THREE.Vector3(0, 0, top.z - 0.08);
  return g;
}

/** Pull the bow string back by `draw` metres (0 = at rest). */
export function setDraw(bow: THREE.Object3D, draw: number) {
  const line = bow.userData.string as THREE.Line | undefined;
  if (!line) return;
  const pos = line.geometry.attributes.position as THREE.BufferAttribute;
  pos.setZ(1, (bow.userData.restZ as number) - draw);
  pos.needsUpdate = true;
}

/** A crossbow held like a hilt: stock along +Y, prod across X at the front. */
export function buildCrossbow(s: { metal: Metal; wood: Wood; heavy?: boolean }) {
  const g = new THREE.Group();
  const L = s.heavy ? 0.78 : 0.66;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, L, 0.07), wood(WOOD[s.wood]));
  stock.position.y = L / 2 - 0.18;
  g.add(stock);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.018, L * 0.7, 0.01), mats().darkSteel);
  rail.position.set(0, L * 0.45 - 0.18, -0.04);
  g.add(rail);
  const span = s.heavy ? 0.34 : 0.28;
  const prodPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = (i / 12) * 2 - 1;
    prodPts.push(new THREE.Vector3(t * span, -Math.abs(t) * 0.06, -0.035));
  }
  const prod = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(prodPts), 20, s.heavy ? 0.013 : 0.01, 5), metalOf(s.metal));
  const front = L - 0.2;
  prod.position.y = front;
  g.add(prod);
  const geo = new THREE.BufferGeometry().setFromPoints([prodPts[0].clone().setY(front - 0.06), new THREE.Vector3(0, front - 0.06, -0.035), prodPts[12].clone().setY(front - 0.06)]);
  const string = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xe8e0c8 }));
  g.add(string);
  if (s.heavy) {
    const stirrup = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.007, 4, 10), mats().darkSteel);
    stirrup.position.y = front + 0.07;
    g.add(stirrup);
  }
  const bolt = buildBolt();
  bolt.position.set(0, front - 0.18, -0.05);
  bolt.rotation.x = -Math.PI / 2;
  g.add(bolt);
  g.userData.loaded = bolt;
  g.userData.string = string;
  g.userData.offGrip = 0.32;
  g.traverse((o) => ((o as THREE.Mesh).isMesh && (o.castShadow = true)));
  return g;
}

// ---- ammunition ----------------------------------------------------------------------------
export type ArrowHead = 'iron' | 'broadhead' | 'fire' | 'frost' | 'bone';
const HEAD_COL: Record<ArrowHead, number> = { iron: 0x6d6a66, broadhead: 0x8a8580, fire: 0xff7a2a, frost: 0x9fd8ff, bone: 0xe8e0d0 };
const FLETCH_COL: Record<ArrowHead, number> = { iron: 0xd8d0c0, broadhead: 0x6a4a32, fire: 0xc0402a, frost: 0x5a8ac8, bone: 0x3a3a3a };

/** An arrow pointing along +Z (nock at the origin). */
export function buildArrowModel(head: ArrowHead = 'iron') {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.78, 5).rotateX(Math.PI / 2), wood(0x8a6a44));
  shaft.position.z = 0.39;
  g.add(shaft);
  const glow = head === 'fire' || head === 'frost';
  const hm = glow ? new THREE.MeshStandardMaterial({ color: HEAD_COL[head], emissive: HEAD_COL[head], emissiveIntensity: 1.2 }) : new THREE.MeshStandardMaterial({ color: HEAD_COL[head], metalness: head === 'bone' ? 0 : 0.8, roughness: 0.45 });
  const tip = new THREE.Mesh(new THREE.ConeGeometry(head === 'broadhead' ? 0.024 : 0.013, 0.07, head === 'broadhead' ? 3 : 4).rotateX(Math.PI / 2), hm);
  tip.position.z = 0.8;
  g.add(tip);
  const fm = new THREE.MeshStandardMaterial({ color: FLETCH_COL[head], side: THREE.DoubleSide, roughness: 0.9 });
  for (let k = 0; k < 3; k++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.022, 0.1), fm);
    f.position.z = 0.07;
    f.rotation.set(Math.PI / 2, 0, (k / 3) * Math.PI * 2);
    f.translateX(0.012);
    g.add(f);
  }
  return g;
}

/** A crossbow bolt pointing along +Z. */
export function buildBolt() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 5).rotateX(Math.PI / 2), wood(0x6b4a32));
  shaft.position.z = 0.18;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.06, 4).rotateX(Math.PI / 2), mats().darkSteel);
  tip.position.z = 0.38;
  const fm = new THREE.MeshStandardMaterial({ color: 0x3a3028, side: THREE.DoubleSide });
  for (let k = 0; k < 2; k++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.06), fm);
    f.position.z = 0.04;
    f.rotation.set(Math.PI / 2, 0, k * Math.PI / 2);
    g.add(f);
  }
  g.add(shaft, tip);
  return g;
}

/** A quiver's worth of arrows, for item icons (a bundle tied with a cord). */
export function buildArrowBundle(head: ArrowHead) {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const a = buildArrowModel(head);
    a.rotation.x = -Math.PI / 2;
    a.position.set(((i % 3) - 1) * 0.02, -0.4, Math.floor(i / 3) * 0.02 - 0.01);
    a.rotation.z = ((i % 3) - 1) * 0.06;
    g.add(a);
  }
  const cord = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.006, 4, 10), mats().leather);
  cord.rotation.x = Math.PI / 2;
  g.add(cord);
  return g;
}

export function buildBoltBundle() {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const b = buildBolt();
    b.rotation.x = -Math.PI / 2;
    b.position.set(((i % 2) - 0.5) * 0.024, -0.18, (Math.floor(i / 2) - 0.5) * 0.024);
    g.add(b);
  }
  return g;
}

// ---- gathering tools ------------------------------------------------------------------------
export function buildPick() {
  const g = new THREE.Group();
  haft(g, -0.1, 0.6, 0.016, WOOD.oak, [[0, 0.12]]);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.022, 0.42, 6), mats().iron);
  head.rotation.z = Math.PI / 2;
  head.position.y = 0.58;
  head.scale.set(1, 1, 0.7);
  for (const side of [-1, 1]) {
    const pt = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.08, 5), mats().iron);
    pt.rotation.z = -side * (Math.PI / 2 + 0.25);
    pt.position.set(side * 0.24, 0.55, 0);
    g.add(pt);
  }
  g.add(head);
  return finish(g, 0.4, 0.66);
}

export function buildHatchet() {
  return buildAxe({ metal: 'iron', wood: 'oak', two: false });
}
