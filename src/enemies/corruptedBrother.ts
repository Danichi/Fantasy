import * as THREE from 'three';
import { dampAngle } from '../core/math';
import { events } from '../core/events';
import { newTargetId, targets, type HitInfo, type Target } from '../combat/targets';
import { buildCharacter, type BuiltCharacter } from '../npc/charBuilder';
import { buildSword } from '../items/weaponModels';
import { sfx } from '../audio/sfx';
import { EDRIC_LOOK } from '../world/roadToRiches';
import type { FX } from '../fx/particles';
import type { Player } from '../player/player';

// Edric, Hollowed: Posy's brother, in the sanctum under the Gravewood
// pedestal, after he gave himself to the dark to be strong enough to kill
// you. A fast swordsman wreathed in cursed fire: chained slashes, a shadow
// step that puts him behind you, rings of dark fire that ripple out along the
// floor, a hail of cursed bolts, and below half health a darker second phase
// (faster, the rings come in threes, and he calls shades of Posy's memory).

type State = 'waiting' | 'idle' | 'chase' | 'combo' | 'shadowStep' | 'ring' | 'volley' | 'enrage' | 'hurt' | 'dying' | 'dead';

interface Ring { at: THREE.Vector3; r: number; speed: number; mesh: THREE.Mesh; hit: boolean; life: number }
interface Bolt { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }

