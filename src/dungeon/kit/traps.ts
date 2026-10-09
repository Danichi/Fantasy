import * as THREE from 'three';
import { segmentPointDistance } from '../../core/math';
import type { Player } from '../../player/player';
import type { KitCtx } from './build';
import type { DelverPerks } from './delving';
import { CELL } from './rooms';
import { DV, type Cell, type KTrap } from './types';

// ---------------------------------------------------------------------------
// Traps (docs/design/dungeons.md §3 "Traps"): pressure plates that loose darts
// or drop a portcullis on an ambush, swinging blades, floors that give way
// into a pit, gas vents and a rolling stone. Every trap has a tell for a
// careful eye (a raised plate edge, a slot in the wall, a slot in the ceiling
// and scratches on the floor, cracked tiles, a grate with a green haze, a
// groove down the passage). Dungeoneering's Trap Sense outlines them within
// 8 m and lets you disarm what you see; Light Feet keeps plates quiet at a walk.
// ---------------------------------------------------------------------------

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export interface TrapRt {
  t: KTrap;
  /** the cell that sets it off */
  plate: Cell | null;
  /** the tell, and the Trap Sense outline */
  tell: THREE.Object3D[];
  outline: THREE.LineSegments;
  disarmed: boolean;
  /** times it has gone off */
  fired: number;
  cool: number;
  /** per-kind state */
  s: Record<string, any>;
}

