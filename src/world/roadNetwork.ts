import * as THREE from 'three';
import { ROAD_SPECS, ROAD_HALF, COBBLE_ZONES, type P2, type RoadSpec } from './roadData';
import { CITY_STREETS, MARKET } from './portCity';
import { heightAt } from './terrainHeight';
import { physics } from '../physics/physics';
import type { Interactable } from '../dungeon/instance';
import type { WorldMats } from './buildings';

// The road network at runtime (World Expansion phase 4): a coverage texture
// the terrain shader paints roads from (dirt, cobbles near towns), milestones
// every 500 m of the King's Road, signposts at the junctions, and barriers
// where a road is closed until a later chapter opens it.

/** World rectangle covered by the road texture (Elder Glen to Port Aurelle and
 *  the closed branch gates; later phases add their own), and its resolution. */
export const ROAD_RECT = { x0: -1100, z0: -800, w: 4100, h: 1650 };
const RES = 2; // metres per texel
const TW = Math.ceil(ROAD_RECT.w / RES), TH = Math.ceil(ROAD_RECT.h / RES);

let coverage: Uint8Array | null = null;

/** Rasterise every road into an RG texture: R = dirt surface, G = cobbles. */
export function buildRoadTexture() {
  const data = new Uint8Array(TW * TH * 2);
  for (const road of ROAD_SPECS) {
    const half = ROAD_HALF[road.kind];
    const soft = road.kind === 'trail' ? 1.2 : 1.8;
    for (let i = 0; i < road.pts.length - 1; i++) {
      const [ax, az] = road.pts[i], [bx, bz] = road.pts[i + 1];
      const pad = half + soft + RES;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - pad - ROAD_RECT.x0) / RES));
      const i1 = Math.min(TW - 1, Math.ceil((Math.max(ax, bx) + pad - ROAD_RECT.x0) / RES));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - pad - ROAD_RECT.z0) / RES));
      const j1 = Math.min(TH - 1, Math.ceil((Math.max(az, bz) + pad - ROAD_RECT.z0) / RES));
      const vx = bx - ax, vz = bz - az, len2 = vx * vx + vz * vz;
      for (let j = j0; j <= j1; j++) {
        const z = ROAD_RECT.z0 + (j + 0.5) * RES;
        for (let k = i0; k <= i1; k++) {
          const x = ROAD_RECT.x0 + (k + 0.5) * RES;
          const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2));
          const d = Math.hypot(x - ax - vx * t, z - az - vz * t);
          if (d > half + soft) continue;
          const c = Math.round(255 * Math.min(1, (half + soft - d) / soft));
          const idx = (j * TW + k) * 2;
          let cob = 0;
          for (const [cx, cz, r] of COBBLE_ZONES) if (road.kind !== 'trail') cob = Math.max(cob, Math.min(1, (r - Math.hypot(x - cx, z - cz)) / 20));
          const cobC = Math.round(c * Math.max(0, cob));
          data[idx] = Math.max(data[idx], c - cobC);
          data[idx + 1] = Math.max(data[idx + 1], cobC);
        }
      }
    }
  }
  // Port Aurelle: every street and square is cobbled.
  const cobble = (x: number, z: number, amount: number) => {
    const k = Math.floor((x - ROAD_RECT.x0) / RES), j = Math.floor((z - ROAD_RECT.z0) / RES);
    if (k < 0 || j < 0 || k >= TW || j >= TH) return;
    const i = (j * TW + k) * 2;
    data[i + 1] = Math.max(data[i + 1], Math.round(255 * amount));
    data[i] = Math.min(data[i], 255 - data[i + 1]);
  };
  for (const line of CITY_STREETS) for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    for (let s = 0; s <= len; s += RES * 0.5) {
      const cx = ax + ((bx - ax) * s) / len, cz = az + ((bz - az) * s) / len;
      for (let oz = -5; oz <= 5; oz += RES * 0.5) for (let ox = -5; ox <= 5; ox += RES * 0.5) {
        const d = Math.hypot(ox, oz);
        if (d < 5) cobble(cx + ox, cz + oz, Math.min(1, (5 - d) / 1.6));
      }
    }
  }
  for (let oz = -24; oz <= 24; oz += RES * 0.5) for (let ox = -24; ox <= 24; ox += RES * 0.5) {
    const d = Math.hypot(ox, oz);
    if (d < 24) cobble(MARKET[0] + ox, MARKET[1] + oz, Math.min(1, (24 - d) / 2));
  }
  coverage = data;
  const tex = new THREE.DataTexture(data, TW, TH, THREE.RGFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** 0..1 road surface at a point (grass, flowers and scatter keep off it). */
export function roadCoverage(x: number, z: number) {
  if (!coverage) return 0;
  const k = Math.floor((x - ROAD_RECT.x0) / RES), j = Math.floor((z - ROAD_RECT.z0) / RES);
  if (k < 0 || j < 0 || k >= TW || j >= TH) return 0;
  const i = (j * TW + k) * 2;
  return Math.max(coverage[i], coverage[i + 1]) / 255;
}

// ---- along-road geometry ----------------------------------------------------------

/** Total length of a road's polyline. */
export function roadLength(r: RoadSpec) {
  let len = 0;
  for (let i = 1; i < r.pts.length; i++) len += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
  return len;
}

/** Point and heading at distance `s` along a road. */
export function pointAlong(r: RoadSpec, s: number): { x: number; z: number; dir: THREE.Vector2 } {
  let acc = 0;
  for (let i = 1; i < r.pts.length; i++) {
    const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i];
    const seg = Math.hypot(bx - ax, bz - az);
    if (acc + seg >= s || i === r.pts.length - 1) {
      const t = Math.max(0, Math.min(1, (s - acc) / seg));
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dir: new THREE.Vector2(bx - ax, bz - az).normalize() };
    }
    acc += seg;
  }
  const [x, z] = r.pts[r.pts.length - 1];
  return { x, z, dir: new THREE.Vector2(1, 0) };
}

