import * as THREE from 'three';
import { heightAt, riverX, RIVER_LEVEL, TOWN_R } from './terrainHeight';
import { reliefAt, RELIEF, SEA_LEVEL } from './worldMap';
import { waterSurfaceAt } from './waterLevel';
import { dampAngle, mulberry32 } from '../core/math';
import { CrowFlock } from '../enemies/vermin';
import type { FX } from '../fx/particles';

// Small life (World Expansion phase 3, "fauna with simple AI"): ducks that
// paddle the Elder Glen river and Millbrook Mere and scoot away from you,
// fish that leap out of any water near you, rabbits that hop about the
// meadows and bolt, and crows that settle on the far wheat fields.

function duckModel(drake: boolean) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: drake ? 0x9a8a78 : 0x8a6a4a, roughness: 0.8 }));
  body.scale.set(0.85, 0.62, 1.35);
  body.position.y = 0.06;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), new THREE.MeshStandardMaterial({ color: drake ? 0x2f6a3a : 0x7a5a3a, roughness: 0.5 }));
  head.position.set(0, 0.19, 0.17);
  const beak = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.08), new THREE.MeshStandardMaterial({ color: 0xe0a030, roughness: 0.6 }));
  beak.position.set(0, 0.18, 0.26);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 4), body.material);
  tail.rotation.x = -Math.PI / 2 - 0.5;
  tail.position.set(0, 0.1, -0.22);
  g.add(body, head, beak, tail);
  g.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
  return { g, head };
}

function rabbitModel() {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0x9a7a5a, roughness: 0.95 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), fur);
  body.scale.set(0.9, 0.85, 1.3);
  body.position.y = 0.12;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), fur);
  head.position.set(0, 0.2, 0.14);
  g.add(body, head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.12, 3, 6), fur);
    ear.position.set(s * 0.03, 0.33, 0.12);
    ear.rotation.z = s * 0.15;
    g.add(ear);
  }
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), new THREE.MeshStandardMaterial({ color: 0xf2eee6 }));
  tail.position.set(0, 0.14, -0.17);
  g.add(tail);
  g.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
  return g;
}

interface Duck { root: THREE.Group; head: THREE.Mesh; pos: THREE.Vector3; yaw: number; target: THREE.Vector3; timer: number; home: THREE.Vector3; flee: number }
interface Rabbit { root: THREE.Group; pos: THREE.Vector3; yaw: number; hop: number; timer: number; flee: number; target: THREE.Vector3 }

export class RiverLife {
  private ducks: Duck[] = [];
  private rabbits: Rabbit[] = [];
  private fish: THREE.Mesh;
  private jump: { t: number; from: THREE.Vector3; dir: THREE.Vector3 } | null = null;
  private jumpTimer = 4;
  private rnd = mulberry32(4242);
  private flocks: CrowFlock[] = [];
  private crowTimer = 0;
  private t = 0;

