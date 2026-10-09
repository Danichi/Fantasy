import * as THREE from 'three';
import { mulberry32 } from '../../core/math';
import type { Player } from '../../player/player';
import type { KitCtx, Mob } from './build';
import type { MobKind } from './rooms';
import { DV, type Dir, type KDoor, type KRoom, type PuzzleKind } from './types';

// ---------------------------------------------------------------------------
// Puzzles (docs/design/dungeons.md §3 "Puzzles"): what wing B's mechanism is.
//   dial     turn three rings of a Sunwheel to match a carving seen elsewhere
//   mirrors  turn mirrors so a beam of daylight reaches a crystal
//   weights  stand on the plates in the order carved on another wall
//   bells    ring them in the order of the hymn heard in the chapel
//   lever    an old lever (the plain mechanism)
// Each has a fallback: break the seal by force, a hard fight that opens the
// same door, so nobody is stuck forever.
// ---------------------------------------------------------------------------

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const SYMBOLS = ['sun', 'moon', 'star'] as const;
const BELLS = ['low', 'middle', 'high'] as const;
const PITCH = { low: 196, middle: 294, high: 440 };

let actx: AudioContext | null = null;
/** A struck bell: a few inharmonic partials dying away. */
function bellTone(freq: number, delay = 0) {
  try {
    actx ??= new AudioContext();
    const c = actx, t = c.currentTime + 0.02 + delay;
    for (const [k, a] of [[1, 0.25], [2.4, 0.12], [3.9, 0.06]] as const) {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = freq * k;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(a, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2 / k);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + 2.4);
    }
  } catch {
    // no audio (tests, a muted tab)
  }
}

