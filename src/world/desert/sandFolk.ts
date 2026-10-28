import * as THREE from 'three';
import { dampAngle } from '../../core/math';
import { heightAt } from '../terrainHeight';
import { Beastie, std } from '../../enemies/sandCreatures2';
import { sandSpray } from '../../enemies/sandCreatures';
import type { HitInfo } from '../../combat/targets';
import type { FX } from '../../fx/particles';
import type { Player } from '../../player/player';

// The sand-sea's folk: when the old sea under the Expanse dried, some of what
// lived in it learned to live in sand instead — and some of it learned to
// scavenge. Scrapshells are crab-folk who wear rusted hull plate as a second
// shell and fight with one great claw; dune anglers lie buried with only a
// glowing lure above the sand, and erupt when you come to look; sand urchins
// roll across the dunes and burst into a volley of spines.

const RUST = [0x8a4a2a, 0x7a5a3a, 0x6a6a60, 0x9a6a3a];

/** A crab-folk scavenger: hunched, two-legged, a hull-plate shell on its back and one great claw. */
export class Scrapshell extends Beastie {
  kind = 'scrapshell';
  name = 'Scrapshell Scavenger';
  private body = new THREE.Group();
  private claw = new THREE.Group();
  private small = new THREE.Group();
  private legs: THREE.Mesh[] = [];
  yaw = Math.random() * 6.28;
  private mode: 'idle' | 'chase' | 'snap' | 'guard' | 'back' = 'idle';
  private hitDone = false;
  private cool = 1;
  private wander = new THREE.Vector3();
  constructor(home: THREE.Vector3, scene: THREE.Scene, fx: FX, seed = Math.random()) {
    super(home, scene, fx);
    this.hp = this.maxHp = 170;
    this.radius = 0.7;
    this.halfHeight = 0.8;
    this.blood = 0x5a7a4a;
    this.lockable = true;
    const skin = std(0xb8642a, 0.55, 0.1), dark = std(0x5a2a10, 0.6), plate = std(RUST[Math.floor(seed * 4) % 4], 0.75, 0.55);
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), skin);
    torso.scale.set(1, 1.1, 0.85);
    torso.position.y = 1.15;
    // The hull-plate shell, bolted on.
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), plate);
    shell.rotation.x = -1.1;
    shell.position.set(0, 1.25, -0.22);
    shell.scale.set(1.05, 1, 0.8);
    for (let k = 0; k < 6; k++) {
      const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.04, 5, 4), std(0x4a4a44, 0.5, 0.8));
      const a = (k / 6) * Math.PI * 2;
      bolt.position.set(Math.cos(a) * 0.45, 1.3 + Math.sin(a) * 0.3, -0.62);
      this.body.add(bolt);
    }
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skin);
    head.scale.set(1.2, 0.8, 1);
    head.position.set(0, 1.6, 0.18);
    for (const s of [-1, 1]) {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.25, 5), dark);
      stalk.position.set(s * 0.09, 1.78, 0.25);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), std(0x101010, 0.2));
      eye.position.set(s * 0.09, 1.92, 0.25);
      this.body.add(stalk, eye);
    }
    // A rag of scavenger cloth round the waist.
    const rag = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.35, 10, 1, true), new THREE.MeshStandardMaterial({ color: [0x6a5a48, 0x7a1a10, 0x4a4a40][Math.floor(seed * 3) % 3], roughness: 1, side: THREE.DoubleSide }));
    rag.position.y = 0.78;
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.6, 4, 6), dark);
      leg.geometry.translate(0, -0.35, 0);
      leg.position.set(s * 0.2, 0.75, 0);
      this.legs.push(leg);
      this.body.add(leg);
    }
    // The great claw (right) and the picking claw (left).
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.7), skin);
    arm.position.z = 0.35;
    const pincer = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.6), skin);
    pincer.position.z = 0.9;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 4), dark);
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 1.3;
    this.claw.add(arm, pincer, tip);
    this.claw.position.set(0.45, 1.2, 0.1);
    const sArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.5), skin);
    sArm.position.z = 0.25;
    const sPin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.25), skin);
    sPin.position.z = 0.55;
    this.small.add(sArm, sPin);
    this.small.position.set(-0.4, 1.15, 0.1);
    this.body.add(torso, shell, head, rag, this.claw, this.small);
    this.body.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
    this.group.add(this.body);
    this.wander.copy(home);
  }
  protected absorb(h: HitInfo) {
    // Raising the great claw over the face turns blows; the shell on its back turns the rest.
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const into = h.dir.clone().setY(0).normalize().dot(fwd);
    if (h.source !== 'spell' && ((this.mode === 'guard' && into < -0.3) || into > 0.6)) {
      this.fx.sparks(this.center.clone().addScaledVector(fwd, into > 0 ? -0.5 : 0.6), fwd);
      return h.damage * 0.3;
    }
    if (this.mode !== 'snap' && Math.random() < 0.35) (this.mode = 'guard'), (this.st = 0);
    return h.damage;
  }
  update(dt: number, player: Player, sheltered: (p: THREE.Vector3) => boolean) {
    this.st += dt;
    this.cool -= dt;
    const g = heightAt(this.position.x, this.position.z);
    if (!this.alive) {
      this.body.rotation.x = Math.min(Math.PI / 2, this.deathT * 2);
      this.sinkAway(dt);
      return;
    }
    const to = new THREE.Vector3(player.pos.x - this.position.x, 0, player.pos.z - this.position.z);
    const d = to.length();
    let walk = 0;
    const aware = !player.dead && !sheltered(player.pos) && d < 22;
    switch (this.mode) {
      case 'idle': {
        if (aware) (this.mode = 'chase'), sandSpray(this.fx, this.position.clone().setY(g), 6, 0.5);
        const w = this.wander.clone().sub(this.position).setY(0);
        if (w.length() < 1 || this.st > 9) (this.wander.set(this.home.x + (Math.random() - 0.5) * 14, 0, this.home.z + (Math.random() - 0.5) * 14), (this.st = 0));
        else {
          w.normalize();
          this.position.addScaledVector(w, 0.9 * dt);
          this.yaw = dampAngle(this.yaw, Math.atan2(w.x, w.z), 3, dt);
          walk = 0.5;
        }
        break;
      }
      case 'chase':
        this.yaw = dampAngle(this.yaw, Math.atan2(to.x, to.z), 5, dt);
        if (d > 1.7) {
          this.position.x += (to.x / d) * 3.4 * dt;
          this.position.z += (to.z / d) * 3.4 * dt;
          walk = 1;
        }
        if (d < 2.3 && this.cool <= 0) (this.mode = 'snap'), (this.st = 0), (this.hitDone = false);
        if (d > 32 || player.dead) this.mode = 'back';
        break;
      case 'snap': {
        // The claw goes up and back, then slams shut where you were standing.
        const t = this.st;
        this.claw.rotation.x = t < 0.5 ? -1.1 * (t / 0.5) : Math.min(0.5, -1.1 + (t - 0.5) * 9);
        if (!this.hitDone && t > 0.58 && d < 2.6) {
          this.hitDone = true;
          player.receiveAttack({ damage: 22, from: this.position.clone(), at: player.center.clone(), parryable: true, poise: 38, onParried: () => ((this.stunned = true), (this.st = -0.8)) });
        }
        if (t > 1.2) {
          this.stunned = false;
          this.claw.rotation.x = 0;
          this.mode = 'chase';
          this.cool = 1.1 + Math.random() * 0.8;
        }
        break;
      }
      case 'guard':
        this.yaw = dampAngle(this.yaw, Math.atan2(to.x, to.z), 6, dt);
        this.claw.rotation.x = -0.6;
        this.claw.rotation.y = -0.6;
        if (this.st > 1.3) {
          this.claw.rotation.set(0, 0, 0);
          this.mode = 'chase';
        }
        break;
      case 'back': {
        const h = this.home.clone().sub(this.position).setY(0);
        if (h.length() < 2) this.mode = 'idle';
        else {
          h.normalize();
          this.position.addScaledVector(h, 2.2 * dt);
          this.yaw = dampAngle(this.yaw, Math.atan2(h.x, h.z), 3, dt);
          walk = 1;
        }
        if (aware && d < 12) this.mode = 'chase';
        break;
      }
    }
    this.legs.forEach((l, i) => (l.rotation.x = Math.sin(this.st * 9 + i * Math.PI) * 0.6 * walk));
    this.small.rotation.x = Math.sin(this.st * 3) * 0.2;
    this.position.y = g;
    this.group.position.copy(this.position).setY(g + Math.abs(Math.sin(this.st * 9)) * 0.05 * walk);
    this.group.rotation.y = this.yaw;
    this.center.set(this.position.x, g + 1.1, this.position.z);
  }
}