  constructor(private scene: THREE.Scene, private fx: FX) {
    // Ducks: small groups along the river and on the mere.
    const homes: [number, number][] = [[riverX(-80), -80], [riverX(40), 40], [riverX(160), 160], [riverX(290), 290], [1500, 175], [1480, 160]];
    homes.forEach(([x, z], k) => {
      for (let i = 0; i < 3 + (k % 2); i++) {
        const { g, head } = duckModel(i === 0);
        const home = new THREE.Vector3(x, 0, z);
        const pos = home.clone().add(new THREE.Vector3((this.rnd() - 0.5) * 4, 0, (this.rnd() - 0.5) * 8));
        g.visible = false;
        scene.add(g);
        this.ducks.push({ root: g, head, pos, yaw: this.rnd() * 6, target: pos.clone(), timer: 0, home, flee: 0 });
      }
    });
    this.fish = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6).scale(0.5, 0.9, 2.2), new THREE.MeshStandardMaterial({ color: 0xb8c8d0, metalness: 0.5, roughness: 0.3 }));
    this.fish.visible = false;
    scene.add(this.fish);
    // Crows on the far wheat fields (the quest flock is Old Wren's own field).
    for (const [x, z, hx, hz] of [[-48, 211, 30, 18], [46, 218, 36, 20], [145, 208, 30, 18]] as [number, number, number, number][]) {
      this.flocks.push(new CrowFlock(scene, new THREE.Vector3(x, heightAt(x, z), z), hx, hz));
    }
  }

  private waterAt(x: number, z: number) {
    const s = waterSurfaceAt(x, z);
    return s !== null && s - heightAt(x, z) > 0.3 ? s : null;
  }

  update(dt: number, player: THREE.Vector3, running: boolean, night: number) {
    this.t += dt;
    // ---- ducks ----
    for (const d of this.ducks) {
      const dist = d.pos.distanceTo(player);
      d.root.visible = dist < 120;
      if (!d.root.visible) continue;
      d.timer -= dt;
      if (dist < 6 && d.flee <= 0) {
        d.flee = 3;
        const away = d.pos.clone().sub(player).setY(0).normalize().multiplyScalar(10);
        d.target.copy(d.pos).add(away);
      }
      d.flee -= dt;
      if (d.timer <= 0 && d.flee <= 0) {
        d.timer = 3 + this.rnd() * 6;
        d.target.copy(d.home).add(new THREE.Vector3((this.rnd() - 0.5) * 10, 0, (this.rnd() - 0.5) * 24));
      }
      const to = d.target.clone().sub(d.pos).setY(0);
      const len = to.length();
      if (len > 0.3) {
        const sp = d.flee > 0 ? 2.2 : 0.5;
        const next = d.pos.clone().addScaledVector(to.normalize(), Math.min(len, sp * dt));
        if (this.waterAt(next.x, next.z) !== null) d.pos.copy(next);
        else d.target.copy(d.home);
        d.yaw = dampAngle(d.yaw, Math.atan2(to.x, to.z), 4, dt);
      }
      const surf = this.waterAt(d.pos.x, d.pos.z) ?? RIVER_LEVEL;
      d.root.position.set(d.pos.x, surf + Math.sin(this.t * 2 + d.home.x) * 0.02, d.pos.z);
      d.root.rotation.y = d.yaw;
      // Now and then a duck dips its head for weed.
      d.head.position.y = 0.19 - Math.max(0, Math.sin(this.t * 0.7 + d.home.z + d.pos.x)) ** 8 * 0.18;
    }
    // ---- fish leaping ----
    this.jumpTimer -= dt;
    if (!this.jump && this.jumpTimer <= 0) {
      this.jumpTimer = 3 + this.rnd() * 7;
      for (let k = 0; k < 6; k++) {
        const a = this.rnd() * Math.PI * 2, r = 8 + this.rnd() * 30;
        const x = player.x + Math.cos(a) * r, z = player.z + Math.sin(a) * r;
        const s = this.waterAt(x, z);
        if (s === null || s - heightAt(x, z) < 0.8) continue;
        const b = this.rnd() * Math.PI * 2;
        this.jump = { t: 0, from: new THREE.Vector3(x, s, z), dir: new THREE.Vector3(Math.cos(b), 0, Math.sin(b)) };
        this.fx.add.spawn({ pos: this.jump.from, spread: 0.3, count: 12, life: [0.3, 0.6], size: [0.08, 0.02], color: 0xe8f6ff, color2: 0x9fd0f0, gravity: 9, upBias: 1.4 });
        break;
      }
    }
    if (this.jump) {
      const j = this.jump;
      j.t += dt;
      const u = j.t / 0.7;
      this.fish.visible = u < 1;
      this.fish.position.copy(j.from).addScaledVector(j.dir, u * 1.4);
      this.fish.position.y = j.from.y + Math.sin(u * Math.PI) * 0.8;
      this.fish.rotation.set(-Math.cos(u * Math.PI) * 0.9, Math.atan2(j.dir.x, j.dir.z), 0);
      if (u >= 1) {
        this.fx.add.spawn({ pos: this.fish.position, spread: 0.3, count: 16, life: [0.3, 0.6], size: [0.08, 0.02], color: 0xe8f6ff, color2: 0x9fd0f0, gravity: 9, upBias: 1.4 });
        this.jump = null;
      }
    }
    // ---- rabbits (by day, in open meadow near you) ----
    const want = night > 0.6 ? 0 : 6;
    this.rabbits = this.rabbits.filter((r) => {
      const keep = r.pos.distanceTo(player) < 90;
      if (!keep) this.scene.remove(r.root);
      return keep;
    });
    if (this.rabbits.length < want && this.rnd() < dt * 0.8) {
      const a = this.rnd() * Math.PI * 2, rr = 30 + this.rnd() * 40;
      const x = player.x + Math.cos(a) * rr, z = player.z + Math.sin(a) * rr;
      const h = heightAt(x, z);
      if (Math.hypot(x, z) > TOWN_R + 20 && h > SEA_LEVEL + 1 && this.waterAt(x, z) === null && reliefAt(x, z) === RELIEF.open) {
        const root = rabbitModel();
        this.scene.add(root);
        this.rabbits.push({ root, pos: new THREE.Vector3(x, h, z), yaw: this.rnd() * 6, hop: 0, timer: 1, flee: 0, target: new THREE.Vector3(x, h, z) });
      }
    }
    for (const r of this.rabbits) {
      r.timer -= dt;
      const d = r.pos.distanceTo(player);
      if (d < 9 && r.flee <= 0) {
        r.flee = 2.5;
        r.target.copy(r.pos).add(r.pos.clone().sub(player).setY(0).normalize().multiplyScalar(18));
      }
      r.flee -= dt;
      if (r.timer <= 0 && r.flee <= 0) {
        r.timer = 1 + this.rnd() * 3;
        r.target.copy(r.pos).add(new THREE.Vector3((this.rnd() - 0.5) * 6, 0, (this.rnd() - 0.5) * 6));
      }
      const to = r.target.clone().sub(r.pos).setY(0);
      const len = to.length();
      if (len > 0.2) {
        r.hop += dt * (r.flee > 0 ? 9 : 5);
        r.pos.addScaledVector(to.normalize(), Math.min(len, (r.flee > 0 ? 5.5 : 1.2) * dt));
        r.yaw = dampAngle(r.yaw, Math.atan2(to.x, to.z), 8, dt);
      }
      r.pos.y = heightAt(r.pos.x, r.pos.z);
      r.root.position.copy(r.pos);
      r.root.position.y += len > 0.2 ? Math.abs(Math.sin(r.hop)) * 0.18 : 0;
      r.root.rotation.y = r.yaw;
    }
    // ---- crows on the far fields (land again a while after being scattered) ----
    this.crowTimer -= dt;
    if (this.crowTimer <= 0) {
      this.crowTimer = 20;
      if (night < 0.5) for (const f of this.flocks) if (f.perched < 3 && f.center.distanceTo(player) > 40) f.land(3 + Math.floor(this.rnd() * 3));
    }
    for (const f of this.flocks) f.update(dt, player, running);
  }

  setVisible(v: boolean) {
    for (const d of this.ducks) d.root.visible = v && d.root.visible;
    for (const r of this.rabbits) r.root.visible = v;
    if (!v) this.fish.visible = false;
  }
}
