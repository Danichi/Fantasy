import * as THREE from 'three';
import { targets, type Target } from '../../combat/targets';
import type { SkillRuntime } from '../../paths/skills';
import type { Player } from '../../player/player';

// Summoned allies (items/catalog): the Spectral Wolf and the Glen Watchman
// from their scrolls, and the watchmen the Bell of the Glen calls. They are
// spirits: they run to the nearest foe, bite or strike it on their own time,
// follow you when nothing is near, and fade when their time is up. Foes can't
// harm them.

export type AllyKind = 'wolf' | 'watchman' | 'skeleton' | 'beast' | 'drowned';

const LOOK: Record<AllyKind, { color: number; speed: number; reach: number; cd: number; label: string }> = {
  wolf: { color: 0x9fd0ff, speed: 7.5, reach: 1.7, cd: 0.9, label: 'Spectral Wolf' },
  watchman: { color: 0xffe0a0, speed: 4.6, reach: 2.4, cd: 1.25, label: 'Glen Watchman' },
  // The classes' summons (paths/roster): the Necromancer's risen dead, the Druid's and Beastmaster's beasts, the Seawitch's drowned.
  skeleton: { color: 0xc8f0b0, speed: 4.2, reach: 2.0, cd: 1.1, label: 'Risen Dead' },
  beast: { color: 0x9fe07a, speed: 7, reach: 1.8, cd: 0.95, label: 'Spirit Beast' },
  drowned: { color: 0x5ad0d8, speed: 4, reach: 2.2, cd: 1.2, label: 'Drowned Sailor' },
};

function ghost(color: number) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, transparent: true, opacity: 0.62, roughness: 0.5, depthWrite: false });
}

function wolfModel(m: THREE.Material) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.75, 4, 10), m);
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.62;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), m);
  head.position.set(0, 0.82, 0.58);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 8), m);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 0.76, 0.8);
  const ears = [-1, 1].map((s) => {
    const e = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), m);
    e.position.set(s * 0.1, 1.0, 0.52);
    return e;
  });
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 6), m);
  tail.rotation.x = -2.2;
  tail.position.set(0, 0.7, -0.6);
  g.add(body, head, snout, tail, ...ears);
  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [[-0.14, 0.32], [0.14, 0.32], [-0.14, -0.32], [0.14, -0.32]]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.5, 6), m);
    l.geometry.translate(0, -0.25, 0);
    l.position.set(x, 0.55, z);
    g.add(l);
    legs.push(l);
  }
  return { g, legs };
}

function watchmanModel(m: THREE.Material) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.8, 4, 10), m);
  body.position.y = 1.0;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), m);
  head.position.y = 1.72;
  const helm = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.2, 12), m);
  helm.position.y = 1.86;
  const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 16), m);
  shield.rotation.z = Math.PI / 2;
  shield.position.set(-0.34, 1.05, 0.12);
  const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.2, 6), m);
  spear.position.set(0.32, 1.1, 0.1);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 6), m);
  tip.position.set(0.32, 2.3, 0.1);
  g.add(body, head, helm, shield, spear, tip);
  const legs: THREE.Mesh[] = [];
  for (const x of [-0.12, 0.12]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.7, 6), m);
    l.geometry.translate(0, -0.35, 0);
    l.position.set(x, 0.7, 0);
    g.add(l);
    legs.push(l);
  }
  return { g, legs, spear, tip };
}

export class Ally {
  readonly group: THREE.Group;
  readonly pos: THREE.Vector3;
  yaw = 0;
  left: number;
  private legs: THREE.Mesh[];
  private arm?: THREE.Object3D[];
  private cd = 0;
  private stride = 0;
  private lunge = 0;
  private mat: THREE.MeshStandardMaterial;
  /** blows landed (tests) */
  hits = 0;
  target: Target | null = null;

  constructor(private scene: THREE.Scene, readonly kind: AllyKind, at: THREE.Vector3, sec: number, readonly dmg: number, private slot: number) {
    this.mat = ghost(LOOK[kind].color);
    const built = kind === 'wolf' || kind === 'beast' ? wolfModel(this.mat) : watchmanModel(this.mat);
    if (kind === 'beast') built.g.scale.setScalar(1.25);
    this.group = built.g;
    this.legs = built.legs;
    if ('spear' in built) this.arm = [(built as ReturnType<typeof watchmanModel>).spear, (built as ReturnType<typeof watchmanModel>).tip];
    this.pos = at.clone();
    this.left = sec;
    this.group.position.copy(this.pos);
    scene.add(this.group);
  }

  get alive() {
    return this.left > 0;
  }

