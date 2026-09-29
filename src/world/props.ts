import * as THREE from 'three';
import { paintedMaterials } from '../render/painted';
import { buildVillage, type PlacedHouse, type Village } from './village';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, PALISADE_R, PLAZA_CENTER, PLAZA_R, GATES } from './terrain';
import { physics } from '../physics/physics';
import { buildHouse, worldUV, type WorldMats } from './buildings';
import { buildBridge } from './water';
import { buildCrypt } from './crypt';
import { mulberry32, wrapAngle as wrap } from '../core/math';
import { newTargetId, targets, type HitInfo, type Target } from '../combat/targets';
import type { FX } from '../fx/particles';

// Everything static in the Training Grounds besides the terrain.

const TEX = '/assets/textures/';

export function pbr(loader: THREE.TextureLoader, id: string, opts: THREE.MeshStandardMaterialParameters = {}, aniso = 4, desaturate = 0) {
  const load = (m: string, srgb: boolean) => {
    const t = loader.load(`${TEX}${id}_${m}_1k.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const arm = load('arm', false);
  const mat = new THREE.MeshStandardMaterial({ map: load('diff', true), normalMap: load('nor_gl', false), roughnessMap: arm, aoMap: arm, aoMapIntensity: 0.6, ...opts });
  if (desaturate > 0) {
    // Pull the texture's own colour toward grey (e.g. reddish photo rock -> granite).
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15))), ${desaturate.toFixed(2)});`,
      );
    };
  }
  return mat;
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

/**
 * Exact static collision for a placed prop: its (already simplified) meshes
 * baked into one world-space triangle mesh.
 */
function addMeshCollider(obj: THREE.Object3D) {
  obj.updateMatrixWorld(true);
  const verts: number[] = [];
  const idx: number[] = [];
  const v = new THREE.Vector3();
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    const pos = g.attributes.position as THREE.BufferAttribute;
    const base = verts.length / 3;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      verts.push(v.x, v.y, v.z);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
    else for (let i = 0; i < pos.count; i++) idx.push(base + i);
  });
  if (idx.length) physics.addTrimesh(new Float32Array(verts), new Uint32Array(idx));
}

export interface World {
  crypt: ReturnType<typeof buildCrypt>;
  village: Village;
  update(dt: number): void;
}

