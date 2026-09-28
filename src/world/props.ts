import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, PALISADE_R, PLAZA_CENTER, PLAZA_R } from './terrain';
import { physics } from '../physics/physics';
import { buildHouse, worldUV, type WorldMats } from './buildings';
import { mulberry32, fbm } from '../core/math';
import { newTargetId, targets, type HitInfo, type Target } from '../combat/targets';
import type { FX } from '../fx/particles';

// Everything static in the Training Grounds besides the terrain.

const TEX = '/assets/textures/';

function pbr(loader: THREE.TextureLoader, id: string, opts: THREE.MeshStandardMaterialParameters = {}, aniso = 4) {
  const load = (m: string, srgb: boolean) => {
    const t = loader.load(`${TEX}${id}_${m}_1k.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const arm = load('arm', false);
  return new THREE.MeshStandardMaterial({ map: load('diff', true), normalMap: load('nor_gl', false), roughnessMap: arm, aoMap: arm, aoMapIntensity: 0.6, ...opts });
}

function strawTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const r = mulberry32(5);
  g.fillStyle = '#b8954f';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    const l = 120 + r() * 100;
    g.strokeStyle = `rgba(${l},${l * 0.8},${l * 0.4},${0.35 + r() * 0.4})`;
    g.lineWidth = 0.6 + r() * 1.4;
    const x = r() * 256, y = r() * 256;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 8, y + 10 + r() * 30);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------------------------------------------------------------------------
// Training dummy: a target that never dies and wobbles on its post when hit.
// ---------------------------------------------------------------------------
class Dummy implements Target {
  id = newTargetId();
  kind = 'dummy';
  alive = true;
  lockable = true;
  stunned = false;
  hp = 9999;
  maxHp = 9999;
  radius = 0.34;
  halfHeight = 0.45;
  position: THREE.Vector3;
  center: THREE.Vector3;
  private tilt = new THREE.Vector2();
  private tiltV = new THREE.Vector2();
  private pivot = new THREE.Group();

  constructor(at: THREE.Vector3, yaw: number, scene: THREE.Scene, mats: { wood: THREE.Material; straw: THREE.Material; burlap: THREE.Material; rope: THREE.Material }) {
    this.position = at.clone();
    this.center = at.clone().add(new THREE.Vector3(0, 1.3, 0));
    const g = new THREE.Group();
    g.position.copy(at);
    g.rotation.y = yaw;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.1, 10), mats.wood);
    post.position.y = 1.05;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.14), mats.wood);
    base.position.y = 0.07;
    const base2 = base.clone();
    base2.rotation.y = Math.PI / 2;
    g.add(post, base, base2);
    // The body pivots at the base of the straw so hits make it rock.
    this.pivot.position.y = 0.75;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.3, 0.95, 16, 4), mats.straw);
    body.position.y = 0.55;
    const arms = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.2, 8), mats.straw);
    arms.rotation.z = Math.PI / 2;
    arms.position.y = 0.85;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), mats.burlap);
    head.position.y = 1.2;
    head.scale.y = 1.1;
    for (const y of [0.2, 0.6, 0.95]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(y > 0.9 ? 0.1 : 0.29, 0.018, 6, 20), mats.rope);
      band.rotation.x = Math.PI / 2;
      band.position.y = y;
      this.pivot.add(band);
    }
    this.pivot.add(body, arms, head);
    g.add(this.pivot);
    g.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
    scene.add(g);
    physics.addCylinder(at.clone().add(new THREE.Vector3(0, 1, 0)), 1, 0.3);
    targets.add(this);
  }

  takeHit(h: HitInfo) {
    this.hp = this.maxHp; // training dummies are immortal
    this.tiltV.x += h.dir.z * 4.5;
    this.tiltV.y -= h.dir.x * 4.5;
  }

  update(dt: number) {
    // Damped spring back to upright.
    this.tiltV.addScaledVector(this.tilt, -60 * dt).multiplyScalar(Math.exp(-3.5 * dt));
    this.tilt.addScaledVector(this.tiltV, dt);
    this.pivot.rotation.set(this.tilt.x, 0, this.tilt.y);
  }
}

// ---------------------------------------------------------------------------
// Conifers for the hills: trunk + four jittered cone skirts, instanced.
// ---------------------------------------------------------------------------
function coniferGeometry(seed: number) {
  const r = mulberry32(seed);
  const cones: THREE.BufferGeometry[] = [];
  const layers = 7;
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const rad = 2.3 * (1 - t * 0.82);
    const h = 2.6 * (1 - t * 0.3);
    const g = new THREE.ConeGeometry(rad, h, 13, 3, true);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k);
      // Droop the skirt edge and jitter it so silhouettes aren't perfect cones.
      const edge = y < -h / 2 + 0.01;
      const j = 1 + (r() - 0.5) * 0.35;
      p.setXYZ(k, p.getX(k) * j, y - (edge ? 0.25 + r() * 0.3 : 0), p.getZ(k) * j);
    }
    g.rotateY(r() * Math.PI);
    g.translate((r() - 0.5) * 0.15, 2.0 + i * 1.3 + h / 2, (r() - 0.5) * 0.15);
    cones.push(g);
  }
  const foliage = mergeGeometries(cones.map((g) => g.toNonIndexed()))!;
  foliage.computeVertexNormals();
  // Vertex colour: darker inside/under each skirt.
  const p = foliage.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  for (let k = 0; k < p.count; k++) {
    const rr = Math.hypot(p.getX(k), p.getZ(k));
    const shade = 0.55 + Math.min(1, rr / 1.8) * 0.45;
    const v = 0.85 + ((k * 7919) % 13) / 60;
    col.set([0.07 * shade * v, 0.13 * shade * v, 0.06 * shade], k * 3);
  }
  foliage.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const trunk = new THREE.CylinderGeometry(0.16, 0.34, 4.5, 8);
  trunk.translate(0, 2.25, 0);
  return { foliage, trunk };
}

export interface World {
  update(dt: number): void;
}

export async function buildWorld(scene: THREE.Scene, renderer: THREE.WebGLRenderer, fx: FX): Promise<World> {
  const L = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const m: WorldMats = {
    stone: pbr(L, 'castle_brick_07', { color: 0xb0aaa0 }, aniso),
    plaster: pbr(L, 'white_plaster_rough_01', { color: 0xe8dcc4 }, aniso),
    timber: pbr(L, 'weathered_peeling_timber', { color: 0x5a4636 }, aniso),
    slate: pbr(L, 'roof_slates_02', { color: 0x8a8a92 }, aniso),
    thatch: pbr(L, 'thatch_roof_angled', { color: 0xc9b58a }, aniso),
    planks: pbr(L, 'wood_planks_grey', { color: 0x8a6a4a }, aniso),
    glass: new THREE.MeshStandardMaterial({ color: 0x3a2a10, emissive: 0xffa040, emissiveIntensity: 1.6, roughness: 0.3 }),
    bark: pbr(L, 'bark_brown_02', { color: 0x9a8a78 }, aniso),
  };

  // ---- houses along the northern street -----------------------------------
  const houses: { x: number; z: number; spec: Parameters<typeof buildHouse>[0]; rot: number }[] = [
    { x: -26, z: -38, rot: 0.08, spec: { w: 7, d: 6, floors: 2, roof: 'slate', seed: 1 } },
    { x: -15, z: -40, rot: -0.03, spec: { w: 6, d: 6.5, floors: 1, roof: 'thatch', seed: 2 } },
    { x: -5, z: -41, rot: 0.02, spec: { w: 8, d: 6, floors: 2, roof: 'slate', seed: 3 } },
    { x: 8, z: -40, rot: -0.06, spec: { w: 6.5, d: 6, floors: 2, roof: 'thatch', seed: 4 } },
    { x: 19, z: -39, rot: 0.05, spec: { w: 7, d: 6.5, floors: 1, roof: 'slate', seed: 5 } },
    { x: 30, z: -35, rot: -0.35, spec: { w: 7.5, d: 6, floors: 2, roof: 'slate', seed: 6 } },
    { x: -35, z: -30, rot: 0.5, spec: { w: 6, d: 5.5, floors: 1, roof: 'thatch', seed: 7 } },
  ];
  for (const h of houses) {
    const { group, half } = buildHouse(h.spec, m);
    // Sit on the lowest corner so the plinth never floats.
    let gy = Infinity;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) gy = Math.min(gy, heightAt(h.x + sx * half.x, h.z + sz * half.z));
    group.position.set(h.x, gy, h.z);
    group.rotation.y = h.rot;
    scene.add(group);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, h.rot, 0));
    physics.addBox(new THREE.Vector3(h.x, gy + half.y, h.z), half, q);
  }

  // ---- palisade --------------------------------------------------------------
  const logGeo = (() => {
    const shaft = new THREE.CylinderGeometry(0.17, 0.19, 1, 7, 1);
    shaft.translate(0, 0.5, 0);
    const tip = new THREE.ConeGeometry(0.17, 0.4, 7);
    tip.translate(0, 1.2, 0);
    return mergeGeometries([shaft.toNonIndexed(), tip.toNonIndexed()])!;
  })();
  const gateHalf = 3.2; // metres of gap either side of the road
  const rnd = mulberry32(99);
  const logs: THREE.Matrix4[] = [];
  const circumference = Math.PI * 2 * PALISADE_R;
  const n = Math.floor(circumference / 0.35);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.sin(a) * PALISADE_R, z = Math.cos(a) * PALISADE_R;
    if (z > 0 && Math.abs(x) < gateHalf) continue;
    const h = 3.3 + rnd() * 0.7;
    const y = heightAt(x, z) - 0.4;
    const mt = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.04, rnd() * 6, (rnd() - 0.5) * 0.04)),
      new THREE.Vector3(1, h, 1),
    );
    logs.push(mt);
  }
  // Bark UVs repeat along the log; scale y is baked per instance, fine for bark.
  const palisade = new THREE.InstancedMesh(logGeo, m.bark, logs.length);
  logs.forEach((mt, i) => palisade.setMatrixAt(i, mt));
  palisade.castShadow = true;
  palisade.receiveShadow = true;
  scene.add(palisade);
  // Colliders: short boxes around the ring (the gate gets its own).
  for (let i = 0; i < 96; i++) {
    const a = ((i + 0.5) / 96) * Math.PI * 2;
    const x = Math.sin(a) * PALISADE_R, z = Math.cos(a) * PALISADE_R;
    if (z > 0 && Math.abs(x) < gateHalf + 1) continue;
    const seg = (Math.PI * 2 * PALISADE_R) / 96;
    physics.addBox(new THREE.Vector3(x, heightAt(x, z) + 2, z), new THREE.Vector3(seg / 2 + 0.2, 3, 0.3), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, 0)));
  }
  // Gatehouse: two towers and closed doors.
  const gz = Math.sqrt(PALISADE_R * PALISADE_R - gateHalf * gateHalf);
  const gy = heightAt(0, gz);
  const towerParts: THREE.BufferGeometry[] = [];
  const plankParts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const cx = sx * (gateHalf + 1.4);
    for (const [px, pz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
      const g = new THREE.CylinderGeometry(0.2, 0.22, 7.5, 8);
      g.translate(cx + px, gy + 3.75 - 0.3, gz + pz);
      towerParts.push(g);
    }
    const floor = new THREE.BoxGeometry(3.2, 0.25, 3.2);
    floor.translate(cx, gy + 5, gz);
    plankParts.push(worldUV(floor));
    const roof = new THREE.ConeGeometry(2.7, 2, 4);
    roof.rotateY(Math.PI / 4);
    roof.translate(cx, gy + 8.2, gz);
    towerParts.push(roof);
    for (let k = 0; k < 4; k++) {
      const rail = new THREE.BoxGeometry(3.2, 0.12, 0.12);
      rail.rotateY((k * Math.PI) / 2);
      const off = new THREE.Vector3(0, 0, 1.55).applyAxisAngle(new THREE.Vector3(0, 1, 0), (k * Math.PI) / 2);
      rail.translate(cx + off.x, gy + 6, gz + off.z);
      plankParts.push(worldUV(rail));
    }
    physics.addBox(new THREE.Vector3(cx, gy + 3, gz), new THREE.Vector3(1.6, 4, 1.6));
  }
  const doorW = gateHalf;
  for (const sx of [-1, 1]) {
    const door = new THREE.BoxGeometry(doorW, 3.6, 0.18);
    door.translate(sx * doorW / 2, gy + 1.8, gz);
    plankParts.push(worldUV(door));
    for (const y of [0.6, 1.8, 3.0]) {
      const bar = new THREE.BoxGeometry(doorW - 0.1, 0.2, 0.1);
      bar.translate(sx * doorW / 2, gy + y, gz - 0.14);
      plankParts.push(worldUV(bar));
    }
  }
  const lintel = new THREE.CylinderGeometry(0.2, 0.2, gateHalf * 2 + 3, 8);
  lintel.rotateZ(Math.PI / 2);
  lintel.translate(0, gy + 4.4, gz);
  towerParts.push(lintel);
  physics.addBox(new THREE.Vector3(0, gy + 2, gz), new THREE.Vector3(gateHalf, 2.5, 0.35));
  const clean = (list: THREE.BufferGeometry[]) =>
    list.map((g) => {
      const gg = g.index ? g.toNonIndexed() : g;
      for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(k)) gg.deleteAttribute(k);
      return gg;
    });
  const towers = new THREE.Mesh(mergeGeometries(clean(towerParts))!, m.bark);
  const planks = new THREE.Mesh(mergeGeometries(clean(plankParts))!, m.planks);
  for (const o of [towers, planks]) {
    o.castShadow = o.receiveShadow = true;
    scene.add(o);
  }

  // ---- trees on the hills -------------------------------------------------------
  const { foliage, trunk } = coniferGeometry(3);
  const needleMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide, envMapIntensity: 0.35 });
  const treeMats: THREE.Matrix4[] = [];
  const tr = mulberry32(7);
  for (let i = 0; i < 700 && treeMats.length < 260; i++) {
    const a = tr() * Math.PI * 2;
    const rr = PALISADE_R + 9 + tr() * 90;
    const x = Math.sin(a) * rr, z = Math.cos(a) * rr;
    // Cluster into groves using noise, and keep the gate road clear.
    if (fbm(x * 0.03, z * 0.03, 3) < 0.48) continue;
    if (z > 0 && Math.abs(x) < 10) continue;
    const s = 0.8 + tr() * 0.7;
    treeMats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, heightAt(x, z) - 0.2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, tr() * 6, 0)), new THREE.Vector3(s, s * (0.9 + tr() * 0.3), s)));
  }
  const fol = new THREE.InstancedMesh(foliage, needleMat, treeMats.length);
  const trk = new THREE.InstancedMesh(trunk, m.bark, treeMats.length);
  treeMats.forEach((mt, i) => {
    fol.setMatrixAt(i, mt);
    trk.setMatrixAt(i, mt);
  });
  // Trees stand outside the shadow box around the player; skip them in the shadow pass.
  fol.castShadow = trk.castShadow = false;
  fol.receiveShadow = true;
  scene.add(fol, trk);

  // ---- training dummies ----------------------------------------------------------
  const woodMat = m.planks;
  const straw = new THREE.MeshStandardMaterial({ map: strawTexture(), roughness: 0.95 });
  const burlap = new THREE.MeshStandardMaterial({ color: 0x9a845e, roughness: 1 });
  const rope = new THREE.MeshStandardMaterial({ color: 0x6b5534, roughness: 1 });
  const dummies: Dummy[] = [];
  for (const [ang, yaw] of [[-2.2, 0.6], [-1.5, 0.2], [2.2, -0.6]] as const) {
    const x = PLAZA_CENTER.x + Math.sin(ang) * (PLAZA_R - 1.5);
    const z = PLAZA_CENTER.y + Math.cos(ang) * (PLAZA_R - 1.5);
    dummies.push(new Dummy(new THREE.Vector3(x, heightAt(x, z), z), yaw, scene, { wood: woodMat, straw, burlap, rope }));
  }

  // ---- glTF props (CC0 Poly Haven) ----------------------------------------------
  const gl = new GLTFLoader();
  const loadModel = async (id: string) => {
    try {
      const g = await gl.loadAsync(`/assets/models/${id}.glb`);
      g.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      return g.scene;
    } catch (e) {
      console.warn('model failed', id, e);
      return null;
    }
  };
  const place = (src: THREE.Object3D | null, x: number, z: number, rotY = 0, s = 1, collider?: number) => {
    if (!src) return;
    const o = src.clone();
    o.position.set(x, heightAt(x, z), z);
    o.rotation.y = rotY;
    o.scale.setScalar(s);
    scene.add(o);
    if (collider) physics.addCylinder(new THREE.Vector3(x, heightAt(x, z) + 0.8, z), 0.8, collider * s);
  };
  const [barrels, crate, barrel, boulder, rocks, shrub, firepit, lantern, stump] = await Promise.all(
    ['wooden_barrels_01', 'wooden_crate_01', 'Barrel_01', 'boulder_01', 'rock_moss_set_01', 'shrub_02', 'stone_fire_pit', 'wooden_lantern_01', 'tree_stump_01'].map(loadModel),
  );
  // Around the houses.
  place(barrels, -21, -34.5, 0.4, 1, 0.9);
  place(crate, -10.5, -36, 0.2, 1.1, 0.5);
  place(crate, -9.4, -36.4, 1.1, 0.9, 0.45);
  place(barrel, 13.5, -35.5, 0, 1, 0.4);
  place(barrel, 14.3, -36.1, 1, 1, 0.4);
  place(crate, 24.5, -33, 0.6, 1, 0.5);
  // Edge of the plaza: a fire pit and a supply corner.
  place(firepit, PLAZA_CENTER.x + 9.5, PLAZA_CENTER.y - 9.5, 0, 1.2, 0.8);
  place(barrels, PLAZA_CENTER.x - 12, PLAZA_CENTER.y - 9.5, 2.1, 1, 0.9);
  place(crate, PLAZA_CENTER.x - 13.2, PLAZA_CENTER.y - 7.6, 0.3, 1, 0.5);
  // Lanterns on posts along the street.
  for (const x of [-20, -1, 14, 25]) {
    const z = -33;
    const postG = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.6, 8), m.bark);
    postG.position.set(x, heightAt(x, z) + 1.3, z);
    postG.castShadow = true;
    scene.add(postG);
    if (lantern) {
      const l = lantern.clone();
      l.position.set(x, heightAt(x, z) + 2.6, z);
      scene.add(l);
    }
  }
  // Boulders and rocks out in the fields, as cover.
  const rr = mulberry32(21);
  for (const [x, z, s] of [[-34, 2, 1.4], [36, 26, 1.8], [-16, 44, 1.2], [42, -8, 1.5], [-44, 22, 1.7], [12, 50, 1.3]] as const) {
    place(boulder, x, z, rr() * 6, s, 1.1);
  }
  for (const [x, z] of [[-40, -10], [30, 40], [-28, 44], [46, 12]] as const) place(rocks, x, z, rr() * 6, 1.3);
  for (let i = 0; i < 16; i++) {
    const a = rr() * Math.PI * 2;
    const r = PALISADE_R - 2.5 - rr() * 3;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (z > 0 && Math.abs(x) < 8) continue;
    if (z < -25) continue;
    place(shrub, x, z, rr() * 6, 0.8 + rr() * 0.6);
  }
  for (const [x, z] of [[-24, 30], [33, -12], [8, 28]] as const) place(stump, x, z, rr() * 6, 1, 0.5);

  // Fire in the pit.
  const pit = new THREE.Vector3(PLAZA_CENTER.x + 9.5, heightAt(PLAZA_CENTER.x + 9.5, PLAZA_CENTER.y - 9.5) + 0.35, PLAZA_CENTER.y - 9.5);
  let fireT = 0;

  return {
    update(dt: number) {
      for (const d of dummies) d.update(dt);
      fireT += dt;
      if (fireT > 0.03) {
        fireT = 0;
        fx.add.spawn({ pos: pit, vel: new THREE.Vector3(0, 1.6, 0), spread: 0.4, count: 2, life: [0.4, 0.8], size: [0.35, 0.05], color: 0xffc060, color2: 0xff2a00, jitter: 0.5 });
        if (Math.random() < 0.3) fx.alpha.spawn({ pos: pit.clone().setY(pit.y + 0.8), vel: new THREE.Vector3(0.3, 1.2, 0), spread: 0.3, count: 1, life: [1.5, 2.5], size: [0.4, 1.4], color: 0x444040, alpha: 0.25 });
      }
    },
  };
}
