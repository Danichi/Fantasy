import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt } from './terrainHeight';
import { physics } from '../physics/physics';
import { mulberry32 } from '../core/math';
import { worldUV, type WorldMats } from './buildings';
import type { Interactable } from '../dungeon/instance';
import { GRASS_MASKS } from './groundWindow';

/** Trees keep clear of these (x, z, radius). */
export const LANDMARK_CLEARINGS: [number, number, number][] = [[-180, -262, 24], [7, -300, 7], [-300, -350, 17]];

// Elder Glen's outlying landmarks (World Expansion phase 3): the old quarry
// in the northern hills (iron ore for Fröst), a weathered stele by the crypt
// path carrying the first Sunwheel glyph, and a ring of standing stones on a
// hilltop to the north-west that carries the same mark. The Sunwheel is the
// ancient civilisation's motif (§17); every ruin in the world will share it.

export const QUARRY = new THREE.Vector3(-180, 0, -262);
export const STELE = new THREE.Vector3(7, 0, -300);
export const STANDING_STONES = new THREE.Vector3(-300, 0, -350);

/** The Sunwheel: a ring, an inner eye, eight bent rays. */
export function sunwheelTexture(stroke = 'rgba(255, 214, 120, 1)', glow = true) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.translate(128, 128);
  g.strokeStyle = stroke;
  if (glow) {
    g.shadowColor = stroke;
    g.shadowBlur = 10;
  }
  g.lineCap = 'round';
  g.lineWidth = 9;
  g.beginPath(); g.arc(0, 0, 48, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 7;
  g.beginPath(); g.arc(0, 0, 16, 0, Math.PI * 2); g.stroke();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    g.beginPath();
    g.moveTo(Math.cos(a) * 60, Math.sin(a) * 60);
    g.lineTo(Math.cos(a) * 88, Math.sin(a) * 88);
    g.lineTo(Math.cos(a + 0.32) * 108, Math.sin(a + 0.32) * 108);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rock(rnd: () => number, r: number, detail = 1) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(r, detail).deleteAttribute('normal').deleteAttribute('uv'), 1e-4); // welded, so the jitter can't split faces apart
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const k = 0.78 + rnd() * 0.4;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

/** The kit's stone, warmed and darkened into weathered hill rock. */
function quarryRock(m: WorldMats) {
  const src = (m.bridgeStone ?? m.stone) as THREE.MeshStandardMaterial;
  const r = src.clone();
  r.color = new THREE.Color(0xe2d8c4);
  r.roughness = 1;
  return r;
}

export interface GlenLandmarks {
  interactables: Interactable[];
  /** the glyph plaques glow brighter at night */
  update(dt: number, night: number, gameHours: number): void;
  toJSON(): { ore: number[] };
  fromJSON(d?: { ore?: number[] }): void;
  /** ore mined: (for quests and the Miner class) */
  onMine?: () => void;
}

