import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { newTargetId, targets, type HitInfo, type Target } from '../../combat/targets';
import type { Player } from '../../player/player';
import type { KitCtx } from './build';
import type { DelverPerks } from './delving';
import type { KDoor, SecretKind } from './types';

// ---------------------------------------------------------------------------
// Secrets (docs/design/dungeons.md §3 "Secrets"): cracked walls that break to
// a heavy blow, false walls that give when you push (they sound hollow when
// you stand against them), a hidden lever on a statue, and a loose tile in a
// pattern with a cache beneath. Dungeoneering's Delver's Sense (and the elf's
// Keen Sight, the dwarf's Deep Sense) make them shimmer within 10 m.
// dungeonSecretsNear() is the seam other systems ask.
// ---------------------------------------------------------------------------

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const DOOR_W = 2.2;

export interface SecretRt {
  id: string;
  kind: SecretKind;
  pos: THREE.Vector3;
  found: boolean;
  /** the shimmer shown with Delver's Sense */
  shimmer: THREE.Object3D;
  door?: KDoor;
  chest?: string;
  slab?: THREE.Mesh;
  col?: RAPIER.Collider | null;
  target?: Target;
  /** seconds stood against a false wall */
  lean: number;
  revealed: boolean;
  t: number;
}

let crackTex: THREE.Texture | null = null;
function crackedTexture() {
  if (crackTex) return crackTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(10,8,6,0.9)';
  g.lineWidth = 2.5;
  for (let k = 0; k < 5; k++) {
    g.beginPath();
    let x = 40 + Math.random() * 48, y = 20 + Math.random() * 30;
    g.moveTo(x, y);
    for (let s = 0; s < 7; s++) {
      x += (Math.random() - 0.5) * 30;
      y += 8 + Math.random() * 10;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  crackTex = new THREE.CanvasTexture(c);
  return crackTex;
}

export class SecretSet {
  readonly list: SecretRt[] = [];
  private shimmerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.4, 1.6), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  private time = 0;
  /** where the player stood last frame */
  private pp = new THREE.Vector3(1e9, 0, 0);

  constructor(private c: KitCtx) {
    for (const d of c.fg.doors) if (d.kind === 'secret') this.buildWall(d);
    for (const ch of c.fg.chests) if (ch.hidden) this.buildTile(ch.id, c.cell(ch.cell[0], ch.cell[1]), ch.room);
  }

  private markFound(s: SecretRt, how: string) {
    if (s.found) return;
    s.found = true;
    const p = this.c.progress;
    if (!p.secrets.includes(s.id)) p.secrets.push(s.id);
    if (s.door) {
      const rt = this.c.door(s.door.id);
      if (rt) rt.open = true;
    }
    this.c.hooks.mastery(this.c.hooks.perks().secretMastery ? 50 : 25);
    this.c.toast(how);
    this.c.hooks.save();
  }

  private buildWall(d: KDoor) {
    const c = this.c, m = c.theme.m, O = c.inst.origin;
    const pos = c.edgePos(d.cell, d.dir);
    const vertical = d.dir === 'e' || d.dir === 'w';
    const found = c.progress.secrets.includes(d.id);
    const into = c.fg.rooms[d.a];
    const g = c.group(into);
    const s: SecretRt = { id: d.id, kind: d.secret ?? 'cracked', pos, found, shimmer: new THREE.Group(), door: d, lean: 0, revealed: false, t: found ? 1 : 0 };
    const geo = new THREE.BoxGeometry(vertical ? 0.8 : DOOR_W + 0.1, 3.2, vertical ? DOOR_W + 0.1 : 0.8);
    const mat = s.kind === 'cracked' ? new THREE.MeshStandardMaterial({ color: 0xb0a89c, roughness: 0.95, map: crackedTexture() }) : (m.wall as THREE.Material);
    if (s.kind !== 'cracked') {
      // Match the wall's own texture so a false wall doesn't give itself away.
      const pos2 = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < pos2.count; i++) pos2.setXY(i, pos2.getX(i) * (DOOR_W / 4), pos2.getY(i) * (3.2 / 4.4));
    }
    const slab = new THREE.Mesh(geo, mat);
    slab.position.copy(pos).setY(O.y + 1.6);
    g.add(slab);
    s.slab = slab;
    if (!found) s.col = c.solidRef(pos.clone().setY(O.y + 1.6), vertical ? V(0.4, 1.6, DOOR_W / 2) : V(DOOR_W / 2, 1.6, 0.4));
    else slab.visible = false;
    // The shimmer: a faint glow over the face on both sides.
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W, 3.0), this.shimmerMat);
    sh.position.copy(pos).setY(O.y + 1.6);
    sh.rotation.y = vertical ? Math.PI / 2 : 0;
    g.add(sh);
    s.shimmer = sh;
    if (s.kind === 'cracked') {
      // Breaks to a heavy hit: a target you can swing at.
      const self = this;
      const t: Target = {
        id: newTargetId(), kind: 'secretWall', alive: !found, center: pos.clone().setY(O.y + 1.3), radius: 1.2, halfHeight: 0.9,
        position: pos.clone().setY(O.y), stunned: false, lockable: false, hp: 1, maxHp: 1,
        takeHit(h: HitInfo) {
          if (!this.alive) return;
          if (h.poise >= 55 || (h.source === 'spell' && h.damage >= 30)) {
            this.alive = false;
            targets.delete(this);
            self.breakWall(s);
          } else {
            c.fx.dust(h.at.clone(), 0.6);
            if (!s.revealed) c.toast('The cracked stone shifts. A heavier blow might bring it down.');
            s.revealed = true;
          }
        },
      };
      if (!found) targets.add(t);
      s.target = t;
    } else if (s.kind === 'false') {
      c.interact({
        pos: pos.clone(), radius: 2.2,
        label: () => 'Push the hollow-sounding wall',
        enabled: () => !s.found && (s.revealed || this.sensed(s)),
        action: () => {
          s.t = 0;
          this.openSlab(s);
          this.markFound(s, 'The false wall grinds back. A hidden way!');
        },
      });
    } else {
      // A statue in the room beside it, with the lever behind its shield.
      const [dx, dz] = d.dir === 'n' ? [0, -1] : d.dir === 's' ? [0, 1] : d.dir === 'e' ? [1, 0] : [-1, 0];
      const across = vertical ? V(0, 0, 1) : V(1, 0, 0);
      const st = pos.clone().add(V(-dx * 1.6, 0, -dz * 1.6)).addScaledVector(across, 2.4);
      const b = c.batch(into);
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 1.1), m.trim);
      plinth.position.copy(st).setY(O.y + 0.3);
      b.addObject(plinth);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 1.5, 10), m.pillar);
      body.position.copy(st).setY(O.y + 1.35);
      b.addObject(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), m.pillar);
      head.position.copy(st).setY(O.y + 2.3);
      b.addObject(head);
      c.solid(st.clone().setY(O.y + 1.1), V(0.55, 1.1, 0.55));
      const lever = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), m.iron);
      lever.position.copy(st).add(V(dx * 0.4, 0, dz * 0.4)).setY(O.y + 1.3);
      lever.rotation.x = 0.5;
      lever.visible = false;
      g.add(lever);
      const sh2 = new THREE.Sprite(c.theme.m.coldFlame);
      sh2.scale.setScalar(0.6);
      sh2.position.copy(lever.position);
      sh2.visible = false;
      g.add(sh2);
      (s as SecretRt & { lever: THREE.Mesh; glint: THREE.Sprite }).lever = lever;
      (s as SecretRt & { glint: THREE.Sprite }).glint = sh2;
      c.interact({
        pos: st.clone(), radius: 2.0,
        label: () => (s.revealed ? 'Pull the hidden lever' : 'Examine the statue'),
        enabled: () => !s.found,
        action: () => {
          if (!s.revealed) {
            s.revealed = true;
            lever.visible = true;
            c.toast('Behind the statue\'s shield, an iron lever.');
            return;
          }
          lever.rotation.x = -0.5;
          this.openSlab(s);
          this.markFound(s, 'The lever clanks. Somewhere close, stone grinds aside.');
        },
      });
    }
    this.list.push(s);
  }

  private breakWall(s: SecretRt) {
    const c = this.c, O = c.inst.origin;
    if (s.col) c.removeSolid(s.col);
    s.col = null;
    if (s.slab) s.slab.visible = false;
    // The masonry tumbles.
    c.fx.dust(s.pos.clone().setY(O.y + 1), 4);
    c.fx.add.spawn({ pos: s.pos.clone().setY(O.y + 1.4), spread: 4, count: 30, life: [0.4, 1.0], size: [0.12, 0.04], color: 0xb0a89c, color2: 0x5a544c, gravity: 9, upBias: 0.4 });
    this.markFound(s, 'The cracked wall gives way. A hidden passage!');
  }

  private openSlab(s: SecretRt) {
    if (s.col) this.c.removeSolid(s.col);
    s.col = null;
    s.t = 0.0001;
  }

  private buildTile(id: string, at: THREE.Vector3, room: number) {
    const c = this.c, m = c.theme.m, O = c.inst.origin;
    const r = c.fg.rooms[room];
    const g = c.group(r);
    const found = c.progress.secrets.includes(id);
    // A pattern of inlaid tiles, one of them loose and a shade off.
    for (let k = 0; k < 9; k++) {
      if (k === 4) continue;
      const tile = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.02, 0.55), m.trim);
      tile.position.copy(at).add(V(((k % 3) - 1) * 0.62, 0, (Math.floor(k / 3) - 1) * 0.62)).setY(O.y + 0.01);
      c.batch(r).addObject(tile);
    }
    const loose = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.5), new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 0.9 }));
    loose.position.copy(at).setY(O.y + 0.02);
    loose.rotation.y = 0.08;
    g.add(loose);
    const sh = new THREE.Sprite(c.theme.m.coldFlame);
    sh.scale.setScalar(0.5);
    sh.position.copy(at).setY(O.y + 0.3);
    sh.visible = false;
    g.add(sh);
    const s: SecretRt = { id, kind: 'tile', pos: at.clone(), found, shimmer: sh, chest: id, lean: 0, revealed: false, t: found ? 1 : 0 };
    if (found) loose.visible = false;
    c.interact({
      pos: at.clone(), radius: 1.6,
      label: () => 'Press the loose tile',
      enabled: () => !s.found,
      action: () => {
        loose.visible = false;
        c.inst.revealChest(id);
        this.markFound(s, 'The tile sinks with a click, and a chest rises from the floor.');
      },
    });
    this.list.push(s);
  }

  /** Secrets within 8-10 m shimmer for those who can sense them. */
  private sensed(s: SecretRt) {
    return this.c.hooks.perks().delverSense && s.pos.distanceTo(this.pp) < 10;
  }

  /** Unfound secrets near a point (the seam other updates ask: Keen Sight, Deep Sense). */
  near(pos: THREE.Vector3, r: number) {
    return this.list.filter((s) => !s.found && s.pos.distanceTo(pos) < r).map((s) => ({ id: s.id, kind: s.kind, pos: s.pos.clone() }));
  }

  update(dt: number, player: Player, perks: DelverPerks) {
    this.time += dt;
    this.pp.copy(player.pos);
    let any = false;
    for (const s of this.list) {
      const d = s.pos.distanceTo(player.pos);
      const show = !s.found && perks.delverSense && d < 10;
      if (show) any = true;
      if (s.kind === 'tile' || s.kind === 'lever') {
        const glint = s.kind === 'lever' ? (s as SecretRt & { glint: THREE.Sprite }).glint : (s.shimmer as THREE.Sprite);
        if (glint) glint.visible = show;
        if (s.kind === 'lever') s.shimmer.visible = show;
      } else s.shimmer.visible = show;
      // A false wall sounds hollow if you stand against it a while.
      if (s.kind === 'false' && !s.found && !s.revealed && d < 1.8) {
        s.lean += dt;
        if (s.lean > 1.5) {
          s.revealed = true;
          this.c.toast('The stones here sound hollow.');
        }
      }
      // Opening slabs slide down into the floor.
      if (s.slab && s.t > 0 && s.t < 1) {
        s.t = Math.min(1, s.t + dt * 0.6);
        s.slab.position.y = this.c.inst.origin.y + 1.6 - 3.3 * s.t;
        if (Math.random() < dt * 10) this.c.fx.dust(s.pos.clone().setY(this.c.inst.origin.y + 0.2), 0.5);
        if (s.t >= 1) s.slab.visible = false;
      }
    }
    this.shimmerMat.opacity = any ? 0.1 + Math.sin(this.time * 3) * 0.06 : 0;
  }

  dispose() {
    for (const s of this.list) if (s.target) targets.delete(s.target);
    this.shimmerMat.dispose();
  }
}
