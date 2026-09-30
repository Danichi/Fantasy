import * as THREE from 'three';
import { registerDoor, type Door } from './doors';
import { buildHouse, worldUV, type WorldMats } from './buildings';
import { heightAt } from './terrainHeight';
import { physics } from '../physics/physics';
import { mulberry32 } from '../core/math';
import { StaticBatch, buildShip } from './cityKit';
import { CITY_STREETS, CITY_RESERVED, CITY_BOUNDS, MARKET, CANAL, CITADEL, LIGHTHOUSE, QUAY_X, WEST_GATE, NORTH_TERRACE_Z, type P2 } from './portCity';
import type { FX } from '../fx/particles';
import type { NpcRecord, Place, Settlement, ScheduleEntry } from '../npc/npcManager';
import type { Look } from '../npc/charBuilder';
import type { FishingSpot } from './fishing';

// Port Aurelle, the great port city of Cresha (World Expansion phase 5,
// prompt §5 and the design board): white stone and blue slate on a low
// peninsula, reached from the King's Road by a causeway through the West
// Gate. The Grand Market, the Adventurer's Quarter and its guild hall, the
// Knight's Academy and the citadel on the north terrace, the harbour with its
// quays, piers, cranes and ships, the Fisherman's Wharf, the Dwarven Quarter's
// forge, the canal and the Lower City, and the lighthouse on its mole.

export const PORT_SPOTS = {
  guildHall: new THREE.Vector3(2746, 0, 256),
  academyGate: new THREE.Vector3(2800, 0, 96),
  academyRing: new THREE.Vector3(2822, 0, 84),
  academyWall: new THREE.Vector3(2824, 0, 56),
  fishMarket: new THREE.Vector3(2912, 0, 296),
  forge: new THREE.Vector3(2736, 0, 306),
  berth: new THREE.Vector3(2930, 0, 150),
  stable: new THREE.Vector3(2716, 0, 164),
  thievesDoor: new THREE.Vector3(2873.4, 0, 300),
  dormitory: new THREE.Vector3(2790, 0, 64.4),
};

const v = (x: number, z: number, dy = 0) => new THREE.Vector3(x, heightAt(x, z) + dy, z);

function signMat(text: string, sub = '', bg = '#f4ead0', ink = '#23324a') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#c9a55a'; g.lineWidth = 10; g.strokeRect(5, 5, 502, 118);
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 40px Cinzel, serif'; g.fillText(text, 256, sub ? 50 : 64);
  if (sub) { g.font = '600 22px Cinzel, serif'; g.fillText(sub, 256, 94); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, side: THREE.DoubleSide });
}

function bannerMat(field: number, emblem: number) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 160;
  const g = c.getContext('2d')!;
  g.fillStyle = '#' + field.toString(16).padStart(6, '0'); g.fillRect(0, 0, 64, 160);
  g.fillStyle = '#' + emblem.toString(16).padStart(6, '0');
  g.beginPath(); g.moveTo(32, 40); g.lineTo(48, 70); g.lineTo(32, 100); g.lineTo(16, 70); g.closePath(); g.fill();
  g.fillRect(0, 0, 64, 8);
  g.beginPath(); g.moveTo(0, 160); g.lineTo(32, 140); g.lineTo(64, 160); g.fillStyle = '#000'; g.globalCompositeOperation = 'destination-out'; g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
}

export interface PortAurelle {
  settlement: Settlement;
  records: NpcRecord[];
  fishingSpots: FishingSpot[];
  clearings: [number, number, number][];
  update(dt: number, night: number): void;
}