export function buildGlenLandmarks(scene: THREE.Scene, m: WorldMats, give: (id: string, n: number) => void, hours: () => number): GlenLandmarks {
  const rnd = mulberry32(318);
  const interactables: Interactable[] = [];
  const stoneParts: THREE.BufferGeometry[] = [];
  const glyphMats: THREE.MeshStandardMaterial[] = [];
  const addStone = (g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1) => {
    g.scale(sx, sy, sz).rotateY(ry).translate(x, y, z);
    const n = g.index ? g.toNonIndexed() : g;
    n.computeVertexNormals();
    worldUV(n, 0.2);
    stoneParts.push(n);
  };

  // ---- the old quarry ---------------------------------------------------------------
  const q = QUARRY;
  q.y = heightAt(q.x, q.z);
  GRASS_MASKS.push({ x: q.x, z: q.z - 3, r: 14, amount: 0.75 });
  // Cut faces: stepped blocks backing into the hill (north), open to the south.
  for (let k = 0; k < 11; k++) {
    // Cut faces line the back and sides of the pit, stepped like old workings.
    const a = -1.25 + (k / 10) * 2.5;
    const r = 13.5 + rnd() * 1.5;
    const x = q.x + Math.sin(a) * r, z = q.z - Math.cos(a) * r / 1.15;
    const rim = heightAt(q.x + Math.sin(a) * 19, q.z - (Math.cos(a) * 19) / 1.15);
    const floor = heightAt(q.x + Math.sin(a) * 11, q.z - (Math.cos(a) * 11) / 1.15);
    const h = Math.max(2.5, rim - floor + 0.6);
    const tier = rnd() < 0.5;
    addStone(new THREE.BoxGeometry(5.6, h + 2, 3.2), x, floor + (h + 2) / 2 - 2, z, -a, 1, 1, 1);
    if (tier) addStone(new THREE.BoxGeometry(5, 1.4, 1.6), x - Math.sin(a) * 2.2, floor + 0.5, z + Math.cos(a) * 2.2, -a + 0.05);
    const y = floor;
    physics.addBox(new THREE.Vector3(x, y + h / 2, z), new THREE.Vector3(2.8, h / 2 + 1, 1.6), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, 0)));
  }
  // Rubble and cut blocks on the floor.
  for (let k = 0; k < 16; k++) {
    const a = rnd() * Math.PI * 2, r = 3 + rnd() * 10;
    const x = q.x + Math.cos(a) * r, z = q.z + Math.sin(a) * r * 0.6 + 2;
    const s = 0.4 + rnd() * 0.9;
    if (rnd() < 0.5) addStone(new THREE.BoxGeometry(s * 1.6, s, s * 1.1), x, heightAt(x, z) + s / 2 - 0.05, z, rnd() * 3);
    else addStone(rock(rnd, s * 0.7, 0), x, heightAt(x, z) + s * 0.3, z, rnd() * 3);
  }
  // A wooden crane and a mine cart on a short run of rails.
  const wood: THREE.BufferGeometry[] = [];
  const addWood = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    g.rotateX(rx).rotateZ(rz).rotateY(ry).translate(x, y, z);
    wood.push(g.index ? g.toNonIndexed() : g);
  };
  {
    const cx = q.x + 7, cz = q.z + 1, cy = heightAt(cx, cz);
    addWood(new THREE.BoxGeometry(0.35, 7, 0.35), cx, cy + 3.5, cz);
    addWood(new THREE.BoxGeometry(0.25, 0.25, 6), cx, cy + 6.8, cz - 2.2, 0, 0.5);
    addWood(new THREE.BoxGeometry(0.2, 4, 0.2), cx, cy + 4.6, cz - 1.2, -0.7, 0.5);
    for (const s of [-1, 1]) addWood(new THREE.BoxGeometry(0.25, 3, 0.25), cx + s * 1.2, cy + 1.2, cz + 0.6, 0, 0, s * 0.45);
    const rx0 = q.x - 6, rz0 = q.z + 3;
    for (let i = 0; i < 8; i++) addWood(new THREE.BoxGeometry(1.4, 0.12, 0.25), rx0 + i * 0.9, heightAt(rx0 + i * 0.9, rz0) + 0.06, rz0, 0, Math.PI / 2);
    const cart = new THREE.Group();
    const bin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.9), m.planks);
    bin.position.y = 0.75;
    cart.add(bin);
    for (const [wx, wz] of [[-0.45, -0.5], [0.45, -0.5], [-0.45, 0.5], [0.45, 0.5]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 10).rotateX(Math.PI / 2), m.timber);
      w.position.set(wx, 0.25, wz);
      cart.add(w);
    }
    const oreHeap = new THREE.Mesh(rock(rnd, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x7a5a48, roughness: 0.9, flatShading: true }));
    oreHeap.position.y = 1.1;
    cart.add(oreHeap);
    cart.position.set(rx0 + 2.5, heightAt(rx0 + 2.5, rz0), rz0);
    cart.rotation.y = Math.PI / 2;
    cart.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
    scene.add(cart);
  }
  // Iron ore nodes: grey rock with rusty seams, mined for ore, back after 6 game hours.
  const oreMat = new THREE.MeshStandardMaterial({ color: 0x6d6660, roughness: 0.9, flatShading: true });
  const seamMat = new THREE.MeshStandardMaterial({ color: 0xb4683e, roughness: 0.45, metalness: 0.55, emissive: 0x3a1a08, emissiveIntensity: 0.4 });
  const ore: { mesh: THREE.Group; at: number }[] = [];
  const oreSpots: [number, number][] = [[-8, -8], [-3, -11], [4, -11], [9, -7], [-11, -3], [11, -2]];
  for (const [ox, oz] of oreSpots) {
    const x = q.x + ox, z = q.z + oz, y = heightAt(x, z);
    const g = new THREE.Group();
    const body = new THREE.Mesh(rock(rnd, 0.9, 1), oreMat);
    body.position.y = 0.5;
    g.add(body);
    for (let s = 0; s < 7; s++) {
      const seam = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16 + rnd() * 0.1, 0), seamMat);
      const a = rnd() * Math.PI * 2;
      seam.position.set(Math.cos(a) * 0.7, 0.4 + rnd() * 0.6, Math.sin(a) * 0.7);
      g.add(seam);
    }
    g.position.set(x, y, z);
    g.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
    scene.add(g);
    const node = { mesh: g, at: -99 };
    ore.push(node);
    interactables.push({
      pos: new THREE.Vector3(x, y, z), radius: 2.2,
      label: () => node.mesh.visible ? 'Mine iron ore' : 'Mined out (comes back in a few hours)',
      enabled: () => node.mesh.visible,
      action: () => {
        node.at = hours();
        node.mesh.visible = false;
        give('ironOre', 1 + (rnd() < 0.35 ? 1 : 0));
        result.onMine?.();
      },
    });
  }

  // ---- the stele by the crypt path ------------------------------------------------------
  const plaque = (x: number, y: number, z: number, yaw: number, size: number) => {
    const mat = new THREE.MeshStandardMaterial({ map: sunwheelTexture('rgba(90, 70, 50, 1)', false), transparent: true, emissiveMap: sunwheelTexture(), emissive: 0xffc860, emissiveIntensity: 0.15, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    glyphMats.push(mat);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    p.position.set(x, y, z);
    p.rotation.y = yaw;
    scene.add(p);
  };
  {
    const x = STELE.x, z = STELE.z, y = heightAt(x, z);
    STELE.y = y;
    addStone(new THREE.BoxGeometry(1.2, 2.6, 0.45), x, y + 1.2, z, 0.25);
    addStone(new THREE.BoxGeometry(1.5, 0.35, 0.7), x, y + 0.1, z, 0.25);
    // Weathering: a chipped top.
    addStone(rock(rnd, 0.5, 0), x - 0.3, y + 2.5, z, 0.25, 1, 0.5, 0.6);
    plaque(x + Math.sin(0.25) * 0.24, y + 1.55, z + Math.cos(0.25) * 0.24, 0.25, 0.95);
    physics.addBox(new THREE.Vector3(x, y + 1.2, z), new THREE.Vector3(0.6, 1.3, 0.25), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.25, 0)));
  }

  // ---- the standing stones ---------------------------------------------------------------
  {
    const c = STANDING_STONES;
    c.y = heightAt(c.x, c.z);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + 0.2;
      const x = c.x + Math.cos(a) * 9, z = c.z + Math.sin(a) * 9;
      const h = 3.2 + rnd() * 1.6;
      const y = heightAt(x, z);
      const lean = (rnd() - 0.5) * 0.18;
      const g = new THREE.BoxGeometry(1.2, h, 0.8);
      g.rotateZ(lean);
      addStone(g, x, y + h / 2 - 0.3, z, -a + Math.PI / 2);
      physics.addCylinder(new THREE.Vector3(x, y + h / 2, z), h / 2, 0.6);
    }
    // One fallen stone and the altar stone in the middle, carrying the Sunwheel.
    addStone(new THREE.BoxGeometry(3.6, 0.9, 1.2), c.x + 5, c.y + 0.3, c.z + 2, 0.7);
    addStone(new THREE.BoxGeometry(2, 0.9, 1.4), c.x, c.y + 0.4, c.z);
    addStone(new THREE.BoxGeometry(1.4, 3.8, 0.7), c.x, c.y + 2.6, c.z - 0.4);
    plaque(c.x, c.y + 2.9, c.z - 0.04, 0, 1.2);
    physics.addBox(new THREE.Vector3(c.x, c.y + 2, c.z - 0.2), new THREE.Vector3(1, 2, 0.7));
  }

  const stone = new THREE.Mesh(mergeGeometries(stoneParts.map((g) => {
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    return g;
  }), false)!, quarryRock(m));
  stone.castShadow = stone.receiveShadow = true;
  scene.add(stone);
  if (wood.length) {
    const w = new THREE.Mesh(mergeGeometries(wood.map((g) => {
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
      return g;
    }), false)!, m.timber);
    w.castShadow = true;
    scene.add(w);
  }

  let t = 0;
  const result: GlenLandmarks = {
    interactables,
    update(dt, night, gameHours) {
      t += dt;
      for (const g of glyphMats) g.emissiveIntensity = 0.12 + night * (1.4 + Math.sin(t * 1.3) * 0.3);
      for (const n of ore) if (!n.mesh.visible && gameHours - n.at > 6) n.mesh.visible = true;
    },
    toJSON: () => ({ ore: ore.map((n) => n.at) }),
    fromJSON(d) {
      d?.ore?.forEach((at, i) => {
        if (!ore[i]) return;
        ore[i].at = at;
        ore[i].mesh.visible = hours() - at > 6;
      });
    },
  };
  return result;
}
