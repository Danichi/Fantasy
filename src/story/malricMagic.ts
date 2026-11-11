import * as THREE from 'three';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';
import { heightAt } from '../world/terrainHeight';

// Ser Malric Dane's magic: twenty years of the Iron Below's favour. Used in
// the fight outside the crypt, which you are not meant to win. Each spell is
// telegraphed (a sigil on the ground first) and looks the part:
//
//   lift    gravity takes you off your feet, holds you in the air, and slams
//           you back into the ground
//   vines   black iron thorns burst out of the earth and hold you down
//   pull    a well of weight drags you across the ground to him
//   lances  a line of iron spikes runs out of the ground at you
//
// The player is held through `player.bound` / `player.boundAt` (no moving or
// acting; `boundAt` places them, for the lift).

type Spell = 'lift' | 'vines' | 'pull' | 'lances';

interface Running {
  kind: Spell;
  t: number;
  at: THREE.Vector3;
  dir?: THREE.Vector3;
  hit?: number;
  objs: THREE.Object3D[];
}

const VIOLET = 0x8a4aff;
const IRON = 0x15121a;

export class IronMagic {
  private run: Running | null = null;
  private sigil: THREE.Mesh;
  private sigilMat: THREE.MeshBasicMaterial;
  private group = new THREE.Group();
  private ironMat = new THREE.MeshStandardMaterial({ color: IRON, roughness: 0.55, metalness: 0.7, emissive: 0x2a0a4a, emissiveIntensity: 0.6 });
  private thornMat = new THREE.MeshStandardMaterial({ color: 0x1a1420, roughness: 0.8, metalness: 0.3, emissive: 0x3a0a5a, emissiveIntensity: 0.5 });
  /** spells cast so far (the fight ends after enough of them) */
  casts = 0;

