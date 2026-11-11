import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, GRAVEWOOD } from './terrainHeight';
import { mulberry32 } from '../core/math';
import { physics } from '../physics/physics';
import type { FX } from '../fx/particles';
import type { Player } from '../player/player';

// The Dark, seen by stepping through the Gravewood's wheel (story: "mirror").
// It is the same land as ours, rotted: no village, no people, no animals.
// Every living tree stands there as a dead black one; old ruins nobody in the
// living world remembers rise out of it (a broken keep, a colonnade, a great
// arch, a fallen giant); a few burned-out shacks; ash falling; violet cracks
// in the ground. It reaches a little way past the Gravewood and no further:
// at its edge it thins to nothing and turns you back.
//
// Shown while the story's darkness is up (story.darkness), which only happens
// around the Gravewood. Main hides the living world's people, animals and
// trees through `hide`.

/** How far the Dark reaches around the Gravewood. */
export const DARK_R = 230;

interface Deps {
  scene: THREE.Scene;
  fx: FX;
  /** the living world's trees near a point, so the dead ones stand in their places */
  treesNear(x: number, z: number, r: number): [number, number, number, number, number][];
  /** hide (true) or show (false) the living world's people, animals, plants */
  hide(h: boolean): void;
  /** a line of narration when you reach the edge */
  say(line: string): void;
}

const STONE = 0x2c2832;

/** A dead tree: a bent black trunk and a few bare, clawing branches (height 1). */
function deadTreeGeo(seed: number) {
  const r = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.018, 0.05, 1, 7, 6);
  trunk.translate(0, 0.5, 0);
  const p = trunk.getAttribute('position');
  const lean = (r() - 0.5) * 0.12, lean2 = (r() - 0.5) * 0.12;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setX(i, p.getX(i) + Math.sin(y * 4 + seed) * 0.02 + lean * y * y);
    p.setZ(i, p.getZ(i) + Math.cos(y * 3 + seed) * 0.02 + lean2 * y * y);
  }
  parts.push(trunk);
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const len = 0.22 + r() * 0.25;
    const b = new THREE.CylinderGeometry(0.004, 0.016, len, 5);
    b.translate(0, len / 2, 0);
    b.rotateZ(0.6 + r() * 0.7);
    b.rotateY(r() * Math.PI * 2);
    b.translate(0, 0.45 + r() * 0.45, 0);
    parts.push(b);
    // a twig off the end, clawing upward
    const t = new THREE.CylinderGeometry(0.002, 0.007, len * 0.5, 4);
    t.translate(0, len * 0.25, 0);
    t.rotateZ(-0.3 + r() * 0.3);
    t.rotateY(r() * Math.PI * 2);
    t.translate(0, 0.55 + r() * 0.4, 0);
    parts.push(t);
  }
  const g = mergeGeometries(parts.map((x) => x.toNonIndexed()))!;
  g.computeVertexNormals();
  return g;
}

