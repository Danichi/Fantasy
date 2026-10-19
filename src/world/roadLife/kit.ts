import * as THREE from 'three';
import { registerDoor, type Door } from '../doors';
import { buildHouse, worldUV, type WorldMats, type HouseSpec } from '../buildings';
import { heightAt } from '../terrainHeight';
import { physics } from '../../physics/physics';
import { mulberry32 } from '../../core/math';
import { StaticBatch } from '../cityKit';
import { carvedText } from '../roadNetwork';
import { GRASS_MASKS } from '../groundWindow';
import type { FX } from '../../fx/particles';

// The builder's toolbox for the wayside places: everything static goes into
// one StaticBatch (a handful of draw calls for all of road life); fires,
// lamps and chimney smoke are animated only near the player.

type Fire = { pos: THREE.Vector3; mat: THREE.MeshStandardMaterial; size: number; lit: () => boolean };

export class Kit {
  readonly batch = new StaticBatch();
  readonly clearings: [number, number, number][] = [];
  readonly fires: Fire[] = [];
  readonly glows: { mat: THREE.MeshStandardMaterial; base: number; lit: () => boolean }[] = [];
  readonly smoke: THREE.Vector3[] = [];
  readonly rnd = mulberry32(77011);
  private cols = new Map<number, THREE.MeshStandardMaterial>();
  private t = 0;

  constructor(readonly scene: THREE.Scene, readonly m: WorldMats, private fx: FX) {}

  col(c: number, rough = 0.9, side: THREE.Side = THREE.FrontSide) {
    const k = c + (side === THREE.DoubleSide ? 0x1000000 : 0) + Math.round(rough * 10) * 0x2000000;
    let mm = this.cols.get(k);
    if (!mm) this.cols.set(k, (mm = new THREE.MeshStandardMaterial({ color: c, roughness: rough, side })));
    return mm;
  }

  cloth(c: number) {
    return this.col(c, 0.95, THREE.DoubleSide);
  }

  add(g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0, uv = 1.5) {
    const mesh = new THREE.Mesh(worldUV(g, uv), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    this.batch.addObject(mesh);
  }

  /** On the ground at (x, z), `y` above it. */
  put(g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0) {
    this.add(g, mat, x, heightAt(x, z) + y, z, ry);
  }

  solid(w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) {
    return physics.addBox(new THREE.Vector3(x, y, z), new THREE.Vector3(w / 2, h / 2, d / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)));
  }

