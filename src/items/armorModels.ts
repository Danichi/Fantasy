import * as THREE from 'three';
import { mats } from './materials';

// Armour is modelled per limb in a "limb frame": +Y runs down the bone toward
// its child joint, +Z faces the character's front (feet: +Z up; hands: +Z out
// of the back of the hand), +X = Y x Z. Radii are in metres and sized for a
// 1.8 m body; bone lengths come from the loaded rig.

export type ArmorPieceId = 'helm' | 'pauldrons' | 'breastplate' | 'gauntlets' | 'greaves' | 'sabatons';

export interface LimbFit {
  /** returns a socket in limb space for this bone plus the bone's length */
  limb(bone: string): { socket: THREE.Object3D; len: number } | null;
}

export interface ArmorPart {
  bone: string;
  object: THREE.Object3D;
}

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
  return new THREE.Mesh(g, mat ?? mats().armor);
}

function rivetRing(r: number, y: number, count: number, arc = Math.PI * 2, zScale = 1) {
  const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0055, 6, 4), mats().darkSteel, count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const a = -arc / 2 + (arc * (i + 0.5)) / count;
    m.makeTranslation(Math.sin(a) * r, y, Math.cos(a) * r * zScale);
    inst.setMatrixAt(i, m);
  }
  return inst;
}

// ---- pieces ---------------------------------------------------------------

function helm(len: number) {
  const g = new THREE.Group();
  const R = 0.118;
  // Ogive skull cap.
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const a = t * Math.PI * 0.5;
    pts.push(new THREE.Vector2(Math.cos(a) * R * (1 - 0.08 * t), Math.sin(a) * R * 1.35 + Math.pow(t, 6) * 0.02));
  }
  const cap = new THREE.Mesh(new THREE.LatheGeometry(pts, 36), mats().armor);
  cap.scale.set(1, 1, 1.14);
  // Brow band.
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.006, R + 0.008, 0.03, 36, 1, true), mats().darkSteel);
  band.scale.set(1, 1, 1.14);
  band.position.y = 0.012;
  // Nasal guard.
  const nasal = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.1, 0.012), mats().armor);
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
  g.position.y = len * 0.42;
  return g;
}

function pauldron(len: number, out: number) {
  const g = new THREE.Group();
  const R = 0.074;
  // Dome over the shoulder joint.
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), mats().armor);
  dome.rotation.x = Math.PI; // pole points up the arm (-Y)
  dome.rotation.z = out * 0.25;
  dome.scale.set(1.08, 1, 1.05);
  dome.position.set(out * 0.012, 0.01, 0);
  g.add(dome);
  // Three lames down the upper arm, covering the outer side.
  for (let i = 0; i < 3; i++) {
    const r = R * (0.98 - i * 0.07);
    const lame = shell(r, r * 0.97, 0.034, Math.PI * 1.25);
    lame.position.y = 0.022 + i * 0.03;
    lame.rotation.y = out * Math.PI * 0.5; // centre the arc on the outside
    g.add(lame);
  }
  g.add(rivetRing(R * 0.98 + 0.004, 0.04, 7, Math.PI * 1.1));
  g.children[g.children.length - 1].rotation.y = out * Math.PI * 0.5;
  void len;
  return g;
}

function breastplate(len: number) {
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
  const mat = mats().armor;
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
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.23), mats().leather);
    strap.position.set(s * 0.1, plate.position.y + H / 2 - 0.005, 0.0);
    g.add(strap);
  }
  // Gorget ring at the neck.
  const gorget = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 8, 28), mats().darkSteel);
  gorget.rotation.x = Math.PI / 2;
  gorget.scale.set(1.1, 1.0, 1);
  gorget.position.y = plate.position.y + H / 2 + 0.01;
  g.add(gorget);
  return g;
}

function vambrace(len: number) {
  const g = new THREE.Group();
  const v = shell(0.044, 0.037, len * 0.72, Math.PI * 2);
  v.position.y = len * 0.18;
  const cuff = shell(0.041, 0.05, 0.03, Math.PI * 2, mats().darkSteel);
  cuff.position.y = len * 0.88;
  const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.048, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats().armor);
  elbow.rotation.x = -Math.PI / 2; // cup behind the elbow (-Z)
  elbow.position.set(0, 0.015, -0.012);
  elbow.scale.set(1, 1, 0.8);
  g.add(v, cuff, elbow);
  return g;
}

function handPlate(len: number) {
  const g = new THREE.Group();
  const plate = shell(0.05, 0.048, len * 0.9, Math.PI * 0.9);
  plate.position.set(0, 0, -0.03);
  const knuckle = shell(0.052, 0.05, 0.022, Math.PI * 0.9, mats().darkSteel);
  knuckle.position.set(0, len * 0.9, -0.03);
  g.add(plate, knuckle);
  return g;
}

function greave(len: number) {
  const g = new THREE.Group();
  const shin = shell(0.056, 0.044, len * 0.8, Math.PI * 2, undefined, 1.08);
  shin.position.y = len * 0.12;
  const knee = new THREE.Mesh(new THREE.SphereGeometry(0.056, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats().armor);
  knee.rotation.x = Math.PI / 2; // cup facing forward (+Z)
  knee.position.set(0, 0.0, 0.03);
  const wing = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16), mats().armor);
  wing.position.set(0.05, 0, 0.02);
  wing.rotation.y = Math.PI / 2;
  g.add(shin, knee, wing, rivetRing(0.057, len * 0.2, 6, Math.PI * 0.9, 1.08));
  return g;
}

function cuisse(len: number) {
  const c = shell(0.086, 0.068, len * 0.75, Math.PI * 1.1, undefined, 1.05);
  c.position.y = len * 0.12;
  return c;
}

function sabaton(len: number) {
  const g = new THREE.Group();
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

// ---- assembly ---------------------------------------------------------------

const DEFAULT_LEN: Record<string, number> = {
  Head: 0.2, Spine2: 0.14, RightArm: 0.28, LeftArm: 0.28, RightForeArm: 0.28, LeftForeArm: 0.28,
  RightHand: 0.09, LeftHand: 0.09, RightUpLeg: 0.45, LeftUpLeg: 0.45, RightLeg: 0.44, LeftLeg: 0.44,
  RightFoot: 0.14, LeftFoot: 0.14,
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
  }
}

/** Build armour parts. With a fit, each part is placed on its bone socket. */
export function buildArmorParts(id: ArmorPieceId, fit: LimbFit): ArmorPart[] {
  const parts: ArmorPart[] = [];
  for (const s of specs(id)) {
    const limb = fit.limb(s.bone);
    if (!limb) continue;
    const obj = shadow(s.make(limb.len));
    limb.socket.add(obj);
    parts.push({ bone: s.bone, object: obj });
  }
  return parts;
}

/** A standalone display model (for inventory icons). */
export function buildArmorPiece(id: ArmorPieceId, _fit: null): THREE.Object3D {
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
