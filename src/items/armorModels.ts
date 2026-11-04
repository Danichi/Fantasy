import * as THREE from 'three';
import { mats } from './materials';

// Armour is modelled per limb in a "limb frame": +Y runs down the bone toward
// its child joint, +Z faces the character's front (feet: +Z up; hands: +Z out
// of the back of the hand), +X = Y x Z. Radii are in metres and sized for a
// 1.8 m body; bone lengths come from the loaded rig.

export type ArmorPieceId = 'helm' | 'pauldrons' | 'breastplate' | 'gauntlets' | 'greaves' | 'sabatons' | 'cloak' | 'amulet' | 'belt';

/** The four armour weights, each with its own silhouette. */
export type ArmorWeight = 'robe' | 'leather' | 'mail' | 'plate';
export type HelmShape = 'hood' | 'cap' | 'coif' | 'kettle' | 'great' | 'turban' | 'sou' | 'crested' | 'horned' | 'visor' | 'circlet' | 'mask';

/**
 * How one armour piece looks (items/catalog): its weight, colours and helm.
 * Pieces without a look keep the plain steel-and-wool of the first armour.
 */
export interface ArmorLook {
  weight: ArmorWeight;
  /** the main colour: plate or mail metal, leather, or a robe's cloth */
  base: number;
  /** bands, rivets, edges, buckles */
  trim: number;
  /** tabards, sashes, cloaks, linings */
  cloth: number;
  /** straps */
  strap?: number;
  /** a glow in the metal (star and dusk tiers) */
  glow?: number;
  glowStrength?: number;
  /** how shiny the metal is (0 matte .. 1 mirror) */
  shine?: number;
  helm?: HelmShape;
  /** plume or crest colour */
  crest?: number;
  /** spiked pauldrons and helm */
  spikes?: boolean;
  /** the hem reaches the knees (robes, long hauberks) */
  long?: boolean;
}

export interface LimbFit {
  /** returns a socket in limb space for this bone plus the bone's length */
  limb(bone: string): { socket: THREE.Object3D; len: number } | null;
}

export interface ArmorPart {
  bone: string;
  object: THREE.Object3D;
}

// ---- looks ----------------------------------------------------------------------
let cur: ArmorLook | null = null;
interface LookMats { armor: THREE.Material; darkSteel: THREE.Material; brass: THREE.Material; leather: THREE.Material; cloth: THREE.Material; mail: THREE.Material }
const lookCache = new Map<string, LookMats>();

function weave(color: number, rings: boolean) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const col = new THREE.Color(color);
  const hex = (k: number) => `rgb(${Math.min(255, col.r * 255 * k) | 0},${Math.min(255, col.g * 255 * k) | 0},${Math.min(255, col.b * 255 * k) | 0})`;
  g.fillStyle = hex(rings ? 0.45 : 1);
  g.fillRect(0, 0, 64, 64);
  if (rings) {
    // Riveted links: rows of small rings, each row offset by half a ring.
    g.lineWidth = 1.6;
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      g.strokeStyle = hex(1.25 - ((x + y) % 3) * 0.12);
      g.beginPath();
      g.arc(x * 8 + (y % 2) * 4, y * 8, 3.4, 0, Math.PI * 2);
      g.stroke();
    }
  } else {
    for (let i = 0; i < 900; i++) {
      g.fillStyle = hex(0.8 + Math.random() * 0.4);
      g.globalAlpha = 0.35;
      g.fillRect(Math.random() * 64, Math.random() * 64, 1.5, 1.5);
    }
    g.globalAlpha = 0.18;
    g.fillStyle = hex(0.6);
    for (let i = 0; i < 64; i += 4) g.fillRect(0, i, 64, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rings ? 5 : 3, rings ? 5 : 3);
  return t;
}

