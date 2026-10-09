import * as THREE from 'three';
import { heightAt } from '../terrainHeight';
import { buildCharacter, type Look, type BuiltCharacter } from '../../npc/charBuilder';
import { forestLayer, OLDEST_WAY, GATE_S, type P2 } from './elvenForestData';
import { road, pointAlong, roadLength } from '../roadNetwork';
import { elf } from './elfFolk';
import type { Player } from '../../player/player';

// The Lost Woods (docs/design/verdant-elves.md §5). In the Inner and Ancient
// Forest the paths loop: walk off the elven paths without a guide and, a
// little way into the trees, the forest turns you round. A quiet fade, a
// rustle, and you are back where you left the path, beside the same fallen
// tree as before. Never in the Outer Forest, never in the Deep Elven Lands
// around the Sanctum, and only in the elves' western heartland.
//
// Ways through: an elven guide (Nimri, hired in Thornwick, walks with you and
// faint lights show the way), the Guide's Token from Silverbough, the elf
// origin (the forest knows its own), or reading the trail marks (a delver's
// eye: Dungeoneering 8 and up, until feat/dungeons gives it its own node).

export interface LostHooks {
  flags: Record<string, boolean | number | string>;
  hours(): number;
  origin(): string;
  count(id: string): number;
  dungeoneering(): number;
  toast(msg: string): void;
  fade(on: boolean): Promise<void>;
  teleport(p: THREE.Vector3): void;
  /** where the guide's lights lead (null: nowhere in particular) */
  destination(): P2 | null;
}

const ON_PATH = 16;
const WANDER = 45;
/** The elven paths the forest lets anyone walk: the Greenwood Road past the marker stone, and the Oldest Way. */
const PATHS: P2[][] = (() => {
  const fr = road('forest');
  const pts: P2[] = [];
  for (let s = GATE_S; s <= roadLength(fr); s += 25) {
    const p = pointAlong(fr, s);
    pts.push([p.x, p.z]);
  }
  pts.push(fr.pts[fr.pts.length - 1]);
  return [pts, OLDEST_WAY];
})();
function pathDist(x: number, z: number) {
  let d = Infinity;
  for (const line of PATHS) for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1];
    const vx = bx - ax, vz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    d = Math.min(d, Math.hypot(x - ax - vx * t, z - az - vz * t));
  }
  return d;
}

/** The nearest point on an elven path. */
function nearestOnPath(x: number, z: number): P2 {
  let best = Infinity, out: P2 = [x, z];
  for (const line of PATHS) for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1];
    const vx = bx - ax, vz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    const px = ax + vx * t, pz = az + vz * t, d = Math.hypot(x - px, z - pz);
    if (d < best) (best = d), (out = [px, pz]);
  }
  return out;
}

const LINES = [
  'The trees close round you. A turn, another, and you are back where you left the path, beside a fallen tree you have seen before.',
  'A rustle overhead, a breath of cold air. The path is in front of you again. So is that same mossy log.',
  'You were sure you walked north. The forest was sure you did not.',
  'Somewhere a bell-like laugh. When you look up, you are back on the path.',
];

export class LostWoods {
  /** where the forest returns you: the last point on a path, or where you came into the woods */
  anchor: THREE.Vector3 | null = null;
  turning = false;
  /** how many times the woods turned you (this session) */
  loops = 0;
  private guide: { b: BuiltCharacter; walk?: THREE.AnimationAction; idle?: THREE.AnimationAction; pos: THREE.Vector3 } | null = null;
  private guideLoading = false;
  private log: THREE.Mesh;
  private lights: THREE.InstancedMesh;
  private t = 0;
  private m = new THREE.Matrix4();

