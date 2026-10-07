import * as THREE from 'three';
import { SEA_LEVEL } from '../worldMap';
import { waveAt, windAt } from './seaState';
import { Ship, NO_CONTROL, NEUTRAL_PERKS } from './ship';
import { STOCK_FIT, type HullId } from './shipTypes';

// The Port Aurelle Regatta (docs/design/boating.md §11): three races against
// Captain Marisol Quint, the harbour's champion, each in boats the regatta
// provides so it's skill against skill. The Harbour Cup in skiffs round the
// harbour; the Lighthouse Run in cutters out round the lighthouse; the Stream
// Race out into the Aurelle Stream and home. Round the buoys in order; the
// first across the line wins.

export type CourseId = 'harbourCup' | 'lighthouseRun' | 'streamRace';
interface Course { id: CourseId; name: string; hull: HullId; level: number; buoys: [number, number][]; start: [number, number]; rival: number; prize: number; xp: number; say: [string, string] }

export const COURSES: Course[] = [
  { id: 'harbourCup', name: 'The Harbour Cup', hull: 'skiff', level: 1, start: [3060, 260], buoys: [[3170, 110], [3330, -50], [3470, 150], [3320, 390], [3070, 270]], rival: 0.88, prize: 150, xp: 120,
    say: ['"Skiffs, round the harbour buoys. I\'ve won it nine years running, sweetheart. Try to keep up."', '"Well! Beaten in my own harbour. The Lighthouse Run is a different thing, mind."'] },
  { id: 'lighthouseRun', name: 'The Lighthouse Run', hull: 'cutter', level: 8, start: [3060, 260], buoys: [[3020, -140], [3300, -360], [3800, -120], [3700, 440], [3070, 270]], rival: 0.98, prize: 400, xp: 300,
    say: ['"Cutters, out round the light and the outer marks. The wind does what it likes out there."', '"Twice. You\'ve twice beaten me. Nobody\'s done that. The Stream Race, then, if you dare it."'] },
  { id: 'streamRace', name: 'The Stream Race', hull: 'brigantine', level: 15, start: [3110, 300], buoys: [[3900, 620], [4550, 1050], [4300, 1650], [3600, 950], [3110, 310]], rival: 1.06, prize: 1000, xp: 700,
    say: ['"Brigantines, out to the Aurelle Stream and home. Open water. If the pirates come, you sail through them."', '"Three for three. Take my pennant, Captain. You\'ve earned the harbour\'s name, and mine."'] },
];

/** What the regatta needs from the sailing system. */
export interface RegattaHost {
  scene: THREE.Scene;
  board(ship: Ship): void;
  takeHelm(): void;
  leaveShip(land: THREE.Vector3): void;
  readonly current: Ship | null;
  toast(m: string): void;
  xp(n: number, why?: string): void;
  gold(n: number): void;
  give(id: string, n: number): void;
  level(): number;
  save(): void;
}

const LANDING = new THREE.Vector3(2930, 0, 300); // Mira's wharf

export class Regatta {
  wins = new Set<CourseId>();
  race: {
    course: Course;
    mine: Ship;
    rival: Ship;
    buoys: THREE.Group[];
    next: number;
    rivalNext: number;
    t: number;
    countdown: number;
    rivalTack: number;
  } | null = null;
  private ring: THREE.Mesh;

