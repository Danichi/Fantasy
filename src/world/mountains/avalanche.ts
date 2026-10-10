import * as THREE from 'three';
import { heightAt } from '../terrainHeight';
import { sfx } from '../../audio/sfx';
import { events } from '../../core/events';
import { AVALANCHE_SLOPES } from './mountainData';
import type { FX } from '../../fx/particles';
import type { Player } from '../../player/player';

// Avalanches (docs/design/mountains.md §5): on the marked slopes of the high
// road the snow hangs loaded above you. A loud fight, a shout or plain bad
// luck sets it off: a rumble and a cloud of snow high on the slope, then a
// sliding mass comes down across the road. Run sideways out of its path; if
// it catches you, you're buried (heavy damage, and you dig yourself out).

const WIDTH = 13; // half-width of the slide across its path
const SPEED = 20;
const WARN = 3.2; // seconds of rumble before it comes

export interface Slide {
  id: string;
  /** where it starts (uphill) and its downhill direction */
  from: THREE.Vector2;
  dir: THREE.Vector2;
  t: number;
  /** metres travelled down the slope */
  s: number;
  len: number;
  mesh: THREE.Group;
  hit: boolean;
  /** the player was in danger when it started (outrunning it counts) */
  threatened: boolean;
}

export class Avalanches {
  slides: Slide[] = [];
  /** slope id -> game seconds when it can slide again */
  private ready = new Map<string, number>();
  private clock = 0;
  private buriedT = 0;
  private noise = 0;
  onOutrun?: (id: string) => void;
  onBuried?: (id: string) => void;
  private geo = new THREE.IcosahedronGeometry(1, 1);
  private mat = new THREE.MeshStandardMaterial({ color: 0xf4f8ff, roughness: 1, flatShading: true });

  constructor(private scene: THREE.Scene, private fx: FX) {
    // A fight is loud: blows and spells near a slope wake it.
    events.on('enemyHit', () => (this.noise = Math.min(1, this.noise + 0.2)));
    events.on('spellCast', () => (this.noise = Math.min(1, this.noise + 0.35)));
  }

  /** Is the player buried (and digging out)? */
  get buried() {
    return this.buriedT > 0;
  }

  /** Set a slope off now (a shout, a fight, a test). */
  trigger(id: string, player: Player) {
    const s = AVALANCHE_SLOPES.find((a) => a.id === id);
    if (!s || this.slides.some((x) => x.id === id)) return null;
    const up = new THREE.Vector2(Math.sin(s.up), Math.cos(s.up));
    const from = new THREE.Vector2(s.x, s.z).addScaledVector(up, s.len);
    const dir = up.clone().negate();
    const mesh = new THREE.Group();
    for (let k = 0; k < 9; k++) {
      const b = new THREE.Mesh(this.geo, this.mat);
      b.position.set((k - 4) * 3, 0, (k % 3) * 1.5);
      b.scale.set(3.4, 2 + (k % 3) * 0.6, 3);
      b.castShadow = true;
      mesh.add(b);
    }
    mesh.visible = false;
    this.scene.add(mesh);
    const rel = new THREE.Vector2(player.pos.x - s.x, player.pos.z - s.z);
    const across = Math.abs(rel.x * dir.y - rel.y * dir.x);
    const slide: Slide = { id, from, dir, t: 0, s: 0, len: s.len * 2.2, mesh, hit: false, threatened: across < WIDTH + 25 && rel.length() < 70 };
    this.slides.push(slide);
    this.ready.set(id, this.clock + 240);
    sfx.rumble(WARN + 2, 0.9);
    return slide;
  }

  update(dt: number, player: Player) {
    this.clock += dt;
    this.noise = Math.max(0, this.noise - dt * 0.25);
    if (this.buriedT > 0) {
      // Buried: you can't move until you've dug out.
      this.buriedT -= dt;
      player.mods.moveSpeed *= 0.05;
      if (Math.random() < dt * 6) this.fx.alpha.spawn({ pos: player.pos.clone().setY(player.pos.y + 0.6), spread: 1.2, count: 3, life: [0.5, 1], size: [0.5, 1.2], color: 0xf4f8ff, alpha: 0.7, upBias: 0.6 });
    }
    // Walking a loaded slope: a loud fight, or bad luck, brings it down.
    for (const s of AVALANCHE_SLOPES) {
      const d = Math.hypot(player.pos.x - s.x, player.pos.z - s.z);
      if (d > 30 || (this.ready.get(s.id) ?? 0) > this.clock) continue;
      if (this.noise > 0.5 || Math.random() < dt * 0.02) this.trigger(s.id, player);
    }
    for (const sl of this.slides) {
      sl.t += dt;
      if (sl.t < WARN) {
        // The snow cloud breaking away high on the slope.
        if (Math.random() < dt * 14) {
          const p = sl.from.clone().addScaledVector(new THREE.Vector2(-sl.dir.y, sl.dir.x), (Math.random() - 0.5) * WIDTH * 2);
          this.fx.alpha.spawn({ pos: new THREE.Vector3(p.x, heightAt(p.x, p.y) + 2, p.y), spread: 3, count: 4, life: [1.5, 3], size: [2, 5], color: 0xf4f8ff, alpha: 0.6, upBias: 0.5, drag: 0.6 });
        }
        if (Math.random() < dt * 3) events.emit('bossSlam', { at: player.pos.clone() });
        continue;
      }
      sl.mesh.visible = true;
      sl.s += SPEED * dt;
      const c = sl.from.clone().addScaledVector(sl.dir, sl.s);
      sl.mesh.position.set(c.x, heightAt(c.x, c.y) + 0.8, c.y);
      sl.mesh.rotation.y = Math.atan2(sl.dir.x, sl.dir.y);
      if (Math.random() < dt * 30) this.fx.alpha.spawn({ pos: sl.mesh.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 20, 1, 0)), spread: 4, count: 3, life: [1, 2.2], size: [2, 4.5], color: 0xf4f8ff, alpha: 0.55, upBias: 0.7, drag: 0.8 });
      // Caught in it?
      if (!sl.hit && !player.dead) {
        const rel = new THREE.Vector2(player.pos.x - c.x, player.pos.z - c.y);
        const along = rel.dot(sl.dir), across = Math.abs(rel.x * sl.dir.y - rel.y * sl.dir.x);
        if (Math.abs(along) < 4 && across < WIDTH) {
          sl.hit = true;
          player.takeDamage(player.maxHp * 0.45);
          this.buriedT = 3;
          events.emit('bossSlam', { at: player.pos.clone() });
          this.onBuried?.(sl.id);
        }
      }
    }
    for (const sl of this.slides) {
      if (sl.s < sl.len) continue;
      if (!sl.hit && sl.threatened) this.onOutrun?.(sl.id);
      this.scene.remove(sl.mesh);
    }
    this.slides = this.slides.filter((sl) => sl.s < sl.len);
  }

  clear() {
    for (const sl of this.slides) this.scene.remove(sl.mesh);
    this.slides = [];
    this.ready.clear();
    this.buriedT = 0;
  }

  setVisible(v: boolean) {
    for (const sl of this.slides) sl.mesh.visible = v && sl.t >= WARN;
  }
}
