import * as THREE from 'three';
import { Creature, type CreatureBase } from '../creatures/creature';
import { StagVisual, type StagPose } from '../creatures/stag/visual';
import { creatureView } from '../creatures/view';
import { playerFoe } from '../creatures/foes';
import { dampAngle } from '../core/math';
import { events } from '../core/events';
import { ignoresPlayer } from '../origins/stealth';
import { sfx } from '../audio/sfx';
import { heightAt } from '../world/terrainHeight';
import type { HitInfo } from '../combat/targets';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';
import type { BossBody, BossDef } from './fieldBosses';

// The White Stag of the deep woods: not a fight, a hunt. It shows itself
// only at dawn and dusk, and only rarely. It grazes, lifts its head at a
// sound, and bolts: it hears a running man or a horse from far off, a walker
// from closer, and someone creeping along behind a raised guard only when
// they are nearly on it. Where it goes it leaves hoofprints that shine
// faintly for a while: follow them.
//
// Keep after it and it tires. Run it to the end of its strength and it turns
// at bay, crown lowered: it paws the ground (the tell) and charges. Stand your
// ground through two charges (block, parry or step aside) and it yields: it
// bows its head and lets you near. Lay your hand on it and it leaves you the
// antler it has shed, and a blessing, and is gone into the mist.
//
// It can't be killed. Strike it and it only runs, or turns on you.

const BASE: CreatureBase = { name: 'The White Stag', hp: 100, damage: 18, radius: 0.42, halfHeight: 0.5 };

type Mode = 'graze' | 'wander' | 'alert' | 'bolt' | 'atBay' | 'paw' | 'charge' | 'stumble' | 'yield' | 'leave';

/** Its shining hoofprints: they fade over a couple of minutes. */
class Tracks {
  readonly mesh: THREE.InstancedMesh;
  private age: Float32Array;
  private n = 0;
  private readonly max = 160;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  constructor(scene: THREE.Scene) {
    const mat = new THREE.MeshBasicMaterial({ map: printTex(), color: 0xd8e6ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4 });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.2).rotateX(-Math.PI / 2), mat, this.max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.age = new Float32Array(this.max).fill(999);
    scene.add(this.mesh);
  }
  /** Prints laid, most recent last (tests read this). */
  get laid() {
    return this.n;
  }
  add(at: THREE.Vector3, yaw: number) {
    const i = this.n++ % this.max;
    this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.m.compose(new THREE.Vector3(at.x, heightAt(at.x, at.z) + 0.04, at.z), this.q, new THREE.Vector3(1, 1, 1));
    this.mesh.setMatrixAt(i, this.m);
    this.age[i] = 0;
    this.mesh.count = Math.min(this.max, this.n);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  update(dt: number) {
    const c = this.mesh.instanceColor!;
    for (let i = 0; i < this.mesh.count; i++) {
      this.age[i] += dt;
      const a = Math.max(0, 1 - this.age[i] / 150);
      c.setXYZ(i, a, a, a);
    }
    c.needsUpdate = true;
  }
  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
  }
}

let printT: THREE.Texture | null = null;
function printTex() {
  if (printT) return printT;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 80;
  const g = c.getContext('2d')!;
  // A cloven hoof: two teardrop halves.
  for (const s of [-1, 1]) {
    const gr = g.createRadialGradient(32 + s * 9, 46, 2, 32 + s * 9, 42, 26);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(32 + s * 9, 42, 9, 24, s * 0.12, 0, Math.PI * 2);
    g.fill();
  }
  printT = new THREE.CanvasTexture(c);
  return printT;
}

export class WhiteStag extends Creature implements BossBody {
  readonly look: StagVisual;
  readonly tracks: Tracks;
  mode: Mode = 'graze';
  phase = 1;
  /** charges withstood while at bay (two and it yields) */
  withstood = 0;
  private modeT = 0;
  private modeLen = 4;
  private wander: THREE.Vector3 | null = null;
  private stride = 0;
  private foot = 1;
  private hit = false;
  private aware = 0;
  private yieldIdle = 0;
  private fade = 1;
  readonly den: THREE.Vector3;
  /** claimed: the hunt is over */
  claimed = false;