  constructor(private host: RegattaHost) {
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(6, 0.35, 8, 32), new THREE.MeshStandardMaterial({ color: 0xffd76a, emissive: 0xffb020, emissiveIntensity: 1.2 }));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.visible = false;
    host.scene.add(this.ring);
  }

  /** Mira's options: enter a race (the next one you haven't won, and any you have). */
  options(show: (t: string, o: { label: string; run: () => void }[]) => void, back: () => void) {
    if (this.race) return [];
    return [{
      label: 'The Port Aurelle Regatta',
      run: () => show('Captain Marisol Quint holds every cup in the harbour. Boats are provided: it\'s your hands against hers.', [
        ...COURSES.map((c, i) => {
          const open = i === 0 || this.wins.has(COURSES[i - 1].id);
          const lvl = this.host.level() >= c.level;
          return {
            label: `${c.name} (${c.hull === 'brigantine' ? 'brigantines' : c.hull + 's'})${this.wins.has(c.id) ? ' — won' : ''}${!open ? ' — win the one before first' : !lvl ? ` — Seamanship ${c.level}` : ` — ${c.prize}g purse`}`,
            run: () => {
              if (!open || !lvl) return show(!open ? 'One race at a time, Captain. Beat her in the one before.' : `You'll need Seamanship ${c.level} to handle a ${c.hull} in a race.`, [{ label: 'Back.', run: back }]);
              this.start(c.id);
            },
          };
        }),
        { label: 'Back.', run: back },
      ]),
    }];
  }

  start(id: CourseId) {
    const c = COURSES.find((x) => x.id === id)!;
    const [sx, sz] = c.start;
    const first = c.buoys[0];
    const yaw = Math.atan2(first[0] - sx, first[1] - sz);
    const port = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const mine = new Ship(this.host.scene, c.hull, STOCK_FIT(), { name: 'The Regatta ' + (c.hull === 'skiff' ? 'Skiff' : c.hull === 'cutter' ? 'Cutter' : 'Brig'), hullColor: 0xd8d4cc, trim: 0x24467e });
    mine.owner = 'npc';
    mine.pos.set(sx, 0, sz).addScaledVector(port, -(mine.beam + 6));
    mine.yaw = yaw;
    mine.place();
    mine.place();
    const rival = new Ship(this.host.scene, c.hull, STOCK_FIT(), { name: 'Quint\'s ' + (c.hull === 'skiff' ? 'Kittiwake' : c.hull === 'cutter' ? 'Swift' : 'Sovereign'), hullColor: 0x8a1a1a, trim: 0xe8c060 });
    rival.owner = 'npc';
    rival.crew = rival.def.crewMax;
    rival.perks = { ...NEUTRAL_PERKS, sailDrive: c.rival, tackWindow: 1.5 };
    rival.pos.set(sx, 0, sz).addScaledVector(port, rival.beam + 6);
    rival.yaw = yaw;
    rival.place();
    const buoys = c.buoys.map(([x, z], i) => {
      const g = new THREE.Group();
      const last = i === c.buoys.length - 1;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 2.4, 10), new THREE.MeshStandardMaterial({ color: last ? 0xf2f2f2 : 0xd83a2a, roughness: 0.5 }));
      body.position.y = 0.6;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.4, 10), new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }));
      band.position.y = 0.9;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 6), new THREE.MeshStandardMaterial({ color: 0x3a2a1e }));
      pole.position.y = 3.2;
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.8, 1.2), new THREE.MeshStandardMaterial({ color: last ? 0x141414 : 0xffd76a, side: THREE.DoubleSide }));
      flag.position.set(0, 4.2, 0.6);
      g.add(body, band, pole, flag);
      g.position.set(x, SEA_LEVEL, z);
      this.host.scene.add(g);
      return g;
    });
    this.race = { course: c, mine, rival, buoys, next: 0, rivalNext: 0, t: 0, countdown: 5, rivalTack: 1 };
    this.host.board(mine);
    this.host.takeHelm();
    this.host.toast(`${c.say[0]} The gun fires in five...`);
  }

  /** Every simulation step while racing. */
  update(dt: number) {
    const r = this.race;
    if (!r) return;
    const { mine, rival, course } = r;
    for (const b of r.buoys) b.position.y = SEA_LEVEL + waveAt(b.position.x, b.position.z).y - 0.3;
    if (r.countdown > 0) {
      const before = Math.ceil(r.countdown);
      r.countdown -= dt;
      mine.speed = 0;
      rival.speed = 0;
      if (Math.ceil(r.countdown) !== before && r.countdown > 0) this.host.toast(`${Math.ceil(r.countdown)}...`);
      if (r.countdown <= 0) this.host.toast('BANG! They\'re off!');
      rival.update(dt, { ...NO_CONTROL(), sail: 0 }, { skill: 0.8, assisted: true });
      return;
    }
    r.t += dt;
    // The rival: steer for the next mark, tacking up any beat.
    const target = course.buoys[Math.min(r.rivalNext, course.buoys.length - 1)];
    let want = Math.atan2(target[0] - rival.pos.x, target[1] - rival.pos.z);
    const w = windAt(rival.pos.x, rival.pos.z);
    const into = Math.atan2(-w.dir.x, -w.dir.y);
    const rel = Math.atan2(Math.sin(want - into), Math.cos(want - into));
    if (Math.abs(rel) < 0.85) {
      // Beat: hold a close-hauled tack, going about now and then.
      if (Math.random() < dt / 25) r.rivalTack *= -1;
      want = into + r.rivalTack * 0.9;
    }
    const err = Math.atan2(Math.sin(want - rival.yaw), Math.cos(want - rival.yaw));
    rival.update(dt, { ...NO_CONTROL(), sail: 1, rudder: Math.max(-1, Math.min(1, -err * 2)) }, { skill: 0.8, assisted: true });
    if (Math.hypot(rival.pos.x - target[0], rival.pos.z - target[1]) < 24) r.rivalNext++;
    // You: round the marks in order.
    const mark = course.buoys[r.next];
    if (mark && Math.hypot(mine.pos.x - mark[0], mine.pos.z - mark[1]) < 24) {
      r.next++;
      if (r.next < course.buoys.length) this.host.toast(`Mark ${r.next} rounded! ${r.next === course.buoys.length - 1 ? 'Now for the finish line!' : `On to mark ${r.next + 1}.`}`);
    }
    const nextMark = course.buoys[r.next];
    if (nextMark) {
      this.ring.visible = true;
      this.ring.position.set(nextMark[0], SEA_LEVEL + 0.4, nextMark[1]);
      this.ring.rotation.z = r.t;
    }
    // The finish.
    const youDone = r.next >= course.buoys.length;
    const herDone = r.rivalNext >= course.buoys.length;
    if (youDone || herDone) return this.finish(youDone);
    // Forfeit: she sinks, you leave her, or it drags on.
    if (mine.sunk || this.host.current !== mine || r.t > 900) this.finish(false, true);
  }

  private finish(won: boolean, forfeit = false) {
    const r = this.race!;
    const c = r.course;
    const mins = Math.floor(r.t / 60), secs = Math.round(r.t % 60);
    if (forfeit) this.host.toast(`You're out of ${c.name}.`);
    else if (won) {
      const first = !this.wins.has(c.id);
      this.wins.add(c.id);
      this.host.gold(c.prize);
      this.host.xp(first ? c.xp : Math.round(c.xp / 3), `won ${c.name}`);
      this.host.toast(`You win ${c.name} in ${mins}:${String(secs).padStart(2, '0')}! ${c.prize}g purse. Quint: ${c.say[1]}`);
      if (c.id === 'streamRace' && first) this.host.give('regattaPennant', 1);
    } else this.host.toast(`Quint crosses the line ahead of you. "Better luck next year, sweetheart." (${mins}:${String(secs).padStart(2, '0')})`);
    this.end();
    this.host.save();
  }

  /** Back to the wharf; the race boats and marks are taken in. */
  end() {
    const r = this.race;
    if (!r) return;
    this.race = null;
    this.ring.visible = false;
    if (this.host.current === r.mine) this.host.leaveShip(LANDING);
    r.mine.dispose();
    r.rival.dispose();
    for (const b of r.buoys) this.host.scene.remove(b);
  }

  /** HUD lines while racing. */
  notes(ship: Ship) {
    const r = this.race;
    if (!r || ship !== r.mine) return [];
    const mark = r.course.buoys[r.next];
    const out = [`${r.course.name}: ${Math.floor(r.t / 60)}:${String(Math.floor(r.t % 60)).padStart(2, '0')}`];
    if (mark) {
      const d = Math.hypot(mark[0] - ship.pos.x, mark[1] - ship.pos.z);
      const b = Math.round(((Math.atan2(mark[0] - ship.pos.x, -(mark[1] - ship.pos.z)) * 180) / Math.PI + 360) % 360);
      out.push(`${r.next === r.course.buoys.length - 1 ? 'Finish' : `Mark ${r.next + 1}/${r.course.buoys.length - 1}`}: ${Math.round(d)} m, bearing ${b}°`);
    }
    out.push(r.rivalNext > r.next ? `Quint leads (mark ${Math.min(r.rivalNext + 1, r.course.buoys.length)})` : r.rivalNext < r.next ? 'You lead!' : 'Neck and neck!');
    return out;
  }

  toJSON() {
    return [...this.wins];
  }
  fromJSON(d: string[] | undefined) {
    this.end();
    this.wins = new Set((d ?? []) as CourseId[]);
  }
}
