import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt } from '../terrainHeight';
import { physics } from '../../physics/physics';
import { mulberry32 } from '../../core/math';
import { SITES, type P2 } from './elvenForestData';
import { buildGiant, barkMaterial, leafMaterial, bakeImpostor, impostorMaterial, buildWalkway, trunkRadius, type WalkTree } from './megaTree';
import { sanctumFolk, type FolkSettlement } from './elfFolk';
import { scriptTexture } from './elvenForest';

// The Elven Sanctum (docs/design/verdant-elves.md §4), the capital of the
// Verdant Elves, built in and around the World Tree: a tree three hundred
// metres tall whose crown is seen from Elder Glen on a clear day. At its foot,
// among roots like walls, stand the Council of Leaves in a hall of living
// wood, the Archive of Songs, Faelan's bowyer's range, the heartwood
// carvers' workshop, the weavers' looms and the moon-pool at the lake's
// edge; a stair climbs a sister tree to the canopy walk and rope bridges
// cross to the World Tree's own platform.
//
// Budgets: the tree itself is one mesh pair (built at boot, so its crown
// shows from afar); the city streams in within 1.3 km and is batched by
// material; beyond 1.5 km a painted impostor of the tree, scaled to keep its
// size on screen, stands in for the whole Sanctum.

const WT_H = 300, WT_GIRTH = 0.55;
const SISTER_H = 86;
const DECK = 22;
const PROXY_R = 1500;

const pol = (a: number, r: number): P2 => [SITES.worldTree[0] + Math.cos(a) * r, SITES.worldTree[1] + Math.sin(a) * r];
const v3 = ([x, z]: P2, dy = 0) => new THREE.Vector3(x, heightAt(x, z) + dy, z);