/** A dune angler: only its lure shows above the sand, glowing. Come close and the jaws come up. */
export class DuneAngler extends Beastie {
  kind = 'duneAngler';
  name = 'Dune Angler';
  private body = new THREE.Group();
  private jaw = new THREE.Group();
  private lure: THREE.Mesh;
  private lureMat: THREE.MeshStandardMaterial;
  private mode: 'lurk' | 'rise' | 'bite' | 'out' | 'sink' = 'lurk';
  private out = 0;
  yaw = Math.random() * 6.28;
  private hitDone = false;
  constructor(home: THREE.Vector3, scene: THREE.Scene, fx: FX) {
    super(home, scene, fx);
    this.hp = this.maxHp = 230;
    this.radius = 1.3;
    this.halfHeight = 0.7;
    this.blood = 0x3a2a5a;
    const hide = std(0x5a4a3a, 0.9), dark = std(0x2a1a14, 0.8), tooth = std(0xf2e8d0, 0.5);
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.2, 14, 10), hide);
    head.scale.set(1, 0.75, 1.2);
    head.position.y = 0.6;
    this.body.add(head);
    const lowJaw = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), dark);
    lowJaw.scale.set(1, 0.5, 1.15);
    this.jaw.add(lowJaw);
    for (let k = 0; k < 12; k++) {
      const a = -1.2 + (k / 11) * 2.4;
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.38, 4), tooth);
      t.position.set(Math.sin(a) * 1.0, 0.1, Math.cos(a) * 1.15);
      this.jaw.add(t);
      const u = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 4), tooth);
      u.rotation.x = Math.PI;
      u.position.set(Math.sin(a) * 1.0, 0.45, Math.cos(a) * 1.18);
      this.body.add(u);
    }
    this.jaw.position.y = 0.45;
    this.body.add(this.jaw);
    // The stalk and its lure: the only thing you see.
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 1.6, 5), dark);
    stalk.position.set(0, 1.8, 0.7);
    stalk.rotation.x = 0.5;
    this.lureMat = new THREE.MeshStandardMaterial({ color: 0xbfffe8, emissive: 0x6affc8, emissiveIntensity: 1.6, roughness: 0.2 });
    this.lure = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), this.lureMat);
    this.lure.position.set(0, 2.5, 1.15);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), std(0xd8e040, 0.2, 0, { emissive: 0x6a7010, emissiveIntensity: 0.5 }));
      eye.position.set(s * 0.6, 1.05, 0.75);
      this.body.add(eye);
    }
    this.body.add(stalk, this.lure);
    this.body.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
    this.group.add(this.body);
  }
  update(dt: number, player: Player, sheltered: (p: THREE.Vector3) => boolean) {
    this.st += dt;
    const g = heightAt(this.position.x, this.position.z);
    this.lureMat.emissiveIntensity = 1.3 + Math.sin(this.st * 3) * 0.4;
    if (!this.alive) {
      this.out = Math.max(0, this.out - dt * 0.5);
      this.sinkAway(dt);
      this.group.position.y = g - 2.4 + this.out * 2.4 - this.deathT * 0.4;
      return;
    }
    const to = new THREE.Vector3(player.pos.x - this.position.x, 0, player.pos.z - this.position.z);
    const d = to.length();
    switch (this.mode) {
      case 'lurk':
        this.out = Math.max(0, this.out - dt);
        this.lure.position.y = 2.5 + Math.sin(this.st * 1.4) * 0.1;
        if (!player.dead && d < 6.5 && !sheltered(player.pos)) {
          this.mode = 'rise';
          this.st = 0;
          this.yaw = Math.atan2(to.x, to.z);
          sandSpray(this.fx, this.position.clone().setY(g), 30, 1.4);
        }
        break;
      case 'rise':
        this.out = Math.min(1, this.st / 0.5);
        this.jaw.rotation.x = 0.8 * this.out;
        if (this.st > 0.5) (this.mode = 'bite'), (this.st = 0), (this.hitDone = false);
        break;
      case 'bite':
        // The jaws slam shut.
        this.jaw.rotation.x = Math.max(0, 0.8 - this.st * 6);
        if (!this.hitDone && this.st > 0.1) {
          this.hitDone = true;
          const front = this.position.clone().add(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(1.3));
          if (Math.hypot(player.pos.x - front.x, player.pos.z - front.z) < 2.3) player.receiveAttack({ damage: 34, from: this.position.clone(), at: player.center.clone(), parryable: false, poise: 60 });
        }
        if (this.st > 0.6) (this.mode = 'out'), (this.st = 0);
        break;
      case 'out':
        // Above the sand and slow: the moment to hit it.
        this.yaw = dampAngle(this.yaw, Math.atan2(to.x, to.z), 1.5, dt);
        this.jaw.rotation.x = 0.3 + Math.sin(this.st * 4) * 0.1;
        if (this.st > 3.2) (this.mode = d < 7 ? 'rise' : 'sink'), (this.st = 0);
        break;
      case 'sink':
        this.out = Math.max(0, 1 - this.st / 1.2);
        if (this.st > 1.2) (this.mode = 'lurk'), (this.st = 0);
        break;
    }
    this.lockable = this.out > 0.5;
    this.stunned = this.mode === 'out' && this.st < 1.5;
    this.position.y = g;
    this.group.position.set(this.position.x, g - 2.4 + this.out * 2.4, this.position.z);
    this.group.rotation.y = this.yaw;
    this.center.set(this.position.x, g - 1.8 + this.out * 2.4, this.position.z);
  }
}

