import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/math';

// Procedural half-timbered houses. Geometry is built per house and merged by
// material, so each house costs a handful of draw calls.

export interface WorldMats {
  stone: THREE.Material;
  bridgeStone?: THREE.Material;
  plaster: THREE.Material;
  timber: THREE.Material;
  slate: THREE.Material;
  tile?: THREE.Material;
  thatch: THREE.Material;
  planks: THREE.Material;
  glass: THREE.Material;
  bark: THREE.Material;
  /** a painted window (filling a box face), dark and lit from inside; houses fall back to glass / timber */
  window?: THREE.Material;
  windowLit?: THREE.Material;
  /** a painted plank door (filling a box face); houses fall back to planks */
  door?: THREE.Material;
}

/** Planar world-scale UVs for a box so every wall has the same texel density. */
export function worldUV(g: THREE.BufferGeometry, scale = 1) {
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u: number, v: number;
    if (ay >= ax && ay >= az) [u, v] = [p.getX(i), p.getZ(i)];
    else if (ax >= az) [u, v] = [p.getZ(i), p.getY(i)];
    else [u, v] = [p.getX(i), p.getY(i)];
    uv[i * 2] = u / scale;
    uv[i * 2 + 1] = v / scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, rotZ = 0, rotY = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotZ) g.rotateZ(rotZ);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

/**
 * A timber: a box whose wood grain runs along its longest side, whichever way
 * it is then turned (posts, rails and braces all read as beams). `scale` is
 * the metres one texture tile covers.
 */
