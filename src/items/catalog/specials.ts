import * as THREE from 'three';
import type { Player } from '../../player/player';
import type { SkillRuntime } from '../../paths/skills';
import type { ArmsRuntime } from '../../combat/armsRuntime';
import type { ItemDef } from '../itemDefs';
import { targets, type Target } from '../../combat/targets';
import { events } from '../../core/events';
import { stealth } from '../../origins/stealth';
import { DISC } from '../../paths/data';
import { treeOf } from '../../paths/paths';
import { Allies } from './allies';
import { throwable, knock } from '../../combat/impacts';

// The catalog's one-of-a-kind items, worked as they should be: the
// grappling hook hauls you up a cliff; tripwires and caltrops wait on the
// ground for whoever comes; a decoy doll holds a foe's eye while you slip away;
// a Waterwalk scroll lets you stride over water; the Draught of Remembering
// unlearns a node so you can spend the point again; Wenna's flask refills;
// Mara's pot serves a meal a day; the Bell of the Glen calls the Watch.

export interface SpecialDeps {
  scene: THREE.Scene;
  player: Player;
  rt: SkillRuntime;
  arms: ArmsRuntime;
  toast: (m: string) => void;
  camera: THREE.Camera;
  /** static geometry only: the distance to the first hit, or null */
  castRay: (origin: THREE.Vector3, dir: THREE.Vector3, max: number) => number | null;
  day: () => number;
  flags: Record<string, boolean | number | string>;
  /** a conversation with choices */
  choose: (title: string, text: string, options: { label: string; run: () => void }[]) => void;
  /** the sea beast fighting your ship, calmed for `sec` (false: none near) */
  calmSea?: (sec: number) => boolean;
}

interface Trap {
  kind: 'tripwire' | 'caltrops';
  at: THREE.Vector3;
  left: number;
  obj: THREE.Object3D;
  r: number;
  dmg: number;
  tick: number;
}

export class Specials {
  readonly allies: Allies;
  /** a pull on the grappling rope in progress */
  get pull() { return this.d.player.adventure.rope; }
  /** why the last throw failed (tests) */
  lastFail = '';
  traps: Trap[] = [];
  decoys: { obj: THREE.Object3D; left: number }[] = [];
  private flaskT = 0;
  /** numbers for tests */
  readonly stats = { grapples: 0, trapHits: 0, respecs: 0 };

  constructor(private d: SpecialDeps) {
    const ground = (x: number, z: number, y: number) => {
      const hit = d.castRay(new THREE.Vector3(x, y + 2.5, z), new THREE.Vector3(0, -1, 0), 8);
      return hit === null ? y : y + 2.5 - hit;
    };
    this.allies = new Allies(d.scene, d.player, d.rt, ground);
    events.on('playerDied', () => {
      this.allies.clear();
      this.endPull();
    });
  }