/** keepClear: points the village must leave open (NPCs, guild, interactables). */
export async function buildWorld(scene: THREE.Scene, renderer: THREE.WebGLRenderer, fx: FX, keepClear: THREE.Vector2[] = []): Promise<World> {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  // Painted surfaces (docs/ART-DIRECTION.md): no photographic textures in town.
  const m: WorldMats = {
    ...paintedMaterials(aniso),
    // Windows read dark by day with only a faint warm glow.
    glass: new THREE.MeshStandardMaterial({ color: 0x2c3440, emissive: 0xffa040, emissiveIntensity: 0.28, roughness: 0.25, metalness: 0.2 }),
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
    { x: -72, z: -72, rot: 0.25, spec: { w: 8, d: 7, floors: 2, roof: 'slate', seed: 21 } },
    { x: -54, z: -74, rot: -0.1, spec: { w: 7, d: 6, floors: 1, roof: 'thatch', seed: 22 } },
    { x: -30, z: -72, rot: 0.05, spec: { w: 9, d: 7, floors: 2, roof: 'slate', seed: 23 } },
    { x: 5, z: -72, rot: -0.05, spec: { w: 7, d: 6.5, floors: 1, roof: 'thatch', seed: 24 } },
    { x: 48, z: -68, rot: 0.18, spec: { w: 8, d: 7, floors: 2, roof: 'slate', seed: 25 } },
    { x: 70, z: -52, rot: -0.18, spec: { w: 7, d: 6, floors: 1, roof: 'thatch', seed: 26 } },
    { x: -72, z: -28, rot: 0.28, spec: { w: 7, d: 6, floors: 1, roof: 'thatch', seed: 27 } },
    { x: 72, z: -25, rot: -0.22, spec: { w: 8, d: 6.5, floors: 2, roof: 'slate', seed: 28 } },
    { x: -74, z: 5, rot: 0.02, spec: { w: 9, d: 7, floors: 2, roof: 'slate', seed: 29 } },
    { x: 68, z: 10, rot: -0.12, spec: { w: 7, d: 6, floors: 1, roof: 'thatch', seed: 30 } },
    { x: -70, z: 44, rot: 0.14, spec: { w: 7, d: 6, floors: 2, roof: 'slate', seed: 31 } },
    { x: -45, z: 58, rot: -0.08, spec: { w: 8, d: 7, floors: 1, roof: 'thatch', seed: 32 } },
    { x: -5, z: 62, rot: 0.08, spec: { w: 9, d: 7, floors: 2, roof: 'slate', seed: 33 } },
    { x: 35, z: 62, rot: -0.12, spec: { w: 8, d: 6.5, floors: 1, roof: 'thatch', seed: 34 } },
    { x: 67, z: 52, rot: 0.22, spec: { w: 7, d: 6, floors: 2, roof: 'slate', seed: 35 } },
    // Commerce district / civic buildings.
    { x: 22, z: -12, rot: 0, spec: { w: 16, d: 12, floors: 2, roof: 'slate', seed: 90 } },
    { x: -24, z: 14, rot: 0.06, spec: { w: 12, d: 9, floors: 2, roof: 'slate', seed: 91 } },
    { x: -5, z: 29, rot: -0.04, spec: { w: 11, d: 8, floors: 1, roof: 'thatch', seed: 92 } },
    { x: 27, z: 25, rot: 0.05, spec: { w: 11, d: 8, floors: 1, roof: 'slate', seed: 93 } },
    { x: 48, z: 4, rot: -0.06, spec: { w: 10, d: 8, floors: 1, roof: 'thatch', seed: 94 } },
    { x: -48, z: 4, rot: 0.08, spec: { w: 10, d: 8, floors: 1, roof: 'thatch', seed: 95 } },
    { x: -44, z: 25, rot: -0.04, spec: { w: 10, d: 8, floors: 2, roof: 'slate', seed: 96 } },
    { x: 48, z: 30, rot: 0.07, spec: { w: 10, d: 8, floors: 1, roof: 'thatch', seed: 97 } },
    { x: 48, z: -35, rot: -0.1, spec: { w: 9, d: 7, floors: 1, roof: 'slate', seed: 98 } },
  ];
  const placed: PlacedHouse[] = [];
  for (const h of houses) {
    // Roofs: mostly terracotta, some slate-blue, thatch where specified.
    if (h.spec.roof === 'slate' && h.spec.seed % 3 !== 0) h.spec.roof = 'tile';
    const { group, half, chimney } = buildHouse(h.spec, m);
    placed.push({ x: h.x, z: h.z, rot: h.rot, half, chimney });
    // Sit on the lowest corner so the plinth never floats.
    let gy = Infinity;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) gy = Math.min(gy, heightAt(h.x + sx * half.x, h.z + sz * half.z));
    group.position.set(h.x, gy, h.z);
    group.rotation.y = h.rot;
    scene.add(group);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, h.rot, 0));
    physics.addBox(new THREE.Vector3(h.x, gy + half.y, h.z), half, q);
  }

  buildBridge(scene, m);
  const crypt = buildCrypt(scene, m, fx);
  const village = buildVillage(scene, m, fx, placed, keepClear);

  // Large civic square and shopfront signs. These buildings make the starting
  // area read as a proper frontier town rather than a training camp.
  const sign = (text: string, x: number, z: number, color: string, w = 4.2) => {
    const c = document.createElement('canvas');
    c.width = 320; c.height = 72;
    const g = c.getContext('2d')!;
    g.fillStyle = '#f5e8c9'; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#8b6336'; g.lineWidth = 8; g.strokeRect(4, 4, c.width - 8, c.height - 8);
    g.fillStyle = color; g.font = '700 26px Cinzel, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, c.height / 2);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.0), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
    mesh.position.set(x, heightAt(x, z) + 2.7, z);
    mesh.rotation.y = Math.PI;
    mesh.castShadow = true;
    scene.add(mesh);
  };
  sign("ADVENTURER'S GUILD", 22, -18, '#704d1f', 6.8);
  sign('THE WAYFARER INN', -24, 8, '#6b4b3b', 5.2);
  sign('FRÖST FORGE', 27, 19, '#5d6870', 4.4);
  sign('MOONGLASS APOTHECARY', 48, -2, '#2f7462', 5.8);
  sign('SUNLIT BAKERY', -5, 23, '#8a5b27', 4.8);
  sign('THREAD & HIDE', -48, 1, '#6f4777', 4.4);
  sign('ARCANE EMPORIUM', 48, 26, '#4e5f8f', 4.9);
  sign('WESTERN CARPENTRY', -44, 21, '#6b5033', 5.0);
  sign('TRAVELER STABLES', 48, -40, '#5e5135', 5.2);

  // ---- palisade with three open gates -------------------------------------------
  const logGeo = (() => {
    const shaft = new THREE.CylinderGeometry(0.17, 0.19, 1, 7, 1);
    shaft.translate(0, 0.5, 0);
    const tip = new THREE.ConeGeometry(0.17, 0.4, 7);
    tip.translate(0, 1.2, 0);
    return mergeGeometries([shaft.toNonIndexed(), tip.toNonIndexed()])!;
  })();
  const gateHalf = 3.4; // metres of opening either side of each road
  const gateAngles = Object.values(GATES).map((g) => Math.atan2(g.x, g.y));
  const inGate = (a: number, pad: number) => gateAngles.some((ga) => Math.abs(wrap(a - ga)) * PALISADE_R < gateHalf + pad);
  const rnd = mulberry32(99);
  const logs: THREE.Matrix4[] = [];
  const n = Math.floor((Math.PI * 2 * PALISADE_R) / 0.35);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (inGate(a, 0)) continue;
    const x = Math.sin(a) * PALISADE_R, z = Math.cos(a) * PALISADE_R;
    const h = 3.3 + rnd() * 0.7;
    logs.push(new THREE.Matrix4().compose(
      new THREE.Vector3(x, heightAt(x, z) - 0.4, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.04, rnd() * 6, (rnd() - 0.5) * 0.04)),
      new THREE.Vector3(1, h, 1),
    ));
  }
  const palisade = new THREE.InstancedMesh(logGeo, m.bark, logs.length);
  logs.forEach((mt, i) => palisade.setMatrixAt(i, mt));
  palisade.castShadow = true;
  palisade.receiveShadow = true;
  scene.add(palisade);
  const segs = 128;
  for (let i = 0; i < segs; i++) {
    const a = ((i + 0.5) / segs) * Math.PI * 2;
    if (inGate(a, 1)) continue;
    const x = Math.sin(a) * PALISADE_R, z = Math.cos(a) * PALISADE_R;
    const seg = (Math.PI * 2 * PALISADE_R) / segs;
    physics.addBox(new THREE.Vector3(x, heightAt(x, z) + 2, z), new THREE.Vector3(seg / 2 + 0.2, 3, 0.3), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, 0)));
  }
  // Gatehouses: twin towers and a lintel over each open gate.
  const towerParts: THREE.BufferGeometry[] = [];
  const plankParts: THREE.BufferGeometry[] = [];
  for (const ga of gateAngles) {
    const out = new THREE.Vector3(Math.sin(ga), 0, Math.cos(ga));
    const side = new THREE.Vector3(out.z, 0, -out.x);
    const centre = out.clone().multiplyScalar(PALISADE_R);
    const gy = heightAt(centre.x, centre.z);
    const rotY = Math.atan2(out.x, out.z);
    const place = (g: THREE.BufferGeometry, local: THREE.Vector3) => {
      g.rotateY(rotY);
      const w = centre.clone().addScaledVector(side, local.x).addScaledVector(out, local.z);
      g.translate(w.x, gy + local.y, w.z);
      return g;
    };
    for (const sx of [-1, 1]) {
      const cx = sx * (gateHalf + 1.4);
      for (const [px, pz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
        towerParts.push(place(new THREE.CylinderGeometry(0.2, 0.22, 7.5, 8), new THREE.Vector3(cx + px, 3.45, pz)));
      }
      plankParts.push(worldUV(place(new THREE.BoxGeometry(3.2, 0.25, 3.2), new THREE.Vector3(cx, 5, 0))));
      const roof = new THREE.ConeGeometry(2.7, 2, 4);
      roof.rotateY(Math.PI / 4);
      towerParts.push(place(roof, new THREE.Vector3(cx, 8.2, 0)));
      for (let k = 0; k < 4; k++) {
        const rail = new THREE.BoxGeometry(3.2, 0.12, 0.12);
        rail.rotateY((k * Math.PI) / 2);
        const off = new THREE.Vector3(0, 0, 1.55).applyAxisAngle(new THREE.Vector3(0, 1, 0), (k * Math.PI) / 2);
        plankParts.push(worldUV(place(rail, new THREE.Vector3(cx + off.x, 6, off.z))));
      }
      const tc = centre.clone().addScaledVector(side, cx);
      physics.addBox(new THREE.Vector3(tc.x, gy + 3, tc.z), new THREE.Vector3(1.6, 4, 1.6), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)));
    }
    const lintel = new THREE.CylinderGeometry(0.2, 0.2, gateHalf * 2 + 3, 8);
    lintel.rotateZ(Math.PI / 2);
    towerParts.push(place(lintel, new THREE.Vector3(0, 4.6, 0)));
    // Doors stand open against the inside of the wall.
    for (const sx of [-1, 1]) {
      const door = new THREE.BoxGeometry(gateHalf, 3.6, 0.18);
      door.rotateY(sx * 1.35);
      plankParts.push(worldUV(place(door, new THREE.Vector3(sx * (gateHalf - 0.35), 1.8, -gateHalf * 0.5))));
    }
  }
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
  const place = (src: THREE.Object3D | null, x: number, z: number, rotY = 0, s = 1, collider?: number, shadow = true) => {
    if (!src) return;
    const o = src.clone();
    o.position.set(x, heightAt(x, z), z);
    o.rotation.y = rotY;
    o.scale.setScalar(s);
    if (!shadow) o.traverse((c) => (c.castShadow = false));
    scene.add(o);
    if (collider) addMeshCollider(o);
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
  // Boulders and rock clusters out in the meadows, as cover while fighting.
  const rr = mulberry32(21);
  for (const [x, z, sc] of [[-40, 112, 1.5], [44, 138, 1.8], [-62, 168, 1.4], [70, 96, 1.6], [26, 248, 1.5], [-34, 262, 1.7], [112, -58, 1.5], [96, 150, 1.4]] as const) {
    place(boulder, x, z, rr() * 6, sc, 1.1);
  }
  for (const [x, z] of [[-24, 128], [58, 176], [110, 60], [-70, 214]] as const) place(rocks, x, z, rr() * 6, 1.3, 1);
  // Bushes along the inside of the wall (clear of the gates and the house row).
  for (let i = 0; i < 26; i++) {
    const a = rr() * Math.PI * 2;
    const r = PALISADE_R - 2.5 - rr() * 3;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (Object.values(GATES).some((g) => Math.hypot(g.x - x, g.y - z) < 10)) continue;
    if (z < -25 && Math.abs(x) < 45) continue;
    place(shrub, x, z, rr() * 6, 0.8 + rr() * 0.6, undefined, false);
  }
  // Stumps where the western forest has been cut back.
  for (const [x, z] of [[-118, 34], [-126, -42], [-112, 84], [-135, 10]] as const) place(stump, x, z, rr() * 6, 1, 0.5);

  // Fire in the pit.
  const pit = new THREE.Vector3(PLAZA_CENTER.x + 9.5, heightAt(PLAZA_CENTER.x + 9.5, PLAZA_CENTER.y - 9.5) + 0.35, PLAZA_CENTER.y - 9.5);
  let fireT = 0;

  return {
    crypt,
    village,
    update(dt: number) {
      crypt.update(dt);
      village.update(dt);
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
