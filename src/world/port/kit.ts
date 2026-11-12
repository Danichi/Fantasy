import * as THREE from 'three';
import { worldUV, type WorldMats } from '../buildings';
import { registerDoor, type Door } from '../doors';
import { StaticBatch } from '../cityKit';
import { heightAt } from '../terrainHeight';
import { physics } from '../../physics/physics';

/** A shared nautical kit. All small scenery is merged into spatial material batches. */
export class PortKit {
  readonly root = new THREE.Group();
  readonly batch = new StaticBatch();
  readonly flags: THREE.Mesh[] = [];
  readonly lamps: THREE.MeshStandardMaterial[] = [];
  readonly colliders: ReturnType<typeof physics.addBox>[] = [];
  readonly owned = new Set<THREE.Material>();
  readonly stone: THREE.MeshStandardMaterial;
  readonly blue: THREE.Material;
  readonly teal: THREE.Material;
  readonly brass: THREE.Material;
  readonly iron: THREE.Material;
  readonly leaf: THREE.Material;
  readonly cream: THREE.Material;
  private disposed = false;
  private surfaces = new Map<string, THREE.MeshStandardMaterial>();
  constructor(
    scene: THREE.Scene,
    readonly m: WorldMats,
  ) {
    this.root.name = 'Port Aurelle · rebuilt';
    scene.add(this.root);
    this.stone = (
      m.bridgeStone ?? m.stone
    ).clone() as THREE.MeshStandardMaterial;
    this.stone.color = new THREE.Color().setRGB(1.55, 1.48, 1.32);
    this.owned.add(this.stone);
    this.blue = this.colour('#405f88');
    this.teal = this.colour('#327f7a');
    this.brass = this.colour('#b99651', 0.35, 0.55);
    this.iron = this.colour('#404d59', 0.55, 0.25);
    this.leaf = this.colour('#63894d');
    this.cream = this.colour('#e9d9b3');
  }
  colour(hex: string, roughness = 0.86, metalness = 0) {
    const key = hex + roughness + metalness;
    let mat = this.surfaces.get(key);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: hex,
        roughness,
        metalness,
      });
      this.surfaces.set(key, mat);
      this.owned.add(mat);
    }
    return mat;
  }
  wall(hex: string) {
    const key = 'wall:' + hex;
    let mat = this.surfaces.get(key);
    if (!mat) {
      mat = this.m.plaster.clone() as THREE.MeshStandardMaterial;
      mat.color = new THREE.Color(hex);
      this.surfaces.set(key, mat);
      this.owned.add(mat);
    }
    return mat;
  }
  at(x: number, z: number, dy = 0) {
    return new THREE.Vector3(x, heightAt(x, z) + dy, z);
  }
  mesh(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    yaw = 0,
  ) {
    const o = new THREE.Mesh(worldUV(geo, 1.8), mat);
    o.position.set(x, y, z);
    o.rotation.y = yaw;
    this.batch.addObject(o);
    geo.dispose();
  }
  box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material = this.stone,
    yaw = 0,
    solid = false,
  ) {
    this.mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, yaw);
    if (solid) this.solid(w, h, d, x, y, z, yaw);
  }
  solid(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    yaw = 0,
  ) {
    this.colliders.push(
      physics.addBox(
        new THREE.Vector3(x, y, z),
        new THREE.Vector3(w / 2, h / 2, d / 2),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
      ),
    );
  }
  beam(
    a: THREE.Vector3,
    b: THREE.Vector3,
    width = 0.12,
    mat: THREE.Material = this.m.timber,
  ) {
    const geo = new THREE.CylinderGeometry(width, width, a.distanceTo(b), 6);
    const o = new THREE.Mesh(geo, mat);
    o.position.copy(a).add(b).multiplyScalar(0.5);
    o.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      b.clone().sub(a).normalize(),
    );
    this.batch.addObject(o);
    geo.dispose();
  }
  arch(
    x: number,
    z: number,
    y: number,
    width = 5,
    height = 5,
    depth = 1.2,
    yaw = 0,
  ) {
    const p = (xx: number, zz: number) =>
      new THREE.Vector3(
        x + Math.cos(yaw) * xx + Math.sin(yaw) * zz,
        y,
        z - Math.sin(yaw) * xx + Math.cos(yaw) * zz,
      );
    for (const side of [-1, 1]) {
      const a = p(side * (width / 2 + 0.6), 0);
      this.box(
        1.2,
        height,
        depth,
        a.x,
        y + height / 2,
        a.z,
        this.stone,
        yaw,
        true,
      );
    }
    const geo = new THREE.TorusGeometry(width / 2 + 0.6, 0.6, 6, 18, Math.PI);
    const o = new THREE.Mesh(geo, this.stone);
    o.position.set(x, y + height, z);
    o.rotation.y = yaw;
    this.batch.addObject(o);
    geo.dispose();
  }
  sign(
    title: string,
    sub: string,
    x: number,
    z: number,
    yaw = 0,
    width = 4,
    dy = 3,
  ) {
    const c = document.createElement('canvas');
    c.width = 768;
    c.height = 192;
    const g = c.getContext('2d')!;
    g.fillStyle = '#263f52';
    g.fillRect(0, 0, 768, 192);
    g.strokeStyle = '#d5b578';
    g.lineWidth = 8;
    g.strokeRect(8, 8, 752, 176);
    g.fillStyle = '#f0e1bc';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '600 40px Cinzel';
    g.fillText(title, 384, sub ? 70 : 96, 710);
    if (sub) {
      g.font = '28px Inter';
      g.fillText(sub, 384, 132, 710);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    this.owned.add(mat);
    const o = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), mat);
    o.position.copy(this.at(x, z, dy));
    o.rotation.y = yaw;
    this.root.add(o);
    this.box(
      width + 0.15,
      width / 4 + 0.15,
      0.12,
      o.position.x,
      o.position.y,
      o.position.z,
      this.m.timber,
      yaw,
    );
    o.position.x += Math.sin(yaw) * 0.075;
    o.position.z += Math.cos(yaw) * 0.075;
    if (dy <= 4.3)
      for (const side of [-1, 1]) {
        const x1 = x + Math.cos(yaw) * side * (width / 2 - 0.15),
          z1 = z - Math.sin(yaw) * side * (width / 2 - 0.15);
        this.box(
          0.1,
          dy + 0.1,
          0.1,
          x1,
          heightAt(x, z) + (dy + 0.1) / 2,
          z1,
          this.m.timber,
        );
      }
    return o;
  }
  flag(
    x: number,
    y: number,
    z: number,
    yaw = 0,
    mat = this.teal,
    w = 1.3,
    h = 3,
  ) {
    const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 3, 6), mat);
    o.position.set(x, y, z);
    o.rotation.y = yaw;
    o.userData.yaw = yaw;
    (mat as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    this.root.add(o);
    this.flags.push(o);
    this.beam(
      new THREE.Vector3(x - w * 0.7, y + h / 2, z),
      new THREE.Vector3(x + w * 0.7, y + h / 2, z),
      0.06,
      this.brass,
    );
  }
  lamp(x: number, z: number, dy = 3.2) {
    const y = heightAt(x, z);
    this.box(0.12, dy, 0.12, x, y + dy / 2, z, this.iron);
    const mat = new THREE.MeshStandardMaterial({
      color: '#ffe4ae',
      emissive: '#ffba60',
      emissiveIntensity: 0.25,
    });
    this.owned.add(mat);
    this.lamps.push(mat);
    const o = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.48, 0.32), mat);
    o.position.set(x, y + dy, z);
    this.root.add(o);
    this.box(0.46, 0.12, 0.46, x, y + dy + 0.28, z, this.iron);
  }
  planter(x: number, z: number, w = 1.8) {
    const y = heightAt(x, z);
    this.box(w, 0.55, 0.65, x, y + 0.28, z, this.stone);
    this.box(w - 0.15, 0.15, 0.52, x, y + 0.57, z, this.colour('#65563b'));
    for (let i = 0; i < 5; i++) {
      this.mesh(
        new THREE.IcosahedronGeometry(0.32, 0),
        this.leaf,
        x - w * 0.38 + i * w * 0.19,
        y + 0.8,
        z,
      );
      this.mesh(
        new THREE.IcosahedronGeometry(0.1, 0),
        this.colour(i % 2 ? '#e5bd72' : '#b0a3cc'),
        x - w * 0.38 + i * w * 0.19,
        y + 1.02,
        z,
      );
    }
  }
  barrel(x: number, z: number, y = heightAt(x, z), s = 1) {
    this.mesh(
      new THREE.CylinderGeometry(0.4 * s, 0.36 * s, 0.9 * s, 10),
      this.m.planks,
      x,
      y + 0.45 * s,
      z,
    );
    for (const h of [0.16, 0.72])
      this.mesh(
        new THREE.TorusGeometry(0.4 * s, 0.025 * s, 4, 10).rotateX(Math.PI / 2),
        this.iron,
        x,
        y + h * s,
        z,
      );
  }
  crate(x: number, z: number, y = heightAt(x, z), s = 1) {
    this.box(s, s, s, x, y + s / 2, z, this.m.planks);
    for (const a of [-0.35, 0.35])
      this.box(
        0.08,
        s + 0.06,
        s + 0.06,
        x + a * s,
        y + s / 2,
        z,
        this.m.timber,
      );
  }
  bench(x: number, z: number, yaw = 0) {
    const y = heightAt(x, z);
    this.box(2, 0.15, 0.65, x, y + 0.55, z, this.m.planks, yaw);
    for (const s of [-1, 1])
      this.box(
        0.16,
        0.5,
        0.55,
        x + Math.cos(yaw) * s * 0.75,
        y + 0.25,
        z - Math.sin(yaw) * s * 0.75,
        this.iron,
        yaw,
      );
  }
  tree(x: number, z: number, s = 1) {
    const y = heightAt(x, z);
    this.mesh(
      new THREE.CylinderGeometry(0.16 * s, 0.23 * s, 3.1 * s, 7),
      this.m.bark,
      x,
      y + 1.55 * s,
      z,
    );
    for (const [xx, yy, zz, r] of [
      [0, 4, 0, 1.7],
      [-0.8, 3.4, 0.3, 1.2],
      [0.8, 3.5, -0.2, 1.3],
    ])
      this.mesh(
        new THREE.IcosahedronGeometry(r * s, 1),
        this.leaf,
        x + xx * s,
        y + yy * s,
        z + zz * s,
      );
    this.planter(x + 0.5, z + 0.6, 1.3);
  }
  house(
    x: number,
    z: number,
    w: number,
    d: number,
    floors: number,
    yaw = 0,
    extra: Partial<Door> = {},
    tint = '#e7ddc7',
  ) {
    const y = heightAt(x, z),
      h = floors * 3.1,
      wall = this.wall(tint);
    const point = (a: number, b: number, dy: number) =>
      new THREE.Vector3(
        x + Math.cos(yaw) * a + Math.sin(yaw) * b,
        y + dy,
        z - Math.sin(yaw) * a + Math.cos(yaw) * b,
      );
    this.box(w + 0.35, 0.8, d + 0.35, x, y + 0.4, z, this.stone, yaw);
    this.box(w, h, d, x, y + 0.7 + h / 2, z, wall, yaw, true);
    for (let floor = 1; floor <= floors; floor++) {
      for (let i = 0; i < Math.max(2, Math.floor(w / 3)); i++) {
        const a = (i - (Math.max(2, Math.floor(w / 3)) - 1) / 2) * 2.7,
          p = point(a, d / 2 + 0.06, floor * 3.1 - 0.6);
        this.box(1, 1.4, 0.12, p.x, p.y, p.z, this.m.window ?? this.blue, yaw);
        for (const s of [-1, 1]) {
          const q = point(a + s * 0.7, d / 2 + 0.15, floor * 3.1 - 0.6);
          this.box(0.32, 1.55, 0.12, q.x, q.y, q.z, this.teal, yaw);
        }
        const q = point(a, d / 2 + 0.25, floor * 3.1 - 1.45);
        this.box(1.6, 0.16, 0.35, q.x, q.y, q.z, this.stone, yaw);
      }
      this.box(
        w + 0.25,
        0.16,
        d + 0.25,
        x,
        y + floor * 3.1 + 0.5,
        z,
        this.stone,
        yaw,
      );
    }
    // A steep roof prism with proper eaves, shared slate material and world UVs.
    const roof = new THREE.Shape();
    roof.moveTo(-w / 2 - 0.6, 0);
    roof.lineTo(w / 2 + 0.6, 0);
    roof.lineTo(0, Math.min(4.8, w * 0.38));
    roof.closePath();
    const geo = new THREE.ExtrudeGeometry(roof, {
      depth: d + 1.2,
      bevelEnabled: false,
    });
    geo.translate(0, 0, -d / 2 - 0.6);
    this.mesh(
      geo,
      z > 260 ? (this.m.tile ?? this.m.slate) : this.m.slate,
      x,
      y + h + 0.75,
      z,
      yaw,
    );
    for (let floor = 1; floor <= floors; floor++) {
      for (const side of [-1, 1])
        for (const along of [-d * 0.25, d * 0.25]) {
          const q = point(side * (w / 2 + 0.05), along, floor * 3.1 - 0.6);
          this.box(
            0.12,
            1.4,
            1.05,
            q.x,
            q.y,
            q.z,
            this.m.window ?? this.blue,
            yaw,
          );
          for (const ss of [-1, 1]) {
            const a = point(
              side * (w / 2 + 0.12),
              along + ss * 0.7,
              floor * 3.1 - 0.6,
            );
            this.box(0.12, 1.55, 0.32, a.x, a.y, a.z, this.teal, yaw);
          }
        }
      for (const a of [-w * 0.25, w * 0.25]) {
        const q = point(a, -d / 2 - 0.06, floor * 3.1 - 0.6);
        this.box(
          1.1,
          1.4,
          0.12,
          q.x,
          q.y,
          q.z,
          this.m.window ?? this.blue,
          yaw,
        );
        for (const ss of [-1, 1]) {
          const b = point(a + ss * 0.72, -d / 2 - 0.12, floor * 3.1 - 0.6);
          this.box(0.32, 1.55, 0.12, b.x, b.y, b.z, this.teal, yaw);
        }
      }
    }
    const chimney = point(w * 0.26, -d * 0.2, h + 2.6);
    this.box(0.8, 2.6, 0.8, chimney.x, chimney.y, chimney.z, this.stone, yaw);
    const door = point(0, d / 2 + 0.08, 1.3);
    this.box(
      1.5,
      2.6,
      0.16,
      door.x,
      door.y,
      door.z,
      this.m.door ?? this.m.planks,
      yaw,
    );
    const frame = new THREE.Object3D();
    frame.position.set(x, y, z);
    frame.rotation.y = yaw;
    registerDoor(
      frame,
      new THREE.Vector3(0, 0, d / 2 + 1.2),
      {
        w,
        d,
        floors: floors > 1 ? 2 : 1,
        roof: 'slate',
        seed: Math.round(x * 3 + z),
      },
      extra,
    );
    if (floors > 1) {
      const p = point(0, d / 2 + 0.85, 3.55);
      this.box(w * 0.6, 0.18, 1.8, p.x, p.y, p.z, this.m.planks, yaw);
      const q = point(0, d / 2 + 1.65, 4.05);
      this.box(w * 0.6, 0.09, 0.1, q.x, q.y + 0.32, q.z, this.iron, yaw);
      for (let a = -w * 0.28; a < w * 0.3; a += 0.65) {
        const b = point(a, d / 2 + 1.65, 4);
        this.box(0.06, 0.7, 0.06, b.x, b.y, b.z, this.iron, yaw);
      }
    }
    const p = point(w / 2 + 0.7, d / 2 - 0.5, 0);
    this.planter(p.x, p.z, 1.3);
    const q = point(-w / 2 - 0.65, d / 2 - 0.2, 0);
    this.barrel(q.x, q.z);
  }
  stall(x: number, z: number, yaw = 0, colour = '#b97852', goods = 'spices') {
    const y = heightAt(x, z),
      mat = this.colour(colour);
    const pt = (a: number, b: number, c: number) =>
      new THREE.Vector3(
        x + Math.cos(yaw) * a + Math.sin(yaw) * b,
        y + c,
        z - Math.sin(yaw) * a + Math.cos(yaw) * b,
      );
    for (const a of [-1.7, 1.7])
      for (const b of [-1, 1]) {
        const p = pt(a, b, 1.4);
        this.box(0.12, 2.8, 0.12, p.x, p.y, p.z, this.m.timber, yaw);
      }
    for (let i = 0; i < 6; i++) {
      const p = pt(-1.46 + i * 0.58, 0, 2.85);
      this.box(0.59, 0.06, 2.5, p.x, p.y, p.z, i % 2 ? this.cream : mat, yaw);
      const a = pt(-1.46 + i * 0.58, 1.22, 2.62);
      this.box(0.59, 0.4, 0.04, a.x, a.y, a.z, i % 2 ? this.cream : mat, yaw);
    }
    this.box(3.1, 0.85, 0.9, x, y + 0.45, z, this.m.planks, yaw, true);
    for (let i = 0; i < 6; i++) {
      const p = pt(-1.2 + i * 0.48, 0, 1.05);
      this.mesh(
        goods === 'fish'
          ? new THREE.SphereGeometry(0.16, 6, 4).scale(1, 0.4, 2)
          : new THREE.CylinderGeometry(0.17, 0.2, 0.25, 8),
        this.colour(
          goods === 'fish' ? '#97b6bf' : i % 2 ? '#bc8c4b' : '#9c7050',
        ),
        p.x,
        p.y,
        p.z,
      );
    }
  }
  finish() {
    this.batch.build(this.root, 48);
  }
  update(t: number, night: number) {
    for (const f of this.flags)
      f.rotation.y = f.userData.yaw + Math.sin(t * 1.7 + f.position.x) * 0.12;
    for (const m of this.lamps) m.emissiveIntensity = 0.2 + night * 2.4;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const c of this.colliders)
      if (physics.world.getCollider(c.handle)) {
        const body = c.parent();
        if (body) physics.world.removeRigidBody(body);
        else physics.world.removeCollider(c, true);
      }
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    for (const m of this.owned) {
      const tex = (m as THREE.MeshStandardMaterial).map;
      if (
        tex &&
        ![...Object.values(this.m)].some(
          (v) => (v as THREE.MeshStandardMaterial)?.map === tex,
        )
      )
        tex.dispose();
      m.dispose();
    }
    this.root.removeFromParent();
  }
}