export function buildPortAurelle(scene: THREE.Scene, m: WorldMats, fx: FX): PortAurelle {
  const rnd = mulberry32(2760);
  const batch = new StaticBatch();
  const clearings: [number, number, number][] = [];
  const lights: { mat: THREE.MeshStandardMaterial; base: number }[] = [];
  const whiteStone = (m.bridgeStone ?? m.stone) as THREE.MeshStandardMaterial;
  const white = whiteStone.clone();
  white.color = new THREE.Color().setRGB(1.75, 1.7, 1.6); // lift the painted stone to Aurelle white
  const blueRoof = new THREE.MeshStandardMaterial({ color: 0x33507e, roughness: 0.7 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8b060, metalness: 0.7, roughness: 0.35 });

  const addMesh = (g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0, uv = 1.5) => {
    const mesh = new THREE.Mesh(worldUV(g, uv), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    batch.addObject(mesh);
  };
  const solid = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) =>
    physics.addBox(new THREE.Vector3(x, y, z), new THREE.Vector3(w / 2, h / 2, d / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)));
  const tower = (x: number, z: number, r: number, h: number, roof = blueRoof, base?: number) => {
    const y = base ?? heightAt(x, z) - 0.5;
    addMesh(new THREE.CylinderGeometry(r, r * 1.08, h, 16), white, x, y + h / 2, z, 0, 1.2);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      addMesh(new THREE.BoxGeometry(0.8, 0.9, 0.6), white, x + Math.cos(a) * r, y + h + 0.45, z + Math.sin(a) * r, -a, 1.2);
    }
    if (roof) addMesh(new THREE.ConeGeometry(r * 1.15, r * 1.6, 16), roof, x, y + h + 0.9 + r * 0.8, z, 0, 1);
    physics.addCylinder(new THREE.Vector3(x, y + h / 2, z), h / 2, r);
    return y + h;
  };
  const house = (x: number, z: number, rot: number, spec: Parameters<typeof buildHouse>[0], info: Partial<Door> = {}) => {
    const { group, half, door } = buildHouse(spec, m);
    let gy = Infinity;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) gy = Math.min(gy, heightAt(x + Math.cos(rot) * sx * half.x + Math.sin(rot) * sz * half.z, z - Math.sin(rot) * sx * half.x + Math.cos(rot) * sz * half.z));
    group.position.set(x, gy, z);
    group.rotation.y = rot;
    registerDoor(group, door, spec, info);
    batch.addObject(group);
    physics.addBox(new THREE.Vector3(x, gy + half.y, z), half, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)));
    return { gy, half };
  };
  /**
   * A painted sign on a wooden board. Without `y` it stands on two posts and
   * reads from both sides; with `y` it is mounted on a wall (backing board only).
   */
  const sign = (text: string, sub: string, x: number, z: number, yaw: number, w = 4, y?: number) => {
    const h = w / 4;
    const cy = y ?? heightAt(x, z) + 3.2;
    const mat = signMat(text, sub);
    const board = new THREE.Group();
    board.position.set(x, cy, z);
    board.rotation.y = yaw;
    const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.18, h + 0.18, 0.08), m.timber);
    back.castShadow = true;
    const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    front.position.z = 0.045;
    board.add(back, front);
    if (y === undefined) {
      const rear = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      rear.position.z = -0.045;
      rear.rotation.y = Math.PI;
      board.add(rear);
      // Two posts down to the ground, one each side of the board.
      const ground = heightAt(x, z);
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, cy - ground + h / 2 + 0.1, 0.16), m.timber);
        post.position.set(s * (w / 2 + 0.05), (ground - cy + h / 2 + 0.1) / 2 - 0.02, 0);
        post.castShadow = true;
        board.add(post);
      }
    }
    scene.add(board);
  };
  const banner = (x: number, y: number, z: number, yaw: number, field = 0x2f5f9a, emblem = 0xe0b040) => {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.8), bannerMat(field, emblem));
    b.position.set(x, y, z);
    b.rotation.y = yaw;
    scene.add(b);
  };
  const lantern = (x: number, z: number) => {
    const y = heightAt(x, z);
    addMesh(new THREE.CylinderGeometry(0.07, 0.1, 3.4, 8), m.timber, x, y + 1.7, z);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffb050, emissiveIntensity: 0.3 });
    lights.push({ mat, base: 0.3 });
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.4, 0.28), mat);
    l.position.set(x, y + 3.5, z);
    scene.add(l);
  };

  // ---- Streets: ordinary houses on lots along both sides ------------------------------------
  const reserved = (x: number, z: number, r: number) => CITY_RESERVED.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr + r);
  const onStreet = (x: number, z: number, r: number) => {
    for (const line of CITY_STREETS) for (let i = 0; i < line.length - 1; i++) {
      const [ax, az] = line[i], [bx, bz] = line[i + 1];
      const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
      if (Math.hypot(x - ax - vx * t, z - az - vz * t) < r + 3.4) return true;
    }
    return false;
  };
  const inCity = (x: number, z: number) => x > CITY_BOUNDS.x0 + 6 && x < QUAY_X - 14 && z > CITY_BOUNDS.z0 + 6 && z < CITY_BOUNDS.z1 - 6;
  const placed: [number, number, number][] = [];
  let seed = 7000;
  for (const line of CITY_STREETS.slice(0, 9)) {
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, az] = line[i], [bx, bz] = line[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      for (let s = 6; s < len - 4; s += 9 + rnd() * 3) {
        for (const side of [-1, 1]) {
          const lower = az > 250 || bz > 250;
          const w = lower ? 6 + rnd() * 2 : 7 + rnd() * 3, d = 6 + rnd() * 2.5;
          const off = 4 + d / 2 + 0.6;
          const x = ax + dx * s - dz * off * side, z = az + dz * s + dx * off * side;
          const r = Math.max(w, d) / 2 + 0.8;
          if (!inCity(x, z) || reserved(x, z, r) || onStreet(x, z, r - 1.5)) continue;
          if (Math.abs(z - CANAL.z) < CANAL.half + r + 1 && x > CANAL.x0 - r) continue;
          if (Math.abs(z - NORTH_TERRACE_Z) < r + 2) continue; // not astride the terrace edge
          if (placed.some(([px, pz, pr]) => Math.hypot(px - x, pz - z) < pr + r + 0.6)) continue;
          placed.push([x, z, r]);
          // Face the street: the lot sits at +perp*side, so the street lies the other way.
          const rot = Math.atan2(dz * side, -dx * side);
          const roof = rnd() < 0.62 ? 'slate' : 'tile';
          house(x, z, rot, { w, d, floors: lower && rnd() < 0.5 ? 1 : 2, roof, seed: seed++ });
        }
      }
    }
  }

  // Infill: the blocks between streets fill with houses facing their nearest street.
  const nearestStreet = (x: number, z: number) => {
    let best = Infinity, bx = x, bz = z;
    for (const line of CITY_STREETS.slice(0, 9)) for (let i = 0; i < line.length - 1; i++) {
      const [ax, az] = line[i], [cx, cz] = line[i + 1];
      const vx = cx - ax, vz = cz - az, l2 = vx * vx + vz * vz;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
      const px = ax + vx * t, pz = az + vz * t, d = Math.hypot(x - px, z - pz);
      if (d < best) (best = d), (bx = px), (bz = pz);
    }
    return { d: best, x: bx, z: bz };
  };
  for (let x = CITY_BOUNDS.x0 + 12; x < QUAY_X - 16; x += 11) {
    for (let z = CITY_BOUNDS.z0 + 12; z < CITY_BOUNDS.z1 - 10; z += 11) {
      const px = x + (rnd() - 0.5) * 3, pz = z + (rnd() - 0.5) * 3;
      const w = 6.5 + rnd() * 2.5, d = 6 + rnd() * 2;
      const r = Math.max(w, d) / 2 + 0.6;
      if (!inCity(px, pz) || reserved(px, pz, r) || onStreet(px, pz, r - 1)) continue;
      if (Math.abs(pz - CANAL.z) < CANAL.half + r + 1 && px > CANAL.x0 - r) continue;
      if (Math.abs(pz - NORTH_TERRACE_Z) < r + 2) continue;
      if (placed.some(([qx, qz, qr]) => Math.hypot(qx - px, qz - pz) < qr + r + 0.8)) continue;
      const ns = nearestStreet(px, pz);
      if (ns.d > 30) continue; // leave the odd garden and yard open
      placed.push([px, pz, r]);
      house(px, pz, Math.atan2(ns.x - px, ns.z - pz), { w, d, floors: rnd() < 0.3 ? 1 : 2, roof: rnd() < 0.62 ? 'slate' : 'tile', seed: seed++ });
    }
  }

  // ---- Walls, towers and the West Gate -----------------------------------------------------------
  const wallRun = (ax: number, az: number, bx: number, bz: number, h = 7, gaps: [number, number][] = []) => {
    const len = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(bx - ax, bz - az);
    const n = Math.ceil(len / 8);
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const mx = ax + (bx - ax) * (t0 + t1) / 2, mz = az + (bz - az) * (t0 + t1) / 2;
      if (gaps.some(([gx, gz]) => Math.hypot(mx - gx, mz - gz) < 7)) continue;
      const y = heightAt(mx, mz) - 1;
      const seg = len / n + 0.05;
      addMesh(new THREE.BoxGeometry(2.2, h, seg), white, mx, y + h / 2, mz, yaw, 1.2);
      for (let c = 0; c < 3; c++) {
        const t = t0 + (t1 - t0) * (c + 0.5) / 3;
        addMesh(new THREE.BoxGeometry(2.4, 0.9, 0.9), white, ax + (bx - ax) * t, y + h + 0.45, az + (bz - az) * t, yaw, 1.2);
      }
      solid(2.2, h, seg, mx, y + h / 2, mz, yaw);
    }
  };
  const B = CITY_BOUNDS;
  wallRun(B.x0, B.z0 + 30, B.x0, B.z1, 8, [[WEST_GATE[0], WEST_GATE[1]]]);
  wallRun(B.x0, B.z1, QUAY_X - 20, B.z1, 7);
  for (const [x, z] of [[B.x0, B.z0 + 30], [B.x0, 90], [B.x0, 210], [B.x0, 270], [B.x0, B.z1], [2800, B.z1], [QUAY_X - 20, B.z1]] as P2[]) tower(x, z, 3.2, 11);
  {
    // The West Gate: twin towers, an arch and a raised portcullis, flying the royal blue.
    const [gx, gz] = WEST_GATE;
    const gy = heightAt(gx, gz) - 0.5;
    const top1 = tower(gx, gz - 9, 4.2, 14, blueRoof, gy);
    tower(gx, gz + 9, 4.2, 14, blueRoof, gy);
    addMesh(new THREE.BoxGeometry(3, 4, 10), white, gx, gy + 10, gz, 0, 1.2);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.9, 8, 18, Math.PI), white);
    arch.rotation.y = Math.PI / 2;
    arch.position.set(gx, gy + 7.6, gz);
    batch.addObject(arch);
    const port = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0x3a3632, metalness: 0.6, roughness: 0.5 }));
    port.position.set(gx + 0.8, gy + 10.6, gz);
    scene.add(port);
    for (const s of [-1, 1]) banner(gx - 4.4, top1 - 4, gz + s * 9, -Math.PI / 2);
    sign('PORT AURELLE', 'Jewel of the Grand Ocean', gx - 1.8, gz, -Math.PI / 2, 6, gy + 13.2);
    clearings.push([gx, gz, 22]);
  }
  // Stone parapets along the causeway.
  for (const s of [-1, 1]) {
    for (let x = 2562; x < 2694; x += 6) addMesh(new THREE.BoxGeometry(6.1, 1, 0.6), white, x + 3, heightAt(x + 3, 150 + s * 6.4) + 0.6, 150 + s * 6.4, 0, 1.2);
  }

  // ---- The Grand Market -------------------------------------------------------------------------------
  {
    const [mx, mz] = MARKET;
    const my = heightAt(mx, mz);
    // Fountain: a basin, a column and a gilded ship on top.
    addMesh(new THREE.CylinderGeometry(4.2, 4.4, 0.9, 24, 1, true), white, mx, my + 0.45, mz, 0, 1.2);
    addMesh(new THREE.TorusGeometry(4.25, 0.3, 6, 28).rotateX(Math.PI / 2), white, mx, my + 0.95, mz, 0, 1.2);
    addMesh(new THREE.CylinderGeometry(0.6, 0.9, 3.4, 12), white, mx, my + 1.7, mz, 0, 1.2);
    const water = new THREE.Mesh(new THREE.CircleGeometry(4.1, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a8ab0, roughness: 0.1, metalness: 0.1 }));
    water.position.set(mx, my + 0.6, mz);
    scene.add(water);
    const ship = buildShip('sloop', 0xd8b060, 0xd8b060).group;
    ship.scale.setScalar(0.18);
    ship.position.set(mx, my + 3.4, mz);
    ship.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) mm.material = gold; });
    scene.add(ship);
    physics.addCylinder(new THREE.Vector3(mx, my + 0.5, mz), 0.5, 4.4);
    fountainAt.set(mx, my + 3.2, mz);
    // A ring of stalls with bright awnings.
    const cols = [0xb8402e, 0x2f5f9a, 0x3d7a45, 0xc9922a, 0x7a3f8a, 0x2f7f86, 0xb8402e, 0x2f5f9a];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.2;
      if (Math.abs(Math.sin(a - 0.2)) < 0.2 && Math.cos(a) < 0) continue; // leave the avenue open
      const sx = mx + Math.cos(a) * 16, sz = mz + Math.sin(a) * 16;
      const sy = heightAt(sx, sz);
      const yaw = -a - Math.PI / 2;
      for (const [px, pz] of [[-1.4, -0.8], [1.4, -0.8], [-1.4, 0.8], [1.4, 0.8]]) {
        const cx = sx + Math.cos(-yaw) * px - Math.sin(-yaw) * pz, cz = sz + Math.sin(-yaw) * px + Math.cos(-yaw) * pz;
        addMesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), m.timber, cx, sy + 1.3, cz, yaw);
      }
      addMesh(new THREE.BoxGeometry(3, 0.9, 0.8), m.planks, sx, sy + 0.45, sz, yaw);
      const aw = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.06, 2.2), new THREE.MeshStandardMaterial({ color: cols[k], roughness: 0.9 }));
      aw.position.set(sx, sy + 2.7, sz);
      aw.rotation.y = yaw;
      aw.rotation.x = 0.12;
      scene.add(aw);
      solid(3, 1, 0.9, sx, sy + 0.5, sz, yaw);
    }
    for (const a of [0.6, 2.2, 3.8, 5.4]) lantern(mx + Math.cos(a) * 23, mz + Math.sin(a) * 23);
    sign('GRAND MARKET', '', mx, mz - 26, 0, 4);
  }

  // ---- The Knight's Academy ------------------------------------------------------------------------
  {
    const cx = 2806, cz = 70;
    const y0 = heightAt(cx, cz) - 0.6;
    const W = 64, D = 44;
    const wall = (ax: number, az: number, bx: number, bz: number, gap?: P2) => {
      const len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
      const n = Math.ceil(len / 6);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        if (gap && Math.hypot(x - gap[0], z - gap[1]) < 4.5) continue;
        addMesh(new THREE.BoxGeometry(1.6, 6, len / n + 0.05), white, x, y0 + 3, z, yaw, 1.2);
        solid(1.6, 6, len / n, x, y0 + 3, z, yaw);
      }
    };
    wall(cx - W / 2, cz - D / 2, cx + W / 2, cz - D / 2);
    wall(cx + W / 2, cz - D / 2, cx + W / 2, cz + D / 2);
    wall(cx + W / 2, cz + D / 2, cx - W / 2, cz + D / 2, [2800, cz + D / 2]);
    wall(cx - W / 2, cz + D / 2, cx - W / 2, cz - D / 2);
    for (const [tx, tz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) tower(cx + tx * W / 2, cz + tz * D / 2, 3, 12, blueRoof, y0);
    // Main hall (north side) and the library (west).
    addMesh(new THREE.BoxGeometry(34, 11, 12), white, cx - 4, y0 + 5.5, cz - 13, 0, 1.2);
    for (const s of [-1, 1]) {
      const r = new THREE.BoxGeometry(35, 0.4, 7.4);
      r.rotateX(s * -0.62);
      r.translate(0, 0, s * 3.1);
      addMesh(r, blueRoof, cx - 4, y0 + 13, cz - 13);
    }
    solid(34, 11, 12, cx - 4, y0 + 5.5, cz - 13);
    addMesh(new THREE.BoxGeometry(12, 8, 16), white, cx - 24, y0 + 4, cz + 4, 0, 1.2);
    addMesh(new THREE.ConeGeometry(9, 4, 4).rotateY(Math.PI / 4).scale(0.8, 1, 1.1), blueRoof, cx - 24, y0 + 10, cz + 4);
    solid(12, 8, 16, cx - 24, y0 + 4, cz + 4);
    // Tall windows on the hall.
    for (let k = -3; k <= 3; k++) {
      const wm = new THREE.MeshStandardMaterial({ color: 0x2c3a58, emissive: 0xffc070, emissiveIntensity: 0.15 });
      lights.push({ mat: wm, base: 0.15 });
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 3.6), wm);
      w.position.set(cx - 4 + k * 4.4, y0 + 6, cz - 6.95);
      scene.add(w);
    }
    for (let k = -2; k <= 2; k++) banner(cx - 4 + k * 6.6 + 3.3, y0 + 7.5, cz - 6.9, 0, 0x2f5f9a, 0xe0b040);
    // The sparring ring: sand, a rope on posts.
    const [rx, rz] = [2822, 84];
    const ry = heightAt(rx, rz);
    const sand = new THREE.Mesh(new THREE.CircleGeometry(9, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd8c49a, roughness: 1 }));
    sand.position.set(rx, ry + 0.04, rz);
    sand.receiveShadow = true;
    scene.add(sand);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      addMesh(new THREE.CylinderGeometry(0.08, 0.1, 1.2, 6), m.timber, rx + Math.cos(a) * 9.2, ry + 0.6, rz + Math.sin(a) * 9.2);
    }
    const rope = new THREE.Mesh(new THREE.TorusGeometry(9.2, 0.04, 4, 48).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc9a870 }));
    rope.position.set(rx, ry + 1.05, rz);
    scene.add(rope);
    for (let k = 0; k < 4; k++) addMesh(new THREE.CylinderGeometry(0.2, 0.25, 1.9, 8), m.planks, cx + 18 + (k % 2) * 3, heightAt(cx + 18, cz - 8) + 0.95, cz - 8 - Math.floor(k / 2) * 4);
    // The cadets' dormitory door in the main hall's south face.
    addMesh(new THREE.BoxGeometry(1.8, 2.8, 0.14), m.planks, 2790, y0 + 1.4, cz - 6.95);
    addMesh(new THREE.BoxGeometry(2.3, 0.3, 0.3), white, 2790, y0 + 2.95, cz - 6.9);
    sign('DORMITORY', 'Cadets and Squires', 2790, cz - 6.6, 0, 2.4, y0 + 3.9);
    sign("KNIGHT'S ACADEMY", 'Strength · Discipline · Honour', 2800, cz + D / 2 + 0.9, 0, 5, y0 + 7.4);
    clearings.push([cx, cz, 40]);
  }

  // ---- The citadel on the hill -------------------------------------------------------------------------
  {
    const [cx, cz] = CITADEL;
    const y = heightAt(cx, cz) - 0.8;
    addMesh(new THREE.BoxGeometry(24, 12, 18), white, cx, y + 6, cz, 0.1, 1.2);
    solid(24, 12, 18, cx, y + 6, cz, 0.1);
    addMesh(new THREE.ConeGeometry(15, 6, 4).rotateY(Math.PI / 4).scale(1.1, 1, 0.8), blueRoof, cx, y + 15, cz, 0.1);
    tower(cx - 12, cz - 9, 3.6, 22, blueRoof, y);
    tower(cx + 12, cz - 8, 3.6, 20, blueRoof, y);
    const keepTop = tower(cx + 2, cz + 11, 4.6, 28, blueRoof, y);
    banner(cx + 2, keepTop - 6, cz + 15.7, 0, 0x2f5f9a, 0xe0b040);
    clearings.push([cx, cz, 34]);
  }

  // ---- Noble district: mansions with gardens -----------------------------------------------------------
  for (const [x, z, rot, s] of [[2736, 66, 0.1, 1], [2764, 52, -0.15, 2], [2724, 94, Math.PI, 3], [2850, 104, Math.PI, 4]] as [number, number, number, number][]) {
    house(x, z, rot, { w: 12 + s % 2 * 2, d: 10, floors: 2, roof: 'slate', seed: 9100 + s }, { kind: 'home', name: 'a noble house' });
    for (let k = 0; k < 6; k++) addMesh(new THREE.BoxGeometry(2.4, 1.1, 0.9), new THREE.MeshStandardMaterial({ color: 0x3f6f34, roughness: 1 }), x - 6 + k * 2.4, heightAt(x, z + 8) + 0.55, z + (rot > 1 ? -8 : 8));
  }

  // ---- The Adventurer's Quarter ----------------------------------------------------------------------
  {
    const [gx, gz] = [2746, 244];
    house(gx, gz, 0, { w: 22, d: 15, floors: 2, roof: 'slate', seed: 9201 }, { kind: 'guild', name: 'The Adventurer’s Guild', keeper: 'guildmaster' });
    sign("ADVENTURER'S GUILD", 'Port Aurelle Hall · Ranks D to SSS', gx, gz + 8.6, 0, 6, heightAt(gx, gz) + 4.4);
    for (const s of [-1, 1]) banner(gx + s * 8, heightAt(gx, gz) + 4.8, gz + 7.8, 0, 0x8a3a2a, 0xe0b040);
    house(2784, 252, -0.05, { w: 11, d: 9, floors: 2, roof: 'tile', seed: 9202 }, { kind: 'tavern', name: 'The Salty Anchor', keeper: 'bess' });
    sign('THE SALTY ANCHOR', 'Ale · Rooms · Sea shanties', 2784, 257, 0, 4);
    for (const [x, z] of [[2728, 226], [2766, 226], [2808, 238]]) lantern(x, z);
  }

  // ---- The Dwarven Quarter -------------------------------------------------------------------------------
  {
    const [fx0, fz0] = [2736, 306];
    const y = heightAt(fx0, fz0);
    addMesh(new THREE.BoxGeometry(14, 5, 9), m.stone, fx0, y + 2.5, fz0 - 3, 0, 1.2);
    solid(14, 5, 9, fx0, y + 2.5, fz0 - 3);
    const r = new THREE.BoxGeometry(15, 0.4, 10);
    r.rotateX(0.18);
    addMesh(r, m.slate, fx0, y + 5.4, fz0 - 3);
    addMesh(new THREE.BoxGeometry(2, 7, 2), m.stone, fx0 + 5, y + 6, fz0 - 5, 0, 1.2);
    // The open forge: glowing coals, an anvil, a quench trough.
    const coal = new THREE.MeshStandardMaterial({ color: 0x3a1a0a, emissive: 0xff5a10, emissiveIntensity: 1.6 });
    const hearth = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 1.6), coal);
    hearth.position.set(fx0 - 3, y + 1.0, fz0 + 2.6);
    scene.add(hearth);
    addMesh(new THREE.BoxGeometry(2.6, 0.9, 2), m.stone, fx0 - 3, y + 0.45, fz0 + 2.6);
    addMesh(new THREE.BoxGeometry(0.9, 0.3, 0.35), m.stone, fx0 + 1, y + 0.85, fz0 + 3);
    forgeAt.set(fx0 - 3, y + 1.4, fz0 + 2.6);
    const light = new THREE.PointLight(0xff7a30, 3, 14, 1.6);
    light.position.set(fx0 - 3, y + 2, fz0 + 3);
    scene.add(light);
    forgeLight = light;
    sign('WHITE MOUNTAIN MINING OFFICE', 'Bruni Stonevein · Expeditions', fx0 + 6, fz0 + 1.8, 0, 5.4);
    for (let k = 0; k < 3; k++) addMesh(new THREE.BoxGeometry(1.4, 0.8, 1), m.planks, fx0 + 8 + k * 1.8, y + 0.4, fz0 + 5);
  }

  // ---- The harbour: quay wall, piers, cranes, warehouses, ships -----------------------------------
  const piers: [number, number][] = [[98, 42], [130, 46], [236, 42], [262, 36]];
  const craneBooms: THREE.Object3D[] = [];
  {
    for (let z = 34; z < 326; z += 8) addMesh(new THREE.BoxGeometry(2.4, 3.6, 8.05), white, QUAY_X + 1.2, SEA_Y + 0.4, z + 4, 0, 1.2);
    for (const [pz, len] of piers) {
      for (let x = QUAY_X + 2.4; x < QUAY_X + len; x += 3) {
        addMesh(new THREE.BoxGeometry(3.05, 0.3, 4.4), m.planks, x + 1.5, 1.05, pz, 0, 1);
        for (const s of [-1, 1]) addMesh(new THREE.CylinderGeometry(0.18, 0.2, 4.6, 6), m.timber, x + 1.5, -1.2, pz + s * 2.1);
      }
      solid(len, 0.4, 4.4, QUAY_X + len / 2, 1.0, pz);
      for (const s of [-1, 1]) addMesh(new THREE.CylinderGeometry(0.2, 0.24, 0.8, 8), m.timber, QUAY_X + len - 2, 1.5, pz + s * 1.7);
    }
    // Ships at the piers.
    // All six ship types of the Grand Ocean (sailing opens in a later chapter):
    // merchantmen, the great ocean vessel, a sloop, a Crown naval ship, and
    // the dwarves' expedition ship, the Iron Kettle, at the berth.
    const fleet: [number, number, Parameters<typeof buildShip>[0], number][] = [[98, 1, 'merchant', 0x5a3a24], [130, -1, 'galleon', 0x5a3420], [236, 1, 'naval', 0x2a3a5a], [262, -1, 'sloop', 0x2f4a6a], [150, 0, 'expedition', 0x6a4a2a]];
    for (const [pz, side, kind, col] of fleet) {
      const { group, beam, length } = buildShip(kind, col);
      const x = side === 0 ? QUAY_X + 30 : QUAY_X + 6 + length / 2 + 4;
      const z = side === 0 ? pz : pz + side * (2.2 + beam / 2 + 1.2);
      group.position.set(x, SEA_Y - 0.3, z);
      group.rotation.y = Math.PI / 2 + (side === 0 ? 0.05 : 0);
      scene.add(group);
      ships.push({ g: group, phase: rnd() * 6, y: SEA_Y - 0.3 });
      physics.addBox(new THREE.Vector3(x, SEA_Y + 1, z), new THREE.Vector3(length / 2, 2.5, beam / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)));
    }
    // Two cranes swing cargo between the quay and the ships.
    for (const [x, z] of [[QUAY_X - 3, 114], [QUAY_X - 3, 250]]) {
      const y = heightAt(x, z);
      addMesh(new THREE.BoxGeometry(0.5, 9, 0.5), m.timber, x, y + 4.5, z);
      for (const s of [-1, 1]) addMesh(new THREE.BoxGeometry(0.3, 6, 0.3).rotateZ(s * 0.35), m.timber, x + s * 1, y + 2.8, z);
      const boom = new THREE.Group();
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 12), m.timber);
      arm.position.z = 3.5;
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 5), new THREE.MeshStandardMaterial({ color: 0xc9a870 }));
      rope.position.set(0, -2.5, 9);
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 1.2), m.planks);
      crate.position.set(0, -5.2, 9);
      boom.add(arm, rope, crate);
      boom.position.set(x, y + 9, z);
      boom.rotation.x = -0.2;
      boom.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
      scene.add(boom);
      craneBooms.push(boom);
    }
    // The Iron Kettle's name board at the berth.
    sign('IRON KETTLE', 'White Mountain Expedition', QUAY_X - 1.5, 150, Math.PI / 2, 3.6, 2.8);
    // The shipyard: a hull taking shape on the slipway at the north quay.
    {
      const sx = QUAY_X - 16, sz = 48, sy = heightAt(sx, sz);
      addMesh(new THREE.BoxGeometry(6, 0.6, 30), m.planks, sx, sy + 0.3, sz, Math.PI / 2 - 0.05);
      addMesh(new THREE.BoxGeometry(0.5, 0.6, 22), m.timber, sx, sy + 1.1, sz, Math.PI / 2);
      for (let k = -9; k <= 9; k += 1.5) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(2.6 - Math.abs(k) * 0.12, 0.14, 5, 12, Math.PI), m.timber);
        rib.rotation.set(Math.PI, Math.PI / 2, 0);
        rib.position.set(sx + k, sy + 3.6, sz);
        batch.addObject(rib);
      }
      // The lower strakes are planked; the upper ribs still stand bare.
      for (const sd of [-1, 1]) for (const th of [0.3, 0.62, 0.94]) {
        const r = 2.5;
        const strake = new THREE.Mesh(new THREE.BoxGeometry(17 - th * 5, 0.08, 0.62), m.planks);
        strake.rotation.x = sd * th;
        strake.position.set(sx, sy + 3.6 - r * Math.cos(th), sz + sd * r * Math.sin(th));
        batch.addObject(strake);
      }
      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.2, 0.4), m.timber);
      stem.rotation.z = -0.35;
      stem.position.set(sx + 11, sy + 3.2, sz);
      batch.addObject(stem);
      addMesh(new THREE.BoxGeometry(0.4, 3.2, 0.4), m.timber, sx - 10.2, sy + 2.7, sz);
      for (const sd of [-1, 1]) for (let k = -8; k <= 8; k += 4) addMesh(new THREE.BoxGeometry(0.25, 5, 0.25), m.timber, sx + k, sy + 2.5, sz + sd * 3.4);
      addMesh(new THREE.BoxGeometry(20, 0.2, 0.3), m.timber, sx, sy + 5, sz + 3.4);
      addMesh(new THREE.BoxGeometry(20, 0.2, 0.3), m.timber, sx, sy + 5, sz - 3.4);
      sign('AURELLE SHIPWRIGHTS', 'Hulls laid to order', sx, sz + 8, 0, 4);
      solid(22, 4, 6, sx, sy + 2, sz);
    }
    // Warehouses and the customs house.
    house(2912, 130, Math.PI / 2, { w: 22, d: 12, floors: 2, roof: 'tile', seed: 9301 }, { kind: 'hall', name: 'the warehouse' });
    house(2912, 236, Math.PI / 2, { w: 22, d: 12, floors: 2, roof: 'slate', seed: 9302 }, { kind: 'hall', name: 'the warehouse' });
    house(2918, 176 + 14, Math.PI / 2, { w: 10, d: 8, floors: 2, roof: 'slate', seed: 9303 }, { kind: 'hall', name: 'The Customs House', keeper: 'tallow' });
    sign('CUSTOMS HOUSE', 'Harbourmaster', QUAY_X - 7.2, 190, Math.PI / 2, 4);
    for (let k = 0; k < 18; k++) {
      const x = QUAY_X - 4 - rnd() * 6, z = 60 + rnd() * 250;
      if (piers.some(([pz]) => Math.abs(z - pz) < 4)) continue;
      addMesh(rnd() < 0.5 ? new THREE.BoxGeometry(1.1, 1, 1.1) : new THREE.CylinderGeometry(0.45, 0.5, 1.1, 10), m.planks, x, heightAt(x, z) + 0.5, z, rnd() * 3);
    }
    for (let z = 60; z < 320; z += 26) lantern(QUAY_X - 1.8, z);
  }

  // ---- Fisherman's Wharf ------------------------------------------------------------------------------
  {
    const [wx, wz] = [2926, 300];
    for (let x = wx; x < QUAY_X + 34; x += 3) addMesh(new THREE.BoxGeometry(3.05, 0.25, 6), m.planks, x + 1.5, 0.9, wz + 14, 0, 1);
    solid(QUAY_X + 34 - wx, 0.3, 6, (wx + QUAY_X + 34) / 2, 0.85, wz + 14);
    for (let k = 0; k < 4; k++) {
      const { group } = buildShip('fishing', [0x3a6a8a, 0x8a3a2a, 0x3a7a4a, 0x7a6a3a][k], 0xe8dcc0);
      group.position.set(QUAY_X + 8 + k * 7, SEA_Y - 0.2, wz + 20.5);
      group.rotation.y = 0.05 * k;
      scene.add(group);
      ships.push({ g: group, phase: k * 1.3, y: SEA_Y - 0.2 });
    }
    // Drying racks with fish and nets.
    for (let k = 0; k < 3; k++) {
      const x = wx - 8 + k * 5, z = wz - 4, y = heightAt(x, z);
      for (const s of [-1, 1]) addMesh(new THREE.BoxGeometry(0.12, 2, 0.12), m.timber, x + s * 1.8, y + 1, z);
      addMesh(new THREE.BoxGeometry(3.8, 0.08, 0.08), m.timber, x, y + 1.9, z);
      for (let f = 0; f < 6; f++) {
        const fish = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4).scale(0.4, 2.2, 0.8), new THREE.MeshStandardMaterial({ color: 0x9ab0b8, metalness: 0.3, roughness: 0.5 }));
        fish.position.set(x - 1.5 + f * 0.6, y + 1.6, z);
        scene.add(fish);
      }
    }
    // The fish market: a long counter under a green awning.
    const fy = heightAt(PORT_SPOTS.fishMarket.x, PORT_SPOTS.fishMarket.z);
    addMesh(new THREE.BoxGeometry(8, 0.9, 1.2), m.planks, PORT_SPOTS.fishMarket.x, fy + 0.45, PORT_SPOTS.fishMarket.z + 1.4);
    const aw = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 3), new THREE.MeshStandardMaterial({ color: 0x3d7a45, roughness: 0.9 }));
    aw.position.set(PORT_SPOTS.fishMarket.x, fy + 2.8, PORT_SPOTS.fishMarket.z + 1.4);
    scene.add(aw);
    for (const s of [-1, 1]) for (const t of [-1, 1]) addMesh(new THREE.BoxGeometry(0.12, 2.8, 0.12), m.timber, PORT_SPOTS.fishMarket.x + s * 4.3, fy + 1.4, PORT_SPOTS.fishMarket.z + 1.4 + t * 1.3);
    solid(8, 1, 1.2, PORT_SPOTS.fishMarket.x, fy + 0.5, PORT_SPOTS.fishMarket.z + 1.4);
    sign("FISHERMAN'S WHARF", 'Fish Market · Boat Hire', wx - 12, wz - 9, 0, 5);
  }

  // ---- The Lower City: the Drowned Lantern and a door that is not quite hidden ------------------------
  {
    const [tx, tz] = [2880, 300];
    house(tx, tz, Math.PI, { w: 9, d: 8, floors: 2, roof: 'tile', seed: 9401 }, { kind: 'tavern', name: 'The Drowned Lantern' });
    sign('THE DROWNED LANTERN', '', tx, tz - 4.8, Math.PI, 3.4);
    const lm = new THREE.MeshStandardMaterial({ color: 0x3a6a5a, emissive: 0x3aff9a, emissiveIntensity: 0.25 });
    lights.push({ mat: lm, base: 0.25 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), lm);
    lamp.position.set(tx + 3, heightAt(tx + 3, tz - 4.6) + 2.8, tz - 4.6);
    scene.add(lamp);
    // A cellar trapdoor in the alley, painted with a small open hand.
    const [dx, dz] = [2873.4, 300];
    const dy = heightAt(dx, dz);
    addMesh(new THREE.BoxGeometry(1.6, 0.12, 1.2), m.planks, dx, dy + 0.06, dz);
    const hand = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a2a2a, roughness: 1 }));
    hand.position.set(dx, dy + 0.13, dz);
    scene.add(hand);
    PORT_SPOTS.thievesDoor.set(dx, dy, dz);
  }

  // ---- The canal ---------------------------------------------------------------------------------------------
  {
    const len = QUAY_X + 2 - CANAL.x0;
    for (const s of [-1, 1]) addMesh(new THREE.BoxGeometry(len, 4, 1.2), white, CANAL.x0 + len / 2, -0.8, CANAL.z + s * (CANAL.half + 0.6), 0, 1.2);
    addMesh(new THREE.BoxGeometry(1.2, 4, CANAL.half * 2 + 2.4), white, CANAL.x0 - 0.6, -0.8, CANAL.z, 0, 1.2);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(len, CANAL.half * 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2f7a96, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.9 }));
    water.position.set(CANAL.x0 + len / 2, SEA_Y + 0.25, CANAL.z);
    scene.add(water);
    for (const bx of [2862, 2904]) {
      const arch = new THREE.Mesh(new THREE.CylinderGeometry(CANAL.half + 1.6, CANAL.half + 1.6, 3.2, 16, 1, false, 0, Math.PI), white);
      arch.rotation.set(0, 0, Math.PI / 2);
      arch.rotation.order = 'ZYX';
      arch.position.set(bx, -2.6, CANAL.z);
      batch.addObject(arch);
      addMesh(new THREE.BoxGeometry(3.4, 0.4, CANAL.half * 2 + 4), white, bx, 1.8, CANAL.z, 0, 1.2);
      solid(3.4, 0.4, CANAL.half * 2 + 4, bx, 1.8, CANAL.z);
      for (const s of [-1, 1]) addMesh(new THREE.BoxGeometry(0.3, 0.8, CANAL.half * 2 + 4), white, bx + s * 1.6, 2.4, CANAL.z, 0, 1.2);
    }
    // Keep people out of the canal except over the bridges.
    for (const s of [-1, 1]) for (let x = CANAL.x0; x < QUAY_X; x += 10) {
      if (Math.abs(x + 5 - 2862) < 4 || Math.abs(x + 5 - 2904) < 4) continue;
      solid(10, 1.4, 0.3, x + 5, 2.2, CANAL.z + s * (CANAL.half + 0.4));
    }
  }

  // ---- The lighthouse on the mole ------------------------------------------------------------------------
  {
    const [lx, lz] = LIGHTHOUSE;
    const y = heightAt(lx, lz) - 0.4;
    const bands = [0xf2ece0, 0xb8402e, 0xf2ece0, 0xb8402e, 0xf2ece0];
    for (let k = 0; k < 5; k++) {
      const r0 = 3.6 - k * 0.35, r1 = 3.6 - (k + 1) * 0.35;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 5.2, 18), new THREE.MeshStandardMaterial({ color: bands[k], roughness: 0.8 }));
      seg.position.set(lx, y + 2.6 + k * 5.2, lz);
      batch.addObject(seg);
    }
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xffd070, emissiveIntensity: 0.6 });
    lights.push({ mat: lampMat, base: 0.6 });
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 12), lampMat);
    lamp.position.set(lx, y + 27.2, lz);
    scene.add(lamp);
    addMesh(new THREE.ConeGeometry(2.2, 2.4, 12), m.slate, lx, y + 29.6, lz);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(4, 40, 16, 1, true).rotateZ(Math.PI / 2).translate(20, 0, 0), new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.set(lx, y + 27.2, lz);
    scene.add(beam);
    lighthouseBeam = beam;
    physics.addCylinder(new THREE.Vector3(lx, y + 13, lz), 13, 3.6);
    clearings.push([lx, lz, 12]);
  }

  // ---- The north terrace edge: a balustraded retaining wall ------------------------------------------------
  for (let x = CITY_BOUNDS.x0 + 4; x < QUAY_X - 10; x += 6) {
    if (Math.abs(x + 3 - 2795) < 6 || Math.abs(x + 3 - 2712) < 5) continue; // the ramps
    const y = heightAt(x + 3, NORTH_TERRACE_Z - 7);
    addMesh(new THREE.BoxGeometry(6.05, 0.9, 0.5), white, x + 3, y + 0.45, NORTH_TERRACE_Z - 7, 0, 1.2);
  }

  batch.build(scene);

  // ---- Residents -----------------------------------------------------------------------------------------------
  const { settlement, records } = portResidents();

  // ---- Fishing spots -------------------------------------------------------------------------------------------
  const fishingSpots: FishingSpot[] = [
    ...[0, 1, 2, 3].map((k) => ({ pos: v(QUAY_X + 12 + k * 6, 300 + 16.5), water: new THREE.Vector3(QUAY_X + 12 + k * 6, SEA_Y, 300 + 22), kind: 'harbour' as const, name: 'Fisherman\'s Wharf' })),
    ...piers.map(([pz, len]) => ({ pos: new THREE.Vector3(QUAY_X + len - 1, 1.2, pz), water: new THREE.Vector3(QUAY_X + len + 8, SEA_Y, pz), kind: 'sea' as const, name: 'End of the pier' })),
    { pos: v(2924, 10), water: new THREE.Vector3(2940, SEA_Y, 8), kind: 'sea', name: 'The lighthouse mole' },
    { pos: v(2640, 144), water: new THREE.Vector3(2640, SEA_Y, 132), kind: 'harbour', name: 'The causeway' },
  ];

  let t = 0;
  return {
    settlement,
    records,
    fishingSpots,
    clearings,
    update(dt: number, night: number) {
      t += dt;
      for (const s of ships) {
        s.g.position.y = s.y + Math.sin(t * 0.8 + s.phase) * 0.12;
        s.g.rotation.z = Math.sin(t * 0.6 + s.phase) * 0.025;
      }
      craneBooms.forEach((b, i) => (b.rotation.y = Math.sin(t * 0.12 + i * 2) * 1.2 + 1.2));
      for (const l of lights) l.mat.emissiveIntensity = l.base + night * 2.6;
      if (lighthouseBeam) {
        lighthouseBeam.rotation.y = t * 0.7;
        (lighthouseBeam.material as THREE.MeshBasicMaterial).opacity = night * 0.16;
      }
      if (forgeLight) forgeLight.intensity = 2.6 + Math.sin(t * 9) * 0.4 + Math.sin(t * 23) * 0.2;
      if (Math.random() < dt * 8) fx.add.spawn({ pos: forgeAt, vel: new THREE.Vector3(0, 2.4, 0), spread: 0.5, count: 1, life: [0.3, 0.7], size: [0.08, 0.01], color: 0xffd070, color2: 0xff4a00, upBias: 1, jitter: 0.6 });
      if (Math.random() < dt * 14) fx.add.spawn({ pos: fountainAt, vel: new THREE.Vector3(0, 1.2, 0), spread: 0.4, count: 1, life: [0.5, 0.9], size: [0.12, 0.05], color: 0xd8f0ff, color2: 0x7ab8e0, gravity: 6, upBias: 1.2 });
    },
  };
}