/** The materials for the look being built (or the plain armour's). */
function M(): LookMats {
  if (!cur) return { armor: mats().armor, darkSteel: mats().darkSteel, brass: mats().brass, leather: mats().leather, cloth: wool(), mail: mats().armor };
  const L = cur;
  const key = JSON.stringify([L.weight, L.base, L.trim, L.cloth, L.strap, L.glow, L.glowStrength, L.shine]);
  let m = lookCache.get(key);
  if (m) return m;
  const shine = L.shine ?? 0.6;
  // The glow lives in the seams and trim; the plates themselves only catch a little of it.
  const glow = (mat: THREE.MeshStandardMaterial, k = 1) => {
    if (L.glow && k > 0) {
      mat.emissive.set(L.glow);
      mat.emissiveIntensity = (L.glowStrength ?? 0.25) * k;
    }
    return mat;
  };
  const metal = (c: number, k = 1, g = 1) => glow(new THREE.MeshStandardMaterial({ color: c, metalness: 0.55 + 0.35 * shine * k, roughness: 0.75 - 0.5 * shine * k }), g);
  const cloth = new THREE.MeshStandardMaterial({ map: weave(L.cloth, false), roughness: 0.95, side: THREE.DoubleSide });
  const leather = new THREE.MeshStandardMaterial({ color: L.strap ?? 0x5a3a22, roughness: 0.7 });
  const mail = glow(new THREE.MeshStandardMaterial({ map: weave(L.base, true), color: 0xffffff, metalness: 0.8, roughness: 0.5, side: THREE.DoubleSide }), 0);
  const armor = L.weight === 'robe' ? new THREE.MeshStandardMaterial({ map: weave(L.base, false), roughness: 0.95, side: THREE.DoubleSide })
    : L.weight === 'leather' ? new THREE.MeshStandardMaterial({ color: L.base, roughness: 0.62, metalness: 0.05, side: THREE.DoubleSide })
      : L.weight === 'mail' ? mail : metal(L.base, 1, 0);
  const trimGlow = Math.max(1, 0.6 / Math.max(0.05, L.glowStrength ?? 0.6));
  m = { armor, darkSteel: L.weight === 'robe' ? glow(new THREE.MeshStandardMaterial({ color: L.trim, roughness: 0.6, metalness: 0.4 }), trimGlow) : metal(L.trim, 0.8, trimGlow), brass: metal(L.trim, 1, trimGlow), leather, cloth, mail };
  lookCache.set(key, m);
  return m;
}
const W = () => cur?.weight ?? 'plate';

function shadow(o: THREE.Object3D) {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return o;
}

/** Open shell around +Y; theta 0 faces +Z. `arc` < 2PI leaves the back open. */
function shell(rStart: number, rEnd: number, len: number, arc = Math.PI * 2, mat?: THREE.Material, zScale = 1) {
  // CylinderGeometry puts theta 0 on +Z and its first radius at +Y, so pass the
  // end radius first and shift the cylinder to span y = 0 (start) .. len (end).
  const g = new THREE.CylinderGeometry(rEnd, rStart, len, 20, 4, true, -arc / 2, arc);
  g.translate(0, len / 2, 0);
  g.scale(1, 1, zScale);
  return new THREE.Mesh(g, mat ?? M().armor);
}

function rivetRing(r: number, y: number, count: number, arc = Math.PI * 2, zScale = 1) {
  const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0055, 6, 4), M().darkSteel, count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const a = -arc / 2 + (arc * (i + 0.5)) / count;
    m.makeTranslation(Math.sin(a) * r, y, Math.cos(a) * r * zScale);
    inst.setMatrixAt(i, m);
  }
  return inst;
}

// ---- pieces ---------------------------------------------------------------