export function beam(w: number, h: number, d: number, x: number, y: number, z: number, rotZ = 0, rotY = 0, scale = 1.5) {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const long = w >= h && w >= d ? 0 : h >= d ? 1 : 2;
  // Each beam starts somewhere else on the board, so knots don't line up.
  const ou = (x * 0.37 + z * 0.61) % 1, ov = (y * 0.53 + x * 0.29) % 1;
  for (let i = 0; i < p.count; i++) {
    const c = [p.getX(i), p.getY(i), p.getZ(i)];
    const face = Math.abs(n.getX(i)) > 0.5 ? 0 : Math.abs(n.getY(i)) > 0.5 ? 1 : 2;
    if (face === long) {
      const [a, b] = [0, 1, 2].filter((k) => k !== long);
      uv.setXY(i, c[a] / scale + ou, c[b] / scale + ov); // end grain
    } else {
      const across = [0, 1, 2].find((k) => k !== long && k !== face)!;
      uv.setXY(i, c[across] / scale + ou, c[long] / scale + ov);
    }
  }
  if (rotZ) g.rotateZ(rotZ);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

export interface HouseSpec {
  w: number; // along local x (facade width)
  d: number; // depth along local z
  floors: 1 | 2;
  roof: 'slate' | 'thatch' | 'tile';
  seed: number;
}

/**
 * Returns a group with the house facing local +Z, origin at the centre of its
 * footprint at ground level, plus the half extents for a collider.
 */
export function buildHouse(spec: HouseSpec, m: WorldMats) {
  const rnd = mulberry32(spec.seed);
  const parts: Record<keyof WorldMats, THREE.BufferGeometry[]> = {
    stone: [], bridgeStone: [], plaster: [], timber: [], slate: [], tile: [], thatch: [], planks: [], glass: [], bark: [], window: [], windowLit: [], door: [],
  };
  const { w, d } = spec;
  const plinth = 0.7;
  const h1 = 2.9;
  const h2 = spec.floors === 2 ? 2.5 : 0;
  const jetty = spec.floors === 2 ? 0.3 : 0;
  const B = 0.16; // beam thickness
  const proud = 0.05;

  // Stone plinth (reaches below ground to hide uneven terrain).
  parts.stone.push(worldUV(box(w + 0.2, plinth + 1.5, d + 0.2, 0, plinth / 2 - 0.75, 0)));
  // Ground floor walls.
  parts.plaster.push(worldUV(box(w, h1, d, 0, plinth + h1 / 2, 0), 2));
  const top1 = plinth + h1;

  // Timber frame on a wall face: posts, rails and braces.
  const frame = (fw: number, fh: number, y0: number, zFace: number, sideways: boolean, braces: boolean) => {
    const place = (g: THREE.BufferGeometry) => {
      if (sideways) g.rotateY(Math.PI / 2);
      parts.timber.push(g);
    };
    const off = zFace + proud * Math.sign(zFace);
    // Rails.
    place(beam(fw + B, B, B, 0, y0 + B / 2, off));
    place(beam(fw + B, B, B, 0, y0 + fh - B / 2, off));
    // Posts.
    const n = Math.max(2, Math.round(fw / 1.25));
    for (let i = 0; i <= n; i++) {
      const x = -fw / 2 + (fw * i) / n;
      place(beam(B, fh, B, x, y0 + fh / 2, off));
    }
    // Diagonal braces in alternating bays.
    if (braces) {
      for (let i = 0; i < n; i += 2) {
        const bw = fw / n;
        const x = -fw / 2 + bw * (i + 0.5);
        const len = Math.hypot(bw, fh);
        const ang = Math.atan2(fh, bw) * (i % 4 === 0 ? 1 : -1);
        place(beam(len, B * 0.8, B, x, y0 + fh / 2, off, ang));
      }
    }
  };
  frame(w, h1, plinth, d / 2, false, spec.floors === 1);
  frame(w, h1, plinth, -d / 2, false, spec.floors === 1);
  frame(d, h1, plinth, w / 2, true, false);
  frame(d, h1, plinth, -w / 2, true, false);

  let eaveY = top1;
  let rw = w, rd = d;
  if (spec.floors === 2) {
    rw = w + jetty * 2;
    rd = d + jetty * 2;
    // Jettied upper floor overhangs the ground floor.
    parts.plaster.push(worldUV(box(rw, h2, rd, 0, top1 + h2 / 2, 0), 2));
    parts.timber.push(beam(rw + 0.12, 0.22, rd + 0.12, 0, top1 + 0.11, 0));
    frame(rw, h2, top1, rd / 2, false, true);
    frame(rw, h2, top1, -rd / 2, false, true);
    frame(rd, h2, top1, rw / 2, true, true);
    frame(rd, h2, top1, -rw / 2, true, true);
    eaveY = top1 + h2;
  }

  // Gable roof along x: the ridge runs left-right across the facade.
  const pitch = spec.roof === 'thatch' ? 0.85 : 0.72;
  const over = 0.85;
  const halfSpan = rd / 2 + over;
  const rise = Math.tan(pitch) * (rd / 2);
  const slopeLen = halfSpan / Math.cos(pitch);
  const roofMat = spec.roof;
  const thick = spec.roof === 'thatch' ? 0.35 : 0.12;
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(rw + over * 2, thick, slopeLen);
    worldUV(g, 2.2);
    // Tiles, slates and thatch hang toward the eave on both slopes (texture v runs up the roof).
    if (s === 1) {
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setY(i, -uv.getY(i));
    }
    g.translate(0, 0, s * slopeLen / 2);
    g.rotateX(s * pitch);
    g.translate(0, eaveY + rise + thick * 0.5 - Math.sin(pitch) * over * 0.2, 0);
    parts[roofMat].push(g);
  }
  // Gable end walls (triangles) with a timber king post.
  const tri = new THREE.Shape();
  tri.moveTo(-rd / 2, 0);
  tri.lineTo(rd / 2, 0);
  tri.lineTo(0, rise);
  tri.closePath();
  for (const s of [-1, 1]) {
    const g = new THREE.ExtrudeGeometry(tri, { depth: 0.2, bevelEnabled: false });
    g.rotateY(Math.PI / 2);
    g.translate(s * (rw / 2) - 0.1, eaveY, 0);
    parts.plaster.push(worldUV(g, 2));
    parts.timber.push(beam(B, rise, B, s * (rw / 2 + proud), eaveY + rise / 2, 0));
    parts.timber.push(beam(B, B, rd, s * (rw / 2 + proud), eaveY + B / 2, 0));
  }
  // Ridge beam.
  parts.timber.push(beam(rw + over * 2 + 0.1, 0.18, 0.2, 0, eaveY + rise + thick + 0.02, 0));

  // Chimney (its top is returned so the village can give it smoke).
  let chimney: THREE.Vector3 | null = null;
  if (rnd() < 0.7) {
    const cx = (rnd() < 0.5 ? -1 : 1) * rw * 0.3;
    parts.stone.push(worldUV(box(0.7, rise + 1.6, 0.7, cx, eaveY + (rise + 1.6) / 2 + 0.3, -rd * 0.15)));
    chimney = new THREE.Vector3(cx, eaveY + rise + 1.9 + 0.3, -rd * 0.15);
  }

  // Door on the facade.
  const dx = (rnd() - 0.5) * (w - 2.2);
  // (A painted door fills the face of its box; without one, planks.)
  if (m.door) parts.door.push(box(1.1, 2.1, 0.12, dx, plinth + 1.05, d / 2 + 0.02));
  else parts.planks.push(worldUV(box(1.1, 2.1, 0.12, dx, plinth + 1.05, d / 2 + 0.02)));
  parts.timber.push(beam(1.45, 0.2, 0.2, dx, plinth + 2.2, d / 2 + 0.06));
  parts.stone.push(worldUV(box(1.6, 0.25, 0.6, dx, plinth - 0.12, d / 2 + 0.35)));

  // Windows: dark recess, warm lit glass on some, wooden shutters.
  const windows = (y: number, zf: number, width: number, avoid: number | null) => {
    const n = Math.max(1, Math.floor(width / 2.4));
    for (let i = 0; i < n; i++) {
      const x = -width / 2 + (width * (i + 0.5)) / n;
      if (avoid !== null && Math.abs(x - avoid) < 1.4) continue;
      const lit = rnd() < 0.35;
      const g = box(0.8, 0.9, 0.08, x, y, zf + 0.03);
      // A painted leaded window fills the face of its box; without one, dark timber or glowing glass.
      if (m.window && m.windowLit) (lit ? parts.windowLit : parts.window).push(g);
      else (lit ? parts.glass : parts.timber).push(worldUV(g, 1.5));
      parts.timber.push(beam(1.0, 0.12, 0.14, x, y - 0.5, zf + 0.07));
      for (const sx of [-1, 1]) parts.planks.push(worldUV(box(0.42, 0.95, 0.05, x + sx * 0.66, y, zf + 0.08)));
    }
  };
  windows(plinth + 1.55, d / 2, w, dx);
  windows(plinth + 1.55, -d / 2 - 0.06, w, null);
  if (spec.floors === 2) {
    windows(top1 + 1.25, rd / 2, rw, null);
  }

  const group = new THREE.Group();
  for (const key of Object.keys(parts) as (keyof WorldMats)[]) {
    const list = parts[key];
    if (!list.length) continue;
    const norm = list.map((g) => {
      const gg = g.index ? g.toNonIndexed() : g;
      for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(k)) gg.deleteAttribute(k);
      return gg;
    });
    const merged = mergeGeometries(norm, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, m[key] ?? m.stone);
    mesh.castShadow = key !== 'glass' && key !== 'window' && key !== 'windowLit';
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const half = new THREE.Vector3(rw / 2 + 0.15, (eaveY + rise) / 2, rd / 2 + 0.15);
  // The doorstep (outside the door, at the plinth top) for world/doors.ts.
  const door = new THREE.Vector3(dx, plinth - 0.1, d / 2 + 0.9);
  return { group, half, height: eaveY + rise, chimney, door };
}
