import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { worldUV, type WorldMats } from './buildings';
import { heightAt } from './terrainHeight';
import { physics } from '../physics/physics';
import { mulberry32 } from '../core/math';

// Elder Glen's market square (World Expansion phase 3): six stalls with
// striped awnings and goods on the counters south of the plaza, the town well
// and the noticeboard by the guild. Stalls face north; shoppers stand on
// their north side facing south (see MARKET_SPOTS).

export const STALLS: { x: number; z: number; awning: [string, string]; goods: 'produce' | 'bread' | 'cloth' | 'pots' | 'fish' | 'flowers' }[] = [
  { x: -6, z: 12, awning: ['#b8402e', '#f1e6cc'], goods: 'produce' },
  { x: -13, z: 11, awning: ['#2f5f9a', '#f1e6cc'], goods: 'cloth' },
  { x: 6, z: 12, awning: ['#3d7a45', '#f1e6cc'], goods: 'bread' },
  { x: 13, z: 11, awning: ['#c9922a', '#f7efd8'], goods: 'pots' },
  { x: -19, z: 6, awning: ['#7a3f8a', '#f1e6cc'], goods: 'flowers' },
  { x: 19, z: 6, awning: ['#2f7f86', '#f1e6cc'], goods: 'fish' },
];
/** Where shoppers (and the market NPCs) stand: 2.4 m north of each stall (spots jitter 0.8 m). */
export const MARKET_SPOTS = STALLS.map((s) => new THREE.Vector3(s.x, heightAt(s.x, s.z - 2.4), s.z - 2.4));
export const WELL = new THREE.Vector3(-12, 0, -15);
export const NOTICEBOARD = new THREE.Vector3(11, 0, -9.5);