/** The helm for the look: hoods for robes, caps for leather, coifs for mail, helms for plate. */
function helm(len: number) {
  const shape: HelmShape = cur?.helm ?? (W() === 'robe' ? 'hood' : W() === 'leather' ? 'cap' : W() === 'mail' ? 'coif' : 'kettle');
  const g = new THREE.Group();
  const R = 0.118;
  const cap = (r: number, h: number, mat: THREE.Material, open = 0) => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 0.5;
      pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r * h));
    }
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 32, open / 2, Math.PI * 2 - open), mat);
    m.scale.set(1, 1, 1.14);
    return m;
  };
  switch (shape) {
    case 'kettle': case 'crested': case 'horned':
      return dress(plateHelm(len), len, shape);
    case 'hood': {
      // A cloth hood open at the face, its cowl falling over the shoulders.
      const hood = cap(R * 1.22, 1.3, M().armor, Math.PI * 0.62);
      hood.position.y = -0.02;
      const cowl = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.2, R * 1.75, 0.16, 28, 1, true, Math.PI * 0.32, Math.PI * 1.36), M().armor);
      cowl.scale.z = 1.12;
      cowl.position.y = -0.1;
      const peak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 10), M().armor);
      peak.position.set(0, R * 1.5, -0.05);
      peak.rotation.x = -0.6;
      g.add(hood, cowl, peak);
      break;
    }
    case 'turban': {
      for (let i = 0; i < 4; i++) {
        const t = new THREE.Mesh(new THREE.TorusGeometry(R * (1.04 - i * 0.12), 0.026, 8, 28), M().armor);
        t.rotation.x = Math.PI / 2 + (i % 2 ? 0.12 : -0.1);
        t.scale.set(1, 1.14, 1);
        t.position.y = 0.02 + i * 0.032;
        g.add(t);
      }
      const top = cap(R * 0.8, 1.1, M().armor);
      top.position.y = 0.05;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.016, 0), M().brass);
      gem.position.set(0, 0.07, R * 1.16);
      const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.22), M().cloth);
      tail.position.set(0.05, -0.08, -R * 1.05);
      g.add(top, gem, tail);
      break;
    }
    case 'sou': {
      // A sou'wester: a deep crown and a brim that runs long at the back.
      const crown = cap(R * 1.08, 1.05, M().armor);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.75, R * 1.85, 0.012, 32), M().armor);
      brim.scale.z = 1.1;
      brim.position.set(0, 0.005, -0.025);
      brim.rotation.x = 0.12;
      g.add(crown, brim);
      break;
    }
    case 'cap': {
      const c = cap(R * 1.04, 1.05, M().armor);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.06, R * 1.07, 0.024, 32, 1, true), M().leather);
      band.scale.z = 1.14;
      band.position.y = 0.01;
      g.add(c, band);
      for (const sd of [-1, 1]) {
        const flap = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.07, 0.05), M().armor);
        flap.position.set(sd * R * 1.05, -0.03, 0.01);
        g.add(flap);
      }
      break;
    }
    case 'coif': {
      const c = cap(R * 1.06, 1.2, M().mail, Math.PI * 0.5);
      c.position.y = -0.01;
      const aventail = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.05, R * 1.6, 0.16, 28, 1, true, Math.PI * 0.28, Math.PI * 1.44), M().mail);
      aventail.scale.z = 1.12;
      aventail.position.y = -0.1;
      g.add(c, aventail);
      if (cur?.crest !== undefined || W() === 'mail') {
        // A kettle hat over the coif.
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.45, R * 1.5, 0.012, 28), M().darkSteel);
        brim.scale.z = 1.1;
        brim.position.y = 0.035;
        const crown = cap(R * 1.1, 0.9, M().darkSteel);
        crown.position.y = 0.03;
        g.add(brim, crown);
      }
      break;
    }
    case 'great': case 'visor': case 'mask': {
      // A closed helm: a flat-topped barrel, or a skull cap with a visor; an eye slit across.
      const h = plateHelm(len, false);
      g.add(h);
      if (shape === 'great') {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.12, R * 1.18, 0.26, 28), M().armor);
        barrel.scale.z = 1.14;
        barrel.position.y = 0.02;
        g.add(barrel);
      } else {
        const visor = new THREE.Mesh(new THREE.SphereGeometry(R * 1.12, 24, 10, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.3, Math.PI * 0.45), M().armor);
        visor.scale.z = 1.18;
        visor.position.y = -0.01;
        g.add(visor);
      }
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.012, 0.02), new THREE.MeshBasicMaterial({ color: cur?.glow ?? 0x050505 }));
      slit.position.set(0, 0.02, R * 1.3);
      g.add(slit);
      g.position.y = len * 0.42;
      return dress(g, len, shape, true);
    }
    case 'circlet': {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 1.02, 0.008, 6, 32), M().brass);
      ring.rotation.x = Math.PI / 2;
      ring.scale.set(1, 1.14, 1);
      ring.position.y = 0.04;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.018, 0), M().brass);
      gem.position.set(0, 0.06, R * 1.17);
      g.add(ring, gem);
      break;
    }
  }
  g.position.y = len * 0.42;
  return dress(g, len, shape, true);
}