  /** A house facing local +z rotated by `rot`; registers its door. */
  house(x: number, z: number, rot: number, spec: HouseSpec, info: Partial<Door> = {}) {
    const { group, half, door } = buildHouse(spec, this.m);
    let gy = Infinity;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) gy = Math.min(gy, heightAt(x + Math.cos(rot) * sx * half.x + Math.sin(rot) * sz * half.z, z - Math.sin(rot) * sx * half.x + Math.cos(rot) * sz * half.z));
    group.position.set(x, gy, z);
    group.rotation.y = rot;
    registerDoor(group, door, spec, info);
    this.batch.addObject(group);
    physics.addBox(new THREE.Vector3(x, gy + half.y, z), half, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)));
    this.clearings.push([x, z, Math.max(half.x, half.z) + 5]);
    return { gy, half };
  }

  campfire(x: number, z: number, size = 1, lit: () => boolean = () => true) {
    const y = heightAt(x, z);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      this.add(new THREE.IcosahedronGeometry(0.22 * size, 0), this.m.stone, x + Math.cos(a) * 0.75 * size, y + 0.1, z + Math.sin(a) * 0.75 * size);
    }
    for (let k = 0; k < 4; k++) {
      const log = new THREE.CylinderGeometry(0.08 * size, 0.1 * size, 1.1 * size, 6);
      log.rotateX(Math.PI / 2 - 0.35).rotateY((k / 4) * Math.PI * 2);
      this.add(log, this.m.bark, x, y + 0.22, z);
    }
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a1206, emissive: 0xff7a2a, emissiveIntensity: 1.6 });
    const coals = new THREE.Mesh(new THREE.CylinderGeometry(0.4 * size, 0.45 * size, 0.12, 10), mat);
    coals.position.set(x, y + 0.1, z);
    this.scene.add(coals);
    this.fires.push({ pos: new THREE.Vector3(x, y + 0.35, z), mat, size, lit });
    GRASS_MASKS.push({ x, z, r: 2.4 * size, amount: 0.9 });
  }

  /** Split-log benches in a ring round a fire; returns the seats (where sitters stand, facing the fire). */
  benches(x: number, z: number, n: number, r = 2.6) {
    const seats: THREE.Vector3[] = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + 0.3;
      const bx = x + Math.cos(a) * r, bz = z + Math.sin(a) * r;
      const by = heightAt(bx, bz);
      this.add(new THREE.BoxGeometry(1.1, 0.12, 0.38), this.m.planks, bx, by + 0.44, bz, -a + Math.PI / 2);
      for (const s of [-0.4, 0.4]) this.add(new THREE.BoxGeometry(0.16, 0.42, 0.3), this.m.bark, bx + Math.sin(a) * s, by + 0.21, bz - Math.cos(a) * s, -a + Math.PI / 2);
      seats.push(new THREE.Vector3(bx + Math.cos(a) * 0.12, by, bz + Math.sin(a) * 0.12));
    }
    return seats;
  }

  tent(x: number, z: number, yaw: number, mat: THREE.Material, s = 1) {
    const y = heightAt(x, z);
    const g = new THREE.ConeGeometry(1.9 * s, 2.3 * s, 4, 1, true);
    g.rotateY(Math.PI / 4);
    g.scale(1, 1, 1.4);
    this.add(g, mat, x, y + 1.1 * s, z, yaw);
    this.add(new THREE.PlaneGeometry(0.9 * s, 1.4 * s), this.col(0x1a120c), x + Math.sin(yaw) * 1.36 * s, y + 0.7 * s, z + Math.cos(yaw) * 1.36 * s, yaw);
    this.solid(2.6 * s, 1.6 * s, 3.6 * s, x, y + 0.8 * s, z, yaw);
  }

  /** A round striped pavilion (the hedge knight's). */
  pavilion(x: number, z: number, a: number, b: number) {
    const y = heightAt(x, z);
    for (let k = 0; k < 12; k++) {
      const g = new THREE.CylinderGeometry(2.6, 2.6, 2.2, 24, 1, true, (k / 12) * Math.PI * 2, Math.PI / 6);
      this.add(g, this.cloth(k % 2 ? a : b), x, y + 1.1, z);
      const r = new THREE.ConeGeometry(2.9, 1.6, 24, 1, true, (k / 12) * Math.PI * 2, Math.PI / 6);
      this.add(r, this.cloth(k % 2 ? b : a), x, y + 3.0, z);
    }
    this.add(new THREE.CylinderGeometry(0.06, 0.06, 4.6, 6), this.m.timber, x, y + 2.3, z);
    const flag = new THREE.PlaneGeometry(0.8, 0.45);
    this.add(flag, this.cloth(a), x + 0.42, y + 4.35, z);
    physics.addCylinder(new THREE.Vector3(x, y + 1.2, z), 1.2, 2.5);
    GRASS_MASKS.push({ x, z, r: 3, amount: 0.8 });
  }

  crate(x: number, z: number, ry = this.rnd() * 3, s = 1) {
    const y = heightAt(x, z);
    this.add(this.rnd() < 0.55 ? new THREE.BoxGeometry(0.9 * s, 0.8 * s, 0.9 * s) : new THREE.CylinderGeometry(0.38 * s, 0.42 * s, 0.95 * s, 10), this.m.planks, x, y + 0.42 * s, z, ry);
  }

  lantern(x: number, z: number, h = 3.2, lit: () => boolean = () => true) {
    const y = heightAt(x, z);
    this.add(new THREE.CylinderGeometry(0.07, 0.1, h, 6), this.m.timber, x, y + h / 2, z);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffb050, emissiveIntensity: 0.3 });
    this.glows.push({ mat, base: 0.3, lit });
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.4, 0.28), mat);
    l.position.set(x, y + h + 0.1, z);
    this.scene.add(l);
    return mat;
  }

  fence(ax: number, az: number, bx: number, bz: number, rail = this.m.planks) {
    const len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 2.6));
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
      this.add(new THREE.BoxGeometry(0.14, 1.1, 0.14), this.m.timber, x, heightAt(x, z) + 0.55, z);
      if (k < n) {
        const mx = x + (bx - ax) / n / 2, mz = z + (bz - az) / n / 2, my = heightAt(mx, mz);
        for (const yy of [0.45, 0.85]) this.add(new THREE.BoxGeometry(0.08, 0.1, len / n + 0.1), rail, mx, my + yy, mz, yaw);
      }
    }
  }

  rock(x: number, z: number, s: number, collide = true) {
    const g = new THREE.DodecahedronGeometry(s, 0);
    g.scale(1, 0.7 + this.rnd() * 0.4, 1);
    this.add(g, this.m.stone, x, heightAt(x, z) + s * 0.3, z, this.rnd() * 3);
    if (collide && s > 0.45) physics.addCylinder(new THREE.Vector3(x, heightAt(x, z) + s * 0.4, z), s * 0.5, s * 0.8);
  }

  tree(x: number, z: number, s = 1) {
    const y = heightAt(x, z);
    this.add(new THREE.CylinderGeometry(0.18 * s, 0.3 * s, 3 * s, 7), this.m.bark, x, y + 1.5 * s, z);
    this.add(new THREE.IcosahedronGeometry(1.9 * s, 1), this.col(this.rnd() < 0.5 ? 0x3d6a2e : 0x4a7a34, 1), x, y + 4.2 * s, z, this.rnd() * 3);
    physics.addCylinder(new THREE.Vector3(x, y + 1.5 * s, z), 1.5 * s, 0.3 * s);
  }

  /** A two-post signboard; `yaw` turns the board (0 faces +z). */
  sign(lines: string[], x: number, z: number, yaw: number, w = 1.6) {
    const y = heightAt(x, z);
    for (const s of [-1, 1]) this.add(new THREE.BoxGeometry(0.12, 2.2, 0.12), this.m.timber, x + Math.cos(yaw) * s * (w / 2), y + 1.1, z - Math.sin(yaw) * s * (w / 2));
    const board = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.45), new THREE.MeshStandardMaterial({ map: carvedText(lines, 512, 230, '#efe3c2', '#3a2a1a'), roughness: 1, side: THREE.DoubleSide }));
    board.position.set(x, y + 1.75, z);
    board.rotation.y = yaw;
    this.scene.add(board);
  }

  /** A stone well with a little thatched roof. Returns the drinking spot. */
  well(x: number, z: number) {
    const y = heightAt(x, z);
    this.add(new THREE.CylinderGeometry(0.95, 1.05, 0.9, 14, 1, true), this.m.stone, x, y + 0.45, z);
    this.add(new THREE.CylinderGeometry(0.9, 0.9, 0.05, 14), this.col(0x1e2e3a, 0.2), x, y + 0.55, z);
    this.add(new THREE.ConeGeometry(1.35, 0.9, 4).rotateY(Math.PI / 4), this.m.thatch, x, y + 2.8, z);
    for (const s of [-1, 1]) this.add(new THREE.BoxGeometry(0.12, 2.4, 0.12), this.m.timber, x + s * 0.88, y + 1.25, z);
    this.add(new THREE.CylinderGeometry(0.07, 0.07, 1.8, 6).rotateZ(Math.PI / 2), this.m.timber, x, y + 2.1, z);
    this.add(new THREE.CylinderGeometry(0.16, 0.13, 0.26, 8), this.m.planks, x + 0.2, y + 1.3, z);
    physics.addCylinder(new THREE.Vector3(x, y + 0.5, z), 0.5, 1.05);
    return new THREE.Vector3(x + 1.6, y, z);
  }

  /** A market stall with a coloured awning, its counter facing `face` (yaw). Returns where the keeper stands. */
  stall(x: number, z: number, face: number, colour: number) {
    const y = heightAt(x, z);
    const c = Math.cos(face), sn = Math.sin(face);
    for (const [u, vv] of [[-0.9, -1.4], [-0.9, 1.4], [0.9, -1.4], [0.9, 1.4]]) this.add(new THREE.BoxGeometry(0.12, 2.6, 0.12), this.m.timber, x + vv * c + u * sn, y + 1.3, z - vv * sn + u * c);
    this.add(new THREE.BoxGeometry(3, 0.9, 0.9), this.m.planks, x + sn * 0.5, y + 0.45, z + c * 0.5, face);
    this.add(new THREE.BoxGeometry(3.4, 0.06, 2.3), this.col(colour), x, y + 2.7, z, face);
    for (let k = 0; k < 4; k++) this.add(new THREE.BoxGeometry(0.3, 0.2, 0.3), this.col([0xc9302a, 0xe8c050, 0x7aa84a, 0xb8925a][k]), x + sn * 0.5 + c * (k - 1.5) * 0.6, y + 1.0, z + c * 0.5 - sn * (k - 1.5) * 0.6);
    this.solid(3, 1, 0.9, x + sn * 0.5, y + 0.5, z + c * 0.5, face);
    return new THREE.Vector3(x - sn * 0.7, y, z - c * 0.7);
  }

  /** A milestone with a carved plaque facing `faceYaw`. */
  milestone(x: number, z: number, faceYaw: number, lines: string[]) {
    const y = heightAt(x, z);
    const stone = this.m.bridgeStone ?? this.m.stone;
    this.add(new THREE.BoxGeometry(0.55, 1.1, 0.32), stone, x, y + 0.5, z, faceYaw);
    this.add(new THREE.CylinderGeometry(0.28, 0.28, 0.32, 12, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateY(Math.PI / 2), stone, x, y + 1.05, z, faceYaw + Math.PI / 2);
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.6), new THREE.MeshStandardMaterial({ map: carvedText(lines, 160, 208, '#b8b2a4', '#4a4238'), roughness: 1 }));
    plaque.position.set(x + Math.sin(faceYaw) * 0.17, y + 0.62, z + Math.cos(faceYaw) * 0.17);
    plaque.rotation.y = faceYaw;
    this.scene.add(plaque);
    this.solid(0.56, 1.2, 0.34, x, y + 0.6, z, faceYaw);
  }

  /** A string of pennants between two points (returned as its own group, so it can be shown on market days). */
  bunting(ax: number, az: number, bx: number, bz: number, h: number, colours: number[], parent: THREE.Object3D) {
    const n = Math.max(3, Math.round(Math.hypot(bx - ax, bz - az) / 0.7));
    const yaw = Math.atan2(bx - ax, bz - az);
    const ya = heightAt(ax, az) + h, yb = heightAt(bx, bz) + h;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const sag = Math.sin(Math.PI * t) * 0.7;
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 3), this.col(colours[k % colours.length], 0.9));
      f.rotation.set(Math.PI, yaw, 0);
      f.position.set(ax + (bx - ax) * t, ya + (yb - ya) * t - sag - 0.16, az + (bz - az) * t);
      parent.add(f);
    }
  }

  /** Smoke from a chimney or a smouldering fire. */
  smokeAt(x: number, y: number, z: number) {
    this.smoke.push(new THREE.Vector3(x, y, z));
  }

  build() {
    this.batch.build(this.scene);
  }

  update(dt: number, player: THREE.Vector3, night: number) {
    this.t += dt;
    const near = (q: THREE.Vector3, r: number) => Math.hypot(player.x - q.x, player.z - q.z) < r;
    for (const f of this.fires) {
      const on = f.lit();
      if (!on) {
        f.mat.emissiveIntensity = 0.05;
        continue;
      }
      if (!near(f.pos, 200)) continue;
      f.mat.emissiveIntensity = 1.3 + Math.sin(this.t * 13 + f.pos.x) * 0.25 + night;
      if (Math.random() < dt * 18 * f.size) this.fx.add.spawn({ pos: f.pos, vel: new THREE.Vector3(0, 1.6, 0), spread: 0.4 * f.size, count: 1, life: [0.4, 0.8], size: [0.45 * f.size, 0.06], color: 0xffc060, color2: 0xff3a00, jitter: 0.3 });
    }
    for (const s of this.smoke) if (near(s, 220) && Math.random() < dt * 3) this.fx.add.spawn({ pos: s, vel: new THREE.Vector3(0.25, 1.1, 0), spread: 0.5, count: 1, life: [2, 3.2], size: [0.6, 1.8], color: 0x8a8682, color2: 0xc8c4c0, gravity: -0.25, upBias: 0.5 });
    for (const g of this.glows) g.mat.emissiveIntensity = g.lit() ? g.base + night * 2.4 : 0.02;
  }
}