export class DarkRealm {
  private group = new THREE.Group();
  private trees: THREE.InstancedMesh[] = [];
  private treeColliders: ReturnType<typeof physics.addCylinder>[] = [];
  private ruinColliders: ReturnType<typeof physics.addBox>[] = [];
  private stoneMat = new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.95, metalness: 0.05 });
  private barkMat = new THREE.MeshStandardMaterial({ color: 0x141018, roughness: 0.9, emissive: 0x12061e, emissiveIntensity: 0.6 });
  private charMat = new THREE.MeshStandardMaterial({ color: 0x0e0c0c, roughness: 1 });
  private crackMat = new THREE.MeshBasicMaterial({ color: 0x9a5aff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  private on = false;
  private built = false;
  private warnT = 0;

  constructor(private d: Deps) {
    this.group.visible = false;
    d.scene.add(this.group);
  }

  get active() {
    return this.on;
  }

  /** Per frame: `dark` is the story's darkness (0..1). */
  update(dt: number, dark: number, player: Player) {
    const want = dark > 0.45 && Math.hypot(player.pos.x - GRAVEWOOD.x, player.pos.z - GRAVEWOOD.y) < DARK_R + 40;
    if (want !== this.on) {
      this.on = want;
      if (want) this.enter();
      else this.leave();
    }
    if (!this.on) return;
    // Ash falls; now and then a mote of violet drifts up out of the cracks.
    if (Math.random() < dt * 30) {
      const a = Math.random() * Math.PI * 2, rr = Math.random() * 30;
      const x = player.pos.x + Math.cos(a) * rr, z = player.pos.z + Math.sin(a) * rr;
      this.d.fx.add.spawn({ pos: new THREE.Vector3(x, player.pos.y + 6 + Math.random() * 6, z), vel: new THREE.Vector3(0.3, -0.6, 0.1), spread: 1, count: 1, life: [3, 5], size: [0.07, 0.03], color: 0x5a5560, color2: 0x1a1820, gravity: 0.1 });
    }
    // The edge: it thins to nothing and turns you back.
    const dx = player.pos.x - GRAVEWOOD.x, dz = player.pos.z - GRAVEWOOD.y;
    const dist = Math.hypot(dx, dz);
    this.warnT -= dt;
    if (dist > DARK_R) {
      const k = (DARK_R - 2) / dist;
      const p = new THREE.Vector3(GRAVEWOOD.x + dx * k, 0, GRAVEWOOD.y + dz * k);
      p.y = heightAt(p.x, p.z);
      player.teleport(p);
      if (this.warnT <= 0) {
        this.warnT = 8;
        this.d.say('The Dark thins to nothing here, a grey wall of ash. There is no going further this way.');
      }
    }
  }

  private enter() {
    if (!this.built) this.build();
    this.placeTrees();
    this.group.visible = true;
    this.d.hide(true);
    // Only the ruins stop you; the dead trees stand where the living ones did, with their colliders.
    if (!this.ruinColliders.length) this.addRuinColliders();
  }

  private leave() {
    this.group.visible = false;
    this.d.hide(false);
    for (const c of this.treeColliders) physics.removeStatic(c);
    this.treeColliders = [];
    for (const c of this.ruinColliders) physics.removeStatic(c);
    this.ruinColliders = [];
  }

  /** A dead tree on every living tree's spot (and more where the wood was thin). */
  private placeTrees() {
    const spots = this.d.treesNear(GRAVEWOOD.x, GRAVEWOOD.y, DARK_R + 20);
    // Thicken it: the Dark's forest is denser than ours.
    const r = mulberry32(911);
    for (let i = 0; i < 260; i++) {
      const a = r() * Math.PI * 2, rr = 40 + Math.sqrt(r()) * (DARK_R - 30);
      const x = GRAVEWOOD.x + Math.cos(a) * rr, z = GRAVEWOOD.y + Math.sin(a) * rr;
      if (this.nearRuin(x, z)) continue;
      spots.push([x, heightAt(x, z), z, r() * 6.28, 7 + r() * 9]);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const t of this.trees) t.count = 0;
    for (const [x, y, z, rot, h] of spots) {
      if (this.nearRuin(x, z)) continue;
      const mesh = this.trees[Math.floor(Math.abs(Math.sin(x * 12.9 + z * 78.2)) * this.trees.length) % this.trees.length];
      if (mesh.count >= 1400) continue;
      const hh = Math.max(5, h * 1.15);
      q.setFromAxisAngle(up, rot);
      s.set(hh * 1.1, hh, hh * 1.1);
      p.set(x, y - 0.2, z);
      m.compose(p, q, s);
      mesh.setMatrixAt(mesh.count++, m);
    }
    for (const t of this.trees) {
      t.instanceMatrix.needsUpdate = true;
      t.computeBoundingSphere();
    }
    // Colliders for the dead trees near the heart of it (the living ones' go with their trees).
    for (const [x, y, z, , h] of spots) {
      if (this.treeColliders.length > 500) break;
      if (Math.hypot(x - GRAVEWOOD.x, z - GRAVEWOOD.y) > DARK_R) continue;
      this.treeColliders.push(physics.addCylinder(new THREE.Vector3(x, y + 2, z), 2, Math.max(0.25, h * 0.035)));
    }
  }

  // ---- the ruins ---------------------------------------------------------------------------------
  /** Where the big ruins stand: [dx, dz from the Gravewood, radius kept clear of trees]. */
  private static RUINS: { kind: 'keep' | 'colonnade' | 'arch' | 'giant' | 'shack'; at: [number, number]; yaw: number; r: number }[] = [
    { kind: 'keep', at: [95, -60], yaw: 0.4, r: 20 },
    { kind: 'colonnade', at: [-110, 40], yaw: 1.1, r: 24 },
    { kind: 'arch', at: [30, 120], yaw: -0.3, r: 14 },
    { kind: 'giant', at: [-60, -130], yaw: 2.2, r: 18 },
    { kind: 'shack', at: [150, 40], yaw: 0.2, r: 7 },
    { kind: 'shack', at: [-150, -40], yaw: 1.9, r: 7 },
    { kind: 'shack', at: [60, -170], yaw: 3.0, r: 7 },
    { kind: 'shack', at: [-20, 175], yaw: 0.9, r: 7 },
  ];
  private boxes: { c: THREE.Vector3; h: THREE.Vector3; q: THREE.Quaternion }[] = [];

  private nearRuin(x: number, z: number) {
    return DarkRealm.RUINS.some((r) => Math.hypot(x - (GRAVEWOOD.x + r.at[0]), z - (GRAVEWOOD.y + r.at[1])) < r.r) || Math.hypot(x - GRAVEWOOD.x, z - GRAVEWOOD.y) < 34;
  }

  private build() {
    this.built = true;
    for (let v = 0; v < 3; v++) {
      const t = new THREE.InstancedMesh(deadTreeGeo(101 + v * 37), this.barkMat, 1400);
      t.count = 0;
      t.castShadow = true;
      t.frustumCulled = false;
      this.group.add(t);
      this.trees.push(t);
    }
    const r = mulberry32(4242);
    for (const ru of DarkRealm.RUINS) {
      const ox = GRAVEWOOD.x + ru.at[0], oz = GRAVEWOOD.y + ru.at[1];
      const g = new THREE.Group();
      g.position.set(ox, heightAt(ox, oz), oz);
      g.rotation.y = ru.yaw;
      const box = (w: number, h: number, dd: number, x: number, y: number, z: number, rx = 0, rz = 0, mat: THREE.Material = this.stoneMat, collide = true) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), mat);
        m.position.set(x, y, z);
        m.rotation.set(rx, 0, rz);
        m.castShadow = m.receiveShadow = true;
        g.add(m);
        if (collide) {
          g.updateMatrixWorld(true);
          m.updateMatrixWorld(true);
          const c = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
          m.matrixWorld.decompose(c, q, s);
          this.boxes.push({ c, h: new THREE.Vector3(w / 2, h / 2, dd / 2), q });
        }
        return m;
      };
      const crack = (x: number, z: number, len: number, a: number) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.25, len).rotateX(-Math.PI / 2), this.crackMat);
        m.position.set(x, 0.08, z);
        m.rotation.y = a;
        g.add(m);
      };
      if (ru.kind === 'keep') {
        // A broken round keep: a ring of wall at ragged heights, one side fallen in.
        const R = 8, n = 18;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          if (i >= 12 && i <= 14) continue; // the breach
          const h = 6 + r() * 14 * (i < 6 ? 1 : 0.6);
          const seg = box(3.1, h, 1.6, Math.cos(a) * R, h / 2 - 0.5, Math.sin(a) * R);
          seg.rotation.y = -a + Math.PI / 2;
          // (the collider box took the unrotated pose: fix it up)
          const last = this.boxes[this.boxes.length - 1];
          seg.updateMatrixWorld(true);
          seg.matrixWorld.decompose(last.c, last.q, new THREE.Vector3());
        }
        for (let i = 0; i < 16; i++) box(1 + r() * 2.4, 0.8 + r() * 1.6, 1 + r() * 2, 4 + r() * 10, 0.4, -8 + r() * 6 - 4, r(), r(), this.stoneMat, false);
        crack(0, 0, 9, 0.4); crack(3, 2, 6, 1.6);
      } else if (ru.kind === 'colonnade') {
        // Two rows of pillars, most broken, a few lintels still up, some toppled.
        for (let row = -1; row <= 1; row += 2) {
          for (let i = 0; i < 8; i++) {
            const x = -14 + i * 4, z = row * 5;
            const toppled = r() < 0.25;
            if (toppled) { box(1.4, 1.4, 7, x + 1, 0.7, z + row * 3.5, 0, 0, this.stoneMat, true); continue; }
            const h = r() < 0.4 ? 9 : 2 + r() * 6;
            box(1.4, h, 1.4, x, h / 2 - 0.3, z);
            if (h >= 9 && i < 7 && r() < 0.6) box(5.2, 1, 1.6, x + 2, 9.2, z);
          }
        }
        box(30, 0.6, 14, 0, 0, 0, 0, 0, this.stoneMat, false); // the old floor
        crack(-4, 0, 12, 0.2); crack(6, -1, 8, -0.5);
      } else if (ru.kind === 'arch') {
        // A great arch over nothing: two piers and half a span.
        box(4, 18, 4, -8, 9 - 0.5, 0);
        box(4, 13, 4, 8, 6.5 - 0.5, 0);
        for (let i = 0; i < 7; i++) {
          const a = Math.PI - (i / 10) * Math.PI;
          box(3, 3.4, 4, Math.cos(a) * 8, 16 + Math.sin(a) * 6, 0, 0, a - Math.PI / 2, this.stoneMat, false);
        }
        for (let i = 0; i < 8; i++) box(1 + r() * 2.5, 1 + r() * 1.5, 1 + r() * 2.5, 4 + r() * 8, 0.5, -3 + r() * 6, r(), r(), this.stoneMat, false);
        crack(0, 0, 10, 1.57);
      } else if (ru.kind === 'giant') {
        // A fallen giant: a statue as tall as a tower, face-down in the dirt.
        box(6, 4, 16, 0, 2, 0, 0, 0.12);
        box(3, 3, 9, 4.5, 1.5, -10, 0.3, 0.2);
        box(3, 3, 10, -4.5, 1.5, -9, -0.2, -0.1);
        const head = new THREE.Mesh(new THREE.IcosahedronGeometry(3.2, 1), this.stoneMat);
        head.position.set(0.5, 2.6, 11.5);
        head.castShadow = true;
        g.add(head);
        this.boxes.push({ c: new THREE.Vector3(), h: new THREE.Vector3(2.6, 2.6, 2.6), q: new THREE.Quaternion() });
        g.updateMatrixWorld(true);
        head.getWorldPosition(this.boxes[this.boxes.length - 1].c);
        box(2.4, 7, 2.4, -7, 3.5, 6, 0.1, 0.5); // a raised arm, still holding the broken haft of a spear
        box(0.5, 9, 0.5, -9.5, 6, 6.5, 0.2, 0.9, this.charMat, false);
        crack(0, 6, 14, 0.1);
      } else {
        // A burned-out shack: four charred posts, a sagging ridge beam, a fallen roof.
        for (const [x, z] of [[-2, -1.6], [2, -1.6], [-2, 1.6], [2, 1.6]]) box(0.3, 2.4, 0.3, x, 1.2, z, (r() - 0.5) * 0.2, (r() - 0.5) * 0.2, this.charMat);
        box(4.6, 0.25, 0.25, 0, 2.6, 0, 0, 0.12, this.charMat, false);
        box(4.4, 0.12, 2.2, 0.2, 0.9, -0.6, 0.6, 0.1, this.charMat, false);
        box(1.6, 1.4, 0.4, -1.2, 0.7, 1.7, 0, 0.05, this.stoneMat, true);
      }
      this.group.add(g);
    }
    // Old graves everywhere: cracked stones leaning in the dirt.
    for (let i = 0; i < 120; i++) {
      const a = r() * Math.PI * 2, rr = 40 + r() * (DARK_R - 50);
      const x = GRAVEWOOD.x + Math.cos(a) * rr, z = GRAVEWOOD.y + Math.sin(a) * rr;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1 + r() * 0.6, 0.18), this.stoneMat);
      m.position.set(x, heightAt(x, z) + 0.4, z);
      m.rotation.set((r() - 0.5) * 0.5, r() * 6, (r() - 0.5) * 0.5);
      this.group.add(m);
    }
  }

  private addRuinColliders() {
    for (const b of this.boxes) this.ruinColliders.push(physics.addBox(b.c, b.h, b.q));
  }

  dispose() {
    if (this.on) this.leave();
    this.d.scene.remove(this.group);
  }
}
