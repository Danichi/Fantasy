import * as THREE from 'three';
import { events } from '../core/events';
import { heightAt } from '../world/terrain';
import { Bandit, type Bolts } from '../enemies/bandit';
import { UAL_MOVES } from './ai';
import type { Player } from '../player/player';
import type { Look } from '../npc/charBuilder';
import type { Target } from './targets';

// Kaela Voss's drill yard (combat rework, phase 6): a drill for each part of
// the new fighting. Some are against the straw dummies on the plaza, the rest
// against a sparring partner who only throws the attacks the drill is about.
// Nobody dies: the partner yields, and Kaela calls the bout before you fall.

type Opt = { label: string; run: () => void };
type Show = (text: string, opts: Opt[]) => void;

interface Drill {
  id: string;
  name: string;
  /** what Kaela says when she sets it */
  brief: string;
  /** the partner's moves (UAL_MOVES ids), or a dummy drill */
  partner?: string[];
  /** a softer posture so a break comes in reach */
  postureMax?: number;
  /** how many of the goal */
  need: number;
  goal: string;
  xp: number;
}

export const DRILLS: Drill[] = [
  {
    id: 'tells', name: 'Read the tells', need: 6, goal: 'attacks weathered unhurt', xp: 60, partner: ['cut', 'cleave', 'whirl'],
    brief: 'Watch the light before the blow. A white glint: parry it or block it. Gold: a heavy blow, it will cost your guard dear. Red: no shield in the world stops it, so get out of the way. Six in a row without a scratch.',
  },
  {
    id: 'parry', name: 'Perfect parries', need: 3, goal: 'perfect parries', xp: 70, partner: ['cut', 'flurry'],
    brief: 'Parry (F) at the very last instant and the blow rings off your steel and leaves them wide open. Parry early and you only deflect it. Three perfect ones.',
  },
  {
    id: 'dodge', name: 'Perfect dodges', need: 2, goal: 'perfect dodges, each followed by a counter', xp: 70, partner: ['lunge', 'delayed', 'cleave'],
    brief: 'Roll (Space) the moment it swings, not before. Time slows for you, and the next blow you land is a counter. Twice: dodge, then hit back while the window is open.',
  },
  {
    id: 'posture', name: 'Break their guard', need: 1, goal: 'finisher', xp: 90, partner: ['cut', 'flurry'], postureMax: 70,
    brief: 'Every blow they eat or turn aside wears their posture down: the bar under their health. Parries, shoves and heavy blows wear it fastest. When it breaks they reel. Get in close and strike: a finisher.',
  },
  {
    id: 'strings', name: 'Strings and branches', need: 3, goal: 'different branch blows on the dummy', xp: 60,
    brief: 'Tap for the next cut. Hold the button into the second, third or fourth blow and it branches: a rising thrust, a whirling cut, a crushing overhead. Locked on, push toward, away or across your target as you strike for a lunge, a retreating cut or a sweep. Show me three different ones on the dummy.',
  },
  {
    id: 'charge', name: 'Charge on the beat', need: 1, goal: 'perfect charged blow', xp: 50,
    brief: 'Hold a heavy and it charges: three steps, you will hear them. Let go just as it fills, not after, and it lands on the beat, harder than anything. On the dummy.',
  },
  {
    id: 'shove', name: 'Shove and follow', need: 2, goal: 'shoves followed by a blow', xp: 50, partner: ['cut'],
    brief: 'A raised guard is a door. Kick it in (G; with a shield up, it is a shield bash), then cut while they stagger. Twice.',
  },
];

const PARTNER_LOOK: Look = { body: 'female', outfit: 'ranger', hair: 'buzzedfemale', hairColor: 0x3a2618, skin: 0xe0b894, cloth: 0x3a4a6a, height: 1.74 };

