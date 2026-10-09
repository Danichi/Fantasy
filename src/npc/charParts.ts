import * as THREE from 'three';
import { basisQuat } from '../player/ik';
import { ORIGINS, type OriginLook } from '../origins/data';

// Origin parts for the storybook bodies (docs/design/origins.md §7, §9). The
// Quaternius kit has no elf ears, horns, tails or wings, so they are made here
// as procedural meshes in the painted style and bound rigidly to the bones
// they grow from (head, pelvis, chest), the way armour is fitted: they follow
// every clip because they ride on the bones. Builds and peoples' proportions
// are bone scales (uniform, with the inverse on the children that must keep
// their size, so nothing shears in motion), and the whole body is then fitted
// back to the chosen height.

export type BoneGet = (name: string) => THREE.Bone | undefined;

/** Live parts on one body: tail sway and wing spread/flap are animated per frame. */
export interface PartsHandle {
  wings: boolean;
  /** extra objects that must be shown on the inventory preview layer */
  objects: THREE.Object3D[];
  update(dt: number, s: { spread: number; flap: number; speed: number }): void;
  dispose(): void;
}

/** Painted skin under the kit's skin texture (approximately), for parts that must match it. */
const BASE_SKIN = new THREE.Color(0xf1c4a6);

const mat = (color: THREE.ColorRepresentation, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, ...o });
  m.userData.styleRim = 0.5;
  return m;
};

// ---- shaping ---------------------------------------------------------------------------

/** Bone scales for a look: the people's proportions times the build. */
export function shapeBones(bone: BoneGet, look: OriginLook) {
  const L = ORIGINS[look.origin].look;
  const build = look.build === 'slim' ? { chest: 0.94, thick: 0.94 } : look.build === 'broad' ? { chest: 1.07, thick: 1.07 } : { chest: 1, thick: 1 };
  const chest = L.shoulders * build.chest;
  const set = (n: string, x: number, y = x, z = x) => bone(n)?.scale.set(x, y, z);
  // Chest grows uniformly; neck and collarbones undo it so the head and arms keep their size.
  set('spine_03', chest);
  set('neck_01', 1 / chest);
  set('clavicle_l', 1 / chest);
  set('clavicle_r', 1 / chest);
  set('Head', L.head);
  // Legs and arms: length along the bone (local +Y), thickness across it.
  const legT = build.thick * (L.legs < 1 ? 1 + (1 - L.legs) * 0.6 : 1 - (L.legs - 1) * 0.4);
  const armT = build.thick * (L.limbs < 1 ? 1.04 : 1);
  for (const s of ['l', 'r']) {
    set('thigh_' + s, legT, L.legs, legT);
    set('upperarm_' + s, armT, L.limbs, armT);
    // Hands keep their size.
    set('hand_' + s, 1 / armT, 1 / L.limbs, 1 / armT);
  }
}

/** Fit the (skinned) model to a standing height with its feet on y = 0, in the current pose. */
export function fitHeight(model: THREE.Object3D, height: number) {
  const box = new THREE.Box3();
  const measure = () => {
    model.updateMatrixWorld(true);
    box.makeEmpty();
    model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      m.computeBoundingBox();
      box.union(m.boundingBox!.clone().applyMatrix4(m.matrixWorld));
    });
  };
  measure();
  const parentY = model.parent ? model.parent.getWorldPosition(new THREE.Vector3()).y : 0;
  const ps = model.parent ? model.parent.getWorldScale(new THREE.Vector3()).y : 1;
  const h = (box.max.y - box.min.y) / ps;
  if (h > 0.5) model.scale.multiplyScalar(height / h);
  measure();
  model.position.y -= (box.min.y - parentY) / ps;
  model.updateMatrixWorld(true);
}

// ---- geometry helpers ----------------------------------------------------------------------