  constructor(private scene: THREE.Scene, private hooks: LostHooks) {
    this.log = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 6, 9).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5a4a32, roughness: 1 }));
    const moss = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.25, 0.9), new THREE.MeshStandardMaterial({ color: 0x4a6a2a, roughness: 1 }));
    moss.position.y = 0.6;
    this.log.add(moss);
    this.log.visible = false;
    this.log.castShadow = true;
    scene.add(this.log);
    this.lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xb8ffe0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }), 14);
    this.lights.count = 0;
    this.lights.frustumCulled = false;
    scene.add(this.lights);
  }

  /** Does the forest loop here? */
  strictAt(x: number, z: number) {
    const l = forestLayer(x, z);
    return (l === 'inner' || l === 'ancient') && x < 0;
  }
  onPath(x: number, z: number) {
    return pathDist(x, z) < ON_PATH;
  }
  /** Is a guide walking with you now? */
  get guided() {
    return Number(this.hooks.flags['elves:guideUntil'] ?? 0) > this.hooks.hours();
  }
  /** Why the woods let you through, or null. */
  allowed(): 'guide' | 'token' | 'elf' | 'marks' | null {
    if (this.guided) return 'guide';
    if (this.hooks.flags['elves:token'] || this.hooks.count('guidesToken') > 0) return 'token';
    if (this.hooks.origin() === 'elf') return 'elf';
    if (this.hooks.dungeoneering() >= 8) return 'marks';
    return null;
  }

  /** Hire a guide for a day (Nimri). */
  hire(hours = 24) {
    this.hooks.flags['elves:guideUntil'] = this.hooks.hours() + hours;
  }

  update(dt: number, player: Player) {
    this.t += dt;
    this.updateGuide(dt, player);
    if (this.turning || player.dead) return;
    const p = player.pos;
    if (!this.strictAt(p.x, p.z)) {
      this.anchor = p.clone();
      return;
    }
    if (this.allowed() || this.onPath(p.x, p.z)) {
      this.anchor = p.clone();
      return;
    }
    if (!this.anchor) this.anchor = p.clone();
    if (Math.hypot(p.x - this.anchor.x, p.z - this.anchor.z) > WANDER) void this.turn(player);
  }

  /** The forest turns you round. */
  private async turn(player: Player) {
    this.turning = true;
    const to = this.anchor!.clone();
    // Left the path somewhere the woods don't loop back to (a guide's day ran out): out onto the nearest path.
    if (this.strictAt(to.x, to.z) && !this.onPath(to.x, to.z)) {
      const [x, z] = nearestOnPath(to.x, to.z);
      to.set(x, 0, z);
    }
    await this.hooks.fade(true);
    to.y = heightAt(to.x, to.z) + 0.4;
    this.hooks.teleport(to);
    // The same fallen tree, every time.
    const side = new THREE.Vector3(Math.cos(this.loops * 2.4) * 3.5, 0, Math.sin(this.loops * 2.4) * 3.5);
    this.log.position.set(to.x + side.x, heightAt(to.x + side.x, to.z + side.z) + 0.35, to.z + side.z);
    this.log.rotation.y = this.loops * 0.7;
    this.log.visible = true;
    this.hooks.toast(LINES[this.loops % LINES.length]);
    this.loops++;
    this.hooks.flags['elves:loops'] = Number(this.hooks.flags['elves:loops'] ?? 0) + 1;
    void player;
    await this.hooks.fade(false);
    this.turning = false;
  }

  /** Nimri walks a few steps behind you while she's hired, and faint lights show the way. */
  private updateGuide(dt: number, player: Player) {
    const on = this.guided && !player.dead;
    if (on && !this.guide && !this.guideLoading) {
      this.guideLoading = true;
      const look: Look = elf(true, 0x3a2a1a, 0x5a7a3a, { hood: true, height: 1.76 });
      void buildCharacter(look, ['idle', 'walk']).then((b) => {
        this.guideLoading = false;
        const acts = (b.mixer as unknown as { _actions: THREE.AnimationAction[] })._actions;
        const walk = acts.find((a) => a.getClip().name === 'walk'), idle = acts.find((a) => a.getClip().name === 'idle') ?? acts[0];
        idle?.play();
        walk?.play();
        const pos = player.pos.clone().add(new THREE.Vector3(2, 0, 2));
        b.root.position.copy(pos);
        this.scene.add(b.root);
        this.guide = { b, walk, idle, pos };
      });
    }
    if (!on && this.guide) {
      this.scene.remove(this.guide.b.root);
      this.guide.b.mixer.stopAllAction();
      this.guide = null;
      this.hooks.toast('Nimri: "Day’s done, friend. You know where to find me."');
    }
    if (this.guide) {
      const g = this.guide;
      const to = player.pos.clone().sub(g.pos).setY(0);
      const d = to.length();
      if (d > 40) g.pos.copy(player.pos).add(new THREE.Vector3(2, 0, 2));
      const speed = d > 3.5 ? Math.min(7, (d - 3) * 1.6) : 0;
      if (speed > 0) g.pos.addScaledVector(to.normalize(), speed * dt);
      g.pos.y = heightAt(g.pos.x, g.pos.z);
      g.b.root.position.copy(g.pos);
      if (d > 0.5) g.b.root.rotation.y = Math.atan2(player.pos.x - g.pos.x, player.pos.z - g.pos.z);
      const w = Math.min(1, speed / 2);
      g.walk?.setEffectiveWeight(w);
      g.idle?.setEffectiveWeight(1 - w);
      g.b.mixer.update(dt * (0.6 + w * 0.8));
    }
    // The lights: motes leading from you toward where you're going.
    const dest = this.guided ? this.hooks.destination() : null;
    if (!dest || !this.strictAt(player.pos.x, player.pos.z) && Math.hypot(player.pos.x - dest[0], player.pos.z - dest[1]) > 600) {
      this.lights.count = 0;
      return;
    }
    const dir = new THREE.Vector3(dest[0] - player.pos.x, 0, dest[1] - player.pos.z);
    const dist = dir.length();
    dir.normalize();
    let n = 0;
    for (let k = 0; k < 14; k++) {
      const s = 5 + k * 5 + ((this.t * 1.5) % 5);
      if (s > dist) break;
      const x = player.pos.x + dir.x * s + Math.sin(k * 1.7 + this.t) * 1.2, z = player.pos.z + dir.z * s + Math.cos(k * 1.3 + this.t) * 1.2;
      this.m.makeTranslation(x, heightAt(x, z) + 1.1 + Math.sin(this.t * 2 + k) * 0.25, z);
      this.lights.setMatrixAt(n++, this.m);
    }
    this.lights.count = n;
    this.lights.instanceMatrix.needsUpdate = true;
  }

  setVisible(v: boolean) {
    this.lights.visible = v;
    this.log.visible = v && this.loops > 0;
    if (this.guide) this.guide.b.root.visible = v;
  }

  reset() {
    this.anchor = null;
    this.turning = false;
    this.loops = 0;
    this.log.visible = false;
  }
}