let crackTex: THREE.Texture | null = null;
function cracks() {
  if (crackTex) return crackTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(20,16,12,0.85)';
  g.lineWidth = 2;
  for (let k = 0; k < 7; k++) {
    g.beginPath();
    let x = 64, y = 64;
    g.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (Math.random() - 0.5) * 34;
      y += (Math.random() - 0.5) * 34;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  crackTex = new THREE.CanvasTexture(c);
  return crackTex;
}

export class TrapSet {
  readonly list: TrapRt[] = [];
  private outlineMat = new THREE.LineBasicMaterial({ color: new THREE.Color(2.2, 0.9, 0.2), transparent: true, opacity: 0.9, depthTest: false });
  private dartMesh: THREE.Mesh[] = [];
  private gasT = 0;

  constructor(private c: KitCtx) {
    for (const t of c.fg.traps) this.build(t);
  }

  private build(t: KTrap) {
    const c = this.c, m = c.theme.m, O = c.inst.origin;
    const room = c.fg.rooms[t.room];
    const g = c.group(room);
    const at = c.cell(t.cell[0], t.cell[1]);
    const rt: TrapRt = { t, plate: t.cell, tell: [], outline: null!, disarmed: c.progress.traps.includes(t.id), fired: 0, cool: 0, s: {} };
    const plateMat = new THREE.MeshStandardMaterial({ color: 0x3a3632, metalness: 0.8, roughness: 0.55 });
    const plate = (size = 1.3) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(size, 0.05, size), plateMat);
      p.position.copy(at).setY(O.y + 0.025);
      g.add(p);
      rt.tell.push(p);
      rt.s.plate = p;
      return p;
    };
    let outlineBox = new THREE.Box3(at.clone().add(V(-0.7, 0, -0.7)), at.clone().add(V(0.7, 0.15, 0.7)));
    if (t.kind === 'darts') {
      plate();
      const from = c.cell(t.from![0], t.from![1]);
      const dir = from.clone().sub(at).setY(0).normalize();
      // The slot in the far wall.
      const slotPos = from.clone().addScaledVector(dir, CELL / 2 - 0.42).setY(O.y + 1.2);
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.1), m.dark);
      slot.position.copy(slotPos);
      slot.lookAt(at.clone().setY(O.y + 1.2));
      g.add(slot);
      rt.tell.push(slot);
      rt.s.from = slotPos;
      rt.s.to = at.clone().setY(O.y + 1.2);
      rt.s.darts = [] as { mesh: THREE.Mesh; pos: THREE.Vector3; vel: THREE.Vector3; hit: boolean; life: number }[];
    } else if (t.kind === 'portcullis') {
      plate();
      // The bars wait over the room's way in (the door you came through).
      const d = c.fg.doors.find((q) => (q.a === t.room || q.b === t.room) && q.kind === 'open');
      if (d) {
        const p = c.edgePos(d.cell, d.dir);
        const vertical = d.dir === 'e' || d.dir === 'w';
        const bars = new THREE.Group();
        for (let k = -3; k <= 3; k++) {
          const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.0, 6), m.iron);
          b.position.set(vertical ? 0 : k * 0.33, 1.5, vertical ? k * 0.33 : 0);
          bars.add(b);
        }
        bars.position.copy(p).setY(O.y + 3.0);
        g.add(bars);
        // The tell: grooves in the doorposts.
        rt.s.bars = bars;
        rt.s.door = p;
        rt.s.vertical = vertical;
      }
    } else if (t.kind === 'blade') {
      const H = c.theme.wallH;
      const along = t.dir === 'e' || t.dir === 'w' ? V(1, 0, 0) : V(0, 0, 1);
      const pivot = new THREE.Group();
      pivot.position.copy(at).setY(O.y + H - 0.2);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, H - 1.4, 6), m.iron);
      arm.position.y = -(H - 1.4) / 2;
      const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.05, 20, 1, false, Math.PI * 0.75, Math.PI * 0.5), m.iron);
      blade.rotation.z = Math.PI / 2;
      blade.position.y = -(H - 1.2);
      pivot.add(arm, blade);
      // Swings across the passage (you time your crossing).
      pivot.rotation.order = 'YXZ';
      pivot.rotation.y = Math.atan2(along.x, along.z);
      g.add(pivot);
      rt.s.pivot = pivot;
      rt.s.blade = blade;
      // The tell: a slot in the ceiling and scratches on the floor.
      const slot = new THREE.Mesh(new THREE.BoxGeometry(along.x ? 0.12 : 3.2, 0.05, along.z ? 0.12 : 3.2), m.dark);
      slot.position.copy(at).setY(O.y + H - 0.03);
      g.add(slot);
      for (let k = -2; k <= 2; k++) {
        const sc = new THREE.Mesh(new THREE.BoxGeometry(along.x ? 0.03 : 2.4, 0.01, along.z ? 0.03 : 2.4), m.dark);
        sc.position.copy(at).add(along.clone().multiplyScalar(k * 0.06)).setY(O.y + 0.01);
        g.add(sc);
        rt.tell.push(sc);
      }
      rt.tell.push(slot);
      rt.plate = null;
      outlineBox = new THREE.Box3(at.clone().add(V(-1.6, 0, -1.6)), at.clone().add(V(1.6, 2.2, 1.6)));
      rt.s.phase = Math.random() * 6;
    } else if (t.kind === 'collapse') {
      // Cracked tiles over a pit: the floor holds for a moment, then goes.
      const cr = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), new THREE.MeshStandardMaterial({ map: cracks(), color: 0x9a948a, roughness: 0.9 }));
      cr.rotation.x = -Math.PI / 2;
      cr.position.copy(at).setY(O.y + 0.005);
      g.add(cr);
      rt.tell.push(cr);
      rt.s.lidMesh = cr;
      rt.s.lid = c.solidRef(at.clone().setY(O.y - 0.15), V(CELL / 2, 0.15, CELL / 2));
      // The pit beneath: a floor, walls and a ramp of rubble back up into the room.
      const depth = 2.4;
      c.solid(at.clone().setY(O.y - depth - 0.25), V(CELL / 2, 0.25, CELL / 2));
      const bottom = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), m.floor);
      bottom.rotation.x = -Math.PI / 2;
      bottom.position.copy(at).setY(O.y - depth);
      g.add(bottom);
      for (const d of ['n', 's', 'e', 'w'] as const) {
        const [dx, dz] = DV[d];
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(CELL, depth), m.wall);
        wall.position.copy(at).add(V((dx * CELL) / 2, -depth / 2, (dz * CELL) / 2));
        wall.lookAt(at.clone().setY(O.y - depth / 2));
        g.add(wall);
        c.solid(at.clone().add(V((dx * (CELL + 0.4)) / 2, -depth / 2 - 0.2, (dz * (CELL + 0.4)) / 2)), V(dx ? 0.2 : CELL / 2, depth / 2, dz ? 0.2 : CELL / 2));
      }
      // The ramp climbs toward a neighbouring cell of the same room.
      const nb = (['e', 'w', 's', 'n'] as const).find((d) => {
        const [dx, dy] = DV[d];
        const i = t.cell[0] + dx, j = t.cell[1] + dy;
        return i >= room.rect.x && j >= room.rect.y && i < room.rect.x + room.rect.w && j < room.rect.y + room.rect.h;
      }) ?? 'e';
      const [dx, dz] = DV[nb];
      const len = Math.hypot(CELL, depth);
      const slope = Math.atan2(depth, CELL);
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, len), m.rock);
      const side = V(dz, 0, dx).multiplyScalar(1.1);
      ramp.position.copy(at).add(side).setY(O.y - depth / 2 - 0.1);
      ramp.rotation.order = 'YXZ';
      ramp.rotation.y = Math.atan2(dx, dz);
      ramp.rotation.x = -slope;
      g.add(ramp);
      const q = new THREE.Quaternion().setFromEuler(ramp.rotation);
      c.solidRef(ramp.position.clone(), V(0.7, 0.15, len / 2), q);
      rt.s.open = false;
      outlineBox = new THREE.Box3(at.clone().add(V(-CELL / 2, 0, -CELL / 2)), at.clone().add(V(CELL / 2, 0.1, CELL / 2)));
    } else if (t.kind === 'gas') {
      const grate = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.03, 1.2), m.dark);
      grate.add(base);
      for (let k = -2; k <= 2; k++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.06), new THREE.MeshStandardMaterial({ color: 0x4a5a38, metalness: 0.6, roughness: 0.6 }));
        bar.position.set(0, 0.02, k * 0.22);
        grate.add(bar);
      }
      grate.position.copy(at).setY(O.y + 0.015);
      g.add(grate);
      rt.tell.push(grate);
      rt.s.cloud = 0;
    } else if (t.kind === 'boulder') {
      // A stone in a niche at the passage's end, and a groove worn down its length.
      const along = t.dir === 'e' ? V(1, 0, 0) : V(0, 0, 1);
      const rect = room.rect;
      const n = Math.max(rect.w, rect.h);
      const start = at.clone(); // the far end (the grammar puts the trap there)
      const end = start.clone().addScaledVector(along, -(n - 1) * CELL);
      const ball = new THREE.Mesh(new THREE.DodecahedronGeometry(1.0, 1), m.rock);
      ball.position.copy(start).addScaledVector(along, 0.6).setY(O.y + 1.0);
      g.add(ball);
      const groove = new THREE.Mesh(new THREE.BoxGeometry(along.x ? (n - 0.4) * CELL : 0.5, 0.012, along.z ? (n - 0.4) * CELL : 0.5), m.dark);
      groove.position.copy(start.clone().lerp(end, 0.5)).setY(O.y + 0.006);
      g.add(groove);
      rt.tell.push(groove, ball);
      const mid = Math.floor(n / 2);
      rt.plate = along.x ? [rect.x + mid - (rect.x + n - 1 === t.cell[0] ? 0 : 0), t.cell[1]] : [t.cell[0], rect.y + mid];
      const pc = c.cell(rt.plate[0], rt.plate[1]);
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 1.3), plateMat);
      p.position.copy(pc).setY(O.y + 0.025);
      g.add(p);
      rt.tell.push(p);
      rt.s = { ball, start: ball.position.clone(), end: end.clone().addScaledVector(along, -0.6).setY(O.y + 1.0), dir: along.clone().negate(), rolling: false, t: 0, hit: false, plate: p };
      outlineBox = new THREE.Box3().setFromObject(p).expandByScalar(0.1);
    }
    // Trap Sense: a hot outline round the trap.
    const box3 = outlineBox;
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(box3.max.x - box3.min.x, box3.max.y - box3.min.y + 0.02, box3.max.z - box3.min.z));
    rt.outline = new THREE.LineSegments(geo, this.outlineMat);
    rt.outline.position.copy(box3.getCenter(V(0, 0, 0)));
    rt.outline.renderOrder = 5;
    rt.outline.visible = false;
    g.add(rt.outline);
    // Disarm what you can see.
    c.interact({
      pos: at.clone(),
      radius: 2.0,
      label: () => 'Disarm the trap',
      enabled: () => !rt.disarmed && rt.outline.visible && t.kind !== 'collapse',
      action: () => {
        rt.disarmed = true;
        if (!c.progress.traps.includes(t.id)) c.progress.traps.push(t.id);
        c.hooks.mastery(15);
        c.toast('You jam the mechanism. The trap is safe.');
        c.hooks.save();
      },
    });
    this.list.push(rt);
  }

  /** Has this collapsing floor (cell index) given way? */
  pitOpen(k: number) {
    const w = this.c.fg.w;
    return this.list.some((r) => r.t.kind === 'collapse' && r.s.open && r.t.cell[1] * w + r.t.cell[0] === k);
  }

  /** Set a trap off (tests, and the plates). */
  fire(rt: TrapRt, player?: Player) {
    const O = this.c.inst.origin;
    rt.fired++;
    if (rt.t.kind === 'darts') {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 5).rotateX(Math.PI / 2), this.c.theme.m.iron);
      const pos = (rt.s.from as THREE.Vector3).clone();
      const vel = (rt.s.to as THREE.Vector3).clone().sub(pos).normalize().multiplyScalar(24);
      mesh.position.copy(pos);
      mesh.lookAt(rt.s.to);
      this.c.inst.group.add(mesh);
      rt.s.darts.push({ mesh, pos, vel, hit: false, life: 1.4 });
      rt.cool = 1.6;
    } else if (rt.t.kind === 'portcullis' && rt.s.bars) {
      rt.s.down = 6.5;
      const vertical = rt.s.vertical;
      rt.s.col ??= this.c.solidRef((rt.s.door as THREE.Vector3).clone().setY(O.y + 1.6), vertical ? V(0.25, 1.6, 1.1) : V(1.1, 1.6, 0.25));
      this.c.toast('A portcullis slams down behind you!');
      // The ambush.
      const room = this.c.fg.rooms[rt.t.room];
      const kinds = this.c.inst.def.mobs(this.c.floor);
      if (kinds.length) for (let k = 0; k < 2; k++) this.c.spawnNow(kinds[k % kinds.length], this.c.centre(room).add(V((k - 0.5) * 2, 0, 1.2)), room.id);
      rt.cool = 30;
    } else if (rt.t.kind === 'collapse') {
      rt.s.crack = 0.6;
      rt.cool = 999;
    } else if (rt.t.kind === 'gas') {
      rt.s.cloud = 4;
      rt.cool = 7;
    } else if (rt.t.kind === 'boulder') {
      rt.s.rolling = true;
      rt.s.hit = false;
      rt.cool = 10;
      this.c.toast('A rumble behind you...');
    }
    void player;
  }

  update(dt: number, player: Player, perks: DelverPerks) {
    const pp = player.pos, O = this.c.inst.origin;
    const [pi, pj] = this.c.inst.cellAt(pp);
    const hurt = (dmg: number, from: THREE.Vector3, parryable = false, poise = 40) => player.receiveAttack({ damage: Math.round(dmg * perks.trapDmg), from, parryable, poise });
    this.gasT += dt;
    for (const rt of this.list) {
      rt.cool = Math.max(0, rt.cool - dt);
      const near = rt.outline.parent ? rt.outline.getWorldPosition(V(0, 0, 0)).distanceTo(pp) : 99;
      rt.outline.visible = perks.trapSense && !rt.disarmed && near < 8 && !(rt.t.kind === 'collapse' && rt.s.open);
      const onPlate = !!rt.plate && pi === rt.plate[0] && pj === rt.plate[1] && player.grounded && !player.dead;
      const quiet = perks.lightFeet && !player.sprinting;
      if (onPlate && !rt.disarmed && rt.cool <= 0 && !(quiet && rt.t.kind !== 'collapse')) this.fire(rt, player);
      // Plates sink a little while stood on.
      if (rt.s.plate) (rt.s.plate as THREE.Mesh).position.y = O.y + (onPlate ? 0.005 : 0.025);
      switch (rt.t.kind) {
        case 'darts':
          for (const d of rt.s.darts) {
            const prev = d.pos.clone();
            d.pos.addScaledVector(d.vel, dt);
            d.mesh.position.copy(d.pos);
            d.life -= dt;
            const a = pp.clone().setY(pp.y + 0.4), b = pp.clone().setY(pp.y + 1.6);
            if (!d.hit && Math.min(segmentPointDistance(a, b, d.pos), segmentPointDistance(a, b, prev.lerp(d.pos, 0.5))) < 0.38) {
              d.hit = true;
              d.life = 0;
              hurt(16, d.pos.clone(), true, 20);
            }
          }
          for (const d of rt.s.darts.filter((q: { life: number }) => q.life <= 0)) this.c.inst.group.remove(d.mesh);
          rt.s.darts = rt.s.darts.filter((q: { life: number }) => q.life > 0);
          break;
        case 'portcullis':
          if (rt.s.bars) {
            const down = (rt.s.down = Math.max(0, (rt.s.down ?? 0) - dt));
            const bars = rt.s.bars as THREE.Group;
            const want = down > 0 ? O.y : O.y + 3.0;
            bars.position.y += (want - bars.position.y) * Math.min(1, dt * (down > 0 ? 14 : 1.2));
            if (down <= 0 && rt.s.col) {
              this.c.removeSolid(rt.s.col);
              rt.s.col = null;
            }
          }
          break;
        case 'blade': {
          const pivot = rt.s.pivot as THREE.Group;
          const a = Math.sin(this.gasT * 1.7 + rt.s.phase) * 1.15;
          pivot.rotation.x = rt.disarmed ? 0 : a;
          if (rt.disarmed) break;
          const tip = (rt.s.blade as THREE.Mesh).getWorldPosition(V(0, 0, 0));
          const s1 = pp.clone().setY(pp.y + 0.3), s2 = pp.clone().setY(pp.y + 1.7);
          if (rt.cool <= 0 && segmentPointDistance(s1, s2, tip) < 0.8) {
            hurt(28, tip, false, 70);
            this.c.fx.sparks(tip.clone());
            rt.cool = 0.9;
            rt.fired++;
          }
          break;
        }
        case 'collapse':
          if (rt.s.crack > 0) {
            rt.s.crack -= dt;
            if (Math.random() < dt * 30) this.c.fx.dust(this.c.cell(rt.t.cell[0], rt.t.cell[1]).setY(O.y + 0.1), 0.6);
            if (rt.s.crack <= 0) {
              rt.s.open = true;
              this.c.removeSolid(rt.s.lid);
              (rt.s.lidMesh as THREE.Mesh).visible = false;
              this.c.fx.dust(this.c.cell(rt.t.cell[0], rt.t.cell[1]).setY(O.y - 1), 3);
              this.c.toast('The floor gives way!');
            }
          }
          if (rt.s.open && !rt.s.landed && pi === rt.t.cell[0] && pj === rt.t.cell[1] && pp.y < O.y - 1.6 && player.grounded) {
            rt.s.landed = true;
            hurt(12, pp.clone().add(V(0, 2, 0.01)), false, 30);
          }
          break;
        case 'gas':
          if (rt.s.cloud > 0) {
            rt.s.cloud -= dt;
            const at = this.c.cell(rt.t.cell[0], rt.t.cell[1]);
            if (Math.random() < dt * 40) this.c.fx.alpha.spawn({ pos: at.clone().setY(O.y + 0.4), spread: 1.6, count: 1, life: [1, 2], size: [0.5, 1.2], color: 0x8ab04a, alpha: 0.35, upBias: 0.3, drag: 1 });
            if (pp.distanceTo(at) < 2.4 && perks.gasDmg > 0 && !player.dead) player.takeDamage(7 * dt * perks.gasDmg * perks.trapDmg);
          } else if (!rt.disarmed && Math.random() < dt * 1.5) {
            // The tell: a faint green haze over the grate.
            const at = this.c.cell(rt.t.cell[0], rt.t.cell[1]);
            this.c.fx.alpha.spawn({ pos: at.clone().setY(O.y + 0.15), spread: 0.4, count: 1, life: [1, 1.6], size: [0.15, 0.3], color: 0x8ab04a, alpha: 0.2, upBias: 0.2, drag: 1 });
          }
          break;
        case 'boulder': {
          const s = rt.s;
          if (!s.rolling) break;
          const ball = s.ball as THREE.Mesh;
          ball.position.addScaledVector(s.dir, 9 * dt);
          ball.rotateOnWorldAxis(new THREE.Vector3(s.dir.z, 0, -s.dir.x).normalize(), (-9 * dt) / 1.0);
          if (!s.hit && ball.position.distanceTo(pp.clone().setY(pp.y + 0.9)) < 1.5) {
            s.hit = true;
            hurt(35, ball.position.clone().addScaledVector(s.dir, -1), false, 120);
            player.vel.addScaledVector(s.dir, 8);
          }
          const toEnd = (s.end as THREE.Vector3).clone().sub(ball.position).dot(s.dir);
          if (toEnd <= 0) {
            this.c.fx.dust(ball.position.clone().setY(O.y + 0.3), 3);
            s.rolling = false;
            ball.position.copy(s.start);
          }
          break;
        }
      }
    }
  }

  dispose() {
    for (const d of this.dartMesh) d.removeFromParent();
    this.outlineMat.dispose();
  }
}