function symbolTexture(sym: string, label = '') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#6a665e';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = g.fillStyle = '#e8d8a0';
  g.lineWidth = 6;
  g.beginPath();
  if (sym === 'sun') {
    g.arc(64, 64, 22, 0, Math.PI * 2);
    for (let a = 0; a < 8; a++) {
      g.moveTo(64 + Math.cos((a * Math.PI) / 4) * 30, 64 + Math.sin((a * Math.PI) / 4) * 30);
      g.lineTo(64 + Math.cos((a * Math.PI) / 4) * 46, 64 + Math.sin((a * Math.PI) / 4) * 46);
    }
    g.stroke();
  } else if (sym === 'moon') {
    g.arc(64, 64, 34, Math.PI * 0.3, Math.PI * 1.7);
    g.arc(78, 64, 26, Math.PI * 1.55, Math.PI * 0.45, true);
    g.fill();
  } else {
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 16 : 40, a = (k / 10) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  }
  if (label) {
    g.font = 'bold 22px Georgia';
    g.fillText(label, 8, 120);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The Sunwheel with three rings, each marked at one of its eight rays. */
function dialTexture(marks: number[]) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#5e5a52';
  g.fillRect(0, 0, 256, 256);
  g.translate(128, 128);
  g.strokeStyle = '#d8c890';
  g.lineWidth = 5;
  for (const r of [110, 80, 50]) {
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.lineWidth = 3;
  for (let a = 0; a < 8; a++) {
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.sin((a * Math.PI) / 4) * 118, -Math.cos((a * Math.PI) / 4) * 118);
    g.stroke();
  }
  g.fillStyle = '#ffcf60';
  marks.forEach((m, k) => {
    const r = [110, 80, 50][k];
    g.beginPath();
    g.arc(Math.sin((m * Math.PI) / 4) * r, -Math.cos((m * Math.PI) / 4) * r, 10, 0, Math.PI * 2);
    g.fill();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];

export class PuzzleSet {
  kind: PuzzleKind | null = null;
  id = '';
  room: KRoom | null = null;
  solved = false;
  /** the answer (tests read it): dial marks, plate order, bell order, mirror orientations */
  answer: number[] = [];
  /** the current state of the dial rings, mirrors, plates stepped, bells rung */
  state: number[] = [];
  private objs: THREE.Object3D[] = [];
  private beam: THREE.Group | null = null;
  private challengers: Mob[] | null = null;
  private platePos: THREE.Vector3[] = [];
  private onPlate = -1;
  private time = 0;
  private hymnHeard = false;
  private mirrorCells: { i: number; j: number }[] = [];
  private src: { i: number; j: number; dir: Dir } | null = null;
  private crystal: { i: number; j: number } | null = null;
  private crystalMat: THREE.MeshStandardMaterial | null = null;

  constructor(private c: KitCtx) {
    const mech = c.fg.plan.mechanism;
    if (!mech || c.fg.mechRoom === null) return;
    this.kind = mech.kind;
    this.id = mech.id;
    this.room = c.fg.rooms[c.fg.mechRoom];
    this.solved = c.progress.mech.includes(mech.id);
    const rnd = mulberry32(c.inst.seed * 101 + c.floor);
    if (this.kind === 'dial') this.buildDial(rnd);
    else if (this.kind === 'mirrors') this.buildMirrors(rnd);
    else if (this.kind === 'weights') this.buildWeights(rnd);
    else if (this.kind === 'bells') this.buildBells(rnd);
    else this.buildLever();
    if (this.kind !== 'lever') this.buildFallback();
  }

  /** What a sealed door says when you try it. */
  hint(d: KDoor) {
    if (!this.kind || !(d.mech ?? []).includes(this.id)) return 'The door is sealed by some mechanism elsewhere.';
    const what = { dial: 'a Sunwheel dial', mirrors: 'a beam of light', weights: 'weighted plates', bells: 'bells', lever: 'an old lever' }[this.kind];
    return `Sealed. Its mechanism is somewhere on this floor: ${what}.`;
  }

  private solve(msg: string) {
    if (this.solved) return;
    this.solved = true;
    this.c.hooks.mastery(40);
    this.c.toast(msg);
    this.c.solve(this.id);
  }

  // ---- the Sunwheel dial ----------------------------------------------------------------------
  private buildDial(rnd: () => number) {
    const c = this.c, r = this.room!, m = c.theme.m, O = c.inst.origin;
    this.answer = [Math.floor(rnd() * 8), Math.floor(rnd() * 8), Math.floor(rnd() * 8)];
    this.state = this.solved ? [...this.answer] : this.answer.map((a) => (a + 2 + Math.floor(rnd() * 5)) % 8);
    const ctr = c.centre(r);
    c.mesh(r, new THREE.CylinderGeometry(1.0, 1.15, 1.0, 16), m.trim, ctr.x, O.y + 0.5, ctr.z);
    c.solid(ctr.clone().setY(O.y + 0.5), V(1.0, 0.5, 1.0));
    const g = c.group(r);
    const rings: THREE.Group[] = [];
    [0.95, 0.68, 0.4].forEach((rad, k) => {
      const ring = new THREE.Group();
      const torus = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.07, 6, 28), m.brass);
      torus.rotation.x = Math.PI / 2;
      const notch = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.22), m.rune);
      notch.position.set(0, 0.05, -rad);
      ring.add(torus, notch);
      ring.position.copy(ctr).setY(O.y + 1.04 + k * 0.03);
      g.add(ring);
      rings.push(ring);
    });
    // Eight rays cut into the plinth top (the ring's notch points at one).
    for (let a = 0; a < 8; a++) {
      const ray = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.25), m.dark);
      ray.position.copy(ctr).add(V(Math.sin((a * Math.PI) / 4) * 1.05, 0, -Math.cos((a * Math.PI) / 4) * 1.05)).setY(O.y + 1.01);
      ray.rotation.y = -(a * Math.PI) / 4;
      g.add(ray);
    }
    const sync = () => rings.forEach((ring, k) => (ring.rotation.y = -(this.state[k] * Math.PI) / 4));
    sync();
    this.objs.push(...rings);
    const names = ['outer', 'middle', 'inner'];
    names.forEach((n, k) => {
      const a = (k / 3) * Math.PI * 2;
      c.interact({
        pos: ctr.clone().add(V(Math.cos(a) * 1.8, 0, Math.sin(a) * 1.8)),
        radius: 1.4,
        label: () => `Turn the ${n} ring`,
        enabled: () => !this.solved,
        action: () => {
          this.turn(k);
          sync();
        },
      });
    });
    // The clue: the same wheel carved in another room, its rays marked.
    const clue = c.fg.clueRoom !== null ? c.fg.rooms[c.fg.clueRoom] : null;
    if (clue) {
      const f = c.faces(clue).find((q) => q.dir === 'n') ?? c.faces(clue)[0];
      if (f) {
        const p = f.pos.clone().addScaledVector(f.inward, 0.06).setY(O.y + 2.0);
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshStandardMaterial({ map: dialTexture(this.answer), roughness: 0.9 }));
        plate.position.copy(p);
        plate.rotation.y = Math.atan2(f.inward.x, f.inward.z);
        c.group(clue).add(plate);
        c.flame(clue, p.clone().addScaledVector(f.inward, 0.8).setY(O.y + 1.2), 'candle', 0.6);
        c.interact({
          pos: p.clone().addScaledVector(f.inward, 1.2).setY(O.y), radius: 1.8,
          label: () => 'Study the carved wheel',
          enabled: () => true,
          action: () => c.toast(`The wheel's rings are marked: outer at the ${ORD[this.answer[0]]} ray, middle at the ${ORD[this.answer[1]]}, inner at the ${ORD[this.answer[2]]}.`),
        });
      }
    }
  }

  /** Turn a ring of the dial one ray clockwise. */
  turn(k: number) {
    if (this.solved || this.kind !== 'dial') return;
    this.state[k] = (this.state[k] + 1) % 8;
    bellTone(110 + k * 30);
    if (this.state.every((v, i) => v === this.answer[i])) this.solve('The rings lock into place. Somewhere, a seal releases.');
  }

  // ---- light and mirrors ----------------------------------------------------------------------
  private buildMirrors(rnd: () => number) {
    const c = this.c, r = this.room!, m = c.theme.m, O = c.inst.origin;
    const { x, y, w, h } = r.rect;
    // Daylight comes in at one corner heading along the long side; two mirrors turn it to the crystal.
    const x1 = x + w - 1, y1 = y + h - 1;
    this.src = { i: x, j: y, dir: 'e' };
    this.mirrorCells = [{ i: x1, j: y }, { i: x1, j: y1 }];
    this.crystal = { i: x, j: y1 };
    this.answer = [1, 0]; // '\' turns east to south, '/' turns south to west
    this.state = this.solved ? [1, 0] : [Math.floor(rnd() * 2) + 2, (Math.floor(rnd() * 3) + 1) % 4];
    if (!this.solved && this.state[0] === 1 && this.state[1] === 0) this.state[1] = 2;
    c.shaft(r, c.cell(x, y).add(V(-0.6, 0, 0)), 0.7);
    const g = c.group(r);
    const mirrors: THREE.Group[] = [];
    for (const mc of this.mirrorCells) {
      const p = c.cell(mc.i, mc.j);
      const stand = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.6, 0.12), m.brass);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.4), new THREE.MeshStandardMaterial({ color: 0xd8f0ff, metalness: 1, roughness: 0.05 }));
      glass.position.z = 0.07;
      frame.position.y = glass.position.y = 1.3;
      stand.add(frame, glass);
      stand.position.copy(p).setY(O.y);
      g.add(stand);
      mirrors.push(stand);
      c.mesh(r, new THREE.CylinderGeometry(0.1, 0.25, 0.5, 8), m.iron, p.x, O.y + 0.25, p.z);
    }
    const sync = () => mirrors.forEach((mm, k) => (mm.rotation.y = Math.PI / 4 + (this.state[k] * Math.PI) / 2));
    sync();
    const cp = c.cell(this.crystal.i, this.crystal.j);
    this.crystalMat = new THREE.MeshStandardMaterial({ color: 0x8ad8ff, emissive: 0x2a6aa0, emissiveIntensity: 0.4, roughness: 0.2 });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), this.crystalMat);
    crystal.scale.y = 1.8;
    crystal.position.copy(cp).setY(O.y + 1.3);
    g.add(crystal);
    c.mesh(r, new THREE.CylinderGeometry(0.4, 0.5, 0.8, 8), m.trim, cp.x, O.y + 0.4, cp.z);
    this.objs.push(crystal);
    this.beam = new THREE.Group();
    g.add(this.beam);
    mirrors.forEach((mm, k) => c.interact({
      pos: mm.position.clone(), radius: 1.8,
      label: () => 'Turn the mirror',
      enabled: () => !this.solved,
      action: () => {
        this.rotate(k);
        sync();
      },
    }));
    this.traceBeam();
  }

  rotate(k: number) {
    if (this.solved || this.kind !== 'mirrors') return;
    this.state[k] = (this.state[k] + 1) % 4;
    if (this.traceBeam()) this.solve('The beam strikes the crystal and it blazes. A seal releases.');
  }

  /** Follow the light through the room; true if it reaches the crystal. */
  private traceBeam() {
    if (!this.src || !this.beam || !this.crystal) return false;
    const c = this.c, O = c.inst.origin, r = this.room!;
    for (const ch of [...this.beam.children]) this.beam.remove(ch);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.4), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    let { i, j, dir } = this.src;
    let from = c.cell(i, j).add(V(-1.6, 0, 0)).setY(O.y + 1.3);
    let hit = false;
    for (let step = 0; step < 12; step++) {
      const k = this.mirrorCells.findIndex((q) => q.i === i && q.j === j);
      const at = c.cell(i, j).setY(O.y + 1.3);
      if (k >= 0 && step > 0) {
        const o = this.state[k];
        const slash: Partial<Record<Dir, Dir>> = { e: 'n', n: 'e', w: 's', s: 'w' };
        const back: Partial<Record<Dir, Dir>> = { e: 's', s: 'e', w: 'n', n: 'w' };
        const nd = o === 0 ? slash[dir] : o === 1 ? back[dir] : undefined;
        this.segment(from, at, mat);
        if (!nd) return false;
        from = at;
        dir = nd;
      } else if (this.crystal.i === i && this.crystal.j === j && step > 0) {
        this.segment(from, at, mat);
        hit = true;
        break;
      }
      const [dx, dy] = DV[dir];
      const ni = i + dx, nj = j + dy;
      if (ni < r.rect.x || nj < r.rect.y || ni >= r.rect.x + r.rect.w || nj >= r.rect.y + r.rect.h) {
        this.segment(from, at.clone().add(V(dx * 1.6, 0, dy * 1.6)), mat);
        break;
      }
      i = ni;
      j = nj;
    }
    if (this.crystalMat) this.crystalMat.emissiveIntensity = hit ? 3 : 0.4;
    return hit;
  }

  private segment(a: THREE.Vector3, b: THREE.Vector3, mat: THREE.Material) {
    const len = a.distanceTo(b);
    if (len < 0.01) return;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 6), mat);
    m.position.copy(a).lerp(b, 0.5);
    m.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
    this.beam!.add(m);
  }

  // ---- weights ----------------------------------------------------------------------------------
  private buildWeights(rnd: () => number) {
    const c = this.c, r = this.room!, m = c.theme.m, O = c.inst.origin;
    const order = [0, 1, 2].sort(() => rnd() - 0.5);
    this.answer = order;
    this.state = [];
    const ctr = c.centre(r);
    const s = c.size(r);
    const along = s.w >= s.d ? V(1, 0, 0) : V(0, 0, 1);
    const g = c.group(r);
    for (let k = 0; k < 3; k++) {
      const p = ctr.clone().addScaledVector(along, (k - 1) * Math.min(2.6, (Math.max(s.w, s.d) - 2) / 3));
      const plate = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 1.3), new THREE.MeshStandardMaterial({ map: symbolTexture(SYMBOLS[k]), roughness: 0.8 }));
      plate.position.copy(p).setY(O.y + 0.04);
      g.add(plate);
      this.objs.push(plate);
      this.platePos.push(p);
    }
    // The clue: the symbols in order, carved over the clue room's door.
    const clue = c.fg.clueRoom !== null ? c.fg.rooms[c.fg.clueRoom] : null;
    if (clue) {
      const f = c.faces(clue)[0];
      if (f) order.forEach((sym, k) => {
        const p = f.pos.clone().addScaledVector(f.inward, 0.06).addScaledVector(f.along, (k - 1) * 1.0).setY(O.y + 2.3);
        const tile = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshStandardMaterial({ map: symbolTexture(SYMBOLS[sym], ['I', 'II', 'III'][k]), roughness: 0.9 }));
        tile.position.copy(p);
        tile.rotation.y = Math.atan2(f.inward.x, f.inward.z);
        c.group(clue).add(tile);
      });
      const f0 = c.faces(clue)[0];
      if (f0) c.interact({
        pos: f0.pos.clone().addScaledVector(f0.inward, 1.3), radius: 1.8,
        label: () => 'Read the carved symbols',
        enabled: () => true,
        action: () => c.toast(`Carved in order: ${order.map((k) => SYMBOLS[k]).join(', then ')}.`),
      });
    }
    void m;
  }

  /** Stand on plate k. */
  step(k: number) {
    if (this.solved || this.kind !== 'weights') return;
    if (this.state.includes(k)) return;
    this.state.push(k);
    (this.objs[k] as THREE.Mesh).position.y = this.c.inst.origin.y + 0.0;
    bellTone(150 + k * 40);
    const n = this.state.length;
    if (this.state[n - 1] !== this.answer[n - 1]) {
      this.state = [];
      for (const o of this.objs) o.position.y = this.c.inst.origin.y + 0.04;
      this.c.toast('The plates spring back up with a clank. Wrong order.');
      return;
    }
    if (n === 3) this.solve('The third plate sinks home. Chains rattle in the walls; a seal releases.');
  }

  // ---- bells ------------------------------------------------------------------------------------
  private buildBells(rnd: () => number) {
    const c = this.c, r = this.room!, m = c.theme.m, O = c.inst.origin, H = c.theme.wallH;
    this.answer = Array.from({ length: 4 }, () => Math.floor(rnd() * 3));
    if (this.answer.every((v) => v === this.answer[0])) this.answer[1] = (this.answer[0] + 1) % 3;
    this.state = [];
    const ctr = c.centre(r);
    const g = c.group(r);
    for (let k = 0; k < 3; k++) {
      const p = ctr.clone().add(V((k - 1) * 1.7, 0, 0));
      const size = [0.75, 0.55, 0.4][k];
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.45, size, size * 1.3, 14, 1, true), m.brass);
      bell.position.copy(p).setY(O.y + 2.4);
      g.add(bell);
      this.objs.push(bell);
      c.mesh(r, new THREE.CylinderGeometry(0.03, 0.03, H - 3.0, 4), m.iron, p.x, O.y + 3.05 + (H - 3.0) / 2, p.z);
      c.interact({
        pos: p.clone(), radius: 1.2,
        label: () => `Ring the ${BELLS[k]} bell`,
        enabled: () => !this.solved,
        action: () => this.ring(k),
      });
    }
  }

  /** Ring bell k (0 low, 1 middle, 2 high). */
  ring(k: number) {
    if (this.solved || this.kind !== 'bells') return;
    bellTone(PITCH[BELLS[k]]);
    (this.objs[k] as THREE.Mesh).userData.swing = 1;
    this.state.push(k);
    const n = this.state.length;
    if (this.state[n - 1] !== this.answer[n - 1]) {
      this.state = [];
      this.c.toast('The bells clash. That is not the hymn.');
      return;
    }
    if (n === this.answer.length) this.solve('The last note hangs in the air. A seal releases.');
  }

  /** The hymn, heard when you first come into the chapel (the clue room). */
  private playHymn() {
    this.answer.forEach((k, i) => bellTone(PITCH[BELLS[k]], i * 0.9));
    this.c.toast(`Somewhere, bells toll a hymn: ${this.answer.map((k) => BELLS[k]).join(', ')}.`);
  }

  // ---- lever ------------------------------------------------------------------------------------
  private buildLever() {
    const c = this.c, r = this.room!, m = c.theme.m, O = c.inst.origin;
    const f = c.faces(r)[0];
    const p = (f ? f.pos.clone().addScaledVector(f.inward, 0.6) : c.centre(r)).setY(O.y);
    c.mesh(r, new THREE.BoxGeometry(0.9, 0.34, 0.9), m.brass, p.x, O.y + 0.17, p.z);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.8, 0.16), m.iron);
    arm.position.copy(p).setY(O.y + 1.05);
    arm.rotation.z = this.solved ? 0.5 : -0.5;
    c.group(r).add(arm);
    this.answer = [1];
    this.state = [this.solved ? 1 : 0];
    c.interact({
      pos: p.clone(), radius: 2.2,
      label: () => 'Pull the old lever',
      enabled: () => !this.solved,
      action: () => {
        arm.rotation.z = 0.5;
        this.state = [1];
        this.solve('The lever groans over. Chains run in the walls; a seal releases.');
      },
    });
  }

  // ---- the fallback: a hard fight ------------------------------------------------------------------
  private buildFallback() {
    const c = this.c, r = this.room!;
    const f = c.faces(r)[c.faces(r).length - 1];
    const p = (f ? f.pos.clone().addScaledVector(f.inward, 1.2) : c.centre(r)).setY(c.inst.origin.y);
    c.interact({
      pos: p, radius: 1.6,
      label: () => (this.challengers ? 'The guardians are awake' : 'Break the seal by force (a hard fight)'),
      enabled: () => !this.solved && !this.challengers,
      action: () => this.challenge(),
    });
  }

  /** Wake the mechanism's guardians: kill them all and the seal breaks anyway. */
  challenge() {
    if (this.solved || this.challengers || !this.room) return;
    const kinds: MobKind[] = this.c.inst.def.theme === 'cave' ? ['bandit', 'crossbow', 'bandit'] : this.c.inst.def.theme === 'drowned' ? ['armour', 'zombie', 'armour'] : ['armour', 'orc', 'armour'];
    const ctr = this.c.centre(this.room);
    this.challengers = kinds.map((k, i) => this.c.spawnNow(k, ctr.clone().add(V((i - 1) * 1.8, 0, 1.0)), this.room!.id));
    this.c.toast('The mechanism shrieks. Its guardians come for you.');
  }

  update(dt: number, player: Player) {
    this.time += dt;
    if (!this.kind) return;
    // The hymn plays the first time you come into the clue room.
    if (this.kind === 'bells' && !this.hymnHeard && this.c.fg.clueRoom !== null && this.c.inst.room === this.c.fg.clueRoom) {
      this.hymnHeard = true;
      this.playHymn();
    }
    if (this.kind === 'weights' && !this.solved) {
      const k = this.platePos.findIndex((p) => Math.abs(p.x - player.pos.x) < 0.7 && Math.abs(p.z - player.pos.z) < 0.7);
      if (k !== this.onPlate && k >= 0 && player.grounded) this.step(k);
      this.onPlate = k;
    }
    if (this.kind === 'bells') for (const b of this.objs) {
      const s = (b.userData.swing ?? 0) as number;
      if (s > 0) {
        b.userData.swing = Math.max(0, s - dt * 0.8);
        b.rotation.z = Math.sin(this.time * 9) * 0.3 * s;
      }
    }
    if (this.challengers && !this.solved && this.challengers.every((m) => !m.obj.alive)) this.solve('The last guardian falls, and the seal cracks with it.');
  }

  dispose() {
    this.objs = [];
  }
}
