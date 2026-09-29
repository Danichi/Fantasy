import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { worldUV, type WorldMats } from './buildings';
import { heightAt, riverX } from './terrainHeight';
import { physics } from '../physics/physics';
import type { Range } from './fauna';

// Elder Glen's working farmland (World Expansion phase 3, the design board's
// windmill-and-river postcard): three windmills with turning sails, twin
// granaries on staddle stones, a red barn, a watermill on the river with a
// turning wheel, fenced pastures and pens, hay bales and troughs. Built from
// the painted material kit and merged by material.

export interface Farmstead {
  /** pastures and pens for the fauna system */
  ranges: Record<'cows' | 'sheep' | 'horses' | 'pigs' | 'chickens' | 'dogs', Range>;
  /** no trees or bushes inside these (x, z, radius) */
  clearings: [number, number, number][];
  /** named NPC work spots */
  spots: { mill: THREE.Vector3[]; barn: THREE.Vector3[]; granary: THREE.Vector3[]; pasture: THREE.Vector3[]; stable: THREE.Vector3[] };
  update(dt: number, wind: number): void;
}

type Part = 'stone' | 'plaster' | 'timber' | 'planks' | 'thatch' | 'tile' | 'barn' | 'cloth' | 'straw' | 'water';

class Batch {
  parts = new Map<Part, THREE.BufferGeometry[]>();
  add(part: Part, g: THREE.BufferGeometry, m: THREE.Matrix4, uv = 1.5) {
    g.applyMatrix4(m);
    const ng = g.index ? g.toNonIndexed() : g;
    worldUV(ng, uv);
    for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ng.deleteAttribute(k);
    const list = this.parts.get(part) ?? [];
    list.push(ng);
    this.parts.set(part, list);
  }
  build(scene: THREE.Scene, mats: Record<Part, THREE.Material>) {
    for (const [part, list] of this.parts) {
      const g = mergeGeometries(list, false);
      if (!g) continue;
      const mesh = new THREE.Mesh(g, mats[part]);
      mesh.castShadow = part !== 'water';
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }
}

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const V = new THREE.Vector3();
const S = new THREE.Vector3(1, 1, 1);
const place = (x: number, y: number, z: number, yaw = 0, rx = 0, rz = 0) => M.compose(V.set(x, y, z), Q.setFromEuler(new THREE.Euler(rx, yaw, rz)), S);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

export function buildFarmstead(scene: THREE.Scene, m: WorldMats): Farmstead {
  const batch = new Batch();
  const clearings: [number, number, number][] = [];
  const ground = (x: number, z: number) => heightAt(x, z);
  const up = new THREE.Vector3(0, 1, 0);

  // ---- fences ----------------------------------------------------------------------
  const fenceRect = (cx: number, cz: number, hx: number, hz: number, yaw: number, gate: 'n' | 's' | 'e' | 'w') => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const w2 = (lx: number, lz: number) => new THREE.Vector2(cx + lx * c + lz * s, cz - lx * s + lz * c);
    const corners = [w2(-hx, -hz), w2(hx, -hz), w2(hx, hz), w2(-hx, hz)];
    const sides: ['n' | 'e' | 's' | 'w', THREE.Vector2, THREE.Vector2][] = [['n', corners[0], corners[1]], ['e', corners[1], corners[2]], ['s', corners[2], corners[3]], ['w', corners[3], corners[0]]];
    for (const [side, a, b] of sides) {
      const len = a.distanceTo(b);
      const n = Math.max(2, Math.round(len / 2.2));
      const dir = Math.atan2(b.x - a.x, b.y - a.y);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        // A gate gap in the middle of one side.
        if (side === gate && t > 0.42 && t < 0.58) continue;
        const p = a.clone().lerp(b, t);
        batch.add('timber', box(0.14, 1.2, 0.14), place(p.x, ground(p.x, p.y) + 0.55, p.y, dir));
      }
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        if (side === gate && t1 > 0.42 && t0 < 0.58) continue;
        const p0 = a.clone().lerp(b, t0), p1 = a.clone().lerp(b, t1);
        const mid = p0.clone().lerp(p1, 0.5);
        const y = (ground(p0.x, p0.y) + ground(p1.x, p1.y)) / 2;
        for (const ry of [0.45, 0.9]) batch.add('timber', box(0.07, 0.1, p0.distanceTo(p1)), place(mid.x, y + ry, mid.y, dir));
        physics.addBox(new THREE.Vector3(mid.x, y + 0.6, mid.y), new THREE.Vector3(0.08, 0.6, p0.distanceTo(p1) / 2), new THREE.Quaternion().setFromAxisAngle(up, dir));
      }
    }
    clearings.push([cx, cz, Math.hypot(hx, hz) + 3]);
    return { center: new THREE.Vector3(cx, ground(cx, cz), cz), radius: Math.max(hx, hz), half: new THREE.Vector2(hx, hz), yaw } as Range;
  };

  // ---- windmill ---------------------------------------------------------------------
  const sails: { group: THREE.Group; speed: number }[] = [];
  const clothMat = new THREE.MeshStandardMaterial({ color: 0xefe6d0, roughness: 0.95, side: THREE.DoubleSide });
  clothMat.userData.styleSoftness = 0;
  const windmill = (x: number, z: number, yaw: number) => {
    const y = ground(x, z) - 0.3;
    batch.add('stone', new THREE.CylinderGeometry(3.4, 3.8, 2.6, 16), place(x, y + 1.3, z), 2.5);
    batch.add('plaster', new THREE.CylinderGeometry(2.4, 3.1, 9.5, 16), place(x, y + 2.6 + 4.75, z), 2.2);
    for (const h of [2.6, 7, 11.4]) batch.add('timber', new THREE.CylinderGeometry(3.05 - (h - 2.6) * 0.07, 3.12 - (h - 2.6) * 0.07, 0.25, 16), place(x, y + h, z), 1.5);
    batch.add('tile', new THREE.ConeGeometry(3.1, 4.2, 16), place(x, y + 12.1 + 2.1, z), 2);
    // Door and windows on the front.
    const f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const at = (d: number, h: number) => new THREE.Vector3(x, y + h, z).addScaledVector(f, d);
    let p = at(3.25, 1.4);
    batch.add('planks', box(1.3, 2.2, 0.2), place(p.x, p.y, p.z, yaw));
    for (const h of [5.5, 9]) {
      p = at(2.75 - (h - 5.5) * 0.08, h);
      batch.add('timber', box(0.8, 1.0, 0.18), place(p.x, p.y, p.z, yaw));
    }
    physics.addCylinder(new THREE.Vector3(x, y + 6, z), 6, 3.3);
    // Sails: a hub on the cap, four lattice arms with cloth, turning in the wind.
    const g = new THREE.Group();
    const hub = at(3.1, 11.6);
    g.position.copy(hub);
    g.rotation.y = yaw;
    const arms = new THREE.Group();
    g.add(arms);
    const armGeo: THREE.BufferGeometry[] = [];
    const clothGeo: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      const rot = new THREE.Matrix4().makeRotationZ(a);
      armGeo.push(box(0.28, 8, 0.2).applyMatrix4(new THREE.Matrix4().makeTranslation(0, 4.2, 0)).applyMatrix4(rot));
      for (let r = 0; r < 5; r++) armGeo.push(box(1.8, 0.08, 0.08).applyMatrix4(new THREE.Matrix4().makeTranslation(0.9, 1.6 + r * 1.5, 0)).applyMatrix4(rot));
      clothGeo.push(new THREE.PlaneGeometry(1.6, 6.2).applyMatrix4(new THREE.Matrix4().makeTranslation(0.95, 4.8, -0.06)).applyMatrix4(rot));
    }
    armGeo.push(new THREE.CylinderGeometry(0.45, 0.45, 0.9, 12).applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
    const armMesh = new THREE.Mesh(mergeGeometries(armGeo.map((q) => (q.index ? q.toNonIndexed() : q)), false)!, m.timber);
    const clothMesh = new THREE.Mesh(mergeGeometries(clothGeo, false)!, clothMat);
    armMesh.castShadow = clothMesh.castShadow = true;
    arms.add(armMesh, clothMesh);
    scene.add(g);
    sails.push({ group: arms, speed: 0.35 + Math.random() * 0.15 });
    clearings.push([x, z, 9]);
  };

  // ---- granary on staddle stones ----------------------------------------------------
  const granary = (x: number, z: number, yaw: number) => {
    const y = ground(x, z);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (const [lx, lz] of [[-2.6, -2], [2.6, -2], [-2.6, 2], [2.6, 2], [0, -2], [0, 2]]) {
      const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
      batch.add('stone', new THREE.CylinderGeometry(0.28, 0.4, 0.9, 8), place(px, y + 0.45, pz), 1);
      batch.add('stone', new THREE.CylinderGeometry(0.55, 0.55, 0.14, 10), place(px, y + 0.95, pz), 1);
    }
    batch.add('timber', box(6.4, 0.3, 5), place(x, y + 1.15, z, yaw));
    batch.add('planks', box(6, 3.2, 4.6), place(x, y + 2.9, z, yaw));
    for (const lz of [-2.35, 2.35]) for (const lx of [-3, -1, 1, 3]) {
      const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
      batch.add('timber', box(0.2, 3.3, 0.2), place(px, y + 2.9, pz, yaw));
    }
    for (const sd of [-1, 1]) {
      const g = box(7.2, 0.35, 3.4);
      g.translate(0, 0, sd * 1.5);
      g.rotateX(sd * 0.75);
      batch.add('thatch', g, place(x, y + 5.3, z, yaw), 2);
    }
    batch.add('planks', box(0.2, 2, 1.1), place(x + 3.05 * c, y + 2.4, z - 3.05 * s, yaw));
    physics.addBox(new THREE.Vector3(x, y + 2.8, z), new THREE.Vector3(3.2, 2.8, 2.5), new THREE.Quaternion().setFromAxisAngle(up, yaw));
    clearings.push([x, z, 7]);
  };

  // ---- barn --------------------------------------------------------------------------
  const barn = (x: number, z: number, yaw: number) => {
    const y = ground(x, z) - 0.2;
    const W = 16, D = 10, H = 5.5;
    batch.add('stone', box(W + 0.4, 1, D + 0.4), place(x, y + 0.3, z, yaw), 2);
    batch.add('barn', box(W, H, D), place(x, y + 0.8 + H / 2, z, yaw), 2);
    // Gambrel roof: steep lower and shallow upper slopes each side.
    for (const sd of [-1, 1]) {
      const lower = box(W + 1, 0.3, 3.6);
      lower.translate(0, 0, sd * 1.8);
      lower.rotateX(sd * 1.0);
      batch.add('tile', lower, place(x, y + 0.8 + H + 1.0, z + 0, yaw), 2);
      const upper = box(W + 1, 0.3, 3.4);
      upper.translate(0, 0, sd * 1.7);
      upper.rotateX(sd * 0.35);
      batch.add('tile', upper, place(x, y + 0.8 + H + 3.05, z, yaw), 2);
    }
    const c = Math.cos(yaw), s = Math.sin(yaw);
    // Big doors with white cross-braces on both gable ends.
    for (const sd of [-1, 1]) {
      const px = x + sd * (W / 2 + 0.06) * c, pz = z - sd * (W / 2 + 0.06) * s;
      batch.add('planks', box(0.12, 4, 4.2), place(px, y + 2.8, pz, yaw));
      batch.add('plaster', box(0.14, 4.1, 0.22), place(px, y + 2.8, pz, yaw, 0.76), 1);
      batch.add('plaster', box(0.14, 4.1, 0.22), place(px, y + 2.8, pz, yaw, -0.76), 1);
      // Gable triangle.
      const tri = new THREE.Shape();
      tri.moveTo(-D / 2, 0); tri.lineTo(D / 2, 0); tri.lineTo(D * 0.3, 2.1); tri.lineTo(0, 3.2); tri.lineTo(-D * 0.3, 2.1); tri.closePath();
      const gg = new THREE.ExtrudeGeometry(tri, { depth: 0.2, bevelEnabled: false });
      gg.rotateY(Math.PI / 2);
      gg.translate(sd * (W / 2) - 0.1, 0, 0);
      batch.add('barn', gg, place(x, y + 0.8 + H, z, yaw), 2);
    }
    physics.addBox(new THREE.Vector3(x, y + 4, z), new THREE.Vector3(W / 2, 4, D / 2), new THREE.Quaternion().setFromAxisAngle(up, yaw));
    clearings.push([x, z, 12]);
    return new THREE.Vector3(x + (W / 2 + 2) * c, ground(x + (W / 2 + 2) * c, z - (W / 2 + 2) * s), z - (W / 2 + 2) * s);
  };

  // ---- watermill ---------------------------------------------------------------------
  const wheels: THREE.Group[] = [];
  const watermill = (z: number) => {
    const rx = riverX(z);
    const x = rx - 11;
    const y = ground(x, z) - 0.2;
    batch.add('stone', box(9, 1.6, 7), place(x, y + 0.6, z), 2);
    batch.add('plaster', box(8.4, 4, 6.4), place(x, y + 3.4, z), 2);
    for (const sd of [-1, 1]) {
      const g = box(9.6, 0.3, 4.3);
      g.translate(0, 0, sd * 2.05);
      g.rotateX(sd * 0.7);
      batch.add('tile', g, place(x, y + 6.6, z), 2);
    }
    for (const lx of [-4.2, 0, 4.2]) batch.add('timber', box(0.2, 4, 0.2), place(x + lx, y + 3.4, z + 3.25));
    batch.add('stone', box(0.9, 5, 0.9), place(x - 2.5, y + 7, z - 1));
    // Wheel on the river side, turning with the current.
    const wheel = new THREE.Group();
    wheel.position.set(x + 5.4, RIVER_Y + 1.3, z);
    const spokes: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      spokes.push(box(0.16, 5, 0.16).applyMatrix4(new THREE.Matrix4().makeRotationZ(a)));
      spokes.push(box(0.9, 0.12, 1.3).applyMatrix4(new THREE.Matrix4().makeTranslation(0, 2.55, 0)).applyMatrix4(new THREE.Matrix4().makeRotationZ(a)));
    }
    spokes.push(new THREE.TorusGeometry(2.5, 0.12, 6, 28).toNonIndexed());
    spokes.push(new THREE.CylinderGeometry(0.3, 0.3, 1.8, 10).applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2)).toNonIndexed());
    const wm = new THREE.Mesh(mergeGeometries(spokes.map((q) => (q.index ? q.toNonIndexed() : q)), false)!, m.planks);
    wm.castShadow = true;
    wheel.add(wm);
    wheel.rotation.y = Math.PI / 2;
    scene.add(wheel);
    wheels.push(wheel);
    // Axle beam from the wall to the wheel.
    batch.add('timber', box(1.6, 0.35, 0.35), place(x + 4.6, RIVER_Y + 1.3, z));
    physics.addBox(new THREE.Vector3(x, y + 3, z), new THREE.Vector3(4.5, 3, 3.5));
    clearings.push([x, z, 10]);
    return [new THREE.Vector3(x + 1, ground(x + 1, z + 4.4), z + 4.4), new THREE.Vector3(x - 2, ground(x - 2, z + 4.4), z + 4.4)];
  };
  const RIVER_Y = -0.6;

  // ---- small farm dressing -----------------------------------------------------------
  const hay = (x: number, z: number, n: number) => {
    for (let k = 0; k < n; k++) {
      const a = k * 2.4, px = x + Math.cos(a) * 1.4 * (k > 0 ? 1 : 0), pz = z + Math.sin(a) * 1.4 * (k > 0 ? 1 : 0);
      batch.add('straw', new THREE.CylinderGeometry(0.75, 0.75, 1.2, 14), place(px, ground(px, pz) + 0.74, pz, 0, 0, Math.PI / 2), 1);
    }
  };
  const trough = (x: number, z: number, yaw: number) => {
    const y = ground(x, z);
    batch.add('planks', box(2.2, 0.55, 0.8), place(x, y + 0.3, z, yaw));
    batch.add('water', box(2.0, 0.05, 0.6), place(x, y + 0.52, z, yaw));
  };

  // ---- layout ------------------------------------------------------------------------
  windmill(-150, 112, 0.6);
  windmill(205, 176, -0.4);
  windmill(-118, 236, 0.2);
  granary(-42, 120, 0.05);
  granary(42, 120, -0.05);
  const barnDoor = barn(84, 112, 0.1);
  const millSpots = watermill(-36);
  hay(70, 102, 5);
  hay(-60, 108, 3);
  hay(-130, 70, 4);
  const cows = fenceRect(-150, 60, 32, 24, 0.12, 'e');
  trough(-122, 58, Math.PI / 2);
  const sheep = fenceRect(-62, -172, 36, 22, -0.08, 's');
  trough(-40, -160, 0);
  const horses = fenceRect(70, -150, 22, 16, 0.2, 'w');
  trough(62, -140, 0.2);
  const pigs = fenceRect(112, 104, 8, 6, 0.1, 'w');
  trough(108, 100, 0.1);

  const planks = m.planks as THREE.MeshStandardMaterial;
  const barnMat = planks.clone();
  barnMat.color.set(0xb04a38); // barn red
  const straw = new THREE.MeshStandardMaterial({ color: 0xd9b25e, roughness: 1 });
  const water = new THREE.MeshStandardMaterial({ color: 0x3f7fa6, roughness: 0.2, metalness: 0.1 });
  batch.build(scene, {
    stone: m.stone, plaster: m.plaster, timber: m.timber, planks: m.planks, thatch: m.thatch, tile: m.tile ?? m.slate,
    barn: barnMat, cloth: clothMat, straw, water,
  });

  let t = 0;
  return {
    ranges: {
      cows, sheep, horses, pigs,
      chickens: { center: new THREE.Vector3(62, ground(62, 99), 99), radius: 8 },
      dogs: { center: new THREE.Vector3(0, 0, -4), radius: 60 },
    },
    clearings,
    spots: {
      mill: millSpots,
      barn: [barnDoor, barnDoor.clone().add(new THREE.Vector3(1.5, 0, 1))],
      granary: [new THREE.Vector3(-38, ground(-38, 115), 115), new THREE.Vector3(46, ground(46, 115), 115)],
      pasture: [new THREE.Vector3(-40, ground(-40, -158), -158), new THREE.Vector3(-122, ground(-122, 62), 62)],
      stable: [new THREE.Vector3(50, ground(50, -140), -140)],
    },
    update(dt: number, wind: number) {
      t += dt;
      for (const s of sails) s.group.rotation.z -= dt * s.speed * (0.4 + wind * 1.4);
      for (const w of wheels) w.children[0].rotation.z += dt * 0.6;
    },
  };
}