export class Sanctum {
  /** the World Tree (near) and the streamed city */
  readonly tree = new THREE.Group();
  readonly city = new THREE.Group();
  /** the far stand-in */
  readonly proxy: THREE.InstancedMesh;
  readonly settlement: FolkSettlement;
  readonly spots: Record<string, THREE.Vector3> = {};
  readonly clearings: [number, number, number][] = [];
  built = false;
  /** the canopy walk: where its stair starts, and its deck height */
  walkStart = new THREE.Vector3();
  readonly deckY: number;
  private glowMats: { mat: THREE.MeshStandardMaterial; day: number; night: number }[] = [];
  private blossoms: THREE.InstancedMesh;
  private proxySize: [number, number];
  private m = new THREE.Matrix4();
  private rnd = mulberry32(31337);
  private visible = true;
  private center: THREE.Vector3;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, private plank: THREE.Material, private rope: THREE.Material) {
    const [cx, cz] = SITES.worldTree;
    this.center = v3(SITES.worldTree);
    // ---- the World Tree ----
    const parts = buildGiant(300300, WT_H, 0, { girth: WT_GIRTH, rootReach: 0.35, rootHeight: 0.28, roots: 11, blobs: 7, crownScale: 1.05, lean: 0.01 });
    const bark = barkMaterial(), leaf = leafMaterial();
    const trunk = new THREE.Mesh(parts.trunk, bark), crown = new THREE.Mesh(parts.crown, leaf);
    for (const m of [trunk, crown]) {
      m.position.set(cx, this.center.y - 1, cz);
      m.castShadow = m.receiveShadow = true;
      this.tree.add(m);
    }
    physics.addCylinder(new THREE.Vector3(cx, this.center.y + 30, cz), 30, WT_GIRTH * trunkRadius(4, WT_H) * 0.95);
    // Blossoms that glow under the crown at dusk: sampled from the canopy's undersides.
    const pos = parts.crown.attributes.position, nor = parts.crown.attributes.normal;
    const N = 700;
    this.blossoms = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.1, 0), new THREE.MeshStandardMaterial({ color: 0xeaf6ff, emissive: 0xa8e0ff, emissiveIntensity: 0.6 }), N);
    let n = 0;
    for (let k = 0; k < 40000 && n < N; k++) {
      const i = Math.floor(this.rnd() * pos.count);
      if (nor.getY(i) > -0.25) continue;
      this.m.makeTranslation(cx + pos.getX(i), this.center.y - 1 + pos.getY(i) - 0.5, cz + pos.getZ(i));
      this.blossoms.setMatrixAt(n++, this.m);
    }
    this.blossoms.count = n;
    this.tree.add(this.blossoms);
    this.glowMats.push({ mat: this.blossoms.material as THREE.MeshStandardMaterial, day: 0.5, night: 3.2 });
    scene.add(this.tree, this.city);
    this.city.visible = false;
    // ---- the far impostor ----
    const lod1 = buildGiant(300300, WT_H, 1, { girth: WT_GIRTH, rootReach: 0.35, rootHeight: 0.28, roots: 11, blobs: 7, crownScale: 1.05, lean: 0.01 });
    const baked = bakeImpostor(renderer, lod1, [bark, leaf], WT_H, 512, 1024);
    this.proxySize = [baked.width, baked.height];
    const pm = impostorMaterial(baked.texture, { fog: false });
    pm.color.set(0xb8c8d8); // distance turns blue
    this.proxy = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), pm, 1);
    this.proxy.frustumCulled = false;
    this.proxy.renderOrder = -1;
    scene.add(this.proxy);

    // ---- the layout (people need their posts before the city is built) ----
    const s = this.spots;
    s.worldTree = this.center.clone();
    s.council = v3(pol(0.46, 56));
    s.lirael = v3(pol(0.46, 52));
    s.archive = v3(pol(-1.45, 54));
    s.ellisande = v3(pol(-1.45, 51));
    s.faelan = v3(pol(2.55, 58));
    s.range = v3(pol(2.55, 84));
    s.carvers = v3(pol(-0.55, 62));
    s.bench = v3(pol(-0.55, 58));
    s.pool = v3(SITES.moonPool);
    s.roots = v3(pol(0.59, 36));
    s.loom = v3(pol(1.95, 50));
    s.gateway = v3(pol(0.46, 104));
    this.settlement = sanctumFolk({
      center: this.center.clone(), council: s.council, lirael: s.lirael, faelan: s.faelan, carvers: s.carvers, archive: s.ellisande, pool: s.pool,
      weavers: [1.75, 1.85, 1.95, 2.05, 2.15].map((a) => v3(pol(a, 47))),
      plaza: [0.1, 0.8, 1.4, -0.3, -0.9, 2.9, -2.5].map((a) => v3(pol(a, 44 + (a > 0 ? 2 : -1)))),
      guards: [v3(pol(0.38, 100)), v3(pol(0.54, 100)), v3(pol(-1.45, 72)), v3(pol(2.6, 98))],
    });
    this.clearings.push([cx, cz, 120]);
    const sister1 = pol(1.25, 86), sister2 = pol(-2.2, 88);
    this.sisters = [sister1, sister2];
    this.deckY = this.center.y - 0.6 + DECK;
  }
  private sisters: P2[] = [];

  /** Build the city now (on approach, tests, screenshots). */
  buildNow() {
    if (this.built) return;
    this.built = true;
    const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const put = (g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0, rx = 0) => {
      g.rotateX(rx).rotateY(ry).translate(x, y, z);
      const c = g.index ? g.toNonIndexed() : g;
      for (const k of Object.keys(c.attributes)) if (k !== 'position' && k !== 'normal') c.deleteAttribute(k);
      const l = parts.get(mat) ?? [];
      l.push(c);
      parts.set(mat, l);
    };
    const solid = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) =>
      physics.addBox(new THREE.Vector3(x, y, z), new THREE.Vector3(w / 2, h / 2, d / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)));
    const std = (c: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });
    const silver = std(0xd8ccb0, { roughness: 0.7 }), living = std(0x8a6a4a, { roughness: 1 }), leaf = std(0x3d8a55, { roughness: 1 });
    const paleStone = std(0xd8d4c8), lamp = std(0xe8fff4, { emissive: 0x8affd0, emissiveIntensity: 1.2 });
    this.glowMats.push({ mat: lamp, day: 0.8, night: 3 });
    const Y = this.center.y;
    const [cx, cz] = SITES.worldTree;

    // The ring of pale stone round the tree, and the gateway arches where the road comes in.
    const ring = new THREE.RingGeometry(37, 43, 64, 1).rotateX(-Math.PI / 2);
    put(ring, paleStone, cx, Y + 0.06, cz);
    for (const r of [96, 104]) {
      const [gx, gz] = pol(0.46, r);
      const arch = new THREE.TorusGeometry(4.5, 0.32, 8, 20, Math.PI);
      put(arch, silver, gx, Y, gz, -0.46 + Math.PI / 2);
      for (const sd of [-1, 1]) solid(0.6, 4, 0.6, gx + Math.cos(0.46 + Math.PI / 2) * 4.5 * sd, Y + 2, gz + Math.sin(0.46 + Math.PI / 2) * 4.5 * sd);
      put(new THREE.IcosahedronGeometry(0.4, 1), lamp, gx, Y + 4.6, gz);
    }
    // The Council of Leaves: a hall of living wood, twelve arched ribs meeting overhead.
    const hall = (c: THREE.Vector3, R: number, ribs: number) => {
      put(new THREE.CylinderGeometry(R, R + 0.3, 0.3, 40), silver, c.x, c.y + 0.12, c.z);
      for (let k = 0; k < ribs; k++) {
        const rib = new THREE.TorusGeometry(R, R * 0.025 + 0.12, 6, 24, Math.PI);
        put(rib, living, c.x, c.y, c.z, (k / ribs) * Math.PI);
        // Feet of the ribs are solid; the doorway toward the road is left open.
        const a = (k / ribs) * Math.PI;
        for (const sd of [-1, 1]) solid(0.5, 3, 0.5, c.x + Math.cos(a) * R * sd, c.y + 1.5, c.z - Math.sin(a) * R * sd);
      }
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        put(new THREE.IcosahedronGeometry(R * 0.32, 1).scale(1, 0.55, 1), leaf, c.x + Math.cos(a) * R * 0.45, c.y + R * 0.92, c.z + Math.sin(a) * R * 0.45);
      }
      put(new THREE.IcosahedronGeometry(0.6, 1), lamp, c.x, c.y + R * 0.8, c.z);
    };
    hall(this.spots.council, 14, 12);
    hall(this.spots.archive, 8.5, 8);
    // The Council's seats in a crescent, and a living-wood throne for the Speaker.
    for (let k = 0; k < 7; k++) {
      const a = 0.46 + Math.PI + (k - 3) * 0.32;
      const c = this.spots.council;
      const x = c.x + Math.cos(a) * 9, z = c.z + Math.sin(a) * 9;
      put(new THREE.BoxGeometry(1.2, 0.5, 1), silver, x, Y + 0.5, z, -a + Math.PI / 2);
      put(new THREE.BoxGeometry(1.2, 2.2, 0.2), living, x + Math.cos(a) * 0.5, Y + 1.4, z + Math.sin(a) * 0.5, -a + Math.PI / 2);
    }
    // The archive's shelves of song-scrolls.
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3, c = this.spots.archive;
      const x = c.x + Math.cos(a) * 6.4, z = c.z + Math.sin(a) * 6.4;
      put(new THREE.BoxGeometry(2.4, 2.6, 0.6), living, x, Y + 1.3, z, -a + Math.PI / 2);
      for (let r = 0; r < 3; r++) put(new THREE.CylinderGeometry(0.08, 0.08, 2.1, 6).rotateZ(Math.PI / 2), std(0xe8dcb8), x - Math.cos(a) * 0.3, Y + 0.6 + r * 0.8, z - Math.sin(a) * 0.3, -a + Math.PI / 2);
      solid(2.4, 2.6, 0.6, x, Y + 1.3, z, -a + Math.PI / 2);
    }
    // Faelan's range: a pavilion, a bow rack and straw targets.
    {
      const f = this.spots.faelan;
      for (const [dx, dz] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) put(new THREE.CylinderGeometry(0.12, 0.15, 3.4, 6), silver, f.x + dx, Y + 1.7, f.z + dz);
      put(new THREE.SphereGeometry(4.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 1), leaf, f.x, Y + 3.3, f.z);
      put(new THREE.BoxGeometry(2.6, 1.8, 0.2), living, f.x - 1.5, Y + 0.9, f.z + 1.5, 0.4);
      for (let k = 0; k < 3; k++) {
        const a = 2.55 + (k - 1) * 0.12, [tx, tz] = pol(a, 84 + k * 6);
        put(new THREE.CylinderGeometry(0.9, 0.9, 0.3, 20).rotateX(Math.PI / 2), std(0xd8b860), tx, Y + 1.4, tz, -a + Math.PI / 2);
        put(new THREE.CylinderGeometry(0.45, 0.45, 0.32, 20).rotateX(Math.PI / 2), std(0xb8402e), tx, Y + 1.4, tz, -a + Math.PI / 2);
        put(new THREE.BoxGeometry(0.1, 1.2, 0.1), living, tx, Y + 0.5, tz);
      }
    }
    // The carvers' workshop: heartwood logs, a long bench, half-finished bows and figures.
    {
      const k0 = this.spots.carvers;
      put(new THREE.BoxGeometry(5, 0.9, 1.4), living, k0.x, Y + 0.45, k0.z, 0.55);
      solid(5, 0.9, 1.4, k0.x, Y + 0.45, k0.z, 0.55);
      for (let k = 0; k < 3; k++) put(new THREE.CylinderGeometry(0.7, 0.75, 6, 12).rotateZ(Math.PI / 2), std(0xb8862e), k0.x + 4 + k * 0.4, Y + 0.7 + k * 1.3 * (k % 2), k0.z + 3 - k * 1.5, 0.55);
      for (let k = 0; k < 4; k++) put(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 4).rotateZ(0.2), std(0xb8862e), k0.x - 1.5 + k * 0.6, Y + 1.7, k0.z - 1.2, 0.55);
      put(new THREE.SphereGeometry(4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.4, 0.4, 1), leaf, k0.x, Y + 3.6, k0.z);
      for (const [dx, dz] of [[-3, -2], [3, -2], [-3, 2], [3, 2]]) put(new THREE.CylinderGeometry(0.12, 0.15, 3.6, 6), silver, k0.x + dx, Y + 1.8, k0.z + dz);
    }
    // The weavers' looms.
    for (let k = 0; k < 4; k++) {
      const a = 1.8 + k * 0.12, [x, z] = pol(a, 52);
      for (const sd of [-1, 1]) put(new THREE.BoxGeometry(0.1, 1.9, 0.1), silver, x + Math.cos(a + Math.PI / 2) * sd * 0.8, Y + 0.95, z + Math.sin(a + Math.PI / 2) * sd * 0.8);
      put(new THREE.BoxGeometry(1.6, 1.3, 0.03), std(0x9ab8e8, { emissive: 0x6a8ad8, emissiveIntensity: 0.3 }), x, Y + 1.05, z, -a);
    }
    // Homes grown in among the roots.
    for (let k = 0; k < 10; k++) {
      const a = k * 0.63 + 0.2;
      if (Math.abs(Math.atan2(Math.sin(a - 0.46), Math.cos(a - 0.46))) < 0.25) continue;
      const [x, z] = pol(a, 31 + (k % 2) * 4);
      put(new THREE.SphereGeometry(2.6, 12, 8).scale(1, 0.85, 1), silver, x, Y + 1.8, z);
      put(new THREE.ConeGeometry(3, 2.4, 10), leaf, x, Y + 4, z);
      const door = new THREE.CircleGeometry(0.8, 14);
      put(door, lamp, x - Math.cos(a) * 2.55, Y + 1.1, z - Math.sin(a) * 2.55, -a - Math.PI / 2);
      solid(4, 3.4, 4, x, Y + 1.7, z);
    }
    // Lanterns of glowing blossom along the ring.
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2, [x, z] = pol(a, 44.5);
      put(new THREE.CylinderGeometry(0.06, 0.08, 3, 5), silver, x, Y + 1.5, z);
      put(new THREE.IcosahedronGeometry(0.32, 1), lamp, x, Y + 3.15, z);
    }
    // The moon-pool: a basin of pale stone holding the stars.
    {
      const p = this.spots.pool;
      put(new THREE.TorusGeometry(6.5, 0.6, 8, 40).rotateX(Math.PI / 2), paleStone, p.x, p.y + 0.3, p.z);
      put(new THREE.CylinderGeometry(6.4, 6.4, 0.2, 40), paleStone, p.x, p.y - 0.15, p.z);
      const poolMat = new THREE.MeshStandardMaterial({ color: 0x0a1a3a, roughness: 0.05, metalness: 0.3, emissive: 0x9ad8ff, emissiveMap: starfieldTexture(), emissiveIntensity: 0.3 });
      const water = new THREE.Mesh(new THREE.CircleGeometry(6.2, 40).rotateX(-Math.PI / 2), poolMat);
      water.position.set(p.x, p.y + 0.22, p.z);
      this.city.add(water);
      this.glowMats.push({ mat: poolMat, day: 0.25, night: 2.2 });
      // The Script round its rim.
      const script = new THREE.Mesh(new THREE.CylinderGeometry(6.9, 6.9, 0.5, 40, 1, true), new THREE.MeshStandardMaterial({ map: scriptTexture(), transparent: true, emissive: 0x8ad0ff, emissiveMap: scriptTexture(), emissiveIntensity: 1, depthWrite: false, side: THREE.DoubleSide }));
      script.position.set(p.x, p.y + 0.5, p.z);
      this.city.add(script);
    }
    for (const [mat, list] of parts) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false)!, mat);
      mesh.castShadow = mesh.receiveShadow = true;
      this.city.add(mesh);
    }
    // The sister trees and the canopy walk: a stair up the eastern sister, bridges to the World Tree's platform.
    const bark = barkMaterial(), leafM = leafMaterial();
    this.sisters.forEach(([x, z], k) => {
      const p = buildGiant(86860 + k, SISTER_H, 0, { girth: 0.9 });
      for (const g of [p.trunk, p.crown]) {
        const m = new THREE.Mesh(g, g === p.trunk ? bark : leafM);
        m.position.set(x, heightAt(x, z) - 0.6, z);
        m.castShadow = m.receiveShadow = true;
        this.city.add(m);
      }
      physics.addCylinder(new THREE.Vector3(x, heightAt(x, z) + 10, z), 10, 0.9 * trunkRadius(3, SISTER_H));
    });
    const trees: WalkTree[] = [
      { x: this.sisters[0][0], z: this.sisters[0][1], H: SISTER_H, girth: 0.9 },
      { x: cx, z: cz, H: WT_H, girth: WT_GIRTH },
      { x: this.sisters[1][0], z: this.sisters[1][1], H: SISTER_H, girth: 0.9 },
    ];
    const w = buildWalkway(this.city, { trees, deckY: this.deckY, bridges: [[0, 1], [1, 2]], stair: 0, startToward: [this.spots.council.x, this.spots.council.z], plank: this.plank, rope: this.rope });
    this.walkStart = w.start;
    // A lamp at every few steps of the canopy walk.
    for (const b of w.bridgeMids) {
      const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 1), lamp);
      l.position.copy(b).setY(b.y + 2.2);
      this.city.add(l);
    }
    this.city.visible = this.visible;
  }

  update(dt: number, camera: THREE.Vector3, night: number) {
    void dt;
    const d = Math.hypot(camera.x - this.center.x, camera.z - this.center.z);
    if (!this.built && d < 1300) this.buildNow();
    const near = d < PROXY_R;
    this.tree.visible = this.visible && near;
    this.city.visible = this.visible && this.built && d < 1100;
    this.proxy.visible = this.visible && !near && d < 9000;
    if (this.proxy.visible) {
      // Stand the card at 1.45 km toward the tree, scaled so it covers the same angle.
      const k = 1450 / d;
      const x = camera.x + (this.center.x - camera.x) * k, z = camera.z + (this.center.z - camera.z) * k;
      const y = camera.y + (this.center.y - 1 - camera.y) * k;
      this.m.makeScale(this.proxySize[0] * k, this.proxySize[1] * k, 1).setPosition(x, y, z);
      this.proxy.setMatrixAt(0, this.m);
      this.proxy.instanceMatrix.needsUpdate = true;
    }
    for (const g of this.glowMats) g.mat.emissiveIntensity = g.day + (g.night - g.day) * night;
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.tree.visible = this.city.visible = this.proxy.visible = v;
  }
}

let starTex: THREE.CanvasTexture | null = null;
function starfieldTexture() {
  if (starTex) return starTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 256);
  const r = mulberry32(777);
  for (let k = 0; k < 160; k++) {
    g.fillStyle = `rgba(255,255,255,${0.4 + r() * 0.6})`;
    g.beginPath();
    g.arc(r() * 256, r() * 256, 0.6 + r() * 1.6, 0, Math.PI * 2);
    g.fill();
  }
  // The wheel, faintly, in the stars.
  g.strokeStyle = 'rgba(160,220,255,0.6)';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(128, 128, 60, 0, Math.PI * 2);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    g.moveTo(128 + Math.cos(a) * 18, 128 + Math.sin(a) * 18);
    g.lineTo(128 + Math.cos(a) * 60, 128 + Math.sin(a) * 60);
  }
  g.stroke();
  starTex = new THREE.CanvasTexture(c);
  starTex.colorSpace = THREE.SRGBColorSpace;
  return starTex;
}