/** A tube along points whose radius tapers from r0 to r1 (horns, tails). */
function taperTube(pts: THREE.Vector3[], r0: number, r1: number, radial = 8, tipPow = 1) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const segs = Math.max(6, pts.length * 5);
  const frames = curve.computeFrenetFrames(segs, false);
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = curve.getPointAt(t);
    const r = r1 + (r0 - r1) * Math.pow(1 - t, tipPow);
    const N = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const n = N.clone().multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
      pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
      nor.push(n.x, n.y, n.z);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** A flat-ish pointed leaf (elf and beast ears): base at the origin, tip along +Y, facing +Z. */
function earGeo(len: number, width: number, thick: number, roundness = 0.5) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.quadraticCurveTo(-width * roundness, len * 0.6, 0, len);
  shape.quadraticCurveTo(width * roundness, len * 0.6, width / 2, 0);
  shape.quadraticCurveTo(0, -width * 0.15, -width / 2, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.4, bevelSize: thick * 0.5, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, -thick / 2);
  g.computeVertexNormals();
  return g;
}

// ---- attaching -------------------------------------------------------------------------

/**
 * A socket on `b` whose axes are the body's frame at rest: +Y up, +Z the way
 * the character faces, +X its left; units are metres of the fitted body.
 */
function frameSocket(b: THREE.Bone, root: THREE.Object3D, name: string) {
  root.updateMatrixWorld(true);
  const rq = root.getWorldQuaternion(new THREE.Quaternion());
  const frame = basisQuat(new THREE.Vector3(0, 1, 0).applyQuaternion(rq), new THREE.Vector3(0, 0, 1).applyQuaternion(rq));
  const g = new THREE.Group();
  g.name = 'part:' + name;
  const ws = b.getWorldScale(new THREE.Vector3());
  const rs = root.getWorldScale(new THREE.Vector3());
  g.scale.set(rs.x / ws.x, rs.y / ws.y, rs.z / ws.z);
  g.quaternion.copy(b.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(frame));
  b.add(g);
  return g;
}

/**
 * Grow a look's origin parts on a body. `root` is the body's outermost group
 * (facing +Z, no yaw), already fitted to its height, in the rest pose.
 */
