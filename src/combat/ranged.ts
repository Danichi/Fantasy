import * as THREE from 'three';
import type { Player } from '../player/player';
import type { ThirdPersonCamera } from '../player/camera';
import type { Input } from '../core/input';
import type { ProcPose } from '../player/rigLayer';
import type { ItemInstance } from '../items/equipment';
import { ITEMS, type ItemDef } from '../items/itemDefs';
import { targets, hurtSegment, type Target } from './targets';
import { afflictions } from './afflictions';
import { physics } from '../physics/physics';
import { heightAt } from '../world/terrain';
import { events } from '../core/events';
import { segmentSegmentDistance } from '../core/math';
import { buildArrowModel, buildBolt, setDraw, type ArrowHead } from '../items/weapons/models';
import { drawPose, BOW_CARRY } from '../items/weapons/bow';
import { sightPose } from '../items/weapons/crossbow';

// Bows and crossbows (docs/design/arms-and-crafting.md §3, "Bows and ranged
// combat"). Hold right mouse to aim: the camera closes in over the shoulder,
// a reticle tightens as the bow draws, and attack looses. Without aiming,
// attack is a quick shot at the locked (or nearest) enemy, with a little lead.
// Arrows and bolts are items that stack in the quiver and run out; shafts
// that hit the ground or a wall stay there and can be picked up again by
// walking over them. Projectiles and stuck arrows come from small pools.

export interface RangedHooks {
  toast(msg: string): void;
  /** bleed from broadheads (the skill runtime's bleed) */
  bleed(t: Target, dps: number): void;
  /** Gale momentum etc.: seconds of draw at this moment */
  drawTime(base: number): number;
  /** a Cross Style opening, spent on this shot: damage multiplier (1 = none) */
  takeOpening(): number;
  /** the school adapters may want to know a shot landed */
  onShotHit?(t: Target, dmg: number): void;
}

interface Shot {
  obj: THREE.Object3D;
  ammo: string;
  vel: THREE.Vector3;
  prev: THREE.Vector3;
  life: number;
  dmg: number;
  crit: number;
  poise: number;
  pierce: number;
  returning: boolean;
  free: boolean;
}

interface Stuck {
  obj: THREE.Object3D;
  ammo: string;
  t: number;
}

const ARROW_SPEED = [28, 62] as const;
const BOLT_SPEED = 72;
const GRAVITY = 7.5;
const STUCK_LIFE = 180;
const MAX_STUCK = 40;
const PICKUP_R = 1.6;

const HEAD: Record<string, ArrowHead> = { arrowIron: 'iron', arrowBroadhead: 'broadhead', arrowFire: 'fire', arrowFrost: 'frost', arrowBone: 'bone' };

export class Ranged {
  /** 0..1 how far the bow is drawn */
  draw = 0;
  aiming = false;
  /** a crossbow carries one bolt at a time */
  loaded = true;
  private renock = 0;
  private aimK = 0;
  private shots: Shot[] = [];
  private stuck: Stuck[] = [];
  private pools = new Map<string, THREE.Object3D[]>();
  private nocked: THREE.Object3D | null = null;
  private nockedAmmo = '';
  private reticle: HTMLDivElement;
  private ammoTag: HTMLDivElement;
  private group = new THREE.Group();
  readonly aimPoint = new THREE.Vector3();
  /** shots fired (tests) */
  fired = 0;

  constructor(scene: THREE.Scene, private player: Player, private cam: ThirdPersonCamera, private hooks: RangedHooks) {
    scene.add(this.group);
    this.group.name = 'ranged';
    const root = document.getElementById('ui')!;
    this.reticle = document.createElement('div');
    this.reticle.className = 'arms-reticle';
    this.reticle.innerHTML = '<i></i><b></b>';
    root.appendChild(this.reticle);
    this.ammoTag = document.createElement('div');
    this.ammoTag.className = 'arms-ammo';
    root.appendChild(this.ammoTag);
  }

  // ---- what's in hand ------------------------------------------------------------------------
  get launcher(): ItemDef | null {
    const d = this.player.equip.mainWeapon?.def;
    return d && (d.kind === 'bow' || d.kind === 'crossbow') ? d : null;
  }
  /** The ammunition the next shot uses: the quiver's, else the first that fits. */
  ammo(): ItemInstance | null {
    const L = this.launcher;
    if (!L) return null;
    const eq = this.player.equip;
    const q = eq.inSlot('quiver');
    if (q && q.def.ammo === L.ammo && q.qty > 0) return q;
    return eq.items.find((i) => i.def.kind === 'ammo' && i.def.ammo === L.ammo && i.qty > 0) ?? null;
  }
  ammoCount() {
    const L = this.launcher;
    if (!L) return 0;
    return this.player.equip.items.filter((i) => i.def.kind === 'ammo' && i.def.ammo === L.ammo).reduce((n, i) => n + i.qty, 0);
  }