  // ---- the grappling hook --------------------------------------------------------------------
  /** Throw the hook where you are looking; it bites a ledge and hauls you to the top. */
  grapple(range = 30) {
    const d = this.d, p = d.player;
    this.lastFail = '';
    if (this.pull || p.mounted || p.vehicle || p.dead) {
      this.lastFail = 'busy';
      return false;
    }
    const origin = new THREE.Vector3(), dir = new THREE.Vector3();
    d.camera.getWorldPosition(origin);
    d.camera.getWorldDirection(dir);
    const camGap = origin.distanceTo(p.center);
    const dist = d.castRay(origin, dir, range + camGap);
    // A foe on the line: a light one is yanked to you, a heavy one pulls you in to a strike.
    const foe = this.foeOnLine(origin, dir, Math.min(dist ?? range + camGap, 22 + camGap), camGap);
    if (foe) return this.hookFoe(foe);
    const anchor = p.adventure.aimedAnchor(origin, dir);
    if (anchor) return this.haul(anchor.landing, anchor.point, undefined, anchor.id);
    if (dist === null || dist < camGap * 0.6) {
      d.toast('The hook falls back: nothing to bite within 30 m.');
      this.lastFail = 'nothing';
      return false;
    }
    const hook = origin.clone().addScaledVector(dir, dist);
    // Look for a top just past where it bit: a ledge, a cliff edge, a roof. A few
    // steps further in, in case the very lip is under eaves or branches.
    const flat = new THREE.Vector3(dir.x, 0, dir.z);
    if (flat.lengthSq() < 1e-4) flat.set(p.forward.x, 0, p.forward.z);
    flat.normalize();
    let top: THREE.Vector3 | null = null, why = 'no top';
    for (const step of [0.5, 1.0, 1.6, 2.4]) {
      const probe = hook.clone().addScaledVector(flat, step).setY(hook.y + 6.5);
      const down = d.castRay(probe, new THREE.Vector3(0, -1, 0), 8);
      if (down === null) continue;
      const at = probe.clone().setY(probe.y - down + 0.05);
      if (at.y < p.pos.y - 1) {
        why = 'below';
        continue;
      }
      // Room to stand.
      if (d.castRay(at.clone().setY(at.y + 0.2), new THREE.Vector3(0, 1, 0), 1.7) !== null) {
        why = 'no room';
        continue;
      }
      top = at;
      break;
    }
    if (!top) {
      d.toast(why === 'below' ? 'The hook is for climbing, not for jumping off things.' : why === 'no room' ? 'No room to stand where the hook bit.' : 'The hook bites, but there is nothing to stand on up there.');
      this.lastFail = why;
      return false;
    }
    return this.haul(top, hook);
  }
  private haul(to: THREE.Vector3, hook: THREE.Vector3, strike?: Target, anchor?: string) {
    const p = this.d.player;
    const ok = p.adventure.grappleTo(to, hook, strike, anchor);
    if (ok) this.stats.grapples++;
    else {
      this.lastFail = p.stamina < 12 ? 'stamina' : 'blocked route';
      this.d.toast(p.stamina < 12 ? 'The grapple needs 12 stamina.' : 'No clear route for the rope. Move back or aim at another ledge.');
    }
    return ok;
  }
  /** The nearest live foe whose body the aim line passes within a metre of. */
  private foeOnLine(origin: THREE.Vector3, dir: THREE.Vector3, max: number, minD: number): Target | null {
    let best: Target | null = null, bd = Infinity;
    for (const t of targets) {
      if (!t.alive || !t.lockable) continue;
      const rel = t.center.clone().sub(origin);
      const along = rel.dot(dir);
      if (along < minD || along > max) continue;
      const off = rel.addScaledVector(dir, -along).length();
      if (off > t.radius + 0.9) continue;
      if (along < bd) (bd = along), (best = t);
    }
    return best;
  }

  private hookFoe(t: Target): boolean {
    const p = this.d.player;
    if (throwable(t)) {
      this.stats.grapples++;
      this.flashRope(t.center);
      // Yank: off its feet and across to you.
      const to = p.pos.clone().sub(t.position).setY(0);
      const dist = to.length();
      knock(t, to, Math.min(15, 4 + dist * 1.6), 10);
      const b = t as Target & { vel?: THREE.Vector3 };
      if (b.vel) b.vel.y = Math.max(b.vel.y, 3.2);
      t.stunned = true;
      t.onBreak?.(1.1);
      events.emit('combatMove', { id: 'hookYank', name: 'Hook Yank' });
      return true;
    }
    // Zip: too heavy to move, so the rope moves you, and you arrive cutting.
    const to = t.position.clone().sub(p.pos).setY(0);
    const len = to.length();
    const end = p.pos.clone().addScaledVector(to.normalize(), Math.max(0, len - t.radius - 1.3));
    end.y = Math.max(p.pos.y, t.position.y);
    if (!this.haul(end, t.center, t)) return false;
    events.emit('combatMove', { id: 'hookZip', name: 'Hook Zip' });
    return true;
  }

  /** A rope that snaps out to `at` and fades (the yank). */
  private flashRope(at: THREE.Vector3) {
    const p = this.d.player;
    const geo = new THREE.BufferGeometry().setFromPoints([p.center.clone(), at.clone()]);
    const mat = new THREE.LineBasicMaterial({ color: 0x6a5032, transparent: true });
    const line = new THREE.Line(geo, mat);
    this.d.scene.add(line);
    this.flashes.push({ line, left: 0.3 });
  }
  private flashes: { line: THREE.Line; left: number }[] = [];

  private endPull() { if (this.pull) this.d.player.adventure.cancel(); }