/** Plumes, horns and spikes on any helm. */
function dress(g: THREE.Group, len: number, shape: HelmShape, placed = false) {
  void len;
  void placed;
  const R = 0.118;
  if (cur?.crest !== undefined || shape === 'crested') {
    const plume = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, R * 2.1), new THREE.MeshStandardMaterial({ color: cur?.crest ?? 0xc02020, roughness: 0.9 }));
    plume.position.set(0, R * 1.5, -0.01);
    g.add(plume);
  }
  if (shape === 'horned') {
    for (const sd of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.16, 8), new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.5 }));
      horn.position.set(sd * R * 1.05, R * 0.9, 0);
      horn.rotation.z = -sd * 0.9;
      g.add(horn);
    }
  }
  if (cur?.spikes) {
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.07, 6), M().darkSteel);
      sp.position.set((i - 2) * 0.035, R * 1.42 - Math.abs(i - 2) * 0.02, -0.02);
      g.add(sp);
    }
  }
  return g;
}

function plateHelm(len: number, placed = true) {
  const g = new THREE.Group();
  const R = 0.118;
  // Ogive skull cap.
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const a = t * Math.PI * 0.5;
    pts.push(new THREE.Vector2(Math.cos(a) * R * (1 - 0.08 * t), Math.sin(a) * R * 1.35 + Math.pow(t, 6) * 0.02));
  }
  const cap = new THREE.Mesh(new THREE.LatheGeometry(pts, 36), M().armor);
  cap.scale.set(1, 1, 1.14);
  // Brow band.
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.006, R + 0.008, 0.03, 36, 1, true), M().darkSteel);
  band.scale.set(1, 1, 1.14);
  band.position.y = 0.012;
  // Nasal guard.
  const nasal = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.1, 0.012), M().armor);
  nasal.position.set(0, -0.035, R * 1.14 + 0.006);
  nasal.rotation.x = -0.12;
  g.add(cap, band, nasal, rivetRing(R + 0.009, 0.012, 16, Math.PI * 2, 1.14));
  // Mail aventail hanging to the shoulders.
  const mail = new THREE.Mesh(
    new THREE.CylinderGeometry(R + 0.004, R + 0.05, 0.12, 30, 1, true, Math.PI * 0.72, Math.PI * 1.56),
    new THREE.MeshStandardMaterial({ color: 0x77777a, metalness: 0.9, roughness: 0.55, side: THREE.DoubleSide }),
  );
  mail.scale.set(1, 1, 1.1);
  mail.position.y = -0.055;
  g.add(mail);
  // Position the band around the brow: limb frame origin is the head joint.
  if (placed) g.position.y = len * 0.42;
  return g;
}