function stripes(a: string, b: string) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 16;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? b : a;
    g.fillRect(i * 16, 0, 16, 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildGlenDressing(scene: THREE.Scene, m: WorldMats) {
  const wood: THREE.BufferGeometry[] = [];
  const planks: THREE.BufferGeometry[] = [];
  const stone: THREE.BufferGeometry[] = [];
  const goods = new Map<number, THREE.BufferGeometry[]>();
  const rnd = mulberry32(42);
  const put = (list: THREE.BufferGeometry[], g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0) => {
    g.rotateX(rx).rotateY(ry).translate(x, y, z);
    const n = g.index ? g.toNonIndexed() : g;
    worldUV(n, 1.5);
    list.push(n);
  };
  const good = (color: number, g: THREE.BufferGeometry, x: number, y: number, z: number) => {
    const list = goods.get(color) ?? [];
    g.translate(x, y, z);
    const n = g.index ? g.toNonIndexed() : g;
    n.deleteAttribute('uv');
    list.push(n);
    goods.set(color, list);
  };

  // ---- stalls ----------------------------------------------------------------------
  for (const s of STALLS) {
    const y = heightAt(s.x, s.z);
    for (const [px, pz] of [[-1.5, -0.9], [1.5, -0.9], [-1.5, 0.9], [1.5, 0.9]]) {
      const h = pz < 0 ? 2.5 : 2.9; // awning slopes down towards the shoppers
      put(wood, new THREE.BoxGeometry(0.12, h, 0.12), s.x + px, y + h / 2, s.z + pz);
    }
    put(planks, new THREE.BoxGeometry(3.2, 0.9, 0.7), s.x, y + 0.45, s.z - 0.55);
    put(planks, new THREE.BoxGeometry(3.3, 0.08, 0.85), s.x, y + 0.94, s.z - 0.55);
    // Back shelf.
    put(planks, new THREE.BoxGeometry(3, 0.06, 0.4), s.x, y + 1.35, s.z + 0.75);
    // Awning: a striped cloth with a scalloped front hem.
    const aw = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 2.2, 1, 1),
      new THREE.MeshStandardMaterial({ map: stripes(...s.awning), roughness: 0.9, side: THREE.DoubleSide }),
    );
    aw.position.set(s.x, y + 2.72, s.z);
    aw.rotation.set(-Math.PI / 2 - 0.18, 0, 0);
    aw.castShadow = aw.receiveShadow = true;
    (aw.material as THREE.MeshStandardMaterial).map!.rotation = Math.PI / 2;
    (aw.material as THREE.MeshStandardMaterial).map!.center.set(0.5, 0.5);
    scene.add(aw);
    const hem = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.3), aw.material);
    hem.position.set(s.x, y + 2.38, s.z - 1.08);
    scene.add(hem);
    // Goods on the counter and shelf.
    const top = y + 1.0;
    for (let i = 0; i < 7; i++) {
      const gx = s.x - 1.3 + i * 0.43, gz = s.z - 0.55 + (rnd() - 0.5) * 0.3;
      switch (s.goods) {
        case 'produce': {
          // Baskets of apples, cabbages and carrots.
          good(0x8a6a3a, new THREE.CylinderGeometry(0.2, 0.16, 0.16, 8), gx, top + 0.08, gz);
          const c = [0xd23a2a, 0x7fb04a, 0xe8812a][i % 3];
          for (let k = 0; k < 5; k++) good(c, new THREE.IcosahedronGeometry(0.06 + (i % 3 === 1 ? 0.04 : 0), 0), gx + (rnd() - 0.5) * 0.2, top + 0.18 + rnd() * 0.05, gz + (rnd() - 0.5) * 0.2);
          break;
        }
        case 'bread':
          good(0xc98a45, new THREE.CapsuleGeometry(0.07, 0.18, 3, 6).rotateZ(Math.PI / 2), gx, top + 0.07, gz);
          if (i % 2) good(0xb0773a, new THREE.SphereGeometry(0.1, 8, 5).scale(1, 0.6, 1), gx, top + 0.06, gz + 0.18);
          break;
        case 'cloth':
          good([0x2f5f9a, 0xb8402e, 0xe0c060, 0x6a8a4a, 0x7a3f8a][i % 5], new THREE.CylinderGeometry(0.09, 0.09, 0.38, 8).rotateX(Math.PI / 2), gx, top + 0.09, gz);
          break;
        case 'pots':
          good([0xb4683e, 0x9a5a36, 0xc9a070][i % 3], new THREE.LatheGeometry([0.02, 0.1, 0.13, 0.11, 0.07, 0.08].map((r, k) => new THREE.Vector2(r, k * 0.05)), 8), gx, top, gz);
          break;
        case 'flowers':
          good(0x6a4a2a, new THREE.CylinderGeometry(0.12, 0.09, 0.14, 8), gx, top + 0.07, gz);
          for (let k = 0; k < 4; k++) good([0xf2a7c0, 0xf4d24a, 0xffffff, 0x9d7fd8][(i + k) % 4], new THREE.IcosahedronGeometry(0.05, 0), gx + (rnd() - 0.5) * 0.16, top + 0.2 + rnd() * 0.08, gz + (rnd() - 0.5) * 0.16);
          break;
        case 'fish':
          good(0x9fb8c4, new THREE.SphereGeometry(0.06, 6, 4).scale(3, 0.9, 1.1), gx, top + 0.05, gz);
          good(0x8aa6b4, new THREE.ConeGeometry(0.05, 0.1, 3).rotateZ(Math.PI / 2), gx + 0.2, top + 0.05, gz);
          break;
      }
      // Jars and sacks on the back shelf.
      if (i % 2 === 0) good(i % 4 ? 0xcdb48a : 0x8a6a3a, new THREE.CylinderGeometry(0.1, 0.12, 0.26, 7), gx, y + 1.51, s.z + 0.75);
    }
    // Sacks and a crate beside the stall.
    good(0xc9b68a, new THREE.SphereGeometry(0.28, 8, 6).scale(1, 1.2, 0.9), s.x + 1.85, y + 0.3, s.z + 0.3);
    put(planks, new THREE.BoxGeometry(0.6, 0.5, 0.6), s.x - 1.9, y + 0.25, s.z + 0.2, 0.3);
    physics.addBox(new THREE.Vector3(s.x, y + 0.5, s.z - 0.1), new THREE.Vector3(1.6, 0.5, 0.9));
  }

  // ---- the town well ----------------------------------------------------------------
  {
    const x = WELL.x, z = WELL.z, y = heightAt(x, z);
    WELL.y = y;
    const ring = new THREE.CylinderGeometry(1.25, 1.35, 0.9, 16, 1, true);
    put(stone, ring, x, y + 0.45, z);
    put(stone, new THREE.TorusGeometry(1.28, 0.16, 6, 20), x, y + 0.92, z, 0, Math.PI / 2);
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.2, 16), new THREE.MeshStandardMaterial({ color: 0x2f5f7a, roughness: 0.1 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(x, y + 0.3, z);
    scene.add(water);
    for (const sx of [-1, 1]) put(wood, new THREE.BoxGeometry(0.16, 2.3, 0.16), x + sx * 1.1, y + 1.15, z);
    put(wood, new THREE.CylinderGeometry(0.1, 0.1, 2.5, 8).rotateZ(Math.PI / 2), x, y + 1.9, z);
    put(wood, new THREE.BoxGeometry(0.1, 0.5, 0.1), x + 1.3, y + 1.65, z);
    // Little roof.
    for (const sd of [-1, 1]) {
      const r = new THREE.BoxGeometry(2.9, 0.1, 1.3);
      r.translate(0, 0, sd * 0.6);
      r.rotateX(sd * 0.55);
      put(planks, r, x, y + 2.55, z);
    }
    good(0x7a5a3a, new THREE.CylinderGeometry(0.2, 0.16, 0.3, 8), x - 0.3, y + 1.2, z);
    good(0xb8a47a, new THREE.CylinderGeometry(0.012, 0.012, 0.6, 3), x - 0.3, y + 1.6, z);
    physics.addCylinder(new THREE.Vector3(x, y + 0.6, z), 0.6, 1.4);
  }

  // ---- noticeboard ------------------------------------------------------------------
  {
    const x = NOTICEBOARD.x, z = NOTICEBOARD.z, y = heightAt(x, z);
    NOTICEBOARD.y = y;
    for (const sx of [-1, 1]) put(wood, new THREE.BoxGeometry(0.16, 2.6, 0.16), x + sx * 1.1, y + 1.3, z);
    put(planks, new THREE.BoxGeometry(2.4, 1.4, 0.1), x, y + 1.6, z);
    const roof = new THREE.BoxGeometry(2.8, 0.1, 0.7);
    roof.rotateX(0.35);
    put(planks, roof, x, y + 2.6, z + 0.08);
    // Pinned notices.
    const c = document.createElement('canvas');
    c.width = 256; c.height = 150;
    const g = c.getContext('2d')!;
    g.fillStyle = '#6b4b30'; g.fillRect(0, 0, 256, 150);
    const notes: [number, number, number, number, string][] = [[12, 10, 70, 60, '#efe3c2'], [92, 16, 64, 76, '#f4ead0'], [168, 8, 76, 56, '#e8d9b0'], [20, 80, 80, 58, '#f4ead0'], [120, 96, 60, 46, '#efe3c2'], [190, 72, 56, 70, '#e8d9b0']];
    for (const [nx, ny, nw, nh, col] of notes) {
      g.save();
      g.translate(nx + nw / 2, ny + nh / 2);
      g.rotate((rnd() - 0.5) * 0.12);
      g.fillStyle = col; g.fillRect(-nw / 2, -nh / 2, nw, nh);
      g.fillStyle = '#5a4a3a';
      for (let l = 0; l < 5; l++) g.fillRect(-nw / 2 + 6, -nh / 2 + 10 + l * 9, nw - 12 - (l % 2) * 14, 2);
      g.fillStyle = '#b8402e'; g.beginPath(); g.arc(0, -nh / 2 + 4, 3, 0, 7); g.fill();
      g.restore();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.3), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    face.position.set(x, y + 1.6, z + 0.06);
    scene.add(face);
    physics.addBox(new THREE.Vector3(x, y + 1.3, z), new THREE.Vector3(1.2, 1.3, 0.12));
  }

  const add = (list: THREE.BufferGeometry[], mat: THREE.Material) => {
    if (!list.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(list, false)!, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  };
  add(wood, m.timber);
  add(planks, m.planks);
  add(stone, m.stone);
  for (const [color, list] of goods) add(list, new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
}