  update(dt: number, player: Player, rt: SkillRuntime, ground: (x: number, z: number, y: number) => number) {
    const L = LOOK[this.kind];
    this.left -= dt;
    this.cd -= dt;
    // The nearest foe near you (or the one it's already on).
    if (!this.target?.alive || this.target.position.distanceTo(player.pos) > 22) {
      this.target = null;
      let bd = 16;
      for (const t of targets) {
        if (!t.alive || !t.lockable) continue;
        const d = t.position.distanceTo(player.pos);
        if (d < bd) (bd = d), (this.target = t);
      }
    }
    const t = this.target;
    // Where to be: at the foe, or at your side (each ally its own place in the ring).
    const a = this.slot * 2.1 + 1.2;
    const goal = t ? t.position : player.pos.clone().add(new THREE.Vector3(Math.cos(a) * 2.2, 0, Math.sin(a) * 2.2));
    const to = goal.clone().sub(this.pos).setY(0);
    const dist = to.length();
    const stop = t ? L.reach + t.radius * 0.6 : 0.6;
    let moving = false;
    if (dist > stop) {
      const step = Math.min(dist - stop, L.speed * (t ? 1 : dist > 8 ? 1.6 : 0.8) * dt);
      this.pos.addScaledVector(to.normalize(), step);
      moving = true;
    }
    // Too far behind (you rode off, you went through a door): it catches up.
    if (this.pos.distanceTo(player.pos) > 40) this.pos.copy(player.pos);
    this.pos.y = ground(this.pos.x, this.pos.z, this.pos.y);
    if (dist > 0.05) {
      const want = Math.atan2(goal.x - this.pos.x, goal.z - this.pos.z);
      let d = want - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 10);
    }
    // In reach: bite, or a spear thrust.
    if (t && dist <= stop + 0.3 && this.cd <= 0) {
      this.cd = L.cd;
      this.lunge = 1;
      rt.hit(t, this.dmg, { poise: this.kind === 'wolf' ? 25 : 45, source: 'spell', noVerdict: true, dir: to.lengthSq() > 0 ? to.clone().normalize() : undefined });
      rt.vfx.burst(t.center.clone(), ({ wolf: 'frost', watchman: 'light', skeleton: 'shadow', beast: 'nature', drowned: 'frost' } as const)[this.kind], 0.7, 2);
      this.hits++;
    }
    // Animate: legs swing while moving, a lunge on the blow, fade at the end.
    this.stride += dt * (moving ? (this.kind === 'wolf' ? 14 : 9) : 0);
    this.legs.forEach((l, i) => (l.rotation.x = moving ? Math.sin(this.stride + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 : 0));
    this.lunge = Math.max(0, this.lunge - dt * 4);
    if (this.arm) for (const o of this.arm) o.position.z = 0.1 + this.lunge * 0.6;
    this.group.position.set(this.pos.x, this.pos.y + Math.sin(this.left * 3) * 0.03, this.pos.z);
    this.group.position.addScaledVector(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), this.kind === 'wolf' ? this.lunge * 0.5 : 0);
    this.group.rotation.y = this.yaw;
    this.mat.opacity = 0.62 * Math.min(1, this.left / 1.2) * Math.min(1, 0.4 + (1 - this.lunge) * 0.6 + this.lunge);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.mat.dispose();
  }
}

export class Allies {
  list: Ally[] = [];
  constructor(private scene: THREE.Scene, private player: Player, private rt: SkillRuntime, private ground: (x: number, z: number, y: number) => number) {}

  /** Call `n` allies of a kind to your side for `sec` seconds, hitting for `dmg`. */
  summon(kind: AllyKind, n: number, sec: number, dmg: number) {
    const p = this.player;
    for (let i = 0; i < n; i++) {
      const a = (this.list.length + i) * 2.1 + 1.2;
      const at = p.pos.clone().add(new THREE.Vector3(Math.cos(a) * 1.8, 0, Math.sin(a) * 1.8));
      at.y = this.ground(at.x, at.z, p.pos.y);
      this.list.push(new Ally(this.scene, kind, at, sec, dmg, this.list.length + i));
      this.rt.vfx.burst(at.clone().setY(at.y + 1), kind === 'wolf' ? 'frost' : 'light', 1.2, 3);
    }
    return this.list.slice(-n);
  }

  /** Allies within `r` m of a point (the Crown Guard fights better beside them). */
  near(at: THREE.Vector3, r: number) {
    return this.list.filter((a) => a.alive && a.pos.distanceTo(at) < r).length;
  }

  update(dt: number) {
    for (const a of this.list) a.update(dt, this.player, this.rt, this.ground);
    this.list = this.list.filter((a) => {
      if (a.alive) return true;
      a.dispose();
      return false;
    });
  }

  clear() {
    for (const a of this.list) a.dispose();
    this.list = [];
  }
}

export const ALLY_NAMES = Object.fromEntries(Object.entries(LOOK).map(([k, v]) => [k, v.label]));