export function addOriginParts(root: THREE.Object3D, model: THREE.Object3D, bone: BoneGet, look: OriginLook): PartsHandle {
  const L = ORIGINS[look.origin].look;
  const objects: THREE.Object3D[] = [];
  const mats: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const keep = <T extends THREE.Material | THREE.BufferGeometry>(x: T) => ((x as THREE.Material).isMaterial ? mats.push(x as THREE.Material) : geos.push(x as THREE.BufferGeometry), x);
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => {
    const o = new THREE.Mesh(keep(g), m);
    o.castShadow = true;
    o.receiveShadow = true;
    return o;
  };
  const skin = keep(mat(BASE_SKIN.clone().multiply(new THREE.Color(look.skin))));
  const hair = keep(mat(look.hairColor));
  const darkSkin = keep(mat(BASE_SKIN.clone().multiply(new THREE.Color(look.skin)).multiplyScalar(0.72)));
  const horn = keep(mat(look.origin === 'demon' ? 0x2c2422 : 0xd8ccae, { roughness: 0.6 }));
  const head = bone('Head'), pelvis = bone('pelvis'), chest = bone('spine_03');

  // Eyes: tinted, and glowing for the demon and dragonkin.
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !/eye/i.test(m.name) || /brow/i.test(m.name)) return;
    const em = (m.material as THREE.MeshStandardMaterial).clone();
    em.color.set(0xffffff).lerp(new THREE.Color(look.eyes), 0.55);
    if (L.glow) {
      em.emissive = new THREE.Color(look.eyes);
      em.emissiveIntensity = 1.1;
    }
    m.material = keep(em);
  });

  // ---- head: ears, horns, markings ----
  if (head) {
    const hs = frameSocket(head, root, 'head');
    objects.push(hs);
    if (look.ears === 'elf') {
      for (const s of [-1, 1]) {
        const e = mesh(earGeo(0.13, 0.045, 0.012, 0.42), skin);
        e.position.set(s * 0.078, 0.065, -0.012);
        e.rotation.set(-0.75, s * 1.2, s * -0.55, 'YXZ');
        hs.add(e);
      }
    } else if (look.ears === 'wolf' || look.ears === 'cat') {
      const cat = look.ears === 'cat';
      const inner = keep(mat(0xd88a8a));
      for (const s of [-1, 1]) {
        const g = new THREE.Group();
        const outer = mesh(earGeo(cat ? 0.095 : 0.13, cat ? 0.085 : 0.075, 0.016, cat ? 0.62 : 0.45), hair);
        const pink = mesh(earGeo(cat ? 0.07 : 0.095, cat ? 0.055 : 0.045, 0.006, cat ? 0.62 : 0.45), inner);
        pink.position.set(0, 0.008, 0.012);
        g.add(outer, pink);
        g.position.set(s * 0.06, 0.17, -0.025);
        g.rotation.set(-0.12, s * 0.3, s * -0.42, 'YXZ');
        hs.add(g);
      }
    }
    if (look.horns >= 0) {
      const style = L.horns[look.horns];
      const dk = look.origin === 'dragonkin';
      for (const s of [-1, 1]) {
        const P = (x: number, y: number, z: number) => new THREE.Vector3(s * x, y, z);
        let pts: THREE.Vector3[] = [], r0 = 0.024, r1 = 0.004;
        if (style === 'Ram') (pts = [P(0.06, 0.15, 0.03), P(0.1, 0.19, -0.02), P(0.13, 0.15, -0.07), P(0.135, 0.08, -0.04), P(0.12, 0.06, 0.02), P(0.13, 0.09, 0.05)]), (r0 = 0.03);
        else if (style === 'Spire') pts = [P(0.045, 0.16, 0.04), P(0.055, 0.25, 0.02), P(0.06, 0.34, -0.02)];
        else if (style === 'Swept') (pts = [P(0.05, 0.155, 0.04), P(0.07, 0.2, -0.04), P(0.08, 0.22, -0.13), P(0.085, 0.2, dk ? -0.24 : -0.2)]), (r0 = dk ? 0.028 : 0.024);
        else if (style === 'Crown') {
          for (const [x, z, h] of [[0.035, 0.07, 0.07], [0.07, 0.01, 0.08], [0.06, -0.06, 0.07]]) {
            const spike = mesh(taperTube([P(x, 0.15, z), P(x * 1.15, 0.15 + h * 0.6, z), P(x * 1.25, 0.15 + h, z - 0.01)], 0.016, 0.003), horn);
            hs.add(spike);
          }
          continue;
        } else if (style === 'Twin') (pts = [P(0.045, 0.16, 0.05), P(0.07, 0.24, 0.06), P(0.09, 0.31, 0.02), P(0.1, 0.35, -0.05)]), (r0 = 0.026);
        if (pts.length) hs.add(mesh(taperTube(pts, r0, r1, 8, 0.8), horn));
      }
    }
    if (look.markings && L.markings === 'scales') {
      // Scale patches on the cheekbones and temples.
      const scaleMat = keep(mat(new THREE.Color(look.skin).lerp(new THREE.Color(0x2a6a5a), 0.45), { roughness: 0.45, metalness: 0.15 }));
      const g = keep(new THREE.SphereGeometry(0.011, 6, 4).scale(1, 0.75, 0.32));
      const spots: [number, number, number][] = [];
      for (const s of [-1, 1]) for (let i = 0; i < 9; i++) spots.push([s * (0.072 + (i % 3) * 0.004), 0.06 + Math.floor(i / 3) * 0.018 + (i % 3) * 0.006, 0.035 - (i % 3) * 0.017]);
      const inst = new THREE.InstancedMesh(g, scaleMat, spots.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
      spots.forEach(([x, y, z], i) => {
        q.setFromEuler(new THREE.Euler(0, Math.sign(x) * 1.45, 0));
        m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
        inst.setMatrixAt(i, m4);
      });
      hs.add(inst);
    } else if (look.markings && L.markings === 'fur') {
      // Fur tufts down the jaw (sideburns).
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
        const t = mesh(new THREE.ConeGeometry(0.014, 0.06, 5), hair);
        t.position.set(s * 0.074, 0.05 - i * 0.022, 0.015 - i * 0.01);
        t.rotation.set(0.2, 0, s * (2.2 + i * 0.2));
        hs.add(t);
      }
    }
  }

  // ---- tail ----
  let tailRoot: THREE.Group | null = null, tailMid: THREE.Group | null = null;
  if (look.tail && pelvis) {
    const ps = frameSocket(pelvis, root, 'tail');
    objects.push(ps);
    tailRoot = new THREE.Group();
    tailRoot.position.set(0, -0.04, -0.14);
    ps.add(tailRoot);
    tailMid = new THREE.Group();
    const o = look.origin;
    const cat = look.ears === 'cat';
    const len = o === 'dragonkin' ? 0.62 : o === 'demon' ? 0.55 : cat ? 0.6 : 0.48;
    const r = o === 'dragonkin' ? 0.07 : o === 'demon' ? 0.018 : cat ? 0.03 : 0.07;
    const m = o === 'beastfolk' ? hair : o === 'dragonkin' ? darkSkin : skin;
    const half = len / 2;
    // First half droops back and down, the second curls a little up.
    tailRoot.add(mesh(taperTube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.1, -half * 0.55), new THREE.Vector3(0, -0.16, -half)], r, r * 0.8, 9), m));
    tailMid.position.set(0, -0.16, -half);
    tailRoot.add(tailMid);
    const bushy = o === 'beastfolk' && !cat;
    tailMid.add(mesh(taperTube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.04, -half * 0.55), new THREE.Vector3(0, 0.03, -half)], r * (bushy ? 1.25 : 0.8), bushy ? r * 0.25 : r * 0.25, 9, bushy ? 0.5 : 1), m));
    if (o === 'demon') {
      const spade = mesh(new THREE.ConeGeometry(0.045, 0.1, 4).scale(1, 1, 0.3), skin);
      spade.position.set(0, 0.03, -half - 0.03);
      spade.rotation.x = -Math.PI / 2;
      tailMid.add(spade);
    }
    if (o === 'dragonkin') {
      // A ridge of plates along the top.
      for (let i = 0; i < 5; i++) {
        const plate = mesh(new THREE.ConeGeometry(0.025 - i * 0.003, 0.05, 4).scale(0.35, 1, 1), horn);
        plate.position.set(0, 0.06 - i * 0.04, -0.06 - i * 0.12);
        tailRoot.add(plate);
      }
    }
  }

  // ---- wings (dragonkin): two bones each, membrane rebuilt as they move ----
  type Wing = { side: number; root: THREE.Group; membrane: THREE.Mesh; spars: THREE.Mesh[] };
  const wings: Wing[] = [];
  if (L.wings && chest) {
    const cs = frameSocket(chest, root, 'wings');
    objects.push(cs);
    const memMat = keep(mat(new THREE.Color(look.skin).multiplyScalar(0.55).lerp(new THREE.Color(0x5a2a2a), 0.35), { side: THREE.DoubleSide, roughness: 0.9 }));
    const sparGeo = keep(new THREE.CylinderGeometry(0.014, 0.02, 1, 6).translate(0, 0.5, 0));
    for (const side of [-1, 1]) {
      const wr = new THREE.Group();
      wr.position.set(side * 0.07, 0.07, -0.13);
      cs.add(wr);
      const g = keep(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 3), 3));
      g.setIndex([0, 1, 2, 1, 3, 2, 1, 4, 3, 1, 5, 4, 1, 0, 5]);
      const membrane = new THREE.Mesh(g, memMat);
      membrane.castShadow = true;
      membrane.frustumCulled = false;
      wr.add(membrane);
      const spars: THREE.Mesh[] = [];
      for (let i = 0; i < 5; i++) {
        const sp = new THREE.Mesh(sparGeo, i < 2 ? darkSkin : horn);
        sp.castShadow = true;
        wr.add(sp);
        spars.push(sp);
      }
      wings.push({ side, root: wr, membrane, spars });
    }
  }

  let t = 0;
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const up = v(0, 1, 0);
  const placeSpar = (m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, thick: number) => {
    const d = b.clone().sub(a);
    const len = d.length();
    m.position.copy(a);
    m.quaternion.setFromUnitVectors(up, d.divideScalar(len || 1));
    m.scale.set(thick, len, thick);
  };
  const updateWings = (spread: number, flap: number) => {
    for (const w of wings) {
      const s = w.side;
      // Directions in the wing root's frame (X out to this side, Y up, Z forward).
      const flapLift = Math.sin(flap) * 0.75 * spread;
      const upperFold = v(0.28, 0.9, -0.3), upperOpen = v(1, 0.3 + flapLift, -0.12);
      const lowerFold = v(0.12, -0.95, -0.22), lowerOpen = v(1, 0.05 + flapLift * 1.4, -0.3);
      const ud = upperFold.lerp(upperOpen, spread).normalize();
      const ld = lowerFold.lerp(lowerOpen, spread).normalize();
      ud.x *= s;
      ld.x *= s;
      const S = v(0, 0, 0);
      const W = ud.clone().multiplyScalar(0.42);
      const fingers = [0, 1, 2].map((i) => {
        const dir = ld.clone().applyAxisAngle(v(0, 0, 1), -s * i * (0.35 + 0.25 * spread)).applyAxisAngle(v(1, 0, 0), -i * 0.12);
        return W.clone().addScaledVector(dir, 0.6 * (1 - i * 0.18));
      });
      const T = v(s * 0.05 * (1 - spread) + s * 0.12 * spread, -0.42 + 0.12 * spread, -0.04);
      const pos = w.membrane.geometry.attributes.position as THREE.BufferAttribute;
      [S, W, fingers[0], fingers[1], fingers[2], T].forEach((p, i) => pos.setXYZ(i, p.x, p.y, p.z));
      pos.needsUpdate = true;
      w.membrane.geometry.computeVertexNormals();
      w.membrane.geometry.computeBoundingSphere();
      placeSpar(w.spars[0], S, W, 1.4);
      placeSpar(w.spars[1], W, fingers[0], 1.1);
      placeSpar(w.spars[2], W, fingers[1], 0.6);
      placeSpar(w.spars[3], W, fingers[2], 0.6);
      placeSpar(w.spars[4], W, W.clone().addScaledVector(ud, 0.07).add(v(0, 0.05, 0)), 0.9); // the claw at the wrist
    }
  };
  updateWings(0, 0);

  return {
    wings: wings.length > 0,
    objects,
    update(dt, s) {
      t += dt;
      if (tailRoot && tailMid) {
        const sway = Math.sin(t * (1.6 + s.speed * 0.4)) * (0.16 + s.speed * 0.03);
        tailRoot.rotation.set(-0.15 + Math.min(0.5, s.speed * 0.08) + s.spread * 0.4, sway, 0);
        tailMid.rotation.set(0.1, sway * 1.4, 0);
      }
      if (wings.length) updateWings(s.spread, s.flap);
    },
    dispose() {
      for (const o of objects) o.removeFromParent();
      for (const m of mats) m.dispose();
      for (const g of geos) g.dispose();
    },
  };
}