/** Distance along a road of the point nearest to (x, z). */
export function distanceAlong(r: RoadSpec, x: number, z: number) {
  let best = Infinity, at = 0, acc = 0;
  for (let i = 1; i < r.pts.length; i++) {
    const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i];
    const vx = bx - ax, vz = bz - az, seg = Math.hypot(vx, vz);
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (seg * seg)));
    const d = Math.hypot(x - ax - vx * t, z - az - vz * t);
    if (d < best) (best = d), (at = acc + t * seg);
    acc += seg;
  }
  return at;
}

export const road = (id: string) => ROAD_SPECS.find((r) => r.id === id)!;

// ---- roadside furniture ----------------------------------------------------------------

function carvedText(lines: string[], w: number, h: number, bg: string, ink: string, font = 'Cinzel, serif') {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  const lh = h / (lines.length + 0.6);
  lines.forEach((l, i) => {
    g.font = `700 ${Math.round(lh * (i === 0 ? 0.62 : 0.5))}px ${font}`;
    g.fillText(l, w / 2, lh * (i + 0.8));
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface RoadFurniture {
  interactables: Interactable[];
  /** closed roads: where the barrier stands and why */
  gates: { pos: THREE.Vector3; reason: string; road: string }[];
}

/** Milestones, signposts and closed-road barriers. */
export function buildRoadFurniture(scene: THREE.Scene, m: WorldMats, talk: (who: string, title: string, text: string) => void): RoadFurniture {
  const interactables: Interactable[] = [];
  const gates: RoadFurniture['gates'] = [];
  const stoneMat = m.bridgeStone ?? m.stone;

  // Milestones every 500 m of the King's Road, counting down to Port Aurelle.
  const kr = road('kings');
  const total = roadLength(kr);
  for (let s = 500; s < total - 150; s += 500) {
    const p = pointAlong(kr, s);
    const side = new THREE.Vector2(-p.dir.y, p.dir.x);
    const x = p.x + side.x * 5.2, z = p.z + side.y * 5.2;
    const y = heightAt(x, z);
    const left = total - s;
    const miles = left / 1609;
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.1, 0.32), stoneMat);
    post.position.y = 0.5;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.32, 12, 1, false, 0, Math.PI), stoneMat);
    cap.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    cap.position.y = 1.05;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.6), new THREE.MeshStandardMaterial({
      map: carvedText(['PORT AURELLE', miles >= 0.95 ? `${miles.toFixed(miles < 10 ? 1 : 0)} MI` : `${Math.round(left)} PACES`, `ELDER GLEN ${(s / 1609).toFixed(1)}`], 160, 208, '#b8b2a4', '#4a4238'), roughness: 1,
    }));
    face.position.set(0, 0.62, 0.165);
    g.add(post, cap, face);
    g.position.set(x, y - 0.05, z);
    g.rotation.y = Math.atan2(-side.x, -side.y); // face the road
    g.traverse((o) => (o as THREE.Mesh).isMesh && (((o as THREE.Mesh).castShadow = true), ((o as THREE.Mesh).receiveShadow = true)));
    scene.add(g);
    physics.addBox(new THREE.Vector3(x, y + 0.5, z), new THREE.Vector3(0.28, 0.55, 0.16));
  }

  // Signposts: [x, z, [label, heading in radians (0 = +z)][]].
  const signs: [number, number, [string, number][]][] = [
    [128, 12, [['PORT AURELLE ►', Math.PI / 2 - 0.1], ['◄ ELDER GLEN', -Math.PI / 2]]],
    [-330, 128, [['CROWN ROAD · ROYAL CAPITAL', -1.7], ['ELDER GLEN', 1.4]]],
    [14, -306, [['GREENWOOD ROAD · ELVEN WOODS', -2.6], ['THE OLD CRYPT', 0]]],
    [24, 505, [['SOUTHERN MARCHES', 0.2], ['ELDER GLEN', Math.PI]]],
    [1046, 132, [['LANTERN CAMP', -0.1], ['PORT AURELLE', Math.PI / 2], ['ELDER GLEN', -Math.PI / 2]]],
    [1874, 150, [['HOLLOW RIDGE (DANGER)', -0.1], ['PORT AURELLE', Math.PI / 2]]],
    [2204, 160, [['GULL RIDGE OVERLOOK', -0.3]]],
    [636, 104, [['CHAPEL OF THE DAWN', 0.2]]],
    [-238, 90, [['THE GRAVEWOOD (DANGER)', -0.34], ['ELDER GLEN', Math.PI / 2 - 0.2]]],
  ];
  for (const [x, z, arms] of signs) {
    const y = heightAt(x, z);
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3, 8), m.timber);
    post.position.y = 1.5;
    g.add(post);
    arms.forEach(([label, heading], i) => {
      const board = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.34, 0.06), new THREE.MeshStandardMaterial({ map: carvedText([label], 420, 68, '#8a6a44', '#f4e8cc'), roughness: 0.9 }));
      board.geometry.translate(1.0, 0, 0);
      board.position.y = 2.6 - i * 0.42;
      board.rotation.y = heading - Math.PI / 2;
      g.add(board);
    });
    g.position.set(x, y, z);
    g.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
    scene.add(g);
  }

  // Closed roads: a barrier across the road and a note of why.
  for (const r of ROAD_SPECS) {
    if (!r.gate) continue;
    const [gx, gz] = r.gate.at;
    const s = distanceAlong(r, gx, gz);
    const p = pointAlong(r, s);
    const y = heightAt(p.x, p.z);
    const yaw = Math.atan2(p.dir.x, p.dir.y);
    const g = new THREE.Group();
    const half = ROAD_HALF[r.kind] + 1.5;
    if (r.id === 'forest') {
      // A fallen trunk and an elven marker stone, glowing faintly.
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, half * 2 + 3, 10), m.bark);
      trunk.rotation.z = Math.PI / 2;
      trunk.position.y = 0.5;
      const stone = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.2, 0.4), stoneMat);
      stone.position.set(half + 1.2, 1.1, 0.8);
      const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.2), new THREE.MeshBasicMaterial({ color: 0x7fffd0, transparent: true, opacity: 0.8, map: carvedText(['ᚨ', 'ᛚ', 'ᚠ'], 64, 160, '#000000', '#aaffe0') , blending: THREE.AdditiveBlending, depthWrite: false }));
      rune.position.set(half + 1.2, 1.2, 1.01);
      g.add(trunk, stone, rune);
    } else {
      // A timber barricade with a notice board (and, on the Crown Road, a guard post).
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.6, 0.25), m.timber);
        post.position.set(sx * half, 0.8, 0);
        g.add(post);
      }
      for (const yy of [0.6, 1.2]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.4, 0.18, 0.12), new THREE.MeshStandardMaterial({ color: yy > 1 ? 0xb8402e : 0xf1e6cc, roughness: 0.9 }));
        bar.position.y = yy;
        g.add(bar);
      }
      const note = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.7), new THREE.MeshStandardMaterial({ map: carvedText(['ROAD CLOSED', r.id === 'capital' ? 'BY ORDER OF THE CROWN' : 'FLOOD AT THE FORD'], 256, 180, '#efe3c2', '#3a2a1a'), roughness: 1 }));
      note.position.set(0, 1.0, -0.08);
      note.rotation.y = Math.PI;
      g.add(note);
    }
    g.position.set(p.x, y, p.z);
    g.rotation.y = yaw;
    g.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
    scene.add(g);
    // Block the road (and a little either side) with a wall of colliders.
    physics.addBox(new THREE.Vector3(p.x, y + 1.2, p.z), new THREE.Vector3(half + 6, 1.4, 0.5), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)));
    const pos = new THREE.Vector3(p.x - p.dir.x * 2.5, y, p.z - p.dir.y * 2.5);
    gates.push({ pos, reason: r.gate.reason, road: r.id });
    interactables.push({
      pos, radius: 4.5,
      label: () => (r.id === 'forest' ? 'Read the marker stone' : 'Read the notice'),
      enabled: () => true,
      action: () => talk(r.name, r.id === 'capital' ? 'Crown checkpoint' : r.id === 'forest' ? 'Elven marker stone' : 'Closed road', r.gate!.reason),
    });
  }
  return { interactables, gates };
}

export type { P2 };