function pauldron(len: number, out: number) {
  const g = new THREE.Group();
  const w = W();
  const R = w === 'robe' ? 0.088 : w === 'plate' && cur ? 0.082 : 0.074;
  // Dome over the shoulder joint.
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 10, 0, Math.PI * 2, 0, Math.PI * (w === 'robe' ? 0.5 : 0.42)), M().armor);
  dome.rotation.x = Math.PI; // pole points up the arm (-Y)
  dome.rotation.z = out * 0.25;
  dome.scale.set(1.08, 1, 1.05);
  dome.position.set(out * 0.012, 0.01, 0);
  g.add(dome);
  // Lames down the upper arm, covering the outer side: three on plate, fewer on lighter armour.
  const lames = w === 'plate' ? 3 : w === 'mail' ? 2 : w === 'leather' ? 1 : 0;
  for (let i = 0; i < lames; i++) {
    const r = R * (0.98 - i * 0.07);
    const lame = shell(r, r * 0.97, 0.034, Math.PI * 1.25);
    lame.position.y = 0.022 + i * 0.03;
    lame.rotation.y = out * Math.PI * 0.5; // centre the arc on the outside
    g.add(lame);
  }
  if (w === 'plate' || w === 'mail') {
    g.add(rivetRing(R * 0.98 + 0.004, 0.04, 7, Math.PI * 1.1));
    g.children[g.children.length - 1].rotation.y = out * Math.PI * 0.5;
  }
  if (cur?.spikes) {
    for (let i = 0; i < 3; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.075, 6), M().darkSteel);
      sp.position.set(out * (0.02 + i * 0.012), -R * 0.55 + i * 0.012, (i - 1) * 0.03);
      sp.rotation.z = out * -1.1;
      g.add(sp);
    }
  }
  if (w === 'robe') {
    // A mantle's fringe.
    const fringe = shell(R * 0.98, R * 1.08, 0.05, Math.PI * 1.4, M().cloth);
    fringe.rotation.y = out * Math.PI * 0.5;
    fringe.position.y = 0.01;
    g.add(fringe);
  }
  void len;
  return g;
}

/** A robe from the chest to the knees (or the ankles), belted at the waist. */
function robeBody(len: number) {
  const g = new THREE.Group();
  const top = len * 0.55 + 0.17, H = cur?.long ? 1.05 : 0.8;
  const geo = new THREE.CylinderGeometry(0.15, 0.27, H, 32, 8, true);
  const pa = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
    const t = (H / 2 - y) / H;
    // Chest swells forward; the hem hangs in soft folds.
    const a = Math.atan2(x, z);
    const fold = Math.sin(a * 9) * 0.01 * t;
    pa.setXYZ(i, x * (1 + fold * 4), y, z * (t < 0.3 ? 0.85 : 0.95) + fold);
  }
  geo.computeVertexNormals();
  const robe = new THREE.Mesh(geo, M().armor);
  robe.position.y = top - H / 2;
  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.016, 6, 28), M().darkSteel);
  sash.rotation.x = Math.PI / 2;
  sash.scale.set(1.08, 0.82, 1);
  sash.position.y = top - 0.36;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.018, 6, 24), M().cloth);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = top + 0.005;
  // A panel down the front in the trim cloth.
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.07, H * 0.85), M().cloth);
  panel.position.set(0, top - H * 0.47, 0.155 + 0.06);
  panel.rotation.x = -0.12;
  g.add(robe, sash, collar, panel);
  return g;
}