interface Spine { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }

/** A sand urchin: a ball of spines that rolls at you across the dunes and bursts a volley of quills. */
export class SandUrchin extends Beastie {
  kind = 'sandUrchin';
  name = 'Sand Urchin';
  private ball = new THREE.Group();
  private spines: Spine[] = [];
  private spineGeo = new THREE.ConeGeometry(0.03, 0.4, 4);
  private spineMat = std(0x3a1a3a, 0.5);
  private cool = 2;
  private vel = new THREE.Vector3();
  constructor(home: THREE.Vector3, scene: THREE.Scene, fx: FX) {
    super(home, scene, fx);
    this.hp = this.maxHp = 80;
    this.radius = 0.7;
    this.halfHeight = 0.4;
    this.blood = 0x6a2a5a;
    this.lockable = true;
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), std(0x5a2a4a, 0.6));
    this.ball.add(core);
    const dirs = new THREE.IcosahedronGeometry(1, 1).getAttribute('position');
    for (let i = 0; i < dirs.count; i += 2) {
      const n = new THREE.Vector3().fromBufferAttribute(dirs, i).normalize();
      const sp = new THREE.Mesh(this.spineGeo, this.spineMat);
      sp.position.copy(n).multiplyScalar(0.55);
      sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      this.ball.add(sp);
    }
    this.ball.position.y = 0.5;
    this.ball.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
    this.group.add(this.ball);
  }
  update(dt: number, player: Player, sheltered: (p: THREE.Vector3) => boolean) {
    this.st += dt;
    this.cool -= dt;
    this.updateSpines(dt, player);
    if (!this.alive) {
      this.sinkAway(dt);
      return;
    }
    const to = new THREE.Vector3(player.pos.x - this.position.x, 0, player.pos.z - this.position.z);
    const d = to.length();
    const hunt = !player.dead && !sheltered(player.pos) && d < 28;
    // Roll toward you, stopping at throwing range; drift home otherwise.
    const want = hunt ? (d > 9 ? to.normalize().multiplyScalar(4.2) : new THREE.Vector3()) : this.home.clone().sub(this.position).setY(0).clampLength(0, 1.5);
    this.vel.lerp(want, Math.min(1, dt * 2));
    this.position.addScaledVector(this.vel, dt);
    const g = heightAt(this.position.x, this.position.z);
    this.position.y = g;
    const sp = this.vel.length();
    if (sp > 0.05) {
      const axis = new THREE.Vector3(this.vel.z, 0, -this.vel.x).normalize();
      this.ball.rotateOnWorldAxis(axis, (sp * dt) / 0.6);
    }
    if (hunt && d < 14 && this.cool <= 0) {
      this.cool = 2.6 + Math.random();
      // Seven quills fanned at you.
      for (let k = 0; k < 7; k++) {
        const aim = player.center.clone().sub(this.center).normalize();
        aim.applyAxisAngle(new THREE.Vector3(0, 1, 0), (k - 3) * 0.09).add(new THREE.Vector3(0, 0.05 + Math.random() * 0.05, 0));
        const m = new THREE.Mesh(this.spineGeo, this.spineMat);
        m.position.copy(this.center);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), aim.clone().normalize());
        this.scene.add(m);
        this.spines.push({ mesh: m, vel: aim.multiplyScalar(19), life: 1.6 });
      }
      sandSpray(this.fx, this.position.clone(), 6, 0.5);
    }
    this.group.position.copy(this.position);
    this.center.set(this.position.x, g + 0.5, this.position.z);
  }
  private updateSpines(dt: number, player: Player) {
    for (const s of this.spines) {
      s.life -= dt;
      s.vel.y -= 4 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      if (!player.dead && s.mesh.position.distanceTo(player.center) < 0.8) {
        player.receiveAttack({ damage: 7, from: s.mesh.position.clone().sub(s.vel.clone().normalize()), at: s.mesh.position.clone(), parryable: false, poise: 8 });
        s.life = 0;
      }
      if (s.mesh.position.y < heightAt(s.mesh.position.x, s.mesh.position.z)) s.life = 0;
    }
    for (const s of this.spines) if (s.life <= 0) this.scene.remove(s.mesh);
    this.spines = this.spines.filter((s) => s.life > 0);
  }
  dispose() {
    for (const s of this.spines) this.scene.remove(s.mesh);
    this.spines = [];
    super.dispose();
  }
}
