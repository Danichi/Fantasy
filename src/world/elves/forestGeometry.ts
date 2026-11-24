import * as THREE from 'three';
import { StaticBatch } from '../cityKit';
import { buildHouse, type WorldMats } from '../buildings';
import { heightAt, forestBaseHeight } from '../terrainHeight';
import { physics } from '../../physics/physics';
import {
  FOREST_NODES,
  FOREST_POOLS,
  FOREST_ROUTES,
  FOREST_CREEK,
  FOREST_BRIDGE,
  forestNodeHeight,
  forestBridgeHeight,
  forestRefugeAt,
  segmentAt,
  forestTrailDistance,
  type ForestSite,
} from './layout';
export const CANOPY_HEIGHT = 28;
export const CANOPY_RADIUS = 32;
export function canopyArchiveAt(i: number) {
  const [x, z] = FOREST_NODES.sanctum,
    a = Math.PI / 3 + (i * Math.PI * 2) / 3;
  return new THREE.Vector3(x + Math.cos(a) * CANOPY_RADIUS, heightAt(x, z) + CANOPY_HEIGHT, z + Math.sin(a) * CANOPY_RADIUS);
}
export class ForestPalette {
  path = new THREE.MeshStandardMaterial({ color: 0x7d765b, roughness: 1 });
  bark = new THREE.MeshStandardMaterial({ color: 0x5f5b45, roughness: 0.96 });
  leaf = new THREE.MeshStandardMaterial({ color: 0x327c60, roughness: 0.85, flatShading: true });
  silver = new THREE.MeshStandardMaterial({ color: 0xb5c7ab, roughness: 0.7 });
  petal = new THREE.MeshStandardMaterial({ color: 0xceaccd, roughness: 0.8 });
  wood = new THREE.MeshStandardMaterial({ color: 0x74684a, roughness: 0.85 });
  stone = new THREE.MeshStandardMaterial({ color: 0x89988a, roughness: 0.9 });
  gold = new THREE.MeshStandardMaterial({ color: 0xc7b178, roughness: 0.48, metalness: 0.35 });
  glow = new THREE.MeshStandardMaterial({ color: 0xb5eed9, emissive: 0x6db99a, emissiveIntensity: 1.5 });
  water = new THREE.MeshStandardMaterial({ color: 0x478d88, roughness: 0.2, metalness: 0.25, transparent: true, opacity: 0.8 });
  constructor(mats?: WorldMats) {
    if (mats) {
      this.bark.dispose();
      this.bark = (mats.bark as THREE.MeshStandardMaterial).clone();
      this.bark.color.setHex(0x8b8d73);
      this.wood.dispose();
      this.wood = (mats.planks as THREE.MeshStandardMaterial).clone();
      this.wood.color.setHex(0xb1a57e);
      this.stone.dispose();
      this.stone = (mats.stone as THREE.MeshStandardMaterial).clone();
      this.stone.color.setHex(0xa8b7a2);
    }
  }
}
export class ForestGeometry {
  root = new THREE.Group();
  colliders: ReturnType<typeof physics.addBox>[] = [];
  private batch = new StaticBatch();
  private textures: THREE.Texture[] = [];
  constructor(readonly p: ForestPalette) {}
  mesh(g: THREE.BufferGeometry, m: THREE.Material, at: THREE.Vector3, scale?: THREE.Vector3, q?: THREE.Quaternion) {
    if (m === this.p.bark && g instanceof THREE.CylinderGeometry) {
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(1, g.parameters.radiusBottom * 2), (uv.getY(i) * g.parameters.height) / 5);
    }
    this.batch.add(g, m, new THREE.Matrix4().compose(at, q ?? new THREE.Quaternion(), scale ?? new THREE.Vector3(1, 1, 1)));
    g.dispose();
  }
  box(at: THREE.Vector3, w: number, h: number, d: number, m: THREE.Material, solid = false) {
    this.mesh(new THREE.BoxGeometry(w, h, d), m, at);
    if (solid) this.colliders.push(physics.addBox(at, new THREE.Vector3(w / 2, h / 2, d / 2)));
  }
  beam(a: THREE.Vector3, b: THREE.Vector3, r: number, m = this.p.wood) {
    const d = b.clone().sub(a);
    this.mesh(
      new THREE.CylinderGeometry(r, r * 1.1, d.length(), 6),
      m,
      a.clone().add(b).multiplyScalar(0.5),
      undefined,
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
    );
  }
  tree(x: number, z: number, h: number, seed: number, solid = false) {
    const y = heightAt(x, z),
      at = new THREE.Vector3(x, y, z),
      r = h * 0.055;
    this.mesh(new THREE.CylinderGeometry(r * 0.55, r, h, 8), this.p.bark, at.clone().add(new THREE.Vector3(0, h / 2, 0)));
    if (solid) this.colliders.push(physics.addCylinder(at.clone().add(new THREE.Vector3(0, h / 2, 0)), h / 2, r * 0.8));
    for (let k = 0; k < 4; k++) {
      const a = seed + k * 1.8,
        b = at.clone().add(new THREE.Vector3(Math.cos(a) * h * 0.2, h * (0.58 + k * 0.05), Math.sin(a) * h * 0.2));
      this.beam(at.clone().add(new THREE.Vector3(0, h * 0.5, 0)), b, r * 0.35, this.p.bark);
      this.mesh(
        new THREE.IcosahedronGeometry(1, 1),
        k === 3 && seed % 3 < 1 ? this.p.petal : this.p.leaf,
        b.clone().add(new THREE.Vector3(0, h * 0.13, 0)),
        new THREE.Vector3(h * 0.27, h * 0.18, h * 0.25)
      );
    }
    for (let k = 0; k < 5; k++) {
      const a = (k * Math.PI * 2) / 5 + seed;
      this.beam(at.clone().add(new THREE.Vector3(0, r * 2, 0)), at.clone().add(new THREE.Vector3(Math.cos(a) * r * 3.4, 0.1, Math.sin(a) * r * 3.4)), r * 0.55, this.p.bark);
    }
  }
  /** Top surfaces use triangles so Rapier's capsule slides over every ramp seam. */
  deck(a: THREE.Vector3, b: THREE.Vector3, width: number, rails = true) {
    const dx = b.x - a.x,
      dz = b.z - a.z,
      len = Math.hypot(dx, dz),
      px = ((-dz / len) * width) / 2,
      pz = ((dx / len) * width) / 2;
    const v = new Float32Array([a.x + px, a.y, a.z + pz, a.x - px, a.y, a.z - pz, b.x - px, b.y, b.z - pz, b.x + px, b.y, b.z + pz]);
    const ix = new Uint32Array([0, 2, 1, 0, 3, 2]),
      g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(v, 3));
    g.setIndex(new THREE.BufferAttribute(ix, 1));
    g.computeVertexNormals();
    this.mesh(g, this.p.wood, new THREE.Vector3());
    this.colliders.push(physics.addTrimesh(v, ix));
    this.beam(a.clone().add(new THREE.Vector3(px, -0.18, pz)), b.clone().add(new THREE.Vector3(px, -0.18, pz)), 0.16);
    if (rails)
      for (const s of [-1, 1]) {
        const u = a.clone().add(new THREE.Vector3(px * s, 0, pz * s)),
          v = b.clone().add(new THREE.Vector3(px * s, 0, pz * s));
        this.beam(u, u.clone().add(new THREE.Vector3(0, 1.2, 0)), 0.07);
        this.beam(u.clone().add(new THREE.Vector3(0, 1.1, 0)), v.clone().add(new THREE.Vector3(0, 1.1, 0)), 0.055, this.p.gold);
        // Keep the handrails physical without adding a row of snagging boxes along the deck.
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(dx, dz));
        this.colliders.push(
          physics.addBox(
            u
              .clone()
              .add(v)
              .multiplyScalar(0.5)
              .add(new THREE.Vector3(0, 0.65, 0)),
            new THREE.Vector3(0.09, 0.65, len / 2),
            q
          )
        );
      }
  }
  lantern(x: number, z: number, y = heightAt(x, z)) {
    this.beam(new THREE.Vector3(x, y, z), new THREE.Vector3(x, y + 2.6, z), 0.08, this.p.silver);
    this.mesh(new THREE.OctahedronGeometry(0.24), this.p.glow, new THREE.Vector3(x, y + 2.5, z));
  }
  spiritFox(at: THREE.Vector3) {
    this.mesh(new THREE.IcosahedronGeometry(1, 1), this.p.silver, at.clone().add(new THREE.Vector3(0, 0.6, 0)), new THREE.Vector3(0.3, 0.35, 0.7));
    this.mesh(
      new THREE.ConeGeometry(0.28, 0.75, 5),
      this.p.silver,
      at.clone().add(new THREE.Vector3(0, 0.85, 0.7)),
      undefined,
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
    );
    for (const x of [-0.2, 0.2]) {
      this.mesh(new THREE.ConeGeometry(0.14, 0.4, 4), this.p.silver, at.clone().add(new THREE.Vector3(x, 1.13, 0.55)));
      for (const z of [-0.4, 0.4]) this.beam(at.clone().add(new THREE.Vector3(x, 0.6, z)), at.clone().add(new THREE.Vector3(x, 0.08, z)), 0.06, this.p.silver);
    }
    this.mesh(
      new THREE.ConeGeometry(0.24, 1.3, 6),
      this.p.glow,
      at.clone().add(new THREE.Vector3(0, 0.8, -0.9)),
      undefined,
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.1)
    );
  }
  sign(at: THREE.Vector3, title: string, subtitle: string) {
    const c = document.createElement('canvas');
    c.width = 768;
    c.height = 192;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(12,32,28,0.94)';
    ctx.fillRect(0, 0, 768, 192);
    ctx.strokeStyle = '#b8c9a0';
    ctx.lineWidth = 5;
    ctx.strokeRect(6, 6, 756, 180);
    ctx.fillStyle = '#f1e7c2';
    ctx.font = 'bold 36px serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, 384, 72, 720);
    ctx.fillStyle = '#b6d4c4';
    ctx.font = '24px serif';
    ctx.fillText(subtitle, 384, 125, 720);
    const tex = new THREE.CanvasTexture(c);
    this.textures.push(tex);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3), mat);
    m.position.copy(at).y += 2.2;
    this.root.add(m);
    this.beam(at.clone().add(new THREE.Vector3(-2.5, 0, 0)), at.clone().add(new THREE.Vector3(-2.5, 2.7, 0)), 0.08);
    this.beam(at.clone().add(new THREE.Vector3(2.5, 0, 0)), at.clone().add(new THREE.Vector3(2.5, 2.7, 0)), 0.08);
  }
  finish(scene: THREE.Scene) {
    this.batch.build(this.root, 128);
    scene.add(this.root);
    return this;
  }
  dispose() {
    this.root.removeFromParent();
    for (const c of this.colliders) physics.removeStatic(c);
    this.colliders = [];
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        if (o.material instanceof THREE.MeshBasicMaterial) o.material.dispose();
      }
    });
    for (const t of this.textures) t.dispose();
  }
}
export function buildWorldTree(p: ForestPalette, scene: THREE.Scene) {
  const g = new ForestGeometry(p),
    [x, z] = FOREST_NODES.sanctum,
    y = heightAt(x, z),
    at = new THREE.Vector3(x, y, z);
  g.mesh(new THREE.CylinderGeometry(6, 15, 238, 12), p.bark, at.clone().add(new THREE.Vector3(0, 119, 0)));
  for (let i = 0; i < 11; i++) {
    const a = i * 2.3999,
      r = 35 + (i % 4) * 10,
      top = at.clone().add(new THREE.Vector3(Math.cos(a) * r, 190 + (i % 4) * 23, Math.sin(a) * r));
    g.beam(at.clone().add(new THREE.Vector3(0, 110 + i * 8, 0)), top, 2.3, p.bark);
    g.mesh(new THREE.IcosahedronGeometry(1, 2), i % 4 === 0 ? p.petal : p.leaf, top, new THREE.Vector3(52, 34, 48));
  }
  return g.finish(scene);
}
export function buildForestSite(s: ForestSite, p: ForestPalette, mats: WorldMats, scene: THREE.Scene, foxStep = 0) {
  const g = new ForestGeometry(p),
    [x, z] = s.at,
    y = heightAt(x, z),
    at = new THREE.Vector3(x, y, z);
  g.sign(at.clone().add(new THREE.Vector3(0, 0, 12)), s.name, 'Verdant Woods · ' + (s.kind === 'town' ? 'shelter and services' : 'recommended level ' + s.level));
  if (s.kind === 'town') {
    if (s.id === 'thornwick') {
      for (let i = 0; i < 12; i++) {
        let a = (i * Math.PI) / 6;
        const r = 32 + (i % 2) * 10;
        if (segmentAt(x + Math.cos(a) * r, z + Math.sin(a) * r, FOREST_BRIDGE.a, FOREST_BRIDGE.b).d < 11) a += Math.PI / 7;
        const px = x + Math.cos(a) * r,
          pz = z + Math.sin(a) * r,
          h = heightAt(px, pz);
        const house = buildHouse({ w: 7, d: 6, floors: i % 4 === 0 ? 2 : 1, roof: 'thatch', seed: 802 + i }, mats);
        house.group.position.set(px, h, pz);
        g['batch'].addObject(house.group);
        house.group.traverse((o) => {
          if (o instanceof THREE.Mesh) o.geometry.dispose();
        });
        g.colliders.push(physics.addBox(new THREE.Vector3(px, h + 2.4, pz), new THREE.Vector3(3.5, 2.4, 3)));
      }
      for (let i = 0; i < 9; i++)
        g.beam(
          at.clone().add(new THREE.Vector3(17 + (i % 3) * 0.6, 0.4 + Math.floor(i / 3) * 0.6, -7)),
          at.clone().add(new THREE.Vector3(17 + (i % 3) * 0.6, 0.4 + Math.floor(i / 3) * 0.6, 3)),
          0.33,
          p.bark
        );
      g.box(at.clone().add(new THREE.Vector3(12, 1.3, -12)), 9, 2.6, 4, p.wood);
      g.mesh(
        new THREE.TorusGeometry(2.8, 0.22, 6, 20),
        p.wood,
        at.clone().add(new THREE.Vector3(17, 2.8, -12)),
        undefined,
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
      );
      for (let i = 1; i < FOREST_CREEK.length; i++) {
        const a = FOREST_CREEK[i - 1],
          b = FOREST_CREEK[i],
          h = forestNodeHeight('thornwick', forestBaseHeight) - 1.1;
        const u = new THREE.Vector3(a[0], h - (i - 1) * 0.5, a[1]),
          v = new THREE.Vector3(b[0], h - i * 0.5, b[1]);
        const dx = v.x - u.x,
          dz = v.z - u.z,
          len = Math.hypot(dx, dz),
          px = (-dz / len) * 8.5,
          pz = (dx / len) * 8.5;
        const water = new THREE.BufferGeometry();
        water.setAttribute('position', new THREE.Float32BufferAttribute([u.x + px, u.y, u.z + pz, u.x - px, u.y, u.z - pz, v.x - px, v.y, v.z - pz, v.x + px, v.y, v.z + pz], 3));
        water.setIndex([0, 2, 1, 0, 3, 2]);
        water.computeVertexNormals();
        g.mesh(water, p.water, new THREE.Vector3());
      }
      // Round caps join the bends and cover the finite wet bed at both ends.
      FOREST_CREEK.forEach((a, i) =>
        g.mesh(
          new THREE.CircleGeometry(8.5, 24),
          p.water,
          new THREE.Vector3(a[0], forestNodeHeight('thornwick', forestBaseHeight) - 1.1 - i * 0.5, a[1]),
          undefined,
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
        )
      );
      // The approach road crosses the brook on the last descent into Thornwick.
      const bridge = FOREST_BRIDGE;
      const bridgePoint = (t: number) =>
        new THREE.Vector3(bridge.a[0] + (bridge.b[0] - bridge.a[0]) * t, forestBridgeHeight(t, forestBaseHeight), bridge.a[1] + (bridge.b[1] - bridge.a[1]) * t);
      for (const [a, b] of [
        [0, 0.2],
        [0.2, 0.8],
        [0.8, 1],
      ])
        g.deck(bridgePoint(a), bridgePoint(b), bridge.width);
      g.sign(at.clone().add(new THREE.Vector3(-8, 0, 5)), 'The Woodsman’s Rest', 'Rest · cook · prepare for the hidden wood');
    } else if (s.id === 'silverbough') {
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3,
          px = x + Math.cos(a) * 30,
          pz = z + Math.sin(a) * 30;
        g.tree(px, pz, 68, i, true);
        const pa = new THREE.Vector3(px - 9, y + 5, pz + 5),
          pb = new THREE.Vector3(px + 9, y + 5, pz + 5);
        g.deck(pa, pb, 7);
        g.deck(new THREE.Vector3(px - 14, y, pz + 22), pa, 3.5);
        g.box(new THREE.Vector3(px, y + 7.2, pz - 3), 9, 4.4, 6, p.silver, true);
        g.mesh(new THREE.ConeGeometry(8, 4, 6), p.leaf, new THREE.Vector3(px, y + 11, pz - 3));
        g.lantern(px + 7, pz + 5, y + 5);
      }
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3,
          b = ((i + 1) * Math.PI * 2) / 3;
        g.deck(new THREE.Vector3(x + Math.cos(a) * 30 + 9, y + 5, z + Math.sin(a) * 30 + 5), new THREE.Vector3(x + Math.cos(b) * 30 - 9, y + 5, z + Math.sin(b) * 30 + 5), 3.5);
      }
    } else {
      g.colliders.push(physics.addCylinder(at.clone().add(new THREE.Vector3(0, 100, 0)), 100, 12));
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        g.beam(at.clone().add(new THREE.Vector3(Math.cos(a) * 10, 9, Math.sin(a) * 10)), at.clone().add(new THREE.Vector3(Math.cos(a) * 22, 0.1, Math.sin(a) * 22)), 2.2, p.bark);
      }
      for (let i = 0; i < 96; i++) {
        const a = (i * Math.PI * 4) / 96 + Math.PI / 2,
          b = ((i + 1) * Math.PI * 4) / 96 + Math.PI / 2;
        g.deck(
          new THREE.Vector3(x + Math.cos(a) * 25, y + (i / 96) * CANOPY_HEIGHT, z + Math.sin(a) * 25),
          new THREE.Vector3(x + Math.cos(b) * 25, y + ((i + 1) / 96) * CANOPY_HEIGHT, z + Math.sin(b) * 25),
          4.4
        );
      }
      g.deck(new THREE.Vector3(x, y + CANOPY_HEIGHT, z + 25), new THREE.Vector3(x, y + CANOPY_HEIGHT, z + 32), 4.4, false);
      for (let i = 0; i < 48; i++) {
        const a = (i * Math.PI * 2) / 48,
          b = ((i + 1) * Math.PI * 2) / 48;
        g.deck(
          new THREE.Vector3(x + Math.cos(a) * 32, y + CANOPY_HEIGHT, z + Math.sin(a) * 32),
          new THREE.Vector3(x + Math.cos(b) * 32, y + CANOPY_HEIGHT, z + Math.sin(b) * 32),
          7
        );
      }
      for (let i = 0; i < 3; i++) {
        const v = canopyArchiveAt(i),
          a = Math.atan2(v.z - z, v.x - x),
          outer = v.clone().add(new THREE.Vector3(Math.cos(a) * 14, 0, Math.sin(a) * 14));
        g.deck(v, outer, 4);
        g.box(outer.clone().add(new THREE.Vector3(0, -0.3, 0)), 12, 0.6, 12, p.wood, true);
        g.mesh(new THREE.ConeGeometry(7, 6, 8), p.leaf, outer.clone().add(new THREE.Vector3(0, 6, 0)));
        g.lantern(v.x, v.z, v.y);
        g.sign(outer, 'Living Archive', ['The First Turning', 'The Fifth Summon', 'The Root Warning'][i]);
      }
      // Homes and workshops occupy their own boughs so the circulation ring stays open.
      for (let i = 0; i < 9; i++) {
        if (i % 3 === 1) continue;
        const a = ((i + 0.5) * Math.PI * 2) / 9,
          inner = new THREE.Vector3(x + Math.cos(a) * 32, y + CANOPY_HEIGHT, z + Math.sin(a) * 32),
          home = new THREE.Vector3(x + Math.cos(a) * 46, y + CANOPY_HEIGHT, z + Math.sin(a) * 46);
        g.deck(inner, home, 3.4);
        g.box(home.clone().add(new THREE.Vector3(0, -0.3, 0)), 11, 0.6, 11, p.wood, true);
        const house = buildHouse({ w: 6.2, d: 5.2, floors: 1, roof: 'slate', seed: 392 + i }, mats);
        house.group.position.copy(home);
        g['batch'].addObject(house.group);
        house.group.traverse((o) => {
          if (o instanceof THREE.Mesh) o.geometry.dispose();
        });
        g.colliders.push(physics.addBox(home.clone().add(new THREE.Vector3(0, 2.4, 0)), new THREE.Vector3(3.1, 2.4, 2.6)));
        g.lantern(inner.x, inner.z, inner.y);
      }
      g.sign(at.clone().add(new THREE.Vector3(0, 0, 27)), 'The Living Stair', 'Climb the spiral · canopy archives 28m above');
    }
  } else if (s.kind === 'temple') {
    for (const side of [-1, 1]) {
      g.box(at.clone().add(new THREE.Vector3(side * 7, 5, 0)), 3, 10, 4, p.stone, true);
      g.box(at.clone().add(new THREE.Vector3(side * 7, 10.5, 0)), 4, 1, 5, p.gold);
    }
    g.box(at.clone().add(new THREE.Vector3(0, 10, 0)), 14, 2, 4, p.stone, true);
    g.mesh(new THREE.OctahedronGeometry(1.4), p.glow, at.clone().add(new THREE.Vector3(0, 8, 0)));
    for (let i = 0; i < 8; i++) g.box(at.clone().add(new THREE.Vector3((i % 2 ? 1 : -1) * (10 + Math.floor(i / 2) * 3), 1, -5 - Math.floor(i / 2) * 4)), 2, 2, 2, p.stone, true);
  } else if (s.id === 'hollow') {
    for (let i = 0; i < 7; i++) {
      const a = (Math.PI * i) / 6;
      g.mesh(new THREE.DodecahedronGeometry(3.8, 0), p.stone, at.clone().add(new THREE.Vector3(Math.cos(a) * 5, Math.sin(a) * 4, -3)));
    }
    g.box(at.clone().add(new THREE.Vector3(0, 0.6, -1)), 3, 1.2, 2, p.wood);
  } else if (s.kind === 'camp' || s.kind === 'boss') {
    for (let i = 0; i < 9; i++) {
      const a = (i * Math.PI * 2) / 9;
      g.tree(x + Math.cos(a) * 30, z + Math.sin(a) * 30, s.kind === 'boss' ? 52 : 28, i, true);
    }
    if (s.id === 'spring')
      for (let k = 0; k < 5; k++) g.mesh(new THREE.TorusGeometry(2 + k * 0.3, 0.035, 3, 12), p.silver, at.clone().add(new THREE.Vector3((k - 2) * 4, 1.4, -5 + k)));
  } else if (s.id === 'glade' || s.id === 'song') {
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      g.box(at.clone().add(new THREE.Vector3(Math.cos(a) * 18, 1.6, Math.sin(a) * 18)), 1.1, 3.2, 1.2, p.stone, true);
      g.mesh(new THREE.OctahedronGeometry(0.25), p.glow, at.clone().add(new THREE.Vector3(Math.cos(a) * 18, 3.5, Math.sin(a) * 18)));
    }
  } else if (s.id === 'fox') {
    const step = Math.min(2, Math.max(0, foxStep));
    g.spiritFox(at.clone().add(new THREE.Vector3((step - 1) * 13, 0, -step * 10)));
  } else if (s.kind === 'resource') {
    g.mesh(
      new THREE.IcosahedronGeometry(1, 1),
      s.id === 'bloom' ? p.petal : s.id === 'amber' ? p.gold : p.silver,
      at.clone().add(new THREE.Vector3(0, 0.6, 0)),
      new THREE.Vector3(1.1, 1.4, 0.9)
    );
  }
  for (const pool of FOREST_POOLS)
    if (pool.node === s.id) {
      const level = forestNodeHeight(pool.node, forestBaseHeight) - 1.2;
      g.mesh(
        new THREE.CircleGeometry(pool.r + 10, 48),
        p.water,
        new THREE.Vector3(pool.at[0], level, pool.at[1]),
        undefined,
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
      );
    }
  if (['thornwick', 'silverbough', 'sanctum', 'eastwatch', 'starlake', 'glade', 'hollow'].includes(s.id)) {
    const a = forestRefugeAt(s.at),
      refuge = new THREE.Vector3(a[0], heightAt(...a), a[1]);
    g.box(refuge.clone().add(new THREE.Vector3(2, 1.2, 0)), 0.8, 2.4, 0.8, p.stone);
    g.mesh(new THREE.OctahedronGeometry(0.4), p.glow, refuge.clone().add(new THREE.Vector3(2, 2.8, 0)));
    g.sign(refuge.clone().add(new THREE.Vector3(0, 0, -2)), 'Lantern Refuge', 'Rest · wait for moonrise · travel known paths');
  }
  return g.finish(scene);
}
export function buildForestCell(cx: number, cz: number, p: ForestPalette, scene: THREE.Scene) {
  const g = new ForestGeometry(p);
  let seed = (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) >>> 0;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 24; i++) {
    const x = cx * 128 + rand() * 128,
      z = cz * 128 + rand() * 128;
    if (
      forestTrailDistance(x, z) < 10 ||
      Object.values(FOREST_NODES).some((a) => Math.hypot(x - a[0], z - a[1]) < 90) ||
      FOREST_POOLS.some((a) => Math.hypot(x - a.at[0], z - a.at[1]) < a.r + 26)
    )
      continue;
    g.tree(x, z, (z < -2700 ? 52 : z < -2040 ? 32 : 20) + rand() * 24, rand() * 20, i < 5);
    for (let k = 0; k < 4; k++)
      g.mesh(new THREE.ConeGeometry(0.65, 1.4, 5), k % 2 ? p.petal : p.leaf, new THREE.Vector3(x + (rand() - 0.5) * 8, heightAt(x, z) + 0.5, z + (rand() - 0.5) * 8));
  }
  // Lanterns follow the exact same graded trail sampled by terrain and navigation.
  for (const route of FOREST_ROUTES)
    for (let i = 1; i < route.length; i++) {
      const a = FOREST_NODES[route[i - 1]],
        b = FOREST_NODES[route[i]],
        n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 32);
      for (let j = 0; j < n; j++) {
        const x = a[0] + ((b[0] - a[0]) * j) / n,
          z = a[1] + ((b[1] - a[1]) * j) / n;
        if (Math.floor(x / 128) === cx && Math.floor(z / 128) === cz) g.lantern(x + 5.5, z);
      }
      const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5),
        vertices: number[] = [],
        indices: number[] = [];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]),
        px = (-(b[1] - a[1]) / len) * 2.7,
        pz = ((b[0] - a[0]) / len) * 2.7;
      for (let j = 0; j < steps; j++) {
        const x = a[0] + ((b[0] - a[0]) * (j + 0.5)) / steps,
          z = a[1] + ((b[1] - a[1]) * (j + 0.5)) / steps;
        if (Math.floor(x / 128) !== cx || Math.floor(z / 128) !== cz) continue;
        const u = [a[0] + ((b[0] - a[0]) * j) / steps, a[1] + ((b[1] - a[1]) * j) / steps],
          v = [a[0] + ((b[0] - a[0]) * (j + 1)) / steps, a[1] + ((b[1] - a[1]) * (j + 1)) / steps],
          k = vertices.length / 3;
        for (const [xx, zz] of [
          [u[0] + px, u[1] + pz],
          [u[0] - px, u[1] - pz],
          [v[0] - px, v[1] - pz],
          [v[0] + px, v[1] + pz],
        ])
          vertices.push(xx, heightAt(xx, zz) + 0.07, zz);
        indices.push(k, k + 2, k + 1, k, k + 3, k + 2);
      }
      if (vertices.length) {
        const ribbon = new THREE.BufferGeometry();
        ribbon.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        ribbon.setIndex(indices);
        ribbon.computeVertexNormals();
        g.mesh(ribbon, p.path, new THREE.Vector3());
      }
    }
  return g.finish(scene);
}