  // ---- per step ---------------------------------------------------------------------------------
  update(dt: number, input: Input) {
    const p = this.player, L = this.launcher;
    this.renock = Math.max(0, this.renock - dt);
    const free = !!L && !p.dead && !p.mounted && !p.vehicle && !p.swimming && !input.uiMode;
    const wantAim = free && input.held('offhand') && !p.act;
    this.aiming = wantAim;
    p.aiming = wantAim;
    if (L?.kind === 'bow') {
      if (wantAim && this.renock <= 0 && this.ammo()) this.draw = Math.min(1, this.draw + dt / this.hooks.drawTime(L.id === 'huntingBow' ? 0.75 : 0.95));
      else if (!wantAim) this.draw = Math.max(0, this.draw - dt * 4);
      if (wantAim && input.wasPressed('attack')) {
        if (this.draw >= 0.12) this.loose(this.draw);
        else if (!this.ammo()) this.hooks.toast('No arrows for the bow');
      }
    } else if (L?.kind === 'crossbow') {
      this.draw = this.loaded ? 1 : 0;
      if (wantAim && input.wasPressed('attack')) {
        if (this.loaded) this.loose(1);
        else this.reload();
      }
    } else this.draw = 0;
    this.stepShots(dt);
    this.collect();
  }

  /** Crank the crossbow (a player action; the bolt goes in at its 'arms:loaded' event). */
  reload() {
    if (this.loaded || !this.launcher || this.launcher.kind !== 'crossbow') return false;
    if (!this.ammo()) {
      this.hooks.toast('No bolts for the crossbow');
      return false;
    }
    this.player.aiming = false;
    return this.player.startSkill('reload', 1, true);
  }

  /** Timed events from the bow and crossbow actions. */
  onEvent(name: string) {
    if (name === 'arms:loose') {
      const L = this.launcher;
      if (L?.kind === 'crossbow') this.loose(1);
      else this.loose(0.62);
      return true;
    }
    if (name === 'arms:looseHeavy') {
      const a = this.player.act;
      this.loose(Math.min(1, 0.75 + (a?.charge ?? 0) * 0.5));
      return true;
    }
    if (name === 'arms:loaded') {
      this.loaded = true;
      return true;
    }
    return false;
  }

  /** Release a shot at `power` 0..1 (bows) or full (crossbows). Returns whether anything flew. */
  loose(power: number): boolean {
    const L = this.launcher, p = this.player;
    if (!L) return false;
    const it = this.ammo();
    if (!it) {
      this.hooks.toast(L.kind === 'bow' ? 'No arrows for the bow' : 'No bolts for the crossbow');
      return false;
    }
    if (L.kind === 'crossbow' && !this.loaded) {
      this.reload();
      return false;
    }
    const ammoId = it.def.id;
    const as = it.def.stats;
    p.equip.consume(it.uid);
    events.emit('equipmentChanged', {});
    const from = this.launchPoint();
    const dir = this.aimDirection(from, L.kind === 'crossbow' ? BOLT_SPEED : ARROW_SPEED[0] + (ARROW_SPEED[1] - ARROW_SPEED[0]) * power);
    const speed = L.kind === 'crossbow' ? BOLT_SPEED : ARROW_SPEED[0] + (ARROW_SPEED[1] - ARROW_SPEED[0]) * power;
    const ws = L.stats;
    const opening = this.hooks.takeOpening();
    const bonus = (1 + p.equip.bonus('damagePct')) * p.paths.meleePower(1) * p.mods.melee * opening;
    const dmg = ((ws.damage ?? 10) + (as.damage ?? 0)) * (L.kind === 'crossbow' ? 1 : 0.35 + 0.65 * power) * bonus;
    const shot = this.take(ammoId);
    shot.obj.position.copy(from);
    shot.prev.copy(from);
    shot.vel.copy(dir).multiplyScalar(speed);
    shot.life = 4;
    shot.dmg = dmg;
    shot.crit = p.mods.crit + (ws.crit ?? 0) + (as.crit ?? 0) + (power >= 0.98 ? 0.08 : 0);
    shot.poise = (L.kind === 'crossbow' ? 45 : 14 + 30 * power) * (opening > 1 ? 2.5 : 1);
    shot.pierce = (ws.pierce ?? 0) + (as.pierce ?? 0);
    shot.returning = p.equip.mainWeapon?.rune === 'returning';
    shot.obj.visible = true;
    shot.obj.lookAt(from.clone().add(dir));
    if (L.kind === 'crossbow') this.loaded = false;
    this.draw = 0;
    this.renock = L.kind === 'bow' ? 0.22 : 0;
    this.fired++;
    events.emit('swing', { heavy: power > 0.9 });
    return true;
  }