  constructor(at: THREE.Vector3, level: number, scene: THREE.Scene, fx: FX, den?: THREE.Vector3) {
    super('whiteStag', BASE, level, at, scene, fx);
    this.hp = this.maxHp = 100; // its strength, not its life
    this.lockable = false;
    this.den = (den ?? at).clone();
    this.look = new StagVisual({ scale: 1.08 });
    this.look.root.position.copy(at);
    scene.add(this.look.root);
    this.look.gait.reset(this.look.root, this.groundAt);
    this.tracks = new Tracks(scene);
  }

  get engaged() {
    return this.alive && (this.mode === 'atBay' || this.mode === 'paw' || this.mode === 'charge' || this.mode === 'stumble' || this.mode === 'yield' || this.mode === 'bolt');
  }

  leash() {
    // You lost it in the trees: it settles down and grazes, its strength coming back.
    if (this.mode === 'bolt' || this.mode === 'alert') this.setMode('graze', 6);
  }

  private setMode(m: Mode, len = 1) {
    this.mode = m;
    this.modeT = 0;
    this.modeLen = len;
  }
  private get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
  private volume() {
    const c = creatureView.camera;
    return c ? Math.max(0.04, 0.5 * (1 - c.distanceTo(this.position) / 60)) : 0.2;
  }

  /** How far off it hears you, by how you move. */
  private hearing(player: Player) {
    if (player.mounted) return 55;
    if (player.sprinting) return 45;
    if (player.blocking) return 12;
    return 26;
  }

  /** Close enough, at bay and yielded: you may lay your hand on it. */
  interact() {
    if (this.mode !== 'yield' || this.claimed) return null;
    return { at: this.position, label: 'Lay your hand on the White Stag', act: () => this.claim() };
  }

  private claim() {
    this.claimed = true;
    this.setMode('leave', 3.5);
    sfx.snort?.(this.volume());
    events.emit('enemyDied', { at: this.center.clone(), enemyId: this.id, kind: this.kind, level: this.level });
  }

  takeHit(h: HitInfo) {
    // It can't be hurt. Struck, it turns on you if cornered, and runs if not.
    if (!this.alive || this.claimed) return;
    this.vel.addScaledVector(h.dir, 2);
    if (this.mode === 'atBay' || this.mode === 'yield') this.setMode('paw', 0.5);
    else if (this.mode !== 'charge' && this.mode !== 'paw') this.setMode('bolt', 4);
  }