function breastplate(len: number) {
  if (W() === 'robe') return robeBody(len);
  const H = 0.36;
  const geo = new THREE.CylinderGeometry(1, 1, H, 40, 16, true);
  const pa = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
    const t = (y + H / 2) / H; // 0 bottom .. 1 top
    const a = Math.atan2(x, z);
    const front = Math.cos(a) > 0;
    // Width tapers at the waist, chest swells forward, flat-ish back.
    const rx = 0.176 + 0.012 * Math.sin(t * Math.PI) - (t < 0.25 ? (0.25 - t) * 0.08 : 0);
    let rz = front ? 0.132 + 0.03 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.85) : 0.118;
    // Medial ridge down the front.
    if (front) rz += 0.012 * Math.max(0, 1 - Math.abs(Math.sin(a)) * 5);
    // Scoop the neck and armholes at the top.
    let yy = y;
    if (t > 0.88) yy -= Math.abs(Math.sin(a)) > 0.8 ? 0.045 * (t - 0.88) / 0.12 : front ? 0.02 * (t - 0.88) / 0.12 * Math.max(0, Math.cos(a)) : 0;
    pa.setXYZ(i, Math.sin(a) * rx, yy, Math.cos(a) * rz);
  }
  geo.computeVertexNormals();
  const mat = M().armor;
  const plate = new THREE.Mesh(geo, mat);
  plate.position.y = -H / 2 + len * 0.55;

  const g = new THREE.Group();
  g.add(plate);
  // Faulds: two flaring lames at the waist.
  for (let i = 0; i < 2; i++) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.175 + i * 0.012, 0.188 + i * 0.012, 0.05, 36, 1, true), mat);
    f.scale.z = 0.78;
    f.position.y = plate.position.y - H / 2 - 0.02 - i * 0.042;
    g.add(f);
  }
  // Leather straps over the shoulders.
  for (const s of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.23), M().leather);
    strap.position.set(s * 0.1, plate.position.y + H / 2 - 0.005, 0.0);
    g.add(strap);
  }
  // Gorget ring at the neck.
  const gorget = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 8, 28), M().darkSteel);
  gorget.rotation.x = Math.PI / 2;
  gorget.scale.set(1.1, 1.0, 1);
  gorget.position.y = plate.position.y + H / 2 + 0.01;
  g.add(gorget);
  const w = W();
  if (cur && (w === 'mail' || w === 'leather' || cur.long)) {
    // A skirt below the waist: mail links, or leather tassets; long hems reach the knee.
    const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.23, cur.long ? 0.4 : 0.2, 30, 1, true), w === 'mail' ? M().mail : M().armor);
    sk.scale.z = 0.8;
    sk.position.y = plate.position.y - H / 2 - (cur.long ? 0.2 : 0.1);
    g.add(sk);
  }
  if (cur && w === 'mail') {
    // A tabard in the region's colours over the links.
    for (const z of [1, -1]) {
      const tab = new THREE.Mesh(new THREE.PlaneGeometry(0.2, H + 0.3), M().cloth);
      tab.position.set(0, plate.position.y - 0.12, z * 0.16);
      if (z < 0) tab.rotation.y = Math.PI;
      g.add(tab);
    }
  }
  if (cur && w === 'leather') {
    // A belt with a buckle, and tooling across the chest.
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.168, 0.012, 5, 28), M().leather);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1.04, 0.8, 1.6);
    belt.position.y = plate.position.y - H / 2 + 0.03;
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.01), M().brass);
    buckle.position.set(0, belt.position.y, 0.14);
    g.add(belt, buckle);
  }
  return g;
}

function vambrace(len: number) {
  const g = new THREE.Group();
  const v = shell(0.044, 0.037, len * 0.72, Math.PI * 2);
  v.position.y = len * 0.18;
  const cuff = shell(0.041, 0.05, 0.03, Math.PI * 2, M().darkSteel);
  cuff.position.y = len * 0.88;
  const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.048, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M().armor);
  elbow.rotation.x = -Math.PI / 2; // cup behind the elbow (-Z)
  elbow.position.set(0, 0.015, -0.012);
  elbow.scale.set(1, 1, 0.8);
  g.add(v, cuff);
  // Soft armour has no elbow cop.
  if (W() === 'plate' || W() === 'mail') g.add(elbow);
  return g;
}

function handPlate(len: number) {
  const g = new THREE.Group();
  const plate = shell(0.05, 0.048, len * 0.9, Math.PI * 0.9);
  plate.position.set(0, 0, -0.03);
  const knuckle = shell(0.052, 0.05, 0.022, Math.PI * 0.9, M().darkSteel);
  knuckle.position.set(0, len * 0.9, -0.03);
  g.add(plate, knuckle);
  return g;
}

function greave(len: number) {
  const g = new THREE.Group();
  const shin = shell(0.056, 0.044, len * 0.8, Math.PI * 2, undefined, 1.08);
  shin.position.y = len * 0.12;
  const knee = new THREE.Mesh(new THREE.SphereGeometry(0.056, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), M().armor);
  knee.rotation.x = Math.PI / 2; // cup facing forward (+Z)
  knee.position.set(0, 0.0, 0.03);
  const wing = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16), M().armor);
  wing.position.set(0.05, 0, 0.02);
  wing.rotation.y = Math.PI / 2;
  g.add(shin);
  if (W() === 'plate') g.add(knee, wing, rivetRing(0.057, len * 0.2, 6, Math.PI * 0.9, 1.08));
  else if (W() === 'mail') g.add(knee);
  return g;
}