  // ---- traps and decoys -------------------------------------------------------------------------
  place(kind: Trap['kind'], r: number, dmg: number, sec: number) {
    const at = this.d.player.pos.clone();
    const g = new THREE.Group();
    if (kind === 'tripwire') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.5, 0.03, 6, 32), new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.7 }));
      ring.rotation.x = -Math.PI / 2;
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.05, 7), new THREE.MeshStandardMaterial({ color: 0x6a6a72, emissive: 0xffd060, emissiveIntensity: 0.6 }));
      g.add(ring, stone);
    } else {
      const m = new THREE.MeshStandardMaterial({ color: 0x5a5650, metalness: 0.7, roughness: 0.4 });
      for (let i = 0; i < 24; i++) {
        const c = new THREE.Mesh(new THREE.TetrahedronGeometry(0.06), m);
        const a = Math.random() * Math.PI * 2, dd = Math.sqrt(Math.random()) * r;
        c.position.set(Math.cos(a) * dd, 0.03, Math.sin(a) * dd);
        c.rotation.set(Math.random() * 3, Math.random() * 3, 0);
        g.add(c);
      }
    }
    g.position.copy(at).setY(at.y + 0.02);
    this.d.scene.add(g);
    this.traps.push({ kind, at, left: sec, obj: g, r, dmg, tick: 0 });
  }

  decoy(sec: number) {
    const at = this.d.player.pos.clone();
    const g = new THREE.Group();
    const straw = new THREE.MeshStandardMaterial({ color: 0xd8c080, roughness: 0.95 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 1.0, 8), straw);
    body.position.y = 0.6;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), straw);
    head.position.y = 1.3;
    const arms = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 6), straw);
    arms.rotation.z = Math.PI / 2;
    arms.position.y = 0.9;
    const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.8, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0x5a3a22, side: THREE.DoubleSide }));
    cloak.position.y = 0.75;
    g.add(body, head, arms, cloak);
    g.position.copy(at);
    this.d.scene.add(g);
    this.decoys.push({ obj: g, left: sec });
    stealth.gearVeil = Math.max(stealth.gearVeil, sec);
  }

  // ---- the Draught of Remembering -------------------------------------------------------------
  /** Unlearn one tree node (one with nothing learned after it): its point comes back to spend again. */
  remember(def: ItemDef) {
    const d = this.d, P = d.player.paths;
    const leaves: { disc: string; nid: string; name: string }[] = [];
    for (const [disc, nodes] of Object.entries(P.nodes)) {
      const D = DISC[disc], t = D && treeOf(D);
      if (!t) continue;
      for (const nid of Object.keys(nodes ?? {})) {
        const n = t.map[nid];
        if (!n || n.type === 'center') continue;
        const hasChild = Object.keys(nodes).some((o) => t.map[o]?.parent === nid);
        if (!hasChild) leaves.push({ disc, nid, name: n.type === 'choice' ? n.name.split('|')[nodes[nid].pick ?? 0] : n.name });
      }
    }
    if (!leaves.length) {
      d.toast('You remember everything you ever learned, and there is nothing to unlearn.');
      d.player.equip.add(def.id, 1);
      return;
    }
    const opts = leaves.slice(-8).reverse().map((l) => ({
      label: `Forget ${l.name} (${DISC[l.disc].name})`,
      run: () => {
        delete P.nodes[l.disc][l.nid];
        this.stats.respecs++;
        events.emit('pathsChanged', {});
        d.toast(`${l.name} fades. Its point is yours to spend again (${DISC[l.disc].name}).`);
      },
    }));
    opts.push({ label: 'Remember it all, and keep the draught.', run: () => void d.player.equip.add(def.id, 1) });
    d.choose('The Draught of Remembering', 'Everything you have learned comes back at once, and one thing can be let go. Which?', opts);
  }

  // ---- the flask, the pot and the bell ----------------------------------------------------------
  /** Wenna's flask: three draughts, and it fills again (one draught every few minutes). */
  flaskCharges() {
    return Number(this.d.flags['wennaFlask'] ?? 3);
  }
  flask(_def: ItemDef) {
    const d = this.d, p = d.player, n = this.flaskCharges();
    if (n <= 0) return d.toast('The flask is dry. It fills again by itself, slowly.');
    d.flags['wennaFlask'] = n - 1;
    p.heal(p.maxHp * 0.45);
    p.stamina = Math.min(p.maxStamina, p.stamina + 50);
    p.mana = Math.min(p.maxMana, p.mana + 40);
    d.toast(`Wenna's flask: ${n - 1} draught${n - 1 === 1 ? '' : 's'} left in it.`);
  }
  /** Once a day: a pot of whatever Mara would have made. */
  pot(_def: ItemDef) {
    const d = this.d;
    if (Number(d.flags['marasPot'] ?? -1) === d.day()) return d.toast('The pot is empty for today. It will be full again tomorrow.');
    d.flags['marasPot'] = d.day();
    d.player.heal(80);
    d.arms.buffs.set('meal', { id: 'meal', label: 'Mara\'s Stew', left: 900, m: { hp: 40, stamina: 30, melee: 0.08, staminaRegen: 0.2 } });
    d.toast('The pot is full of Mara\'s stew, hot, as if she\'d just set it down. Well fed for 15 min.');
  }
  /** Once a day: the Glen's watchmen come when the bell rings. */
  bell(_def: ItemDef) {
    const d = this.d;
    if (Number(d.flags['glenBell'] ?? -1) === d.day()) return d.toast('The bell will not ring again today.');
    d.flags['glenBell'] = d.day();
    const k = 1 + d.player.prog.level * 0.05;
    this.allies.summon('watchman', 3, 60, Math.round(22 * k));
    d.toast('You ring the bell. Far off, the Glen answers: three grey watchmen step out of the air beside you.');
  }

  /** A great sea beast fighting your ship goes still (a Siren Bell). */
  calmSea(sec: number) {
    return this.d.calmSea?.(sec) ?? false;
  }

  // ---- per step ----------------------------------------------------------------------------------
  update(dt: number) {
    const d = this.d, p = d.player;
    this.allies.update(dt);
    for (const f of this.flashes) {
      f.left -= dt;
      (f.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, f.left / 0.3);
      if (f.left <= 0) {
        this.d.scene.remove(f.line);
        f.line.geometry.dispose();
        (f.line.material as THREE.Material).dispose();
      }
    }
    this.flashes = this.flashes.filter((f) => f.left > 0);
    // Traps wait for whoever comes.
    for (const t of this.traps) {
      t.left -= dt;
      if (t.kind === 'tripwire') {
        const flat = (x: Target) => Math.hypot(x.position.x - t.at.x, x.position.z - t.at.z);
        const hit = [...targets].filter((x) => x.alive && flat(x) < t.r * 0.5 + x.radius && Math.abs(x.position.y - t.at.y) < 3);
        if (hit.length) {
          const all = [...targets].filter((x) => x.alive && flat(x) < t.r + x.radius && Math.abs(x.position.y - t.at.y) < 3);
          for (const x of all) {
            d.rt.hit(x, t.dmg, { poise: 200, stun: true, type: 'arcane', noVerdict: true });
            x.stunned = true;
          }
          d.rt.vfx.ring(t.at, 'light', t.r);
          this.stats.trapHits += all.length;
          t.left = 0;
        }
      } else if ((t.tick -= dt) <= 0) {
        t.tick = 0.5;
        for (const x of targets) {
          if (!x.alive || Math.hypot(x.position.x - t.at.x, x.position.z - t.at.z) > t.r + x.radius || Math.abs(x.position.y - t.at.y) > 3) continue;
          d.rt.bleed(x, t.dmg);
          this.stats.trapHits++;
        }
      }
    }
    this.traps = this.traps.filter((t) => {
      if (t.left > 0) return true;
      d.scene.remove(t.obj);
      return false;
    });
    for (const dc of this.decoys) dc.left -= dt;
    this.decoys = this.decoys.filter((dc) => {
      if (dc.left > 0) return true;
      d.scene.remove(dc.obj);
      return false;
    });
    // Wenna's flask fills again: a draught every four minutes, up to three.
    if (this.flaskCharges() < 3) {
      this.flaskT += dt;
      if (this.flaskT > 240) {
        this.flaskT = 0;
        d.flags['wennaFlask'] = this.flaskCharges() + 1;
      }
    }
    // Waterwalk: count down.
    if (p.waterWalk > 0) p.waterWalk = Math.max(0, p.waterWalk - dt);
  }

  /** A target the traps or allies are on (tests). */
  near(at: THREE.Vector3, r: number): Target[] {
    return [...targets].filter((t) => t.alive && t.position.distanceTo(at) < r);
  }
}