  /** Where the arrow leaves: the bow's nock, or in front of the chest. */
  private launchPoint() {
    const p = this.player;
    const m = p.equip.model('main');
    const out = p.center.setY(p.pos.y + 1.45).addScaledVector(p.forward, 0.5);
    if (m) {
      const nock = m.userData.nock as THREE.Vector3 | undefined;
      if (nock) m.localToWorld(out.copy(nock).setZ(nock.z + 0.25));
      else m.localToWorld(out.set(0, 0.45, -0.05));
    }
    return out;
  }

  /** Aiming: along the camera's centre ray to whatever it meets. Otherwise at the lock-on (with lead) or straight ahead. */
  private aimDirection(from: THREE.Vector3, speed: number) {
    const p = this.player;
    if (this.aiming) {
      this.computeAimPoint();
      const d = this.aimPoint.clone().sub(from);
      const dist = d.length();
      // Hold over for the drop at range.
      d.y += 0.5 * GRAVITY * (dist / speed) ** 2;
      return d.normalize();
    }
    const t = p.lock?.alive ? p.lock : p.aimTarget(40);
    if (t) {
      const to = t.center.clone();
      const v = (t as unknown as { vel?: THREE.Vector3 }).vel;
      const flight = to.distanceTo(from) / speed;
      if (v) to.addScaledVector(v.clone().setY(0), flight * 0.8);
      to.y += 0.5 * GRAVITY * flight * flight;
      return to.sub(from).normalize();
    }
    return p.forward.clone().setY(0.04).normalize();
  }

  /** The first thing on the camera's centre line (enemies, walls, ground), up to 140 m. */
  computeAimPoint() {
    const cam = this.cam.camera;
    const o = cam.position.clone();
    const d = new THREE.Vector3();
    cam.getWorldDirection(d);
    let best = 140;
    // Skip what's between the camera and the player.
    const start = Math.max(0, o.distanceTo(this.player.center) - 0.3);
    const wall = physics.castRay(o.clone().addScaledVector(d, start), d, best - start);
    if (wall !== null) best = start + wall;
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (const t of targets) {
      if (!t.alive) continue;
      const [ha, hb] = hurtSegment(t);
      a.copy(o).addScaledVector(d, start);
      b.copy(o).addScaledVector(d, best);
      if (segmentSegmentDistance(a, b, ha, hb) < t.radius) {
        const along = t.center.clone().sub(o).dot(d);
        if (along > start && along < best) best = along;
      }
    }
    // The ground, marched coarsely.
    for (let s = start + 1; s < best; s += 1.5) {
      const q = o.clone().addScaledVector(d, s);
      if (q.y < heightAt(q.x, q.z)) {
        best = s;
        break;
      }
    }
    return this.aimPoint.copy(o).addScaledVector(d, best);
  }

  // ---- projectiles -------------------------------------------------------------------------
  private model(ammo: string) {
    if (ITEMS[ammo]?.ammo === 'bolt') return buildBolt();
    return buildArrowModel(HEAD[ammo] ?? 'iron');
  }
  private take(ammo: string): Shot {
    let s = this.shots.find((x) => x.free && x.ammo === ammo);
    if (!s) {
      const pool = this.pools.get(ammo);
      const obj = pool?.pop() ?? this.model(ammo);
      this.group.add(obj);
      s = { obj, ammo, vel: new THREE.Vector3(), prev: new THREE.Vector3(), life: 0, dmg: 0, crit: 0, poise: 0, pierce: 0, returning: false, free: false };
      this.shots.push(s);
    }
    s.free = false;
    return s;
  }
  private release(s: Shot) {
    s.free = true;
    s.obj.visible = false;
  }