function cuisse(len: number) {
  // Robes and leather wrap the whole thigh; plate and mail cover the front.
  const soft = W() === 'robe' || W() === 'leather';
  const c = shell(0.086, 0.068, len * 0.75, soft ? Math.PI * 2 : Math.PI * 1.1, W() === 'mail' ? M().mail : undefined, 1.05);
  c.position.y = len * 0.12;
  return c;
}

function sabaton(len: number) {
  const g = new THREE.Group();
  if (W() === 'robe' || W() === 'leather') {
    // A boot or a slipper: one soft shell over the foot, and a cuff for boots.
    const foot = shell(0.05, 0.042, len * 1.0, Math.PI * 1.2);
    foot.position.y = -len * 0.12;
    foot.scale.set(1.05, 1, 0.85);
    g.add(foot);
    if (W() === 'leather') {
      const cuff = shell(0.055, 0.058, 0.06, Math.PI * 2, M().leather);
      cuff.rotation.x = -Math.PI / 2;
      cuff.position.set(0, -len * 0.15, 0.03);
      g.add(cuff);
    }
    return g;
  }
  // Lames over the top of the foot: limb frame +Y toward toes, +Z up.
  for (let i = 0; i < 4; i++) {
    const r = 0.048 - i * 0.004;
    const lame = shell(r, r * 0.95, len * 0.3, Math.PI);
    // Put the arc on top (+Z is up in the foot frame).
    lame.position.y = i * len * 0.24 - len * 0.1;
    lame.scale.set(1.05, 1, 0.8);
    g.add(lame);
  }
  return g;
}

let clothMat: THREE.MeshStandardMaterial | null = null;
function wool() {
  if (clothMat) return clothMat;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#6e1a1a';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1800; i++) {
    const l = Math.random() * 40;
    g.fillStyle = `rgba(${90 + l},${20 + l * 0.3},${20 + l * 0.3},0.35)`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 1.5, 1.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  clothMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, side: THREE.DoubleSide });
  return clothMat;
}

/** Cape from the shoulders to the backs of the knees, folded into soft pleats. */
function cloak(len: number) {
  const W = 0.44, H = 1.05;
  const geo = new THREE.PlaneGeometry(W, H, 12, 16);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const t = (H / 2 - y) / H; // 0 at the shoulders, 1 at the hem
    const width = 0.62 + t * 0.55; // flares toward the hem
    const pleat = Math.sin((x / W) * Math.PI * 7) * 0.012 * (0.3 + t);
    // Wraps around the back of the shoulders, then hangs away from the legs.
    const z = -0.14 - Math.cos((x / W) * Math.PI) * 0.06 * (1 - t) - t * t * 0.12 + pleat;
    p.setXYZ(i, x * width, len * 0.8 - t * H, z);
  }
  geo.computeVertexNormals();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, M().cloth));
  const clasp = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 16), M().brass);
  clasp.position.set(0, len * 0.85, 0.1);
  g.add(clasp);
  return g;
}

function amulet(len: number) {
  const g = new THREE.Group();
  const chain = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.004, 6, 32, Math.PI), M().brass);
  chain.rotation.set(Math.PI / 2 + 0.35, 0, Math.PI);
  chain.position.set(0, len * 0.55, 0.07);
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.022, 0),
    new THREE.MeshPhysicalMaterial({ color: cur ? cur.base : 0x9b1020, roughness: 0.05, clearcoat: 1, emissive: cur ? new THREE.Color(cur.base).multiplyScalar(0.3) : 0x3a0005 }),
  );
  gem.scale.y = 1.4;
  gem.position.set(0, len * 0.55 - 0.1, 0.16);
  g.add(chain, gem);
  return g;
}

function belt(len: number) {
  const g = new THREE.Group();
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 6, 32), M().leather);
  band.rotation.x = Math.PI / 2;
  band.scale.set(1, 0.78, 2.2);
  band.position.y = len * 0.6;
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.012), M().brass);
  buckle.position.set(0, len * 0.6, 0.13);
  const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.05), M().leather);
  pouch.position.set(-0.13, len * 0.6 - 0.05, 0.06);
  pouch.rotation.y = -0.6;
  g.add(band, buckle, pouch);
  return g;
}

