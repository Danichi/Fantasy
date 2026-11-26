import * as THREE from 'three';
import { Kit } from './roadLife/kit';
import { compressedGltf } from '../core/gltf';
import { heightAt, roadDist } from './terrainHeight';
import { GRASS_MASKS } from './groundWindow';
import { mulberry32 } from '../core/math';
import type { WorldMats } from './buildings';
import type { FX } from '../fx/particles';
import type { Interactable } from '../dungeon/instance';
import { GLEN_CIRCUIT, type GlenLandmark } from './glenCircuitData';
import { leafShader, rockGeometry } from './stylizedNature';

/** A small, recognizable circuit through the existing village and its east road. */
export class GlenCircuit {
  readonly group = new THREE.Group();
  readonly interactables: Interactable[] = [];
  readonly clearings: [number, number, number][] = [];
  readonly seats: THREE.Vector3[] = [];
  readonly kit: Kit;
  onRead?: (p: GlenLandmark) => void;
  onBell?: () => void;
  player: () => THREE.Vector3 | null = () => null;
  private flags: { mesh: THREE.Mesh; rest: Float32Array }[] = [];
  private clock = 0;
  private lastBell = -10;
  private bell!: THREE.Group;
  private bellT = 0;

  constructor(scene: THREE.Scene, m: WorldMats, fx: FX, mill: THREE.Vector3) {
    this.group.name = 'Elder Glen living circuit';
    scene.add(this.group);
    this.kit = new Kit(this.group, m, fx);
    const k = this.kit;
    // The market's tall silhouette is visible above nearby roofs: a way home.
    const x = -3,
      z = -4,
      y = heightAt(x, z);
    k.add(new THREE.CylinderGeometry(1.85, 2.05, 0.08, 12), m.stone, x, y, z);
    for (const a of [-1, 1])
      for (const b of [-1, 1]) {
        k.add(new THREE.BoxGeometry(0.25, 7.2, 0.25), m.timber, x + a * 1.2, y + 3.6, z + b * 1.2);
        k.solid(0.28, 7.2, 0.28, x + a * 1.2, y + 3.6, z + b * 1.2);
      }
    for (const h of [4.6, 7]) {
      k.add(new THREE.BoxGeometry(2.7, 0.22, 2.7), m.timber, x, y + h, z);
    }
    k.add(new THREE.ConeGeometry(2.5, 2.3, 4).rotateY(Math.PI / 4), m.tile ?? m.slate, x, y + 8.05, z);
    k.add(new THREE.CylinderGeometry(0.055, 0.07, 1.4, 6), m.timber, x, y + 9.6, z);
    k.add(new THREE.OctahedronGeometry(0.25), k.col(0xc8a15a, 0.45), x, y + 10.35, z);
    this.bell = new THREE.Group();
    this.bell.position.set(x, y + 6.6, z);
    const bellMat = new THREE.MeshStandardMaterial({ color: 0xaa8544, roughness: 0.48, metalness: 0.72 });
    const profile = [
      [0.1, 0],
      [0.36, -0.12],
      [0.43, -0.5],
      [0.58, -1],
      [0.8, -1.18],
      [0.85, -1.23],
      [0.8, -1.3],
      [0.66, -1.28]
    ].map(([a, b]) => new THREE.Vector2(a, b));
    const shell = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), bellMat);
    shell.castShadow = true;
    this.bell.add(shell);
    const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), bellMat);
    clapper.position.y = -1.24;
    this.bell.add(clapper);
    this.group.add(this.bell);
    k.add(new THREE.CylinderGeometry(0.018, 0.018, 5.5, 4), k.col(0xbaa17a), x + 0.65, y + 3.1, z);
    this.sign(['MARKET BELL', 'East gate • river bridge', 'South street • farms'], x - 2.7, z - 0.4, 0, 2.4);
    this.banner(x + 1.2, y + 7.2, z + 1.4, 0, 0x2e5875, 0.75, 2.3);
    // The square has shaded edges and inhabited pockets, keeping the streets open.
    this.seats.push(...this.benches(-16, -3, 2, 3.4));
    for (const [px, pz] of [
      [-19, -8],
      [-21, 3],
      [17, -22]
    ]) {
      k.add(new THREE.CylinderGeometry(0.72, 0.56, 0.48, 10), m.stone, px, heightAt(px, pz) + 0.22, pz);
      k.add(new THREE.CylinderGeometry(0.6, 0.6, 0.08, 10), k.col(0x4a3926), px, heightAt(px, pz) + 0.48, pz);
      this.clearings.push([px, pz, 1.2]);
      k.solid(1.2, 0.5, 1.2, px, heightAt(px, pz) + 0.25, pz);
    }
    // Broad hanging signs and pennants make the east street legible on foot.
    for (const px of [32, 72]) {
      const pz = -5,
        yy = heightAt(px, pz);
      k.add(new THREE.CylinderGeometry(0.13, 0.17, 5.1, 8), m.timber, px, yy + 2.55, pz);
      k.lantern(px, pz, 3.8);
      this.banner(px + 0.55, yy + 5, pz, Math.PI / 2, 0x315f82, 1, 1.8);
    }
    // A lantern gateway beyond the palisade frames the river crossing.
    for (const pz of [-9, 9]) {
      const yy = heightAt(118, pz);
      k.add(new THREE.CylinderGeometry(0.7, 0.92, 1.3, 10), m.stone, 118, yy + 0.65, pz);
      k.add(new THREE.BoxGeometry(0.38, 6, 0.38), m.timber, 118, yy + 3.4, pz);
      k.solid(1.25, 1.5, 1.25, 118, yy + 0.75, pz);
      k.lantern(118, pz, 5.3);
      this.banner(118.25, yy + 5.3, pz, Math.PI / 2, pz < 0 ? 0x315f82 : 0xbf934f, 1.2, 2.1);
    }
    this.sign(['EAST GATE', 'Over the bridge: White-Stone Rest', 'King’s Road • Port Aurelle'], 123, -10, -Math.PI / 2, 3);
    // The granary's work has physical loading racks, scales and counted sacks.
    for (const [px, pz] of [
      [-32, 115],
      [mill.x - 5, mill.z + 3]
    ]) {
      const yy = heightAt(px, pz);
      k.add(new THREE.BoxGeometry(2.8, 0.12, 1), m.planks, px, yy + 0.62, pz);
      for (const dx of [-1.1, 1.1]) k.add(new THREE.BoxGeometry(0.15, 0.6, 0.7), m.timber, px + dx, yy + 0.3, pz);
      for (let i = 0; i < 3; i++) k.add(new THREE.SphereGeometry(0.32, 8, 6).scale(0.85, 1.2, 1), k.col(0xc0aa7e), px - 0.85 + i * 0.8, yy + 0.99, pz);
      k.solid(2.8, 1, 1, px, yy + 0.5, pz);
      this.clearings.push([px, pz, 3.5]);
    }
    this.sign(['SHEAF YARD', 'Grain • Watch supplies', 'Town: south street'], -36, 113, Math.PI, 2.6);
    // The rest is an identifiable destination immediately beyond the bridge.
    k.campfire(217, 23, 0.65);
    this.benches(217, 23, 3, 3.1);
    this.sign(['WHITE-STONE REST', 'West: bridge • Elder Glen', 'East: King’s Road • Port Aurelle'], 210, 17, Math.PI, 2.6);
    k.lantern(211, 20, 3.8);
    for (const px of [139, 184, 200]) {
      const pz = 16,
        yy = heightAt(px, pz);
      k.add(new THREE.BoxGeometry(0.55, 0.8, 0.5), k.col(0xd7d2b9), px, yy + 0.35, pz, 0.12);
      k.add(new THREE.BoxGeometry(0.57, 0.16, 0.52), k.col(0x365e79), px, yy + 0.5, pz, 0.12);
    }
    // A small rock-and-fern bank encloses the rest; the carriage road stays clear.
    const rnd = mulberry32(44183);
    const rock = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 1.15 + 0.05;
      const px = 217 + Math.cos(a) * (9 + rnd() * 6),
        pz = 24 + Math.sin(a) * (8 + rnd() * 5);
      if (roadDist(px, pz) < 7) continue;
      const s = 0.5 + rnd() * 1.3;
      k.add(rockGeometry(700 + i).scale(s, s, s), rock, px, heightAt(px, pz), pz, rnd() * 3);
      k.solid(1.8 * s, s * 0.65, 1.6 * s, px, heightAt(px, pz) + s * 0.3, pz);
    }
    this.clearings.push([-3, -4, 4], [-19, -2, 5], [118, -9, 4], [118, 9, 4], [217, 23, 9], [215, 35, 4], [230, 28, 4], [204, 33, 4]);
    for (const [a, b, r] of this.clearings) GRASS_MASKS.push({ x: a, z: b, r, amount: 0.85 });
    for (const p of GLEN_CIRCUIT)
      this.interactables.push({
        pos: new THREE.Vector3(p.at[0], heightAt(...p.at), p.at[1]),
        radius: 4.5,
        level: 3,
        label: () => 'Read directions · ' + p.name,
        enabled: () => this.group.visible,
        action: () => {
          const at = this.player();
          if (at && this.group.visible && Math.hypot(at.x - p.at[0], at.z - p.at[1]) < 5 && Math.abs(at.y - heightAt(...p.at)) < 3) this.onRead?.(p);
        }
      });
    this.interactables.push({
      pos: new THREE.Vector3(x + 0.65, y, z),
      radius: 2.8,
      level: 3,
      label: () => 'Ring the Market Bell',
      enabled: () => this.group.visible && this.clock - this.lastBell > 8,
      action: () => {
        const at = this.player();
        if (!at || !this.group.visible || at.distanceTo(new THREE.Vector3(x + 0.65, y, z)) > 3 || this.clock - this.lastBell <= 8) return;
        this.lastBell = this.clock;
        this.bellT = 4;
        this.onBell?.();
      }
    });
  }

  async plant() {
    // Reuse the established stylized asset kit; authored clusters complement
    // its streamed distribution instead of increasing the global scatter.
    const [tree, fern, flower] = await Promise.all(
      ['CommonTree_3', 'Fern_1', 'Flower_3_Group'].map(async (name) => (await compressedGltf.loadAsync(`/assets/vendor/stylized/${name}.glb`)).scene)
    );
    for (const root of [tree, fern, flower])
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
          if (/leaves|leaf|fern|flower/i.test(mat.name + mesh.name)) leafShader(mat, true);
      });
    const rnd = mulberry32(8831);
    const place = (proto: THREE.Object3D, x: number, z: number, h: number, lift = 0) => {
      const o = proto.clone(true),
        box = new THREE.Box3().setFromObject(o);
      const s = h / Math.max(0.1, box.max.y - box.min.y);
      o.scale.multiplyScalar(s);
      o.position.set(x, heightAt(x, z) - box.min.y * s + lift, z);
      o.rotation.y = rnd() * Math.PI * 2;
      this.kit.batch.addObject(o);
    };
    for (const [x, z, h] of [
      [-19, -2, 12],
      [215, 35, 13],
      [230, 28, 11],
      [204, 33, 10]
    ]) {
      place(tree, x, z, h);
      this.kit.solid(0.65, h * 0.55, 0.65, x, heightAt(x, z) + h * 0.275, z);
      for (let i = 0; i < 14; i++) {
        const a = rnd() * Math.PI * 2,
          r = 1.8 + rnd() * 3.5;
        const px = x + Math.cos(a) * r,
          pz = z + Math.sin(a) * r;
        if (roadDist(px, pz) > 5 && Math.hypot(px + 3, pz + 4) > 4) place(fern, px, pz, 0.35 + rnd() * 0.55);
      }
    }
    for (const [x, z] of [
      [-19, -8],
      [-21, 3],
      [17, -22]
    ]) {
      for (let i = 0; i < 4; i++) place(flower, x + (rnd() - 0.5) * 0.8, z + (rnd() - 0.5) * 0.8, 0.75, 0.48);
    }
    this.kit.build();
  }

  private sign(lines: string[], x: number, z: number, yaw: number, w: number) {
    this.kit.sign(lines, x, z, yaw, w);
    this.kit.add(
      new THREE.BoxGeometry(w + 0.18, w * 0.45 + 0.18, 0.12),
      this.kit.m.timber,
      x - Math.sin(yaw) * 0.08,
      heightAt(x, z) + 1.75,
      z - Math.cos(yaw) * 0.08,
      yaw
    );
  }

  private benches(x: number, z: number, n: number, r: number) {
    const spots = this.kit.benches(x, z, n, r);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.3,
        px = x + Math.cos(a) * r,
        pz = z + Math.sin(a) * r;
      this.kit.solid(1.1, 0.48, 0.4, px, heightAt(px, pz) + 0.24, pz, -a + Math.PI / 2);
    }
    return spots;
  }

  private banner(x: number, y: number, z: number, yaw: number, color: number, w: number, h: number) {
    const geo = new THREE.PlaneGeometry(w, h, 3, 8);
    geo.translate(0, -h / 2, 0);
    const mesh = new THREE.Mesh(geo, this.kit.cloth(color));
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    mesh.castShadow = true;
    this.group.add(mesh);
    this.flags.push({ mesh, rest: new Float32Array(geo.attributes.position.array) });
  }

  update(dt: number, player: THREE.Vector3, night: number, wind: number) {
    if (!this.group.visible) return;
    this.clock += dt;
    this.kit.update(dt, player, night);
    this.bellT = Math.max(0, this.bellT - dt);
    this.bell.rotation.z = Math.sin((4 - this.bellT) * 5) * this.bellT * 0.05;
    if (Math.hypot(player.x - 80, player.z) > 280) return;
    for (const { mesh, rest } of this.flags) {
      const p = mesh.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const drop = Math.min(1, -rest[i * 3 + 1]);
        p.setZ(i, Math.sin(this.clock * (2 + wind) + rest[i * 3] * 2.4 - rest[i * 3 + 1] * 2) * drop * (0.06 + wind * 0.13));
      }
      p.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    }
  }
}