const SEA_Y = -1.2;
const ships: { g: THREE.Object3D; phase: number; y: number }[] = [];
const fountainAt = new THREE.Vector3();
const forgeAt = new THREE.Vector3();
let forgeLight: THREE.PointLight | null = null;
let lighthouseBeam: THREE.Mesh | null = null;

// ---- Residents ---------------------------------------------------------------------------------------------

interface Named { id: string; name: string; title: string; look: Look; post: [number, number]; yaw?: number; activity: ScheduleEntry['activity']; hours: [number, number]; lines: NpcRecord['lines'] }

const NAMED: Named[] = [
  { id: 'marrow', name: 'Ser Elian Marrow', title: 'Knight-Captain · Academy Registrar', post: [2800, 104], yaw: Math.PI, activity: 'idle', hours: [6, 21], lines: { any: ['The Academy gate is open to anyone with the nerve to walk through it.'] },
    look: { body: 'male', outfit: 'ranger', hair: 'simpleparted', beard: true, hairColor: 0xb8b4ae, skin: 0xe0b894, cloth: 0x2f5f9a, pauldron: true, height: 1.88 } },
  { id: 'lyra', name: 'Instructor Lyra Quen', title: 'Gale School Instructor', post: [2830, 64], activity: 'patrol', hours: [7, 19], lines: { any: ['Faster. No — lighter. Speed starts in the feet.'] },
    look: { body: 'female', outfit: 'ranger', hair: 'buzzedfemale', hairColor: 0xd2b26a, skin: 0xfff0e6, cloth: 0x3a8ab0, height: 1.72 } },
  { id: 'hadrik', name: 'Ser Hadrik Vane', title: 'Boundary School Instructor', post: [2812, 78], activity: 'idle', hours: [7, 19], lines: { any: ['Stand. Breathe. Nothing crosses the line.'] },
    look: { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x3a2618, skin: 0xa8744e, cloth: 0xc9d6e6, pauldron: true, height: 1.95 } },
  { id: 'sable', name: 'Master Sable Ro', title: 'Cross School Instructor', post: [2836, 76], activity: 'idle', hours: [8, 20], lines: { any: ['Two blades, one heartbeat.'] },
    look: { body: 'female', outfit: 'ranger', hair: 'long', hairColor: 0x1f1a17, skin: 0x7a4e32, cloth: 0x8a2a3a, height: 1.74 } },
  { id: 'mell', name: 'Archivist Mell', title: 'Keeper of the Academy Library', post: [2782, 74], activity: 'sit', hours: [8, 22], lines: { any: ['Shh. The books are sleeping. Well — I am.'] },
    look: { body: 'male', outfit: 'peasant', hair: 'simpleparted', beard: true, hairColor: 0xe6e2da, skin: 0xfff0e6, linen: 0xd9cfe8, cloth: 0x4a3a6a, height: 1.68 } },
  { id: 'dorian', name: 'Cadet Dorian Vale', title: 'Cadet · Best Blade of the Year', post: [2824, 96], activity: 'patrol', hours: [7, 21], lines: { any: ['Out of the way, summoned hero.', 'Marrow says I\'m too proud. Marrow is right, and I\'m still the best.'] },
    look: { body: 'male', outfit: 'ranger', hair: 'simpleparted', hairColor: 0xd2b26a, skin: 0xfff0e6, cloth: 0x2f5f9a, height: 1.82 } },
  { id: 'garrot', name: 'Weaponsmaster Garrot', title: 'Academy Armoury', post: [2842, 60], activity: 'work', hours: [7, 19], lines: { any: ['Spear, axe, greatsword, bow — every weapon is a language. I teach grammar.'] },
    look: { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x6a4428, skin: 0xe0b894, cloth: 0x5a5a5a, pauldron: true, height: 1.9 } },
  { id: 'bruni', name: 'Bruni Stonevein', title: 'Dwarven Expedition Leader', post: [2744, 310], activity: 'work', hours: [6, 22], lines: { any: ['The White Mountains don\'t care how brave you are. Bring a lantern.'] },
    look: { body: 'female', outfit: 'ranger', hair: 'buns', hairColor: 0x8a3f22, skin: 0xe0b894, cloth: 0x7a5a3a, pauldron: true, height: 1.4 } },
  { id: 'mira', name: 'Mira Vane', title: 'Dockmaster', post: [2930, 286], activity: 'idle', hours: [5, 21], lines: { any: ['Tide turns at noon. Everything turns at noon, down here.'] },
    look: { body: 'female', outfit: 'ranger', hair: 'long', hairColor: 0x3a2618, skin: 0xa8744e, cloth: 0x2f7f86, hood: true, height: 1.72 } },
  { id: 'nell', name: 'Old Nell Crabbe', title: 'Fish Market · Buys Fish by Weight', post: [2912, 294], activity: 'talk', hours: [5, 18], lines: { any: ['Fresh fish! Fresh gossip! Both cheap!'] },
    look: { body: 'female', outfit: 'peasant', hair: 'buns', hairColor: 0xb8b4ae, skin: 0xe0b894, linen: 0xc9dbe8, height: 1.56 } },
  { id: 'tallow', name: 'Harbourmaster Osric Tallow', title: 'Harbourmaster', post: [QUAY_X - 7, 186], activity: 'idle', hours: [6, 20], lines: { any: ['Every ship in and out of this harbour passes my desk.'] },
    look: { body: 'male', outfit: 'peasant', hair: 'simpleparted', beard: true, hairColor: 0x6a6a6a, skin: 0xfff0e6, linen: 0xe8d8b8, cloth: 0x2f3f6a, height: 1.8 } },
  { id: 'guildmaster', name: 'Wendeline Ashcombe', title: 'Guildmaster of the Port Aurelle Hall', post: [2746, 254], activity: 'idle', hours: [7, 22], lines: { any: ['Rank is earned on the board, not in the tavern.'] },
    look: { body: 'female', outfit: 'ranger', hair: 'buns', hairColor: 0x1f1a17, skin: 0x7a4e32, cloth: 0x8a3a2a, pauldron: true, height: 1.76 } },
  { id: 'ragna', name: 'Ragna Ironsides', title: 'Weaponsmith · Steel Arms', post: [2808, 160], activity: 'talk', hours: [8, 19], lines: { any: ['Port steel, Aurelle-folded. Better than anything inland.'] },
    look: { body: 'female', outfit: 'ranger', hair: 'buzzedfemale', hairColor: 0x8a3f22, skin: 0xfff0e6, cloth: 0x5a5a5a, height: 1.78 } },
  { id: 'quill', name: 'Quill Mereweather', title: 'Alchemist · Fine Draughts', post: [2776, 158], activity: 'talk', hours: [8, 20], lines: { any: ['Stronger draughts than any village apothecary, guaranteed or your hit points back.'] },
    look: { body: 'male', outfit: 'peasant', hair: 'long', hairColor: 0x3a2618, skin: 0xfff0e6, linen: 0xd9cfe8, cloth: 0x3d7a45, height: 1.74 } },
  { id: 'sabeth', name: 'Sabeth Lune', title: 'Jeweller · Rings and Charms', post: [2806, 186], activity: 'talk', hours: [9, 19], lines: { any: ['Every ring is a promise. Some of mine also stop arrows.'] },
    look: { body: 'female', outfit: 'peasant', hair: 'long', hairColor: 0xd2b26a, skin: 0xe0b894, linen: 0xf0e0a8, cloth: 0x7a3f8a, height: 1.7 } },
  { id: 'bess', name: 'Bess Harrow', title: 'Keeper of the Salty Anchor', post: [2784, 259], activity: 'idle', hours: [10, 26], lines: { any: ['Ale, rum or rumours? Rumours cost extra.'] },
    look: { body: 'female', outfit: 'peasant', hair: 'buns', hairColor: 0x6a4428, skin: 0xfff0e6, linen: 0xe8c8c0, height: 1.66 } },
  { id: 'corvina', name: 'Lady Corvina Aurelle', title: 'Noblewoman of the Upper City', post: [2736, 76], activity: 'idle', hours: [9, 18], lines: { any: ['Mind the roses, please. They are older than you.'] },
    look: { body: 'female', outfit: 'peasant', hair: 'long', hairColor: 0x1f1a17, skin: 0xfff0e6, linen: 0xd9cfe8, cloth: 0x2f3f7a, height: 1.74 } },
  { id: 'hobbs', name: 'Jory Hobbs', title: 'Ostler · West Gate Stables & Coaches', post: [2716, 164], activity: 'work', hours: [6, 21], lines: { any: ['Coach to the Wayfarer’s Rest and Elder Glen, leaving on the hour.'] },
    look: { body: 'male', outfit: 'ranger', hair: 'simpleparted', beard: true, hairColor: 0x6a4428, skin: 0xe0b894, cloth: 0x7a5a3a, height: 1.8 } },
  { id: 'dice', name: 'Delphine “Dice” Coveley', title: 'Cardsharp of the Lower City', post: [2886, 292], activity: 'talk', hours: [17, 28], lines: { any: ['Cut the deck? No? Wise.', 'Everyone in the Lower City owes someone. Mostly me.'], evening: ['The Lantern’s filling up. Good. Full rooms have loose purses.'] },
    look: { body: 'female', outfit: 'peasant', hair: 'long', hairColor: 0x8a3f22, skin: 0xe0b894, linen: 0xe8c8c0, cloth: 0x7a2a3a, height: 1.68 } },
  { id: 'pim', name: 'Little Pim', title: 'Runner for the Quiet Hands', post: [2866, 306], activity: 'idle', hours: [9, 23], lines: { any: ['I run messages. Fast ones. Don’t ask what’s in ’em.', 'The Watch nearly had me in the cistern last week. Nearly.'] },
    look: { body: 'male', outfit: 'peasant', hair: 'buzzed', hairColor: 0x3a2618, skin: 0xa8744e, linen: 0xd8c29a, height: 1.42 } },
  { id: 'marlo', name: 'Slick Marlo', title: 'Loiterer by the Drowned Lantern', post: [2880, 294], activity: 'idle', hours: [16, 27], lines: { any: ['Never seen you. Never seen anyone. That\'s my trade.'] },
    look: { body: 'male', outfit: 'ranger', hair: 'buzzed', hairColor: 0x1f1a17, skin: 0xa8744e, cloth: 0x2a2a30, hood: true, height: 1.74 } },
];