// ---- assembly ---------------------------------------------------------------

const DEFAULT_LEN: Record<string, number> = {
  Head: 0.2, Spine2: 0.14, RightArm: 0.28, LeftArm: 0.28, RightForeArm: 0.28, LeftForeArm: 0.28,
  RightHand: 0.09, LeftHand: 0.09, RightUpLeg: 0.45, LeftUpLeg: 0.45, RightLeg: 0.44, LeftLeg: 0.44,
  RightFoot: 0.14, LeftFoot: 0.14, Hips: 0.1,
};

type PartSpec = { bone: string; make: (len: number) => THREE.Object3D };

function specs(id: ArmorPieceId): PartSpec[] {
  switch (id) {
    case 'helm':
      return [{ bone: 'Head', make: helm }];
    case 'pauldrons':
      return [
        { bone: 'RightArm', make: (l) => pauldron(l, 1) },
        { bone: 'LeftArm', make: (l) => pauldron(l, -1) },
      ];
    case 'breastplate':
      return [{ bone: 'Spine2', make: breastplate }];
    case 'gauntlets':
      return [
        { bone: 'RightForeArm', make: vambrace }, { bone: 'LeftForeArm', make: vambrace },
        { bone: 'RightHand', make: handPlate }, { bone: 'LeftHand', make: handPlate },
      ];
    case 'greaves':
      return [
        { bone: 'RightLeg', make: greave }, { bone: 'LeftLeg', make: greave },
        { bone: 'RightUpLeg', make: cuisse }, { bone: 'LeftUpLeg', make: cuisse },
      ];
    case 'sabatons':
      return [{ bone: 'RightFoot', make: sabaton }, { bone: 'LeftFoot', make: sabaton }];
    case 'cloak':
      return [{ bone: 'Spine2', make: cloak }];
    case 'amulet':
      return [{ bone: 'Spine2', make: amulet }];
    case 'belt':
      return [{ bone: 'Hips', make: belt }];
  }
}

/** Build armour parts. With a fit, each part is placed on its bone socket. */
export function buildArmorParts(id: ArmorPieceId, fit: LimbFit, look?: ArmorLook): ArmorPart[] {
  const parts: ArmorPart[] = [];
  cur = look ?? null;
  try {
    for (const s of specs(id)) {
      const limb = fit.limb(s.bone);
      if (!limb) continue;
      const obj = shadow(s.make(limb.len));
      limb.socket.add(obj);
      parts.push({ bone: s.bone, object: obj });
    }
  } finally {
    cur = null;
  }
  return parts;
}

/** A standalone display model (for inventory icons). */
export function buildArmorPiece(id: ArmorPieceId, _fit: null, look?: ArmorLook): THREE.Object3D {
  cur = look ?? null;
  try {
    return displayPiece(id);
  } finally {
    cur = null;
  }
}
function displayPiece(id: ArmorPieceId): THREE.Object3D {
  const g = new THREE.Group();
  const list = specs(id);
  list.forEach((s, i) => {
    const o = s.make(DEFAULT_LEN[s.bone] ?? 0.25);
    // Display: limb +Y points down the bone, so flip upright and spread pairs.
    const holder = new THREE.Group();
    holder.add(o);
    if (!s.bone.startsWith('Head') && !s.bone.startsWith('Spine')) holder.rotation.x = Math.PI;
    if (s.bone.endsWith('Foot')) holder.rotation.set(-Math.PI / 2, 0, 0);
    const pair = list.length > 1 ? (i % 2 === 0 ? -1 : 1) : 0;
    holder.position.x = pair * (id === 'pauldrons' ? 0.1 : 0.07);
    if (list.length > 2) holder.position.y = i < 2 ? 0 : -0.25;
    g.add(holder);
  });
  return shadow(g);
}

/** Individual limb-frame builders, for things that wear armour without a body (Living Armour). */
export const armorPieces = { helm, pauldron, breastplate, vambrace, greave, cuisse };
