import { waterSurfaceAt } from '../world/waterLevel';
import * as THREE from 'three';
import type { Player } from './player';
import type { Input, Action } from '../core/input';
import type { ThirdPersonCamera } from './camera';
import type { Target } from '../combat/targets';
import { physics, STATIC_ONLY } from '../physics/physics';
import { climbSurface, grappleAnchors, type GrappleAnchor } from './traversalSurfaces';
import { events } from '../core/events';
const UP = new THREE.Vector3(0, 1, 0),
  ROT = { x: 0, y: 0, z: 0, w: 1 };
export interface Lip {
  landing: THREE.Vector3;
  hang: THREE.Vector3;
  normal: THREE.Vector3;
  owner: number;
}
export interface RopeTrip {
  from: THREE.Vector3;
  to: THREE.Vector3;
  hook: THREE.Vector3;
  via: THREE.Vector3;
  t: number;
  dur: number;
  strike?: Target;
  anchor?: string;
}
type State =
  | { kind: 'climb'; normal: THREE.Vector3; owner: number }
  | { kind: 'hang'; lip: Lip }
  | { kind: 'hoist'; lip: Lip; from: THREE.Vector3; t: number }
  | { kind: 'rope'; trip: RopeTrip };
/** Deliberate surface traversal. Every movement goes through the player's capsule sweep. */
export class AdventureTraversal {
  state: State | null = null;
  gliding = false;
  notice = '';
  private noticeT = 0;
  private cooldown = 0;
  private airClock = 0;
  private wish = new THREE.Vector3();
  private brake = false;
  constructor(private p: Player) {
    events.on('playerDamaged', ({ amount, blocked }) => {
      if (amount > 0 && !blocked && (this.busy || this.gliding)) {
        this.cancel();
        this.say('Grip interrupted');
      }
    });
  }
  get busy() {
    return this.state !== null;
  }
  get rope() {
    return this.state?.kind === 'rope' ? this.state.trip : null;
  }
  get mode() {
    return this.state?.kind ?? (this.gliding ? 'glide' : 'none');
  }
  cancel() {
    this.state = null;
    this.gliding = false;
    this.cooldown = 0.35;
    this.airClock = 0;
  }
  private say(s: string) {
    this.notice = s;
    this.noticeT = 2.5;
  }
  private eat(input: Input, ...actions: Action[]) {
    for (const action of actions) for (const key of input.bindings[action]) input.consume(key);
  }
  private ray(from: THREE.Vector3, dir: THREE.Vector3, length: number) {
    return physics.world.castRayAndGetNormal(new physics.R.Ray(from, dir), length, true, undefined, STATIC_ONLY);
  }
  private suitable(hit: ReturnType<AdventureTraversal['ray']>) {
    return !!hit && !!climbSurface(hit.collider) && hit.normal.y >= -0.08 && hit.normal.y < 0.71;
  }
  face(dir: THREE.Vector3, at = this.p.pos) {
    const origin = at.clone().add(new THREE.Vector3(0, 0.95, 0)),
      d = dir.clone().setY(0).normalize(),
      hit = this.ray(origin, d, 1.05);
    return this.suitable(hit)
      ? { normal: new THREE.Vector3(hit!.normal.x, hit!.normal.y, hit!.normal.z), owner: hit!.collider.handle, point: origin.addScaledVector(d, hit!.timeOfImpact) }
      : null;
  }
  clear(at: THREE.Vector3) {
    return !physics.world.intersectionWithShape(
      { x: at.x, y: at.y + 0.91, z: at.z },
      ROT,
      new physics.R.Capsule(0.55, 0.32),
      physics.R.QueryFilterFlags.EXCLUDE_SENSORS,
      STATIC_ONLY
    );
  }
  lip(normal: THREE.Vector3, at = this.p.pos, owner = 0): Lip | null {
    const flat = normal.clone().setY(0).normalize(),
      sideOrigin = at
        .clone()
        .addScaledVector(flat, 0.2)
        .add(new THREE.Vector3(0, 0.95, 0)),
      front = this.ray(sideOrigin, flat.clone().negate(), 1.8);
    const plane = front ? sideOrigin.addScaledVector(flat, -front.timeOfImpact) : at.clone().addScaledVector(flat, -0.4);
    const probe = plane.addScaledVector(flat, -0.5).setY(at.y + 2.1),
      hit = this.ray(probe, new THREE.Vector3(0, -1, 0), 1.8);
    if (!hit || hit.normal.y < 0.74) return null;
    const landing = probe.clone().setY(probe.y - hit.timeOfImpact + 0.055),
      rise = landing.y - at.y;
    if (rise < 0.42 || rise > 2.08 || !this.clear(landing)) return null;
    const hang = landing
      .clone()
      .addScaledVector(flat, 0.9)
      .add(new THREE.Vector3(0, -1.7, 0));
    if (!this.clear(hang)) return null;
    return { landing, hang, normal: flat, owner };
  }
  aimedAnchor(origin: THREE.Vector3, dir: THREE.Vector3): GrappleAnchor | null {
    let best: GrappleAnchor | null = null,
      score = -Infinity;
    for (const a of grappleAnchors.values()) {
      const distance = a.point.distanceTo(this.p.center);
      if (distance > 30 || distance < 2) continue;
      const v = a.point.clone().sub(origin),
        along = v.dot(dir);
      if (along < 0) continue;
      const cosine = v.normalize().dot(dir);
      if (cosine < 0.965) continue;
      if (!physics.lineOfSight(this.p.center.clone().add(new THREE.Vector3(0, 0.65, 0)), a.point, 0.45)) continue;
      const rank = cosine - distance * 0.001;
      if (rank > score) {
        score = rank;
        best = a;
      }
    }
    return best;
  }
  grappleTo(to: THREE.Vector3, hook: THREE.Vector3, strike?: Target, anchor?: string) {
    const p = this.p;
    if (p.dead || p.vehicle || p.mounted || p.swimming || p.flying || (p.act && !p.canAct) || this.busy || p.stamina < 12 || !this.clear(to)) return false;

    const out = hook.clone().sub(to).setY(0);
    if (out.lengthSq() < 0.1) out.copy(p.pos).sub(to).setY(0);
    out.normalize();
    const via = hook
      .clone()
      .addScaledVector(out, 0.6)
      .setY(Math.max(to.y + 1.5, hook.y + 0.3));
    if (!this.clear(via)) return false;
    // Check both legs before charging stamina. The moving capsule still sweeps
    // every frame in case a gate or another obstacle changes during the trip.
    for (const [from, end] of [
      [p.pos, via],
      [via, to],
    ]) {
      const hit = physics.world.castShape(
        from.clone().add(new THREE.Vector3(0, 0.89, 0)),
        ROT,
        end.clone().sub(from),
        new physics.R.Capsule(0.55, 0.32),
        0,
        1,
        false,
        physics.R.QueryFilterFlags.EXCLUDE_SENSORS,
        STATIC_ONLY
      );
      if (hit && hit.time_of_impact < 0.999) return false;
    }
    this.gliding = false;
    p.act = null;
    p.spendStamina(12);
    p.clearCombatInput();
    p.blocking = false;
    p.lock = null;
    this.state = {
      kind: 'rope',
      trip: { from: p.pos.clone(), to: to.clone(), hook: hook.clone(), via, t: 0, dur: Math.max(0.45, Math.min(2, to.distanceTo(p.pos) / 15)), strike, anchor },
    };
    events.emit('combatMove', { id: 'grappleAnchor', name: 'Grapple' });
    return true;
  }
  private drop(push = false) {
    const p = this.p,
      n = this.state?.kind === 'climb' ? this.state.normal : this.state?.kind === 'hang' ? this.state.lip.normal : new THREE.Vector3();
    this.state = null;
    this.gliding = false;
    this.cooldown = 0.45;
    this.airClock = 0;
    p.grounded = false;
    p.vel.copy(n).multiplyScalar(push ? 3.5 : 1.0);
    p.vel.y = push ? 4.8 : -1;
    p.clearCombatInput();
    p.traversalResetFall();
    if (push) p.spendStamina(8);
  }
  private attach(face: NonNullable<ReturnType<AdventureTraversal['face']>>) {
    const lip = this.lip(face.normal, this.p.pos, face.owner);
    this.state = lip ? { kind: 'hang', lip } : { kind: 'climb', normal: face.normal, owner: face.owner };
    this.gliding = false;
    this.p.vel.set(0, 0, 0);
    this.p.act = null;
    this.p.blocking = false;
    this.p.lock = null;
    this.p.clearCombatInput();
    events.emit('combatMove', { id: lip ? 'ledgeHang' : 'climb', name: lip ? 'Ledge Hang' : 'Climb' });
  }
  step(dt: number, input: Input, cam: ThirdPersonCamera) {
    const p = this.p;
    const wasAttached = this.busy;
    const wasGliding = this.gliding;
    const water = waterSurfaceAt(p.pos.x, p.pos.z);
    if (this.busy && water !== null && p.pos.y + 1.5 < water) {
      this.cancel();
      return false;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.noticeT -= dt;
    if (this.noticeT <= 0) this.notice = '';
    this.airClock = p.grounded ? 0 : this.airClock + dt;
    if (p.dead || p.mounted || p.vehicle || p.flying || p.swimming) {
      this.cancel();
      return false;
    }
    const usable = !input.uiMode && !p.act && !p.mantling;
    const direction = cam.forward().setY(0).normalize();
    if (!this.busy && usable && input.held('interact') && this.cooldown <= 0) {
      const f = this.face(direction) ?? this.face(p.forward);
      if (f) {
        this.eat(input, 'interact');
        if (p.stamina >= 10) this.attach(f);
        else {
          this.say('Too tired to climb');
          this.cooldown = 0.5;
        }
      } else if (input.wasPressed('interact')) {
        const origin = new THREE.Vector3(),
          aim = new THREE.Vector3();
        cam.camera.getWorldPosition(origin);
        cam.camera.getWorldDirection(aim);
        const anchor = this.aimedAnchor(origin, aim);
        if (anchor) {
          this.eat(input, 'interact');
          if (!p.equip.items.some((i) => i.def.id === 'grapplingHook')) this.say('Carry a grappling hook to use this anchor');
          else if (!this.grappleTo(anchor.landing, anchor.point, undefined, anchor.id)) this.say('No safe grapple route or not enough stamina');
        }
      }
    }
    if (this.state) {
      cam.lockTarget = null;
      p.aiming = false;
      const s = this.state,
        drop = !input.uiMode && (input.wasPressed('dodge') || (input.held('back') && s.kind === 'hang'));
      const jump = wasAttached && !input.uiMode && input.wasPressed('jump');
      this.eat(input, 'jump', 'dodge', 'interact', 'attack', 'heavy', 'offhand', 'parry', 'cast', 'kick');
      p.vel.set(0, 0, 0);
      p.grounded = false;
      p.sprinting = false;
      p.blocking = false;
      p.traversalResetFall();
      if (drop || p.stamina <= 0) {
        this.drop();
        if (p.stamina <= 0) this.say('Grip exhausted');
        return true;
      }
      if (s.kind === 'rope') {
        if (s.trip.anchor && !grappleAnchors.has(s.trip.anchor)) {
          this.drop();
          this.say('Anchor is no longer available');
          return true;
        }
        const t = s.trip;
        s.trip.t = Math.min(1, t.t + dt / t.dur);
        const k = t.t,
          u = k < 0.72 ? k / 0.72 : (k - 0.72) / 0.28,
          e = u * u * (3 - 2 * u),
          at = k < 0.72 ? t.from.clone().lerp(t.via, e) : t.via.clone().lerp(t.to, e);
        const wanted = at.sub(p.pos),
          m = p.traversalMove(wanted);
        p.spendStamina(1 * dt);
        if (m.distanceTo(wanted) > 0.11) {
          this.drop();
          this.say('Rope path obstructed');
        } else if (k >= 1) {
          this.state = null;
          this.cooldown = 0.2;
          if (t.strike?.alive) p.strikeAt(t.strike);
        }
        return true;
      }
      const owner = s.kind === 'climb' ? s.owner : s.lip.owner;
      if (!physics.world.getCollider(owner)) {
        this.drop();
        return true;
      }
      const normal = s.kind === 'climb' ? s.normal : s.lip.normal;
      p.yaw = Math.atan2(-normal.x, -normal.z);
      if (s.kind === 'hoist') {
        s.t = Math.min(1, s.t + dt / 0.55);
        const lift = THREE.MathUtils.smoothstep(s.t, 0, 0.55),
          forward = THREE.MathUtils.smoothstep(s.t, 0.5, 1),
          at = s.from.clone().lerp(s.lip.landing, forward);
        at.y = THREE.MathUtils.lerp(s.from.y, s.lip.landing.y + 0.06, lift);
        const want = at.sub(p.pos),
          m = p.traversalMove(want);
        if (m.distanceTo(want) > 0.1) {
          this.state = { kind: 'hang', lip: s.lip };
          this.say('The ledge is blocked');
        } else if (s.t >= 1) {
          this.state = null;
          p.vel.set(0, 0, 0);
          this.cooldown = 0.2;
        }
        return true;
      }
      const vertical = input.uiMode ? 0 : Number(input.held('forward')) - Number(input.held('back')),
        side = input.uiMode ? 0 : Number(input.held('right')) - Number(input.held('left'));
      if (s.kind === 'hang') {
        p.spendStamina(3 * dt);
        if (jump || vertical > 0) {
          if (this.clear(s.lip.landing) && p.stamina >= 8) {
            p.spendStamina(8);
            this.state = { kind: 'hoist', lip: s.lip, from: p.pos.clone(), t: 0 };
          } else this.say('No room above the ledge');
        } else if (side) {
          const right = new THREE.Vector3().crossVectors(UP, normal),
            next = p.pos.clone().addScaledVector(right, side * 0.9 * dt),
            lip = this.lip(normal, next, s.lip.owner);
          if (lip) {
            s.lip = lip;
            p.traversalMove(
              lip.hang
                .clone()
                .sub(p.pos)
                .clampLength(0, 1.5 * dt)
            );
          }
        } else
          p.traversalMove(
            s.lip.hang
              .clone()
              .sub(p.pos)
              .clampLength(0, 2.2 * dt)
          );
      } else {
        const lip = this.lip(normal, p.pos, s.owner);
        if (lip && (vertical > 0 || jump)) {
          this.state = { kind: 'hang', lip };
          return true;
        }
        if (jump) {
          this.drop(true);
          return true;
        }
        p.spendStamina((vertical > 0 || side ? 12 : vertical < 0 ? 6 : 4) * dt);
        const up = UP.clone().addScaledVector(normal, -normal.y).normalize(),
          right = new THREE.Vector3().crossVectors(UP, normal).normalize(),
          delta = up.multiplyScalar(vertical * 1.45 * dt).addScaledVector(right, side * 1.0 * dt);
        const origin = p.pos
            .clone()
            .add(new THREE.Vector3(0, 0.89, 0))
            .add(delta)
            .addScaledVector(normal, 0.25),
          hit = this.ray(origin, normal.clone().negate(), 1.6);
        if (!this.suitable(hit)) {
          if (lip) this.state = { kind: 'hang', lip };
          else this.drop();
          return true;
        }
        const n = new THREE.Vector3(hit!.normal.x, hit!.normal.y, hit!.normal.z),
          spacing = 0.32 + 0.55 * Math.abs(n.y) + 0.045;
        delta.addScaledVector(n, spacing - (hit!.timeOfImpact - 0.25));
        p.traversalMove(delta.clampLength(0, 3 * dt));
        s.normal.copy(n);
        s.owner = hit!.collider.handle;
      }
      return true;
    }
    const pressedAttack = ['attack', 'heavy', 'kick', 'cast', 'originAbility'].some((a) => input.wasPressed(a as Action));
    const floor = this.ray(p.pos.clone().add(new THREE.Vector3(0, 0.2, 0)), new THREE.Vector3(0, -1, 0), 2.4);
    const magic = !!p.fieldGlide?.();
    this.gliding =
      usable &&
      !pressedAttack &&
      !p.grounded &&
      this.airClock > 0.15 &&
      p.vel.y < -0.8 &&
      input.held('jump') &&
      (magic || p.stamina > 0) &&
      (!floor || floor.timeOfImpact > 1.8) &&
      !this.ray(p.pos.clone().add(new THREE.Vector3(0, 1.8, 0)), UP, 0.7);
    if (this.gliding) {
      if (!wasGliding) events.emit('combatMove', { id: 'glide', name: 'Glide' });
      p.spendStamina((magic ? 0 : 6) * dt);
      p.traversalResetFall();
      this.brake = input.held('back');
      this.wish
        .copy(direction)
        .addScaledVector(cam.right(), (Number(input.held('right')) - Number(input.held('left'))) * 0.9)
        .normalize();
    }
    return false;
  }
  glideVelocity(dt: number, horizontal: THREE.Vector3) {
    if (!this.gliding) return;
    const speed = this.brake ? 2.6 : 6.8,
      target = this.wish.clone().multiplyScalar(speed);
    horizontal.lerp(target, 1 - Math.exp(-3.5 * dt));
    const turn = Math.atan2(horizontal.x, horizontal.z) - this.p.yaw;
    this.p.yaw += Math.atan2(Math.sin(turn), Math.cos(turn)) * (1 - Math.exp(-6 * dt));
    this.p.vel.y = Math.max(this.p.vel.y, this.p.fieldGlide?.() ? -1.8 : -2.6);
  }
}