const JOBS: [string, number, ScheduleEntry['activity'], string][] = [
  ['dockworker', 12, 'work', 'harbour'], ['sailor', 10, 'talk', 'harbour'], ['merchant', 12, 'shop', 'market'], ['citizen', 30, 'shop', 'market'],
  ['guard', 8, 'patrol', 'gate'], ['cadet', 6, 'patrol', 'academy'], ['fisher', 6, 'work', 'wharf'], ['smith', 3, 'work', 'forge'], ['child', 5, 'play', 'market'], ['noble', 4, 'talk', 'gardens'],
  // The Lower City: idlers and dockhands out of work, washerwomen at the canal.
  ['idler', 8, 'talk', 'lowercity'], ['washer', 4, 'work', 'lowercity'],
];

function portResidents(): { settlement: Settlement; records: NpcRecord[] } {
  const places = new Map<string, Place>();
  const ring = (cx: number, cz: number, r: number, n: number) => Array.from({ length: n }, (_, i) => v(cx + Math.cos((i / n) * Math.PI * 2) * r, cz + Math.sin((i / n) * Math.PI * 2) * r));
  places.set('market', { id: 'market', spots: ring(MARKET[0], MARKET[1], 11, 16) });
  places.set('harbour', { id: 'harbour', spots: Array.from({ length: 14 }, (_, i) => v(QUAY_X - 3 - (i % 3), 60 + i * 18)) });
  places.set('gate', { id: 'gate', spots: [v(2708, 144), v(2708, 157), v(2792, 150), v(2860, 180), v(2940, 70)] });
  places.set('academy', { id: 'academy', spots: ring(2822, 84, 10.5, 8) });
  places.set('wharf', { id: 'wharf', spots: [v(2918, 304), v(2924, 306), v(2912, 302), v(QUAY_X + 6, 314)] });
  places.set('forge', { id: 'forge', spots: [v(2733, 311), v(2738, 311), v(2740, 306)] });
  places.set('gardens', { id: 'gardens', spots: [v(2740, 84), v(2760, 70), v(2728, 80)] });
  places.set('tavern', { id: 'tavern', spots: ring(2784, 264, 3.5, 6) });
  places.set('homes', { id: 'homes', spots: ring(2830, 250, 30, 12), indoors: true });
  places.set('lowercity', { id: 'lowercity', spots: [v(2868, 296), v(2872, 292), v(2878, 292), v(2884, 296), v(2890, 294), v(2862, 300), v(2866, 311), v(2892, 309)] });
  const graph = cityGraph(places);
  const records: NpcRecord[] = [];
  for (const n of NAMED) {
    const id = 'post:' + n.id;
    places.set(id, { id, spots: [v(n.post[0], n.post[1])], yaw: n.yaw });
    const [a, b] = n.hours;
    const schedule: ScheduleEntry[] = b > 24
      ? [{ from: 0, activity: n.activity, place: id }, { from: b - 24, activity: 'sleep', place: 'homes' }, { from: a, activity: n.activity, place: id }]
      : [{ from: 0, activity: 'sleep', place: 'homes' }, { from: a, activity: n.activity, place: id }, { from: b, activity: 'drink', place: 'tavern' }, { from: Math.min(23.8, b + 2.5), activity: 'sleep', place: 'homes' }];
    records.push({ id: n.id, name: n.name, title: n.title, job: n.id, settlement: 'portAurelle', look: n.look, schedule, lines: n.lines, named: true });
  }
  const rnd = mulberry32(2761);
  const FIRST = ['Alden', 'Brenna', 'Cyril', 'Delphine', 'Emeric', 'Fiora', 'Gideon', 'Helsa', 'Ivor', 'Jessamy', 'Kellan', 'Linnet', 'Mathis', 'Nerys', 'Oren', 'Perrin', 'Rowena', 'Soren', 'Tamsin', 'Ulric', 'Vesna', 'Wystan'];
  const FAM = ['Tidewell', 'Saltmarsh', 'Harbourne', 'Quayle', 'Brightwater', 'Gullstone', 'Netherby', 'Coveley', 'Shorefield', 'Marlowe'];
  let k = 0;
  for (const [job, count, activity, place] of JOBS) {
    for (let i = 0; i < count; i++, k++) {
      const female = rnd() < 0.5;
      const look: Look = {
        body: job === 'washer' || female ? 'female' : 'male', outfit: job === 'guard' || job === 'cadet' || job === 'sailor' ? 'ranger' : 'peasant',
        hair: female ? (['long', 'buns', 'buzzedfemale'] as const)[Math.floor(rnd() * 3)] : (['simpleparted', 'buzzed'] as const)[Math.floor(rnd() * 2)],
        beard: !female && rnd() < 0.35, hairColor: [0x1f1a17, 0x3a2618, 0x6a4428, 0x8a3f22, 0xd2b26a, 0xb8b4ae][Math.floor(rnd() * 6)],
        skin: [0xfff0e6, 0xffffff, 0xe0b894, 0xa8744e, 0x7a4e32][Math.floor(rnd() * 5)],
        linen: [0xe8d8b8, 0xc9dbe8, 0xd8c29a, 0xe8c8c0, 0xd9cfe8][Math.floor(rnd() * 5)],
        cloth: job === 'guard' || job === 'cadet' ? 0x2f5f9a : job === 'sailor' ? 0x2f4a6a : job === 'noble' ? [0x7a3f8a, 0x2f3f7a, 0x8a2a3a][Math.floor(rnd() * 3)] : undefined,
        pauldron: job === 'guard', height: job === 'child' ? 1.28 : female ? 1.62 + rnd() * 0.1 : 1.72 + rnd() * 0.12,
      };
      const j = (h: number) => h + (rnd() - 0.5);
      const schedule: ScheduleEntry[] = job === 'guard'
        ? [{ from: 0, activity: 'patrol', place: 'gate' }, { from: j(6), activity: 'patrol', place: i % 2 ? 'harbour' : 'market' }, { from: j(18), activity: 'patrol', place: 'gate' }]
        : [{ from: 0, activity: 'sleep', place: 'homes' }, { from: j(job === 'fisher' || job === 'dockworker' ? 5.5 : 8), activity, place }, { from: j(12.5), activity: 'talk', place: 'market' }, { from: j(13.5), activity, place }, { from: j(18.5), activity: 'drink', place: 'tavern' }, { from: j(22), activity: 'sleep', place: 'homes' }];
      records.push({ id: 'pa-' + k, name: `${FIRST[k % FIRST.length]} ${FAM[(k * 3) % FAM.length]}`, title: job.charAt(0).toUpperCase() + job.slice(1) + ' of Port Aurelle', job, settlement: 'portAurelle', look, schedule, lines: PORT_LINES[job] });
    }
  }
  return { settlement: { id: 'portAurelle', center: v(CITY_CENTERX, CITY_CENTERZ), radius: 240, places, nodes: graph.nodes, edges: graph.edges }, records };
}