  private stepShots(dt: number) {
    const seg = new THREE.Vector3();
    for (const s of this.shots) {
      if (s.free) continue;
      s.life -= dt;
      s.prev.copy(s.obj.position);
      s.vel.y -= GRAVITY * dt;
      s.obj.position.addScaledVector(s.vel, dt);
      s.obj.lookAt(seg.copy(s.obj.position).add(s.vel));
      // Enemies along this step's path.
      let hitT: Target | null = null;
      for (const t of targets) {
        if (!t.alive) continue;
        if (t.center.distanceTo(s.obj.position) > 6 + s.vel.length() * dt) continue;
        const [ha, hb] = hurtSegment(t);
        if (segmentSegmentDistance(s.prev, s.obj.position, ha, hb) < t.radius + 0.05) {
          hitT = t;
          break;
        }
      }
      if (hitT) {
        this.hitTarget(s, hitT);
        continue;
      }
      // The world: walls and floors, then the ground.
      const step = s.obj.position.clone().sub(s.prev);
      const len = step.length();
      const wall = len > 1e-4 ? physics.castRay(s.prev, step.clone().divideScalar(len), len) : null;
      const g = heightAt(s.obj.position.x, s.obj.position.z);
      if (wall !== null || s.obj.position.y < g) {
        if (wall !== null) s.obj.position.copy(s.prev).addScaledVector(step, wall / len * 0.97);
        else s.obj.position.y = g + 0.05;
        this.stick(s);
        continue;
      }
      if (s.life <= 0) this.release(s);
    }
  }

  private hitTarget(s: Shot, t: Target) {
    const p = this.player;
    const crit = t.stunned || Math.random() < s.crit;
    const dmg = Math.max(1, Math.round(s.dmg * (crit ? 2.2 : 1) * (0.92 + Math.random() * 0.16)));
    const dir = s.vel.clone().setY(0).normalize();
    const at = t.center.clone().addScaledVector(dir, -t.radius * 0.8);
    t.takeHit({ damage: dmg, poise: s.poise * p.paths.poisePower * p.mods.poise, dir, at, crit, source: 'melee' });
    const as = ITEMS[s.ammo]?.stats ?? {};
    if (as.burn && t.alive) afflictions.burn(t, as.burn);
    if (as.frost && t.alive && Math.random() < as.frost) afflictions.freeze(t);
    if (as.bleed && t.alive) this.hooks.bleed(t, as.bleed);
    events.emit('enemyHit', { at, amount: dmg, crit, enemyId: t.id });
    this.hooks.onShotHit?.(t, dmg);
    // Shot from range: beasts charge, bandits break for cover.
    (t as Target & { onRangedHit?(from: THREE.Vector3): void }).onRangedHit?.(p.pos.clone());
    if (s.returning) this.refund(s.ammo);
    this.release(s);
  }

  /** The shaft sticks where it landed and waits to be picked up. */
  private stick(s: Shot) {
    if (s.returning) {
      this.refund(s.ammo);
      this.release(s);
      return;
    }
    const obj = this.model(s.ammo);
    obj.position.copy(s.obj.position);
    obj.quaternion.copy(s.obj.quaternion);
    this.group.add(obj);
    this.stuck.push({ obj, ammo: s.ammo, t: 0 });
    while (this.stuck.length > MAX_STUCK) this.dropStuck(this.stuck[0]);
    this.release(s);
  }
  private dropStuck(st: Stuck) {
    this.stuck.splice(this.stuck.indexOf(st), 1);
    st.obj.removeFromParent();
    const pool = this.pools.get(st.ammo) ?? [];
    if (pool.length < 12) pool.push(st.obj);
    this.pools.set(st.ammo, pool);
  }
  private refund(ammo: string) {
    this.player.equip.add(ammo, 1);
    events.emit('equipmentChanged', {});
  }

  /** Walk over stuck arrows to gather them. */
  private collect() {
    const p = this.player.pos;
    for (const st of [...this.stuck]) {
      st.t += 1 / 60;
      if (st.t > STUCK_LIFE) {
        this.dropStuck(st);
        continue;
      }
      const dx = st.obj.position.x - p.x, dz = st.obj.position.z - p.z;
      if (dx * dx + dz * dz < PICKUP_R * PICKUP_R && Math.abs(st.obj.position.y - p.y - 0.5) < 2) {
        this.dropStuck(st);
        this.refund(st.ammo);
        this.hooks.toast(`Picked up: ${ITEMS[st.ammo].name.replace(/s$/, '')}`);
      }
    }
  }