  constructor(
    private scene: THREE.Scene,
    private fx: FX,
    private hooks: { shake(n: number): void; say(line: string): void; damage(player: Player, n: number, from: THREE.Vector3, knock?: number): void },
  ) {
    const g = new THREE.RingGeometry(0.2, 1, 48, 1);
    g.rotateX(-Math.PI / 2);
    this.sigilMat = new THREE.MeshBasicMaterial({ color: VIOLET, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.sigil = new THREE.Mesh(g, this.sigilMat);
    this.sigil.visible = false;
    this.group.add(this.sigil);
    scene.add(this.group);
  }

  get busy() {
    return !!this.run;
  }

  /** Begin a spell at the player (`from`: where he stands). */
  cast(kind: Spell, player: Player, from: THREE.Vector3) {
    if (this.run) return;
    this.casts++;
    const at = player.pos.clone();
    const r: Running = { kind, t: 0, at, objs: [] };
    if (kind === 'lances') r.dir = at.clone().sub(from).setY(0).normalize();
    if (kind === 'lances') r.at = from.clone();
    this.run = r;
    this.showSigil(kind === 'lances' ? from : at, kind === 'vines' ? 2.6 : kind === 'pull' ? 3.2 : 2.2);
    const words: Record<Spell, string[]> = {
      lift: ['Up you come.', 'Gravity is a habit. I can break habits.'],
      vines: ['Stay.', 'The Iron Below grows things too.'],
      pull: ['Come here.', 'You can\'t run from weight.'],
      lances: ['Mind your feet.', 'Iron remembers where you stood.'],
    };
    if (Math.random() < 0.7) this.hooks.say(words[kind][Math.floor(Math.random() * words[kind].length)]);
  }

  /** Per frame. `self`: where he stands. */
  update(dt: number, player: Player, self: THREE.Vector3) {
    const r = this.run;
    this.sigilMat.opacity = Math.max(0, this.sigilMat.opacity - dt * (r ? 0 : 2));
    if (!r) {
      if (this.sigilMat.opacity <= 0) this.sigil.visible = false;
      return;
    }
    r.t += dt;
    this.sigil.rotation.y += dt * 2.4;
    if (r.kind === 'lift') this.lift(r, dt, player);
    else if (r.kind === 'vines') this.vines(r, dt, player);
    else if (r.kind === 'pull') this.pull(r, dt, player, self);
    else this.lances(r, dt, player);
  }

  private showSigil(at: THREE.Vector3, size: number) {
    this.sigil.visible = true;
    this.sigil.position.set(at.x, heightAt(at.x, at.z) + 0.06, at.z);
    this.sigil.scale.setScalar(size);
    this.sigilMat.opacity = 0.85;
  }

  private finish() {
    const r = this.run!;
    for (const o of r.objs) {
      this.group.remove(o);
      o.traverse((x) => x instanceof THREE.Mesh && x.geometry.dispose());
    }
    this.run = null;
  }

  // ---- lift: up into the air, held, then slammed down ---------------------------------------
  private lift(r: Running, dt: number, player: Player) {
    const T0 = 0.65, UP = 1.1, HOLD = 0.7, DOWN = 0.16;
    const ground = heightAt(r.at.x, r.at.z);
    if (r.t < T0) {
      // the ground lets go: grit lifts off it
      if (Math.random() < 0.8) this.fx.add.spawn({ pos: r.at.clone().setY(ground + 0.1), vel: new THREE.Vector3(0, 3, 0), spread: 2, count: 3, life: [0.4, 0.9], size: [0.12, 0.03], color: 0x6a5a7a, color2: 0x1a1020, gravity: -3 });
      return;
    }
    // Caught: once the sigil has fired, you're in it wherever you'd stepped.
    if (r.hit === undefined) {
      const d = Math.hypot(player.pos.x - r.at.x, player.pos.z - r.at.z);
      if (d > 2.6) return void this.finish();
      r.hit = 0;
      r.at.set(player.pos.x, ground, player.pos.z);
      this.hooks.shake(0.15);
    }
    const t = r.t - T0;
    let h: number;
    if (t < UP) h = 5.2 * (1 - Math.pow(1 - t / UP, 3));
    else if (t < UP + HOLD) h = 5.2 + Math.sin((t - UP) * 9) * 0.08;
    else h = 5.2 * Math.max(0, 1 - Math.pow((t - UP - HOLD) / DOWN, 2));
    player.bound = Math.max(player.bound, 0.3);
    player.boundAt = new THREE.Vector3(r.at.x, ground + h, r.at.z);
    // debris circling you as you rise
    if (t < UP + HOLD && Math.random() < 0.9) {
      const a = Math.random() * Math.PI * 2;
      this.fx.add.spawn({ pos: new THREE.Vector3(r.at.x + Math.cos(a) * 1.3, ground + h * Math.random() + 0.5, r.at.z + Math.sin(a) * 1.3), vel: new THREE.Vector3(-Math.sin(a) * 3, 1, Math.cos(a) * 3), spread: 0.2, count: 2, life: [0.3, 0.7], size: [0.16, 0.04], color: 0xa070ff, color2: 0x1a0030 });
    }
    if (t >= UP + HOLD + DOWN && r.hit === 0) {
      r.hit = 1;
      player.boundAt = null;
      player.bound = 0.9; // winded on the ground
      this.hooks.shake(0.75);
      this.hooks.damage(player, player.maxHp * 0.3, r.at.clone().add(new THREE.Vector3(0.01, 0, 0)));
      const p = r.at.clone().setY(ground + 0.2);
      this.fx.add.spawn({ pos: p, spread: 3.5, count: 90, life: [0.4, 1.1], size: [0.3, 0.06], color: 0x7a6a5a, color2: 0x2a2018, upBias: 0.6, drag: 2.5 });
      this.fx.add.spawn({ pos: p, spread: 2.2, count: 50, life: [0.3, 0.7], size: [0.25, 0.05], color: 0xb080ff, color2: 0x200030, upBias: 0.3 });
      // a cracked crater ring where you landed
      const crater = new THREE.Mesh(new THREE.RingGeometry(0.4, 2.4, 24, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0a0608, transparent: true, opacity: 0.75, depthWrite: false }));
      crater.position.set(r.at.x, ground + 0.05, r.at.z);
      this.group.add(crater);
      r.objs.push(crater);
    }
    if (t > UP + HOLD + DOWN + 1.4) this.finish();
  }

  // ---- vines: thorns burst up and hold you ---------------------------------------------------
  private vines(r: Running, _dt: number, player: Player) {
    const T0 = 0.6, GROW = 0.35, HOLD = 2.6;
    if (r.t < T0) return;
    if (r.hit === undefined) {
      r.hit = 0;
      const d = Math.hypot(player.pos.x - r.at.x, player.pos.z - r.at.z);
      const caught = d < 2.8;
      if (caught) r.at.set(player.pos.x, 0, player.pos.z);
      // Seven thorned vines from the ground, curling up and in over you.
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + Math.random() * 0.4;
        const R = 1.1 + Math.random() * 0.5;
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 6; k++) {
          const s = k / 6;
          const rr = R * (1 - s * 0.85);
          const aa = a + s * 1.4;
          pts.push(new THREE.Vector3(Math.cos(aa) * rr, -0.4 + s * (1.6 + Math.random() * 0.3), Math.sin(aa) * rr));
        }
        const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.09, 6, false);
        const m = new THREE.Mesh(geo, this.thornMat);
        m.position.set(r.at.x, heightAt(r.at.x, r.at.z), r.at.z);
        geo.setDrawRange(0, 0);
        // thorns along it
        for (let k = 1; k < 6; k++) {
          const p = new THREE.CatmullRomCurve3(pts).getPoint(k / 6);
          const th = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.28, 4), this.ironMat);
          th.position.copy(p);
          th.lookAt(p.clone().multiplyScalar(2).setY(p.y + 0.3));
          th.rotateX(Math.PI / 2);
          th.scale.setScalar(0.01);
          m.add(th);
        }
        this.group.add(m);
        r.objs.push(m);
      }
      this.hooks.shake(0.3);
      this.fx.add.spawn({ pos: r.at.clone().setY(heightAt(r.at.x, r.at.z) + 0.2), spread: 2, count: 50, life: [0.4, 0.9], size: [0.22, 0.05], color: 0x5a4a3a, color2: 0x1a0a20, upBias: 1 });
      if (caught) {
        player.bound = HOLD;
        this.hooks.damage(player, player.maxHp * 0.08, r.at.clone().add(new THREE.Vector3(0.01, 0, 0)));
      }
    }
    const k = Math.min(1, (r.t - T0) / GROW);
    const sink = r.t > T0 + HOLD ? Math.min(1, (r.t - T0 - HOLD) / 0.5) : 0;
    for (const o of r.objs) {
      const m = o as THREE.Mesh<THREE.TubeGeometry>;
      const n = m.geometry.index!.count;
      m.geometry.setDrawRange(0, Math.floor(n * k));
      m.position.y = heightAt(r.at.x, r.at.z) - sink * 1.8;
      for (const th of m.children) th.scale.setScalar(Math.max(0.01, k));
    }
    // while held: they tighten (sparks of violet where thorn meets you)
    if (k >= 1 && !sink && Math.random() < 0.3) this.fx.add.spawn({ pos: player.pos.clone().setY(player.pos.y + 0.6 + Math.random()), spread: 0.4, count: 2, life: [0.2, 0.4], size: [0.12, 0.03], color: 0xc090ff, color2: 0x300040 });
    if (r.t > T0 + HOLD + 0.6) this.finish();
  }

  // ---- pull: a well of weight drags you in ---------------------------------------------------
  private pull(r: Running, dt: number, player: Player, self: THREE.Vector3) {
    const T0 = 0.55, DUR = 1.1;
    if (r.t < T0) return;
    if (r.hit === undefined) {
      r.hit = 0;
      if (Math.hypot(player.pos.x - r.at.x, player.pos.z - r.at.z) > 3.4) return void this.finish();
      this.hooks.shake(0.2);
    }
    const t = r.t - T0;
    if (t < DUR) {
      const to = self.clone().sub(player.pos).setY(0);
      const d = to.length();
      if (d > 1.6) {
        const step = Math.min(d - 1.6, dt * (6 + t * 10));
        const p = player.pos.clone().add(to.normalize().multiplyScalar(step));
        p.y = heightAt(p.x, p.z);
        player.bound = Math.max(player.bound, 0.25);
        player.boundAt = p;
      }
      if (Math.random() < 0.9) this.fx.add.spawn({ pos: player.pos.clone().setY(player.pos.y + 0.3), vel: to.clone().multiplyScalar(4), spread: 0.6, count: 3, life: [0.2, 0.4], size: [0.15, 0.03], color: 0x9060ff, color2: 0x10001a });
    } else if (r.hit === 0) {
      r.hit = 1;
      player.boundAt = null;
      // dropped at his feet, and a wave of weight knocks you flat
      this.hooks.shake(0.45);
      this.hooks.damage(player, player.maxHp * 0.14, self.clone(), 8);
      this.fx.add.spawn({ pos: self.clone().setY(self.y + 0.3), spread: 4, count: 70, life: [0.3, 0.8], size: [0.28, 0.05], color: 0xa060ff, color2: 0x200030, upBias: 0.3, drag: 2 });
    }
    if (t > DUR + 0.6) this.finish();
  }

  // ---- lances: iron spikes run out of the ground toward you ------------------------------------
  private lances(r: Running, _dt: number, player: Player) {
    const T0 = 0.5, EVERY = 0.07, N = 14;
    if (r.t < T0) return;
    const n = Math.min(N, Math.floor((r.t - T0) / EVERY) + 1);
    while (r.objs.length < n) {
      const i = r.objs.length;
      const p = r.at.clone().add(r.dir!.clone().multiplyScalar(1.6 + i * 0.9));
      p.x += (Math.random() - 0.5) * 0.5;
      p.z += (Math.random() - 0.5) * 0.5;
      p.y = heightAt(p.x, p.z);
      const h = 1.6 + Math.random() * 1.2;
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.28, h, 5), this.ironMat);
      m.geometry.translate(0, h / 2, 0);
      m.position.copy(p).setY(p.y - h);
      m.rotation.set((Math.random() - 0.5) * 0.4, Math.random() * 3, (Math.random() - 0.5) * 0.4);
      m.userData = { y0: p.y, h, t: 0 };
      this.group.add(m);
      r.objs.push(m);
      this.fx.add.spawn({ pos: p.clone().setY(p.y + 0.2), spread: 0.6, count: 10, life: [0.3, 0.6], size: [0.18, 0.04], color: 0x6a5a4a, color2: 0x200030, upBias: 1.2 });
      if (Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < 1.1 && r.hit === undefined) {
        r.hit = 1;
        this.hooks.damage(player, player.maxHp * 0.16, p.clone().sub(r.dir!), 6);
        this.hooks.shake(0.3);
      }
    }
    for (const o of r.objs) {
      const u = o.userData as { y0: number; h: number; t: number };
      u.t += _dt;
      const up = Math.min(1, u.t / 0.12);
      const down = r.t > T0 + N * EVERY + 1.2 ? Math.min(1, (r.t - T0 - N * EVERY - 1.2) / 0.4) : 0;
      o.position.y = u.y0 - u.h * (1 - up) - u.h * down;
    }
    if (r.t > T0 + N * EVERY + 1.7) this.finish();
  }

  dispose() {
    if (this.run) this.finish();
    this.scene.remove(this.group);
    this.sigil.geometry.dispose();
    this.sigilMat.dispose();
    this.ironMat.dispose();
    this.thornMat.dispose();
  }
}