const CITY_CENTERX = 2826, CITY_CENTERZ = 176;

const PORT_LINES: Record<string, NpcRecord['lines']> = {
  dockworker: { any: ['Lift with the legs. Always the legs.', 'Three ships in from the Azure Isles today. My back knows it.'] },
  sailor: { any: ['Been round the Shattered Isles twice. Never again.', 'The sea\'s kind in summer. Liar, the sea.'] },
  merchant: { any: ['Silks! Spices! Salt from the flats!', 'Everything in Port Aurelle is for sale, and half of it is fairly priced.'] },
  citizen: { any: ['Lovely day for the market.', 'Have you seen the new ship in the harbour? Big as a church.'] },
  guard: { any: ['Keep the peace, keep moving.', 'The Watch sees everything. Mostly.'] },
  cadet: { any: ['Squire\'s Oath in the spring, if Marrow lets me.', 'Have you fought Dorian yet? Nobody beats Dorian.'] },
  fisher: { any: ['Mackerel\'s running. Bream if you\'re patient.', 'Strike when the float dips, not when it wobbles.'] },
  smith: { any: ['Hot iron waits for no one.'] },
  child: { any: ['Race you to the lighthouse!'] },
  noble: { any: ['Do mind the hem.', 'The Governor\'s ball is next week. One simply must.'] },
  idler: { any: ['Ships don’t need hands like they used to.', 'Watch your purse round here. Not from me. Probably.'], evening: ['The Lantern’s pouring cheap tonight.'], night: ['Nothing to see. Move along.'] },
  washer: { any: ['Canal water’s no good for whites. Try telling the Upper City that.', 'Mind the lines, love, those are the Governor’s shirts.'] },
};