  protected think(dt: number, player: Player) {
    this.modeT += dt;
    this.wish.set(0, 0, 0);
    this.accel = 6;
    this.stunned = this.mode === 'stumble';
    const canHear = !player.dead && !ignoresPlayer(this);
    const to = player.pos.clone().sub(this.position).setY(0);
    const dist = to.length();
    const face = Math.atan2(to.x, to.z);
    const away = Math.atan2(-to.x, -to.z);
    const chased = canHear && dist < 32;
    const strength = this.hp / this.maxHp;
    // Worn down by stages (it only goes back to fresh once it has its wind again).
    const stage = this.mode === 'atBay' || this.mode === 'paw' || this.mode === 'charge' || this.mode === 'stumble' || this.mode === 'yield' ? 3 : strength < 0.5 ? 2 : 1;
    if (stage > this.phase) this.phase = stage;
    if (this.phase === 2 && strength > 0.8) this.phase = 1;

    // Its strength: spent running from you, slowly back when left alone.
    if (this.mode === 'bolt') this.hp = Math.max(0, this.hp - dt * (chased ? 10 : 4));
    else if (!chased && this.mode !== 'yield' && this.mode !== 'leave' && this.phase < 3) this.hp = Math.min(this.maxHp, this.hp + dt * 0.4);

    // Did it hear you?
    if (canHear && (this.mode === 'graze' || this.mode === 'wander')) {
      const ear = this.hearing(player);
      if (dist < ear) {
        this.aware += dt * (1 + (ear - dist) / 6);
        if (this.aware > 0.6) this.setMode('alert', 1.2);
      } else this.aware = Math.max(0, this.aware - dt);
    }

    switch (this.mode) {
      case 'graze':
        if (this.modeT > this.modeLen) this.setMode('wander', 4 + Math.random() * 4);
        break;
      case 'wander': {
        if (!this.wander || this.wander.distanceTo(this.position) < 1.5 || this.bumped) {
          const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 40;
          this.wander = this.den.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
        }
        const d = this.wander.clone().sub(this.position).setY(0);
        this.yaw = dampAngle(this.yaw, Math.atan2(d.x, d.z), 2, dt);
        this.wish.copy(this.forward).multiplyScalar(1.2);
        if (this.modeT > this.modeLen) this.setMode('graze', 5 + Math.random() * 6);
        break;
      }
      case 'alert':
        // Head up, ears turned to you: a moment, then it's gone.
        this.yaw = dampAngle(this.yaw, face, 3, dt);
        if (this.modeT > this.modeLen || (canHear && dist < this.hearing(player) * 0.6)) {
          this.setMode('bolt', 3 + Math.random() * 2);
          sfx.snort?.(this.volume() + 0.1);
        } else if (!canHear || dist > this.hearing(player) * 1.3) this.setMode('graze', 4);
        break;
      case 'bolt': {
        // Away from you, bounding; slower as it tires. Run out of strength: at bay.
        const speed = strength < 0.35 ? 7 : 11;
        const dodge = Math.sin(this.modeT * 1.3 + this.id) * 0.5;
        this.yaw = dampAngle(this.yaw, away + dodge, 4, dt);
        // Keep to its woods: turn back toward its ground when it strays.
        const home = this.den.clone().sub(this.position).setY(0);
        if (home.length() > 140) this.yaw = dampAngle(this.yaw, Math.atan2(home.x, home.z), 3, dt);
        this.accel = 5;
        this.wish.copy(this.forward).multiplyScalar(speed);
        if (this.hp <= 0) {
          this.setMode('atBay', 99);
          sfx.snort?.(this.volume() + 0.2);
        } else if (this.modeT > this.modeLen && (!chased || dist > 50)) this.setMode('alert', 2);
        else if (this.modeT > this.modeLen) this.modeT = 0;
        break;
      }
      case 'atBay':
        // Turned to face you, crown low. Come too close and it charges.
        this.yaw = dampAngle(this.yaw, face, 4, dt);
        if (canHear && dist < 9 && this.modeT > 0.8) this.setMode('paw', 0.9);
        // Left alone long enough, it gets its wind back.
        if (!chased && this.modeT > 20) {
          this.hp = this.maxHp * 0.5;
          this.phase = 2;
          this.setMode('graze', 4);
        }
        break;
      case 'paw':
        this.yaw = dampAngle(this.yaw, face, 6, dt);
        if (this.modeT > this.modeLen) {
          this.setMode('charge', 1.3);
          this.hit = false;
          sfx.snort?.(this.volume() + 0.25);
        }
        break;
      case 'charge': {
        this.accel = 12;
        if (this.modeT < 0.15) this.yaw = dampAngle(this.yaw, face, 8, dt);
        this.wish.copy(this.forward).multiplyScalar(10);
        if (!this.hit && dist < 1.9 && to.clone().normalize().dot(this.forward) > 0.1) {
          this.hit = true;
          const r = playerFoe(player).strike({ damage: this.damage, from: this.position.clone(), parryable: true, poise: 80, knock: 7 });
          if (r !== 'hit') this.withstood++;
          this.setMode('stumble', 1);
        } else if (this.modeT > this.modeLen) {
          // You stepped out of its way.
          this.withstood++;
          this.setMode('stumble', 0.8);
        }
        break;
      }
      case 'stumble':
        if (this.modeT > this.modeLen) {
          if (this.withstood >= 2) {
            this.setMode('yield', 999);
            this.yieldIdle = 0;
          } else this.setMode('atBay', 99);
        }
        break;
      case 'yield':
        // Head bowed; it will let you near. Walk away and it recovers in time.
        this.yaw = dampAngle(this.yaw, face, 1.5, dt);
        this.yieldIdle = dist > 30 ? this.yieldIdle + dt : 0;
        if (this.yieldIdle > 60) {
          this.withstood = 0;
          this.phase = 2;
          this.hp = this.maxHp * 0.6;
          this.setMode('graze', 4);
        }
        break;
      case 'leave': {
        // It turns and walks into the trees, fading.
        this.yaw = dampAngle(this.yaw, away, 1.5, dt);
        this.wish.copy(this.forward).multiplyScalar(1.4);
        this.fade = Math.max(0, 1 - this.modeT / this.modeLen);
        if (this.modeT > this.modeLen) {
          this.alive = false;
          this.deadT = this.corpseTime;
        }
        break;
      }
    }
  }

