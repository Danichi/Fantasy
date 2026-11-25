import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { physics } from '../../physics/physics';
import { markClimbable } from '../../player/traversalSurfaces';
import type { Player } from '../../player/player';
import type { FX } from '../../fx/particles';
import type { WheelNode } from '../../story/sunwheel';
import type { Interactable } from '../../dungeon/instance';
import { Undead } from '../../enemies/undead';
import { ancientHeight, DARK_X, DARK_Z, SCARS, inDark, onMap } from './land';
import type { Tether } from './tether';

const TILE = 160,
  N = 32;
const hash = (x: number, z: number, k = 0) => {
  const v = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453;
  return v - Math.floor(v);
};
interface Decor {
  pos: THREE.Vector3;
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
}
interface Chunk {
  group: THREE.Group;
  ground: THREE.BufferGeometry;
  collider: RAPIER.Collider;
  decor: Decor[];
}

/** Streamed ancient terrain. Only nearby tiles own collision; all assets are
 * disposed on departure, including traversal registrations and enemy bodies. */
export class DarkWorld {
  readonly group = new THREE.Group();
  readonly actions: Interactable[] = [];
  readonly chunks = new Map<string, Chunk>();
  readonly foes = new Map<string, Undead>();
  private nodes: WheelNode[] = [];
  private stone = new THREE.MeshStandardMaterial({ color: 0x615e70, roughness: 0.97 });
  private earth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  private bark = new THREE.MeshStandardMaterial({ color: 0x8d8290, roughness: 0.95 });
  private glow = new THREE.MeshBasicMaterial({ color: 0xffd99b });
  private echo = new THREE.MeshBasicMaterial({ color: 0x9bdce3 });
  private treeGeo: THREE.BufferGeometry;
  private box = new THREE.BoxGeometry(1, 1, 1);
  private rock = new THREE.IcosahedronGeometry(1, 1);
  private ring = new THREE.TorusGeometry(1.15, 0.16, 6, 16);
  private orb = new THREE.IcosahedronGeometry(0.65, 1);
  private props = new THREE.Group();
  private solids: RAPIER.Collider[] = [];
  private nearbyDecor = new Map<Decor, RAPIER.Collider>();
  private decorAt = new THREE.Vector3(Infinity, 0, Infinity);
  private propClear(x: number, z: number) {
    return (
      this.nodes.some((n) => Math.hypot(n.pos.x - x, n.pos.z - z) < 14) ||
      SCARS.some((s) => Math.hypot(s.x + s.r * 0.84 - x, s.z - z) < 8) ||
      (Math.abs(x + 1250) < 10 && Math.abs(z + 672) < 32)
    );
  }
  constructor(
    private scene: THREE.Scene,
    private fx: FX,
    private tether: Tether,
    private wheel: (n: WheelNode) => void,
    private memory: (id: string, text: string) => void
  ) {
    this.group.name = 'The explorable Dark';
    this.group.add(this.props);
    const parts: THREE.BufferGeometry[] = [];
    const trunk = new THREE.CylinderGeometry(0.1, 0.65, 8, 5);
    trunk.translate(0, 4, 0);
    parts.push(trunk);
    for (let i = 0; i < 5; i++) {
      const branch = new THREE.CylinderGeometry(0.035, 0.22, 4, 4);
      branch.rotateZ(0.75 + i * 0.12);
      branch.translate(-1.1, 4.2 + i * 0.65, 0);
      branch.rotateY(i * 2.4);
      parts.push(branch);
    }
    this.treeGeo = mergeGeometries(parts)!;
    parts.forEach((g) => g.dispose());
    this.earth.onBeforeCompile = (shader) => {
      shader.vertexShader =
        'varying vec3 vAncient;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
        vAncient = position + vec3(modelMatrix[3].x - ${DARK_X.toFixed(1)}, 0.0, modelMatrix[3].z - ${DARK_Z.toFixed(1)});`
        );
      shader.fragmentShader =
        `varying vec3 vAncient;
        float darkNoise(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float darkField(vec2 p) { vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(darkNoise(i),darkNoise(i+vec2(1,0)),f.x),mix(darkNoise(i+vec2(0,1)),darkNoise(i+vec2(1,1)),f.x),f.y); }
        ` +
        shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float fields = darkField(vAncient.xz * .026);
          float veins = abs(sin(vAncient.x * .16 + vAncient.z * .07 + darkField(vAncient.xz * .08)*7.0));
          float ash = darkField(vAncient.xz * .6);
          diffuseColor.rgb *= mix(vec3(.48,.43,.47),vec3(1.18,1.1,1.02),fields);
          diffuseColor.rgb *= .86 + ash*.24;
          diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.12,.10,.15),smoothstep(.94,.995,veins)*.3);`
        );
    };
  }
  height = (x: number, z: number) => {
    let h = ancientHeight(x, z);
    for (const n of this.nodes) {
      const d = Math.hypot(x - n.pos.x, z - n.pos.z);
      if (d < 14) {
        const t = Math.min(1, Math.max(0, (d - 6) / 8));
        h = THREE.MathUtils.lerp(ancientHeight(n.pos.x, n.pos.z), h, t * t * (3 - 2 * t));
      }
    }
    return h;
  };
  ground = (x: number, z: number) => (inDark(x, z) ? this.height(x - DARK_X, z - DARK_Z) : null);
  at(x: number, z: number, above = 0) {
    return new THREE.Vector3(x + DARK_X, this.height(x, z) + above, z + DARK_Z);
  }

  start(nodes: WheelNode[]) {
    this.nodes = nodes;
    this.scene.add(this.group);
    for (const n of nodes) {
      const p = this.at(n.pos.x, n.pos.z);
      const ring = new THREE.Mesh(this.ring, this.glow);
      ring.position.copy(p).y += 1.6;
      this.props.add(ring);
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.3, 30, 6, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xf9ce8c, transparent: true, opacity: 0.15, depthWrite: false })
      );
      shaft.position.copy(p).y += 15;
      this.props.add(shaft);
      const base = new THREE.Mesh(this.box, this.stone);
      base.scale.set(2.8, 0.4, 2.5);
      base.position.copy(p).y -= 0.1;
      this.props.add(base);
      this.actions.push({ pos: p, radius: 4.3, level: 4, label: () => `Sunwheel • ${n.name}`, enabled: () => true, action: () => this.wheel(n) });
    }
    for (const s of SCARS) {
      const p = this.at(s.x + s.r * 0.84, s.z);
      const m = new THREE.Mesh(this.orb, this.echo);
      m.position.copy(p).y += 1.3;
      this.props.add(m);
      this.actions.push({
        pos: p,
        radius: 3,
        level: 4,
        label: () => (this.tether.flags['dark:memory:' + s.id] ? `Recall • ${s.name}` : `Ancient memory • ${s.name} (+${Math.min(18, 900 - this.tether.capacity)}s tether)`),
        enabled: () => true,
        action: () => this.memory(s.id, s.text),
      });
      // Broken monoliths are a scale reference for the battle, not equipment.
      for (let i = 0; i < 5; i++) {
        const a = i * 1.25,
          q = this.at(s.x + Math.cos(a) * s.r * 0.9, s.z + Math.sin(a) * s.r * 0.9);
        const ruin = new THREE.Mesh(this.box, this.stone);
        ruin.scale.set(4 + i, 18 + i * 4, 5);
        ruin.rotation.z = (i - 2) * 0.16;
        ruin.position.copy(q).y += ruin.scale.y * 0.42;
        this.props.add(ruin);
        this.solids.push(markClimbable(physics.addBox(ruin.position, ruin.scale.clone().multiplyScalar(0.5), ruin.quaternion)));
      }
    }
    // A genuine traversable bore: ground under an enormous severed ridge.
    const b = this.at(-1250, -672);
    for (const [dx, dy, sx, sy] of [
      [-21, 18, 12, 36],
      [21, 18, 12, 36],
      [0, 35, 54, 12],
    ]) {
      const m = new THREE.Mesh(this.box, this.stone);
      m.scale.set(sx, sy, 35);
      m.position.copy(b).add(new THREE.Vector3(dx, dy, 0));
      this.props.add(m);
      this.solids.push(markClimbable(physics.addBox(m.position, m.scale.clone().multiplyScalar(0.5))));
    }
  }
  private tile(i: number, j: number) {
    const x0 = i * TILE,
      z0 = j * TILE;
    const vertices: number[] = [],
      colors: number[] = [],
      indices: number[] = [],
      heights = new Float32Array((N + 1) ** 2),
      decor: Decor[] = [];
    for (let z = 0; z <= N; z++)
      for (let x = 0; x <= N; x++) {
        const wx = x0 + (x * TILE) / N,
          wz = z0 + (z * TILE) / N,
          h = this.height(wx, wz);
        vertices.push((x * TILE) / N, h, (z * TILE) / N);
        heights[x * (N + 1) + z] = h;
        const c = new THREE.Color().setHSL(0.69 + hash(wx, wz) * 0.035, 0.09, 0.22 + Math.min(0.18, Math.max(0, h) / 700) + hash(wx, wz, 1) * 0.045);
        colors.push(c.r, c.g, c.b);
        if (x < N && z < N) {
          const a = z * (N + 1) + x,
            c = a + N + 1;
          indices.push(a, c, a + 1, a + 1, c, c + 1);
        }
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    const group = new THREE.Group();
    group.position.set(x0 + DARK_X, 0, z0 + DARK_Z);
    const m = new THREE.Mesh(g, this.earth);
    m.receiveShadow = true;
    group.add(m);
    const count = 16 + Math.floor(hash(i, j, 3000) * 65);
    const trees = new THREE.InstancedMesh(this.treeGeo, this.bark, count),
      matrix = new THREE.Matrix4(),
      q = new THREE.Quaternion();
    for (let k = 0; k < count; k++) {
      const x = hash(i, j, k + 1) * TILE,
        z = hash(i + 8, j, k + 90) * TILE,
        h = this.height(x0 + x, z0 + z);
      q.setFromEuler(new THREE.Euler(hash(i, j, k + 700) * 0.3, hash(i, j, k + 500) * Math.PI * 2, hash(i, j, k + 600) * 0.22));
      const clear = this.propClear(x0 + x, z0 + z);
      const scale = clear ? 0 : 0.7 + hash(i, j, k + 300) * 1.7;
      matrix.compose(new THREE.Vector3(x, h, z), q, new THREE.Vector3(scale, scale, scale));
      trees.setMatrixAt(k, matrix);
      if (!clear)
        decor.push({
          pos: new THREE.Vector3(x0 + x + DARK_X, h, z0 + z + DARK_Z),
          geometry: this.treeGeo,
          matrix: matrix.clone().premultiply(new THREE.Matrix4().makeTranslation(x0 + DARK_X, 0, z0 + DARK_Z)),
        });
    }
    trees.castShadow = true;
    trees.instanceMatrix.needsUpdate = true;
    group.add(trees);
    this.group.add(group);
    const rocks = new THREE.InstancedMesh(this.rock, this.stone, 12);
    for (let k = 0; k < 12; k++) {
      const x = hash(i, j, k + 4000) * TILE,
        z = hash(i, j, k + 4100) * TILE,
        h = this.height(x0 + x, z0 + z);
      const clear = this.propClear(x0 + x, z0 + z);
      const size = clear ? 0 : 1 + hash(i, j, k + 4200) * 5;
      q.setFromEuler(new THREE.Euler(0.2, hash(i, j, k + 4300) * 6.28, 0.25));
      const scale = new THREE.Vector3(size, size * (1.2 + hash(i, j, k + 4400) * 2), size * 0.75);
      matrix.compose(new THREE.Vector3(x, h + scale.y * 0.35, z), q, scale);
      rocks.setMatrixAt(k, matrix);
      if (!clear)
        decor.push({
          pos: new THREE.Vector3(x0 + x + DARK_X, h + scale.y * 0.35, z0 + z + DARK_Z),
          geometry: this.rock,
          matrix: matrix.clone().premultiply(new THREE.Matrix4().makeTranslation(x0 + DARK_X, 0, z0 + DARK_Z)),
        });
    }
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    rocks.instanceMatrix.needsUpdate = true;
    group.add(rocks);
    const collider = markClimbable(physics.addHeightfield(new THREE.Vector3(x0 + DARK_X + TILE / 2, 0, z0 + DARK_Z + TILE / 2), N, N, heights, TILE, TILE), 'terrain');
    this.chunks.set(`${i},${j}`, { group, ground: g, collider, decor });
  }
  warm(p: THREE.Vector3) {
    const i = Math.floor((p.x - DARK_X) / TILE),
      j = Math.floor((p.z - DARK_Z) / TILE);
    const needed = new Set<string>();
    for (let dz = -3; dz <= 3; dz++)
      for (let dx = -3; dx <= 3; dx++) {
        const key = `${i + dx},${j + dz}`;
        needed.add(key);
        if (!this.chunks.has(key)) this.tile(i + dx, j + dz);
      }
    for (const [key, c] of this.chunks)
      if (!needed.has(key)) {
        physics.removeStatic(c.collider);
        c.ground.dispose();
        c.group.removeFromParent();
        c.group.traverse((o) => {
          if (o instanceof THREE.InstancedMesh) o.dispose();
        });
        this.chunks.delete(key);
      }
    if (this.decorAt.distanceToSquared(p) > 64) {
      this.decorAt.copy(p);
      const near = new Set<Decor>();
      for (const c of this.chunks.values())
        for (const d of c.decor) {
          if (Math.hypot(d.pos.x - p.x, d.pos.z - p.z) > 85) continue;
          near.add(d);
          if (!this.nearbyDecor.has(d)) {
            // Share the rendered shape: simplified boxes let a capsule sink
            // visibly into a boulder or collide beside a leaning trunk.
            const geo = d.geometry.clone().applyMatrix4(d.matrix);
            const positions = geo.getAttribute('position');
            const indices = geo.index ? new Uint32Array(geo.index.array) : Uint32Array.from({ length: positions.count }, (_, i) => i);
            this.nearbyDecor.set(d, markClimbable(physics.addTrimesh(new Float32Array(positions.array), indices)));
            geo.dispose();
          }
        }
      for (const [d, c] of this.nearbyDecor)
        if (!near.has(d)) {
          physics.removeStatic(c);
          this.nearbyDecor.delete(d);
        }
    }
  }
  update(dt: number, player: Player) {
    this.warm(player.pos);
    const x = player.pos.x - DARK_X,
      z = player.pos.z - DARK_Z;
    if (!onMap(x, z)) return;
    for (const s of SCARS) {
      const d = Math.hypot(x - s.x, z - s.z);
      if (d > s.r + 160) continue;
      // The oldest wounds shelter their dead. They threaten ordinary health;
      // the Journey also listens for actual player damage to fray the tether.
      for (let i = 0; i < 2; i++) {
        const id = `${s.id}:${i}`;
        if (this.foes.has(id) || this.tether.flags['dark:slain:' + id]) continue;
        const a = i * 2.6 + 0.4,
          at = this.at(s.x + Math.cos(a) * s.r * 0.7, s.z + Math.sin(a) * s.r * 0.7);
        if (at.distanceTo(player.pos) > 100) continue;
        const f = new Undead('skeleton', at, a, this.scene, this.fx);
        f.hp = f.maxHp = 160 + SCARS.indexOf(s) * 35;
        f.damageScale = 1.6 + SCARS.indexOf(s) * 0.12;
        this.foes.set(id, f);
      }
    }
    const crowd = [...this.foes.values()];
    for (const [id, f] of this.foes) {
      f.update(dt, player, crowd);
      if (!f.alive) this.tether.flags['dark:slain:' + id] = true;
      if (f.dead || f.position.distanceTo(player.pos) > 210) {
        f.dispose();
        this.foes.delete(id);
      }
    }
  }
  dispose() {
    for (const f of this.foes.values()) f.dispose();
    this.foes.clear();
    for (const c of this.chunks.values()) {
      physics.removeStatic(c.collider);
      c.ground.dispose();
      c.group.traverse((o) => {
        if (o instanceof THREE.InstancedMesh) o.dispose();
      });
    }
    this.chunks.clear();
    for (const c of this.solids) physics.removeStatic(c);
    this.solids = [];
    for (const c of this.nearbyDecor.values()) physics.removeStatic(c);
    this.nearbyDecor.clear();
    this.props.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial && o.material !== this.glow && o.material !== this.echo) o.material.dispose();
    });
    this.group.removeFromParent();
    this.actions.length = 0;
    this.treeGeo.dispose();
    this.box.dispose();
    this.rock.dispose();
    this.ring.dispose();
    this.orb.dispose();
    this.stone.dispose();
    this.earth.dispose();
    this.bark.dispose();
    this.glow.dispose();
    this.echo.dispose();
  }
}