/** Walking graph from the city streets (subdivided, junctions merged, spots hooked on). */
function cityGraph(places: Map<string, Place>) {
  const nodes: THREE.Vector3[] = [];
  const edges: number[][] = [];
  const nodeAt = (x: number, z: number) => {
    for (let i = 0; i < nodes.length; i++) if (Math.hypot(nodes[i].x - x, nodes[i].z - z) < 3.5) return i;
    nodes.push(v(x, z));
    edges.push([]);
    return nodes.length - 1;
  };
  const link = (a: number, b: number) => {
    if (a === b) return;
    if (!edges[a].includes(b)) edges[a].push(b);
    if (!edges[b].includes(a)) edges[b].push(a);
  };
  for (const line of CITY_STREETS.slice(0, 9)) {
    for (let k = 1; k < line.length; k++) {
      const [ax, az] = line[k - 1], [bx, bz] = line[k];
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 12));
      let prev = nodeAt(ax, az);
      for (let s = 1; s <= n; s++) {
        const cur = nodeAt(ax + ((bx - ax) * s) / n, az + ((bz - az) * s) / n);
        link(prev, cur);
        prev = cur;
      }
    }
  }
  for (const p of places.values()) for (const s of p.spots) {
    let best = 0, bd = Infinity;
    nodes.forEach((n, i) => {
      const d = n.distanceToSquared(s);
      if (d < bd) (bd = d), (best = i);
    });
    link(nodeAt(s.x, s.z), best);
  }
  return { nodes, edges };
}