  protected onHurt() {}

  protected animate(dt: number) {
    const L = this.look;
    L.root.position.copy(this.position);
    L.root.rotation.y = this.yaw;
    const m = this.mode;
    const pose: StagPose = m === 'graze' ? 'graze' : m === 'alert' ? 'alert' : m === 'atBay' ? 'atBay' : m === 'paw' ? 'paw' : m === 'charge' ? 'charge' : m === 'stumble' ? 'stumble' : m === 'yield' ? 'yield' : 'idle';
    L.setPose(pose);
    L.lookAt = m === 'alert' ? creatureView.player?.center ?? null : null;
    const cam = creatureView.camera;
    L.lod(cam ? cam.distanceTo(this.position) : 10, creatureView.fur);
    L.update(dt, this.vel, this.groundAt);
    if (this.fade < 1) L.setOpacity(this.fade);
    // Hoofprints, left and right, every stride.
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.stride += sp * dt;
    if (this.stride > 1.3 && this.alive) {
      this.stride = 0;
      this.foot *= -1;
      const side = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(0.12 * this.foot);
      this.tracks.add(this.position.clone().add(side), this.yaw);
    }
    this.tracks.update(dt);
    // A few motes of cold light about it.
    if (this.alive && Math.random() < dt * 5) {
      const p = this.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.4, 0.6 + Math.random() * 1.8, (Math.random() - 0.5) * 1.8));
      this.fx.add.spawn({ pos: p, spread: 0.2, count: 1, life: [0.8, 1.6], size: [0.05, 0.01], color: 0xeaf2ff, color2: 0x8aa8e0, upBias: 0.4, drag: 1.2 });
    }
  }

  dispose() {
    super.dispose();
    this.tracks.dispose();
  }

  protected disposeLook() {
    this.look.dispose();
  }
}

export const WHITE_STAG: BossDef = {
  id: 'whiteStag',
  kind: 'whiteStag',
  name: 'The White Stag',
  title: 'the legend of the deep woods',
  home: { x: -300, z: -20, r: 75 },
  levelBonus: 0,
  looks: ['stag'],
  // Only at dawn and dusk; and not every day (a quiet roll per day).
  abroad: (h) => (h >= 5 && h < 8) || (h >= 17.5 && h < 20.5),
  days: (d) => {
    const x = Math.sin(d * 91.7 + 13.1) * 43758.5453;
    return x - Math.floor(x) < 0.5;
  },
  blessing: { id: 'stagGrace', label: "Stag's Grace", sec: 1200, m: { moveSpeed: 0.1, staminaRegen: 0.3 } },
  againText: 'The White Stag lets you near again, and leaves another shed antler at your feet.',
  spawn: (at, level, scene, fx) => new WhiteStag(at, level, scene, fx, new THREE.Vector3(WHITE_STAG.home.x, heightAt(WHITE_STAG.home.x, WHITE_STAG.home.z), WHITE_STAG.home.z)),
  rumour: 'My grandfather swore he saw a white stag in the deep woods west of here, at dusk, with a crown of antlers like a tree in winter. Nobody has ever caught it. Folk say if you do, it blesses you.',
  found: 'A white stag, shining faintly in the half-light. It hasn\'t seen you yet. Go quietly: it hears a running step from far off.',
  phaseLines: ['The White Stag is tiring. Its prints are closer together now.', 'The White Stag turns at bay and lowers its crown. Stand your ground.'],
  unique: 'whiteAntler',
  renown: 3,
  deed: 'Ran down the White Stag and was blessed',
  slain: 'The White Stag bows its head and lets you lay your hand on it. When you look down, its shed antler lies at your feet. When you look up, it is gone. You feel lighter on your feet.',
  again: { items: [['whiteAntler', 1]], gold: [0, 0] },
  bounty: {
    title: 'Commission: The White Stag',
    description: 'A collector in the capital will pay for proof that the White Stag of the deep woods is real: an antler from its own crown. It is not to be harmed. The guild has no idea how you would manage it.',
    gold: 300, xp: 360, rep: 160, minRank: 2,
  },
};