  /** Stuck arrows lying in the world (tests and the map). */
  get stuckCount() {
    return this.stuck.length;
  }
  stuckAt(i: number) {
    return this.stuck[i]?.obj.position;
  }

  // ---- presentation ---------------------------------------------------------------------------
  /** The draw (or sighting) pose, the nocked arrow and the bowstring, and the camera and reticle. */
  pose(pose: ProcPose, act: { def: { id: string }; t: number } | null): ProcPose {
    const L = this.launcher, p = this.player;
    const camPitch = Math.asin(Math.max(-0.9, Math.min(0.9, p.aimDir.y)));
    let out = pose;
    const bowModel = p.equip.model('main');
    if (L?.kind === 'bow') {
      if (this.aiming || this.draw > 0.01) out = { ...pose, ...drawPose(this.draw, this.aiming ? camPitch : 0) };
      else if (act && (act.def.id === 'slash1' || act.def.id === 'heavy')) {
        const k = act.def.id === 'heavy' ? Math.min(1, act.t / 0.6) : Math.min(1, act.t / 0.3);
        const released = act.def.id === 'heavy' ? act.t > 0.66 : act.t > 0.3;
        out = { ...pose, ...drawPose(released ? 0 : k, 0) };
      } else out = { ...pose, left: { ...BOW_CARRY } };
      if (bowModel) setDraw(bowModel, (this.aiming ? this.draw : 0) * 0.42);
    } else if (L?.kind === 'crossbow') {
      if (this.aiming) out = { ...pose, ...sightPose(camPitch), leftFollows: { off: 0.32, w: 1 } };
      if (bowModel?.userData.loaded) (bowModel.userData.loaded as THREE.Object3D).visible = this.loaded;
    }
    this.updateNocked();
    return out;
  }

  /** Per rendered frame: camera, reticle, ammo count. */
  frame(dt: number) {
    this.aimK += ((this.aiming ? 1 : 0) - this.aimK) * Math.min(1, dt * 10);
    this.cam.aim = this.aimK;
    const L = this.launcher;
    this.reticle.style.display = this.aimK > 0.3 ? 'block' : 'none';
    if (this.aimK > 0.3) {
      const spread = L?.kind === 'crossbow' ? 6 : 6 + (1 - this.draw) * 26;
      this.reticle.style.setProperty('--spread', `${spread}px`);
      this.reticle.classList.toggle('full', L?.kind === 'crossbow' ? this.loaded : this.draw >= 0.98);
    }
    if (L) {
      const n = this.ammoCount();
      this.ammoTag.style.display = 'block';
      this.ammoTag.textContent = `${L.ammo === 'bolt' ? 'Bolts' : 'Arrows'} ${n}${L.kind === 'crossbow' && !this.loaded ? ' · unloaded' : ''}`;
      this.ammoTag.classList.toggle('empty', n === 0);
    } else this.ammoTag.style.display = 'none';
  }

  private updateNocked() {
    const L = this.launcher, p = this.player;
    const show = L?.kind === 'bow' && (this.aiming || (p.act && (p.act.def.id === 'slash1' || p.act.def.id === 'heavy'))) && this.renock <= 0;
    const it = show ? this.ammo() : null;
    if (!it) {
      if (this.nocked) this.nocked.visible = false;
      return;
    }
    if (!this.nocked || this.nockedAmmo !== it.def.id) {
      this.nocked?.removeFromParent();
      this.nocked = this.model(it.def.id);
      this.nockedAmmo = it.def.id;
      this.group.add(this.nocked);
    }
    // From the string (the right hand) through the bow grip.
    const bow = p.equip.model('main');
    const hand = p.rig.hands.Right.socket;
    if (!bow) return;
    const nockW = hand.getWorldPosition(new THREE.Vector3());
    const gripW = bow.getWorldPosition(new THREE.Vector3());
    this.nocked.visible = true;
    this.nocked.position.copy(nockW);
    this.nocked.lookAt(gripW.addScaledVector(gripW.clone().sub(nockW).normalize(), 0.3));
  }

  setVisible(v: boolean) {
    this.group.visible = v;
  }

  /** Clear everything in flight and on the ground (tests, realm changes). */
  clear() {
    for (const s of this.shots) this.release(s);
    for (const st of [...this.stuck]) this.dropStuck(st);
    this.draw = 0;
    this.loaded = true;
  }
}