export class TrainingYard {
  active: Drill | null = null;
  private partner: Bandit | null = null;
  private count = 0;
  private flags: Record<string, unknown>;
  /** drill bookkeeping: the last blow types and windows */
  private lastPerfectDodge = -9;
  private lastShove = -9;
  private lastPerfectCharge = -9;
  private streak = 0;
  private branchesSeen = new Set<string>();
  private time = 0;
  private ring = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    private bolts: Bolts,
    private player: Player,
    private kaelaAt: THREE.Vector3,
    flags: Record<string, unknown>,
    private notify: (msg: string) => void,
    private award: (xp: number) => void,
  ) {
    this.flags = flags;
    const on = events.on.bind(events);
    on('perfectParry', () => this.active?.id === 'parry' && this.progress());
    on('perfectDodge', () => (this.lastPerfectDodge = this.time));
    on('meleeHit', ({ target, action }) => {
      const d = this.active;
      if (!d) return;
      const mine = (t: Target) => t === this.partner || t.kind === 'dummy';
      if (!mine(target)) return;
      if (d.id === 'dodge' && this.time - this.lastPerfectDodge < 1.2) {
        this.lastPerfectDodge = -9;
        this.progress();
      }
      if (d.id === 'strings' && ['link1', 'link2', 'link3', 'thrust', 'retreatCut', 'sideSweep', 'delay2'].includes(action) && !this.branchesSeen.has(action)) {
        this.branchesSeen.add(action);
        this.progress();
      }
      if (d.id === 'shove') {
        if (action === 'barge' || action === 'shieldBash') this.lastShove = this.time;
        else if (this.time - this.lastShove < 1.6) {
          this.lastShove = -9;
          this.progress();
        }
      }
    });
    on('chargeTier', ({ perfect }) => perfect && this.active?.id === 'charge' && (this.lastPerfectCharge = this.time));
    on('strike', ({ target, heavy }) => {
      // A perfect charge that lands on the dummy.
      if (this.active?.id === 'charge' && target.kind === 'dummy' && heavy && this.time - this.lastPerfectCharge < 2) {
        this.lastPerfectCharge = -9;
        this.progress();
      }
    });
    on('finisher', ({ target }) => this.active?.id === 'posture' && target === this.partner && this.progress());
    on('telegraph', ({ target }) => {
      if (this.active?.id !== 'tells' || target !== this.partner) return;
      // The blow before this one went by without hurting you.
      this.streak++;
      if (this.streak > this.count + 1) this.progress();
    });
    on('playerDamaged', ({ amount }) => {
      if (this.active?.id === 'tells' && amount > 0) {
        if (this.count > 0) this.notify('Hit. Start the count again.');
        this.count = 0;
        this.streak = 0;
      }
    });
  }

  /** Kaela's drill menu. */
  menu(show: Show, back: () => void) {
    if (this.active) {
      show(`We are in the middle of "${this.active.name}". ${this.count}/${this.active.need} ${this.active.goal}. Want to stop?`, [
        { label: 'Stop the drill.', run: () => (this.stop('Drill stopped.'), back()) },
        { label: 'Carry on.', run: back },
      ]);
      return;
    }
    show('Pick your lesson. Each one is a thing that will save your life on the road.', [
      ...DRILLS.map((d) => ({
        label: `${this.flags['drill_' + d.id] ? '✓ ' : ''}${d.name}`,
        run: () => show(d.brief, [
          { label: 'Ready.', run: () => this.start(d) },
          { label: 'Another time.', run: back },
        ]),
      })),
      { label: 'Back.', run: back },
    ]);
  }

  start(d: Drill) {
    this.stop();
    this.active = d;
    this.count = 0;
    this.streak = 0;
    this.branchesSeen.clear();
    this.lastPerfectDodge = this.lastShove = -9;
    // The ring: open ground a few steps in front of Kaela.
    const k = this.kaelaAt;
    const toward = new THREE.Vector3(-k.x, 0, -4 - k.z).normalize();
    this.ring.set(k.x + toward.x * 7, 0, k.z + toward.z * 7);
    this.ring.y = heightAt(this.ring.x, this.ring.z);
    if (d.partner) {
      const at = this.ring.clone().add(new THREE.Vector3(0, 0.3, -2.5));
      const b = new Bandit('sword', at, this.scene, this.bolts, this.ring.clone(), PARTNER_LOOK);
      b.name = 'Sparring partner';
      b.kind = 'duelist';
      b.alerted = true;
      b.nonLethal = true;
      b.hitDamage = 7;
      b.pace = 1.25;
      b.maxHp = b.hp = 600;
      if (d.postureMax) b.postureMax = d.postureMax;
      b.brain.setMoves(UAL_MOVES.filter((m) => d.partner!.includes(m.id)).map((m) => ({ ...m, cooldown: 0, next: m.next?.filter((n) => d.partner!.includes(n)) })));
      this.partner = b;
      this.player.teleport(this.ring.clone().add(new THREE.Vector3(0, 0.3, 2.5)));
      this.player.yaw = Math.PI;
    }
    this.player.hp = this.player.maxHp;
    this.player.stamina = this.player.maxStamina;
    this.player.damageFloor = this.player.maxHp * 0.2;
    this.notify(`Drill: ${d.name} · 0/${d.need} ${d.goal}`);
  }

  private progress() {
    const d = this.active;
    if (!d) return;
    this.count++;
    if (this.count >= d.need) return this.complete(d);
    this.notify(`${d.name} · ${this.count}/${d.need} ${d.goal}`);
  }

  private complete(d: Drill) {
    const first = !this.flags['drill_' + d.id];
    this.flags['drill_' + d.id] = true;
    if (first) this.award(d.xp);
    this.stop(first ? `Drill passed: ${d.name} · +${d.xp} XP` : `Drill passed: ${d.name}`);
  }

  stop(msg?: string) {
    if (this.partner) {
      const p = this.partner;
      setTimeout(() => p.dispose(), 600);
    }
    this.partner = null;
    if (this.active) this.player.damageFloor = 0;
    this.active = null;
    if (msg) this.notify(msg);
  }

  update(dt: number) {
    this.time += dt;
    const d = this.active;
    if (!d) return;
    const p = this.partner;
    if (p) {
      if (!p.alive || p.hp < p.maxHp * 0.1) p.hp = p.maxHp; // the partner never yields mid-drill
      p.update(dt, this.player);
      if (this.player.pos.distanceTo(this.ring) > 16) this.stop('You left the yard. Drill stopped.');
    } else if (this.player.pos.distanceTo(this.kaelaAt) > 45) this.stop('You left the yard. Drill stopped.');
    if (this.player.hp <= this.player.maxHp * 0.22) {
      this.player.hp = this.player.maxHp;
      this.notify('Kaela calls it: back on your feet. Again.');
      this.count = 0;
      this.streak = 0;
    }
  }
}