export class CorruptedBrother implements Target {
  id = newTargetId();
  kind = 'edricHollowed';
  name = 'Edric, the Hollowed';
  alive = true;
  center = new THREE.Vector3();
  radius = 0.55;
  halfHeight = 0.75;
  position = new THREE.Vector3();
  stunned = false;
  lockable = false;
  maxHp = 2600;
  hp = 2600;
  /** phase notches for the boss bar */
  readonly phases = [0.5];
  private root = new THREE.Group();
  private built: BuiltCharacter | null = null;
  private acts: Record<string, THREE.AnimationAction> = {};
  private clip = '';
  private state: State = 'waiting';
  private st = 0;
  private yaw = 0;
  private cool = 1.5;
  private combo = 0;
  private hitDone = false;
  private poise = 0;
  private phase2 = false;
  private rings: Ring[] = [];
  private bolts: Bolt[] = [];
  private ringMat = new THREE.MeshBasicMaterial({ color: 0x9a3aff, transparent: true, opacity: 0.75, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  private boltMat = new THREE.MeshBasicMaterial({ color: 0xc070ff });
  private aura: THREE.Mesh;
  onDeath?: () => void;
  onPhase2?: () => void;
  /** call shades to the fight (main/interior supplies them) */
  onSummon?: (at: THREE.Vector3) => void;

  constructor(at: THREE.Vector3, yaw: number, private scene: THREE.Scene, private fx: FX, private bounds: { x0: number; x1: number; z0: number; z1: number }) {
    this.position.copy(at);
    this.yaw = yaw;
    scene.add(this.root);
    this.aura = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), new THREE.MeshBasicMaterial({ color: 0x5a1a9a, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.aura.scale.set(0.8, 1.4, 0.8);
    this.aura.position.y = 1.05;
    this.root.add(this.aura);
    const look = { ...EDRIC_LOOK, skin: 0x8a8a9a, hairColor: 0x2a2030, cloth: 0x1a1220, linen: 0x3a2a4a, pauldron: true, bracers: true, height: 1.95 };
    void buildCharacter(look, ['sword_idle', 'sword_attack', 'sword_combo', 'hit', 'death', 'jog', 'idle', 'crouch']).then((b) => {
      this.built = b;
      for (const a of (b.mixer as unknown as { _actions: THREE.AnimationAction[] })._actions) this.acts[a.getClip().name] = a;
      const hand = b.bones.get('hand_r') ?? b.bones.get('Hand_R') ?? b.bones.get('RightHand');
      if (hand) {
        const blade = buildSword({ bladeLen: 1.05, bladeWidth: 0.034, thickness: 0.006, fullerLen: 0, gripLen: 0.2, guardSpan: 0.16, guardStyle: 'curved', pommel: 'wheel', tint: 0x2a2030, glow: 0xa040ff, glowStrength: 2.4 });
        blade.scale.setScalar(1 / b.root.scale.x);
        blade.rotation.set(0, 0, -Math.PI / 2);
        hand.add(blade);
      }
      // Eyes of cursed light.
      const head = b.bones.get('Head') ?? b.bones.get('head');
      if (head) for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), new THREE.MeshBasicMaterial({ color: 0xe0a0ff }));
        eye.position.set(s * 0.032 / b.root.scale.x, 0.07 / b.root.scale.x, 0.085 / b.root.scale.x);
        head.add(eye);
      }
      b.root.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true)));
      this.root.add(b.root);
      this.play('crouch');
    });
    this.sync();
  }

  /** The fight begins (after his words). */
  wake() {
    if (this.state !== 'waiting') return;
    this.lockable = true;
    targets.add(this);
    this.set('idle');
    this.cool = 0.8;
    sfx.roar(0.7);
    this.fx.add.spawn({ pos: this.center.clone(), spread: 2.5, count: 60, life: [0.6, 1.4], size: [0.25, 0.04], color: 0xc070ff, color2: 0x200040, upBias: 1.2 });
  }

  private play(name: string, once = false, speed = 1, fade = 0.15) {
    const next = this.acts[name];
    if (!next) return;
    if (this.clip === name && !once) return;
    const prev = this.acts[this.clip];
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.setEffectiveTimeScale(speed);
    next.play();
    if (prev && prev !== next) prev.crossFadeTo(next, fade, false);
    this.clip = name;
  }
  private set(s: State) {
    this.state = s;
    this.st = 0;
    this.hitDone = false;
  }

  takeHit(h: HitInfo) {
    if (!this.alive || this.state === 'waiting' || this.state === 'dying' || this.state === 'shadowStep') return;
    this.hp -= h.damage;
    events.emit('enemyHit', { at: this.center.clone(), amount: h.damage, crit: h.crit, enemyId: this.id });
    this.fx.add.spawn({ pos: h.at ?? this.center, spread: 1.6, count: 10, life: [0.3, 0.7], size: [0.08, 0.02], color: 0xb060ff, color2: 0x200030, gravity: 4 });
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.lockable = false;
      this.stunned = false;
      targets.delete(this);
      this.set('dying');
      this.play('death', true);
      events.emit('enemyDied', { at: this.center.clone(), enemyId: this.id, kind: this.kind });
      this.onDeath?.();
      return;
    }
    if (!this.phase2 && this.hp < this.maxHp * 0.5) {
      this.phase2 = true;
      this.set('enrage');
      this.onPhase2?.();
      return;
    }
    // Enough poise damage staggers him briefly (never mid-enrage).
    this.poise += h.poise;
    if (this.poise > (this.phase2 ? 220 : 160) && this.state !== 'enrage') {
      this.poise = 0;
      this.stunned = true;
      this.set('hurt');
      this.play('hit', true);
    }
  }

  private melee(player: Player, reach: number, damage: number, poise: number) {
    if (this.hitDone || player.dead) return;
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const to = player.pos.clone().sub(this.position).setY(0);
    if (to.length() < reach && to.normalize().dot(fwd) > 0.2) {
      this.hitDone = true;
      player.receiveAttack({ damage, from: this.position.clone(), at: player.center.clone(), parryable: true, poise, onParried: () => {
        this.stunned = true;
        this.set('hurt');
        this.play('hit', true);
      } });
    }
  }

  private spawnRing(delay = 0) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.25, 48), this.ringMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(this.position).setY(this.position.y + 0.08);
    mesh.visible = false;
    this.scene.add(mesh);
    this.rings.push({ at: this.position.clone(), r: 1, speed: this.phase2 ? 11 : 8.5, mesh, hit: false, life: -delay });
  }

  private fireVolley(player: Player) {
    const n = this.phase2 ? 7 : 5;
    const from = this.center.clone().setY(this.center.y + 0.4);
    const base = Math.atan2(player.pos.x - from.x, player.pos.z - from.z);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.16;
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), this.boltMat);
      mesh.position.copy(from);
      this.scene.add(mesh);
      this.bolts.push({ mesh, vel: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(14), life: 3 });
    }
  }

  update(dt: number, player: Player) {
    this.st += dt;
    this.cool -= dt;
    this.built?.mixer.update(dt);
    const to = player.pos.clone().sub(this.position).setY(0);
    const dist = to.length();
    const want = Math.atan2(to.x, to.z);
    const fast = this.phase2 ? 1.35 : 1;
    switch (this.state) {
      case 'waiting':
        break;
      case 'idle':
      case 'chase': {
        if (player.dead) {
          this.play('sword_idle');
          break;
        }
        this.yaw = dampAngle(this.yaw, want, 8, dt);
        if (this.cool <= 0) {
          const roll = Math.random();
          if (dist < 3.2) this.set(roll < 0.6 ? 'combo' : 'ring');
          else if (dist > 9) this.set(roll < 0.5 ? 'shadowStep' : roll < 0.8 ? 'volley' : 'ring');
          else this.set(roll < 0.45 ? 'shadowStep' : roll < 0.7 ? 'ring' : 'combo');
          this.combo = 0;
          break;
        }
        if (dist > 2.4) {
          this.state = 'chase';
          this.play('jog', false, 1.25 * fast);
          this.position.addScaledVector(to.normalize(), 5.2 * fast * dt);
        } else {
          this.state = 'idle';
          this.play('sword_idle');
        }
        break;
      }
      case 'combo': {
        // Three cuts, each lunging in.
        const T = 0.75 / fast;
        if (this.st === dt || (this.st < dt * 1.5)) this.play(this.combo % 2 ? 'sword_combo' : 'sword_attack', true, 1.3 * fast);
        this.yaw = dampAngle(this.yaw, want, this.st < T * 0.4 ? 10 : 2, dt);
        if (this.st > T * 0.35 && this.st < T * 0.6) {
          this.position.addScaledVector(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), 6 * dt);
          this.melee(player, 2.9, this.phase2 ? 34 : 26, 45);
        }
        if (this.st > T) {
          this.combo++;
          if (this.combo < (this.phase2 ? 4 : 3) && dist < 4.5) {
            this.st = 0;
            this.hitDone = false;
          } else {
            this.set('idle');
            this.cool = (this.phase2 ? 0.8 : 1.3) + Math.random() * 0.6;
          }
        }
        break;
      }
      case 'shadowStep': {
        // Melt into smoke, reappear behind you, cut.
        if (this.st < 0.35) {
          this.root.visible = this.st < 0.1 || Math.random() < 0.3;
          if (Math.random() < dt * 60) this.fx.add.spawn({ pos: this.center.clone(), spread: 1, count: 3, life: [0.4, 0.8], size: [0.4, 0.1], color: 0x3a1a5a, color2: 0x0a0010, alpha: 0.7 });
        } else if (!this.hitDone && this.st < 0.5) {
          const behind = player.pos.clone().add(new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)).multiplyScalar(2.2));
          this.position.set(THREE.MathUtils.clamp(behind.x, this.bounds.x0, this.bounds.x1), this.position.y, THREE.MathUtils.clamp(behind.z, this.bounds.z0, this.bounds.z1));
          this.yaw = Math.atan2(player.pos.x - this.position.x, player.pos.z - this.position.z);
          this.root.visible = true;
          this.fx.add.spawn({ pos: this.center.clone(), spread: 1.5, count: 30, life: [0.4, 0.9], size: [0.3, 0.05], color: 0xb060ff, color2: 0x200030 });
          this.play('sword_attack', true, 1.1 * fast);
          this.hitDone = true; // reuse as "arrived"
        } else if (this.st > 0.85 && this.st < 1.15) {
          if (this.hitDone) this.hitDone = false;
          this.melee(player, 3, this.phase2 ? 38 : 30, 60);
          this.hitDone = true;
        }
        if (this.st > 1.6) {
          this.root.visible = true;
          this.set('idle');
          this.cool = 1 + Math.random() * 0.6;
        }
        break;
      }
      case 'ring': {
        // He drives the blade into the floor: rings of dark fire roll outward (jump or dodge through).
        if (this.st < dt * 1.5) this.play('sword_attack', true, 0.8);
        if (this.st > 0.6 && !this.hitDone) {
          this.hitDone = true;
          const n = this.phase2 ? 3 : 1;
          for (let k = 0; k < n; k++) this.spawnRing(k * 0.55);
          sfx.rumble(1, 0.7);
          events.emit('bossSlam', { at: this.position.clone() });
        }
        if (this.st > 1.4) {
          this.set('idle');
          this.cool = 1.1 + Math.random() * 0.5;
        }
        break;
      }
      case 'volley': {
        this.yaw = dampAngle(this.yaw, want, 6, dt);
        this.play('sword_idle');
        if (this.st > 0.5 && !this.hitDone) {
          this.hitDone = true;
          this.fireVolley(player);
        }
        if (this.st > 1.2) {
          this.set('idle');
          this.cool = 1 + Math.random() * 0.6;
        }
        break;
      }
      case 'enrage':
        // Phase two: the curse takes the rest of him.
        this.play('crouch');
        if (Math.random() < dt * 40) this.fx.add.spawn({ pos: this.center.clone(), vel: new THREE.Vector3(0, 3, 0), spread: 1.8, count: 3, life: [0.6, 1.2], size: [0.3, 0.05], color: 0xc070ff, color2: 0x200030, upBias: 1.5 });
        if (this.st > 2.2) {
          this.onSummon?.(this.position.clone());
          this.spawnRing();
          sfx.roar(1);
          this.set('idle');
          this.cool = 0.6;
        }
        break;
      case 'hurt':
        if (this.st > 1.1) {
          this.stunned = false;
          this.set('idle');
          this.cool = 0.5;
        }
        break;
      case 'dying':
        if (this.st > 3) this.state = 'dead';
        break;
      case 'dead':
        break;
    }
    // Rings of dark fire.
    for (const r of this.rings) {
      r.life += dt;
      if (r.life < 0) continue;
      r.mesh.visible = true;
      r.r += r.speed * dt;
      r.mesh.scale.setScalar(r.r);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - r.life * 0.25);
      const d = Math.hypot(player.pos.x - r.at.x, player.pos.z - r.at.z);
      const onFloor = player.pos.y - r.at.y < 0.6;
      if (!r.hit && !player.dead && onFloor && Math.abs(d - r.r * 1.08) < 0.55) {
        r.hit = true;
        player.receiveAttack({ damage: this.phase2 ? 30 : 24, from: r.at.clone(), at: player.center.clone(), parryable: false, poise: 40 });
      }
    }
    for (const r of this.rings) if (r.r > 26) this.scene.remove(r.mesh);
    this.rings = this.rings.filter((r) => r.r <= 26);
    // Cursed bolts.
    for (const b of this.bolts) {
      b.life -= dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      if (!player.dead && b.mesh.position.distanceTo(player.center) < 0.7) {
        b.life = 0;
        player.receiveAttack({ damage: 16, from: b.mesh.position.clone().sub(b.vel.clone().normalize()), at: b.mesh.position.clone(), parryable: true, poise: 15 });
      }
      if (b.life <= 0) this.scene.remove(b.mesh);
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);
    this.position.x = THREE.MathUtils.clamp(this.position.x, this.bounds.x0, this.bounds.x1);
    this.position.z = THREE.MathUtils.clamp(this.position.z, this.bounds.z0, this.bounds.z1);
    this.aura.scale.set(0.8 + Math.sin(this.st * 6) * 0.05, 1.4, 0.8);
    (this.aura.material as THREE.MeshBasicMaterial).opacity = this.alive ? (this.phase2 ? 0.32 : 0.18) : Math.max(0, 0.18 - this.st * 0.06);
    if (this.alive && Math.random() < dt * (this.phase2 ? 30 : 12)) this.fx.add.spawn({ pos: this.center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 0.8)), vel: new THREE.Vector3(0, 1.2, 0), spread: 0.2, count: 1, life: [0.4, 0.9], size: [0.12, 0.02], color: 0xa050ff, color2: 0x200030 });
    this.sync();
  }

  private sync() {
    this.root.position.copy(this.position);
    this.root.rotation.y = this.yaw;
    this.center.set(this.position.x, this.position.y + 1.05, this.position.z);
  }

  dispose() {
    targets.delete(this);
    this.scene.remove(this.root);
    for (const r of this.rings) this.scene.remove(r.mesh);
    for (const b of this.bolts) this.scene.remove(b.mesh);
    this.built?.mixer.stopAllAction();
  }
}
